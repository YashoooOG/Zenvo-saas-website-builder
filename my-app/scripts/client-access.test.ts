import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency } from '../src/lib/agencies';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { createSubAccount, getSubAccountAccess } from '../src/lib/subaccounts';
import { getAgencyAccess, AgencyAccessError } from '../src/lib/agency-access';
import { InvitationError } from '../src/lib/agency-invitations';
import { getClientAccessTeam, changeClientAccess, createClientInvitation, revokeClientInvitation, previewClientInvitation, acceptClientInvitation, ClientAccessConflict } from '../src/lib/client-access';
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `access_${randomUUID()}`;
const [owner, admin, member, client, recipient, outsider] = ['owner','admin','member','client','recipient','outsider'].map(role => `${prefix}_${role}`);
const ids = [owner, admin, member, client, recipient, outsider];
const email = `${prefix}@example.test`;
const identity = { id: recipient, email, verified: true };
let agencyId: string, subAccountId: string, siblingId: string, otherAgencyId: string;
const scope = () => ({ agencyId, subAccountId });
before(async () => {
  await db.user.createMany({ data: ids.map(id => ({ id, email: id === recipient ? email : `${id}@example.test` })) });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Access fixture', creationKey: randomUUID() })).id;
  otherAgencyId = (await createAgency(db, outsider, { ...emptyAgencyValues, name: 'Other agency', creationKey: randomUUID() })).id;
  await db.agencyMembership.createMany({ data: [{ agencyId, userId: admin, role: 'ADMIN' }, { agencyId, userId: member, role: 'MEMBER' }, { agencyId, userId: client, role: 'CLIENT' }] });
  subAccountId = (await createSubAccount(db, owner, { agencyId, name: 'Client one', creationKey: randomUUID() })).id;
  siblingId = (await createSubAccount(db, owner, { agencyId, name: 'Client two', creationKey: randomUUID() })).id;
});
after(async () => { try { await db.agency.deleteMany({ where: { ownerId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); } finally { await db.$disconnect(); } });
async function changeInput(userId = member) {
  const membership = await db.agencyMembership.findUniqueOrThrow({ where: { agencyId_userId: { agencyId, userId } } });
  const assignment = await db.subAccountMembership.findUnique({ where: { subAccountId_userId: { subAccountId, userId } } });
  return { ...scope(), userId, membershipVersion: membership.version, version: assignment?.version ?? null, role: 'GUEST' };
}
test('only owners can inspect or mutate client assignments and invitations', async () => {
  assert.equal((await getClientAccessTeam(db, owner, agencyId, subAccountId)).members.length, 4);
  const input = await changeInput();
  for (const actor of [admin, member, client, outsider]) {
    await assert.rejects(getClientAccessTeam(db, actor, agencyId, subAccountId), AgencyAccessError);
    await assert.rejects(changeClientAccess(db, actor, input), AgencyAccessError);
    await assert.rejects(createClientInvitation(db, actor, { ...scope(), email, role: 'GUEST' }), AgencyAccessError);
  }
  await assert.rejects(changeClientAccess(db, outsider, { ...input, agencyId: otherAgencyId }), AgencyAccessError);
  for (const userId of [owner, admin]) await assert.rejects(changeClientAccess(db, owner, await changeInput(userId)), AgencyAccessError);
});
test('assignments enforce role, isolation, concurrent stale checks, and removal', async () => {
  const input = await changeInput();
  const results = await Promise.allSettled([changeClientAccess(db, owner, input), changeClientAccess(db, owner, { ...input, role: 'ADMIN' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(await getSubAccountAccess(db, member, subAccountId));
  assert.equal(await getSubAccountAccess(db, member, siblingId), null);
  await assert.rejects(changeClientAccess(db, owner, input), ClientAccessConflict);
  await changeClientAccess(db, owner, { ...await changeInput(), role: 'MEMBER' });
  assert.equal((await getSubAccountAccess(db, member, subAccountId))?.role, 'MEMBER');
  await changeClientAccess(db, owner, { ...await changeInput(), role: 'REMOVE' });
  assert.equal(await getSubAccountAccess(db, member, subAccountId), null);
  await assert.rejects(changeClientAccess(db, owner, { ...await changeInput(), role: 'OWNER' }));
});
test('removed and recreated agency memberships reject stale assignments', async () => {
  const input = await changeInput(client);
  await db.agencyMembership.delete({ where: { agencyId_userId: { agencyId, userId: client } } });
  await db.agencyMembership.create({ data: { agencyId, userId: client, role: 'CLIENT' } });
  await assert.rejects(changeClientAccess(db, owner, input), ClientAccessConflict);
});
test('invitations are hashed, email bound, verified, expiring and workspace scoped', async () => {
  const invite = await createClientInvitation(db, owner, { ...scope(), email, role: 'MEMBER' });
  const other = await createClientInvitation(db, owner, { ...scope(), subAccountId: siblingId, email, role: 'GUEST' });
  const replacement = await createClientInvitation(db, owner, { ...scope(), email, role: 'GUEST' });
  assert.equal(await previewClientInvitation(db, identity, invite.token), null);
  assert.ok(await previewClientInvitation(db, identity, other.token));
  assert.equal((await previewClientInvitation(db, { ...identity, email: email.toUpperCase() }, replacement.token))?.role, 'GUEST');
  for (const invalid of [{ ...identity, email: 'wrong@example.test' }, { ...identity, verified: false }]) {
    assert.equal(await previewClientInvitation(db, invalid, replacement.token), null);
    await assert.rejects(acceptClientInvitation(db, invalid, replacement.token), InvitationError);
  }
  const stored = await db.subAccountInvitation.findFirstOrThrow({ where: { subAccountId, revokedAt: null } });
  assert.notEqual(stored.tokenHash, replacement.token);
  await assert.rejects(revokeClientInvitation(db, owner, { ...scope(), subAccountId: siblingId, id: stored.id }), InvitationError);
  await revokeClientInvitation(db, owner, { ...scope(), id: stored.id });
  await assert.rejects(acceptClientInvitation(db, identity, replacement.token), InvitationError);
  await db.subAccountInvitation.updateMany({ where: { subAccountId: siblingId }, data: { expiresAt: new Date(0) } });
  await assert.rejects(acceptClientInvitation(db, identity, other.token), InvitationError);
  assert.equal(await previewClientInvitation(db, identity, 'bad-token'), null);
});
test('acceptance is atomic and concurrent retries do not duplicate grants or expose agency', async () => {
  const invite = await createClientInvitation(db, owner, { ...scope(), email, role: 'MEMBER' });
  const results = await Promise.all([acceptClientInvitation(db, identity, invite.token), acceptClientInvitation(db, identity, invite.token)]);
  assert.deepEqual(results, [subAccountId, subAccountId]);
  assert.equal((await getSubAccountAccess(db, recipient, subAccountId))?.role, 'MEMBER');
  assert.equal(await getAgencyAccess(db, recipient, agencyId), null);
  assert.equal(await getSubAccountAccess(db, recipient, siblingId), null);
  assert.equal(await previewClientInvitation(db, identity, invite.token), null);
  await changeClientAccess(db, owner, { ...await changeInput(recipient), role: 'REMOVE' });
  await assert.rejects(acceptClientInvitation(db, identity, invite.token), InvitationError);
});
test('pending links cannot elevate roles assigned after issuance', async () => {
  await db.agencyMembership.delete({ where: { agencyId_userId: { agencyId, userId: recipient } } });
  const invite = await createClientInvitation(db, owner, { ...scope(), email, role: 'ADMIN' });
  await db.agencyMembership.create({ data: { agencyId, userId: recipient, role: 'MEMBER' } });
  await changeClientAccess(db, owner, { ...await changeInput(recipient), role: 'GUEST' });
  await acceptClientInvitation(db, identity, invite.token);
  assert.equal((await getAgencyAccess(db, recipient, agencyId))?.role, 'MEMBER');
  assert.equal((await getSubAccountAccess(db, recipient, subAccountId))?.role, 'GUEST');
  await assert.rejects(createClientInvitation(db, owner, { ...scope(), email, role: 'ADMIN' }), InvitationError);
});
test('archived workspaces deny grants and acceptance but allow removing assignments', async () => {
  const invite = await createClientInvitation(db, owner, { ...scope(), email: `${outsider}@example.test`, role: 'GUEST' });
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: false } });
  await assert.rejects(changeClientAccess(db, owner, await changeInput()), ClientAccessConflict);
  await assert.rejects(createClientInvitation(db, owner, { ...scope(), email: 'new@example.test', role: 'GUEST' }), InvitationError);
  const target = { id: outsider, email: `${outsider}@example.test`, verified: true };
  assert.equal(await previewClientInvitation(db, target, invite.token), null);
  await assert.rejects(acceptClientInvitation(db, target, invite.token), InvitationError);
  await changeClientAccess(db, owner, { ...await changeInput(recipient), role: 'REMOVE' });
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: true } });
});
test('deleted targets and owners cannot receive or manage client access', async () => {
  const input = await changeInput();
  await db.user.update({ where: { id: member }, data: { deletedAt: new Date() } });
  await assert.rejects(changeClientAccess(db, owner, input), ClientAccessConflict);
  const invite = await createClientInvitation(db, owner, { ...scope(), email: `${outsider}@example.test`, role: 'GUEST' });
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  assert.equal(await previewClientInvitation(db, { id: outsider, email: `${outsider}@example.test`, verified: true }, invite.token), null);
  await assert.rejects(getClientAccessTeam(db, owner, agencyId, subAccountId), AgencyAccessError);
});
