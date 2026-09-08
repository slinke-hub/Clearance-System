'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ShieldCheck, Building2, User } from 'lucide-react';
import type { UserType } from '@/types';

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [userType, setUserType] = useState<UserType>('individual');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            user_type: userType,
          },
        },
      });

      if (error) throw error;

      toast.success('Account created! You can now sign in.');
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-gradient flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-teal/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl" />
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

        <div className="glass-card p-8">
          <h2 className="text-xl font-semibold text-white mb-1">{t('auth', 'registerTitle')}</h2>
          <p className="text-muted text-sm mb-6">{t('auth', 'registerSubtitle')}</p>

          {/* User Type Selector */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              id="type-individual"
              type="button"
              onClick={() => setUserType('individual')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 ${
                userType === 'individual'
                  ? 'border-brand-teal bg-brand-teal/15 text-brand-teal-light'
                  : 'border-surface-border bg-surface-overlay text-muted hover:border-brand-teal/40'
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-sm font-medium">{t('auth', 'individual')}</span>
            </button>
            <button
              id="type-enterprise"
              type="button"
              onClick={() => setUserType('enterprise')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 ${
                userType === 'enterprise'
                  ? 'border-brand-gold bg-brand-gold/15 text-brand-gold'
                  : 'border-surface-border bg-surface-overlay text-muted hover:border-brand-gold/40'
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span className="text-sm font-medium">{t('auth', 'enterprise')}</span>
            </button>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="form-label">{t('auth', 'fullName')}</label>
              <input
                id="register-name"
                type="text"
                className="form-input"
                placeholder="Mohammed Al-Rashidi"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label className="form-label">{t('auth', 'email')}</label>
              <input
                id="register-email"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="form-label">{t('auth', 'password')}</label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Min. 8 characters"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  required
                  autoComplete="new-password"
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

            <div>
              <label className="form-label">Confirm Password</label>
              <input
                id="register-confirm-password"
                type="password"
                className="form-input"
                placeholder="Repeat password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              id="register-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base font-semibold mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('common', 'loading')}</>
              ) : (
                t('auth', 'signUp')
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            {t('auth', 'haveAccount')}{' '}
            <Link href="/login" className="text-brand-teal-light hover:text-brand-gold font-medium transition-colors">
              {t('auth', 'signIn')}
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted/60 mt-6">
          🇸🇦 Free Trial includes 5 invoices/month — no credit card required
        </p>
      </div>
    </div>
  );
}
