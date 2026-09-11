/* eslint-disable @typescript-eslint/no-require-imports -- Isolated matching services with controlled source responses. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/zatca-hand-lamp.json');
const asOf = '2026-09-11T00:00:00Z';
const requests = [], queries = [];
let answers = [], failLookup = false;
let failedPrefix = '';
let broadHeading = false;
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'openai') return class { chat = { completions: { create: async input => {
    requests.push(input);
    if (!answers.length) throw new Error('No more mock answers');
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answers.shift()) } }] };
  } } }; };
  if (name === '@/lib/zatca/tariff') {
    const actual = originalLoad.call(this, path.join(root, 'lib/zatca/tariff.ts'), parent, main);
    return { ...actual,
      searchTariffs: async prefix => {
        queries.push(prefix);
        if (failLookup || prefix === failedPrefix) throw new Error('Unavailable');
        if (broadHeading && prefix === '8513') return {
          records: [{...fixture, HarmonizedCode:'851300000000', DescriptionEnglish:'Portable electric lamps', TariffDetails:[]}, ...Array.from({length:451}, (_, n) => {
            const code = '851399' + String(n).padStart(6, '0');
            return {...fixture, HarmonizedCode:code, TariffDetails:fixture.TariffDetails.map(d => ({...d, HarmonizedCode:code}))};
          })], retrievedAt:asOf, lookupUrl:'https://eservices.zatca.gov.sa/lookup/8513',
        };
        return { records: prefix === '8708' ? [{ ...fixture, HarmonizedCode: '870810000001', DescriptionEnglish: 'Bumpers', TariffDetails: fixture.TariffDetails.map(d => ({...d, HarmonizedCode: '870810000001'})) }] : [prefix.length === 12 ? { ...fixture, TariffDetails: fixture.TariffDetails.map(d => ({...d, DutyRate: 7.5})) } : fixture], retrievedAt: asOf, lookupUrl: 'https://eservices.zatca.gov.sa/lookup/' + prefix };
      },
      searchTariffDescriptions: async term => { queries.push(term); if (failLookup) throw new Error('Unavailable'); return { records: [fixture], retrievedAt: asOf, lookupUrl: 'https://eservices.zatca.gov.sa/words/' + term }; },
    };
  }
  return originalLoad.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
const { classifyItem, classifyItemsBatch } = require('../lib/ai/nvidia-nim-classifier.ts');
const { researchProduct, parseMazdaReferences, MAZDA_REFERENCE_SOURCE } = require('../lib/ai/product-research.ts');
process.env.NVIDIA_NIM_API_KEY = 'test-only';

test('duplicate invoice products share matching work but retain separate complete results', async () => {
  const startQuery = queries.length, startRequest = requests.length;
  answers = [{hsPrefix:'8513'}, {hsCode:fixture.HarmonizedCode,confidence:0.95,missingInformation:''}, {supported:true,reason:'Portable lamp confirmed.'}];
  const items = Array.from({length:4}, (_, rowIndex) => ({rowIndex, itemName:'Portable lamp', itemDescription:'Identical model'}));
  const result = await classifyItemsBatch(items, 4);
  assert.equal(result.length, 4);
  assert.ok(result.every(r => r.hsCode === fixture.HarmonizedCode && r.cdf === '7.5%'));
  assert.equal(requests.length - startRequest, 3, 'one plan, selection and verification instead of twelve model requests');
  assert.deepEqual(queries.slice(startQuery), ['8513', fixture.HarmonizedCode]);
  result[0].tariffEvidence.note = 'Changed in one row';
  assert.notEqual(result[1].tariffEvidence.note, result[0].tariffEvidence.note);
  requests.length = 0; queries.length = 0;
});

test('automatic search recovers from the wrong heading and verifies a fresh official rate', async () => {
  answers = [
    {hsPrefix:'870810',keywords:['lamp']},
    {hsCode:fixture.HarmonizedCode,confidence:0.99,missingInformation:''},
    {hsPrefix:'851310',keywords:['lamp']},
    {hsCode:fixture.HarmonizedCode,confidence:0.94,missingInformation:''},
    {supported:true,reason:'Product function matches the parent heading.'},
  ];
  const result = await classifyItem({itemName:'Lamp', invoiceContext:['Vehicle parts']});
  assert.equal(result.hsCode, fixture.HarmonizedCode);
  assert.equal(result.cdf, '7.5%', 'the final official fetch supplies the rate');
  assert.deepEqual(queries, ['8708', 'lamp', '8513', fixture.HarmonizedCode]);
  assert.equal(requests.length, 5, 'description-only matches require heading context and independent verification before accepting');
  assert.equal(result.tariffEvidence.searches.length, 3);
});

test('unavailable searches and unresolved facts never become invented tariff results', async () => {
  failLookup = true;
  answers = [{hsPrefix:'870810'}, {hsPrefix:'851310'}];
  const result = await classifyItem({itemName:'Unidentified part'});
  assert.equal(result.hsCode, 'REVIEW REQUIRED');
  assert.equal(result.regulationStatus, 'UNKNOWN');
  assert.ok(result.tariffEvidence.searches.every(s => s.outcome === 'unavailable'));
  failLookup = false;
});

test('overly broad headings are narrowed without discarding their parent descriptions', async () => {
  broadHeading = true;
  const startQuery = queries.length, startRequest = requests.length;
  answers = [{hsPrefix:'8513'}, {hsPrefix:'851310'}, {hsCode:fixture.HarmonizedCode,confidence:0.95,missingInformation:''}, {supported:true,reason:'Supported portable lamp.'}];
  try {
    const result = await classifyItem({itemName:'Portable lamp'});
    assert.equal(result.hsCode, fixture.HarmonizedCode);
    assert.deepEqual(queries.slice(startQuery), ['8513','851310',fixture.HarmonizedCode]);
    assert.match(requests[startRequest + 2].messages[1].content, /Portable electric lamps/);
    assert.match(requests[startRequest + 3].messages[1].content, /Portable electric lamps/);
    assert.equal(requests[startRequest + 3].chat_template_kwargs.low_effort, false);
  } finally { broadHeading = false; }
});

test('malformed matching answers are repaired without repeating completed tariff searches', async () => {
  const start = queries.length;
  answers = [{hsPrefix:'851310'}, {hsCode:fixture.HarmonizedCode,confidence:'invalid',missingInformation:''}, {hsCode:fixture.HarmonizedCode,confidence:0.95,missingInformation:''}, {supported:true,reason:'Supported portable lamp.'}];
  const result = await classifyItem({itemName:'Portable lamp'});
  assert.equal(result.hsCode, fixture.HarmonizedCode);
  assert.deepEqual(queries.slice(start), ['8513',fixture.HarmonizedCode]);
});

test('a similar name cannot override a failed parent-scope check or a missing competing heading', async () => {
  answers = [{hsPrefix:'851310'}, {hsCode:fixture.HarmonizedCode,confidence:0.99,missingInformation:''}, {supported:false,reason:'Missing evidence that the article is electrical lighting equipment.'}];
  const rejected = await classifyItem({itemName:'Passive reflector'});
  assert.equal(rejected.hsCode, 'REVIEW REQUIRED');
  assert.match(rejected.tariffEvidence.note, /Missing evidence/);
  failedPrefix = '8708';
  answers = [{hsPrefix:'851310',alternatives:['870810']}, {hsCode:fixture.HarmonizedCode,confidence:0.99,missingInformation:''}];
  const incomplete = await classifyItem({itemName:'Reflector'});
  assert.equal(incomplete.hsCode, 'REVIEW REQUIRED');
  assert.match(incomplete.tariffEvidence.note, /competing tariff headings/);
  failedPrefix = '';
});

test('manufacturer lookup keeps exact references separate and fails safely on unavailable documents', async () => {
  const entries = parseMazdaReferences('GRF5-51-5M0A REFLECTEUR ARRIERE(G) Mazda - packaging\nGRF5-51-5L0A REFLECTEUR ARRIERE(D) Mazda - packaging');
  assert.equal(entries.get('GRF5515M0A'), 'REFLECTEUR ARRIERE(G)');
  assert.equal(entries.get('GRF5515L0A'), 'REFLECTEUR ARRIERE(D)');
  assert.equal(entries.get('GRF5515M0'), undefined);
  const originalFetch = global.fetch;
  const sent = [];
  global.fetch = async (url) => { sent.push(url); return new Response('', {status:503}); };
  try {
    assert.deepEqual(await researchProduct('Unknown product', 'GRF5-51-5M0A'), {evidence:[]});
    const result = await researchProduct('R. BUMPER REFLECTOR M/Z 6 2018', 'GRF5-51-5M0A');
    assert.deepEqual(result.evidence, []);
    assert.match(result.note, /unavailable/);
    assert.deepEqual(sent, [MAZDA_REFERENCE_SOURCE], 'no invoice data is sent to the manufacturer');
  } finally { global.fetch = originalFetch; }
});
