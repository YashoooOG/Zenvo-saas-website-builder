import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { listOwnedAgencies } from '@/lib/agencies';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Your agencies' };

export default async function AgencyPage() {
  const user = await requireWorkspaceUser();
  const agencies = await listOwnedAgencies(getDb(), user.id);
  return <>
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Your workspace</p><h1>Your agencies</h1><p>A home for your business and the clients you work with.</p></div>
      {agencies.length > 0 && <Link href="/agency/new" className="action"><Plus size={16} aria-hidden="true" />Create agency</Link>}</div>
    {agencies.length === 0 ? <section className="agency-empty"><div className="agency-mark"><Building2 size={28} strokeWidth={1.5} aria-hidden="true" /></div>
      <h2>Start with your agency</h2><p>Give your workspace a name. You can add your business details now or come back to them later.</p><Link href="/agency/new" className="action">Create your first agency<ArrowRight size={16} aria-hidden="true" /></Link>
    </section> : <ul className="agency-list">{agencies.map(agency => <li key={agency.id}><Link href={`/agency/${agency.id}/settings`}>
      <span className="agency-initial" aria-hidden="true">{Array.from(agency.name)[0]?.toUpperCase()}</span><div><h2>{agency.name}</h2><p>{agency.businessEmail || agency.country || 'Agency workspace'}</p></div><span className="agency-owner">Owner</span><ArrowRight size={18} aria-hidden="true" />
    </Link></li>)}</ul>}
  </>;
}
