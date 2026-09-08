import OpenAI from 'openai';
import type { ZatcaClassification } from '@/types';

const MODEL = process.env.NVIDIA_NIM_MODEL || 'moonshotai/kimi-k3';

let client: OpenAI | undefined;

export function isNvidiaNimConfigured(): boolean {
  return Boolean(process.env.NVIDIA_NIM_API_KEY?.trim());
}

function getClient(): OpenAI {
  const apiKey = process.env.NVIDIA_NIM_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('NVIDIA_NIM_API_KEY is not configured');
  }

  client ??= new OpenAI({
    apiKey,
    baseURL: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  });

  return client;
}

const SYSTEM_PROMPT = `You are an expert KSA Customs and ZATCA (Zakat, Tax and Customs Authority) compliance classifier with deep knowledge of:
- Saudi Arabia's Harmonized System (HS) Code taxonomy (8-12 digit GCC/KSA codes)
- ZATCA import/export regulations and tariff schedules
- Saudi Standards, Metrology and Quality Organization (SASO) product classification
- Saudi Food and Drug Authority (SFDA) regulated product lists
- KSA customs duty rates (CDF - Customs Duty Fee)

Your task: Classify commercial invoice line items for KSA customs clearance.

STRICT OUTPUT FORMAT (valid JSON only, no markdown, no explanation):
{
  "hsCode": "<8 to 12 digit HS code — e.g., 847130000>",
  "cdf": "<customs duty percentage or 'Exempt' — e.g., '5%', '12%', 'Exempt'>",
  "regulationStatus": "<'REGULATED' if requires special permit/certificate, or 'NON-REGULATED'>",
  "standardizedZatcaName": "<official ZATCA/HS nomenclature name in English>",
  "confidenceScore": <0.0 to 1.0>
}

Rules:
- HS codes MUST follow GCC Common Customs Tariff (CCT) format
- REGULATED items include: food, pharmaceuticals, chemicals, weapons, electronics needing CITC approval, vehicles
- CDF values: 5% (general), 0% (GCC goods), 12% (tobacco/alcohol), 20% (luxury), "Exempt" (raw materials, medicines)
- Always return valid JSON. Never include explanatory text outside the JSON object.`;

export interface ClassifyItemInput {
  itemName: string;
  itemDescription?: string;
  rowIndex?: number;
}

export async function classifyItem(input: ClassifyItemInput): Promise<ZatcaClassification> {
  const userMessage = `Classify this commercial invoice item for KSA customs:
Item Name: ${input.itemName}
${input.itemDescription ? `Item Description: ${input.itemDescription}` : ''}

Return ONLY the JSON classification object.`;

  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 1,
    reasoning_effort: 'low',
    max_tokens: 1024,
  });

  const content = completion.choices[0]?.message?.content?.trim() || '';

  // Strip markdown code fences if present
  const jsonStr = content
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(jsonStr) as ZatcaClassification;

    // Validate and sanitize
    return {
      hsCode: String(parsed.hsCode || '').replace(/\D/g, '').slice(0, 12) || 'UNKNOWN',
      cdf: parsed.cdf || 'Unknown',
      regulationStatus: ['REGULATED', 'NON-REGULATED'].includes(parsed.regulationStatus)
        ? parsed.regulationStatus
        : 'UNKNOWN',
      standardizedZatcaName: parsed.standardizedZatcaName || input.itemName,
      confidenceScore: typeof parsed.confidenceScore === 'number'
        ? Math.min(1, Math.max(0, parsed.confidenceScore))
        : undefined,
    };
  } catch {
    // Fallback when JSON parsing fails
    return {
      hsCode: 'PARSE_ERROR',
      cdf: 'Unknown',
      regulationStatus: 'UNKNOWN',
      standardizedZatcaName: input.itemName,
      confidenceScore: 0,
    };
  }
}

export async function classifyItemsBatch(
  items: ClassifyItemInput[],
  concurrency = 5,
  onProgress?: (processed: number, total: number) => void
): Promise<ZatcaClassification[]> {
  const results: ZatcaClassification[] = new Array(items.length);
  let processed = 0;

  // Process in concurrent chunks
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (item, chunkIdx) => {
        try {
          return await classifyItem(item);
        } catch (err) {
          console.error(`Classification error for item ${i + chunkIdx}:`, err);
          return {
            hsCode: 'ERROR',
            cdf: 'Unknown',
            regulationStatus: 'UNKNOWN' as const,
            standardizedZatcaName: item.itemName,
            confidenceScore: 0,
          };
        }
      })
    );

    chunkResults.forEach((result, idx) => {
      results[i + idx] = result;
    });

    processed += chunk.length;
    onProgress?.(processed, items.length);

    // Rate limit: small delay between batches
    if (i + concurrency < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
