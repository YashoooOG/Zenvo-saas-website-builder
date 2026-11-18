import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { checkFunnelPrice, type FunnelPriceProvider } from '../src/lib/funnel-price-check';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `pricecheck_${uid()}`, other = `${owner}_other`; const accountIds: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115', ZENVO_APPLICATION_FEE_BPS: '250' };
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => { try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); await db.connectAccountSync.deleteMany({ where: { accountId: { in: accountIds } } }); } finally { await db.$disconnect(); } });
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
  const input = { agencyId: agency.id, priceId };
  const check = () => checkFunnelPrice(db, owner, input, env, () => provider);
  return { agency, accountId, price, account, provider, input, check, calls };
}
test('price check uses current Stripe amount and platform fee, never cached amounts', async () => {
  const f = await fixture(); const result = await f.check();
  assert.equal(result.productName, 'Current name'); assert.equal(result.amount, 2500); assert.equal(result.feeAmount, 62);
  assert.equal(result.formattedAmount.replace(/\s/g, ' '), 'USD 25.00');
  assert.deepEqual(f.calls, ['account', 'price']);
});
test('non-owners and browser-supplied amounts, fees or account IDs cannot reach Stripe', async () => {
  const f = await fixture();
  await db.agencyMembership.create({ data: { agencyId: f.agency.id, userId: other, role: 'ADMIN' } });
  for (const actor of [other, 'missing']) await assert.rejects(checkFunnelPrice(db, actor, f.input, env, () => f.provider));
  for (const extra of [{ amount: 1 }, { feeAmount: 0 }, { accountId: f.accountId }, { quantity: 100 }]) await assert.rejects(checkFunnelPrice(db, owner, { ...f.input, ...extra }, env, () => f.provider));
  assert.equal(f.calls.length, 0);
});
test('missing policy, unlisted prices and missing authorization stop before Stripe reads', async () => {
  const f = await fixture();
  await assert.rejects(checkFunnelPrice(db, owner, f.input, { ...env, ZENVO_APPLICATION_FEE_BPS: '' }, () => f.provider));
  await assert.rejects(checkFunnelPrice(db, owner, { ...f.input, priceId: 'price_foreign' }, env, () => f.provider));
  await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { linkedStartedAt: null } });
  await assert.rejects(f.check()); assert.equal(f.calls.length, 0);
});
test('inactive/live/recurring/variable or mismatched products and prices fail validation', async () => {
  const f = await fixture();
  for (const patch of [{ active: false }, { livemode: true }, { type: 'recurring' }, { billing_scheme: 'tiered' }, { unit_amount: null }, { unit_amount_decimal: '2500.5' }, { id: 'price_wrong' }, { product: { ...f.price.product, id: 'prod_wrong' } }, { product: { ...f.price.product, active: false } }, { currency: 'unknown' }]) {
    f.provider.price = async () => ({ ...f.price, ...patch }); await assert.rejects(f.check());
  }
});
test('restricted accounts do not get price reads and currency formatting preserves zero-decimal units', async () => {
  const f = await fixture(); f.account.charges_enabled = false;
  await assert.rejects(f.check()); assert.deepEqual(f.calls, ['account']);
  f.account.charges_enabled = true; f.price.currency = 'jpy';
  const result = await f.check(); assert.match(result.formattedAmount, /2,500/); assert.ok(!result.formattedAmount.includes('.00'));
});
test('mapping, authorization and owner changes during provider reads reject results', async () => {
  for (const kind of ['mapping', 'authorization', 'owner']) {
    const f = await fixture();
    f.provider.price = async () => {
      if (kind === 'mapping') await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: null } });
      if (kind === 'authorization') await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { revokedAt: new Date() } });
      if (kind === 'owner') await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
      return f.price;
    };
    try { await assert.rejects(f.check()); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  }
});
test('provider failure does not alter catalog or agency mappings', async () => {
  const f = await fixture(); const before = await db.agencyCatalog.findUnique({ where: { agencyId: f.agency.id } });
  f.provider.price = async () => { throw new Error('private provider details'); };
  await assert.rejects(f.check(), error => error instanceof Error && !error.message.includes('private provider details'));
  assert.deepEqual(await db.agencyCatalog.findUnique({ where: { agencyId: f.agency.id } }), before);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: f.agency.id } })).stripeConnectAccountId, f.accountId);
});
