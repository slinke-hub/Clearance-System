'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Copy, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { InvoiceReport } from '@/lib/invoices/report';
import { EvidenceRepair } from './EvidenceRepair';

export function InvoiceResults({ report, initialItem }: { report: InvoiceReport; initialItem?: string }) {
  const { isRTL } = useI18n();
  const [selected, setSelected] = useState<number | null>(() => {
    const found = report.items.find(i => String(i.rowIndex) === initialItem);
    return found?.rowIndex ?? null;
  });
  const item = report.items.find(i => i.rowIndex === selected);
  const label = (en: string, ar: string) => isRTL ? ar : en;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(label('Copied', 'تم النسخ')); }
    catch { toast.error(label('Copy unavailable. Copy the link from your address bar.', 'تعذر النسخ. انسخ الرابط من شريط العنوان.')); }
  };
  const path = `/invoices/${report.id}`;
  return <div className="max-w-5xl space-y-6">
    {report.items.some(row => row.repairable) && <EvidenceRepair key={report.id} runId={report.id} rows={report.items.filter(row => row.repairable).map(row => row.rowIndex)} />}
    <div className="glass-card p-6 space-y-3">
      <h1 className="text-2xl font-semibold text-white">{label('Invoice results', 'نتائج الفاتورة')}</h1>
      <p className="text-muted">{report.fileName} {report.invoiceNumber && `· ${report.invoiceNumber}`}</p>
      <p className="text-sm text-muted">{report.items.filter(i => i.verified).length} / {report.items.length} {label('items matched to saved ZATCA records', 'صنف مطابق لبيانات زاتكا المحفوظة')}</p>
      <p className="text-sm text-muted">{label('Open an item to see its required procedures, tariff rate and official description. Results reflect the lookup date shown for each item.', 'افتح الصنف لعرض الإجراءات المطلوبة ونسبة الرسوم والوصف الرسمي. تعكس النتائج تاريخ التحقق الموضح لكل صنف.')}</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => copy(window.location.origin + path)}><Copy className="w-4 h-4" />{label('Copy result link', 'نسخ رابط النتيجة')}</button>
        <a className="btn-ghost" href={`/api/export/${report.id}`}>{label('Download Excel', 'تنزيل Excel')}</a>
        <Link className="btn-ghost" href="/upload">{label('Upload invoice', 'رفع فاتورة')}</Link>
      </div>
      <p className="text-xs text-muted">{label('This result link requires signing in to the invoice owner’s account.', 'يتطلب رابط النتيجة تسجيل الدخول إلى حساب صاحب الفاتورة.')}</p>
    </div>
    <div className="glass-card overflow-x-auto">
      <table className="data-table">
        <thead><tr><th>{label('ITEM CODE', 'رمز الصنف')}</th><th>{label('FACTORY CODE', 'رمز المصنع')}</th><th>{label('ITEM DESCRIPTION', 'وصف الصنف')}</th><th>HS CODES</th><th>CUSTOMS DUTY FEES</th><th>REGULATED / NON-REGULATED</th><th>{label('RESULT', 'النتيجة')}</th></tr></thead>
        <tbody>{report.items.map(row => <tr key={row.rowIndex}>
          <td dir="ltr" className="whitespace-nowrap">{row.itemCode || label('Not provided', 'غير مذكور')}</td>
          <td dir="ltr" className="whitespace-nowrap">{row.factoryCode || label('Not provided', 'غير مذكور')}</td>
          <td className="min-w-56"><p className="text-white">{row.name}</p>{row.description !== row.name && <p className="text-xs text-muted">{row.description}</p>}</td>
          <td className="min-w-56"><span dir="ltr">{row.hsCode || label('Review required', 'تتطلب المراجعة')}</span>{!row.verified && <p className="text-xs text-muted mt-2" dir="auto">{row.note}</p>}</td>
          <td dir="ltr">{row.duty}</td><td>{row.regulation === 'UNKNOWN' ? label('Review required', 'تتطلب المراجعة') : row.regulation}</td>
          <td><button className="btn-ghost whitespace-nowrap" onClick={() => setSelected(row.rowIndex)} aria-label={`${label('View result for', 'عرض نتيجة')} ${row.name}`}>{label('View result', 'عرض النتيجة')}</button></td>
        </tr>)}</tbody>
      </table>
      {!report.items.length && <p className="p-6 text-muted">{label('No saved product results yet. Complete invoice processing first.', 'لا توجد نتائج محفوظة بعد. أكمل معالجة الفاتورة أولاً.')}</p>}
    </div>
    <Dialog.Root open={Boolean(item)} onOpenChange={open => { if (!open) setSelected(null); }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content dir={isRTL ? 'rtl' : 'ltr'} className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-3xl max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 text-slate-800 shadow-xl">
          <Dialog.Title className="pe-8 text-lg font-semibold">{item?.zatcaName || item?.name}</Dialog.Title>
          <Dialog.Description className="text-sm text-slate-500 mt-1">{item?.name}</Dialog.Description>
          <Dialog.Close className="absolute end-5 top-5 p-1 rounded hover:bg-slate-100" aria-label={label('Close', 'إغلاق')}><X className="w-5 h-5" /></Dialog.Close>
          {item && <>
            <dl className="mt-5 rounded-lg border border-slate-200 p-5 space-y-5 text-start">
              <div><dt className="font-bold">{label('Required Procedures', 'الإجراءات المطلوبة')}</dt><dd className="mt-2 text-sm leading-7">
                {item.procedures.length ? <ol className="list-decimal ps-5">{item.procedures.map((p, i) => <li key={i} dir="auto">{p}</li>)}</ol> : item.verified ? label('No procedures listed in the retrieved ZATCA record.', 'لا توجد إجراءات مدرجة في سجل زاتكا المسترجع.') : label('Awaiting a verified ZATCA match.', 'بانتظار مطابقة مؤكدة من زاتكا.')}
              </dd></div>
              <div><dt className="font-bold">{label('Duty', 'الرسوم')}</dt><dd className="mt-2"><span dir="ltr">{item.duty}</span></dd></div>
              <div><dt className="font-bold">{label('HS Code', 'الرمز الجمركي')}</dt><dd className="mt-2 flex items-center gap-2 text-emerald-700"><span dir="ltr">{item.hsCode || 'REVIEW REQUIRED'}</span>{item.hsCode && <button onClick={() => copy(item.hsCode)} aria-label={label('Copy HS code', 'نسخ الرمز الجمركي')}><Copy className="h-4 w-4" /></button>}</dd></div>
              <div><dt className="font-bold">{label('HS Heading', 'البند الجمركي')}</dt><dd className="mt-2"><span dir="ltr">{item.heading || '—'}</span></dd></div>
              <div><dt className="font-bold">{label('Regulation status', 'حالة التقييد')}</dt><dd className="mt-2">{item.regulation === 'UNKNOWN' ? 'REVIEW REQUIRED' : item.regulation}</dd></div>
              {item.importStatus && <div><dt className="font-bold">{label('Import status', 'حالة الاستيراد')}</dt><dd dir="auto" className="mt-2">{item.importStatus}</dd></div>}
            </dl>
            <p className="text-sm text-slate-600 mt-4" role="status">{item.note}</p>
            {item.productEvidence.map(source => <p key={source.reference} className="text-sm text-slate-600 mt-3" dir="auto"><a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{label('Manufacturer reference', 'مرجع الشركة المصنعة')}: {source.reference}</a> — {source.description}</p>)}
            {item.retrievedAt && <p className="text-xs text-slate-500 mt-2">{label('Checked', 'تاريخ التحقق')}: <span dir="ltr">{item.retrievedAt.replace('T', ' ').replace('Z', ' UTC')}</span> · {label('Effective date', 'تاريخ السريان')}: <span dir="ltr">{item.effectiveDate.slice(0, 10)}</span></p>}
            <div className="mt-5 flex flex-wrap justify-between gap-4 text-sm border-t border-slate-200 pt-4">
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-slate-700">{label('Reference Links', 'روابط مرجعية')}:</span>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline inline-flex items-center gap-1">{label('Open ZATCA tariff search', 'فتح بحث التعريفة لدى زاتكا')}<ExternalLink className="h-4 w-4" /></a>
                <a href="https://saber.sa/home/hscodes" target="_blank" rel="noreferrer" className="text-emerald-700 underline inline-flex items-center gap-1">{label('Search Saber HS Codes', 'البحث عن رمز النظام المنسق في سابر')}<ExternalLink className="h-4 w-4" /></a>
                <a href="https://tabseer.co" target="_blank" rel="noreferrer" className="text-emerald-700 underline inline-flex items-center gap-1">{label('Tabseer Conformity', 'مطابقة تبصير')}<ExternalLink className="h-4 w-4" /></a>
              </div>
              <div className="flex flex-col gap-3 items-end justify-end">
                <button className="text-emerald-700 underline" onClick={() => copy(`${window.location.origin}${path}?item=${item.rowIndex}`)}>{label('Copy this item’s result link', 'نسخ رابط نتيجة الصنف')}</button>
                <Dialog.Close className="rounded bg-slate-100 px-5 py-2 text-slate-900 w-full text-center hover:bg-slate-200">{label('Close', 'إغلاق')}</Dialog.Close>
              </div>
            </div>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
