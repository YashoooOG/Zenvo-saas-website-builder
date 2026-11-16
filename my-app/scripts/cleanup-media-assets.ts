import env from '@next/env';
import { createDatabaseClient } from '../src/lib/database-client';
import { cleanupMediaAssets } from '../src/lib/client-media';
import { createMediaStorage } from '../src/lib/media-storage';
env.loadEnvConfig(process.cwd(), true);
const db = createDatabaseClient(process.env.DATABASE_URL);
try { await cleanupMediaAssets(db, createMediaStorage()); console.log('Processed up to 20 retired media assets. Repeat until the queue is empty.'); }
finally { await db.$disconnect(); }
