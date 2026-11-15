# Zenvo

An agency platform being built in tested, reviewable stages. The intended product includes tenant-isolated client accounts, website and funnel editing, project pipelines, media storage, and Stripe billing.

## Current status

The application foundation and local MySQL tooling are implemented. Authentication, application tables, dashboards, and payments are not implemented yet. The homepage remains the framework starter; the marketing page has its own implementation stage.

This project adapts the Web Prodigies tutorial to the existing Next.js 16 stack. See [the implementation roadmap](docs/ROADMAP.md) for scope and verification gates.

## Requirements

- Node.js 20.9 or later (required by Next.js).
- Bun 1.4.4, matching `packageManager` in `package.json`.

## Run locally

From the repository root:

```powershell
cd my-app
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. No external services are required for Stage 1.
If PowerShell cannot find Bun but it is installed in its default location, use `& "$env:USERPROFILE\.bun\bin\bun.exe" run dev`.

## Local database

Start Docker Desktop with its Linux engine, then run from `my-app`:

```powershell
bun run db:setup
bun run db:up
bun run db:check
```

This creates a MySQL 8.4 database on `127.0.0.1:3307`. The setup script generates
credentials in ignored `.env.local`; existing configuration is preserved. The
application uses the `zenvo` user, whose permissions are scoped to the `zenvo`
database. Docker stores data in the `zenvo-local_mysql-data` volume.

`bun run db:check` verifies authentication, the selected database, and a temporary
write/read operation. It does not create permanent application tables. Prisma
migrations are introduced in Stage 6.

Use `bun run db:status` to inspect health and `bun run db:stop` to stop MySQL while
retaining data. Run `bun run db:up` to start it again. Configuration tests run with
`bun run test:db`. See [database setup and troubleshooting](docs/DATABASE.md).

## Verify changes

Run these from `my-app` before committing:

```powershell
bun run lint
bun run typecheck
bun run build
```

The type check generates Next.js route types before checking TypeScript. The production build checks that the app can compile and render its routes. The current `next/font/google` setup needs Google Fonts access during a cold build.

Development and production builds use Next.js's supported Webpack option with
Tailwind's PostCSS plugin. The initial Turbopack configuration crashed while
starting its CSS worker on this Windows setup; Webpack keeps the same framework
versions and provides a working build path.

References: [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next),
[Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

Run `bun run start` to inspect a production build locally.

## Source map

- `src/app/layout.tsx`: document shell, fonts, and default page metadata.
- `src/app/page.tsx`: the public homepage.
- `src/app/globals.css`: Tailwind imports and shared theme tokens.
- `src/components/ui`: reusable shadcn components, currently using Base UI.
- `src/lib`: shared utilities.
- `.env.example`: tracked configuration guidance without secrets.

Real credentials belong in ignored `.env` or `.env.local` files. Integration variables will be added to the example as their features are implemented.

## Working agreement

Implement one stage, run its checks, review the changes, and let the project owner commit before starting the next stage. Commit author identity remains the project owner's; do not add assistant co-author trailers or alter Git identity settings.
