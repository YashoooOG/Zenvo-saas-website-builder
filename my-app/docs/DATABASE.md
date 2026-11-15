# Local MySQL

## What runs where

Next.js runs on your computer. Docker Compose runs the official MySQL 8.4.13
image in the separate `zenvo-local` project. Only the loopback interface exposes
port 3307, which forwards to port 3306 inside the container. Other computers
cannot connect through a LAN interface with this configuration.

Data lives in the named Docker volume `zenvo-local_mysql-data`; stopping the
container preserves it. This is a development configuration, not a production
database deployment or backup strategy.

## First setup

1. Start Docker Desktop using Linux containers.
2. Run `bun run db:setup` from `my-app`.
3. Run `bun run db:up`. The first run downloads MySQL and initializes its data.
4. Run `bun run db:check` to verify authentication and a temporary write/read.

The setup script generates distinct random root and application passwords and
appends them to ignored `.env.local`, preserving unrelated entries. It does not
print passwords. A configured DATABASE_URL is preserved; partial MYSQL settings
require manual completion rather than silently replacing credentials.

Next.js and the check script load `.env.local` before `.env`. Existing process
environment variables take precedence. Compose explicitly reads `.env.local`.
Avoid exporting conflicting MYSQL variables or DATABASE_URL in your terminal.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run db:setup` | Generate missing local configuration |
| `bun run db:up` | Start the database and wait for an authenticated health check |
| `bun run db:status` | Inspect container health |
| `bun run db:check` | Connect as the app user and exercise a temporary table |
| `bun run db:stop` | Stop the database without deleting its volume |
| `bun run test:db` | Test URL validation and setup preservation |

The temporary table is dropped after the check and is also removed automatically
when its connection closes. Stage 6 adds the initial application tables through
`bun run db:migrate`. See [Prisma models, migrations, and Clerk sync](PRISMA-AND-SYNC.md).

## Troubleshooting

- **Docker daemon unavailable:** start Docker Desktop and wait for the Linux
  engine to become ready before running `db:up`.
- **Port in use:** change MYSQL_PORT in `.env.local` and the port in DATABASE_URL
  together, then run `db:up` again.
- **Access denied after editing passwords:** MySQL initializes credentials only
  when its volume is empty. Changing environment variables does not rotate an
  existing database password. Restore the matching local credentials or perform
  a deliberate password rotation in MySQL. Do not delete data to fix this.
- **Existing database:** configure the local DATABASE_URL manually and use
  `db:check`; Compose is optional if you already have a suitable local server.
- **Remote URL rejected:** the Stage 2 checker deliberately accepts only local
  MySQL URLs with no query options. Remote TLS and production connection policy
  will be configured alongside the production database rather than silently
  stripping connection options.
- **Working directory:** run scripts from `my-app`; paths refer to that directory.

Never commit `.env.local`, copy credentials into screenshots, or use
`docker compose down --volumes` on a database whose contents you need.

## References

- [Official MySQL image configuration](https://hub.docker.com/_/mysql)
- [Compose health and startup behavior](https://docs.docker.com/compose/how-tos/startup-order/)
- [MySQL2 promise connections](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-connection)
- [Next.js environment loading](https://nextjs.org/docs/app/guides/environment-variables)
