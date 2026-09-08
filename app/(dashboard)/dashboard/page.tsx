import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PLAN_CONFIGS } from '@/types';
import {
  FileText,
  TrendingUp,
  CheckCircle2,
  Clock,
  Upload,
  ArrowRight,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

import { getCurrentUser } from '@/lib/auth/session';

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
  const usagePercent =
    plan === 'enterprise'
      ? 0
      : Math.min(100, ((subscription?.invoices_used ?? 0) / (subscription?.monthly_limit ?? 5)) * 100);

  const statusColors: Record<string, string> = {
    completed: 'badge-success',
    processing: 'badge-info',
    pending: 'badge-warning',
    failed: 'badge-error',
  };

  const totalProcessed = recentRuns.reduce((acc, r) => acc + (r.processed_items || 0), 0);
  const completedRuns = recentRuns.filter((r) => r.status === 'completed').length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome back,{' '}
          <span className="gradient-text">{user.full_name?.split(' ')[0] || 'Admin'}</span> 👋
        </h1>
        <p className="text-muted text-sm mt-1">
          Here&apos;s an overview of your KSA customs compliance activity.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Invoices This Month',
            value: subscription?.invoices_used ?? 0,
            icon: FileText,
            color: 'text-brand-teal-light',
            bg: 'bg-brand-teal/10',
          },
          {
            label: 'Items Classified',
            value: totalProcessed,
            icon: CheckCircle2,
            color: 'text-success',
            bg: 'bg-success/10',
          },
          {
            label: 'Recent Runs',
            value: recentRuns.length,
            icon: TrendingUp,
            color: 'text-info',
            bg: 'bg-info/10',
          },
          {
            label: 'Completed',
            value: completedRuns,
            icon: Clock,
            color: 'text-brand-gold',
            bg: 'bg-brand-gold/10',
          },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-muted mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plan Usage */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">Current Plan</p>
              <p className="text-lg font-bold text-white mt-0.5">{planConfig.name}</p>
            </div>
            <span className={`badge ${
              plan === 'enterprise' ? 'bg-brand-gold/15 text-brand-gold' :
              plan === 'pro' ? 'badge-info' : 'badge-muted'
            } text-xs px-3 py-1`}>
              {planConfig.name}
            </span>
          </div>

          {plan !== 'enterprise' ? (
            <>
              <div className="flex justify-between text-xs text-muted mb-2">
                <span>{subscription?.invoices_used ?? 0} used</span>
                <span>{subscription?.monthly_limit ?? 5} limit</span>
              </div>
              <div className="progress-bar mb-4">
                <div
                  className="progress-fill"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-brand-gold mb-4">∞ Unlimited processing</p>
          )}

          {plan !== 'enterprise' && (
            <Link
              href="/profile"
              className="btn-gold w-full text-xs py-2 inline-flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> Upgrade Plan
            </Link>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-5 col-span-1 lg:col-span-2">
          <p className="text-xs text-muted uppercase tracking-wider mb-4">Quick Actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/upload"
              className="flex items-center gap-3 p-4 rounded-xl bg-brand-teal/10 border border-brand-teal/20 hover:border-brand-teal/40 hover:bg-brand-teal/15 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-teal/20 flex items-center justify-center group-hover:shadow-glow transition-shadow">
                <Upload className="w-5 h-5 text-brand-teal-light" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Upload Invoice</p>
                <p className="text-xs text-muted truncate">New classification run</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted group-hover:text-brand-teal-light ml-auto transition-colors" />
            </Link>

            <Link
              href="/history"
              className="flex items-center gap-3 p-4 rounded-xl bg-surface-overlay border border-surface-border hover:border-brand-teal/30 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-surface-raised flex items-center justify-center">
                <FileText className="w-5 h-5 text-muted group-hover:text-white transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">View History</p>
                <p className="text-xs text-muted truncate">Past classification runs</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted group-hover:text-brand-teal-light ml-auto transition-colors" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-white">Recent Invoice Runs</h2>
          <Link href="/history" className="text-xs text-brand-teal-light hover:text-brand-gold transition-colors flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-overlay border border-surface-border flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-muted" />
            </div>
            <p className="text-sm font-medium text-white mb-1">No invoice runs yet</p>
            <p className="text-xs text-muted mb-4">Upload your first commercial invoice to get started</p>
            <Link href="/upload" className="btn-primary text-xs px-4 py-2">
              <Upload className="w-3.5 h-3.5" /> Upload Invoice
            </Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Items</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="font-medium text-white max-w-xs truncate">{run.file_name}</td>
                  <td className="text-muted">{run.processed_items}/{run.total_items}</td>
                  <td>
                    <span className={`badge ${statusColors[run.status] || 'badge-muted'} capitalize`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="text-muted text-xs">
                    {format(new Date(run.created_at), 'MMM d, yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
