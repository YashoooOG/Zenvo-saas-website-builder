import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHost, resolveHost, rootDomain, policyPath, isAppOnlyPath, isInternalPath, sharedAsset } from '../src/lib/tenant-routing.ts';

test('host parsing accepts DNS case, trailing dot, and valid ports', () => {
  assert.equal(parseHost('ACME.Zenvo.test.:3108'), 'acme.zenvo.test');
  assert.equal(parseHost('[::1]:3000'), '[::1]');
  for (const value of [null, '', ' localhost', 'host:0', 'host:65536', 'host:abc', 'user@host', 'host/path', 'host,evil', 'host\\evil', 'host%2eevil', '-bad.test', 'bad-.test', 'bad..test', 'https://host']) {
    assert.equal(parseHost(value), null, String(value));
  }
});

test('only configured root and explicit local loopbacks resolve to app', () => {
  for (const value of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) assert.deepEqual(resolveHost(value, 'localhost'), { kind: 'app' });
  assert.deepEqual(resolveHost('zenvo.test', 'zenvo.test'), { kind: 'app' });
  assert.deepEqual(resolveHost('localhost', 'zenvo.test'), { kind: 'unknown' });
});

test('one valid subdomain resolves without trusting suffix lookalikes', () => {
  assert.deepEqual(resolveHost('acme.zenvo.test:443', 'zenvo.test'), { kind: 'tenant', subdomain: 'acme' });
  for (const host of ['evilzenvo.test', 'zenvo.test.evil', 'a.b.zenvo.test', 'client.example.com', 'www.zenvo.test', 'api.zenvo.test', 'admin.zenvo.test', 'auth.zenvo.test', 'app.zenvo.test']) {
    assert.deepEqual(resolveHost(host, 'zenvo.test'), { kind: 'unknown' }, host);
  }
});

test('invalid root configuration fails closed', () => {
  for (const root of ['', 'https://zenvo.test', 'zenvo.test:443', 'zenvo.test/path', '127.0.0.1']) assert.throws(() => rootDomain(root));
  assert.equal(rootDomain('Zenvo.test'), 'zenvo.test');
});

test('encoded paths cannot bypass app and internal boundaries', () => {
  for (const path of ['/agency', '/agency/a', '/api/session', '/sign-in', '/subaccount/a', '/%61pi/session', '/tenant-site/acme']) assert.ok(isAppOnlyPath(policyPath(path)));
  for (const path of ['/%ZZ', '/%2561pi', '/a%5cb', '/a%00b', '//api']) assert.equal(policyPath(path), null);
  assert.ok(isInternalPath('/tenant-site/acme'));
  assert.equal(isAppOnlyPath('/agency-news'), false);
  assert.equal(sharedAsset('/api/export.csv'), false);
  assert.equal(sharedAsset('/_next/static/chunk.js'), true);
});
