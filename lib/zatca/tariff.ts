import { z } from 'zod';
import { Agent } from 'undici';
import type { ZatcaClassification } from '@/types';

export const TARIFF_SOURCE = 'https://eservices.zatca.gov.sa/sites/sc/en/tariff/Pages/TariffPages/TariffSearch.aspx';
const ORIGIN = 'https://eservices.zatca.gov.sa';
const detailSchema = z.object({
  HarmonizedCode: z.string(), EffectDate: z.string(), DutyRate: z.number().nullable(),
  DutyType: z.number(), MinimumDutyRate: z.number().nullable(), DutyUnit: z.unknown().optional(),
  ImportStatusID: z.string(), ImportStatusName: z.string().nullable(),
}).passthrough();
export const tariffRecordSchema = z.object({
  HarmonizedCode: z.string().regex(/^\d{12}$/), DescriptionEnglish: z.string().nullable(), DescriptionArabic: z.string().nullable(),
  RestrictionStatus: z.number(), ItemType: z.number(), TariffDetails: z.array(detailSchema),
  Procedures: z.array(z.object({ Code: z.number(), ReleaseNote: z.string().nullable() }).passthrough()),
}).passthrough();
export type TariffRecord = z.infer<typeof tariffRecordSchema>;
export interface ProductEvidence { reference: string; description: string; sourceUrl: string; retrievedAt: string }
export interface TariffSearchEvidence { query: string; kind: 'code' | 'description'; lookupUrl: string; retrievedAt?: string; outcome: 'found' | 'empty' | 'unavailable' }
export interface TariffEvidence {
  schemaVersion?: 1;
  sourceUrl: string;
  lookupUrl: string;
  retrievedAt: string;
  effectiveDate?: string;
  importStatus?: string;
  procedures: string[];
  record?: TariffRecord;
  note: string;
  productEvidence?: ProductEvidence[];
  searches?: TariffSearchEvidence[];
}

let publicKey: { value: string; until: number } | undefined;
let keyRequest: Promise<string> | undefined;
type LookupResult = { records: TariffRecord[]; retrievedAt: string; lookupUrl: string };
// Share public candidate searches briefly. Exact 12-digit confirmation always fetches afresh.
const candidateCache = new Map<string, { until: number; result: LookupResult }>();
const pendingCandidates = new Map<string, Promise<LookupResult>>();
const CANDIDATE_TTL_MS = 60_000;
// Restrict the transport preference to ZATCA, keeping normal hostname/TLS checks.
const officialAgent = new Agent({ connect: { family: 4 }, connections: 4 });
function officialFetch(url: string, init: RequestInit) {
  const options = { ...init, dispatcher: officialAgent };
  return fetch(url, options);
}
async function loadSearchScript(): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await officialFetch(`${ORIGIN}/sites/sc/Style%20Library/AngularAssets/ng-zatca.js`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('ZATCA search is unavailable.');
      return await response.text();
    } catch {
      if (attempt === 1) throw new Error('ZATCA search connection could not be loaded after retrying. Please retry shortly.');
    }
  }
  throw new Error('ZATCA search is unavailable.');
}
async function getPublicKey(): Promise<string> {
  if (publicKey && publicKey.until > Date.now()) return publicKey.value;
  // This is the public search application's header, not a user credential.
  // Discover it from the same official script the search page loads; never log it.
  keyRequest ??= (async () => {
    const script = await loadSearchScript();
    const value = script.match(/includes\("api\/Tariff"\)\s*\?\s*\w+\s*=\s*"([^"]+)"/)?.[1];
    if (!value) throw new Error('ZATCA search integration has changed.');
    publicKey = { value, until: Date.now() + 60 * 60 * 1000 };
    return value;
  })();
  try { return await keyRequest; } finally { keyRequest = undefined; }
}

export async function searchTariffs(prefix: string): Promise<{ records: TariffRecord[]; retrievedAt: string; lookupUrl: string }> {
  if (!/^(\d{4}|\d{6}|\d{12})$/.test(prefix)) throw new Error('Invalid HS search prefix.');
  return fetchTariffs('3', prefix);
}

/** ZATCA's public search UI uses type 1 for words and type 3 for HS codes. */
export async function searchTariffDescriptions(term: string) {
  const query = term.trim();
  if (query.length < 3 || query.length > 80 || !/^[\p{L}\p{N}\s-]+$/u.test(query)) throw new Error('Invalid tariff description search.');
  return fetchTariffs('1', query);
}

async function fetchTariffs(type: '1' | '3', query: string): Promise<{ records: TariffRecord[]; retrievedAt: string; lookupUrl: string }> {
  if (type === '3' && query.length === 12) return requestTariffs(type, query);
  const key = `${type}:${query}`;
  const cached = candidateCache.get(key);
  if (cached && cached.until > Date.now()) return structuredClone(cached.result);
  candidateCache.delete(key);
  let pending = pendingCandidates.get(key);
  if (!pending) {
    pending = requestTariffs(type, query).then(result => {
      for (const [oldKey, entry] of candidateCache) if (entry.until <= Date.now()) candidateCache.delete(oldKey);
      if (candidateCache.size >= 64) candidateCache.delete(candidateCache.keys().next().value!);
      candidateCache.set(key, { result, until: Date.now() + CANDIDATE_TTL_MS });
      return result;
    }).finally(() => { pendingCandidates.delete(key); });
    pendingCandidates.set(key, pending);
  }
  return structuredClone(await pending);
}

async function requestTariffs(type: '1' | '3', query: string): Promise<LookupResult> {
  const lookupUrl = `${ORIGIN}/Portal/api/Tariff/GetSubHarmonizedTariffs/${type}/${encodeURIComponent(query)}`;
  const response = await officialFetch(lookupUrl, { headers: { 'zatca-apikey': await getPublicKey(), Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!response.ok) { if (response.status === 401 || response.status === 403) publicKey = undefined; throw new Error('ZATCA tariff lookup is unavailable.'); }
  const body = z.object({ Code: z.literal(0), data: z.array(tariffRecordSchema).max(500) }).parse(await response.json());
  return { records: body.data, lookupUrl, retrievedAt: new Date().toISOString() };
}

export function activeDetail(record: TariffRecord, asOf: string) {
  const active = record.TariffDetails.filter(d => Number.isFinite(Date.parse(d.EffectDate)) && d.EffectDate.slice(0, 10) <= asOf.slice(0, 10)).sort((a, b) => b.EffectDate.localeCompare(a.EffectDate));
  if (!active.length || active.filter(d => d.EffectDate === active[0].EffectDate).length !== 1) return undefined;
  return active[0];
}

type StoredTariff = { hs_code?: string | null; raw_ai_response?: Record<string, unknown> | null };
type EvidenceCheck = { ok: true; classification: ZatcaClassification } | { ok: false; code: string; message: string };
const evidenceTimestamp = z.string().datetime({ offset: true });
function sameOfficialUrl(value: unknown, expected: string) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value), target = new URL(expected);
    return url.origin === target.origin && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname.replace(/\/$/, '') === target.pathname;
  } catch { return false; }
}

/** The writer, saved result page and Excel export use the same evidence contract. */
export function inspectTariffEvidence(stored?: StoredTariff): EvidenceCheck {
  const fail = (code: string, message: string): EvidenceCheck => ({ ok: false, code, message });
  const raw = stored?.raw_ai_response?.tariffEvidence;
  if (!raw || typeof raw !== 'object') return fail('EVIDENCE_MISSING', 'No ZATCA evidence was saved for this item. Run classification again.');
  const evidence = raw as Record<string, unknown>;
  if (!evidence.record) return fail('MATCH_UNCONFIRMED', typeof evidence.note === 'string' ? evidence.note : 'No official product match has been confirmed. Run classification again.');
  if (!sameOfficialUrl(evidence.sourceUrl, TARIFF_SOURCE)) return fail('SOURCE_INVALID', 'The saved source URL is missing or is not the official ZATCA tariff page. Run classification again.');
  const parsed = tariffRecordSchema.safeParse(evidence.record);
  if (!parsed.success) return fail('RECORD_INVALID', 'The saved ZATCA tariff record is incomplete or has an invalid format. Run classification again.');
  if (parsed.data.HarmonizedCode !== stored?.hs_code) return fail('CODE_MISMATCH', 'The saved HS code differs from the code in its ZATCA record. Run classification again.');
  const lookupUrl = `${ORIGIN}/Portal/api/Tariff/GetSubHarmonizedTariffs/3/${stored.hs_code}`;
  if (!sameOfficialUrl(evidence.lookupUrl, lookupUrl)) return fail('LOOKUP_INVALID', 'The saved evidence is missing the official lookup for this exact 12-digit HS code. Run classification again.');
  const timestamp = evidenceTimestamp.safeParse(evidence.retrievedAt);
  if (!timestamp.success) return fail('TIMESTAMP_INVALID', 'The saved ZATCA retrieval date is missing or invalid. Run classification again.');
  const retrievedAt = new Date(timestamp.data).toISOString();
  if (Date.parse(retrievedAt) > Date.now()) return fail('TIMESTAMP_FUTURE', 'The saved ZATCA retrieval date is in the future. Check the server clock and run classification again.');
  try { return { ok: true, classification: classifyOfficialRecord(parsed.data, retrievedAt, lookupUrl) }; }
  catch { return fail('TARIFF_NOT_EFFECTIVE', 'The saved ZATCA record has no unambiguous tariff effective on its retrieval date. Run classification again.'); }
}

/** Reconstruct saved tariff fields from the official snapshot, never stored AI labels. */
export function verifiedTariffFor(stored?: StoredTariff): ZatcaClassification | undefined {
  const check = inspectTariffEvidence(stored);
  return check.ok ? check.classification : undefined;
}

export function classifyOfficialRecord(record: TariffRecord, retrievedAt: string, lookupUrl: string): ZatcaClassification {
  const detail = activeDetail(record, retrievedAt);
  if (!detail || detail.HarmonizedCode !== record.HarmonizedCode) throw new Error('No unambiguous effective tariff found.');
  const allowed = detail.ImportStatusID === '1';
  const procedures = record.Procedures.map(p => p.ReleaseNote || `Procedure ${p.Code}`);
  const simpleRate = allowed && detail.DutyType === 1 && detail.DutyRate !== null && detail.DutyRate >= 0 && !detail.DutyUnit && (detail.MinimumDutyRate === 0 || detail.MinimumDutyRate === null);
  const regulationStatus = !allowed || record.RestrictionStatus > 0 || procedures.length ? 'REGULATED' : record.RestrictionStatus === 0 ? 'NON-REGULATED' : 'UNKNOWN';
  return {
    hsCode: record.HarmonizedCode,
    cdf: simpleRate ? `${detail.DutyRate}%` : 'REVIEW REQUIRED',
    regulationStatus, standardizedZatcaName: record.DescriptionEnglish || record.DescriptionArabic || '',
    tariffEvidence: { schemaVersion: 1, sourceUrl: TARIFF_SOURCE, lookupUrl, retrievedAt, effectiveDate: detail.EffectDate,
      importStatus: detail.ImportStatusName || detail.ImportStatusID, procedures, record,
      note: !allowed ? 'Import restriction or prohibition: review the official import status before proceeding.' : simpleRate ? 'Official tariff data; confirm the AI product match before customs submission. Duty is a tariff rate, not a calculated payable amount.' : 'Specific, minimum, or ambiguous duty requires review of the official tariff details.',
    },
  };
}
