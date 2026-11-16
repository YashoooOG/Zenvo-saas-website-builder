import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency } from '../src/lib/agencies';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { createAgencyInvitation, revokeAgencyInvitation, previewAgencyInvitation, acceptAgencyInvitation } from '../src/lib/agency-invitations';
import { changeAgencyMember } from '../src/lib/agency-team';
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `invite_${randomUUID()}`;
const owner = `${prefix}_owner`, guest = `${prefix}_guest`, other = `${prefix}_other`;
const email = `${prefix}@example.test`;
let agencyId: string;
const identity = { id: guest, email, verified: true };
const invite = (address = email) => createAgencyInvitation(db, owner, { agencyId, email: address, role: 'MEMBER' });
before(async () => {
  await db.user.createMany({ data: [{ id: owner, email: `${prefix}_owner@example.test` }, { id: guest, email }, { id: other }] });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Invitation fixture', creationKey: randomUUID() })).id;
});
after(async () => { try { await db.agency.deleteMany({ where: { ownerId: owner } }); await db.user.deleteMany({ where: { id: { in: [owner, guest, other] } } }); } finally { await db.$disconnect(); } });

test('only owners issue/revoke invitations and token storage is hashed', async () => {
  for (const actor of [guest, other]) await assert.rejects(createAgencyInvitation(db, actor, { agencyId, email, role: 'ADMIN' }));
  const result = await invite();
  const row = await db.agencyInvitation.findUniqueOrThrow({ where: { id: result.id } });
  assert.notEqual(row.tokenHash, result.token); assert.equal(result.token.length, 64);
  await assert.rejects(revokeAgencyInvitation(db, other, agencyId, result.id));
  await revokeAgencyInvitation(db, owner, agencyId, result.id);
  await assert.rejects(acceptAgencyInvitation(db, identity, result.token));
});
test('verification, intended email, expiration, malformed and revoked tokens deny access', async () => {
  const result = await invite();
  for (const person of [{ ...identity, verified: false }, { ...identity, email: 'wrong@example.test' }]) {
    assert.equal(await previewAgencyInvitation(db, person, result.token), null);
    await assert.rejects(acceptAgencyInvitation(db, person, result.token));
  }
  await assert.rejects(acceptAgencyInvitation(db, identity, 'invalid'));
  await db.agencyInvitation.update({ where: { id: result.id }, data: { expiresAt: new Date(0) } });
  assert.equal(await previewAgencyInvitation(db, identity, result.token), null);
  await assert.rejects(acceptAgencyInvitation(db, identity, result.token));
});
test('replacement invalidates previous link and preview reveals only the matching invitation', async () => {
  const first = await invite(), second = await invite(email.toUpperCase());
  await assert.rejects(acceptAgencyInvitation(db, identity, first.token));
  assert.equal((await previewAgencyInvitation(db, identity, second.token))?.agency.name, 'Invitation fixture');
  await revokeAgencyInvitation(db, owner, agencyId, second.id);
});
test('concurrent acceptance creates one membership and consumed invitations cannot restore removed access', async () => {
  const result = await invite();
  const results = await Promise.all([1, 2].map(() => acceptAgencyInvitation(db, identity, result.token)));
  assert.deepEqual(results, [agencyId, agencyId]);
  assert.equal(await db.agencyMembership.count({ where: { agencyId, userId: guest } }), 1);
  const member = await db.agencyMembership.findUniqueOrThrow({ where: { agencyId_userId: { agencyId, userId: guest } } });
  await changeAgencyMember(db, owner, { agencyId, userId: guest, version: member.version, role: 'REMOVE' });
  await assert.rejects(acceptAgencyInvitation(db, identity, result.token));
});
test('an invitation never elevates an existing member and rejects duplicate invitations to members', async () => {
  const result = await createAgencyInvitation(db, owner, { agencyId, email, role: 'ADMIN' });
  await db.agencyMembership.create({ data: { agencyId, userId: guest, role: 'MEMBER' } });
  await acceptAgencyInvitation(db, identity, result.token);
  assert.equal((await db.agencyMembership.findUniqueOrThrow({ where: { agencyId_userId: { agencyId, userId: guest } } })).role, 'MEMBER');
  await assert.rejects(invite());
  await db.agencyMembership.delete({ where: { agencyId_userId: { agencyId, userId: guest } } });
});
test('deleted invitees and deleted agency owners cannot accept', async () => {
  const result = await invite();
  for (const id of [guest, owner]) {
    await db.user.update({ where: { id }, data: { deletedAt: new Date() } });
    try { await assert.rejects(acceptAgencyInvitation(db, identity, result.token)); }
    finally { await db.user.update({ where: { id }, data: { deletedAt: null } }); }
  }
});
test('rate limiting and unsupported client/owner roles are enforced server-side', async () => {
  for (const role of ['OWNER', 'CLIENT']) await assert.rejects(createAgencyInvitation(db, owner, { agencyId, email, role }));
  const count = await db.agencyInvitation.count({ where: { agencyId } });
  for (let i = count; i < 20; i++) await invite(`${prefix}_${i}@example.test`);
  await assert.rejects(invite(`${prefix}_overflow@example.test`));
});
