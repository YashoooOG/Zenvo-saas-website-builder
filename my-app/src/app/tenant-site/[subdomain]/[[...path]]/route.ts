import { resolveHost, rootDomain } from '@/lib/tenant-routing';
import { getDb } from '@/lib/db';
import { loadPublishedPage } from '@/lib/funnel-publishing';
import { publishedHtml } from '@/lib/published-html';

export async function GET(request: Request, context: RouteContext<'/tenant-site/[subdomain]/[[...path]]'>) {
  const { subdomain, path } = await context.params;
  const host = resolveHost(request.headers.get('host'), rootDomain());
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
  if (host.kind !== 'tenant' || host.subdomain !== subdomain) {
    return new Response('Site not found', { status: 404, headers });
  }
  try {
    const page = await loadPublishedPage(getDb(), subdomain, `/${(path ?? []).join('/')}`);
    if (!page) return new Response('Site not published', { status: 404, headers });
    return new Response(publishedHtml(page.name, page.content, page.media), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
  } catch { return new Response('Site temporarily unavailable', { status: 503, headers }); }
}
