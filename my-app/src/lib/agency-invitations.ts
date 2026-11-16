import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, lockAgencyAccess, lockAgencyActors } from './agency-access';

export class InvitationError extends Error {}
const inputSchema = z.object({ agencyId: z.string().min(1).max(191), email: z.string().trim().email().max(320).transform(value => value.toLowerCase()), role: z.enum(['ADMIN', 'MEMBER']) }).strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const hashToken = (token: string) => createHash('sha256').update(tokenSchema.parse(token)).digest('hex');
const unavailable = () => new InvitationError('This invitation is unavailable. It may have expired, been revoked, or belong to another email address.');
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
export type VerifiedInviteIdentity = { id: string; email: string; verified: boolean };

export async function createAgencyInvitation(db: PrismaClient, actorId: string, input: unknown) {
  const { agencyId, email, role } = inputSchema.parse(input);
  const token = randomBytes(32).toString('hex');
  const invitation = await db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'team');
    if (await tx.agencyMembership.findFirst({ where: { agencyId, user: { email, deletedAt: null } } }) || (await tx.user.findUnique({ where: { id: agency.ownerId } }))?.email?.toLowerCase() === email) throw new InvitationError('This email already belongs to the agency. Manage its existing membership instead.');
    const now = new Date();
    if (await tx.agencyInvitation.count({ where: { agencyId, createdAt: { gte: new Date(now.getTime() - 3600000) } } }) >= 20) throw new InvitationError('Invitation limit reached. Try again in an hour.');
    await tx.agencyInvitation.updateMany({ where: { agencyId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    return tx.agencyInvitation.create({ data: { agencyId, email, role, tokenHash: hashToken(token), createdBy: actorId, expiresAt: new Date(now.getTime() + 7 * 86400000) } });
  }, transactionOptions);
  return { id: invitation.id, token, expiresAt: invitation.expiresAt };
}

export async function revokeAgencyInvitation(db: PrismaClient, actorId: string, agencyId: string, invitationId: string) {
  await db.$transaction(async tx => {
    await lockAgencyAccess(tx, actorId, agencyId, 'team');
    const result = await tx.agencyInvitation.updateMany({ where: { id: invitationId, agencyId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new InvitationError('This invitation has already changed. Refresh the team page.');
  }, transactionOptions);
}

// Identity is fetched server-side from Clerk for every preview and acceptance.
// Never pass form-provided email addresses or verification flags to this function.
export async function previewAgencyInvitation(db: PrismaClient, identity: VerifiedInviteIdentity, token: string) {
  if (!identity.verified) return null;
  let tokenHash: string;
  try { tokenHash = hashToken(token); } catch { return null; }
  if (!await db.user.findFirst({ where: { id: identity.id, deletedAt: null }, select: { id: true } })) return null;
  return db.agencyInvitation.findFirst({ where: { tokenHash, email: identity.email.toLowerCase(), revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() }, agency: { owner: { deletedAt: null } } }, select: { agencyId: true, role: true, expiresAt: true, agency: { select: { name: true } } } });
}

export async function acceptAgencyInvitation(db: PrismaClient, identity: VerifiedInviteIdentity, token: string) {
  if (!identity.verified) throw unavailable();
  let tokenHash: string;
  try { tokenHash = hashToken(token); } catch { throw unavailable(); }
  const invitation = await db.agencyInvitation.findUnique({ where: { tokenHash }, select: { agencyId: true } });
  if (!invitation) throw unavailable();
  return db.$transaction(async tx => {
    try { await lockAgencyActors(tx, identity.id, invitation.agencyId); }
    catch (error) { if (error instanceof AgencyAccessError) throw unavailable(); throw error; }
    if (!await tx.user.findFirst({ where: { id: identity.id, deletedAt: null } })) throw unavailable();
    const current = await tx.agencyInvitation.findFirst({ where: { tokenHash, email: identity.email.toLowerCase(), revokedAt: null, expiresAt: { gt: new Date() }, agency: { owner: { deletedAt: null } } } });
    if (!current) throw unavailable();
    const membership = await tx.agencyMembership.findUnique({ where: { agencyId_userId: { agencyId: current.agencyId, userId: identity.id } } });
    if (current.acceptedAt) {
      if (current.acceptedBy === identity.id && membership) return current.agencyId;
      throw unavailable();
    }
    // An invitation cannot elevate an existing member or restore a consumed grant.
    if (!membership) await tx.agencyMembership.create({ data: { agencyId: current.agencyId, userId: identity.id, role: current.role } });
    await tx.agencyInvitation.update({ where: { id: current.id }, data: { acceptedAt: new Date(), acceptedBy: identity.id } });
    return current.agencyId;
  }, transactionOptions);
}
