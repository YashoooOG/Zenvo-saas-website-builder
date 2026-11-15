# Zenvo implementation roadmap

Reference: https://www.youtube.com/watch?v=6omuUOZcWL0

The chapter timestamps guide feature order. Implementation uses the installed Next.js 16, React 19, Tailwind 4, and Base UI shadcn stack. Check older tutorial APIs against installed documentation and current integration guides.

Each stage ends with validation and a user commit checkpoint. Larger stages can be split into smaller commits. Do not advance until the user confirms the commit.

## Progress

Stage 1 is committed as `834a08b`.
Validation on November 15, 2026: ESLint (zero warnings), Next.js route type
generation and TypeScript, production build, homepage HTTP 200 and Zenvo title,
compiled stylesheet delivery, and unknown-route HTTP 404 all passed. The temporary
smoke-test server was stopped. No browser visual review was performed in this
configuration stage. Real environment files remain ignored by Git.

The build uses Webpack and Tailwind PostCSS after the original Turbopack CSS
worker failed on this Windows environment. Framework versions remain unchanged.

Stage 2 is committed as `fac251f`.
Validation on November 15, 2026: MySQL 8.4.13 container health, an authenticated
query and temporary write/read as the application user, three configuration/setup
tests, ESLint, TypeScript, and the production build all passed. The database is
running on `127.0.0.1:3307` with data in `zenvo-local_mysql-data`. Generated local
credentials are in ignored `.env.local`; the existing `.env` was preserved.
No permanent application tables have been created. See [database instructions](DATABASE.md).

Stage 3 is implemented and verified; awaiting the project owner's commit.
Clerk accepted the development key; lint, TypeScript, production build, and five
HTTP authentication checks passed on November 15, 2026. Browser checks passed for
email-code sign-in with a disposable development account, workspace access,
session persistence after refresh, the authenticated session API, sign-out, and
rejection after sign-out. Sign-up form rendering and keyboard navigation were
checked, with no horizontal overflow at 390px and 1366px widths. The temporary
test user was deleted afterward. New-account password registration, password
recovery, and GitHub/Google OAuth were not exercised; the owner deferred personal
acceptance testing until the complete project. See [authentication instructions](AUTHENTICATION.md).

| Stage | Tutorial anchor | Deliverable | Verification gate |
| --- | --- | --- | --- |
| 1 | 14:51 | Project identity, font tokens, scripts, setup documentation | Lint, type check, production build, HTTP smoke check |
| 2 | 19:09 | Local MySQL setup, environment validation, connection instructions | Database health check and real connection query |
| 3 | 24:00 | Clerk sign-in/sign-up, protected routes, session handling | Signed-out redirects, sign-in/out, invalid session rejection |
| 4 | 40:28 | Responsive Zenvo landing page and light/dark theme | Desktop/mobile visuals, keyboard navigation, theme persistence |
| 5 | 1:04:53 | Subdomain routing and tenant resolution | Host parsing, reserved subdomains, unknown-host rejection |
| 6 | 1:18:34 | Prisma schema, migrations, Clerk user synchronization | Clean database migration, webhook signature/idempotency tests |
| 7 | 1:37:51 | Agency creation, forms, settings, authorized logo uploads | Validation, persistence, ownership and upload access checks |
| 8 | 3:13:23 | Context-aware navigation and shared dialogs | Context switching, dialog accessibility, permission checks |
| 9 | 4:37:18 | Memberships, invitations, agency and client roles | Cross-tenant denial and role matrix tests on server operations |
| 10 | 5:10:24 | Launchpad onboarding | Completion derived from persisted setup data |
| 11 | 6:10:33 | Client sub-accounts and UploadThing media library | Authorized CRUD and tenant isolation |
| 12 | 6:57:24 | Pipelines, lanes, contacts, tickets, Kanban drag/drop | Persistent ordering, invalid moves, concurrency, access checks |
| 13 | 9:24:55 | Agency subscriptions, billing portal, Stripe webhooks | Test-mode checkout, verified/replayed webhook events |
| 14 | 10:14:20 | Stripe Connect onboarding, product sync, fees | Account ownership, test payments, webhook reconciliation |
| 15 | 11:04:44 | Funnels/pages CRUD and recursive editor state | JSON validation, tenant access, editor operation tests |
| 16 | 12:00:46 | Drag/drop canvas, inspector, responsive preview, undo/redo | Nested moves, history, save/reload, keyboard and viewport checks |
| 17 | 14:50:49 | Funnel checkout and public publishing | Server-verified pricing, payment isolation, draft/published separation |
| 18 | 15:23:02 | Agency/client metrics and live notifications | Tenant-scoped aggregates, live delivery, access/reconnect tests |
| 19 | Release | Custom domains, white-label settings, deployment, operational hardening | Domain ownership, end-to-end flows, backup/restore, monitoring, production configuration |

## Architectural rules

- Treat agency and sub-account IDs from URLs or request bodies as untrusted input. Every server read/write must enforce membership and tenant scope.
- Hiding a sidebar link is not access control. Guests must be denied mutations by the server as well as by the interface.
- Verify Clerk, Stripe, and upload callback authenticity. Handle retries and duplicate events without repeating effects.
- Never accept client-supplied prices, connected-account IDs, or fee calculations as authoritative. Start all payment testing in Stripe test mode.
- Store structured, validated editor content; do not execute arbitrary scripts supplied through the builder. Separate drafts from published pages.
- Provider secrets stay on the server. Only deliberately public configuration receives a `NEXT_PUBLIC_` prefix.
- Use migrations for database changes. Production readiness requires successful integration and deployment checks, not only a successful frontend build.

## External setup checkpoints

MySQL, Clerk, UploadThing, and Stripe require real configuration during their stages. Document exact environment variables and callback URLs then; keep credential entry in local environment files or provider dashboards. Domain publishing later requires DNS and ownership verification.

## Stage 1 learning notes

`layout.tsx` wraps each page and provides default metadata. A page can later set its own title; the template adds `| Zenvo` automatically. Tailwind font tokens reference CSS variables provided by `next/font`. Route type generation makes TypeScript checks work before a development server has been started.
