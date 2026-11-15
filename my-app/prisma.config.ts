import nextEnv from '@next/env';
import { defineConfig, env } from 'prisma/config';

// Match Next.js: .env.local takes precedence over .env.
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
