// src/lib/orders/generali/subappalti.ts
// I subappalti sul contratto d'appalto (scheda «Contratto e SAL»): la lettura di
// `generale_subappalti_elenco` (migrazione 20281105120000) e i conti, in lettura.
// I contratti di subappalto, i SAL passivi e i documenti restano dove l'app li gestisce già
// (scheda del subappaltatore): qui si sommano per contratto e si confrontano con i SAL attivi.
// Niente React né database.
import { arrotonda } from "@/lib/orders/generali/contratto";

export const STATI_SUBAPPALTO: Record<string, string> = {
  bozza: "In bozza",
  attivo: "Attivo",
  sospeso: "Sospeso",
  completato: "Completato",
  risolto: "Risolto",
};

export const STATI_SAL_PASSIVO: Record<string, string> = {
  ricevuto: "Ricevuto",
  verificato: "Verificato",
  pagato: "Pagato",
  contestato: "Contestato",
};

export const NOMI_DOCUMENTO: Record<string, string> = {
  durc: "DURC",
  visura: "Visura camerale",
  dvr: "DVR",
  pos: "POS",
  soa: "Attestazione SOA",
  polizza_rc: "Polizza RC",
  cassa_edile: "Cassa Edile",
  antimafia: "Antimafia",
  iscrizione_albo: "Iscrizione all'albo",
  formazione_operai: "Formazione degli operai",
  iso_certificazione: "Certificazione ISO",
  altro: "Altro",
};

export interface SalPassivo {
  id: string;
  numero: number;
  data: string | null;
  lordo: number;
  ritenuta: number;
  netto: number;
  stato: string;
  /** Pagato registrato; null = mai registrato (un SAL «pagato» senza registro vale il netto). */
  pagato: number | null;
}

export interface DocumentoSub { tipo: string; scadenza: string | null; rilascio: string | null }

export interface Subappalto {
  id: string;
  numero: string | null;
  descrizione: string;
  importo: number;
  oneriSicurezza: number;
  stato: string;
  dataInizio: string | null;
  dataFinePrevista: string | null;
  firmatoIl: string | null;
  /** L'ordine di lavoro su cui il contratto è nato. */
  orderId: string;
  /** Gli altri ordini dello stesso contratto a cui è legato. */
  ordiniCollegati: string[];
  subappaltatore: { id: string; nome: string; piva: string | null; durcScadenza: string | null };
  sal: SalPassivo[];
  documenti: DocumentoSub[];
}

export interface OrdineDiLavoro { id: string; codice: string | null; nome: string }

export interface DatiSubappalti {
  permessi: { vede: boolean; modifica: boolean };
  /** Soglia della quota subappaltabile, in % del valore del contratto; null = nessuna. */
  sogliaPct: number | null;
  ordini: OrdineDiLavoro[];
  subappalti: Subappalto[];
}

type Riga = Record<string, unknown>;
const lista = (v: unknown): Riga[] => (Array.isArray(v) ? (v as Riga[]).filter((x) => x && typeof x === "object") : []);
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const zero = (v: unknown) => numero(v) ?? 0;
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Legge la risposta di `generale_subappalti_elenco` senza fidarsi della forma. */
export function leggiSubappalti(data: unknown): DatiSubappalti {
  const d = (data ?? {}) as Riga;
  const p = (d.permessi ?? {}) as Riga;
  return {
    permessi: { vede: p.vede === true, modifica: p.modifica === true },
    sogliaPct: numero(d.soglia_pct),
    ordini: lista(d.ordini).filter((o) => typeof o.id === "string").map((o) => ({
      id: o.id as string, codice: testo(o.codice), nome: testo(o.nome) ?? "Ordine senza nome",
    })),
    subappalti: lista(d.contratti).filter((c) => typeof c.id === "string" && typeof c.order_id === "string").map((c): Subappalto => {
      const s = (c.subappaltatore ?? {}) as Riga;
      return {
        id: c.id as string,
        numero: testo(c.numero),
        descrizione: testo(c.descrizione) ?? "",
        importo: zero(c.importo),
        oneriSicurezza: zero(c.oneri_sicurezza),
        stato: testo(c.stato) ?? "bozza",
        dataInizio: testo(c.data_inizio),
        dataFinePrevista: testo(c.data_fine_prevista),
        firmatoIl: testo(c.firmato_il),
        orderId: c.order_id as string,
        ordiniCollegati: Array.isArray(c.ordini_collegati) ? (c.ordini_collegati as unknown[]).filter((x): x is string => typeof x === "string") : [],
        subappaltatore: {
          id: testo(s.id) ?? "",
          nome: testo(s.ragione_sociale) ?? "Subappaltatore",
          piva: testo(s.piva),
          durcScadenza: testo(s.durc_scadenza),
        },
        sal: lista(c.sal).filter((x) => typeof x.id === "string").map((x) => ({
          id: x.id as string,
          numero: zero(x.numero),
          data: testo(x.data),
          lordo: zero(x.lordo),
          ritenuta: zero(x.ritenuta),
          netto: zero(x.netto),
          stato: testo(x.stato) ?? "ricevuto",
          pagato: numero(x.pagato),
        })),
        documenti: lista(c.documenti).filter((x) => typeof x.tipo === "string").map((x) => ({
          tipo: x.tipo as string, scadenza: testo(x.scadenza), rilascio: testo(x.rilascio),
        })),
      };
    }),
  };
}

// ── Conti ───────────────────────────────────────────────────────────────────

/** Il valore del subappalto: lavori più oneri della sicurezza. */
export const valoreSubappalto = (s: Pick<Subappalto, "importo" | "oneriSicurezza">) => arrotonda(s.importo + s.oneriSicurezza);

/** Un subappalto risolto non pesa sulla quota: il contratto non c'è più. */
export const contaNellaQuota = (s: Pick<Subappalto, "stato">) => s.stato !== "risolto";

/** Un SAL contestato non è dovuto finché non si chiarisce. */
const salDovuto = (s: SalPassivo) => s.stato !== "contestato";

/** Stessa regola della contabilità del subappaltatore: il registrato, altrimenti il netto di un SAL «pagato». */
export const pagatoSal = (s: SalPassivo) => (s.pagato !== null ? s.pagato : s.stato === "pagato" ? s.netto : 0);

export interface SalPassiviTotali {
  /** Lordo dei SAL ricevuti e non contestati: quanto ho riconosciuto ai subappaltatori. */
  lordo: number;
  ritenute: number;
  netto: number;
  pagato: number;
  /** Netto ancora da pagare (mai sotto zero per SAL). */
  daPagare: number;
  contestati: number;
}

export function salPassivi(subappalti: readonly Pick<Subappalto, "sal">[]): SalPassiviTotali {
  const tutti = subappalti.flatMap((s) => s.sal);
  const dovuti = tutti.filter(salDovuto);
  const somma = (f: (s: SalPassivo) => number, righe = dovuti) => arrotonda(righe.reduce((t, s) => t + f(s), 0));
  return {
    lordo: somma((s) => s.lordo),
    ritenute: somma((s) => s.ritenuta),
    netto: somma((s) => s.netto),
    pagato: somma(pagatoSal, tutti),
    daPagare: somma((s) => Math.max(0, s.netto - pagatoSal(s))),
    contestati: tutti.length - dovuti.length,
  };
}

export interface QuotaSubappaltata {
  /** Valore dei subappalti non risolti. */
  importo: number;
  /** Sul valore aggiornato del contratto; null senza valore del contratto. */
  pct: number | null;
  sogliaPct: number | null;
  /** Quanto si può ancora subappaltare prima della soglia (negativo = oltre). */
  margineSoglia: number | null;
  stato: "senza_soglia" | "sotto" | "vicina" | "oltre";
}

/** «Vicina» alla soglia dal 90% della soglia in su: l'avviso arriva prima del limite. */
export function quotaSubappaltata(
  subappalti: readonly Pick<Subappalto, "importo" | "oneriSicurezza" | "stato">[],
  valoreContratto: number | null,
  sogliaPct: number | null,
): QuotaSubappaltata {
  const importo = arrotonda(subappalti.filter(contaNellaQuota).reduce((t, s) => t + valoreSubappalto(s), 0));
  const base = valoreContratto !== null && valoreContratto > 0 ? valoreContratto : null;
  const pct = base !== null ? Math.round((importo / base) * 10000) / 100 : null;
  if (sogliaPct === null || base === null) {
    return { importo, pct, sogliaPct, margineSoglia: null, stato: "senza_soglia" };
  }
  const limite = arrotonda((base * sogliaPct) / 100);
  const margineSoglia = arrotonda(limite - importo);
  const stato = importo > limite + 0.005 ? "oltre" : importo >= limite * 0.9 ? "vicina" : "sotto";
  return { importo, pct, sogliaPct, margineSoglia, stato };
}

export interface ConfrontoSal {
  /** SAL attivi del contratto: quanto è messo a SAL (cumulativo) e il netto da incassare. */
  attiviASal: number;
  attiviNetto: number;
  incassato: number;
  passivi: SalPassiviTotali;
  /** A SAL attivo meno lordo dei SAL passivi: quanto resta all'impresa sui lavori a SAL. */
  differenzaSal: number;
  /** Incassato meno pagato ai subappaltatori: la cassa del contratto. */
  differenzaCassa: number;
  /** Quota dei SAL attivi che va ai subappaltatori; null senza SAL attivi. */
  quotaPassiviPct: number | null;
}

export function confrontoSal(
  attivi: { aSal: number; netto: number; incassato: number },
  subappalti: readonly Pick<Subappalto, "sal">[],
): ConfrontoSal {
  const passivi = salPassivi(subappalti);
  return {
    attiviASal: attivi.aSal,
    attiviNetto: attivi.netto,
    incassato: attivi.incassato,
    passivi,
    differenzaSal: arrotonda(attivi.aSal - passivi.lordo),
    differenzaCassa: arrotonda(attivi.incassato - passivi.pagato),
    quotaPassiviPct: attivi.aSal > 0 ? Math.round((passivi.lordo / attivi.aSal) * 1000) / 10 : null,
  };
}

// ── DURC e documenti ────────────────────────────────────────────────────────

export type StatoDocumento = "valido" | "in_scadenza" | "scaduto" | "senza_scadenza" | "mancante";

const GIORNO_MS = 86_400_000;
const giorni = (da: string, a: string) => Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${da.slice(0, 10)}T00:00:00Z`)) / GIORNO_MS);

export function statoScadenza(scadenza: string | null, oggi: string, preavviso = 30): Exclude<StatoDocumento, "mancante"> {
  if (!scadenza) return "senza_scadenza";
  const g = giorni(oggi, scadenza);
  if (g < 0) return "scaduto";
  return g <= preavviso ? "in_scadenza" : "valido";
}

/**
 * Il DURC come lo legge la scheda del subappaltatore: la scadenza scritta in anagrafica,
 * altrimenti quella del DURC caricato più lontano nel tempo.
 */
export function durcSubappaltatore(s: Pick<Subappalto, "subappaltatore" | "documenti">, oggi: string): { stato: StatoDocumento; scadenza: string | null } {
  const doc = s.documenti.find((d) => d.tipo === "durc") ?? null;
  const scadenza = s.subappaltatore.durcScadenza ?? doc?.scadenza ?? null;
  if (!scadenza && !doc) return { stato: "mancante", scadenza: null };
  return { stato: statoScadenza(scadenza, oggi), scadenza };
}

/** Gli altri documenti scaduti o in scadenza (il DURC ha la sua riga). */
export function documentiDaGuardare(s: Pick<Subappalto, "documenti">, oggi: string): (DocumentoSub & { stato: StatoDocumento })[] {
  return s.documenti
    .filter((d) => d.tipo !== "durc")
    .map((d) => ({ ...d, stato: statoScadenza(d.scadenza, oggi) as StatoDocumento }))
    .filter((d) => d.stato === "scaduto" || d.stato === "in_scadenza");
}

// ── Ordini di lavoro ────────────────────────────────────────────────────────

export const nomeOrdine = (o: OrdineDiLavoro) => (o.codice ? `${o.codice} · ${o.nome}` : o.nome);

/** Gli ordini su cui lavora un subappalto: quello su cui è nato, poi i legati, nell'ordine dell'elenco. */
export function ordiniDelSubappalto(s: Pick<Subappalto, "orderId" | "ordiniCollegati">, ordini: readonly OrdineDiLavoro[]): OrdineDiLavoro[] {
  const ids = new Set([s.orderId, ...s.ordiniCollegati]);
  return ordini.filter((o) => ids.has(o.id));
}
