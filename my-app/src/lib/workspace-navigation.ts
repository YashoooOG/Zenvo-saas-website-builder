import type { AgencyAccessRole } from './agency-access';
export type WorkspaceAgency = { id: string; name: string; logoUrl: string | null; role: AgencyAccessRole };

export function currentWorkspaceAgency(pathname: string, agencies: WorkspaceAgency[]) {
  const match = /^\/agency\/([^/]+)(?:\/|$)/.exec(pathname);
  return match ? agencies.find(agency => agency.id === match[1]) : undefined;
}

export function workspaceLinks(agency?: WorkspaceAgency) {
  return [
    { href: '/agency', label: 'All agencies', icon: 'agencies' as const },
    { href: '/subaccount', label: 'Your client workspaces', icon: 'agencies' as const },
    ...(agency ? [{ href: `/agency/${agency.id}`, label: 'Overview', icon: 'overview' as const }] : []),
    ...(agency ? [{ href: `/agency/${agency.id}/clients`, label: 'Clients', icon: 'team' as const }] : []),
    ...(agency && agency.role !== 'MEMBER' ? [{ href: `/agency/${agency.id}/launchpad`, label: 'Launchpad', icon: 'launchpad' as const }] : []),
    ...(agency && agency.role !== 'MEMBER' ? [{ href: `/agency/${agency.id}/settings`, label: 'Agency settings', icon: 'settings' as const }] : []),
    ...(agency?.role === 'OWNER' ? [{ href: `/agency/${agency.id}/team`, label: 'Team', icon: 'team' as const }] : []),
    ...(agency?.role === 'OWNER' ? [{ href: `/agency/${agency.id}/billing`, label: 'Billing', icon: 'billing' as const }] : []),
    ...(agency?.role === 'OWNER' ? [{ href: `/agency/${agency.id}/payments`, label: 'Payments', icon: 'billing' as const }] : []),
    { href: '/agency/new', label: 'Create agency', icon: 'create' as const },
  ];
}
