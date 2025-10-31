import { v } from "convex/values";
import { mutation } from "./_generated/server";
export const createUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    clerkId: v.string(),
    stripeCustomerId: v.string(),
  },
  async handler(ctx, args) {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (existingUser) {
      return existingUser._id;
    }
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      clerkId: args.clerkId,
      stripeCustomerId: args.stripeCustomerId,
    });
    return userId;
  },
});
