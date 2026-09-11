import type { ProductEvidence } from '@/lib/zatca/tariff';

// Manufacturer-hosted reference list. Fetch public data only; invoice contents are never sent to it.
export const MAZDA_REFERENCE_SOURCE = 'https://media-assets.mazda.eu/raw/upload/mazdafr/globalassets/maf-local-pages/pdf/fiche-emballages-vfinal.pdf';
let catalogue: { descriptions: Map<string, string>; retrievedAt: string; expires: number } | undefined;
let pending: Promise<NonNullable<typeof catalogue>> | undefined;
const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function parseMazdaReferences(text: string) {
  const descriptions = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^([A-Z0-9-]{7,20})\s+(.{1,180}?)\s+Mazda\s/.exec(line.trim());
    if (match) descriptions.set(normalize(match[1]), match[2].trim());
  }
  return descriptions;
}

async function loadCatalogue() {
  if (catalogue && catalogue.expires > Date.now()) return catalogue;
  pending ??= (async () => {
    const response = await fetch(MAZDA_REFERENCE_SOURCE, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || Number(response.headers.get('content-length')) > 5_000_000) throw new Error('Manufacturer reference list unavailable.');
    // Bound the download even when a server omits Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Manufacturer reference list empty.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5_000_000) { await reader.cancel(); throw new Error('Manufacturer reference list too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    try {
      const result = await parser.getText();
      const descriptions = parseMazdaReferences(result.text);
      if (!descriptions.size) throw new Error('Manufacturer reference list format changed.');
      return catalogue = { descriptions, retrievedAt: new Date().toISOString(), expires: Date.now() + 60 * 60 * 1000 };
    } finally { await parser.destroy(); }
  })();
  try { return await pending; } finally { pending = undefined; }
}

export async function researchProduct(itemName: string, itemDescription = ''): Promise<{ evidence: ProductEvidence[]; note?: string }> {
  if (!/\b(?:MAZDA|M\/Z|MZ)\b/i.test(itemName)) return { evidence: [] };
  const references = [...new Set((itemDescription.toUpperCase().match(/\b[A-Z0-9]{3,5}-[A-Z0-9]{2}-[A-Z0-9]{3,6}\b/g) || []))].slice(0,3);
  if (!references.length) return { evidence: [] };
  try {
    const source = await loadCatalogue();
    const evidence = references.flatMap(reference => {
      const description = source.descriptions.get(normalize(reference));
      return description ? [{ reference, description, sourceUrl: MAZDA_REFERENCE_SOURCE, retrievedAt: source.retrievedAt }] : [];
    });
    return { evidence, note: evidence.length ? undefined : 'The manufacturer reference list did not contain an exact matching part reference.' };
  } catch {
    return { evidence: [], note: 'The manufacturer reference lookup was unavailable; only invoice details were used.' };
  }
}
