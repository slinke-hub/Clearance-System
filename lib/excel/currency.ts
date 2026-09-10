/** Currency labels are normalized without changing or converting monetary values. */
export function normalizeCurrency(value: unknown): string {
  const label = String(value ?? '').trim();
  const compact = label.toUpperCase().replace(/[\s.()]/g, '');
  if (['$', 'US$', '$US', 'USD', 'USDOLLAR', 'USDOLLARS', 'UNITEDSTATESDOLLAR', 'UNITEDSTATESDOLLARS', 'دولارأمريكي', 'دولارامريكي'].includes(compact)) return 'USD';
  return label;
}

/** Only explicit US labels establish a document-wide default. */
export function hasUSCurrencyLabel(value: unknown): boolean {
  return /(?:^|[^A-Za-z])(?:USD\b|U\.?S\.?\s*\$|U\.?S\.?\s+DOLLARS?\b|UNITED\s+STATES\s+DOLLARS?\b|دولار\s+[أا]مريكي)/i.test(String(value ?? ''));
}

export function stripUSCurrency(value: string): string {
  return value.replace(/^(?:USD|U\.?S\.?\s*\$|\$)\s*/i, '').replace(/\s*(?:USD|U\.?S\.?\s*\$|\$)$/i, '').trim();
}
