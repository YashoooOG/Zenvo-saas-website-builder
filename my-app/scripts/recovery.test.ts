import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { AgencyAccessError } from '../src/lib/agency-access';
import { parseRecoveryArguments, recoverAgencyCheckout, type RecoveryProvider } from '../src/lib/billing-recovery';

const db = createDatabaseClient(process.env.DATABASE_URL);
const tag = randomUUID().replaceAll('-', '');
const owner = `recovery_${tag}`, admin = `${owner}_admin`;
const customerId = `cus_${tag}`, sessionId = `cs_test_${tag}`;
const started = new Date(Date.now() - 48 * 3600000);
const created = Math.floor(started.getTime() / 1000) + 10;
const expires = Math.floor(started.getTime() / 1000) + 3600;
let agencyId: string;
before(async () => {
  await db.user.createMany({ data: [{ id: owner }, { id: admin }] });
  agencyId = (await db.agency.create({ data: { name: 'Recovery fixture', ownerId: owner, checkout: { create: { customerKey: randomUUID(), customerStartedAt: started } } } })).id;
  await db.agencyMembership.create({ data: { agencyId, userId: admin, role: 'ADMIN' } });
});
after(async () => {
  try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, admin] } } }); }
  finally { await db.$disconnect(); }
});
function customer() { return { id: customerId, created, livemode: false, metadata: { zenvoAgencyId: agencyId } }; }
function session() {
  return { id: sessionId, customer: customerId, created, livemode: false, mode: 'subscription', status: 'expired', expires_at: expires,
    metadata: { zenvoAgencyId: agencyId }, success_url: `http://localhost:3115/agency/${agencyId}/billing`, cancel_url: `http://localhost:3115/agency/${agencyId}/billing`,
    line_items: { has_more: false, data: [{ quantity: 1, price: { id: 'price_fixture', livemode: false } }] } };
}
const provider: RecoveryProvider = { customer: async () => customer(), session: async () => session() };
const state = () => db.agencyCheckout.findUniqueOrThrow({ where: { agencyId } });
const input = () => ({ ownerId: owner, agencyId });

test('CLI rejects unknown flags, ambiguous candidates and apply without a fingerprint', () => {
  assert.deepEqual(parseRecoveryArguments(['--owner', 'owner', '--agency', 'agency']).apply, false);
  for (const args of [[], ['--owner', 'a', '--agency', 'b', '--apply'], ['--owner', 'a', '--agency', 'b', '--customer', 'cus_a', '--session', 'cs_test_b'], ['--owner', 'a', '--agency', 'b', '--reset'], ['--owner', 'a', '--owner', 'b', '--agency', 'c']]) assert.throws(() => parseRecoveryArguments(args));
});
test('local inspection needs no provider and does not expose retry keys', async () => {
  const beforeState = await state(); const report = await recoverAgencyCheckout(db, input());
  assert.equal(report.outcome, 'inspection'); assert.equal(JSON.stringify(report).includes(beforeState.customerKey), false);
  assert.deepEqual(await state(), beforeState);
});
test('non-owners cannot inspect or repair checkout recovery state', async () => {
  for (const ownerId of [admin, 'missing']) await assert.rejects(recoverAgencyCheckout(db, { ...input(), ownerId }), AgencyAccessError);
});
test('candidate previews do not write and reject foreign, live, deleted or mistimed customers', async () => {
  const candidate = { ...input(), customerId };
  assert.equal((await recoverAgencyCheckout(db, candidate, provider)).outcome, 'verified-preview');
  for (const change of [{ id: 'cus_other' }, { livemode: true }, { deleted: true }, { created: created - 3600 }, { created: created + 24 * 3600 }, { metadata: { zenvoAgencyId: 'other' } }]) await assert.rejects(recoverAgencyCheckout(db, candidate, { ...provider, customer: async () => ({ ...customer(), ...change }) }));
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).stripeCustomerId, null);
  assert.equal(await db.billingRecoveryReceipt.count({ where: { agencyId } }), 0);
});
test('stale fingerprints stop repair before a provider call', async () => {
  const candidate = { ...input(), customerId }; const preview = await recoverAgencyCheckout(db, candidate, provider);
  await db.agencyCheckout.update({ where: { agencyId }, data: { customerKey: randomUUID() } });
  let calls = 0;
  await assert.rejects(recoverAgencyCheckout(db, { ...candidate, apply: true, expect: preview.fingerprint }, { ...provider, customer: async () => { calls++; return customer(); } }), /state changed/);
  assert.equal(calls, 0);
});
test('explicit customer repair preserves keys and writes one audit receipt', async () => {
  const candidate = { ...input(), customerId }; const preview = await recoverAgencyCheckout(db, candidate, provider); const beforeState = await state();
  const report = await recoverAgencyCheckout(db, { ...candidate, apply: true, expect: preview.fingerprint }, provider);
  assert.equal(report.outcome, 'linked'); assert.deepEqual(await state(), beforeState);
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).stripeCustomerId, customerId);
  const receipts = await db.billingRecoveryReceipt.findMany({ where: { agencyId } }); assert.equal(receipts.length, 1); assert.equal(receipts[0].kind, 'customer');
  const next = await recoverAgencyCheckout(db, candidate, provider);
  assert.equal((await recoverAgencyCheckout(db, { ...candidate, apply: true, expect: next.fingerprint }, provider)).outcome, 'already-linked');
  assert.equal(await db.billingRecoveryReceipt.count({ where: { agencyId } }), 1);
});
test('session recovery verifies the complete original attempt and rechecks on apply', async () => {
  await db.agencyCheckout.update({ where: { agencyId }, data: { attemptKey: randomUUID(), attemptStartedAt: started, priceId: 'price_fixture', origin: 'http://localhost:3115', expiresAt: expires } });
  const candidate = { ...input(), sessionId };
  for (const change of [{ customer: 'cus_other' }, { expires_at: expires + 1 }, { success_url: 'https://evil.example' }, { created: created - 3600 }, { metadata: { zenvoAgencyId: 'other' } }, { line_items: { has_more: true, data: session().line_items.data } }, { line_items: { has_more: false, data: [{ quantity: 2, price: { id: 'price_fixture', livemode: false } }] } }]) await assert.rejects(recoverAgencyCheckout(db, candidate, { ...provider, session: async () => ({ ...session(), ...change }) }));
  const preview = await recoverAgencyCheckout(db, candidate, provider); const beforeState = await state();
  await assert.rejects(recoverAgencyCheckout(db, { ...candidate, apply: true, expect: preview.fingerprint }, { ...provider, session: async () => ({ ...session(), livemode: true }) }));
  assert.deepEqual(await state(), beforeState);
  assert.equal((await recoverAgencyCheckout(db, { ...candidate, apply: true, expect: preview.fingerprint }, provider)).outcome, 'linked');
  assert.deepEqual(await state(), { ...beforeState, sessionId });
  assert.equal(await db.billingRecoveryReceipt.count({ where: { agencyId, kind: 'session' } }), 1);
  assert.equal(await db.agencySubscription.count({ where: { agencyId } }), 0);
});
test('recovery cannot replace an existing customer or checkout session', async () => {
  await assert.rejects(recoverAgencyCheckout(db, { ...input(), customerId: 'cus_other' }, provider), /different customer/);
  await assert.rejects(recoverAgencyCheckout(db, { ...input(), sessionId: 'cs_test_other' }, provider), /different checkout/);
});
