import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { openLive } from '../live.mjs'

const execute = promisify(execFile)
const cli = fileURLToPath(new URL('../handoff-metrics.mjs',import.meta.url))
const invoke = (path, ...dates) => execute(process.execPath,[cli,...dates],{
  env:{...process.env,VERIFI_DB:path}
})

test('handoff metrics use the submission cohort and first transitions before the cutoff', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-handoffs-'))
  const path = join(folder,'test.sqlite')
  const live = openLive(path)
  const db = new DatabaseSync(path)
  t.after(() => {
    db.close()
    live.close()
    rmSync(folder,{recursive:true,force:true})
  })
  db.exec(`
    INSERT INTO account VALUES
      ('shopper','buyer@example.test','salt','hash','shopper',''),
      ('operator','operator@example.test','salt','hash','operator',''),
      ('agency','agency@example.test','salt','hash','regulator','NAFDAC');
  `)
  const report = db.prepare('INSERT INTO report VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const audit = db.prepare('INSERT INTO audit VALUES (?, ?, ?, ?, ?)')
  const start = '2026-11-01T00:00:00.000Z'
  const end = '2026-11-15T00:00:00.000Z'
  const at = time => `2026-11-01T00:00:${time}Z`
  for (const [id,created,stage] of [
    ['first',start,'acknowledged'],
    ['second',at('10.000'),'acknowledged'],
    ['third',at('20.000'),'referred'],
    ['old','2026-10-31T23:59:59.999Z','referred'],
    ['old-pending','2026-10-31T12:00:00.000Z','submitted'],
    ['new',end,'submitted']
  ]) {
    report.run(id,'shopper','PRIVATE-PACK','Private shop','Private narrative',created,'NAFDAC',stage)
    audit.run(id+'-submitted','shopper',id,'submitted',created)
  }
  const transitions = [
    ['first','refer',at('01.250')],
    ['first','refer',at('02.500')],
    ['first','rerouted:NAFDAC->SON',at('03.000')],
    ['first','acknowledge',at('04.500')],
    ['first','acknowledge',at('05.000')],
    ['second','refer',at('12.750')],
    ['second','acknowledge',end],
    ['third','refer',end],
    ['old','refer',start]
  ]
  for (const [index,[id,action,time]] of transitions.entries()) {
    // Events may share an action when retry and reassignment changes are present.
    audit.run('event-'+index,action === 'acknowledge' ? 'agency' : 'operator',id,action,time)
  }

  const {stdout} = await invoke(path,'2026-11-01','2026-11-15')
  assert.deepEqual(JSON.parse(stdout),{
    startInclusive:start,endExclusive:end,
    reportsSubmitted:3,reportsReferred:2,referralsAcknowledged:1,
    reportsAwaitingReferral:1,referralsAwaitingAcknowledgement:1,
    meanSubmissionToReferralSeconds:2,meanReferralToAcknowledgementSeconds:3.25,
    backlogReportsAwaitingReferral:2,backlogReferralsAwaitingAcknowledgement:2,
    oldestReportAwaitingReferralSeconds:1252800,
    oldestReferralAwaitingAcknowledgementSeconds:1209600
  })
  const {stdout:emptyOutput} = await invoke(path,'2026-10-01','2026-10-02')
  const empty = JSON.parse(emptyOutput)
  assert.equal(empty.reportsSubmitted,0)
  assert.equal(empty.reportsReferred,0)
  assert.equal(empty.referralsAcknowledged,0)
  assert.equal(empty.meanSubmissionToReferralSeconds,null)
  assert.equal(empty.meanReferralToAcknowledgementSeconds,null)
  assert.equal(empty.backlogReportsAwaitingReferral,0)
  assert.equal(empty.backlogReferralsAwaitingAcknowledgement,0)
  assert.equal(empty.oldestReportAwaitingReferralSeconds,null)
  assert.equal(empty.oldestReferralAwaitingAcknowledgementSeconds,null)

  const {stdout:olderOutput} = await invoke(path,'2026-11-14','2026-11-15')
  const older = JSON.parse(olderOutput)
  assert.equal(older.reportsSubmitted,0)
  assert.equal(older.meanSubmissionToReferralSeconds,null)
  assert.equal(older.backlogReportsAwaitingReferral,2)
  assert.equal(older.backlogReferralsAwaitingAcknowledgement,2)
  assert.equal(older.oldestReportAwaitingReferralSeconds,1252800)
  assert.equal(older.oldestReferralAwaitingAcknowledgementSeconds,1209600)
})

test('handoff metrics reject invalid dates and never create a missing database', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-handoffs-errors-'))
  t.after(() => rmSync(folder,{recursive:true,force:true}))
  const missing = join(folder,'missing.sqlite')
  await assert.rejects(invoke(missing,'2026-02-30','2026-03-02'),/Use YYYY-MM-DD UTC dates/)
  await assert.rejects(invoke(missing,'2026-11-15','2026-11-15'),/ascending order/)
  await assert.rejects(invoke(missing,'2026-11-01','2026-11-15'),/Confirm VERIFI_DB/)
  assert.equal(existsSync(missing),false)
})
