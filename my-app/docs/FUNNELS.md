# Funnels and draft pages

Stage 15a introduces `/subaccount/[subaccountId]/funnels` and its funnel detail
route. The client workspace overview links to Funnels. Agency owners/admins and
assigned sub-account admins/members can create and rename funnels, create/edit
page names and paths, remove draft pages, and delete empty funnels. Guests can
read; outsiders and deleted users cannot access or mutate records. Server services
recheck tenant permissions under the existing user/agency/sub-account locks.

Funnel creation uses a scoped UUID creation key to make duplicate submissions
idempotent. Every subsequent mutation requires the current funnel revision; a
successful change increments it, so stale or concurrent forms cannot overwrite
newer work. Page IDs are checked against both workspace and funnel IDs.

Paths are normalized to lowercase, begin with `/`, and contain only letters,
numbers, hyphens and slash-separated segments. Root `/` is valid; queries,
fragments, traversal, empty segments, trailing slashes and reserved application
routes are rejected. Paths are unique across all funnels in one workspace, as
required by the existing database constraint. Different workspaces can reuse paths.

New pages receive a validated version-1 empty document. The initial document type supports containers and plain text; stage 15c adds
headings, buttons and optional validated appearance properties. Validation rejects unknown executable
fields/node types, duplicate IDs, cycles, more than 500 nodes, excessive nesting
and more than 100,000 JSON characters. Pre-validation also limits traversal to
4,000 values and depth 20 before recursive schema parsing. There is no HTML/script execution, public route or publish action. Stage 15b adds
the authenticated draft editor described below.

Deletion requires explicit confirmation. A funnel must be empty before deletion.
Pages with a publication timestamp or published content cannot be edited or
removed by these draft-management operations. Existing draft content is preserved
when page metadata changes. Deleting a draft is permanent.

Apply `bun run db:migrate`, then run `bun run test:funnels`. Tests use local MySQL
and remove their fixtures. They cover duplicate creation, tenant/role boundaries,
page persistence, path conflicts, stale revisions, deletion guards, deleted users
and content validation. The HTTP auth suite includes both new funnel routes.
Signed-in visual verification remains pending; automated checks do not establish
that the complete builder or publishing flow is ready.

## Draft editor and preview (15b)

Each page now links to `/subaccount/[subaccountId]/funnels/[funnelId]/pages/[pageId]`.
Editors can add nested sections/text blocks, edit plain text, move siblings up/down,
and remove blocks with confirmation. Guests receive a read-only draft preview.
Preview uses React text rendering, never raw HTML or script execution.

The explicit Save draft action validates content on the server, checks the page
against workspace/funnel scope, rechecks write permissions under locks, and uses
the funnel revision to reject stale saves. Saving changes draftContent only;
publishedContent and publishedAt remain untouched, including for published pages.
Metadata or sibling-page changes also invalidate older editor revisions.

The editor retains local changes when a save fails or conflicts. Inputs are
disabled during save, and success advances the local revision. Reload saved draft
requires confirmation when dirty. A beforeunload handler warns on full-page exit
where supported by the browser; it is not a guarantee against every in-app route
change, tab crash or browser shutdown. There is no local/offline recovery storage.
Copy important text before reloading after a conflict. The back-to-funnel link uses
full-page navigation so the browser can issue its unsaved-change warning.

Ten tests now cover management plus save/reload, read-only guest access, foreign
page scopes, unchanged published snapshots, invalid documents, overlapping saves,
immutable editor operations and nested block ordering/removal. No schema migration
is needed. Responsive canvas, drag-and-drop, undo/redo and publishing remain future
checkpoints. Stage 15c adds the style controls below. Signed-in interactive verification is pending.

## Headings, buttons and appearance (15c)

The editor can add semantic H1/H2/H3 headings and button blocks. Text fields stay
plain text and are escaped by React. Buttons store a destination restricted to
HTTPS URLs without credentials, root-relative paths, or simple anchors. Other
schemes, protocol-relative URLs, backslashes, whitespace and control characters
are rejected. Destinations require the explicit Apply destination control before
saving. Preview buttons never navigate; public link rendering is a later stage.

Appearance controls apply optional six-digit hex text/background colors, integer
padding (0–120px), text size (12–96px), left/center/right alignment and corner radius
(0–64px). Reset appearance clears the overrides. Arbitrary CSS, stylesheets,
HTML, event handlers and background-image URLs are not accepted. Existing
version-1 text/container drafts remain valid without migration. These are shared
base styles; per-device overrides are not implemented yet.

Thirteen tests now include saving/reloading new elements and appearance, safe URL
validation, rejected CSS fields, semantic heading rendering, escaped markup and
non-navigating preview buttons. Signed-in visual and interactive testing remains
pending. Image/video elements and media ownership checks remain future work.
