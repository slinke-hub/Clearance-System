import type { ZatcaClassification } from '@/types';
import { activeDetail, classifyOfficialRecord, inspectTariffEvidence, searchTariffs } from './tariff';
import { EvidenceStorageError } from './evidence-storage';

/** Refresh a previously selected code; never manufacture a missing lookup URL. */
export async function repairLookupEvidence(result: ZatcaClassification): Promise<ZatcaClassification> {
  const check = inspectTariffEvidence({ hs_code: result.hsCode, raw_ai_response: { tariffEvidence: result.tariffEvidence } });
  if (check.ok || check.code !== 'LOOKUP_INVALID') return result;
  let lookup;
  try { lookup = await searchTariffs(result.hsCode); }
  catch { throw new EvidenceStorageError('ZATCA_LOOKUP_UNAVAILABLE', 'ZATCA could not be reached to refresh this saved code. Retry the ZATCA check shortly.'); }
  const record = lookup.records.find(r => r.HarmonizedCode === result.hsCode && activeDetail(r, lookup.retrievedAt));
  if (!record) throw new EvidenceStorageError('ZATCA_CODE_NOT_CURRENT', 'ZATCA did not return a current tariff for the saved code. This item needs a new product classification.');
  const official = classifyOfficialRecord(record, lookup.retrievedAt, lookup.lookupUrl);
  return { ...official, confidenceScore: result.confidenceScore, tariffEvidence: {
    ...official.tariffEvidence!, productEvidence: result.tariffEvidence?.productEvidence,
    searches: [...(result.tariffEvidence?.searches || []), { query: result.hsCode, kind: 'code', lookupUrl: lookup.lookupUrl, retrievedAt: lookup.retrievedAt, outcome: 'found' }],
  } };
}
