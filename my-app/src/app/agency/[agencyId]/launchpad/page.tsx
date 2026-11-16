import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { getAgencyLaunchpad, type LaunchpadStep } from '@/lib/agency-launchpad';
export const metadata: Metadata = { title: 'Agency launchpad' };

function Steps({ steps }: { steps: LaunchpadStep[] }) {
  return <ol className="launchpad-steps">{steps.map(step => <li key={step.id} className={step.complete ? 'launchpad-step is-complete' : 'launchpad-step'}>
    <span className="launchpad-step-mark" aria-hidden="true">{step.complete ? <CheckCircle2 size={24} /> : <Circle size={24} />}</span>
    <div className="launchpad-step-copy"><h3>{step.title}<span className="sr-only">{step.complete ? ' — Complete' : ' — Not complete'}</span></h3><p>{step.description}</p><p className="launchpad-step-detail">{step.detail}</p></div>
    {step.href && <Link className="text-action" href={step.href}>{step.action}<ArrowRight size={16} aria-hidden="true" /></Link>}
  </li>)}</ol>;
}
export default async function AgencyLaunchpadPage({ params }: PageProps<'/agency/[agencyId]/launchpad'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const launchpad = await getAgencyLaunchpad(getDb(), user.id, agencyId);
  if (!launchpad) notFound();
  const complete = launchpad.completed === launchpad.total;
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{launchpad.agencyName}</p><h1>Make yourself at home</h1><p>Set up the essentials, then make this workspace your own.</p></div></div>
    <section className="launchpad-progress" aria-labelledby="launchpad-progress-title"><div><h2 id="launchpad-progress-title">{complete ? 'Your agency basics are ready' : 'A few steps to get started'}</h2><p>{launchpad.completed} of {launchpad.total} essential steps complete</p></div><progress aria-label="Agency basics progress" value={launchpad.completed} max={launchpad.total} /></section>
    <section className="launchpad-section" aria-labelledby="launchpad-essential"><h2 id="launchpad-essential">Agency essentials</h2><Steps steps={launchpad.required} /></section>
    <section className="launchpad-section" aria-labelledby="launchpad-optional"><h2 id="launchpad-optional">Make it yours <span>Optional</span></h2><Steps steps={launchpad.optional} /></section>
    <p className="launchpad-next">Create client workspaces from Clients in your agency navigation. Connected payments will join this checklist when billing is available. Completing your agency basics does not activate billing or publish a website.</p>
  </>;
}
