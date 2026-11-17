# Agency billing

Stage 13a adds an owner-only plan preview at `/agency/[agencyId]/billing`.
It reads the configured Stripe price; it does not create customers, subscriptions,
checkout sessions, or payments. Checkout, portal access, webhook reconciliation,
and subscription persistence are subsequent checkpoints. No migration is needed.

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

The server checks the active user, active agency owner, and ownership before any
Stripe request. Admins, members, client users, and unrelated owners cannot access
another agency's billing page. Hiding the Billing link is only a navigation aid.
The price ID always comes from server configuration, never from a browser input.
The preview is not proof of an active subscription and grants no paid entitlements.

Run `bun run test:billing` for isolated configuration/provider validation tests,
`bun run test:permissions` against local MySQL for role and tenant isolation,
and `bun run test:auth` against the local running app for anonymous route checks.
Set `AUTH_TEST_BASE_URL` if the app uses a port other than 3000.

Provider success must be checked with real sandbox configuration. Mock price tests
do not establish connectivity or verify a future checkout/webhook flow.

## References

- [Stripe API keys](https://docs.stripe.com/keys)
- [Retrieve a price](https://docs.stripe.com/api/prices/retrieve)
- [Stripe currency minor units](https://docs.stripe.com/currencies)

Currency formatting deliberately supports a small explicit set. JPY has zero
decimal places; the other supported currencies have two. Tax copy reflects the
price's tax behavior, not a calculated checkout total.
