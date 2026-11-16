import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import type { VerifiedInviteIdentity } from './agency-invitations';

export async function invitationIdentity(userId: string): Promise<VerifiedInviteIdentity> {
  const profile = await (await clerkClient()).users.getUser(userId);
  const email = profile.emailAddresses.find(address => address.id === profile.primaryEmailAddressId);
  return { id: userId, email: email?.emailAddress ?? '', verified: profile.id === userId && email?.verification?.status === 'verified' };
}
