import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { AgencyAccessError } from '../src/lib/agency-access';
import { BillingPortalError, openAgencyPortal, portalConfiguration, type PortalProvider } from '../src/lib/billing-portal';

const db = createDatabaseClient(process.env.DATABASE_URL);
const tag = randomUUID().replaceAll('-', '');
const owner = `portal_${tag}`, admin = `${owner}_admin`, other = `${owner}_other`;
const customerId = `cus_${tag}`;
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_fixture', ZENVO_APP_URL: 'http://localhost:3115' };
let agencyId: string;
let emptyId: string;
before(async () => {
  await db.user.createMany({ data: [owner, admin, other].map(id => ({ id })) });
  agencyId = (await db.agency.create({ data: { name: 'Portal fixture', ownerId: owner, stripeCustomerId: customerId } })).id;
  emptyId = (await db.agency.create({ data: { name: 'Empty portal fixture', ownerId: owner } })).id;
  await db.agencyMembership.create({ data: { agencyId, userId: admin, role: 'ADMIN' } });
});
after(async () => {
  try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, admin, other] } } }); }
  finally { await db.$disconnect(); }
});
function provider() {
  const calls: string[] = [];
  const service: PortalProvider = {
    async customer(id) { calls.push('customer'); return { id, livemode: false, metadata: { zenvoAgencyId: agencyId } }; },
    async configuration(id) { calls.push('configuration'); return { id, active: true, livemode: false, features: { subscription_update: { enabled: false } } }; },
    async createSession(input) {
      calls.push('session');
      assert.equal(input.customer, customerId); assert.equal(input.configuration, 'bpc_fixture');
      assert.equal(input.return_url, `${env.ZENVO_APP_URL}/agency/${agencyId}/billing`);
      return { ...input, livemode: false, url: 'https://billing.stripe.com/p/session/fixture' };
    },
  };
  return { service, calls };
}
const open = (service: PortalProvider, actor = owner, id = agencyId, settings = env) => openAgencyPortal(db, actor, id, settings, service);

test('portal configuration does not depend on a price but requires test credentials and a canonical origin', () => {
  assert.equal(portalConfiguration(env).configurationId, 'bpc_fixture');
  for (const changes of [{ STRIPE_SECRET_KEY: 'sk_live_fixture' }, { STRIPE_WEBHOOK_SECRET: '' }, { STRIPE_PORTAL_CONFIGURATION_ID: '' }, { STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_bad/path' }, { ZENVO_APP_URL: 'http://evil.example' }, { ZENVO_APP_URL: 'https://app.example/path' }, { ZENVO_APP_URL: 'https://user:pass@app.example' }, { ZENVO_APP_URL: 'https://app.example?redirect=evil' }]) assert.throws(() => portalConfiguration({ ...env, ...changes }), BillingPortalError);
});
test('only active agency owners can contact the portal provider', async () => {
  const { service, calls } = provider();
  for (const actor of [admin, other, 'missing']) await assert.rejects(open(service, actor), AgencyAccessError);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(open(service), AgencyAccessError); } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  assert.deepEqual(calls, []);
});
test('missing customer or configuration cannot create a session', async () => {
  const { service, calls } = provider();
  await assert.rejects(open(service, owner, emptyId), /Start checkout/);
  await assert.rejects(open(service, owner, agencyId, { ...env, STRIPE_PORTAL_CONFIGURATION_ID: '' }), BillingPortalError);
  assert.deepEqual(calls, []);
});
test('deleted, live and foreign customer records cannot open the portal', async () => {
  for (const changes of [{ deleted: true }, { livemode: true }, { id: 'cus_other' }, { metadata: { zenvoAgencyId: emptyId } }]) {
    const { service, calls } = provider();
    service.customer = async () => ({ id: customerId, livemode: false, metadata: { zenvoAgencyId: agencyId }, ...changes });
    await assert.rejects(open(service), /customer could not be verified/);
    assert.equal(calls.includes('session'), false);
  }
});
test('inactive, live, mismatched and plan-changing configurations cannot create sessions', async () => {
  for (const changes of [{ active: false }, { livemode: true }, { id: 'bpc_other' }, { features: { subscription_update: { enabled: true } } }]) {
    const { service, calls } = provider();
    service.configuration = async () => ({ id: 'bpc_fixture', active: true, livemode: false, features: { subscription_update: { enabled: false } }, ...changes });
    await assert.rejects(open(service), BillingPortalError); assert.equal(calls.includes('session'), false);
  }
});
test('verified owners receive a fresh portal URL without changing local subscriptions', async () => {
  const { service, calls } = provider();
  assert.equal(await open(service), 'https://billing.stripe.com/p/session/fixture');
  assert.equal(await open(service), 'https://billing.stripe.com/p/session/fixture');
  assert.equal(calls.filter(call => call === 'session').length, 2);
  assert.equal(await db.agencySubscription.count({ where: { agencyId } }), 0);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).stripeCustomerId, customerId);
});
test('foreign sessions, unsafe URLs, live sessions and tampered return URLs are rejected', async () => {
  for (const changes of [{ customer: 'cus_other' }, { configuration: 'bpc_other' }, { livemode: true }, { return_url: 'https://evil.example' }, { url: 'https://billing.stripe.com.evil.example' }, { url: 'javascript:alert(1)' }, { url: 'https://user:pass@billing.stripe.com/p/session' }]) {
    const { service } = provider(); const create = service.createSession;
    service.createSession = async input => ({ ...await create(input), ...changes });
    await assert.rejects(open(service), BillingPortalError);
  }
});
test('provider failure leaves the mapping unchanged and a later attempt can succeed', async () => {
  const { service } = provider(); const create = service.createSession;
  service.createSession = async () => { throw new Error('Synthetic provider failure'); };
  await assert.rejects(open(service), /Synthetic provider failure/);
  service.createSession = create; assert.ok(await open(service));
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).stripeCustomerId, customerId);
});
