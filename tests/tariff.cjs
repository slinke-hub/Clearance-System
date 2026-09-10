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
const { classifyOfficialRecord, activeDetail, searchTariffs } = require('../lib/zatca/tariff.ts');
const { generateEnrichedExcel } = require('../lib/excel/exporter.ts');
// Official public search response retrieved 2026-09-09; subsequent mutations are synthetic test scenarios.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/zatca-hand-lamp.json'), 'utf8').replace(/^\uFEFF/, ''));
const asOf = '2026-09-09T19:00:00Z';

test('official duty and procedures override any generic product assumptions', () => {
  const c = classifyOfficialRecord(fixture, asOf, 'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/1/lamp');
  assert.equal(c.hsCode, '851310000001');
  assert.equal(c.cdf, '10%');
  assert.equal(c.regulationStatus, 'REGULATED');
  assert.equal(c.tariffEvidence.effectiveDate, '2025-11-27T00:00:00');
  assert.ok(c.tariffEvidence.procedures[0].includes('سابر'));
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

test('old AI-only results cannot be exported as confirmed tariff columns', () => {
  const book = XLSX.read(generateEnrichedExcel([{ row_index: 1, classification: { hs_code: '851310000001', cdf: '5%', regulation_status: 'NON-REGULATED' } }], 'test.xlsx'));
  const row = XLSX.utils.sheet_to_json(book.Sheets['ZATCA Classification'])[0];
  for (const column of ['HS CODES', 'CUSTOMS DUTY FEES', 'REGULATED / NON-REGULATED']) assert.equal(row[column], 'REVIEW REQUIRED');
});

test('AI can select only official candidates and cannot supply duty or regulation values', async () => {
  let answers = [{ hsPrefix: '851310' }, { hsCode: fixture.HarmonizedCode, confidence: 0.95, missingInformation: '', cdf: '99%', regulationStatus: 'NON-REGULATED' }];
  const previousLoad = Module._load;
  process.env.NVIDIA_NIM_API_KEY = 'test-only';
  Module._load = function(name, parent, main) {
    if (name === 'openai') return class { chat = { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(answers.shift()) } }] }) } }; };
    if (name === '@/lib/zatca/tariff') return { ...require('../lib/zatca/tariff.ts'), searchTariffs: async () => ({ records: [fixture], retrievedAt: asOf, lookupUrl: 'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/3/851310' }) };
    return previousLoad.call(this, name, parent, main);
  };
  const { classifyItem } = require('../lib/ai/nvidia-nim-classifier.ts');
  try {
    const result = await classifyItem({ itemName: 'Hand lamp' });
    assert.equal(result.cdf, '10%');
    assert.equal(result.regulationStatus, 'REGULATED');
    answers = [{ hsPrefix: '851310' }, { hsCode: '999999999999', confidence: 1, missingInformation: '' }];
    assert.equal((await classifyItem({ itemName: 'Hand lamp' })).hsCode, 'REVIEW REQUIRED');
    answers = [{ hsPrefix: '851310' }, { hsCode: fixture.HarmonizedCode, confidence: 0.99, missingInformation: 'Need lamp type' }];
    assert.equal((await classifyItem({ itemName: 'Lamp' })).hsCode, 'REVIEW REQUIRED');
  } finally { Module._load = previousLoad; delete process.env.NVIDIA_NIM_API_KEY; }
});

test('live official HS-prefix lookup returns current tariff records', { skip: process.env.LIVE_ZATCA_TEST !== '1' }, async () => {
  const result = await searchTariffs('8512');
  assert.ok(result.records.length > 0);
  assert.ok(result.records.some(r => activeDetail(r, result.retrievedAt)));
  assert.ok(result.records.every(r => /^8512\d{8}$/.test(r.HarmonizedCode)));
});
