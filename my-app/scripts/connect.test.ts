import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { AgencyAccessError } from '../src/lib/agency-access';
import { connectConfiguration, connectAccountStatus, getAgencyPayments } from '../src/lib/agency-payments';

const db = createDatabaseClient(process.env.DATABASE_URL);
const tag = randomUUID().replaceAll('-', '');
const owner = `connect_${tag}`, admin = `${owner}_admin`, other = `${owner}_other`;
const accountId = `acct_${tag}`;
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115' };
let agencyId: string;
before(async () => {
  await db.user.createMany({ data: [owner, admin, other].map(id => ({ id })) });
  agencyId = (await db.agency.create({ data: { name: 'Connect fixture', ownerId: owner } })).id;
  await db.agencyMembership.create({ data: { agencyId, userId: admin, role: 'ADMIN' } });
});
after(async () => {
  try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, admin, other] } } }); }
  finally { await db.$disconnect(); }
});
const account = () => ({ id: accountId, type: 'standard', charges_enabled: false, payouts_enabled: false, details_submitted: false,
  email: 'private@example.test', external_accounts: { data: ['private-bank-details'] },
  requirements: { currently_due: ['business_profile.url', 'representative.id_number'], past_due: ['representative.id_number'], pending_verification: ['representative.verification.document'], disabled_reason: 'requirements.past_due' } });
const read = (retrieve: (key: string, id: string) => Promise<unknown> = async () => account(), settings = env, actor = owner) => getAgencyPayments(db, actor, agencyId, settings, retrieve);

test('Connect configuration uses test credentials, its own client ID and a canonical callback', () => {
  assert.equal(connectConfiguration(env).callbackUrl, 'http://localhost:3115/api/stripe-connect/callback');
  for (const changes of [{ STRIPE_SECRET_KEY: 'sk_live_fixture' }, { STRIPE_SECRET_KEY: '' }, { STRIPE_CONNECT_CLIENT_ID: 'price_fixture' }, { STRIPE_CONNECT_CLIENT_ID: '' }, { ZENVO_APP_URL: 'http://example.com' }, { ZENVO_APP_URL: 'https://user:pass@example.com' }, { ZENVO_APP_URL: 'https://example.com?next=evil' }]) assert.throws(() => connectConfiguration({ ...env, ...changes }));
});
test('unconfigured and unlinked states do not call Stripe or create an account', async () => {
  let calls = 0; const retrieve = async () => { calls++; return account(); };
  assert.equal((await read(retrieve, { ...env, STRIPE_SECRET_KEY: '' })).status, 'unconfigured');
  assert.equal((await read(retrieve)).status, 'not-connected'); assert.equal(calls, 0);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).stripeConnectAccountId, null);
});
test('non-owners and deleted owners cannot read account status or call Stripe', async () => {
  let calls = 0; const retrieve = async () => { calls++; return account(); };
  for (const actor of [admin, other, 'missing']) await assert.rejects(read(retrieve, env, actor), AgencyAccessError);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(read(retrieve), AgencyAccessError); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  assert.equal(calls, 0);
});
test('mapped Standard account status is sanitized and does not imply sales readiness', async () => {
  await db.agency.update({ where: { id: agencyId }, data: { stripeConnectAccountId: accountId } });
  const result = await read(async (key, id) => { assert.equal(key, env.STRIPE_SECRET_KEY); assert.equal(id, accountId); return account(); });
  assert.deepEqual(result, { agencyName: 'Connect fixture', status: 'connected', account: { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, outstanding: 2, pendingVerification: 1, restricted: true } });
  const serialized = JSON.stringify(result); assert.equal(serialized.includes('private'), false); assert.equal(serialized.includes('id_number'), false); assert.equal(serialized.includes('sk_test'), false);
});
test('foreign, unsupported or malformed account responses are rejected', async () => {
  for (const changes of [{ id: 'acct_other' }, { type: 'express' }, { requirements: null }, { payouts_enabled: 'true' }]) assert.equal((await read(async () => ({ ...account(), ...changes }))).status, 'unavailable');
  assert.throws(() => connectAccountStatus(account(), 'acct_other'));
});
test('provider failures preserve the mapping without exposing error contents', async () => {
  const result = await read(async () => { throw new Error('sk_test_private provider request'); });
  assert.equal(result.status, 'unavailable'); assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).stripeConnectAccountId, accountId);
});
test('mapping replacement while fetching prevents the previous account status being returned', async () => {
  await assert.rejects(read(async () => { await db.agency.update({ where: { id: agencyId }, data: { stripeConnectAccountId: `acct_${tag}new` } }); return account(); }), AgencyAccessError);
  await db.agency.update({ where: { id: agencyId }, data: { stripeConnectAccountId: accountId } });
});
test('an enabled account can still have requirements or a restriction', () => {
  const result = connectAccountStatus({ ...account(), charges_enabled: true, payouts_enabled: true, details_submitted: true }, accountId);
  assert.equal(result.chargesEnabled, true); assert.equal(result.payoutsEnabled, true); assert.equal(result.outstanding, 2); assert.equal(result.restricted, true);
});
