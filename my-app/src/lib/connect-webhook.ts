import Stripe from 'stripe';
import type { PrismaClient } from '../generated/prisma/client';
import { connectConfiguration } from './agency-payments';
import { parseConnectEvent, syncConnectEvent } from './connect-events';
import { parseFunnelPaymentEvent, syncFunnelPaymentEvent, type FunnelPaymentRetrieve } from './funnel-payment-events';

const reply = (status: number, message: string) => Response.json({ message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function handleConnectWebhook(request: Request, options: {
  env: Readonly<Record<string, string | undefined>>; db: () => PrismaClient;
  retrieve?: (id: string) => Promise<unknown>;
  retrievePayment?: FunnelPaymentRetrieve;
}) {
  let config;
  const secret = options.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  try {
    config = connectConfiguration(options.env);
    if (!secret?.startsWith('whsec_')) return reply(503, 'Webhook is not configured');
  } catch { return reply(503, 'Webhook is not configured'); }
  const signature = request.headers.get('stripe-signature');
  const reader = request.body?.getReader();
  if (!signature || !reader) return reply(400, 'Invalid webhook');
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
  let paymentEvent;
  try {
    const verified = await stripe.webhooks.constructEventAsync(Buffer.concat(chunks), signature, secret);
    event = parseConnectEvent(verified, config.clientId);
    paymentEvent = parseFunnelPaymentEvent(verified);
  } catch { return reply(400, 'Invalid webhook'); }
  if (!event && !paymentEvent) return reply(200, 'Ignored');
  try {
    if (paymentEvent) {
      const outcome = await syncFunnelPaymentEvent(options.db(), paymentEvent, options.retrievePayment ?? ((accountId, sessionId) =>
        stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items', 'payment_intent'] }, { stripeAccount: accountId })));
      return reply(200, outcome === 'ignored' ? 'Ignored' : 'Received');
    }
    const outcome = await syncConnectEvent(options.db(), event!, options.retrieve ?? (id => stripe.accounts.retrieve(id)));
    return reply(200, outcome === 'ignored' ? 'Ignored' : 'Received');
  } catch {
    return reply(503, 'Synchronization unavailable');
  }
}
