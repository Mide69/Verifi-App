import { openLive } from './live.mjs'

const [address, ...extra] = process.argv.slice(2)
if (!address || extra.length) {
  console.error('Usage: node reset-password.mjs <email>. Supply the new password on stdin.')
  process.exit(1)
}
let live
try {
  let password = ''
  for await (const chunk of process.stdin.setEncoding('utf8')) {
    password += chunk
    if (password.length > 130) throw Object.assign(new Error('Use a password of 12 to 128 characters.'),{status:400})
  }
  live = openLive()
  live.resetPassword(address,password.replace(/\r?\n$/,''))
  console.log('Password replaced. All sessions revoked.')
} catch (error) {
  console.error(error.status ? error.message : 'Could not replace password.')
  process.exitCode = 1
} finally {
  live?.close()
}
