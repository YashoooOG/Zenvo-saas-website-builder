# Client assignments and invitations — Stage 11b

From Agency → Clients → Manage → Manage client access, an agency owner can
assign existing people to a workspace, change their client role, remove an
assignment, and issue or revoke invitations. Admins retain workspace lifecycle
management but cannot read this people directory or change access. Client admins
cannot grant access to others. These boundaries are enforced on the server.

## Role boundaries

Agency owners and ADMIN members inherit client admin access. Existing MEMBER
and CLIENT memberships need an explicit assignment. Removing an assignment
only removes access to that client; it does not delete their agency membership
or other assignments. Removing agency membership cascades its assignments.

Sub-account roles are ADMIN, MEMBER, and GUEST. All can read the current client
workspace. Stage 11c lets ADMIN and MEMBER users upload/remove client images,
while GUEST users can view and copy their links. Stage 12a also allows ADMIN and
MEMBER users to create project boards, manage lanes, and create/move tickets;
GUEST users can read boards. Website capabilities will accompany those tools.
Client roles never grant agency management or
permission to assign other users.

Assignment changes validate both the agency membership version and assignment
version under the existing user/agency lock order. Stale requests, including
requests from before removal and re-creation, are rejected. Owners and inherited
admins cannot be assigned or removed through client controls. Archived clients
allow removal and revocation, but not grants, invitation creation, or acceptance.

## Invitation lifecycle

- Owner-generated links are bound to one email address and one client workspace.
- Tokens are 32 random bytes; only their SHA-256 hashes are stored.
- Links expire after seven days. A replacement revokes prior pending links for
  the same workspace/address, without affecting invitations to other clients.
- Up to 20 client invitations can be issued per agency per hour.
- No email is sent automatically. The owner copies and shares the link.
- Preview and acceptance require a fresh server-side Clerk lookup of the verified
  primary email. A form cannot supply its own identity or verification status.
- Acceptance atomically creates a CLIENT agency membership if needed and the
  requested assignment. Existing agency and assignment roles remain unchanged.
- Concurrent retries create one grant. A consumed link cannot restore a removed
  assignment. Revoked/expired links, deleted users/owners, and archived clients
  are unavailable. Consumed links show an unavailable preview.

The acceptance route uses no-referrer metadata and is excluded from indexing.
The raw link is shown only when generated; it is not recoverable from the pending
invitation list. Revoke it and create another if the owner loses the link.

## Migration and verification

`20261116020000_client_access` adds assignment versions (backfilling existing
records) and a tenant-constrained invitation table. Its composite foreign key
uses the existing `utf8mb4_bin` collation. During local verification the initial
table statement had a collation mismatch; it was corrected and completed forward
without resetting data, then Prisma recorded the recovered migration. The final
schema comparison reports no drift.

`bun run test:client-access` covers owner-only authorization, role isolation,
concurrent/stale assignment writes, membership recreation, invitation expiry,
replacement/revocation, verified-email checks, concurrent acceptance, preserved
roles, replay rejection, archived clients, and deleted users/owners. Run the
sub-account, invitation, permission, and HTTP authentication suites as regressions.

Verified November 16, 2026: production build including TypeScript, lint, zero
schema drift, eight client-access tests, five sub-account tests, seven agency
invitation tests, eight permission tests, and six HTTP authentication checks
passed (34 total). Browser checks covered assignment persistence, confirmed
removal, link creation/copy/revoke, wrong-email rejection, verified recipient
acceptance, guest entry after reload, agency denial, consumed-link rejection,
320px layout without horizontal overflow, and sign-out. No browser console
errors were recorded. Synthetic users/workspaces and the disposable Clerk
identity were removed.
