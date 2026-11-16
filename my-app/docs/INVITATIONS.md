# Agency invitations (Stage 9b)

Owners create invitations on the agency team page, choosing an email address and
Member or Admin role. The app returns a copyable link for the owner to share.
No email is sent automatically, and no email provider is required. Client
invitations will accompany explicit sub-account assignment in Stage 11.

The link is displayed only after creation. Reloading does not recover its secret;
create a replacement to obtain a new link. Creating another invitation for the
same normalized email and agency revokes all older pending links. Owners can
also revoke individual pending invitations. Links expire after seven days, with
a limit of 20 invitations per agency per hour, including replacements.

## Acceptance and security

`/agency/invitations/[token]` requires sign-in. A fresh Clerk API read supplies the
current verified primary email for both the preview and acceptance action. The
invited address must match that email, ignoring letter case. Local profile email
and browser-provided email or role values cannot authorize acceptance. Invalid,
expired, revoked, mismatched, and unverified invitations show a generic message
without revealing the agency or invitee details. Merely visiting the link does
not grant access; the user submits Accept invitation.

Tokens contain 32 cryptographically random bytes and only their SHA-256 hashes
are stored. Invitation metadata disables indexing and sends no referrer. Treat
links as credentials, share them only with the intended recipient, and avoid
logging invitation paths in deployment access logs. Tokens never appear in
application error logs. There are no public upload or mail callbacks in this flow.

Acceptance locks the active invitee, agency owner, and agency using the same
ordering as other agency mutations, then rechecks the invitation. A transaction
creates the membership and consumes the invitation together. Concurrent retries
create one membership. An invitation never changes an existing membership's
role, and a consumed invitation cannot restore membership after removal.
Revocation and acceptance serialize on the agency lock. Deleted accounts and
agencies with deleted owners cannot accept or issue invitations.

## Database and verification

Apply `bun run db:migrate` before running this code. The additive
`202611160005_agency_invitations` migration creates a tenant-linked table with
token hashes, lifecycle dates, and acceptance provenance. Expired, consumed,
and revoked records remain for rate-limit and audit purposes; routine queries
only display unexpired pending invitations. A retention policy remains a release
operations task.

Run `bun run test:invitations`, `bun run test:permissions`, `bun run lint`, and
`bun run build`. The invitation suite uses disposable database records and covers
owner-only issuance/revocation, hashed storage, identity mismatch, expiry,
replacement, concurrent acceptance, non-escalation, consumed-link replay,
deleted accounts, role validation, and rate limiting.

Verification completed November 16, 2026: 39 automated checks passed across
invitation, permission, agency, logo, and authentication suites, plus build,
TypeScript, lint, migration deployment, and zero schema drift. A real Clerk
development account exercised owner creation/copy/revocation, wrong-email denial,
verified-primary-email acceptance, persistent Member access, consumed-link
rejection, and sign-out. The 320px layout had no horizontal overflow; no browser
console errors were recorded. Disposable records and the identity were removed.
