import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/verify-email(.*)",
]);

const runClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId, sessionClaims } = await auth();

  if (!userId) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(signIn);
  }

  const emailVerified = sessionClaims?.email_verified as boolean | undefined;
  if (emailVerified === false) {
    return NextResponse.redirect(new URL("/verify-email", req.url));
  }

  return NextResponse.next();
});

function missingClerkEnvResponse() {
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Configuration</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">
<h1>Missing Clerk environment variables</h1>
<p>Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> in Vercel → Project → Settings → Environment Variables (for Production), then redeploy.</p>
</body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    !process.env.CLERK_SECRET_KEY?.trim()
  ) {
    return missingClerkEnvResponse();
  }
  return runClerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
