// src/lib/orders/generali/pianoCategorie.ts
// Le categorie delle voci del piano economico della commessa generale, le parole del
// reale e le voci di partenza di ogni modello.
//
// Le stesse chiavi vivono nel database (20281031110000_generale_piano_economico.sql):
// il vincolo su generale_piano_voci.categoria e generale_piano_rango(), che decide
// quale voce raccoglie una riga del reale. Una categoria nuova si aggiunge in tutti e due.
import { normalizzaCategoria } from "@/lib/controlloGestione/vociCassa";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";

export type TipoVoce = "ricavo" | "costo";

export const CATEGORIE_RICAVO = ["vendite", "lavori", "altri_ricavi"] as const;
export const CATEGORIE_COSTO = [
  "terreno", "oneri", "progettazione", "costruzione", "materiali", "manodopera", "subappalti", "noli",
  "sicurezza", "allacci", "commercializzazione", "finanziari", "generali", "imprevisti", "iva", "altri_costi",
] as const;
export type CategoriaRicavo = typeof CATEGORIE_RICAVO[number];
export type CategoriaCosto = typeof CATEGORIE_COSTO[number];
export type CategoriaPiano = CategoriaRicavo | CategoriaCosto;

export interface DefinizioneCategoria {
  id: CategoriaPiano;
  tipo: TipoVoce;
  nome: string;
  /** Che cosa del reale finisce in questa voce, detto a chi la sceglie. */
  raccoglie: string;
}

export const CATEGORIE_PIANO: Record<CategoriaPiano, DefinizioneCategoria> = {
  vendite: { id: "vendite", tipo: "ricavo", nome: "Vendite", raccoglie: "Le fatture emesse dalle unità e dalla generale." },
  lavori: { id: "lavori", tipo: "ricavo", nome: "Lavori a contratto", raccoglie: "Le fatture emesse dagli ordini di lavoro e dalla generale." },
  altri_ricavi: { id: "altri_ricavi", tipo: "ricavo", nome: "Altri ricavi", raccoglie: "Le fatture che nessun'altra voce di ricavo raccoglie." },
  terreno: { id: "terreno", tipo: "costo", nome: "Terreno e acquisto", raccoglie: "Spese con categoria terreno, immobili, notaio, rogito." },
  oneri: { id: "oneri", tipo: "costo", nome: "Oneri, permessi e imposte", raccoglie: "Oneri di urbanizzazione, permessi, IMU, tasse e tributi." },
  progettazione: { id: "progettazione", tipo: "costo", nome: "Progettazione e direzione lavori", raccoglie: "Professionisti, tecnici, collaudi e perizie." },
  costruzione: {
    id: "costruzione", tipo: "costo", nome: "Costruzione",
    raccoglie: "Materiali, manodopera, subappalti, noli, sicurezza ed errori di cantiere, se non hanno una voce loro.",
  },
  materiali: { id: "materiali", tipo: "costo", nome: "Materiali", raccoglie: "Ordini d'acquisto, magazzino e spese di materiali." },
  manodopera: { id: "manodopera", tipo: "costo", nome: "Manodopera", raccoglie: "Ore del personale e rimborsi chilometrici." },
  subappalti: { id: "subappalti", tipo: "costo", nome: "Subappalti e squadre", raccoglie: "Squadre esterne e spese di subappalto." },
  noli: { id: "noli", tipo: "costo", nome: "Noli, trasporti e mezzi", raccoglie: "Noleggi, trasporti, carburante, leasing, ponteggi." },
  sicurezza: { id: "sicurezza", tipo: "costo", nome: "Sicurezza e cantiere", raccoglie: "Spese con categoria sicurezza e DPI." },
  allacci: { id: "allacci", tipo: "costo", nome: "Allacci e utenze", raccoglie: "Allacci, utenze, energia, acqua, gas." },
  commercializzazione: { id: "commercializzazione", tipo: "costo", nome: "Commercializzazione", raccoglie: "Provvigioni, agenzie, pubblicità e marketing." },
  finanziari: { id: "finanziari", tipo: "costo", nome: "Oneri finanziari", raccoglie: "Interessi, mutui, fideiussioni, spese bancarie." },
  generali: { id: "generali", tipo: "costo", nome: "Spese generali", raccoglie: "Assicurazioni, consulenze, servizi e le spese che non si riconoscono." },
  imprevisti: { id: "imprevisti", tipo: "costo", nome: "Imprevisti", raccoglie: "Errori e danni registrati sulle commesse." },
  iva: { id: "iva", tipo: "costo", nome: "IVA non detraibile", raccoglie: "Spese con categoria IVA: l'IVA che non recuperi è un costo." },
  altri_costi: { id: "altri_costi", tipo: "costo", nome: "Altri costi", raccoglie: "Tutto quello che nessun'altra voce di costo raccoglie." },
};

export const isCategoriaPiano = (v: unknown): v is CategoriaPiano =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(CATEGORIE_PIANO, v);

export const categorieDelTipo = (tipo: TipoVoce): DefinizioneCategoria[] =>
  (tipo === "ricavo" ? CATEGORIE_RICAVO : CATEGORIE_COSTO).map((c) => CATEGORIE_PIANO[c]);

/** Le categorie dei costi di cantiere: entrano nel costo di costruzione al m². */
export const CATEGORIE_CANTIERE: ReadonlySet<string> = new Set([
  "costruzione", "materiali", "manodopera", "subappalti", "noli", "sicurezza", "imprevisti",
]);

/** Le parole del reale (generale_piano_chiave_costo e le fonti fisse): servono alle righe fuori piano. */
export const CHIAVI_REALI: Record<string, string> = {
  terreno: "Terreno e acquisto",
  oneri: "Oneri, permessi e imposte",
  progettazione: "Progettazione e professionisti",
  materiali: "Materiali",
  manodopera: "Manodopera",
  subappalti: "Subappalti e squadre",
  noli: "Noli, trasporti e mezzi",
  sicurezza: "Sicurezza",
  allacci: "Allacci e utenze",
  commercializzazione: "Commercializzazione",
  finanziari: "Oneri finanziari",
  generali: "Spese generali",
  imprevisti: "Errori e imprevisti",
  iva: "IVA non detraibile",
  altro: "Spese senza categoria riconosciuta",
  ricavi: "Fatture emesse",
};

/** Da dove viene una riga del reale. */
export const FONTI_REALI: Record<string, string> = {
  spesa: "Spesa",
  spesa_divisa: "Spesa divisa tra commesse",
  oda: "Ordine d'acquisto",
  magazzino: "Magazzino",
  ore: "Ore del personale",
  squadra: "Squadra esterna",
  errore: "Errore",
  provvigione: "Provvigione",
  rimborsi_km: "Rimborsi chilometrici",
  rettifica: "Rettifica",
  fattura: "Fattura emessa",
};

export interface VoceDiPartenza {
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  descrizione: string;
  /** Mesi dopo quello di partenza in cui inizia (0 = questo mese). */
  dopoMesi: number;
  durataMesi: number;
  /** Solo per i ricavi: l'importo è il valore della generale (ricavi previsti o valore del contratto). */
  dalValore?: boolean;
}

/**
 * Le voci con cui parte il piano di ogni modello: importi da scrivere, mesi plausibili da
 * correggere. Per lo sviluppo è lo scheletro di un business plan, per l'appalto un budget.
 */
export const VOCI_DI_PARTENZA: Record<ModelloGenerale, VoceDiPartenza[]> = {
  appalto: [
    { tipo: "ricavo", categoria: "lavori", descrizione: "Lavori a contratto", dopoMesi: 1, durataMesi: 12, dalValore: true },
    { tipo: "costo", categoria: "materiali", descrizione: "Materiali", dopoMesi: 0, durataMesi: 12 },
    { tipo: "costo", categoria: "manodopera", descrizione: "Manodopera", dopoMesi: 0, durataMesi: 12 },
    { tipo: "costo", categoria: "subappalti", descrizione: "Subappalti e squadre", dopoMesi: 0, durataMesi: 12 },
    { tipo: "costo", categoria: "noli", descrizione: "Noli e trasporti", dopoMesi: 0, durataMesi: 12 },
    { tipo: "costo", categoria: "sicurezza", descrizione: "Sicurezza e allestimento del cantiere", dopoMesi: 0, durataMesi: 1 },
    { tipo: "costo", categoria: "generali", descrizione: "Spese generali di commessa", dopoMesi: 0, durataMesi: 12 },
    { tipo: "costo", categoria: "imprevisti", descrizione: "Imprevisti", dopoMesi: 6, durataMesi: 6 },
  ],
  sviluppo: [
    { tipo: "ricavo", categoria: "vendite", descrizione: "Vendita delle unità", dopoMesi: 18, durataMesi: 8, dalValore: true },
    { tipo: "costo", categoria: "terreno", descrizione: "Terreno, notaio e imposte d'acquisto", dopoMesi: 0, durataMesi: 1 },
    { tipo: "costo", categoria: "oneri", descrizione: "Oneri di urbanizzazione e permessi", dopoMesi: 2, durataMesi: 1 },
    { tipo: "costo", categoria: "progettazione", descrizione: "Progettazione e direzione lavori", dopoMesi: 0, durataMesi: 20 },
    { tipo: "costo", categoria: "costruzione", descrizione: "Costruzione", dopoMesi: 4, durataMesi: 16 },
    { tipo: "costo", categoria: "allacci", descrizione: "Allacci e utenze", dopoMesi: 18, durataMesi: 2 },
    { tipo: "costo", categoria: "commercializzazione", descrizione: "Commercializzazione (agenzia, pubblicità)", dopoMesi: 12, durataMesi: 14 },
    { tipo: "costo", categoria: "finanziari", descrizione: "Oneri finanziari", dopoMesi: 1, durataMesi: 24 },
    { tipo: "costo", categoria: "imprevisti", descrizione: "Imprevisti", dopoMesi: 10, durataMesi: 10 },
  ],
  compravendita: [
    { tipo: "ricavo", categoria: "vendite", descrizione: "Rivendita", dopoMesi: 8, durataMesi: 3, dalValore: true },
    { tipo: "costo", categoria: "terreno", descrizione: "Acquisto dell'immobile, notaio e imposte", dopoMesi: 0, durataMesi: 1 },
    { tipo: "costo", categoria: "progettazione", descrizione: "Tecnico e pratiche", dopoMesi: 0, durataMesi: 3 },
    { tipo: "costo", categoria: "costruzione", descrizione: "Ristrutturazione", dopoMesi: 2, durataMesi: 5 },
    { tipo: "costo", categoria: "commercializzazione", descrizione: "Agenzia e pubblicità", dopoMesi: 7, durataMesi: 4 },
    { tipo: "costo", categoria: "finanziari", descrizione: "Oneri finanziari", dopoMesi: 1, durataMesi: 10 },
    { tipo: "costo", categoria: "imprevisti", descrizione: "Imprevisti", dopoMesi: 4, durataMesi: 3 },
  ],
};

/** «2026-10» + 3 → «2027-01». */
export function aggiungiMesi(mese: string, n: number): string {
  const [a, m] = mese.split("-").map(Number);
  const totale = a * 12 + (m - 1) + n;
  const anno = Math.floor(totale / 12);
  const mm = totale - anno * 12 + 1;
  return `${anno}-${String(mm).padStart(2, "0")}`;
}

export interface VoceNuova {
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  descrizione: string;
  importo: number;
  mese: string | null;
  durataMesi: number;
}

/** Le voci di partenza di un modello, coi mesi contati da `daMese` e i ricavi dal valore della generale. */
export function vociDiPartenza(modello: ModelloGenerale, daMese: string, valore: number | null): VoceNuova[] {
  return VOCI_DI_PARTENZA[modello].map((v) => ({
    tipo: v.tipo,
    categoria: v.categoria,
    descrizione: v.descrizione,
    importo: v.dalValore && valore !== null && valore > 0 ? valore : 0,
    mese: aggiungiMesi(daMese, v.dopoMesi),
    durataMesi: v.durataMesi,
  }));
}

/** Parole che, dentro la descrizione o la categoria di una riga incollata, dicono la categoria. In ordine. */
const INDIZI: { cerca: RegExp; tipo: TipoVoce; categoria: CategoriaPiano; soloColTipo?: boolean }[] = [
  { cerca: /vendit|ricav|rogit|incass|prezzo_di_vendita|cession/, tipo: "ricavo", categoria: "vendite" },
  { cerca: /contratt|lavori_a|sal(_|$)|corrispettiv|fatturat/, tipo: "ricavo", categoria: "lavori" },
  { cerca: /(^|_)iva(_|$)/, tipo: "costo", categoria: "iva" },
  { cerca: /terren|notai|acquisto_immobil|acquisto_dell|area(_|$)|lotto/, tipo: "costo", categoria: "terreno" },
  { cerca: /oneri_di_urb|urbanizz|permess|concession|oneri_comun|imu(_|$)|tass|tribut|catast/, tipo: "costo", categoria: "oneri" },
  { cerca: /progett|direzione_lavori|(^|_)dl(_|$)|tecnic|profession|geometr|architett|ingegner|collaud|pratich/, tipo: "costo", categoria: "progettazione" },
  { cerca: /allacc|utenz|enel|acquedott|(^|_)gas(_|$)/, tipo: "costo", categoria: "allacci" },
  { cerca: /commercializz|agenzi|pubblicit|marketing|provvigion|mediazion|vendit/, tipo: "costo", categoria: "commercializzazione" },
  { cerca: /interess|finanz|mutu|banc|fideiussion/, tipo: "costo", categoria: "finanziari" },
  { cerca: /imprevist|contingenz|riserv/, tipo: "costo", categoria: "imprevisti" },
  { cerca: /subappalt|squadr|cottim/, tipo: "costo", categoria: "subappalti" },
  { cerca: /manodoper|personale|operai|stipend/, tipo: "costo", categoria: "manodopera" },
  { cerca: /material|fornitur|calcestruzz|acciai|laterizi/, tipo: "costo", categoria: "materiali" },
  { cerca: /nolegg|(^|_)nol[io](_|$)|trasport|ponteggi|gru(_|$)|mezz/, tipo: "costo", categoria: "noli" },
  { cerca: /sicurezz|(^|_)psc(_|$)|(^|_)dpi(_|$)/, tipo: "costo", categoria: "sicurezza" },
  { cerca: /costruz|ristruttur|edil|opere|cantier|lavori/, tipo: "costo", categoria: "costruzione" },
  { cerca: /spese_generali|generali|assicuraz|amministraz/, tipo: "costo", categoria: "generali" },
  // Acconti e caparre sono ricavi solo se la riga dice già che è un'entrata (un acconto può essere a un fornitore).
  { cerca: /caparr|accont|anticip/, tipo: "ricavo", categoria: "vendite", soloColTipo: true },
];

/**
 * La categoria più probabile di una riga scritta da una persona (incolla da Excel):
 * prima il nome esatto di una categoria, poi gli indizi nel testo. Col tipo già noto
 * si cercano solo le categorie di quel tipo; senza indizi, «Altri costi» / «Altri ricavi».
 */
export function indovinaCategoria(testo: string, tipo: TipoVoce | null = null): { tipo: TipoVoce; categoria: CategoriaPiano; sicura: boolean } {
  const t = normalizzaCategoria(testo);
  const esatta = Object.values(CATEGORIE_PIANO).find(
    (c) => (tipo === null || c.tipo === tipo) && (normalizzaCategoria(c.nome) === t || c.id === t),
  );
  if (esatta) return { tipo: esatta.tipo, categoria: esatta.id, sicura: true };
  const indizio = INDIZI.find((i) => (i.soloColTipo ? i.tipo === tipo : tipo === null || i.tipo === tipo) && i.cerca.test(t));
  if (indizio) return { tipo: indizio.tipo, categoria: indizio.categoria, sicura: true };
  const finale: TipoVoce = tipo ?? "costo";
  return { tipo: finale, categoria: finale === "ricavo" ? "altri_ricavi" : "altri_costi", sicura: false };
}
