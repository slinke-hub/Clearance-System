'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      toast.success(data.user?.role === 'admin' ? 'Welcome, Administrator!' : 'Welcome back!');
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-gradient flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-teal/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-slide-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-teal/20 border border-brand-teal/30 mb-4 shadow-glow">
            <ShieldCheck className="w-8 h-8 text-brand-teal-light" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">{t('common', 'appName')}</h1>
          <p className="text-muted text-sm mt-1">{t('common', 'tagline')}</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <h2 className="text-xl font-semibold text-white mb-1">{t('auth', 'loginTitle')}</h2>
          <p className="text-muted text-sm mb-6">{t('auth', 'loginSubtitle')}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="form-label">{t('auth', 'email')}</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="form-label">{t('auth', 'password')}</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button type="button" className="text-xs text-brand-teal-light hover:text-brand-gold transition-colors">
                {t('auth', 'forgotPassword')}
              </button>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base font-semibold mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('common', 'loading')}</>
              ) : (
                t('auth', 'signIn')
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            {t('auth', 'noAccount')}{' '}
            <Link href="/register" className="text-brand-teal-light hover:text-brand-gold font-medium transition-colors">
              {t('auth', 'signUp')}
            </Link>
          </p>
        </div>

        {/* KSA Badge */}
        <p className="text-center text-xs text-muted/60 mt-6">
          🇸🇦 Compliant with ZATCA regulations & KSA Customs tariff schedule
        </p>
      </div>
    </div>
  );
}
