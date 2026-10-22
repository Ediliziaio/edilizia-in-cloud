/**
 * Conteggio delle sigle scritte su una tavola (PDF vettoriale, es. Archicad):
 * «PA» (punto alimentazione), «T» e «TG» (termostati), «C1…C16» (collettori).
 * Le sigle sono testo vero nel PDF, con la sua posizione: si contano
 * esattamente, si toglie quella della legenda e si assegna ognuna al locale
 * più vicino (il nome della stanza scritto in pianta).
 *
 * Regole pure: il testo con le posizioni arriva da pdfjs (vedi
 * estraiTestoPdf.ts). Nessun accesso al database qui.
 *
 * Limiti dichiarati:
 *   - i simboli DISEGNATI (cerchi, croci, rettangoli) non sono testo: qui non
 *     si vedono. Li conta l'AI sull'immagine (planimetria-conta-simboli);
 *   - il locale è quello il cui nome è scritto più vicino alla sigla: senza i
 *     muri della stanza è una stima, va controllata.
 */

export interface TestoTavola {
  s: string;
  x: number;
  y: number;
  /** Altezza del carattere (unità del PDF). */
  h: number;
  pagina?: number;
}

export interface PosizioneSigla {
  x: number;
  y: number;
  pagina: number;
  locale: string | null;
}

export interface SiglaContata {
  sigla: string;
  /** Occorrenze in pianta (legenda esclusa). */
  quantita: number;
  /** Quante erano nella legenda (tolte dal conteggio). */
  inLegenda: number;
  /** La descrizione scritta accanto alla sigla nella legenda, se c'è. */
  descrizioneLegenda: string | null;
  /** Famiglia per le sigle numerate (C1, C2… → «C»). */
  famiglia: string | null;
  perLocale: Record<string, number>;
  posizioni: PosizioneSigla[];
}

export interface RisultatoConteggioTesto {
  sigle: SiglaContata[];
  /** Nomi dei locali trovati (uno per scritta). */
  locali: string[];
  /** Le voci della legenda (descrizioni in maiuscolo). */
  legenda: string[];
}

const SIGLA = /^(?:[A-Z]{1,4}\d{0,3}|[A-Z]{1,3}-\d{1,3}|RJ\d{2})$/;
/** Parole di servizio scritte come sigle ma che non sono simboli. */
const NON_SIGLE = new Set(["N", "DOWN", "UP", "LEGENDA", "XYZ", "KWH", "WC"]);

function mediana(valori: number[]): number {
  if (!valori.length) return 0;
  const v = [...valori].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

export function eDescrizioneLegenda(testo: string): boolean {
  const t = testo.trim();
  if (t.length < 10) return false;
  const lettere = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettere.length < 6) return false;
  const maiuscole = lettere.replace(/[^A-ZÀ-Þ]/g, "").length;
  return maiuscole / lettere.length >= 0.6;
}

export function eSigla(testo: string): boolean {
  const t = testo.trim();
  return SIGLA.test(t) && !NON_SIGLE.has(t.toUpperCase());
}

/** Nome di locale: scritto in minuscolo (almeno in parte), corto, non è una descrizione di legenda. */
export function eNomeLocale(testo: string): boolean {
  const t = testo.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (!/[a-zà-ÿ]/.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (eDescrizioneLegenda(t)) return false;
  return true;
}

/** La descrizione di legenda sulla stessa riga, subito a destra (se c'è). */
function descrizioneAccanto(it: TestoTavola, testi: TestoTavola[]): TestoTavola | null {
  let migliore: TestoTavola | null = null;
  for (const d of testi) {
    if (d === it || (d.pagina ?? 1) !== (it.pagina ?? 1)) continue;
    const dx = d.x - it.x;
    if (dx <= 0 || dx > 12 * Math.max(it.h, 1)) continue;
    if (Math.abs(d.y - it.y) > Math.max(it.h, d.h) * 0.8) continue;
    if (!eDescrizioneLegenda(d.s)) continue;
    if (!migliore || dx < migliore.x - it.x) migliore = d;
  }
  return migliore;
}

export function contaSigleDaTesto(
  testi: TestoTavola[],
  opzioni: { sigle?: string[]; minimo?: number } = {},
): RisultatoConteggioTesto {
  const validi = testi.filter((t) => t.s && t.s.trim() && Number.isFinite(t.x) && Number.isFinite(t.y));
  const hMediana = mediana(validi.map((t) => t.h).filter((h) => h > 0));

  const legenda = validi.filter((t) => eDescrizioneLegenda(t.s));
  const locali = validi.filter((t) => eNomeLocale(t.s) && t.h >= hMediana * 0.5);

  // Candidate: sigle di dimensione normale (le scritte minuscole dentro i
  // disegni — es. il display della centrale — non sono simboli di pianta).
  const candidate = validi.filter((t) => eSigla(t.s) && t.h >= hMediana * 0.35);
  const lettereSingole = candidate.filter((t) => t.s.trim().length === 1);
  // Una lettera vicinissima a un'altra lettera singola fa parte di una scritta
  // spaziata («A L L A R M E»): non è una sigla.
  const scrittaSpaziata = (t: TestoTavola) =>
    t.s.trim().length === 1 &&
    lettereSingole.some((o) => o !== t && (o.pagina ?? 1) === (t.pagina ?? 1) && Math.hypot(o.x - t.x, o.y - t.y) < 1.6 * Math.max(t.h, o.h));

  const ammesse = opzioni.sigle?.length ? new Set(opzioni.sigle.map((s) => s.trim())) : null;
  const gruppi = new Map<string, TestoTavola[]>();
  for (const t of candidate) {
    const sigla = t.s.trim();
    if (ammesse && !ammesse.has(sigla)) continue;
    if (!ammesse && scrittaSpaziata(t)) continue;
    const g = gruppi.get(sigla);
    if (g) g.push(t); else gruppi.set(sigla, [t]);
  }

  const localeVicino = (t: TestoTavola): string | null => {
    let migliore: TestoTavola | null = null;
    let dist = Infinity;
    for (const l of locali) {
      if ((l.pagina ?? 1) !== (t.pagina ?? 1)) continue;
      const d = Math.hypot(l.x - t.x, l.y - t.y);
      if (d < dist) { dist = d; migliore = l; }
    }
    // Troppo lontano da qualunque nome: meglio dire «senza locale».
    if (!migliore || dist > 80 * Math.max(hMediana, 1)) return null;
    return migliore.s.trim();
  };

  const minimo = opzioni.minimo ?? (ammesse ? 1 : 2);
  const sigle: SiglaContata[] = [];
  for (const [sigla, occorrenze] of gruppi) {
    let inLegenda = 0;
    let descrizioneLegenda: string | null = null;
    const posizioni: PosizioneSigla[] = [];
    for (const o of occorrenze) {
      const d = descrizioneAccanto(o, validi);
      if (d) {
        inLegenda++;
        descrizioneLegenda ??= d.s.trim();
        continue;
      }
      posizioni.push({ x: o.x, y: o.y, pagina: o.pagina ?? 1, locale: localeVicino(o) });
    }
    if (posizioni.length === 0) continue;
    const perLocale: Record<string, number> = {};
    for (const p of posizioni) {
      const k = p.locale ?? "Senza locale";
      perLocale[k] = (perLocale[k] ?? 0) + 1;
    }
    const numerata = /^([A-Z]+)-?(\d+)$/.exec(sigla);
    sigle.push({
      sigla,
      quantita: posizioni.length,
      inLegenda,
      descrizioneLegenda,
      famiglia: numerata ? numerata[1] : null,
      perLocale,
      posizioni,
    });
  }

  // Sotto il minimo restano solo le sigle numerate di una famiglia con almeno
  // due membri (C1, C2… sono tutte diverse ma insieme sono i collettori).
  const membriFamiglia = new Map<string, number>();
  for (const s of sigle) if (s.famiglia) membriFamiglia.set(s.famiglia, (membriFamiglia.get(s.famiglia) ?? 0) + 1);
  const tenute = sigle.filter((s) => s.quantita >= minimo || (s.famiglia !== null && (membriFamiglia.get(s.famiglia) ?? 0) >= 2));

  tenute.sort((a, b) => b.quantita - a.quantita || a.sigla.localeCompare(b.sigla, "it", { numeric: true }));
  return {
    sigle: tenute,
    locali: [...new Set(locali.map((l) => l.s.trim()))],
    legenda: [...new Set(legenda.map((l) => l.s.trim()))],
  };
}

/** Sigle numerate della stessa famiglia (C1…C16) riunite: «C» × 16. */
export function riepilogoFamiglie(sigle: SiglaContata[]): { famiglia: string; quantita: number; sigle: string[] }[] {
  const m = new Map<string, string[]>();
  for (const s of sigle) {
    if (!s.famiglia) continue;
    const g = m.get(s.famiglia) ?? [];
    for (let i = 0; i < s.quantita; i++) g.push(s.sigla);
    m.set(s.famiglia, g);
  }
  return [...m.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([famiglia, l]) => ({ famiglia, quantita: l.length, sigle: [...new Set(l)].sort((a, b) => a.localeCompare(b, "it", { numeric: true })) }));
}
