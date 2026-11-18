import type { Prisma, PrismaClient } from '../generated/prisma/client';

export type AgencyAccessRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type AgencyPermission = 'read' | 'settings' | 'team' | 'billing' | 'payments';
export class AgencyAccessError extends Error {}
type Database = PrismaClient | Prisma.TransactionClient;

export function permitsAgency(role: AgencyAccessRole, permission: AgencyPermission) {
  return permission === 'read' || role === 'OWNER' || (permission === 'settings' && role === 'ADMIN');
}

export async function getAgencyAccess(db: Database, actorId: string, agencyId: string, permission: AgencyPermission = 'read') {
  const user = await db.user.findFirst({ where: { id: actorId, deletedAt: null }, select: { id: true } });
  if (!user) return null;
  const agency = await db.agency.findFirst({ where: { id: agencyId, owner: { deletedAt: null }, OR: [
    { ownerId: actorId }, { memberships: { some: { userId: actorId, role: { in: ['ADMIN', 'MEMBER'] } } } },
  ] }, include: { memberships: { where: { userId: actorId }, select: { role: true } } } });
  if (!agency) return null;
  const role: AgencyAccessRole = agency.ownerId === actorId ? 'OWNER' : agency.memberships[0].role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
  return permitsAgency(role, permission) ? { agency, role } : null;
}

// Serialize mutations with user deletion, role changes, and other agency writes.
// Every multi-user lock uses the same order to avoid lock inversion.
export async function lockAgencyActors(tx: Prisma.TransactionClient, actorId: string, agencyId: string, extraUsers: string[] = []) {
  const agency = await tx.agency.findUnique({ where: { id: agencyId }, select: { ownerId: true } });
  if (!agency) throw new AgencyAccessError('Agency unavailable.');
  for (const id of [...new Set([actorId, agency.ownerId, ...extraUsers])].sort()) {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${id} FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM Agency WHERE id = ${agencyId} FOR UPDATE`;
}

export async function lockAgencyAccess(tx: Prisma.TransactionClient, actorId: string, agencyId: string, permission: AgencyPermission, extraUsers: string[] = []) {
  await lockAgencyActors(tx, actorId, agencyId, extraUsers);
  const access = await getAgencyAccess(tx, actorId, agencyId, permission);
  if (!access) throw new AgencyAccessError('Agency unavailable.');
  return access;
}

export async function listAccessibleAgencies(db: PrismaClient, actorId: string) {
  if (!await db.user.findFirst({ where: { id: actorId, deletedAt: null }, select: { id: true } })) return [];
  const agencies = await db.agency.findMany({ where: { owner: { deletedAt: null }, OR: [
    { ownerId: actorId }, { memberships: { some: { userId: actorId, role: { in: ['ADMIN', 'MEMBER'] } } } },
  ] }, select: { id: true, name: true, logoUrl: true, ownerId: true, memberships: { where: { userId: actorId }, select: { role: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return agencies.map(({ ownerId, memberships, ...agency }) => ({ ...agency, role: (ownerId === actorId ? 'OWNER' : memberships[0].role === 'ADMIN' ? 'ADMIN' : 'MEMBER') as AgencyAccessRole }));
}
