import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createDatabaseClient } from '../src/lib/database-client';
import { parseConnectEvent, syncConnectEvent, type ConnectEvent } from '../src/lib/connect-events';
import { handleConnectWebhook } from '../src/lib/connect-webhook';
import { beginConnectOAuth, completeConnectOAuth } from '../src/lib/connect-oauth';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `connecthooks_${uid()}`;
const accounts: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_fixture', ZENVO_APP_URL: 'http://localhost:3115' };
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
before(async () => { await db.user.create({ data: { id: owner } }); });
after(async () => {
  try {
    await db.agency.deleteMany({ where: { ownerId: owner } });
    await db.user.delete({ where: { id: owner } });
    await db.connectWebhookReceipt.deleteMany({ where: { accountId: { in: accounts } } });
    await db.connectAccountSync.deleteMany({ where: { accountId: { in: accounts } } });
  } finally { await db.$disconnect(); }
});
function accountId() { const id = `acct_${uid()}`; accounts.push(id); return id; }
const account = (id: string) => ({ id, type: 'standard', charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null }, email: 'private@example.com' });
function event(id: string, revoke = false): ConnectEvent {
  return { id: `evt_${uid()}`, account: id, created: Math.floor(Date.now() / 1000), livemode: false,
    type: revoke ? 'account.application.deauthorized' : 'account.updated',
    data: { object: { id: revoke ? env.STRIPE_CONNECT_CLIENT_ID : id, object: revoke ? 'application' : 'account' } } };
}
async function mapped() { const id = accountId(); const agency = await db.agency.create({ data: { ownerId: owner, name: 'Webhook fixture', stripeConnectAccountId: id } }); return { id, agency }; }
const noRead = async () => { throw new Error('Unexpected provider read'); };

test('Connect parser isolates mode, application and account identities', () => {
  const e = event(accountId());
  assert.equal(parseConnectEvent({ ...e, livemode: true }, env.STRIPE_CONNECT_CLIENT_ID), null);
  assert.equal(parseConnectEvent({ ...e, type: 'customer.subscription.updated' }, env.STRIPE_CONNECT_CLIENT_ID), null);
  assert.throws(() => parseConnectEvent({ ...e, account: undefined }, env.STRIPE_CONNECT_CLIENT_ID));
  assert.throws(() => parseConnectEvent({ ...e, data: { object: { id: 'acct_wrong', object: 'account' } } }, env.STRIPE_CONNECT_CLIENT_ID));
  assert.equal(parseConnectEvent(event(e.account, true), 'ca_other'), null);
});

test('updates fetch current account state, sanitize it and deduplicate concurrent deliveries', async () => {
  const { id } = await mapped(); const e = event(id); let reads = 0;
  const retrieve = async () => { reads++; return account(id); };
  await Promise.all([syncConnectEvent(db, e, retrieve), syncConnectEvent(db, e, retrieve)]);
  assert.equal(reads, 1);
  const row = await db.connectAccountSync.findUniqueOrThrow({ where: { accountId: id } });
  assert.equal((row.status as { chargesEnabled: boolean }).chargesEnabled, true);
  assert.equal(JSON.stringify(row).includes('private@example.com'), false);
  const older = { ...event(id), created: e.created - 300 };
  await syncConnectEvent(db, older, async () => ({ ...account(id), charges_enabled: false }));
  assert.equal(((await db.connectAccountSync.findUniqueOrThrow({ where: { accountId: id } })).status as { chargesEnabled: boolean }).chargesEnabled, false);
});

test('provider failures and account mismatch roll back receipts and allow delivery retry', async () => {
  const { id } = await mapped(); const e = event(id);
  await assert.rejects(syncConnectEvent(db, e, noRead));
  await assert.rejects(syncConnectEvent(db, e, async () => account('acct_wrong')));
  assert.equal(await db.connectWebhookReceipt.findUnique({ where: { id: e.id } }), null);
  await syncConnectEvent(db, e, async () => account(id));
  assert.ok(await db.connectWebhookReceipt.findUnique({ where: { id: e.id } }));
});

test('revocation clears only its mapped agency and updates cannot resurrect the link', async () => {
  const { id, agency } = await mapped(); const foreign = await mapped(); const e = event(id, true);
  await syncConnectEvent(db, e, noRead);
  await syncConnectEvent(db, e, noRead);
  await syncConnectEvent(db, event(id), noRead);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agency.id } })).stripeConnectAccountId, null);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: foreign.agency.id } })).stripeConnectAccountId, foreign.id);
});

test('delayed revocation preserves newer authorization and retains the latest tombstone', async () => {
  const { id, agency } = await mapped(); const e = event(id, true); e.created -= 120;
  await db.connectAccountSync.create({ data: { accountId: id, linkedStartedAt: new Date() } });
  await syncConnectEvent(db, e, noRead);
  await syncConnectEvent(db, { ...event(id, true), created: e.created - 100 }, noRead);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agency.id } })).stripeConnectAccountId, id);
  assert.equal((await db.connectAccountSync.findUniqueOrThrow({ where: { accountId: id } })).revokedAt?.getTime(), e.created * 1000);
});

test('revocation arriving during OAuth exchange prevents a late link, including previously unmapped accounts', async () => {
  const id = accountId(); const agency = await db.agency.create({ data: { name: 'Pending fixture', ownerId: owner } });
  const state = new URL(await beginConnectOAuth(db, owner, agency.id, env)).searchParams.get('state')!;
  const result = await completeConnectOAuth(db, owner, { state, code: `ac_${uid()}` }, env, {
    async exchange() { await syncConnectEvent(db, event(id, true), noRead); return { stripe_user_id: id, livemode: false, scope: 'read_write', token_type: 'bearer' }; },
    async account() { return account(id); },
  });
  assert.equal(result.outcome, 'failed');
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agency.id } })).stripeConnectAccountId, null);
});

test('a fresh authorization after an older revocation can reconnect', async () => {
  const id = accountId(); const old = event(id, true); old.created -= 60;
  await syncConnectEvent(db, old, noRead);
  const agency = await db.agency.create({ data: { name: 'Reconnect fixture', ownerId: owner } });
  const state = new URL(await beginConnectOAuth(db, owner, agency.id, env)).searchParams.get('state')!;
  const result = await completeConnectOAuth(db, owner, { state, code: `ac_${uid()}` }, env, {
    async exchange() { return { stripe_user_id: id, livemode: false, scope: 'read_write', token_type: 'bearer' }; }, async account() { return account(id); },
  });
  assert.equal(result.outcome, 'linked');
  await syncConnectEvent(db, { ...old, id: `evt_${uid()}` }, noRead);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agency.id } })).stripeConnectAccountId, id);
});

async function signed(raw: unknown, secret = env.STRIPE_CONNECT_WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify(raw);
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, timestamp });
  return new Request('http://localhost/api/stripe-connect/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } });
}
test('HTTP signature, timestamp, body limit and configuration checks run before database access', async () => {
  const options = { env, db: () => { throw new Error('Unexpected database access'); } };
  for (const request of [new Request('http://localhost', { method: 'POST', body: '{}' }), await signed(event(accountId()), 'whsec_wrong'), await signed(event(accountId()), env.STRIPE_CONNECT_WEBHOOK_SECRET, 1)]) {
    const response = await handleConnectWebhook(request, options); assert.equal(response.status, 400); assert.match(response.headers.get('cache-control')!, /no-store/);
  }
  assert.equal((await handleConnectWebhook(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1), headers: { 'stripe-signature': 'bad' } }), options)).status, 413);
  assert.equal((await handleConnectWebhook(await signed(event(accountId())), { ...options, env: {} })).status, 503);
  assert.equal((await handleConnectWebhook(await signed({ ...event(accountId()), livemode: true }), options)).status, 200);
});

test('signed deliveries persist once, failures retry, and responses omit provider errors', async () => {
  const { id } = await mapped(); const e = event(id);
  const failed = await handleConnectWebhook(await signed(e), { env, db: () => db, retrieve: async () => { throw new Error('private provider details'); } });
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('private provider details'));
  for (let n = 0; n < 2; n++) assert.equal((await handleConnectWebhook(await signed(e), { env, db: () => db, retrieve: async () => account(id) })).status, 200);
  assert.equal(await db.connectWebhookReceipt.count({ where: { id: e.id } }), 1);
});
