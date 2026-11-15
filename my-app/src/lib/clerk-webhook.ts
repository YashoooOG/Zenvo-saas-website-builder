import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest } from 'next/server';
import { parseUserEvent, syncClerkUser } from './clerk-sync';
import type { PrismaClient } from '../generated/prisma/client';

const maxBytes = 1024 * 1024;
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (status: number, message: string) => Response.json({ message }, { status, headers });

export async function handleClerkWebhook(request: Request, options: {
  signingSecret: string | undefined;
  db: () => PrismaClient;
}) {
  if (!options.signingSecret) return reply(503, 'Webhook is not configured');
  if (!request.headers.get('svix-id') || !request.headers.get('svix-signature') || !request.headers.get('svix-timestamp')) return reply(400, 'Invalid webhook');
  // Bound actual bytes, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return reply(400, 'Invalid webhook');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return reply(413, 'Webhook too large'); }
      chunks.push(value);
    }
  } catch { return reply(400, 'Invalid webhook'); }
  const body = Buffer.concat(chunks).toString('utf8');
  let verified: unknown;
  try {
    verified = await verifyWebhook(new NextRequest(request.url, { method: 'POST', headers: request.headers, body }), { signingSecret: options.signingSecret });
  } catch { return reply(400, 'Invalid webhook'); }
  let event;
  const eventId = request.headers.get('svix-id')!.trim();
  try {
    if (!/^[a-zA-Z0-9_-]{1,191}$/.test(eventId)) return reply(400, 'Invalid webhook');
    event = parseUserEvent(verified);
  } catch { return reply(400, 'Invalid event payload'); }
  if (!event) return reply(200, 'Ignored');
  try {
    await syncClerkUser(options.db(), eventId, event);
    return reply(200, 'Received');
  } catch {
    // Do not log payloads, profiles, signing secrets, or database connection URLs.
    console.error('Clerk user synchronization failed; delivery can be retried.');
    return reply(503, 'Synchronization unavailable');
  }
}
