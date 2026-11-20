import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request } from 'node:http'
import { createInterface } from 'node:readline'

test('malformed request targets return 400 and leave the workspace running', async t => {
  const server = spawn(process.execPath,['server.mjs','--port','0'],{
    cwd:new URL('../',import.meta.url),
    env:{...process.env,VERIFI_DB:':memory:'},
    stdio:['ignore','pipe','pipe']
  })
  const exited = once(server,'exit')
  t.after(async () => {
    server.kill()
    await exited
  })
  const output = createInterface({input:server.stdout})
  const address = await Promise.race([
    once(output,'line').then(([line])=>line.match(/http:\/\/localhost:\d+/)?.[0]),
    exited.then(([code])=>{throw Error('Server exited with code '+code)})
  ])
  assert.ok(address)
  const port = new URL(address).port
  const get = path => new Promise((resolve,reject) => {
    const req = request({hostname:'127.0.0.1',port,path,method:'GET'},response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data',chunk=>{body+=chunk})
      response.on('end',()=>resolve({status:response.statusCode,body}))
      response.on('error',reject)
    })
    req.setTimeout(5000,()=>req.destroy(Error('Request timed out')))
    req.on('error',reject)
    req.end()
  })
  for (const target of ['//[','http://[','//example.test:invalid/']) {
    assert.deepEqual(await get(target),{status:400,body:'Invalid request URL'})
    assert.equal((await get('/live')).status,200)
    assert.deepEqual(JSON.parse((await get('/api/session')).body),{account:null})
  }
  assert.equal((await get('/not-found')).status,404)
  assert.equal((await get('/qr?code=VF-DEMO-001')).status,200)
  assert.equal(server.exitCode,null)
})
