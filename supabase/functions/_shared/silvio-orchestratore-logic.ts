/**
 * COPIA per Deno edge runtime di src/lib/silvio/orchestratore.ts (tenere in sync).
 * orchestratore.ts — MP-SILVIO-02 · logica pura della cascata intento→piano
 *
 * Il modello produce un PIANO (azioni del registro); QUI validiamo il piano,
 * decidiamo il gradino (0 deterministico → 1 Haiku → 2 Sonnet) e governiamo il
 * budget. L'esecuzione vera (chiamata funzioni reali) sta nell'edge function.
 * Nessun I/O. Disciplina di costo: il modello grande è l'eccezione misurata.
 */

export interface PianoStep {
  azione: string;
  parametri: Record<string, unknown>;
}
export interface Piano {
  intento: string;
  serve_ragionamento?: boolean;
  passi: PianoStep[];
  confidenza?: number;
}

export interface ValidazionePiano {
  valido: boolean;
  vuoto: boolean;
  azioniIgnote: string[];
}

/**
 * Un piano è valido SOLO se ha passi e ogni azione esiste nel registro.
 * (Sicurezza: il modello non può inventare azioni fuori catalogo.)
 */
export function validaPiano(piano: Piano | null | undefined, chiaviValide: Set<string> | string[]): ValidazionePiano {
  const set = chiaviValide instanceof Set ? chiaviValide : new Set(chiaviValide);
  const passi = piano?.passi ?? [];
  const ignote = [...new Set(passi.map((p) => p?.azione).filter((a) => !set.has(a)))];
  return { valido: passi.length > 0 && ignote.length === 0, vuoto: passi.length === 0, azioniIgnote: ignote };
}

/**
 * Gradino 0 — match deterministico (gratis): se la richiesta contiene un comando
 * noto, mappa direttamente sulla chiave azione, senza AI.
 */
export function matchDeterministico(richiesta: string, comandi: Record<string, string>): string | null {
  const r = (richiesta || "").toLowerCase().trim();
  if (!r) return null;
  for (const [pattern, chiave] of Object.entries(comandi)) {
    if (r.includes(pattern.toLowerCase())) return chiave;
  }
  return null;
}

export const SOGLIA_CONFIDENZA = 0.7;

/** Si sale a Sonnet (gradino 2) solo se serve giudizio o la confidenza è bassa. */
export function serveSonnet(piano: Pick<Piano, "serve_ragionamento" | "confidenza">): boolean {
  if (piano.serve_ragionamento === true) return true;
  return typeof piano.confidenza === "number" && piano.confidenza < SOGLIA_CONFIDENZA;
}

export type Modalita = "normale" | "conservativa";

/** Oltre il tetto token → modalità conservativa. Tetto non valido → conservativa (prudente). */
export function modalitaDaBudget(usati: number, tetto: number): Modalita {
  if (!Number.isFinite(tetto) || tetto <= 0) return "conservativa";
  return usati >= tetto ? "conservativa" : "normale";
}

/** In conservativa si resta ai gradini economici (0-1): niente Sonnet senza conferma. */
export function gradinoConsentito(modalita: Modalita, gradino: number): boolean {
  return modalita === "normale" ? gradino <= 3 : gradino <= 1;
}

/** Stima costo (USD) — prezzi per milione di token, default indicativi. */
export function stimaCostoToken(tokenInput: number, tokenOutput: number, prezzoInPerM = 1, prezzoOutPerM = 5): number {
  const i = Math.max(0, tokenInput || 0);
  const o = Math.max(0, tokenOutput || 0);
  return +(((i / 1e6) * prezzoInPerM) + ((o / 1e6) * prezzoOutPerM)).toFixed(6);
}
