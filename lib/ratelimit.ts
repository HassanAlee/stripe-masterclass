import { Ratelimit } from "@upstash/ratelimit";
import redis from "./redis";

const rateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "60 s"),
});
export default rateLimit;
