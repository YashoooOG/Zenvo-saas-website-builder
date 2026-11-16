import { UserButton } from '@clerk/nextjs';
import { Suspense } from 'react';
import { ThemeSelect } from '@/components/theme-select';
import { WorkspaceShell } from '@/components/agency/workspace-shell';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { listAccessibleAgencies } from '@/lib/agency-access';
import { getDb } from '@/lib/db';
import '../agency.css';
async function AgencyWorkspace({ children }: { children: React.ReactNode }) {
  const user = await requireWorkspaceUser();
  const agencies = await listAccessibleAgencies(getDb(), user.id);
  return <WorkspaceShell agencies={agencies} accountControls={<><ThemeSelect /><UserButton /></>}>{children}</WorkspaceShell>;
}
export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="workspace-content" aria-busy="true"><p role="status">Loading your workspace…</p></main>}><AgencyWorkspace>{children}</AgencyWorkspace></Suspense>;
}
