/* eslint-disable @typescript-eslint/no-require-imports -- Load the client workflow for Node tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { classifyUploadedInvoice } = require('../lib/excel/classify-upload.ts');
const { mapItems } = require('../lib/excel/invoice.ts');
const mapping = { itemName: 'Description', quantity: 'Qty', unitPrice: 'Price', totalPrice: 'Amount', currency: 'Currency' };
const items = mapItems(Array.from({ length: 12 }, (_, n) => ({ rowIndex: n * 3 + 2, data: { Description: `Lamp ${n}`, Qty: 2, Price: 3, Amount: 6, Currency: 'US$' } })), mapping);
const invoice = { runId: 'new-upload', metadata: { currency: 'USD', goodsTotal: 72, charges: [] } };
const json = (value, status = 200) => Response.json(value, { status });

test('upload saves extracted items then classifies all source rows automatically in order', async () => {
  const calls = [], progress = [];
  const results = await classifyUploadedInvoice(invoice, mapping, items, p => progress.push(p), async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    assert.equal(body.runId, 'new-upload');
    if (url === '/api/invoices/review') {
      assert.equal(body.items.length, 12);
      assert.ok(body.items.every(i => i.currency === 'USD'));
      return json({ success: true });
    }
    return json({ rowIndexes: body.batchRows, classifications: body.batchRows.map(row => ({ hsCode: '851310000001', row })) });
  });
  assert.equal(calls[0].url, '/api/invoices/review');
  assert.deepEqual(calls.slice(1).map(c => c.body.batchRows.length), [4, 4, 4]);
  assert.deepEqual(results.map(r => r.row), items.map(i => i.rowIndex));
  assert.deepEqual(progress, [33, 67, 100]);
});

test('invalid extraction and failed saves do not trigger AI; mismatched result rows are rejected', async () => {
  let calls = 0;
  const request = async () => { calls++; return json({ error: 'Save failed' }, 500); };
  await assert.rejects(classifyUploadedInvoice(invoice, {}, items, () => {}, request), /description column/);
  await assert.rejects(classifyUploadedInvoice(invoice, mapping, [{ ...items[0], quantity: '100' }], () => {}, request), /does not match/);
  assert.equal(calls, 0);
  await assert.rejects(classifyUploadedInvoice(invoice, mapping, items, () => {}, request), /Save failed/);
  assert.equal(calls, 1);
  await assert.rejects(classifyUploadedInvoice(invoice, mapping, items, () => {}, async url => url.endsWith('review') ? json({ success: true }) : json({ classifications: Array(5).fill({}), rowIndexes: [1, 2, 3, 4, 5] })), /did not match/);
});
