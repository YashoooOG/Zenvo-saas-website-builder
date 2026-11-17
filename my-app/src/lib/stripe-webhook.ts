import Stripe from 'stripe';
import type { PrismaClient } from '../generated/prisma/client';
import { billingConfiguration } from './billing-plan';
import { parseSubscriptionEvent, syncSubscription } from './subscriptions';

const reply = (status: number, message: string) => Response.json({ message }, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function handleStripeWebhook(request: Request, options: {
  env: Readonly<Record<string, string | undefined>>;
  db: () => PrismaClient;
  retrieve?: (id: string) => Promise<Stripe.Subscription>;
}) {
  let config;
  const secret = options.env.STRIPE_WEBHOOK_SECRET?.trim();
  try {
    config = billingConfiguration(options.env);
    if (!secret?.startsWith('whsec_')) return reply(503, 'Webhook is not configured');
  } catch { return reply(503, 'Webhook is not configured'); }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return reply(400, 'Invalid webhook');
  const reader = request.body?.getReader();
  if (!reader) return reply(400, 'Invalid webhook');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) { await reader.cancel(); return reply(413, 'Webhook too large'); }
      chunks.push(value);
    }
  } catch { return reply(400, 'Invalid webhook'); }
  const stripe = new Stripe(config.key, { timeout: 10000, maxNetworkRetries: 0 });
  let event;
  try {
    event = parseSubscriptionEvent(await stripe.webhooks.constructEventAsync(Buffer.concat(chunks), signature, secret));
  } catch { return reply(400, 'Invalid webhook'); }
  if (!event) return reply(200, 'Ignored');
  try {
    const outcome = await syncSubscription(options.db(), event, config.priceId, options.retrieve ?? (id => stripe.subscriptions.retrieve(id)));
    return reply(200, outcome === 'ignored' ? 'Ignored' : 'Received');
  } catch {
    // No payloads, credentials, or provider request details in responses or logs.
    console.error('Stripe subscription synchronization failed; delivery can be retried.');
    return reply(503, 'Synchronization unavailable');
  }
}
