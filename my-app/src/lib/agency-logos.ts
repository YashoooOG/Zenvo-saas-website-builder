import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { LogoError } from './logo-image';
import { AgencyAccessError, lockAgencyAccess } from './agency-access';

export type LogoStorage = {
  upload: (bytes: Buffer, assetId: string) => Promise<{ key: string; url: string }>;
  remove: (assetId: string) => Promise<void>;
};

async function lockOwner(tx: Prisma.TransactionClient, actorId: string, agencyId: string) {
  try { return (await lockAgencyAccess(tx, actorId, agencyId, 'settings')).agency; }
  catch (error) { if (error instanceof AgencyAccessError) throw new LogoError('Agency unavailable.', 404); throw error; }
}
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

export async function beginLogoUpload(db: PrismaClient, actorId: string, agencyId: string, version: number) {
  return db.$transaction(async tx => {
    const agency = await lockOwner(tx, actorId, agencyId);
    if (agency.logoVersion !== version) throw new LogoError('The logo changed in another tab. Reload before trying again.', 409);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    if (await tx.agencyLogoAsset.count({ where: { agencyId, status: 'PENDING', createdAt: { gte: since } } })) throw new LogoError('A logo upload is already in progress. Try again shortly.', 409);
    if (await tx.agencyLogoAsset.count({ where: { actorId, createdAt: { gte: since } } }) >= 20) throw new LogoError('Upload limit reached. Try again in an hour.', 429);
    return tx.agencyLogoAsset.create({ data: { agencyId, actorId } });
  }, transactionOptions);
}

export async function completeLogoUpload(db: PrismaClient, actorId: string, agencyId: string, assetId: string, version: number, file: { key: string; url: string }) {
  return db.$transaction(async tx => {
    const agency = await lockOwner(tx, actorId, agencyId);
    const asset = await tx.agencyLogoAsset.findFirst({ where: { id: assetId, agencyId, actorId, status: 'PENDING' } });
    if (!asset || asset.createdAt.getTime() < Date.now() - 60 * 60 * 1000 || agency.logoVersion !== version) throw new LogoError('The logo changed while uploading. Reload and try again.', 409);
    if (agency.logoKey) await tx.agencyLogoAsset.updateMany({ where: { agencyId, fileKey: agency.logoKey, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
    await tx.agencyLogoAsset.update({ where: { id: assetId }, data: { status: 'ACTIVE', fileKey: file.key, url: file.url } });
    return tx.agency.update({ where: { id: agencyId }, data: { logoKey: file.key, logoUrl: file.url, logoVersion: { increment: 1 } } });
  }, transactionOptions);
}

export async function removeAgencyLogo(db: PrismaClient, actorId: string, agencyId: string, version: number) {
  return db.$transaction(async tx => {
    const agency = await lockOwner(tx, actorId, agencyId);
    if (agency.logoVersion !== version) throw new LogoError('The logo changed in another tab. Reload before trying again.', 409);
    if (agency.logoKey) await tx.agencyLogoAsset.updateMany({ where: { agencyId, fileKey: agency.logoKey, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
    // Increment even with no visible logo: cancel any in-flight upload.
    return tx.agency.update({ where: { id: agencyId }, data: { logoKey: null, logoUrl: null, logoVersion: { increment: 1 } } });
  }, transactionOptions);
}

export async function cleanupLogoAssets(db: PrismaClient, storage: LogoStorage, agencyId?: string) {
  const scope = agencyId ? { agencyId } : {};
  await db.agencyLogoAsset.updateMany({ where: { ...scope, status: 'PENDING', createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }, data: { status: 'RETIRED' } });
  // Deleted agencies leave an asset record so their files remain traceable.
  if (!agencyId) await db.agencyLogoAsset.updateMany({ where: { agencyId: null, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
  const assets = await db.agencyLogoAsset.findMany({ where: { ...scope, status: 'RETIRED' }, take: 20, orderBy: { createdAt: 'asc' } });
  for (const asset of assets) {
    try {
      // Only server-generated custom IDs from retired records reach the provider.
      await storage.remove(asset.id);
      await db.agencyLogoAsset.updateMany({ where: { id: asset.id, status: 'RETIRED' }, data: { status: 'DELETED' } });
    } catch { console.error('Logo cleanup deferred; retry the cleanup command.'); }
  }
}

export async function uploadAgencyLogo(db: PrismaClient, storage: LogoStorage, actorId: string, agencyId: string, version: number, bytes: Buffer) {
  const asset = await beginLogoUpload(db, actorId, agencyId, version);
  try {
    const file = await storage.upload(bytes, asset.id);
    const agency = await completeLogoUpload(db, actorId, agencyId, asset.id, version, file);
    return { logoUrl: agency.logoUrl, logoVersion: agency.logoVersion };
  } catch (error) {
    await db.agencyLogoAsset.updateMany({ where: { id: asset.id, status: 'PENDING' }, data: { status: 'RETIRED' } });
    throw error;
  } finally {
    // Cleanup failure must not turn an already committed logo change into a failed save.
    await cleanupLogoAssets(db, storage, agencyId).catch(() => console.error('Logo cleanup unavailable; retry later.'));
  }
}
