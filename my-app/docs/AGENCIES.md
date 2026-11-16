# Agency onboarding and settings (Stage 7a)

Historical checkpoint notes below. Stage 9a expands settings access to admins;
see the current [permission matrix](PERMISSIONS.md).

Stage 7 has two commit checkpoints: agency creation/settings here, then authorized
logo uploads in Stage 7b. Team navigation and broader role permissions come later.

## Routes

- `/agency` lists agencies owned by the authenticated user.
- `/agency/new` creates an agency and its ADMIN membership atomically.
- `/agency/[agencyId]/settings` displays and updates that owner's agency.

Non-owners receive the same unavailable page as a missing agency. Even an ADMIN
membership alone cannot edit settings in this checkpoint; Stage 9 introduces the
full role policy. The name is required; business contact/address fields are
optional. Creating an agency does not start a subscription.

## Server boundaries

Every Server Action authenticates independently and validates inputs with Zod.
The owner comes from the server session, never form data. Transactions lock and
check the active user before writing. Deleted profiles cannot create or edit.

An owner-scoped creation UUID makes repeat submissions return the original
agency. A revision counter rejects stale settings updates instead of silently
overwriting another tab's changes. Website fields accept HTTP(S) only and never
trigger a server-side fetch. Validation errors retain entered values.

`requireWorkspaceUser()` calls `connection()` before Prisma access, placing work
behind a request-time boundary for Next.js Cache Components. React's request
cache avoids duplicate profile work within a render without globally caching
authenticated user data.

When the local profile is missing, the server fetches exactly the authenticated
Clerk user ID and synchronizes it with the same locking/version rules used by
webhooks. Deletion during that fetch remains terminal. Existing local profiles
do not trigger another provider fetch. Ongoing updates still require the live
webhook configuration in [Prisma and sync](PRISMA-AND-SYNC.md).

## Forms and navigation

The Client Component uses `useActionState`, controlled native inputs, pending
states, inline errors, and save feedback. `useId()` keeps labels unique when Next
retains hidden routes. Settings forms are keyed by agency ID to keep input state
separate across agencies. Loading, unavailable, and retry states are included.

## Migration and verification

```powershell
bun run db:migrate
bun run typecheck
bun run lint
bun run test:agencies
bun run test:persistence
bun run build
```

The additive `202611150002_agency_details` migration preserves existing records.
Eight database tests cover creation, atomic membership, concurrent duplicate
submissions, non-owner denial, malformed/forged input, stale revisions, inactive
users, and profile synchronization races. Fixtures are removed afterward.

Browser checks on November 15, 2026 covered a disposable Clerk sign-in, profile
bootstrap without webhook delivery, whitespace-name rejection, two agency
creations, settings edits, reload persistence, stale-tab conflicts, agency
switching, sign-out, and rejection after sign-out. Desktop light/dark and mobile
layouts were inspected; 390px and 320px checks found no horizontal overflow.

For future disposable browser tests, create the identity with
`node scripts/auth-test-user.mjs create`. After signing out, run
`bun scripts/cleanup-workspace-fixture.ts` before
`node scripts/auth-test-user.mjs cleanup`. Local cleanup verifies the remote
fixture marker/email and removes only its owned agencies, memberships, profile,
and matching bootstrap receipt. Never use it for real users.

References: [Next.js forms](https://nextjs.org/docs/app/guides/forms),
[Clerk user reads](https://clerk.com/docs/nextjs/guides/users/reading).
