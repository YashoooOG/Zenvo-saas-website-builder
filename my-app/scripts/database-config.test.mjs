import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { localDatabaseConfig } from './database-config.mjs';

test('decodes credentials and uses the explicit port', () => {
  const config = localDatabaseConfig('mysql://zenvo:p%40ss%3Aword@127.0.0.1:3307/zenvo');
  assert.equal(config.password, 'p@ss:word');
  assert.equal(config.port, 3307);
  assert.equal(config.database, 'zenvo');
  assert.equal(config.multipleStatements, false);
});

test('setup preserves unrelated settings and does not rotate credentials on rerun', t => {
  const directory = mkdtempSync(join(tmpdir(), 'zenvo-db-test-'));
  t.after(() => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\') &&
        !resolve(directory).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe cleanup path');
    rmSync(directory, { recursive: true });
  });
  writeFileSync(join(directory, '.env.local'), 'UNRELATED_SETTING=keep-me\n');
  const inherited = { ...process.env };
  for (const key of Object.keys(inherited)) {
    if (key.startsWith('MYSQL_') || key === 'DATABASE_URL' || key.startsWith('__NEXT')) delete inherited[key];
  }
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./setup-database.mjs', import.meta.url))], {
    cwd: directory, env: inherited, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.equal(run().status, 0);
  const first = readFileSync(join(directory, '.env.local'), 'utf8');
  assert.ok(first.includes('UNRELATED_SETTING=keep-me'));
  assert.match(first, /MYSQL_PASSWORD=[a-f0-9]{48}/);
  const second = run();
  assert.equal(second.status, 0);
  assert.equal(readFileSync(join(directory, '.env.local'), 'utf8'), first);
  assert.ok(!second.stdout.includes(first.match(/MYSQL_PASSWORD=(.+)/)[1]));
});

test('rejects missing, remote, malformed and ambiguous connection settings without exposing credentials', () => {
  for (const value of [undefined, '', 'not-a-url',
    'postgres://user:secret@localhost/db', 'mysql://user:secret@remote.example/db',
    'mysql://user@localhost/db', 'mysql://user:secret@localhost/',
    'mysql://user:secret@localhost/db/other', 'mysql://user:secret@localhost:0/db',
    'mysql://user:secret@localhost/db?ssl=false', 'mysql://user:secret@localhost/db#fragment',
    'mysql://user:%XXsecret@localhost/db']) {
    assert.throws(() => localDatabaseConfig(value), error => !error.message.includes('secret'));
  }
});
