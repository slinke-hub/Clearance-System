import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { loadInvoice } from '@/lib/invoices';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { mockStore } from '@/lib/mock/store';
import { inspectTariffEvidence, verifiedTariffFor, type TariffEvidence } from '@/lib/zatca/tariff';
import { repairLookupEvidence } from '@/lib/zatca/repair-evidence';
import { assertEvidenceSaved, classificationRecordFor, EvidenceStorageError } from '@/lib/zatca/evidence-storage';

export const maxDuration = 90;
const schema = z.object({ rowIndexes: z.array(z.number().int().nonnegative()).min(1).max(4) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { runId } = await params;
    if (!z.string().uuid().safeParse(runId).success) return NextResponse.json({ error: 'Invalid invoice.' }, { status: 400 });
    const input = schema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Invalid invoice rows.' }, { status: 400 });
    const invoice = await loadInvoice(runId, user.id);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    const items = [...new Set(input.data.rowIndexes)].map(row => invoice.items.find(item => item.row_index === row));
    if (items.some(item => !item)) return NextResponse.json({ error: 'Invoice row not found.' }, { status: 404 });
    const db = isSupabaseConfigured() ? await createClient() : null;
    // Read codes only from the authenticated owner's saved rows, never from client input.
    const prepared = await Promise.all(items.map(async item => {
      const stored = item!.classification;
      const check = inspectTariffEvidence(stored);
      if (check.ok || check.code !== 'LOOKUP_INVALID') return null;
      const repaired = await repairLookupEvidence({ hsCode: stored!.hs_code!, cdf: stored!.cdf || '',
        regulationStatus: stored!.regulation_status || 'UNKNOWN', standardizedZatcaName: stored!.standardized_name || item!.item_name || '',
        confidenceScore: stored!.confidence_score ?? undefined, tariffEvidence: stored!.raw_ai_response!.tariffEvidence as TariffEvidence });
      return { item: item!, ...classificationRecordFor(repaired, item!.id, runId) };
    }));
    for (const entry of prepared) {
      if (!entry) continue;
      if (db) {
        // Do not overwrite a newer classification produced while ZATCA was being queried.
        let update = db.from('classification_results').update(entry.record).eq('line_item_id', entry.item.id).eq('run_id', runId);
        update = entry.item.classification?.classified_at ? update.eq('classified_at', entry.item.classification.classified_at) : update.is('classified_at', null);
        const { data, error } = await update.select('line_item_id');
        if (error) throw new EvidenceStorageError('EVIDENCE_SAVE_FAILED', 'Could not save the refreshed ZATCA evidence. Please retry.');
        if (!data?.length) return NextResponse.json({ error: 'This invoice changed during the lookup. Refresh the results.', code: 'INVOICE_CHANGED' }, { status: 409 });
      } else mockStore.updateClassification(runId, entry.item.row_index, entry.record);
    }
    const refreshed = await loadInvoice(runId, user.id);
    for (const entry of prepared) if (entry) assertEvidenceSaved(entry.record, refreshed?.items.find(item => item.id === entry.item.id)?.classification);
    const processed = refreshed!.items.filter(item => {
      const official = verifiedTariffFor(item.classification);
      return official && official.cdf !== 'REVIEW REQUIRED' && official.regulationStatus !== 'UNKNOWN';
    }).length;
    const status = processed === refreshed!.items.length ? 'completed' : invoice.run.status === 'completed' ? 'failed' : invoice.run.status;
    if (db) {
      const { error } = await db.from('invoice_runs').update({ processed_items: processed, status }).eq('id', runId).eq('user_id', user.id);
      if (error) throw new EvidenceStorageError('PROGRESS_SAVE_FAILED', 'ZATCA evidence was refreshed, but invoice progress could not be updated. Refresh the results.');
    } else { invoice.run.processed_items = processed; invoice.run.status = status; }
    return NextResponse.json({ repaired: prepared.filter(Boolean).length });
  } catch (error) {
    if (error instanceof EvidenceStorageError) return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    return NextResponse.json({ error: 'Could not refresh the ZATCA evidence. Please retry.' }, { status: 500 });
  }
}
