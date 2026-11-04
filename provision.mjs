import { openLive } from './live.mjs'

const [role, email, scope] = process.argv.slice(2)
if (!['operator','manufacturer','regulator'].includes(role) || !email) {
  console.error('Usage: node provision.mjs <role> <email> [company or agency]. Supply the password on stdin.')
  process.exit(1)
}
let password = ''
for await (const chunk of process.stdin.setEncoding('utf8')) {
  password += chunk
  if (password.length > 130) throw new Error('Password is too long.')
}
const live = openLive()
try {
  live.provision(email,password.replace(/\r?\n$/,''),role,scope)
  console.log('Account created.')
} catch (error) {
  console.error(error.status ? error.message : 'Could not create account.')
  process.exitCode = 1
} finally { live.close() }
