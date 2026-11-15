# Clerk authentication

## Configure the development instance

1. Open https://dashboard.clerk.com and create or select the Zenvo application.
2. Use its **Development** instance. Enable the sign-in methods you want to test
   (email/password is sufficient; Google is optional).
3. Copy its publishable key and secret key into the existing `my-app/.env.local`:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-development-publishable-key
CLERK_SECRET_KEY=your-development-secret-key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/agency
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/agency
```

These example key strings are placeholders, not working credentials. Preserve
the database settings already in the file. Never commit or share the secret key.
Both keys must come from the same instance. If configuring application paths in
the Clerk dashboard, use `/sign-in`, `/sign-up`, and `/agency` as the home path.
Use the current fallback redirect variables above, not the tutorial's deprecated
`NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `AFTER_SIGN_UP_URL` variables.

4. Run `bun run auth:check`. This checks key format and makes a server-side request
   to Clerk; it never prints keys or API response bodies.
5. Restart `bun run dev` after changing keys. Public Next.js variables are included
   at build time, so rebuild before testing a production build with changed keys.

## Routes and security

| Route | Behavior |
| --- | --- |
| `/` | Public entry page with account links; full marketing page is Stage 4 |
| `/sign-in/[[...sign-in]]` | Clerk sign-in, password recovery, and verification steps |
| `/sign-up/[[...sign-up]]` | Clerk registration and verification steps |
| `/agency` | Server-protected account landing page; agency creation is Stage 7 |
| `/api/session` | Returns only the authenticated user ID; otherwise HTTP 401 |

`src/proxy.ts` initializes Clerk's verified session and provides an early sign-in
redirect for signed-out workspace document requests. Next.js 16 renamed
`middleware.ts` to `proxy.ts`. The proxy does not replace resource-level checks:
the agency page calls `auth.protect()`, and the API checks `auth()` before returning
any user information. Every future protected page, API, and Server Action needs
its own authentication and tenant-authorization checks.

Clerk manages passwords, session verification, account recovery, and sign-out.
Zenvo does not store passwords or manually decode JWT claims as proof of identity.
The session endpoint uses `Cache-Control: private, no-store`. No Clerk secret key
is passed to a client component. Login is not proof of agency membership: role
checks and tenant isolation arrive with the database model and membership stages.

Clerk's catch-all forms and server session reads use Suspense/loading boundaries
because this project enables Next.js Cache Components. Only public fallback UI
can render before the page's authentication check finishes.

## Automated checks

```powershell
bun run auth:check
bun run lint
bun run typecheck
bun run build
```

With the application running on localhost:3000, run:

```powershell
bun run test:auth
```

For another local port, set `AUTH_TEST_BASE_URL` to the matching origin first.
These HTTP tests cover public pages, signed-out redirects, unauthorized API
responses, forged bearer tokens, and spoofed Clerk headers. They use no real user
credentials and do not replace the signed-in browser checks below.

The test helper follows Clerk's development-browser handshake and preserves the
anonymous cookies it returns. Use one consistent origin (for example
`http://localhost:3108`); mixing `127.0.0.1` with `localhost` caused a proxy failure
in the local production preview. For a custom-port preview, use
`bun run start --hostname localhost --port 3108` after building.

## Disposable browser test account

For development-only verification, run `node scripts/auth-test-user.mjs create`.
It creates a recognizable passwordless test account with a `+clerk_test` email
address and saves only its ID/email in ignored `.auth-test-user.json`. Sign in
through the ordinary UI using that email and Clerk's documented test code
`424242`. Clerk development Test mode is enabled by default and does not deliver
email to these test addresses. Do not disable Test mode for this workflow.

After signing out, run `node scripts/auth-test-user.mjs cleanup`. It verifies the
development instance, the exact saved email, and the user's private test marker
before deleting that one user. It never bulk-deletes accounts. This workflow
tests email-code sessions; it does not exercise password creation or social OAuth.

## Stage 3 verification record

On November 15, 2026, Clerk API validation, production build, lint, TypeScript,
and all five HTTP security checks passed. A disposable test account completed
browser email-code sign-in, workspace access, refresh/session persistence, API
access, and sign-out. The API and workspace rejected the browser after sign-out.
The test user was removed. Mobile/desktop form layout and keyboard navigation
were checked. Password registration/recovery and social OAuth remain for later
acceptance testing; the project owner requested autonomous checks and deferred
their personal testing until the complete project.

## Browser acceptance checks

1. Open `/agency` while signed out. Expect `/sign-in` with a return URL.
2. Open `/sign-up`, register a development account, and complete verification.
3. Expect `/agency` and the account menu. Refresh to verify the session persists.
4. Visit `/api/session` in the same browser; expect your user ID, never a token.
5. Sign out using the workspace button. Expect the public homepage.
6. Revisit `/agency` and `/api/session`; expect sign-in and HTTP 401 respectively.
7. Sign in with the account again. Check password recovery if enabled.
8. Check both account forms at desktop and narrow mobile widths and navigate
   inputs, submit, and account links using the keyboard.

If Clerk rejects the key pair or fails to load, fix the provider configuration;
do not add a bypass or pretend session. This stage is ready to commit only after
the required live tests pass, or the project owner explicitly accepts a documented
verification gap.

## References

- [Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [Protect each server resource](https://clerk.com/docs/nextjs/guides/secure/protect-content)
- [Clerk with Cache Components](https://clerk.com/docs/guides/development/rendering-modes)
- [Current redirect configuration](https://clerk.com/docs/guides/development/customize-redirect-urls)
- [Reserved development email addresses](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)
