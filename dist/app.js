import { launch, activityChart, caseChart, icon, shortcut, blank, art } from './visuals.js'
import { seed, check, clusters, addDemoEvidence } from './model.js'

const key = 'verifi-pilot-v1'
let data = JSON.parse(localStorage.getItem(key) || 'null') || seed()
let profile = sessionStorage.getItem('verifi-profile') || ''
let role = 'Consumer'
let page = 'Home'
let result, lastCode, stream, openingCamera, noticeTimer
const view = document.querySelector('#view')
const nav = document.querySelector('#nav')
const pages = { Consumer: ['Scan','Catalogue','Community','History'], Company: ['Overview','Products','Batches','Onboarding'], Regulator: ['Overview','Cases'], Operator: ['Overview','Approvals','Cases'] }
const workspaces = {
  Consumer: ['Scan', 'Check a product'],
  Company: ['Onboarding', 'Manage your products'],
  Regulator: ['Cases', 'Review referred cases'],
  Operator: ['Approvals', 'Manage the pilot']
}
const workspaceNav = document.querySelector('#workspaces')
workspaceNav.innerHTML = '<div class="nav-label">DEMO WORKSPACES</div>' +
  Object.entries(workspaces).map(([name, [symbol, description]]) =>
    `<button data-role="${name}" aria-controls="view"><span class="workspace-icon">${icon(symbol)}</span><span class="workspace-copy"><strong>${name}</strong><small>${description}</small></span></button>`
  ).join('')
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
const save = () => localStorage.setItem(key, JSON.stringify(data))
const date = () => new Date().toISOString().slice(0,10)
const productName = id => data.products.find(item => item.id === id)?.name || id
const options = (items, label = item => item, value = item => item) => items.map(item => `<option value="${escape(value(item))}">${escape(label(item))}</option>`).join('')
const heading = (label, title, subtitle) => `<div class="screen-head"><div class="screen-icon">${icon(page)}</div><div><div class="eyebrow">${label}</div><h1>${title}</h1><p class="intro">${subtitle}</p></div></div>`
const field = (label, name, attrs = 'required') => `<label>${label}<input name="${name}" ${attrs}></label>`
const select = (label, name, choices) => `<label>${label}<select name="${name}">${choices}</select></label>`
const table = (heads, rows) => rows.length ? `<div class="table-wrap"><table><thead><tr>${heads.map(value => `<th>${value}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : blank(page,'No records yet','New activity will appear here as you use this workspace.')
const metrics = items => `<div class="metrics">${items.map(([label, value]) => `<section><div class="metric-icon">${icon(label.includes('Case') || label.includes('case') || label.includes('Report') ? 'Cases' : label.includes('Scan') || label.includes('check') ? 'Scan' : 'Products')}</div><small>${label}</small><strong>${value}</strong></section>`).join('')}</div>`
const form = (id, content, button) => `<form id="${id}">${content}<button class="primary">${button}</button></form>`
const geo = field('State', 'state', 'placeholder="e.g. Lagos"') + field('Local government area', 'lga', 'placeholder="e.g. Ikeja"')
const company = () => data.companies.find(item => item.id === (sessionStorage.getItem('verifi-company') || 'harvest'))
const companyProducts = () => data.products.filter(item => item.company === company()?.id)
const reference = report => 'VF-' + report.id.slice(0,8).toUpperCase()
const reportStatus = report => {
  const group = clusters(data).find(item => item.reports.includes(report))
  return group ? caseStatus(group) : 'New'
}
const caseStatus = group => data.cases[group.key] || 'New'
const recent = scans => table(['Product or code','Result','Area','Date'], scans.slice().reverse().map(s => [escape(productName(s.product || s.code)),escape(s.title),escape([s.lga,s.state].filter(Boolean).join(', ') || 'Unspecified'),s.date]))

function notify(message) {
  const notice = document.querySelector('#notice')
  clearTimeout(noticeTimer)
  notice.textContent = message
  noticeTimer = setTimeout(() => { notice.textContent = '' }, 5500)
}

function scanResult() {
  if (!result) return blank('Scan','Ready when you are','Scan a pack or enter a code to see the verification result here.') + `<div class="result-guide"><h3>What you’ll see</h3><div><span class="result-dot"></span><span><b>Pack match</b><small>Whether the serial matches a sample record.</small></span></div><div><span class="result-dot amber-dot"></span><span><b>Registration details</b><small>Which product and authority the code points to.</small></span></div><div><span class="result-dot red-dot"></span><span><b>Safety notices</b><small>Expiry, recalls or unusual scan activity.</small></span></div></div>`
  const { product, batch } = result
  return `<div class="status ${result.tone}">${result.title}</div><p>${result.detail}</p>${product ? `<div class="result-product">${art(product.id,'mini')}<div><small>PRODUCT RECORD</small><h3>${escape(product.name)}</h3></div></div><dl>${Object.entries({'Registration': product.agency + ' · ' + product.registration, 'Pack size': product.size, 'Batch': batch?.lot, 'Manufactured': batch?.made, 'Expiry': batch?.expires, 'Ingredients': product.ingredients, 'Allergens': product.allergens, 'Storage': product.storage}).filter(([, value]) => value).map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join('')}</dl>` : ''}<button data-action="report">Report this pack</button>`
}

function consumer() {
  const access = () => `<section class="panel access" id="demo-access"><div><div class="eyebrow">TRY THE PILOT</div><h2>Start a demo session</h2><p class="muted">Explore verification with sample products. Your activity is saved in this browser.</p></div><div>${form('signin',select('Demo sign-in method','method',options(['Google','Email','Phone'])) + field('Demo name or identifier','name','required maxlength="60" value="Demo shopper"'),'Start demo session')}<p class="muted">Use sample details only. No external sign-in or verification codes are sent.</p></div></section>`
  if (page === 'Home') return launch(Boolean(profile)) + (profile ? '' : access()) + metrics([['Demo shoppers',data.profiles?.length || 0],['Approved companies',data.companies.filter(c=>c.status==='Approved').length],['Catalogue products',data.products.length],['Product checks',data.scans.length],['Confirmed cases',clusters(data).filter(g=>caseStatus(g)==='Confirmed').length]])
  if (!profile) return heading('CONSUMER ACCESS','Start a demo session','Sign in to use the shopper workspace.') + access()
  if (page === 'Scan') return heading('PRODUCT CHECK','Check a product','Scan a supported code or enter a pack serial or registration number.') + `<div class="split scan-grid"><section class="panel scanner"><div class="scan-stage"><div class="scan-target" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div><video hidden id="camera" playsinline muted></video><small>ALIGN THE PACK CODE</small></div><div class="scanner-tools"><button data-action="camera" class="primary">Use camera</button><button data-action="sample">Try sample code</button></div><div class="manual"><div class="eyebrow">MANUAL LOOKUP</div><h2>Enter a code</h2><p class="muted">You can optionally add the state and LGA where you scanned the pack.</p>${form('scan',field('Product code','code',`required maxlength="180" placeholder="e.g. VF-DEMO-001" value="${escape(lastCode)}"`) + `<div class="pair">${geo}</div>`,'Check product')}</div></section><section class="panel result-panel"><div class="result-heading"><div><div class="eyebrow">VERIFICATION</div><h2>Check result</h2></div><span class="workspace-icon">${icon('Approvals')}</span></div>${scanResult()}</section></div><section class="panel" id="report" hidden><h2>Report a suspicious pack</h2>${form('report-form',`<p class="muted">Enter where you bought or found the pack.</p><div class="pair">${geo}</div>` + field('What did you notice?','reason','required maxlength="500"') + field('Sample photo (optional)','photo','type="file" accept="image/jpeg,image/png,image/webp"'),'Submit private report')}</section>`
  if (page === 'History') {
    const scans = data.scans.filter(item => item.author === profile)
    const reports = data.reports.filter(item => item.author === profile)
    return heading('YOUR ACTIVITY','Scan history','See your recent checks and private reports.') + metrics([['Scans', scans.length],['Reports',reports.length],['Community posts',data.reviews.filter(item => item.author === profile).length]]) + activityChart(scans) + `<section class="panel"><h2>Recent checks</h2>${recent(scans)}</section><section class="panel"><h2>Your reports</h2>${table(['Reference','Product','Location','Status'], reports.map(r => [escape(reference(r)),escape(productName(r.product)),escape(r.lga + ', ' + r.state),escape(reportStatus(r))]))}</section>`
  }
  if (page === 'Catalogue') return heading('PRODUCT DISCOVERY','Explore the catalogue','Search sample products by name or registration and read community feedback.') + `<section class="panel">${field('Search products','search','type="search" placeholder="Try rice or DEMO-SON-210"')}<div class="catalogue-grid" id="catalogue"></div></section>`
  return heading('COMMUNITY','Product discussions','Read experiences from other shoppers or share your own.') + `<div class="split community-grid"><section class="panel feed"><h2>Latest posts</h2>${data.reviews.slice().reverse().map(r => `<article class="feed-post"><div class="avatar" aria-hidden="true">${escape(r.author.slice(0,1).toUpperCase())}</div><div><small>${escape(productName(r.product))}</small><h3>${escape(r.author)} · ${escape(r.kind)}${r.kind === 'Review' ? ' · ' + escape(r.rating) + '/5' : ''}</h3><p>${escape(r.body)}</p><details><summary>Replies (${r.replies?.length || 0})</summary>${(r.replies || []).map(reply=>`<p><b>${escape(reply.author)}</b> · ${escape(reply.body)}</p>`).join('')}${form('reply',`<input type="hidden" name="index" value="${data.reviews.indexOf(r)}">` + field('Reply','body','required maxlength="500"'),'Post reply')}</details></div></article>`).join('')}</section><section class="panel compose"><div class="screen-icon">${icon('Community')}</div><h2>Share an experience</h2>${form('review',select('Product','product',options(data.products,p=>p.name,p=>p.id)) + select('Post type','kind',options(['Review','Discussion'])) + select('Rating (for reviews)','rating',options(['5','4','3','2','1'])) + '<label>Message<textarea name="body" required maxlength="1000"></textarea></label>','Publish post')}</section></div>`
}

function business() {
  const products = companyProducts()
  const batches = data.batches.filter(b => products.some(p => p.id === b.product))
  const scans = data.scans.filter(s => products.some(p => p.id === s.product))
  const reports = data.reports.filter(r => products.some(p => p.id === r.product))
  const active = company()
  const workspace = select('Active demo company','company', options(data.companies,c=>c.name + ' · ' + c.status,c=>c.id))
  if (page === 'Onboarding') return heading('COMPANY ACCESS','Company onboarding','Submit sample business details for operator review.') + `<div class="split"><section class="panel onboarding-card"><div class="screen-icon">${icon('Onboarding')}</div><h2>Company access</h2>${workspace}<p class="badge">${escape(active?.status)}</p><ol><li>Submit business details</li><li>Wait for operator review</li><li>Manage products and batches once approved</li></ol></section><section class="panel"><h2>New application</h2>${form('onboard',field('Legal company name','name') + field('Company registration number','registration') + field('Business address','address') + field('Sample ID, address and regulatory evidence references','reference'),'Submit for review')}</section></div>`
  if (active?.status !== 'Approved') return heading('COMPANY ACCESS','Approval required','This workspace becomes available once an operator approves the demo company.') + `<section class="panel">${workspace}</section>`
  if (page === 'Products') return heading('MANUFACTURER CATALOGUE','Products','Manage the product details shoppers see when they check a pack.') + `<div class="split manage-grid"><section class="panel"><h2>Catalogue</h2>${table(['Product','Registration',''],products.map(p=>[`<div class="record-product">${art(p.id,'mini')}<b>${escape(p.name)}</b></div>`,escape(p.registration),`<button data-edit="${escape(p.id)}">Edit</button>`]))}</section><section class="panel"><h2>Product details</h2>${form('product','<input type="hidden" name="id">' + field('Product name','name') + select('Registration authority','agency',options(['NAFDAC','SON'])) + field('Registration number','registration') + field('Pack size','size','') + field('Ingredients','ingredients','') + field('Allergens','allergens','') + field('Storage instructions','storage',''),'Save product')}</section></div>`
  if (page === 'Batches') return heading('PACK TRACEABILITY','Batches and serials','Create pack serials or enter existing codes for a batch.') + `<div class="split manage-grid"><section class="panel"><h2>Batch register</h2>${table(['Batch','Product','Packs','Expiry',''],batches.map(b=>[escape(b.lot),escape(productName(b.product)),b.codes.length,escape(b.expires),`<button data-download="${escape(b.codes[0])}">Export codes</button> <button data-labels="${escape(b.codes[0])}">QR labels</button> <button data-recall="${escape(b.codes[0])}">${b.recall ? 'Clear recall' : 'Mark recalled'}</button>`]))}</section><section class="panel"><h2>Add batch</h2>${products.length ? form('batch',select('Product','product',options(products,p=>p.name,p=>p.id)) + field('Lot number','lot') + field('Production date','made','required type="date"') + field('Expiry date','expires','required type="date"') + field('Number of new codes','count','type="number" min="1" max="100" value="5" required') + field('Existing codes (comma-separated, optional)','codes','maxlength="3000"'),'Create batch') : '<p>Add a product first.</p>'}</section></div>`
  return heading('MANUFACTURER WORKSPACE',escape(active.name),'Track your catalogue, pack checks and suspicious product reports.') + metrics([['Products',products.length],['Pack codes',batches.reduce((n,b)=>n+b.codes.length,0)],['Scans',scans.length],['Reports',reports.length]]) + `<div class="split">${activityChart(scans)}<section class="panel work-links"><h2>Manage your records</h2>${shortcut('Products','Manage catalogue')}${shortcut('Batches','Manage batches and QR labels')}${shortcut('Onboarding','Company onboarding')}</section></div><section class="panel"><h2>Scan activity by location</h2>${recent(scans)}</section><section class="panel"><h2>Report trends</h2>${table(['Product','State','LGA','Distinct reporters'],clusters({...data,reports}).map(g=>[escape(productName(g.product)),escape(g.state),escape(g.lga),g.people.size]))}</section><section class="panel"><h2>Reported pack identifiers</h2>${table(['Product','Batch','Pack serial','Area'],reports.filter(r=>r.code).map(r=>[escape(productName(r.product)),escape(r.batch || 'Unknown'),escape(r.code),escape(r.lga + ', ' + r.state)]))}</section>`
}

let agency = 'NAFDAC'
function oversight() {
  const isOperator = role === 'Operator'
  const groups = clusters(data).filter(g=>isOperator || (g.agency === agency && ['Referred','Confirmed'].includes(caseStatus(g))))
  if (page === 'Approvals') return heading('VERIFI OPERATIONS','Company approvals','Review sample evidence and approve or reject access.') + `<section class="panel approvals-panel"><h2>Application queue</h2>${table(['Company','Registration','Address and evidence','Status','Decision'],data.companies.map(c=>[escape(c.name),escape(c.registration),escape([c.address,c.reference].filter(Boolean).join(' · ')),`<span class="badge approval-${c.status.toLowerCase()}">${escape(c.status)}</span>`, c.status === 'Pending' ? `<button data-approve="${escape(c.id)}">Approve</button> <button data-reject="${escape(c.id)}">Reject</button>` : 'Reviewed']))}</section>`
  const scope = isOperator ? '' : select('Demo regulator','agency',options(['NAFDAC','SON']))
  if (page === 'Cases') return heading('MARKET SURVEILLANCE','Investigation cases','Review location clusters and keep suspected activity separate from confirmed cases.') + `<section class="panel cases-panel"><div class="case-toolbar"><h2>Case queue</h2><button data-action="export-cases">Export case summary</button></div>${scope}<div class="pair">${field('Filter by product or location','case-search','type="search"')}${field('Report date','case-date','type="date"')}</div><div id="cases">${groups.length ? groups.map((g,i)=>`<article data-case-row data-date="${g.date}"><div class="case-head"><div><small>${escape(g.agency || 'Unassigned')} · ${g.date}</small><h3>${escape(productName(g.product))}</h3><p>${escape(g.lga)}, ${escape(g.state)}</p></div><span class="badge">${escape(caseStatus(g))}</span></div><div class="case-counts"><div><strong>${g.people.size}</strong><span>Distinct reporters</span></div><div><strong>${g.reports.length}</strong><span>Reports</span></div></div><details><summary>View report evidence</summary>${g.reports.map(r=>`<p><b>${escape(reference(r))}</b> · ${escape(r.reason)}${r.code ? `<br>Serial: ${escape(r.code)} · Batch: ${escape(r.batch || 'Unknown')}` : ''}${r.signal ? `<br>Check result: ${escape(r.signal)}` : ''}${r.photo ? `<br><img class="evidence" alt="Sample report evidence" src="${escape(r.photo)}">` : ''}</p>`).join('')}</details><div class="actions">${isOperator ? `<button data-case="${i}" data-status="Under review">Review</button><button data-case="${i}" data-status="Referred">Refer to ${escape(g.agency || 'agency')}</button>` : ''}<button data-case="${i}" data-status="Confirmed">Mark confirmed</button></div></article>`).join('') : blank('Cases','No cases in this workspace','Referred investigations will appear here when available.')}</div></section>`
  const products = data.products.filter(p=>isOperator || p.agency===agency)
  const scans = data.scans.filter(s=>isOperator || products.some(p=>p.id===s.product))
  return heading('MARKET SURVEILLANCE',isOperator ? 'Verifi operations' : agency + ' overview','Monitor demo activity and investigate emerging product risks.') + (scope ? `<section class="panel">${scope}</section>` : '') + metrics([['Products',products.length],['Scans',scans.length],['Case groups',groups.length],['Confirmed cases',groups.filter(g=>caseStatus(g)==='Confirmed').length]]) + (isOperator ? metrics([['Demo shoppers',data.profiles?.length || 0],['Approved companies',data.companies.filter(c=>c.status==='Approved').length]]) : '') + `<div class="split">${activityChart(scans)}${caseChart(groups,caseStatus)}</div>` + `<section class="panel"><h2>Recent checks</h2>${recent(scans)}</section>`
}

function stopCamera() {
  stream?.getTracks().forEach(track=>track.stop())
  stream = null
}
function render() {
  stopCamera()
  document.querySelector('#crumb').innerHTML = `<span>${role}</span><span aria-hidden="true">/</span><strong>${page}</strong>`
  const home = document.querySelector('.home-link')
  if (page === 'Home') home.setAttribute('aria-current', 'page')
  else home.removeAttribute('aria-current')
  document.querySelector('#section-label').textContent = role.toUpperCase() + ' TOOLS'
  for (const button of workspaceNav.querySelectorAll('[data-role]')) {
    if (button.dataset.role === role) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  }
  nav.innerHTML = pages[role].map(p=>`<button data-page="${p}" ${page===p?'aria-current="page"':''}>${icon(p)}<span>${p}</span></button>`).join('')
  document.body.dataset.home = String(page === 'Home')
  view.dataset.page = page.toLowerCase()
  view.dataset.role = role.toLowerCase()
  view.innerHTML = role==='Consumer' ? consumer() : role==='Company' ? business() : oversight()
  if (role==='Consumer' && profile) view.insertAdjacentHTML('beforeend','<button class="signout" data-action="signout">End demo session</button>')
  if (view.querySelector('[name="company"]')) view.querySelector('[name="company"]').value=company()?.id
  if (view.querySelector('[name="agency"]') && ['Operator','Regulator'].includes(role)) view.querySelector('[name="agency"]').value=agency
  if (view.querySelector('#catalogue')) catalogue('')
}
function catalogue(query) {
  const filtered=data.products.filter(p=>(p.name+' '+p.registration).toLowerCase().includes(query.toLowerCase()))
  view.querySelector('#catalogue').innerHTML = filtered.length ? filtered.map(product => {
    const reviews = data.reviews.filter(review => review.product === product.id)
    return `<article class="catalogue-card"><div class="catalogue-art">${art(product.id)}</div><div class="catalogue-copy"><small>${escape(product.agency)} · ${escape(product.registration)}</small><h3>${escape(product.name)}</h3><p class="muted">${escape(product.size || 'Sample product')}</p><details><summary>Community feedback (${reviews.length})</summary>${reviews.map(review=>`<p><b>${escape(review.author)}</b> · ${escape(review.body)}</p>`).join('') || '<p>No community posts yet.</p>'}</details></div></article>`
  }).join('') : blank('Catalogue','No matching products','Try another product name or registration number.')
}
function runCheck(code,state='',lga='') {
  lastCode = code.trim().toUpperCase()
  const match=check(data,lastCode)
  const entry={ code:lastCode,state,lga,date:date(),author:profile,product:match.product?.id }
  data.scans.push(entry)
  result=check(data,lastCode)
  entry.title=result.title
  save()
  render()
}
function download(name, content) {
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv'}))
  Object.assign(document.createElement('a'),{href:url,download:name}).click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function camera() {
  if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) return notify('Camera scanning is unavailable in this browser. Enter the code manually.')
  if (openingCamera || stream) return
  const video=view.querySelector('#camera')
  openingCamera = true
  try {
    const detector=new BarcodeDetector()
    const cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}})
    if (!video.isConnected) { cameraStream.getTracks().forEach(t=>t.stop()); return }
    stream=cameraStream
    video.srcObject=stream
    video.hidden=false
    await video.play()
    const read=async()=>{
      if (stream!==cameraStream) return
      try {
        const [found]=await detector.detect(video)
        if (stream!==cameraStream) return
        if (found) {
          const fields=new FormData(view.querySelector('#scan'))
          runCheck(found.rawValue,fields.get('state').trim(),fields.get('lga').trim())
          return
        }
        setTimeout(read,250)
      } catch { stopCamera(); notify('Camera detection stopped. Enter the code manually.') }
    }
    read()
  } catch { stopCamera(); notify('Could not open the camera. Enter the code manually.') }
  finally { openingCamera = false }
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button')
  if (!button) return
  const d=button.dataset
  if (d.demoPack) {
    if (!profile) {
      profile = 'Walkthrough shopper'
      sessionStorage.setItem('verifi-profile', profile)
      data.profiles = [...new Set([...(data.profiles || []), profile])]
    }
    if (d.demoPack === 'VF-DEMO-002') addDemoEvidence(data)
    page = 'Scan'
    runCheck(d.demoPack, 'Lagos', 'Ikeja')
    window.scrollTo(0, 0)
    view.querySelector('.result-panel h2')?.scrollIntoView({block:'nearest'})
    return
  }
  if (d.role && d.role !== role) {
    role = d.role
    page = pages[role][0]
    render()
    window.scrollTo(0, 0)
    return
  }
  if (d.action === 'home') {
    role = 'Consumer'
    page = 'Home'
    render()
    window.scrollTo(0, 0)
    return
  }
  if (d.page) {
    page = d.page
    render()
    window.scrollTo(0, 0)
    if (!button.isConnected) {
      nav.querySelector('[aria-current="page"]')?.focus({preventScroll:true})
    }
    return
  }
  if (d.action==='sample') view.querySelector('[name="code"]').value='VF-DEMO-001'
  if (d.action==='camera') camera()
  if (d.action==='report') { const report=view.querySelector('#report'); report.hidden=false; report.scrollIntoView({block:'nearest'}); report.querySelector('input').focus() }
  if (d.action==='signout') { profile=''; result=undefined; lastCode=''; sessionStorage.removeItem('verifi-profile'); render() }
  if (d.edit) {
    const p=data.products.find(item=>item.id===d.edit)
    const editor=view.querySelector('#product')
    for (const [name,value] of Object.entries(p)) if (editor.elements.namedItem(name)) editor.elements.namedItem(name).value=value
    editor.elements.name.focus()
  }
  if (d.action==='export-cases') {
    const groups=clusters(data).filter(g=>role==='Operator' || (g.agency===agency && ['Referred','Confirmed'].includes(caseStatus(g))))
    const cell=value=>{
      const raw=String(value ?? '')
      const safe=/^[=+@\-\t\r]/.test(raw) ? "'"+raw : raw
      return '"'+safe.replaceAll('"','""')+'"'
    }
    const rows=groups.map(g=>[productName(g.product),g.agency,g.state,g.lga,g.date,g.people.size,g.reports.length,caseStatus(g)].map(cell).join(','))
    download('verifi-case-summary.csv',['Product,Agency,State,LGA,Report date,Distinct reporters,Reports,Status',...rows].join('\n'))
  }
  if (d.labels) {
    const batch=data.batches.find(b=>b.codes[0]===d.labels)
    const dialog=document.querySelector('#labels')
    dialog.innerHTML=`<h2 id="labels-title">Pack QR labels</h2>${select('Pack serial','label-code',options(batch.codes))}<img alt="QR code for selected pack"><div class="actions"><a download>Download SVG</a><form method="dialog"><button>Close</button></form></div>`
    const picker=dialog.querySelector('select')
    const update=()=>{
      const url='/qr?code='+encodeURIComponent(picker.value)
      dialog.querySelector('img').src=url
      Object.assign(dialog.querySelector('a'),{href:url,download:picker.value+'.svg'})
    }
    picker.addEventListener('change',update)
    update()
    dialog.showModal()
  }
  if (d.download || d.recall) {
    const batch=data.batches.find(b=>b.codes[0]===(d.download || d.recall))
    if (d.download) download('verifi-pack-codes.csv','serial\n'+batch.codes.join('\n'))
    if (d.recall) { batch.recall=!batch.recall; save(); render() }
  }
  if (d.approve || d.reject) {
    data.companies.find(c=>c.id===(d.approve || d.reject)).status=d.approve?'Approved':'Rejected'
    save(); render()
  }
  if (d.case!==undefined) {
    const group=clusters(data).filter(g=>role==='Operator' || (g.agency===agency && ['Referred','Confirmed'].includes(caseStatus(g))))[Number(d.case)]
    if (d.status==='Referred' && !group.agency) return notify('Identify the product and agency before referral.')
    data.cases[group.key]=d.status
    save(); render(); notify('Demo case updated.')
  }
})
view.addEventListener('change',event=>{
  if (event.target.name==='company') { sessionStorage.setItem('verifi-company',event.target.value); render() }
  if (event.target.name==='agency' && role==='Regulator') { agency=event.target.value; render() }
})
view.addEventListener('input',event=>{
  if (event.target.name==='search') catalogue(event.target.value)
  if (event.target.name.startsWith('case-')) {
    const query=view.querySelector('[name="case-search"]').value.toLowerCase()
    const day=view.querySelector('[name="case-date"]').value
    view.querySelectorAll('[data-case-row]').forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(query) || Boolean(day && row.dataset.date!==day)})
  }
})
view.addEventListener('submit',async event=>{
  event.preventDefault()
  const f=Object.fromEntries([...new FormData(event.target)].map(([k,v])=>[k,typeof v==='string'?v.trim():v]))
  switch (event.target.id) {
    case 'signin':
      if (page === 'Home') page = 'Scan'
      if (!f.name) return
      profile=f.name
      sessionStorage.setItem('verifi-profile',profile)
      data.profiles=[...new Set([...(data.profiles || []),profile])]
      break
    case 'scan':
      if (f.code) runCheck(f.code,f.state,f.lga)
      return
    case 'reply': {
      const post = data.reviews[Number(f.index)]
      if (!post || !f.body) return
      post.replies ??= []
      post.replies.push({body:f.body,author:profile})
      break
    }
    case 'review':
      if (!f.body) return
      data.reviews.push({...f,author:profile})
      break
    case 'report-form': {
      if (!f.state || !f.lga || !f.reason) return notify('Enter the state, LGA and report reason.')
      const product=result.product
      const author=profile
      const code=lastCode
      const batch=result.batch?.lot
      const signal=result.title
      let photo=''
      if (f.photo.size) {
        if (f.photo.size>250000 || !['image/jpeg','image/png','image/webp'].includes(f.photo.type)) return notify('Use a JPEG, PNG or WebP sample under 250 KB.')
        photo=await new Promise((resolve,reject)=>{const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(f.photo)}).catch(()=>null)
        if (!photo) return notify('Could not read the sample photo.')
      }
      const report={id:newId(),code,batch,signal,product:product?.id || code,agency:product?.agency,author,state:f.state,lga:f.lga,reason:f.reason,date:date(),photo}
      data.reports.push(report)
      try { save() } catch { data.reports.pop(); return notify('Browser storage is full. Try submitting without a photo.') }
      render()
      notify('Report saved. Reference ' + reference(report) + '. Track it in History.')
      return
    }
    case 'onboard': {
      if (!f.name || !f.registration || !f.address || !f.reference) return notify('Complete all sample company fields.')
      if (data.companies.some(c=>c.registration.toUpperCase()===f.registration.toUpperCase())) return notify('That company registration already exists.')
      const id=newId()
      data.companies.push({...f,id,status:'Pending'})
      sessionStorage.setItem('verifi-company',id)
      break
    }
    case 'product': {
      if (!f.name || !f.registration) return notify('Enter a product name and registration.')
      f.registration=f.registration.toUpperCase()
      if (data.products.some(p=>p.id!==f.id && p.registration===f.registration)) return notify('That registration is already in the catalogue.')
      const existing=companyProducts().find(p=>p.id===f.id)
      if (existing) Object.assign(existing,f)
      else data.products.push({...f,id:newId(),company:company().id})
      break
    }
    case 'batch': {
      if (!f.lot || f.expires<f.made) return notify('Enter a lot and an expiry on or after production.')
      if (data.batches.some(b=>b.product===f.product && b.lot.toUpperCase()===f.lot.toUpperCase())) return notify('That lot already exists for this product.')
      const codes=f.codes ? f.codes.split(',').map(code=>code.trim().toUpperCase()).filter(Boolean) : Array.from({length:Number(f.count)},()=> 'VF-'+newId().toUpperCase())
      if (!codes.length || codes.some(c=>!/^[-A-Z0-9_]{1,100}$/.test(c) || data.batches.some(b=>b.codes.includes(c))) || new Set(codes).size!==codes.length) return notify('Enter unique codes using letters, numbers, hyphens or underscores.')
      data.batches.push({product:f.product,lot:f.lot,made:f.made,expires:f.expires,codes,recall:false})
      break
    }
    default: return
  }
  save()
  render()
  notify('Saved in this browser.')
})
render()
