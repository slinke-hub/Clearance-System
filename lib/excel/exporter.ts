import * as XLSX from 'xlsx';
import type { InvoiceLineItem, ClassificationResult } from '@/types';

export interface ExportRow {
  'Row #': number;
  'Item Name': string;
  'Item Description': string;
  'Quantity': string;
  'Unit Price': string;
  'Total Price': string;
  'Currency': string;
  'HS Code (ZATCA)': string;
  'Customs Duty (CDF)': string;
  'Regulation Status': string;
  'Standardized ZATCA Name': string;
  'Confidence Score': string;
  'Classification Date': string;
}

/**
 * Generate a fully enriched Excel file with ZATCA classifications appended.
 * Returns a Buffer ready to be sent as a file download.
 */
export function generateEnrichedExcel(
  items: (InvoiceLineItem & { classification?: ClassificationResult })[],
  originalFileName: string
): Buffer {
  const rows: ExportRow[] = items.map((item) => ({
    'Row #': item.row_index + 1,
    'Item Name': item.item_name ?? '',
    'Item Description': item.item_description ?? '',
    'Quantity': item.quantity ?? '',
    'Unit Price': item.unit_price ?? '',
    'Total Price': item.total_price ?? '',
    'Currency': item.currency ?? '',
    'HS Code (ZATCA)': item.classification?.hs_code ?? 'N/A',
    'Customs Duty (CDF)': item.classification?.cdf ?? 'N/A',
    'Regulation Status': item.classification?.regulation_status ?? 'UNKNOWN',
    'Standardized ZATCA Name': item.classification?.standardized_name ?? '',
    'Confidence Score': item.classification?.confidence_score != null
      ? `${Math.round(item.classification.confidence_score * 100)}%`
      : 'N/A',
    'Classification Date': item.classification?.classified_at
      ? new Date(item.classification.classified_at).toLocaleDateString('en-SA')
      : '',
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Column widths
  const colWidths = [
    { wch: 6 },  // Row #
    { wch: 35 }, // Item Name
    { wch: 45 }, // Item Description
    { wch: 10 }, // Quantity
    { wch: 12 }, // Unit Price
    { wch: 12 }, // Total Price
    { wch: 10 }, // Currency
    { wch: 18 }, // HS Code
    { wch: 18 }, // CDF
    { wch: 18 }, // Regulation Status
    { wch: 45 }, // Standardized Name
    { wch: 16 }, // Confidence
    { wch: 20 }, // Date
  ];

  worksheet['!cols'] = colWidths;

  // Style header row
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!worksheet[cellAddress]) continue;
    worksheet[cellAddress].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '006C67' } },
      alignment: { horizontal: 'center' },
    };
  }

  // Add metadata sheet
  const metaData = [
    ['KSA Customs Clearance System — ClearanceIQ'],
    ['Generated:', new Date().toLocaleString('en-SA')],
    ['Source File:', originalFileName],
    ['Total Items:', items.length],
    ['Classified:', items.filter((i) => i.classification?.hs_code).length],
  ];

  const metaSheet = XLSX.utils.aoa_to_sheet(metaData);
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Metadata');
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ZATCA Classification');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', bookSST: false });
  return buffer;
}
