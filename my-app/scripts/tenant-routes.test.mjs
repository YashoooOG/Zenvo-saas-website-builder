import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

const base = new URL(process.env.AUTH_TEST_BASE_URL || 'http://localhost:3000');
if (base.hostname !== 'localhost' || base.protocol !== 'http:') throw new Error('Routing tests only target an HTTP localhost server with default ZENVO_ROOT_DOMAIN.');
function request(host, path = '/', extra = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(path, base), { method, headers: { Host: host, ...extra } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(20000, () => req.destroy(new Error('HTTP test timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('tenant root and nested paths rewrite into unpublished-site handler', async () => {
  for (const path of ['/', '/offers/summer?source=test', '/catalog.json']) {
    const res = await request('acme.localhost', path);
    assert.equal(res.status, 404);
    assert.equal(res.body, 'Site not published');
    assert.match(res.headers['cache-control'], /no-store/);
    assert.equal(res.headers['set-cookie'], undefined);
  }
});

test('unknown, reserved, and nested hosts are rejected before authentication', async () => {
  for (const host of ['unknown.example', 'app.localhost', 'api.localhost', 'a.b.localhost', 'evillocalhost']) {
    const res = await request(host);
    assert.equal(res.status, 404);
    assert.equal(res.body, 'Site not found');
    assert.equal(res.headers.location, undefined);
  }
});

test('tenant hosts cannot reach workspace, auth, APIs, or internal routes', async () => {
  for (const path of ['/agency', '/subaccount/123', '/api/session', '/api/export.csv', '/sign-in', '/tenant-site/other', '/%61pi/session']) {
    const res = await request('acme.localhost', path);
    assert.equal(res.status, 404, path);
    assert.equal(res.body, 'Site not found', path);
  }
  assert.equal((await request('acme.localhost', '/', {}, 'POST')).status, 404);
});

test('internal route and forged tenant headers cannot select a tenant', async () => {
  const direct = await request('localhost', '/tenant-site/acme');
  assert.equal(direct.status, 404);
  assert.equal(direct.body, 'Site not found');
  const forged = await request('unknown.example', '/', { 'x-forwarded-host': 'localhost', 'x-tenant-id': 'acme' });
  assert.equal(forged.status, 404);
  assert.equal(forged.body, 'Site not found');
  const tenant = await request('acme.localhost', '/', { 'x-forwarded-host': 'localhost' });
  assert.equal(tenant.body, 'Site not published');
});
