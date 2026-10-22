// Regole pure delle due funzioni AI della distinta materiali
// (distinta-proponi-scomposizioni, planimetria-conta-simboli): prompt e
// pulizia delle risposte. Nessuna dipendenza: la suite vitest le importa.

export interface VoceDaScomporre {
  id: string;
  codice_prezzario?: string | null;
  descrizione_breve: string;
  descrizione_estesa?: string | null;
  unita_misura?: string | null;
}

export interface ComponenteProposto {
  descrizione: string;
  specifiche: string | null;
  unita_misura: string;
  quantita_per_unita: number;
  sfrido_percentuale: number;
  categoria: string | null;
}

export interface ScomposizioneProposta {
  voce_id: string;
  nome: string;
  parole_chiave: string[];
  componenti: ComponenteProposto[];
  note: string | null;
}

export const PROMPT_SCOMPOSIZIONI = `Sei un tecnico di cantiere italiano (impianti elettrici, meccanici, edili) che prepara la lista dei materiali da comprare.
Ricevi delle voci di computo metrico (lavorazioni, con unità di misura). Per OGNUNA scrivi i materiali che servono per UNA unità della voce (1 cad, 1 m, 1 mq…).

REGOLE
- Solo materiali da acquistare (niente manodopera, noli, oneri, trasporti).
- Quantità per una unità della voce, realistiche e prudenti; per cavi e tubi indica i metri medi per unità.
- Specifiche tecniche concrete quando la voce le dà (sezione cavo, diametro tubo, portata, potenza, norma). Non inventare marche.
- sfrido_percentuale: 0 per i pezzi, 5-10 per cavi, tubi e materiali a metro o a superficie.
- unita_misura dei materiali: pz, m, mq, mc, kg, l, conf.
- parole_chiave: 1-3 parole che compaiono nella descrizione della voce e la riconoscono (es. "punto presa", "16a").
- Se una voce non richiede materiali (è solo lavoro) restituisci componenti vuoti e spiega in note.

Rispondi SOLO con JSON: {"scomposizioni":[{"voce_id":"…","nome":"…","parole_chiave":["…"],"componenti":[{"descrizione":"…","specifiche":"…","unita_misura":"pz","quantita_per_unita":1,"sfrido_percentuale":0,"categoria":"…"}],"note":"…"}]}`;

export function messaggioVoci(voci: VoceDaScomporre[]): string {
  return voci
    .map((v) =>
      [
        `voce_id: ${v.id}`,
        v.codice_prezzario ? `codice: ${v.codice_prezzario}` : null,
        `unità: ${v.unita_misura ?? "cad"}`,
        `descrizione: ${v.descrizione_breve}`,
        v.descrizione_estesa ? `dettaglio: ${v.descrizione_estesa.slice(0, 1200)}` : null,
      ].filter(Boolean).join("\n"),
    )
    .join("\n---\n");
}

export function leggiJson(testo: string): unknown {
  const raw = (testo ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const a = raw.indexOf("{");
    const b = raw.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(raw.slice(a, b + 1)); } catch { /* sotto */ }
    }
    return null;
  }
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const testo = (v: unknown, max = 300): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** Tiene solo le scomposizioni di voci richieste, con componenti sensati. */
export function pulisciScomposizioni(risposta: unknown, idAmmessi: string[]): ScomposizioneProposta[] {
  const ammessi = new Set(idAmmessi);
  const elenco = (risposta as { scomposizioni?: unknown })?.scomposizioni;
  if (!Array.isArray(elenco)) return [];
  const viste = new Set<string>();
  const out: ScomposizioneProposta[] = [];
  for (const s of elenco as Record<string, unknown>[]) {
    const voce = String(s?.voce_id ?? "");
    if (!ammessi.has(voce) || viste.has(voce)) continue;
    viste.add(voce);
    const componenti: ComponenteProposto[] = [];
    for (const c of Array.isArray(s.componenti) ? (s.componenti as Record<string, unknown>[]) : []) {
      const descrizione = testo(c?.descrizione, 200);
      const q = num(c?.quantita_per_unita);
      if (!descrizione || !(q > 0) || q > 10000) continue;
      const sfrido = num(c?.sfrido_percentuale);
      componenti.push({
        descrizione,
        specifiche: testo(c?.specifiche),
        unita_misura: testo(c?.unita_misura, 10) ?? "pz",
        quantita_per_unita: Math.round(q * 10000) / 10000,
        sfrido_percentuale: Number.isFinite(sfrido) ? Math.min(Math.max(sfrido, 0), 50) : 0,
        categoria: testo(c?.categoria, 80),
      });
    }
    const parole = (Array.isArray(s.parole_chiave) ? s.parole_chiave : [])
      .map((p) => testo(p, 40))
      .filter((p): p is string => !!p)
      .slice(0, 4);
    out.push({
      voce_id: voce,
      nome: testo(s.nome, 120) ?? "Scomposizione proposta",
      parole_chiave: parole,
      componenti: componenti.slice(0, 20),
      note: testo(s.note, 500),
    });
  }
  return out;
}

// ─── Simboli sulle tavole ──────────────────────────────────────────────────

export interface SimboloContato {
  simbolo: string;
  quantita: number;
  confidenza: number;
  note: string | null;
}

export function promptSimboli(legenda: string[]): string {
  return `Sei un tecnico che conta i simboli su una tavola di impianto (pianta in scala, disegno a linee).
L'immagine è UN riquadro della tavola. Conta i simboli della LEGENDA che vedi nel riquadro.

LEGENDA DELLA TAVOLA (conta solo questi, usa esattamente questi nomi):
${legenda.map((l) => `- ${l}`).join("\n")}

REGOLE
- Conta un simbolo solo se il suo centro è dentro il riquadro (quelli tagliati sul bordo destro e inferiore non contarli).
- Non contare i simboli disegnati nel riquadro della legenda o nel cartiglio.
- Se un simbolo è incerto, contalo e abbassa la confidenza (0-1).
- Simboli della legenda che non compaiono: non elencarli.

Rispondi SOLO con JSON: {"simboli":[{"simbolo":"<nome dalla legenda>","quantita":3,"confidenza":0.8,"note":"…"}],"riquadro_vuoto":false}`;
}

export function pulisciSimboli(risposta: unknown, legenda: string[]): SimboloContato[] {
  const ammessi = new Map(legenda.map((l) => [l.trim().toLowerCase(), l.trim()]));
  const elenco = (risposta as { simboli?: unknown })?.simboli;
  if (!Array.isArray(elenco)) return [];
  const somma = new Map<string, SimboloContato>();
  for (const s of elenco as Record<string, unknown>[]) {
    const nome = ammessi.get(String(s?.simbolo ?? "").trim().toLowerCase());
    const q = num(s?.quantita);
    if (!nome || !(q > 0) || q > 500) continue;
    const c = num(s?.confidenza);
    const conf = Number.isFinite(c) ? Math.min(Math.max(c, 0), 1) : 0.5;
    const prima = somma.get(nome);
    if (prima) {
      prima.quantita += Math.round(q);
      prima.confidenza = Math.min(prima.confidenza, conf);
    } else {
      somma.set(nome, { simbolo: nome, quantita: Math.round(q), confidenza: conf, note: testo(s?.note, 200) });
    }
  }
  return [...somma.values()];
}
