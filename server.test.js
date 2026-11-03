import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';

process.env.NODE_ENV = 'test';
process.env.VERIFI_DB = ':memory:';
process.env.VERIFI_ADMIN_KEY = 'integration-test-admin';
process.env.VERIFI_BUSINESS_KEY = 'integration-test-business';
const { server } = await import('./server.js');

test('public checks, QR issuance, registry imports and restricted reports', async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function request(path, body, cookie) {
    return fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  }
  async function signIn(role) {
    const response = await request('/api/session', { role, key: 'integration-test-' + role });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  try {
    assert.match(await (await request('/')).text(), /Check a product/);
    assert.equal((await request('/app.js')).status, 200);
    const lookup = await (await request('/api/check', { value: 'demo-1204' })).json();
    assert.equal(lookup.item, 'Unable to verify');
    assert.equal(lookup.matches[0].registry[0].source, 'Sample dataset');
    const company = await signIn('business');
    const admin = await signIn('admin');
    assert.equal((await request('/api/products', { name: 'Pilot oats', maker: 'Pilot maker' }, company)).status, 201);
    const product = (await (await request('/api/products')).json()).find(item => item.name === 'Pilot oats');
    const { code } = await (await request('/api/codes', { product: product.id }, company)).json();
    assert.match(code, /^VF-[0-9A-F]{24}$/);
    assert.equal((await request('/api/code-image?code=' + code, undefined, company)).headers.get('content-type'), 'image/png');
    for (const status of ['Serial recognised', 'Serial scanned before']) {
      assert.equal((await (await request('/api/check', { value: code })).json()).item, status);
    }
    const records = [{ agency: 'SON', number: 'PILOT-42', product: product.id, status: 'Suspended', source: 'Test source', checked: '2026-10-01' }];
    assert.equal((await request('/api/registry', { records }, company)).status, 403);
    assert.equal((await request('/api/registry', { records }, admin)).status, 200);
    assert.equal((await (await request('/api/check', { value: 'PILOT-42' })).json()).matches[0].registry[0].status, 'Suspended');
    assert.equal((await request('/api/reviews', { product: product.id, rating: 4, detail: 'Test review' })).status, 201);
    const { id } = await (await request('/api/reports', { product: 'Pilot oats', detail: 'Broken seal', location: [6.5, 3.4] })).json();
    assert.equal((await request('/api/report-export?id=' + id, undefined, company)).status, 404);
    assert.equal((await (await request('/api/workspace', undefined, company)).json()).reports.length, 0);
    assert.equal((await request('/api/report-state', { id, state: 'Ready for referral' }, admin)).status, 200);
    const report = await (await request('/api/report-export?id=' + id, undefined, admin)).json();
    assert.equal(report.state, 'Ready for referral');
    assert.equal(report.location, '6.5, 3.4');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
