/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real save/read/report pipeline with JSONB-style database responses. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const runId = '00000000-0000-4000-8000-000000000001';
const lineId = '00000000-0000-4000-8000-000000000002';
const run = {id:runId,user_id:'owner',file_name:'test.xlsx',reviewed_at:'2026-09-11T00:00:00Z',status:'pending'};
let saved, output, corrupt = false, writes = 0, lookupFailure = false, conflict = false, liveRepair = false;
let currentUser = {id:'owner',role:'admin',plan:'enterprise'};
const lookupCalls = [];
const db = {from(table) {
  if (table === 'invoice_runs') return {
    select:() => { const filters = {}; const query = {eq:(key,value) => {filters[key]=value;return query;},maybeSingle:async () => ({data:Object.entries(filters).every(([key,value]) => run[key] === value) ? run : null,error:null})}; return query; },
    update:values => ({eq:() => ({eq:async () => {Object.assign(run, values); return {error:null};}})}),
  };
  if (table === 'invoice_line_items') return {select:() => ({eq:() => ({order:async () => ({data:[{id:lineId,row_index:1,item_name:'Portable hand lamp',classification:saved ? [saved] : []}],error:null})})})};
  if (table === 'classification_results') return {update:record => {
    const filters = {};
    const query = {eq:(key,value) => {filters[key]=value;return query;},is:(key,value) => {filters[key]=value;return query;},select:async () => {
      if (conflict || !Object.entries(filters).every(([key,value]) => saved?.[key] === value)) return {data:[],error:null};
      writes++; saved = JSON.parse(JSON.stringify({...saved,...record}));
      if (corrupt) delete saved.raw_ai_response.tariffEvidence.lookupUrl;
      return {data:[{line_item_id:lineId}],error:null};
    }};
    return query;
  },upsert:async records => {
    writes++;
    saved = JSON.parse(JSON.stringify(records[0]));
    if (corrupt) delete saved.raw_ai_response.tariffEvidence.lookupUrl;
    return {error:null};
  }};
  throw new Error(`Unexpected table ${table}`);
}};
const load = Module._load;
Module._load = function(name, parent, main) {
  if (name === '@/lib/auth/session') return {getCurrentUser:async () => currentUser};
  if (name === '@/lib/supabase/config') return {isSupabaseConfigured:() => true};
  if (name === '@/lib/supabase/server') return {createClient:async () => db};
  if (name === '@/lib/ai/nvidia-nim-classifier') return {isNvidiaNimConfigured:() => true,classifyItemsBatch:async () => [output]};
  if (name === './tariff' && parent.filename.endsWith('repair-evidence.ts')) {
    const actual = load.call(this,name,parent,main);
    return {...actual,searchTariffs:async code => {
      lookupCalls.push(code);
      if (lookupFailure) throw new Error('Unavailable');
      if (liveRepair) return actual.searchTariffs(code);
      return {records:[fixture],lookupUrl:lookup,retrievedAt:'2026-09-11T00:00:00Z'};
    }};
  }
  return load.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main);
};
require.extensions['.ts'] = (module,file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
const {POST} = require('../app/api/classify/route.ts');
const {POST:repair} = require('../app/api/invoices/[runId]/repair-evidence/route.ts');
const {loadInvoice} = require('../lib/invoices.ts');
const {invoiceReport} = require('../lib/invoices/report.ts');
const {generateEnrichedExcel} = require('../lib/excel/exporter.ts');
const {classifyOfficialRecord,inspectTariffEvidence,searchTariffs} = require('../lib/zatca/tariff.ts');
const XLSX = require('xlsx');
const fixture = require('./fixtures/zatca-hand-lamp.json');
const lookup = 'https://eservices.zatca.gov.sa/Portal/api/Tariff/GetSubHarmonizedTariffs/3/' + fixture.HarmonizedCode;
const request = () => new Request('http://localhost/api/classify',{method:'POST',body:JSON.stringify({runId,batchRows:[1]})});
const result = () => classifyOfficialRecord(fixture,'2026-09-09T22:00:00+03:00',lookup + '/');
const repairRequest = () => new Request('http://localhost/api/repair',{method:'POST',body:JSON.stringify({rowIndexes:[1]})});
const params = {params:Promise.resolve({runId})};
function legacy() {
  const previous = result(); previous.tariffEvidence.lookupUrl = lookup.slice(0,-6);
  saved = {line_item_id:lineId,run_id:runId,hs_code:previous.hsCode,cdf:'99%',regulation_status:'NON-REGULATED',classified_at:'2026-09-09T19:00:00Z',raw_ai_response:{tariffEvidence:previous.tariffEvidence}};
}

test('official evidence survives save, JSON serialization, database reload, result page and every export tab', async () => {
  output = {...result(),cdf:'99%',regulationStatus:'NON-REGULATED',confidenceScore:0.95};
  output.tariffEvidence.searches = [{query:'8513',kind:'code',outcome:'found',lookupUrl:lookup,retrievedAt:'2026-09-09T19:00:00Z'}];
  const response = await POST(request());
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.classifications[0].cdf,'10%');
  assert.equal(body.classifications[0].regulationStatus,'REGULATED');
  assert.equal(body.status,'completed');
  assert.equal(saved.raw_ai_response.tariffEvidence.retrievedAt,'2026-09-09T19:00:00.000Z');
  assert.equal(saved.raw_ai_response.tariffEvidence.lookupUrl,lookup);
  assert.equal(saved.raw_ai_response.tariffEvidence.schemaVersion,1);
  assert.deepEqual(saved.raw_ai_response.tariffEvidence.record,fixture);
  assert.equal(saved.raw_ai_response.tariffEvidence.searches.length,1);
  const invoice = await loadInvoice(runId,'owner');
  const row = invoiceReport(invoice.run,invoice.items).items[0];
  assert.equal(row.verified,true);
  assert.equal(row.hsCode,fixture.HarmonizedCode);
  assert.equal(row.duty,'10%');
  const book = XLSX.read(await generateEnrichedExcel(invoice.items,'test.xlsx'));
  for (const name of ['Main','ZATCA Classification','Tariff Sources']) assert.equal(XLSX.utils.sheet_to_json(book.Sheets[name],{range:1})[0]['HS CODES'],fixture.HarmonizedCode);
});

test('missing exact lookup evidence is fetched from ZATCA before a new classification is saved', async () => {
  output = result(); delete output.tariffEvidence.lookupUrl;
  const before = writes;
  const response = await POST(request());
  assert.equal(response.status,200);
  assert.equal((await response.json()).classifications[0].cdf,'10%');
  assert.equal(writes,before+1);
  assert.equal(lookupCalls.at(-1),fixture.HarmonizedCode);
  assert.equal(saved.raw_ai_response.tariffEvidence.lookupUrl,lookup);
});

test('existing incomplete results are repaired without uploading again or using AI', async () => {
  legacy();
  const before = writes;
  const response = await repair(repairRequest(),params);
  assert.equal(response.status,200);
  assert.equal((await response.json()).repaired,1);
  assert.equal(writes,before+1);
  assert.equal(saved.cdf,'10%');
  const invoice = await loadInvoice(runId,'owner');
  const row = invoiceReport(invoice.run,invoice.items).items[0];
  assert.equal(row.verified,true);
  assert.equal(row.repairable,false);
  assert.equal(row.hsCode,fixture.HarmonizedCode);
  assert.equal((await (await repair(repairRequest(),params)).json()).repaired,0,'already valid evidence is not fetched again');
  const book = XLSX.read(await generateEnrichedExcel(invoice.items,'test.xlsx'));
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Main,{range:1})[0]['HS CODES'],fixture.HarmonizedCode);
});

test('failed lookups leave old evidence untouched, and concurrent updates are not overwritten', async () => {
  legacy(); const old = structuredClone(saved), before = writes;
  lookupFailure = true;
  try {
    const response = await repair(repairRequest(),params);
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'ZATCA_LOOKUP_UNAVAILABLE');
    assert.deepEqual(saved,old); assert.equal(writes,before);
  } finally {lookupFailure=false;}
  conflict = true;
  try {assert.equal((await repair(repairRequest(),params)).status,409);assert.deepEqual(saved,old);}
  finally {conflict=false;}
});

test('repair requires authentication and invoice ownership before making any official requests', async () => {
  const owner = currentUser, before = lookupCalls.length;
  try {
    currentUser = null;
    assert.equal((await repair(repairRequest(),params)).status,401);
    currentUser = {...owner,id:'someone-else'};
    assert.equal((await repair(repairRequest(),params)).status,404);
    assert.equal(lookupCalls.length,before);
  } finally {currentUser=owner;}
});

test('lost database evidence cannot return success and its exact failure is visible on the report', async () => {
  output = result(); corrupt = true; run.status = 'pending';
  try {
    const response = await POST(request());
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'EVIDENCE_SAVE_MISMATCH');
    assert.equal(run.status,'pending');
    const invoice = await loadInvoice(runId,'owner');
    assert.match(invoiceReport(invoice.run,invoice.items).items[0].note,/exact 12-digit HS code/);
  } finally {corrupt = false;}
});

test('genuine unmatched products preserve their original reason through the save and reload', async () => {
  output = {hsCode:'REVIEW REQUIRED',cdf:'REVIEW REQUIRED',regulationStatus:'UNKNOWN',standardizedZatcaName:'Part',tariffEvidence:{note:'Material is needed to distinguish these headings.'}};
  assert.equal((await POST(request())).status,200);
  const check = inspectTariffEvidence(saved);
  assert.equal(check.code,'MATCH_UNCONFIRMED');
  const invoice = await loadInvoice(runId,'owner');
  assert.equal(invoiceReport(invoice.run,invoice.items).items[0].note,output.tariffEvidence.note);
});

test('each invalid evidence component has a specific diagnostic without accepting a third-party source', () => {
  const valid = result();
  const cases = [
    [{sourceUrl:'https://example.com'},'SOURCE_INVALID'],
    [{record:{HarmonizedCode:fixture.HarmonizedCode}},'RECORD_INVALID'],
    [{record:{...fixture,HarmonizedCode:'999999999999'}},'CODE_MISMATCH'],
    [{lookupUrl:lookup.replace('eservices.zatca.gov.sa','eservices.zatca.gov.sa.example.com')},'LOOKUP_INVALID'],
    [{retrievedAt:'invalid'},'TIMESTAMP_INVALID'],
    [{retrievedAt:'2099-01-01T00:00:00Z'},'TIMESTAMP_FUTURE'],
    [{record:{...fixture,TariffDetails:[]}},'TARIFF_NOT_EFFECTIVE'],
  ];
  for (const [patch,code] of cases) assert.equal(inspectTariffEvidence({hs_code:valid.hsCode,raw_ai_response:{tariffEvidence:{...valid.tariffEvidence,...patch}}}).code,code);
});

test('fresh live ZATCA evidence passes the save/reload contract', {skip:process.env.LIVE_ZATCA_TEST !== '1'}, async () => {
  const live = await searchTariffs(fixture.HarmonizedCode);
  const record = live.records.find(r => r.HarmonizedCode === fixture.HarmonizedCode);
  assert.ok(record);
  output = classifyOfficialRecord(record,live.retrievedAt,live.lookupUrl);
  const response = await POST(request());
  assert.equal(response.status,200);
  const invoice = await loadInvoice(runId,'owner');
  const row = invoiceReport(invoice.run,invoice.items).items[0];
  assert.equal(row.verified,true);
  assert.equal(row.hsCode,output.hsCode);
  assert.equal(row.duty,output.cdf);
  assert.deepEqual(saved.raw_ai_response.tariffEvidence.record,record);
  saved.raw_ai_response.tariffEvidence.lookupUrl = '';
  liveRepair = true;
  try {
    assert.equal((await repair(repairRequest(),params)).status,200);
    assert.equal(inspectTariffEvidence(saved).ok,true);
    assert.equal(saved.raw_ai_response.tariffEvidence.lookupUrl,live.lookupUrl);
  } finally {liveRepair=false;}
});
