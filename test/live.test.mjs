import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
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
  const reroute = {id,action:'reroute',previousAgency:'SON',agency:'NAFDAC'}
  assert.equal((await call('report-action',reroute,operator)).status,409)
  assert.equal((await call('report-action',{id,action:'refer',agency:'SON'},operator)).status,200)
  assert.equal((await call('reports',undefined,son)).data[0].id,id)
  assert.equal((await call('report-action',reroute,son)).status,403)
  assert.equal((await call('report-action',reroute,manufacturer)).status,403)
  assert.equal((await call('report-action',{...reroute,agency:'OTHER'},operator)).status,400)
  assert.equal((await call('report-action',{...reroute,agency:'SON'},operator)).status,400)
  const moves = await Promise.all(Array.from({length:2},()=>call('report-action',reroute,operator)))
  assert.deepEqual(moves.map(move=>move.status).sort(),[200,409])
  assert.deepEqual((await call('reports',undefined,son)).data,[])
  const corrected = (await call('reports',undefined,nafdac)).data[0]
  assert.equal(corrected.id,id)
  assert.equal(corrected.stage,'referred')
  assert.equal(corrected.reason,'Seal damaged')
  assert.equal((await call('report-action',{id,action:'acknowledge'},son)).status,409)
  assert.equal((await call('report-action',{id,action:'acknowledge'},nafdac)).status,200)
  assert.equal((await call('report-action',{...reroute,previousAgency:'NAFDAC',agency:'SON'},operator)).status,409)
  assert.deepEqual((await call('public-stats')).data,{checks:2,shoppers:1,products:1,manufacturers:2,packs:2,reports:1})
  live.close()
  live=openLive(db)
  assert.equal((await call('public-stats')).data.checks,2)
  assert.equal((await call('company-applications',undefined,operator)).data[0].company,'Pending Foods')
  assert.equal((await call('reports',undefined,shopper)).data[0].stage,'acknowledged')
  assert.equal((await call('reports',undefined,nafdac)).data[0].agency,'NAFDAC')
  assert.deepEqual((await call('reports',undefined,son)).data,[])
  const audit = new DatabaseSync(db,{readOnly:true})
  try {
    const events = audit.prepare('SELECT audit.action,account.role FROM audit JOIN account ON audit.actor=account.id WHERE report_id=? ORDER BY audit.rowid').all(id)
    assert.deepEqual(events.map(({action,role})=>[action,role]),[
      ['submitted','shopper'],['refer','operator'],['rerouted:SON->NAFDAC','operator'],['acknowledge','regulator']
    ])
  } finally { audit.close() }
})

test('operator referral correction submits the expected assignment and focuses confirmation', async () => {
  const report = {id:'fictional-report',agency:'SON',stage:'referred',code:'VF-TEST'}
  const actions = []
  const handlers = {}
  const message = {textContent:'',focus(){ this.focused=true }}
  const main = {innerHTML:'',addEventListener(name,handler){ handlers[name]=handler },querySelector(){ return null }}
  const client = await readFile(new URL('../dist/live.js',import.meta.url),'utf8')
  await runInNewContext(`(async()=>{${client}})()`,{
    document:{querySelector:selector=>selector==='#live'?main:message},
    window:{addEventListener(){}},
    FormData:class { constructor(form){ return Object.entries(form.values) } },
    async fetch(path,options) {
      let data
      if (path==='/api/session') data={account:{role:'operator',scope:''}}
      else if (path==='/api/reports') data=[report]
      else if (path==='/api/report-queue') data={reports:[report],next:null}
      else if (path==='/api/company-applications') data=[]
      else if (path==='/api/report-action') {
        const action=JSON.parse(options.body)
        actions.push(action)
        report.agency=action.agency
        data={}
      } else throw Error(`Unexpected route ${path}`)
      return {ok:true,json:async()=>data}
    }
  })
  assert.match(main.innerHTML,/Assigned to SON/)
  assert.match(main.innerHTML,/name="previousAgency" type="hidden" value="SON"/)
  assert.match(main.innerHTML,/<select name="agency" required><option value="">Choose an agency<\/option><option>NAFDAC<\/option>/)
  await handlers.submit({preventDefault(){},target:{dataset:{form:'reroute'},values:{id:report.id,previousAgency:'SON',agency:'NAFDAC'}}})
  assert.deepEqual(actions,[{id:report.id,action:'reroute',previousAgency:'SON',agency:'NAFDAC'}])
  assert.match(main.innerHTML,/Assigned to NAFDAC/)
  assert.equal(message.textContent,'Report fictional-report moved to NAFDAC.')
  assert.equal(message.focused,true)
})
