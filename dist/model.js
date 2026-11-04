const today = () => new Date().toISOString().slice(0, 10)

export function seed() {
  return {
    companies: [
      { id: 'harvest', name: 'Northfield Foods', registration: 'DEMO-RC-001', status: 'Approved' },
      { id: 'pending', name: 'Riverbend Produce', registration: 'DEMO-RC-002', status: 'Pending', address: 'Ikeja, Lagos', reference: 'Demo evidence submitted' }
    ],
    products: [
      { id: 'rice', company: 'harvest', name: 'Northfield Parboiled Rice', agency: 'NAFDAC', registration: 'DEMO-NG-1001', size: '5 kg', ingredients: 'Parboiled long-grain rice', allergens: 'See the pack for facility information', storage: 'Store in a cool, dry place' },
      { id: 'kettle', company: 'external', name: 'Cedar Electric Kettle', agency: 'SON', registration: 'DEMO-SON-210', size: '1.7 L', ingredients: '', allergens: '', storage: 'Refer to the manufacturer’s guide' }
    ],
    batches: [
      { product: 'rice', lot: 'NF-2609', made: '2026-09-12', expires: '2030-09-12', codes: ['VF-DEMO-001', 'VF-DEMO-002'], recall: false },
      { product: 'rice', lot: 'NF-OLD', made: '2020-01-01', expires: '2022-01-01', codes: ['VF-DEMO-EXPIRED'], recall: false }
    ],
    scans: [2, 5, 3, 8, 4, 9, 6].flatMap((count, index) => {
      const day = new Date()
      day.setUTCDate(day.getUTCDate() - 6 + index)
      return Array.from({ length: count }, () => ({
        code: 'VF-DEMO-002', product: 'rice', author: 'Sample shopper',
        state: 'Lagos', lga: 'Ikeja', date: day.toISOString().slice(0, 10),
        title: 'Pack code matched'
      }))
    }),
    reviews: [{ product: 'rice', author: 'Ada', rating: '5', body: 'The grains held their shape well after cooking.', kind: 'Review' }],
    reports: ['Ada', 'Bola'].map(author => ({ id: author, product: 'rice', author, state: 'Lagos', lga: 'Ikeja', reason: 'Packaging looks unusual', date: today(), agency: 'NAFDAC' })),
    cases: {}
  }
}

export function addDemoEvidence(data) {
  if (!data.scans.some(scan => scan.id === 'demo-reused-serial')) {
    for (const [id, state, lga] of [['demo-reused-serial', 'Lagos', 'Ikeja'], ['demo-reused-serial-2', 'FCT', 'Abuja Municipal']]) {
      data.scans.push({ id, code: 'VF-DEMO-002', product: 'rice', author: 'Sample shopper', state, lga, date: today(), title: 'Sample scan history' })
    }
  }
  const day = today()
  if (data.reports.some(report => report.id === 'demo-a-' + day)) return
  for (const [suffix, author, reason] of [['a', 'Sample reporter A', 'Seal print differs from the sample label.'], ['b', 'Sample reporter B', 'The serial appears on a second pack.']]) {
    data.reports.push({id:'demo-' + suffix + '-' + day, code:'VF-DEMO-002', batch:'NF-2609', product:'rice', author, state:'Lagos', lga:'Ikeja', date:day, agency:'NAFDAC', reason})
  }
}

export function check(data, raw, date = today()) {
  const code = raw.trim().toUpperCase()
  const batch = data.batches.find(item => item.codes.includes(code))
  const product = batch ? data.products.find(item => item.id === batch.product) : data.products.find(item => item.registration === code)
  if (!product) return { title: 'Code not found', tone: 'amber', detail: 'Check the label and try again. You can report a suspicious pack.' }
  const base = { product, batch }
  if (!batch) return { ...base, title: 'Registration found', tone: 'amber', detail: 'A sample registration record matched. This does not verify the individual pack.' }
  if (batch.recall) return { ...base, title: 'Do not use', tone: 'red', detail: 'This batch is marked as recalled in the demo.' }
  if (batch.expires && batch.expires < date) return { ...base, title: 'Expiry date passed', tone: 'red', detail: 'The recorded expiry date for this pack has passed.' }
  const locations = new Set(data.scans.filter(scan => scan.code === code && scan.state && scan.lga).map(scan => scan.state + '/' + scan.lga))
  if (locations.size > 1) return { ...base, title: 'Unusual scan activity', tone: 'amber', detail: 'This serial appeared in ' + locations.size + ' local areas. Check the packaging and report it if something looks wrong.' }
  return { ...base, title: 'Pack code matched', tone: 'green', detail: 'The serial matches a manufacturer record in the demo catalogue.' }
}

export function clusters(data) {
  const groups = new Map()
  for (const report of data.reports) {
    const key = JSON.stringify([report.product, report.state.toLowerCase(), report.lga.toLowerCase(), report.date])
    if (!groups.has(key)) groups.set(key, { ...report, key, people: new Set(), reports: [] })
    const group = groups.get(key)
    group.people.add(report.author)
    group.reports.push(report)
  }
  return [...groups.values()].sort((a, b) => b.people.size - a.people.size)
}
