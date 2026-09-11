import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_CREDENTIALS } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Local demo sign-in is only available when there is no database connection.
    if (
      !isSupabaseConfigured() &&
      normalizedEmail === ADMIN_CREDENTIALS.email.toLowerCase() &&
      password === ADMIN_CREDENTIALS.password
    ) {
      const response = NextResponse.json({
        success: true,
        user: {
          id: ADMIN_CREDENTIALS.id,
          email: ADMIN_CREDENTIALS.email,
          role: ADMIN_CREDENTIALS.role,
          full_name: ADMIN_CREDENTIALS.full_name,
          user_type: ADMIN_CREDENTIALS.user_type,
          plan: ADMIN_CREDENTIALS.plan,
        },
      });

      // Set session cookie
      response.cookies.set('clearance_admin_session', JSON.stringify({
        id: ADMIN_CREDENTIALS.id,
        email: ADMIN_CREDENTIALS.email,
        role: ADMIN_CREDENTIALS.role,
        full_name: ADMIN_CREDENTIALS.full_name,
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return response;
    }

    // 2. Otherwise authenticate via Supabase
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }

      const response = NextResponse.json({ success: true, user: data.user });
      response.cookies.delete('clearance_admin_session');
      response.cookies.delete('clearance_client_session');
      return response;
    } catch {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Authentication failed' },
      { status: 500 }
    );
  }
}
