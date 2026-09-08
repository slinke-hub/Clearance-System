import type { SubscriptionPlan, Subscription } from '@/types';

export interface PlanLimits {
  canProcess: boolean;
  remaining: number;
  used: number;
  limit: number;
  isUnlimited: boolean;
}

export function checkPlanLimits(subscription: Subscription | null): PlanLimits {
  if (!subscription || subscription.status !== 'active') {
    return { canProcess: false, remaining: 0, used: 0, limit: 0, isUnlimited: false };
  }

  // Enterprise: unlimited
  if (subscription.plan === 'enterprise') {
    return {
      canProcess: true,
      remaining: -1,
      used: subscription.invoices_used,
      limit: -1,
      isUnlimited: true,
    };
  }

  const remaining = subscription.monthly_limit - subscription.invoices_used;
  return {
    canProcess: remaining > 0,
    remaining: Math.max(0, remaining),
    used: subscription.invoices_used,
    limit: subscription.monthly_limit,
    isUnlimited: false,
  };
}

export function getPlanDisplayName(plan: SubscriptionPlan): string {
  const names: Record<SubscriptionPlan, string> = {
    free: 'Free Trial',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };
  return names[plan];
}

export function getPlanColor(plan: SubscriptionPlan): string {
  const colors: Record<SubscriptionPlan, string> = {
    free: 'bg-slate-500',
    pro: 'bg-blue-600',
    enterprise: 'bg-amber-500',
  };
  return colors[plan];
}

export function shouldResetUsage(subscription: Subscription): boolean {
  const now = new Date();
  const periodEnd = new Date(subscription.period_end);
  return now > periodEnd;
}
