import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const response = NextResponse.json({ success: true });

  // Clear admin session cookie
  response.cookies.delete('clearance_admin_session');

  // Sign out from Supabase if connected
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {}

  return response;
}
