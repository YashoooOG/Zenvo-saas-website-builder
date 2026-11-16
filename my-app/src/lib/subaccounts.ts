import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, lockAgencyAccess, lockAgencyActors } from './agency-access';
import { AgencyConflictError } from './agencies';

const identity = z.object({ agencyId: z.string().min(1).max(191), name: z.string().trim().min(2).max(191) });
const creation = identity.extend({ creationKey: z.uuid() });
const update = identity.extend({ id: z.string().min(1).max(191), revision: z.number().int().nonnegative(), enabled: z.boolean() });
type Database = PrismaClient | Prisma.TransactionClient;

// Agency admins inherit access; every other role requires an explicit assignment.
function scope(actorId: string): Prisma.SubAccountWhereInput {
  return { agency: { owner: { deletedAt: null } }, OR: [
    { agency: { ownerId: actorId } },
    { agency: { memberships: { some: { userId: actorId, role: 'ADMIN' } } } },
    { memberships: { some: { userId: actorId } } },
  ] };
}

export async function listSubAccounts(db: Database, actorId: string, agencyId?: string, includeArchived = false) {
  if (!await db.user.findFirst({ where: { id: actorId, deletedAt: null }, select: { id: true } })) return [];
  // Archived records are visible only to agency managers, even for assigned users.
  const archiveScope: Prisma.SubAccountWhereInput = includeArchived ? { OR: [
    { enabled: true }, { agency: { ownerId: actorId } },
    { agency: { memberships: { some: { userId: actorId, role: 'ADMIN' } } } },
  ] } : { enabled: true };
  return db.subAccount.findMany({ where: { AND: [scope(actorId), archiveScope], ...(agencyId ? { agencyId } : {}) },
    select: { id: true, agencyId: true, name: true, enabled: true, revision: true, agency: { select: { name: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export async function getSubAccountAccess(db: Database, actorId: string, id: string) {
  if (!await db.user.findFirst({ where: { id: actorId, deletedAt: null }, select: { id: true } })) return null;
  const account = await db.subAccount.findFirst({ where: { AND: [scope(actorId), { id, enabled: true }] },
    include: { agency: { select: { id: true, name: true, ownerId: true, memberships: { where: { userId: actorId }, select: { role: true } } } },
      memberships: { where: { userId: actorId }, select: { role: true } } } });
  if (!account) return null;
  const managesAgency = account.agency.ownerId === actorId || account.agency.memberships[0]?.role === 'ADMIN';
  return { id: account.id, name: account.name, agencyId: account.agencyId, agencyName: account.agency.name,
    managesAgency, role: managesAgency ? 'ADMIN' as const : account.memberships[0].role };
}

export async function createSubAccount(db: PrismaClient, actorId: string, input: unknown) {
  const data = creation.parse(input);
  return db.$transaction(async tx => {
    await lockAgencyAccess(tx, actorId, data.agencyId, 'settings');
    const existing = await tx.subAccount.findUnique({ where: { agencyId_creationKey: { agencyId: data.agencyId, creationKey: data.creationKey } } });
    return existing ?? tx.subAccount.create({ data });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function lockSubAccountWrite(tx: Prisma.TransactionClient, actorId: string, subAccountId: string) {
  const account = await tx.subAccount.findUnique({ where: { id: subAccountId }, select: { agencyId: true } });
  if (!account) throw new AgencyAccessError('Client workspace unavailable.');
  await lockAgencyActors(tx, actorId, account.agencyId);
  const access = await getSubAccountAccess(tx, actorId, subAccountId);
  if (!access || access.role === 'GUEST') throw new AgencyAccessError('Client workspace unavailable.');
  return access;
}

export async function updateSubAccount(db: PrismaClient, actorId: string, input: unknown) {
  const { id, agencyId, revision, ...fields } = update.parse(input);
  return db.$transaction(async tx => {
    await lockAgencyAccess(tx, actorId, agencyId, 'settings');
    if (!await tx.subAccount.findFirst({ where: { id, agencyId }, select: { id: true } })) throw new AgencyAccessError('Client workspace unavailable.');
    const result = await tx.subAccount.updateMany({ where: { id, agencyId, revision }, data: { ...fields, revision: { increment: 1 } } });
    if (!result.count) throw new AgencyConflictError('This workspace changed in another tab. Reload before saving again.');
    return tx.subAccount.findUniqueOrThrow({ where: { id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
