// src/lib/orders/generali/pianoLettura.ts
// Dal database al piano economico, senza fidarsi della forma: righe di
// generale_piano_versioni / generale_piano_voci / generale_fotografie, la risposta di
// commessa_generale_piano_reale e, se il modulo Unità c'è già, unita_immobiliari.
import { isCategoriaPiano, type TipoVoce } from "@/lib/orders/generali/pianoCategorie";
import type { DatiUnita, Incasso, RigaReale, VocePiano } from "@/lib/orders/generali/pianoConti";

export type StatoVersione = "bozza" | "approvata" | "superata";

export interface VersionePiano {
  id: string;
  numero: number;
  stato: StatoVersione;
  nota: string | null;
  approvataIl: string | null;
  creataIl: string | null;
}

export interface CategoriaAzienda { chiave: string; etichetta: string }

export interface RealePiano {
  oggi: string;
  permessi: { costi: boolean; importi: boolean };
  righe: RigaReale[];
  incassi: Incasso[];
  categorie: CategoriaAzienda[];
}

export interface FotografiaPiano {
  mese: string;
  versioneNumero: number | null;
  versioneStato: string | null;
  ricaviPrevisti: number;
  costiPrevisti: number;
  ricaviReali: number;
  costiReali: number;
  ricaviStima: number;
  costiStima: number;
  capitaleMassimoPrevisto: number;
  capitaleInvestito: number;
  origine: "automatica" | "manuale";
}

type Riga = Record<string, unknown>;

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const tipoVoce = (v: unknown): TipoVoce | null => (v === "ricavo" || v === "costo" ? v : null);
/** «2027-03-01» → «2027-03». */
export const meseDaData = (v: unknown): string | null => {
  const t = testo(v);
  return t && /^\d{4}-\d{2}/.test(t) ? t.slice(0, 7) : null;
};
/** «2027-03» → «2027-03-01» (la colonna `mese` è una data, primo giorno del mese). */
export const dataDaMese = (mese: string | null): string | null => (mese && /^\d{4}-\d{2}$/.test(mese) ? `${mese}-01` : null);

const righe = (v: unknown): Riga[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Riga[]) : []);

export function leggiVersioni(data: unknown): VersionePiano[] {
  return righe(data)
    .filter((r) => typeof r.id === "string")
    .map((r): VersionePiano => ({
      id: r.id as string,
      numero: numero(r.numero) ?? 0,
      stato: r.stato === "approvata" || r.stato === "superata" ? r.stato : "bozza",
      nota: testo(r.nota),
      approvataIl: testo(r.approvata_at),
      creataIl: testo(r.created_at),
    }))
    .sort((a, b) => b.numero - a.numero);
}

export function leggiVoci(data: unknown): VocePiano[] {
  return righe(data)
    .filter((r) => typeof r.id === "string" && tipoVoce(r.tipo) && isCategoriaPiano(r.categoria))
    .map((r) => ({
      id: r.id as string,
      tipo: tipoVoce(r.tipo)!,
      categoria: r.categoria as VocePiano["categoria"],
      descrizione: typeof r.descrizione === "string" ? r.descrizione : "",
      importo: numero(r.importo) ?? 0,
      mese: meseDaData(r.mese),
      durataMesi: Math.max(1, Math.round(numero(r.durata_mesi) ?? 1)),
      figliaId: testo(r.figlia_id),
      categorieCosto: Array.isArray(r.categorie_costo) ? r.categorie_costo.filter((c): c is string => typeof c === "string") : [],
      aFinire: numero(r.a_finire),
      nota: testo(r.nota),
      ordine: numero(r.ordine) ?? 0,
      origineId: testo(r.origine_id),
    }))
    .sort((a, b) => a.ordine - b.ordine);
}

export function leggiReale(data: unknown): RealePiano {
  const d = (data && typeof data === "object" ? data : {}) as Riga;
  const p = (d.permessi && typeof d.permessi === "object" ? d.permessi : {}) as Riga;
  return {
    oggi: testo(d.oggi) ?? new Date().toISOString().slice(0, 10),
    permessi: { costi: p.costi === true, importi: p.importi === true },
    righe: righe(d.righe)
      .filter((r) => typeof r.id === "string" && typeof r.order_id === "string" && tipoVoce(r.tipo) && numero(r.importo) !== null)
      .map((r) => ({
        id: r.id as string,
        fonte: testo(r.fonte) ?? "spesa",
        rifId: testo(r.rif_id),
        orderId: r.order_id as string,
        data: testo(r.data),
        tipo: tipoVoce(r.tipo)!,
        chiave: testo(r.chiave) ?? "altro",
        categoria: testo(r.categoria),
        descrizione: testo(r.descrizione) ?? "",
        importo: numero(r.importo)!,
        voceId: testo(r.voce_id),
      })),
    incassi: righe(d.incassi)
      .filter((r) => numero(r.importo) !== null)
      .map((r) => ({ fatturaId: testo(r.fattura_id) ?? "", data: testo(r.data), importo: numero(r.importo)! })),
    categorie: righe(d.categorie)
      .filter((r) => testo(r.chiave) && testo(r.etichetta))
      .map((r) => ({ chiave: r.chiave as string, etichetta: r.etichetta as string })),
  };
}

export function leggiFotografie(data: unknown): FotografiaPiano[] {
  return righe(data)
    .filter((r) => meseDaData(r.mese))
    .map((r) => ({
      mese: meseDaData(r.mese)!,
      versioneNumero: numero(r.versione_numero),
      versioneStato: testo(r.versione_stato),
      ricaviPrevisti: numero(r.ricavi_previsti) ?? 0,
      costiPrevisti: numero(r.costi_previsti) ?? 0,
      ricaviReali: numero(r.ricavi_reali) ?? 0,
      costiReali: numero(r.costi_reali) ?? 0,
      ricaviStima: numero(r.ricavi_stima) ?? 0,
      costiStima: numero(r.costi_stima) ?? 0,
      capitaleMassimoPrevisto: numero(r.capitale_massimo_previsto) ?? 0,
      capitaleInvestito: numero(r.capitale_investito) ?? 0,
      origine: r.origine === "manuale" ? "manuale" as const : "automatica" as const,
    }))
    .sort((a, b) => a.mese.localeCompare(b.mese));
}

/** Le colonne che possono legare un'unità alla sua commessa: il modulo Unità ne usa una. */
const COLONNE_FIGLIA = ["order_id", "commessa_id", "figlia_id"] as const;

/** Millesimi e m² commerciali per commessa figlia, da unita_immobiliari (se la tabella c'è). */
export function leggiUnita(data: unknown): Map<string, DatiUnita> {
  const mappa = new Map<string, DatiUnita>();
  for (const r of righe(data)) {
    const chiave = COLONNE_FIGLIA.map((c) => testo(r[c])).find(Boolean);
    if (!chiave) continue;
    const prima = mappa.get(chiave);
    const mq = numero(r.mq_commerciali);
    const millesimi = numero(r.millesimi);
    // Una figlia con più righe (non dovrebbe: è 1:1) somma i suoi valori.
    mappa.set(chiave, {
      mq: mq === null ? prima?.mq ?? null : (prima?.mq ?? 0) + mq,
      millesimi: millesimi === null ? prima?.millesimi ?? null : (prima?.millesimi ?? 0) + millesimi,
    });
  }
  return mappa;
}
