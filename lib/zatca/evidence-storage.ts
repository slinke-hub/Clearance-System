import { isDeepStrictEqual } from 'node:util';
import type { ZatcaClassification } from '@/types';
import { inspectTariffEvidence, TARIFF_SOURCE } from './tariff';

export class EvidenceStorageError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** Normalize and validate before any write; don't send an apparent success that reports reject. */
export function classificationRecordFor(result: ZatcaClassification, lineItemId: string, runId: string) {
  const check = inspectTariffEvidence({ hs_code: result.hsCode, raw_ai_response: { tariffEvidence: result.tariffEvidence } });
  if (/^\d{12}$/.test(result.hsCode) && !check.ok) {
    throw new EvidenceStorageError(check.code, `ZATCA evidence could not be saved: ${check.message}`);
  }
  const classification: ZatcaClassification = check.ok ? {
    ...check.classification, confidenceScore: result.confidenceScore,
    tariffEvidence: { ...check.classification.tariffEvidence!, productEvidence: result.tariffEvidence?.productEvidence, searches: result.tariffEvidence?.searches },
  } : {
    hsCode: 'REVIEW REQUIRED', cdf: 'REVIEW REQUIRED', regulationStatus: 'UNKNOWN', standardizedZatcaName: result.standardizedZatcaName,
    confidenceScore: result.confidenceScore,
    tariffEvidence: { schemaVersion: 1, sourceUrl: TARIFF_SOURCE, lookupUrl: '', retrievedAt: '', procedures: [],
      note: result.tariffEvidence?.note || 'No official product match has been confirmed. Run classification again.',
      productEvidence: result.tariffEvidence?.productEvidence, searches: result.tariffEvidence?.searches },
  };
  const record = {
    line_item_id: lineItemId, run_id: runId, hs_code: classification.hsCode, cdf: classification.cdf,
    regulation_status: classification.regulationStatus, standardized_name: classification.standardizedZatcaName,
    confidence_score: classification.confidenceScore ?? null, classified_at: new Date().toISOString(),
    // Match the JSONB representation explicitly (no undefined values or non-JSON metadata).
    raw_ai_response: JSON.parse(JSON.stringify({ tariffEvidence: classification.tariffEvidence })) as Record<string, unknown>,
  };
  return { record, classification };
}

export function assertEvidenceSaved(expected: ReturnType<typeof classificationRecordFor>['record'], saved?: {
  hs_code?: string | null; raw_ai_response?: Record<string, unknown> | null;
}) {
  if (!saved || saved.hs_code !== expected.hs_code || !isDeepStrictEqual(saved.raw_ai_response, expected.raw_ai_response)) {
    throw new EvidenceStorageError('EVIDENCE_SAVE_MISMATCH', 'The saved ZATCA evidence did not match the verified result. Classification was not confirmed. Please retry.');
  }
  if (/^\d{12}$/.test(expected.hs_code)) {
    const check = inspectTariffEvidence(saved);
    if (!check.ok) throw new EvidenceStorageError(check.code, check.message);
  }
}
