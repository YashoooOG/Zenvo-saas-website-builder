# Agency payments and Stripe Connect

Stage 14b adds owner-initiated Standard-account OAuth to the Payments page.
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

## Verification

Run `bun run test:connect` for local MySQL tests with injected account responses.
They cover configuration, missing mappings, active ownership, sanitization, wrong
accounts/types, provider failure, and mapping changes during retrieval.
`bun run test:permissions` also checks owner-only navigation and access.
The HTTP auth suite includes the new Payments route. Test fixtures are deleted.
Run `bun run test:connect-oauth` for state, expiry, denial, replay, concurrent
exchange, response validation, cross-agency assignment and callback tests with
injected Stripe responses and real MySQL. Apply `bun run db:migrate` first.
Real Connect configuration, provider reads, and OAuth remain unverified while
Stripe settings are empty. No real Stripe account is created or modified by these
tests.

References: [OAuth for Standard accounts](https://docs.stripe.com/connect/oauth-reference),
[retrieve an account](https://docs.stripe.com/api/accounts/retrieve).
