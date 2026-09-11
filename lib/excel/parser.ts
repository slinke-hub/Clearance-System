import * as XLSX from 'xlsx';
import type { ColumnMapping, ParsedExcelRow } from '@/types';
import { numberValue, type InvoiceMetadata } from './invoice';
import { hasUSCurrencyLabel, normalizeCurrency } from './currency';

export interface ParseResult {
  headers: string[];
  rows: ParsedExcelRow[];
  sheetName: string;
  totalRows: number;
  metadata: InvoiceMetadata;
  format: 'table' | 'commercial-invoice';
}

/**
 * Parse an Excel file buffer and return headers + rows.
 */
export function parseExcelBuffer(buffer: Buffer | ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true, cellDates: true });

  // Use the first sheet
  const sheetName = workbook.SheetNames.find(name => workbook.Sheets[name]?.['!ref']) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('No sheets found in the Excel file.');
  }

  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null, raw: true, blankrows: true });
  const headerRow = grid.findIndex(row => row.some(c => String(c).trim() === 'Cust_Item_No.') && row.some(c => String(c).trim() === 'Description'));
  if (headerRow >= 0 && grid.some(row => row.some(c => String(c).trim() === 'COMMERCIAL INVOICE'))) {
    return parseCommercialInvoice(grid, sheetName, headerRow);
  }

  const headerKeywords = ['description', 'item', 'product', 'qty', 'quantity', 'price', 'amount', 'وصف', 'صنف'];
  let tableHeaderRow = 0;
  let maxScore = 0;

  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const row = grid[i] || [];
    let score = 0;
    for (const cell of row) {
      if (typeof cell === 'string') {
        const lower = cell.toLowerCase().trim();
        if (headerKeywords.some(kw => lower.includes(kw))) score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      tableHeaderRow = i;
    }
  }

  // Convert to array of objects
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
    range: tableHeaderRow,
  });

  if (rawData.length === 0) {
    throw new Error('The Excel file appears to be empty.');
  }

  const headers = Object.keys(rawData[0]);
  const rows: ParsedExcelRow[] = rawData.map((row, index) => ({
    rowIndex: (row as { __rowNum__?: number }).__rowNum__ ?? index + 1,
    data: row as Record<string, string | number | null>,
  }));
  // Some suppliers put the currency in the price heading instead of a separate column.
  const currencyColumn = autoDetectColumns(headers).currency;
  const usPriceHeading = headers.some(h => /price|amount|total|cost/i.test(h) && hasUSCurrencyLabel(h));
  if (!currencyColumn && usPriceHeading) {
    headers.push('Currency');
    rows.forEach(row => { row.data.Currency = 'USD'; });
  }

  return {
    headers,
    rows,
    sheetName,
    totalRows: rows.length,
    metadata: { charges: [] },
    format: 'table',
  };
}

function parseCommercialInvoice(grid: (string | number | null)[][], sheetName: string, headerRow: number): ParseResult {
  const header = grid[headerRow].map(v => String(v ?? '').trim());
  const col = (name: string) => header.indexOf(name);
  const seq = col('Seq.'), code = col('Cust_Item_No.'), desc = col('Description');
  const qty = col('Quantity'), price = col('Unit Price'), amount = col('Amount');
  const factoryHeader = autoDetectColumns(header).factoryCode;
  const factory = factoryHeader ? col(factoryHeader) : -1;
  if ([seq, code, desc, qty, price, amount].some(c => c < 0)) throw new Error('Invoice headings are incomplete.');
  const metadata: InvoiceMetadata = { charges: [] };
  const cells = grid.flat().filter(v => v !== null).map(String);
  const field = (pattern: RegExp) => cells.map(v => v.match(pattern)?.[1]?.trim()).find(Boolean);
  metadata.invoiceNumber = field(/^Invoice No\.:\s*(.+)/i);
  metadata.date = field(/^Date\s*:\s*(.+)/i);
  metadata.supplier = grid.slice(0, headerRow).flat().find(v => typeof v === 'string' && /\b(INC\.|LTD\.|GROUP)\b/i.test(v)) as string | undefined;
  metadata.customer = field(/^Messrs\.\s*:\s*(.+)/i);
  metadata.vessel = field(/^Vessel\s*:\s*(.+)/i);
  metadata.sailingDate = field(/^Sailing On\/About:\s*(.+)/i);
  metadata.shipment = field(/^Shipment:\s*(.+)/i);
  metadata.terms = field(/^Terms of Shipment\s*:\s*(.+)/i);
  metadata.payment = field(/^Payment\s*:\s*(.+)/i);
  metadata.originStatement = cells.find(v => /WE CERTIFY.*ORIGIN/i.test(v));
  metadata.currency = cells.some(hasUSCurrencyLabel) ? 'USD' : undefined;
  const rows: ParsedExcelRow[] = [];
  let contract = '', inTotals = false;
  let current: ParsedExcelRow | undefined;
  for (let index = headerRow + 1; index < grid.length; index++) {
    const row = grid[index];
    const text = row.filter(v => v !== null).join(' ').trim();
    const contractMatch = text.match(/S\/C NO\.\s*([^\s]+)/i);
    if (contractMatch) { contract = contractMatch[1]; current = undefined; continue; }
    if (/^Total\s*:/i.test(String(row[seq] ?? ''))) {
      metadata.goodsTotal = numberValue(row[amount]); inTotals = true; current = undefined; continue;
    }
    if (inTotals) {
      const value = numberValue(row[amount]);
      if (/Total Amount/i.test(text)) metadata.invoiceTotal = value;
      else if (value !== undefined) metadata.charges.push({ label: row.slice(0, amount).filter(v => v !== null).join(' ').trim(), amount: value });
      continue;
    }
    if (/^\d+$/.test(String(row[seq] ?? '').trim()) && row[code] && row[desc]) {
      current = { rowIndex: index, data: {
        'Item Name': String(row[desc]), 'Item Description': '', 'Item Code': String(row[code]),
        'Factory Code': factory >= 0 ? String(row[factory] ?? '') : '',
        Quantity: row[qty], Unit: row[qty + 1], 'Unit Price': row[price], 'Total Price': row[amount],
        Currency: metadata.currency ?? '', Contract: contract,
      } };
      rows.push(current);
    } else if (current && row[desc] && row.every((v, i) => v === null || v === '' || i === desc)) {
      current.data['Item Description'] = [current.data['Item Description'], row[desc]].filter(Boolean).join(' | ');
    } else if (text) current = undefined;
  }
  if (!rows.length) throw new Error('No products found in the commercial invoice.');
  return { headers: Object.keys(rows[0].data), rows, sheetName, totalRows: rows.length, metadata, format: 'commercial-invoice' };
}

/**
 * Auto-detect column mapping based on common header patterns.
 */
export function autoDetectColumns(headers: string[]): Partial<ColumnMapping> {
  const normalized = headers.map(original => ({ original, lower: original.toLowerCase().replace(/[_./()#-]+/g, ' ').replace(/\s+/g, ' ').trim() }));
  // Prefer explicit labels regardless of column order; "Item Code" is never a description.
  const find = (patterns: string[], allowSuffix = false) => {
    for (const pattern of patterns) {
      const exact = normalized.find(h => h.lower === pattern);
      if (exact) return exact.original;
    }
    return allowSuffix ? normalized.find(h => patterns.some(p => h.lower.startsWith(p + ' ')))?.original : undefined;
  };

  return {
    itemName: find(['item name', 'product name', 'item description', 'product description', 'goods description', 'description', 'goods', 'commodity', 'product', 'item', 'وصف الصنف', 'اسم الصنف', 'الوصف']),
    itemDescription: find(['item description', 'product description', 'description', 'details', 'specifications', 'spec', 'notes', 'remarks', 'الوصف']),
    itemCode: find(['item code', 'cust item no', 'customer item no', 'customer item number', 'customer code', 'item no', 'item number', 'product code', 'sku', 'رمز الصنف']),
    factoryCode: find(['factory code', 'factory item code', 'factory no', 'factory part no', 'factory part number', 'manufacturer code', 'manufacturer part number', 'manufacturer part no', 'mfr part no', 'mpn', 'oem code', 'oem part number', 'رمز المصنع']),
    quantity: find(['qty', 'quantity', 'units', 'count', 'pcs', 'pieces']),
    unitPrice: find(['unit price', 'unit cost', 'price unit', 'rate', 'price per'], true),
    totalPrice: find(['total price', 'total cost', 'line total', 'amount', 'subtotal', 'total'], true),
    currency: find(['currency', 'curr', 'ccy']),
  };
}

/**
 * Extract line items from parsed rows using a column mapping.
 */
export function extractLineItems(
  rows: ParsedExcelRow[],
  mapping: ColumnMapping
): Array<{
  rowIndex: number;
  itemName: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  currency: string;
  rawData: Record<string, string | number | null>;
}> {
  return rows
    .filter((row) => {
      const itemName = row.data[mapping.itemName];
      return itemName !== null && itemName !== undefined && String(itemName).trim() !== '';
    })
    .map((row) => ({
      rowIndex: row.rowIndex,
      itemName: String(row.data[mapping.itemName] ?? '').trim(),
      itemDescription: String(row.data[mapping.itemDescription ?? ''] ?? '').trim(),
      quantity: String(row.data[mapping.quantity ?? ''] ?? '').trim(),
      unitPrice: String(row.data[mapping.unitPrice ?? ''] ?? '').trim(),
      totalPrice: String(row.data[mapping.totalPrice ?? ''] ?? '').trim(),
      currency: normalizeCurrency(row.data[mapping.currency ?? '']),
      rawData: row.data,
    }));
}
