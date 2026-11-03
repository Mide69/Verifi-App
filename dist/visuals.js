export const launch = signedIn => `<section class="launch">
  <div class="launch-copy">
    <div class="eyebrow"><span></span> PRODUCT VERIFICATION · NIGERIA</div>
    <h1>Know what<br>you’re buying<span>.</span></h1>
    <p>Check the code on a pack, see what matches, and report anything that looks suspicious.</p>
    ${signedIn ? '<button class="launch-cta" data-page="Scan">Start a product check <span aria-hidden="true">↗</span></button>' : '<a class="launch-cta" href="#demo-access">Start a product check <span aria-hidden="true">↘</span></a>'}
  </div>
  <figure class="launch-photo">
    <img src="/shopper.webp" alt="A shopper holds a phone up to a code on a grocery pack">
    <figcaption><span class="photo-index">01</span><span><b>At the point of purchase</b><small>Scan a pack code or enter it manually</small></span></figcaption>
  </figure>
</section>
<div class="journey" aria-label="How Verifi works">
  <div><b>01</b><span><strong>Check the pack</strong><small>Use a serial or registration number.</small></span></div>
  <div><b>02</b><span><strong>Read the result</strong><small>See matches, expiry and recall notices.</small></span></div>
  <div><b>03</b><span><strong>Report a concern</strong><small>Help identify patterns in your area.</small></span></div>
</div>`

export function activityChart(scans) {
  const days = Array.from({length:7}, (_, index) => {
    const day = new Date()
    day.setUTCDate(day.getUTCDate() - 6 + index)
    const id = day.toISOString().slice(0,10)
    return { label: new Intl.DateTimeFormat('en-NG',{weekday:'short',timeZone:'UTC'}).format(day), count: scans.filter(scan=>scan.date===id).length }
  })
  const total = days.reduce((sum,day)=>sum+day.count,0)
  const max = Math.max(1, ...days.map(day=>day.count))
  return `<section class="panel chart"><div class="chart-head"><div><div class="eyebrow">WORKSPACE ANALYTICS</div><h2>Product checks</h2><p class="muted">Last seven days · this demo workspace</p></div><strong>${total}</strong></div><div class="chart-plot" aria-label="Daily product checks">${days.map(day=>`<div class="chart-column"><div class="chart-track"><div class="chart-bar" style="--height:${day.count/max*100}%"><span>${day.count}</span></div></div><small>${day.label}</small></div>`).join('')}</div></section>`
}

export function caseChart(groups, status) {
  const rows = ['New','Under review','Referred','Confirmed'].map(label=>[label,groups.filter(group=>status(group)===label).length])
  const max = Math.max(1,...rows.map(([,count])=>count))
  return `<section class="panel chart"><div class="eyebrow">CASE PIPELINE</div><h2>Investigation status</h2><p class="muted">Report clusters by current stage</p><div class="case-chart">${rows.map(([label,count])=>`<div><span>${label}</span><div class="case-track"><i style="--width:${count/max*100}%"></i></div><b>${count}</b></div>`).join('')}</div></section>`
}

const symbols = {
  Scan: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5m3-3h10',
  Catalogue: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
  Community: 'M20 11a7 7 0 0 1-7 7H5l2-3a7 7 0 1 1 13-4ZM9 11h.01m3 0h.01m3 0h.01',
  History: 'M4 11a8 8 0 1 1 2 6m-2-2v-4h4m4-3v4l3 2',
  Overview: 'M4 20h16M6 16v-4m6 4V5m6 11V8',
  Products: 'm4 7 8-4 8 4v10l-8 4-8-4zm0 0 8 4 8-4m-8 4v10',
  Batches: 'm3 7 9-4 9 4-9 4zm0 5 9 4 9-4M3 17l9 4 9-4',
  Onboarding: 'M5 21V3h14v18M8 7h2m4 0h2M8 11h2m4 0h2m-4 3v7',
  Cases: 'M8 5H4v15h16V5h-4m-8-2h8v5H8zm0 9h8m-8 4h5',
  Approvals: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zm-4 9 3 3 5-6'
}

export function icon(name) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[name] || symbols.Overview}"/></svg>`
}

export const shortcut = (page, label) => `<button class="shortcut" data-page="${page}">${icon(page)}<span>${label}</span><span aria-hidden="true">↗</span></button>`
export const blank = (name, title, copy) => `<div class="blank">${icon(name)}<strong>${title}</strong><p>${copy}</p></div>`
export const art = (id, size = '') => {
  const product = id === 'rice' ? '<path fill="#f2d8a3" d="M38 16h44l4 62-8 8H42l-8-8Z"/><path fill="#385a42" d="M37 36h46l2 28H35z"/><path stroke="#fff3d3" stroke-width="3" d="M49 46h22m-18 8h14"/>' : id === 'kettle' ? '<path fill="#507566" d="M41 37h39l9 37-7 9H38l-7-9 6-22-14-14 17 3Z"/><path fill="none" stroke="#38584e" stroke-width="6" d="M79 42h12q16 7 3 26l-6 3M47 34h27"/>' : '<path fill="#7e987b" d="m28 34 32-15 32 15v35L60 85 28 69Z"/><path fill="none" stroke="#eaf1dd" stroke-width="3" d="m28 34 32 15 32-15M60 49v36"/>'
  return `<svg class="product-art ${size}" viewBox="0 0 120 100" aria-hidden="true"><ellipse cx="60" cy="88" rx="40" ry="4" fill="#263c2820"/>${product}</svg>`
}
