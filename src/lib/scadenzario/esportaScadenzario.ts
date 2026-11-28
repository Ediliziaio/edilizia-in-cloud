/**
 * Esportazione dello Scadenzario in Excel e PDF.
 *
 * Il CSV grezzo non bastava per «le Ri.Ba. dei fornitori a fine mese»: il
 * titolare lavora su un foglio con Numero fattura, fornitore, importo,
 * cantiere e lavorazione, ordinato per fornitore e con i filtri sulle
 * intestazioni. Qui le righe si costruiscono una volta sola (funzioni pure) e
 * poi si scrivono in xlsx (exceljs, importi NUMERI veri, totali con SUBTOTAL
 * che seguono i filtri di Excel) o in PDF A4 orizzontale (jsPDF, senza
 * plugin: tabella disegnata a mano con testi che vanno a capo).
 *
 * La select che alimenta la funzione `carica` della pagina deve avere:
 *   `*, suppliers(name), invoices(invoice_number, client_company_name, issue_date),
 *    orders(order_code, description, indirizzo_lavori, client_name, client_company),
 *    company_costs(name, order_id, allocations, notes, documento_riferimento)`
 */
import type { Scadenza } from "@/hooks/useScadenzario";
import { controparteScadenza } from "@/hooks/useScadenzario";
import { commesseScadenza } from "@/lib/finance/commesseScadenza";
import { etichettaMetodo } from "@/lib/finance/metodoScadenza";
import { oggiIso, statoScadenza } from "@/lib/finance/collegamentiFinanza";
import { neutralizeCsvFormula } from "@/lib/csvExport";

export type OrdineExport = "data" | "controparte";
export type Tipo = "Incasso" | "Pagamento";

/** Campi in più che la select dell'export aggiunge a `Scadenza`. */
type OrdineEsteso = { order_code?: string | null; description?: string | null; indirizzo_lavori?: string | null };
type CostoEsteso = { name?: string | null; documento_riferimento?: string | null };
type ScadenzaExport = Omit<Scadenza, "commesse"> & {
  orders?: (NonNullable<Scadenza["orders"]> & OrdineEsteso) | null;
  company_costs?: (NonNullable<Scadenza["company_costs"]> & CostoEsteso) | null;
  commesse?: Array<{ id: string; codice: string; nome?: string | null }>;
  /** Numero della fattura ricevuta collegata al costo, aggiunto da chi carica le righe. */
  numero_fattura_ricevuta?: string | null;
  /** Note della scadenza, del costo e delle fatture ricevute (`noteFattureScadenze`), aggiunte da chi carica le righe. */
  note_export?: string | null;
};

export interface RigaExport {
  id: string;
  /** yyyy-MM-dd oppure "" se la scadenza non ha data. */
  data: string;
  numero: string;
  controparte: string;
  cantiere: string;
  lavorazione: string;
  modalita: string;
  importo: number;
  residuo: number;
  stato: string;
  tipo: Tipo;
  note: string;
}

export interface Gruppo {
  chiave: string;
  titolo: string;
  righe: RigaExport[];
}

export interface Totali {
  incassi: number;
  pagamenti: number;
  saldo: number;
  incassiResiduo: number;
  pagamentiResiduo: number;
  saldoResiduo: number;
}

export interface MetaExport {
  titolo: string;
  azienda?: string;
  periodo?: string;
  filtri: string[];
  ordine: OrdineExport;
  dataStampa?: Date;
}

const arrotonda = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const pulito = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

/** gg/mm/aaaa da yyyy-MM-dd, senza passare da Date (niente scarti di fuso). */
export function dataIt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** 1.234,56 € scritto a mano: Intl mette spazi non standard che jsPDF non disegna. */
export function eur(n: number): string {
  const v = arrotonda(n);
  const [intero, dec] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "-" : ""}${intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
}

export function costruisciRighe(scadenze: Scadenza[], oggi = oggiIso()): RigaExport[] {
  return (scadenze as unknown as ScadenzaExport[]).map((s) => {
    const entrata = s.direction === "entrata";
    const costo = s.company_costs;
    // Il numero della fattura ricevuta (fatture_ricevute.numero_fattura) c'è per circa 3 costi su 4;
    // documento_riferimento solo per 1 su 14, e scritto «Fattura 1153/26» (verificato il 28/11/2026).
    const numero = entrata ? s.invoices?.invoice_number
      : s.numero_fattura_ricevuta || pulito(costo?.documento_riferimento).replace(/^fattura\s+/i, "");
    const cantieri = s.commesse?.length
      ? s.commesse.map((c) => [c.codice, pulito(c.nome)].filter(Boolean).join(" ")).join(" · ")
      : [commesseScadenza(s as unknown as Scadenza), pulito(s.orders?.description || s.orders?.indirizzo_lavori)].filter(Boolean).join(" ");
    const importo = arrotonda(Number(s.amount));
    const residuo = s.status === "annullata" || s.status === "pagata" ? 0 : Math.max(0, arrotonda(importo - Number(s.paid_amount || 0)));
    return {
      id: s.id,
      data: s.due_date ?? "",
      numero: pulito(numero),
      controparte: pulito(controparteScadenza(s as unknown as Scadenza)),
      cantiere: pulito(cantieri),
      lavorazione: pulito(costo?.name || s.description),
      modalita: etichettaMetodo(s.payment_method) ?? "",
      importo,
      residuo,
      // Le stesse parole della colonna Stato della tabella, «Scaduta» compresa (prima il file
      // diceva «Da pagare» per una rata scaduta da mesi: collaudo sui dati veri, 28/11/2026).
      stato: statoScadenza(s as unknown as Scadenza, oggi).label,
      tipo: entrata ? "Incasso" : "Pagamento",
      note: pulito(s.note_export),
    };
  });
}

const cmp = (a: string, b: string) => a.localeCompare(b, "it", { sensitivity: "base", numeric: true });
const cmpData = (a: RigaExport, b: RigaExport) => (a.data || "9999").localeCompare(b.data || "9999");

export function ordinaRighe(righe: RigaExport[], ordine: OrdineExport): RigaExport[] {
  const copia = [...righe];
  copia.sort(ordine === "controparte"
    // Senza controparte in fondo. Prima si usava «~», ma localeCompare("it") mette la
    // punteggiatura prima delle lettere: 52 righe senza nome aprivano il PDF (28/11/2026).
    ? (a, b) => (Number(!a.controparte) - Number(!b.controparte)) || cmp(a.controparte, b.controparte) || cmpData(a, b) || cmp(a.numero, b.numero)
    : (a, b) => cmpData(a, b) || cmp(a.controparte, b.controparte) || cmp(a.numero, b.numero));
  return copia;
}

/** Per data → un gruppo per mese; per controparte → un gruppo per fornitore/cliente. */
export function raggruppaRighe(righe: RigaExport[], ordine: OrdineExport): Gruppo[] {
  const gruppi: Gruppo[] = [];
  const indice = new Map<string, Gruppo>();
  for (const r of ordinaRighe(righe, ordine)) {
    let chiave: string; let titolo: string;
    if (ordine === "controparte") {
      titolo = r.controparte || "Senza fornitore / cliente";
      chiave = titolo.toLowerCase();
    } else if (r.data) {
      chiave = r.data.slice(0, 7);
      titolo = `${MESI[Number(r.data.slice(5, 7)) - 1] ?? ""} ${r.data.slice(0, 4)}`.trim();
    } else { chiave = "senza-data"; titolo = "Senza data"; }
    let g = indice.get(chiave);
    if (!g) { g = { chiave, titolo, righe: [] }; indice.set(chiave, g); gruppi.push(g); }
    g.righe.push(r);
  }
  return gruppi;
}

export function calcolaTotali(righe: RigaExport[]): Totali {
  let incassi = 0, pagamenti = 0, incassiResiduo = 0, pagamentiResiduo = 0;
  for (const r of righe) {
    if (r.tipo === "Incasso") { incassi += r.importo; incassiResiduo += r.residuo; }
    else { pagamenti += r.importo; pagamentiResiduo += r.residuo; }
  }
  return {
    incassi: arrotonda(incassi), pagamenti: arrotonda(pagamenti), saldo: arrotonda(incassi - pagamenti),
    incassiResiduo: arrotonda(incassiResiduo), pagamentiResiduo: arrotonda(pagamentiResiduo),
    saldoResiduo: arrotonda(incassiResiduo - pagamentiResiduo),
  };
}

/** Anti formula-injection per le celle di testo (xlsx e csv). */
export const testoSicuro = (v: string) => neutralizeCsvFormula(v);

const SOSTITUTI: Record<string, string> = { "\u2212": "-", "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"', "\u2026": "...", "\u00A0": " ", "\u202F": " ", "\u2009": " " };
/** Sostituisce i caratteri che il font standard di jsPDF (WinAnsi) non ha. Unica per tutti i testi del PDF. */
export function testoPdf(v: string): string {
  return String(v).replace(/[^\x20-\xFF\u20AC\n\t]/g, (c) => SOSTITUTI[c] ?? "?").replace(/[\u00A0\u202F\u2009]/g, " ");
}

export const COLONNE_EXPORT = [
  { key: "data", label: "Scadenza", xlsx: 12, pdf: 20 },
  { key: "numero", label: "N. documento", xlsx: 18, pdf: 31 },
  { key: "controparte", label: "Fornitore / Cliente", xlsx: 32, pdf: 46 },
  { key: "cantiere", label: "Cantiere", xlsx: 30, pdf: 40 },
  { key: "lavorazione", label: "Lavorazione / Descrizione", xlsx: 40, pdf: 56 },
  { key: "modalita", label: "Modalità", xlsx: 14, pdf: 15 },
  { key: "importo", label: "Importo", xlsx: 14, pdf: 22 },
  { key: "residuo", label: "Residuo", xlsx: 14, pdf: 22 },
  { key: "stato", label: "Stato", xlsx: 14, pdf: 21 },
  { key: "tipo", label: "Tipo", xlsx: 11, pdf: 16 },
  // Spenta di serie (non è in colonneDiSerie): si accende dal dialog o con «Tutte».
  { key: "note", label: "Note", xlsx: 40, pdf: 60 },
] as const;

export type ChiaveExport = (typeof COLONNE_EXPORT)[number]["key"];
const DEF_EXPORT = new Map<string, (typeof COLONNE_EXPORT)[number]>(COLONNE_EXPORT.map((c) => [c.key, c]));
export type FormatoExport = "xlsx" | "pdf" | "csv";

/**
 * Le colonne di serie: tutte tranne «Note», che si accende a mano, e nel PDF senza «Tipo» (lì il verso lo dice il segno meno
 * dei pagamenti, come è sempre stato).
 */
export function colonneDiSerie(formato: FormatoExport): ChiaveExport[] {
  return COLONNE_EXPORT.filter((c) => c.key !== "note" && (formato !== "pdf" || c.key !== "tipo")).map((c) => c.key);
}

/** Toglie le chiavi sconosciute e i doppioni; se non resta niente, le colonne di serie. */
export function colonneValide(colonne: readonly string[] | undefined, formato: FormatoExport): ChiaveExport[] {
  const viste = new Set<string>();
  const ok = (colonne ?? []).filter((k): k is ChiaveExport => DEF_EXPORT.has(k) && !viste.has(k) && !!viste.add(k));
  return ok.length ? ok : colonneDiSerie(formato);
}

/**
 * Dalle colonne che la tabella ha in vista (chiavi di `DEF_SCADENZE`, nell'ordine) alle
 * colonne dell'export. «Documento · commessa» diventa due colonne (numero e cantiere),
 * «Descrizione» è la lavorazione. Senza niente in vista, tutte.
 */
export const DA_TABELLA_A_EXPORT: Record<string, ChiaveExport[]> = {
  scadenza: ["data"], tipo: ["tipo"], controparte: ["controparte"], descrizione: ["lavorazione"],
  documento: ["numero", "cantiere"], metodo: ["modalita"], importo: ["importo"], residuo: ["residuo"], stato: ["stato"],
};
export function colonneExportDaTabella(chiaviTabella: readonly string[] | undefined): ChiaveExport[] {
  const fuori: ChiaveExport[] = [];
  for (const k of chiaviTabella ?? []) for (const e of DA_TABELLA_A_EXPORT[k] ?? []) if (!fuori.includes(e)) fuori.push(e);
  return fuori.length ? fuori : colonneDiSerie("xlsx");
}

const testoFiltri = (m: MetaExport) => (m.filtri.length ? m.filtri.join(" · ") : "Nessun filtro");
const dataStampaIt = (m: MetaExport) => {
  const d = m.dataStampa ?? new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const cedi = () => new Promise<void>((ok) => setTimeout(ok, 0));

// ───────────────────────────── Excel ─────────────────────────────

export const RIGA_INTESTAZIONE_XLSX = 6;

const FORMATO_EURO = "#,##0.00 \"€\"";
const valoreTesto = (r: RigaExport, k: ChiaveExport) => String(r[k as Exclude<ChiaveExport, "importo" | "residuo">] ?? "");

export async function generaXlsx(righe: RigaExport[], meta: MetaExport, colonneScelte?: readonly string[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const chiavi = colonneValide(colonneScelte, "xlsx");
  const cols = chiavi.map((k) => DEF_EXPORT.get(k)!);
  const nCol = cols.length;
  const wb = new ExcelJS.Workbook();
  // I totali sono formule: se un totale vale 0 exceljs non salva il risultato e l'anteprima
  // del Mac mostrava la cella vuota. Così ogni programma li ricalcola all'apertura.
  wb.calcProperties.fullCalcOnLoad = true;
  wb.creator = meta.azienda || "Edilizia in Cloud";
  const ws = wb.addWorksheet("Scadenzario", {
    views: [{ state: "frozen", ySplit: RIGA_INTESTAZIONE_XLSX, xSplit: 0 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${RIGA_INTESTAZIONE_XLSX}:${RIGA_INTESTAZIONE_XLSX}` },
  });
  const colonnaDi = (k: ChiaveExport) => chiavi.indexOf(k) + 1; // 1-based, 0 se non scelta
  const nImporto = colonnaDi("importo"), nResiduo = colonnaDi("residuo");
  const colonneImporti = [nImporto, nResiduo].filter((n) => n > 0);
  const conTotali = colonneImporti.length > 0;

  // I totali separano incassi e pagamenti leggendo la colonna Tipo. Se chi esporta non l'ha
  // scelta la si scrive lo stesso, ma NASCOSTA e in coda: i totali restano formule vive (che
  // seguono i filtri di Excel) e il foglio mostra solo le colonne scelte. L'alternativa,
  // totali scritti come valori, avrebbe perso i filtri. Se manca Importo e Residuo non c'è
  // niente da sommare e i totali non si scrivono.
  let nTipo = colonnaDi("tipo");
  const tipoNascosto = conTotali && nTipo === 0;
  // L'etichetta dei totali sta nella colonna a sinistra della prima colonna di importi; se
  // gli importi aprono la tabella, nella prima colonna libera a destra; se la tabella è
  // fatta solo di importi, in una colonna in più.
  const primoImporto = Math.min(...colonneImporti);
  let nEtichetta = 0;
  if (conTotali) {
    for (let n = primoImporto - 1; n >= 1 && !nEtichetta; n--) if (!colonneImporti.includes(n)) nEtichetta = n;
    for (let n = 1; n <= nCol && !nEtichetta; n++) if (!colonneImporti.includes(n)) nEtichetta = n;
    if (!nEtichetta) nEtichetta = nCol + 1;
  }
  if (tipoNascosto) nTipo = Math.max(nCol, nEtichetta) + 1;
  const nColonneTotali = Math.max(nCol, nEtichetta, tipoNascosto ? nTipo : 0);
  ws.columns = Array.from({ length: nColonneTotali }, (_, i) => {
    const c = cols[i];
    const eTipoNascosto = tipoNascosto && i + 1 === nTipo;
    return { key: c?.key ?? (eTipoNascosto ? "tipo" : `extra${i}`), width: c?.xlsx ?? (eTipoNascosto ? 11 : 30), hidden: eTipoNascosto };
  });
  const lettera = (n: number) => ws.getColumn(n).letter;

  const titolo = ws.getRow(1);
  titolo.getCell(1).value = testoSicuro(meta.titolo);
  titolo.getCell(1).font = { bold: true, size: 15 };
  ws.getRow(2).getCell(1).value = testoSicuro(meta.azienda || "");
  ws.getRow(2).getCell(1).font = { bold: true, size: 11 };
  ws.getRow(3).getCell(1).value = testoSicuro(`Periodo: ${meta.periodo || "tutte le date"} · Ordinato per ${meta.ordine === "controparte" ? "fornitore / cliente" : "data"}`);
  ws.getRow(4).getCell(1).value = testoSicuro(`Filtri: ${testoFiltri(meta)}`);
  ws.getRow(5).getCell(1).value = `Stampato il ${dataStampaIt(meta)} · ${righe.length} scadenze`;
  for (const n of [3, 4, 5]) ws.getRow(n).getCell(1).font = { size: 10, color: { argb: "FF555555" } };

  const stileTesta = (cell: import("exceljs").Cell, etichetta: string, destra: boolean) => {
    cell.value = etichetta;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: destra ? "right" : "left", wrapText: true };
  };
  const head = ws.getRow(RIGA_INTESTAZIONE_XLSX);
  cols.forEach((c, i) => stileTesta(head.getCell(i + 1), c.label, c.key === "importo" || c.key === "residuo"));
  if (tipoNascosto) stileTesta(head.getCell(nTipo), "Tipo", false);
  head.height = 22;

  const ordinate = ordinaRighe(righe, meta.ordine);
  const primo = RIGA_INTESTAZIONE_XLSX + 1;
  ordinate.forEach((r, k) => {
    const row = ws.getRow(primo + k);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.key === "data") {
        const [y, m, d] = r.data ? r.data.slice(0, 10).split("-").map(Number) : [0, 0, 0];
        cell.value = r.data ? new Date(Date.UTC(y, m - 1, d)) : null;
        cell.numFmt = "dd/mm/yyyy";
        cell.alignment = { horizontal: "left" };
      } else if (c.key === "importo" || c.key === "residuo") {
        cell.value = r[c.key];
        cell.numFmt = FORMATO_EURO;
      } else if (c.key === "tipo") cell.value = r.tipo;
      else cell.value = testoSicuro(valoreTesto(r, c.key));
    });
    if (tipoNascosto) row.getCell(nTipo).value = r.tipo;
  });
  const ultimo = primo + ordinate.length - 1;
  if (ordinate.length) ws.autoFilter = { from: { row: RIGA_INTESTAZIONE_XLSX, column: 1 }, to: { row: ultimo, column: nCol } };

  // Totali sotto la tabella. SUBTOTAL(109) salta le righe filtrate; per
  // separare incassi e pagamenti serve SUMPRODUCT + OFFSET (il trucco classico
  // per sommare «solo il visibile» con una condizione).
  const t = calcolaTotali(righe);
  const sepIniziale = ultimo + 2;
  const lTipo = conTotali ? lettera(nTipo) : "";
  const colonne = [{ c: nImporto, k: "importo" as const }, { c: nResiduo, k: "residuo" as const }].filter((x) => x.c > 0).map((x) => ({ ...x, l: lettera(x.c) }));
  const condizionale = (c: string, tipo: Tipo) =>
    `SUMPRODUCT(SUBTOTAL(109,OFFSET(${c}$${primo},ROW(${c}$${primo}:${c}$${ultimo})-ROW(${c}$${primo}),0,1)),--(${lTipo}$${primo}:${lTipo}$${ultimo}="${tipo}"))`;
  const blocchi: Array<{ etichetta: string; formula: (c: string) => string; valore: (k: "importo" | "residuo") => number }> = [
    // Niente «totale» unico: incassi e pagamenti sommati insieme non dicono niente (revisione 28/11/2026).
    // Gli importi restano positivi come nel foglio Ri.Ba. del titolare; il verso sta nella colonna Tipo.
    { etichetta: "Totale incassi (righe visibili)", formula: (c) => condizionale(c, "Incasso"), valore: (k) => (k === "importo" ? t.incassi : t.incassiResiduo) },
    { etichetta: "Totale pagamenti (righe visibili)", formula: (c) => condizionale(c, "Pagamento"), valore: (k) => (k === "importo" ? t.pagamenti : t.pagamentiResiduo) },
  ];
  if (ordinate.length && conTotali) {
    blocchi.forEach((b, i) => {
      const row = ws.getRow(sepIniziale + i);
      row.getCell(nEtichetta).value = b.etichetta;
      row.getCell(nEtichetta).font = { bold: true };
      row.getCell(nEtichetta).alignment = { horizontal: "right" };
      for (const col of colonne) {
        const cell = row.getCell(col.c);
        cell.value = { formula: b.formula(col.l), result: b.valore(col.k) };
        cell.numFmt = FORMATO_EURO;
        cell.font = { bold: true };
        cell.border = i === 0 ? { top: { style: "thin" } } : undefined;
      }
    });
    const rs = sepIniziale + blocchi.length;
    const row = ws.getRow(rs);
    row.getCell(nEtichetta).value = "Saldo (incassi − pagamenti)";
    row.getCell(nEtichetta).font = { bold: true };
    row.getCell(nEtichetta).alignment = { horizontal: "right" };
    for (const col of colonne) {
      const cell = row.getCell(col.c);
      cell.value = { formula: `${col.l}${sepIniziale}-${col.l}${sepIniziale + 1}`, result: col.k === "importo" ? t.saldo : t.saldoResiduo };
      cell.numFmt = FORMATO_EURO;
      cell.font = { bold: true };
      cell.border = { top: { style: "double" } };
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Righe di totale: una sola se il gruppo ha una direzione, altrimenti incassi, pagamenti e saldo. */
export function vociTotale(t: Totali, etichetta: string, sempreDivisi = false): Array<[string, number, number, boolean]> {
  const inc = t.incassi !== 0 || t.incassiResiduo !== 0, pag = t.pagamenti !== 0 || t.pagamentiResiduo !== 0;
  if (inc && pag || sempreDivisi) return [
    [`${etichetta} incassi`, t.incassi, t.incassiResiduo, false],
    [`${etichetta} pagamenti`, -t.pagamenti, -t.pagamentiResiduo, false],
    [`${etichetta} saldo`, t.saldo, t.saldoResiduo, true],
  ];
  return pag ? [[etichetta, -t.pagamenti, -t.pagamentiResiduo, false]] : [[etichetta, t.incassi, t.incassiResiduo, false]];
}

// ─────────────────────────────── PDF ───────────────────────────────

export async function generaPdf(righe: RigaExport[], meta: MetaExport, colonneScelte?: readonly string[]): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const testo0 = doc.text.bind(doc) as (t: string | string[], ...a: unknown[]) => unknown;
  const split0 = doc.splitTextToSize.bind(doc) as (t: string, ...a: unknown[]) => string[];
  const sani = (t: string | string[]) => (Array.isArray(t) ? t.map(testoPdf) : testoPdf(t));
  (doc as unknown as { text: unknown }).text = (t: string | string[], ...a: unknown[]) => testo0(sani(t), ...a);
  (doc as unknown as { splitTextToSize: unknown }).splitTextToSize = (t: string, ...a: unknown[]) => split0(testoPdf(t), ...a);
  const W = 297, H = 210, M = 10, bottom = H - 14;
  // Le larghezze di base sono proporzioni: si ridistribuiscono sulla pagina (W - 2M), così con
  // poche colonne non restano buchi e con tutte non si sborda.
  const scelte = colonneValide(colonneScelte, "pdf").map((k) => DEF_EXPORT.get(k)!);
  const somma = scelte.reduce((a, c) => a + c.pdf, 0);
  const cols = scelte.map((c) => ({ ...c, pdf: (c.pdf * (W - 2 * M)) / somma }));
  const xs: number[] = []; let x = M;
  for (const c of cols) { xs.push(x); x += c.pdf; }
  const xFine = x;
  const iImporto = cols.findIndex((c) => c.key === "importo");
  const iResiduo = cols.findIndex((c) => c.key === "residuo");
  const iPrimoImporto = [iImporto, iResiduo].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
  const conTotali = iPrimoImporto >= 0;
  const LINEA = 3.3;
  let y = 0;
  const nero = (n = 0) => doc.setTextColor(n, n, n);

  const intestazionePagina = (prima: boolean) => {
    if (prima) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); nero();
      doc.text(meta.titolo, M, 15);
      doc.setFontSize(10); doc.text(meta.azienda || "", M, 21);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); nero(80);
      doc.text(`Periodo: ${meta.periodo || "tutte le date"} · ordinato per ${meta.ordine === "controparte" ? "fornitore / cliente" : "data"}`, M, 26);
      const filtri = doc.splitTextToSize(`Filtri: ${testoFiltri(meta)}`, W - 2 * M - 50) as string[];
      doc.text(filtri.slice(0, 3), M, 30.5);
      doc.text(`Stampato il ${dataStampaIt(meta)}`, W - M, 15, { align: "right" });
      doc.text(`${righe.length} scadenze`, W - M, 20, { align: "right" });
      y = 30.5 + Math.min(filtri.length, 3) * 3.8 + 2;
    } else { y = M + 2; }
    // intestazione tabella
    doc.setFillColor(31, 58, 95); doc.rect(M, y, xFine - M, 6.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    cols.forEach((c, i) => {
      const dx = c.key === "importo" || c.key === "residuo" ? xs[i] + c.pdf - 1.5 : xs[i] + 1.5;
      doc.text(c.label, dx, y + 4.4, { align: c.key === "importo" || c.key === "residuo" ? "right" : "left" });
    });
    nero(); y += 6.5;
  };
  const nuovaPagina = () => { doc.addPage(); intestazionePagina(false); };
  const serve = (h: number) => { if (y + h > bottom) nuovaPagina(); };

  // Anche se a sinistra c'è poco spazio (l'etichetta uscirebbe dal margine) va sopra.
  const etichettaSopra = (etichetta: string, forte: boolean) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(forte ? 8.5 : 7.5);
    return iPrimoImporto === 0 || doc.getTextWidth(etichetta) > xs[iPrimoImporto] - 2 - M - 1.5;
  };
  /** Quanto spazio prendono i subtotali: lo stesso conto di rigaTotale. */
  const altezzaTotali = (voci: ReturnType<typeof vociTotale>) =>
    voci.reduce((somma, [et, , , forte]) => somma + (etichettaSopra(et, forte) ? 11.2 : 5.6), 0);
  const rigaTotale = (etichetta: string, imp: number, res: number, forte: boolean) => {
    if (!conTotali) return; // senza Importo né Residuo non c'è niente da sommare
    // Se gli importi aprono la tabella non c'è posto a sinistra per l'etichetta: va sopra.
    const sopra = etichettaSopra(etichetta, forte);
    doc.setFont("helvetica", "bold"); doc.setFontSize(forte ? 8.5 : 7.5);
    serve(sopra ? 11.2 : 6);
    if (forte) { doc.setFillColor(230, 236, 245); doc.rect(M, y, xFine - M, sopra ? 11.2 : 5.6, "F"); }
    if (sopra) { doc.text(etichetta, M + 1.5, y + 4); y += 5.6; }
    else doc.text(etichetta, xs[iPrimoImporto] - 2, y + 4, { align: "right" });
    if (iImporto >= 0) doc.text(eur(imp), xs[iImporto] + cols[iImporto].pdf - 1.5, y + 4, { align: "right" });
    if (iResiduo >= 0) doc.text(eur(res), xs[iResiduo] + cols[iResiduo].pdf - 1.5, y + 4, { align: "right" });
    y += 5.6;
  };

  intestazionePagina(true);
  doc.setFontSize(7.5);
  const gruppi = raggruppaRighe(righe, meta.ordine);
  let contatore = 0;
  for (const g of gruppi) {
    const subtotali = conTotali ? vociTotale(calcolaTotali(g.righe), `Subtotale ${g.titolo}`) : [];
    const spazioSubtotali = altezzaTotali(subtotali);
    const celleDi = (r: RigaExport) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      const celle: string[][] = cols.map((c) => {
        const v = c.key === "data" ? dataIt(r.data) : c.key === "importo" ? eur(r.tipo === "Pagamento" ? -r.importo : r.importo) : c.key === "residuo" ? eur(r.tipo === "Pagamento" ? -r.residuo : r.residuo) : valoreTesto(r, c.key);
        return doc.splitTextToSize(v, c.pdf - 3, { fontSize: 7.5 }) as string[];
      });
      return { celle, h: Math.max(1, ...celle.map((c) => c.length)) * LINEA + 1.6 };
    };
    // L'intestazione del mese non resta da sola in fondo alla pagina: con sé porta la prima
    // riga e, se il mese ha una riga sola, anche i subtotali (revisione R5, 28/11/2026).
    const prima = celleDi(g.righe[0]);
    serve(5.6 + prima.h + (g.righe.length === 1 ? spazioSubtotali : 0));
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); nero();
    doc.setFillColor(238, 241, 246); doc.rect(M, y, xFine - M, 5.6, "F");
    doc.text(`${g.titolo} (${g.righe.length})`, M + 1.5, y + 4);
    y += 5.6;
    for (const [k, r] of g.righe.entries()) {
      const { celle, h } = k === 0 ? prima : celleDi(r);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      // L'ultima riga del mese va in pagina insieme al suo subtotale: prima il subtotale
      // poteva finire da solo in cima alla pagina dopo (collaudo sui dati veri, 28/11/2026).
      serve(k === g.righe.length - 1 ? h + spazioSubtotali : h);
      celle.forEach((testo, i) => {
        const c = cols[i];
        const dx = i === iImporto || i === iResiduo ? xs[i] + c.pdf - 1.5 : xs[i] + 1.5;
        doc.text(testo, dx, y + 3.3, { align: i === iImporto || i === iResiduo ? "right" : "left" });
      });
      doc.setDrawColor(215); doc.setLineWidth(0.1); doc.line(M, y + h, xFine, y + h);
      y += h;
      if (++contatore % 300 === 0) await cedi();
    }
    for (const [et, a, b, forte] of subtotali) rigaTotale(et, a, b, forte);
    y += 1.5;
  }

  const t = calcolaTotali(righe);
  if (conTotali) {
    serve(34);
    y += 2;
    for (const [et, a, b] of vociTotale(t, "Totale", true)) rigaTotale(et, a, b, true);
  }

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); nero(110);
    doc.text(`${meta.titolo}${meta.azienda ? ` · ${meta.azienda}` : ""}`, M, H - 6);
    doc.text(`Pagina ${p} di ${n}`, W - M, H - 6, { align: "right" });
  }
  return doc.output("arraybuffer");
}

// ───────────────────────────── CSV / download ─────────────────────────────

/** Le colonne del CSV: quelle scelte, più «Tipo» in coda se manca (gli importi sono positivi: il verso lo dice lui). */
const chiaviCsv = (colonneScelte?: readonly string[]): ChiaveExport[] => {
  const k = colonneValide(colonneScelte, "csv");
  return k.includes("tipo") ? k : [...k, "tipo"];
};

/** Righe per il CSV: solo le colonne scelte, nell'ordine scelto (le chiavi seguono `colonne`). */
export const righeCsv = (righe: RigaExport[], colonneScelte?: readonly string[]) => {
  const chiavi = chiaviCsv(colonneScelte);
  return righe.map((r) => {
    const o: Record<string, string> = {};
    for (const k of chiavi) o[k] = k === "importo" || k === "residuo" ? String(r[k]).replace(".", ",") : valoreTesto(r, k);
    return o;
  });
};

/** Le colonne per `exportToCSV`, nell'ordine scelto. */
export const intestazioniCsv = (colonneScelte?: readonly string[]) =>
  chiaviCsv(colonneScelte).map((k) => ({ key: k, label: DEF_EXPORT.get(k)!.label }));

export function scaricaBuffer(buffer: ArrayBuffer, nomeFile: string, mime: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = nomeFile;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MIME_PDF = "application/pdf";

/**
 * La parte «periodo» del nome file: l'anno intero (o nessun intervallo) è `2026`, un periodo
 * dentro un mese `2026-03`, un periodo su più mesi `2026-03-05_2026-06-30`.
 */
/** «Edilmateriali Roma S.r.l.» → «edilmateriali-roma-srl»: un pezzo di nome file leggibile. */
export function pezzoNomeFile(testo: string | null | undefined): string {
  return (testo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

export function periodoNomeFile(range: { from: string | null; to: string | null } | null | undefined, anno: string): string {
  const da = range?.from?.slice(0, 10) ?? "", a = range?.to?.slice(0, 10) ?? "";
  if (!da && !a) return anno === "all" ? "tutte" : anno;
  if (da && a) {
    if (da.slice(0, 4) === a.slice(0, 4) && da.slice(5) === "01-01" && a.slice(5) === "12-31") return da.slice(0, 4);
    if (da.slice(0, 7) === a.slice(0, 7)) return da.slice(0, 7);
    return `${da}_${a}`;
  }
  return da || a;
}
