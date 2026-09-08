import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEnrichedExcel } from '@/lib/excel/exporter';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { runId } = await params;

    // Get invoice run
    const { data: run } = await supabase
      .from('invoice_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single();

    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Get line items + classifications
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select(`
        *,
        classification:classification_results(*)
      `)
      .eq('run_id', runId)
      .order('row_index');

    if (!lineItems) return NextResponse.json({ error: 'No items found' }, { status: 404 });

    // Flatten classification result (Supabase returns array for joined tables)
    const enrichedItems = lineItems.map((item) => ({
      ...item,
      classification: Array.isArray(item.classification)
        ? item.classification[0]
        : item.classification,
    }));

    const buffer = generateEnrichedExcel(enrichedItems, run.file_name);

    const fileName = `ClearanceIQ_${run.file_name.replace(/\.(xlsx|xls)$/i, '')}_ZATCA.xlsx`;

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'invoice_exported',
      entity_type: 'invoice_run',
      entity_id: runId,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (err: unknown) {
    console.error('Export error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    );
  }
}
