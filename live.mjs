import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const id = () => randomBytes(16).toString('hex')
const hash = value => createHash('sha256').update(value).digest('hex')
const days = 1000 * 60 * 60 * 24
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const email = value => {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(400, 'Enter a valid email.')
  return value.toLowerCase()
}
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, 'Check the required fields.')
  return value.trim()
}
const date = value => {
  const d = new Date(value)
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+d) || d.toISOString().slice(0,10) !== value) fail(400, 'Enter a valid date.')
  return value
}
const digest = (password, salt) => scryptSync(password, salt, 64)

export function openLive(path = process.env.VERIFI_DB || './data/verifi.sqlite') {
  if (path !== ':memory:') {
    path = resolve(path)
    mkdirSync(dirname(path), {recursive:true, mode:0o700})
  }
  const db = new DatabaseSync(path)
  if (path !== ':memory:' && process.platform !== 'win32') chmodSync(path, 0o600)
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('shopper','manufacturer','operator','regulator')), scope TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session (
      token TEXT PRIMARY KEY, account_id TEXT REFERENCES account(id) NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS disabled_account (
      account_id TEXT PRIMARY KEY REFERENCES account(id), disabled TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS batch (
      id TEXT PRIMARY KEY, issuer TEXT REFERENCES account(id) NOT NULL, product TEXT NOT NULL,
      lot TEXT NOT NULL, expires TEXT NOT NULL, UNIQUE(issuer,product,lot)
    );
    CREATE TABLE IF NOT EXISTS pack (
      code TEXT PRIMARY KEY, batch_id TEXT REFERENCES batch(id) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report (
      id TEXT PRIMARY KEY, shopper TEXT REFERENCES account(id) NOT NULL, code TEXT NOT NULL,
      area TEXT NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL,
      agency TEXT, stage TEXT NOT NULL DEFAULT 'submitted'
    );
    CREATE TABLE IF NOT EXISTS company_application (
      id TEXT PRIMARY KEY, company TEXT NOT NULL, registration TEXT NOT NULL COLLATE NOCASE,
      email TEXT NOT NULL, product TEXT NOT NULL, regulatory_reference TEXT NOT NULL,
      created TEXT NOT NULL, UNIQUE(registration, product COLLATE NOCASE)
    );
    CREATE TABLE IF NOT EXISTS public_counter (
      name TEXT PRIMARY KEY, total INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO public_counter VALUES ('checks', 0);
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, actor TEXT REFERENCES account(id) NOT NULL,
      report_id TEXT REFERENCES report(id) NOT NULL, action TEXT NOT NULL, created TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS report_shopper ON report(shopper,created);
    CREATE INDEX IF NOT EXISTS report_agency ON report(agency,created);
  `)
  const get = (sql, ...args) => db.prepare(sql).get(...args)
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const run = (sql, ...args) => db.prepare(sql).run(...args)
  const atomic = fn => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }

  function provision(address, password, role = 'shopper', scope = '') {
    address = email(address)
    if (!['shopper','manufacturer','operator','regulator'].includes(role)) fail(400, 'Unknown role.')
    if (role === 'regulator' && !['NAFDAC','SON'].includes(scope)) fail(400, 'Choose a supported agency.')
    if (role === 'manufacturer') scope = text(scope, 100)
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'Use a password of 12 to 128 characters.')
    const salt = id()
    const encrypted = digest(password, salt).toString('hex')
    try { run('INSERT INTO account VALUES (?,?,?,?,?,?)',id(),address,salt,encrypted,role,scope) }
    catch (error) { if (error.errcode === 2067) fail(409, 'Account could not be created.'); throw error }
  }

  function disableAccount(address) {
    address = email(address)
    return atomic(() => {
      const account = get('SELECT id FROM account WHERE email=?', address)
      if (!account) fail(404, 'Account not found.')
      // Preserve the original disable time and all business evidence on retries.
      run('INSERT OR IGNORE INTO disabled_account VALUES (?,?)', account.id, new Date().toISOString())
      run('DELETE FROM session WHERE account_id=?', account.id)
      return get('SELECT disabled FROM disabled_account WHERE account_id=?', account.id)
    })
  }

  const limits = new Map()
  const secure = process.env.VERIFI_SECURE_COOKIE === '1'
  const cookieName = secure ? '__Host-verifi' : 'verifi_session'
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`

  async function handle(req, res, pathname) {
    const send = (status, data, headers = {}) => res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}).end(JSON.stringify(data))
    try {
      const method = req.method
      if (!['GET','POST'].includes(method)) fail(405,'Method not supported.')
      let body = {}
      if (method === 'POST') {
        const localOrigin = 'http://' + req.headers.host
        const origin = process.env.VERIFI_ORIGIN || localOrigin
        if (req.headers.origin !== origin) fail(403,'Request origin rejected.')
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415,'Send JSON.')
        let raw = ''
        for await (const chunk of req.setEncoding('utf8')) {
          raw += chunk
          if (raw.length > 12000) fail(413,'Request too large.')
        }
        try { body = JSON.parse(raw) } catch { fail(400,'Invalid request.') }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400,'Invalid request.')
      }
      const token = (req.headers.cookie || '').split(';').map(pair=>pair.trim()).find(pair=>pair.startsWith(cookieName+'='))?.slice(cookieName.length+1)
      const actor = token && get('SELECT a.id,a.role,a.scope FROM session s JOIN account a ON a.id=s.account_id WHERE token=? AND expires>? AND NOT EXISTS (SELECT 1 FROM disabled_account d WHERE d.account_id=a.id)',hash(token),Date.now())
      const requireRole = (...roles) => {
        if (!actor) fail(401,'Sign in to continue.')
        if (roles.length && !roles.includes(actor.role)) fail(403,'Access denied.')
      }
      if (method === 'GET' && pathname === '/api/session') return send(200,{account:actor ? {role:actor.role,scope:actor.scope} : null})
      if (method === 'GET' && pathname === '/api/public-stats') return send(200,get(`
        SELECT (SELECT total FROM public_counter WHERE name='checks') AS checks,
          (SELECT COUNT(*) FROM account WHERE role='shopper') AS shoppers,
          (SELECT COUNT(*) FROM (SELECT DISTINCT issuer, product FROM batch)) AS products,
          (SELECT COUNT(DISTINCT scope COLLATE NOCASE) FROM account WHERE role='manufacturer') AS manufacturers,
          (SELECT COUNT(*) FROM pack) AS packs,
          (SELECT COUNT(*) FROM report) AS reports
      `))
      if (method === 'GET' && pathname === '/api/company-applications') {
        requireRole('operator')
        return send(200,all('SELECT * FROM company_application ORDER BY created DESC LIMIT 200'))
      }
      if (method === 'POST' && ['/api/register','/api/login','/api/company-applications'].includes(pathname)) {
        const ip = req.socket.remoteAddress
        const now = Date.now()
        for (const [key, value] of limits) if (value.until <= now) limits.delete(key)
        const limit = limits.get(ip) || {until:now + 60000,count:0}
        if (++limit.count > 10) fail(429,'Too many attempts. Try again in a minute.')
        limits.set(ip,limit)
        if (pathname === '/api/company-applications') {
          const reference = id()
          try {
            run('INSERT INTO company_application VALUES (?,?,?,?,?,?,?)',reference,text(body.company,100),
              text(body.registration,80),email(body.email),text(body.product,100),
              typeof body.regulatoryReference === 'string' && body.regulatoryReference.trim() ? text(body.regulatoryReference,120) : '',
              new Date().toISOString())
          } catch (error) {
            if (error.errcode === 2067) fail(409,'An application already exists for these details.')
            throw error
          }
          return send(201,{reference})
        }
        if (pathname === '/api/register') provision(body.email,body.password)
        const address = email(body.email)
        if (typeof body.password !== 'string' || body.password.length > 128) fail(401,'Sign-in failed.')
        const record = get('SELECT a.*, EXISTS (SELECT 1 FROM disabled_account d WHERE d.account_id=a.id) AS disabled FROM account a WHERE email=?',address)
        const candidate = digest(body.password,record?.salt || 'verifi-unknown-account')
        if (!record || record.disabled || !timingSafeEqual(candidate,Buffer.from(record.password,'hex'))) fail(401,'Sign-in failed.')
        const newToken = randomBytes(32).toString('hex')
        atomic(() => {
          run('DELETE FROM session WHERE expires<=?',Date.now())
          if (token) run('DELETE FROM session WHERE token=?',hash(token))
          run('INSERT INTO session VALUES (?,?,?)',hash(newToken),record.id,Date.now()+days)
        })
        return send(200,{role:record.role,scope:record.scope},{'Set-Cookie':cookie(newToken,86400)})
      }
      if (method === 'POST' && pathname === '/api/logout') {
        if (token) run('DELETE FROM session WHERE token=?',hash(token))
        return send(200,{}, {'Set-Cookie':cookie('',0)})
      }
      if (pathname === '/api/batches') {
        requireRole('manufacturer')
        if (method === 'GET') return send(200,all('SELECT b.*,p.code FROM batch b JOIN pack p ON b.id=p.batch_id WHERE issuer=? ORDER BY b.rowid DESC',actor.id))
        const batch = {id:id(), product:text(body.product,100),lot:text(body.lot,80),expires:date(body.expires)}
        if (!Number.isInteger(body.count) || body.count < 1 || body.count > 100) fail(400,'Issue between 1 and 100 codes per batch.')
        if (batch.expires < new Date().toISOString().slice(0,10)) fail(400,'Choose a current or future expiry date.')
        try {
          const codes = atomic(() => {
            run('INSERT INTO batch VALUES (?,?,?,?,?)',batch.id,actor.id,batch.product,batch.lot,batch.expires)
            return Array.from({length:body.count},()=>{
              const code = 'VF-' + id().toUpperCase()
              run('INSERT INTO pack VALUES (?,?)',code,batch.id)
              return code
            })
          })
          return send(201,{...batch,codes})
        } catch(error) { if(error.errcode === 2067) fail(409,'This product and lot already exist.'); throw error }
      }
      if (method === 'POST' && pathname === '/api/check') {
        requireRole('shopper')
        const code = text(body.code,100).toUpperCase()
        const record = get('SELECT b.product,b.lot,b.expires,a.scope AS manufacturer FROM pack p JOIN batch b ON b.id=p.batch_id JOIN account a ON a.id=b.issuer WHERE p.code=?',code)
        run("UPDATE public_counter SET total=total+1 WHERE name='checks'")
        if (!record) return send(200,{status:'unknown',code})
        return send(200,{...record,code,status:record.expires<new Date().toISOString().slice(0,10)?'expired':'matched'})
      }
      if (pathname === '/api/reports') {
        requireRole()
        const joined = 'SELECT r.id,r.code,r.area,r.reason,r.created,r.agency,r.stage,b.product,b.lot FROM report r LEFT JOIN pack p ON r.code=p.code LEFT JOIN batch b ON b.id=p.batch_id'
        if (method === 'GET') {
          if (actor.role === 'operator') return send(200,all(joined+' ORDER BY created DESC LIMIT 200'))
          const field = {shopper:'r.shopper',manufacturer:'b.issuer',regulator:'r.agency'}[actor.role]
          return send(200,all(joined+` WHERE ${field}=? ORDER BY created DESC LIMIT 200`,actor.role==='regulator'?actor.scope:actor.id))
        }
        requireRole('shopper')
        const report = {id:id(),code:text(body.code,100).toUpperCase(),area:text(body.area,120),reason:text(body.reason,1000),created:new Date().toISOString()}
        atomic(()=>{
          run('INSERT INTO report (id,shopper,code,area,reason,created) VALUES (?,?,?,?,?,?)',report.id,actor.id,report.code,report.area,report.reason,report.created)
          run('INSERT INTO audit VALUES (?,?,?,?,?)',id(),actor.id,report.id,'submitted',report.created)
        })
        return send(201,report)
      }
      if (method === 'POST' && pathname === '/api/report-action') {
        requireRole('operator','regulator')
        const report = text(body.id,32)
        atomic(()=>{
          const at = new Date().toISOString()
          if (actor.role==='operator' && body.action==='refer' && ['NAFDAC','SON'].includes(body.agency)) {
            if (!run("UPDATE report SET agency=?,stage='referred' WHERE id=? AND stage='submitted'",body.agency,report).changes) fail(409,'Report cannot be referred.')
          } else if (actor.role==='regulator' && body.action==='acknowledge') {
            if (!run("UPDATE report SET stage='acknowledged' WHERE id=? AND agency=? AND stage='referred'",report,actor.scope).changes) fail(409,'Report cannot be acknowledged.')
          } else fail(403,'Action unavailable.')
          run('INSERT INTO audit VALUES (?,?,?,?,?)',id(),actor.id,report,body.action,at)
        })
        return send(200,{})
      }
      return send(404,{error:'Not found.'})
    } catch(error) {
      if (!error.status) console.error('Verifi API error',error.code || error.name)
      if (!res.destroyed) send(error.status || 500,{error:error.status?error.message:'Request failed.'})
    }
  }

  return {handle,provision,disableAccount,close:()=>db.close()}
}
