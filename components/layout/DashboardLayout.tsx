'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Upload,
  History,
  User,
  Users,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Globe,
} from 'lucide-react';

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { href: '/upload', icon: Upload, labelKey: 'upload' },
  { href: '/history', icon: History, labelKey: 'history' },
  { href: '/profile', icon: User, labelKey: 'profile' },
  { href: '/team', icon: Users, labelKey: 'team' },
  { href: '/admin', icon: ShieldCheck, labelKey: 'admin', adminOnly: true },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole?: string;
  userName?: string;
  plan?: string;
}

export function DashboardLayout({ children, userRole, userName, plan }: DashboardLayoutProps) {
  const { t, locale, setLocale, isRTL } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
    } catch {}
    toast.success('Signed out successfully');
    router.push('/login');
    router.refresh();
  };

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return userRole === 'admin' || userRole === 'superadmin';
    return true;
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-teal/20 border border-brand-teal/30 flex items-center justify-center shadow-glow">
            <ShieldCheck className="w-5 h-5 text-brand-teal-light" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{t('common', 'appName')}</p>
            <p className="text-xs text-muted">KSA Customs</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{t('nav', item.labelKey)}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5" />}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-surface-border space-y-1">
        {/* Plan badge */}
        {plan && (
          <div className="px-4 py-2 rounded-xl bg-surface-overlay flex items-center justify-between mb-1">
            <span className="text-xs text-muted">Plan</span>
            <span className={`text-xs font-semibold capitalize ${
              plan === 'enterprise' ? 'text-brand-gold' :
              plan === 'pro' ? 'text-info' : 'text-muted'
            }`}>
              {plan === 'free' ? 'Free Trial' : plan.charAt(0).toUpperCase() + plan.slice(1)}
            </span>
          </div>
        )}

        {/* Language toggle */}
        <button
          id="lang-toggle"
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          className="nav-link w-full"
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span className="flex-1">{locale === 'en' ? 'العربية' : 'English'}</span>
        </button>

        {/* User info */}
        <div className="px-4 py-2.5 rounded-xl bg-surface-overlay">
          <p className="text-xs text-muted truncate">Signed in as</p>
          <p className="text-sm font-medium text-white truncate">{userName || 'User'}</p>
        </div>

        {/* Logout */}
        <button
          id="logout-btn"
          onClick={handleLogout}
          className="nav-link w-full text-error/80 hover:text-error hover:bg-error/10"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>{t('nav', 'logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen overflow-hidden bg-[#0D1117] ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface/80 backdrop-blur-glass">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-60 bg-surface border-r border-surface-border flex flex-col animate-slide-in-right">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface/80">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted hover:text-white transition-colors p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold gradient-text">{t('common', 'appName')}</span>
          <div className="w-7" />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
