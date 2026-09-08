import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  let isAuthenticated = false;

  const adminCookie = request.cookies.get('clearance_admin_session')?.value;
  if (adminCookie) {
    try {
      const parsed = JSON.parse(adminCookie);
      isAuthenticated =
        typeof parsed.email === 'string' &&
        parsed.email.toLowerCase() === 'privatepple@gmail.com';
    } catch {}
  }

  const supabaseConfigured = isSupabaseConfigured();

  // Local client sessions are only valid in development without Supabase.
  if (!isAuthenticated && !supabaseConfigured && process.env.NODE_ENV !== 'production') {
    const clientCookie = request.cookies.get('clearance_client_session')?.value;

    if (clientCookie) {
      try {
        const parsed = JSON.parse(clientCookie);
        isAuthenticated = typeof parsed.email === 'string' && parsed.email.includes('@');
      } catch {}
    }
  }

  if (!isAuthenticated && supabaseConfigured) {
    try {
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
              supabaseResponse = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              );
            },
          },
        }
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();

      isAuthenticated = Boolean(user);
    } catch {
      isAuthenticated = false;
    }
  }

  const { pathname } = request.nextUrl;
  const protectedPrefixes = ['/dashboard', '/upload', '/history', '/profile', '/team', '/admin'];
  const isProtected = protectedPrefixes.some((path) => pathname.startsWith(path));

  if (isProtected && !isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if ((pathname === '/login' || pathname === '/register') && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
