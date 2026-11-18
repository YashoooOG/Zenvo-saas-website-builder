import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { type FunnelPriceProvider } from '../src/lib/funnel-price-check';

import { prepareFunnelCheckout } from '../src/lib/funnel-checkout-attempts';
import { emptyEditorContent } from '../src/lib/editor-content';
import { setPageOffer } from '../src/lib/page-offers';
import { publishFunnelPage } from '../src/lib/funnel-publishing';

import { startFunnelSession, type FunnelSessionProvider } from '../src/lib/funnel-checkout-sessions';
import Stripe from 'stripe';

import { parseFunnelPaymentEvent, syncFunnelPaymentEvent, type FunnelPaymentEvent } from '../src/lib/funnel-payment-events';
import { handleConnectWebhook } from '../src/lib/connect-webhook';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `payevents_${uid()}`, other = `${owner}_other`; const accountIds: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115', ZENVO_APPLICATION_FEE_BPS: '250', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_fixture' };
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => { try { await db.connectWebhookReceipt.deleteMany({ where: { accountId: { in: accountIds } } }); await db.funnelCheckoutAttempt.deleteMany({ where: { actorId: owner } }); await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); await db.connectAccountSync.deleteMany({ where: { accountId: { in: accountIds } } }); } finally { await db.$disconnect(); } });
async function baseFixture() {
  const accountId = `acct_${uid()}`; accountIds.push(accountId);
  const agency = await db.agency.create({ data: { ownerId: owner, name: 'Price check fixture', stripeConnectAccountId: accountId } });
  const productId = `prod_${uid()}`, priceId = `price_${uid()}`;
  await db.connectAccountSync.create({ data: { accountId, linkedStartedAt: new Date() } });
  await db.agencyCatalog.create({ data: { agencyId: agency.id, accountId, syncToken: randomUUID(), syncedAt: new Date(), products: [{ id: productId, name: 'Cached name', active: true, prices: [{ id: priceId, active: true, currency: 'usd', amount: 999, type: 'one_time', supported: true }] }] } });
  const price = { id: priceId, active: true, livemode: false, type: 'one_time', billing_scheme: 'per_unit', currency: 'usd', unit_amount: 2500, unit_amount_decimal: '2500', custom_unit_amount: null, transform_quantity: null, recurring: null, tax_behavior: 'unspecified', product: { id: productId, active: true, livemode: false, name: 'Current name' } };
  const account = { id: accountId, type: 'standard', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null } };
  const calls: string[] = [];
  const provider: FunnelPriceProvider = { async account(id) { assert.equal(id, accountId); calls.push('account'); return account; }, async price(id, requested) { assert.equal(id, accountId); assert.equal(requested, priceId); calls.push('price'); return price; } };
  const sub = await db.subAccount.create({ data: { agencyId: agency.id, name: 'Checkout workspace' } });
  const funnel = await db.funnel.create({ data: { subAccountId: sub.id, name: 'Checkout funnel' } });
  const page = await db.funnelPage.create({ data: { subAccountId: sub.id, funnelId: funnel.id, name: 'Checkout page', path: '/', draftContent: emptyEditorContent() } });
  const scope = async () => ({ subAccountId: sub.id, funnelId: funnel.id, pageId: page.id, revision: (await db.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).revision });
  const publish = async (operation: 'publish' | 'unpublish' = 'publish') => publishFunnelPage(db, owner, { ...await scope(), subdomain: `attempt-${uidDomain}`, operation, confirmed: true });
  const uidDomain = uid();
  await setPageOffer(db, owner, { ...await scope(), priceId }); await publish();
  const input = { subAccountId: sub.id, funnelId: funnel.id, pageId: page.id, requestId: randomUUID() };
  const prepare = (configuration = env) => prepareFunnelCheckout(db, owner, input, configuration, () => provider);
  return { agency, accountId, price, account, provider, input, prepare, calls, sub, funnel, page, scope, publish };
}

async function sessionFixture() {
  const f = await baseFixture(); const attempt = await f.prepare();
  let saved: Record<string, unknown> | null = null;
  const writes: { accountId: string; parameters: Stripe.Checkout.SessionCreateParams; key: string }[] = [];
  const reads: string[] = [];
  const provider: FunnelSessionProvider = {
    ...f.provider,
    async createSession(accountId, parameters, key) {
      assert.equal(accountId, f.accountId); assert.equal(key, attempt.idempotencyKey);
      writes.push({ accountId, parameters: structuredClone(parameters), key });
      if (saved) assert.deepEqual(parameters, writes[0].parameters);
      saved ??= {
        id: `cs_test_${uid()}`, livemode: false, mode: 'payment', status: 'open',
        url: 'https://checkout.stripe.com/c/pay/test', client_reference_id: attempt.id,
        metadata: { zenvoAttemptId: attempt.id, zenvoAgencyId: attempt.agencyId },
        currency: 'usd', amount_subtotal: 2500, amount_total: 2500, expires_at: parameters.expires_at,
        automatic_tax: { enabled: false }, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
        line_items: { has_more: false, data: [{ quantity: 1, price: { id: f.price.id } }] },
      };
      return structuredClone(saved);
    },
    async getSession(accountId, sessionId) {
      assert.equal(accountId, f.accountId); assert.equal(sessionId, saved?.id); reads.push(sessionId);
      return structuredClone(saved);
    },
  };
  const start = (configuration = env) => startFunnelSession(db, owner, { attemptId: attempt.id }, configuration, () => provider);
  const state = () => db.funnelCheckoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  return { ...f, attempt, sessionProvider: provider, start, state, writes, reads, saved: () => saved! };
}

async function fixture() {
  const f = await sessionFixture(); await f.start();
  const intent = { id: `pi_${uid()}`, livemode: false, status: 'succeeded', amount: 2500, amount_received: 2500, currency: 'usd', application_fee_amount: 62,
    metadata: { zenvoAttemptId: f.attempt.id, zenvoAgencyId: f.agency.id } };
  f.saved().status = 'complete'; f.saved().url = null; f.saved().payment_status = 'paid'; f.saved().payment_intent = intent;
  const event = (type: FunnelPaymentEvent['type'] = 'checkout.session.completed'): FunnelPaymentEvent => ({
    id: `evt_${uid()}`, account: f.accountId, type, livemode: false,
    data: { object: { id: f.saved().id as string, object: 'checkout.session', metadata: { zenvoAttemptId: f.attempt.id } } },
  });
  const retrieve = (accountId: string, sessionId: string) => f.sessionProvider.getSession(accountId, sessionId);
  const sync = (e = event()) => syncFunnelPaymentEvent(db, e, retrieve);
  return { ...f, intent, event, retrieve, sync };
}

test('verified payments persist once across concurrent duplicate deliveries', async () => {
  const f = await fixture(); const e = f.event();
  const results = await Promise.all([f.sync(e), f.sync(e)]);
  assert.deepEqual(results.sort(), ['duplicate', 'updated']);
  const row = await f.state(); assert.equal(row.paymentStatus, 'paid'); assert.equal(row.paymentIntentId, f.intent.id); assert.ok(row.paymentConfirmedAt);
  assert.equal(await db.connectWebhookReceipt.count({ where: { id: e.id } }), 1);
});

test('current provider state overrides stale event types and confirmed payments do not regress', async () => {
  const f = await fixture(); await f.sync(f.event('checkout.session.async_payment_failed'));
  const first = await f.state(); assert.equal(first.paymentStatus, 'paid');
  f.saved().payment_status = 'unpaid'; f.saved().status = 'expired'; f.saved().payment_intent = null;
  await f.sync(f.event('checkout.session.expired'));
  const later = await f.state(); assert.equal(later.paymentStatus, 'paid'); assert.equal(later.paymentIntentId, f.intent.id);
  assert.deepEqual(later.paymentConfirmedAt, first.paymentConfirmedAt);
});

test('unpaid completion stays pending; delayed failure and success update verified payment state', async () => {
  const f = await fixture(); f.saved().payment_status = 'unpaid'; f.intent.status = 'processing'; f.intent.amount_received = 0;
  await f.sync(); assert.equal((await f.state()).paymentStatus, 'pending'); assert.equal((await f.state()).paymentConfirmedAt, null);
  f.intent.status = 'requires_payment_method'; await f.sync(f.event('checkout.session.async_payment_failed'));
  assert.equal((await f.state()).paymentStatus, 'failed');
  f.intent.status = 'succeeded'; f.intent.amount_received = 2500; f.saved().payment_status = 'paid';
  await f.sync(f.event('checkout.session.async_payment_succeeded')); assert.equal((await f.state()).paymentStatus, 'paid');
});

test('historical payment is reconciled after unpublishing, revocation and lost session mapping', async () => {
  const f = await fixture(); await f.publish('unpublish');
  await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: null } });
  await db.funnelCheckoutAttempt.update({ where: { id: f.attempt.id }, data: { sessionId: null, sessionStatus: 'review', expiresAt: new Date(0) } });
  await f.sync(); const row = await f.state();
  assert.equal(row.paymentStatus, 'paid'); assert.equal(row.sessionId, f.saved().id); assert.equal(row.sessionStatus, 'review');
});

test('foreign account events and unrelated sessions do not read provider data or alter an attempt', async () => {
  const f = await fixture(); const foreign = `acct_${uid()}`; accountIds.push(foreign);
  const noRead = async () => { throw new Error('Unexpected read'); };
  assert.equal(await syncFunnelPaymentEvent(db, { ...f.event(), account: foreign }, noRead), 'ignored');
  const e = f.event(); e.data.object = { id: `cs_test_${uid()}`, object: 'checkout.session' };
  assert.equal(await syncFunnelPaymentEvent(db, e, noRead), 'ignored');
  assert.equal((await f.state()).paymentStatus, 'pending');
});

test('fee, amount, identity and success mismatches roll back receipts and allow safe retries', { timeout: 20000 }, async () => {
  const f = await fixture();
  for (const patch of [{ application_fee_amount: 1 }, { amount_received: 1 }, { amount: 1 }, { currency: 'eur' },
    { status: 'processing' }, { livemode: true }, { metadata: { zenvoAttemptId: 'other', zenvoAgencyId: f.agency.id } }]) {
    const e = f.event(); f.saved().payment_intent = { ...f.intent, ...patch };
    await assert.rejects(f.sync(e)); assert.equal(await db.connectWebhookReceipt.findUnique({ where: { id: e.id } }), null);
    assert.equal((await f.state()).paymentStatus, 'pending');
  }
  f.saved().payment_intent = f.intent; await f.sync(); assert.equal((await f.state()).paymentStatus, 'paid');
});

test('parser ignores live/unrelated events and rejects missing connected-account identity', async () => {
  const f = await fixture();
  assert.equal(parseFunnelPaymentEvent({ ...f.event(), livemode: true }), null);
  assert.equal(parseFunnelPaymentEvent({ ...f.event(), type: 'customer.created' }), null);
  assert.throws(() => parseFunnelPaymentEvent({ ...f.event(), account: undefined }));
});

test('signed Connect HTTP delivery verifies signatures and retries provider failures without leaking details', async () => {
  const f = await fixture(); const stripe = new Stripe(env.STRIPE_SECRET_KEY); const e = f.event();
  const signed = async (secret = env.STRIPE_CONNECT_WEBHOOK_SECRET) => {
    const payload = JSON.stringify(e); const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
    return new Request('http://localhost/api/stripe-connect/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } });
  };
  const options = { env, db: () => db, retrievePayment: f.retrieve };
  assert.equal((await handleConnectWebhook(await signed('whsec_wrong'), { ...options, db: () => { throw new Error('Unexpected DB read'); } })).status, 400);
  const failure = await handleConnectWebhook(await signed(), { ...options, retrievePayment: async () => { throw new Error('private provider token'); } });
  assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes('private'));
  assert.equal(await db.connectWebhookReceipt.findUnique({ where: { id: e.id } }), null);
  const success = await handleConnectWebhook(await signed(), options); assert.equal(success.status, 200);
  assert.match(success.headers.get('cache-control')!, /no-store/); assert.equal((await f.state()).paymentStatus, 'paid');
  assert.equal((await handleConnectWebhook(await signed(), options)).status, 200);
});

