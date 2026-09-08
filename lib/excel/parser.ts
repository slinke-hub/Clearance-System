import * as XLSX from 'xlsx';
import type { ColumnMapping, ParsedExcelRow } from '@/types';

export interface ParseResult {
  headers: string[];
  rows: ParsedExcelRow[];
  sheetName: string;
  totalRows: number;
}

/**
 * Parse an Excel file buffer and return headers + rows.
 */
export function parseExcelBuffer(buffer: Buffer | ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true, cellDates: true });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('No sheets found in the Excel file.');
  }

  // Convert to array of objects
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  if (rawData.length === 0) {
    throw new Error('The Excel file appears to be empty.');
  }

  const headers = Object.keys(rawData[0]);
  const rows: ParsedExcelRow[] = rawData.map((row, index) => ({
    rowIndex: index,
    data: row as Record<string, string | number | null>,
  }));

  return {
    headers,
    rows,
    sheetName,
    totalRows: rows.length,
  };
}

/**
 * Auto-detect column mapping based on common header patterns.
 */
export function autoDetectColumns(headers: string[]): Partial<ColumnMapping> {
  const normalized = headers.map((h) => ({ original: h, lower: h.toLowerCase().trim() }));

  const find = (patterns: string[]) =>
    normalized.find(({ lower }) => patterns.some((p) => lower.includes(p)))?.original;

  return {
    itemName: find(['item name', 'item', 'product name', 'description', 'goods', 'commodity', 'item description', 'product']),
    itemDescription: find(['description', 'details', 'spec', 'notes', 'remarks']),
    quantity: find(['qty', 'quantity', 'units', 'count', 'pcs', 'pieces']),
    unitPrice: find(['unit price', 'unit cost', 'price/unit', 'rate', 'price per']),
    totalPrice: find(['total', 'amount', 'total price', 'total cost', 'subtotal', 'line total']),
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
      currency: String(row.data[mapping.currency ?? ''] ?? '').trim(),
      rawData: row.data,
    }));
}
