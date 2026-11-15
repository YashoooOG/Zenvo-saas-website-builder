import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createDatabaseClient } from '../src/lib/database-client';

// Only process-local signing material; never overwrites the user's Clerk secret.
const key = randomBytes(32);
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `zenvo_http_${randomUUID().replaceAll('-', '')}`;
let child: ChildProcess | undefined;
let base: string;
before(async () => {
  const socket = createServer();
  socket.listen(0, 'localhost');
  await once(socket, 'listening');
  const address = socket.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  base = `http://localhost:${port}`;
  child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', 'localhost', '--port', String(port)], {
    windowsHide: true, stdio: 'ignore', env: {
      ...process.env, NODE_ENV: 'production', ZENVO_ROOT_DOMAIN: 'localhost',
      CLERK_WEBHOOK_SIGNING_SECRET: `whsec_${key.toString('base64')}`,
    },
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('Isolated production preview failed to start');
    try {
      const response = await fetch(`${base}/api/clerk-webhook`, { method: 'POST', signal: AbortSignal.timeout(1000) });
      if (response.status === 400) return;
    } catch { /* server still starting */ }
    await delay(250);
  }
  throw new Error('Production preview startup timed out');
});
after(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  try {
    await db.clerkWebhookReceipt.deleteMany({ where: { id: `${prefix}_event` } });
    await db.user.deleteMany({ where: { id: `${prefix}_user` } });
  } finally { await db.$disconnect(); }
});

test('production route verifies signature and persists exactly one user for replayed deliveries', async () => {
  const eventId = `${prefix}_event`;
  const id = `${prefix}_user`;
  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const body = JSON.stringify({ type: 'user.created', timestamp: now, data: {
    id, updated_at: now, first_name: 'HTTP', last_name: 'Fixture',
    primary_email_address_id: null, email_addresses: [],
  } });
  const signature = createHmac('sha256', key).update(`${eventId}.${seconds}.${body}`).digest('base64');
  const headers = { 'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': String(seconds), 'svix-signature': `v1,${signature}` };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${base}/api/clerk-webhook`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: 'Received' });
  }
  assert.equal(await db.clerkWebhookReceipt.count({ where: { id: eventId } }), 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).name, 'HTTP Fixture');
  const tampered = await fetch(`${base}/api/clerk-webhook`, { method: 'POST', headers, body: body.replace('Fixture', 'Tampered') });
  assert.equal(tampered.status, 400);
});

test('production webhook is public but rejects unsigned and non-POST requests', async () => {
  const unsigned = await fetch(`${base}/api/clerk-webhook`, { method: 'POST', body: '{}' });
  assert.equal(unsigned.status, 400);
  assert.match(unsigned.headers.get('cache-control') || '', /no-store/);
  const get = await fetch(`${base}/api/clerk-webhook`);
  assert.equal(get.status, 405);
});
