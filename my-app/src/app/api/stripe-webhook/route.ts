import { getDb } from '@/lib/db';
import { handleStripeWebhook } from '@/lib/stripe-webhook';

export async function POST(request: Request) {
  return handleStripeWebhook(request, { env: process.env, db: getDb });
}
