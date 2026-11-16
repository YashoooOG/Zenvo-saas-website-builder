import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { invitationIdentity } from '@/lib/invitation-identity';
import { previewClientInvitation } from '@/lib/client-access';
import { getDb } from '@/lib/db';
import { AcceptClientInvite } from '@/components/agency/client-access-forms';
export const metadata: Metadata = { title: 'Client invitation', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function ClientInvitation({ params }: PageProps<'/subaccount/invitations/[token]'>) {
  const user = await requireWorkspaceUser();
  const { token } = await params;
  const invite = await previewClientInvitation(getDb(), await invitationIdentity(user.id), token);
  if (!invite) return <section className="agency-empty"><h1>Client invitation unavailable</h1><p>Sign in with the invited verified primary email address. The link may have expired, been revoked, or already been accepted, or the workspace may be archived.</p><Link className="text-action" href="/subaccount">Your client workspaces</Link></section>;
  return <section className="agency-empty"><h1>Join {invite.subAccount.name}</h1><p>{invite.subAccount.agency.name} invited you as a client {invite.role.toLowerCase()}. This grants access to this workspace, without agency administration. Existing roles are preserved. Expires {invite.expiresAt.toISOString().slice(0, 10)} (UTC).</p><AcceptClientInvite token={token} /></section>;
}
