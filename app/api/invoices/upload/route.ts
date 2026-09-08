import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExcelBuffer, autoDetectColumns, extractLineItems } from '@/lib/excel/parser';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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

    // Create invoice run record
    const { data: run, error: runError } = await supabase
      .from('invoice_runs')
      .insert({
        user_id: user.id,
        file_name: file.name,
        status: 'pending',
        total_items: parsed.totalRows,
        column_mapping: autoMapping,
      })
      .select()
      .single();

    if (runError || !run) {
      throw new Error(runError?.message || 'Failed to create invoice run');
    }

    // Insert line items
    const lineItemInserts = parsed.rows.map((row) => ({
      run_id: run.id,
      row_index: row.rowIndex,
      item_name: String(row.data[autoMapping.itemName ?? ''] ?? '').trim() || null,
      item_description: String(row.data[autoMapping.itemDescription ?? ''] ?? '').trim() || null,
      quantity: String(row.data[autoMapping.quantity ?? ''] ?? '').trim() || null,
      unit_price: String(row.data[autoMapping.unitPrice ?? ''] ?? '').trim() || null,
      total_price: String(row.data[autoMapping.totalPrice ?? ''] ?? '').trim() || null,
      currency: String(row.data[autoMapping.currency ?? ''] ?? '').trim() || null,
      raw_data: row.data as Record<string, unknown>,
    }));

    if (lineItemInserts.length > 0) {
      await supabase.from('invoice_line_items').insert(lineItemInserts);
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'invoice_uploaded',
      entity_type: 'invoice_run',
      entity_id: run.id,
      metadata: { file_name: file.name, total_rows: parsed.totalRows },
    });

    return NextResponse.json({
      runId: run.id,
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
