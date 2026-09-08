import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PLAN_CONFIGS } from '@/types';
import { getCurrentUser } from '@/lib/auth/session';
import { DashboardContent } from '@/components/dashboard/DashboardContent';

export const metadata = { title: 'Dashboard — ClearanceIQ' };

async function getDashboardData(userId: string) {
  try {
    const supabase = await createClient();

    const [subResult, runsResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('invoice_runs')
        .select('id, file_name, status, total_items, processed_items, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    return {
      subscription: subResult.data,
      recentRuns: runsResult.data || [],
    };
  } catch {
    return {
      subscription: null,
      recentRuns: [],
    };
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { subscription, recentRuns } = await getDashboardData(user.id);

  const plan = (user.plan || subscription?.plan || 'enterprise') as keyof typeof PLAN_CONFIGS;
  const planConfig = PLAN_CONFIGS[plan] || PLAN_CONFIGS.enterprise;
  return (
    <DashboardContent
      firstName={user.full_name?.split(' ')[0] || ''}
      plan={plan}
      planName={planConfig.name}
      invoicesUsed={subscription?.invoices_used ?? 0}
      monthlyLimit={subscription?.monthly_limit ?? 5}
      recentRuns={recentRuns}
    />
  );
}
