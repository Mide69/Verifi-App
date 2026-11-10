import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { runInNewContext } from 'node:vm'
import QRCode from 'qrcode'

test('pack labels encode the configured Verifi origin and preserve serial-only labels', async t => {
  const origin = 'https://pilot.example.test'
  const serial = 'VF-' + 'ABCD'.repeat(8)
  const server = spawn(process.execPath, ['server.mjs', '--port', '0'], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, VERIFI_DB:':memory:', VERIFI_ORIGIN:origin},
    stdio:['ignore','pipe','inherit']
  })
  const exited = once(server, 'exit')
  t.after(async () => { server.kill(); await exited })
  const output = createInterface({input:server.stdout})
  const started = once(output,'line')
  const address = await Promise.race([
    started.then(([line]) => line.match(/http:\/\/localhost:\d+/)?.[0]),
    exited.then(([code]) => { throw Error(`Test server exited with code ${code}`) })
  ])
  assert.ok(address, 'server announced a loopback address')
  const label = (code, format = '') => fetch(`${address}/qr?code=${encodeURIComponent(code)}${format}`, {
    headers:{host:'untrusted.example.test'}
  })
  const svg = payload => QRCode.toString(payload,{type:'svg',errorCorrectionLevel:'M'})
  const response = await label(serial,'&format=pack-link')
  assert.equal(response.status,200)
  assert.equal(await response.text(),await svg(`${origin}/live#pack=${serial}`))
  assert.equal(await (await label(serial)).text(),await svg(serial))
  assert.equal(await (await label('VF-DEMO-001')).text(),await svg('VF-DEMO-001'))
  assert.equal((await label('VF-DEMO-001','&format=pack-link')).status,400)
  assert.equal((await label(serial + '&redirect=https://untrusted.example.test','&format=pack-link')).status,400)
})

test('a pack link survives shopper authentication and a failed check', async () => {
  const serial = 'VF-' + 'ABCD'.repeat(8)
  const origin = 'https://pilot.example.test'
  let location = new URL(`${origin}/live#pack=${serial}`)
  let account = null
  let checkFails = true
  let focused = false
  let cameraPayload
  const handlers = {}
  const checks = []
  const message = {textContent:''}
  const checkForm = {
    dataset:{form:'check'},
    elements:{code:{value:''}},
    get values() { return {code:this.elements.code.value} },
    requestSubmit() { return submit(this) }
  }
  const video = {isConnected:true,play:async()=>{}}
  const main = {
    innerHTML:'',
    addEventListener:(name,handler)=>{ handlers[name]=handler },
    querySelector:selector=>({
      'video':video,
      '[data-form="check"]':checkForm,
      '[data-form="check"] button':{focus:()=>{ focused=true }}
    })[selector] || null
  }
  const fetch = async (path, options) => {
    const ok = data=>({ok:true,json:async()=>data})
    if (path === '/api/session') return ok({account})
    if (path === '/api/reports') return ok([])
    if (path === '/api/register') return ok(account={role:'shopper',scope:''})
    if (path === '/api/logout') { account=null; return ok({}) }
    if (path === '/api/check') {
      const {code} = JSON.parse(options.body)
      checks.push(code)
      if (checkFails) return {ok:false,json:async()=>({error:'Temporary outage'})}
      return ok({status:'matched',code})
    }
    throw Error(`Unexpected route ${path}`)
  }
  const client = await readFile(new URL('../dist/live.js',import.meta.url),'utf8')
  await runInNewContext(`(async()=>{${client}})()`,{
    document:{querySelector:selector=>selector==='#live'?main:message},
    window:{get location(){return location},BarcodeDetector:true,addEventListener(){}},
    get location(){return location},
    history:{replaceState(_state,_title,path){ location=new URL(path,origin) }},
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})}},
    BarcodeDetector:class { async detect(){ return [{rawValue:cameraPayload}] } },
    URL,URLSearchParams,fetch,
    FormData:class { constructor(form){ return Object.entries(form.values) } }
  })
  function submit(form) { return handlers.submit({preventDefault(){},target:form}) }
  const form = action=>({dataset:{form:action},values:{}})
  const scan = async payload => {
    cameraPayload=payload
    await handlers.click({target:{closest:()=>true}})
    await new Promise(resolve=>setImmediate(resolve))
  }

  assert.match(main.innerHTML,new RegExp(`/live\\?mode=register#pack=${serial}`))
  location=new URL(`/live?mode=register#pack=${serial}`,origin)
  await submit(form('register'))
  assert.equal(location.href,`${origin}/live#pack=${serial}`)
  assert.match(main.innerHTML,new RegExp(`value="${serial}"`))
  assert.match(main.innerHTML,/Ready to check/)
  assert.equal(focused,true)
  assert.deepEqual(checks,[])

  checkForm.elements.code.value=serial
  await submit(checkForm)
  assert.equal(message.textContent,'Temporary outage')
  assert.equal(location.hash,`#pack=${serial}`)
  checkFails=false
  await submit(checkForm)
  assert.equal(location.hash,'')
  assert.match(main.innerHTML,/Pack code matched/)

  await scan(`${origin}/live#pack=${serial}`)
  await scan(serial.toLowerCase())
  await scan('1234567890123')
  await scan(`https://untrusted.example.test/live#pack=${serial}`)
  assert.match(message.textContent,/not a Verifi pack label/)
  assert.deepEqual(checks,[serial,serial,serial,serial,'1234567890123'])

  location=new URL(`/live#pack=${serial}`,origin)
  await submit(form('logout'))
  assert.equal(location.hash,'')
  assert.doesNotMatch(main.innerHTML,/Your pack code is ready/)
})
