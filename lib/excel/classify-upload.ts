import type { ColumnMapping, ZatcaClassification } from '@/types';
import { reviewInvoice, type InvoiceMetadata, type ReviewItem } from './invoice';

// Explicit upload values avoid using React state from the previous invoice.
export async function classifyUploadedInvoice(
  invoice: { runId: string; metadata: InvoiceMetadata },
  mapping: Partial<ColumnMapping>,
  items: ReviewItem[],
  onProgress: (percent: number) => void,
  request: typeof fetch = fetch,
): Promise<ZatcaClassification[]> {
  if (!mapping.itemName) throw new Error('The product description column could not be identified. Select it below to continue.');
  const review = reviewInvoice(items, invoice.metadata);
  if (review.errors.length) throw new Error(review.errors.join(' '));
  const saved = await request('/api/invoices/review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: invoice.runId, mapping, items }),
  });
  const savedBody = await saved.json();
  if (!saved.ok) throw new Error(savedBody.error || 'Could not save invoice items.');
  const classifications: ZatcaClassification[] = [];
  // Research takes several source requests; keep each HTTP batch within one worker wave.
  for (let offset = 0; offset < items.length; offset += 4) {
    const batchRows = items.slice(offset, offset + 4).map(i => i.rowIndex);
    const response = await request('/api/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: invoice.runId, batchRows }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Classification could not be completed. Please retry.');
    if (!Array.isArray(body.classifications) || body.classifications.length !== batchRows.length ||
        JSON.stringify(body.rowIndexes) !== JSON.stringify(batchRows)) {
      throw new Error('Classification results did not match the invoice rows. Please retry.');
    }
    classifications.push(...body.classifications);
    onProgress(Math.round(classifications.length / items.length * 100));
  }
  return classifications;
}
