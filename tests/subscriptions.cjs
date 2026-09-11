/* eslint-disable @typescript-eslint/no-require-imports -- Test TypeScript handlers without starting Next. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let subscription;
let aiCalls = 0;
let savedClassification;
const db = { from(table) {
  if (table === 'subscriptions') return { select: () => ({ eq: () => ({ maybeSingle: async () => subscription }) }) };
  if (table === 'classification_results') return { upsert: async records => { savedClassification = JSON.parse(JSON.stringify(records[0])); return { error: null }; } };
  if (table === 'invoice_runs') return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
  throw new Error(`Unexpected table ${table}`);
} };
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === '@/lib/auth/session') return { getCurrentUser: async () => ({ id: 'owner', role: 'user', plan: 'free' }) };
  if (name === '@/lib/supabase/config') return { isSupabaseConfigured: () => true };
  if (name === '@/lib/supabase/server') return { createClient: async () => db };
  if (name === '@/lib/invoices') return { loadInvoice: async () => ({ run: { reviewed_at: '2026-09-09' }, items: [{ id: 'line', row_index: 1, item_name: 'Lamp', classification:savedClassification }] }) };
  if (name === '@/lib/ai/nvidia-nim-classifier') return {
    isNvidiaNimConfigured: () => true,
    classifyItemsBatch: async () => { aiCalls++; return [{ hsCode: 'REVIEW REQUIRED', cdf: 'REVIEW REQUIRED', regulationStatus: 'UNKNOWN' }]; },
  };
  return originalLoad.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { POST } = require('../app/api/classify/route.ts');
const request = () => new Request('http://localhost/api/classify', { method: 'POST', body: JSON.stringify({ runId: '00000000-0000-4000-8000-000000000001', batchRows: [1] }) });

test('subscription setup and database errors are distinguished from genuine access denials', async () => {
  for (const [result, status, code] of [
    [{ data: null, error: { code: 'database_error' } }, 503, 'SUBSCRIPTION_LOOKUP_FAILED'],
    [{ data: null, error: null }, 409, 'SUBSCRIPTION_NOT_PROVISIONED'],
    [{ data: { status: 'suspended', plan: 'pro' }, error: null }, 403, 'SUBSCRIPTION_INACTIVE'],
    [{ data: { status: 'active', plan: 'free', invoices_used: 5, monthly_limit: 5 }, error: null }, 403, 'MONTHLY_LIMIT_REACHED'],
  ]) {
    subscription = result;
    const response = await POST(request());
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
  assert.equal(aiCalls, 0, 'blocked accounts must not send items to AI');
});

test('a provisioned subscription permits classification and enterprise remains unlimited', async () => {
  for (const plan of ['free', 'enterprise']) {
    subscription = { data: { status: 'active', plan, invoices_used: 0, monthly_limit: plan === 'enterprise' ? 0 : 5 }, error: null };
    assert.equal((await POST(request())).status, 200);
  }
  assert.equal(aiCalls, 2);
});
