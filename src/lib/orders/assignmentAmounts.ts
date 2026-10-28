const formatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
export const MAX_ASSIGNMENT_AMOUNT = 9_999_999_999.99;

/** Italian grouped amounts and plain decimal points; no partial parse or exponent. */
export function parseAssignmentAmount(raw: string, decimals = 2): number | null {
  const text = raw.trim().replace(/\s*€\s*$/, '').replace(/^€\s*/, '').replace(/[\s\u00a0\u202f]/g, '');
  if (!text) return 0;
  let normalized = text;
  if (text.includes(',')) {
    if (!new RegExp(`^(?:\\d+|\\d{1,3}(?:\\.\\d{3})+),\\d{0,${decimals}}$`).test(text)) return null;
    normalized = text.replaceAll('.', '').replace(',', '.');
  // Hours/quantities keep a single dot decimal: 1.50, 1.500 and 1.5000
  // must all remain 1.5, never jump to 1500 while adding a trailing zero.
  } else if (decimals <= 2 && /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(text)) normalized = text.replaceAll('.', '');
  else if (!new RegExp(`^\\d+(?:\\.\\d{0,${decimals}})?$`).test(text)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_ASSIGNMENT_AMOUNT ? amount : null;
}

export function formatAssignmentAmount(raw: string): string {
  const value = parseAssignmentAmount(raw);
  return value == null || !raw.trim() ? raw : formatter.format(value);
}
