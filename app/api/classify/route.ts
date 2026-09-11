import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { loadInvoice } from '@/lib/invoices';
import { mockStore } from '@/lib/mock/store';
import { classifyItemsBatch, isNvidiaNimConfigured } from '@/lib/ai/nvidia-nim-classifier';
import { factoryCodeFor } from '@/lib/excel/item-fields';
import { assertEvidenceSaved, classificationRecordFor, EvidenceStorageError } from '@/lib/zatca/evidence-storage';
import { verifiedTariffFor } from '@/lib/zatca/tariff';
import { repairLookupEvidence } from '@/lib/zatca/repair-evidence';

export const maxDuration = 300;
const schema = z.object({ runId: z.string().uuid(),
  batchRows: z.array(z.number().int().nonnegative()).min(1).max(5),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const input = schema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Invalid reviewed invoice data.' }, { status: 400 });
    const { runId, batchRows } = input.data;
    const invoice = await loadInvoice(runId, user.id);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (!invoice.run.reviewed_at) return NextResponse.json({ error: 'Save the reviewed invoice before classification.' }, { status: 409 });
    if (new Set(batchRows).size !== batchRows.length) return NextResponse.json({ error: 'Invalid source rows.' }, { status: 400 });
    if (!isNvidiaNimConfigured()) return NextResponse.json({ error: 'AI classification is not configured for this deployment.' }, { status: 503 });
    const db = isSupabaseConfigured() ? await createClient() : null;
    if (db && user.role !== 'admin' && user.role !== 'superadmin' && user.plan !== 'enterprise') {
      const { data: sub, error } = await db.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();
      if (error) return NextResponse.json({ error: 'Could not check your subscription. Please try again.', code: 'SUBSCRIPTION_LOOKUP_FAILED' }, { status: 503 });
      if (!sub) return NextResponse.json({ error: 'Your account subscription has not been set up. Please contact the administrator.', code: 'SUBSCRIPTION_NOT_PROVISIONED' }, { status: 409 });
      if (sub.status !== 'active') return NextResponse.json({ error: 'Your subscription is inactive. Please contact the administrator.', code: 'SUBSCRIPTION_INACTIVE' }, { status: 403 });
      if (sub.plan !== 'enterprise' && sub.invoices_used >= sub.monthly_limit) return NextResponse.json({ error: 'Your monthly invoice limit has been reached.', code: 'MONTHLY_LIMIT_REACHED' }, { status: 403 });
    }
    const saved = invoice.items;
    const batch = batchRows.map(row => saved.find(i => i.row_index === row));
    if (batch.some(i => !i)) return NextResponse.json({ error: 'Review has changed. Restart classification.' }, { status: 409 });
    const invoiceContext = [...new Set(saved.map(i => i.item_name).filter((name): name is string => Boolean(name)))].slice(0, 15).map(name => name.slice(0, 180));
    const sourceByRow = new Map(invoice.run.source_rows?.map(row => [row.rowIndex, row.data]));
    const matched = await classifyItemsBatch(batch.map(i => {
      const name = i!.item_description || i!.item_name || '';
      const secondary = (i!.item_description && i!.item_name && i!.item_description !== i!.item_name) ? i!.item_name : '';
      return {
        rowIndex: i!.row_index,
        itemName: name,
        itemDescription: [secondary, i!.item_code, factoryCodeFor(i!, sourceByRow.get(i!.row_index))].filter(Boolean).join(' | '),
        invoiceContext
      };
    }), 4);
    if (matched.length !== batch.length) throw new EvidenceStorageError('RESULT_COUNT_MISMATCH', 'The matching service did not return every invoice row. Please retry.');
    const prepared = await Promise.all(matched.map(async (c, index) => classificationRecordFor(await repairLookupEvidence(c), batch[index]!.id, runId)));
    const records = prepared.map(p => p.record);
    if (db) {
      const { error } = await db.from('classification_results').upsert(records, { onConflict: 'line_item_id' });
      if (error) throw new Error('Could not save classification results.');
    } else records.forEach((r, index) => mockStore.updateClassification(runId, batchRows[index], r));
    const refreshed = await loadInvoice(runId, user.id);
    for (const record of records) assertEvidenceSaved(record, refreshed?.items.find(i => i.id === record.line_item_id)?.classification);
    const classifications = prepared.map(p => p.classification);
    const processed = refreshed!.items.filter(i => {
      const official = verifiedTariffFor(i.classification);
      return official && official.cdf !== 'REVIEW REQUIRED' && official.regulationStatus !== 'UNKNOWN';
    }).length;
    const lastBatch = batchRows.includes(saved[saved.length - 1].row_index);
    const status = processed === saved.length ? 'completed' : lastBatch ? 'failed' : 'processing';
    if (db) {
      const { error } = await db.from('invoice_runs').update({ status, processed_items: processed }).eq('id', runId).eq('user_id', user.id);
      if (error) throw new Error('Could not update invoice progress.');
    } else { invoice.run.status = status; invoice.run.processed_items = processed; }
    return NextResponse.json({ classifications, rowIndexes: batchRows, status });
  } catch (err) {
    if (err instanceof EvidenceStorageError) return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Classification failed' }, { status: 500 });
  }
}

