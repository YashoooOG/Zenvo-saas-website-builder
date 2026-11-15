import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import env from '@next/env';
import { createDatabaseClient } from '../src/lib/database-client';
import { parseUserEvent, syncClerkUser } from '../src/lib/clerk-sync';
import { handleClerkWebhook } from '../src/lib/clerk-webhook';

env.loadEnvConfig(process.cwd());
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `zenvo_test_${randomUUID().replaceAll('-', '')}`;
const users: string[] = [];
const receipts: string[] = [];
const agencies: string[] = [];
const userId = () => { const id = `${prefix}_${users.length}`; users.push(id); return id; };
const receiptId = () => { const id = `${prefix}_evt_${receipts.length}`; receipts.push(id); return id; };
const now = Date.now();
const payload = (id: string, version = now, name = 'Test', type = 'user.created') => ({
  type, timestamp: version, data: {
    id, updated_at: version, first_name: name, last_name: 'User', image_url: 'https://example.com/avatar.png',
    primary_email_address_id: 'email_primary', email_addresses: [
      { id: 'email_secondary', email_address: 'secondary@example.com' },
      { id: 'email_primary', email_address: 'primary@example.com' },
    ],
  },
});
const parsed = (value: unknown) => { const event = parseUserEvent(value); assert.ok(event); return event; };

after(async () => {
  try {
    await db.agency.deleteMany({ where: { id: { in: agencies } } });
    await db.clerkWebhookReceipt.deleteMany({ where: { id: { in: receipts } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  } finally { await db.$disconnect(); }
});

test('MySQL rejects cross-agency memberships and cross-client pipeline/contact links', async () => {
  const rollback = new Error('Rollback only these transaction-owned fixtures');
  await assert.rejects(db.$transaction(async tx => {
    const owner = await tx.user.create({ data: { id: `${prefix}_owner` } });
    const a = await tx.agency.create({ data: { name: 'Test agency A', ownerId: owner.id } });
    const b = await tx.agency.create({ data: { name: 'Test agency B', ownerId: owner.id } });
    await tx.agencyMembership.create({ data: { agencyId: a.id, userId: owner.id, role: 'ADMIN' } });
    const first = await tx.subAccount.create({ data: { agencyId: a.id, name: 'Client A' } });
    const second = await tx.subAccount.create({ data: { agencyId: b.id, name: 'Client B' } });
    await assert.rejects(tx.subAccountMembership.create({ data: {
      agencyId: a.id, subAccountId: second.id, userId: owner.id,
    } }), { code: 'P2003' });
    const pipeline = await tx.pipeline.create({ data: { subAccountId: first.id, name: 'Sales' } });
    await assert.rejects(tx.lane.create({ data: { subAccountId: second.id, pipelineId: pipeline.id, name: 'Invalid' } }), { code: 'P2003' });
    const lane = await tx.lane.create({ data: { subAccountId: first.id, pipelineId: pipeline.id, name: 'Lead' } });
    const contact = await tx.contact.create({ data: { subAccountId: second.id, name: 'Other client contact' } });
    await assert.rejects(tx.ticket.create({ data: {
      subAccountId: first.id, pipelineId: pipeline.id, laneId: lane.id, contactId: contact.id, title: 'Invalid',
    } }), { code: 'P2003' });
    const ticket = await tx.ticket.create({ data: {
      subAccountId: first.id, pipelineId: pipeline.id, laneId: lane.id, title: 'Valid', value: '125.1250',
    } });
    assert.equal(ticket.value.toFixed(4), '125.1250');
    throw rollback;
  }), error => error === rollback);
});

test('funnel paths are unique per client and draft content stays separate', async () => {
  const rollback = new Error('Rollback fixture');
  await assert.rejects(db.$transaction(async tx => {
    const user = await tx.user.create({ data: { id: `${prefix}_funnel` } });
    const agency = await tx.agency.create({ data: { ownerId: user.id, name: 'Fixture' } });
    const account = await tx.subAccount.create({ data: { agencyId: agency.id, name: 'Fixture' } });
    const funnel = await tx.funnel.create({ data: { subAccountId: account.id, name: 'Website' } });
    const page = await tx.funnelPage.create({ data: { subAccountId: account.id, funnelId: funnel.id, name: 'Home', path: '/', draftContent: { children: [] } } });
    assert.equal(page.publishedContent, null);
    assert.equal(page.publishedAt, null);
    await assert.rejects(tx.funnelPage.create({ data: { subAccountId: account.id, funnelId: funnel.id, name: 'Duplicate', path: '/', draftContent: {} } }), { code: 'P2002' });
    throw rollback;
  }), error => error === rollback);
});

test('create/update uses primary email, ignores stale data and handles duplicate receipts', async () => {
  const id = userId();
  const created = receiptId();
  assert.equal(await syncClerkUser(db, created, parsed(payload(id))), 'applied');
  assert.equal(await syncClerkUser(db, created, parsed(payload(id))), 'duplicate');
  assert.equal(await syncClerkUser(db, receiptId(), parsed(payload(id, now + 10, 'Latest', 'user.updated'))), 'applied');
  assert.equal(await syncClerkUser(db, receiptId(), parsed(payload(id, now + 5, 'Stale', 'user.updated'))), 'stale');
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.name, 'Latest User');
  assert.equal(user.email, 'primary@example.com');
  assert.equal(user.clerkUpdatedAt, BigInt(now + 10));
});

test('concurrent retries produce one receipt and one user mutation', async () => {
  const id = userId();
  const receipt = receiptId();
  const results = await Promise.all(Array.from({ length: 4 }, () => syncClerkUser(db, receipt, parsed(payload(id)))));
  assert.equal(results.filter(result => result === 'applied').length, 1);
  assert.equal(results.filter(result => result === 'duplicate').length, 3);
  assert.equal(await db.clerkWebhookReceipt.count({ where: { id: receipt } }), 1);
});

test('concurrent updates cannot regress the profile version', async () => {
  const id = userId();
  await Promise.all([5, 10, 2, 8].map(offset => syncClerkUser(db, receiptId(), parsed(payload(id, now + offset, `Version${offset}`, 'user.updated')))));
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.name, 'Version10 User');
});

test('deletion clears PII and cannot be undone by delayed creates or updates', async () => {
  const id = userId();
  await syncClerkUser(db, receiptId(), parsed(payload(id)));
  const agency = await db.agency.create({ data: { ownerId: id, name: 'Deletion fixture' } });
  agencies.push(agency.id);
  await db.agencyMembership.create({ data: { agencyId: agency.id, userId: id, role: 'ADMIN' } });
  const subAccount = await db.subAccount.create({ data: { agencyId: agency.id, name: 'Deletion client' } });
  await db.subAccountMembership.create({ data: { agencyId: agency.id, subAccountId: subAccount.id, userId: id, role: 'ADMIN' } });
  await syncClerkUser(db, receiptId(), parsed({ type: 'user.deleted', timestamp: now + 20, data: { id, deleted: true } }));
  assert.equal(await db.agencyMembership.count({ where: { userId: id } }), 0);
  assert.equal(await db.subAccountMembership.count({ where: { userId: id } }), 0);
  assert.equal(await db.agency.count({ where: { id: agency.id } }), 1);
  assert.equal(await syncClerkUser(db, receiptId(), parsed(payload(id, now + 30, 'Resurrected', 'user.updated'))), 'stale');
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  assert.ok(user.deletedAt);
  assert.equal(user.email, null);
  assert.equal(user.name, null);
  assert.equal(user.imageUrl, null);
  const early = userId();
  await syncClerkUser(db, receiptId(), parsed({ type: 'user.deleted', timestamp: now, data: { id: early, deleted: true } }));
  assert.equal(await syncClerkUser(db, receiptId(), parsed(payload(early, now - 10))), 'stale');
});

const key = randomBytes(32);
const signingSecret = `whsec_${key.toString('base64')}`;
function signedRequest(body: string, id = receiptId(), seconds = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', key).update(`${id}.${seconds}.${body}`).digest('base64');
  return new Request('http://localhost/api/clerk-webhook', { method: 'POST', body, headers: {
    'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(seconds), 'svix-signature': `v1,${signature}`,
  } });
}
const handle = (request: Request) => handleClerkWebhook(request, { signingSecret, db: () => db });

test('real Clerk verifier accepts valid signed delivery and rejects tampering or expiry', async () => {
  const id = userId();
  const body = JSON.stringify(payload(id));
  const receipt = receiptId();
  assert.equal((await handle(signedRequest(body, receipt))).status, 200);
  assert.equal((await handle(signedRequest(body, receipt))).status, 200);
  const signed = signedRequest(body);
  assert.equal((await handle(new Request(signed.url, { method: 'POST', headers: signed.headers, body: body.replace('Test', 'Tampered') }))).status, 400);
  assert.equal((await handle(signedRequest(body, receiptId(), Math.floor(Date.now() / 1000) - 600))).status, 400);
  assert.equal((await handle(new Request(signed.url, { method: 'POST', body }))).status, 400);
});

test('unconfigured and malformed webhooks cannot write; unknown events are acknowledged', async () => {
  let called = false;
  const noDb = () => { called = true; throw new Error('Must not access database'); };
  const request = signedRequest('{}');
  assert.equal((await handleClerkWebhook(request, { signingSecret: undefined, db: noDb })).status, 503);
  assert.equal((await handleClerkWebhook(signedRequest(JSON.stringify({ type: 'session.created', timestamp: now, data: {} })), { signingSecret, db: noDb })).status, 200);
  assert.equal((await handleClerkWebhook(signedRequest(JSON.stringify({ type: 'user.created', timestamp: now, data: {} })), { signingSecret, db: noDb })).status, 400);
  assert.equal((await handleClerkWebhook(signedRequest('x'.repeat(1024 * 1024 + 1)), { signingSecret, db: noDb })).status, 413);
  assert.equal(called, false);
});

test('failed persistence returns a retryable status and creates no receipt', async () => {
  const id = userId();
  const receipt = receiptId();
  const response = await handleClerkWebhook(signedRequest(JSON.stringify(payload(id)), receipt), {
    signingSecret, db: () => { throw new Error('Simulated unavailable database'); },
  });
  assert.equal(response.status, 503);
  assert.equal(await db.clerkWebhookReceipt.findUnique({ where: { id: receipt } }), null);
  assert.equal((await handle(signedRequest(JSON.stringify(payload(id)), receipt))).status, 200);
});

test('a database write failure rolls back its receipt so the same delivery can retry', async () => {
  const id = userId();
  const receipt = receiptId();
  const event = parsed(payload(id));
  await assert.rejects(syncClerkUser(db, receipt, { ...event, email: 'x'.repeat(321) }));
  assert.equal(await db.clerkWebhookReceipt.findUnique({ where: { id: receipt } }), null);
  assert.equal(await db.user.findUnique({ where: { id } }), null);
  assert.equal(await syncClerkUser(db, receipt, event), 'applied');
});
