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

Stage 12a (persistent project boards) is committed as `fe1e415`.
Validation on November 17, 2026: additive migration, zero schema drift,
production build including TypeScript, lint, and 22 automated checks passed.
Browser verification covered board/ticket creation, same-lane ordering,
cross-lane moves, lane rename/addition, reload persistence, 320px layout,
guest read-only access, and sign-out. No browser console errors were recorded;
disposable local and Clerk fixtures were removed. This checkpoint provides
keyboard/touch movement controls. Stage 12b adds drag-and-drop and ticket editing/
removal; contacts and values follow within Stage 12. See [project boards](PIPELINES.md).

Stage 12b (ticket drag-and-drop, editing, and removal) is committed as `223d504`.
Validation on November 17, 2026: production build including
TypeScript, lint, 11 pipeline tests, eight client-access tests, and seven HTTP
authentication checks passed (26 total). Browser checks covered pointer moves
into an empty lane, keyboard cross-lane moves and reordering, Escape cancellation,
edit persistence, removal cancellation/confirmation, reload persistence, 320px
layout and editing, guest read-only controls, and sign-out. No browser console
errors were recorded. Disposable database records and Clerk identity were removed.
No database migration is needed. Remaining Stage 12 work includes contacts,
ticket values, and board/lane lifecycle controls.

Stage 12c (board renaming and lane management) is committed as `b0d805f`.
Validation on November 17, 2026: production build, TypeScript,
lint, 14 pipeline tests, eight client-access tests, and seven HTTP authentication
checks passed (29 total). Browser verification covered board rename, saved lane
order, populated-lane protection, required removal confirmation, empty-lane
removal, persistence after reload, 320px controls, and sign-out. No browser console
errors were recorded. Disposable local and Clerk fixtures were removed. No
migration is required. Contacts and ticket values remain next within Stage 12.

Stage 12d (contact creation, ticket linking, and estimated values) is committed
as `435e085`. Production build including TypeScript and
lint passed. Eighteen pipeline tests, eight client-access
tests, and seven HTTP authentication checks passed (33 total) on November 17,
2026. The local MySQL container was restarted before integration verification.
Contacts are shared within one client workspace, capped at 500, with optional
email and duplicate-email protection. Tickets can link/unlink contacts and store
non-negative Decimal(19,4) estimates without floating-point conversion. No
currency is assigned and these estimates are not billing totals. No migration is
required. Contact editing/removal and board archival remain later checkpoints.
Signed-in desktop UI verification passed for contact creation, contact selection,
exact estimate entry, dialog scrolling, save, and persistence after reload. The
isolated local verification workspace was removed; the owner's account and session
were retained. Mobile and guest UI checks were not repeated in this checkpoint;
server tests cover guest mutation denial and client isolation.

Stage 12e (contact editing and removal) is committed as `ee0da63`.
Production build including TypeScript, lint, 21 pipeline tests, eight
client-access regressions, and seven authentication checks passed (36 total).
Desktop UI verification on November 17, 2026 covered editing a contact, propagation
to its linked ticket, blocking linked-contact removal, cancellation, unlinking,
confirmed removal, and reload persistence with the ticket and value preserved.
The isolated verification workspace was removed; the user's account/session remain.
Contact edits/removals invalidate revisions on all client boards to prevent stale
cross-board writes. No database migration is required. Board archival is next;
currency-aware totals remain a later checkpoint. Mobile/guest UI checks were not
repeated; integration tests enforce guest denial and cross-client isolation.

Stage 12f (board archival/restoration) is committed as `96c89bf`.
The additive `20261117020000_pipeline_archive` migration was applied locally with
zero schema drift. Production build including TypeScript, lint, 23 pipeline tests,
eight client-access tests, and seven HTTP authentication checks passed (38 total).
Desktop UI verification on November 17, 2026 covered explicit archive confirmation,
read-only controls, preserved ticket contents after reload, the archived listing,
and restoration of editing/drag controls. The disposable verification workspace
was removed; the owner's account/session were retained. Mobile/guest UI checks
were not repeated; server tests enforce guest denial and mutation blocking.
This completes the current project-board checkpoints. Stage 13 begins agency
subscription billing in Stripe test mode; currency-aware totals remain future work.

Stage 13a (owner-only billing plan preview) is committed as `1f9870f`. Production build including TypeScript, lint, seven billing validation tests,
eight database permission tests, and seven HTTP authentication checks passed (22
checks total). Signed-in desktop verification on November 17, 2026 confirmed the
Billing navigation, breadcrumb, and unconfigured-plan fallback. The disposable
verification agency was removed. Stripe configuration remains empty at the user's
request: a real provider price read and the configured-plan UI are not verified.
Unit fixtures cover valid pricing and invalid/live/inactive/unsupported plans.
No customer, subscription, payment, or migration is created by this checkpoint.
Checkout, subscription persistence, and webhook synchronization are next. See
[BILLING.md](BILLING.md) for setup and supported price types. Mobile and non-owner
UI checks were not repeated; server permission tests cover owner-only access and
tenant isolation.

Stage 13b (subscription persistence and verified webhooks) is committed as `c1f6420`. The additive `20261117030000_agency_subscriptions` migration is applied
locally with zero schema drift. Production build including TypeScript, lint, nine
subscription integration tests, seven plan tests, and eight HTTP authentication
checks passed (24 total). The first migration attempt exposed a collation mismatch;
only its two empty new tables were removed, then the corrected migration was applied.
Subscription tests use SDK-signed synthetic events and real local MySQL, with an
injected Stripe retrieval function. They cover signatures, replay/concurrency,
retry, current-state reconciliation, and owner/tenant isolation. Desktop inspection
on November 17, 2026 confirmed the stored past-due state, period end, scheduled
cancellation, collection pause, and sync timestamp using a disposable fixture, which
was removed afterward. Real Stripe delivery and mobile verification remain pending.
Stripe variables remain empty at the user's request. Checkout and portal access
are not implemented yet; checkout will build on this synchronization checkpoint.
See [BILLING.md](BILLING.md) for event configuration and operational limitations.

Stage 13c (owner-only hosted test Checkout) is committed as `d205274`.
The additive `20261117040000_agency_checkout` migration is applied locally with
zero schema drift. Production build including TypeScript, lint, eleven checkout
tests, nine subscription regressions, seven plan tests, and eight HTTP auth checks
passed (35 total). Checkout tests use real local MySQL and an injected provider;
they cover owner denial, persisted retry keys, lost responses, concurrent requests,
existing subscriptions, expiry/completion, canonical returns, and safe redirects.
Test fixtures are cleaned up automatically. The local preview is running the new
build on port 3115. Stripe settings remain empty at the user's request, so a real
hosted checkout, configured-button browser flow, payment, and webhook round-trip
remain unverified. No paid entitlement is inferred from a return URL. Uncertain
operations older than 23 hours stop for operator review; recovery tooling and
production hardening remain future work. Customer portal access is next.

Stage 13d (owner-only customer portal access) is committed as `12277c4`.
Production build including TypeScript, lint, eight portal tests, eleven checkout
tests, nine subscription tests, seven plan tests, and eight HTTP auth checks passed
(43 total). No migration is needed. Portal tests use real local MySQL with an
injected provider and remove their fixtures. They cover active ownership, stored
customer metadata, test-mode configuration, rejection of plan/quantity updates,
verified redirects, and failure recovery. The portal does not depend on a valid
plan price or an active subscription. Stripe configuration remains empty, so the
configured browser flow, actual hosted portal operations, and resulting webhook
delivery are unverified. Preview is running the new build on port 3115. Billing
reconciliation and recovery tooling are next; production billing remains gated on
real provider verification and operational hardening.

Stage 13e (owner-triggered subscription reconciliation) is committed as `8f76eed`. Production build including TypeScript, lint, 43 billing tests across five
suites, and eight HTTP authentication checks passed (51 total). The final HTTP
checks completed on November 18, 2026 after restarting the stopped preview.
No migration is needed. Reconciliation uses the webhook's subscription validation,
serializes with its agency lock, and atomically refreshes the complete bounded
history. Tests cover missed creation/cancellation events, incomplete histories,
invalid customer/tenant/price data, rollback, and concurrent refreshes using local
MySQL and an injected provider. Test fixtures were removed automatically. Stripe
settings remain empty at the user's request; real provider reads and the configured
browser refresh flow remain unverified. The preview runs on port 3115. Uncertain
checkout/customer creation-key recovery remains a separate upcoming checkpoint;
refresh does not clear recovery keys or alter customer mappings.

Stage 13f (operator checkout recovery) is committed as `48a0280`.
The additive `20261118010000_billing_recovery` migration is applied locally with
zero schema drift. Production build including TypeScript, lint, 51 billing tests
across six suites, and the recovery CLI help smoke check passed on November 18,
2026. Local MySQL was restarted before migration/testing. Eight recovery tests cover
read-only inspection and candidate preview, ownership, invalid candidates, stale
fingerprints, explicit repairs, key preservation, and audit receipts. Test fixtures
were removed automatically. No browser flow changed, so HTTP/UI checks were not
repeated for this operator-only checkpoint. The preview runs the new build on 3115.
Real Stripe candidate reads and repairs remain unverified because credentials stay
empty. Recovery attaches known verified objects; it does not reset uncertain writes
when no original object can be established. Stage 14 begins Stripe Connect setup;
provider end-to-end verification and production operational hardening remain open.

Stage 14a (owner-only Payments page and Connect status validation) is committed
as `975c2e8`. Production build including TypeScript, lint, eight Connect tests,
eight permission regressions, and eight HTTP authentication checks passed (24 total).
No migration is needed. Connect tests use local MySQL and injected provider results;
they cover empty configuration, ownership, account identity/type, sanitization,
provider failures, and mapping changes during retrieval. Fixtures were removed.
The new Payments route redirects signed-out visitors to sign-in. Signed-in visual
verification remains pending because the previously signed-in Zen Browser session
is no longer available. Stripe settings stay empty, so real provider reads remain
unverified. No OAuth flow or account-link write is implemented yet. Stage 14b adds
Standard-account OAuth authorization and callback handling. See [CONNECT.md](CONNECT.md)
for configuration and the exact scope of this checkpoint.

Stage 14b implements owner-only Standard-account OAuth authorization and callback
handling. The additive `20261118020000_connect_oauth` migration is applied locally
with zero schema drift. Attempts bind hashed state to the owner and configuration,
expire after ten minutes, and persist a one-use code claim before contacting Stripe.
Only validated Standard test accounts can be linked; tokens are discarded.
Production build including TypeScript, lint, 28 database/permission tests, and nine
HTTP authentication checks pass (37 total). The preview runs this build on port 3115.
Real Stripe authorization and signed-in visual verification remain pending because
Stripe configuration is empty and the previous browser session is unavailable.
Connect webhook reconciliation and revocation handling are the next checkpoint.
See [CONNECT.md](CONNECT.md) for retry behavior and configuration. Committed as `d2c7048`.

Stage 14c adds a dedicated signed Connect webhook endpoint, atomic delivery
receipts, sanitized current-account synchronization, and revocation handling.
Account-level locks also protect OAuth completion from revocations received while
an exchange is in flight. Older revocations preserve newer authorizations;
same-second ambiguity conservatively requires a fresh connection. The additive
`20261118030000_connect_webhooks` migration is applied locally with zero schema
drift. Production build including TypeScript, lint, 37 database/permission tests,
and nine HTTP authentication checks pass (46 total). The preview on port 3115
runs this build. Stripe settings remain empty, so actual
provider event delivery remains unverified. No new browser screen is introduced.
Product synchronization is the next checkpoint. Committed as `7d886e3`.

Stage 14d adds owner-controlled connected-account product and price imports with
bounded pagination, sanitized local snapshots, and a catalog review on Payments.
Failed or overlapping imports cannot partially replace the previous catalog;
revocation or reauthorization invalidates it. The additive
`20261118040000_connected_catalog` migration is applied locally with zero schema
drift. Production build including TypeScript, lint, ten catalog tests, 21 OAuth/
webhook regressions and nine HTTP authentication checks pass (40 total). The
preview runs this build on port 3115. Real Stripe imports and signed-in visual
verification remain pending while
Stripe is unconfigured and the prior browser session is unavailable. Checkout,
automatic product events and application fees are not activated. Next is fee
configuration before the funnel builder. Committed as `f111919`.

Stage 14e adds a server-controlled application fee policy and a read-only summary
on the owner Payments page. Blank configuration does not assume a fee; explicit
zero is supported. Integer arithmetic avoids monetary precision loss and floors
fees once per charge total. Production build including TypeScript, lint, seven fee
tests and nine HTTP authentication checks pass (16 total). The preview runs the
new build on port 3115. No migration or Stripe write is needed. Payment
creation and fee/refund integration remain for stage 17; provider integration and
signed-in visual verification are still pending. Stage 15 next adds tenant-scoped
funnels and pages with validated editor content. Committed as `ac39054`.

Stage 15a adds tenant-scoped funnel and draft-page management: create, rename,
page paths, confirmed draft deletion and empty-funnel deletion. Guests are
read-only; server mutations enforce tenant access and optimistic revisions.
New drafts use a bounded versioned container/text document schema. The additive
`20261118050000_funnel_management` migration is applied locally with zero schema
drift. Production build including TypeScript, lint, seven local MySQL/content tests
and nine HTTP authentication checks pass (16 total). The preview on port 3115
runs this build. Signed-in visual checks remain pending.
The next checkpoint adds draft editing/preview; drag-and-drop and publishing are
not implemented yet. See [FUNNELS.md](FUNNELS.md). Committed as `4b64126`.

Stage 15b adds an authenticated draft editor and live text/section preview, with
nested blocks, sibling reordering, explicit save and confirmed reload/removal.
Guests can preview only. Draft writes recheck access and revisions, preserve
published snapshots, and reject malformed content. Failed saves retain local edits.
Production build including TypeScript, lint, ten funnel/editor tests and nine HTTP
authentication checks pass (19 total). The preview on port 3115 runs this build.
No migration is needed. Signed-in visual/interactive
verification remains pending. Next is richer editor elements and style controls,
followed by drag-and-drop and history. Committed as `baeb206`.

Stage 15c adds headings, button destinations and bounded appearance controls to
the draft editor. Content and styles are validated again on save; existing drafts
remain compatible. Preview rendering escapes text and does not follow button
links. Production build including TypeScript, lint, thirteen editor/funnel tests
and nine HTTP authentication checks pass (22 total). The preview on port 3115
runs this build. No migration is needed. Signed-in visual
verification remains pending. Next is responsive preview and editor history,
followed by drag-and-drop and media elements. Committed as `e8ec79c`.

Stage 16a adds fixed desktop/tablet/phone preview widths and bounded editor
undo/redo. Saving preserves history and compares edits with the submitted saved
snapshot; branch edits invalidate redo while no-ops preserve it. Native text-input
undo remains available. Production build including TypeScript, lint, twenty
history/funnel tests and nine HTTP authentication checks pass (29 total). The
preview on port 3115 runs this build. No migration is needed.
Signed-in visual/keyboard checks remain pending. Next is nested drag-and-drop.
Committed as `a846945`.

Stage 16b adds nested drag-and-drop in the editor structure panel, with explicit
insertion slots and pointer/keyboard controls. Placement prevents cycles and root
moves, validates resulting content, and integrates with undo/redo. Production
build including TypeScript, lint, 24 editor/funnel tests and nine HTTP authentication
checks pass (33 total). The preview on port 3115 runs this build. No migration is
needed. Signed-in gesture/visual checks
remain pending. Next is media elements with workspace ownership validation.
Committed as `a886fc1`.

Stage 16c adds workspace-owned image blocks, alternative text, media selection
and resolved image previews. Draft saves reject foreign/deleted references under
workspace locks; reload handles deleted images with a placeholder. Production
build including TypeScript, lint, 34 editor/funnel/media tests and nine HTTP
authentication checks pass (43 total). The preview on port 3115 runs this build.
No migration is needed. Signed-in visual selection
checks remain pending. Next is public publishing with draft separation and media
retention safeguards. Committed as `adb0cd3`.

Stage 17a adds explicit publish/unpublish controls, unique workspace subdomains
and public HTML from validated published snapshots. Draft edits remain private;
revoked publication and archived workspaces stop serving. Published images cannot
be retired until unreferenced, with shared locks preventing publication/deletion
races. Production build, final TypeScript check, lint, 29 funnel/media tests
(including real tenant-host HTTP), nine auth checks and four tenant-routing checks
pass (42 total). The preview runs this build on port 3115. No migration is needed.
Signed-in publishing interaction and production
DNS/TLS remain pending. Next is server-verified funnel checkout preparation.
Committed as `fdf7a0d`.

Stage 17b adds an owner-only current price/fee check to supported catalog prices.
It verifies current connected-account status, expanded product/price identity,
test mode and fixed one-time pricing, calculates fees from server policy, and
rechecks ownership/connection after provider reads. No payment endpoint or Stripe
write is introduced. Production build including TypeScript, lint, 24 price/fee/
catalog tests and nine HTTP authentication checks pass (33 total). The preview
on port 3115 runs this build. Real provider and signed-in UI verification remain pending.
No migration is needed. Next is published offer configuration and durable checkout
attempts. Committed as `fdfdbed`.

Stage 17c adds owner-configured page offers with separate draft and published
snapshots, bound to the connected account's OAuth authorization generation.
Publishing offer changes requires the owner; editors can still unpublish. Selection
and publishing recheck ownership, tenant scope, revisions and connection state.
The additive `20261119010000_page_offers` migration is applied locally. No payment
attempt or Stripe session is created yet. Production build (including TypeScript),
lint, 28 offer/funnel tests and nine HTTP authentication checks pass (37 total).
The database schema matches the migration with no drift, and the preview on port
3115 runs this build. Signed-in UI/provider checks remain pending. Durable checkout
attempts are the next checkpoint. Committed as `e3c28ae`.

Stage 17d adds durable, owner-only checkout preparation for published offers.
It persists verified price/fee snapshots, a publication fingerprint, connection
generation, a 30-minute expiry and stable server-generated idempotency keys.
Repeated/concurrent requests converge; changed publications, permissions or
connections reject stale attempts. Nine new attempt tests and 14 existing
price/offer tests pass, using injected Stripe responses and local MySQL. Production
build (including TypeScript), lint and nine HTTP authentication checks also pass
(32 tests total). The preview on port 3115 runs this build.
The additive `20261119020000_funnel_checkout_attempts` migration is applied locally
with no schema drift. No public endpoint or Stripe session is created yet; provider
and payment UI checks remain pending. Next is Stripe session creation with retry
and reconciliation handling. Committed as `6dc62d5`.

Stage 17e adds internal owner-only connected-account Checkout Session creation.
Exact request JSON is committed before provider writes; retries reuse the stored
request/key or retrieve the saved session. Responses are validated against frozen
price/amount/metadata and safe redirect rules. Session completion does not grant
access. The additive `20261119030000_funnel_checkout_sessions` migration is applied
locally with no schema drift. Production build (including TypeScript), lint, ten
session tests, 16 attempt/price tests and nine HTTP authentication checks pass
(35 tests total). The preview on port 3115 runs this build. Live Stripe testing
remains pending. Next is recovery/expiration and verified Connect payment-event
reconciliation before public checkout. Committed as `01282a3`.

Stage 17f adds internal owner-only session inspection and cancellation. Recovery
finds lost creation responses without replaying creates, validates matched sessions,
handles cancellation/completion races and blocks unresolved attempts with a durable
review marker. Local expiry, unpublished content and removed account mappings do
not prevent recovery of historical sessions. Production build (including TypeScript),
lint, 20 session/recovery integration tests and nine HTTP authentication checks
pass (29 total). The preview on port 3115 runs this build. No migration is needed.
Live Stripe verification remains pending; verified payment events are next before
public checkout. Committed as `437e05d`.

Stage 17g extends the signed Connect webhook with Checkout payment events. It
retrieves current connected-account session/PaymentIntent state, validates frozen
amounts/fees and identities, atomically deduplicates receipts and persists confirmed
payment state without regressing on stale failure events. The additive
`20261119040000_funnel_payment_state` migration is applied locally with no schema
drift. Production build (including TypeScript), lint, 17 payment/Connect webhook
tests, 20 session/recovery tests and nine HTTP authentication checks pass (46 total).
The preview on port 3115 runs this build. Live Stripe verification remains pending.
Refund/dispute reconciliation and public checkout remain outstanding. Awaiting commit.

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
