import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk verifies the session here. Each protected resource also checks auth
// itself; URL matching must never be the only authorization boundary.
export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const isWorkspace = pathname === "/agency" || pathname.startsWith("/agency/");
  // An early redirect improves document navigation. AgencyPage still protects
  // itself, including RSC requests and direct calls that do not take this path.
  if (isWorkspace && request.headers.get("accept")?.includes("text/html")) {
    const session = await auth();
    if (!session.isAuthenticated) {
      return session.redirectToSignIn({ returnBackUrl: request.url });
    }
  }
}, { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
