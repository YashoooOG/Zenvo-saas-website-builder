# Agency Launchpad (Stage 10)

New agencies land at `/agency/[agencyId]/launchpad`. Existing owners and admins
can open it from the sidebar or agency overview. Members, clients, outsiders,
deleted users, and agencies with deleted owners cannot read the setup page.

## Progress from saved data

The checklist is calculated server-side on each request after session and agency
authorization. There is no separate onboarding flag to drift out of sync, and
no client-supplied completion checkbox.

| Step | Completion rule | Counts toward essentials |
| --- | --- | --- |
| Create your agency | Agency exists and is accessible | Yes |
| Business contact details | Business email and country are saved | Yes |
| Agency logo | Logo URL/key point to an ACTIVE asset in the same agency | No |
| Team | At least one active, non-owner ADMIN or MEMBER has joined | No |

Clearing contact fields returns the checklist to incomplete. Retiring/removing
the tracked logo or removing the last teammate also updates the corresponding
optional step. Pending invitations are described as pending and never count as
joined teammates; expired/revoked invitations and deleted users are excluded.
Client memberships do not complete the agency-team step.

Only the owner sees team progress and the team action. Admins see a note that
their owner manages it, with no invitation count or member information exposed.
Both roles can edit contact details and branding. Optional steps do not inflate
or block the essential progress indicator. A solo agency can finish its basics
without inviting anyone or uploading a logo.

Completing this checklist does not start billing or publish a site. Client
workspaces and payment onboarding will be integrated as those features ship;
there are no links to unimplemented routes or fabricated Stripe completion.
No database migration or new provider credentials are needed for this stage.

## Verification

`bun run test:launchpad` checks initial state, persisted updates and regressions,
tracked branding, invite/member lifecycle, and access boundaries against MySQL.
Run the permissions and HTTP authentication suites as regressions, plus lint and
the production build. Browser verification should cover the creation redirect,
settings round trip, progress persistence, sidebar context, and mobile layout.

Verified November 16, 2026: production build (including TypeScript), lint, all
five Launchpad tests, eight permission tests, and six HTTP authentication checks
passed. Browser verification covered creation redirect, initial 1-of-2 progress,
saving business details, 2-of-2 progress retained after reload, sidebar context,
320px mobile layout without horizontal overflow, and sign-out. No browser
console errors were recorded. Disposable local and Clerk fixtures were removed.
