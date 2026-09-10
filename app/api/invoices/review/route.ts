import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { loadInvoice, storedItems } from '@/lib/invoices';
import { reviewInvoice } from '@/lib/excel/invoice';
import { reviewSchema } from '@/lib/excel/review-schema';
import { mockStore } from '@/lib/mock/store';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const input = reviewSchema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Invalid reviewed invoice data.' }, { status: 400 });
    const { runId, items, mapping } = input.data;
    const invoice = await loadInvoice(runId, user.id);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const sourceRows = new Set(invoice.run.source_rows?.map(r => r.rowIndex));
    if (new Set(items.map(i => i.rowIndex)).size !== items.length || items.some(i => !sourceRows.has(i.rowIndex))) return NextResponse.json({ error: 'Invalid source rows.' }, { status: 400 });
    const review = reviewInvoice(items, invoice.run.invoice_metadata || { charges: [] });
    if (review.errors.length) return NextResponse.json({ error: review.errors.join(' ') }, { status: 422 });
    const saved = storedItems(runId, items);
    if (isSupabaseConfigured()) {
      const db = await createClient();
      const { error } = await db.rpc('save_invoice_review', { target_run: runId, reviewed_items: saved, mapping });
      if (error) throw new Error('Could not save reviewed items. Check the invoice database migration.');
    } else {
      mockStore.saveLineItems(runId, saved);
      invoice.run.column_mapping = mapping;
      invoice.run.total_items = items.length;
      invoice.run.processed_items = 0;
      invoice.run.status = 'pending';
      invoice.run.reviewed_at = new Date().toISOString();
    }
    return NextResponse.json({ success: true, review });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save invoice' }, { status: 500 });
  }
}
