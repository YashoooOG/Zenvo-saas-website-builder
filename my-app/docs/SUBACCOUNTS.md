# Client workspaces — Stage 11a

Agency owners and admins can create a client from Agency → Clients, enter its
workspace, rename it, and archive or restore it. `/subaccount` lists the active
workspaces available to the signed-in user across agencies. The new client shell
is intentionally small; media, pipelines, and funnels will arrive with their
own working routes.

## Access rules

| User | Read active workspace | Create, rename, archive, restore |
| --- | --- | --- |
| Agency owner or ADMIN | All clients in that agency | Yes |
| Agency MEMBER or CLIENT | Explicit assignments only | No |
| Unassigned or deleted user | No | No |

An explicit assignment retains its ADMIN/MEMBER/GUEST sub-account role. It does
not grant agency management rights. Even a sub-account ADMIN cannot rename or
archive the workspace in this checkpoint. Agency administrators inherit client
ADMIN access without creating extra assignment records. Removing an agency
membership cascades its client assignments. A deleted agency owner makes its
client workspaces unavailable.

Assignment management screens and client invitations are Stage 11b. Existing
assignment records are enforced now, with fixtures covering all permission
boundaries. Do not provision production assignments by editing the database.
UploadThing media will follow separately. Client creation does not publish a
site, allocate a subdomain, enable payments, or fabricate dashboard metrics.

## Persistence and concurrency

The additive `20261116010000_subaccount_lifecycle` migration adds a revision and
an agency-scoped creation key. The key makes double submissions idempotent.
Mutations lock the active actor/owner and agency using the existing lock order,
then re-check permissions. Renaming and status changes compare revisions so
stale tabs cannot overwrite newer edits. User input is validated by Zod; IDs
and hidden form values are never treated as authorization.

Archive sets `enabled = false`. It blocks workspace entry for everyone and
removes the workspace from ordinary client listings. Agency managers can still
see it in Agency → Clients and restore it. No content or assignments are deleted.
Public hosting remains unimplemented; its resolver must check enabled status
when publication ships.

## Verification

`bun run test:subaccounts` exercises concurrent creation, invalid input,
cross-tenant denial, assignment isolation, inherited access, stale updates,
archive/restore, membership removal, and user deletion against real MySQL.
Run permission and HTTP authentication regressions, the production build, and
lint alongside it. No new provider credentials are needed.

Verified November 16, 2026: migration, zero schema drift, production build,
TypeScript, lint, and all 19 automated checks passed. Browser checks covered
creation, rename, archive, archived entry returning not found, restore, refresh
persistence, restored entry, a 320px client list with no horizontal overflow,
and sign-out. No browser console errors were recorded. Disposable local records
and the Clerk development identity were removed.
