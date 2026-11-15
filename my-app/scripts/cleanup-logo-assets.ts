import { createDatabaseClient } from '../src/lib/database-client';
import { cleanupLogoAssets } from '../src/lib/agency-logos';
import { createLogoStorage } from '../src/lib/logo-storage';
const db = createDatabaseClient(process.env.DATABASE_URL);
try {
  await cleanupLogoAssets(db, createLogoStorage());
  console.log('Processed up to 20 retired logo assets. Active logos are never selected.');
} finally { await db.$disconnect(); }
