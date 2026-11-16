import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency, updateAgency } from '../src/lib/agencies';
import { AgencyAccessError, getAgencyAccess, listAccessibleAgencies } from '../src/lib/agency-access';
import { changeAgencyMember, getAgencyTeam, TeamConflictError } from '../src/lib/agency-team';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { beginLogoUpload, completeLogoUpload, removeAgencyLogo } from '../src/lib/agency-logos';
import { workspaceLinks } from '../src/lib/workspace-navigation';

const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `roles_${randomUUID()}`;
const owner = `${prefix}_owner`, admin = `${prefix}_admin`, member = `${prefix}_member`, client = `${prefix}_client`, outsider = `${prefix}_outsider`;
const ids = [owner, admin, member, client, outsider];
const fields = { ...emptyAgencyValues, name: 'Permission fixture' };
let agencyId: string;
before(async () => {
  await db.user.createMany({ data: ids.map(id => ({ id })) });
  agencyId = (await createAgency(db, owner, { ...fields, creationKey: randomUUID() })).id;
  await db.agencyMembership.createMany({ data: [{ agencyId, userId: admin, role: 'ADMIN' }, { agencyId, userId: member, role: 'MEMBER' }, { agencyId, userId: client, role: 'CLIENT' }] });
});
after(async () => {
  try {
    await db.agencyLogoAsset.deleteMany({ where: { actorId: { in: ids } } });
    await db.agency.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  } finally { await db.$disconnect(); }
});
async function membership(userId: string) { return db.agencyMembership.findUniqueOrThrow({ where: { agencyId_userId: { agencyId, userId } } }); }

test('owner/admin/member/client/outsider reads follow the permission matrix and navigation matches', async () => {
  for (const [id, role] of [[owner, 'OWNER'], [admin, 'ADMIN'], [member, 'MEMBER']] as const) {
    const access = await getAgencyAccess(db, id, agencyId);
    assert.equal(access?.role, role);
    assert.equal(Boolean(await getAgencyAccess(db, id, agencyId, 'settings')), role !== 'MEMBER');
    assert.equal(Boolean(await getAgencyAccess(db, id, agencyId, 'team')), role === 'OWNER');
    const agencies = await listAccessibleAgencies(db, id);
    assert.equal(agencies.length, 1);
    const links = workspaceLinks(agencies[0]);
    assert.equal(links.some(link => link.label === 'Team'), role === 'OWNER');
    assert.equal(links.some(link => link.label === 'Agency settings'), role !== 'MEMBER');
  }
  for (const id of [client, outsider, `${prefix}_missing`]) {
    assert.equal(await getAgencyAccess(db, id, agencyId), null);
    assert.deepEqual(await listAccessibleAgencies(db, id), []);
    await assert.rejects(getAgencyTeam(db, id, agencyId), AgencyAccessError);
  }
});

test('admins can edit details but cannot read team details, change roles, or self-promote', async () => {
  const current = await db.agency.findUniqueOrThrow({ where: { id: agencyId } });
  await updateAgency(db, admin, { ...fields, id: agencyId, revision: current.revision, name: 'Admin edit' });
  await assert.rejects(getAgencyTeam(db, admin, agencyId), AgencyAccessError);
  for (const actor of [admin, member, client, outsider]) await assert.rejects(changeAgencyMember(db, actor, { agencyId, userId: member, version: (await membership(member)).version, role: 'ADMIN' }), AgencyAccessError);
  for (const actor of [member, client, outsider]) await assert.rejects(updateAgency(db, actor, { ...fields, id: agencyId, revision: current.revision + 1 }), AgencyAccessError);
});

test('owners cannot be demoted or removed and arbitrary roles and tenant targets are rejected', async () => {
  for (const role of ['MEMBER', 'REMOVE']) await assert.rejects(changeAgencyMember(db, owner, { agencyId, userId: owner, version: (await membership(owner)).version, role }), AgencyAccessError);
  await assert.rejects(changeAgencyMember(db, owner, { agencyId, userId: member, version: (await membership(member)).version, role: 'OWNER' }));
  const foreign = await createAgency(db, outsider, { ...fields, creationKey: randomUUID() });
  await assert.rejects(changeAgencyMember(db, owner, { agencyId: foreign.id, userId: outsider, version: randomUUID(), role: 'REMOVE' }), AgencyAccessError);
  assert.equal(await getAgencyAccess(db, admin, foreign.id), null);
});

test('role changes take effect on the next server call and stale versions cannot overwrite them', async () => {
  const original = await membership(member);
  await changeAgencyMember(db, owner, { agencyId, userId: member, version: original.version, role: 'ADMIN' });
  assert.equal((await getAgencyAccess(db, member, agencyId, 'settings'))?.role, 'ADMIN');
  await assert.rejects(changeAgencyMember(db, owner, { agencyId, userId: member, version: original.version, role: 'REMOVE' }), TeamConflictError);
  await changeAgencyMember(db, owner, { agencyId, userId: member, version: (await membership(member)).version, role: 'MEMBER' });
  assert.equal(await getAgencyAccess(db, member, agencyId, 'settings'), null);
});

test('admin logo operations are authorized and demotion during upload prevents attachment', async () => {
  const version = (await db.agency.findUniqueOrThrow({ where: { id: agencyId } })).logoVersion;
  for (const id of [member, client, outsider]) await assert.rejects(beginLogoUpload(db, id, agencyId, version));
  const asset = await beginLogoUpload(db, admin, agencyId, version);
  await changeAgencyMember(db, owner, { agencyId, userId: admin, version: (await membership(admin)).version, role: 'MEMBER' });
  await assert.rejects(completeLogoUpload(db, admin, agencyId, asset.id, version, { key: 'fixture', url: 'https://example.com/fixture.png' }));
  await assert.rejects(removeAgencyLogo(db, admin, agencyId, version));
  await db.agencyLogoAsset.delete({ where: { id: asset.id } });
  await changeAgencyMember(db, owner, { agencyId, userId: admin, version: (await membership(admin)).version, role: 'ADMIN' });
  assert.equal((await removeAgencyLogo(db, admin, agencyId, version)).logoVersion, version + 1);
});

test('concurrent owner changes use one membership version exactly once', async () => {
  const version = (await membership(member)).version;
  const outcomes = await Promise.allSettled(['ADMIN', 'CLIENT'].map(role => changeAgencyMember(db, owner, { agencyId, userId: member, version, role })));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  await changeAgencyMember(db, owner, { agencyId, userId: member, version: (await membership(member)).version, role: 'MEMBER' });
});

test('removal revokes agency access and cascades only the target client assignments', async () => {
  const sub = await db.subAccount.create({ data: { agencyId, name: 'Assigned fixture' } });
  await db.subAccountMembership.createMany({ data: [admin, member].map(userId => ({ agencyId, subAccountId: sub.id, userId, role: 'GUEST' })) });
  const stale = (await membership(member)).version;
  await changeAgencyMember(db, owner, { agencyId, userId: member, version: stale, role: 'REMOVE' });
  assert.equal(await getAgencyAccess(db, member, agencyId), null);
  assert.equal(await db.subAccountMembership.count({ where: { subAccountId: sub.id, userId: member } }), 0);
  assert.equal(await db.subAccountMembership.count({ where: { subAccountId: sub.id, userId: admin } }), 1);
  await db.agencyMembership.create({ data: { agencyId, userId: member, role: 'MEMBER' } });
  await assert.rejects(changeAgencyMember(db, owner, { agencyId, userId: member, version: stale, role: 'ADMIN' }), TeamConflictError);
});

test('deleted actors and agencies with deleted owners cannot expose or mutate data', async () => {
  await db.user.update({ where: { id: admin }, data: { deletedAt: new Date() } });
  assert.deepEqual(await listAccessibleAgencies(db, admin), []);
  assert.equal(await getAgencyAccess(db, admin, agencyId), null);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try {
    assert.deepEqual(await listAccessibleAgencies(db, member), []);
    await assert.rejects(changeAgencyMember(db, owner, { agencyId, userId: member, version: (await membership(member)).version, role: 'ADMIN' }), AgencyAccessError);
  } finally { await db.user.updateMany({ where: { id: { in: [owner, admin] } }, data: { deletedAt: null } }); }
});
