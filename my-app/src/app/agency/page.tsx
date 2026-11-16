import type { Metadata } from "next";
import Link from "next/link";
import Image from 'next/image';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { listAccessibleAgencies } from '@/lib/agency-access';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Your agencies' };

export default async function AgencyPage() {
  const user = await requireWorkspaceUser();
  const agencies = await listAccessibleAgencies(getDb(), user.id);
  return <>
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Your workspace</p><h1>Your agencies</h1><p>A home for your business and the clients you work with.</p></div>
      {agencies.length > 0 && <Link href="/agency/new" className="action"><Plus size={16} aria-hidden="true" />Create agency</Link>}</div>
    {agencies.length === 0 ? <section className="agency-empty"><div className="agency-mark"><Building2 size={28} strokeWidth={1.5} aria-hidden="true" /></div>
      <h2>Start with your agency</h2><p>Give your workspace a name. You can add your business details now or come back to them later.</p><Link href="/agency/new" className="action">Create your first agency<ArrowRight size={16} aria-hidden="true" /></Link>
    </section> : <ul className="agency-list">{agencies.map(agency => <li key={agency.id}><Link href={`/agency/${agency.id}`}>
      <span className="agency-initial" aria-hidden="true">{agency.logoUrl ? <Image src={agency.logoUrl} alt="" width={48} height={48} unoptimized /> : Array.from(agency.name)[0]?.toUpperCase()}</span><div><h2>{agency.name}</h2><p>Agency workspace</p></div><span className="agency-owner">{agency.role === 'OWNER' ? 'Owner' : agency.role === 'ADMIN' ? 'Admin' : 'Member'}</span><ArrowRight size={18} aria-hidden="true" />
    </Link></li>)}</ul>}
  </>;
}
