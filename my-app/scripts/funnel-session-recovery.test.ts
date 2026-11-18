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
import type Stripe from 'stripe';

import { recoverFunnelSession, type FunnelRecoveryProvider } from '../src/lib/funnel-session-recovery';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `recover_${uid()}`, other = `${owner}_other`; const accountIds: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115', ZENVO_APPLICATION_FEE_BPS: '250' };
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => { try { await db.funnelCheckoutAttempt.deleteMany({ where: { actorId: owner } }); await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); await db.connectAccountSync.deleteMany({ where: { accountId: { in: accountIds } } }); } finally { await db.$disconnect(); } });
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
  const f = await sessionFixture(); const calls: string[] = [];
  const provider: FunnelRecoveryProvider = {
    async listSessions(accountId, from, to) {
      assert.equal(accountId, f.accountId); assert.ok(from <= f.attempt.createdAt.getTime() / 1000); assert.ok(to >= f.attempt.expiresAt.getTime() / 1000);
      calls.push('list'); return { has_more: false, data: f.saved() ? [f.saved()] : [] };
    },
    async getSession(accountId, sessionId) { calls.push('get'); return f.sessionProvider.getSession(accountId, sessionId); },
    async expireSession(accountId, sessionId, key) {
      assert.equal(accountId, f.accountId); assert.equal(sessionId, f.saved().id); assert.equal(key, `${f.attempt.idempotencyKey}_expire`);
      calls.push('expire'); f.saved().status = 'expired'; f.saved().url = null; return structuredClone(f.saved());
    },
  };
  const recover = (operation: 'inspect' | 'cancel' = 'inspect', actor = owner) => recoverFunnelSession(db, actor, { attemptId: f.attempt.id, operation }, env, () => provider);
  const loseResponse = async () => {
    const create = f.sessionProvider.createSession;
    f.sessionProvider.createSession = async (...args) => { await create(...args); throw new Error('lost response'); };
    await assert.rejects(f.start()); f.sessionProvider.createSession = create;
  };
  return { ...f, recoveryProvider: provider, recoveryCalls: calls, recover, loseResponse };
}

test('prepared attempts do not contact Stripe; known sessions are inspected without new creates', async () => {
  const f = await fixture(); assert.deepEqual(await f.recover(), { status: 'not-started' }); assert.equal(f.recoveryCalls.length, 0);
  await f.start(); assert.deepEqual(await f.recover(), { status: 'open' });
  assert.deepEqual(f.recoveryCalls, ['get']); assert.equal(f.writes.length, 1);
});

test('lost create responses are discovered and bound using verified session identity', async () => {
  const f = await fixture(); await f.loseResponse();
  assert.equal((await f.state()).sessionId, null);
  assert.deepEqual(await f.recover(), { status: 'open' });
  assert.equal((await f.state()).sessionId, f.saved().id); assert.equal(f.writes.length, 1);
  await f.start(); assert.equal(f.writes.length, 1);
});

test('recovery cancels known sessions after local expiry, unpublishing and disconnection', async () => {
  const f = await fixture(); await f.start(); await f.publish('unpublish');
  await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: null } });
  await db.funnelCheckoutAttempt.update({ where: { id: f.attempt.id }, data: { expiresAt: new Date(0) } });
  assert.deepEqual(await f.recover('cancel'), { status: 'expired' });
  assert.deepEqual(f.recoveryCalls, ['get', 'expire', 'get']); assert.equal((await f.state()).sessionStatus, 'expired');
  assert.equal(f.writes.length, 1);
});

test('missing, duplicate or truncated discovery results stay under review and block checkout replay', async () => {
  for (const kind of ['missing', 'duplicate', 'truncated']) {
    const f = await fixture(); await f.loseResponse();
    f.recoveryProvider.listSessions = async () => ({ has_more: kind === 'truncated', data: kind === 'missing' ? [] : kind === 'duplicate' ? [f.saved(), { ...f.saved(), id: `cs_test_${uid()}` }] : [f.saved()] });
    assert.deepEqual(await f.recover(), { status: 'review' });
    assert.equal((await f.state()).sessionStatus, 'review'); assert.equal((await f.state()).sessionId, null);
    await assert.rejects(f.start(), /recovery/); assert.equal(f.writes.length, 1);
    assert.ok(!f.recoveryCalls.includes('expire'));
  }
});

test('a lost expiration response and a racing completed payment use retrieved state', async () => {
  for (const status of ['expired', 'complete']) {
    const f = await fixture(); await f.start();
    f.recoveryProvider.expireSession = async () => { f.saved().status = status; f.saved().url = null; throw new Error('lost response'); };
    assert.deepEqual(await f.recover('cancel'), { status });
    assert.equal((await f.state()).sessionStatus, status); assert.equal(f.writes.length, 1);
  }
});

test('failed expiration leaves review in place until a later verified recovery succeeds', async () => {
  const f = await fixture(); await f.start(); const expire = f.recoveryProvider.expireSession;
  f.recoveryProvider.expireSession = async () => { throw new Error('timeout'); };
  assert.deepEqual(await f.recover('cancel'), { status: 'review' });
  await assert.rejects(f.start(), /recovery/);
  f.recoveryProvider.expireSession = expire;
  assert.deepEqual(await f.recover('cancel'), { status: 'expired' });
});

test('non-owners and injected recovery fields are rejected before provider calls', async () => {
  const f = await fixture(); await f.start();
  await db.agencyMembership.create({ data: { agencyId: f.agency.id, userId: other, role: 'ADMIN' } });
  for (const actor of ['missing', other]) await assert.rejects(f.recover('cancel', actor));
  for (const patch of [{ accountId: f.accountId }, { sessionId: f.saved().id }, { operation: 'create' }, { attemptId: randomUUID() }]) {
    await assert.rejects(recoverFunnelSession(db, owner, { attemptId: f.attempt.id, operation: 'cancel', ...patch }, env, () => f.recoveryProvider));
  }
  assert.equal(f.recoveryCalls.length, 0); assert.equal((await f.state()).sessionStatus, 'open');
});

test('mismatched discovered sessions are never cancelled or attached to the attempt', async () => {
  const f = await fixture(); await f.loseResponse();
  f.saved().metadata = { zenvoAttemptId: f.attempt.id, zenvoAgencyId: 'foreign' };
  await assert.rejects(f.recover('cancel'), /could not be verified/);
  assert.ok(!f.recoveryCalls.includes('expire')); assert.equal((await f.state()).sessionId, null);
  assert.equal((await f.state()).sessionStatus, 'review');
});

test('provider failures hide private details and leave a durable review marker', async () => {
  const f = await fixture(); await f.start();
  f.recoveryProvider.getSession = async () => { throw new Error('private provider secret'); };
  await assert.rejects(f.recover(), error => error instanceof Error && !error.message.includes('private'));
  assert.equal((await f.state()).sessionStatus, 'review');
});

test('concurrent cancellation converges without duplicate creation or terminal regression', async () => {
  const f = await fixture(); await f.start();
  const results = await Promise.all([f.recover('cancel'), f.recover('cancel')]);
  assert.ok(results.every(result => result.status === 'expired'));
  assert.equal(f.recoveryCalls.filter(item => item === 'expire').length, 1); assert.equal(f.writes.length, 1);
  assert.equal((await f.state()).sessionStatus, 'expired');
});

