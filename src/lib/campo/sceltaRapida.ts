/**
 * Scelte rapide nel rapportino anche coi cantieri grandi (24/11/2026, founder: «immagina 20 operai e 200 fasi»).
 * Un muro di 200 bottoni non si usa dal telefono: in vista restano le poche probabili, il resto si trova cercando.
 *
 * Fasi: quelle già scelte, poi quelle in corso, poi le prossime da iniziare, fino a `max`. Con un testo da cercare,
 * tutte quelle che lo contengono (anche le altre parole del nome, senza accenti né maiuscole).
 */
export interface FaseScelta { id: string; name: string; status: string }

export const pulisci = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function corrisponde(nome: string, testo: string): boolean {
  const parole = pulisci(testo).split(/\s+/).filter(Boolean);
  const n = pulisci(nome);
  return parole.every(p => n.includes(p));
}

export const MAX_FASI_IN_VISTA = 8;
export const MAX_RISULTATI = 30;

export function fasiInVista<F extends FaseScelta>(fasi: F[], scelte: ReadonlySet<string>, testo = "", max = MAX_FASI_IN_VISTA): { inVista: F[]; altre: number } {
  if (testo.trim()) {
    const trovate = fasi.filter(f => corrisponde(f.name, testo));
    return { inVista: trovate.slice(0, MAX_RISULTATI), altre: Math.max(0, trovate.length - MAX_RISULTATI) };
  }
  if (fasi.length <= max) return { inVista: fasi, altre: 0 };
  const prese = new Set<string>();
  const ordine = [
    ...fasi.filter(f => scelte.has(f.id)),
    ...fasi.filter(f => f.status === "in_corso"),
    ...fasi.filter(f => f.status !== "in_corso"),
  ];
  const inVista: F[] = [];
  for (const f of ordine) {
    if (prese.has(f.id)) continue;
    // Le scelte restano sempre in vista, anche oltre il massimo.
    if (inVista.length >= max && !scelte.has(f.id)) continue;
    prese.add(f.id);
    inVista.push(f);
  }
  // Nell'ordine del cantiere, non in quello della scelta: chi le conosce le ritrova dove se le aspetta.
  const posizione = new Map(fasi.map((f, i) => [f.id, i]));
  inVista.sort((a, b) => posizione.get(a.id)! - posizione.get(b.id)!);
  return { inVista, altre: fasi.length - inVista.length };
}
