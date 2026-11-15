import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

function utcDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === value ? date.toISOString() : null
}

function handoffMetrics(db, start, end) {
  return db.prepare(`
    WITH report_cohort AS (
      SELECT id, created FROM report WHERE created >= :start AND created < :end
    ), first_referral AS (
      SELECT r.id, r.created, MIN(a.created) AS referred_at
      FROM report_cohort r LEFT JOIN audit a
        ON a.report_id = r.id AND a.action = 'refer'
        AND a.created >= r.created AND a.created < :end
      GROUP BY r.id, r.created
    ), first_acknowledgement AS (
      SELECT r.id, r.created, r.referred_at, MIN(a.created) AS acknowledged_at
      FROM first_referral r LEFT JOIN audit a
        ON a.report_id = r.id AND a.action = 'acknowledge'
        AND a.created >= r.referred_at AND a.created < :end
      GROUP BY r.id, r.created, r.referred_at
    )
    SELECT
      COUNT(*) AS reportsSubmitted,
      COUNT(referred_at) AS reportsReferred,
      COUNT(acknowledged_at) AS referralsAcknowledged,
      COUNT(*) - COUNT(referred_at) AS reportsAwaitingReferral,
      COUNT(referred_at) - COUNT(acknowledged_at) AS referralsAwaitingAcknowledgement,
      ROUND(AVG(unixepoch(referred_at, 'subsec') - unixepoch(created, 'subsec')), 3)
        AS meanSubmissionToReferralSeconds,
      ROUND(AVG(unixepoch(acknowledged_at, 'subsec') - unixepoch(referred_at, 'subsec')), 3)
        AS meanReferralToAcknowledgementSeconds
    FROM first_acknowledgement
  `).get({start,end})
}

const args = process.argv.slice(2)
const [from, until] = args
const start = utcDate(from)
const end = utcDate(until)
if (args.length !== 2 || !start || !end || start >= end) {
  console.error('Usage: node handoff-metrics.mjs <first-date> <exclusive-end-date>. Use YYYY-MM-DD UTC dates in ascending order.')
  process.exitCode = 1
} else {
  let db
  try {
    const path = process.env.VERIFI_DB || './data/verifi.sqlite'
    db = new DatabaseSync(resolve(path),{readOnly:true})
    db.exec('PRAGMA busy_timeout=5000')
    const result = handoffMetrics(db,start,end)
    console.log(JSON.stringify({startInclusive:start,endExclusive:end,...result},null,2))
  } catch {
    console.error('Could not read handoff metrics. Confirm VERIFI_DB points to an existing Verifi workspace database.')
    process.exitCode = 1
  } finally {
    db?.close()
  }
}
