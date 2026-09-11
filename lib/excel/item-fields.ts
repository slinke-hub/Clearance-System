import type { ParsedExcelRow } from '@/types';

/** Reviewed values win, including an intentional blank. Older invoices retain their source value. */
export function factoryCodeFor(item: { raw_data?: Record<string, unknown> | null }, source?: ParsedExcelRow['data']): string {
  if (typeof item.raw_data?.factoryCode === 'string') return item.raw_data.factoryCode;
  const value = Object.entries(source || {}).find(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, '') === 'factorycode')?.[1];
  return value == null ? '' : String(value);
}
