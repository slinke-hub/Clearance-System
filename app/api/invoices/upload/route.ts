import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { parseExcelBuffer, autoDetectColumns } from '@/lib/excel/parser';
import { mockStore } from '@/lib/mock/store';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: 'Only .xlsx and .xls files are supported' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseExcelBuffer(Buffer.from(buffer));
    const autoMapping = autoDetectColumns(parsed.headers);

    const runId = crypto.randomUUID();

    // Line items structure
    const lineItems = parsed.rows.map((row) => ({
      id: crypto.randomUUID(),
      run_id: runId,
      row_index: row.rowIndex,
      item_name: String(row.data[autoMapping.itemName ?? ''] ?? '').trim() || null,
      item_description: String(row.data[autoMapping.itemDescription ?? ''] ?? '').trim() || null,
      quantity: String(row.data[autoMapping.quantity ?? ''] ?? '').trim() || null,
      unit_price: String(row.data[autoMapping.unitPrice ?? ''] ?? '').trim() || null,
      total_price: String(row.data[autoMapping.totalPrice ?? ''] ?? '').trim() || null,
      currency: String(row.data[autoMapping.currency ?? ''] ?? '').trim() || null,
      raw_data: row.data as Record<string, unknown>,
    }));

    // Save to mockStore for resilient offline/dev access
    mockStore.saveRun({
      id: runId,
      user_id: user.id,
      file_name: file.name,
      status: 'pending',
      total_items: parsed.totalRows,
      processed_items: 0,
      column_mapping: autoMapping as Record<string, string>,
      created_at: new Date().toISOString(),
    });
    mockStore.saveLineItems(runId, lineItems);

    // Also persist to Supabase if connected
    try {
      const supabase = await createClient();
      await supabase.from('invoice_runs').insert({
        id: runId,
        user_id: user.id,
        file_name: file.name,
        status: 'pending',
        total_items: parsed.totalRows,
        column_mapping: autoMapping,
      });

      if (lineItems.length > 0) {
        await supabase.from('invoice_line_items').insert(lineItems);
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'invoice_uploaded',
        entity_type: 'invoice_run',
        entity_id: runId,
        metadata: { file_name: file.name, total_rows: parsed.totalRows },
      });
    } catch {
      // Supabase offline/mock mode — mockStore handled it
    }

    return NextResponse.json({
      runId,
      fileName: file.name,
      headers: parsed.headers,
      totalRows: parsed.totalRows,
      sheetName: parsed.sheetName,
      autoMapping,
      preview: parsed.rows.slice(0, 5).map((r) => r.data),
    });
  } catch (err: unknown) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
