import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openLive } from '../live.mjs'

test('referral retries retain routing, acknowledgement and exactly one audit event per transition', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'verifi-referral-'))
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
  const password = 'test referral passphrase'
  const call = async (endpoint, body, cookie) => {
    const response = await fetch(origin + '/api/' + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const cookies = {}
  for (const [name, role, scope] of [
    ['operator', 'operator', ''], ['second', 'operator', ''],
    ['nafdac', 'regulator', 'NAFDAC'], ['son', 'regulator', 'SON'],
    ['maker', 'manufacturer', 'Test Foods'], ['buyer', 'shopper', '']
  ]) {
    live.provision(name + '@example.test', password, role, scope)
    const response = await call('login', { email: name + '@example.test', password })
    assert.equal(response.status, 200)
    cookies[name] = response.cookie
  }
  const submitted = await call('reports', { code: 'UNKNOWN', area: 'Test shop', reason: 'Broken seal' }, cookies.buyer)
  assert.equal(submitted.status, 201)
  const { id } = submitted.data
  const refer = { id, action: 'refer', agency: 'NAFDAC' }
  const acknowledge = { id, action: 'acknowledge' }
  const action = (body, name) => call('report-action', body, cookies[name])
  const expectAction = async (body, name, status, state) => {
    const response = await action(body, name)
    assert.equal(response.status, status)
    if (state) assert.deepEqual(response.data, state)
    else assert.deepEqual(Object.keys(response.data), ['error'])
  }
  const referred = { agency: 'NAFDAC', stage: 'referred' }
  const acknowledged = { agency: 'NAFDAC', stage: 'acknowledged' }
  await expectAction(acknowledge, 'nafdac', 409)
  await expectAction(refer, 'buyer', 403)
  await expectAction(refer, 'maker', 403)
  await expectAction(refer, 'son', 403)
  await expectAction(refer, 'missing', 401)
  // Model a lost first response: repeat the committed intention concurrently.
  const referralRetries = await Promise.all(Array.from({ length: 5 }, () => action(refer, 'operator')))
  assert.deepEqual(referralRetries.map(response => response.status), [200, 200, 200, 200, 200])
  for (const response of referralRetries) assert.deepEqual(response.data, referred)
  await expectAction(refer, 'second', 200, referred)
  await expectAction({ ...refer, agency: 'SON' }, 'operator', 409)
  await expectAction({ ...refer, agency: 'OTHER' }, 'operator', 403)
  await expectAction({ ...refer, id: 'a'.repeat(32) }, 'operator', 409)
  await expectAction(acknowledge, 'son', 409)
  await expectAction(acknowledge, 'operator', 403)
  assert.deepEqual((await call('reports', undefined, cookies.son)).data, [])
  for (const response of await Promise.all(Array.from({ length: 5 }, () => action(acknowledge, 'nafdac')))) {
    assert.equal(response.status, 200)
    assert.deepEqual(response.data, acknowledged)
  }
  // Stale referral retries must return the current state, never reset it.
  await expectAction(refer, 'operator', 200, acknowledged)
  await expectAction({ ...refer, agency: 'SON' }, 'operator', 409)
  await expectAction(acknowledge, 'son', 409)
  live.close()
  live = openLive(path)
  await expectAction(refer, 'operator', 200, acknowledged)
  await expectAction(acknowledge, 'nafdac', 200, acknowledged)
  await expectAction(acknowledge, 'son', 409)
  const [report] = (await call('reports', undefined, cookies.buyer)).data
  assert.equal(report.id, id)
  assert.equal(report.stage, 'acknowledged')
  assert.equal(report.agency, 'NAFDAC')
  assert.equal(report.reason, 'Broken seal')
  assert.equal((await call('public-stats')).data.reports, 1)
  const inspect = new DatabaseSync(path, { readOnly: true })
  try {
    const events = inspect.prepare('SELECT action,COUNT(*) AS total FROM audit WHERE report_id=? GROUP BY action ORDER BY action').all(id)
    assert.deepEqual(events.map(row => ({ ...row })), [
      { action: 'acknowledge', total: 1 }, { action: 'refer', total: 1 }, { action: 'submitted', total: 1 }
    ])
    const referrals = inspect.prepare("SELECT a.email FROM audit e JOIN account a ON a.id=e.actor WHERE e.report_id=? AND e.action='refer'").all(id)
    assert.deepEqual(referrals.map(row => row.email), ['operator@example.test'])
  } finally { inspect.close() }
})
