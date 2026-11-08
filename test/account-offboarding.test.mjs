import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { createHash, scryptSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { openLive } from '../live.mjs'

const cli = fileURLToPath(new URL('../disable-account.mjs', import.meta.url))
const password = 'fictional test passphrase'

for (const role of ['shopper', 'manufacturer', 'operator', 'regulator']) {
  test(`CLI offboarding blocks all ${role} sessions and preserves evidence`, async t => {
    const folder = mkdtempSync(join(tmpdir(), 'verifi-offboarding-'))
    const path = join(folder, 'test.sqlite')
    let live = openLive(path)
    const server = createServer((req, res) => live.handle(req, res, req.url))
    t.after(async () => {
      await new Promise(resolve => server.close(resolve))
      live.close()
      rmSync(folder, { recursive: true, force: true })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = 'http://127.0.0.1:' + server.address().port
    const call = async (endpoint, body, cookie) => {
      const response = await fetch(origin + '/api/' + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const cookies = {}
    for (const [name, scope] of [['shopper', ''], ['manufacturer', 'Fictional Foods'], ['operator', ''], ['regulator', 'NAFDAC'], ['other', '']]) {
      live.provision(name + '@example.test', password, name === 'other' ? 'shopper' : name, scope)
      const signedIn = await call('login', { email: name + '@example.test', password })
      assert.equal(signedIn.status, 200)
      cookies[name] = signedIn.cookie
    }
    const second = await call('login', { email: role + '@example.test', password })
    assert.equal(second.status, 200)
    const issued = await call('batches', { product: 'Fictional rice', lot: 'A1', expires: '2099-01-01', count: 1 }, cookies.manufacturer)
    const code = issued.data.codes[0]
    const report = await call('reports', { code, area: 'Fictional shop', reason: 'Broken seal' }, cookies.shopper)
    const id = report.data.id
    assert.equal((await call('report-action', { id, action: 'refer', agency: 'NAFDAC' }, cookies.operator)).status, 200)
    assert.equal((await call('report-action', { id, action: 'acknowledge' }, cookies.regulator)).status, 200)
    const before = (await call('public-stats')).data
    const snapshot = () => {
      const db = new DatabaseSync(path)
      try { return Object.fromEntries(['account', 'batch', 'pack', 'report', 'audit'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])) }
      finally { db.close() }
    }
    const evidence = snapshot()
    const runCli = address => spawnSync(process.execPath, [cli, address], { encoding: 'utf8', env: { ...process.env, VERIFI_DB: path } })
    const disabled = runCli(role.toUpperCase() + '@EXAMPLE.TEST')
    assert.equal(disabled.status, 0, disabled.stderr)
    assert.match(disabled.stdout, /All sessions revoked/)
    assert.deepEqual(snapshot(), evidence)
    assert.deepEqual((await call('public-stats')).data, before)
    const inspect = new DatabaseSync(path)
    const accountId = inspect.prepare('SELECT id FROM account WHERE email=?').get(role + '@example.test').id
    assert.equal(inspect.prepare('SELECT COUNT(*) AS total FROM session WHERE account_id=?').get(accountId).total, 0)
    const state = inspect.prepare('SELECT * FROM disabled_account').all()
    inspect.close()
    assert.equal(runCli(role + '@example.test').stdout, disabled.stdout)
    assert.equal(runCli('missing@example.test').status, 1)
    assert.equal(runCli('invalid').status, 1)
    for (const cookie of [cookies[role], second.cookie]) {
      assert.deepEqual((await call('session', undefined, cookie)).data, { account: null })
      assert.equal((await call('reports', undefined, cookie)).status, 401)
      assert.equal((await call('batches', { product: 'Blocked', lot: 'B1', expires: '2099-01-01', count: 1 }, cookie)).status, 401)
      assert.equal((await call('report-action', { id, action: 'refer', agency: 'SON' }, cookie)).status, 401)
      assert.equal((await call('check', { code }, cookie)).status, 401)
      assert.equal((await call('company-applications', undefined, cookie)).status, 401)
    }
    for (const supplied of [password, 'incorrect password']) {
      const denied = await call('login', { email: role + '@example.test', password: supplied })
      assert.equal(denied.status, 401)
      assert.deepEqual(denied.data, { error: 'Sign-in failed.' })
      assert.equal(denied.cookie, undefined)
    }
    assert.equal((await call('register', { email: role + '@example.test', password })).status, 409)
    assert.equal((await call('session', undefined, cookies.other)).data.account.role, 'shopper')
    assert.equal((await call('check', { code }, cookies.other)).data.status, 'matched')
    live.close()
    live = openLive(path)
    assert.equal((await call('reports', undefined, second.cookie)).status, 401)
    assert.equal((await call('session', undefined, cookies.other)).data.account.role, 'shopper')
    assert.deepEqual(snapshot(), evidence)
    const reopened = new DatabaseSync(path)
    assert.deepEqual(reopened.prepare('SELECT * FROM disabled_account').all(), state)
    // Even a stale session row cannot bypass the disabled-state check.
    const rawToken = second.cookie.split('=')[1]
    reopened.prepare('INSERT INTO session VALUES (?,?,?)').run(createHash('sha256').update(rawToken).digest('hex'), accountId, Date.now() + 60000)
    reopened.close()
    assert.equal((await call('reports', undefined, second.cookie)).status, 401)
    assert.equal(runCli(role + '@example.test').status, 0)
  })
}

test('startup migrates legacy accounts and keeps their sessions usable until disabled', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'verifi-legacy-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const path = join(folder, 'legacy.sqlite')
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE account (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('shopper','manufacturer','operator','regulator')), scope TEXT NOT NULL);
    CREATE TABLE session (token TEXT PRIMARY KEY, account_id TEXT REFERENCES account(id) NOT NULL, expires INTEGER NOT NULL);`)
  db.prepare('INSERT INTO account VALUES (?,?,?,?,?,?)').run('legacy-id', 'legacy@example.test', 'legacy-salt', scryptSync(password, 'legacy-salt', 64).toString('hex'), 'operator', '')
  db.prepare('INSERT INTO session VALUES (?,?,?)').run(createHash('sha256').update('legacy-token').digest('hex'), 'legacy-id', Date.now() + 60000)
  const original = db.prepare('SELECT * FROM account').all()
  db.close()
  const live = openLive(path)
  t.after(() => live.close())
  const server = createServer((req, res) => live.handle(req, res, req.url))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const session = async () => (await fetch('http://127.0.0.1:' + server.address().port + '/api/session', { headers: { cookie: 'verifi_session=legacy-token' } })).json()
  assert.equal((await session()).account.role, 'operator')
  live.disableAccount('legacy@example.test')
  assert.deepEqual(await session(), { account: null })
  const migrated = new DatabaseSync(path)
  assert.deepEqual(migrated.prepare('SELECT * FROM account').all(), original)
  assert.equal(migrated.prepare('SELECT COUNT(*) AS total FROM disabled_account').get().total, 1)
  migrated.close()
})
