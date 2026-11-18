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

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `sessions_${uid()}`, other = `${owner}_other`; const accountIds: string[] = [];
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

async function fixture() {
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

test('session creation uses the connected account, frozen fee and one fixed-price unit', async () => {
  const f = await fixture(); const result = await f.start();
  assert.equal(result.status, 'open'); assert.equal(result.url, 'https://checkout.stripe.com/c/pay/test');
  const params = f.writes[0].parameters;
  assert.deepEqual(params.line_items, [{ price: f.attempt.priceId, quantity: 1 }]);
  assert.equal(params.payment_intent_data?.application_fee_amount, 62);
  assert.deepEqual(params.payment_intent_data?.metadata, params.metadata);
  assert.deepEqual(params.allowed_payment_method_types, ['card']);
  assert.deepEqual(params.automatic_tax, { enabled: false }); assert.deepEqual(params.adaptive_pricing, { enabled: false });
  assert.equal(params.allow_promotion_codes, false); assert.equal(params.mode, 'payment');
  assert.equal(params.success_url, `${env.ZENVO_APP_URL}/subaccount/${f.sub.id}/funnels/${f.funnel.id}`);
  assert.equal(params.cancel_url, params.success_url);
  assert.equal((await f.state()).sessionId, f.saved().id);
  assert.deepEqual((await f.state()).sessionRequest, params);
});

test('concurrent calls create once and retrieve the saved session on subsequent requests', async () => {
  const f = await fixture(); const results = await Promise.all([f.start(), f.start(), f.start()]);
  assert.ok(results.every(item => item.url === results[0].url));
  assert.equal(f.writes.length, 1); assert.equal(f.reads.length, 2);
});

test('a lost create response retains parameters and retries with the same key despite config changes', async () => {
  const f = await fixture(); const create = f.sessionProvider.createSession;
  f.sessionProvider.createSession = async (...args) => { await create(...args); throw new Error('secret upstream timeout'); };
  await assert.rejects(f.start(), error => error instanceof Error && !error.message.includes('secret'));
  const pending = await f.state(); assert.equal(pending.sessionId, null); assert.equal(pending.sessionStatus, 'requested'); assert.ok(pending.sessionRequest);
  f.sessionProvider.createSession = create;
  await f.start({ ...env, ZENVO_APP_URL: 'https://changed.example', ZENVO_APPLICATION_FEE_BPS: '0' });
  assert.equal(f.writes.length, 2); assert.deepEqual(f.writes[1], f.writes[0]);
  assert.equal((await f.state()).sessionId, f.saved().id);
});

test('anonymous users, admins, foreign actors and injected parameters cannot create sessions', async () => {
  const f = await fixture();
  await db.agencyMembership.create({ data: { agencyId: f.agency.id, userId: other, role: 'ADMIN' } });
  for (const actor of ['missing', other]) await assert.rejects(startFunnelSession(db, actor, { attemptId: f.attempt.id }, env, () => f.sessionProvider));
  for (const patch of [{ amount: 1 }, { accountId: f.accountId }, { url: 'https://evil.example' }, { feeAmount: 0 }, { attemptId: randomUUID() }]) {
    await assert.rejects(startFunnelSession(db, owner, { attemptId: f.attempt.id, ...patch }, env, () => f.sessionProvider));
  }
  assert.equal(f.writes.length, 0); assert.equal((await f.state()).sessionRequest, null);
});

test('changed price or restricted account stops before a request is persisted', async () => {
  for (const kind of ['price', 'account', 'configuration']) {
    const f = await fixture();
    if (kind === 'price') f.sessionProvider.price = async () => ({ ...f.price, unit_amount: 3000, unit_amount_decimal: '3000' });
    if (kind === 'account') f.account.charges_enabled = false;
    await assert.rejects(f.start(kind === 'configuration' ? { ...env, STRIPE_SECRET_KEY: '' } : env));
    assert.equal(f.writes.length, 0); assert.equal((await f.state()).sessionRequest, null);
  }
});

test('revoked/reconnected accounts, unpublished pages, disabled workspaces and expired attempts reject retries', async () => {
  for (const kind of ['revoke', 'reconnect', 'unpublish', 'disable', 'expire']) {
    const f = await fixture(); await f.start();
    if (kind === 'revoke') await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: null } });
    if (kind === 'reconnect') await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { linkedStartedAt: new Date(Date.now() + 2000) } });
    if (kind === 'unpublish') await f.publish('unpublish');
    if (kind === 'disable') await db.subAccount.update({ where: { id: f.sub.id }, data: { enabled: false } });
    if (kind === 'expire') await db.funnelCheckoutAttempt.update({ where: { id: f.attempt.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(f.start()); assert.equal(f.writes.length, 1); assert.equal(f.reads.length, 0);
  }
});

test('publication changes during fresh price reads prevent external session writes', async () => {
  const f = await fixture();
  f.sessionProvider.price = async () => { await f.publish('unpublish'); return f.price; };
  await assert.rejects(f.start()); assert.equal(f.writes.length, 0); assert.equal((await f.state()).sessionRequest, null);
});

test('mismatched sessions and unsafe redirects never persist a session ID or return a URL', { timeout: 20000 }, async () => {
  for (const patch of [
    { livemode: true }, { id: 'cs_live_bad' }, { mode: 'subscription' }, { amount_total: 1 }, { currency: 'eur' },
    { metadata: { zenvoAttemptId: 'other', zenvoAgencyId: 'other' } }, { client_reference_id: 'other' },
    { url: 'https://checkout.stripe.com.evil.example/pay' }, { url: 'https://user:pass@checkout.stripe.com/pay' },
    { expires_at: 1 }, { automatic_tax: { enabled: true } },
    { line_items: { has_more: false, data: [{ quantity: 2, price: { id: 'price_wrong' } }] } },
  ]) {
    const f = await fixture(); const create = f.sessionProvider.createSession;
    f.sessionProvider.createSession = async (...args) => ({ ...await create(...args) as object, ...patch });
    await assert.rejects(f.start()); assert.equal((await f.state()).sessionId, null); assert.equal((await f.state()).sessionStatus, 'requested');
  }
});

test('complete/expired sessions return no checkout URL and never create a replacement', async () => {
  for (const status of ['complete', 'expired']) {
    const f = await fixture(); await f.start(); f.saved().status = status; f.saved().url = null;
    assert.deepEqual(await f.start(), { status, url: null });
    assert.equal((await f.state()).sessionStatus, status); assert.equal(f.writes.length, 1);
    await f.start(); assert.equal(f.writes.length, 1);
  }
});

test('zero-fee snapshots omit the application fee and reused session IDs must match', async () => {
  const f = await fixture();
  await db.funnelCheckoutAttempt.update({ where: { id: f.attempt.id }, data: { feeAmount: 0, feeBasisPoints: 0 } });
  await f.start(); assert.equal(f.writes[0].parameters.payment_intent_data?.application_fee_amount, undefined);
  const get = f.sessionProvider.getSession;
  f.sessionProvider.getSession = async (...args) => ({ ...await get(...args) as object, id: `cs_test_${uid()}` });
  await assert.rejects(f.start()); assert.equal((await f.state()).sessionId, f.saved().id);
});

