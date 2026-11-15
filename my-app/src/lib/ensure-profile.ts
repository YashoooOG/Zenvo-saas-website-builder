import { createHash } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';
import { parseUserEvent, syncClerkUser } from './clerk-sync';

export type ProviderProfile = {
  id: string; updatedAt: number; firstName: string | null; lastName: string | null;
  imageUrl: string; primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
};

// Provider callback is server-owned and called only for the authenticated ID.
export async function ensureProfile(db: PrismaClient, actorId: string, fetchProfile: (id: string) => Promise<ProviderProfile>) {
  const existing = await db.user.findUnique({ where: { id: actorId } });
  if (existing) {
    if (existing.deletedAt) throw new Error('Account is no longer active.');
    return existing;
  }
  const profile = await fetchProfile(actorId);
  if (profile.id !== actorId) throw new Error('Provider identity does not match the session.');
  const event = parseUserEvent({ type: 'user.updated', timestamp: profile.updatedAt, data: {
    id: profile.id, updated_at: profile.updatedAt, first_name: profile.firstName,
    last_name: profile.lastName, image_url: profile.imageUrl,
    primary_email_address_id: profile.primaryEmailAddressId,
    email_addresses: profile.emailAddresses.map(email => ({ id: email.id, email_address: email.emailAddress })),
  } });
  if (!event) throw new Error('Provider profile unavailable.');
  const receipt = `bootstrap_${createHash('sha256').update(`${actorId}:${profile.updatedAt}`).digest('hex')}`;
  await syncClerkUser(db, receipt, event);
  const user = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (user.deletedAt) throw new Error('Account is no longer active.');
  return user;
}
