import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { listClientMedia } from '@/lib/client-media';
import { MediaLibrary } from '@/components/agency/media-library';
export const metadata = { title: 'Client media library' };
export default async function MediaPage({ params }: PageProps<'/subaccount/[subaccountId]/media'>) {
  const user = await requireWorkspaceUser();
  const { subaccountId } = await params;
  const data = await listClientMedia(getDb(), user.id, subaccountId);
  if (!data) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{data.access.name}</p><h1>Media library</h1><p>A home for the images you use on this client’s websites.</p></div><Link className="text-action" href={`/subaccount/${subaccountId}`}>Back to workspace</Link></div>
    <MediaLibrary subAccountId={subaccountId} canEdit={data.access.role !== 'GUEST'} configured={Boolean(process.env.UPLOADTHING_TOKEN)} images={data.media.map(({ createdAt, ...item }) => ({ ...item, createdAt: createdAt.toISOString() }))} />
  </>;
}
