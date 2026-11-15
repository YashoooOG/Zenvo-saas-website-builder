import { resolveHost, rootDomain } from '@/lib/tenant-routing';

export async function GET(request: Request, context: RouteContext<'/tenant-site/[subdomain]/[[...path]]'>) {
  const { subdomain } = await context.params;
  const host = resolveHost(request.headers.get('host'), rootDomain());
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
  if (host.kind !== 'tenant' || host.subdomain !== subdomain) {
    return new Response('Site not found', { status: 404, headers });
  }
  // A valid subdomain is only a lookup key. Stage 6 adds persisted tenant
  // records; Stage 17 serves published pages. Never invent a tenant from Host.
  return new Response('Site not published', { status: 404, headers });
}
