/** Exact headers must win globally: postal_code must never match "posta" → email. */
export function matchCustomerImportHeaders(
  headers: string[],
  fields: { key: string; label: string }[],
  synonyms: Record<string, string[]>,
): Record<string, string> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, "");
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const norm = normalize(header);
    if (!norm) continue;
    const exact = fields.find((field) =>
      norm === normalize(field.key) || norm === normalize(field.label) ||
      (synonyms[field.key] ?? []).some((alias) => norm === normalize(alias)));
    if (exact) { mapping[header] = exact.key; continue; }
    const candidates = fields.filter((field) => (synonyms[field.key] ?? [])
      .some((alias) => alias.length >= 5 && norm.includes(normalize(alias))));
    // Ambiguous columns require explicit mapping, not a guess based on field order.
    if (candidates.length === 1 && !Object.values(mapping).includes(candidates[0].key))
      mapping[header] = candidates[0].key;
  }
  return mapping;
}
