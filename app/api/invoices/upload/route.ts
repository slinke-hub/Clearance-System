import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { parseExcelBuffer, autoDetectColumns } from '@/lib/excel/parser';
import { mapItems } from '@/lib/excel/invoice';
import { storedItems } from '@/lib/invoices';
import { mockStore } from '@/lib/mock/store';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const file = (await req.formData()).get('file');
    if (!(file instanceof File) || !/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: 'Choose an Excel invoice.' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 413 });
    let parsed;
    try { parsed = parseExcelBuffer(Buffer.from(await file.arrayBuffer())); }
    catch { return NextResponse.json({ error: 'Could not read the invoice. Check that the Excel file contains a supported table or commercial invoice.' }, { status: 422 }); }
    if (parsed.rows.length > 2000) return NextResponse.json({ error: 'Maximum 2,000 product lines per invoice.' }, { status: 422 });
    const autoMapping = autoDetectColumns(parsed.headers);
    const runId = crypto.randomUUID();
    const items = mapItems(parsed.rows, autoMapping);
    const run = { id: runId, user_id: user.id, file_name: file.name, status: 'pending' as const,
      total_items: items.length, processed_items: 0, column_mapping: autoMapping as Record<string, string>,
      created_at: new Date().toISOString(), invoice_metadata: parsed.metadata, source_rows: parsed.rows };
    if (isSupabaseConfigured()) {
      const db = await createClient();
      const { error } = await db.from('invoice_runs').insert(run);
      if (error) throw new Error('Could not save invoice. Verify the formatted invoice database migration is installed.');
    } else {
      mockStore.saveRun(run);
      mockStore.saveLineItems(runId, storedItems(runId, items));
    }
    return NextResponse.json({ runId, fileName: file.name, headers: parsed.headers, totalRows: parsed.totalRows,
      sheetName: parsed.sheetName, format: parsed.format, autoMapping, rows: parsed.rows,
      metadata: parsed.metadata, items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 });
  }
}

