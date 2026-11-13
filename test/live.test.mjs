import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { openLive } from '../live.mjs'

test('issued pack, report, scoped referral and persistence', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-test-'))
  const db = join(folder,'test.sqlite')
  let live = openLive(db)
  const server = createServer((req,res)=>live.handle(req,res,req.url))
  t.after(async ()=>{
    await new Promise(resolve=>server.close(resolve))
    live.close()
    rmSync(folder,{recursive:true,force:true})
  })
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const origin='http://127.0.0.1:'+server.address().port
  const password='local test passphrase'
  for(const [role,scope] of [['manufacturer','Northfield'],['operator',''],['regulator','NAFDAC'],['regulator','SON'],['manufacturer','Other Foods']]){
    live.provision((scope || role).replaceAll(' ','')+'@example.test',password,role,scope)
  }
  const call=async(path,body,cookie,requestOrigin=origin)=>{
    const response=await fetch(origin+'/api/'+path,{
      method:body===undefined?'GET':'POST',
      headers:{origin:requestOrigin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{cookie}:{})},
      body:body===undefined?undefined:JSON.stringify(body)
    })
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const login=async name=>(await call('login',{email:name+'@example.test',password})).cookie
  const manufacturer=await login('Northfield')
  const other=await login('OtherFoods')
  const operator=await login('operator')
  const nafdac=await login('NAFDAC')
  const son=await login('SON')
  const shopper=(await call('register',{email:'buyer@example.test',password,role:'operator'})).cookie
  assert.equal((await call('session',undefined,shopper)).data.account.role,'shopper')
  assert.equal((await call('batches',undefined,shopper)).status,403)
  assert.equal((await call('reports',undefined)).status,401)
  assert.equal((await call('logout',{},shopper,'https://outside.example')).status,403)

  const application = {company:'Pending Foods',registration:'RC 123',email:'contact@example.test',product:'Rice'}
  const submittedApplication = await call('company-applications',application)
  assert.equal(submittedApplication.status,201)
  assert.equal(submittedApplication.cookie,undefined)
  assert.equal((await call('company-applications',application)).status,409)
  assert.equal((await call('company-applications',undefined)).status,401)
  assert.equal((await call('company-applications',undefined,manufacturer)).status,403)
  assert.equal((await call('company-applications',undefined,operator)).data[0].id,submittedApplication.data.reference)

  const batch={product:'Rice',lot:'A01',expires:'2099-01-01',count:2}
  const issued=await call('batches',batch,manufacturer)
  assert.equal(issued.status,201)
  assert.equal(new Set(issued.data.codes).size,2)
  assert.equal((await call('batches',batch,manufacturer)).status,409)
  assert.deepEqual((await call('batches',undefined,other)).data,[])
  const [code]=issued.data.codes
  assert.equal((await call('check',{code},shopper)).data.status,'matched')
  assert.equal((await call('check',{code:'missing'},shopper)).data.status,'unknown')

  const submitted=await call('reports',{code,area:'Ikeja',reason:'Seal damaged'},shopper)
  assert.equal(submitted.status,201)
  const {id}=submitted.data
  assert.deepEqual((await call('reports',undefined,nafdac)).data,[])
  assert.deepEqual((await call('reports',undefined,other)).data,[])
  assert.equal((await call('reports',undefined,manufacturer)).data[0].lot,'A01')
  assert.equal((await call('report-action',{id,action:'refer',agency:'NAFDAC'},shopper)).status,403)
  assert.equal((await call('report-action',{id,action:'refer',agency:'NAFDAC'},operator)).status,200)
  assert.deepEqual((await call('reports',undefined,son)).data,[])
  assert.equal((await call('report-action',{id,action:'acknowledge'},son)).status,409)
  assert.equal((await call('report-action',{id,action:'acknowledge'},nafdac)).status,200)
  assert.deepEqual((await call('public-stats')).data,{checks:2,shoppers:1,products:1,manufacturers:2,packs:2,reports:1})
  live.close()
  live=openLive(db)
  assert.equal((await call('public-stats')).data.checks,2)
  assert.equal((await call('company-applications',undefined,operator)).data[0].company,'Pending Foods')
  assert.equal((await call('reports',undefined,shopper)).data[0].stage,'acknowledged')
})

test('guests can check only public pack fields and must sign in to report', async t => {
  const live = openLive(':memory:')
  const server = createServer((req,res)=>live.handle(req,res,req.url))
  t.after(async () => {
    await new Promise(resolve=>server.close(resolve))
    live.close()
  })
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const origin = 'http://127.0.0.1:'+server.address().port
  const password = 'local test passphrase'
  live.provision('maker@example.test',password,'manufacturer','Test Foods')
  async function post(path, body, cookie, requestOrigin = origin) {
    return fetch(origin+'/api/'+path,{
      method:'POST',headers:{origin:requestOrigin,'Content-Type':'application/json',...(cookie ? {cookie} : {})},
      body:JSON.stringify(body)
    })
  }
  const maker = (await post('login',{email:'maker@example.test',password})).headers.get('set-cookie').split(';')[0]
  const batch = await (await post('batches',{product:'Rice',lot:'A01',expires:'2099-01-01',count:1},maker)).json()
  const [code] = batch.codes
  const result = await post('check',{code:code.toLowerCase()})
  assert.equal(result.status,200)
  assert.equal(result.headers.get('set-cookie'),null)
  assert.deepEqual(await result.json(),{code,status:'matched',manufacturer:'Test Foods',product:'Rice',lot:'A01',expires:'2099-01-01'})
  assert.deepEqual(await (await post('check',{code:'unissued'})).json(),{code:'UNISSUED',status:'unknown'})
  assert.equal((await post('check',{code},maker)).status,403)
  assert.equal((await post('check',{code},undefined,'https://outside.example')).status,403)
  assert.equal((await post('reports',{code,area:'Test area',reason:'Test concern'})).status,401)
  assert.equal((await fetch(origin+'/api/reports')).status,401)
  assert.equal((await fetch(origin+'/api/batches')).status,401)
  for (let attempt = 2; attempt < 30; attempt++) {
    const response = await post('check',{code})
    assert.equal(response.status,200)
    await response.json()
  }
  assert.equal((await post('check',{code})).status,429)
  const stats = await (await fetch(origin+'/api/public-stats')).json()
  assert.equal(stats.checks,30)
  assert.equal(stats.shoppers,0)
  assert.equal(stats.reports,0)
  const shopper = (await post('register',{email:'buyer@example.test',password})).headers.get('set-cookie').split(';')[0]
  assert.equal((await post('check',{code},shopper)).status,200)
  assert.equal((await post('reports',{code,area:'Test area',reason:'Test concern'},shopper)).status,201)
})

test('guest lookup preserves the result through report sign-in and registration', async () => {
  const client = await readFile(new URL('../dist/live.js',import.meta.url),'utf8')
  const code = 'VF-' + 'A'.repeat(32)
  for (const auth of ['login','register']) {
    const handlers = {}
    const requests = []
    const focus = []
    const message = {textContent:''}
    const main = {
      addEventListener(type, handler) { handlers[type] = handler },
      querySelector(selector) {
        if (selector === 'video') return null
        return {setAttribute(){},focus(){focus.push(selector)}}
      }
    }
    const report = {area:'Test area',reason:'Test concern',code}
    const responses = {
      session:{account:null},check:{status:'unknown',code},
      login:{role:'shopper',scope:''},register:{role:'shopper',scope:''}
    }
    const fetch = async (path, options) => {
      const endpoint = path.slice('/api/'.length)
      const body = options?.body && JSON.parse(options.body)
      requests.push([endpoint,body])
      return {ok:true,json:async()=>endpoint==='reports' ? (body ? {id:'example-reference'} : []) : responses[endpoint]}
    }
    await runInNewContext(`(async()=>{${client}})()`,{
      document:{querySelector:selector=>selector==='#live'?main:message},
      window:{addEventListener(){}}, location:{search:''},history:{replaceState(){}},
      URLSearchParams, fetch,
      FormData:class { constructor(form){ return Object.entries(form.values) } }
    })
    const submit = (action, values) => handlers.submit({preventDefault(){},target:{dataset:{form:action},values,isConnected:true}})
    const navigate = (mode, report = false) => handlers.click({target:{
      closest:selector=>selector==='[data-mode]' ? {dataset:{mode},hasAttribute:()=>report} : null
    }})
    assert.match(main.innerHTML,/data-form="check"/)
    await submit('check',{code})
    assert.match(main.innerHTML,/Code not found/)
    assert.doesNotMatch(main.innerHTML,/data-form="report"/)
    assert.equal(focus.at(-1),'#verification-result')
    await navigate('login',true)
    assert.match(main.innerHTML,/Your pack check is ready/)
    if (auth === 'register') await navigate('register')
    await submit(auth,{email:'buyer@example.test',password:'local test passphrase'})
    assert.match(main.innerHTML,/<details open>/)
    assert.match(main.innerHTML,new RegExp(code))
    assert.match(focus.at(-1),/name="area"/)
    await submit('report',{area:report.area,reason:report.reason})
    assert.match(main.innerHTML,/example-reference/)
    assert.deepEqual(requests.filter(([path])=>path==='check'),[['check',{code}]])
    assert.ok(requests.some(([path,body])=>path==='reports' && body?.code===code))
  }
})
