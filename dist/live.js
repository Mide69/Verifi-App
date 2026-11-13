const main = document.querySelector('#live')
const safe = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const date = value => safe(value?.slice(0,10))
let account, result, receipt, cameraStream, openingCamera
let mode = new URLSearchParams(location.search).get('mode')
let reporting = false
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
  const register = mode === 'register'
  const title = register ? 'Create a shopper account' : 'Sign in to Verifi'
  return `<div class="screen-head"><div><div class="eyebrow">VERIFI ACCOUNT</div><h1>${title}</h1>
  <p class="intro">${reporting ? 'Your pack check is ready. Continue to submit and track your report.' : register ? 'Create an account to submit concerns and track your reports.' : 'Use the email and password for your Verifi account.'}</p></div></div>
  <section class="panel narrow"><form data-form="${register ? 'register' : 'login'}">
  <label>Email<input name="email" type="email" maxlength="254" autocomplete="username" required></label>
  <label>Password<input name="password" type="password" ${register ? 'minlength="12"' : ''} maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" required></label>
  ${register ? '<p class="muted">Use at least 12 characters.</p>' : ''}
  <button class="primary">${register ? 'Create account' : 'Sign in'}</button></form>
  <div class="actions"><button type="button" data-mode="${register ? 'login' : 'register'}">${register ? 'Already registered? Sign in' : 'Create a shopper account'}</button>
  <button type="button" data-mode="check">${result ? 'Back to pack result' : 'Check a pack'}</button></div>
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
  return `<div id="verification-status" class="status ${tone}">${title}</div><p>${detail}</p>${result.product ? `<dl><dt>Product</dt><dd>${safe(result.product)}</dd><dt>Manufacturer</dt><dd>${safe(result.manufacturer)}</dd><dt>Lot</dt><dd>${safe(result.lot)}</dd><dt>Expiry</dt><dd>${date(result.expires)}</dd></dl>` : ''}
  ${!account ? '<div class="actions"><button type="button" data-mode="login" data-report>Sign in to report a concern</button><button type="button" data-mode="register" data-report>Create a shopper account</button></div>' : `<details${reporting ? ' open' : ''}><summary>Report a concern</summary><form data-form="report">
  <label>Area or shop location<input name="area" maxlength="120" required></label>
  <label>What did you notice?<textarea name="reason" maxlength="1000" required></textarea></label>
  <button class="primary">Submit report</button></form></details>`}`
}

function packLookup() {
  return `<div class="split"><section class="panel"><h2>Pack lookup</h2><form data-form="check"><label>Pack code<input name="code" maxlength="100" autocapitalize="characters" spellcheck="false" value="${safe(result?.code)}" required></label><button class="primary">Check code</button></form><div class="actions"><button data-camera>Scan QR code</button></div><video hidden playsinline muted></video></section><section class="panel"><h2 id="verification-result" tabindex="-1"${result ? ' aria-describedby="verification-status"' : ''}>Verification result</h2>${checkResult()}</section></div>`
}

function reportCards(reports) {
  return reports.length ? reports.map(r=>`<article><div class="case-head"><div><small>${date(r.created)} · ${safe(r.id)}</small><h3>${safe(r.product || r.code)}</h3></div><span class="badge">${safe(r.stage)}</span></div>
  <p>${safe(r.area)}${r.lot ? ' · Lot ' + safe(r.lot) : ''} · ${safe(r.code)}</p><p>${safe(r.reason)}</p>
  ${account.role==='operator' && r.stage==='submitted' ? `<form data-form="refer"><input name="id" type="hidden" value="${safe(r.id)}"><label>Agency<select name="agency"><option>NAFDAC</option><option>SON</option></select></label><button>Refer case</button></form>` : ''}
  ${account.role==='regulator' && r.stage==='referred' ? `<form data-form="acknowledge"><input name="id" type="hidden" value="${safe(r.id)}"><button>Acknowledge case</button></form>` : ''}</article>`).join('') : '<p class="empty">No reports in this workspace yet.</p>'
}
function stopCamera() {
  cameraStream?.getTracks().forEach(track=>track.stop())
  cameraStream=null
  const video = main.querySelector('video')
  if (video) { video.srcObject=null; video.hidden=true }
}
async function render() {
  stopCamera()
  if (!account) {
    const content = mode === 'login' || mode === 'register' ? authScreen() : `<div class="case-toolbar"><h1>Check a pack</h1><button type="button" data-mode="login">Sign in</button></div>`
    main.innerHTML = content + '<p id="live-message" role="status"></p>' + (mode === 'login' || mode === 'register' ? '' : packLookup())
    return
  }
  const [reports,batches,applications] = await Promise.all([
    api('reports'),
    account.role==='manufacturer' ? api('batches') : [],
    account.role==='operator' ? api('company-applications') : []
  ])
  let work = ''
  if (account.role==='shopper') work = packLookup()
  if (account.role==='manufacturer') work = `<div class="split"><section class="panel"><h2>Register a batch</h2><form data-form="batches"><label>Product<input name="product" maxlength="100" required></label><label>Lot<input name="lot" maxlength="80" required></label><div class="pair"><label>Expiry date<input name="expires" type="date" required></label><label>Pack count<input name="count" type="number" min="1" max="100" value="1" required></label></div><button class="primary">Issue pack codes</button></form></section><section class="panel"><h2>Issued pack labels</h2>${batches.length ? `<div class="table-wrap"><table><thead><tr><th>Product / lot</th><th>Label</th></tr></thead><tbody>${batches.map(b=>`<tr><td>${safe(b.product)}<br>${safe(b.lot)}</td><td><a class="label-link" href="/qr?code=${encodeURIComponent(b.code)}" download="${safe(b.code)}.svg">${safe(b.code)} ↓</a></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">Your issued codes will appear here.</p>'}</section></div>`
  main.innerHTML=`<div class="case-toolbar"><div><div class="eyebrow">${safe(account.scope || account.role.toUpperCase())} WORKSPACE</div><h1>${titles[account.role]}</h1></div><form data-form="logout"><button>Sign out</button></form></div>
  <p id="live-message" role="status">${receipt ? 'Report submitted. Reference: '+safe(receipt) : ''}</p>
  ${work}<section class="panel"><h2>${account.role==='shopper'?'Your reports':'Report queue'}</h2>${reportCards(reports)}</section>${account.role==='operator' ? companyApplications(applications) : ''}`
}
main.addEventListener('click',async event=>{
  const navigation = event.target.closest('[data-mode]')
  if (navigation) {
    mode = navigation.dataset.mode
    reporting = mode !== 'check' && (reporting || navigation.hasAttribute('data-report'))
    history.replaceState(null,'',mode === 'check' ? '/live' : '/live?mode=' + mode)
    await render()
    const heading = main.querySelector(mode === 'check' && result ? '#verification-result' : 'h1')
    heading?.setAttribute('tabindex','-1')
    heading?.focus()
    return
  }
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
  const button = event.submitter
  const values = Object.fromEntries(new FormData(form))
  if (button) button.disabled = true
  try {
    const action = form.dataset.form
    if (['login','register'].includes(action)) {
      account=await api(action,values)
      history.replaceState(null,'','/live')
    }
    if (action==='logout') {
      await api('logout',{})
      account=null;result=null;receipt=null;mode=null;reporting=false
      history.replaceState(null,'','/live')
    }
    if (action==='check') {result=await api('check',values);reporting=false}
    if (action==='batches') await api('batches',{...values,count:Number(values.count)})
    if (action==='report') {receipt=(await api('reports',{...values,code:result.code})).id;reporting=false}
    if (['refer','acknowledge'].includes(action)) await api('report-action',{...values,action})
    await render()
    if (action === 'check') main.querySelector('#verification-result')?.focus()
    if (reporting && account?.role === 'shopper' && ['login','register'].includes(action)) main.querySelector('[data-form="report"] [name="area"]')?.focus()
  } catch(error) {
    document.querySelector('#live-message').textContent=error.message
  } finally { if (button) button.disabled=false }
})
try { account=(await api('session')).account; await render() }
catch { main.textContent='Could not load the workspace. Refresh to try again.' }
