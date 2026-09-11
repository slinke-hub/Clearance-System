import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { loadInvoice } from '@/lib/invoices';
import { generateEnrichedExcel } from '@/lib/excel/exporter';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { runId } = await params;
    const invoice = await loadInvoice(runId, user.id);
    if (!invoice || !invoice.items.length) return NextResponse.json({ error: 'Invoice data not found' }, { status: 404 });
    const buffer = await generateEnrichedExcel(invoice.items, invoice.run.file_name, invoice.run.invoice_metadata, invoice.run.source_rows);
    return new NextResponse(new Uint8Array(buffer), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename=ClearanceIQ_Invoice.xlsx",
    } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 500 });
  }
}
