import { getDb } from '@/lib/db';
import { handleClerkWebhook } from '@/lib/clerk-webhook';

export async function POST(request: Request) {
  return handleClerkWebhook(request, {
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    db: getDb,
  });
}
