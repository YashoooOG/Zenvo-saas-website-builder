import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { handleConnectCallback } from '@/lib/connect-callback';
import { stripeConnectOAuthProvider } from '@/lib/stripe-connect';

export async function GET(request: Request) {
  const { userId } = await auth();
  return handleConnectCallback(request, { actorId: userId, env: process.env, db: getDb, provider: stripeConnectOAuthProvider });
}
