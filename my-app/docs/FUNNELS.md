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
is needed. Drag-and-drop and publishing remain future checkpoints. Stages 15c/16a add
style controls, canvas widths and history below. Signed-in interactive verification is pending.

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

## Responsive preview and history (16a)

Preview widths are Desktop 1024px, Tablet 768px and Phone 375px. The canvas keeps
its selected width and scrolls horizontally in narrow panels; it does not silently
shrink to fit. This previews content reflow with shared base styles. It is not an
iframe, browser/device emulator or media-query engine, and per-device style
overrides are not implemented. Changing preview width does not modify the draft
or add history entries. Guests can also choose preview widths.

Undo/redo keeps up to 50 document changes in memory. Edits after undo discard the
redo branch; no-op changes do not. Removing a section is reversible with its full
nested content and styles. Each validated text/style change counts as one step;
keystrokes are not grouped. Reload clears history. Saving preserves history and
marks only the submitted snapshot as saved, so undo away from it becomes dirty
and redo back to it becomes clean. Failed/conflicting saves keep local history.

Toolbar buttons work with keyboard focus. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y
operate on document history when focus is inside the editor but outside text
inputs, textareas, selects or contenteditable fields; those retain native editing
behavior. History controls are disabled during saves and absent for guests.
Applied button destinations update correctly after undo/redo. Unapplied destination
input is not part of document history and must be applied before saving.

Run `bun run test:editor-history` for exact restoration, save baselines, branch
behavior, no-ops, history bounds, nested removal and preview markup checks.
Interactive keyboard and viewport verification remains pending in a signed-in
browser; server-rendered markup tests do not replace those checks.

## Nested drag-and-drop (16b)

The Arrange blocks structure panel uses the installed dnd-kit core sensors. Drag
handles move existing blocks to explicit insertion lines before a sibling or at
the end of a section/page. Empty sections accept blocks. The page root cannot be
moved, and destinations inside the active section are disabled. Moving blocks
updates the live preview; it does not save until Save draft is used.

A keyboard-focused handle uses Space/Enter to pick up/drop, arrow keys to advance
through enabled insertion lines in document order, and Escape to cancel. Pointer
activation requires an 8px movement to avoid accidental drags. Existing up/down
controls remain available. Guests do not receive arrangement controls and saving
disables dragging. This checkpoint rearranges blocks in the structure panel;
canvas dragging and dragging new palette elements are not implemented yet.

The immutable placement operation independently rejects root/self/descendant
moves, non-container destinations, missing objects and insertion targets outside
the destination. It removes the source before computing the destination index,
so forward and backward moves behave consistently. Whole-document validation
runs afterward to enforce existing depth/size/child limits. A successful move adds
one undo step; no-op positions and canceled drags add none. Save still enforces
tenant access and validates the final document on the server.

Tests cover cross-section moves, empty sections, root insertion, same-parent
ordering, invalid targets, unchanged input after rejection, and exact undo/redo of
nested sections. Pointer/touch/keyboard interaction in a signed-in browser remains
unverified; these tests exercise operations rather than simulate real drag gestures.

Reference: [dnd-kit core keyboard sensor](https://dndkit.com/legacy/api-documentation/sensors/keyboard/).

## Workspace image elements (16c)

Add image inserts a reference to an image from this client workspace. Its control
selects the library file and accepts up to 500 characters of alternative text;
empty alternative text is appropriate for decorative images. Images support the
existing appearance, reordering, nested movement and history operations. Upload
images in the existing media library, save current changes, then reload the editor
to refresh the available files. Video and arbitrary external embeds are not added.

Documents store mediaId and alt only, never an image URL. The authenticated draft
loader resolves at most 500 workspace-owned WebP records (the library already
limits uploads to 500). It excludes non-HTTPS or credential-bearing URLs and
rechecks access before returning. Preview receives only that workspace's resolved
files, uses responsive intrinsic image dimensions and sends no referrer.

Saving validates all referenced media IDs belong to the current workspace and
have the supported image MIME type. The check and commit hold the same workspace
write lock used by media retirement. Foreign, deleted or unsupported references
fail without changing the draft. Deletion after saving is permitted in this draft
stage: reload shows an unavailable-image placeholder, and the next save requires
replacement or removal. An already-open tab can retain its loaded URL until
refresh; uploads are public assets, so this is not private-file access control.
Published-asset retention must be addressed before public page publishing.

Tests cover owned-image save/reload, foreign-reference rejection, missing-image
rendering and save rejection, removal recovery, discarded raw URL fields and alt
limits. Existing media upload/retirement and history regressions also pass.
No migration is required. Signed-in file selection and visual checks remain pending.
