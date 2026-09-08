import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // 1. Check for local admin session cookie
  const adminCookie = request.cookies.get('clearance_admin_session')?.value;
  let isAuthenticated = false;

  if (adminCookie) {
    try {
      const parsed = JSON.parse(adminCookie);
      if (parsed.email?.toLowerCase() === 'privatepple@gmail.com') {
        isAuthenticated = true;
      }
    } catch {}
  }

  // 2. Fallback check for Supabase session
  if (!isAuthenticated && process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http')) {
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

      if (user) {
        isAuthenticated = true;
      }
    } catch {
      // Supabase not reachable / in mock mode
    }
  }

  const { pathname } = request.nextUrl;

  // Protected routes — require authentication
  const protectedPrefixes = ['/dashboard', '/upload', '/history', '/profile', '/team', '/admin'];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (isProtected && !isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If logged in and visiting auth pages, redirect to dashboard
  const authPaths = ['/login', '/register'];
  if (authPaths.includes(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
