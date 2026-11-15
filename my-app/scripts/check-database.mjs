import env from '@next/env';
import mysql from 'mysql2/promise';
import { localDatabaseConfig } from './database-config.mjs';

env.loadEnvConfig(process.cwd(), true);
let connection;
try {
  const config = localDatabaseConfig(process.env.DATABASE_URL);
  connection = await mysql.createConnection(config);
  const [rows] = await connection.query({
    sql: 'SELECT 1 AS connected, DATABASE() AS db, VERSION() AS version', timeout: 10000,
  });
  if (rows[0]?.connected !== 1 || rows[0]?.db !== config.database) {
    throw new Error('Unexpected database response');
  }
  // A temporary table validates app-user writes without changing the schema.
  await connection.query('CREATE TEMPORARY TABLE zenvo_connection_probe (id INT PRIMARY KEY, value VARCHAR(100))');
  await connection.execute('INSERT INTO zenvo_connection_probe (id, value) VALUES (?, ?)', [1, 'Zenvo connection verified']);
  const [written] = await connection.execute('SELECT value FROM zenvo_connection_probe WHERE id = ?', [1]);
  if (written[0]?.value !== 'Zenvo connection verified') throw new Error('Write/read verification failed');
  await connection.query('DROP TEMPORARY TABLE zenvo_connection_probe');
  console.log(`PASS: MySQL ${rows[0].version}; authenticated query and temporary write/read succeeded.`);
} catch (error) {
  const hints = {
    ECONNREFUSED: 'MySQL is not reachable. Start Docker Desktop and run bun run db:up.',
    ETIMEDOUT: 'MySQL connection timed out. Check Docker and the configured port.',
    ER_ACCESS_DENIED_ERROR: 'Credentials rejected. Check .env.local against the initialized database credentials.',
    ER_BAD_DB_ERROR: 'Database is missing. Check MYSQL_DATABASE and DATABASE_URL.',
  };
  console.error(hints[error.code] || 'Database check failed. Verify the local DATABASE_URL and run bun run db:status. Credentials are not printed.');
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
