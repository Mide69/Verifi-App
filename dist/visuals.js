export const launch = `<section class="launch">
  <div class="launch-copy">
    <div class="eyebrow"><span></span> PRODUCT VERIFICATION · NIGERIA</div>
    <h1>Know what<br>you’re buying<span>.</span></h1>
    <p>Check the code on a pack, see what matches, and report anything that looks suspicious.</p>
    <a class="launch-cta" href="#demo-access">Start a product check <span aria-hidden="true">↘</span></a>
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
