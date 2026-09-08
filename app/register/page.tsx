'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { toast } from 'sonner';
import {
  Building2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  ShieldCheck,
  Ship,
  Truck,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { ClearanceBusinessType } from '@/types';

interface RegistrationFormData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  companyNameAr: string;
  crNumber: string;
  vatNumber: string;
  brokerLicenseNo: string;
  fasahId: string;
  primaryPort: string;
  industrySector: string;
  transportLicenseNo: string;
  monthlyVolume: string;
}

const initialFormData: RegistrationFormData = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  companyName: '',
  companyNameAr: '',
  crNumber: '',
  vatNumber: '',
  brokerLicenseNo: '',
  fasahId: '',
  primaryPort: '',
  industrySector: '',
  transportLicenseNo: '',
  monthlyVolume: '',
};

const businessOptions: Array<{
  value: ClearanceBusinessType;
  labelKey: string;
  icon: LucideIcon;
}> = [
  { value: 'customs_broker', labelKey: 'customsBroker', icon: ShieldCheck },
  { value: 'importer_exporter', labelKey: 'importerExporter', icon: Ship },
  { value: 'freight_forwarder', labelKey: 'freightForwarder', icon: Truck },
  { value: 'individual', labelKey: 'individual', icon: User },
];

interface RegistrationFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: keyof RegistrationFormData;
  label: string;
  optionalLabel?: string;
}

function RegistrationField({
  id,
  label,
  optionalLabel,
  required,
  ...inputProps
}: RegistrationFieldProps) {
  return (
    <div>
      <label className="form-label flex items-center justify-between gap-3" htmlFor={id}>
        <span>{label}</span>
        {!required && optionalLabel ? (
          <span className="text-[10px] uppercase tracking-wide text-muted/60">{optionalLabel}</span>
        ) : null}
      </label>
      <input id={id} className="form-input" required={required} {...inputProps} />
    </div>
  );
}

export default function RegisterPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [formData, setFormData] = useState<RegistrationFormData>(initialFormData);
  const [businessType, setBusinessType] = useState<ClearanceBusinessType>('customs_broker');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isBusinessAccount = businessType !== 'individual';

  const handleChange = (field: keyof RegistrationFormData, value: string) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('auth', 'passwordMismatch'));
      return;
    }

    if (formData.password.length < 8) {
      toast.error(t('auth', 'passwordLength'));
      return;
    }

    setLoading(true);

    try {
      const registrationData = { ...formData, confirmPassword: undefined };
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...registrationData, businessType }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(t('auth', 'registrationFailed'));

      toast.success(t('auth', 'registrationSuccess'));
      router.replace(data.requiresEmailConfirmation ? '/login' : '/dashboard');
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('auth', 'registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-hero-gradient flex items-center justify-center p-4 py-10">
      <button
        type="button"
        onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
        className="absolute top-4 end-4 z-20 btn-ghost px-3 py-2 text-xs"
        aria-label={t('common', 'switchLanguage')}
      >
        <Globe className="w-4 h-4" />
        {locale === 'en' ? t('common', 'arabic') : t('common', 'english')}
      </button>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-teal/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-brand-gold/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-4xl animate-slide-up relative z-10">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-teal/20 border border-brand-teal/30 mb-4 shadow-glow">
            <ShieldCheck className="w-8 h-8 text-brand-teal-light" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">{t('common', 'appName')}</h1>
          <p className="text-muted text-sm mt-1">{t('common', 'tagline')}</p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">{t('auth', 'registerTitle')}</h2>
            <p className="text-muted text-sm mt-1">{t('auth', 'registerSubtitle')}</p>
          </div>

          <fieldset className="mb-7">
            <legend className="form-label mb-1">{t('auth', 'userType')}</legend>
            <p className="text-xs text-muted/80 mb-3">{t('auth', 'businessTypeHelp')}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {businessOptions.map(({ value, labelKey, icon: Icon }) => {
                const selected = businessType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setBusinessType(value)}
                    className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition-all duration-200 ${
                      selected
                        ? 'border-brand-teal bg-brand-teal/15 text-brand-teal-light shadow-glow'
                        : 'border-surface-border bg-surface-overlay text-muted hover:border-brand-teal/40 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs sm:text-sm font-medium">{t('auth', labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <form onSubmit={handleRegister} className="space-y-7">
            <section>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-brand-teal-light" />
                {t('auth', 'contactDetails')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <RegistrationField
                  id="fullName"
                  label={t('auth', 'fullName')}
                  type="text"
                  placeholder={t('auth', 'fullNamePlaceholder')}
                  value={formData.fullName}
                  onChange={(event) => handleChange('fullName', event.target.value)}
                  autoComplete="name"
                  required
                />
                <RegistrationField
                  id="phone"
                  label={t('auth', 'phone')}
                  optionalLabel={t('auth', 'optional')}
                  type="tel"
                  placeholder="+966 50 123 4567"
                  value={formData.phone}
                  onChange={(event) => handleChange('phone', event.target.value)}
                  autoComplete="tel"
                />
                <RegistrationField
                  id="email"
                  label={t('auth', 'email')}
                  type="email"
                  placeholder={t('auth', 'emailPlaceholder')}
                  value={formData.email}
                  onChange={(event) => handleChange('email', event.target.value)}
                  autoComplete="email"
                  required
                />
                <div>
                  <label className="form-label" htmlFor="password">{t('auth', 'password')}</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input pe-10"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(event) => handleChange('password', event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? t('auth', 'hidePassword') : t('auth', 'showPassword')}
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <RegistrationField
                  id="confirmPassword"
                  label={t('auth', 'confirmPassword')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(event) => handleChange('confirmPassword', event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </div>
            </section>

            {isBusinessAccount ? (
              <section className="border-t border-surface-border pt-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-brand-gold" />
                  {t('auth', 'businessDetails')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <RegistrationField
                    id="companyName"
                    label={t('auth', 'companyName')}
                    type="text"
                    value={formData.companyName}
                    onChange={(event) => handleChange('companyName', event.target.value)}
                    autoComplete="organization"
                    required
                  />
                  <RegistrationField
                    id="companyNameAr"
                    label={t('auth', 'companyNameAr')}
                    optionalLabel={t('auth', 'optional')}
                    type="text"
                    dir="rtl"
                    value={formData.companyNameAr}
                    onChange={(event) => handleChange('companyNameAr', event.target.value)}
                  />
                  <RegistrationField
                    id="crNumber"
                    label={t('auth', 'crNumber')}
                    type="text"
                    inputMode="numeric"
                    value={formData.crNumber}
                    onChange={(event) => handleChange('crNumber', event.target.value)}
                    required
                  />
                  <RegistrationField
                    id="vatNumber"
                    label={t('auth', 'vatNumber')}
                    optionalLabel={t('auth', 'optional')}
                    type="text"
                    inputMode="numeric"
                    value={formData.vatNumber}
                    onChange={(event) => handleChange('vatNumber', event.target.value)}
                  />

                  {businessType === 'customs_broker' ? (
                    <>
                      <RegistrationField
                        id="brokerLicenseNo"
                        label={t('auth', 'brokerLicenseNo')}
                        optionalLabel={t('auth', 'optional')}
                        type="text"
                        value={formData.brokerLicenseNo}
                        onChange={(event) => handleChange('brokerLicenseNo', event.target.value)}
                      />
                      <RegistrationField
                        id="fasahId"
                        label={t('auth', 'fasahId')}
                        optionalLabel={t('auth', 'optional')}
                        type="text"
                        value={formData.fasahId}
                        onChange={(event) => handleChange('fasahId', event.target.value)}
                      />
                    </>
                  ) : null}

                  {businessType === 'importer_exporter' ? (
                    <RegistrationField
                      id="industrySector"
                      label={t('auth', 'industrySector')}
                      optionalLabel={t('auth', 'optional')}
                      type="text"
                      value={formData.industrySector}
                      onChange={(event) => handleChange('industrySector', event.target.value)}
                    />
                  ) : null}

                  {businessType === 'freight_forwarder' ? (
                    <>
                      <RegistrationField
                        id="transportLicenseNo"
                        label={t('auth', 'transportLicenseNo')}
                        optionalLabel={t('auth', 'optional')}
                        type="text"
                        value={formData.transportLicenseNo}
                        onChange={(event) => handleChange('transportLicenseNo', event.target.value)}
                      />
                      <RegistrationField
                        id="fasahId"
                        label={t('auth', 'fasahId')}
                        optionalLabel={t('auth', 'optional')}
                        type="text"
                        value={formData.fasahId}
                        onChange={(event) => handleChange('fasahId', event.target.value)}
                      />
                    </>
                  ) : null}

                  <RegistrationField
                    id="primaryPort"
                    label={t('auth', 'primaryPort')}
                    optionalLabel={t('auth', 'optional')}
                    type="text"
                    value={formData.primaryPort}
                    onChange={(event) => handleChange('primaryPort', event.target.value)}
                  />
                  <RegistrationField
                    id="monthlyVolume"
                    label={t('auth', 'monthlyVolume')}
                    optionalLabel={t('auth', 'optional')}
                    type="text"
                    placeholder={t('auth', 'monthlyVolumePlaceholder')}
                    value={formData.monthlyVolume}
                    onChange={(event) => handleChange('monthlyVolume', event.target.value)}
                  />
                </div>
              </section>
            ) : null}

            <button
              id="register-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('auth', 'creatingAccount')}
                </>
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
          🇸🇦 {t('auth', 'freeTrialNote')}
        </p>
      </div>
    </main>
  );
}
