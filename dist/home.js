const application = document.querySelector('#company-application')
application.addEventListener('submit', async event => {
  event.preventDefault()
  const button = event.submitter
  const status = document.querySelector('#application-status')
  button.disabled = true
  status.textContent = 'Submitting your application…'
  try {
    const response = await fetch('/api/company-applications', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(Object.fromEntries(new FormData(application)))
    })
    const data = await response.json()
    if (!response.ok) throw Error(data.error || 'Could not submit your application.')
    application.reset()
    status.textContent = 'Application received for Verifi review. Keep this reference: ' + data.reference
  } catch (error) {
    status.textContent = error.message
  } finally {
    button.disabled = false
  }
})

const statsStatus = document.querySelector('#stats-status')
try {
  const response = await fetch('/api/public-stats')
  if (!response.ok) throw Error()
  const stats = await response.json()
  const format = new Intl.NumberFormat('en-NG')
  const counters = ['checks', 'shoppers', 'products', 'manufacturers', 'packs', 'reports']
  if (!counters.every(key => Number.isSafeInteger(stats[key]))) throw Error()
  for (const key of counters) document.getElementById(key).textContent = format.format(stats[key])
  statsStatus.textContent = 'Live workspace totals. Reports are concerns raised by shoppers.'
} catch {
  statsStatus.textContent = 'Live activity is temporarily unavailable.'
}

