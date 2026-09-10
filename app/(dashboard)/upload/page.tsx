'use client';

import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { ColumnMapping, ZatcaClassification } from '@/types';
import type { ParsedExcelRow } from '@/types';
import { mapItems, reviewInvoice, type InvoiceMetadata, type ReviewItem } from '@/lib/excel/invoice';
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
  rows: ParsedExcelRow[];
  metadata: InvoiceMetadata;
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
  const fieldLabels: Record<string, [string, string]> = {
    invoiceNumber: ['Invoice number', 'رقم الفاتورة'], date: ['Invoice date', 'تاريخ الفاتورة'],
    supplier: ['Supplier', 'المورد'], customer: ['Customer', 'العميل'], vessel: ['Vessel', 'السفينة'],
    sailingDate: ['Sailing date', 'تاريخ الإبحار'], shipment: ['Shipment', 'الشحنة'], terms: ['Shipment terms', 'شروط الشحن'],
    payment: ['Payment terms', 'شروط الدفع'], originStatement: ['Origin statement', 'بيان المنشأ'],
    goodsTotal: ['Invoice goods total', 'قيمة البضاعة بالفاتورة'], invoiceTotal: ['Invoice total', 'إجمالي الفاتورة'],
    itemName: ['Description', 'الوصف'], itemDescription: ['References and details', 'المراجع والتفاصيل'],
    itemCode: ['Item code', 'رمز الصنف'], unit: ['Unit', 'الوحدة'], quantity: ['Quantity', 'الكمية'],
    unitPrice: ['Unit price', 'سعر الوحدة'], totalPrice: ['Amount', 'المبلغ'], currency: ['Currency', 'العملة'],
  };
  const fieldLabel = (key: string) => fieldLabels[key]?.[isRTL ? 1 : 0] || key;
  const [step, setStep] = useState<Step>('upload');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [results, setResults] = useState<ClassificationRow[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, Partial<ReviewItem>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const reviewedItems = uploadResult ? mapItems(uploadResult.rows, mapping).map(i => ({ ...i, ...edits[i.rowIndex] })) : [];
  const invoiceReview = reviewInvoice(reviewedItems, uploadResult?.metadata || { charges: [] });

  // ── Dropzone ──────────────────────────────────────────────
  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/invoices/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || t('upload', 'uploadFailed'));

      setUploadResult(data);
      setEdits({});
      setResults([]);
      setMapping(data.autoMapping || {});
      setRunId(data.runId);
      toast.success(t('upload', 'parsedRows', { count: data.totalRows, file: data.fileName }));
      setStep('map');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('upload', 'uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

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
  const saveReview = async () => {
    const response = await fetch('/api/invoices/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, mapping, items: reviewedItems }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save invoice');
  };

  const handleClassify = async () => {
    if (!runId || !uploadResult || !mapping.itemName) {
      toast.error(t('upload', 'itemNameRequired'));
      return;
    }

    setClassifyProgress(0);
    setStep('classify');

    try {
      if (invoiceReview.errors.length) throw new Error(invoiceReview.errors.join(' '));
      await saveReview();
      const classifyItems = reviewedItems;
      const classifications: ZatcaClassification[] = [];
      for (let offset = 0; offset < classifyItems.length; offset += 5) {
        const res = await fetch('/api/classify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, batchRows: classifyItems.slice(offset, offset + 5).map(i => i.rowIndex) }),
        });
        const response = await res.json();
        if (!res.ok) throw new Error(response.error || t('upload', 'classificationFailed'));
        classifications.push(...response.classifications);
        setClassifyProgress(Math.round(classifications.length / classifyItems.length * 100));
      }
      const data = { classifications };

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
  const handleExport = async () => {
    if (!runId) return;
    try {
    const url = `/api/export/${runId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error((await response.json()).error || 'Export failed');
    const downloadUrl = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `ClearanceIQ_${uploadResult?.fileName || 'Invoice.xlsx'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    toast.success(t('upload', 'exportStarted'));
    setStep('export');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Export failed'); }
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
            const isComplete = idx < currentStepIndex && (results.length > 0 || (s.id !== 'classify' && s.id !== 'review'));
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
              <h2 className="text-base font-semibold text-white">{isRTL ? 'مراجعة الفاتورة والأصناف' : 'Review invoice and items'}</h2>
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
                <label className="form-label" htmlFor={`map-${field}`}>
                  {label} {required && <span className="text-error">*</span>}
                  {!required && <span className="text-muted/60 ms-1">{t('upload', 'optional')}</span>}
                </label>
                <select
                  id={`map-${field}`}
                  className="form-input"
                  value={mapping[field as keyof ColumnMapping] || ''}
                  onChange={(e) =>
                    { setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined })); setEdits({}); }
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

          <div className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-2 rounded-xl bg-surface-overlay p-4">
              {Object.entries(uploadResult.metadata).filter(([key, value]) => key !== 'charges' && value !== undefined).map(([key, value]) => <p key={key} className="break-words"><span className="text-muted">{fieldLabel(key)}: </span>{typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : String(value)}</p>)}
              {uploadResult.metadata.charges.map((c, index) => <p key={index}>{c.label}: {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {uploadResult.metadata.currency}</p>)}
              <p>{isRTL ? 'الأصناف' : 'Items'}: {reviewedItems.length}</p>
              <p>{isRTL ? 'الكميات حسب الوحدة' : 'Quantities by unit'}: {Object.entries(invoiceReview.units).map(([unit, count]) => `${count.toLocaleString()} ${unit}`).join(' / ')}</p>
              <p>{isRTL ? 'إجمالي الأصناف المحسوب' : 'Calculated goods total'}: {invoiceReview.goodsTotal?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '—'}</p>
              <p>{isRTL ? 'الإجمالي مع الرسوم' : 'Total including charges'}: {invoiceReview.total?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '—'}</p>
            </div>
            {[...invoiceReview.errors, ...invoiceReview.warnings].map((message, index) => <p key={index} role="status" className="text-warning">{message}</p>)}
            <p className="text-muted">{isRTL ? 'راجع جميع الأصناف وعدّل البيانات قبل التصنيف.' : 'Review all items and correct any details before classification. Row numbers refer to the original Excel sheet.'}</p>
            <div className="overflow-auto max-h-[480px]">
              <table className="data-table"><thead><tr><th>{isRTL ? 'الصف' : 'Row'}</th>{(['itemName', 'itemDescription', 'itemCode', 'unit', 'quantity', 'unitPrice', 'totalPrice', 'currency'] as const).map(key => <th key={key}>{fieldLabel(key)}</th>)}</tr></thead>
                <tbody>{reviewedItems.map(item => <tr key={item.rowIndex}><td>{item.rowIndex + 1}</td>{(['itemName', 'itemDescription', 'itemCode', 'unit', 'quantity', 'unitPrice', 'totalPrice', 'currency'] as const).map(key => <td key={key}><input className={`form-input ${key === 'itemName' || key === 'itemDescription' ? 'min-w-72' : 'min-w-32'}`} aria-label={`${fieldLabel(key)} row ${item.rowIndex + 1}`} value={item[key]} onChange={event => setEdits(prev => ({ ...prev, [item.rowIndex]: { ...prev[item.rowIndex], [key]: event.target.value } }))} /></td>)}</tr>)}</tbody>
              </table>
            </div>
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
            <button className="btn-ghost" disabled={isSaving || invoiceReview.errors.length > 0} onClick={async () => {
              setIsSaving(true);
              try { await saveReview(); await handleExport(); }
              catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save invoice'); }
              finally { setIsSaving(false); }
            }}>{isSaving ? '…' : isRTL ? 'حفظ وتصدير الأصناف' : 'Save and export items'}</button>
            <button
              id="start-classify-btn"
              onClick={handleClassify}
              disabled={isSaving || !mapping.itemName || invoiceReview.errors.length > 0}
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
              <p className="text-xs text-muted mt-2">{isRTL ? 'الرسوم المعروضة هي نسبة التعريفة المنشورة وليست مبلغ الرسوم المستحق. راجع مطابقة الصنف ومتطلبات الفسح.' : 'Duty fees show the published tariff rate, not the payable amount. Review the product match and clearance requirements.'}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="badge badge-success">
                <CheckCircle2 className="w-3 h-3" />
                {t('upload', 'classifiedCount', { count: results.filter((r) => /^\d{8,12}$/.test(r.classification?.hsCode || '')).length })}
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
                    <th>{isRTL ? 'الرمز الجمركي' : 'HS CODES'}</th>
                    <th>{isRTL ? 'الرسوم الجمركية' : 'CUSTOMS DUTY FEES'}</th>
                    <th>{isRTL ? 'مقيد / غير مقيد' : 'REGULATED / NON-REGULATED'}</th>
                    <th>{t('upload', 'zatcaName')}</th>
                    <th>{t('classification', 'confidence')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.rowIndex}>
                      <td className="text-muted text-xs">{row.rowIndex + 1}</td>
                      <td className="font-medium text-white min-w-56 max-w-sm" title={row.itemName}>
                        {row.itemName}
                        {row.classification?.tariffEvidence && <details className="text-xs text-muted mt-2"><summary>{isRTL ? 'المصدر ومتطلبات الفسح' : 'Source and clearance requirements'}</summary>
                          <p>{row.classification.tariffEvidence.note}</p>
                          <p>{row.classification.tariffEvidence.importStatus}</p>
                          <p>{row.classification.tariffEvidence.procedures.join(' • ')}</p>
                          <p>{row.classification.tariffEvidence.retrievedAt}</p>
                          <a className="underline" target="_blank" rel="noreferrer" href={row.classification.tariffEvidence.sourceUrl}>ZATCA</a>
                        </details>}
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
                            ? isRTL ? `⚠ ${t('classification', 'regulated')}` : 'REGULATED'
                            : row.classification?.regulationStatus === 'NON-REGULATED'
                            ? 'NON-REGULATED'
                            : isRTL ? 'تتطلب المراجعة' : 'REVIEW REQUIRED'}
                        </span>
                        {row.classification?.tariffEvidence?.importStatus && <p className="text-xs text-muted mt-2">{row.classification.tariffEvidence.importStatus}</p>}
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
              {results.length > 0 ? t('upload', 'exportDescription') : isRTL ? 'تم تنزيل ملف الأصناف المراجعة وتفاصيل الفاتورة. لم يتم تصنيف الأصناف بعد.' : 'Your reviewed items and invoice details have been downloaded. Items have not been classified yet.'}
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
