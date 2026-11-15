export type WorkspaceAgency = { id: string; name: string; logoUrl: string | null };

export function currentWorkspaceAgency(pathname: string, agencies: WorkspaceAgency[]) {
  const match = /^\/agency\/([^/]+)(?:\/|$)/.exec(pathname);
  return match ? agencies.find(agency => agency.id === match[1]) : undefined;
}

export function workspaceLinks(agency?: WorkspaceAgency) {
  return [
    { href: '/agency', label: 'All agencies', icon: 'agencies' as const },
    ...(agency ? [{ href: `/agency/${agency.id}/settings`, label: 'Agency settings', icon: 'settings' as const }] : []),
    { href: '/agency/new', label: 'Create agency', icon: 'create' as const },
  ];
}
