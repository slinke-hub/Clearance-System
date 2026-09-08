'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Database,
  Cpu,
  RefreshCw,
  Sliders,
  Layers,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

export default function AdminControlPage() {
  const { t } = useI18n();
  const [isSyncingTariff, setIsSyncingTariff] = useState(false);
  const [minConfidenceThreshold, setMinConfidenceThreshold] = useState(85);
  const [saberAutoFlag, setSaberAutoFlag] = useState(true);
  const [sfdaAutoFlag, setSfdaAutoFlag] = useState(true);

  const handleSyncTariff = () => {
    setIsSyncingTariff(true);
    setTimeout(() => {
      setIsSyncingTariff(false);
      toast.success(t('admin', 'tariffUpdated'));
    }, 1200);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(t('admin', 'settingsUpdated'));
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-brand-gold" />
          {t('admin', 'pageTitle')}
        </h1>
        <p className="text-muted text-sm mt-1">
          {t('admin', 'pageSubtitle')}
        </p>
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center">
                <Database className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Supabase PostgreSQL</p>
                <p className="text-xs text-muted">{t('admin', 'cloudDbAuth')}</p>
              </div>
            </div>
            <span className="badge badge-success">{t('admin', 'connected')}</span>
          </div>
          <p className="text-xs text-muted/80">{t('admin', 'project')}: hapwbspbqsskkwrfkysv</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-teal/15 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-brand-teal-light" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">NVIDIA NIM AI</p>
                <p className="text-xs text-muted">Llama-3.1-Nemotron-70B</p>
              </div>
            </div>
            <span className="badge badge-success">{t('admin', 'active')}</span>
          </div>
          <p className="text-xs text-muted/80">{t('admin', 'latency')}</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-gold/15 flex items-center justify-center">
                <Layers className="w-5 h-5 text-brand-gold" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{t('admin', 'tariffIndex')}</p>
                <p className="text-xs text-muted">{t('admin', 'integratedSchedule')}</p>
              </div>
            </div>
            <span className="badge bg-brand-gold/20 text-brand-gold text-xs">v2026.3</span>
          </div>
          <p className="text-xs text-muted/80">{t('admin', 'taxonomies')}</p>
        </div>
      </div>

      {/* Tariff Sync Card */}
      <div className="glass-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 text-brand-teal-light ${isSyncingTariff ? 'animate-spin' : ''}`} />
            {t('admin', 'tariffSync')}
          </h2>
          <p className="text-xs text-muted mt-1 max-w-xl">
            {t('admin', 'tariffSyncDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSyncTariff}
          disabled={isSyncingTariff}
          className="btn-primary shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncingTariff ? 'animate-spin' : ''}`} />
          {isSyncingTariff ? t('admin', 'syncing') : t('admin', 'syncTariff')}
        </button>
      </div>

      {/* AI Classification Thresholds Form */}
      <div className="glass-card p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-brand-gold" />
          {t('admin', 'guardrails')}
        </h2>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-white">
                {t('admin', 'minimumConfidence')}: <span className="text-brand-gold font-bold">{minConfidenceThreshold}%</span>
              </label>
            </div>
            <input
              type="range"
              min="50"
              max="99"
              value={minConfidenceThreshold}
              onChange={(e) => setMinConfidenceThreshold(Number(e.target.value))}
              className="w-full accent-brand-teal"
            />
            <p className="text-xs text-muted mt-1">
              {t('admin', 'confidenceHelp')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-surface-overlay border border-surface-border flex items-start gap-3">
              <input
                type="checkbox"
                id="saber-toggle"
                checked={saberAutoFlag}
                onChange={(e) => setSaberAutoFlag(e.target.checked)}
                className="mt-1 accent-brand-teal rounded"
              />
              <div>
                <label htmlFor="saber-toggle" className="text-sm font-semibold text-white cursor-pointer">
                  {t('admin', 'saberFlagging')}
                </label>
                <p className="text-xs text-muted mt-0.5">
                  {t('admin', 'saberDescription')}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-overlay border border-surface-border flex items-start gap-3">
              <input
                type="checkbox"
                id="sfda-toggle"
                checked={sfdaAutoFlag}
                onChange={(e) => setSfdaAutoFlag(e.target.checked)}
                className="mt-1 accent-brand-teal rounded"
              />
              <div>
                <label htmlFor="sfda-toggle" className="text-sm font-semibold text-white cursor-pointer">
                  {t('admin', 'sfdaWarning')}
                </label>
                <p className="text-xs text-muted mt-0.5">
                  {t('admin', 'sfdaDescription')}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary">
              {t('admin', 'saveGuardrails')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
