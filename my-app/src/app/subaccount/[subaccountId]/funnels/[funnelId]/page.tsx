import Link from 'next/link';
import { rootDomain } from '@/lib/tenant-routing';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { getFunnel } from '@/lib/funnels';
import { FunnelForm } from '@/components/agency/funnel-form';

export const metadata = { title: 'Funnel pages' };
export default async function Funnel({ params }: PageProps<'/subaccount/[subaccountId]/funnels/[funnelId]'>) {
  const user = await requireWorkspaceUser(); const { subaccountId, funnelId } = await params;
  const data = await getFunnel(getDb(), user.id, subaccountId, funnelId); if (!data) notFound();
  const { funnel, access } = data; const editable = access.role !== 'GUEST';
  const hidden = { subAccountId: subaccountId, funnelId, revision: String(funnel.revision) };
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{access.name}</p><h1>{funnel.name}</h1><p>Manage drafts and publish the saved version when it is ready.</p></div><Link className="text-action" href={`/subaccount/${subaccountId}/funnels`}>All funnels</Link></div>
    {funnel.pages.length ? <ul className="client-list">{funnel.pages.map(page => <li key={page.id}><div><h2>{page.name}</h2><p>{page.path} · {page.publishedAt ? 'Published' : 'Draft'}</p><Link className="text-action" href={`/subaccount/${subaccountId}/funnels/${funnelId}/pages/${page.id}`}>{editable ? 'Edit draft' : 'Preview draft'}</Link>
      {page.publishedAt && <p>Public address: {data.subdomain}.{rootDomain()}{page.path}</p>}
      {editable && <details><summary>Publishing</summary><p>Publish the saved draft. Unsaved editor changes are not included.</p><FunnelForm hidden={{ ...hidden, operation: 'publish', pageId: page.id }} subdomain={data.subdomain ?? ''} label={page.publishedAt ? 'Publish latest saved draft' : 'Publish page'} confirmation="Make this saved page publicly accessible." />{page.publishedAt && <FunnelForm hidden={{ ...hidden, operation: 'unpublish', pageId: page.id, subdomain: data.subdomain ?? '' }} label="Unpublish page" confirmation="Take this page offline while keeping its draft." />}</details>}
      {editable && !page.publishedAt && <details><summary>Manage page</summary><FunnelForm hidden={{ ...hidden, operation: 'edit-page', pageId: page.id }} name={page.name} path={page.path} label="Save page details" /><FunnelForm hidden={{ ...hidden, operation: 'delete-page', pageId: page.id }} label="Delete draft page" confirmation="Permanently delete this draft page and its content." /></details>}
    </div></li>)}</ul> : <section className="agency-empty"><h2>No pages yet</h2><p>Add the first page for this funnel.</p></section>}
    {editable && <><section className="launchpad-section"><h2>Add a page</h2><FunnelForm hidden={{ ...hidden, operation: 'create-page' }} name="" path="" label="Create draft page" /></section>
      <section className="launchpad-section"><h2>Funnel settings</h2><FunnelForm hidden={{ ...hidden, operation: 'rename' }} name={funnel.name} label="Rename funnel" />{!funnel.pages.length && <FunnelForm hidden={{ ...hidden, operation: 'delete' }} label="Delete empty funnel" confirmation="Permanently delete this empty funnel." />}</section></>}
  </>;
}
