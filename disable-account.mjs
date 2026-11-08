import { openLive } from './live.mjs'

const [email, ...extra] = process.argv.slice(2)
if (!email || extra.length) {
  console.error('Usage: node disable-account.mjs <email>')
  process.exit(1)
}
const live = openLive()
try {
  const { disabled } = live.disableAccount(email)
  console.log(`Account disabled since ${disabled}. All sessions revoked.`)
} catch (error) {
  console.error(error.status ? error.message : 'Could not disable account.')
  process.exitCode = 1
} finally { live.close() }
