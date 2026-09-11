/* eslint-disable @typescript-eslint/no-require-imports -- Test loader for TypeScript modules. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const load = Module._load;
Module._load = function(name, parent, main) { return load.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main); };
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { classifyOfficialRecord, activeDetail, searchTariffs, verifiedTariffFor } = require('../lib/zatca/tariff.ts');
const { generateEnrichedExcel } = require('../lib/excel/exporter.ts');
const { invoiceReport } = require('../lib/invoices/report.ts');
// Official public search response retrieved 2026-09-09; subsequent mutations are synthetic test scenarios.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/zatca-hand-lamp.json'), 'utf8').replace(/^\uFEFF/, ''));
const asOf = '2026-09-09T19:00:00Z';
const exactLookup = 'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/3/851310000001';

test('official duty and procedures override any generic product assumptions', () => {
  const c = classifyOfficialRecord(fixture, asOf, 'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/1/lamp');
  assert.equal(c.hsCode, '851310000001');
  assert.equal(c.cdf, '10%');
  assert.equal(c.regulationStatus, 'REGULATED');
  assert.equal(c.tariffEvidence.effectiveDate, '2025-11-27T00:00:00');
  assert.ok(c.tariffEvidence.procedures[0].includes('سابر'));
});

test('saved result links display official details and reject unverified or mismatched codes', () => {
  const official = classifyOfficialRecord(fixture, asOf, exactLookup);
  const run = { id: 'run', file_name: 'invoice.xlsx', status: 'completed', created_at: asOf };
  const line = { row_index: 22, item_name: 'Invoice lamp', classification: { hs_code: official.hsCode, cdf: '99%', raw_ai_response: { tariffEvidence: official.tariffEvidence } } };
  const row = invoiceReport(run, [line]).items[0];
  assert.equal(row.rowIndex, 22);
  assert.equal(row.hsCode, '851310000001');
  assert.equal(row.heading, '8513');
  assert.equal(row.duty, '10%', 'Display duty from the official record, not the stored AI label');
  assert.equal(row.zatcaName, 'Hand lamps');
  assert.ok(row.procedures[0].includes('سابر'));
  assert.equal(row.retrievedAt, new Date(asOf).toISOString());
  assert.equal(invoiceReport(run, [{ ...line, classification: { hs_code: '999999999999', raw_ai_response: line.classification.raw_ai_response } }]).items[0].verified, false);
  assert.equal(invoiceReport(run, [{ ...line, classification: { hs_code: official.hsCode, cdf: '5%' } }]).items[0].hsCode, '');
});

test('future and ambiguous dates are not treated as current; zero duty is preserved', () => {
  const record = structuredClone(fixture);
  record.TariffDetails.push({ ...record.TariffDetails[0], EffectDate: '2027-01-01T00:00:00', DutyRate: 99 });
  assert.equal(activeDetail(record, asOf).DutyRate, 10);
  record.TariffDetails[0].DutyRate = 0;
  assert.equal(classifyOfficialRecord(record, asOf, '').cdf, '0%');
  record.TariffDetails.push({ ...record.TariffDetails[0] });
  assert.equal(activeDetail(record, asOf), undefined);
  assert.throws(() => classifyOfficialRecord(record, asOf, ''));
});

test('unrestricted status requires an explicit unrestricted record; prohibited and specific duties need review', () => {
  const record = structuredClone(fixture);
  record.Procedures = [];
  record.RestrictionStatus = 0;
  assert.equal(classifyOfficialRecord(record, asOf, '').regulationStatus, 'NON-REGULATED');
  record.TariffDetails[0].DutyType = 2;
  assert.equal(classifyOfficialRecord(record, asOf, '').cdf, 'REVIEW REQUIRED');
  record.TariffDetails[0].ImportStatusID = '2';
  record.TariffDetails[0].ImportStatusName = 'Prohibited';
  const c = classifyOfficialRecord(record, asOf, '');
  assert.equal(c.regulationStatus, 'REGULATED');
  assert.equal(c.cdf, 'REVIEW REQUIRED');
  assert.match(c.tariffEvidence.note, /prohibition/);
});

test('old AI-only results cannot be exported as confirmed tariff columns', async () => {
  const book = XLSX.read(await generateEnrichedExcel([{ row_index: 1, classification: { hs_code: '851310000001', cdf: '5%', regulation_status: 'NON-REGULATED' } }], 'test.xlsx'));
  const row = XLSX.utils.sheet_to_json(book.Sheets['ZATCA Classification'], { range: 1 })[0];
  for (const column of ['HS CODES', 'CUSTOMS DUTY FEES', 'REGULATED / NON-REGULATED']) assert.equal(row[column], 'REVIEW REQUIRED');
});

test('reports and all export tabs require exact official source evidence and derive values from its record', async () => {
  const official = classifyOfficialRecord(fixture, asOf, exactLookup);
  const stored = {hs_code:fixture.HarmonizedCode, cdf:'99%', regulation_status:'NON-REGULATED', standardized_name:'Invented label', raw_ai_response:{tariffEvidence:{...official.tariffEvidence, procedures:['Invented procedure'], effectiveDate:'2099-01-01', importStatus:'Invented'}}};
  const run = {id:'run', file_name:'test.xlsx', status:'completed', created_at:asOf};
  const invalid = [
    {sourceUrl:'https://example.com/tariff'},
    {lookupUrl:exactLookup.replace('eservices.zatca.gov.sa', 'eservices.zatca.gov.sa.example.com')},
    {lookupUrl:exactLookup.replace('https:', 'http:')},
    {lookupUrl:exactLookup.replace('/851310000001', '/8513')},
    {lookupUrl:exactLookup + '?source=official'},
    {retrievedAt:''}, {retrievedAt:'2099-01-01T00:00:00Z'},
    {record:{HarmonizedCode:fixture.HarmonizedCode}},
    {record:{...fixture, HarmonizedCode:'999999999999'}},
  ].map((patch, index) => ({row_index:index + 1, classification:{...stored, raw_ai_response:{tariffEvidence:{...stored.raw_ai_response.tariffEvidence, ...patch}}}}));
  for (const item of invalid) {
    assert.equal(verifiedTariffFor(item.classification), undefined);
    assert.equal(invoiceReport(run, [item]).items[0].verified, false);
  }
  const book = XLSX.read(await generateEnrichedExcel([{row_index:0, classification:stored}, ...invalid], 'test.xlsx'));
  for (const name of ['Main', 'ZATCA Classification']) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], {range:1});
    assert.equal(rows[0]['CUSTOMS DUTY FEES'], 0.1);
    assert.equal(rows[0]['REGULATED / NON-REGULATED'], 'REGULATED');
    assert.match(rows[0]['REQUIRED PROCEDURES'], /سابر/);
    assert.ok(rows.slice(1).every(row => row['HS CODES'] === 'REVIEW REQUIRED'));
  }
  const sources = XLSX.utils.sheet_to_json(book.Sheets['Tariff Sources'], {range:1, defval:''});
  assert.equal(sources[0]['LOOKUP URL'], exactLookup);
  assert.equal(sources[0]['RETRIEVED AT'], new Date(asOf).toISOString());
  assert.equal(sources[0]['EFFECTIVE DATE'], official.tariffEvidence.effectiveDate);
  assert.ok(sources.slice(1).every(row => row['OFFICIAL SOURCE'] === '' && row['LOOKUP URL'] === '' && row['REQUIRED PROCEDURES'] === ''));
});

test('Excel export groups clearance values and preserves filtering, wrapping and status colors', async () => {
  const ExcelJS = require('exceljs');
  const official = classifyOfficialRecord(fixture, asOf, exactLookup);
  const unrestricted = classifyOfficialRecord({...fixture, Procedures:[], RestrictionStatus:0}, asOf, exactLookup);
  const row = { row_index: 22, item_name: 'Hand lamp', item_description: 'Portable lamp', item_code: '0000123', classification: { hs_code: official.hsCode, cdf: official.cdf, regulation_status: official.regulationStatus, raw_ai_response: { tariffEvidence: official.tariffEvidence } } };
  const buffer = await generateEnrichedExcel([row, { ...row, row_index: 25, classification: { ...row.classification, raw_ai_response:{tariffEvidence:unrestricted.tariffEvidence} } }, { row_index: 27, item_name: 'Unidentified item' }], 'invoice.xlsx', undefined, [{ rowIndex: 25, data: { 'Factory Code': '0025' } }, { rowIndex: 22, data: { 'Factory Code': '0009-A' } }]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const main = book.worksheets[0];
  assert.equal(main.name, 'Main');
  assert.equal(book.views[0].activeTab, 0);
  assert.equal(book.views[0].firstSheet, 0);
  assert.deepEqual(main.getRow(2).values.slice(1), ['ITEM CODE', 'FACTORY CODE', 'ITEM DESCRIPTION', 'HS CODES', 'CUSTOMS DUTY FEES', 'REGULATED / NON-REGULATED', 'REQUIRED PROCEDURES']);
  assert.deepEqual(main.getRow(3).values.slice(1, 4), ['0000123', '0009-A', 'Hand lamp\nPortable lamp']);
  assert.equal(main.getCell('B4').value, '0025');
  assert.equal(main.getCell('B5').value, '');
  assert.equal(main.getCell('A3').numFmt, '@');
  assert.equal(main.getCell('B3').numFmt, '@');
  assert.equal(main.autoFilter, 'A2:G5');
  assert.equal(main.views[0].ySplit, 2);
  const sheet = book.getWorksheet('ZATCA Classification');
  for (let n = 3; n <= 5; n++) {
    for (const [target, source] of [[4, 4], [5, 5], [6, 7], [7, 6]]) {
      assert.equal(main.getRow(n).getCell(target).value, sheet.getRow(n).getCell(source).value);
      assert.deepEqual(main.getRow(n).getCell(target).style, sheet.getRow(n).getCell(source).style);
    }
  }
  assert.equal(sheet.name, 'ZATCA Classification');
  assert.deepEqual([4, 5, 6, 7].map(c => sheet.getRow(2).getCell(c).value), ['HS CODES', 'CUSTOMS DUTY FEES', 'REQUIRED PROCEDURES', 'REGULATED / NON-REGULATED']);
  assert.equal(sheet.getCell('C3').value, '0000123');
  assert.equal(sheet.getCell('D3').value, '851310000001');
  assert.equal(sheet.getCell('E3').value, 0.1);
  assert.equal(sheet.getCell('E3').numFmt, '0%');
  assert.match(sheet.getCell('F3').value, /سابر/);
  assert.equal(sheet.getCell('F3').alignment.wrapText, true);
  assert.equal(sheet.views[0].state, 'frozen');
  assert.equal(sheet.views[0].xSplit, 2);
  assert.equal(sheet.views[0].ySplit, 2);
  assert.equal(sheet.autoFilter, 'A2:R5');
  assert.equal(sheet.getCell('G3').fill.fgColor.argb, 'FCE1E1');
  assert.equal(sheet.getCell('G4').fill.fgColor.argb, 'DDF2E7');
  assert.equal(sheet.getCell('G5').fill.fgColor.argb, 'FFF0C2');
  assert.equal(sheet.getCell('F5').value, 'REVIEW REQUIRED');
  assert.equal(sheet.rowCount, 5);
  assert.deepEqual(book.worksheets.map(s => s.properties.tabColor.argb), ['FF006C67', 'FFFF0000', 'FFFFEBAD', 'FFE26B0A']);
  for (const tab of book.worksheets) {
    assert.ok(tab.getCell('A1').value.includes('You can press Ctrl+F to find the information you are looking for.'));
    assert.ok(tab.getCell('A1').value.includes('ZATCA Classification | Metadata | Tariff Sources'));
    assert.equal(tab.getCell('A1').alignment.wrapText, true);
    assert.equal(tab.getCell('B1').master.address, 'A1');
  }
  assert.equal(book.getWorksheet('Tariff Sources').autoFilter, 'A2:J5');
  assert.ok(book.getWorksheet('Metadata').getCell('B3').value instanceof Date);
});

test('AI can select only official candidates and cannot supply duty or regulation values', async () => {
  let answers = [{ hsPrefix: '851310' }, { hsCode: fixture.HarmonizedCode, confidence: 0.95, missingInformation: '', cdf: '99%', regulationStatus: 'NON-REGULATED' }, {supported:true,reason:'Product function matches the parent heading.'}];
  const requests = [];
  const previousLoad = Module._load;
  process.env.NVIDIA_NIM_API_KEY = 'test-only';
  Module._load = function(name, parent, main) {
    if (name === 'openai') return class { chat = { completions: { create: async input => {
      requests.push(input);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] };
    } } }; };
    if (name === '@/lib/zatca/tariff') return { ...require('../lib/zatca/tariff.ts'), searchTariffs: async () => ({ records: [fixture], retrievedAt: asOf, lookupUrl: 'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/3/851310' }) };
    return previousLoad.call(this, name, parent, main);
  };
  const { classifyItem, classifyItemsBatch } = require('../lib/ai/nvidia-nim-classifier.ts');
  try {
    const result = await classifyItem({ itemName: 'Hand lamp', invoiceContext: ['Portable lights', 'Replacement bulbs'] });
    assert.equal(result.cdf, '10%');
    assert.equal(result.regulationStatus, 'REGULATED');
    assert.ok(requests.every(r => r.messages[1].content.includes('Replacement bulbs')), 'Both matching stages must receive invoice context');
    answers = [{ hsPrefix: '851310' }, { hsCode: '999999999999', confidence: 1, missingInformation: '' }];
    assert.equal((await classifyItem({ itemName: 'Hand lamp' })).hsCode, 'REVIEW REQUIRED');
    answers = [{ hsPrefix: '851310' }, { hsCode: fixture.HarmonizedCode, confidence: 0.99, missingInformation: 'Need lamp type' }];
    assert.equal((await classifyItem({ itemName: 'Lamp' })).hsCode, 'REVIEW REQUIRED');
    class APIConnectionTimeoutError extends Error {}
    answers = [new APIConnectionTimeoutError('private provider error')];
    const [failed] = await classifyItemsBatch([{ itemName: 'Lamp' }]);
    assert.equal(failed.hsCode, 'REVIEW REQUIRED');
    assert.match(failed.tariffEvidence.note, /timed out/);
    assert.doesNotMatch(failed.tariffEvidence.note, /private provider error/);
    assert.equal(failed.confidenceScore, undefined, 'Service failures must not look like a scored product match');
  } finally { Module._load = previousLoad; delete process.env.NVIDIA_NIM_API_KEY; }
});

test('live official HS-prefix lookup returns current tariff records', { skip: process.env.LIVE_ZATCA_TEST !== '1' }, async () => {
  const result = await searchTariffs('8512');
  assert.ok(result.records.length > 0);
  assert.ok(result.records.some(r => activeDetail(r, result.retrievedAt)));
  assert.ok(result.records.every(r => /^8512\d{8}$/.test(r.HarmonizedCode)));
  const code = result.records.find(r => activeDetail(r, result.retrievedAt)).HarmonizedCode;
  const exact = await searchTariffs(code);
  const record = exact.records.find(r => r.HarmonizedCode === code);
  assert.ok(verifiedTariffFor({hs_code:code, raw_ai_response:{tariffEvidence:{sourceUrl:'https://eservices.zatca.gov.sa/sites/sc/en/tariff/Pages/TariffPages/TariffSearch.aspx', lookupUrl:exact.lookupUrl, retrievedAt:exact.retrievedAt, record}}}));
});
