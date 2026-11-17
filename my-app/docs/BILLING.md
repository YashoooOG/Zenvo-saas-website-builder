# Agency billing

The owner-only billing page at `/agency/[agencyId]/billing` shows the configured
plan and persisted subscription status. Stage 13b adds verified webhook ingestion
and subscription tables. Zenvo does not yet create Stripe customers, subscriptions,
checkout sessions, or payments. Checkout and portal access are subsequent checkpoints.
Stripe settings may remain empty: the webhook returns 503 and the workspace works.

Apply `bun run db:migrate` before running this version. The additive migration
`20261117030000_agency_subscriptions` creates `AgencySubscription` and
`StripeWebhookReceipt`, using the same case-sensitive collation as agency IDs.

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
upcoming Checkout flow must persist that mapping **before** creating a subscription,
and set subscription metadata `zenvoAgencyId` to the agency ID. Unknown customers
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

## References

- [Stripe API keys](https://docs.stripe.com/keys)
- [Retrieve a price](https://docs.stripe.com/api/prices/retrieve)
- [Stripe currency minor units](https://docs.stripe.com/currencies)
- [Stripe webhook signatures, retries, and event ordering](https://docs.stripe.com/webhooks)
- [Retrieve current subscription state](https://docs.stripe.com/api/subscriptions/retrieve)

Currency formatting deliberately supports a small explicit set. JPY has zero
decimal places; the other supported currencies have two. Tax copy reflects the
price's tax behavior, not a calculated checkout total.
