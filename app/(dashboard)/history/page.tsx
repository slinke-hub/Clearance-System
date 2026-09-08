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
  Clock,
  AlertCircle,
  ExternalLink,
  Upload,
} from 'lucide-react';

interface HistoryItem {
  id: string;
  fileName: string;
  totalRows: number;
  classifiedRows: number;
  status: 'completed' | 'processing' | 'failed';
  date: string;
  customsDutyTotal: string;
}

const SAMPLE_RUNS: HistoryItem[] = [
  {
    id: 'run-001',
    fileName: 'Commercial_Invoice_Electronics_AUG26.xlsx',
    totalRows: 48,
    classifiedRows: 48,
    status: 'completed',
    date: '2026-08-28 14:32',
    customsDutyTotal: 'SAR 12,450.00',
  },
  {
    id: 'run-002',
    fileName: 'Industrial_Valves_Pumps_Dammam.xlsx',
    totalRows: 120,
    classifiedRows: 120,
    status: 'completed',
    date: '2026-08-25 09:15',
    customsDutyTotal: 'SAR 38,900.00',
  },
  {
    id: 'run-003',
    fileName: 'Medical_Consumables_SFDA_Airfreight.xlsx',
    totalRows: 35,
    classifiedRows: 35,
    status: 'completed',
    date: '2026-08-20 16:45',
    customsDutyTotal: 'SAR 4,210.00',
  },
];

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredRuns = SAMPLE_RUNS.filter((run) => {
    const matchesSearch = run.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || run.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-brand-teal-light" />
            Clearance History & Audit Logs
          </h1>
          <p className="text-muted text-sm mt-1">
            Review past invoice processing batches, audit classifications, and re-download enriched files.
          </p>
        </div>
        <Link href="/upload" className="btn-primary">
          <Upload className="w-4 h-4" />
          Upload New Invoice
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search invoice files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input pl-9 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-muted" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="form-input py-2 text-sm bg-surface-overlay border-surface-border text-white"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice File</th>
                <th>Items</th>
                <th>Status</th>
                <th>Est. Duty</th>
                <th>Processed Date</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted">
                    No clearance history records found.
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
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </span>
                    </td>
                    <td className="font-mono text-xs font-semibold text-brand-gold">
                      {item.customsDutyTotal}
                    </td>
                    <td className="text-xs text-muted">{item.date}</td>
                    <td className="text-right">
                      <a
                        href={`/api/export/${item.id}`}
                        download
                        className="btn-ghost py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
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
