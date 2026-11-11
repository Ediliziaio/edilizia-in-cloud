export type AmbitoOffertaFv = { attivo: boolean; inclusioni: string[]; esclusioni: string[]; verifiche: string[] };
export function leggiAmbitoOffertaFv(blocchi?: Record<string, unknown> | null): AmbitoOffertaFv {
  const raw = blocchi?.ambito_offerta;
  const c = raw && typeof raw === "object" ? raw as Partial<AmbitoOffertaFv> : {};
  const righe = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(x => x.trim()) : [];
  return { attivo: c.attivo === true, inclusioni: righe(c.inclusioni), esclusioni: righe(c.esclusioni), verifiche: righe(c.verifiche) };
}
