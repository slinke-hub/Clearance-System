'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { repairInvoiceEvidence } from '@/lib/invoices/repair-client';
import { useI18n } from '@/lib/i18n/context';

export function EvidenceRepair({ runId, rows }: { runId: string; rows: number[] }) {
  const router = useRouter();
  const { isRTL } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: 'checking' | 'done' | 'failed'; error?: string }>({ status: 'checking' });
  const started = useRef('');
  useEffect(() => {
    const key = `${runId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    void repairInvoiceEvidence(runId, rows).then(() => {
      setState({ status: 'done' });
      router.refresh();
    }).catch(error => {
      setState({ status: 'failed', error: error instanceof Error ? error.message : 'Could not refresh the ZATCA evidence.' });
      router.refresh();
    });
  }, [runId, rows, attempt, router]);
  return <div className="glass-card p-4 space-y-2" role="status" aria-live="polite">
    <p className="text-sm text-white">{state.status === 'checking'
      ? isRTL ? 'جارٍ التحقق من الرموز المحفوظة لدى زاتكا وتحديث النتائج…' : 'Checking saved HS codes with ZATCA and updating your results…'
      : state.status === 'done' ? isRTL ? 'تم تحديث بيانات زاتكا.' : 'ZATCA evidence refreshed.' : state.error}</p>
    {state.status === 'failed' && <button className="btn-ghost" onClick={() => { setState({ status: 'checking' }); setAttempt(value => value + 1); }}>
      {isRTL ? 'إعادة التحقق من زاتكا' : 'Retry ZATCA check'}
    </button>}
  </div>;
}
