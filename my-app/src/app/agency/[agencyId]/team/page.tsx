import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess } from '@/lib/agency-access';
import { getAgencyTeam } from '@/lib/agency-team';
import { getDb } from '@/lib/db';
import { TeamMember } from '@/components/agency/team-member';
import { CreateInvitation, RevokeInvitation } from '@/components/agency/invitations';
export const metadata: Metadata = { title: 'Agency team' };
export default async function AgencyTeamPage({ params }: PageProps<'/agency/[agencyId]/team'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const access = await getAgencyAccess(getDb(), user.id, agencyId, 'team');
  if (!access) notFound();
  const members = await getAgencyTeam(getDb(), user.id, agencyId);
  const invitations = await getDb().agencyInvitation.findMany({ where: { agencyId, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() }, agency: { ownerId: user.id, owner: { deletedAt: null } } }, select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{access.agency.name}</p><h1>Your team</h1><p>Choose who can manage your agency and its work.</p></div></div>
    <section className="team-role-guide" aria-label="Agency roles"><p><strong>Admin</strong> can edit agency details and logos.</p><p><strong>Member</strong> can view the agency workspace.</p><p><strong>Client</strong> can access only explicitly assigned client workspaces.</p><p>Only the owner can change team access. Changing a role keeps existing client assignments; removing a member removes those assignments.</p></section>
    <ul className="team-list">{members.map(member => <TeamMember key={`${member.userId}-${member.version}`} agencyId={agencyId} ownerId={access.agency.ownerId} member={member} />)}</ul>
    <CreateInvitation agencyId={agencyId} />
    <section className="team-invitations"><h2>Pending invitations</h2>{invitations.length ? <ul className="team-list">{invitations.map(invitation => <li className="team-member" key={invitation.id}><div className="team-identity"><h3>{invitation.email}</h3><p>{invitation.role.toLowerCase()} · Expires {invitation.expiresAt.toISOString().slice(0, 10)} (UTC)</p></div><RevokeInvitation agencyId={agencyId} invitationId={invitation.id} /></li>)}</ul> : <p>No pending invitations.</p>}</section>
  </>;
}
