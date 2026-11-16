# Agency permissions and team management (Stage 9a)

Stage 9b adds [owner-created invitation links and verified-email acceptance](INVITATIONS.md).
The remainder documents the Stage 9a permission checkpoint.

This checkpoint establishes agency permissions and management of existing
memberships. Invitations and acceptance follow in Stage 9b. Sub-account screens
and assignment management remain Stage 11; a CLIENT agency membership alone
does not grant access to the agency or automatically assign any sub-account.

| Action | Owner | Admin | Member | Client / outsider |
| --- | --- | --- | --- | --- |
| List agency and read overview | Yes | Yes | Yes | No |
| Read/edit business settings and logo | Yes | Yes | No | No |
| Read team names/emails | Yes | No | No | No |
| Change roles or remove members | Yes | No | No | No |

Ownership comes from `Agency.ownerId`, never an editable membership role. The
owner cannot be demoted or removed. Role changes preserve explicit sub-account
assignments. Removing agency membership cascades its sub-account assignments,
without deleting the person's account or other agencies' memberships.

## Routes and server boundaries

`/agency/[agencyId]` is the read-only overview. Settings and team routes enforce
their specific permission before rendering. The list and switcher use only
authorized agency IDs, names, logos, and roles. Sidebar visibility is a convenience;
every Server Action and logo mutation independently checks server-side access.
Unknown or unauthorized agencies share the unavailable response.

`agency-access.ts` centralizes permissions. Transactions lock affected users in
sorted ID order, then lock the agency, then recheck permission. Settings, logo
reservation/attachment/removal, and team changes use that boundary. It serializes
role revocation with mutations and prevents a demoted admin from attaching an
upload that started before the demotion. Deleted users and agencies whose owner
is deleted cannot be accessed. Existing owner-only helpers are retained for
owner-specific code and historical tests; general navigation uses
`listAccessibleAgencies`.

Membership versions are random UUIDs refreshed on each role change. Team actions
validate both the tenant-scoped target and expected version. Stale pages and
concurrent requests cannot silently overwrite a newer change. Removing and later
recreating a membership also produces a new version. The additive migration
`202611150004_membership_versions` backfills existing memberships before making
the version required. Run `bun run db:migrate` before deploying the new code.

Revocation is checked on each server operation. Already rendered information in
another browser tab cannot be recalled; refresh/navigation updates that tab's
interface. Mutations remain denied even if its old controls are still visible.

## Verification

`bun run test:permissions` covers the role matrix, cross-tenant denial, admin
settings, owner protection, stale/concurrent changes, removal cascades, deleted
users, and demotion during uploads. Run the agency, logo, persistence, and HTTP
authentication suites as regressions. The production build includes TypeScript;
run lint separately. Fixtures use unique IDs and are removed after tests.

Verification completed November 16, 2026: 42 automated checks passed across those
suites, with a successful production build, lint, and zero schema drift. Browser
tests covered owner role saves and reloads, cancel/removal confirmation, member
direct-route denials, an admin settings save and team-route denial, desktop and
320px layouts, and sign-out. The browser test caught a missing removal form value;
the corrected form was rebuilt and its successful removal verified. All
disposable browser-test records and the Clerk identity were cleaned up.

The existing tutorial chapters are implemented incrementally: this stage does
not send invitations or configure email delivery. No owner transfer or platform
administrator role is exposed by these controls.
