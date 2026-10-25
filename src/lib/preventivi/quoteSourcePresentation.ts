export type QuoteChatSource = { id: string; label: string; region?: string; year?: number; name?: string; version?: string | null };
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalize = (value: string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Prefer catalogue fields; legacy labels are display-only and never change source IDs. */
export function quoteSourcePresentation(source: QuoteChatSource) {
  const parts = source.label.split(' · ').map(clean);
  const legacy = parts.length > 1 ? parts[1].match(/^(.+?)\s+(20\d{2})$/) : null;
  const region = clean(source.region ?? legacy?.[1] ?? '');
  const year = source.year ?? (legacy ? Number(legacy[2]) : undefined);
  const name = clean(source.name ?? parts[0]);
  const title = region && year ? `${region} · ${year}` : name;
  // Import metadata such as versione=ed.1 is NOT an official edition claim.
  const edition = /\b(?:edizione\s*|ed\.\s*)(\d+(?:\.\d+)?)/i.exec(name)?.[1];
  return { title, name, region, year, edition, search: normalize([title, name, source.label].join(' ')) };
}
export function filterQuoteSources(options: QuoteChatSource[], query: string) {
  const terms = normalize(query).split(' ').filter(Boolean);
  return options.filter(option => terms.every(term => quoteSourcePresentation(option).search.includes(term)));
}
