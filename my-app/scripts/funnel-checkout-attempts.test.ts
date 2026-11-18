import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { type FunnelPriceProvider } from '../src/lib/funnel-price-check';

import { prepareFunnelCheckout } from '../src/lib/funnel-checkout-attempts';
import { emptyEditorContent } from '../src/lib/editor-content';
import { setPageOffer } from '../src/lib/page-offers';
import { publishFunnelPage } from '../src/lib/funnel-publishing';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `attempts_${uid()}`, other = `${owner}_other`; const accountIds: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115', ZENVO_APPLICATION_FEE_BPS: '250' };
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => { try { await db.funnelCheckoutAttempt.deleteMany({ where: { actorId: owner } }); await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); await db.connectAccountSync.deleteMany({ where: { accountId: { in: accountIds } } }); } finally { await db.$disconnect(); } });
async function fixture() {
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

test('preparation stores verified price/fee and repeat requests return the same immutable attempt', async () => {
  const f = await fixture(); const first = await f.prepare();
  assert.equal(first.amount, 2500); assert.equal(first.feeAmount, 62); assert.equal(first.feeBasisPoints, 250);
  assert.equal(first.accountId, f.accountId); assert.equal(first.priceId, f.price.id);
  assert.equal(first.currency, 'usd'); assert.equal(first.taxBehavior, 'unspecified');
  assert.ok(first.expiresAt.getTime() > first.createdAt.getTime());
  assert.match(first.idempotencyKey, /^funnel_/);
  f.provider.price = async () => { throw new Error('retry must not read Stripe'); };
  assert.deepEqual(await f.prepare({ ...env, ZENVO_APPLICATION_FEE_BPS: '500' }), first);
  assert.equal(await db.funnelCheckoutAttempt.count({ where: { pageId: f.page.id } }), 1);
});

test('concurrent duplicate preparation creates one durable attempt and one idempotency key', async () => {
  const f = await fixture();
  const attempts = await Promise.all([f.prepare(), f.prepare(), f.prepare()]);
  assert.equal(new Set(attempts.map(item => item.id)).size, 1);
  assert.equal(new Set(attempts.map(item => item.idempotencyKey)).size, 1);
  assert.equal(await db.funnelCheckoutAttempt.count({ where: { pageId: f.page.id } }), 1);
});

test('non-owners, foreign page scopes and forged payment fields cannot prepare a checkout', async () => {
  const f = await fixture(), foreign = await fixture();
  await db.agencyMembership.create({ data: { agencyId: f.agency.id, userId: other, role: 'ADMIN' } });
  for (const actor of [other, 'missing']) await assert.rejects(prepareFunnelCheckout(db, actor, f.input, env, () => f.provider));
  for (const patch of [{ pageId: foreign.page.id }, { subAccountId: foreign.sub.id }, { amount: 1 }, { feeAmount: 0 }, { accountId: f.accountId }, { priceId: f.price.id }, { requestId: 'bad' }]) {
    await assert.rejects(prepareFunnelCheckout(db, owner, { ...f.input, ...patch }, env, () => f.provider));
  }
  assert.equal(f.calls.length, 0);
});

test('request IDs cannot be rebound to another page or an expired attempt', async () => {
  const f = await fixture(), foreign = await fixture(); const attempt = await f.prepare();
  await assert.rejects(prepareFunnelCheckout(db, owner, { ...foreign.input, requestId: f.input.requestId }, env, () => foreign.provider), /different publication/);
  await db.funnelCheckoutAttempt.update({ where: { id: attempt.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(f.prepare(), /expired/);
  assert.equal(await db.funnelCheckoutAttempt.count({ where: { pageId: f.page.id } }), 1);
});

test('draft changes keep published attempts stable; unpublishing blocks retries', async () => {
  const f = await fixture(); const first = await f.prepare();
  await setPageOffer(db, owner, { ...await f.scope(), priceId: '' });
  assert.deepEqual(await f.prepare(), first);
  await f.publish('unpublish'); await assert.rejects(f.prepare(), /Publish/);
  assert.equal(await db.funnelCheckoutAttempt.count({ where: { pageId: f.page.id } }), 1);
});

test('republishing invalidates old request IDs and a new request captures the new publication', async () => {
  const f = await fixture(); const first = await f.prepare();
  const content = emptyEditorContent();
  if (content.root.type === 'container') content.root.children.push({ id: randomUUID(), type: 'text', text: 'Updated checkout page' });
  await db.funnelPage.update({ where: { id: f.page.id }, data: { draftContent: content } });
  await f.publish(); await assert.rejects(f.prepare(), /different publication/);
  const next = await prepareFunnelCheckout(db, owner, { ...f.input, requestId: randomUUID() }, env, () => f.provider);
  assert.notEqual(first.id, next.id); assert.notEqual(first.publicationHash, next.publicationHash);
  assert.deepEqual(await db.funnelCheckoutAttempt.findUnique({ where: { id: first.id } }), first);
});

test('connection revocation, reconnection and workspace disabling block existing attempts', async () => {
  for (const change of ['revoke', 'reconnect', 'disable', 'delete-owner']) {
    const f = await fixture(); await f.prepare();
    if (change === 'revoke') await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { revokedAt: new Date() } });
    if (change === 'reconnect') await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { linkedStartedAt: new Date(Date.now() + 3000) } });
    if (change === 'disable') await db.subAccount.update({ where: { id: f.sub.id }, data: { enabled: false } });
    if (change === 'delete-owner') await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
    try { await assert.rejects(f.prepare()); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  }
});

test('publication and permission changes during provider reads cannot persist stale snapshots', async () => {
  for (const change of ['publication', 'disable', 'reconnect']) {
    const f = await fixture();
    f.provider.price = async () => {
      if (change === 'publication') { await setPageOffer(db, owner, { ...await f.scope(), priceId: '' }); await f.publish(); }
      if (change === 'disable') await db.subAccount.update({ where: { id: f.sub.id }, data: { enabled: false } });
      if (change === 'reconnect') await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { linkedStartedAt: new Date(Date.now() + 3000) } });
      return f.price;
    };
    await assert.rejects(f.prepare());
    assert.equal(await db.funnelCheckoutAttempt.count({ where: { pageId: f.page.id } }), 0);
  }
});

test('failed provider reads or missing configuration leave no attempt, allowing a clean retry', async () => {
  const f = await fixture(); const original = f.provider.price;
  await assert.rejects(f.prepare({ ...env, STRIPE_SECRET_KEY: '' }));
  f.provider.price = async () => { throw new Error('private provider failure'); };
  await assert.rejects(f.prepare());
  assert.equal(await db.funnelCheckoutAttempt.count({ where: { pageId: f.page.id } }), 0);
  f.provider.price = original; assert.ok((await f.prepare()).id);
});

