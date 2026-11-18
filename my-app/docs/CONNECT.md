# Agency payments and Stripe Connect

Stage 14b adds owner-initiated Standard-account OAuth to the Payments page.
Stage 14c adds signed Connect webhooks and revocation handling.
Authorization can link a verified test account; it does not enable sales, sync
products, change capabilities, or configure fees. Agency subscriptions remain separate.

## Configuration

All settings may remain empty. The page then shows “Payments setup incomplete” and
the rest of the workspace works. To prepare later development testing, set:

- `STRIPE_SECRET_KEY`: a platform test secret/restricted key (`sk_test_...` or
  `rk_test_...`) with connected-account read permission.
- `STRIPE_CONNECT_CLIENT_ID`: the development OAuth client ID (`ca_...`) from the
  platform's Connect settings. A price ID or portal-configuration ID is not a
  substitute. This variable stays server-side.
- `ZENVO_APP_URL`: the canonical HTTPS app origin, or HTTP loopback for local use,
  such as `http://localhost:3115`. Paths, queries, fragments and credentials are
  rejected.

Register `ZENVO_APP_URL/api/stripe-connect/callback` as the exact development
OAuth redirect URL in Stripe. Use the development client ID and test platform key
from the same platform. The `ca_` prefix alone cannot prove mode; the callback
requires `livemode: false` and `read_write` in the token response before linking.
The platform key must permit the OAuth exchange and connected-account retrieval.

## Authorization lifecycle

The owner starts authorization through a protected server action. Each attempt
stores a SHA-256 hash of random 256-bit state, bound to the owner, agency, client
ID, and callback URL for ten minutes. New starts supersede pending attempts.
Unexpired exchanges block new starts. Declining authorization consumes the state.

Before calling Stripe, a transaction claims the attempt and stores a unique hash
of the authorization code. The SDK uses zero automatic retries. Concurrent calls,
replayed callbacks, and reuse of a code with fresh state cannot exchange it again.
Timeouts fail the attempt; start a new authorization rather than reload its callback.
After a process crash, an exchanging attempt blocks new starts until expiration.
OAuth codes are not idempotent: exchanging one twice can revoke a connection.

Returned access and refresh tokens are discarded. Zenvo validates test mode,
permission scope, account identity, and Standard account type, then rechecks active
ownership and unique account assignment before atomically saving the account ID.
Failures never automatically deauthorize an account. An exchange can succeed at
Stripe while local persistence fails; a new flow requires a new authorization code.

The callback requires a signed-in owner and returns a canonical Payments redirect
without code or state. Signed-out callbacks return 401 and require a fresh start
after sign-in. Responses disable caching and referrers. Configure deployment access
logs to redact callback query strings before production. Attempt hashes currently
remain until agency deletion; production retention and recovery policies are pending.

## Access and account status

The owner alone sees the Payments navigation link. The server independently checks
active ownership before configuration or Stripe reads. Admins, members, client
users, and unrelated users cannot read the page. No browser-supplied account ID is
accepted: the only lookup target is the agency's stored mapping.

The adapter retrieves the account using the platform test key, with a ten-second
timeout and no automatic retries. The response must match the stored account ID
and be a Standard account. Missing/malformed status fields cause an unavailable
state, not a false success. Ownership and the stored mapping are checked again
after the provider responds. Provider failures preserve the mapping and return a
generic message without request details.

The page displays submitted-details, charge-enabled and payout-enabled flags,
deduplicated outstanding/pending-verification counts, and whether a restriction is
reported. Bank data, contact details, raw requirement names and provider errors are
not returned to the page. Charges/payout flags do not imply that Zenvo can sell
anything yet. Account objects do not expose the subscription-style `livemode`
field: the platform key is test-only and OAuth verifies the connection's granted
mode before persisting a mapping.
The current read path trusts the existing database mapping; do not manually attach
production accounts to simulate a verified OAuth connection.

OAuth is the intended integration for an agency's own Standard account. This
checkpoint does not create Express/Custom accounts or choose account countries,
fee liability, or payout settings. Those business details are not inferred from
the developer's location. Connect remains separate from Zenvo's SaaS subscriptions.

## Connected-account webhooks

Create a **test** connected-account event endpoint at
`ZENVO_APP_URL/api/stripe-connect/webhook`, subscribed to `account.updated` and
`account.application.deauthorized`. Set its signing secret as
`STRIPE_CONNECT_WEBHOOK_SECRET`. Keep this separate from the platform subscription
endpoint and `STRIPE_WEBHOOK_SECRET`. No billing price is required. Empty settings
leave this endpoint unavailable (503) and the rest of the workspace usable.

The handler verifies the raw body and Stripe signature, with the SDK's timestamp
check and a 1 MiB body limit, before database access. It ignores live-mode and
unrelated events. Account updates must match the envelope account; revocations
must identify this platform's configured OAuth application. The signed endpoint
does not require a Clerk session. Failures return 503 for provider retry; successful
deliveries have an atomic receipt so duplicates cannot repeat effects.

Account updates fetch current provider state under an account lock instead of
trusting an old event snapshot. Only sanitized flags/counts and the synchronization
time are retained. This internal snapshot is not authorization to sell and is not
a fallback for a failed live status read. The Payments page still verifies status
with Stripe. Unknown account updates never attach an agency.

Revocation clears only the matching agency's account mapping, without calling
Stripe or changing its account. The owner can authorize again from Payments.
Independent account tombstones also record revocations received before OAuth
completion. OAuth completion and webhook processing share account-first locking,
so an in-flight authorization cannot restore a revoked link. A revocation older
than the current authorization's start does not disconnect the newer link. Stripe
uses second-level event timestamps: ambiguous same-second events conservatively
require a fresh authorization. Keep deployment clocks synchronized.

Receipts and revocation tombstones currently have no automatic deletion. Do not
purge them while callbacks or event retries can still arrive; define retention and
operational recovery policies before production. There is no live-mode handling,
manual disconnect button or sales processing yet.

## Connected product catalog

Stage 14d adds an owner-only “Sync products from Stripe” form to Payments when the
connected account can be verified. The adapter uses the stored account ID in the
Stripe-Account request option for every product/price list call. It does not accept
an account ID from the browser or write products back to Stripe.

A complete import reads products plus separate active/inactive price lists, with
100 records per page and a maximum of five pages per collection (500 products,
500 active prices, 500 inactive prices). A 30-second budget is checked before each
page request; each request also has a ten-second SDK timeout and zero retries.
Exceeding the limits fails the import without replacing the previous catalog.
Pagination is not a provider-side transactional snapshot: changes during an import
can require retry, and future checkout must revalidate the selected price with Stripe.

Only test-mode objects with matching product references are accepted. Duplicate
IDs/cursors, malformed responses, missing products and provider errors fail the
whole import. Product names and price IDs, currency, amount, activity and type are
retained; metadata and unrelated provider fields are discarded. A complete empty
result intentionally replaces the local catalog with an empty list.

The initial checkout subset is active fixed-integer, per-unit, one-time prices on
active products without custom amounts or quantity transforms. Other prices remain
visible as unsupported. The review currently displays exact amounts in currency
minor units; it does not assume every currency has two decimal places. Imported
prices do not authorize a payment and no product can be sold from this checkpoint.

Remote reads happen outside database transactions. A durable synchronization claim
ensures an older overlapping request cannot overwrite a newer requested import.
Final persistence rechecks active ownership, account mapping, authorization start
and revocation state under the same account-first locks as Connect events. Revoking
or reauthorizing the account clears the old catalog, and revoked/unmapped catalogs
are not exposed. The last successful snapshot and timestamp otherwise remain
available after import failure. There is no automatic product webhook sync yet.

## Platform application fee policy

Stage 14e adds `ZENVO_APPLICATION_FEE_BPS`, a server-only deployment setting shared
by agencies. It accepts integers from 0 through 10000: 100 means 1%, 250 means
2.5%, and explicit 0 means no application fee. Blank or malformed values are
unconfigured; no commercial rate is assumed. This policy is displayed read-only
on the owner-only Payments page, separately from agency subscription billing.
There is no browser or agency action that can change the platform's rate.

`calculateApplicationFee` takes a verified charge total in currency minor units
and an integer rate. It uses BigInt multiplication, then rounds down once on the
whole charge total. Zero charges and zero fees produce zero; the fee can never
exceed the charge. The returned remainder is before Stripe processing fees and
is not a promised payout. No currency conversion or universal cents assumption
is used. Taxes, discounts and shipping are not calculated by this helper.

No payment endpoint consumes this policy yet. Stage 17 must require valid policy,
revalidate account authorization and Stripe price on the server, derive the total
without accepting browser-supplied amounts/rates, snapshot the chosen policy with
the durable payment attempt, and send the resulting application_fee_amount only
when appropriate for the selected direct-charge flow. Changes must not alter an
already-created payment attempt. Refunds and fee refunds need explicit handling
and end-to-end Stripe testing before production. The present checkpoint neither
creates charges nor takes application fees.

## Verification

Run `bun run test:fees` for configuration, zero/full-rate boundaries, floor rounding,
invalid amounts and exact large-integer calculations.
Run `bun run test:connect` for local MySQL tests with injected account responses.
They cover configuration, missing mappings, active ownership, sanitization, wrong
accounts/types, provider failure, and mapping changes during retrieval.
`bun run test:permissions` also checks owner-only navigation and access.
The HTTP auth suite includes the new Payments route. Test fixtures are deleted.
Run `bun run test:connect-oauth` for state, expiry, denial, replay, concurrent
exchange, response validation, cross-agency assignment and callback tests with
injected Stripe responses and real MySQL. Apply `bun run db:migrate` first.
Run `bun run test:connect-webhook` for signature rejection, replay/concurrency,
current-state refresh, provider retry, tenant isolation, delayed revocation, and
revocation during OAuth completion. These tests use signed fixtures and real local
MySQL; they do not contact Stripe.
Run `bun run test:catalog` for catalog persistence, pagination bounds, failures,
owner access, concurrent imports, and connection changes during remote reads.
Real Connect configuration, provider reads, catalog imports, OAuth and event delivery remain unverified while
Stripe settings are empty. No real Stripe account is created or modified by these
tests.

References: [OAuth for Standard accounts](https://docs.stripe.com/connect/oauth-reference),
[retrieve an account](https://docs.stripe.com/api/accounts/retrieve),
[Connect webhooks](https://docs.stripe.com/connect/webhooks).

Catalog references: [products](https://docs.stripe.com/api/products/list), [prices](https://docs.stripe.com/api/prices/list).

Fee reference: [Stripe direct charges](https://docs.stripe.com/connect/direct-charges).

## Current price and fee check (17b)

Supported catalog prices now have an owner-only Check current price and fee
button. It requires configured test Connect credentials, an explicit fee policy,
an OAuth-authorized account, and a supported active price in that agency's catalog.
It retrieves the current Standard account and the price with an expanded product,
using Stripe-Account for the price request. Charge/payout restrictions, live or
inactive objects, mismatched identities, recurring/tiered/variable/fractional
prices and unsupported currencies are rejected.

The first supported subset is one unit, fixed integer amounts from 1 to 99,999,999
minor units in USD/EUR/GBP/INR/CAD/AUD/JPY. Formatting respects JPY's zero decimal
places. The fee is calculated from current provider data and server basis points;
no request field can choose the amount, fee, account, currency or quantity. The
expanded product must match the selected catalog product. Active ownership and
connection generation/revocation are rechecked under account-first locks after
provider reads. No Stripe write, payment or catalog mutation is performed.

The displayed result is a point-in-time price check, not a reserved quote or
permission to charge. It reports provider tax treatment but does not calculate
taxes, shipping or discounts. The subsequent checkout stage must revalidate and
persist an immutable attempt before external payment writes, enforce the
published page's configured offer, and implement idempotency, verified webhooks
and refund handling. The public page cannot initiate checkout yet.

Run `bun run test:funnel-prices` for current-price authority, tampered input,
owner access, empty configuration, unsupported prices, currency formatting,
connection changes and provider failure. Tests use injected Stripe responses and
local MySQL. Real price reads and signed-in UI checks remain pending while Stripe
configuration is empty. Reference: [retrieve a price](https://docs.stripe.com/api/prices/retrieve).

## Page offer configuration (17c)

Agency owners can select one supported catalog price for each funnel page from
the Page offer section. Selection stores the connected account, price ID and
OAuth authorization start timestamp; amounts and fees are not accepted from a
form or frozen in this selection. Clearing an offer remains possible when Stripe
is disconnected. Other agency/client roles cannot configure or read offer options.

Draft and published offers use separate nullable JSON fields. Saving a selection
increments the funnel revision but leaves its published offer untouched. Publishing
copies the current draft offer alongside the page snapshot. Publishing any change
to a page with a draft or existing published offer requires the agency owner;
workspace editors may still unpublish it to take the page offline. Unpublish clears
the published offer but preserves the draft selection. Pages without offers retain
the existing editor publishing permissions.

Configuration validates the selected price against the current account's cached
supported catalog and locks the account before the agency. Publication checks that
the account mapping and authorization generation still match the selection. A
reconnection requires selecting the offer again, even for the same account ID.
This does not prove the price is still active at Stripe: the payment stage must
retrieve the price/product and account again and validate published offer identity.
Revoked connections must disable checkout even if an older published offer remains
stored. Offer metadata is not included in the current public HTML response.

Apply `bun run db:migrate` for `20261119010000_page_offers` and run
`bun run test:page-offers`. Tests cover owner-only configuration, scoped IDs,
rejected amount/account injection, draft/public separation, stale updates,
reconnection, revocation, unpublishing and archived workspaces. This checkpoint
creates no payment attempts or Stripe sessions; durable checkout attempts are next.
Signed-in UI and real Stripe verification remain pending.

## Durable checkout preparation (17d)

`prepareFunnelCheckout` is an internal, owner-only service. It accepts scoped page
IDs and a UUID request ID, resolves the published offer on the server, verifies
current Stripe account/product/price data using the existing price checker, and
stores an immutable `FunnelCheckoutAttempt`. Browser-supplied amounts, fees, price
IDs and account IDs are rejected. Stripe configuration can remain empty; new
preparations then fail before a provider request or attempt insert.

The snapshot includes the published page fingerprint, account and authorization
generation, price, currency, amount, product name, fee rate/amount, tax behavior,
creation/expiry times and a server-generated idempotency key. It represents one
fixed-price unit in test mode. Tax behavior is recorded, not a tax calculation;
no shipping, discounts or automatic tax are applied here.

Request IDs are unique per initiating owner. Repeating the same request returns
the original snapshot without refreshing prices or extending its 30-minute
lifetime. Concurrent requests serialize using the account-then-user/agency lock
order and converge on one row. A request cannot be rebound to another page or
publication. Expired attempts require a new request ID. Draft-only edits do not
invalidate the published snapshot; republishing, unpublishing, disabled workspaces,
owner access loss and account revocation/reconnection block stale preparations.
All live scope, publication and connection checks run again after provider reads.
Provider reads are outside database transactions; no Stripe writes occur.

Rows have no cascading page/user foreign keys so deleting content cannot erase
checkout history. These stored IDs are historical references, never authorization.
There is no public endpoint, action, payment button, Stripe session, paid state or
webhook fulfillment in this checkpoint. The next session-creation stage must
recheck eligibility, use the persisted idempotency key and frozen request parameters,
handle ambiguous provider outcomes, and reconcile verified payment events. A
prepared row alone must never be treated as a purchase or grant access.

Apply `bun run db:migrate` for `20261119020000_funnel_checkout_attempts` and run
`bun run test:funnel-attempts`. Nine tests use local MySQL and injected Stripe
responses to cover persistence/retries, concurrent duplicates, authorization,
input tampering, scope/request conflicts, expiry, draft/public separation,
republication, revocation, changes during provider reads and failure recovery.
Real Stripe payments remain untested and the public checkout UI is not enabled.

## Connected checkout session creation (17e)

`startFunnelSession` accepts only an attempt ID and an authenticated owner actor.
It is an internal test-mode service, not a public route or Server Action. The
Stripe adapter sends every price/session operation to the stored connected
account. The platform's subscription checkout remains separate.

Before the first session request, the service rechecks live account and price
availability and compares the amount, currency, fee and tax behavior with the
prepared snapshot. It then commits the entire Checkout Session request JSON before
calling Stripe. The request fixes quantity at one, uses the stored price and fee,
turns off adaptive pricing, automatic tax and promotion codes, restricts eligible
payment methods to cards, and attaches attempt/agency metadata to both the session
and PaymentIntent. An explicit zero fee omits `application_fee_amount`.

Success and cancellation return to the owner's funnel management page using the
configured canonical application origin. These URLs are not supplied by callers.
The frozen request has a one-hour Stripe session expiry. The preparation attempt's
original 30-minute retry window remains unchanged, so replay stays within Stripe's
minimum session-creation expiry window and idempotency retention period. Request
JSON and idempotency keys never rotate after a timeout or invalid response. Changes
to deployment fee/origin configuration do not mutate a pending request.

Session creation/retrieval runs under account-first and then user/agency locks,
serializing with publishing, account revocation and owner/workspace changes. These
are deliberately bounded external calls: SDK timeout 10 seconds, no automatic
network retries, transaction timeout 30 seconds. A lost response or rolled-back
session mapping leaves the separately committed request marked `requested`.
Retrying the same attempt replays that exact request/key; once an ID is stored,
retries retrieve that session instead of creating another. This lock strategy
trades short agency write contention for serialization; a future worker/lease
implementation must preserve the same ordering and durable request behavior.

Responses must match the attempt and agency metadata, connected price line item,
quantity, total/subtotal, currency, test mode and frozen expiry. Tax, shipping and
discount totals must be zero. Open session redirects allow only HTTPS URLs on
`checkout.stripe.com`, without credentials or custom ports. Completed/expired
sessions return no redirect and do not cause replacement sessions. A `complete`
session status is not payment confirmation and never grants access.

The new nullable fields (`sessionRequest`, `sessionId`, `sessionStatus`) preserve
existing attempts. Apply `bun run db:migrate` for
`20261119030000_funnel_checkout_sessions`; run `bun run test:funnel-sessions`.
Tests use injected provider responses with real local MySQL, including lost
responses, concurrent requests, changed configuration, tampered responses,
unauthorized access and stale publications/connections.

Live Stripe testing remains pending. Sessions already created at Stripe can remain
open after an attempt expires or a local page/connection changes; this service
stops returning their URLs but does not cancel them remotely. No public payment
button is exposed until reconciliation, remote expiration and verified Connect
payment events handle those outcomes. Reconciliation must recover `requested`
attempts, inspect known sessions after local expiry, and never infer payment from
a redirect or browser claim.

References: [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create),
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests), and
[direct charges](https://docs.stripe.com/connect/direct-charges).
