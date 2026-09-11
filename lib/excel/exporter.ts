import ExcelJS from 'exceljs';
import type { ClassificationResult, ParsedExcelRow } from '@/types';
import type { InvoiceMetadata } from './invoice';
import { normalizeCurrency } from './currency';
import { factoryCodeFor } from './item-fields';
import { verifiedTariffFor, inspectTariffEvidence, type TariffEvidence } from '@/lib/zatca/tariff';

function evidenceFor(item: ExportableLineItem) {
  return item.classification?.raw_ai_response?.tariffEvidence as TariffEvidence | undefined;
}
function hasOfficialEvidence(item: ExportableLineItem) {
  return Boolean(verifiedTariffFor(item.classification));
}
function reviewNoteFor(item: ExportableLineItem) {
  const check = inspectTariffEvidence(item.classification);
  return check.ok ? check.classification.tariffEvidence!.note : check.message;
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
  raw_data?: Record<string, unknown> | null;
  unit?: string | null;
  contract?: string | null;
  classification?: Partial<ClassificationResult>;
}
const COLORS = { teal: '006C67', ink: '203444', stripe: 'F1F6F8', white: 'FFFFFF', amber: 'FFF0C2', amberText: '805300', red: 'FCE1E1', redText: '9B2525', green: 'DDF2E7', greenText: '146640' };
type Value = string | number | Date;
const SEARCH_TIP = 'You can press Ctrl+F to find the information you are looking for.';

function addSheet(workbook: ExcelJS.Workbook, name: string, tabColor: string) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: tabColor } } });
  sheet.addRow([`${SEARCH_TIP}\nUse the colored tabs below: Main | ZATCA Classification | Metadata | Tariff Sources.`]);
  return sheet;
}

function formatSheet(sheet: ExcelJS.Worksheet, widths: number[], freezeColumns = 0) {
  sheet.columns.forEach((col, i) => { col.width = widths[i] || 24; });
  sheet.views = [{ state: 'frozen', ySplit: 2, xSplit: freezeColumns, showGridLines: false }];
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, sheet.rowCount), column: widths.length } };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    let lines = 2;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Aptos', size: 11, color: { argb: COLORS.ink } };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 ? COLORS.stripe : COLORS.white } };
      const chars = Math.max(8, (widths[col - 1] || 24) - 3);
      lines = Math.max(lines, String(cell.value ?? '').split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / chars)), 0));
    });
    row.height = Math.min(409, lines * 15 + 8);
  });
  const header = sheet.getRow(2);
  header.height = 38;
  header.eachCell(cell => {
    if (typeof cell.value === 'string') cell.value = cell.value.toUpperCase();
    cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.teal } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.mergeCells(1, 1, 1, Math.min(7, widths.length));
  const tip = sheet.getCell('A1');
  tip.font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.ink } };
  tip.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E4F2F1' } };
  tip.alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = 44;
}
function highlight(cell: ExcelJS.Cell, fill: string, color: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: color } };
}

/** Runtime export: Main opens first and summarizes the detailed clearance sheets. */
export async function generateEnrichedExcel(items: ExportableLineItem[], originalFileName: string, metadata?: InvoiceMetadata, sourceRows: ParsedExcelRow[] = []): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ClearanceIQ';
  workbook.created = new Date();
  workbook.views = [{ x: 0, y: 0, width: 16000, height: 10000, visibility: 'visible', firstSheet: 0, activeTab: 0 }];
  const mainSheet = addSheet(workbook, 'Main', 'FF006C67');
  mainSheet.addRow(['Item Code', 'Factory Code', 'Item Description', 'HS CODES', 'CUSTOMS DUTY FEES', 'REGULATED / NON-REGULATED', 'Required procedures']);
  const sourceByRow = new Map(sourceRows.map(row => [row.rowIndex, row.data]));
  const worksheet = addSheet(workbook, 'ZATCA Classification', 'FFFF0000');
  const headers = ['Row #', 'Item Name', 'Item Code', 'HS CODES', 'CUSTOMS DUTY FEES', 'REQUIRED PROCEDURES', 'REGULATED / NON-REGULATED', 'Review note', 'Item Description', 'Unit', 'Contract', 'Quantity', 'Unit Price', 'Total Price', 'Currency', 'Standardized ZATCA Name', 'Confidence Score', 'Classification Date'];
  worksheet.addRow(headers);
  for (const item of items) {
    const official = verifiedTariffFor(item.classification), verified = Boolean(official), evidence = official?.tariffEvidence, result = item.classification;
    const rate = official?.cdf || 'REVIEW REQUIRED';
    const simpleRate = /^(\d+(?:\.\d+)?)%$/.exec(rate);
    const status = official && official.regulationStatus !== 'UNKNOWN' ? official.regulationStatus : 'REVIEW REQUIRED';
    const procedures = verified ? evidence?.procedures?.join('\n') || 'No procedures listed in the retrieved ZATCA record.' : 'REVIEW REQUIRED';
    const date = result?.classified_at && Number.isFinite(Date.parse(result.classified_at)) ? new Date(result.classified_at) : '';
    worksheet.addRow([
      item.row_index + 1, item.item_name || '', item.item_code || '', verified ? result!.hs_code! : 'REVIEW REQUIRED',
      simpleRate ? Number(simpleRate[1]) / 100 : rate, procedures, status,
      evidence?.note || reviewNoteFor(item), item.item_description || '', item.unit || '', item.contract || '',
      item.quantity ?? '', item.unit_price ?? '', item.total_price ?? '', normalizeCurrency(item.currency), official?.standardizedZatcaName || '',
      result?.confidence_score ?? '', date,
    ]);
    // Only copy an explicitly labeled factory code; never infer one from a product description.
    const factoryCode = factoryCodeFor(item, sourceByRow.get(item.row_index));
    mainSheet.addRow([
      item.item_code || '', factoryCode == null ? '' : String(factoryCode),
      [...new Set([item.item_name?.trim(), item.item_description?.trim()].filter(Boolean))].join('\n'),
      verified ? result!.hs_code! : 'REVIEW REQUIRED', simpleRate ? Number(simpleRate[1]) / 100 : rate, status, procedures,
    ]);
  }
  formatSheet(worksheet, [7, 34, 20, 18, 20, 58, 28, 50, 42, 10, 18, 12, 14, 16, 12, 45, 18, 22], 2);
  worksheet.getColumn(4).numFmt = '@';
  worksheet.getColumn(3).numFmt = '@';
  worksheet.getColumn(5).numFmt = '0%';
  worksheet.getColumn(17).numFmt = '0%';
  worksheet.getColumn(18).numFmt = 'yyyy-mm-dd hh:mm';
  worksheet.eachRow((row, n) => {
    if (n <= 2) return;
    for (const c of [3, 4]) row.getCell(c).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    const rate = verifiedTariffFor(items[n - 3]?.classification)?.cdf || '';
    const decimals = /\.(\d+)%$/.exec(rate)?.[1].length || 0;
    row.getCell(5).numFmt = decimals ? `0.${'0'.repeat(decimals)}%` : '0%';
    const status = row.getCell(7);
    if (status.value === 'REGULATED') highlight(status, COLORS.red, COLORS.redText);
    else if (status.value === 'NON-REGULATED') highlight(status, COLORS.green, COLORS.greenText);
    else highlight(status, COLORS.amber, COLORS.amberText);
    for (const c of [4, 5, 6]) if (row.getCell(c).value === 'REVIEW REQUIRED') highlight(row.getCell(c), COLORS.amber, COLORS.amberText);
  });
  formatSheet(mainSheet, [22, 22, 48, 20, 22, 30, 70], 2);
  for (const col of [1, 2, 4]) mainSheet.getColumn(col).numFmt = '@';
  mainSheet.eachRow((row, n) => {
    if (n <= 2) return;
    for (const col of [1, 2]) row.getCell(col).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    // Share the detailed sheet's verified values, percentage precision, and status colors.
    for (const [target, source] of [[4, 4], [5, 5], [6, 7], [7, 6]]) {
      row.getCell(target).style = { ...worksheet.getRow(n).getCell(source).style };
    }
  });

  const metaSheet = addSheet(workbook, 'Metadata', 'FFFFEBAD');
  const metaData: Value[][] = [
    ['KSA Customs Clearance System — ClearanceIQ'], ['Generated:', new Date()], ['Source File:', originalFileName],
    ['Total Items:', items.length], ['Tariff records sourced from ZATCA:', items.filter(hasOfficialEvidence).length],
    ['Duty column:', 'Published tariff percentage, not a payable amount. Use the header filters to find HS codes, procedures and regulation status.'],
    ['Status colors:', 'Red: regulated. Green: non-regulated. Amber: review required.'],
  ];
  if (metadata) metaData.push(...Object.entries(metadata).filter(([key]) => key !== 'charges').map(([key, value]) => [key, value as Value]), [], ['CHARGES', 'AMOUNT'], ...metadata.charges.map(c => [c.label, c.amount]));
  metaSheet.addRows(metaData);
  formatSheet(metaSheet, [46, 90]);
  metaSheet.autoFilter = undefined;
  metaSheet.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm';

  const evidenceSheet = addSheet(workbook, 'Tariff Sources', 'FFE26B0A');
  evidenceSheet.addRow(['Row #', 'HS CODES', 'Official source', 'Lookup URL', 'Retrieved at', 'Effective date', 'Import status', 'Required procedures', 'Review note', 'Manufacturer reference sources']);
  items.forEach(item => {
    const official = verifiedTariffFor(item.classification), evidence = official?.tariffEvidence;
    evidenceSheet.addRow([item.row_index + 1, official?.hsCode || 'REVIEW REQUIRED', evidence?.sourceUrl || '', evidence?.lookupUrl || '', evidence?.retrievedAt || '', evidence?.effectiveDate || '', evidence?.importStatus || '', evidence?.procedures?.join('\n') || '', evidence?.note || reviewNoteFor(item), evidenceFor(item)?.productEvidence?.map(source => `${source.reference}: ${source.description}\n${source.sourceUrl}\n${source.retrievedAt}`).join('\n\n') || '']);
  });
  formatSheet(evidenceSheet, [7, 18, 45, 45, 25, 25, 40, 80, 80, 70]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
