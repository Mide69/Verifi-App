import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { openLive } from '../live.mjs'

const cli = fileURLToPath(new URL('../reset-password.mjs',import.meta.url))
const oldPassword = 'fictional old passphrase'
const newPassword = 'fictional new passphrase'

for (const role of ['shopper','manufacturer','operator','regulator']) {
  test('password reset revokes '+role+' sessions and preserves workspace evidence', async t => {
    const folder = mkdtempSync(join(tmpdir(),'verifi-password-'))
    const path = join(folder,'live.sqlite')
    let live = openLive(path)
    const server = createServer((req,res)=>live.handle(req,res,req.url))
    server.listen(0,'127.0.0.1')
    await once(server,'listening')
    t.after(async () => {
      await new Promise(resolve=>server.close(resolve))
      live.close()
      rmSync(folder,{recursive:true,force:true})
    })
    const origin = 'http://127.0.0.1:'+server.address().port
    async function call(endpoint,body,cookie) {
      const response = await fetch(origin+'/api/'+endpoint,{
        method:body === undefined ? 'GET' : 'POST',
        headers:{origin,'Content-Type':'application/json',...(cookie ? {cookie} : {})},
        body:body === undefined ? undefined : JSON.stringify(body)
      })
      return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
    }
    const email = role+'@example.test'
    live.provision(email,oldPassword,role,role === 'regulator' ? 'NAFDAC' : role === 'manufacturer' ? 'Test Foods' : '')
    live.provision('other@example.test',oldPassword)
    const login = (password,address=email)=>call('login',{email:address,password})
    const first = await login(oldPassword)
    const second = await login(oldPassword)
    const other = await login(oldPassword,'other@example.test')
    const db = new DatabaseSync(path)
    t.after(()=>db.close())
    db.exec('DROP TABLE password_reset_audit')
    live.close()
    live = openLive(path)
    assert.equal((await call('reports',undefined,first.cookie)).status,200)
    const accountId = db.prepare('SELECT id FROM account WHERE email=?').get(email).id
    db.prepare('INSERT INTO report (id,shopper,code,area,reason,created) VALUES (?,?,?,?,?,?)')
      .run('test-report',accountId,'VF-TEST','Test shop','Damaged seal','2026-11-01T00:00:00.000Z')
    db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)')
      .run('test-audit',accountId,'test-report','submitted','2026-11-01T00:00:00.000Z')
    const beforeAccount = db.prepare('SELECT * FROM account WHERE id=?').get(accountId)
    const beforeEvidence = db.prepare('SELECT * FROM report').all()
    const beforeAudit = db.prepare('SELECT * FROM audit').all()
    const invoke = (address,input)=>spawnSync(process.execPath,[cli,address],{
      env:{...process.env,VERIFI_DB:path},input,encoding:'utf8'
    })
    for (const input of ['', 'short', 'x'.repeat(131)]) {
      const invalid = invoke(email,input)
      assert.equal(invalid.status,1)
      assert.equal((await call('reports',undefined,first.cookie)).status,200)
    }
    assert.equal(invoke('missing@example.test',newPassword).status,1)
    assert.deepEqual(db.prepare('SELECT * FROM password_reset_audit').all(),[])
    db.exec(`CREATE TRIGGER block_session_delete BEFORE DELETE ON session
      BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END`)
    assert.equal(invoke(email,newPassword).status,1)
    assert.deepEqual(db.prepare('SELECT * FROM account WHERE id=?').get(accountId),beforeAccount)
    assert.equal((await call('reports',undefined,first.cookie)).status,200)
    assert.deepEqual(db.prepare('SELECT * FROM password_reset_audit').all(),[])
    db.exec('DROP TRIGGER block_session_delete')
    db.exec(`CREATE TRIGGER block_reset_audit BEFORE INSERT ON password_reset_audit
      BEGIN SELECT RAISE(ABORT,'simulated audit storage failure'); END`)
    assert.equal(invoke(email,newPassword).status,1)
    assert.deepEqual(db.prepare('SELECT * FROM account WHERE id=?').get(accountId),beforeAccount)
    assert.equal((await call('reports',undefined,first.cookie)).status,200)
    assert.equal((await call('reports',undefined,second.cookie)).status,200)
    assert.deepEqual(db.prepare('SELECT * FROM password_reset_audit').all(),[])
    db.exec('DROP TRIGGER block_reset_audit')
    const startedAt = new Date().toISOString()
    const reset = invoke(email.toUpperCase(),newPassword+'\r\n')
    assert.equal(reset.status,0,reset.stderr)
    assert.doesNotMatch(reset.stdout+reset.stderr,new RegExp(newPassword))
    const events = db.prepare('SELECT * FROM password_reset_audit').all()
    assert.equal(events.length,1)
    assert.equal(events[0].account_id,accountId)
    assert.equal(events[0].host_user,userInfo().username)
    assert.ok(events[0].created >= startedAt && events[0].created <= new Date().toISOString())
    assert.deepEqual(Object.keys(events[0]).sort(),['account_id','created','host_user','id'])
    for (const cookie of [first.cookie,second.cookie]) {
      assert.equal((await call('session',undefined,cookie)).data.account,null)
      assert.equal((await call('reports',undefined,cookie)).status,401)
    }
    assert.equal((await call('session',undefined,other.cookie)).data.account.role,'shopper')
    assert.equal((await login(oldPassword)).status,401)
    const current = await login(newPassword)
    assert.equal(current.status,200)
    assert.equal(current.data.role,role)
    const afterAccount = db.prepare('SELECT * FROM account WHERE id=?').get(accountId)
    assert.equal(afterAccount.id,beforeAccount.id)
    assert.equal(afterAccount.role,beforeAccount.role)
    assert.equal(afterAccount.scope,beforeAccount.scope)
    assert.notEqual(afterAccount.salt,beforeAccount.salt)
    assert.notEqual(afterAccount.password,beforeAccount.password)
    assert.deepEqual(db.prepare('SELECT * FROM report').all(),beforeEvidence)
    assert.deepEqual(db.prepare('SELECT * FROM audit').all(),beforeAudit)
    live.close()
    live = openLive(path)
    assert.deepEqual(db.prepare('SELECT * FROM password_reset_audit').all(),events)
    assert.equal((await call('reports',undefined,first.cookie)).status,401)
    assert.equal((await login(newPassword)).status,200)
    assert.equal(invoke(email,newPassword).status,0)
    const subsequent = db.prepare('SELECT * FROM password_reset_audit ORDER BY rowid').all()
    assert.equal(subsequent.length,2)
    assert.deepEqual(subsequent[0],events[0])
    assert.notEqual(subsequent[1].id,events[0].id)
  })
}
