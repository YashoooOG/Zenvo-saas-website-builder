import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createDatabaseClient } from '../src/lib/database-client';
import { handleStripeWebhook } from '../src/lib/stripe-webhook';
import { getAgencySubscriptions } from '../src/lib/subscriptions';
import { AgencyAccessError } from '../src/lib/agency-access';

const tag = randomUUID().replaceAll('-', '');
const owner = `billing_${tag}`, admin = `${owner}_admin`, outsider = `${owner}_other`;
const customer = `cus_${tag}`, subId = `sub_${tag}`, priceId = `price_${tag}`;
const db = createDatabaseClient(process.env.DATABASE_URL);
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: priceId, STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const events: string[] = [];
let agencyId: string;
let foreignId: string;
before(async () => {
  await db.user.createMany({ data: [owner, admin, outsider].map(id => ({ id })) });
  agencyId = (await db.agency.create({ data: { name: 'Subscription fixture', ownerId: owner, stripeCustomerId: customer } })).id;
  foreignId = (await db.agency.create({ data: { name: 'Foreign subscription fixture', ownerId: outsider } })).id;
  await db.agencyMembership.create({ data: { agencyId, userId: admin, role: 'ADMIN' } });
});
after(async () => {
  try {
    await db.stripeWebhookReceipt.deleteMany({ where: { id: { in: events } } });
    await db.agency.deleteMany({ where: { ownerId: { in: [owner, outsider] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, admin, outsider] } } });
  } finally { await db.$disconnect(); }
});

function event(changes: Record<string, unknown> = {}) {
  const id = `evt_${randomUUID().replaceAll('-', '')}`; events.push(id);
  return { id, object: 'event', type: 'customer.subscription.updated', livemode: false, created: 1, data: { object: { object: 'subscription', id: subId, customer } }, ...changes };
}
function snapshot(changes: Record<string, unknown> = {}): Stripe.Subscription {
  return { id: subId, customer, livemode: false, metadata: { zenvoAgencyId: agencyId }, status: 'active', cancel_at_period_end: false, pause_collection: null,
    items: { has_more: false, data: [{ quantity: 1, current_period_end: 1800000000, price: { id: priceId, livemode: false, type: 'recurring' } }] }, ...changes } as unknown as Stripe.Subscription;
}
async function request(value: unknown, timestamp?: number) {
  const payload = JSON.stringify(value);
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: env.STRIPE_WEBHOOK_SECRET, timestamp });
  return new Request('http://localhost/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } });
}
const deliver = async (value: unknown, retrieve = async () => snapshot()) => handleStripeWebhook(await request(value), { env, db: () => db, retrieve });

test('missing configuration, invalid signatures, stale signatures and oversized bodies never reach the database', async () => {
  const never = () => { throw new Error('Database must not be called'); };
  assert.equal((await handleStripeWebhook(await request(event()), { env: {}, db: never })).status, 503);
  const wrong = new Request('http://localhost/api/stripe-webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'invalid' } });
  assert.equal((await handleStripeWebhook(wrong, { env, db: never })).status, 400);
  assert.equal((await handleStripeWebhook(await request(event(), Math.floor(Date.now() / 1000) - 600), { env, db: never })).status, 400);
  const huge = new Request('http://localhost/api/stripe-webhook', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1), headers: { 'stripe-signature': 'invalid' } });
  assert.equal((await handleStripeWebhook(huge, { env, db: never })).status, 413);
});

test('live, Connect, and unrelated events are ignored; malformed subscription events are rejected', async () => {
  const never = () => { throw new Error('Database must not be called'); };
  for (const changes of [{ livemode: true }, { account: 'acct_other' }, { type: 'invoice.paid' }]) {
    assert.equal((await handleStripeWebhook(await request(event(changes)), { env, db: never })).status, 200);
  }
  assert.equal((await handleStripeWebhook(await request(event({ data: {} })), { env, db: never })).status, 400);
});

test('signed event persists authoritative status and duplicate delivery skips Stripe', async () => {
  const value = event();
  assert.equal((await deliver(value)).status, 200);
  assert.equal((await db.agencySubscription.findUniqueOrThrow({ where: { id: subId } })).status, 'active');
  assert.equal((await deliver(value, async () => { throw new Error('Duplicate should not fetch'); })).status, 200);
  assert.equal(await db.stripeWebhookReceipt.count({ where: { id: value.id } }), 1);
});

test('older event snapshots refresh current state including cancellation and collection pause', async () => {
  assert.equal((await deliver(event({ created: 0, type: 'customer.subscription.created' }), async () => snapshot({ status: 'canceled', cancel_at_period_end: true, pause_collection: { behavior: 'void' } }))).status, 200);
  const row = await db.agencySubscription.findUniqueOrThrow({ where: { id: subId } });
  assert.equal(row.status, 'canceled'); assert.equal(row.cancelAtPeriodEnd, true); assert.equal(row.collectionPaused, true);
});

test('concurrent duplicate deliveries store one receipt and fetch once', async () => {
  const value = event(); let calls = 0;
  const retrieve = async () => { calls++; return snapshot(); };
  const results = await Promise.all([deliver(value, retrieve), deliver(value, retrieve)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.equal(calls, 1);
});

test('provider failure rolls back receipt and retry succeeds without leaking error details', async () => {
  const value = event();
  const result = await deliver(value, async () => { throw new Error('sk_test_private'); });
  assert.equal(result.status, 503); assert.equal((await result.text()).includes('sk_test_private'), false);
  assert.equal(await db.stripeWebhookReceipt.count({ where: { id: value.id } }), 0);
  assert.equal((await deliver(value)).status, 200);
});

test('customer, metadata, subscription, mode and price mismatches cannot overwrite stored state', async () => {
  for (const changes of [{ customer: 'cus_other' }, { metadata: { zenvoAgencyId: foreignId } }, { id: 'sub_other' }, { livemode: true }, { items: { has_more: false, data: [{ quantity: 1, current_period_end: 1800000000, price: { id: 'price_other', livemode: false, type: 'recurring' } }] } }]) {
    const value = event();
    assert.equal((await deliver(value, async () => snapshot(changes))).status, 503);
    assert.equal(await db.stripeWebhookReceipt.count({ where: { id: value.id } }), 0);
  }
  assert.equal((await db.agencySubscription.findUniqueOrThrow({ where: { id: subId } })).status, 'active');
});

test('unknown customers do not use metadata to select an agency or call Stripe', async () => {
  const value = event({ data: { object: { object: 'subscription', id: subId, customer: 'cus_unknown', metadata: { zenvoAgencyId: agencyId } } } });
  const result = await deliver(value, async () => { throw new Error('Unknown customer must not fetch'); });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { message: 'Ignored' });
});

test('billing reads require the active owner and cannot cross tenants', async () => {
  assert.equal((await getAgencySubscriptions(db, owner, agencyId)).length, 1);
  for (const actor of [admin, outsider, 'missing']) await assert.rejects(getAgencySubscriptions(db, actor, agencyId), AgencyAccessError);
  await assert.rejects(getAgencySubscriptions(db, owner, foreignId), AgencyAccessError);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(getAgencySubscriptions(db, owner, agencyId), AgencyAccessError); }
  finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
});
