import type { PrismaClient } from '../generated/prisma/client';
import { connectConfiguration } from './agency-payments';
import { completeConnectOAuth, parseConnectCallback, type ConnectOAuthProvider } from './connect-oauth';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export async function handleConnectCallback(request: Request, options: { actorId: string | null; env: Readonly<Record<string, string | undefined>>; db: () => PrismaClient; provider: (key: string) => ConnectOAuthProvider }) {
  if (!options.actorId) return Response.json({ message: 'Sign in, then start a new connection from Payments.' }, { status: 401, headers });
  let config;
  try { config = connectConfiguration(options.env); } catch { return Response.json({ message: 'Stripe Connect is not configured.' }, { status: 503, headers }); }
  try {
    const url = new URL(request.url);
    if (`${url.origin}${url.pathname}` !== config.callbackUrl) throw new Error('Unexpected callback URL');
    const callback = parseConnectCallback(url);
    const result = await completeConnectOAuth(options.db(), options.actorId, callback, options.env, options.provider(config.key));
    const destination = new URL(`/agency/${encodeURIComponent(result.agencyId)}/payments`, config.callbackUrl);
    destination.searchParams.set('connect', result.outcome);
    return new Response(null, { status: 303, headers: { ...headers, Location: destination.href } });
  } catch {
    // Do not return/log query strings, authorization codes, state or provider errors.
    return Response.json({ message: 'Authorization could not be completed. Start a new connection from Payments.' }, { status: 400, headers });
  }
}
