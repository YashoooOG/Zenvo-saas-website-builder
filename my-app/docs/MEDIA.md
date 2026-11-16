# Client image library — Stage 11c

Open a client workspace and choose **Open media library**. The library shows the
client's images, supports filename search, opens full images, copies public
links, and confirms removals. This checkpoint supports still PNG/JPEG/WebP input;
video, documents, folders, and replacement of referenced assets are not included.

## Access and public assets

Agency owners/admins and assigned client ADMIN/MEMBER users can upload and remove
images. Assigned GUEST users can view and copy links. Unassigned, deleted, and
archived-client access is denied. The server checks authorization before reading
uploads and again under the agency/user locks before attaching or retiring files.
Removal of an assignment, demotion, or archival during upload prevents attachment.

The library metadata is tenant-scoped, but UploadThing image URLs are public.
These are website assets, not confidential document storage. The interface says
so before upload. Removing an asset may break pages using its URL; CDN deletion
is not an immediate recall of copies already downloaded elsewhere.

## Validation and limits

- One image per request; PNG, JPEG, and WebP only, up to 8 MB and 4096 × 4096 pixels.
- Multipart bodies are bounded while streaming, including without Content-Length.
- Sharp decodes and re-encodes images, strips metadata, rejects animated or invalid
  content, and fits the result within 2560 × 2560 pixels as quality-85 WebP.
- Names are normalized and bounded; original upload bytes are never served.
- Up to 20 upload attempts per actor/hour, three concurrent pending uploads per
  client, and 500 images per client. Reservations count toward the client limit.
- Mutations require a same-origin request and a real authenticated session.

## Storage lifecycle

`MediaAsset` tracks PENDING → ACTIVE → RETIRED → DELETED. Its server-generated ID
is the UploadThing custom ID and the associated `Media.id`. A successful upload
attaches its Media row only after a conditional state transition inside the
authorized transaction. File keys and URLs come from the server-side provider,
not from browser fields. Cleanup only passes tracked custom IDs to UploadThing.

Removal hides the Media row and retires the asset atomically. Provider deletion
is attempted afterward; failures keep RETIRED records for retry. Failed uploads
also retire their record. Pending records expire after one hour. Deleted client
workspaces leave nullable asset references so orphan files remain traceable.

Run `bun run media:cleanup` periodically and after provider outages. It expires
stale pending uploads, retires orphaned active assets, and attempts up to 20
retired deletions per run. Repeat until the queue is empty; inspect deferred-error
logs. A production scheduler and monitoring still need deployment configuration.
No additional provider secret is needed beyond `UPLOADTHING_TOKEN`.

Existing Media rows without a tracking record remain readable but cannot be
removed through this lifecycle. Imported/legacy rows require a deliberate storage
reconciliation; the application never trusts arbitrary file keys for deletion.

## Verification

`bun run test:media` covers decoding and bounds, multipart/origin checks, permissions,
cross-client denial, cleanup failure/retry, permission loss during upload, expired
reservations, rate limits, archival/deletion, and orphan cleanup against MySQL.
Provider adapters in those tests are fakes scoped to disposable records. Browser
verification separately exercises a real UploadThing image and its removal.

Verified November 16, 2026: additive migration, zero schema drift, production
build including TypeScript, lint, eight media tests, eight client-access tests,
five sub-account tests, and seven HTTP authentication checks passed (28 total).
Browser checks covered a real UploadThing upload, decoded 1200 × 800 rendering,
reload persistence, case-insensitive search/no results, link copying, guest
read-only controls, a corrected 320px upload layout, removal cancel/confirmation,
empty library, and sign-out. No browser console errors were recorded. The
provider file list confirmed the test image was absent after deletion. Local
fixtures, synthetic user, and Clerk development identity were removed.
