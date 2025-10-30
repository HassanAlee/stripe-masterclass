import { v } from "convex/values";
import { query } from "./_generated/server";

export const getCourses = query({
  args: {},
  async handler(ctx) {
    const courses = ctx.db.query("courses").collect();
    return courses;
  },
});

export const getCourseById = query({
  args: { courseId: v.id("courses") },
  async handler(ctx, args) {
    return await ctx.db.get(args.courseId);
  },
});
