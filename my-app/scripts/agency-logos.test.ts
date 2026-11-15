import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createDatabaseClient } from '../src/lib/database-client';
import { normalizeLogo, maxLogoBytes } from '../src/lib/logo-image';
import { beginLogoUpload, completeLogoUpload, uploadAgencyLogo, removeAgencyLogo, cleanupLogoAssets, type LogoStorage } from '../src/lib/agency-logos';
import { readLogoForm, requireSameOrigin, parseLogoVersion } from '../src/lib/logo-request';

const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `logo_test_${randomUUID().replaceAll('-', '')}`;
const owner = `${prefix}_owner`, other = `${prefix}_other`;
const removed: string[] = [];
let uploads = 0;
const storage: LogoStorage = {
  async upload(_bytes, assetId) { uploads++; return { key: assetId, url: `https://example.ufs.sh/f/${assetId}` }; },
  async remove(id) { removed.push(id); },
};
const makeAgency = () => db.agency.create({ data: { name: 'Logo fixture', ownerId: owner } });
before(async () => { await db.user.createMany({ data: [{ id: owner }, { id: other }] }); });
after(async () => {
  try {
    await db.agencyLogoAsset.deleteMany({ where: { actorId: { in: [owner, other] } } });
    await db.agency.deleteMany({ where: { ownerId: { in: [owner, other] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  } finally { await db.$disconnect(); }
});

test('valid image is decoded, resized, and stripped of metadata', async () => {
  const original = await sharp({ create: { width: 1000, height: 500, channels: 3, background: '#2141ab' } }).jpeg().withMetadata().toBuffer();
  const output = await normalizeLogo(new File([original], 'photo.jpg', { type: 'image/jpeg' }));
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 256);
  assert.equal(metadata.exif, undefined);
});
test('spoofed, corrupt, animated, oversized and excessive-dimension images are rejected', async () => {
  for (const file of [
    new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'], 'fake.png', { type: 'image/png' }),
    new File(['garbage'], 'broken.png', { type: 'image/png' }),
    new File(['text'], 'image.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(maxLogoBytes + 1)], 'big.png', { type: 'image/png' }),
  ]) await assert.rejects(normalizeLogo(file));
  const wide = await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(normalizeLogo(new File([wide], 'wide.png', { type: 'image/png' })));
  const frames = Buffer.alloc(8 * 16 * 3);
  for (let pixel = 0; pixel < 8 * 16; pixel++) frames[pixel * 3 + (pixel < 64 ? 0 : 2)] = 255;
  const animated = await sharp(frames, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp().toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await assert.rejects(normalizeLogo(new File([animated], 'animation.webp', { type: 'image/webp' })));
});
test('cross-origin, missing-origin, malformed version and arbitrary URL fields are rejected', async () => {
  assert.throws(() => requireSameOrigin(new Request('http://localhost/api', { headers: { origin: 'https://evil.example' } })));
  assert.throws(() => requireSameOrigin(new Request('http://localhost/api')));
  requireSameOrigin(new Request('http://localhost/api', { headers: { origin: 'http://localhost' } }));
  for (const value of [null, '', '-1', '1e3', '2147483647']) assert.throws(() => parseLogoVersion(value));
  const data = new FormData(); data.set('logoVersion', '0'); data.set('file', new File(['x'], 'x.png', { type: 'image/png' })); data.set('logoUrl', 'https://evil.example');
  await assert.rejects(readLogoForm(new Request('http://localhost/api', { method: 'POST', body: data })));
});
test('streamed request limits apply without a Content-Length header', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: new Uint8Array(maxLogoBytes + 65537) });
  await assert.rejects(readLogoForm(request), { status: 413 });
});
test('non-owner and deleted-owner uploads never reach storage', async () => {
  const agency = await makeAgency(); const before = uploads;
  await assert.rejects(uploadAgencyLogo(db, storage, other, agency.id, 0, Buffer.from('x')), { status: 404 });
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  try { await assert.rejects(uploadAgencyLogo(db, storage, owner, agency.id, 0, Buffer.from('x')), { status: 404 }); }
  finally { await db.user.update({ where: { id: owner }, data: { deletedAt: null } }); }
  assert.equal(uploads, before);
});
test('replacement and removal retire only their tracked assets and preserve business revisions', async () => {
  const agency = await makeAgency();
  const first = await uploadAgencyLogo(db, storage, owner, agency.id, 0, Buffer.from('one'));
  assert.equal(first.logoVersion, 1);
  const firstAsset = await db.agencyLogoAsset.findFirstOrThrow({ where: { agencyId: agency.id, status: 'ACTIVE' } });
  await uploadAgencyLogo(db, storage, owner, agency.id, 1, Buffer.from('two'));
  assert.ok(removed.includes(firstAsset.id));
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agency.id } })).revision, 0);
  const cleared = await removeAgencyLogo(db, owner, agency.id, 2);
  assert.equal(cleared.logoUrl, null); assert.equal(cleared.logoVersion, 3);
  await cleanupLogoAssets(db, storage, agency.id);
  assert.equal(await db.agencyLogoAsset.count({ where: { agencyId: agency.id, status: 'ACTIVE' } }), 0);
});
test('stale and concurrent uploads are rejected before provider calls', async () => {
  const agency = await makeAgency(); const before = uploads;
  const pending = await beginLogoUpload(db, owner, agency.id, 0);
  await assert.rejects(uploadAgencyLogo(db, storage, owner, agency.id, 0, Buffer.from('x')), { status: 409 });
  await assert.rejects(uploadAgencyLogo(db, storage, owner, agency.id, 99, Buffer.from('x')), { status: 409 });
  assert.equal(uploads, before);
  await db.agencyLogoAsset.update({ where: { id: pending.id }, data: { status: 'RETIRED' } });
});
test('removal during an upload prevents late completion from restoring the logo', async () => {
  const agency = await makeAgency();
  const racing: LogoStorage = { ...storage, async upload(bytes, id) { await removeAgencyLogo(db, owner, agency.id, 0); return storage.upload(bytes, id); } };
  await assert.rejects(uploadAgencyLogo(db, racing, owner, agency.id, 0, Buffer.from('x')), { status: 409 });
  assert.equal((await db.agency.findUniqueOrThrow({ where: { id: agency.id } })).logoUrl, null);
  const asset = await db.agencyLogoAsset.findFirstOrThrow({ where: { agencyId: agency.id } });
  assert.equal(asset.status, 'DELETED');
});
test('ownership is checked again after upload and deleted users cannot attach files', async () => {
  const agency = await makeAgency();
  const asset = await beginLogoUpload(db, owner, agency.id, 0);
  await db.agency.update({ where: { id: agency.id }, data: { ownerId: other } });
  await assert.rejects(completeLogoUpload(db, owner, agency.id, asset.id, 0, { key: 'x', url: 'https://example.ufs.sh/f/x' }), { status: 404 });
});
test('failed provider cleanup stays retryable and never deletes active logos', async () => {
  const agency = await makeAgency();
  await uploadAgencyLogo(db, storage, owner, agency.id, 0, Buffer.from('one'));
  const asset = await db.agencyLogoAsset.findFirstOrThrow({ where: { agencyId: agency.id } });
  await cleanupLogoAssets(db, storage, agency.id); assert.ok(!removed.includes(asset.id));
  await removeAgencyLogo(db, owner, agency.id, 1);
  await cleanupLogoAssets(db, { ...storage, async remove() { throw new Error('Offline'); } }, agency.id);
  assert.equal((await db.agencyLogoAsset.findUniqueOrThrow({ where: { id: asset.id } })).status, 'RETIRED');
  await cleanupLogoAssets(db, storage, agency.id);
  assert.equal((await db.agencyLogoAsset.findUniqueOrThrow({ where: { id: asset.id } })).status, 'DELETED');
});
