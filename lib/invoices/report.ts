import type { MockLineItem, MockRun } from '@/lib/mock/store';
import { inspectTariffEvidence, TARIFF_SOURCE } from '@/lib/zatca/tariff';
import { MAZDA_REFERENCE_SOURCE } from '@/lib/ai/product-research';
import { factoryCodeFor } from '@/lib/excel/item-fields';

export function invoiceReport(run: MockRun, items: MockLineItem[]) {
  const sourceByRow = new Map(run.source_rows?.map(row => [row.rowIndex, row.data]));
  return {
    id: run.id, fileName: run.file_name, status: run.status,
    invoiceNumber: run.invoice_metadata?.invoiceNumber || '',
    currency: run.invoice_metadata?.currency || '', createdAt: run.created_at,
    items: items.map(item => {
      const stored = item.classification;
      const raw = stored?.raw_ai_response?.tariffEvidence;
      const evidence = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const productEvidence = Array.isArray(evidence.productEvidence) ? evidence.productEvidence.filter((source): source is { reference: string; description: string; sourceUrl: string; retrievedAt: string } => Boolean(source && source.sourceUrl === MAZDA_REFERENCE_SOURCE && typeof source.reference === 'string' && typeof source.description === 'string' && typeof source.retrievedAt === 'string')) : [];
      const check = inspectTariffEvidence(stored);
      const official = check.ok ? check.classification : undefined;
      return {
        rowIndex: item.row_index, name: item.item_name || '', description: item.item_description || '',
        itemCode: item.item_code || '', factoryCode: factoryCodeFor(item, sourceByRow.get(item.row_index)),
        hsCode: official?.hsCode || '', heading: official?.hsCode.slice(0, 4) || '',
        duty: official?.cdf || 'REVIEW REQUIRED', regulation: official?.regulationStatus || 'UNKNOWN',
        zatcaName: official?.standardizedZatcaName || '',
        procedures: official?.tariffEvidence?.procedures || [],
        importStatus: official?.tariffEvidence?.importStatus || '',
        effectiveDate: official?.tariffEvidence?.effectiveDate || '', retrievedAt: official?.tariffEvidence?.retrievedAt || '',
        note: check.ok ? official!.tariffEvidence!.note : check.message,
        repairable: !check.ok && check.code === 'LOOKUP_INVALID',
        sourceUrl: TARIFF_SOURCE, verified: Boolean(official), productEvidence,
      };
    }),
  };
}
export type InvoiceReport = ReturnType<typeof invoiceReport>;
