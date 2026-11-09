import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { runInNewContext } from 'node:vm'
import { openLive } from '../live.mjs'

test('operators and regulators can reach cases beyond the former 200-report limit', async t => {
  const folder = mkdtempSync(join(tmpdir(),'verifi-queue-'))
  const path = join(folder,'test.sqlite')
  const live = openLive(path)
  let db
  const server = createServer((req,res)=>live.handle(req,res,new URL(req.url,'http://localhost').pathname))
  t.after(async ()=>{
    await new Promise(resolve=>server.close(resolve))
    db?.close()
    live.close()
    rmSync(folder,{recursive:true,force:true})
  })
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const origin = 'http://127.0.0.1:'+server.address().port
  const password = 'fictional queue passphrase'
  for (const [name,role,scope] of [
    ['shopper','shopper',''],['maker','manufacturer','Example Foods'],['operator','operator',''],
    ['nafdac','regulator','NAFDAC'],['son','regulator','SON']
  ]) live.provision(name+'@example.test',password,role,scope)
  const call = async (route,cookie,body) => {
    const response = await fetch(origin+'/api/'+route,{
      method:body === undefined ? 'GET' : 'POST',
      headers:{origin,...(cookie ? {cookie} : {}),...(body === undefined ? {} : {'Content-Type':'application/json'})},
      body:body === undefined ? undefined : JSON.stringify(body)
    })
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const login = async name=>(await call('login',null,{email:name+'@example.test',password})).cookie
  const [shopper,maker,operator,nafdac,son] = await Promise.all(['shopper','maker','operator','nafdac','son'].map(login))
  const batch = await call('batches',maker,{product:'Rice',lot:'Q01',expires:'2099-01-01',count:1})
  assert.equal(batch.status,201)
  const [code] = batch.data.codes

  const reportId = number=>number.toString(16).padStart(32,'0')
  const first = reportId(1)
  const second = reportId(2)
  const sonReport = reportId(3)
  const newest = reportId(231)
  db = new DatabaseSync(path)
  const owner = db.prepare("SELECT id FROM account WHERE role='shopper'").get().id
  const insert = db.prepare('INSERT INTO report (id,shopper,code,area,reason,created,agency,stage) VALUES (?,?,?,?,?,?,?,?)')
  const seed = (id,day,agency,stage)=>insert.run(id,owner,code,'Ikeja','Fictional report evidence','2026-11-'+day+'T00:00:00.000Z',agency,stage)
  db.exec('BEGIN')
  seed(first,'01',null,'submitted')
  seed(second,'01','NAFDAC','referred')
  seed(sonReport,'02','SON','referred')
  for (let i=4;i<=230;i++) seed(reportId(i),'02','NAFDAC','acknowledged')
  db.exec('COMMIT')

  const queue = (cookie,before)=>call('report-queue'+(before ? '?before='+before : ''),cookie)
  assert.equal((await queue()).status,401)
  assert.equal((await queue(shopper)).status,403)
  assert.equal((await queue(maker)).status,403)
  assert.equal((await queue(operator,'broken')).status,400)
  const missingCursor = await queue(nafdac,reportId(999))
  assert.equal(missingCursor.status,404)
  assert.deepEqual(await queue(nafdac,sonReport),missingCursor)
  assert.deepEqual(await queue(nafdac,first),missingCursor)
  assert.equal((await queue(son)).data.reports[0].id,sonReport)
  assert.deepEqual((await queue(son,sonReport)).data,{reports:[],next:null})

  const legacy = (await call('reports',operator)).data
  assert.equal(legacy.length,200)
  assert.equal(legacy.some(report=>report.id===first),false)
  const operatorPage = (await queue(operator)).data
  assert.equal(operatorPage.reports.length,25)
  assert.equal(operatorPage.reports[0].product,'Rice')
  assert.equal(operatorPage.reports[0].lot,'Q01')
  assert.equal(operatorPage.reports[0].reason,'Fictional report evidence')
  assert.equal(Object.hasOwn(operatorPage.reports[0],'shopper'),false)
  assert.equal(operatorPage.next,operatorPage.reports.at(-1).id)

  const collect = async (cookie,page) => {
    const ids = []
    while (true) {
      ids.push(...page.reports.map(report=>report.id))
      assert.ok(ids.length<=230,'cursor advances without repeating a page')
      if (page.next === null) return ids
      const response = await queue(cookie,page.next)
      assert.equal(response.status,200)
      page = response.data
    }
  }
  seed(newest,'03',null,'submitted')
  assert.equal((await queue(operator)).data.reports[0].id,newest)
  const descending = Array.from({length:227},(_,index)=>reportId(230-index))
  assert.deepEqual(await collect(operator,operatorPage),[...descending,sonReport,second,first])
  assert.deepEqual(await collect(nafdac,(await queue(nafdac)).data),[...descending,second])

  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM audit').get().total,0)
  assert.equal((await call('report-action',operator,{id:first,action:'refer',agency:'SON'})).status,200)
  assert.equal((await call('report-action',son,{id:second,action:'acknowledge'})).status,409)
  assert.equal((await call('report-action',nafdac,{id:second,action:'acknowledge'})).status,200)
  assert.equal((await queue(nafdac,reportId(4))).data.reports[0].stage,'acknowledged')
  assert.equal((await queue(son,sonReport)).data.reports[0].id,first)
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM audit').get().total,2)
})

test('the operator can retry paging, act on an older case and return to the newest page', async () => {
  const handlers = {}
  const requests = []
  const focused = []
  const message = {textContent:''}
  const main = {
    innerHTML:'',
    addEventListener:(name,fn)=>{ handlers[name]=fn },
    querySelector:selector=>selector==='#report-queue-heading' ? {focus:()=>focused.push(selector)} : null
  }
  const first = {id:'new-case',code:'NEW',created:'2026-11-02',stage:'submitted'}
  const old = {id:'old-case',code:'OLD',created:'2026-11-01',stage:'submitted'}
  const cursor = 'abcd'.repeat(8)
  let failOnce = true
  const fetch = async (url,options) => {
    requests.push(url)
    const ok = json=>({ok:true,json:async()=>json})
    if (url==='/api/session') return ok({account:{role:'operator',scope:''}})
    if (url==='/api/company-applications') return ok([])
    if (url==='/api/report-queue') return ok({reports:[first],next:cursor})
    if (url==='/api/report-queue?before='+cursor) {
      if (failOnce) {failOnce=false; throw Error('Temporary queue outage')}
      return ok({reports:[old],next:null})
    }
    if (url==='/api/report-action') {
      assert.deepEqual(JSON.parse(options.body),{id:old.id,agency:'NAFDAC',action:'refer'})
      old.stage = 'referred'
      return ok({})
    }
    throw Error('Unexpected route '+url)
  }
  const context = {
    document:{querySelector:selector=>selector==='#live'?main:message},window:{addEventListener(){}},fetch,
    FormData:class {constructor(form){return Object.entries(form.values)}}
  }
  await runInNewContext('(async()=>{'+readFileSync(new URL('../dist/live.js',import.meta.url),'utf8')+'})()',context)
  const submit = (action,values,button={disabled:false})=>handlers.submit({
    preventDefault(){},target:{dataset:{form:action},values},submitter:button
  })
  assert.match(main.innerHTML,/new-case/)
  assert.match(main.innerHTML,/Show older reports/)
  const button = {disabled:false}
  await submit('report-page',{before:cursor},button)
  assert.equal(button.disabled,false)
  assert.equal(message.textContent,'Temporary queue outage')
  assert.match(main.innerHTML,/new-case/)
  assert.deepEqual(focused,[])
  await submit('report-page',{before:cursor})
  assert.match(main.innerHTML,/old-case/)
  assert.match(main.innerHTML,/Show newest reports/)
  assert.doesNotMatch(main.innerHTML,/Show older reports/)
  assert.deepEqual(focused,['#report-queue-heading'])
  await submit('refer',{id:old.id,agency:'NAFDAC'})
  assert.match(main.innerHTML,/old-case/)
  assert.match(main.innerHTML,/class="badge">referred/)
  assert.equal(requests.filter(url=>url.includes('?before=')).length,3)
  await submit('report-page',{})
  assert.match(main.innerHTML,/new-case/)
  assert.deepEqual(focused,['#report-queue-heading','#report-queue-heading'])
})
