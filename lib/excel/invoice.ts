import type { ColumnMapping, ParsedExcelRow } from '@/types';
import { normalizeCurrency, stripUSCurrency } from './currency';

export interface InvoiceMetadata {
  invoiceNumber?: string;
  date?: string;
  supplier?: string;
  customer?: string;
  vessel?: string;
  sailingDate?: string;
  shipment?: string;
  terms?: string;
  payment?: string;
  originStatement?: string;
  currency?: string;
  goodsTotal?: number;
  invoiceTotal?: number;
  charges: { label: string; amount: number }[];
}

export interface ReviewItem {
  rowIndex: number;
  itemName: string;
  itemDescription: string;
  itemCode: string;
  factoryCode: string;
  unit: string;
  contract: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  currency: string;
}

export function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const text = stripUSCurrency(String(value).trim()).replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export function mapItems(rows: ParsedExcelRow[], mapping: Partial<ColumnMapping>): ReviewItem[] {
  const get = (row: ParsedExcelRow, key?: string) => key ? String(row.data[key] ?? '').trim() : '';
  return rows.map(row => ({
    rowIndex: row.rowIndex,
    itemName: get(row, mapping.itemName), itemDescription: get(row, mapping.itemDescription),
    quantity: get(row, mapping.quantity), unitPrice: get(row, mapping.unitPrice),
    totalPrice: get(row, mapping.totalPrice), currency: normalizeCurrency(get(row, mapping.currency)),
    itemCode: get(row, mapping.itemCode ?? 'Item Code'), factoryCode: get(row, mapping.factoryCode ?? 'Factory Code'),
    unit: get(row, 'Unit'), contract: get(row, 'Contract'),
  })).filter(item => item.itemName || item.itemCode || item.factoryCode);
}

export function reviewInvoice(items: ReviewItem[], metadata: InvoiceMetadata) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const units: Record<string, number> = {};
  const codes = new Map<string, number>();
  let goodsTotal = 0;
  let amountsComplete = true;
  for (const item of items) {
    const row = item.rowIndex + 1;
    const qty = numberValue(item.quantity), price = numberValue(item.unitPrice), amount = numberValue(item.totalPrice);
    if (!item.itemName.trim()) errors.push(`Row ${row}: missing product description.`);
    if (metadata.currency && normalizeCurrency(item.currency) !== normalizeCurrency(metadata.currency)) errors.push(`Row ${row}: currency must match the invoice currency (${metadata.currency}).`);
    if (amount === undefined) amountsComplete = false;
    else goodsTotal += amount;
    if (qty !== undefined) units[item.unit || 'Unspecified'] = (units[item.unit || 'Unspecified'] || 0) + qty;
    if (metadata.invoiceNumber && (qty === undefined || price === undefined || amount === undefined)) errors.push(`Row ${row}: quantity, unit price or amount is missing or invalid.`);
    if (qty !== undefined && price !== undefined && amount !== undefined && Math.abs(qty * price - amount) > 0.011) errors.push(`Row ${row}: quantity × price does not match the amount.`);
    if (item.itemCode) {
      if (codes.has(item.itemCode)) warnings.push(`Item code ${item.itemCode} occurs at rows ${codes.get(item.itemCode)} and ${row}; both lines are retained.`);
      else codes.set(item.itemCode, row);
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  goodsTotal = round(goodsTotal);
  const total = round(goodsTotal + metadata.charges.reduce((sum, c) => sum + c.amount, 0));
  if (amountsComplete && metadata.goodsTotal !== undefined && Math.abs(goodsTotal - metadata.goodsTotal) > 0.011) errors.push('Product amounts do not match the invoice goods total.');
  if (amountsComplete && metadata.invoiceTotal !== undefined && Math.abs(total - metadata.invoiceTotal) > 0.011) errors.push('Goods and charges do not match the invoice total.');
  if (!items.length) errors.push('No product lines selected.');
  return { warnings, errors, units, goodsTotal: amountsComplete ? goodsTotal : null, total: amountsComplete ? total : null };
}
