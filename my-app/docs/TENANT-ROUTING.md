# Host routing (Stage 5)

Zenvo separates the authenticated application from public client sites. Routing
uses Next.js 16's `src/proxy.ts` convention and keeps Clerk on application hosts.
See the [Next.js Proxy reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

## Configuration

`ZENVO_ROOT_DOMAIN` is a server-only hostname, without a scheme, port, or path.
It defaults to `localhost`. Set it to your actual root domain before deployment.
The root serves the landing page, authentication, agency routes, and APIs.
Loopback addresses are also accepted only when the configured root is localhost.

| Request host | Result with root `localhost` |
| --- | --- |
| `localhost:3000` | Main application |
| `acme.localhost:3000` | Public-site lookup for `acme` |
| `acme.localhost:3000/offers/summer` | Same site, nested public path |
| `api.localhost`, `app.localhost`, `www.localhost` | Reserved; 404 |
| `a.b.localhost`, unrelated domains | Unknown; 404 |

DNS is not created by this code. Local browsers commonly resolve `.localhost`
to loopback; the HTTP test suite instead sends a Host header directly to the
local server, so it needs no hosts-file changes. Production needs wildcard DNS,
TLS, and a deployment ingress configured to preserve Host and reject hosts it
does not serve. Forwarded-host headers do not select tenants.

## Request flow

1. Validate and normalize Host. Only the configured root or a single valid,
   non-reserved subdomain is accepted. Unknown/custom domains fail closed.
2. Reject direct requests to `/tenant-site` and ambiguous encoded paths.
3. Allow explicitly shared framework assets without invoking Clerk.
4. On tenant hosts, reject application/auth/API paths and mutation methods.
   Rewrite GET/HEAD to `/tenant-site/[subdomain]/[[...path]]`, preserving the
   query string and leaving the browser's public URL unchanged.
5. On the main host, pass requests through Clerk. Agency/sub-account document
   requests require sign-in. Server resources must still enforce their own
   authorization; proxy routing is not a tenant permission check.

The destination handler checks Host against its route parameter again. Today
it returns an uncached 404 (`Site not published`) for every valid candidate.
There are no tenant records or published pages yet. Stage 6 introduces the
database schema; account creation and publishing stages supply those records.
Only a persisted, enabled tenant with a published page may eventually render.
Custom domains require a stored, verified ownership mapping in the release
stage. Neither a hostname nor a caller-supplied tenant header grants access.

## Verification

From `my-app`, run `bun run test:routing` for the pure hostname/path policy.
It uses Node 24's TypeScript stripping (the local test runtime); the application
itself still compiles TypeScript through Next.js.

For integration checks, build and start the app with the default root domain:

```powershell
bun run build
bun run start --hostname localhost --port 3108
```

In another terminal:

```powershell
$env:AUTH_TEST_BASE_URL = 'http://localhost:3108'
bun run test:routing:http
bun run test:auth
```

The HTTP routing tests verify real rewrites, unknown-host rejection, isolation
from workspace/API/auth routes, direct internal-route rejection, and forged
forwarded-host/tenant headers. Authentication regression tests verify that the
main site's public entry points and signed-out protections continue to work.
