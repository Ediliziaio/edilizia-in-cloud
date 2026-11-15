// src/lib/orders/generali/prerequisiti.ts
// «Per lavorare ti manca…» sulla commessa generale (15/11/2026). Il flusso si fermava solo
// quando ci si arrivava: senza operai né ditte il rapportino non si salva, senza clienti
// un'unità non si prenota, senza i dati fiscali dell'azienda una fattura non si emette.
// I conteggi arrivano da generale_prerequisiti (20290330170000). Un valore che non si sa
// (lettura fallita) non produce avvisi: meglio tacere che dire una cosa falsa.
import type { ModelloGenerale } from "../commesseGenerali.ts";

export interface PrerequisitiGenerale {
  dipendenti: number;
  ditte: number;
  mezzi: number;
  clienti: number;
  datiFiscali: boolean;
}

export type IdMancanza = "squadra" | "clienti" | "fatturazione";

export interface Mancanza {
  id: IdMancanza;
  /** Cosa manca, detto in breve: è il testo del pulsante. */
  cosa: string;
  /** A cosa serve, per il suggerimento. */
  perche: string;
  /** Dove si rimedia. */
  percorso: string;
}

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function leggiPrerequisiti(v: unknown): PrerequisitiGenerale | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const dipendenti = numero(r.dipendenti), ditte = numero(r.ditte), mezzi = numero(r.mezzi), clienti = numero(r.clienti);
  if (dipendenti === null || ditte === null || mezzi === null || clienti === null || typeof r.dati_fiscali !== "boolean") return null;
  return { dipendenti, ditte, mezzi, clienti, datiFiscali: r.dati_fiscali };
}

/** Le cose senza le quali una parte del flusso si ferma, nell'ordine in cui si incontrano. */
export function mancanzeOperazione(p: PrerequisitiGenerale | null, modello: ModelloGenerale): Mancanza[] {
  if (!p) return [];
  const fuori: Mancanza[] = [];
  if (p.dipendenti === 0 && p.ditte === 0) {
    fuori.push({
      id: "squadra",
      cosa: "operai o ditte",
      perche: "Un rapportino registra chi ha lavorato: senza operai né ditte non si salva.",
      percorso: "/azienda/personale",
    });
  }
  // L'appalto ha un committente (scheda Dati); sviluppo e compravendita vendono a degli acquirenti.
  if (modello !== "appalto" && p.clienti === 0) {
    fuori.push({
      id: "clienti",
      cosa: "i clienti",
      perche: "Per prenotare un'unità serve l'acquirente fra i clienti.",
      percorso: "/azienda/clienti",
    });
  }
  if (!p.datiFiscali) {
    fuori.push({
      id: "fatturazione",
      cosa: "i dati per fatturare",
      perche: "Partita IVA e dati dell'azienda servono per emettere le fatture.",
      percorso: "/azienda/impostazioni/fatturazione",
    });
  }
  return fuori;
}
