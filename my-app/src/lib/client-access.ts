import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess, lockAgencyAccess, lockAgencyActors } from './agency-access';
import { InvitationError, type VerifiedInviteIdentity } from './agency-invitations';

export class ClientAccessConflict extends Error {}
const scopeSchema = z.object({ agencyId: z.string().min(1).max(191), subAccountId: z.string().min(1).max(191) });
const roleSchema = z.enum(['ADMIN', 'MEMBER', 'GUEST']);
const changeSchema = scopeSchema.extend({ userId: z.string().min(1).max(191), membershipVersion: z.uuid(), version: z.uuid().nullable(), role: z.enum(['ADMIN', 'MEMBER', 'GUEST', 'REMOVE']) }).strict();
const inviteSchema = scopeSchema.extend({ email: z.string().trim().email().max(320).transform(value => value.toLowerCase()), role: roleSchema }).strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (token: string) => createHash('sha256').update(tokenSchema.parse(token)).digest('hex');
const unavailable = () => new InvitationError('This client invitation is unavailable. Check your email address or ask the owner for a new link.');
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

async function clientRecord(tx: Prisma.TransactionClient, agencyId: string, subAccountId: string) {
  const account = await tx.subAccount.findFirst({ where: { id: subAccountId, agencyId } });
  if (!account) throw new AgencyAccessError('Client workspace unavailable.');
  return account;
}

export async function getClientAccessTeam(db: PrismaClient, actorId: string, agencyId: string, subAccountId: string) {
  if (!await getAgencyAccess(db, actorId, agencyId, 'team')) throw new AgencyAccessError('Client access unavailable.');
  const account = await db.subAccount.findFirst({ where: { id: subAccountId, agencyId, agency: { ownerId: actorId, owner: { deletedAt: null } } }, select: { name: true, enabled: true } });
  if (!account) throw new AgencyAccessError('Client access unavailable.');
  const members = await db.agencyMembership.findMany({ where: { agencyId, agency: { ownerId: actorId, owner: { deletedAt: null } }, user: { deletedAt: null } },
    select: { userId: true, role: true, version: true, user: { select: { name: true, email: true } }, subAccounts: { where: { subAccountId }, select: { role: true, version: true } } }, orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }] });
  const invitations = await db.subAccountInvitation.findMany({ where: { agencyId, subAccountId, subAccount: { agency: { ownerId: actorId, owner: { deletedAt: null } } }, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
  return { account, members, invitations };
}

export async function changeClientAccess(db: PrismaClient, actorId: string, input: unknown) {
  const { agencyId, subAccountId, userId, membershipVersion, version, role } = changeSchema.parse(input);
  await db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'team', [userId]);
    const account = await clientRecord(tx, agencyId, subAccountId);
    if (!account.enabled && role !== 'REMOVE') throw new ClientAccessConflict('Restore this workspace before granting access.');
    const member = await tx.agencyMembership.findFirst({ where: { agencyId, userId, version: membershipVersion, user: { deletedAt: null } } });
    if (!member) throw new ClientAccessConflict('Agency membership changed. Reload before trying again.');
    if (userId === agency.ownerId || member.role === 'ADMIN') throw new AgencyAccessError('Owners and agency admins inherit access. Manage their agency role from Team.');
    const assignment = await tx.subAccountMembership.findUnique({ where: { subAccountId_userId: { subAccountId, userId } } });
    if ((assignment?.version ?? null) !== version) throw new ClientAccessConflict('Client access changed. Reload before trying again.');
    if (role === 'REMOVE') {
      if (!assignment) throw new ClientAccessConflict('This person has no assignment to remove.');
      await tx.subAccountMembership.delete({ where: { subAccountId_userId: { subAccountId, userId } } });
    } else if (assignment) {
      await tx.subAccountMembership.update({ where: { subAccountId_userId: { subAccountId, userId } }, data: { role, version: randomUUID() } });
    } else await tx.subAccountMembership.create({ data: { agencyId, subAccountId, userId, role } });
  }, options);
}

export async function createClientInvitation(db: PrismaClient, actorId: string, input: unknown) {
  const { agencyId, subAccountId, email, role } = inviteSchema.parse(input);
  const token = randomBytes(32).toString('hex');
  await db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'team');
    const account = await clientRecord(tx, agencyId, subAccountId);
    if (!account.enabled) throw new InvitationError('Restore this workspace before inviting anyone.');
    if (await tx.agencyMembership.findFirst({ where: { agencyId, user: { email, deletedAt: null } } }) || await tx.user.findFirst({ where: { id: agency.ownerId, email } })) throw new InvitationError('This person already belongs to the agency. Use the assignment controls below.');
    const now = new Date();
    if (await tx.subAccountInvitation.count({ where: { agencyId, createdAt: { gte: new Date(now.getTime() - 3600000) } } }) >= 20) throw new InvitationError('Invitation limit reached. Try again in an hour.');
    await tx.subAccountInvitation.updateMany({ where: { subAccountId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await tx.subAccountInvitation.create({ data: { agencyId, subAccountId, email, role, tokenHash: hash(token), createdBy: actorId, expiresAt: new Date(now.getTime() + 7 * 86400000) } });
  }, options);
  return { token };
}

export async function revokeClientInvitation(db: PrismaClient, actorId: string, input: unknown) {
  const { agencyId, subAccountId, id } = scopeSchema.extend({ id: z.string().min(1).max(191) }).strict().parse(input);
  await db.$transaction(async tx => {
    await lockAgencyAccess(tx, actorId, agencyId, 'team');
    await clientRecord(tx, agencyId, subAccountId);
    const result = await tx.subAccountInvitation.updateMany({ where: { id, agencyId, subAccountId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new InvitationError('Invitation changed. Reload the access page.');
  }, options);
}

export async function previewClientInvitation(db: PrismaClient, identity: VerifiedInviteIdentity, token: string) {
  if (!identity.verified || !await db.user.findFirst({ where: { id: identity.id, deletedAt: null }, select: { id: true } })) return null;
  let tokenHash: string;
  try { tokenHash = hash(token); } catch { return null; }
  return db.subAccountInvitation.findFirst({ where: { tokenHash, email: identity.email.toLowerCase(), revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() }, subAccount: { enabled: true, agency: { owner: { deletedAt: null } } } },
    select: { role: true, expiresAt: true, subAccount: { select: { name: true, agency: { select: { name: true } } } } } });
}

// Identity must come from a fresh server-side Clerk primary-email verification.
export async function acceptClientInvitation(db: PrismaClient, identity: VerifiedInviteIdentity, token: string) {
  if (!identity.verified) throw unavailable();
  let tokenHash: string;
  try { tokenHash = hash(token); } catch { throw unavailable(); }
  const initial = await db.subAccountInvitation.findUnique({ where: { tokenHash }, select: { agencyId: true } });
  if (!initial) throw unavailable();
  return db.$transaction(async tx => {
    try { await lockAgencyActors(tx, identity.id, initial.agencyId); } catch (error) { if (error instanceof AgencyAccessError) throw unavailable(); throw error; }
    if (!await tx.user.findFirst({ where: { id: identity.id, deletedAt: null }, select: { id: true } })) throw unavailable();
    const invite = await tx.subAccountInvitation.findFirst({ where: { tokenHash, email: identity.email.toLowerCase(), revokedAt: null, expiresAt: { gt: new Date() }, subAccount: { enabled: true, agency: { owner: { deletedAt: null } } } } });
    if (!invite) throw unavailable();
    const where = { subAccountId_userId: { subAccountId: invite.subAccountId, userId: identity.id } };
    const assignment = await tx.subAccountMembership.findUnique({ where });
    if (invite.acceptedAt) {
      if (invite.acceptedBy === identity.id && assignment) return invite.subAccountId;
      throw unavailable();
    }
    // Preserve existing agency/assignment roles; an old invite never elevates them.
    await tx.agencyMembership.upsert({ where: { agencyId_userId: { agencyId: invite.agencyId, userId: identity.id } }, create: { agencyId: invite.agencyId, userId: identity.id, role: 'CLIENT' }, update: {} });
    if (!assignment) await tx.subAccountMembership.create({ data: { agencyId: invite.agencyId, subAccountId: invite.subAccountId, userId: identity.id, role: invite.role } });
    await tx.subAccountInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedBy: identity.id } });
    return invite.subAccountId;
  }, options);
}
