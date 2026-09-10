import * as XLSX from 'xlsx';
import type { ClassificationResult } from '@/types';
import type { InvoiceMetadata } from './invoice';
import { normalizeCurrency } from './currency';
import { TARIFF_SOURCE } from '@/lib/zatca/tariff';

function hasOfficialEvidence(item: ExportableLineItem) {
  const evidence = item.classification?.raw_ai_response?.tariffEvidence as import('@/lib/zatca/tariff').TariffEvidence | undefined;
  return evidence?.sourceUrl === TARIFF_SOURCE && Boolean(evidence.retrievedAt) && evidence.record?.HarmonizedCode === item.classification?.hs_code && /^\d{12}$/.test(item.classification?.hs_code || '');
}

export interface ExportableLineItem {
  row_index: number;
  item_name?: string | null;
  item_description?: string | null;
  quantity?: string | null;
  unit_price?: string | null;
  total_price?: string | null;
  currency?: string | null;
  item_code?: string | null;
  unit?: string | null;
  contract?: string | null;
  classification?: Partial<ClassificationResult>;
}

export interface ExportRow {
  'Row #': number;
  'Item Name': string;
  'Item Description': string;
  'Quantity': string;
  'Unit Price': string;
  'Total Price': string;
  'Currency': string;
  'HS CODES': string;
  'CUSTOMS DUTY FEES': string;
  'REGULATED / NON-REGULATED': string;
  'Standardized ZATCA Name': string;
  'Confidence Score': string;
  'Classification Date': string;
}

/**
 * Generate a fully enriched Excel file with ZATCA classifications appended.
 * Returns a Buffer ready to be sent as a file download.
 */
export function generateEnrichedExcel(
  items: ExportableLineItem[],
  originalFileName: string,
  metadata?: InvoiceMetadata
): Buffer {
  const rows: ExportRow[] = items.map((item) => ({
    'Row #': item.row_index + 1,
    'Item Code': item.item_code ?? '',
    'Unit': item.unit ?? '',
    'Contract': item.contract ?? '',
    'Item Name': item.item_name ?? '',
    'Item Description': item.item_description ?? '',
    'Quantity': item.quantity ?? '',
    'Unit Price': item.unit_price ?? '',
    'Total Price': item.total_price ?? '',
    'Currency': normalizeCurrency(item.currency),
    'HS CODES': hasOfficialEvidence(item) ? item.classification!.hs_code! : 'REVIEW REQUIRED',
    'CUSTOMS DUTY FEES': hasOfficialEvidence(item) ? item.classification?.cdf ?? 'REVIEW REQUIRED' : 'REVIEW REQUIRED',
    'REGULATED / NON-REGULATED': hasOfficialEvidence(item) && item.classification?.regulation_status !== 'UNKNOWN' ? item.classification?.regulation_status ?? 'REVIEW REQUIRED' : 'REVIEW REQUIRED',
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
    { wch: 22 }, // Item Code
    { wch: 10 }, // Unit
    { wch: 18 }, // Contract
    { wch: 35 }, // Item Name
    { wch: 45 }, // Item Description
    { wch: 10 }, // Quantity
    { wch: 12 }, // Unit Price
    { wch: 12 }, // Total Price
    { wch: 10 }, // Currency
    { wch: 18 }, // HS Code
    { wch: 24 }, // CDF
    { wch: 32 }, // Regulation Status
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
    ['Tariff records sourced from ZATCA:', items.filter(hasOfficialEvidence).length],
    ['Duty column:', 'Published tariff rate. Payable duty amounts require customs valuation and applicable conditions.'],
  ];

  const metaSheet = XLSX.utils.aoa_to_sheet(metaData);
  if (metadata) {
    const details = Object.entries(metadata).filter(([key]) => key !== 'charges').map(([key, value]) => [key, value]);
    XLSX.utils.sheet_add_aoa(metaSheet, [...details, [], ['Charges', 'Amount'], ...metadata.charges.map(c => [c.label, c.amount])], { origin: 'A8' });
    metaSheet['!cols'] = [{ wch: 45 }, { wch: 80 }];
  }
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Metadata');
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ZATCA Classification');
  const evidenceRows = items.map(item => {
    const evidence = item.classification?.raw_ai_response?.tariffEvidence as import('@/lib/zatca/tariff').TariffEvidence | undefined;
    return { 'Row #': item.row_index + 1, 'HS CODES': item.classification?.hs_code || '',
      'Official source': evidence?.sourceUrl || '', 'Lookup URL': evidence?.lookupUrl || '',
      'Retrieved at': evidence?.retrievedAt || '', 'Effective date': evidence?.effectiveDate || '',
      'Import status': evidence?.importStatus || '', 'Required procedures': evidence?.procedures?.join('\n') || '',
      'Review note': evidence?.note || 'No official tariff evidence recorded. Review required.',
    };
  });
  const evidenceSheet = XLSX.utils.json_to_sheet(evidenceRows);
  evidenceSheet['!cols'] = [6, 18, 45, 45, 25, 25, 40, 80, 80].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, evidenceSheet, 'Tariff Sources');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', bookSST: false });
  return buffer;
}
