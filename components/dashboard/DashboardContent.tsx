'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { arSA, enUS } from 'date-fns/locale';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Upload,
  Zap,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface RecentRun {
  id: string;
  file_name: string;
  status: string;
  total_items: number | null;
  processed_items: number | null;
  created_at: string;
}

interface DashboardContentProps {
  firstName: string;
  plan: 'free' | 'pro' | 'enterprise';
  planName: string;
  invoicesUsed: number;
  monthlyLimit: number;
  recentRuns: RecentRun[];
}

export function DashboardContent({
  firstName,
  plan,
  planName,
  invoicesUsed,
  monthlyLimit,
  recentRuns,
}: DashboardContentProps) {
  const { t, locale, isRTL } = useI18n();
  const usagePercent = plan === 'enterprise' ? 0 : Math.min(100, (invoicesUsed / monthlyLimit) * 100);
  const totalProcessed = recentRuns.reduce((total, run) => total + (run.processed_items || 0), 0);
  const completedRuns = recentRuns.filter((run) => run.status === 'completed').length;
  const localizedPlanName = t('plans', plan) || planName;
  const statusColors: Record<string, string> = {
    completed: 'badge-success',
    processing: 'badge-info',
    pending: 'badge-warning',
    failed: 'badge-error',
  };
  const statusLabels: Record<string, string> = {
    completed: t('dashboard', 'completed'),
    processing: t('dashboard', 'processing'),
    pending: t('dashboard', 'pending'),
    failed: t('dashboard', 'failed'),
  };
  const arrowClass = isRTL ? 'rotate-180' : '';

  const stats = [
    { label: t('dashboard', 'invoicesThisMonth'), value: invoicesUsed, icon: FileText, color: 'text-brand-teal-light', bg: 'bg-brand-teal/10' },
    { label: t('dashboard', 'itemsClassified'), value: totalProcessed, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: t('dashboard', 'recentRunsCount'), value: recentRuns.length, icon: TrendingUp, color: 'text-info', bg: 'bg-info/10' },
    { label: t('dashboard', 'completed'), value: completedRuns, icon: Clock, color: 'text-brand-gold', bg: 'bg-brand-gold/10' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">
          {t('dashboard', 'welcomeUser', { name: firstName || t('profile', 'admin') })} 👋
        </h1>
        <p className="text-muted text-sm mt-1">{t('dashboard', 'overview')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
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
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">{t('dashboard', 'currentPlan')}</p>
              <p className="text-lg font-bold text-white mt-0.5">{localizedPlanName}</p>
            </div>
            <span className={`badge ${plan === 'enterprise' ? 'bg-brand-gold/15 text-brand-gold' : plan === 'pro' ? 'badge-info' : 'badge-muted'} text-xs px-3 py-1`}>
              {localizedPlanName}
            </span>
          </div>

          {plan !== 'enterprise' ? (
            <>
              <div className="flex justify-between text-xs text-muted mb-2">
                <span>{invoicesUsed} {t('dashboard', 'used')}</span>
                <span>{monthlyLimit} {t('dashboard', 'limit')}</span>
              </div>
              <div className="progress-bar mb-4">
                <div className="progress-fill" style={{ width: `${usagePercent}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-brand-gold mb-4">∞ {t('dashboard', 'unlimitedProcessing')}</p>
          )}

          {plan !== 'enterprise' && (
            <Link href="/profile" className="btn-gold w-full text-xs py-2 inline-flex items-center justify-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> {t('dashboard', 'upgradePlan')}
            </Link>
          )}
        </div>

        <div className="glass-card p-5 col-span-1 lg:col-span-2">
          <p className="text-xs text-muted uppercase tracking-wider mb-4">{t('dashboard', 'quickActions')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/upload" className="flex items-center gap-3 p-4 rounded-xl bg-brand-teal/10 border border-brand-teal/20 hover:border-brand-teal/40 hover:bg-brand-teal/15 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-brand-teal/20 flex items-center justify-center group-hover:shadow-glow transition-shadow">
                <Upload className="w-5 h-5 text-brand-teal-light" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t('nav', 'upload')}</p>
                <p className="text-xs text-muted truncate">{t('dashboard', 'newClassificationRun')}</p>
              </div>
              <ArrowRight className={`w-4 h-4 text-muted group-hover:text-brand-teal-light ms-auto transition-colors ${arrowClass}`} />
            </Link>

            <Link href="/history" className="flex items-center gap-3 p-4 rounded-xl bg-surface-overlay border border-surface-border hover:border-brand-teal/30 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-surface-raised flex items-center justify-center">
                <FileText className="w-5 h-5 text-muted group-hover:text-white transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t('dashboard', 'viewHistory')}</p>
                <p className="text-xs text-muted truncate">{t('dashboard', 'pastClassificationRuns')}</p>
              </div>
              <ArrowRight className={`w-4 h-4 text-muted group-hover:text-brand-teal-light ms-auto transition-colors ${arrowClass}`} />
            </Link>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-white">{t('dashboard', 'recentRuns')}</h2>
          <Link href="/history" className="text-xs text-brand-teal-light hover:text-brand-gold transition-colors flex items-center gap-1">
            {t('dashboard', 'viewAll')} <ArrowRight className={`w-3 h-3 ${arrowClass}`} />
          </Link>
        </div>

        {recentRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-overlay border border-surface-border flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-muted" />
            </div>
            <p className="text-sm font-medium text-white mb-1">{t('dashboard', 'noRuns')}</p>
            <p className="text-xs text-muted mb-4">{t('dashboard', 'noRunsHint')}</p>
            <Link href="/upload" className="btn-primary text-xs px-4 py-2">
              <Upload className="w-3.5 h-3.5" /> {t('nav', 'upload')}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('dashboard', 'fileName')}</th>
                  <th>{t('dashboard', 'items')}</th>
                  <th>{t('dashboard', 'status')}</th>
                  <th>{t('dashboard', 'date')}</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="font-medium text-white max-w-xs truncate">{run.file_name}</td>
                    <td className="text-muted">{run.processed_items}/{run.total_items}</td>
                    <td><span className={`badge ${statusColors[run.status] || 'badge-muted'}`}>{statusLabels[run.status] || run.status}</span></td>
                    <td className="text-muted text-xs" dir="auto">
                      {format(new Date(run.created_at), 'PP', { locale: locale === 'ar' ? arSA : enUS })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
