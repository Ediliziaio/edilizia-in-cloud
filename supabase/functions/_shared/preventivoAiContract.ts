/** Shared wire contract. Pure and bounded: no database, provider or browser API. */
export const MAX_RIGHE_PREVENTIVO_AI = 100;
const CATEGORIE = new Set(["prodotto", "posa", "trasporto", "tiro_piano", "smaltimento", "nolo", "pratica", "nota"]);

export interface RigaPreventivoAi {
  item_category: string;
  nome: string;
  descrizione: string;
  quantita: number | null;
  unita_misura: string;
  article_template_id: string | null;
  family_id: string | null;
  axis_selections: Record<string, string> | null;
  tariffa_id: string | null;
  misure_x_mm: number | null;
  misure_y_mm: number | null;
  is_posa_di: string | null;
  unit_price: number | null;
}
export interface SezionePreventivoAi { nome: string; righe: RigaPreventivoAi[] }
export interface RispostaPreventivoAi {
  schema_version: 1;
  sezioni: SezionePreventivoAi[];
  note: string;
  avvertenze: string[];
}
export type SezionePreventivoAiConfermata = {
  nome: string;
  righe: Array<RigaPreventivoAi & { quantita: number; unit_price: number }>;
};

function oggetto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Risposta AI non valida: riprova senza inserire le righe.");
  return value as Record<string, unknown>;
}
function testo(value: unknown, max: number): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new Error("Testo della risposta AI non valido o troppo lungo.");
  return value.trim();
}
function riferimento(value: unknown): string | null { return testo(value, 200) || null; }
function positivo(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function quantitaValida(value: unknown): number | null {
  const n = positivo(value);
  // quantity numeric(10,2): don't present a sub-centesimal or overflowing
  // quantity as ready when the database would round it to zero or reject it.
  return n != null && n < 100_000_000 && Math.round(n * 100) > 0 ? n : null;
}
function prezzo(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 10_000_000_000 ? value : null;
}

/** Also accepts the previous wire format, but never invents quantity 1 or price 0. */
export function leggiPreventivoAi(value: unknown): RispostaPreventivoAi {
  const data = oggetto(value);
  if (data.error || data.success === false || (data.schema_version != null && data.schema_version !== 1)) throw new Error("Generazione AI non confermata. Nessuna riga inserita.");
  if (!Array.isArray(data.sezioni) || data.sezioni.length === 0 || data.sezioni.length > 30) throw new Error("La risposta AI non contiene sezioni valide.");
  let count = 0;
  const sezioni = data.sezioni.map((section): SezionePreventivoAi => {
    const s = oggetto(section);
    if (!Array.isArray(s.righe) || s.righe.length === 0) throw new Error("La risposta AI contiene una sezione senza righe.");
    count += s.righe.length;
    if (count > MAX_RIGHE_PREVENTIVO_AI) throw new Error("Troppe righe AI: suddividi il lavoro in parti più piccole.");
    return { nome: testo(s.nome, 200) || "Lavorazioni", righe: s.righe.map((row): RigaPreventivoAi => {
      const r = oggetto(row);
      const nome = testo(r.nome, 500);
      const categoria = testo(r.item_category, 30);
      if (!nome || !CATEGORIE.has(categoria)) throw new Error("Nome o categoria della riga AI da verificare.");
      const article = riferimento(r.article_template_id);
      const family = riferimento(r.family_id);
      const tariffa = riferimento(r.tariffa_id);
      if ([article, family, tariffa].filter(Boolean).length > 1) throw new Error("La riga AI indica più fonti di prezzo incompatibili.");
      let selections: Record<string, string> | null = null;
      if (r.axis_selections != null) {
        const entries = Object.entries(oggetto(r.axis_selections));
        if (entries.length > 40) throw new Error("Troppe opzioni nella riga AI.");
        selections = Object.fromEntries(entries.map(([key, v]) => [testo(key, 100), testo(v, 200)]));
      }
      return {
        item_category: categoria, nome, descrizione: testo(r.descrizione, 8000),
        quantita: categoria === "nota" ? 1 : quantitaValida(r.quantita),
        unita_misura: categoria === "nota" ? "" : testo(r.unita_misura, 40),
        article_template_id: article, family_id: family, tariffa_id: tariffa,
        axis_selections: selections, misure_x_mm: positivo(r.misure_x_mm), misure_y_mm: positivo(r.misure_y_mm),
        is_posa_di: riferimento(r.is_posa_di), unit_price: categoria === "nota" ? 0 : prezzo(r.unit_price),
      };
    }) };
  });
  if (data.avvertenze != null && (!Array.isArray(data.avvertenze) || data.avvertenze.length > 100)) throw new Error("Avvertenze AI non valide.");
  return { schema_version: 1, sezioni, note: testo(data.note, 8000), avvertenze: (data.avvertenze as unknown[] | undefined ?? []).map(v => testo(v, 2000)) };
}

export function datiMancantiPreventivoAi(sezioni: SezionePreventivoAi[]): string[] {
  const missing: string[] = [];
  for (const s of sezioni) for (const r of s.righe) {
    if (r.item_category === "nota") continue;
    if (quantitaValida(r.quantita) == null) missing.push(`${r.nome}: indica una quantità valida (almeno 0,01).`);
    if (!r.unita_misura.trim()) missing.push(`${r.nome}: indica l’unità di misura.`);
    if (prezzo(r.unit_price) == null) missing.push(`${r.nome}: prezzo da verificare nel listino o nella descrizione.`);
  }
  return missing;
}

/** The only boundary into the numeric editor; incomplete proposals stay outside. */
export function confermaPreventivoAi(sezioni: SezionePreventivoAi[]): SezionePreventivoAiConfermata[] {
  const parsed = leggiPreventivoAi({ sezioni });
  if (datiMancantiPreventivoAi(parsed.sezioni).length > 0) throw new Error("Completa quantità, unità e prezzi prima di inserire le righe.");
  return parsed.sezioni as SezionePreventivoAiConfermata[];
}
