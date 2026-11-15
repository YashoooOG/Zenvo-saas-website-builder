import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId, isAuthenticated } = await auth();
  const headers = { "Cache-Control": "private, no-store" };
  if (!isAuthenticated || !userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  // No session tokens, private user profile, or tenant membership claims.
  return Response.json({ userId }, { headers });
}
