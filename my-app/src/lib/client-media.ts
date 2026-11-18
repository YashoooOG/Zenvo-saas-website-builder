import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { getSubAccountAccess, lockSubAccountWrite } from './subaccounts';
import { AgencyAccessError } from './agency-access';
import { MediaError, maxMediaBytes } from './media-image';
import { editorMediaIds, validateEditorContent } from './editor-content';
export type MediaStorage = { upload: (bytes: Buffer, assetId: string) => Promise<{ key: string; url: string }>; remove: (assetId: string) => Promise<void> };
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
async function lockWrite(tx: Prisma.TransactionClient, actorId: string, subAccountId: string) {
  try { return await lockSubAccountWrite(tx, actorId, subAccountId); }
  catch (error) { if (error instanceof AgencyAccessError) throw new MediaError('Media unavailable.', 404); throw error; }
}
export async function listClientMedia(db: PrismaClient, actorId: string, subAccountId: string) {
  const access = await getSubAccountAccess(db, actorId, subAccountId);
  if (!access) return null;
  const media = await db.media.findMany({ where: { subAccountId }, select: { id: true, name: true, url: true, mimeType: true, sizeBytes: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 500 });
  return { access, media: media.map(item => ({ ...item, sizeBytes: Number(item.sizeBytes) })) };
}
export async function beginMediaUpload(db: PrismaClient, actorId: string, subAccountId: string) {
  return db.$transaction(async tx => {
    await lockWrite(tx, actorId, subAccountId);
    const since = new Date(Date.now() - 3600000);
    if (await tx.mediaAsset.count({ where: { actorId, createdAt: { gte: since } } }) >= 20) throw new MediaError('Upload limit reached. Try again in an hour.', 429);
    const pending = await tx.mediaAsset.count({ where: { subAccountId, status: 'PENDING', createdAt: { gte: since } } });
    if (pending >= 3) throw new MediaError('Uploads are already in progress. Try again shortly.', 409);
    if (await tx.media.count({ where: { subAccountId } }) + pending >= 500) throw new MediaError('This workspace has reached its 500-image limit.', 409);
    return tx.mediaAsset.create({ data: { actorId, subAccountId } });
  }, options);
}
export async function completeMediaUpload(db: PrismaClient, actorId: string, subAccountId: string, assetId: string, file: { key: string; url: string }, name: string, size: number) {
  if (!name.trim() || name.length > 191 || !Number.isSafeInteger(size) || size <= 0 || size > maxMediaBytes) throw new MediaError('Invalid image details.');
  return db.$transaction(async tx => {
    await lockWrite(tx, actorId, subAccountId);
    // Compare-and-swap prevents stale cleanup from racing a completed upload.
    const result = await tx.mediaAsset.updateMany({ where: { id: assetId, actorId, subAccountId, status: 'PENDING', createdAt: { gte: new Date(Date.now() - 3600000) } }, data: { status: 'ACTIVE', fileKey: file.key } });
    if (!result.count) throw new MediaError('This upload is no longer available. Try again.', 409);
    return tx.media.create({ data: { id: assetId, subAccountId, storageKey: file.key, url: file.url, name, mimeType: 'image/webp', sizeBytes: BigInt(size) } });
  }, options);
}
export async function retireClientMedia(db: PrismaClient, actorId: string, subAccountId: string, id: string) {
  await db.$transaction(async tx => {
    await lockWrite(tx, actorId, subAccountId);
    const asset = await tx.mediaAsset.findFirst({ where: { id, subAccountId, status: { in: ['ACTIVE', 'RETIRED', 'DELETED'] } } });
    if (!asset) throw new MediaError('Image unavailable.', 404);
    const published = await tx.funnelPage.findMany({ where: { subAccountId, publishedAt: { not: null } }, select: { publishedContent: true } });
    for (const page of published) {
      let ids: string[];
      try { ids = editorMediaIds(validateEditorContent(page.publishedContent)); }
      catch { throw new MediaError('Published page content must be repaired before removing images.', 409); }
      if (ids.includes(id)) throw new MediaError('This image is used by a published page. Unpublish or replace it and publish again before deleting.', 409);
    }
    await tx.media.deleteMany({ where: { id, subAccountId } });
    if (asset.status === 'ACTIVE') await tx.mediaAsset.update({ where: { id }, data: { status: 'RETIRED' } });
  }, options);
}
export async function cleanupMediaAssets(db: PrismaClient, storage: MediaStorage, subAccountId?: string, actorId?: string) {
  const scope = { ...(subAccountId ? { subAccountId } : {}), ...(actorId ? { actorId } : {}) };
  await db.mediaAsset.updateMany({ where: { ...scope, status: 'PENDING', createdAt: { lt: new Date(Date.now() - 3600000) } }, data: { status: 'RETIRED' } });
  if (!subAccountId) await db.mediaAsset.updateMany({ where: { ...scope, subAccountId: null, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
  const assets = await db.mediaAsset.findMany({ where: { ...scope, status: 'RETIRED' }, take: 20, orderBy: { createdAt: 'asc' } });
  for (const asset of assets) {
    try {
      await storage.remove(asset.id);
      await db.mediaAsset.updateMany({ where: { id: asset.id, status: 'RETIRED' }, data: { status: 'DELETED' } });
    } catch { console.error('Media cleanup deferred; retry the cleanup command.'); }
  }
}
export async function uploadClientMedia(db: PrismaClient, storage: MediaStorage, actorId: string, subAccountId: string, bytes: Buffer, name: string) {
  const asset = await beginMediaUpload(db, actorId, subAccountId);
  try {
    const file = await storage.upload(bytes, asset.id);
    return await completeMediaUpload(db, actorId, subAccountId, asset.id, file, name, bytes.length);
  } catch (error) {
    await db.mediaAsset.updateMany({ where: { id: asset.id, status: { not: 'ACTIVE' } }, data: { status: 'RETIRED' } });
    throw error;
  } finally { await cleanupMediaAssets(db, storage, subAccountId).catch(() => console.error('Media cleanup unavailable; retry later.')); }
}
