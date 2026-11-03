import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';

const databasePath = process.env.VERIFI_DB ?? '.verifi/verifi.sqlite';
if (!process.env.VERIFI_DB) mkdirSync('.verifi', { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, maker TEXT NOT NULL, barcode TEXT UNIQUE);
  CREATE TABLE IF NOT EXISTS registry (agency TEXT NOT NULL, number TEXT NOT NULL, product INTEGER REFERENCES products(id), status TEXT NOT NULL, source TEXT NOT NULL, checked TEXT NOT NULL, PRIMARY KEY(agency, number));
  CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, product INTEGER NOT NULL REFERENCES products(id), scans INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, product TEXT NOT NULL, detail TEXT NOT NULL, location TEXT, state TEXT NOT NULL DEFAULT 'Received', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, product INTEGER NOT NULL REFERENCES products(id), rating INTEGER NOT NULL, detail TEXT NOT NULL);
  INSERT OR IGNORE INTO products VALUES (1, 'Coastline Pineapple Juice', 'Coastline Foods', '6150000000018'), (2, 'Northbank Oat Biscuits', 'Northbank Foods', '6150000000025');
  INSERT OR IGNORE INTO registry VALUES ('NAFDAC', 'DEMO-1204', 1, 'Listed', 'Sample dataset', '2026-10-01'), ('SON', 'DEMO-2306', 2, 'Expired', 'Sample dataset', '2026-10-01');
  INSERT OR IGNORE INTO codes(code, product) VALUES ('VF-DEMO-001', 1);
`);
const sessions = new Map();
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const lookup = db.prepare('SELECT * FROM registry WHERE product = ? ORDER BY agency');
const products = db.prepare('SELECT * FROM products ORDER BY id');
const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']],
  ['/app.js', ['app.bundle.js', 'text/javascript']], ['/icon.svg', ['icon.svg', 'image/svg+xml']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');
  return body;
}

function roleOf(req) {
  const key = req.headers.cookie?.match(/(?:^|; )verifi=([a-f0-9]{64})(?:;|$)/)?.[1];
  const session = sessions.get(key);
  return session?.expires > Date.now() ? session.role : null;
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  if (req.method === 'GET' && assets.has(path)) {
    const [file, type] = assets.get(path);
    res.writeHead(200, { 'Content-Type': type });
    return res.end(readFileSync(new URL('./public/' + file, import.meta.url)));
  }
  const role = roleOf(req);
  try {
    if (req.method === 'GET' && path === '/api/session') return send(res, 200, { role });
    if (req.method === 'GET' && path === '/api/products') {
      return send(res, 200, products.all().map(product => ({
        ...product,
        registry: lookup.all(product.id),
        reviews: db.prepare('SELECT rating, detail FROM reviews WHERE product = ? ORDER BY id DESC LIMIT 50').all(product.id),
      })));
    }
    if (req.method === 'GET' && path === '/api/code-image' && role === 'business') {
      const code = url.searchParams.get('code') ?? '';
      if (!db.prepare('SELECT code FROM codes WHERE code = ?').get(code)) return send(res, 404, { error: 'Code not found.' });
      const image = await QRCode.toBuffer(code, { width: 384, margin: 4, errorCorrectionLevel: 'M' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return res.end(image);
    }
    if (req.method === 'GET' && path === '/api/report-export' && role === 'admin') {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(url.searchParams.get('id')));
      if (!report) return send(res, 404, { error: 'Report not found.' });
      return send(res, 200, report, { 'Content-Disposition': 'attachment; filename="verifi-report-' + report.id + '.json"' });
    }
    if (req.method === 'GET' && path === '/api/workspace' && role) {
      const reports = role === 'admin' ? db.prepare('SELECT * FROM reports ORDER BY id DESC').all() : [];
      const codes = db.prepare('SELECT codes.*, products.name FROM codes JOIN products ON products.id = codes.product ORDER BY code').all();
      return send(res, 200, { reports, codes, products: products.all() });
    }
    if (req.method !== 'POST' || !path.startsWith('/api/')) return send(res, 404, { error: 'Page not found.' });
    if (!req.headers['content-type']?.startsWith('application/json') || req.headers['sec-fetch-site'] === 'cross-site') {
      return send(res, 415, { error: 'Use a same-origin JSON request.' });
    }
    const body = await readBody(req);
    if (path === '/api/session') {
      const nextRole = body.role === 'admin' ? 'admin' : body.role === 'business' ? 'business' : null;
      const expected = nextRole && process.env['VERIFI_' + nextRole.toUpperCase() + '_KEY'];
      const supplied = Buffer.from(text(body.key, 256));
      if (!expected || supplied.length !== Buffer.byteLength(expected) || !timingSafeEqual(supplied, Buffer.from(expected))) {
        return send(res, 401, { error: 'Workspace access is unavailable or the key is incorrect.' });
      }
      for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
      const key = randomBytes(32).toString('hex');
      sessions.set(key, { role: nextRole, expires: Date.now() + 3_600_000 });
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      return send(res, 200, { role: nextRole }, { 'Set-Cookie': 'verifi=' + key + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600' + secure });
    }
    if (path === '/api/signout') {
      const key = req.headers.cookie?.match(/(?:^|; )verifi=([a-f0-9]{64})(?:;|$)/)?.[1];
      sessions.delete(key);
      return send(res, 200, { role: null }, { 'Set-Cookie': 'verifi=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }
    if (path === '/api/check') {
      const value = text(body.value, 160);
      if (!value) return send(res, 400, { error: 'Enter a product name or code.' });
      const key = value.toUpperCase();
      const code = db.prepare('UPDATE codes SET scans = scans + 1 WHERE code = ? RETURNING *').get(key);
      const matches = db.prepare('SELECT * FROM products WHERE barcode = ? OR instr(lower(name), lower(?)) > 0 OR id IN (SELECT product FROM registry WHERE number = ?) OR id = ? ORDER BY name LIMIT 25').all(value, value, key, code?.product ?? -1);
      return send(res, 200, { value, item: code ? code.scans === 1 ? 'Serial recognised' : 'Serial scanned before' : 'Unable to verify', matches: matches.map(product => ({ ...product, registry: lookup.all(product.id) })) });
    }
    if (path === '/api/reports') {
      const product = text(body.product, 160);
      const detail = text(body.detail, 2000);
      if (!product || !detail) return send(res, 400, { error: 'Enter a product and describe the concern.' });
      const location = body.location;
      const coordinates = Array.isArray(location) && location.length === 2 && location.every(Number.isFinite) &&
        Math.abs(location[0]) <= 90 && Math.abs(location[1]) <= 180 ? location.join(', ') : null;
      const result = db.prepare('INSERT INTO reports(product, detail, location) VALUES (?, ?, ?)').run(product, detail, coordinates);
      return send(res, 201, { id: result.lastInsertRowid });
    }
    if (path === '/api/reviews') {
      const detail = text(body.detail, 600);
      if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || !detail ||
          !db.prepare('SELECT id FROM products WHERE id = ?').get(Number(body.product))) {
        return send(res, 400, { error: 'Choose a product, rating and comment.' });
      }
      db.prepare('INSERT INTO reviews(product, rating, detail) VALUES (?, ?, ?)').run(Number(body.product), body.rating, detail);
      return send(res, 201, { saved: true });
    }
    if (path === '/api/products' && role === 'business') {
      const name = text(body.name, 160);
      const maker = text(body.maker, 160);
      const barcode = text(body.barcode, 40);
      if (!name || !maker || (barcode && !/^\d{8,14}$/.test(barcode))) return send(res, 400, { error: 'Enter a name, maker and optional numeric barcode.' });
      if (barcode && db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode)) return send(res, 409, { error: 'That barcode is already in use.' });
      db.prepare('INSERT INTO products(name, maker, barcode) VALUES (?, ?, ?)').run(name, maker, barcode || null);
      return send(res, 201, { saved: true });
    }
    if (path === '/api/codes' && role === 'business') {
      if (!db.prepare('SELECT id FROM products WHERE id = ?').get(Number(body.product))) return send(res, 400, { error: 'Choose a product.' });
      const code = 'VF-' + randomBytes(12).toString('hex').toUpperCase();
      db.prepare('INSERT INTO codes(code, product) VALUES (?, ?)').run(code, Number(body.product));
      return send(res, 201, { code });
    }
    if (path === '/api/registry' && role === 'admin') {
      if (!Array.isArray(body.records) || !body.records.length || body.records.length > 100) return send(res, 400, { error: 'Supply between 1 and 100 registry records.' });
      const records = body.records.map(record => {
        if (!record || typeof record !== 'object') throw new Error('Invalid registry record.');
        const agency = text(record.agency, 16).toUpperCase();
        const number = text(record.number, 100).toUpperCase();
        const product = Number(record.product);
        const status = text(record.status, 24);
        const source = text(record.source, 240);
        const checked = text(record.checked, 10);
        if (!['NAFDAC', 'SON'].includes(agency) || !number || !source || !['Listed', 'Expired', 'Suspended', 'Unknown'].includes(status) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(checked) || Number.isNaN(Date.parse(checked)) || new Date(checked).toISOString().slice(0, 10) !== checked ||
            !db.prepare('SELECT id FROM products WHERE id = ?').get(product)) throw new Error('A registry record is invalid.');
        return [agency, number, product, status, source, checked];
      });
      const insert = db.prepare('INSERT INTO registry VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(agency, number) DO UPDATE SET product=excluded.product, status=excluded.status, source=excluded.source, checked=excluded.checked');
      db.exec('BEGIN');
      try {
        for (const record of records) insert.run(...record);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return send(res, 200, { imported: records.length });
    }
    if (path === '/api/report-state' && role === 'admin') {
      const state = text(body.state, 32);
      if (!['Received', 'Under review', 'Ready for referral', 'Closed'].includes(state)) return send(res, 400, { error: 'Choose a valid report status.' });
      const result = db.prepare('UPDATE reports SET state = ? WHERE id = ?').run(state, Number(body.id));
      return send(res, result.changes ? 200 : 404, result.changes ? { saved: true } : { error: 'Report not found.' });
    }
    return send(res, 403, { error: 'You do not have access to this action.' });
  } catch (error) {
    if (error instanceof SyntaxError || ['Invalid request.', 'Request too large.', 'Invalid registry record.', 'A registry record is invalid.'].includes(error.message)) {
      return send(res, 400, { error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message });
    }
    console.error(error);
    return send(res, 500, { error: 'Verifi could not complete this request.' });
  }
});
if (process.env.NODE_ENV !== 'test') server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () => console.log('Verifi is running.'));
