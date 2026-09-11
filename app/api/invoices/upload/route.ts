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
    // Resolve the owner with the same authenticated client that performs the insert.
    // This also avoids using a local demo identity or a second stale cookie snapshot.
    const db = isSupabaseConfigured() ? await createClient() : null;
    const user = db ? (await db.auth.getUser()).data.user : await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Your session has expired. Please sign in again before uploading an invoice.' }, { status: 401 });
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
    if (db) {
      const { error } = await db.from('invoice_runs').insert(run);
      if (error) {
        console.error(`Invoice upload save failed: ${JSON.stringify({ code: error.code, message: error.message })}`);
        if (error.code === '42501') return NextResponse.json({ error: 'Your account could not save this invoice. Please sign in again and retry.', code: 'INVOICE_ACCESS_DENIED' }, { status: 403 });
        return NextResponse.json({ error: 'The invoice could not be saved. Please try again shortly.', code: 'INVOICE_SAVE_FAILED' }, { status: 503 });
      }
    } else {
      mockStore.saveRun(run);
      mockStore.saveLineItems(runId, storedItems(runId, items));
    }
    const response = NextResponse.json({ runId, fileName: file.name, headers: parsed.headers, totalRows: parsed.totalRows,
      sheetName: parsed.sheetName, format: parsed.format, autoMapping, rows: parsed.rows,
      metadata: parsed.metadata, items });
    if (db) {
      response.cookies.delete('clearance_admin_session');
      response.cookies.delete('clearance_client_session');
    }
    return response;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 });
  }
}

