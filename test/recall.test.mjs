import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLive } from '../live.mjs'

test('a manufacturer recall covers all batch packs, preserves its notice and survives restart', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-recall-'))
  const path = join(folder,'test.sqlite')
  let live = openLive(path)
  const server = createServer((req,res)=>live.handle(req,res,req.url))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));live.close();rmSync(folder,{recursive:true,force:true})})
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const origin = 'http://127.0.0.1:'+server.address().port
  const call = async (route,body,cookie) => {
    const response = await fetch(origin+'/api/'+route,{
      method:body===undefined?'GET':'POST',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},
      body:body===undefined?undefined:JSON.stringify(body)
    })
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const password = 'local test passphrase'
  for (const name of ['issuer','other']) live.provision(name+'@example.test',password,'manufacturer',name)
  const issuer = (await call('login',{email:'issuer@example.test',password})).cookie
  const other = (await call('login',{email:'other@example.test',password})).cookie
  const shopper = (await call('register',{email:'shopper@example.test',password})).cookie
  const batch = (await call('batches',{product:'Rice',lot:'R1',expires:'2099-01-01',count:2},issuer)).data
  const unaffected = (await call('batches',{product:'Rice',lot:'R2',expires:'2099-01-01',count:1},issuer)).data
  const request = {id:batch.id,reason:'Possible contamination. Return the pack to the seller.'}
  assert.equal((await call('batch-recall',request)).status,401)
  assert.equal((await call('batch-recall',request,shopper)).status,403)
  assert.equal((await call('batch-recall',request,other)).status,404)
  assert.equal((await call('batch-recall',{...request,id:'0'.repeat(32)},issuer)).status,404)
  assert.equal((await call('batch-recall',{...request,reason:' '},issuer)).status,400)
  assert.equal((await call('batch-recall',{...request,reason:'x'.repeat(501)},issuer)).status,400)
  assert.equal((await call('check',{code:batch.codes[0]},shopper)).data.status,'matched')
  const first = await call('batch-recall',request,issuer)
  assert.equal(first.status,200)
  assert.deepEqual(await call('batch-recall',request,issuer),first)
  assert.equal((await call('batch-recall',{...request,reason:'Replace notice'},issuer)).status,409)
  live.close();live = openLive(path)
  for (const code of batch.codes) {
    const checked = (await call('check',{code},shopper)).data
    assert.equal(checked.status,'recalled')
    assert.equal(checked.recall_reason,request.reason)
    assert.equal(checked.recalled_at,first.data.created)
  }
  assert.equal((await call('check',{code:unaffected.codes[0]},shopper)).data.status,'matched')
  assert.equal((await call('check',{code:'unknown'},shopper)).data.status,'unknown')
  const labels = (await call('batches',undefined,issuer)).data
  assert.equal(labels.filter(pack=>pack.recall_reason===request.reason).length,2)
  assert.deepEqual((await call('batches',undefined,other)).data,[])
})
