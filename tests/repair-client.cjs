/* eslint-disable @typescript-eslint/no-require-imports -- Verify the automatic saved-invoice repair workflow. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module,file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {repairInvoiceEvidence} = require('../lib/invoices/repair-client.ts');
test('automatic repair covers all affected rows in bounded batches and reports service failures',async () => {
  const requests = [], rows = Array.from({length:9},(_,n)=>n*2);
  const count = await repairInvoiceEvidence('invoice',rows,async (url,options) => {
    assert.equal(url,'/api/invoices/invoice/repair-evidence');
    const body = JSON.parse(options.body);requests.push(body.rowIndexes);
    assert.deepEqual(Object.keys(body),['rowIndexes'],'the client never supplies the HS code');
    return Response.json({repaired:body.rowIndexes.length});
  });
  assert.equal(count,9); assert.deepEqual(requests.map(r=>r.length),[4,4,1]); assert.deepEqual(requests.flat(),rows);
  await assert.rejects(repairInvoiceEvidence('invoice',[1],async()=>Response.json({error:'ZATCA unavailable'},{status:503})),/ZATCA unavailable/);
});
