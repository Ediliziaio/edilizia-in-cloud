/**
 * Dai rapportini letti dal modello a quelli della commessa (31/10/2026).
 *
 * Il modello vede le fasi, le persone, i mezzi e gli articoli della commessa con
 * un codice corto (F1, P3, M2, A5) e risponde con quei codici: qui tornano id
 * veri. Un codice che non esiste si scarta; una persona scritta nel documento ma
 * non riconosciuta resta col nome letto, perché l'ufficio la scelga a mano. Le
 * date nel futuro, le ore fuori da 0-24 e le quantità non positive non passano.
 * Puro: niente Deno, niente rete; lo provano i test del frontend.
 */

export interface VoceCatalogo { id: string; nome: string }
export interface Cataloghi {
  fasi: VoceCatalogo[];
  persone: VoceCatalogo[];
  mezzi: VoceCatalogo[];
  articoli: VoceCatalogo[];
}

export interface RapportinoLetto {
  data: string;
  descrizione: string;
  fasi: string[];
  persone: Array<{ employee_id: string | null; nome: string; ore: number }>;
  mezzi: Array<{ mezzo_id: string; ore: number | null }>;
  materiali: Array<{ order_item_id: string | null; nome: string; quantita: number }>;
  meteo: string | null;
  note: string | null;
}

const METEO = new Set(["soleggiato", "nuvoloso", "pioggia", "neve", "vento"]);

/** Le righe del catalogo per il prompt: «F1 · Demolizioni». */
export function elencoPerPrompt(prefisso: string, voci: VoceCatalogo[]): string {
  return voci.length ? voci.map((v, i) => `${prefisso}${i + 1} · ${v.nome}`).join("\n") : "(nessuno)";
}

function daCodice(codice: unknown, prefisso: string, voci: VoceCatalogo[]): VoceCatalogo | null {
  const m = String(codice ?? "").trim().toUpperCase().match(new RegExp(`^${prefisso}(\\d+)$`));
  return m ? voci[Number(m[1]) - 1] ?? null : null;
}

const numero = (v: unknown): number | null => {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function mappaRapportini(letto: unknown, cat: Cataloghi, oggi: string): { rapportini: RapportinoLetto[]; avvisi: string[] } {
  const radice = (letto ?? {}) as { rapportini?: unknown; avvisi?: unknown };
  const avvisi = Array.isArray(radice.avvisi) ? radice.avvisi.map((a) => testo(a, 300)).filter(Boolean).slice(0, 20) : [];
  const righe = Array.isArray(radice.rapportini) ? radice.rapportini : [];
  const rapportini: RapportinoLetto[] = [];
  for (const grezzo of righe.slice(0, 31)) {
    const r = (grezzo ?? {}) as Record<string, unknown>;
    const data = testo(r.data, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { avvisi.push(`Un rapportino senza data leggibile è stato saltato.`); continue; }
    if (data > oggi) { avvisi.push(`Il rapportino del ${data} è nel futuro: saltato.`); continue; }
    const fasi = (Array.isArray(r.fasi) ? r.fasi : []).map((c) => daCodice(c, "F", cat.fasi)?.id).filter((x): x is string => !!x);
    const persone: RapportinoLetto["persone"] = [];
    for (const p of Array.isArray(r.persone) ? r.persone : []) {
      const x = (p ?? {}) as Record<string, unknown>;
      const ore = numero(x.ore);
      if (ore == null || ore < 0 || ore > 24) continue;
      const voce = daCodice(x.persona, "P", cat.persone);
      const nome = voce?.nome ?? testo(x.nome_letto ?? x.nome, 120);
      if (!nome) continue;
      if (voce && persone.some((y) => y.employee_id === voce.id)) continue;
      persone.push({ employee_id: voce?.id ?? null, nome, ore });
    }
    const mezzi: RapportinoLetto["mezzi"] = [];
    for (const m of Array.isArray(r.mezzi) ? r.mezzi : []) {
      const x = (m ?? {}) as Record<string, unknown>;
      const voce = daCodice(x.mezzo, "M", cat.mezzi);
      if (!voce || mezzi.some((y) => y.mezzo_id === voce.id)) continue;
      const ore = numero(x.ore);
      mezzi.push({ mezzo_id: voce.id, ore: ore != null && ore >= 0 && ore <= 24 ? ore : null });
    }
    const materiali: RapportinoLetto["materiali"] = [];
    for (const m of Array.isArray(r.materiali) ? r.materiali : []) {
      const x = (m ?? {}) as Record<string, unknown>;
      const quantita = numero(x.quantita);
      if (quantita == null || quantita <= 0) continue;
      const voce = daCodice(x.articolo, "A", cat.articoli);
      const nome = voce?.nome ?? testo(x.nome_letto ?? x.nome, 200);
      if (nome) materiali.push({ order_item_id: voce?.id ?? null, nome, quantita });
    }
    const meteo = testo(r.meteo, 20).toLowerCase();
    rapportini.push({
      data,
      descrizione: testo(r.descrizione, 4000),
      fasi: [...new Set(fasi)],
      persone,
      mezzi,
      materiali,
      meteo: METEO.has(meteo) ? meteo : null,
      note: testo(r.note, 4000) || null,
    });
  }
  return { rapportini, avvisi };
}
