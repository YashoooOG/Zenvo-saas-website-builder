import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { getClientAccessTeam } from '@/lib/client-access';
import { AgencyAccessError } from '@/lib/agency-access';
import { ClientAssignmentForm, ClientInviteForm, RevokeClientInvite } from '@/components/agency/client-access-forms';
export const metadata: Metadata = { title: 'Client access' };
export default async function AccessPage({ params }: PageProps<'/agency/[agencyId]/clients/[subaccountId]/access'>) {
  const user = await requireWorkspaceUser();
  const { agencyId, subaccountId: subAccountId } = await params;
  const scope = { agencyId, subAccountId };
  let data;
  try { data = await getClientAccessTeam(getDb(), user.id, agencyId, subAccountId); }
  catch (error) { if (error instanceof AgencyAccessError) notFound(); throw error; }
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{data.account.name}</p><h1>Client access</h1><p>Choose who can enter this client workspace.</p></div><Link className="text-action" href={`/agency/${agencyId}/clients/${subAccountId}`}>Back to workspace settings</Link></div>
    <div className="team-role-guide"><p>Agency owners and admins inherit access. Only the owner can change assignments or invite people.</p><p>Client roles apply only inside this workspace. They do not grant agency administration. Guests can view images; members and admins can upload and remove them. Project and website permissions will accompany those tools.</p>{!data.account.enabled && <p>This workspace is archived. You can remove assignments or revoke invitations; restore it before granting access.</p>}</div>
    <h2 className="client-access-heading">Agency people</h2><ul className="team-list">{data.members.map(member => { const assignment = member.subAccounts[0]; const name = member.user.name || member.user.email || 'Agency member'; const inherited = member.userId === user.id || member.role === 'ADMIN'; return <li key={member.userId} className="team-member"><div className="team-identity"><h2>{name}</h2>{member.user.name && <p>{member.user.email}</p>}<p>{inherited ? 'Inherited admin access' : assignment ? `Client ${assignment.role.toLowerCase()}` : 'Not assigned'}</p></div>{!inherited && <ClientAssignmentForm key={`${member.version}:${assignment?.version ?? 'none'}`} scope={scope} userId={member.userId} membershipVersion={member.version} version={assignment?.version ?? null} currentRole={assignment?.role} name={name} archived={!data.account.enabled} />}</li>; })}</ul>
    {data.account.enabled && <ClientInviteForm scope={scope} />}
    <section className="team-invitations"><h2>Pending client invitations</h2>{data.invitations.length ? <ul className="team-list">{data.invitations.map(invite => <li className="team-member" key={invite.id}><div className="team-identity"><h2>{invite.email}</h2><p>{invite.role.toLowerCase()} · Expires {invite.expiresAt.toISOString().slice(0, 10)} (UTC)</p></div><RevokeClientInvite scope={scope} id={invite.id} /></li>)}</ul> : <p>No pending client invitations.</p>}</section>
  </>;
}
