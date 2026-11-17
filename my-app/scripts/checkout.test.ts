import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { createDatabaseClient } from '../src/lib/database-client';
import { AgencyAccessError } from '../src/lib/agency-access';
import { checkoutConfiguration, checkoutSessionParameters, CheckoutError, checkoutRedirect, startAgencyCheckout, type CheckoutProvider, type CheckoutSession, type CheckoutInput } from '../src/lib/checkout';

const db = createDatabaseClient(process.env.DATABASE_URL);
const owner = `checkout_${randomUUID()}`, other = `${owner}_other`;
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: 'price_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', ZENVO_APP_URL: 'http://localhost:3115' };
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => {
  try { await db.agency.deleteMany({ where: { ownerId: { in: [owner, other] } } }); await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); }
  finally { await db.$disconnect(); }
});
const agency = async () => (await db.agency.create({ data: { name: 'Checkout fixture', ownerId: owner } })).id;
function provider(): CheckoutProvider & { customerKeys: string[]; sessionKeys: string[]; sessions: Map<string, CheckoutSession>; blocked: boolean; loseCustomer: boolean; loseSession: boolean } {
  const customers = new Map<string, { id: string; livemode: boolean; metadata: Record<string, string> }>();
  const sessions = new Map<string, CheckoutSession>();
  const fixture = {
    customerKeys: [] as string[], sessionKeys: [] as string[], sessions, blocked: false, loseCustomer: false, loseSession: false,
    async price() { return { id: 'price_fixture', active: true, livemode: false, product: { active: true, livemode: false, name: 'Test plan' }, type: 'recurring', recurring: { usage_type: 'licensed', interval: 'month', interval_count: 1 }, billing_scheme: 'per_unit', transform_quantity: null, custom_unit_amount: null, unit_amount: 2900, currency: 'usd' } as unknown as Stripe.Price; },
    async createCustomer(agencyId: string, key: string) {
      fixture.customerKeys.push(key);
      if (!customers.has(key)) customers.set(key, { id: `cus_${randomUUID().replaceAll('-', '')}`, livemode: false, metadata: { zenvoAgencyId: agencyId } });
      if (fixture.loseCustomer) { fixture.loseCustomer = false; throw new Error('Simulated lost customer response'); }
      return customers.get(key)!;
    },
    async hasSubscription() { return fixture.blocked; },
    async createSession(input: CheckoutInput, key: string) {
      fixture.sessionKeys.push(key);
      const persisted = await db.agency.findUniqueOrThrow({ where: { id: input.agencyId } });
      assert.equal(persisted.stripeCustomerId, input.customerId, 'Customer mapping must be committed before checkout');
      assert.equal(input.priceId, env.STRIPE_PRICE_ID); assert.equal(input.origin, env.ZENVO_APP_URL);
      if (!sessions.has(key)) sessions.set(key, { id: `cs_test_${randomUUID().replaceAll('-', '')}`, customer: input.customerId, subscription: null, livemode: false, mode: 'subscription', status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture', metadata: { zenvoAgencyId: input.agencyId }, expires_at: input.expiresAt });
      if (fixture.loseSession) { fixture.loseSession = false; throw new Error('Simulated lost session response'); }
      return sessions.get(key)!;
    },
    async getSession(id: string) { const value = [...sessions.values()].find(session => session.id === id); assert.ok(value); return value; },
  };
  return fixture;
}
const start = (id: string, service: CheckoutProvider, settings = env, actor = owner) => startAgencyCheckout(db, actor, id, settings, service);

test('canonical origin and webhook configuration fail closed', () => {
  assert.equal(checkoutConfiguration(env).origin, 'http://localhost:3115');
  for (const origin of ['', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com/?next=evil', 'http://example.com']) assert.throws(() => checkoutConfiguration({ ...env, ZENVO_APP_URL: origin }), CheckoutError);
  assert.throws(() => checkoutConfiguration({ ...env, STRIPE_WEBHOOK_SECRET: '' }), CheckoutError);
});

test('Checkout uses one configured price, card payments and subscription metadata, with no success claims in return URLs', () => {
  const parameters = checkoutSessionParameters({ agencyId: 'agency', customerId: 'cus_fixture', priceId: 'price_fixture', origin: env.ZENVO_APP_URL, expiresAt: 1800000000 });
  assert.equal(parameters.mode, 'subscription'); assert.equal(parameters.customer, 'cus_fixture');
  assert.deepEqual(parameters.line_items, [{ price: 'price_fixture', quantity: 1 }]);
  assert.deepEqual(parameters.allowed_payment_method_types, ['card']);
  assert.deepEqual(parameters.subscription_data?.metadata, { zenvoAgencyId: 'agency' });
  assert.equal(parameters.success_url, `${env.ZENVO_APP_URL}/agency/agency/billing`);
  assert.equal(parameters.cancel_url, parameters.success_url);
});

test('non-owners and deleted owners cannot contact the provider', async () => {
  const id = await agency(); const service = provider(); let calls = 0;
  service.price = async () => { calls++; throw new Error('Must not call'); };
  await db.agencyMembership.create({ data: { agencyId: id, userId: other, role: 'ADMIN' } });
  await assert.rejects(start(id, service, env, other), AgencyAccessError);
  await assert.rejects(start('unknown', service), AgencyAccessError);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(start(id, service), AgencyAccessError); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  assert.equal(calls, 0);
});

test('missing configuration makes no writes and invalid plans create no customer', async () => {
  const id = await agency(); const service = provider();
  await assert.rejects(start(id, service, { ...env, STRIPE_SECRET_KEY: '' }));
  assert.equal(await db.agencyCheckout.count({ where: { agencyId: id } }), 0);
  const price = await service.price('price_fixture'); service.price = async () => ({ ...price, livemode: true });
  await assert.rejects(start(id, service)); assert.equal(service.customerKeys.length, 0);
});

test('concurrent requests share one customer and one open checkout', async () => {
  const id = await agency(); const service = provider();
  const urls = await Promise.all([start(id, service), start(id, service)]);
  assert.equal(urls[0], urls[1]); assert.equal(service.customerKeys.length, 1); assert.equal(service.sessionKeys.length, 1);
  assert.equal(await start(id, service), urls[0]); assert.equal(service.sessionKeys.length, 1);
});

test('lost customer and session responses reuse durable idempotency keys', async () => {
  const id = await agency(); const service = provider(); service.loseCustomer = true;
  await assert.rejects(start(id, service)); service.loseSession = true;
  await assert.rejects(start(id, service)); await start(id, service);
  assert.equal(service.customerKeys.length, 2); assert.equal(new Set(service.customerKeys).size, 1);
  assert.equal(service.sessionKeys.length, 2); assert.equal(new Set(service.sessionKeys).size, 1);
  assert.equal(service.sessions.size, 1);
});

test('existing subscriptions prevent checkout creation', async () => {
  const id = await agency(); const service = provider(); service.blocked = true;
  await assert.rejects(start(id, service), /already has a subscription/);
  assert.equal(service.sessionKeys.length, 0);
});

test('expired sessions rotate only after a verified expiry; completed sessions wait for sync', async () => {
  const id = await agency(); const service = provider(); await start(id, service);
  const first = [...service.sessions.values()][0]; first.status = 'expired';
  await assert.rejects(start(id, service), /previous checkout has ended/);
  await start(id, service); assert.equal(service.sessions.size, 2);
  const second = [...service.sessions.values()][1]; second.status = 'complete'; second.subscription = 'sub_finished';
  await assert.rejects(start(id, service), /Checkout completed/);
  assert.equal(service.sessions.size, 2);
  await db.agencySubscription.create({ data: { id: second.subscription, agencyId: id, priceId: 'price_fixture', status: 'canceled', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false, collectionPaused: false } });
  await assert.rejects(start(id, service), /previous checkout has ended/);
  await start(id, service); assert.equal(service.sessions.size, 3);
});

test('uncertain attempts past the retry window require review instead of creating duplicates', async () => {
  const id = await agency(); const service = provider(); service.loseSession = true;
  await assert.rejects(start(id, service));
  await db.agencyCheckout.update({ where: { agencyId: id }, data: { attemptStartedAt: new Date(Date.now() - 24 * 3600000) } });
  await assert.rejects(start(id, service), /billing review/); assert.equal(service.sessionKeys.length, 1);
});

test('provider URLs and customer/agency/mode mismatches cannot redirect an owner', () => {
  const session: CheckoutSession = { id: 'cs_test_fixture', customer: 'cus_fixture', subscription: null, livemode: false, mode: 'subscription', status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture', metadata: { zenvoAgencyId: 'agency' }, expires_at: 1800000000 };
  assert.equal(checkoutRedirect(session, 'cus_fixture', 'agency'), session.url);
  for (const changes of [{ customer: 'cus_other' }, { metadata: { zenvoAgencyId: 'other' } }, { livemode: true }, { mode: 'payment' }, { url: 'https://checkout.stripe.com.evil.test' }, { url: 'javascript:alert(1)' }]) assert.throws(() => checkoutRedirect({ ...session, ...changes }, 'cus_fixture', 'agency'));
});

test('configuration changes during uncertain recovery do not create checkout with a different payload', async () => {
  const id = await agency(); const service = provider(); service.loseSession = true;
  await assert.rejects(start(id, service));
  await assert.rejects(start(id, service, { ...env, ZENVO_APP_URL: 'https://zenvo.example' }), /billing review/);
  assert.equal(service.sessionKeys.length, 1);
});
