import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { isAppOnlyPath, isInternalPath, policyPath, resolveHost, rootDomain, sharedAsset, sitePrefix } from "@/lib/tenant-routing";

// Clerk verifies the session here. Each protected resource also checks auth
// itself; URL matching must never be the only authorization boundary.
const applicationAuth = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const isWorkspace = /^\/(agency|subaccount)(\/|$)/.test(pathname);
  // An early redirect improves document navigation. AgencyPage still protects
  // itself, including RSC requests and direct calls that do not take this path.
  if (isWorkspace && request.headers.get("accept")?.includes("text/html")) {
    const session = await auth();
    if (!session.isAuthenticated) {
      return session.redirectToSignIn({ returnBackUrl: request.url });
    }
  }
}, { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

function unavailable() {
  return new NextResponse('Site not found', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Trust Host only. Deployment ingress must preserve it and reject unconfigured
  // hosts. Never use client-supplied forwarded-host or tenant-ID headers to route.
  const host = request.headers.get('host');
  const resolution = resolveHost(host, rootDomain());
  const path = policyPath(request.nextUrl.pathname);
  if (resolution.kind === 'unknown' || !path || isInternalPath(path)) return unavailable();
  if (sharedAsset(path)) return NextResponse.next();

  if (resolution.kind === 'tenant') {
    if (isAppOnlyPath(path) || path.startsWith('/_next/') || !['GET', 'HEAD'].includes(request.method)) return unavailable();
    const destination = request.nextUrl.clone();
    destination.pathname = `${sitePrefix}/${resolution.subdomain}${request.nextUrl.pathname}`;
    return NextResponse.rewrite(destination);
  }

  const headers = new Headers(request.headers);
  headers.delete('forwarded');
  headers.set('x-forwarded-host', host!);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.slice(0, -1));
  headers.delete('x-tenant-id');
  return applicationAuth(new NextRequest(request, { headers }), event);
}

// Cover extension-bearing pages too; only explicit shared assets bypass Clerk.
export const config = { matcher: '/:path*' };
