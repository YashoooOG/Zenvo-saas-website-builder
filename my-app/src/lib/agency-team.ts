import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess, lockAgencyAccess } from './agency-access';

export class TeamConflictError extends Error {}
const changeSchema = z.object({ agencyId: z.string().min(1).max(191), userId: z.string().min(1).max(191), version: z.string().uuid(), role: z.enum(['ADMIN', 'MEMBER', 'CLIENT', 'REMOVE']) }).strict();

export async function getAgencyTeam(db: PrismaClient, actorId: string, agencyId: string) {
  if (!await getAgencyAccess(db, actorId, agencyId, 'team')) throw new AgencyAccessError('Agency unavailable.');
  // Authorization is also in the data query, including the owner's active state.
  return db.agencyMembership.findMany({ where: { agencyId, agency: { ownerId: actorId, owner: { deletedAt: null } }, user: { deletedAt: null } },
    select: { userId: true, role: true, version: true, user: { select: { name: true, email: true } } }, orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }] });
}

export async function changeAgencyMember(db: PrismaClient, actorId: string, input: unknown) {
  const { agencyId, userId, version, role } = changeSchema.parse(input);
  return db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'team', [userId]);
    if (userId === agency.ownerId) throw new AgencyAccessError('The owner’s access cannot be changed.');
    const member = await tx.agencyMembership.findFirst({ where: { agencyId, userId, version, user: { deletedAt: null } } });
    if (!member) throw new TeamConflictError('This membership changed. Reload the team before trying again.');
    if (role === 'REMOVE') {
      await tx.agencyMembership.delete({ where: { agencyId_userId: { agencyId, userId } } });
    } else {
      await tx.agencyMembership.update({ where: { agencyId_userId: { agencyId, userId } }, data: { role, version: randomUUID() } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
