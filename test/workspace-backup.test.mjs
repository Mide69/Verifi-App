import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { openLive } from '../live.mjs'

const execute = promisify(execFile)
const cli = fileURLToPath(new URL('../workspace-backup.mjs',import.meta.url))
const invoke = (source, ...args) => execute(process.execPath,[cli,...args],{env:{...process.env,VERIFI_DB:source}})

async function serve(t, path) {
  const live = openLive(path)
  const server = createServer((req,res)=>live.handle(req,res,req.url))
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(async () => {
    await new Promise(resolve=>server.close(resolve))
    live.close()
  })
  const origin = 'http://127.0.0.1:' + server.address().port
  async function call(endpoint, body, cookie) {
    const headers = {origin}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    const response = await fetch(origin+'/api/'+endpoint,{
      method:body === undefined ? 'GET' : 'POST', headers, body:JSON.stringify(body)
    })
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  return {live,call}
}

test('backup and restore retain live WAL records, role boundaries and audit history', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-backup-'))
  const source = join(folder,'live.sqlite')
  const backup = join(folder,'backup.sqlite')
  const restored = join(folder,'restored.sqlite')
  const original = await serve(t,source)
  const password = 'fictional test passphrase'
  for (const [role,scope] of [['manufacturer','Test Foods'],['operator',''],['regulator','NAFDAC'],['regulator','SON']]) {
    original.live.provision((scope === 'SON' ? 'second' : role)+'@example.test',password,role,scope)
  }
  const login = async (workspace,name) => {
    const response = await workspace.call('login',{email:name+'@example.test',password})
    assert.equal(response.status,200)
    return response.cookie
  }
  const maker = await login(original,'manufacturer')
  const operator = await login(original,'operator')
  const shopper = (await original.call('register',{email:'buyer@example.test',password})).cookie
  const batch = await original.call('batches',{product:'Rice',lot:'A01',expires:'2099-01-01',count:1},maker)
  const [code] = batch.data.codes
  assert.equal((await original.call('check',{code},shopper)).data.status,'matched')
  const report = await original.call('reports',{code,area:'Test shop',reason:'Damaged seal'},shopper)
  const id = report.data.id
  assert.equal((await original.call('report-action',{id,action:'refer',agency:'NAFDAC'},operator)).status,200)
  assert.ok(statSync(source+'-wal').size > 0)

  await invoke(source,'backup',backup)
  assert.equal(existsSync(backup+'-wal'),false)
  assert.equal(existsSync(backup+'-shm'),false)
  if (process.platform !== 'win32') assert.equal(statSync(backup).mode & 0o777,0o600)
  assert.equal((await original.call('session',undefined,shopper)).data.account.role,'shopper')
  const agency = await login(original,'regulator')
  assert.equal((await original.call('report-action',{id,action:'acknowledge'},agency)).status,200)

  await invoke(source,'restore',backup,restored)
  const recovered = await serve(t,restored)
  assert.equal((await recovered.call('reports',undefined,shopper)).status,401)
  const newShopper = await login(recovered,'buyer')
  const newAgency = await login(recovered,'regulator')
  const otherAgency = await login(recovered,'second')
  assert.equal((await recovered.call('check',{code},newShopper)).data.lot,'A01')
  const [referral] = (await recovered.call('reports',undefined,newAgency)).data
  assert.equal(referral.id,id)
  assert.equal(referral.reason,'Damaged seal')
  assert.equal(referral.stage,'referred')
  assert.deepEqual((await recovered.call('reports',undefined,otherAgency)).data,[])
  const db = new DatabaseSync(restored,{readOnly:true})
  try {
    assert.deepEqual(db.prepare('SELECT action FROM audit WHERE report_id=? ORDER BY rowid').all(id).map(row=>row.action),['submitted','refer'])
  } finally {
    db.close()
  }
  assert.equal((await recovered.call('report-action',{id,action:'acknowledge'},newAgency)).status,200)
  t.after(() => rmSync(folder,{recursive:true,force:true}))
})

test('backup commands reject existing paths and invalid sources without publishing output', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-backup-errors-'))
  t.after(() => rmSync(folder,{recursive:true,force:true}))
  const missing = join(folder,'missing.sqlite')
  const invalid = join(folder,'invalid.sqlite')
  const existing = join(folder,'existing.sqlite')
  const orphan = join(folder,'orphan.sqlite')
  const output = join(folder,'output.sqlite')
  writeFileSync(existing,'original bytes')
  writeFileSync(orphan+'-wal','original sidecar bytes')
  new DatabaseSync(invalid).close()
  await assert.rejects(invoke(missing,'backup',output), /SQLite could not open/)
  await assert.rejects(invoke(invalid,'backup',output), /does not contain the Verifi workspace schema/)
  await assert.rejects(invoke(invalid,'restore',invalid,existing), /Choose a new destination/)
  await assert.rejects(invoke(invalid,'restore',invalid,orphan), /Choose a new destination/)
  assert.equal(readFileSync(existing,'utf8'),'original bytes')
  assert.equal(readFileSync(orphan+'-wal','utf8'),'original sidecar bytes')
  assert.deepEqual(readdirSync(folder).sort(),['existing.sqlite','invalid.sqlite','orphan.sqlite-wal'])
})
