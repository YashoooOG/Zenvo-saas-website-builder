import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { getSubAccountAccess } from '@/lib/subaccounts';
import { cleanupMediaAssets, retireClientMedia, uploadClientMedia } from '@/lib/client-media';
import { MediaError, normalizeMediaImage, readMediaForm, requireMediaOrigin } from '@/lib/media-image';
import { createMediaStorage } from '@/lib/media-storage';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'private, no-store' };
async function handle(request: Request, context: RouteContext<'/api/subaccount/[subaccountId]/media'>) {
  try {
    const { userId } = await auth();
    if (!userId) throw new MediaError('Sign in to manage images.', 401);
    requireMediaOrigin(request);
    const { subaccountId } = await context.params;
    const db = getDb();
    const access = await getSubAccountAccess(db, userId, subaccountId);
    if (!access || access.role === 'GUEST') throw new MediaError('Media unavailable.', 404);
    if (request.method === 'POST') {
      const file = await readMediaForm(request);
      const { bytes, name } = await normalizeMediaImage(file);
      await uploadClientMedia(db, createMediaStorage(), userId, subaccountId, bytes, name);
    } else {
      const id = new URL(request.url).searchParams.get('id');
      if (!id || id.length > 191) throw new MediaError('Choose an image to remove.');
      await retireClientMedia(db, userId, subaccountId, id);
      try { await cleanupMediaAssets(db, createMediaStorage(), subaccountId); } catch { console.error('Media cleanup deferred.'); }
    }
    revalidatePath('/subaccount', 'layout');
    return Response.json({ message: request.method === 'POST' ? 'Image uploaded.' : 'Image removed from the library. Storage deletion may take a moment.' }, { headers });
  } catch (error) {
    if (error instanceof MediaError) return Response.json({ message: error.message }, { status: error.status, headers });
    console.error('Client media operation failed.');
    return Response.json({ message: 'We couldn’t update this image. Please try again.' }, { status: 503, headers });
  }
}
export const POST = handle;
export const DELETE = handle;
