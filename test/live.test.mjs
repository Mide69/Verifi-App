import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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
  const review={id:submittedApplication.data.reference,decision:'approved',note:'Company documents reviewed.'}
  assert.equal((await call('company-application-decision',review)).status,401)
  for (const cookie of [manufacturer,shopper,nafdac]) {
    assert.equal((await call('company-application-decision',review,cookie)).status,403)
  }
  assert.equal((await call('company-application-decision',review,operator,'https://outside.example')).status,403)
  assert.equal((await call('company-application-decision',{...review,decision:'unknown'},operator)).status,400)
  assert.equal((await call('company-application-decision',{...review,note:''},operator)).status,400)
  assert.equal((await call('company-application-decision',{...review,id:'missing'},operator)).status,404)
  const [approval,retry]=await Promise.all(Array.from({length:2},()=>call('company-application-decision',review,operator)))
  assert.equal(approval.status,200)
  assert.equal(retry.status,200)
  assert.deepEqual(retry.data,approval.data)
  assert.equal((await call('company-application-decision',{...review,decision:'declined'},operator)).status,409)
  const nextApplication=await call('company-applications',{...application,product:'Beans'})
  assert.equal(nextApplication.status,201)
  const applications=(await call('company-applications',undefined,operator)).data
  assert.equal(applications[0].id,nextApplication.data.reference)
  assert.equal(applications[0].decision,null)
  assert.equal(applications[1].decision,'approved')
  assert.equal(applications[1].note,review.note)
  const decline=await call('company-application-decision',{...review,id:nextApplication.data.reference,decision:'declined'},operator)
  assert.equal(decline.status,200)
  assert.equal(decline.data.decision,'declined')
  assert.equal((await call('login',{email:application.email,password})).status,401)

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
  const reopenedApplications=(await call('company-applications',undefined,operator)).data
  assert.equal(reopenedApplications.find(entry=>entry.id===review.id).decided_at,approval.data.decided_at)
  const stored=new DatabaseSync(db,{readOnly:true})
  try {
    assert.equal(stored.prepare(`SELECT a.email FROM company_application_decision d
      JOIN account a ON a.id=d.reviewer WHERE d.application_id=?`).get(review.id).email,'operator@example.test')
  } finally { stored.close() }
  assert.equal((await call('reports',undefined,shopper)).data[0].stage,'acknowledged')
})
