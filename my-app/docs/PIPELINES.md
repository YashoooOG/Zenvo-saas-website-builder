# Project boards — Stage 12a

Open a client workspace → Project boards. Create a board to start with To do,
In progress, and Done. Owners, agency admins, and assigned client ADMIN/MEMBER
users can add or rename lanes, create tickets with descriptions, and move them.
Assigned GUEST users can read the board. Unassigned, deleted, and archived-client
access is denied on the server as well as in the interface.

This first checkpoint uses a destination selector plus Move up/Move down buttons,
usable by keyboard and touch. A cross-lane move appends to the destination lane;
the ordering controls then place it where needed. Mobile boards stack their lanes;
wider boards use a bounded, focusable horizontal scroll area.

Drag-and-drop, ticket editing/removal, lane removal/reordering, board lifecycle
controls, contacts, and monetary values are later Stage 12 checkpoints. No dummy
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
