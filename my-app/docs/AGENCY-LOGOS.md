# Agency logos (Stage 7b)

Agency owners can upload, replace, and remove a logo in agency settings. Logos
also appear in the agency list. The current owner-only policy matches Stage 7a;
broader team permissions arrive in Stage 9.

## Setup

Copy the current token from your UploadThing app's API Keys page into the ignored
`my-app/.env.local` file as `UPLOADTHING_TOKEN`. Separate legacy secret and app-ID
variables are not used by SDK v7. Restart the server after changing configuration.
Use a development storage app with public file access for these intentionally
public logos; do not upload private documents. No public callback tunnel is needed.

Apply `bun run db:migrate` before starting the new code. The additive
`202611150003_agency_logos` migration tracks logo versions and storage assets.

## Request and storage lifecycle

1. `POST /api/agency/[agencyId]/logo` authenticates the Clerk session and checks
   same-origin requests and active agency ownership before reading the upload.
2. A bounded multipart reader accepts one image and one expected logo version.
   Files must be still PNG, JPEG, or WebP, at most 2 MB and 4096 × 4096 pixels.
   Sharp decodes the actual bytes, strips metadata, and re-encodes a PNG fitting
   512 × 512 pixels. File extensions and client MIME declarations are insufficient.
3. A short transaction reserves an asset using a server-generated custom ID.
   Only one upload per agency can be pending; each actor may start 20 per hour.
   UploadThing's server-side `UTApi.uploadFiles` receives the normalized bytes.
4. A second transaction rechecks ownership and logo version before attachment.
   Replacements retire the previous tracked file. Business-detail revisions are
   separate, so changing a logo does not invalidate the business form.
5. `DELETE` clears the logo and increments its version, preventing an in-flight
   upload from restoring it. Retired files are deleted by their recorded custom
   IDs; clients cannot supply arbitrary storage keys or URLs.

Provider uploads happen outside database transactions. Durable asset records
preserve cleanup information after interrupted requests or agency deletion.
Missing storage configuration disables upload but does not block local removal.

## Cleanup and operations

`bun run uploads:cleanup` retries up to 20 retired files, also retiring uploads
pending over one hour and files orphaned by agency deletion. Failed provider
deletions remain retryable; active agency logos are never selected. A successful
logo save is not reversed by a later cleanup failure. Run the command repeatedly
for a backlog. A scheduled job and monitoring must be configured at deployment;
this checkpoint does not install a scheduler. Deleted asset records are retained
for provenance and rate-limit accounting.

Deploy to a Node.js runtime supporting Sharp and the configured request size and
duration. With Next.js Cache Components, Node is the default and an explicit
`runtime` segment export is unsupported. `maxDuration` is 120 seconds; the hosting
provider must support that limit.

## Verification

`bun run test:logos` uses local MySQL and fake storage to check image decoding,
malformed requests, ownership, stale versions, concurrent uploads, removal
during upload, and retryable cleanup. Fixtures are scoped and removed afterward.
Run `bun run test:agencies`, `bun run test:persistence`, `bun run lint`, and
`bun run build` for regressions. With the production preview running, set
`AUTH_TEST_BASE_URL` and run `bun run test:auth` for anonymous mutation rejection.

On November 15, 2026 a real browser test uploaded PNG and JPEG fixtures through
the configured provider, verified public image rendering and resizing, reloaded,
replaced and removed the logo, and checked desktop/mobile layouts. Both provider
files were confirmed deleted. Local test-workspace cleanup now refuses to remove
the fixture until all its logo assets have completed storage deletion.

Reference: [UploadThing server API](https://docs.uploadthing.com/api-reference/ut-api).
