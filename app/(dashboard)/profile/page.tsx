'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import {
  User,
  Building2,
  Shield,
  Globe,
  Save,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export default function ProfilePage() {
  const { locale, setLocale } = useI18n();

  const [fullName, setFullName] = useState('Admin User');
  const [email] = useState('privatepple@gmail.com');
  const [companyName, setCompanyName] = useState('Saudi Customs Clearance Solutions');
  const [vatNumber, setVatNumber] = useState('300123456700003');
  const [crNumber, setCrNumber] = useState('1010123456');
  const [phone, setPhone] = useState('+966 50 123 4567');
  const [isSaving, setIsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Profile details saved successfully');
    }, 600);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setIsChangingPassword(true);
    setTimeout(() => {
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <User className="w-6 h-6 text-brand-teal-light" />
          User Profile & Settings
        </h1>
        <p className="text-muted text-sm mt-1">
          Manage your personal account, company information, and ZATCA compliance credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Account Overview Card */}
        <div className="glass-card p-6 space-y-5 h-fit">
          <div className="flex flex-col items-center text-center pb-4 border-b border-surface-border">
            <div className="w-20 h-20 rounded-2xl bg-brand-teal/20 border-2 border-brand-teal/40 flex items-center justify-center text-brand-teal-light text-2xl font-bold mb-3 shadow-glow">
              AU
            </div>
            <h2 className="text-lg font-bold text-white">{fullName}</h2>
            <p className="text-xs text-muted mt-0.5">{email}</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="px-2.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold text-xs font-bold flex items-center gap-1">
                <Shield className="w-3 h-3" /> ADMIN
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-brand-teal/20 text-brand-teal-light text-xs font-medium">
                Enterprise
              </span>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between text-muted">
              <span>Account Status</span>
              <span className="text-success font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active
              </span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Tax Authority</span>
              <span className="text-white font-medium">ZATCA (KSA)</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Language</span>
              <button
                type="button"
                onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
                className="text-brand-teal-light hover:text-brand-gold font-medium flex items-center gap-1 transition-colors"
              >
                <Globe className="w-3 h-3" />
                {locale === 'en' ? 'English (LTR)' : 'العربية (RTL)'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Profile & Company Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal & Business Info */}
          <div className="glass-card p-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand-teal-light" />
              General & Company Information
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input opacity-70 cursor-not-allowed"
                    value={email}
                    disabled
                  />
                </div>

                <div>
                  <label className="form-label">Company / Est. Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">KSA VAT Number (الرقم الضريبي)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="300000000000003"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Commercial Registration (السجل التجاري)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="1010000000"
                    value={crNumber}
                    onChange={(e) => setCrNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-primary"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Security & Password */}
          <div className="glass-card p-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-brand-gold" />
              Security & Password
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="btn-ghost"
                >
                  {isChangingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
