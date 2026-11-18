import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import makeFetchCookie from 'fetch-cookie';

const base = new URL(process.env.AUTH_TEST_BASE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('Authentication smoke tests only target a local development server.');
}
// Development instances bootstrap an anonymous browser through Clerk before
// serving document requests. Keep its cookies, just as a real browser does.
const browserFetch = makeFetchCookie(fetch);
before(async () => {
  const response = await browserFetch(new URL('/', base), {
    headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, 'Anonymous Clerk browser bootstrap failed');
  await response.arrayBuffer();
});
const request = (path, headers = {}) => browserFetch(new URL(path, base), {
  headers, redirect: 'manual', signal: AbortSignal.timeout(20000),
});

test('Connect callback rejects anonymous requests without forwarding authorization codes', async () => {
  const response = await request('/api/stripe-connect/callback?state=fixture&code=ac_fixture');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(!(await response.text()).includes('ac_fixture'));
});

test('Stripe webhook rejects unsigned requests without a sign-in redirect', async () => {
  const response = await browserFetch(new URL('/api/stripe-webhook', base), {
    method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(20000),
  });
  assert.ok([400, 503].includes(response.status));
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('location'), null);
});

test('public home and authentication pages remain accessible', async () => {
  for (const path of ['/', '/sign-in', '/sign-up']) {
    const response = await request(path, { Accept: 'text/html' });
    assert.equal(response.status, 200, `${path} must be public`);
    assert.ok((await response.text()).includes('Zenvo'));
  }
});

test('signed-out document requests redirect to sign-in with a return URL', async () => {
  for (const path of ['/agency', '/agency/nonexistent/billing', '/agency/nonexistent/payments', '/agency/nonexistent/clients', '/agency/nonexistent/clients/nonexistent/access', '/subaccount', '/subaccount/nonexistent', '/subaccount/nonexistent/media', '/subaccount/nonexistent/pipelines', '/subaccount/nonexistent/pipelines/nonexistent', '/subaccount/invitations/invalid']) {
  const response = await request(path, { Accept: 'text/html' });
  assert.ok([302, 303, 307].includes(response.status));
  const location = new URL(response.headers.get('location'), base);
  assert.equal(location.pathname, '/sign-in');
  assert.equal(new URL(location.searchParams.get('redirect_url')).pathname, path);
  }
});

test('session API rejects signed-out requests and disables caching', async () => {
  const response = await request('/api/session');
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('forged bearer tokens cannot access the session API', async () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const forged = `${encode({ alg: 'none' })}.${encode({ sub: 'user_forged', exp: 9999999999 })}.invalid`;
  const response = await request('/api/session', { Authorization: `Bearer ${forged}` });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('client-supplied auth headers cannot impersonate a user', async () => {
  const response = await request('/api/session', {
    'x-clerk-auth-status': 'signed-in', 'x-clerk-auth-user-id': 'user_forged',
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('logo mutations reject anonymous requests before reading uploads or changing storage', async () => {
  for (const method of ['POST', 'DELETE']) {
    const response = await browserFetch(new URL('/api/agency/nonexistent/logo?version=0', base), {
      method, headers: { Origin: base.origin }, redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('media mutations reject anonymous requests before reading uploads or deleting files', async () => {
  for (const method of ['POST', 'DELETE']) {
    const response = await browserFetch(new URL('/api/subaccount/nonexistent/media?id=nonexistent', base), {
      method, headers: { Origin: base.origin }, redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});
