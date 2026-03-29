import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Deletes the Clerk user after Convex data has been wiped (order: Convex mutation first).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
