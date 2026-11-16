'use client';

import { createContext, useContext, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Building2, Check, ChevronsUpDown, Menu, Plus, Search, Settings, LayoutDashboard, Users, ListChecks } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { currentWorkspaceAgency, workspaceLinks, type WorkspaceAgency } from '@/lib/workspace-navigation';

type DialogKind = 'switcher' | 'navigation';
const WorkspaceDialogs = createContext<{ open: (kind: DialogKind, trigger: HTMLButtonElement) => void; close: () => void } | null>(null);
export function useWorkspaceDialogs() {
  const context = useContext(WorkspaceDialogs);
  if (!context) throw new Error('Workspace dialogs require the workspace shell.');
  return context;
}

function AgencyMark({ agency }: { agency?: WorkspaceAgency }) {
  return <span className="workspace-agency-mark" aria-hidden="true">{agency?.logoUrl
    ? <Image src={agency.logoUrl} alt="" width={32} height={32} unoptimized />
    : agency ? Array.from(agency.name)[0]?.toUpperCase() : <Building2 size={18} />}</span>;
}

function Navigation({ agency, pathname, mobile = false }: { agency?: WorkspaceAgency; pathname: string; mobile?: boolean }) {
  const { close } = useWorkspaceDialogs();
  const icons = { agencies: Building2, settings: Settings, create: Plus, overview: LayoutDashboard, team: Users, launchpad: ListChecks };
  return <nav aria-label={mobile ? 'Mobile workspace' : 'Workspace'} className="workspace-links">
    {workspaceLinks(agency).map(link => {
      const Icon = icons[link.icon];
      return <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} onClick={close}><Icon size={18} aria-hidden="true" />{link.label}</Link>;
    })}
  </nav>;
}

function AgencySwitcher({ agencies, currentId }: { agencies: WorkspaceAgency[]; currentId?: string }) {
  const [query, setQuery] = useState('');
  const { close } = useWorkspaceDialogs();
  const filtered = agencies.filter(agency => agency.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <><label className="workspace-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search agencies</span><input autoComplete="off" placeholder="Search agencies" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <p className="sr-only" role="status">{filtered.length} {filtered.length === 1 ? 'agency' : 'agencies'} found</p>
    {filtered.length ? <ul className="workspace-agency-options">{filtered.map(agency => <li key={agency.id}>
      <Link href={`/agency/${agency.id}`} onClick={close} aria-current={agency.id === currentId ? 'true' : undefined}>
        <AgencyMark agency={agency} /><span>{agency.name}<small>{agency.id === currentId ? 'Current agency' : 'Agency workspace'}</small></span>{agency.id === currentId && <Check size={18} aria-hidden="true" />}
      </Link></li>)}</ul> : <p className="workspace-search-empty">{agencies.length ? 'No agencies match your search.' : 'Create your first agency to get started.'}</p>}
    <Link href="/agency/new" className="workspace-dialog-create" onClick={close}><Plus size={18} aria-hidden="true" />Create agency</Link>
  </>;
}

export function WorkspaceShell({ agencies, accountControls, children }: { agencies: WorkspaceAgency[]; accountControls: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const agency = currentWorkspaceAgency(pathname, agencies);
  const [dialog, setDialog] = useState<{ kind: DialogKind; pathname: string } | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const open = (kind: DialogKind, trigger: HTMLButtonElement) => { returnFocus.current = trigger; setDialog({ kind, pathname }); };
  const close = () => setDialog(null);
  const isOpen = dialog !== null && dialog.pathname === pathname;
  return <WorkspaceDialogs.Provider value={{ open, close }}>
    <div className="workspace-shell"><a href="#workspace-content" className="skip-link">Skip to content</a>
      <header className="workspace-header"><div className="workspace-brand-group"><button type="button" className="workspace-icon-button workspace-mobile-menu" aria-label="Open workspace navigation" aria-haspopup="dialog" onClick={event => open('navigation', event.currentTarget)}><Menu size={20} aria-hidden="true" /></button><Brand /></div><div className="account-theme">{accountControls}</div></header>
      <div className="workspace-body"><aside className="workspace-sidebar" aria-label="Agency navigation">
        <button type="button" className="workspace-switcher" aria-haspopup="dialog" aria-label={`Switch agency${agency ? `, current agency: ${agency.name}` : ''}`} onClick={event => open('switcher', event.currentTarget)}><AgencyMark agency={agency} /><span>{agency?.name ?? 'Your workspace'}<small>{agency ? 'Agency workspace' : `${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}`}</small></span><ChevronsUpDown size={16} aria-hidden="true" /></button>
        <Navigation agency={agency} pathname={pathname} />
        <p className="workspace-sidebar-note">A space for your agency.<br />A home for your client work.</p>
      </aside><div className="workspace-main-column"><div className="workspace-context"><span>{agency ? agency.name : 'Your workspace'}</span><span aria-hidden="true">/</span><span>{pathname === '/agency/new' ? 'Create agency' : agency ? pathname.endsWith('/settings') ? 'Settings' : pathname.endsWith('/team') ? 'Team' : pathname.endsWith('/launchpad') ? 'Launchpad' : 'Overview' : 'Agencies'}</span>
        <button type="button" className="workspace-mobile-switch" aria-haspopup="dialog" onClick={event => open('switcher', event.currentTarget)}>Switch agency</button></div>
        <main id="workspace-content" className="workspace-content" tabIndex={-1}>{children}</main>
      </div></div>
    </div>
    <Dialog open={isOpen} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent title={dialog?.kind === 'navigation' ? 'Your workspace' : 'Switch agency'} description={dialog?.kind === 'navigation' ? 'Find your agencies and manage the current workspace.' : 'Choose the agency you want to work in.'} finalFocus={returnFocus}>
        {dialog?.kind === 'navigation' ? <Navigation agency={agency} pathname={pathname} mobile /> : <AgencySwitcher key={`${pathname}-${isOpen}`} agencies={agencies} currentId={agency?.id} />}
      </DialogContent>
    </Dialog>
  </WorkspaceDialogs.Provider>;
}
