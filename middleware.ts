import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // API routes authenticate themselves (they call getUser and return 401), so
  // the middleware doesn't need a second Supabase round-trip for them. This
  // removes a network hop from EVERY /api/* request — the main load-time cost.
  if (path.startsWith("/api/")) return NextResponse.next();

  // The login page is public. So are the auth callback/signout routes — the
  // callback must run its code/token exchange BEFORE any session cookie exists,
  // so it can't be gated behind the "signed in?" check below.
  if (path.startsWith("/login") || path.startsWith("/auth/")) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() validates the JWT locally (no network round-trip in the common
  // case), unlike getUser() which always calls the Supabase auth server.
  const { data } = await supabase.auth.getClaims();

  // Not signed in and hitting a protected page -> go to login.
  if (!data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Only guard page navigations. Skip static assets, API routes (self-authed),
  // and the manifest/icons/service worker.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js).*)",
  ],
};
