'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  History,
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface HistoryItem {
  id: string;
  fileName: string;
  totalRows: number;
  classifiedRows: number;
  status: 'completed' | 'processing' | 'failed';
  date: string;
  customsDutyTotal: number;
}

const SAMPLE_RUNS: HistoryItem[] = [
  {
    id: 'run-001',
    fileName: 'Commercial_Invoice_Electronics_AUG26.xlsx',
    totalRows: 48,
    classifiedRows: 48,
    status: 'completed',
    date: '2026-08-28 14:32',
    customsDutyTotal: 12450,
  },
  {
    id: 'run-002',
    fileName: 'Industrial_Valves_Pumps_Dammam.xlsx',
    totalRows: 120,
    classifiedRows: 120,
    status: 'completed',
    date: '2026-08-25 09:15',
    customsDutyTotal: 38900,
  },
  {
    id: 'run-003',
    fileName: 'Medical_Consumables_SFDA_Airfreight.xlsx',
    totalRows: 35,
    classifiedRows: 35,
    status: 'completed',
    date: '2026-08-20 16:45',
    customsDutyTotal: 4210,
  },
];

export default function HistoryPage() {
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredRuns = SAMPLE_RUNS.filter((run) => {
    const matchesSearch = run.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || run.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const currencyFormatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
  });
  const dateFormatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-brand-teal-light" />
            {t('history', 'pageTitle')}
          </h1>
          <p className="text-muted text-sm mt-1">
            {t('history', 'pageSubtitle')}
          </p>
        </div>
        <Link href="/upload" className="btn-primary">
          <Upload className="w-4 h-4" />
          {t('history', 'uploadNew')}
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder={t('history', 'searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input ps-9 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-muted" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="form-input py-2 text-sm bg-surface-overlay border-surface-border text-white"
          >
            <option value="all">{t('history', 'allStatuses')}</option>
            <option value="completed">{t('history', 'completed')}</option>
            <option value="processing">{t('history', 'processing')}</option>
            <option value="failed">{t('history', 'failed')}</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('history', 'invoiceFile')}</th>
                <th>{t('history', 'items')}</th>
                <th>{t('history', 'status')}</th>
                <th>{t('history', 'estimatedDuty')}</th>
                <th>{t('history', 'processedDate')}</th>
                <th className="text-end">{t('history', 'action')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted">
                    {t('history', 'noRecords')}
                  </td>
                </tr>
              ) : (
                filteredRuns.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-raised/40 transition-colors">
                    <td className="font-medium text-white flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-brand-teal/15 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4 text-brand-teal-light" />
                      </div>
                      <span className="truncate max-w-xs">{item.fileName}</span>
                    </td>
                    <td>
                      {item.classifiedRows} / {item.totalRows}
                    </td>
                    <td>
                      <span className="badge badge-success flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> {t('history', 'completed')}
                      </span>
                    </td>
                    <td className="font-mono text-xs font-semibold text-brand-gold">
                      {currencyFormatter.format(item.customsDutyTotal)}
                    </td>
                    <td className="text-xs text-muted" dir="auto">{dateFormatter.format(new Date(item.date.replace(' ', 'T')))}</td>
                    <td className="text-end">
                      <a
                        href={`/api/export/${item.id}`}
                        download
                        className="btn-ghost py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('history', 'download')}
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
