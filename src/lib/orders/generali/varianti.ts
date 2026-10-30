// src/lib/orders/generali/varianti.ts
// Varianti chieste dall'acquirente di un'unità (finiture extra, modifiche a pagamento).
// Sono le varianti di commessa che l'app ha già (`ordini_variazione` sulla commessa dell'unità):
// documento, firma online o su carta e costo previsto (interno) restano quelli. Qui: la lettura
// di `generale_varianti_elenco` (migrazione 20281105120000), le parole dell'acquirente
// (proposta, accettata, rifiutata) e i totali che entrano nel prezzo dell'unità e nel piano.
// Niente React né database.
import type { ElencoUnita } from "@/lib/orders/generali/unita";
import { variationDecimal } from "@/lib/orders/variationDraft";

export type StatoVariante = "proposta" | "accettata" | "rifiutata" | "annullata";

/** bozza e in attesa di firma sono proposte; approvato = accettata. */
export function statoVariante(statoDb: string): StatoVariante {
  if (statoDb === "approvato") return "accettata";
  if (statoDb === "rifiutato") return "rifiutata";
  if (statoDb === "annullato") return "annullata";
  return "proposta";
}

export const NOMI_STATO_VARIANTE: Record<StatoVariante, string> = {
  proposta: "Proposta",
  accettata: "Accettata",
  rifiutata: "Rifiutata",
  annullata: "Annullata",
};

export interface VarianteAcquirente {
  id: string;
  /** La commessa dell'unità. */
  orderId: string;
  numero: number;
  titolo: string;
  stato: StatoVariante;
  /** bozza: si scrive ancora; in_attesa: documento pronto, si aspetta la firma. */
  inBozza: boolean;
  /** Ricavo in più (con il segno: una riduzione è negativa); null = non visibile. */
  importo: number | null;
  /** Costo previsto (interno); null = non scritto o non visibile. */
  costoPrevisto: number | null;
  scadenzaScelte: string | null;
  firmataIl: string | null;
  canale: "online" | "offline" | null;
  /** C'è il documento della proposta (PDF conservato). */
  documento: boolean;
  richiestoDa: string | null;
}

export interface DatiVarianti {
  permessi: { importi: boolean; costi: boolean; modifica: boolean };
  varianti: VarianteAcquirente[];
}

type Riga = Record<string, unknown>;
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Legge la risposta di `generale_varianti_elenco` senza fidarsi della forma. */
export function leggiVarianti(data: unknown): DatiVarianti {
  const d = (data ?? {}) as Riga;
  const p = (d.permessi ?? {}) as Riga;
  const righe = Array.isArray(d.varianti) ? (d.varianti as Riga[]) : [];
  return {
    permessi: { importi: p.importi === true, costi: p.costi === true, modifica: p.modifica === true },
    varianti: righe
      .filter((v) => v && typeof v.id === "string" && typeof v.order_id === "string")
      .map((v): VarianteAcquirente => {
        const costo = testo(v.costo_previsto);
        return {
          id: v.id as string,
          orderId: v.order_id as string,
          numero: numero(v.numero) ?? 0,
          titolo: testo(v.titolo) ?? "Variante",
          stato: statoVariante(String(v.stato ?? "")),
          inBozza: v.stato === "bozza",
          importo: numero(v.importo),
          // Il costo è scritto nella bozza come l'ha digitato chi la prepara («350,00»).
          costoPrevisto: costo ? variationDecimal(costo) : null,
          scadenzaScelte: testo(v.scadenza_scelte),
          firmataIl: testo(v.firmata_il),
          canale: v.canale === "online" || v.canale === "offline" ? v.canale : null,
          documento: v.documento === true,
          richiestoDa: testo(v.richiesto_da),
        };
      }),
  };
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

export interface TotaliVarianti {
  /** Ricavo delle accettate: entra nel prezzo dell'unità. null = importi non visibili. */
  accettate: number | null;
  /** Costo previsto delle accettate (solo quelle che lo hanno). null = costi non visibili. */
  costoAccettate: number | null;
  /** Ricavo delle proposte ancora aperte. */
  proposte: number | null;
  numeroAccettate: number;
  numeroProposte: number;
}

export function totaliVarianti(varianti: readonly VarianteAcquirente[], permessi: Pick<DatiVarianti["permessi"], "importi" | "costi">): TotaliVarianti {
  const accettate = varianti.filter((v) => v.stato === "accettata");
  const proposte = varianti.filter((v) => v.stato === "proposta");
  const somma = (righe: VarianteAcquirente[], f: (v: VarianteAcquirente) => number | null) => arrotonda(righe.reduce((t, v) => t + (f(v) ?? 0), 0));
  return {
    accettate: permessi.importi ? somma(accettate, (v) => v.importo) : null,
    costoAccettate: permessi.costi ? somma(accettate, (v) => v.costoPrevisto) : null,
    proposte: permessi.importi ? somma(proposte, (v) => v.importo) : null,
    numeroAccettate: accettate.length,
    numeroProposte: proposte.length,
  };
}

/** Le varianti di ogni unità (chiave: la commessa dell'unità), nell'ordine di numero. */
export function variantiPerUnita(varianti: readonly VarianteAcquirente[]): Map<string, VarianteAcquirente[]> {
  const m = new Map<string, VarianteAcquirente[]>();
  for (const v of [...varianti].sort((a, b) => a.numero - b.numero)) m.set(v.orderId, [...(m.get(v.orderId) ?? []), v]);
  return m;
}

/**
 * Il ricavo delle varianti accettate per unità: lo somma il prezzo dell'unità (unitaConti).
 * Vuota se chi guarda non vede gli importi.
 */
export function ricavoVariantiPerUnita(d: DatiVarianti | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!d?.permessi.importi) return m;
  for (const v of d.varianti) {
    if (v.stato !== "accettata" || v.importo === null) continue;
    m.set(v.orderId, arrotonda((m.get(v.orderId) ?? 0) + v.importo));
  }
  return m;
}

/**
 * L'elenco delle unità con le varianti: ogni unità prende il ricavo delle sue accettate, che
 * i conti (unitaConti) sommano al prezzo. Senza varianti lette l'elenco resta com'è.
 */
export function conVarianti(e: ElencoUnita, d: DatiVarianti | null): ElencoUnita {
  if (!d) return { ...e, varianti: null };
  const ricavo = ricavoVariantiPerUnita(d);
  return {
    ...e,
    varianti: d,
    unita: e.unita.map((u) => (ricavo.has(u.orderId) ? { ...u, variantiAccettate: ricavo.get(u.orderId)! } : u)),
  };
}

/**
 * Proposte con la scadenza delle scelte vicina (entro `giorni`) o passata: l'acquirente deve
 * ancora decidere. Le accettate e le rifiutate non scadono più.
 */
export function scadenzaScelte(v: Pick<VarianteAcquirente, "stato" | "scadenzaScelte">, oggi: string, giorni = 7): "scaduta" | "vicina" | null {
  if (v.stato !== "proposta" || !v.scadenzaScelte) return null;
  const diff = Math.round((Date.parse(`${v.scadenzaScelte.slice(0, 10)}T00:00:00Z`) - Date.parse(`${oggi.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (diff < 0) return "scaduta";
  return diff <= giorni ? "vicina" : null;
}

/** Ricavo e costo previsto delle accettate, per il piano economico; null = da non mostrare. */
export function variantiPerPiano(d: DatiVarianti | null | undefined): { ricavo: number; costo: number } | null {
  if (!d || !d.permessi.importi) return null;
  const t = totaliVarianti(d.varianti, d.permessi);
  if (t.numeroAccettate === 0) return null;
  return { ricavo: t.accettate ?? 0, costo: t.costoAccettate ?? 0 };
}
