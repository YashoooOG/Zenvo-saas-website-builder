# Agency payments and Stripe Connect

Stage 14a adds `/agency/[agencyId]/payments`, an owner-only page separate from
agency subscription billing. It reads configuration and the status of an existing
`Agency.stripeConnectAccountId`. It does not link accounts, create onboarding URLs,
process payments, enable capabilities, or store new Stripe mappings. No migration
is needed. Standard-account OAuth authorization and callback handling are next.

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

The planned OAuth callback is `ZENVO_APP_URL/api/stripe-connect/callback`. It is
not implemented in this checkpoint; do not begin an authorization flow yet.
The `ca_` prefix alone cannot prove development mode. The upcoming token exchange
must verify test-mode access in the returned OAuth response. Use Stripe's
development client ID and test platform key from the same platform configuration.

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
field: test access is enforced by the platform key here, and OAuth will verify the
connection's granted mode before persisting a mapping in the following checkpoint.
The current read path trusts the existing database mapping; do not manually attach
production accounts to simulate a verified OAuth connection.

OAuth is the intended integration for an agency's own Standard account. This
checkpoint does not create Express/Custom accounts or choose account countries,
fee liability, or payout settings. Those business details are not inferred from
the developer's location. Connect remains separate from Zenvo's SaaS subscriptions.

## Verification

Run `bun run test:connect` for local MySQL tests with injected account responses.
They cover configuration, missing mappings, active ownership, sanitization, wrong
accounts/types, provider failure, and mapping changes during retrieval.
`bun run test:permissions` also checks owner-only navigation and access.
The HTTP auth suite includes the new Payments route. Test fixtures are deleted.
Real Connect configuration, provider reads, and OAuth remain unverified while
Stripe settings are empty. No real Stripe account is created or modified by these
tests.

References: [OAuth for Standard accounts](https://docs.stripe.com/connect/oauth-reference),
[retrieve an account](https://docs.stripe.com/api/accounts/retrieve).
