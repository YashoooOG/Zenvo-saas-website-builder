import 'server-only';
import { createDatabaseClient } from './database-client';

const globalDatabase = globalThis as unknown as {
  zenvoDatabase?: ReturnType<typeof createDatabaseClient>;
};

// Lazy so static builds do not need an active MySQL connection. Reuse one pool
// across development hot reloads and requests in the same server process.
export function getDb() {
  return globalDatabase.zenvoDatabase ??= createDatabaseClient(process.env.DATABASE_URL);
}
