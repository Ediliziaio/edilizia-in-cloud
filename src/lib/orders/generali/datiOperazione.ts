/**
 * I dati di una commessa generale, per tipologia (piano 2026-11-14-macro-commessa-per-tipologia,
 * lotti T1, T3, T4, T5). Comuni a tutte: cliente, indirizzo, inizio e fine lavori, responsabile,
 * note. Poi le sezioni proprie di ogni tipologia: le figure di un appalto, area e titolo edilizio
 * di uno sviluppo, l'immobile acquistato di una compravendita. Le chiavi sono quelle che accetta
 * commessa_generale_dati_salva (20290322135000): una chiave nuova va aggiunta anche lì.
 */
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";

export type TipoCampo = "testo" | "data" | "importo" | "numero" | "scelta";

export interface CampoDati {
  chiave: string;
  etichetta: string;
  tipo: TipoCampo;
  opzioni?: readonly string[];
  esempio?: string;
  /** Unità accanto al numero (m², m³). */
  unita?: string;
}

export type SezioneId = "appalto" | "area" | "titolo" | "tecnici" | "immobile" | "ristrutturazione" | "rivendita";

export interface SezioneDati {
  id: SezioneId;
  titolo: string;
  descrizione: string;
  campi: readonly CampoDati[];
}

const APPALTO: SezioneDati = {
  id: "appalto",
  titolo: "Committente e figure",
  descrizione: "Chi appalta e chi segue i lavori per il committente.",
  campi: [
    { chiave: "tipo", etichetta: "Appalto", tipo: "scelta", opzioni: ["Pubblico", "Privato"] },
    { chiave: "stazione_appaltante", etichetta: "Stazione appaltante", tipo: "testo", esempio: "se diversa dal committente" },
    { chiave: "rup", etichetta: "RUP", tipo: "testo", esempio: "responsabile unico del progetto" },
    { chiave: "direttore_lavori", etichetta: "Direttore lavori", tipo: "testo" },
    { chiave: "cse", etichetta: "Coordinatore sicurezza (CSE)", tipo: "testo" },
    { chiave: "soa", etichetta: "Categoria SOA prevalente", tipo: "testo", esempio: "OG1 classifica III" },
  ],
};

const AREA: SezioneDati = {
  id: "area",
  titolo: "Area",
  descrizione: "Il terreno o l'edificio su cui si costruisce.",
  campi: [
    { chiave: "catasto", etichetta: "Dati catastali", tipo: "testo", esempio: "Foglio 12, particella 345" },
    { chiave: "superficie", etichetta: "Superficie", tipo: "numero", unita: "m²" },
    { chiave: "cubatura", etichetta: "Cubatura", tipo: "numero", unita: "m³" },
  ],
};

const TITOLO: SezioneDati = {
  id: "titolo",
  titolo: "Titolo edilizio",
  descrizione: "Il permesso con cui si costruisce: la scadenza compare fra gli avvisi.",
  campi: [
    { chiave: "tipo", etichetta: "Tipo", tipo: "scelta", opzioni: ["Permesso di costruire", "SCIA alternativa al PdC", "SCIA", "CILA", "Altro"] },
    { chiave: "numero", etichetta: "Numero", tipo: "testo", esempio: "123/2026" },
    { chiave: "data", etichetta: "Rilasciato il", tipo: "data" },
    { chiave: "scadenza", etichetta: "Fine lavori entro", tipo: "data" },
    { chiave: "agibilita", etichetta: "Agibilità", tipo: "data" },
  ],
};

const TECNICI: SezioneDati = {
  id: "tecnici",
  titolo: "Tecnici e impresa",
  descrizione: "Chi progetta, chi dirige i lavori e chi costruisce.",
  campi: [
    { chiave: "progettista", etichetta: "Progettista", tipo: "testo" },
    { chiave: "direttore_lavori", etichetta: "Direttore lavori", tipo: "testo" },
    { chiave: "cse", etichetta: "Coordinatore sicurezza (CSE)", tipo: "testo" },
    { chiave: "impresa_esecutrice", etichetta: "Impresa esecutrice", tipo: "testo", esempio: "vuoto se costruite in proprio" },
  ],
};

const IMMOBILE: SezioneDati = {
  id: "immobile",
  titolo: "Immobile acquistato",
  descrizione: "Cosa si compra, da chi e quando: il prezzo e la data del rogito sono la voce d'acquisto del piano.",
  campi: [
    { chiave: "indirizzo", etichetta: "Indirizzo", tipo: "testo" },
    { chiave: "catasto", etichetta: "Dati catastali", tipo: "testo", esempio: "Foglio 8, particella 120, sub 4" },
    { chiave: "mq", etichetta: "Superficie", tipo: "numero", unita: "m²" },
    { chiave: "prezzo", etichetta: "Prezzo d'acquisto", tipo: "importo" },
    { chiave: "venditore", etichetta: "Venditore", tipo: "testo" },
    { chiave: "notaio", etichetta: "Notaio", tipo: "testo" },
    { chiave: "agenzia", etichetta: "Agenzia d'acquisto", tipo: "testo" },
    { chiave: "data_compromesso", etichetta: "Compromesso", tipo: "data" },
    { chiave: "data_rogito", etichetta: "Rogito d'acquisto", tipo: "data" },
  ],
};

const RISTRUTTURAZIONE: SezioneDati = {
  id: "ristrutturazione",
  titolo: "Ristrutturazione",
  descrizione: "Il titolo dei lavori e chi li fa.",
  campi: [
    { chiave: "titolo", etichetta: "Titolo", tipo: "scelta", opzioni: ["CILA", "SCIA", "Permesso di costruire", "Nessuno (edilizia libera)"] },
    { chiave: "numero", etichetta: "Numero pratica", tipo: "testo" },
    { chiave: "data", etichetta: "Presentata il", tipo: "data" },
    { chiave: "impresa", etichetta: "Impresa", tipo: "testo", esempio: "vuoto se lavorate in proprio" },
  ],
};

const RIVENDITA: SezioneDati = {
  id: "rivendita",
  titolo: "Rivendita",
  descrizione: "A quanto e quando si pensa di rivendere.",
  campi: [
    { chiave: "prezzo_obiettivo", etichetta: "Prezzo obiettivo", tipo: "importo" },
    { chiave: "agenzia", etichetta: "Agenzia", tipo: "testo" },
    { chiave: "data_prevista", etichetta: "Vendita prevista entro", tipo: "data" },
  ],
};

export const SEZIONI_PER_MODELLO: Record<ModelloGenerale, readonly SezioneDati[]> = {
  appalto: [APPALTO],
  sviluppo: [AREA, TITOLO, TECNICI],
  compravendita: [IMMOBILE, RISTRUTTURAZIONE, RIVENDITA],
};

export type DatiSezioni = Partial<Record<SezioneId, Record<string, string | number | boolean | null>>> & {
  responsabile?: string;
  note?: string;
};

/** Legge `dati` dal riepilogo senza fidarsi della forma. */
export function leggiDatiSezioni(v: unknown): DatiSezioni {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const fuori: DatiSezioni = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if ((k === "responsabile" || k === "note") && typeof x === "string") fuori[k] = x;
    else if (x && typeof x === "object" && !Array.isArray(x)) {
      const campi: Record<string, string | number | boolean | null> = {};
      for (const [c, y] of Object.entries(x as Record<string, unknown>)) {
        if (typeof y === "string" || typeof y === "number" || typeof y === "boolean") campi[c] = y;
      }
      (fuori as Record<string, unknown>)[k] = campi;
    }
  }
  return fuori;
}

export interface DatiGenerale {
  modello: ModelloGenerale;
  clienteId: string | null;
  indirizzo: string | null;
  inizio: string | null;
  fine: string | null;
  dati: DatiSezioni;
}

export interface DatoMancante {
  id: string;
  testo: string;
}

/**
 * I dati che servono per lavorare bene, per tipologia: la guida li chiede finché mancano.
 * Pochi, quelli che cambiano i conti o le scadenze; il resto è facoltativo.
 */
export function datiMancanti(g: DatiGenerale): DatoMancante[] {
  const fuori: DatoMancante[] = [];
  if (g.modello === "appalto" && !g.clienteId) fuori.push({ id: "cliente", testo: "il committente" });
  if (g.modello === "appalto" && !g.dati.appalto?.tipo) fuori.push({ id: "tipo", testo: "se è pubblico o privato" });
  // Compravendita: l'indirizzo dell'immobile acquistato vale come indirizzo dell'operazione.
  const luogo = g.indirizzo || (g.modello === "compravendita" ? g.dati.immobile?.indirizzo : null);
  if (!luogo) {
    fuori.push({ id: "indirizzo", testo: g.modello === "compravendita" ? "l'indirizzo dell'immobile" : g.modello === "sviluppo" ? "l'indirizzo dell'area" : "l'indirizzo del cantiere" });
  }
  if (!g.inizio) fuori.push({ id: "inizio", testo: "l'inizio dei lavori" });
  if (g.modello === "sviluppo" && !g.dati.titolo?.tipo) fuori.push({ id: "titolo", testo: "il titolo edilizio" });
  if (g.modello === "compravendita" && (g.dati.immobile?.prezzo == null || !g.dati.immobile?.data_rogito)) {
    fuori.push({ id: "immobile", testo: "prezzo e data del rogito d'acquisto" });
  }
  return fuori;
}

/** Giorni da oggi a una data «aaaa-mm-gg» (negativi se passata); null se non è una data. */
export function giorniA(data: string | null | undefined, oggi: Date = new Date()): number | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}/.test(data)) return null;
  const [a, m, g] = data.slice(0, 10).split("-").map(Number);
  const fine = Date.UTC(a, m - 1, g);
  const inizio = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.round((fine - inizio) / 86_400_000);
}
