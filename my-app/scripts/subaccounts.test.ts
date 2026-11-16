import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency, AgencyAccessError, AgencyConflictError } from '../src/lib/agencies';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { createSubAccount, updateSubAccount, listSubAccounts, getSubAccountAccess } from '../src/lib/subaccounts';
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `clients_${randomUUID()}`;
const [owner, admin, member, client, outsider] = ['owner', 'admin', 'member', 'client', 'outsider'].map(role => `${prefix}_${role}`);
const ids = [owner, admin, member, client, outsider];
let agencyId: string, otherAgency: string, accountId: string;
before(async () => {
  await db.user.createMany({ data: ids.map(id => ({ id })) });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Client fixture', creationKey: randomUUID() })).id;
  otherAgency = (await createAgency(db, outsider, { ...emptyAgencyValues, name: 'Other agency', creationKey: randomUUID() })).id;
  await db.agencyMembership.createMany({ data: [{ agencyId, userId: admin, role: 'ADMIN' }, { agencyId, userId: member, role: 'MEMBER' }, { agencyId, userId: client, role: 'CLIENT' }] });
});
after(async () => { try {
  await db.agency.deleteMany({ where: { ownerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
} finally { await db.$disconnect(); } });
test('creation is validated, idempotent under concurrent retries, and tenant scoped', async () => {
  const input = { agencyId, name: '  Acme Studio  ', creationKey: randomUUID() };
  const results = await Promise.all([createSubAccount(db, owner, input), createSubAccount(db, admin, input)]);
  assert.equal(results[0].id, results[1].id); assert.equal(results[0].name, 'Acme Studio'); accountId = results[0].id;
  assert.notEqual((await createSubAccount(db, outsider, { ...input, agencyId: otherAgency })).id, accountId);
  await assert.rejects(createSubAccount(db, owner, { ...input, name: ' ' }));
  for (const actor of [member, client, outsider]) await assert.rejects(createSubAccount(db, actor, { ...input, creationKey: randomUUID() }), AgencyAccessError);
});
test('owners and agency admins inherit access; other roles require assignment', async () => {
  for (const actor of [owner, admin]) assert.equal((await getSubAccountAccess(db, actor, accountId))?.role, 'ADMIN');
  for (const actor of [member, client, outsider]) {
    assert.equal(await getSubAccountAccess(db, actor, accountId), null);
    assert.equal((await listSubAccounts(db, actor, agencyId)).length, 0);
  }
  await db.subAccountMembership.createMany({ data: [{ agencyId, subAccountId: accountId, userId: client, role: 'GUEST' }, { agencyId, subAccountId: accountId, userId: member, role: 'MEMBER' }] });
  assert.equal((await getSubAccountAccess(db, client, accountId))?.role, 'GUEST');
  assert.equal((await listSubAccounts(db, member, agencyId)).length, 1);
  const sibling = await createSubAccount(db, owner, { agencyId, name: 'Separate client', creationKey: randomUUID() });
  assert.equal(await getSubAccountAccess(db, client, sibling.id), null);
});
test('tenant mismatch and unprivileged writes cannot rename or archive clients', async () => {
  const input = { agencyId, id: accountId, revision: 0, name: 'Renamed studio', enabled: true };
  for (const actor of [member, client, outsider]) await assert.rejects(updateSubAccount(db, actor, input), AgencyAccessError);
  await assert.rejects(updateSubAccount(db, outsider, { ...input, agencyId: otherAgency }), AgencyAccessError);
  const result = await updateSubAccount(db, admin, input);
  assert.equal(result.name, 'Renamed studio'); assert.equal(result.revision, 1);
  await assert.rejects(updateSubAccount(db, owner, input), AgencyConflictError);
});
test('archive blocks entry and assigned listings; managers can restore without data loss', async () => {
  const input = { agencyId, id: accountId, revision: 1, name: 'Renamed studio', enabled: false };
  await updateSubAccount(db, owner, input);
  for (const actor of [owner, admin, member, client]) assert.equal(await getSubAccountAccess(db, actor, accountId), null);
  assert.equal((await listSubAccounts(db, client, agencyId, true)).length, 0);
  assert.equal((await listSubAccounts(db, owner, agencyId, true)).find(item => item.id === accountId)?.enabled, false);
  await updateSubAccount(db, owner, { ...input, revision: 2, enabled: true });
  assert.equal((await getSubAccountAccess(db, client, accountId))?.role, 'GUEST');
});
test('membership removal and user deletion revoke access immediately', async () => {
  await db.agencyMembership.delete({ where: { agencyId_userId: { agencyId, userId: client } } });
  assert.equal(await getSubAccountAccess(db, client, accountId), null);
  await db.user.update({ where: { id: member }, data: { deletedAt: new Date() } });
  assert.equal(await getSubAccountAccess(db, member, accountId), null);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  assert.equal(await getSubAccountAccess(db, admin, accountId), null);
  assert.equal((await listSubAccounts(db, admin, agencyId)).length, 0);
  await assert.rejects(updateSubAccount(db, admin, { agencyId, id: accountId, revision: 3, name: 'Unavailable', enabled: true }), AgencyAccessError);
});
