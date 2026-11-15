import env from '@next/env';

env.loadEnvConfig(process.cwd(), true);
const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const secret = process.env.CLERK_SECRET_KEY || '';

try {
  if (!/^pk_(test|live)_.+/.test(publishable) || !/^sk_(test|live)_.+/.test(secret)) {
    throw new Error('Add valid NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to .env.local. Do not paste keys into chat.');
  }
  if (publishable.split('_')[1] !== secret.split('_')[1]) {
    throw new Error('Clerk keys must come from the same development or production instance.');
  }
  const response = await fetch('https://api.clerk.com/v1/instance', {
    headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Clerk rejected the configuration check (HTTP ${response.status}). Check the key pair in your Clerk dashboard.`);
  console.log('PASS: Clerk secret key accepted. Verify the publishable key belongs to this same instance in the dashboard; browser sign-in tests verify the complete pair.');
} catch (error) {
  // Never output API response bodies or environment values.
  console.error(error instanceof TypeError ? 'Clerk is unreachable. Check network access.' : error.message);
  process.exitCode = 1;
}
