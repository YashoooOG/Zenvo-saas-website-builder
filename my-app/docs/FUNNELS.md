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

New pages receive a validated version-1 empty document. The initial document type
supports containers and plain text only. Validation rejects unknown executable
fields/node types, duplicate IDs, cycles, more than 500 nodes, excessive nesting
and more than 100,000 JSON characters. Pre-validation also limits traversal to
4,000 values and depth 20 before recursive schema parsing. There is no HTML/script
execution, visual editor, draft save endpoint, public route or publish action in
this checkpoint. The next checkpoint adds draft editing and preview.

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
