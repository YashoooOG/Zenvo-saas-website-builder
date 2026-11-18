import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { AgencyAccessError } from '../src/lib/agency-access';
import { beginConnectOAuth, completeConnectOAuth, parseConnectCallback, type ConnectOAuthProvider } from '../src/lib/connect-oauth';
import { handleConnectCallback } from '../src/lib/connect-callback';

const db = createDatabaseClient(process.env.DATABASE_URL);
const tag = randomUUID().replaceAll('-', '');
const owner = `oauth_${tag}`, admin = `${owner}_admin`, other = `${owner}_other`;
const accountIds: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115' };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const code = () => `ac_${randomUUID().replaceAll('-', '')}`;
before(async () => { await db.user.createMany({ data: [owner, admin, other].map(id => ({ id })) }); });
after(async () => {
  try { await db.agency.deleteMany({ where: { ownerId: { in: [owner, other] } } }); await db.user.deleteMany({ where: { id: { in: [owner, admin, other] } } }); }
  finally { await db.connectAccountSync.deleteMany({ where: { accountId: { in: accountIds } } }); await db.$disconnect(); }
});
const agency = async (ownerId = owner) => (await db.agency.create({ data: { name: 'OAuth fixture', ownerId } })).id;
async function begin(agencyId: string) { return new URL(await beginConnectOAuth(db, owner, agencyId, env)).searchParams.get('state')!; }
function provider() {
  const accountId = `acct_${randomUUID().replaceAll('-', '')}`;
  accountIds.push(accountId);
  const calls: string[] = [];
  const token = { stripe_user_id: accountId, livemode: false, scope: 'read_write', token_type: 'bearer', access_token: 'sensitive_access_token', refresh_token: 'sensitive_refresh_token' };
  const account = { id: accountId, type: 'standard', charges_enabled: false, payouts_enabled: false, details_submitted: false, requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null } };
  const service: ConnectOAuthProvider = { async exchange(value) { calls.push(value); return token; }, async account(id) { assert.equal(id, accountId); return account; } };
  return { service, calls, token, account, accountId };
}
const complete = (state: string, value: string, service: ConnectOAuthProvider, actor = owner) => completeConnectOAuth(db, actor, { state, code: value }, env, service);

test('start binds hashed random state to owner/agency and uses the fixed callback and explicit scope', async () => {
  const id = await agency(); const url = new URL(await beginConnectOAuth(db, owner, id, env)); const state = url.searchParams.get('state')!;
  assert.equal(url.origin, 'https://connect.stripe.com'); assert.equal(url.searchParams.get('scope'), 'read_write');
  assert.equal(url.searchParams.get('redirect_uri'), `${env.ZENVO_APP_URL}/api/stripe-connect/callback`);
  const row = await db.connectOAuthAttempt.findUniqueOrThrow({ where: { stateHash: digest(state) } });
  assert.equal(row.agencyId, id); assert.equal(row.ownerId, owner); assert.equal(row.status, 'PENDING');
  assert.equal(JSON.stringify(row).includes(state), false);
});
test('admins and unrelated users cannot start authorization, including for a foreign agency', async () => {
  const id = await agency(); await db.agencyMembership.create({ data: { agencyId: id, userId: admin, role: 'ADMIN' } });
  for (const actor of [admin, other, 'missing']) await assert.rejects(beginConnectOAuth(db, actor, id, env), AgencyAccessError);
  await assert.rejects(beginConnectOAuth(db, owner, await agency(other), env), AgencyAccessError);
});
test('callback parser rejects ambiguous, missing and malformed state/code/error values', () => {
  const state = 'a'.repeat(43); const base = `${env.ZENVO_APP_URL}/api/stripe-connect/callback`;
  for (const query of ['', 'state=bad&code=ac_one', `state=${state}&code=ac_one&code=ac_two`, `state=${state}&code=ac_one&error=access_denied`, `state=${state}&error=bad_error`, `state=${state}&code=`, `state=${state}&state=${state}&code=ac_one`]) assert.throws(() => parseConnectCallback(new URL(`${base}?${query}`)));
});
test('new pending authorization supersedes the old state and wrong owners cannot consume state', async () => {
  const id = await agency(); const first = await begin(id); const second = await begin(id); const p = provider();
  await assert.rejects(complete(first, code(), p.service)); await assert.rejects(complete(second, code(), p.service, other));
  assert.equal(p.calls.length, 0);
});
test('denial consumes state without exchanging a code and expiry prevents exchange', async () => {
  const id = await agency(); const state = await begin(id); const p = provider();
  assert.equal((await completeConnectOAuth(db, owner, { state, error: 'access_denied' }, env, p.service)).outcome, 'denied');
  await assert.rejects(complete(state, code(), p.service));
  const expired = await begin(id); await db.connectOAuthAttempt.update({ where: { stateHash: digest(expired) }, data: { expiresAt: new Date(0) } });
  await assert.rejects(complete(expired, code(), p.service)); assert.equal(p.calls.length, 0);
});
test('successful exchange links only the returned Standard test account and stores no tokens', async () => {
  const id = await agency(); const state = await begin(id); const value = code(); const p = provider();
  assert.equal((await complete(state, value, p.service)).outcome, 'linked');
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id } })).stripeConnectAccountId, p.accountId);
  const row = await db.connectOAuthAttempt.findUniqueOrThrow({ where: { stateHash: digest(state) } });
  assert.equal(row.status, 'SUCCEEDED'); assert.equal(row.codeHash, digest(value));
  assert.equal(JSON.stringify(row).includes('sensitive'), false); assert.equal(JSON.stringify(row).includes(value), false);
  await assert.rejects(complete(state, value, p.service)); await assert.rejects(begin(id)); assert.equal(p.calls.length, 1);
});
test('concurrent callbacks exchange the code once', async () => {
  const state = await begin(await agency()); const value = code(); const p = provider();
  const results = await Promise.allSettled([complete(state, value, p.service), complete(state, value, p.service)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(p.calls.length, 1);
});
test('uncertain exchange is not retried, even with a new state', async () => {
  const id = await agency(); const state = await begin(id); const value = code(); const p = provider();
  p.service.exchange = async input => { p.calls.push(input); throw new Error('Sensitive provider response'); };
  assert.equal((await complete(state, value, p.service)).outcome, 'failed');
  await assert.rejects(complete(state, value, p.service));
  const next = await begin(id); await assert.rejects(complete(next, value, p.service)); assert.equal(p.calls.length, 1);
});
test('live, insufficient-scope, wrong-account and non-Standard responses do not link', async () => {
  for (const change of ['live', 'scope', 'account', 'type']) {
    const id = await agency(); const state = await begin(id); const p = provider();
    if (change === 'live') p.token.livemode = true;
    if (change === 'scope') p.token.scope = 'read_only';
    if (change === 'account') p.account.id = 'acct_wrong';
    if (change === 'type') p.account.type = 'express';
    assert.equal((await complete(state, code(), p.service)).outcome, 'failed');
    assert.equal((await db.agency.findUniqueOrThrow({ where: { id } })).stripeConnectAccountId, null);
  }
});
test('another agency cannot claim an already linked account', async () => {
  const p = provider(); const foreign = await agency(other); await db.agency.update({ where: { id: foreign }, data: { stripeConnectAccountId: p.accountId } });
  const id = await agency(); assert.equal((await complete(await begin(id), code(), p.service)).outcome, 'failed');
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id } })).stripeConnectAccountId, null);
});
test('owner deletion during provider exchange prevents linking', async () => {
  const id = await agency(); const state = await begin(id); const p = provider();
  p.service.exchange = async () => { await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } }); return p.token; };
  try { assert.equal((await complete(state, code(), p.service)).outcome, 'failed'); }
  finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id } })).stripeConnectAccountId, null);
});
test('callback HTTP handler rejects signed-out/malformed input and redirects without secrets', async () => {
  const never = () => { throw new Error('Database must not be called'); }; const p = provider();
  const base = `${env.ZENVO_APP_URL}/api/stripe-connect/callback`;
  const signedOut = await handleConnectCallback(new Request(`${base}?code=ac_secret`), { actorId: null, env, db: never, provider: () => p.service });
  assert.equal(signedOut.status, 401); assert.equal(signedOut.headers.get('referrer-policy'), 'no-referrer'); assert.equal((await signedOut.text()).includes('ac_secret'), false);
  assert.equal((await handleConnectCallback(new Request(base), { actorId: owner, env, db: never, provider: () => p.service })).status, 400);
  const id = await agency(); const state = await begin(id);
  const response = await handleConnectCallback(new Request(`${base}?state=${state}&code=${code()}`), { actorId: owner, env, db: () => db, provider: () => p.service });
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), `${env.ZENVO_APP_URL}/agency/${id}/payments?connect=linked`);
  assert.match(response.headers.get('cache-control')!, /no-store/);
});
