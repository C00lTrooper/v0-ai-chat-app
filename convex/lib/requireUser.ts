import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function requireUserDoc(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }

  const tokenIdentifier = identity.tokenIdentifier;

  let user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();

  if (!user) {
    if (!("insert" in ctx.db)) {
      throw new Error("Unauthenticated");
    }
    const id = await (ctx as MutationCtx).db.insert("users", {
      email: identity.email ?? "",
      tokenIdentifier,
      createdAt: Date.now(),
    });
    user = await ctx.db.get(id);
    if (!user) {
      throw new Error("Failed to create user");
    }
  }

  return user;
}
