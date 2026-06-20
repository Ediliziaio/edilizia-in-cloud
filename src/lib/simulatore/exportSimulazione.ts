/**
 * exportSimulazione — export Excel (ExcelJS) di una simulazione contratto.
 *
 * Due fogli:
 *  - "Voci": una sezione per fase (se presenti) + le voci senza fase, con riga
 *    di totale per sezione e riga di totale generale. Colonne: Descrizione, Q.tà,
 *    UM, Costo unit., Ricarico %, Prezzo unit., IVA %, Totale.
 *  - "Riepilogo": KPI (costo/ricavo/margine valore+%/imponibile/IVA totale/prezzo
 *    cliente/durata/rata), riepilogo IVA per aliquota e dati finanziamento (se
 *    configurato).
 *
 * Mirror del pattern `src/lib/controlloGestione/exportXlsx.ts`: lazy import di
 * ExcelJS (lib pesante caricata on-demand), `neutralizeXlsxCell` sulle celle di
 * testo (anti formula-injection), download via Blob + anchor (il progetto NON usa
 * file-saver).
 */
import { neutralizeXlsxCell } from "@/lib/csvExport";
import { calcolaVoce } from "./calcoli";
import type { SimulazioneDoc, SimulazioneRisultato, VoceSim } from "./tipi";

const FMT_EUR = '#,##0.00 "€"';
const FMT_PCT = '0.00 "%"';
const FMT_QTY = "#,##0.###";

const HEAD_FILL = "FF1F2937";
const HEAD_TEXT = "FFFFFFFF";
const SUBTOT_FILL = "FFF3F4F6";
const TOTAL_FILL = "FFDBEAFE";
const MUTED = "FF6B7280";

const VOCI_HEADERS = [
  "Descrizione",
  "Q.tà",
  "UM",
  "Costo unit.",
  "Ricarico %",
  "Prezzo unit.",
  "IVA %",
  "Totale",
] as const;

// Slugifica il nome per un filename sicuro (mantiene leggibilità).
function safeFileName(nome: string): string {
  const base = (nome || "simulazione").trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
  return `${base || "simulazione"}.xlsx`;
}

/**
 * exportSimulazioneXlsx — genera e scarica il file Excel della simulazione.
 */
export async function exportSimulazioneXlsx(
  doc: SimulazioneDoc,
  risultato: SimulazioneRisultato,
  nome: string,
): Promise<void> {
  // Lazy import: la lib ExcelJS è caricata on-demand (mirror di exportXlsx.ts).
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Edilizia In Cloud";
  wb.created = new Date();
  wb.title = nome || "Simulazione contratto";

  buildVociSheet(wb, doc, nome);
  buildRiepilogoSheet(wb, doc, risultato, nome);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(nome);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Foglio "Voci" ────────────────────────────────────────────────────────────

interface ExcelJSWorkbook {
  addWorksheet(name: string): ExcelJSWorksheet;
}
// Tipi minimi locali per ExcelJS (la lib è lazy-import senza tipi statici qui).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcelJSWorksheet = any;

function buildVociSheet(wb: ExcelJSWorkbook, doc: SimulazioneDoc, nome: string): void {
  const ws = wb.addWorksheet("Voci");
  ws.columns = [
    { width: 44 }, { width: 10 }, { width: 8 }, { width: 14 },
    { width: 12 }, { width: 14 }, { width: 9 }, { width: 16 },
  ];

  let rowIdx = 1;

  // Titolo documento.
  const titleRow = ws.getRow(rowIdx++);
  titleRow.getCell(1).value = neutralizeXlsxCell(nome || "Simulazione contratto");
  titleRow.getCell(1).font = { size: 14, bold: true, color: { argb: "FF1F2937" } };
  ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, VOCI_HEADERS.length);
  rowIdx++; // separatore

  // Intestazione colonne.
  const headerRow = ws.getRow(rowIdx++);
  VOCI_HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: HEAD_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    cell.alignment = { horizontal: i === 0 || i === 2 ? "left" : "right" };
  });

  // Raggruppamento per fase: ordine fasi + "Senza fase" alla fine.
  const fasiOrdinate = [...doc.fasi].sort((a, b) => a.ordine - b.ordine);
  const sezioni: { titolo: string | null; voci: VoceSim[] }[] = [];
  for (const fase of fasiOrdinate) {
    const vociFase = doc.voci.filter((v) => v.fase_id === fase.id);
    if (vociFase.length > 0) sezioni.push({ titolo: fase.nome, voci: vociFase });
  }
  const fasiIds = new Set(doc.fasi.map((f) => f.id));
  const senzaFase = doc.voci.filter((v) => !v.fase_id || !fasiIds.has(v.fase_id));
  if (senzaFase.length > 0) {
    sezioni.push({ titolo: sezioni.length > 0 ? "Senza fase" : null, voci: senzaFase });
  }

  let totGenerale = 0;

  for (const sez of sezioni) {
    // Intestazione di sezione (solo se c'è un raggruppamento per fase reale).
    if (sez.titolo) {
      const r = ws.getRow(rowIdx++);
      r.getCell(1).value = neutralizeXlsxCell(sez.titolo);
      r.getCell(1).font = { bold: true, color: { argb: "FF1F2937" } };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOT_FILL } };
      ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, VOCI_HEADERS.length);
    }

    let totSez = 0;
    for (const v of sez.voci) {
      const { imponibile_ricavo } = calcolaVoce(v);
      totSez += imponibile_ricavo;
      const r = ws.getRow(rowIdx++);
      setCellText(r.getCell(1), v.descrizione || "—");
      setCellNum(r.getCell(2), v.quantita, FMT_QTY);
      setCellText(r.getCell(3), v.unita || "", "center");
      setCellNum(r.getCell(4), v.costo_unitario, FMT_EUR);
      setCellNum(r.getCell(5), v.ricarico_pct, FMT_PCT);
      setCellNum(r.getCell(6), v.prezzo_unitario, FMT_EUR);
      setCellNum(r.getCell(7), v.vat_rate, FMT_PCT);
      setCellNum(r.getCell(8), imponibile_ricavo, FMT_EUR);
    }
    totGenerale += totSez;

    // Subtotale sezione (solo se sezione titolata).
    if (sez.titolo) {
      const r = ws.getRow(rowIdx++);
      setCellText(r.getCell(1), `Subtotale ${sez.titolo}`);
      const cell = r.getCell(8);
      setCellNum(cell, round2(totSez), FMT_EUR);
      for (let c = 1; c <= VOCI_HEADERS.length; c++) {
        r.getCell(c).font = { bold: true };
        r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOT_FILL } };
      }
    }
  }

  // Riga totale generale.
  rowIdx++;
  const totRow = ws.getRow(rowIdx++);
  setCellText(totRow.getCell(1), "TOTALE IMPONIBILE");
  setCellNum(totRow.getCell(8), round2(totGenerale), FMT_EUR);
  for (let c = 1; c <= VOCI_HEADERS.length; c++) {
    totRow.getCell(c).font = { bold: true, size: 11 };
    totRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  }

  addFooter(ws, rowIdx + 1, VOCI_HEADERS.length);
}

// ─── Foglio "Riepilogo" ───────────────────────────────────────────────────────

function buildRiepilogoSheet(
  wb: ExcelJSWorkbook,
  doc: SimulazioneDoc,
  risultato: SimulazioneRisultato,
  nome: string,
): void {
  const ws = wb.addWorksheet("Riepilogo");
  ws.columns = [{ width: 32 }, { width: 20 }, { width: 16 }];

  let rowIdx = 1;

  const titleRow = ws.getRow(rowIdx++);
  titleRow.getCell(1).value = neutralizeXlsxCell(nome || "Simulazione contratto");
  titleRow.getCell(1).font = { size: 14, bold: true, color: { argb: "FF1F2937" } };
  ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, 3);
  rowIdx++;

  // ── KPI ──────────────────────────────────────────────────────────────────
  rowIdx = sectionTitle(ws, rowIdx, "Indicatori");
  const kpi: [string, number, string][] = [
    ["Costo totale", risultato.costo_totale, FMT_EUR],
    ["Ricavo imponibile", risultato.ricavo_imponibile, FMT_EUR],
    ["Margine (valore)", risultato.margine_valore, FMT_EUR],
    ["Margine (%)", risultato.margine_pct, FMT_PCT],
    ["IVA totale", risultato.iva_totale, FMT_EUR],
    ["Prezzo cliente", risultato.prezzo_cliente, FMT_EUR],
    ["Durata (settimane)", risultato.durata_settimane, FMT_QTY],
  ];
  for (const [label, value, fmt] of kpi) {
    const r = ws.getRow(rowIdx++);
    setCellText(r.getCell(1), label);
    setCellNum(r.getCell(2), value, fmt);
  }
  if (risultato.rata_mensile != null) {
    const r = ws.getRow(rowIdx++);
    setCellText(r.getCell(1), "Rata mensile");
    setCellNum(r.getCell(2), risultato.rata_mensile, FMT_EUR);
  }
  rowIdx++;

  // ── Riepilogo IVA per aliquota ─────────────────────────────────────────────
  rowIdx = sectionTitle(ws, rowIdx, "Riepilogo IVA");
  const ivaHead = ws.getRow(rowIdx++);
  ["Aliquota", "Imponibile", "Imposta"].forEach((h, i) => {
    const cell = ivaHead.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: HEAD_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right" };
  });
  for (const riga of risultato.riepilogo_iva) {
    const r = ws.getRow(rowIdx++);
    setCellNum(r.getCell(1), riga.aliquota, FMT_PCT, "left");
    setCellNum(r.getCell(2), riga.imponibile, FMT_EUR);
    setCellNum(r.getCell(3), riga.imposta, FMT_EUR);
  }
  const ivaTot = ws.getRow(rowIdx++);
  setCellText(ivaTot.getCell(1), "Totale");
  setCellNum(ivaTot.getCell(2), risultato.ricavo_imponibile, FMT_EUR);
  setCellNum(ivaTot.getCell(3), risultato.iva_totale, FMT_EUR);
  for (let c = 1; c <= 3; c++) {
    ivaTot.getCell(c).font = { bold: true };
    ivaTot.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOT_FILL } };
  }
  rowIdx++;

  // ── Finanziamento (se configurato) ─────────────────────────────────────────
  const fin = doc.scenari.finanziamento;
  if (fin) {
    rowIdx = sectionTitle(ws, rowIdx, "Finanziamento");
    const finRows: [string, number, string][] = [
      ["Importo finanziato", fin.importo_finanziato, FMT_EUR],
      ["Anticipo", fin.anticipo, FMT_EUR],
      ["Numero rate", fin.numero_rate, FMT_QTY],
    ];
    for (const [label, value, fmt] of finRows) {
      const r = ws.getRow(rowIdx++);
      setCellText(r.getCell(1), label);
      setCellNum(r.getCell(2), value, fmt);
    }
    if (risultato.rata_mensile != null) {
      const r = ws.getRow(rowIdx++);
      setCellText(r.getCell(1), "Rata mensile");
      setCellNum(r.getCell(2), risultato.rata_mensile, FMT_EUR);
    }
    rowIdx++;
  }

  addFooter(ws, rowIdx, 3);
}

// ─── Helper di cella / sezione ────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function setCellText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cell: any,
  value: string,
  align: "left" | "right" | "center" = "left",
): void {
  cell.value = neutralizeXlsxCell(value);
  cell.alignment = { horizontal: align };
}

function setCellNum(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cell: any,
  value: number | null | undefined,
  numFmt: string,
  align: "left" | "right" = "right",
): void {
  cell.value = value === null || value === undefined ? null : Number(value);
  cell.numFmt = numFmt;
  cell.alignment = { horizontal: align };
}

function sectionTitle(ws: ExcelJSWorksheet, rowIdx: number, label: string): number {
  const r = ws.getRow(rowIdx);
  r.getCell(1).value = label;
  r.getCell(1).font = { size: 12, bold: true, color: { argb: "FF1F2937" } };
  return rowIdx + 1;
}

function addFooter(ws: ExcelJSWorksheet, rowIdx: number, span: number): void {
  const footer = ws.getRow(rowIdx);
  footer.getCell(1).value = `Generato il ${new Date().toLocaleString("it-IT")} · Edilizia In Cloud`;
  footer.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED } };
  ws.mergeCells(rowIdx, 1, rowIdx, span);
}
