/** Company-defined {{contratto.nome_campo}} variables. No fabricated defaults. */
export interface CampoContratto { nome: string; etichetta: string; tipo: 'testo' | 'data' | 'numero' }
export function campiContratto(...texts: Array<string | null | undefined>): CampoContratto[] {
  const names = new Set<string>();
  for (const text of texts) for (const match of (text ?? '').matchAll(/\{\{\s*contratto\.([a-z][a-z0-9_]{0,63})\s*\}\}/g)) names.add(match[1]);
  return [...names].map(nome => ({ nome, etichetta: nome.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
    tipo: nome.startsWith('data_') ? 'data' : /(?:giorni|giorno)$/.test(nome) ? 'numero' : 'testo' }));
}
export function leggiValoriContratto(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => /^[a-z][a-z0-9_]{0,63}$/.test(k) && typeof v === 'string'));
}
export function erroriCampiContratto(fields: CampoContratto[], values: Record<string, string>): string[] {
  return fields.flatMap(field => {
    const v = Object.hasOwn(values, field.nome) ? values[field.nome].trim() : '';
    if (!v) return [`${field.etichetta}: da compilare`];
    if (field.tipo === 'numero' && !/^\d+(?:[.,]\d+)?$/.test(v)) return [`${field.etichetta}: numero non valido`];
    if (field.tipo === 'data' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) return [`${field.etichetta}: data non valida`];
    return [];
  });
}
export function formattaValoriContratto(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k,
    k.startsWith('data_') && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v]));
}
