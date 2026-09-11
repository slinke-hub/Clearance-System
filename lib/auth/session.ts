import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { ClearanceBusinessType } from '@/types';

export interface AppUser {
  id: string;
  email: string;
  role: 'admin' | 'superadmin' | 'user';
  full_name: string;
  user_type: 'individual' | 'enterprise';
  business_type?: ClearanceBusinessType;
  plan: 'free' | 'pro' | 'enterprise';
}

export const ADMIN_CREDENTIALS = {
  email: 'privatepple@gmail.com',
  password: '0912577754',
  role: 'admin' as const,
  full_name: 'Admin (ClearanceIQ)',
  plan: 'enterprise' as const,
  user_type: 'enterprise' as const,
  id: '00000000-0000-0000-0000-000000000001',
};

/**
 * Get current authenticated user from either the admin session cookie or Supabase auth
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('clearance_admin_session')?.value;

  // Local demo identities must never override the authenticated database owner.
  if (adminCookie && !isSupabaseConfigured()) {
    try {
      const parsed = JSON.parse(adminCookie);
      if (parsed.email?.toLowerCase() === ADMIN_CREDENTIALS.email.toLowerCase()) {
        return {
          id: parsed.id || ADMIN_CREDENTIALS.id,
          email: ADMIN_CREDENTIALS.email,
          role: 'admin',
          full_name: parsed.full_name || ADMIN_CREDENTIALS.full_name,
          user_type: 'enterprise',
          plan: 'enterprise',
        };
      }
    } catch {}
  }

  const clientCookie = cookieStore.get('clearance_client_session')?.value;
  if (clientCookie && !isSupabaseConfigured()) {
    try {
      const parsed = JSON.parse(clientCookie);
      if (typeof parsed.email === 'string' && parsed.email.includes('@')) {
        return {
          id: parsed.id || '00000000-0000-0000-0000-000000000002',
          email: parsed.email,
          role: 'user',
          full_name: parsed.full_name || parsed.fullName || parsed.email,
          user_type: parsed.user_type === 'individual' ? 'individual' : 'enterprise',
          business_type: parsed.business_type,
          plan: ['free', 'pro', 'enterprise'].includes(parsed.plan) ? parsed.plan : 'free',
        };
      }
    } catch {}
  }

  // Try Supabase auth
  if (isSupabaseConfigured()) try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, user_type')
        .eq('id', user.id)
        .single();

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .single();

      return {
        id: user.id,
        email: user.email || '',
        role: (profile?.role as 'admin' | 'superadmin' | 'user') || 'user',
        full_name: profile?.full_name || user.email || '',
        user_type: (profile?.user_type as 'individual' | 'enterprise') || 'individual',
        plan: (sub?.plan as 'free' | 'pro' | 'enterprise') || 'free',
      };
    }
  } catch {}

  return null;
}
