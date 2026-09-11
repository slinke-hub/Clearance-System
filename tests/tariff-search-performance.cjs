/* eslint-disable @typescript-eslint/no-require-imports -- Load the official lookup module with controlled HTTP responses. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
const { searchTariffs, searchTariffDescriptions } = require('../lib/zatca/tariff.ts');
const fixture = require('./fixtures/zatca-hand-lamp.json');

test('candidate requests are shared briefly; exact confirmation stays fresh and failures are retryable', async () => {
  const realFetch = global.fetch, realNow = Date.now;
  const requests = [];
  let scriptCalls = 0;
  let now = realNow(), fail = false, duty = 10;
  Date.now = () => now;
  global.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error', 'official lookups must not follow a redirect to another source');
    if (url.endsWith('ng-zatca.js')) {
      scriptCalls++;
      if (scriptCalls === 1) throw new Error('Temporary connection timeout');
      return new Response('includes("api/Tariff") ? k = "public-test-header"');
    }
    requests.push(url);
    if (fail) return new Response('', {status:503});
    return Response.json({Code:0, data:[{...fixture, TariffDetails:fixture.TariffDetails.map(d => ({...d, DutyRate:duty}))}]});
  };
  try {
    const four = await Promise.all(Array.from({length:4}, () => searchTariffs('8513')));
    assert.equal(requests.length, 1, 'four concurrent searches make one official request');
    assert.equal(scriptCalls, 2, 'a temporary search-connection failure is retried once, shared by all callers');
    four[0].records[0].DescriptionEnglish = 'changed';
    assert.equal(four[1].records[0].DescriptionEnglish, fixture.DescriptionEnglish);
    const reused = await searchTariffs('8513');
    assert.equal(reused.retrievedAt, four[1].retrievedAt, 'retain the original evidence timestamp');
    assert.equal(requests.length, 1);
    now += 60_001;
    await searchTariffs('8513');
    assert.equal(requests.length, 2, 'expired searches are refreshed');
    await Promise.all([searchTariffDescriptions('lamp'), searchTariffDescriptions('lamp')]);
    assert.equal(requests.length, 3);
    const first = await searchTariffs(fixture.HarmonizedCode);
    duty = 7.5;
    const second = await searchTariffs(fixture.HarmonizedCode);
    assert.equal(requests.length, 5, 'exact-code requests always bypass candidate caching');
    assert.equal(first.records[0].TariffDetails[0].DutyRate, 10);
    assert.equal(second.records[0].TariffDetails[0].DutyRate, 7.5);
    fail = true;
    await assert.rejects(searchTariffs('8708'), /unavailable/);
    fail = false;
    await searchTariffs('8708');
    assert.equal(requests.length, 7, 'an outage must not be cached');
    for (let n = 1000; n < 1065; n++) await searchTariffs(String(n));
    const before = requests.length;
    await searchTariffs('1000');
    assert.equal(requests.length, before + 1, 'candidate memory is bounded');
  } finally { global.fetch = realFetch; Date.now = realNow; }
});
