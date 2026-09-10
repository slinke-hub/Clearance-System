import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { mockStore, type MockRun, type MockLineItem } from '@/lib/mock/store';
import type { ReviewItem } from '@/lib/excel/invoice';
import { normalizeCurrency } from '@/lib/excel/currency';

export function storedItems(runId: string, items: ReviewItem[]): MockLineItem[] {
  return items.map(i => ({ id: crypto.randomUUID(), run_id: runId, row_index: i.rowIndex,
    item_name: i.itemName, item_description: i.itemDescription, quantity: i.quantity,
    unit_price: i.unitPrice, total_price: i.totalPrice, currency: normalizeCurrency(i.currency),
    item_code: i.itemCode, unit: i.unit, contract: i.contract, raw_data: { ...i },
  }));
}

export async function loadInvoice(runId: string, userId: string): Promise<{ run: MockRun; items: MockLineItem[] } | null> {
  if (!isSupabaseConfigured()) {
    const run = mockStore.getRun(runId);
    return run?.user_id === userId ? { run, items: mockStore.getLineItems(runId) } : null;
  }
  const db = await createClient();
  const { data: run, error } = await db.from('invoice_runs').select('*').eq('id', runId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) return null;
  const { data, error: itemError } = await db.from('invoice_line_items').select('*, classification:classification_results(*)').eq('run_id', runId).order('row_index');
  if (itemError) throw new Error(itemError.message);
  return { run, items: (data || []).map(i => ({ ...i, classification: Array.isArray(i.classification) ? i.classification[0] : i.classification })) };
}
