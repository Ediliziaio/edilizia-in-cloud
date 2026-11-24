/**
 * «Come ieri» (24/11/2026): il rapportino di una squadra che fa lo stesso lavoro tutta la settimana si ricopia
 * dall'ultimo mandato su quel cantiere. Si ricopiano chi c'era con le sue ore, le fasi (e le voci) su cui si è
 * lavorato, i mezzi usati. Mai descrizione, foto o firme: quelle sono di oggi.
 * Solo quello che c'è ancora: persone della squadra di oggi, fasi non finite, mezzi ancora assegnati.
 */
export interface UltimoRapportino {
  data_lavoro: string;
  ore_lavorate: number | null;
  presenze: unknown;
  fasi_lavorate: unknown;
  mezzi: string[];
}

export interface PersonaOggi { key: string; employee_id?: string | null; subappaltatore_id?: string | null; nome: string }

export interface DaRicopiare {
  presenze: Record<string, number>;
  fasi: string[];
  sottofasiLavorate: string[];
  mezzi: string[];
  ore: number | null;
}

const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

export function daRicopiare(r: UltimoRapportino, oggi: {
  persone: PersonaOggi[]; fasiAperte: string[]; mezziAmmessi: string[];
}): DaRicopiare {
  const presenze: Record<string, number> = {};
  for (const p of lista(r.presenze)) {
    const ore = Number(p.ore);
    const m = oggi.persone.find(x =>
      (p.employee_id && x.employee_id === p.employee_id)
      || (p.subappaltatore_id && x.subappaltatore_id === p.subappaltatore_id)
      || (!p.employee_id && !p.subappaltatore_id && typeof p.nome === "string" && x.nome === p.nome));
    if (m && Number.isFinite(ore) && ore > 0) presenze[m.key] = ore;
  }
  const fasi: string[] = [];
  const sottofasiLavorate: string[] = [];
  for (const f of lista(r.fasi_lavorate)) {
    const id = typeof f.phase_id === "string" ? f.phase_id : null;
    if (!id || !oggi.fasiAperte.includes(id)) continue;
    fasi.push(id);
    // Le voci «ci ho lavorato» si ricopiano; quelle «finite» no: finite ieri, oggi non si rifanno.
    for (const s of Array.isArray(f.sottofasi_lavorate) ? f.sottofasi_lavorate : []) if (typeof s === "string") sottofasiLavorate.push(s);
  }
  const ore = Number(r.ore_lavorate);
  return {
    presenze,
    fasi,
    sottofasiLavorate,
    mezzi: r.mezzi.filter(id => oggi.mezziAmmessi.includes(id)),
    ore: Number.isFinite(ore) && ore > 0 ? ore : null,
  };
}
