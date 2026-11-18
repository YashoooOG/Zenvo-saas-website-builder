import { getDb } from '@/lib/db';
import { handleConnectWebhook } from '@/lib/connect-webhook';

export async function POST(request: Request) {
  return handleConnectWebhook(request, { env: process.env, db: getDb });
}
