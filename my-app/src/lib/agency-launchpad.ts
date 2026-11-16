import type { PrismaClient } from '../generated/prisma/client';
import { getAgencyAccess } from './agency-access';

export type LaunchpadStep = { id: string; title: string; description: string; complete: boolean; href: string | null; action: string; detail: string };

export async function getAgencyLaunchpad(db: PrismaClient, actorId: string, agencyId: string) {
  const access = await getAgencyAccess(db, actorId, agencyId, 'settings');
  if (!access) return null;
  const { agency, role } = access;
  const settings = `/agency/${agencyId}/settings`;
  const profileComplete = Boolean(agency.businessEmail?.trim() && agency.country?.trim());
  const hasLogo = Boolean(agency.logoKey && agency.logoUrl && await db.agencyLogoAsset.findFirst({ where: { agencyId, fileKey: agency.logoKey, status: 'ACTIVE' }, select: { id: true } }));
  let hasTeammate = false, hasPendingInvite = false;
  if (role === 'OWNER') {
    hasTeammate = Boolean(await db.agencyMembership.findFirst({ where: { agencyId, userId: { not: agency.ownerId }, role: { in: ['ADMIN', 'MEMBER'] }, user: { deletedAt: null } }, select: { userId: true } }));
    hasPendingInvite = Boolean(await db.agencyInvitation.findFirst({ where: { agencyId, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }));
  }
  const required: LaunchpadStep[] = [
    { id: 'agency', title: 'Create your agency', description: 'Give your business its own workspace.', complete: true, href: settings, action: 'Review agency', detail: 'Your agency is saved.' },
    { id: 'contact', title: 'Add business contact details', description: 'Add a business email address and country so your agency profile has the essentials.', complete: profileComplete, href: settings, action: profileComplete ? 'Review details' : 'Add details', detail: profileComplete ? 'Business email and country are saved.' : 'Business email and country are needed.' },
  ];
  const optional: LaunchpadStep[] = [
    { id: 'branding', title: 'Add your agency logo', description: 'Make the workspace recognizable to your team.', complete: hasLogo, href: settings, action: hasLogo ? 'Manage logo' : 'Upload logo', detail: hasLogo ? 'Your logo is saved.' : 'You can add branding whenever you’re ready.' },
    { id: 'team', title: 'Bring your team into Zenvo', description: 'Invite an admin or member to work alongside you. Working solo is fine too.', complete: hasTeammate, href: role === 'OWNER' ? `/agency/${agencyId}/team` : null, action: hasTeammate ? 'Manage team' : 'Invite a teammate', detail: role !== 'OWNER' ? 'Your agency owner manages team onboarding.' : hasTeammate ? 'A teammate has joined your agency.' : hasPendingInvite ? 'Invitation pending. This step completes when a teammate joins.' : 'No teammates have joined yet.' },
  ];
  return { agencyName: agency.name, role, required, optional, completed: required.filter(step => step.complete).length, total: required.length };
}
