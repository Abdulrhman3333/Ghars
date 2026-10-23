import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password']);

/**
 * Refreshes the Supabase session cookie and enforces auth-based route access.
 * Perf: the remote Auth server is contacted ONLY when the cookie's access token is missing or
 * near expiry — a still-valid session is checked locally from the cookie, so page navigation
 * does not pay a round-trip to the Auth server on every request. Safety is unchanged: every DB
 * query validates the JWT itself, and every page/action still calls auth.getUser() for identity.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const expiresAt = (session?.expires_at ?? 0) * 1000;
  const valid = !!session && expiresAt - Date.now() > 60_000;

  let signedIn = valid;

  if (!valid) {
    // missing, expired, or about to expire: validate on the server (also refreshes the cookies)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith('/auth/');

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const isAuthPage = ['/login', '/register', '/forgot-password'].includes(pathname);
  if (signedIn && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    return NextResponse.redirect(url);
  }

  return response;
}
