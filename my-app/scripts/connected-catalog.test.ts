import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { getConnectedCatalog, syncConnectedCatalog, type CatalogProvider } from '../src/lib/connected-catalog';
import { syncConnectEvent } from '../src/lib/connect-events';

const db = createDatabaseClient(process.env.DATABASE_URL);
const uid = () => randomUUID().replaceAll('-', '');
const owner = `catalog_${uid()}`, other = `${owner}_other`;
const accounts: string[] = [];
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID: 'ca_fixture', ZENVO_APP_URL: 'http://localhost:3115' };
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => {
  try {
    await db.agency.deleteMany({ where: { ownerId: owner } });
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await db.connectWebhookReceipt.deleteMany({ where: { accountId: { in: accounts } } });
    await db.connectAccountSync.deleteMany({ where: { accountId: { in: accounts } } });
  } finally { await db.$disconnect(); }
});
async function fixture() {
  const accountId = `acct_${uid()}`; accounts.push(accountId);
  const agency = await db.agency.create({ data: { name: 'Catalog fixture', ownerId: owner, stripeConnectAccountId: accountId } });
  const product = { id: `prod_${uid()}`, name: 'Consultation', active: true, livemode: false, metadata: { private: 'discard this' } };
  const price = { id: `price_${uid()}`, product: product.id, active: true, livemode: false, currency: 'usd', type: 'one_time', billing_scheme: 'per_unit', unit_amount: 2500, unit_amount_decimal: '2500', custom_unit_amount: null, transform_quantity: null };
  const provider: CatalogProvider = {
    async account(id) { assert.equal(id, accountId); return { id, type: 'standard', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null } }; },
    async products(id) { assert.equal(id, accountId); return { data: [product], has_more: false }; },
    async prices(id, active) { assert.equal(id, accountId); return { data: active ? [price] : [], has_more: false }; },
  };
  const sync = () => syncConnectedCatalog(db, owner, agency.id, env, () => provider);
  return { agency, accountId, product, price, provider, sync };
}

test('owner imports sanitized products/prices; repeat sync replaces deleted products and handles empty catalogs', async () => {
  const f = await fixture(); assert.deepEqual(await f.sync(), { products: 1, prices: 1 });
  const saved = await getConnectedCatalog(db, owner, f.agency.id);
  assert.equal(saved?.products[0].prices[0].supported, true);
  assert.ok(!JSON.stringify(saved).includes('discard this'));
  f.provider.products = async () => ({ data: [], has_more: false });
  f.provider.prices = async () => ({ data: [], has_more: false });
  await f.sync(); assert.deepEqual((await getConnectedCatalog(db, owner, f.agency.id))?.products, []);
});

test('admin, outsider, deleted owner and disconnected agency cannot synchronize or read a foreign catalog', async () => {
  const f = await fixture(); let calls = 0;
  await db.agencyMembership.create({ data: { agencyId: f.agency.id, userId: other, role: 'ADMIN' } });
  for (const actor of [other, 'missing']) {
    await assert.rejects(syncConnectedCatalog(db, actor, f.agency.id, env, () => { calls++; return f.provider; }));
    await assert.rejects(getConnectedCatalog(db, actor, f.agency.id));
  }
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(f.sync()); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: null } });
  await assert.rejects(f.sync()); assert.equal(calls, 0); assert.equal(await getConnectedCatalog(db, owner, f.agency.id), null);
});

test('pagination uses cursors and imports inactive prices without enabling unsupported pricing', async () => {
  const f = await fixture(); const second = { ...f.product, id: `prod_${uid()}`, name: 'Archived service', active: false };
  f.provider.products = async (_id, cursor) => cursor === undefined ? { data: [f.product], has_more: true } : (assert.equal(cursor, f.product.id), { data: [second], has_more: false });
  f.provider.prices = async (_id, active) => ({ data: active ? [{ ...f.price, type: 'recurring' }] : [{ ...f.price, id: `price_${uid()}`, product: second.id, active: false }], has_more: false });
  await f.sync(); const saved = await getConnectedCatalog(db, owner, f.agency.id);
  assert.equal(saved?.products.length, 2); assert.ok(saved?.products.every(p => p.prices.every(price => !price.supported)));
});

test('provider failures, live objects, duplicate pages and missing products preserve the last complete snapshot', async () => {
  const f = await fixture(); await f.sync(); const before = await getConnectedCatalog(db, owner, f.agency.id);
  const original = f.provider.products;
  for (const products of [async () => { throw new Error('provider failed'); }, async () => ({ data: [{ ...f.product, livemode: true }], has_more: false }), async () => ({ data: [f.product], has_more: true }), async () => ({ data: [], has_more: false })]) {
    f.provider.products = products; await assert.rejects(f.sync()); assert.deepEqual(await getConnectedCatalog(db, owner, f.agency.id), before);
  }
  f.provider.products = original;
  f.provider.prices = async () => ({ data: [{ ...f.price, livemode: true }], has_more: false });
  await assert.rejects(f.sync()); assert.deepEqual(await getConnectedCatalog(db, owner, f.agency.id), before);
});

test('bounded pagination refuses a truncated catalog', async () => {
  const f = await fixture(); let calls = 0;
  f.provider.products = async () => { calls++; return { data: [{ ...f.product, id: `prod_${uid()}` }], has_more: true }; };
  await assert.rejects(f.sync(), /limit/); assert.equal(calls, 5);
  assert.equal(await getConnectedCatalog(db, owner, f.agency.id), null);
});

test('an older overlapping sync cannot overwrite the latest requested snapshot', async () => {
  const f = await fixture(); const original = f.provider.products; let entered!: () => void; let resume!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { resume = resolve; });
  f.provider.products = async (...args) => { entered(); await gate; return original(...args); };
  const first = assert.rejects(f.sync()); await started;
  f.provider.products = async () => ({ data: [{ ...f.product, name: 'New snapshot' }], has_more: false });
  await f.sync(); resume(); await first;
  assert.equal((await getConnectedCatalog(db, owner, f.agency.id))?.products[0].name, 'New snapshot');
});

test('revocation during remote reads clears cached products and rejects the in-flight sync', async () => {
  const f = await fixture(); await f.sync();
  f.provider.products = async () => {
    await syncConnectEvent(db, { id: `evt_${uid()}`, type: 'account.application.deauthorized', account: f.accountId, created: Math.floor(Date.now() / 1000), livemode: false, data: { object: { id: env.STRIPE_CONNECT_CLIENT_ID, object: 'application' } } }, async () => { throw new Error('Unexpected provider read'); });
    return { data: [f.product], has_more: false };
  };
  await assert.rejects(f.sync()); assert.equal(await getConnectedCatalog(db, owner, f.agency.id), null);
  assert.equal(await db.agencyCatalog.findUnique({ where: { agencyId: f.agency.id } }), null);
});

test('owner deletion or account replacement during reads prevents saving', async () => {
  const f = await fixture();
  f.provider.products = async () => { await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } }); return { data: [f.product], has_more: false }; };
  try { await assert.rejects(f.sync()); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  f.provider.products = async () => { await db.agency.update({ where: { id: f.agency.id }, data: { stripeConnectAccountId: `acct_${uid()}` } }); return { data: [f.product], has_more: false }; };
  await assert.rejects(f.sync()); assert.equal(await getConnectedCatalog(db, owner, f.agency.id), null);
});

test('same-account reauthorization during reads invalidates the old synchronization', async () => {
  const f = await fixture();
  f.provider.products = async () => {
    await db.connectAccountSync.update({ where: { accountId: f.accountId }, data: { linkedStartedAt: new Date() } });
    return { data: [f.product], has_more: false };
  };
  await assert.rejects(f.sync()); assert.equal(await getConnectedCatalog(db, owner, f.agency.id), null);
});

test('a mismatched account response prevents catalog reads', async () => {
  const f = await fixture(); const original = f.provider.account; let reads = 0;
  f.provider.account = async id => ({ ...await original(id) as object, id: 'acct_wrong' });
  f.provider.products = async () => { reads++; return { data: [], has_more: false }; };
  await assert.rejects(f.sync()); assert.equal(reads, 0);
});
