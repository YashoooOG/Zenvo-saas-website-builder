import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { createAgencySchema, updateAgencySchema } from './agency-validation';

export class AgencyAccessError extends Error {}
export class AgencyConflictError extends Error {}

async function lockActiveUser(tx: Prisma.TransactionClient, actorId: string) {
  const [user] = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`SELECT deletedAt FROM User WHERE id = ${actorId} FOR UPDATE`;
  if (!user || user.deletedAt) throw new AgencyAccessError('Agency unavailable.');
}

export async function createAgency(db: PrismaClient, actorId: string, input: unknown) {
  const { creationKey, ...fields } = createAgencySchema.parse(input);
  return db.$transaction(async tx => {
    await lockActiveUser(tx, actorId);
    const existing = await tx.agency.findUnique({ where: { ownerId_creationKey: { ownerId: actorId, creationKey } } });
    if (existing) return existing;
    return tx.agency.create({ data: {
      ...fields, creationKey, ownerId: actorId,
      memberships: { create: { userId: actorId, role: 'ADMIN' } },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function updateAgency(db: PrismaClient, actorId: string, input: unknown) {
  const { id, revision, ...fields } = updateAgencySchema.parse(input);
  return db.$transaction(async tx => {
    await lockActiveUser(tx, actorId);
    const agency = await tx.agency.findFirst({ where: { id, ownerId: actorId } });
    if (!agency) throw new AgencyAccessError('Agency unavailable.');
    const updated = await tx.agency.updateMany({
      where: { id, ownerId: actorId, revision }, data: { ...fields, revision: { increment: 1 } },
    });
    if (!updated.count) throw new AgencyConflictError('This agency changed in another tab. Reload the page before saving again.');
    return tx.agency.findUniqueOrThrow({ where: { id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export function listOwnedAgencies(db: PrismaClient, actorId: string) {
  return db.agency.findMany({ where: { ownerId: actorId, owner: { deletedAt: null } },
    select: { id: true, name: true, country: true, businessEmail: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export function getOwnedAgency(db: PrismaClient, actorId: string, id: string) {
  return db.agency.findFirst({ where: { id, ownerId: actorId, owner: { deletedAt: null } } });
}
