import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency } from '../src/lib/agencies';
import { createSubAccount } from '../src/lib/subaccounts';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { beginMediaUpload, completeMediaUpload, uploadClientMedia, retireClientMedia, cleanupMediaAssets, listClientMedia, type MediaStorage } from '../src/lib/client-media';
import { MediaError, normalizeMediaImage, readMediaForm, requireMediaOrigin, maxMediaBytes } from '../src/lib/media-image';
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `media_${randomUUID()}`;
const [owner, admin, member, guest, outsider] = ['owner','admin','member','guest','outsider'].map(role => `${prefix}_${role}`);
const ids = [owner, admin, member, guest, outsider];
let agencyId: string, subAccountId: string, siblingId: string;
const deleted: string[] = [];
const storage: MediaStorage = { upload: async (_bytes, id) => ({ key: `key_${id}`, url: `https://example.test/${id}.webp` }), remove: async id => { deleted.push(id); } };
const bytes = Buffer.from('normalized-test-bytes');
before(async () => {
  await db.user.createMany({ data: ids.map(id => ({ id })) });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Media fixture', creationKey: randomUUID() })).id;
  await db.agencyMembership.createMany({ data: [{ agencyId, userId: admin, role: 'ADMIN' }, { agencyId, userId: member, role: 'MEMBER' }, { agencyId, userId: guest, role: 'CLIENT' }] });
  subAccountId = (await createSubAccount(db, owner, { agencyId, name: 'Media client', creationKey: randomUUID() })).id;
  siblingId = (await createSubAccount(db, owner, { agencyId, name: 'Private sibling', creationKey: randomUUID() })).id;
  await db.subAccountMembership.createMany({ data: [{ agencyId, subAccountId, userId: member, role: 'MEMBER' }, { agencyId, subAccountId, userId: guest, role: 'GUEST' }] });
});
after(async () => { try { await db.agency.deleteMany({ where: { ownerId: { in: ids } } }); await db.mediaAsset.deleteMany({ where: { actorId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); } finally { await db.$disconnect(); } });
test('images are decoded, resized, re-encoded, and named safely', async () => {
  const raw = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#456a9c' } }).png().toBuffer();
  const result = await normalizeMediaImage(new File([raw], '../sample.png', { type: 'image/png' }));
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 2560); assert.equal(metadata.exif, undefined);
  assert.ok(!result.name.includes('/')); assert.ok(result.name.endsWith('.webp'));
  await assert.rejects(normalizeMediaImage(new File(['<svg/>'], 'fake.png', { type: 'image/png' })), MediaError);
  await assert.rejects(normalizeMediaImage(new File([raw], 'image.svg', { type: 'image/svg+xml' })), MediaError);
  await assert.rejects(normalizeMediaImage(new File([Buffer.alloc(maxMediaBytes + 1)], 'big.png', { type: 'image/png' })), MediaError);
});
test('multipart and same-origin validation reject forged fields and oversized streams', async () => {
  const form = new FormData(); form.set('file', new File(['x'], 'test.png', { type: 'image/png' }));
  assert.equal((await readMediaForm(new Request('http://localhost/api', { method: 'POST', body: form }))).name, 'test.png');
  form.set('subAccountId', 'forged');
  await assert.rejects(readMediaForm(new Request('http://localhost/api', { method: 'POST', body: form })), MediaError);
  await assert.rejects(readMediaForm(new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: Buffer.alloc(maxMediaBytes + 65537) })), MediaError);
  assert.throws(() => requireMediaOrigin(new Request('http://localhost/api', { headers: { origin: 'https://evil.test' } })), MediaError);
  requireMediaOrigin(new Request('http://localhost/api', { headers: { origin: 'http://localhost' } }));
});
test('admins and assigned members can upload; guests read only and outsiders see nothing', async () => {
  for (const actor of [owner, admin, member]) {
    const image = await uploadClientMedia(db, storage, actor, subAccountId, bytes, `${actor}.webp`);
    assert.equal(image.mimeType, 'image/webp'); assert.equal(image.sizeBytes, BigInt(bytes.length));
  }
  assert.equal((await listClientMedia(db, guest, subAccountId))?.media.length, 3);
  assert.equal(await listClientMedia(db, outsider, subAccountId), null);
  assert.equal(await listClientMedia(db, member, siblingId), null);
  for (const actor of [guest, outsider]) await assert.rejects(beginMediaUpload(db, actor, subAccountId), MediaError);
});
test('cross-tenant deletion and guest mutation fail; retirement is idempotent and cleanup retries', async () => {
  const image = await uploadClientMedia(db, storage, owner, subAccountId, bytes, 'removal.webp');
  await assert.rejects(retireClientMedia(db, owner, siblingId, image.id), MediaError);
  await assert.rejects(retireClientMedia(db, guest, subAccountId, image.id), MediaError);
  await retireClientMedia(db, member, subAccountId, image.id);
  await retireClientMedia(db, member, subAccountId, image.id);
  assert.equal(await db.media.findUnique({ where: { id: image.id } }), null);
  await cleanupMediaAssets(db, { ...storage, remove: async () => { throw new Error('offline'); } }, subAccountId);
  assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status, 'RETIRED');
  await cleanupMediaAssets(db, storage, subAccountId);
  assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status, 'DELETED');
  assert.ok(deleted.includes(image.id));
});
test('permission loss during provider upload prevents attachment and cleans the cloud file', async () => {
  let assetId = '';
  await assert.rejects(uploadClientMedia(db, { ...storage, upload: async (data, id) => {
    assetId = id;
    await db.subAccountMembership.update({ where: { subAccountId_userId: { subAccountId, userId: member } }, data: { role: 'GUEST' } });
    return storage.upload(data, id);
  } }, member, subAccountId, bytes, 'blocked.webp'), MediaError);
  assert.equal(await db.media.findUnique({ where: { id: assetId } }), null); assert.ok(deleted.includes(assetId));
  await db.subAccountMembership.update({ where: { subAccountId_userId: { subAccountId, userId: member } }, data: { role: 'MEMBER' } });
});
test('failed uploads retain cleanup records; stale uploads cannot be revived', async () => {
  await assert.rejects(uploadClientMedia(db, { ...storage, upload: async () => { throw new Error('provider unavailable'); } }, owner, subAccountId, bytes, 'failed.webp'));
  const pending = await beginMediaUpload(db, owner, subAccountId);
  await db.mediaAsset.update({ where: { id: pending.id }, data: { createdAt: new Date(Date.now() - 7200000) } });
  await cleanupMediaAssets(db, storage, subAccountId);
  await assert.rejects(completeMediaUpload(db, owner, subAccountId, pending.id, await storage.upload(bytes, pending.id), 'late.webp', bytes.length), MediaError);
  assert.equal(await db.media.findUnique({ where: { id: pending.id } }), null);
});
test('pending reservations and per-actor rate limits bound concurrent uploads', async () => {
  const pending = await Promise.all([beginMediaUpload(db, owner, subAccountId), beginMediaUpload(db, owner, subAccountId), beginMediaUpload(db, owner, subAccountId)]);
  await assert.rejects(beginMediaUpload(db, admin, subAccountId), MediaError);
  await db.mediaAsset.updateMany({ where: { id: { in: pending.map(asset => asset.id) } }, data: { status: 'RETIRED' } });
  await cleanupMediaAssets(db, storage, subAccountId);
  const rateIds = Array.from({ length: 20 }, () => `rate_${randomUUID()}`);
  await db.mediaAsset.createMany({ data: rateIds.map(id => ({ id, actorId: admin, subAccountId, status: 'DELETED' as const })) });
  await assert.rejects(beginMediaUpload(db, admin, subAccountId), MediaError);
  await db.mediaAsset.deleteMany({ where: { id: { in: rateIds } } });
});
test('archival, deletion, and orphaned client cleanup preserve tenant boundaries', async () => {
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: false } });
  assert.equal(await listClientMedia(db, owner, subAccountId), null);
  await assert.rejects(beginMediaUpload(db, owner, subAccountId), MediaError);
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: true } });
  await db.user.update({ where: { id: member }, data: { deletedAt: new Date() } });
  await assert.rejects(beginMediaUpload(db, member, subAccountId), MediaError);
  const orphan = await uploadClientMedia(db, storage, owner, siblingId, bytes, 'orphan.webp');
  await db.subAccount.delete({ where: { id: siblingId } });
  assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: orphan.id } })).subAccountId, null);
  // Limit global orphan processing to this fixture's actor so the fake storage
  // adapter never acknowledges deletion of a real user's file.
  await cleanupMediaAssets(db, storage, undefined, owner);
  assert.ok(deleted.includes(orphan.id));
});
