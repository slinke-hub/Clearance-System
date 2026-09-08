'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { ColumnMapping, ZatcaClassification } from '@/types';
import {
  Upload,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  Download,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

// ── Step Types ────────────────────────────────────────────────
type Step = 'upload' | 'map' | 'classify' | 'review' | 'export';

interface UploadResult {
  runId: string;
  fileName: string;
  headers: string[];
  totalRows: number;
  autoMapping: Partial<ColumnMapping>;
  preview: Record<string, unknown>[];
  items: Array<{
    rowIndex: number;
    itemName: string;
    itemDescription: string;
  }>;
}

interface ClassificationRow {
  rowIndex: number;
  itemName: string;
  itemDescription: string;
  classification: ZatcaClassification | null;
}

const STEPS: { id: Step; labelKey: string }[] = [
  { id: 'upload', labelKey: 'step1' },
  { id: 'map', labelKey: 'step2' },
  { id: 'classify', labelKey: 'step3' },
  { id: 'review', labelKey: 'step4' },
  { id: 'export', labelKey: 'step5' },
];

export default function UploadPage() {
  const { t, isRTL } = useI18n();
  const [step, setStep] = useState<Step>('upload');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [results, setResults] = useState<ClassificationRow[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  // ── Dropzone ──────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/invoices/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(t('upload', 'uploadFailed'));

      setUploadResult(data);
      setMapping(data.autoMapping || {});
      setRunId(data.runId);
      toast.success(t('upload', 'parsedRows', { count: data.totalRows, file: data.fileName }));
      setStep('map');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('upload', 'uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  }, [t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  // ── Classify ───────────────────────────────────────────────
  const handleClassify = async () => {
    if (!runId || !uploadResult || !mapping.itemName) {
      toast.error(t('upload', 'itemNameRequired'));
      return;
    }

    setClassifyProgress(0);
    setStep('classify');

    try {
      const items = uploadResult.preview.length > 0
        ? Array.from({ length: uploadResult.totalRows }, (_, i) => ({
            rowIndex: i,
            itemName: String(uploadResult.preview[i]?.[mapping.itemName!] || t('upload', 'itemFallback', { count: i + 1 })),
            itemDescription: mapping.itemDescription
              ? String(uploadResult.preview[i]?.[mapping.itemDescription] || '')
              : '',
          }))
        : [];

      const classifyItems = uploadResult.items?.length > 0 ? uploadResult.items : items;

      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, items: classifyItems }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(t('upload', 'classificationFailed'));

      setClassifyProgress(100);

      // Build result rows
      const rows: ClassificationRow[] = classifyItems.map((item: { rowIndex: number; itemName: string; itemDescription: string }, idx: number) => ({
        rowIndex: item.rowIndex,
        itemName: item.itemName,
        itemDescription: item.itemDescription,
        classification: data.classifications[idx] ?? null,
      }));

      setResults(rows);
      toast.success(t('upload', 'classifiedSuccess', { count: rows.length }));
      setStep('review');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('upload', 'classificationFailed'));
      setStep('map');
    } finally {
    }
  };

  // ── Export ─────────────────────────────────────────────────
  const handleExport = () => {
    if (!runId) return;
    const url = `/api/export/${runId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(t('upload', 'exportStarted'));
    setStep('export');
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  const regulationColors: Record<string, string> = {
    'REGULATED': 'badge-error',
    'NON-REGULATED': 'badge-success',
    'UNKNOWN': 'badge-muted',
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('upload', 'title')}</h1>
        <p className="text-muted text-sm mt-1">{t('upload', 'subtitle')}</p>
      </div>

      {/* Step Indicator */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const isActive = s.id === step;
            const isComplete = idx < currentStepIndex;
            return (
              <React.Fragment key={s.id}>
                <div className={`flex items-center gap-2 shrink-0 px-3 py-2 rounded-xl transition-all ${
                  isActive
                    ? 'bg-brand-teal/20 border border-brand-teal/30 text-brand-teal-light'
                    : isComplete
                    ? 'text-success'
                    : 'text-muted'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isComplete ? 'bg-success/20 text-success' :
                    isActive ? 'bg-brand-teal/30 text-brand-teal-light' : 'bg-surface-overlay text-muted'
                  }`}>
                    {isComplete ? '✓' : idx + 1}
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap">{t('upload', s.labelKey)}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className={`w-3.5 h-3.5 text-surface-border shrink-0 ${isRTL ? 'rotate-180' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Step: Upload ─────────────────────────────────── */}
      {step === 'upload' && (
        <div className="glass-card p-6">
          <h2 className="text-base font-semibold text-white mb-4">{t('upload', 'step1')}</h2>
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
            <input {...getInputProps({ 'aria-label': t('upload', 'fileUpload') })} id="file-dropzone" />
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-brand-teal-light animate-spin" />
                <p className="text-sm text-muted">{t('upload', 'parsing')}</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-brand-teal/10 border border-brand-teal/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-8 h-8 text-brand-teal-light" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white">{t('upload', 'dropzone')}</p>
                  <p className="text-xs text-muted mt-1">{t('upload', 'dropzoneOr')}</p>
                </div>
                <span className="badge badge-muted">{t('upload', 'dropzoneHint')}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Step: Map Columns ────────────────────────────── */}
      {step === 'map' && uploadResult && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">{t('upload', 'mapColumns')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('upload', 'mapSubtitle')}</p>
            </div>
            <div className="badge badge-success">
              <FileSpreadsheet className="w-3 h-3" /> {uploadResult.fileName}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-surface-overlay border border-surface-border p-3 overflow-x-auto text-xs text-muted">
            <p className="font-medium text-white mb-2">{t('upload', 'detected', { rows: uploadResult.totalRows, columns: uploadResult.headers.length })}</p>
            <div className="flex gap-2 flex-wrap">
              {uploadResult.headers.map((h) => (
                <span key={h} className="badge badge-muted">{h}</span>
              ))}
            </div>
          </div>

          {/* Column Mapping Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { field: 'itemName', label: t('upload', 'itemName'), required: true },
              { field: 'itemDescription', label: t('upload', 'itemDescription'), required: false },
              { field: 'quantity', label: t('upload', 'quantity'), required: false },
              { field: 'unitPrice', label: t('upload', 'unitPrice'), required: false },
              { field: 'totalPrice', label: t('upload', 'totalPrice'), required: false },
              { field: 'currency', label: t('upload', 'currency'), required: false },
            ].map(({ field, label, required }) => (
              <div key={field}>
                <label className="form-label">
                  {label} {required && <span className="text-error">*</span>}
                  {!required && <span className="text-muted/60 ms-1">{t('upload', 'optional')}</span>}
                </label>
                <select
                  id={`map-${field}`}
                  className="form-input"
                  value={mapping[field as keyof ColumnMapping] || ''}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined }))
                  }
                >
                  <option value="">— {t('upload', 'selectColumn')} —</option>
                  {uploadResult.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!mapping.itemName && (
            <div className="flex items-center gap-2 text-warning text-xs p-3 rounded-xl bg-warning/10 border border-warning/20">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('upload', 'itemNameRequiredProceed')}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="btn-ghost">
              {isRTL ? '→' : '←'} {t('upload', 'back')}
            </button>
            <button
              id="start-classify-btn"
              onClick={handleClassify}
              disabled={!mapping.itemName}
              className="btn-primary flex-1"
            >
              <Sparkles className="w-4 h-4" /> {t('upload', 'startClassification')}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Classifying ────────────────────────────── */}
      {step === 'classify' && (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-brand-teal/20 border border-brand-teal/30 flex items-center justify-center shadow-glow animate-pulse-glow">
              <Sparkles className="w-10 h-10 text-brand-teal-light" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{t('upload', 'classifying')}</p>
            <p className="text-sm text-muted mt-1">
              {t('upload', 'aiAnalyzing')}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="progress-bar">
              <div
                className="progress-fill transition-all duration-700"
                style={{ width: `${classifyProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-2">{classifyProgress}% {t('upload', 'complete')}</p>
          </div>
        </div>
      )}

      {/* ── Step: Review ──────────────────────────────────── */}
      {step === 'review' && results.length > 0 && (
        <div className="space-y-4">
          <div className="glass-card p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">{t('upload', 'classificationResults')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('upload', 'itemsClassified', { count: results.length })}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="badge badge-success">
                <CheckCircle2 className="w-3 h-3" />
                {t('upload', 'classifiedCount', { count: results.filter((r) => r.classification?.hsCode && r.classification.hsCode !== 'ERROR').length })}
              </span>
              <span className="badge badge-error">
                {t('upload', 'regulatedCount', { count: results.filter((r) => r.classification?.regulationStatus === 'REGULATED').length })}
              </span>
            </div>
          </div>

          {/* Results Table */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('upload', 'itemNameHeader')}</th>
                    <th>{t('classification', 'hsCode')}</th>
                    <th>{t('classification', 'cdf')}</th>
                    <th>{t('upload', 'regulation')}</th>
                    <th>{t('upload', 'zatcaName')}</th>
                    <th>{t('classification', 'confidence')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.rowIndex}>
                      <td className="text-muted text-xs">{row.rowIndex + 1}</td>
                      <td className="font-medium text-white max-w-[180px] truncate" title={row.itemName}>
                        {row.itemName}
                      </td>
                      <td>
                        <code className="text-brand-teal-light font-mono text-xs">
                          {row.classification?.hsCode || '—'}
                        </code>
                      </td>
                      <td className="text-brand-gold text-xs font-medium">
                        {row.classification?.cdf || '—'}
                      </td>
                      <td>
                        <span className={`badge ${regulationColors[row.classification?.regulationStatus || 'UNKNOWN'] || 'badge-muted'} text-xs`}>
                          {row.classification?.regulationStatus === 'REGULATED'
                            ? `⚠ ${t('classification', 'regulated')}`
                            : row.classification?.regulationStatus === 'NON-REGULATED'
                            ? `✓ ${t('upload', 'clear')}`
                            : '?'}
                        </span>
                      </td>
                      <td className="text-muted text-xs max-w-[200px] truncate" title={row.classification?.standardizedZatcaName}>
                        {row.classification?.standardizedZatcaName || '—'}
                      </td>
                      <td>
                        {row.classification?.confidenceScore != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-surface-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-teal rounded-full"
                                style={{ width: `${Math.round((row.classification.confidenceScore) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted">
                              {Math.round((row.classification.confidenceScore) * 100)}%
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); setResults([]); setRunId(null); setUploadResult(null); }} className="btn-ghost">
              <RefreshCw className="w-4 h-4" /> {t('upload', 'startOver')}
            </button>
            <button
              id="export-excel-btn"
              onClick={handleExport}
              className="btn-primary flex-1"
            >
              <Download className="w-4 h-4" /> {t('upload', 'exportExcel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Export Done ─────────────────────────────── */}
      {step === 'export' && (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center gap-6">
          <div className="w-20 h-20 rounded-full bg-success/20 border border-success/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{t('upload', 'exportSuccess')}</p>
            <p className="text-sm text-muted mt-1">
              {t('upload', 'exportDescription')}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); setResults([]); setRunId(null); setUploadResult(null); }} className="btn-ghost">
              <Upload className="w-4 h-4" /> {t('upload', 'uploadAnother')}
            </button>
            <button onClick={handleExport} className="btn-primary">
              <Download className="w-4 h-4" /> {t('upload', 'downloadAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
