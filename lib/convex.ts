import { ConvexHttpClient } from "convex/browser";

const convexUrl =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_CONVEX_URL
    : undefined;

export const convexClient =
  typeof window !== "undefined" && convexUrl
    ? new ConvexHttpClient(convexUrl)
    : null;
