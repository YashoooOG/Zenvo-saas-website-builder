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

Stage 3 is committed as `f4b8b7e`.
Clerk accepted the development key; lint, TypeScript, production build, and five
HTTP authentication checks passed on November 15, 2026. Browser checks passed for
email-code sign-in with a disposable development account, workspace access,
session persistence after refresh, the authenticated session API, sign-out, and
rejection after sign-out. Sign-up form rendering and keyboard navigation were
checked, with no horizontal overflow at 390px and 1366px widths. The temporary
test user was deleted afterward. New-account password registration, password
recovery, and GitHub/Google OAuth were not exercised; the owner deferred personal
acceptance testing until the complete project. See [authentication instructions](AUTHENTICATION.md).

Stage 4 is committed as `20ccae8`.
Validation on November 15, 2026: ESLint, TypeScript, production build, and all
five HTTP authentication regression checks passed. Browser checks covered
desktop light/dark layouts, mobile layout at 390px, overflow at 320px, preview
tabs with arrow and End keys, FAQ disclosure, mobile navigation dismissal with
Escape and anchor selection, theme persistence after reload, and dark theme
propagation into Clerk sign-in. No browser errors were recorded; Clerk emitted
its expected development-key warning. Product previews explicitly use sample
data; agency features and billing remain later stages. See [landing page notes](LANDING-PAGE.md).

Stage 5 is committed as `6aef0fd`.
Validation on November 15, 2026: ESLint, TypeScript, production build, five
hostname/path policy tests, four HTTP routing tests, and five authentication
regression tests passed. HTTP checks cover public-site rewrites, reserved and
unknown hosts, app/API/auth isolation, encoded paths, internal-route denial, and
forged forwarded-host/tenant headers. The initial sandboxed build hit a generated
directory permission error; the build outside the sandbox passed. No UI changes
were made in this stage. Tenant hosts currently return uncached 404 responses;
persisted tenant records and published content remain subsequent stages.
See [routing configuration and tests](TENANT-ROUTING.md).

Stage 6 is committed as `5b6c18e`.
Validation on November 15, 2026: Prisma schema validation, initial migration on
local MySQL, migration replay with no pending changes, and a zero-difference
schema comparison passed. ESLint, TypeScript, production build, ten persistence
tests, two production HTTP webhook tests, five authentication regressions, and
four HTTP routing regressions passed. Tests caught and fixed a concurrent-insert
snapshot issue using READ COMMITTED transactions with user row locks. Test data
was scoped to disposable fixtures; application migrations were not reset.

Real Clerk dashboard delivery is not configured yet: a public endpoint and its
`CLERK_WEBHOOK_SIGNING_SECRET` are still needed. Local tests use temporary signing
material and the actual Clerk verifier. This does not establish external provider
delivery. Stage 7 must also handle profiles whose webhook has not arrived during
onboarding. See [Prisma and sync setup](PRISMA-AND-SYNC.md).

Stage 7a (agency creation/settings) is committed as `ce93956`.
Validation on
November 15, 2026: additive migration, zero schema drift, TypeScript, ESLint,
production build, eight agency tests, ten persistence regressions, and five
authentication regressions passed. Browser checks covered real development
sign-in, profile bootstrap, validation, two agency creations, settings updates,
refresh persistence, stale-tab conflicts, separate form state, mobile layouts,
and sign-out/rejection. Testing caught and fixed duplicate labels in retained
routes and missing request-time boundaries around Prisma. Disposable Clerk and
local database fixtures were removed. See [agency notes](AGENCIES.md).

Stage 7b (agency logo uploads) is committed as `259e21c`.
Validation on November 15, 2026: additive migration, production build (including
TypeScript), ESLint, ten logo tests, eight agency tests, ten persistence tests,
and six authentication HTTP checks passed. A disposable Clerk account verified
real UploadThing upload, replacement, decoded image dimensions, refresh
persistence, removal, desktop light and mobile dark layouts, and sign-out.
No browser errors were recorded. Both cloud files were confirmed absent after
removal; the disposable workspace and identity were deleted. See
[logo setup and lifecycle](AGENCY-LOGOS.md).

Stage 8 (workspace navigation and shared dialogs) is committed as `086eea5`.
Production build including TypeScript, ESLint, eight agency
authorization/persistence tests, and six HTTP authentication regressions passed
on November 15, 2026. Browser checks covered empty and populated switchers,
case-insensitive search and no results, two-agency switching, current navigation,
rename propagation, Escape and Tab/Shift+Tab focus behavior, unsaved form
preservation, mobile menu navigation, 390px/320px overflow checks, light/dark
layouts, unavailable-agency rejection, and sign-out. No browser errors were
recorded. Disposable local agencies and the Clerk identity were removed.
Sub-account navigation will accompany Stage 11; Stage 9 membership permissions
are next. See [workspace navigation notes](WORKSPACE-NAVIGATION.md).

Stage 9a (agency permissions and team management) is committed as `5d9f659`.
The additive
membership-version migration and zero-drift schema comparison passed. Production
build, TypeScript, lint, eight permission tests, eight agency tests, ten logo
tests, ten persistence tests, and six HTTP authentication checks passed.
Browser verification completed November 16, 2026: owner role changes persisted,
removal confirmation/cancel/removal worked, member settings/team routes were
denied, admins saved settings but could not read team data, and a 320px team
layout had no horizontal overflow. Browser testing caught and fixed the removal
submit value. Local database service was restored after interruption. Disposable
agencies, memberships, synthetic users, and the Clerk identity were removed.
See [permission matrix and concurrency rules](PERMISSIONS.md).

Stage 9b (invitation links and acceptance) is committed as `3aa2fb6`.
Validation on November 16, 2026: additive migration and zero schema drift,
production build including TypeScript, lint, seven invitation tests, eight
permission tests, eight agency tests, ten logo tests, and six HTTP authentication
checks passed. Browser checks covered creating/copying/revoking a link, email
mismatch denial, verified-primary-email acceptance, resulting Member access,
refresh persistence, consumed-link rejection, 320px layout, and sign-out. No
browser console errors were recorded. Disposable identities and database records
were removed. Owners manually share links; automatic email delivery is not
configured. Client invitations remain tied to Stage 11 sub-account assignments.
See [invitation setup and lifecycle](INVITATIONS.md).

Stage 10 (agency Launchpad) is committed as `eb366ba`.
Validation on November 16, 2026: production build including TypeScript, lint,
five Launchpad tests, eight permission tests, and six HTTP authentication checks
passed. Browser checks verified the agency-creation redirect, initial progress,
saving contact details through settings, completed progress after reload,
sidebar context, a 320px layout without horizontal overflow, and sign-out.
No browser console errors were recorded. The disposable agency and Clerk
development identity were removed. No migration was required. Stage 11 client
sub-accounts are next. See [Launchpad completion rules](LAUNCHPAD.md).

Stage 11a (client workspace lifecycle) is committed as `1ba1c07`.
Validation on November 16, 2026: additive migration, zero schema drift,
production build including TypeScript, lint, five sub-account integration tests,
eight permission regressions, and six authentication checks passed. The latter
now cover client list/detail and agency client routes. Browser verification
covered creation, rename, archive, archived-entry rejection, restore, persisted
details after reload, restored entry, 320px layout without horizontal overflow,
and sign-out. No browser console errors were recorded. Disposable local records
and the Clerk identity were removed. Stage 11b adds assignment management and
client invitations; media storage follows separately. See [client workspace
access and lifecycle](SUBACCOUNTS.md).

Stage 11b (client assignments and invitations) is committed as `1c6966b`.
Validation on November 16, 2026: additive migration completed
after correcting the invitation table collation, zero schema drift, production
build including TypeScript, lint, and 34 automated checks passed. Browser checks
covered assignment persistence and confirmed removal, invitation creation/copy/
revocation, wrong-email denial, verified acceptance, guest entry after reload,
agency denial, consumed-link rejection, 320px layout, and sign-out. No browser
console errors were recorded. All disposable browser fixtures were removed.
Owners share invitation links manually; no automatic email is sent. Stage 11c
adds the client media library. See [client access](CLIENT-ACCESS.md).

Stage 11c (client image library) is committed as `5b6740f`.
Validation on November 16, 2026: additive migration, zero schema drift, production
build including TypeScript, lint, and 28 automated checks passed. Browser checks
covered real UploadThing upload/rendering, refresh persistence, search and no
results, link copy, guest read-only access, 320px layout, removal cancel/confirm,
and sign-out. No browser console errors were recorded. Provider verification
confirmed the test image was deleted; all disposable identities and local records
were removed. This library supports public website images, not private documents.
Stage 12 begins pipelines and project management. See [media lifecycle and
cleanup](MEDIA.md).

Stage 12a (persistent project boards) is implemented; awaiting the owner's
commit. Validation on November 17, 2026: additive migration, zero schema drift,
production build including TypeScript, lint, and 22 automated checks passed.
Browser verification covered board/ticket creation, same-lane ordering,
cross-lane moves, lane rename/addition, reload persistence, 320px layout,
guest read-only access, and sign-out. No browser console errors were recorded;
disposable local and Clerk fixtures were removed. This checkpoint provides
keyboard/touch movement controls. Stage 12b adds drag-and-drop and ticket editing/
removal; contacts and values follow within Stage 12. See [project boards](PIPELINES.md).

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
