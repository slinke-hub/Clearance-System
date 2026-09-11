/* eslint-disable @typescript-eslint/no-require-imports -- Exercise TypeScript auth handlers with isolated sessions. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
let configured = true;
let databaseUser = { id: 'verified-owner', email: 'owner@example.test' };
let signInError = null;
let signInCalls = 0;
let saveError = null;
const savedRuns = [];
const cookies = new Map();
const db = {
  auth: {
    getUser: async () => ({ data: { user: databaseUser } }),
    signInWithPassword: async () => { signInCalls++; return { data: { user: databaseUser }, error: signInError }; },
  },
  from: table => table === 'invoice_runs'
    ? { insert: async run => { savedRuns.push(run); return { error: saveError }; } }
    : { select: () => ({ eq: () => ({ single: async () => ({ data: table === 'profiles' ? { role: 'user', full_name: 'Owner', user_type: 'enterprise' } : { plan: 'pro' } }) }) }) },
};
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => cookies.has(key) ? { value: cookies.get(key) } : undefined }) };
  if (name === '@/lib/supabase/config') return { isSupabaseConfigured: () => configured };
  if (name === '@/lib/supabase/server') return { createClient: async () => db };
  if (name === '@supabase/ssr') return { createServerClient: () => db };
  return originalLoad.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { getCurrentUser, ADMIN_CREDENTIALS } = require('../lib/auth/session.ts');
const { POST: login } = require('../app/api/auth/login/route.ts');
const { proxy } = require('../proxy.ts');
const { POST: upload } = require('../app/api/invoices/upload/route.ts');
const staleCookie = JSON.stringify({ id: ADMIN_CREDENTIALS.id, email: ADMIN_CREDENTIALS.email });

test('database identity wins over stale local admin cookies; missing database sessions stay unauthenticated', async () => {
  cookies.set('clearance_admin_session', staleCookie);
  const user = await getCurrentUser();
  assert.equal(user.id, 'verified-owner');
  assert.equal(user.role, 'user');
  databaseUser = null;
  assert.equal(await getCurrentUser(), null);
  const response = await proxy(new NextRequest('http://localhost/upload', { headers: { cookie: `clearance_admin_session=${encodeURIComponent(staleCookie)}` } }));
  assert.equal(response.status, 307);
  assert.match(response.headers.get('location'), /\/login\?redirectTo=%2Fupload/);
  configured = false;
  assert.equal((await getCurrentUser()).id, ADMIN_CREDENTIALS.id);
  configured = true;
  databaseUser = { id: 'verified-owner', email: 'owner@example.test' };
});

test('connected login validates even demo credentials and clears old local sessions on success', async () => {
  const request = () => new Request('http://localhost/api/auth/login', { method: 'POST', body: JSON.stringify({ email: ADMIN_CREDENTIALS.email, password: ADMIN_CREDENTIALS.password }) });
  signInError = { message: 'Invalid login credentials' };
  assert.equal((await login(request())).status, 401);
  assert.equal(signInCalls, 1);
  signInError = null;
  const response = await login(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, 'verified-owner');
  assert.equal(response.cookies.get('clearance_admin_session').value, '');
  assert.equal(response.cookies.get('clearance_client_session').value, '');
});

test('upload saves as the verified database owner and reports access and service failures accurately', async () => {
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Item Name'], ['Lamp']]), 'Invoice');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const request = () => {
    const form = new FormData();
    form.set('file', new File([bytes], 'invoice.xlsx'));
    return new Request('http://localhost/api/invoices/upload', { method: 'POST', body: form });
  };
  const uploaded = await upload(request());
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.cookies.get('clearance_admin_session').value, '');
  assert.equal(uploaded.cookies.get('clearance_client_session').value, '');
  assert.equal(savedRuns[0].user_id, 'verified-owner');
  databaseUser = null;
  assert.equal((await upload(request())).status, 401);
  assert.equal(savedRuns.length, 1);
  databaseUser = { id: 'verified-owner', email: 'owner@example.test' };
  const previousError = console.error;
  console.error = () => {};
  try {
    saveError = { code: '42501', message: 'Access denied' };
    assert.equal((await upload(request())).status, 403);
    saveError = { code: 'PGRST000', message: 'Service unavailable' };
    assert.equal((await upload(request())).status, 503);
  } finally { console.error = previousError; saveError = null; }
});
