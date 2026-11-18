# Agency billing

The owner-only billing page at `/agency/[agencyId]/billing` shows the configured
plan and persisted subscription status. Stage 13b added verified webhook ingestion
and subscription tables. Stage 13c adds owner-only hosted test Checkout: it creates
a Stripe customer and checkout session; completing that session creates the
subscription. Stage 13d adds owner-only access to the Stripe customer portal.
Stripe settings may remain empty: the webhook returns 503 and the workspace works.

Apply `bun run db:migrate` before running this version. The additive migration
`20261117030000_agency_subscriptions` creates `AgencySubscription` and
`StripeWebhookReceipt`, using the same case-sensitive collation as agency IDs.
The additional `20261117040000_agency_checkout` migration creates `AgencyCheckout`
to retain customer/session retry keys and checkout recovery state.

## Configure a test plan

1. Select a sandbox/test environment in the Stripe dashboard.
2. Create an active product with a fixed, recurring, per-unit price. Supported
   currencies in this checkpoint: USD, EUR, GBP, INR, CAD, AUD, JPY. Metered,
   tiered, custom-amount, and transformed-quantity prices are rejected.
3. Add `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` to `.env.local`. Use a test secret
   (`sk_test_...`) or restricted (`rk_test_...`) key and a `price_...` ID from the
   same environment. Restricted keys need read access to prices and products.
   Keep both values server-side; never use a `NEXT_PUBLIC_` prefix for the key.
4. Run `bun run billing:check`. Success prints only the plan name, price ID,
   formatted amount, cadence, and tax label. Failure exits nonzero with a safe
   message. This command only retrieves a price and its expanded product.
5. Restart the app after changing environment variables, then open an agency's
   Billing link while signed in as its owner.

Missing keys do not prevent builds or ordinary workspace use. Invalid configuration
or a Stripe outage shows “Plan unavailable.” Provider request details and secrets
are not returned to the page or printed by the preflight command. Live-mode keys,
live products/prices, inactive products/prices, unsupported currencies, and invalid
amounts are rejected. The SDK uses a ten-second request timeout and one retry.

## Access and testing

The billing page checks the active user, active agency owner, and ownership before
its Stripe request. Admins, members, client users, and unrelated owners cannot access
another agency's billing page. Hiding the Billing link is only a navigation aid.
The price ID always comes from server configuration, never from a browser input.
The preview is not proof of an active subscription and grants no paid entitlements.

Run `bun run test:billing` for isolated configuration/provider validation tests,
`bun run test:permissions` against local MySQL for role and tenant isolation,
and `bun run test:auth` against the local running app for anonymous route checks.
Set `AUTH_TEST_BASE_URL` if the app uses a port other than 3000.

Provider success must be checked with real sandbox configuration. Mock price tests
do not establish connectivity or verify a real Stripe delivery or checkout flow.

## Subscription webhooks

When ready, configure a **snapshot** event destination for your platform account
(not connected accounts), with API version `2026-10-28.endive`, matching the installed
Stripe SDK. Subscribe to `customer.subscription.created`,
`customer.subscription.updated`, and `customer.subscription.deleted` at
`/api/stripe-webhook`. Add its signing secret as `STRIPE_WEBHOOK_SECRET` in
`.env.local`. The secret is separate from the API key. Restricted API keys also
need subscription read access. Leave all configuration empty until you want to test.

For later local testing, the Stripe CLI can forward events:

```sh
stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3115/api/stripe-webhook
```

Use the CLI listener's signing secret for CLI deliveries. Restart the app after
environment changes. Signature verification uses the raw body, the SDK's default
timestamp tolerance, and a one-MiB body limit. Invalid signatures/payloads return
400, oversized bodies return 413, and missing configuration returns 503. Signed
live-mode, connected-account, and unrelated event types are ignored with 200.

An existing `Agency.stripeCustomerId` is the only way to resolve a tenant. The
Checkout flow persists that mapping **before** creating a session,
and sets subscription metadata `zenvoAgencyId` to the agency ID. Unknown customers
are ignored; metadata alone cannot claim an agency. No manual customer mapping is
needed now, and generic `stripe trigger` fixtures won't create agency subscriptions.

For each recognized event, the handler locks the agency and retrieves the current
subscription from Stripe. It validates customer, subscription ID, agency metadata,
test mode, a single item with quantity one, and the configured recurring price.
It persists status, period end, scheduled cancellation, collection pause, and sync
time. Different subscription IDs are retained separately rather than overwriting
one another. These records do not yet grant paid entitlements.

Fetching while holding the agency lock prevents delayed or concurrent events from
reapplying stale event snapshots. The subscription write and receipt are atomic;
duplicate IDs return success without another provider call. A failed provider read
or mapping mismatch rolls back and returns 503 so Stripe can retry. Subscription
reads use a ten-second provider timeout without SDK retries inside a twenty-second
transaction; lock contention can also return a retryable 503. This is suitable for
the current local checkpoint; a durable webhook queue and reconciliation job are
required before high-volume production use. Historical receipts are retained.

Run `bun run test:subscriptions` for real local MySQL writes and SDK-signed synthetic
deliveries, including replay/concurrency, retry, tenant isolation, and invalid
signatures. Subscription retrieval is injected in these tests; no Stripe account
is contacted. The owner page explicitly describes status as last confirmed, not
instantaneous. It can show stored status even when plan configuration is unavailable.

## Hosted test Checkout

The owner sees **Continue to test checkout** only when the plan and all checkout
configuration are available and no non-terminal local subscription is recorded.
The server rechecks ownership and the configured price on every submission. Form
inputs cannot select a customer, price, quantity, provider key, or return URL.
All Stripe configuration may remain empty; no checkout is offered in that case.

When ready, add `ZENVO_APP_URL` as the canonical origin (for example
`http://localhost:3115` or `https://app.example.com`). Only HTTPS or HTTP loopback
origins are accepted; paths, query strings, fragments, and credentials are rejected.
Also configure the test key, recurring price, and webhook signing secret described
above. Restricted keys additionally need customer and Checkout Session writes,
Checkout Session reads, and subscription reads. A configured webhook secret does
not prove the listener is running; verify real delivery before using Checkout.

Customer and subscription metadata are set to the agency ID. Checkout uses one
unit of the server price and filters payment methods to cards. No promotions,
automatic tax, or custom amount fields are enabled in this checkpoint. Tax labels
describe the price's configured behavior; this is not a production tax integration.
Success and cancellation both return to billing without granting access or trusting
query parameters. Refresh billing after Stripe sends its subscription event.
Only HTTPS redirects to `checkout.stripe.com` are accepted; custom Stripe checkout
domains are not supported in this checkpoint.

The flow commits recovery keys before provider writes and the customer mapping
before creating a checkout. Agency locks serialize competing submissions. Existing
open sessions are reused; any non-terminal subscription at Stripe blocks another
checkout, even if its webhook has not arrived. Subscription checks inspect up to
100 records and fail closed when more exist. Expired sessions can be replaced on
the next submission. Completed sessions wait for subscription synchronization;
resubscription requires the previous subscription to be locally terminal and no
non-terminal subscription at Stripe.

Customer and checkout creation use persisted idempotency keys with stable request
parameters. Uncertain requests are never retried after 23 hours, before Stripe's
24-hour minimum key-retention boundary. Configuration changes during uncertain
recovery also stop the flow. These cases require operator review: verify the Stripe
customer/session and subscription state before repairing the local mapping or
rotating any key. Do not clear recovery rows to work around an error. The operator recovery command below can attach verified existing objects; it
does not reset uncertain attempts when no original object can be identified. Sessions expire after an hour;
if an uncertain request never reached Stripe and its expiry can no longer be used,
provider validation may require this same operator review.

Run `bun run test:checkout` for local MySQL tests with an injected provider. They
cover owner denial, empty configuration, plan validation, concurrent requests, lost
responses, active subscriptions, expired/completed sessions, safe redirects, and
recovery cutoffs. These tests do not create real Stripe resources or establish that
a real hosted payment and webhook round-trip succeeds. Verify that separately with
test cards once Stripe is configured. Production billing remains future work.

## Customer portal

An agency owner with a stored Stripe customer can open **Manage billing on Stripe**
from the subscription-status section. This works independently of the plan preview
and does not require a configured price, an active subscription, or a new checkout.
It is available for canceled customers who need their invoices, too. Missing portal
configuration shows an explanation without preventing workspace use.

When ready, create and save a portal configuration in your Stripe sandbox. Enable
the options you want to test, such as invoice history, payment-method updates, and
subscription cancellation. **Disable subscription updates (plan and quantity
changes)**: Zenvo currently reconciles only its single configured subscription price.
Set the saved `bpc_...` ID as `STRIPE_PORTAL_CONFIGURATION_ID`. The explicit ID keeps
the integration independent of changes to Stripe's default portal configuration.
The test secret key, webhook signing secret, and `ZENVO_APP_URL` must also be set.
Restricted keys need customer reads, portal-configuration reads, and portal-session
writes. Leave these variables empty until you are ready to test Stripe.

Every request checks the active agency owner while holding the agency lock. The
server retrieves the mapped Stripe customer and verifies its ID, test mode, and
`zenvoAgencyId` metadata. Deleted or mismatched customers are rejected. It verifies
that the explicit portal configuration is active, in test mode, and has subscription
updates disabled before creating a fresh session. The returned customer,
configuration, mode, and return URL must match the request. Only HTTPS redirects to
`billing.stripe.com` are accepted; custom portal domains are not supported yet.
The session URL is neither stored nor logged. Session creation does not modify
local subscription status or grant access; changes from the portal arrive through
the existing subscription webhooks. Customer contact details edited in Stripe are
not copied into Zenvo's agency profile.

Portal sessions are temporary access links. Each click creates a fresh one; a lost
response can safely be retried without creating a subscription or payment. Provider
calls have ten-second timeouts without retries, inside a forty-second transaction.
Transient provider failures return a generic message without provider payloads or
session URLs. In production, test lock contention and hosted-session behavior.

`bun run test:portal` uses real local MySQL and an injected provider to verify the
owner boundary, customer and configuration matching, redirect validation, and retry
behavior. Fixtures are removed automatically. Real hosted portal access, invoice
viewing, payment-method changes, cancellation, and subsequent webhook delivery
remain unverified while Stripe configuration is empty. No migration is needed for
this checkpoint.

## Refreshing subscription status

Stage 13e adds **Refresh status from Stripe** to the subscription-status section
for an owner whose agency has a mapped customer and a configured test key/price.
It can recover missed creation, cancellation, and status-change events. It needs
only customer/subscription read access at Stripe and does not create payments,
subscriptions, customers, or webhook receipts. It does not require a portal
configuration or a running webhook listener, although normal delivery should still
be configured. Leave the test credentials empty to keep this action unavailable.

The server locks the agency and rechecks active ownership before contacting Stripe.
It verifies the mapped customer's test mode and agency metadata, then requests
all subscription statuses (including canceled subscriptions), up to 100 records.
A response with more pages, duplicate IDs, or any missing locally known subscription
is rejected. Missing records are never treated as cancellations or deleted locally.
Every returned subscription passes the same customer, agency, price, item count,
quantity, and test-mode validation used by the webhook handler. A single invalid
record rolls back the entire refresh. Unexpected historical prices therefore need
operator review instead of being silently skipped.

Refresh and webhook writes use the same agency lock, keeping a delayed refresh from
overwriting a later webhook fetch. Provider reads have ten-second timeouts without
retries inside a thirty-second transaction. Successful refreshes revalidate the
billing page; failures preserve its recorded status and display a safe message.
The returned status is a snapshot, not a substitute for ongoing webhook delivery.

`bun run test:reconciliation` covers missed-event recovery, active ownership,
customer matching, incomplete histories, all-or-nothing updates, provider failures,
and concurrent refreshes using local MySQL and an injected provider. No migration
is needed. Real Stripe reads and the configured browser refresh flow remain
unverified while credentials are empty. Recovery of uncertain customer/checkout
creation keys uses the separate operator command below; this refresh does
not clear those keys or change the stored customer mapping.

## Operator checkout recovery

Stage 13f adds `billing:recover`, a local operator command for linking an existing
test customer or checkout session after an uncertain provider response. Apply
`bun run db:migrate` first: `20261118010000_billing_recovery` adds audit receipts.
This is not a public API. Access to the local database and Stripe credentials is
the operator trust boundary; `--owner` checks current active ownership and records
that owner in the receipt, but is not proof of an operator's login identity.

Inspect the local record without contacting Stripe:

```sh
bun run billing:recover --owner USER_ID --agency AGENCY_ID
```

Use Stripe's test dashboard/request logs to identify the object belonging to the
original attempt. Do not guess when multiple candidates exist. Preview exactly one
candidate (a test secret/restricted key with customer and session reads is required):

```sh
bun run billing:recover --owner USER_ID --agency AGENCY_ID --customer cus_ID
bun run billing:recover --owner USER_ID --agency AGENCY_ID --session cs_test_ID
```

These commands do not write. Copy the fingerprint from the candidate preview,
then explicitly apply that same candidate:

```sh
bun run billing:recover --owner USER_ID --agency AGENCY_ID --customer cus_ID --apply --expect PREVIEW_FINGERPRINT
```

For a session repair, use `--session cs_test_ID` in the apply command instead.
Recover a customer first if its mapping is missing. Each apply obtains the same
agency lock used by Checkout and reconciliation, rejects a changed fingerprint,
and retrieves the candidate again. It verifies test mode, agency metadata, object
IDs, and creation time within the stored attempt's retry window (five seconds of
clock tolerance at the start). Session recovery additionally verifies the linked
customer, original price and quantity, complete line items, expiry, and both return
URLs. These guards supplement the operator's identification of the original object;
creation time and agency metadata alone do not distinguish arbitrary duplicate
objects manually created in Stripe.

A repair only fills a missing mapping. It cannot replace a different customer or
session, use an object claimed by another agency, reset/rotate keys, create Stripe
resources, change subscription status, or grant entitlements. The mapping and a
`BillingRecoveryReceipt` commit together. Receipts contain the agency, current owner,
kind, object ID, state fingerprint, and time; they cascade if the agency is deleted.
They are operational history, not a tamper-proof external audit trail. Reapplying
an already linked object does not add another receipt. Reports omit retry keys,
credentials, customer contact data, and hosted session URLs.

After recovery, use **Refresh status from Stripe** and inspect the result. Normal
Checkout logic then handles a verified expired session or a terminal subscription.
When the original object cannot be established, recovery leaves the attempt blocked.
There is deliberately no reset-on-absence command: absence from a search is not
proof that a provider write never happened. Such cases still require manual provider
investigation and a separately reviewed remediation. The command does not bypass
the normal 23-hour retry cutoff by attempting the original write again.

`bun run test:recovery` tests local inspection, argument rejection, ownership,
candidate validation, stale fingerprints, read-only preview, explicit apply,
unchanged keys, and audit receipts using local MySQL with an injected provider.
Real candidate retrieval/application remains unverified while Stripe is empty.
No browser UI is changed in this checkpoint.

## References

- [Stripe API keys](https://docs.stripe.com/keys)
- [Retrieve a price](https://docs.stripe.com/api/prices/retrieve)
- [Stripe currency minor units](https://docs.stripe.com/currencies)
- [Stripe webhook signatures, retries, and event ordering](https://docs.stripe.com/webhooks)
- [Retrieve current subscription state](https://docs.stripe.com/api/subscriptions/retrieve)
- [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe idempotency and retry retention](https://docs.stripe.com/api/idempotent_requests)
- [Create a customer portal session](https://docs.stripe.com/api/customer_portal/sessions/create)
- [Configure and integrate the customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [List all subscription statuses](https://docs.stripe.com/api/subscriptions/list)
- [Retrieve a Checkout Session](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [Retrieve a customer](https://docs.stripe.com/api/customers/retrieve)

Currency formatting deliberately supports a small explicit set. JPY has zero
decimal places; the other supported currencies have two. Tax copy reflects the
price's tax behavior, not a calculated checkout total.
