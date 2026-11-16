import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency, updateAgency } from '../src/lib/agencies';
import { getAgencyLaunchpad } from '../src/lib/agency-launchpad';
import { emptyAgencyValues } from '../src/lib/agency-validation';
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `launchpad_${randomUUID()}`;
const owner = `${prefix}_owner`, admin = `${prefix}_admin`, member = `${prefix}_member`, client = `${prefix}_client`, outsider = `${prefix}_outsider`;
const ids = [owner, admin, member, client, outsider];
let agencyId: string;
before(async () => {
  await db.user.createMany({ data: ids.map(id => ({ id })) });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Launchpad fixture', creationKey: randomUUID() })).id;
});
after(async () => { try {
  await db.agencyLogoAsset.deleteMany({ where: { agencyId } });
  await db.agency.deleteMany({ where: { ownerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
} finally { await db.$disconnect(); } });
test('new agency starts with only its persisted creation complete', async () => {
  const result = await getAgencyLaunchpad(db, owner, agencyId);
  assert.equal(result?.completed, 1); assert.equal(result?.total, 2);
  assert.equal(result?.optional.find(step => step.id === 'branding')?.complete, false);
  assert.equal(result?.optional.find(step => step.id === 'team')?.complete, false);
});
test('profile progress follows saved fields and regresses when details are cleared', async () => {
  await updateAgency(db, owner, { ...emptyAgencyValues, id: agencyId, revision: 0, name: 'Launchpad fixture', businessEmail: 'business@example.test' });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.completed, 1);
  await updateAgency(db, owner, { ...emptyAgencyValues, id: agencyId, revision: 1, name: 'Launchpad fixture', businessEmail: 'business@example.test', country: 'India' });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.completed, 2);
  await updateAgency(db, owner, { ...emptyAgencyValues, id: agencyId, revision: 2, name: 'Launchpad fixture', country: 'India' });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.completed, 1);
});
test('branding requires an active tracked asset for this agency and never changes essential progress', async () => {
  const key = `${prefix}_logo`;
  await db.agency.update({ where: { id: agencyId }, data: { logoKey: key, logoUrl: 'https://example.test/logo.png' } });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.optional[0].complete, false);
  const asset = await db.agencyLogoAsset.create({ data: { actorId: owner, agencyId, fileKey: key, url: 'https://example.test/logo.png', status: 'ACTIVE' } });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.optional[0].complete, true);
  await db.agencyLogoAsset.update({ where: { id: asset.id }, data: { status: 'RETIRED' } });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.optional[0].complete, false);
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))?.completed, 1);
});
test('pending invites and client/deleted memberships do not count as joined teammates', async () => {
  const invitation = await db.agencyInvitation.create({ data: { agencyId, email: 'pending@example.test', role: 'MEMBER', tokenHash: 'a'.repeat(64), createdBy: owner, expiresAt: new Date(Date.now() + 3600000) } });
  const team = (await getAgencyLaunchpad(db, owner, agencyId))!.optional[1];
  assert.equal(team.complete, false); assert.match(team.detail, /pending/);
  await db.agencyInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  await db.agencyMembership.create({ data: { agencyId, userId: client, role: 'CLIENT' } });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))!.optional[1].complete, false);
  await db.agencyMembership.create({ data: { agencyId, userId: member, role: 'MEMBER' } });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))!.optional[1].complete, true);
  await db.user.update({ where: { id: member }, data: { deletedAt: new Date() } });
  assert.equal((await getAgencyLaunchpad(db, owner, agencyId))!.optional[1].complete, false);
});
test('only owners/admins read setup and admin output does not expose team progress or invite state', async () => {
  await db.agencyMembership.create({ data: { agencyId, userId: admin, role: 'ADMIN' } });
  const result = await getAgencyLaunchpad(db, admin, agencyId);
  assert.equal(result?.role, 'ADMIN'); assert.equal(result?.optional[1].href, null);
  assert.equal(result?.optional[1].complete, false); assert.match(result!.optional[1].detail, /owner/);
  for (const id of [member, client, outsider]) assert.equal(await getAgencyLaunchpad(db, id, agencyId), null);
  assert.equal(await getAgencyLaunchpad(db, owner, 'missing'), null);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  assert.equal(await getAgencyLaunchpad(db, admin, agencyId), null);
});
