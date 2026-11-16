import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';

// Run before auth-test-user.mjs cleanup. Verify the remote development fixture
// before removing only the local business records owned by that fixture.
const fixture = JSON.parse(readFileSync('.auth-test-user.json', 'utf8'));
const secret = process.env.CLERK_SECRET_KEY ?? '';
if (!secret.startsWith('sk_test_') || !/^zenvo-.+\+clerk_test@example\.com$/.test(fixture.email)) throw new Error('Not a disposable development fixture.');
const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(fixture.userId)}`, {
  headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error('Cannot verify fixture identity.');
const profile = await response.json();
if (profile.private_metadata?.zenvoAuthTest !== true || !profile.email_addresses.some((email: { email_address: string }) => email.email_address === fixture.email)) throw new Error('Fixture identity mismatch.');
const db = createDatabaseClient(process.env.DATABASE_URL);
try {
  await db.$transaction(async tx => {
    const remainingAssets = await tx.agencyLogoAsset.count({ where: { actorId: fixture.userId, status: { not: 'DELETED' } } });
    if (remainingAssets) throw new Error('Remove fixture logos and finish storage cleanup before deleting this workspace.');
    const mediaScope = { OR: [{ actorId: fixture.userId }, { subAccount: { agency: { ownerId: fixture.userId } } }] };
    if (await tx.mediaAsset.count({ where: { ...mediaScope, status: { not: 'DELETED' } } })) throw new Error('Remove fixture media and finish storage cleanup before deleting this workspace.');
    await tx.mediaAsset.deleteMany({ where: { ...mediaScope, status: 'DELETED' } });
    await tx.agencyLogoAsset.deleteMany({ where: { actorId: fixture.userId, status: 'DELETED' } });
    const user = await tx.user.findUnique({ where: { id: fixture.userId } });
    await tx.agency.deleteMany({ where: { ownerId: fixture.userId } });
    await tx.agencyMembership.deleteMany({ where: { userId: fixture.userId } });
    await tx.user.deleteMany({ where: { id: fixture.userId } });
    if (user) {
      const receipt = `bootstrap_${createHash('sha256').update(`${user.id}:${user.clerkUpdatedAt}`).digest('hex')}`;
      await tx.clerkWebhookReceipt.deleteMany({ where: { id: receipt } });
    }
  });
  console.log('Disposable workspace fixture removed from local MySQL.');
} finally { await db.$disconnect(); }
