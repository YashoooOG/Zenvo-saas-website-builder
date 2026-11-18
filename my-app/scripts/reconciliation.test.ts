import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { createDatabaseClient } from '../src/lib/database-client';
import { AgencyAccessError } from '../src/lib/agency-access';
import { reconcileAgencyBilling, type ReconciliationProvider } from '../src/lib/billing-reconciliation';

const db = createDatabaseClient(process.env.DATABASE_URL);
const tag = randomUUID().replaceAll('-', '');
const owner = `reconcile_${tag}`, admin = `${owner}_admin`, other = `${owner}_other`;
const customer = `cus_${tag}`, firstId = `sub_${tag}A`, secondId = `sub_${tag}B`;
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: 'price_fixture' };
let agencyId: string;
before(async () => {
  await db.user.createMany({ data: [owner, admin, other].map(id => ({ id })) });
  agencyId = (await db.agency.create({ data: { name: 'Reconciliation fixture', ownerId: owner, stripeCustomerId: customer } })).id;
  await db.agencyMembership.create({ data: { agencyId, userId: admin, role: 'ADMIN' } });
});
after(async () => {
  try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, admin, other] } } }); }
  finally { await db.$disconnect(); }
});
function snapshot(id = firstId, changes: Record<string, unknown> = {}) {
  return { id, customer, livemode: false, metadata: { zenvoAgencyId: agencyId }, status: 'active', cancel_at_period_end: false, pause_collection: null,
    items: { has_more: false, data: [{ quantity: 1, current_period_end: 1800000000, price: { id: 'price_fixture', livemode: false, type: 'recurring' } }] }, ...changes } as unknown as Stripe.Subscription;
}
function provider(data: Stripe.Subscription[] = [snapshot()]): ReconciliationProvider {
  return { async customer(id) { return { id, livemode: false, metadata: { zenvoAgencyId: agencyId } }; }, async subscriptions(id) { assert.equal(id, customer); return { data, has_more: false }; } };
}
const refresh = (service: ReconciliationProvider, actor = owner, settings = env) => reconcileAgencyBilling(db, actor, agencyId, settings, service);
const stored = () => db.agencySubscription.findMany({ where: { agencyId }, orderBy: { id: 'asc' } });

test('admins, unrelated users, missing actors and deleted owners cannot contact Stripe', async () => {
  const service = provider(); let calls = 0;
  service.customer = async () => { calls++; throw new Error('Must not call'); };
  for (const actor of [admin, other, 'missing']) await assert.rejects(refresh(service, actor), AgencyAccessError);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(refresh(service), AgencyAccessError); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  assert.equal(calls, 0);
});
test('empty configuration and unverified customers leave records unchanged', async () => {
  await assert.rejects(refresh(provider(), owner, { ...env, STRIPE_SECRET_KEY: '' }));
  for (const changes of [{ id: 'cus_other' }, { deleted: true }, { livemode: true }, { metadata: { zenvoAgencyId: 'other' } }]) {
    const service = provider(); service.customer = async () => ({ id: customer, livemode: false, metadata: { zenvoAgencyId: agencyId }, ...changes });
    await assert.rejects(refresh(service));
  }
  assert.deepEqual(await stored(), []);
});
test('empty history is confirmed without inventing subscription records', async () => {
  assert.deepEqual(await refresh(provider([])), { count: 0 }); assert.deepEqual(await stored(), []);
});
test('refresh recovers missed creation and cancellation events', async () => {
  assert.deepEqual(await refresh(provider()), { count: 1 });
  assert.equal((await stored())[0].status, 'active');
  await refresh(provider([snapshot(firstId, { status: 'canceled' }), snapshot(secondId, { status: 'past_due', cancel_at_period_end: true })]));
  const rows = await stored(); assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'canceled'); assert.equal(rows[1].status, 'past_due'); assert.equal(rows[1].cancelAtPeriodEnd, true);
});
test('partial, missing and duplicate histories cannot remove or overwrite existing status', async () => {
  const beforeRows = await stored();
  const partial = provider(); partial.subscriptions = async () => ({ data: [snapshot()], has_more: true });
  await assert.rejects(refresh(partial), /operator review/);
  await assert.rejects(refresh(provider([])), /complete billing history/);
  await assert.rejects(refresh(provider([snapshot(), snapshot()])), /could not be verified/);
  assert.deepEqual(await stored(), beforeRows);
});
test('one invalid subscription rolls back the entire refreshed history', async () => {
  const beforeRows = await stored();
  for (const changes of [{ customer: 'cus_other' }, { metadata: { zenvoAgencyId: 'other' } }, { livemode: true }, { items: { has_more: false, data: [{ quantity: 1, current_period_end: 1800000000, price: { id: 'price_other', type: 'recurring', livemode: false } }] } }]) {
    await assert.rejects(refresh(provider([snapshot(), snapshot(secondId, changes)])));
    assert.deepEqual(await stored(), beforeRows);
  }
});
test('provider failure preserves status and a retry succeeds', async () => {
  const beforeRows = await stored(); const service = provider(); service.subscriptions = async () => { throw new Error('Synthetic outage'); };
  await assert.rejects(refresh(service)); assert.deepEqual(await stored(), beforeRows);
  assert.equal((await refresh(provider([snapshot(), snapshot(secondId)]))).count, 2);
});
test('concurrent refreshes serialize and do not duplicate subscriptions or create webhook receipts', async () => {
  const receiptsBefore = await db.stripeWebhookReceipt.count();
  const results = await Promise.all([refresh(provider([snapshot(), snapshot(secondId)])), refresh(provider([snapshot(), snapshot(secondId)]))]);
  assert.deepEqual(results, [{ count: 2 }, { count: 2 }]); assert.equal((await stored()).length, 2);
  assert.equal(await db.stripeWebhookReceipt.count(), receiptsBefore);
});
