import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { invitationIdentity } from '@/lib/invitation-identity';
import { previewAgencyInvitation } from '@/lib/agency-invitations';
import { getDb } from '@/lib/db';
import { AcceptInvitation } from '@/components/agency/invitations';
export const metadata: Metadata = { title: 'Agency invitation', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function InvitationPage({ params }: PageProps<'/agency/invitations/[token]'>) {
  const user = await requireWorkspaceUser();
  const { token } = await params;
  const invitation = await previewAgencyInvitation(getDb(), await invitationIdentity(user.id), token);
  if (!invitation) return <section className="agency-empty"><h1>Invitation unavailable</h1><p>Sign in with the invited verified primary email address. The link may also have expired, been revoked, or already been accepted.</p><Link className="text-action" href="/agency">Back to your agencies</Link></section>;
  return <section className="agency-empty"><h1>Join {invitation.agency.name}</h1><p>You’ve been invited as an agency {invitation.role.toLowerCase()}. {invitation.role === 'ADMIN' ? 'Admins can edit agency details and logos.' : 'Members have read-only agency access.'} This invitation expires on {invitation.expiresAt.toISOString().slice(0, 10)} (UTC).</p><AcceptInvitation token={token} /></section>;
}
