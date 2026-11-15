import 'server-only';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { cache } from 'react';
import { connection } from 'next/server';
import { getDb } from './db';
import { ensureProfile } from './ensure-profile';

export const requireWorkspaceUser = cache(async () => {
  await connection();
  const { userId } = await auth.protect();
  return ensureProfile(getDb(), userId, async id => (await clerkClient()).users.getUser(id));
});
