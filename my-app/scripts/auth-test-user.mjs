import env from '@next/env';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

env.loadEnvConfig(process.cwd(), true);
const file = '.auth-test-user.json';
const secret = process.env.CLERK_SECRET_KEY || '';
const command = process.argv[2];
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Clerk test fixture request failed (HTTP ${response.status}).`);
  return response.json();
}

try {
  if (!secret.startsWith('sk_test_')) throw new Error('Test fixtures require a Clerk development key.');
  const instance = await api('/instance');
  if (instance.environment_type !== 'development') throw new Error('Refusing to create or delete fixtures outside development.');
  if (command === 'create') {
    if (existsSync(file)) throw new Error('A test fixture already exists. Clean it up before creating another.');
    const email = `zenvo-${randomUUID()}+clerk_test@example.com`;
    const user = await api('/users', 'POST', {
      email_address: [email], skip_password_requirement: true,
      private_metadata: { zenvoAuthTest: true },
    });
    writeFileSync(file, JSON.stringify({ userId: user.id, email }), { flag: 'wx', mode: 0o600 });
    console.log(`Development test user created: ${email}`);
  } else if (command === 'cleanup') {
    const fixture = JSON.parse(readFileSync(file, 'utf8'));
    const user = await api(`/users/${encodeURIComponent(fixture.userId)}`);
    if (user.private_metadata?.zenvoAuthTest !== true ||
        !user.email_addresses.some(address => address.email_address === fixture.email) ||
        !/^zenvo-.+\+clerk_test@example\.com$/.test(fixture.email)) {
      throw new Error('Fixture identity check failed; no user was deleted.');
    }
    await api(`/users/${encodeURIComponent(fixture.userId)}`, 'DELETE');
    unlinkSync(file);
    console.log('Temporary development user deleted; fixture file removed.');
  } else {
    throw new Error('Usage: node scripts/auth-test-user.mjs create|cleanup');
  }
} catch (error) {
  console.error(error instanceof TypeError ? 'Clerk is unreachable.' : error.message);
  process.exitCode = 1;
}
