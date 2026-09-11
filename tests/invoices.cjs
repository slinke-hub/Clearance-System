/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader for testing TypeScript route handlers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const tariffFixture = require('./fixtures/zatca-hand-lamp.json');
const testRecord = {...tariffFixture, HarmonizedCode:'123456789012', TariffDetails:tariffFixture.TariffDetails.map(d => ({...d, HarmonizedCode:'123456789012', DutyRate:5}))};
let currentUser = { id: '00000000-0000-0000-0000-000000000002', role: 'admin', plan: 'enterprise' };
let aiConfigured = true;
let received = [];
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === '@/lib/auth/session') return { getCurrentUser: async () => currentUser };
  if (name === '@/lib/supabase/config') return { isSupabaseConfigured: () => false };
  if (name === '@/lib/ai/nvidia-nim-classifier') return {
    isNvidiaNimConfigured: () => aiConfigured,
    classifyItemsBatch: async items => { received.push(...items); return items.map(() => ({ hsCode: '123456789012', cdf: '5%', regulationStatus: 'REGULATED', standardizedZatcaName: 'Test result', tariffEvidence: { sourceUrl: 'https://eservices.zatca.gov.sa/sites/sc/en/tariff/Pages/TariffPages/TariffSearch.aspx', lookupUrl:'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/3/123456789012', retrievedAt: '2026-09-09T00:00:00Z', procedures: [], record: testRecord } })); },
  };
  return originalLoad.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { parseExcelBuffer, autoDetectColumns } = require('../lib/excel/parser.ts');
const { mapItems, reviewInvoice } = require('../lib/excel/invoice.ts');
const { generateEnrichedExcel } = require('../lib/excel/exporter.ts');
const { POST: upload } = require('../app/api/invoices/upload/route.ts');
const { POST: save } = require('../app/api/invoices/review/route.ts');
const { POST: classify } = require('../app/api/classify/route.ts');
const { GET: download } = require('../app/api/export/[runId]/route.ts');
const { mockStore } = require('../lib/mock/store.ts');
const { normalizeCurrency, hasUSCurrencyLabel } = require('../lib/excel/currency.ts');
const { numberValue } = require('../lib/excel/invoice.ts');
const { storedItems } = require('../lib/invoices.ts');
const { loadInvoice } = require('../lib/invoices.ts');

function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Invoice');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
const request = body => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('automatic mapping separates codes from descriptions regardless of column order and preserves leading zeros', () => {
  const parsed = parseExcelBuffer(workbook([
    ['ITEM_CODE', 'Factory Code', 'Item Description', 'Quantity', 'Unit Price', 'Amount'],
    ['000012', '000099', 'Rear reflector', 2, 3, 6],
  ]));
  const mapping = autoDetectColumns(parsed.headers);
  const item = mapItems(parsed.rows, mapping)[0];
  assert.equal(item.itemName, 'Rear reflector');
  assert.equal(item.itemCode, '000012');
  assert.equal(item.factoryCode, '000099');
  assert.equal(autoDetectColumns(['Item Code', 'Factory Code']).itemName, undefined);
  assert.equal(autoDetectColumns(['Description', 'Item Name', 'Cust_Item_No.']).itemName, 'Item Name');
  const missing = mapItems([{rowIndex:1, data:{Description:'Part 12345'}}], {itemName:'Description'})[0];
  assert.equal(missing.factoryCode, '', 'codes are never invented from description text');
  const incomplete = mapItems([{rowIndex:3, data:{'Item Code':'00001', Description:''}}], {itemName:'Description', itemCode:'Item Code'});
  assert.equal(incomplete.length, 1, 'an item with a code and missing description must not disappear');
  assert.match(reviewInvoice(incomplete, {charges:[]}).errors.join(' '), /missing product description/);
});

test('US currency aliases work in columns, price headings, review, storage and export', async () => {
  for (const alias of ['US$', '(US$)', 'USD', 'usd', 'U.S. Dollar', 'US Dollars', 'United States Dollar', '$', 'دولار أمريكي']) assert.equal(normalizeCurrency(alias), 'USD');
  for (const label of ['Amount (US$)', 'Total USD', 'U.S. DOLLARS', 'دولار امريكي']) assert.ok(hasUSCurrencyLabel(label));
  for (const label of ['CAD', 'AUD', 'C$', 'A$', 'SAR', '']) assert.equal(normalizeCurrency(label), label);
  assert.equal(hasUSCurrencyLabel('Amount CAD'), false);
  assert.equal(hasUSCurrencyLabel('Lot USD123'), false);
  assert.equal(numberValue('US$ 1,234.50'), 1234.5);
  assert.equal(numberValue('1,234.50 USD'), 1234.5);
  assert.equal(numberValue('CAD 1,234.50'), undefined);
  const parsed = parseExcelBuffer(workbook([['Description', 'Quantity', 'Unit Price (US$)', 'Amount (US$)'], ['Lamp', 2, 3, 6]]));
  const items = mapItems(parsed.rows, autoDetectColumns(parsed.headers));
  assert.equal(items[0].currency, 'USD');
  items[0].currency = 'US Dollars';
  assert.deepEqual(reviewInvoice(items, { currency: 'USD', charges: [] }).errors, []);
  const saved = storedItems('test', items);
  assert.equal(saved[0].currency, 'USD');
  const exported = XLSX.read(await generateEnrichedExcel([{ ...saved[0], currency: 'US$' }], 'test.xlsx'));
  assert.equal(XLSX.utils.sheet_to_json(exported.Sheets['ZATCA Classification'], { range: 1 })[0].CURRENCY, 'USD');
});

test('formatted invoice keeps continuation rows, units, repeated codes and separate charges', () => {
  const input = workbook([
    [null, null, null, null, 'SUPPLIER GROUP'], ['COMMERCIAL INVOICE'], ['Invoice No.: TEST'],
    ['Seq.', 'Cust_Item_No.', null, 'Description', null, null, 'Quantity', null, 'Unit Price', 'Amount'],
    ['S/C NO.ORDER1', null, null, null, null, null, null, null, null, '(US$)'],
    ['1', 'DUP', null, 'Lamp', null, null, 2, 'PCS', 3, 6], [null, null, null, 'OEM-1'],
    ['COMMERCIAL INVOICE'], ['Seq.', 'Cust_Item_No.', null, 'Description', null, null, 'Quantity', null, 'Unit Price', 'Amount'],
    ['2', 'DUP', null, 'Mud flap', null, null, 1, 'SETS', 4, 4], [null, null, null, '4PCS/SET'],
    ['Total:', null, null, null, null, null, null, null, null, 10],
    [null, null, null, null, null, null, 'FREIGHT', null, null, 5],
    [null, null, null, null, null, null, 'Discount', null, null, -1],
    [null, null, null, null, null, null, 'Total Amount', null, null, 14],
  ]);
  const parsed = parseExcelBuffer(input);
  const items = mapItems(parsed.rows, autoDetectColumns(parsed.headers));
  const review = reviewInvoice(items, parsed.metadata);
  assert.equal(items.length, 2);
  assert.equal(items[0].itemDescription, 'OEM-1');
  assert.equal(items[1].itemDescription, '4PCS/SET');
  assert.equal(items[1].contract, 'ORDER1');
  assert.deepEqual(review.units, { PCS: 2, SETS: 1 });
  assert.equal(review.total, 14);
  assert.equal(review.warnings.length, 1);
  assert.deepEqual(review.errors, []);
  assert.ok(reviewInvoice([{ ...items[0], quantity: '' }, items[1]], parsed.metadata).errors.length);
  assert.ok(reviewInvoice([{ ...items[0], totalPrice: '7' }, items[1]], parsed.metadata).errors.length);
});

test('manual mapping and edits reach every classified item and export; ownership is enforced', async () => {
  const input = workbook([['Code', 'Details', 'Qty', 'Unit Price', 'Amount', 'Currency', 'Manufacturer Part No.'], ...Array.from({ length: 8 }, (_, i) => ['P' + i, 'Lamp ' + i, 2, 3, 6, 'USD', '000' + i])]);
  const form = new FormData(); form.append('file', new File([input], 'invoice.xlsx'));
  const response = await upload(new Request('http://localhost/api', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  const data = await response.json();
  const mapping = { ...data.autoMapping, itemName: 'Details', itemDescription: 'Code' };
  const items = mapItems(data.rows, mapping);
  assert.equal(items[7].factoryCode, '0007');
  items[7].itemDescription = 'Reviewed OEM reference';
  items[7].factoryCode = '001234';
  assert.equal((await save(request({ runId: data.runId, mapping, items }))).status, 200);
  received = [];
  for (let i = 0; i < items.length; i += 5) assert.equal((await classify(request({ runId: data.runId, batchRows: items.slice(i, i + 5).map(item => item.rowIndex) }))).status, 200);
  assert.equal(received.length, 8);
  assert.equal(received[7].itemName, 'Lamp 7');
  assert.equal(received[7].itemDescription, 'Reviewed OEM reference | 001234');
  const savedInvoice = await loadInvoice(data.runId, currentUser.id);
  const { invoiceReport } = require('../lib/invoices/report.ts');
  assert.equal(invoiceReport(savedInvoice.run, savedInvoice.items).items[7].factoryCode, '001234');
  assert.equal(mockStore.getRun(data.runId).status, 'completed');
  const exported = await download(request({}), { params: Promise.resolve({ runId: data.runId }) });
  assert.equal(exported.status, 200);
  const book = XLSX.read(Buffer.from(await exported.arrayBuffer()));
  const rows = XLSX.utils.sheet_to_json(book.Sheets['ZATCA Classification'], { range: 1 });
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Main, { range: 1 })[7]['FACTORY CODE'], '001234');
  assert.equal(rows.length, 8);
  assert.equal(rows[7]['ITEM DESCRIPTION'], 'Reviewed OEM reference');
  assert.equal(rows[7]['ROW #'], 9);
  assert.equal(rows[7]['HS CODES'], '123456789012');
  assert.equal(rows[7]['CUSTOMS DUTY FEES'], 0.05);
  assert.equal(rows[7]['REGULATED / NON-REGULATED'], 'REGULATED');
  currentUser = { ...currentUser, id: '00000000-0000-0000-0000-000000000099' };
  assert.equal(await loadInvoice(data.runId, currentUser.id), null, 'Saved result pages must not expose another owner’s invoice');
  assert.equal((await download(request({}), { params: Promise.resolve({ runId: data.runId }) })).status, 404);
  assert.equal((await save(request({ runId: data.runId, mapping, items }))).status, 404);
  assert.equal((await classify(request({ runId: data.runId, batchRows: [items[0].rowIndex] }))).status, 404);
  currentUser = { ...currentUser, id: '00000000-0000-0000-0000-000000000002' };
  assert.equal((await save(request({ runId: data.runId, mapping, items: [items[0], items[0]] }))).status, 400);
  aiConfigured = false;
  assert.equal((await classify(request({ runId: data.runId, batchRows: [items[0].rowIndex] }))).status, 503);
  assert.equal((await save(request({ runId: data.runId, mapping, items }))).status, 200);
  aiConfigured = true;
});

const sample = process.env.INVOICE_SAMPLE;
test('provided CN07-210 invoice reconciles all 89 items', { skip: !sample }, async () => {
  const parsed = parseExcelBuffer(fs.readFileSync(sample));
  const items = mapItems(parsed.rows, autoDetectColumns(parsed.headers));
  const review = reviewInvoice(items, parsed.metadata);
  assert.equal(items.length, 89);
  assert.equal(parsed.metadata.invoiceNumber, 'CN07-210');
  assert.equal(parsed.metadata.currency, 'USD');
  assert.ok(items.every(i => i.currency === 'USD'));
  assert.deepEqual(review.units, { PCS: 4865, SETS: 30 });
  assert.equal(review.goodsTotal, 32113.4);
  assert.equal(review.total, 42136.4);
  assert.deepEqual(review.errors, []);
  assert.equal(review.warnings.length, 1);
  assert.equal(items.find(i => i.rowIndex === 181).itemDescription, '(4PCS/SET)');
  const output = await generateEnrichedExcel(items.map(i => ({ row_index: i.rowIndex, item_name: i.itemName, item_description: i.itemDescription, item_code: i.itemCode, unit: i.unit, contract: i.contract, quantity: i.quantity, unit_price: i.unitPrice, total_price: i.totalPrice, currency: i.currency })), 'sample.xlsx', parsed.metadata);
  const book = XLSX.read(output);
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets['ZATCA Classification'], { range: 1 }).length, 89);
  assert.ok(XLSX.utils.sheet_to_json(book.Sheets.Metadata, { header: 1 }).some(r => r[0] === 'invoiceTotal' && r[1] === 42136.4));
});
