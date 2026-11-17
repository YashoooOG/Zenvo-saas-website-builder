# Project boards — Stages 12a–12d

Open a client workspace → Project boards. Create a board to start with To do,
In progress, and Done. Owners, agency admins, and assigned client ADMIN/MEMBER
users can add or rename lanes, create tickets with descriptions, and move them.
Assigned GUEST users can read the board. Unassigned, deleted, and archived-client
access is denied on the server as well as in the interface.

Tickets support pointer dragging using their handles and keyboard dragging:
focus a handle, press Space, choose an insertion position with arrow keys, and
press Space to drop or Escape to cancel. Left/right changes lanes; up/down
chooses a position. Drop before a card or on the explicit lane-end target,
including empty lanes. The highlighted target shows the insertion position.

The board also retains a destination selector plus Move up/Move down buttons,
usable by keyboard and touch. A cross-lane move appends to the destination lane;
the ordering controls then place it where needed. Mobile boards stack their lanes;
wider boards use a bounded, focusable horizontal scroll area.

Edit opens a dialog for title and description. Remove asks for explicit
confirmation and permanently deletes the ticket, compacting its lane positions.
Cancelling either dialog leaves stored data unchanged. Guests have no mutation
controls and are denied these operations on the server.

Board settings lets editors rename a board. Manage lane provides Move earlier
and Move later buttons, which also work on the stacked mobile layout. Removing
an empty lane requires checking its explicit permanent-removal confirmation.
Move tickets out first; populated lanes and the board's last lane cannot be
removed. The server enforces these rules under the same lock and revision check
as ticket writes, including concurrent ticket creation or movement. Reordering
and removal compact lane positions without changing ticket details.

## Contacts and estimated values

The Workspace contacts section lists contacts for this client across its boards.
Editors can add a name and optional email. Emails are trimmed and normalized to
lowercase; duplicate non-empty emails within the workspace are rejected under
the agency write lock, even when submitted from different boards. Empty emails
are stored as null. Each workspace supports up to 500 contacts. Guests can read
contacts but cannot create them. Contact editing/removal comes in a later checkpoint.

After creating a ticket, open Edit to choose a contact and set its estimated
value. Choose No contact to unlink it. The server verifies the contact belongs
to the ticket's client. It rejects foreign IDs without changing any ticket fields.
Values accept plain non-negative decimals, up to 15 whole digits and 4 decimal
places. Exponents, grouping separators, negatives, and excess precision are
rejected. Values remain strings between browser and server, become Prisma
Decimal only when stored, and serialize back to fixed four-place strings.
Moving a ticket preserves both its contact and value. Stale edits are rejected.
Currency is not configured yet; these estimates are not payment amounts or
recognized revenue. Existing tickets start at zero with no contact.

Board archival/removal controls and currency-aware totals
are later Stage 12 checkpoints. No dummy
controls or fabricated project metrics are presented for those features.

## Saved ordering and concurrency

The additive pipeline migration adds a revision and a client-scoped creation key.
Board creation is idempotent and atomically creates its three initial lanes.
Mutations validate input, acquire the established user/agency locks, then re-check
client access and board ownership. Every lane/ticket identifier is scoped to both
the requested client and pipeline.

Every successful board change increments its revision. A stale request fails
without partial changes. Reload the board before retrying that request. A move
reads ticket order by position and ID, removes/inserts the selected ticket, and
rewrites contiguous positions within one transaction. Cross-lane moves compact
both source and destination. A boundary move that changes nothing preserves the
revision. Concurrent requests at the same revision cannot both mutate the board.

Drag placement submits the destination lane and optional next-ticket anchor.
The server checks that anchor belongs to the destination, then inserts before it
or appends when absent. Drag start and dialog opening capture the board revision,
so stale gestures and edits cannot overwrite intervening changes. The board waits
for the server response instead of optimistically changing order. A failed request
offers reload; an edit error retains the draft in its dialog.

The UI uses dnd-kit pointer and keyboard sensors with logical insertion targets;
see the [keyboard sensor documentation](https://dndkit.com/legacy/api-documentation/sensors/keyboard/).

Names and titles require 2–191 trimmed characters; descriptions allow up to 5,000.
Workspaces support 20 boards; each board supports 20 lanes and 200 tickets in this
checkpoint. These limits bound the size of transactional ordering updates.

## Verification

`bun run test:pipelines` covers idempotent creation, initial lane order, access
boundaries, persisted ticket order, moves and no-op boundaries, invalid targets,
concurrent writes, lane updates/limits, and archived/deleted/revoked access.
Run client-access and HTTP authentication regressions alongside build and lint.

Verified November 17, 2026: additive migration, zero schema drift, production
build including TypeScript, lint, seven pipeline tests, eight client-access
tests, and seven HTTP authentication checks passed (22 total). Browser checks
covered board/ticket creation, ticket reordering and cross-lane moves, lane rename
and addition, reload persistence, a 320px layout without horizontal overflow,
guest read-only controls, and sign-out. No browser console errors were recorded.
Disposable local records, synthetic owner, and Clerk identity were removed.

Stage 12b verification on November 17, 2026: production build including
TypeScript, lint, 11 pipeline tests, eight client-access tests, and seven HTTP
authentication checks passed (26 total). New server checks cover explicit
placement, invalid anchors, stale edits, confirmed deletion, position compaction,
and concurrent placement/edit requests. Browser checks passed for pointer and
keyboard dragging, same-lane reordering, empty-lane drops, Escape cancellation,
editing and reload persistence, removal cancel/confirm, mobile editing at 320px,
guest controls, and sign-out. No browser console errors were recorded. Disposable
local and Clerk fixtures were removed. This checkpoint requires no migration.

Stage 12c verification on November 17, 2026: 14 pipeline tests, eight client-access
tests, seven HTTP authentication checks (29 total), production build, TypeScript,
and lint passed. Added coverage includes board rename validation, guest and
cross-client denial, stale requests, lane order compaction, boundary no-ops,
confirmed removal, populated/last-lane protection, and removal racing ticket
creation. Browser checks covered renamed headings, persisted ordering, required
confirmation, empty-lane removal, preserved tickets, 320px controls, and sign-out.
No browser console errors were recorded; disposable fixtures were removed.

Stage 12d automated verification on November 17, 2026: production build including
TypeScript and lint passed, along with 18 pipeline tests, eight
client-access tests, and seven HTTP authentication checks passed (33 total).
New checks cover optional/normalized emails, duplicate races across boards,
workspace limits, contact isolation, guest denial, exact decimal round-trips,
invalid amounts, atomic rejection, unlinking, and preservation after movement or
partial edits. After the owner signed in, desktop UI verification passed for
contact creation, contact selection, exact value entry, scrolling the edit dialog,
saving, and persistence of both contact and value after reload. The isolated
verification workspace was removed while retaining the owner's account and
session. Mobile and guest UI checks were not repeated at this checkpoint.
