import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
