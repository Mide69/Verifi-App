const main = document.querySelector('#live')
const safe = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const date = value => safe(value?.slice(0,10))
let account, result, receipt, cameraStream, openingCamera
let queueCursor = null
let queueBusy = false
const usesReportQueue = () => account?.role === 'operator' || account?.role === 'regulator'
const titles = {shopper:'Check a pack',manufacturer:'Issue pack codes',operator:'Investigate reports',regulator:'Review referrals'}

async function api(path, body) {
  const response = await fetch('/api/' + path, body === undefined ? {} : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  })
  const data = await response.json()
  if (!response.ok) throw Error(data.error)
  return data
}
function authScreen() {
  const register = new URLSearchParams(location.search).get('mode') === 'register'
  const title = register ? 'Create a shopper account' : 'Sign in to Verifi'
  return `<div class="screen-head"><div><div class="eyebrow">VERIFI ACCOUNT</div><h1>${title}</h1>
  <p class="intro">${register ? 'Check pack codes, submit concerns and track your reports.' : 'Use the email and password for your Verifi account.'}</p></div></div>
  <section class="panel narrow"><form data-form="${register ? 'register' : 'login'}">
  <label>Email<input name="email" type="email" maxlength="254" autocomplete="username" required></label>
  <label>Password<input name="password" type="password" ${register ? 'minlength="12"' : ''} maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" required></label>
  ${register ? '<p class="muted">Use at least 12 characters.</p>' : ''}
  <button class="primary">${register ? 'Create account' : 'Sign in'}</button></form>
  <p><a href="/live?mode=${register ? 'login' : 'register'}">${register ? 'Already registered? Sign in' : 'Create a shopper account'}</a></p>
  <p><a href="/#companies">Register a company or product</a></p></section>`
}

function companyApplications(applications) {
  return `<section class="panel"><h2>Company applications</h2>
  <p>Verify company details before provisioning manufacturer access.</p>
  ${applications.length ? applications.map(application => `<article>
    <small>${date(application.created)} · ${safe(application.id)}</small>
    <h3>${safe(application.company)} · ${safe(application.product)}</h3>
    <p>Company registration ${safe(application.registration)} · ${safe(application.email)}</p>
    <p>Product regulatory reference ${safe(application.regulatory_reference || 'Not supplied')}</p>
  </article>`).join('') : '<p class="empty">No company applications received yet.</p>'}</section>`
}

function checkResult() {
  if (!result) return '<div class="blank"><strong>Waiting for a pack code</strong><p>Enter the serial printed on the pack.</p></div>'
  const statuses = {
    matched:['green','Pack code matched','A manufacturer-issued code matched a record. Compare the product details with the label.'],
    expired:['red','Expiry date passed','The expiry date recorded by the manufacturer has passed.'],
    unknown:['amber','Code not found','Verifi has no manufacturer record for this code. Check the label or report a concern.']
  }
  const [tone,title,detail] = statuses[result.status]
  return `<div class="status ${tone}">${title}</div><p>${detail}</p>${result.product ? `<dl><dt>Product</dt><dd>${safe(result.product)}</dd><dt>Manufacturer</dt><dd>${safe(result.manufacturer)}</dd><dt>Lot</dt><dd>${safe(result.lot)}</dd><dt>Expiry</dt><dd>${date(result.expires)}</dd></dl>` : ''}
  <details><summary>Report a concern</summary><form data-form="report">
  <label>Area or shop location<input name="area" maxlength="120" required></label>
  <label>What did you notice?<textarea name="reason" maxlength="1000" required></textarea></label>
  <button class="primary">Submit report</button></form></details>`
}

function reportCards(reports) {
  return reports.length ? reports.map(r=>`<article><div class="case-head"><div><small>${date(r.created)} · ${safe(r.id)}</small><h3>${safe(r.product || r.code)}</h3></div><span class="badge">${safe(r.stage)}</span></div>
  <p>${safe(r.area)}${r.lot ? ' · Lot ' + safe(r.lot) : ''} · ${safe(r.code)}</p><p>${safe(r.reason)}</p>
  ${account.role==='operator' && r.stage==='submitted' ? `<form data-form="refer"><input name="id" type="hidden" value="${safe(r.id)}"><label>Agency<select name="agency"><option>NAFDAC</option><option>SON</option></select></label><button>Refer case</button></form>` : ''}
  ${account.role==='regulator' && r.stage==='referred' ? `<form data-form="acknowledge"><input name="id" type="hidden" value="${safe(r.id)}"><button>Acknowledge case</button></form>` : ''}</article>`).join('') : '<p class="empty">No reports in this workspace yet.</p>'
}
function reportQueue(page, before) {
  return `<section class="panel"><h2 id="report-queue-heading" tabindex="-1">Report queue${before ? ' · older reports' : ''}</h2>
  ${reportCards(page.reports)}
  <div class="actions">
  ${before ? '<form data-form="report-page"><button>Show newest reports</button></form>' : ''}
  ${page.next ? `<form data-form="report-page"><input type="hidden" name="before" value="${safe(page.next)}"><button>Show older reports</button></form>` : ''}
  </div></section>`
}
function stopCamera() {
  cameraStream?.getTracks().forEach(track=>track.stop())
  cameraStream=null
  const video = main.querySelector('video')
  if (video) { video.srcObject=null; video.hidden=true }
}
async function render(before = queueCursor) {
  stopCamera()
  if (!account) {main.innerHTML=authScreen()+'<p id="live-message" role="status"></p>';return}
  const [reports,batches,applications] = await Promise.all([
    usesReportQueue() ? api('report-queue' + (before ? '?before=' + encodeURIComponent(before) : '')) : api('reports'),
    account.role==='manufacturer' ? api('batches') : [],
    account.role==='operator' ? api('company-applications') : []
  ])
  let work = ''
  if (account.role==='shopper') work = `<div class="split"><section class="panel"><h2>Pack lookup</h2><form data-form="check"><label>Pack code<input name="code" maxlength="100" value="${safe(result?.code)}" required></label><button class="primary">Check code</button></form><div class="actions"><button data-camera>Scan QR code</button></div><video hidden playsinline muted></video></section><section class="panel"><h2>Verification result</h2>${checkResult()}</section></div>`
  if (account.role==='manufacturer') work = `<div class="split"><section class="panel"><h2>Register a batch</h2><form data-form="batches"><label>Product<input name="product" maxlength="100" required></label><label>Lot<input name="lot" maxlength="80" required></label><div class="pair"><label>Expiry date<input name="expires" type="date" required></label><label>Pack count<input name="count" type="number" min="1" max="100" value="1" required></label></div><button class="primary">Issue pack codes</button></form></section><section class="panel"><h2>Issued pack labels</h2>${batches.length ? `<div class="table-wrap"><table><thead><tr><th>Product / lot</th><th>Label</th></tr></thead><tbody>${batches.map(b=>`<tr><td>${safe(b.product)}<br>${safe(b.lot)}</td><td><a class="label-link" href="/qr?code=${encodeURIComponent(b.code)}" download="${safe(b.code)}.svg">${safe(b.code)} ↓</a></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">Your issued codes will appear here.</p>'}</section></div>`
  main.innerHTML=`<div class="case-toolbar"><div><div class="eyebrow">${safe(account.scope || account.role.toUpperCase())} WORKSPACE</div><h1>${titles[account.role]}</h1></div><form data-form="logout"><button>Sign out</button></form></div>
  <p id="live-message" role="status">${receipt ? 'Report submitted. Reference: '+safe(receipt) : ''}</p>
  ${work}${usesReportQueue() ? reportQueue(reports,before) : `<section class="panel"><h2>${account.role==='shopper'?'Your reports':'Report queue'}</h2>${reportCards(reports)}</section>`}${account.role==='operator' ? companyApplications(applications) : ''}`
  queueCursor = before
}
main.addEventListener('click',async event=>{
  if (!event.target.closest('[data-camera]')) return
  const message = document.querySelector('#live-message')
  if (cameraStream) { stopCamera(); return }
  if (openingCamera) return
  if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
    message.textContent='Camera scanning is unavailable in this browser. Enter the pack code manually.'
    return
  }
  const video=main.querySelector('video')
  openingCamera=true
  try {
    const detector=new BarcodeDetector({formats:['qr_code']})
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}})
    if (!video.isConnected) {stream.getTracks().forEach(track=>track.stop());return}
    cameraStream=stream
    video.srcObject=stream
    video.hidden=false
    await video.play()
    const read=async()=>{
      if (cameraStream!==stream) return
      try {
        const [match]=await detector.detect(video)
        if (cameraStream!==stream) return
        if (match) {
          stopCamera()
          const form=main.querySelector('[data-form="check"]')
          form.elements.code.value=match.rawValue
          form.requestSubmit()
        } else setTimeout(read,200)
      } catch {stopCamera();message.textContent='Could not read the camera. Enter the pack code manually.'}
    }
    read()
  } catch {stopCamera();message.textContent='Could not open the camera. Enter the pack code manually.'}
  finally {openingCamera=false}
})
window.addEventListener('pagehide',stopCamera)
main.addEventListener('submit',async event=>{
  event.preventDefault()
  const form = event.target
  const lockQueue = usesReportQueue()
  if (lockQueue && queueBusy) return
  const button = event.submitter
  const values = Object.fromEntries(new FormData(form))
  if (button) button.disabled = true
  if (lockQueue) queueBusy = true
  try {
    const action = form.dataset.form
    if (['login','register'].includes(action)) {
      account=await api(action,values)
      history.replaceState(null,'','/live')
    }
    if (action==='logout') {await api('logout',{});account=null;result=null;receipt=null;queueCursor=null}
    if (action==='check') result=await api('check',values)
    if (action==='batches') await api('batches',{...values,count:Number(values.count)})
    if (action==='report') receipt=(await api('reports',{...values,code:result.code})).id
    if (['refer','acknowledge'].includes(action)) await api('report-action',{...values,action})
    if (action==='report-page') {
      await render(values.before || null)
      main.querySelector('#report-queue-heading')?.focus()
      return
    }
    await render()
  } catch(error) {
    document.querySelector('#live-message').textContent=error.message
  } finally {
    if (lockQueue) queueBusy = false
    if (button) button.disabled=false
  }
})
try { account=(await api('session')).account; await render() }
catch { main.textContent='Could not load the workspace. Refresh to try again.' }
