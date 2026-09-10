import { z } from 'zod';
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
export interface TariffEvidence {
  sourceUrl: string;
  lookupUrl: string;
  retrievedAt: string;
  effectiveDate?: string;
  importStatus?: string;
  procedures: string[];
  record?: TariffRecord;
  note: string;
}

let publicKey: { value: string; until: number } | undefined;
let keyRequest: Promise<string> | undefined;
async function getPublicKey(): Promise<string> {
  if (publicKey && publicKey.until > Date.now()) return publicKey.value;
  // This is the public search application's header, not a user credential.
  // Discover it from the same official script the search page loads; never log it.
  keyRequest ??= (async () => {
    const response = await fetch(`${ORIGIN}/sites/sc/Style%20Library/AngularAssets/ng-zatca.js`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('ZATCA search is unavailable.');
    const script = await response.text();
    const value = script.match(/includes\("api\/Tariff"\)\s*\?\s*\w+\s*=\s*"([^"]+)"/)?.[1];
    if (!value) throw new Error('ZATCA search integration has changed.');
    publicKey = { value, until: Date.now() + 60 * 60 * 1000 };
    return value;
  })();
  try { return await keyRequest; } finally { keyRequest = undefined; }
}

export async function searchTariffs(prefix: string): Promise<{ records: TariffRecord[]; retrievedAt: string; lookupUrl: string }> {
  if (!/^(\d{4}|\d{6}|\d{12})$/.test(prefix)) throw new Error('Invalid HS search prefix.');
  const lookupUrl = `${ORIGIN}/Portal/api/Tariff/GetSubHarmonizedTariffs/3/${prefix}`;
  const response = await fetch(lookupUrl, { headers: { 'zatca-apikey': await getPublicKey(), Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) { if (response.status === 401 || response.status === 403) publicKey = undefined; throw new Error('ZATCA tariff lookup is unavailable.'); }
  const body = z.object({ Code: z.literal(0), data: z.array(tariffRecordSchema).max(500) }).parse(await response.json());
  return { records: body.data, lookupUrl, retrievedAt: new Date().toISOString() };
}

export function activeDetail(record: TariffRecord, asOf: string) {
  const active = record.TariffDetails.filter(d => Number.isFinite(Date.parse(d.EffectDate)) && d.EffectDate.slice(0, 10) <= asOf.slice(0, 10)).sort((a, b) => b.EffectDate.localeCompare(a.EffectDate));
  if (!active.length || active.filter(d => d.EffectDate === active[0].EffectDate).length !== 1) return undefined;
  return active[0];
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
    tariffEvidence: { sourceUrl: TARIFF_SOURCE, lookupUrl, retrievedAt, effectiveDate: detail.EffectDate,
      importStatus: detail.ImportStatusName || detail.ImportStatusID, procedures, record,
      note: !allowed ? 'Import restriction or prohibition: review the official import status before proceeding.' : simpleRate ? 'Official tariff data; confirm the AI product match before customs submission. Duty is a tariff rate, not a calculated payable amount.' : 'Specific, minimum, or ambiguous duty requires review of the official tariff details.',
    },
  };
}
