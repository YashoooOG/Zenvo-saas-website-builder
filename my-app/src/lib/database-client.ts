import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { localDatabaseConfig } from '../../scripts/database-config.mjs';

// Local MySQL is the currently supported deployment. Do not silently discard
// remote TLS options; production connection policy is configured at release.
export function createDatabaseClient(url: string | undefined) {
  const config = localDatabaseConfig(url);
  const adapter = new PrismaMariaDb({ ...config, connectionLimit: 5, timezone: 'Z' });
  return new PrismaClient({ adapter });
}
