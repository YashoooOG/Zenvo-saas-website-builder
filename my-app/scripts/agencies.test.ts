import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency, updateAgency, getOwnedAgency, listOwnedAgencies, AgencyAccessError, AgencyConflictError } from '../src/lib/agencies';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { ensureProfile, type ProviderProfile } from '../src/lib/ensure-profile';

const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `agency_test_${randomUUID().replaceAll('-', '')}`;
const owner = `${prefix}_owner`, other = `${prefix}_other`, deleted = `${prefix}_deleted`;
const userIds = [owner, other, deleted, `${prefix}_bootstrap`, `${prefix}_race`];
const receipts: string[] = [];
const fields = { ...emptyAgencyValues, name: '  Test studio  ', businessEmail: 'studio@example.com', country: 'India' };
before(async () => {
  await db.user.createMany({ data: [{ id: owner }, { id: other }, { id: deleted, deletedAt: new Date() }] });
});
after(async () => {
  try {
    await db.agency.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.clerkWebhookReceipt.deleteMany({ where: { id: { in: receipts } } });
  } finally { await db.$disconnect(); }
});

test('creation persists normalized details and atomically grants owner membership', async () => {
  const agency = await createAgency(db, owner, { ...fields, creationKey: randomUUID() });
  assert.equal(agency.ownerId, owner);
  assert.equal(agency.name, 'Test studio');
  assert.equal(agency.phone, null);
  assert.equal(agency.country, 'India');
  const membership = await db.agencyMembership.findUniqueOrThrow({ where: { agencyId_userId: { agencyId: agency.id, userId: owner } } });
  assert.equal(membership.role, 'ADMIN');
  assert.equal((await getOwnedAgency(db, owner, agency.id))?.businessEmail, 'studio@example.com');
});

test('concurrent duplicate form submissions create only one agency', async () => {
  const creationKey = randomUUID();
  const results = await Promise.all([1, 2, 3].map(() => createAgency(db, owner, { ...fields, creationKey })));
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  assert.equal(await db.agency.count({ where: { ownerId: owner, creationKey } }), 1);
});

test('non-owners cannot list, read, or update another agency, even with a membership', async () => {
  const agency = await createAgency(db, owner, { ...fields, creationKey: randomUUID() });
  await db.agencyMembership.create({ data: { agencyId: agency.id, userId: other, role: 'ADMIN' } });
  assert.deepEqual(await listOwnedAgencies(db, other), []);
  assert.equal(await getOwnedAgency(db, other, agency.id), null);
  await assert.rejects(updateAgency(db, other, { ...fields, id: agency.id, revision: 0, name: 'Hijacked' }), AgencyAccessError);
  assert.equal((await getOwnedAgency(db, owner, agency.id))?.name, 'Test studio');
});

test('malformed fields and ownership injection cannot create records', async () => {
  const beforeCount = await db.agency.count({ where: { ownerId: owner } });
  for (const invalid of [{ name: ' ' }, { businessEmail: 'bad' }, { website: 'javascript:alert(1)' }, { website: 'https://user:pass@example.com' }, { ownerId: other }, { phone: 'x'.repeat(41) }]) {
    await assert.rejects(createAgency(db, owner, { ...fields, creationKey: randomUUID(), ...invalid }));
  }
  assert.equal(await db.agency.count({ where: { ownerId: owner } }), beforeCount);
});

test('settings persist and stale tabs cannot overwrite newer changes', async () => {
  const agency = await createAgency(db, owner, { ...fields, creationKey: randomUUID() });
  const updated = await updateAgency(db, owner, { ...fields, id: agency.id, revision: 0, name: 'Updated studio', city: 'Kolkata' });
  assert.equal(updated.revision, 1);
  await assert.rejects(updateAgency(db, owner, { ...fields, id: agency.id, revision: 0 }), AgencyConflictError);
  assert.equal((await getOwnedAgency(db, owner, agency.id))?.city, 'Kolkata');
  const second = await updateAgency(db, owner, { ...fields, id: agency.id, revision: 1, city: '' });
  assert.equal(second.city, null);
  assert.equal(second.revision, 2);
});

test('missing and deleted local users cannot create or modify agencies', async () => {
  for (const id of [deleted, `${prefix}_missing`]) await assert.rejects(createAgency(db, id, { ...fields, creationKey: randomUUID() }), AgencyAccessError);
  const agency = await createAgency(db, owner, { ...fields, creationKey: randomUUID() });
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try {
    assert.equal(await getOwnedAgency(db, owner, agency.id), null);
    await assert.rejects(updateAgency(db, owner, { ...fields, id: agency.id, revision: 0 }), AgencyAccessError);
  } finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
});

function profile(id: string): ProviderProfile {
  return { id, updatedAt: Date.now(), firstName: 'Test', lastName: 'Owner', imageUrl: 'https://example.com/avatar.png', primaryEmailAddressId: 'email', emailAddresses: [{ id: 'email', emailAddress: 'test@example.com' }] };
}
test('onboarding fetches the authenticated profile when webhook data is missing', async () => {
  const id = `${prefix}_bootstrap`;
  const value = profile(id);
  receipts.push(`bootstrap_${createHash('sha256').update(`${id}:${value.updatedAt}`).digest('hex')}`);
  let calls = 0;
  const fetchProfile = async (requested: string) => { assert.equal(requested, id); calls++; return value; };
  const user = await ensureProfile(db, id, fetchProfile);
  assert.equal(user.email, 'test@example.com');
  await ensureProfile(db, id, fetchProfile);
  assert.equal(calls, 1);
});

test('profile fallback rejects mismatched identity and concurrent deletion', async () => {
  const id = `${prefix}_race`;
  await assert.rejects(ensureProfile(db, id, async () => profile(other)));
  assert.equal(await db.user.findUnique({ where: { id } }), null);
  const value = profile(id);
  receipts.push(`bootstrap_${createHash('sha256').update(`${id}:${value.updatedAt}`).digest('hex')}`);
  await assert.rejects(ensureProfile(db, id, async () => {
    await db.user.create({ data: { id, deletedAt: new Date(), clerkUpdatedAt: BigInt(value.updatedAt + 1) } });
    return value;
  }));
  assert.ok((await db.user.findUniqueOrThrow({ where: { id } })).deletedAt);
  let fetched = false;
  await assert.rejects(ensureProfile(db, deleted, async () => { fetched = true; return profile(deleted); }));
  assert.equal(fetched, false);
});
