# Prisma and Clerk synchronization

Stage 6 uses stable Prisma 7.10.1 with its MySQL/MariaDB driver adapter. Prisma 8
was a release candidate when this stage was implemented. Dependencies resolve
through the committed Bun lockfile. See the [Prisma MySQL documentation](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql).

## Database lifecycle

Run from `my-app`, after configuring `.env.local` and starting Docker Desktop:

```powershell
bun install --frozen-lockfile
bun run db:up
bun run db:generate
bun run db:validate
bun run db:migrate
bun run db:migrations
```

`db:migrate` applies committed migration files with `prisma migrate deploy`.
It does not reset the database. The initial migration creates 14 application
tables. Repeating it leaves existing data intact and reports no pending
migrations. `prisma.config.ts` loads environment files in Next.js order.

The application uses a lazy, server-only singleton entry point, `getDb()`, to
reuse the connection pool. The current adapter deliberately supports the local
MySQL configuration only. Remote TLS configuration is still a release-stage
task; unsupported URL options are rejected instead of silently discarded.

Generated client code is ignored by Git. Development, typecheck, and build
commands regenerate it. Run `db:generate` separately before persistence tests
on a fresh checkout. Do not edit applied migration SQL or use `db push` as a
replacement for migration history.

For the next schema change, generate SQL from the current schema/database diff,
review it, and commit a new migration folder before applying it. A typical local
command is `bunx prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma --script --output prisma/migrations/<timestamp>_<name>/migration.sql`.
Create that directory first. Never pipe an unreviewed diff into a database.
`migrate dev` requires a separate shadow database; the app user intentionally
does not have server-wide database-creation privileges.

## Model relationships

| Models | Responsibility and boundary |
| --- | --- |
| User | Clerk ID identity; optional profile and deletion marker |
| ClerkWebhookReceipt | Unique signed delivery ID; no raw payload retained |
| Agency, AgencyMembership | Agency owner and agency-scoped ADMIN/MEMBER/CLIENT roles |
| SubAccount, SubAccountMembership | Client workspaces and ADMIN/MEMBER/GUEST roles |
| Pipeline, Lane, Ticket, Contact | Client-scoped workflow; compound foreign keys prevent cross-client references |
| Funnel, FunnelPage | Client-scoped pages; unique paths, separate draft/published JSON |
| Media | Client-owned storage metadata |
| CustomDomain | Unique hostname with verification timestamp; routing remains disabled until ownership verification is implemented |

The owner is represented by `Agency.ownerId`, not a second potentially
conflicting membership role. Client users still have an agency membership with
role CLIENT; their sub-account membership must reference that same agency.
Foreign keys do not replace server-side authorization: every later action must
check the authenticated user, active/deleted status, membership, and role.

Identifiers and delivery IDs use binary collation so case-distinct Clerk IDs
cannot collapse together. Future hostname/subdomain writers must normalize to
lowercase and use the reserved-name policy before insertion. Future page writers
must normalize paths and validate editor JSON. A schema is not an implemented
builder, billing system, or publishing workflow.

## Webhook behavior

`POST /api/clerk-webhook` is public on the main application host. Clerk's SDK
verifies the raw body's signature and delivery timestamp before Zod validates
the fields used by Zenvo. Requests are bounded to 1 MiB. Missing configuration
returns 503; missing/invalid signatures or payloads return 400. Unsupported
signed event types receive 200 without database access.

Supported events: `user.created`, `user.updated`, `user.deleted`.

- Profile changes use the payload's `updated_at`; older or equal versions are
  ignored. Primary email is selected by ID, never by array position. Email is
  not the identity key. Metadata cannot grant roles or memberships.
- A delivery receipt and profile mutation commit in one transaction. Duplicate
  deliveries are acknowledged, while failed transactions remain retryable.
- Transactions use READ COMMITTED and a user row lock. This prevents concurrent
  initial deliveries from observing a stale MySQL snapshot or regressing data.
- Deletion is terminal for that Clerk ID. It clears email/name/image, removes
  memberships, and keeps an ID/version/deletion marker to reject delayed events.
  Owned agencies and business records are retained for a later ownership or
  retention workflow. Authorization must reject deleted owners too.
- Database failures return 503 so Clerk can retry. No secrets, profile payloads,
  or connection URLs are written to application logs.

Webhooks are eventually consistent. Stage 7a onboarding fetches the authenticated
Clerk profile when it has not arrived locally, using the same synchronization
rules. Existing Clerk users are imported on their first agency visit, not in bulk
by this migration. See [Clerk delivery guarantees](https://clerk.com/docs/guides/development/webhooks/overview).

## Activate real Clerk delivery

Local signature/HTTP tests work without a public tunnel or a live signing secret.
They do **not** configure an endpoint in your Clerk dashboard.

1. When a public development or deployment URL is available, add a webhook
   endpoint in the matching Clerk instance: `https://<app-host>/api/clerk-webhook`.
2. Subscribe to `user.created`, `user.updated`, and `user.deleted`.
3. Copy that endpoint's signing secret into ignored `.env.local` as
   `CLERK_WEBHOOK_SIGNING_SECRET`. It differs from `CLERK_SECRET_KEY`.
   Keep it out of chat and Git; restart the server after configuration.
4. Send a test event from the dashboard and check its delivery status plus the
   matching local user. Then check an update and deletion with disposable data.

Production requires a separate matching endpoint/secret and configured DNS/TLS.
Real provider delivery and recovery/replay from the Clerk dashboard remain
external integration checks. See [Clerk's setup guide](https://clerk.com/docs/guides/development/webhooks/syncing).

## Tests

```powershell
bun run test:persistence
bun run build
bun run test:webhook:http
```

Persistence tests exercise real MySQL foreign keys, decimal values, draft
separation, duplicate receipts, concurrent/out-of-order deliveries, deletion,
signature tampering/expiry, payload limits, and transaction rollback. The HTTP
suite starts an isolated localhost production server using a random process-only
signing key, verifies the actual route, then stops the server. Both suites delete
only their own named fixtures or roll back their fixture transactions. They
never call Clerk's account-management API or overwrite `.env.local`.

The expected `Clerk user synchronization failed` line during the unavailable-
database test is intentional. Bun tests explicitly load `.env.local` because
test-mode environment discovery otherwise skips it.
