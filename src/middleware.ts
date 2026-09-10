import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

/**
 * Seconds of remaining validity below which the token is refreshed.
 *
 * Generous, because a refresh costs a round trip and an expiry mid-render is
 * far more annoying than a slightly early one.
 */
const REFRESH_WINDOW_SECONDS = 120;

/**
 * Reads the expiry out of the session cookie without a network call.
 *
 * The signature is deliberately NOT checked here, and nothing that matters
 * hangs on the answer. This decides two things only: whether to send a
 * signed-out visitor to the login page, and whether the token is old enough to
 * be worth refreshing. What a signed-in person may actually see is decided by
 * the layouts, the server actions and row level security, none of which trust
 * this file, and all of which are talking to a database that verifies the
 * signature on every request. A forged cookie gets past this line and then
 * reads nothing at all.
 *
 * Returns null when there is no readable session cookie.
 */
function readTokenExpiry(request: NextRequest): number | null {
  // @supabase/ssr writes sb-<ref>-auth-token, chunked as .0 .1 … when large.
  const parts = request.cookies
    .getAll()
    .filter((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (parts.length === 0) return null;

  const raw = parts.map((cookie) => cookie.value).join('');
  if (!raw) return null;

  try {
    const json = raw.startsWith('base64-')
      ? Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8')
      : decodeURIComponent(raw);

    const session = JSON.parse(json) as { expires_at?: number };
    return typeof session.expires_at === 'number' ? session.expires_at : null;
  } catch {
    // Unreadable cookie. Treat it as a session that needs checking properly
    // rather than as no session, so a format change cannot lock anyone out.
    return 0;
  }
}

/**
 * Refreshes the Supabase session cookie and keeps signed-out visitors out of
 * the application.
 *
 * This used to call auth.getUser() on every request, which is a round trip to
 * Supabase before a single byte renders, and it ran for prefetches too. With a
 * link for every screen in the sidebar, one page view could pay for it a dozen
 * times over. It now reads the cookie's own expiry locally and only talks to
 * Supabase when the token genuinely needs refreshing.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  const expiresAt = readTokenExpiry(request);
  const hasSession = expiresAt !== null;

  if (!hasSession && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  if (hasSession && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const needsRefresh = hasSession && (expiresAt ?? 0) - nowSeconds < REFRESH_WINDOW_SECONDS;

  if (!needsRefresh) return NextResponse.next({ request });

  // Only here does anything reach the network. getUser() refreshes the token
  // and the cookies it writes are what keeps the session alive.
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
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

/**
 * Every path this matches costs a middleware invocation before anything
 * renders.
 *
 * The exclusions matter for how the application feels. `_next` covers the
 * prefetches Next fires for every sidebar link, and .well-known covers the
 * public key endpoint, which has no session by design.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
