import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { getOwnedAgency } from '@/lib/agencies';
import { cleanupLogoAssets, removeAgencyLogo, uploadAgencyLogo } from '@/lib/agency-logos';
import { normalizeLogo, LogoError } from '@/lib/logo-image';
import { createLogoStorage } from '@/lib/logo-storage';
import { parseLogoVersion, readLogoForm, requireSameOrigin } from '@/lib/logo-request';

export const maxDuration = 120;
const headers = { 'Cache-Control': 'private, no-store' };
type Context = RouteContext<'/api/agency/[agencyId]/logo'>;

async function handle(request: Request, context: Context) {
  try {
    const { userId } = await auth();
    if (!userId) throw new LogoError('Sign in to manage your logo.', 401);
    requireSameOrigin(request);
    const { agencyId } = await context.params;
    const db = getDb();
    if (!await getOwnedAgency(db, userId, agencyId)) throw new LogoError('Agency unavailable.', 404);
    let result;
    if (request.method === 'POST') {
      const { file, version } = await readLogoForm(request);
      const bytes = await normalizeLogo(file);
      result = await uploadAgencyLogo(db, createLogoStorage(), userId, agencyId, version, bytes);
    } else {
      const version = parseLogoVersion(new URL(request.url).searchParams.get('version'));
      const agency = await removeAgencyLogo(db, userId, agencyId, version);
      result = { logoUrl: agency.logoUrl, logoVersion: agency.logoVersion };
      // A missing provider configuration must not prevent local logo removal.
      try { await cleanupLogoAssets(db, createLogoStorage(), agencyId); } catch { console.error('Logo cleanup deferred.'); }
    }
    revalidatePath('/agency', 'layout');
    revalidatePath(`/agency/${agencyId}/settings`);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof LogoError) return Response.json({ message: error.message }, { status: error.status, headers });
    console.error('Agency logo operation failed.');
    return Response.json({ message: 'We couldn’t update your logo. Please try again.' }, { status: 503, headers });
  }
}
export const POST = handle;
export const DELETE = handle;
