import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { openLive } from '../live.mjs'

test('report retries preserve one reference, audit event and count across restart and referral', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-retry-'))
  const path = join(folder,'test.sqlite')
  let live = openLive(path)
  const server = createServer((req,res)=>live.handle(req,res,req.url))
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve))
    live.close()
    rmSync(folder,{recursive:true,force:true})
  })
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const origin = 'http://127.0.0.1:'+server.address().port
  const call = async (route,body,cookie) => {
    const response = await fetch(origin+'/api/'+route,{
      method:body===undefined?'GET':'POST',
      headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},
      body:body===undefined?undefined:JSON.stringify(body)
    })
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const password = 'local test passphrase'
  const shopper = (await call('register',{email:'one@example.test',password})).cookie
  const other = (await call('register',{email:'two@example.test',password})).cookie
  live.provision('operator@example.test',password,'operator')
  live.provision('regulator@example.test',password,'regulator','SON')
  const operator = (await call('login',{email:'operator@example.test',password})).cookie
  const regulator = (await call('login',{email:'regulator@example.test',password})).cookie
  const body = {code:'vf-unknown',area:'Ikeja',reason:'Seal damaged',requestId:randomUUID()}
  assert.equal((await call('reports',body)).status,401)
  assert.equal((await call('reports',body,operator)).status,403)
  const submissions = await Promise.all(Array.from({length:5},()=>call('reports',body,shopper)))
  const first = submissions[0]
  assert.equal(first.status,201)
  for (const response of submissions) assert.deepEqual(response,first)
  assert.equal((await call('public-stats')).data.reports,1)
  for (const requestId of [null,{},'', 'x'.repeat(1000)]) {
    assert.equal((await call('reports',{...body,requestId},shopper)).status,400)
  }
  // Canonical whitespace and code casing do not turn a retry into a conflict.
  assert.deepEqual((await call('reports',{...body,code:'VF-UNKNOWN',area:' Ikeja '},shopper)).data,first.data)
  for (const change of [{code:'different'},{area:'Abuja'},{reason:'Changed narrative'}]) {
    assert.equal((await call('reports',{...body,...change},shopper)).status,409)
  }
  assert.equal((await call('report-action',{id:first.data.id,action:'refer',agency:'SON'},operator)).status,200)
  assert.equal((await call('report-action',{id:first.data.id,action:'acknowledge'},regulator)).status,200)
  live.close()
  live = openLive(path)
  assert.deepEqual((await call('reports',body,shopper)).data,first.data)
  assert.equal((await call('reports',undefined,shopper)).data[0].stage,'acknowledged')
  // The same client key is private to its authenticated shopper.
  const separate = await call('reports',{...body,reason:'Other shopper concern'},other)
  assert.equal(separate.status,201)
  assert.notEqual(separate.data.id,first.data.id)
  assert.equal((await call('reports',undefined,other)).data.length,1)
  // Intentional new requests and legacy clients remain supported.
  assert.equal((await call('reports',{...body,requestId:randomUUID()},shopper)).status,201)
  const {requestId,...legacy} = body
  assert.equal((await call('reports',legacy,shopper)).status,201)
  assert.equal((await call('public-stats')).data.reports,4)
  const db = new DatabaseSync(path)
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE report_id=? AND action='submitted'").get(first.data.id).n,1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_request').get().n,3)
  } finally {db.close()}
})

test('shopper form reuses its request ID after a lost response and blocks overlapping submission', async()=>{
  const handlers = {}
  const message = {textContent:''}
  const main = {addEventListener:(name,fn)=>handlers[name]=fn,querySelector:()=>null,innerHTML:''}
  const requests = []
  let loseResponse = true
  let release
  const gate = new Promise(resolve=>release=resolve)
  const fetch = async (url,options) => {
    if (url==='/api/session') return {ok:true,json:async()=>({account:{role:'shopper',scope:''}})}
    if (url==='/api/reports' && !options?.body) return {ok:true,json:async()=>[]}
    const body = JSON.parse(options.body)
    if (url==='/api/reports') {
      requests.push(body)
      if (loseResponse) {await gate; loseResponse=false; throw Error('Response lost')}
      return {ok:true,json:async()=>({id:'saved-reference'})}
    }
    return {ok:true,json:async()=>({code:body.code,status:'unknown'})}
  }
  const context = {
    document:{querySelector:selector=>selector==='#live'?main:message},
    window:{addEventListener:()=>{}},fetch,crypto:{randomUUID},
    FormData:class {constructor(form){return Object.entries(form.values)}},
    URLSearchParams,location:{search:''},history:{replaceState:()=>{}},console
  }
  await runInNewContext('(async()=>{'+readFileSync(new URL('../dist/live.js',import.meta.url),'utf8')+'})()',context)
  const submit = (form,button={disabled:false})=>handlers.submit({preventDefault(){},target:form,submitter:button})
  await submit({dataset:{form:'check'},values:{code:'VF-UNKNOWN'}})
  const form = {dataset:{form:'report'},values:{area:'Ikeja',reason:'Seal damaged'}}
  const button = {disabled:false}
  const pending = submit(form,button)
  const overlapping = submit(form)
  try {
    assert.equal(requests.length,1)
    assert.equal(button.disabled,true)
  } finally { release() }
  await overlapping
  await pending
  assert.match(message.textContent,/retry this form with the same details/)
  assert.equal(button.disabled,false)
  await submit(form,button)
  assert.equal(requests.length,2)
  assert.equal(requests[0].requestId,requests[1].requestId)
  assert.equal(requests[0].code,requests[1].code)
  assert.match(main.innerHTML,/saved-reference/)
})

// Simulate the prior schema by removing only the newly introduced, empty table.
test('opening a pre-retry database adds the request table without changing existing evidence',()=>{
  const folder = mkdtempSync(join(tmpdir(),'verifi-upgrade-'))
  const path = join(folder,'test.sqlite')
  let live = openLive(path)
  live.provision('existing@example.test','local test passphrase')
  live.close()
  let db = new DatabaseSync(path)
  db.exec("DROP TABLE report_request; INSERT INTO report (id,shopper,code,area,reason,created) SELECT 'existing-report',id,'VF-OLD','Ikeja','Existing evidence','2026-11-01T00:00:00.000Z' FROM account")
  const before = db.prepare('SELECT * FROM report').all()
  db.close()
  try {
    live = openLive(path)
    live.close()
    db = new DatabaseSync(path)
    assert.deepEqual(db.prepare('SELECT * FROM report').all(),before)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_request').get().n,0)
    db.close()
  } finally {rmSync(folder,{recursive:true,force:true})}
})
