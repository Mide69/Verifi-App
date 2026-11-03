import test from 'node:test'
import assert from 'node:assert/strict'
import { seed, check, clusters } from '../dist/model.js'

test('registration, pack, expiry and unknown codes produce distinct results', () => {
  const data = seed()
  const day = '2026-11-03'
  assert.equal(check(data, 'demo-ng-1001', day).title, 'Registration found')
  assert.equal(check(data, 'VF-DEMO-001', day).tone, 'green')
  assert.equal(check(data, 'VF-DEMO-EXPIRED', day).tone, 'red')
  assert.equal(check(data, 'UNKNOWN', day).title, 'Code not found')
  data.batches[0].recall = true
  assert.equal(check(data, 'VF-DEMO-001', day).title, 'Do not use')
})

test('repeat checks across areas flag a pack code', () => {
  const data = seed()
  data.scans.push({code:'VF-DEMO-001',state:'Lagos',lga:'Ikeja'}, {code:'VF-DEMO-001',state:'Lagos',lga:'Epe'})
  assert.equal(check(data, 'VF-DEMO-001', '2026-11-03').title, 'Unusual scan activity')
})

test('case clustering groups matching locations and counts distinct reporters', () => {
  const data = seed()
  data.reports.push({...data.reports[0],id:'another',lga:'ikeja'})
  const [group] = clusters(data)
  assert.equal(group.people.size, 2)
  assert.equal(group.reports.length, 3)
})
