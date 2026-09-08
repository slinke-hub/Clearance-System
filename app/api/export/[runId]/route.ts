import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { generateEnrichedExcel } from '@/lib/excel/exporter';
import { mockStore } from '@/lib/mock/store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { runId } = await params;

    let fileName = 'Invoice';
    let enrichedItems: any[] = [];

    // 1. Try fetching from Supabase if connected
    try {
      const supabase = await createClient();
      const { data: run } = await supabase
        .from('invoice_runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (run) {
        fileName = run.file_name;
        const { data: lineItems } = await supabase
          .from('invoice_line_items')
          .select(`
            *,
            classification:classification_results(*)
          `)
          .eq('run_id', runId)
          .order('row_index');

        if (lineItems && lineItems.length > 0) {
          enrichedItems = lineItems.map((item) => ({
            ...item,
            classification: Array.isArray(item.classification)
              ? item.classification[0]
              : item.classification,
          }));
        }
      }
    } catch {}

    // 2. Fallback to mockStore
    if (enrichedItems.length === 0) {
      const mockRun = mockStore.getRun(runId);
      if (mockRun) {
        fileName = mockRun.file_name;
        enrichedItems = mockStore.getLineItems(runId);
      }
    }

    if (enrichedItems.length === 0) {
      return NextResponse.json({ error: 'Invoice data not found' }, { status: 404 });
    }

    const buffer = generateEnrichedExcel(enrichedItems, fileName);
    const exportFileName = `ClearanceIQ_${fileName.replace(/\.(xlsx|xls)$/i, '')}_ZATCA.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${exportFileName}"`,
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
