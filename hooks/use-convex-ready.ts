"use client";

import { useConvexAuth } from "convex/react";

/** True when Convex has validated the Clerk JWT (safe to run authenticated queries). */
export function useConvexReady() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return !isLoading && isAuthenticated;
}
