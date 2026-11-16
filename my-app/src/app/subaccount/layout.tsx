import { Suspense } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Brand } from '@/components/brand';
import { ThemeSelect } from '@/components/theme-select';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import '../agency.css';
async function Workspace({ children }: { children: React.ReactNode }) {
  await requireWorkspaceUser();
  return <div className="workspace-shell"><a className="skip-link" href="#client-content">Skip to content</a><header className="workspace-header"><Brand /><div className="account-theme"><ThemeSelect /><UserButton /></div></header><nav className="workspace-context" aria-label="Client navigation"><Link href="/subaccount">Your client workspaces</Link><Link href="/agency">Your agencies</Link></nav><main id="client-content" className="workspace-content">{children}</main></div>;
}
export default function Layout({ children }: { children: React.ReactNode }) { return <Suspense fallback={<main className="workspace-content" aria-busy="true">Loading client workspace…</main>}><Workspace>{children}</Workspace></Suspense>; }
