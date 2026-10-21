/**
 * cg-export-pacchetto-banca
 *
 * Genera un PDF unificato (A4) con:
 * 1. Copertina (denominazione, P.IVA, anno) — con l'avviso «DATI PROVVISORI»
 *    quando lo Stato patrimoniale non quadra o il rating non è validato
 * 2. Conto Economico Riclassificato (anno scelto)
 * 3. Confronto CE 4 anni (corrente + 3 storici quando disponibili)
 * 4. Stato Patrimoniale Riclassificato
 * 5. Indici per la banca (giorni di incasso/pagamento, Z-score, DSCR)
 * 6. Rating bancario con indicatori e punteggi
 * 7. Piano Industriale (scenario base)
 *
 * I dati si leggono CON L'UTENTE che chiede il pacchetto (client col suo
 * token, RPC *_safe): azienda effettiva (anche in accesso multi-azienda),
 * modulo attivo e controllo di accesso sono quelli delle schede. Prima le
 * RPC erano chiamate col service role: il controllo «azienda diversa dalla
 * mia» non aveva un utente e rispondeva «Accesso negato», quindi il pacchetto
 * non si generava mai (cg_exports_log vuota al 22/10/2026).
 *
 * Salvataggio in `controllo-gestione-exports/<company_id>/...pdf` (bucket privato)
 * + log in `cg_exports_log` + signed URL 1h ritornato al client.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

interface VoceCE { codice: string; label: string; tipo: string; valore: number; pct_pil?: number; }
interface CEResp { meta: { anno: number; }; voci: VoceCE[]; }
interface SPResp {
  meta: { anno: number; data_riferimento: string; };
  attivo: { attivo_fisso: number; attivo_circolante: number; totale: number; rimanenze: number; crediti_clienti: number; liquidita_immediate: number; };
  passivo: { mezzi_propri: number; capitale_sociale: number; riserve: number; utile_esercizio: number; rettifica_patrimoniale: number; pas_consolidato: number; pas_corrente: number; debiti_fornitori: number; totale: number; };
  quadratura: { differenza: number; quadrato: boolean; };
}
interface RTResp {
  attendibile?: boolean; motivi?: string[];
  classe: string; livello: string; score: number;
  indicatori: Array<{ codice: string; label: string; valore: number | null; calcolabile?: boolean; punteggio: number; soglia_top: number; }>;
}
interface IndiciResp {
  rotazione: { dso_giorni: number | null; dpo_giorni: number | null; dsi_giorni: number | null; ccc_giorni: number | null; };
  altman: { z_score: number | null; classe: string | null; };
  dscr: { valore: number | null; classe: string; };
}
interface PianoResp {
  meta: { scenario: string; orizzonte: number; anno_base: number; base_stimata_fine_anno?: boolean; };
  periodi: Array<{ anno: number; tipo: string; ricavi: number; ebitda: number; utile: number; rating_classe?: string; rating_score?: number; }>;
}

const NAVY = rgb(30 / 255, 58 / 255, 95 / 255);
const ORANGE = rgb(249 / 255, 115 / 255, 22 / 255);
const RED = rgb(185 / 255, 28 / 255, 28 / 255);
const TEXT = rgb(17 / 255, 24 / 255, 39 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const LIGHT = rgb(243 / 255, 244 / 255, 246 / 255);
const WHITE = rgb(1, 1, 1);

const fmtEur = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
};

const fmtDec = (n: number | null | undefined, dec = 2): string => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(n));
};

const fmtPct = (n: number | null | undefined, dec = 1): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${fmtDec(Number(n) * 100, dec)}%`;

const fmtGiorni = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "non calcolabile" : `${Math.round(Number(n))} giorni`;

const NOMI_INDICATORI: Record<string, string> = {
  liquidita: "Liquidità (attivo circolante / passività correnti)",
  indipendenza: "Indipendenza finanziaria (mezzi propri / passivo)",
  oneri_finanziari: "Peso degli oneri finanziari sul fatturato",
  cashflow: "Flusso di cassa (utile + ammortamenti) / attivo",
};
const INDICATORI_PERCENTUALI = new Set(["indipendenza", "oneri_finanziari", "cashflow"]);

// Rimuove i caratteri fuori WinAnsi (le StandardFonts non li codificano):
// un solo carattere fuori set (spunte, simboli matematici, emoji) fa lanciare
// drawText e fallire l'intero export.
function winAnsiSafe(str: string): string {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…€]/g, "");
}

// Difesa in profondità: ogni drawText della pagina passa da winAnsiSafe, così
// nessun carattere futuro fuori set può far fallire la generazione del PDF.
function patchDrawTextSafe(page: PDFPage): PDFPage {
  const raw = page.drawText.bind(page);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.drawText = ((text: string, opts?: any) => raw(winAnsiSafe(text), opts)) as typeof page.drawText;
  return page;
}

interface DrawCtx {
  pdf: PDFDocument;
  fontReg: PDFFont;
  fontBold: PDFFont;
  anno: number;
  companyName: string;
  companyVAT: string;
  pageNum: { v: number };
  provvisorio: boolean;
}

function drawHeader(page: PDFPage, ctx: DrawCtx, title: string) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 50, width, height: 50, color: ctx.provvisorio ? RED : NAVY });
  page.drawText(ctx.provvisorio ? "BOZZA - DATI PROVVISORI" : "PACCHETTO BANCA", { x: 50, y: height - 30, size: 14, font: ctx.fontBold, color: WHITE });
  page.drawText("CONTROLLO DI GESTIONE", { x: 50, y: height - 44, size: 9, font: ctx.fontReg, color: rgb(0.95, 0.7, 0.4) });
  const w = ctx.fontReg.widthOfTextAtSize(ctx.companyName, 9);
  page.drawText(ctx.companyName, { x: width - 50 - w, y: height - 30, size: 9, font: ctx.fontReg, color: WHITE });
  page.drawText(title.toUpperCase(), { x: 50, y: height - 75, size: 18, font: ctx.fontBold, color: NAVY });
  page.drawLine({ start: { x: 50, y: height - 85 }, end: { x: width - 50, y: height - 85 }, thickness: 0.5, color: ORANGE });
}

function drawFooter(page: PDFPage, ctx: DrawCtx) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 50, y: 50 }, end: { x: width - 50, y: 50 }, thickness: 0.5, color: MUTED });
  page.drawText(`Generato il ${new Date().toLocaleDateString("it-IT")} - ${ctx.companyName}${ctx.companyVAT ? ` - P.IVA ${ctx.companyVAT}` : ""}`,
    { x: 50, y: 35, size: 8, font: ctx.fontReg, color: MUTED });
  const txt = `Pagina ${ctx.pageNum.v}`;
  const w = ctx.fontReg.widthOfTextAtSize(txt, 8);
  page.drawText(txt, { x: width - 50 - w, y: 35, size: 8, font: ctx.fontReg, color: MUTED });
}

function newPage(ctx: DrawCtx, title: string): { page: PDFPage; y: number } {
  const page = patchDrawTextSafe(ctx.pdf.addPage([595, 842]));
  ctx.pageNum.v += 1;
  drawHeader(page, ctx, title);
  drawFooter(page, ctx);
  return { page, y: 740 };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = winAnsiSafe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCover(ctx: DrawCtx, avvisi: string[]) {
  const page = patchDrawTextSafe(ctx.pdf.addPage([595, 842]));
  ctx.pageNum.v += 1;
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: NAVY });
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 200, color: ORANGE });
  page.drawText("PACCHETTO BANCA", { x: 50, y: 640, size: 36, font: ctx.fontBold, color: WHITE });
  page.drawText(`Esercizio ${ctx.anno}`, { x: 50, y: 600, size: 16, font: ctx.fontReg, color: rgb(0.95, 0.7, 0.4) });
  // Nomi azienda lunghi: font ridotto + slice di sicurezza per restare nel foglio
  const coverName = ctx.companyName.length > 60 ? ctx.companyName.slice(0, 59) + "…" : ctx.companyName;
  const coverNameSize = ctx.companyName.length > 40 ? 16 : 22;
  page.drawText(coverName, { x: 50, y: 540, size: coverNameSize, font: ctx.fontBold, color: WHITE });
  if (ctx.companyVAT) page.drawText(`P.IVA ${ctx.companyVAT}`, { x: 50, y: 518, size: 12, font: ctx.fontReg, color: WHITE });

  if (ctx.provvisorio) {
    // Un pacchetto con bilancio non quadrato non deve sembrare definitivo.
    const lines = avvisi.flatMap((a) => wrap(a, ctx.fontReg, 10, 455));
    const boxH = 70 + lines.length * 13;
    const top = 480;
    page.drawRectangle({ x: 40, y: top - boxH, width: 515, height: boxH, color: WHITE });
    page.drawRectangle({ x: 40, y: top - 28, width: 515, height: 28, color: RED });
    page.drawText("DATI PROVVISORI - NON CONSEGNARE ALLA BANCA", { x: 55, y: top - 19, size: 13, font: ctx.fontBold, color: WHITE });
    let y = top - 46;
    for (const l of lines) {
      page.drawText(l, { x: 55, y, size: 10, font: ctx.fontReg, color: TEXT });
      y -= 13;
    }
    page.drawText("Sistema i dati in Controllo di gestione > Health-check e genera di nuovo il pacchetto.",
      { x: 55, y: y - 6, size: 9, font: ctx.fontBold, color: RED });
  }

  page.drawText(`Generato il ${new Date().toLocaleDateString("it-IT")}`, { x: 50, y: 100, size: 10, font: ctx.fontReg, color: NAVY });
  page.drawText("Edilizia in Cloud - Controllo di gestione", { x: 50, y: 80, size: 9, font: ctx.fontBold, color: NAVY });
}

function drawCETable(ctx: DrawCtx, ce: CEResp) {
  let { page, y } = newPage(ctx, "Conto Economico Riclassificato");
  page.drawText(`Esercizio ${ce.meta.anno}`, { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
  y -= 24;
  page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Voce", { x: 50, y, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Importo", { x: 420, y, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("% ricavi", { x: 490, y, size: 9, font: ctx.fontBold, color: WHITE });
  y -= 22;

  for (const v of ce.voci) {
    const isSubtot = v.tipo === "subtot" || v.tipo === "subtot_grasso";
    const isGrosso = v.tipo === "subtot_grasso";
    const font = isSubtot ? ctx.fontBold : ctx.fontReg;
    if (isGrosso) page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 16, color: LIGHT });
    page.drawText(v.label.length > 60 ? v.label.slice(0, 60) + "…" : v.label, { x: 50, y, size: 9, font, color: TEXT });
    const importo = fmtEur(v.valore);
    const w = font.widthOfTextAtSize(importo, 9);
    page.drawText(importo, { x: 470 - w, y, size: 9, font, color: TEXT });
    if (v.pct_pil != null) page.drawText(`${fmtDec(v.pct_pil, 1)}%`, { x: 490, y, size: 9, font, color: TEXT });
    y -= isGrosso ? 17 : 13;
    if (y < 90) {
      const next = newPage(ctx, "Conto Economico (segue)");
      page = next.page; y = next.y;
    }
  }
}

function drawCEHistory(ctx: DrawCtx, anni: Array<CEResp | null>) {
  const { page, y } = newPage(ctx, "Confronto pluriennale");
  const validi = anni.filter((a): a is CEResp => !!a && Array.isArray(a.voci));
  if (validi.length === 0) {
    page.drawText("Storico non disponibile per gli anni precedenti.", { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
    return;
  }

  const labelChiave: Array<[string, string]> = [
    ["01", "Ricavi delle vendite"],
    ["E",  "Margine operativo lordo (EBITDA)"],
    ["F",  "Risultato operativo (EBIT)"],
    ["L",  "Utile netto"],
  ];

  let cursorY = y;
  page.drawRectangle({ x: 40, y: cursorY - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Voce", { x: 50, y: cursorY, size: 9, font: ctx.fontBold, color: WHITE });
  const colRight = (i: number) => 300 + i * 82;
  validi.forEach((a, i) => {
    const t = String(a.meta.anno);
    page.drawText(t, { x: colRight(i) - ctx.fontBold.widthOfTextAtSize(t, 9), y: cursorY, size: 9, font: ctx.fontBold, color: WHITE });
  });
  cursorY -= 22;

  for (const [codice, label] of labelChiave) {
    page.drawText(label, { x: 50, y: cursorY, size: 9, font: ctx.fontReg, color: TEXT });
    validi.forEach((a, i) => {
      const v = a.voci.find((vv) => vv.codice === codice)?.valore ?? 0;
      const t = fmtEur(v);
      page.drawText(t, { x: colRight(i) - ctx.fontReg.widthOfTextAtSize(t, 9), y: cursorY, size: 9, font: ctx.fontReg, color: TEXT });
    });
    cursorY -= 14;
  }
  page.drawText(`L'anno ${ctx.anno} comprende i dati registrati fino alla data di generazione.`,
    { x: 50, y: cursorY - 10, size: 8, font: ctx.fontReg, color: MUTED });
}

function drawSPColumns(ctx: DrawCtx, sp: SPResp) {
  const { page, y } = newPage(ctx, "Stato Patrimoniale Riclassificato");
  page.drawText(`Esercizio ${sp.meta.anno} - situazione al ${new Date(sp.meta.data_riferimento).toLocaleDateString("it-IT")}`,
    { x: 50, y, size: 10, font: ctx.fontReg, color: MUTED });

  const startY = y - 30;
  page.drawRectangle({ x: 40, y: startY - 4, width: 250, height: 18, color: NAVY });
  page.drawText("ATTIVO (IMPIEGHI)", { x: 50, y: startY, size: 10, font: ctx.fontBold, color: WHITE });

  const rowsAttivo: Array<[string, number, boolean]> = [
    ["Attivo fisso", sp.attivo.attivo_fisso, true],
    ["Attivo circolante", sp.attivo.attivo_circolante, true],
    ["  di cui rimanenze", sp.attivo.rimanenze, false],
    ["  di cui crediti verso clienti", sp.attivo.crediti_clienti, false],
    ["  di cui liquidità", sp.attivo.liquidita_immediate, false],
    ["TOTALE ATTIVO", sp.attivo.totale, true],
  ];
  let yAttivo = startY - 24;
  for (const [label, val, bold] of rowsAttivo) {
    const f = bold ? ctx.fontBold : ctx.fontReg;
    page.drawText(label, { x: 50, y: yAttivo, size: 9, font: f, color: TEXT });
    const t = fmtEur(val);
    page.drawText(t, { x: 285 - f.widthOfTextAtSize(t, 9), y: yAttivo, size: 9, font: f, color: TEXT });
    yAttivo -= 14;
  }

  page.drawRectangle({ x: 305, y: startY - 4, width: 250, height: 18, color: NAVY });
  page.drawText("PASSIVO (FONTI)", { x: 315, y: startY, size: 10, font: ctx.fontBold, color: WHITE });

  const rowsPassivo: Array<[string, number, boolean]> = [
    ["Mezzi propri", sp.passivo.mezzi_propri, true],
    ["  di cui capitale sociale", sp.passivo.capitale_sociale, false],
    ["  di cui riserve", sp.passivo.riserve, false],
    ["  di cui utile dell'esercizio", sp.passivo.utile_esercizio, false],
    ["  di cui rettifiche di raccordo", sp.passivo.rettifica_patrimoniale ?? 0, false],
    ["Debiti a medio-lungo termine", sp.passivo.pas_consolidato, true],
    ["Debiti a breve termine", sp.passivo.pas_corrente, true],
    ["TOTALE PASSIVO", sp.passivo.totale, true],
  ];
  let yPassivo = startY - 24;
  for (const [label, val, bold] of rowsPassivo) {
    const f = bold ? ctx.fontBold : ctx.fontReg;
    page.drawText(label, { x: 315, y: yPassivo, size: 9, font: f, color: TEXT });
    const t = fmtEur(val);
    page.drawText(t, { x: 550 - f.widthOfTextAtSize(t, 9), y: yPassivo, size: 9, font: f, color: TEXT });
    yPassivo -= 14;
  }

  const yQuad = Math.min(yAttivo, yPassivo) - 24;
  if (sp.quadratura.quadrato) {
    page.drawText("Attivo e passivo coincidono: lo Stato patrimoniale quadra.", { x: 50, y: yQuad, size: 10, font: ctx.fontBold, color: rgb(0.06, 0.6, 0.31) });
  } else {
    page.drawText(`ATTENZIONE: attivo e passivo differiscono di ${fmtEur(sp.quadratura.differenza)}. Dati da riconciliare.`,
      { x: 50, y: yQuad, size: 10, font: ctx.fontBold, color: RED });
  }
}

function drawIndici(ctx: DrawCtx, ind: IndiciResp | null) {
  const { page, y } = newPage(ctx, "Indici per la banca");
  if (!ind) {
    page.drawText("Indici non disponibili.", { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
    return;
  }
  const classiZ: Record<string, string> = { safe: "area di sicurezza", grey: "area grigia", distress: "area di rischio" };
  const righe: Array<[string, string]> = [
    ["Giorni medi di incasso dai clienti (DSO)", fmtGiorni(ind.rotazione.dso_giorni)],
    ["Giorni medi di pagamento ai fornitori (DPO)", fmtGiorni(ind.rotazione.dpo_giorni)],
    ["Giorni medi di magazzino (DSI)", fmtGiorni(ind.rotazione.dsi_giorni)],
    ["Ciclo del capitale circolante (CCC)", fmtGiorni(ind.rotazione.ccc_giorni)],
    ["Z-score di Altman", ind.altman.z_score === null ? "non calcolabile"
      : `${fmtDec(ind.altman.z_score)} (${classiZ[ind.altman.classe ?? ""] ?? "-"})`],
    ["Copertura delle rate (DSCR)", ind.dscr.valore === null ? "nessun mutuo attivo" : `${fmtDec(ind.dscr.valore)} volte`],
  ];
  let yy = y - 10;
  page.drawRectangle({ x: 40, y: yy - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Indicatore", { x: 50, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Valore", { x: 400, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  yy -= 22;
  for (const [l, v] of righe) {
    page.drawText(l, { x: 50, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(v, { x: 400, y: yy, size: 9, font: ctx.fontBold, color: TEXT });
    yy -= 16;
  }
  page.drawText("Z-score: sopra 2,90 sicurezza, sotto 1,23 rischio. DSCR: sopra 1,20 le rate sono coperte dal flusso di cassa.",
    { x: 50, y: yy - 8, size: 8, font: ctx.fontReg, color: MUTED });
}

function drawRatingPage(ctx: DrawCtx, rt: RTResp) {
  const ok = rt.attendibile === true;
  const { page, y } = newPage(ctx, ok ? "Valutazione interna" : "Valutazione interna PROVVISORIA");

  page.drawRectangle({ x: 40, y: y - 70, width: 515, height: 60, color: LIGHT });
  page.drawText(ok ? rt.classe : "NON VALIDATA", { x: 60, y: y - 52, size: ok ? 32 : 16, font: ctx.fontBold, color: ok ? NAVY : RED });
  page.drawText(ok ? `Punteggio ${rt.score}/100` : `Stima indicativa ${rt.classe} (${rt.score}/100): riconciliare i dati prima dell'uso`,
    { x: ok ? 170 : 200, y: y - 45, size: 10, font: ctx.fontReg, color: TEXT });

  let yy = y - 100;
  page.drawRectangle({ x: 40, y: yy - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Indicatore", { x: 50, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Valore", { x: 340, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Obiettivo", { x: 405, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Punti", { x: 490, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  yy -= 22;

  for (const i of rt.indicatori) {
    const perc = INDICATORI_PERCENTUALI.has(i.codice);
    const calcolabile = i.calcolabile !== false && i.valore !== null;
    const valore = !calcolabile ? "—" : perc ? fmtPct(i.valore) : fmtDec(i.valore);
    const soglia = (i.codice === "oneri_finanziari" ? "fino a " : "da ") + (perc ? fmtPct(i.soglia_top) : fmtDec(i.soglia_top));
    page.drawText(NOMI_INDICATORI[i.codice] ?? i.label, { x: 50, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(valore, { x: 340, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(soglia, { x: 405, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(`${i.punteggio}/25`, { x: 490, y: yy, size: 9, font: ctx.fontBold, color: TEXT });
    yy -= 16;
  }

  for (const m of rt.motivi ?? []) {
    for (const l of wrap(m, ctx.fontReg, 9, 495)) {
      yy -= 12;
      page.drawText(l, { x: 50, y: yy, size: 9, font: ctx.fontReg, color: RED });
    }
  }
}

function drawPiano(ctx: DrawCtx, piano: PianoResp | null) {
  const { page, y } = newPage(ctx, "Piano Industriale");
  if (!piano || !Array.isArray(piano.periodi)) {
    page.drawText("Piano industriale non disponibile: nessuno scenario configurato.", { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
    return;
  }
  const scen: Record<string, string> = { prudente: "prudente", base: "base", aggressivo: "aggressivo", custom: "personalizzato" };
  page.drawText(`Scenario ${scen[piano.meta.scenario] ?? piano.meta.scenario} - ${piano.meta.orizzonte} anni - anno di partenza ${piano.meta.anno_base}${piano.meta.base_stimata_fine_anno ? " (stimato a fine anno)" : ""}`,
    { x: 50, y, size: 10, font: ctx.fontReg, color: MUTED });

  let yy = y - 24;
  page.drawRectangle({ x: 40, y: yy - 4, width: 515, height: 18, color: NAVY });
  const head: Array<[string, number]> = [["Anno", 50], ["Tipo", 90], ["Ricavi", 250], ["EBITDA", 340], ["Utile", 430], ["Rating", 470]];
  for (const [t, x] of head) page.drawText(t, { x: t === "Anno" || t === "Tipo" || t === "Rating" ? x : x - ctx.fontBold.widthOfTextAtSize(t, 9), y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  yy -= 22;

  for (const p of piano.periodi) {
    const tipo = p.tipo === "consuntivo" ? (piano.meta.base_stimata_fine_anno ? "Stima fine anno" : "Consuntivo") : "Proiezione";
    page.drawText(String(p.anno), { x: 50, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(tipo, { x: 90, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    for (const [v, x] of [[p.ricavi, 250], [p.ebitda, 340], [p.utile, 430]] as Array<[number, number]>) {
      const t = fmtEur(v);
      page.drawText(t, { x: x - ctx.fontReg.widthOfTextAtSize(t, 9), y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    }
    page.drawText(p.rating_classe ?? "—", { x: 470, y: yy, size: 9, font: ctx.fontBold, color: TEXT });
    yy -= 14;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const corsH = getCorsHeaders(req);

  try {
    const { supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));
    const annoCorrente = new Date().getFullYear();
    const anno: number = typeof body.anno === "number" && Number.isInteger(body.anno) && body.anno >= 2000 && body.anno <= annoCorrente
      ? body.anno
      : annoCorrente;

    // Client con il token dell'utente: get_my_company_id() risolve l'azienda
    // effettiva e le RPC *_safe controllano modulo e accessi come nelle schede.
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = userClient.rpc.bind(userClient) as any;

    const { data: companyId, error: companyErr } = await rpc("get_my_company_id");
    if (companyErr || !companyId) return errorResponse("Nessuna azienda associata al tuo utente", 400, corsH);

    const ceArgs = (a: number) => ({ p_anno: a, p_mese_da: 1, p_mese_a: 12, p_modalita: "consuntivo" });
    const [ceCorr, cePrec, cePrec2, cePrec3, sp, rating, indici, piano] = await Promise.all([
      rpc("cg_get_ce_safe", ceArgs(anno)),
      rpc("cg_get_ce_safe", ceArgs(anno - 1)),
      rpc("cg_get_ce_safe", ceArgs(anno - 2)),
      rpc("cg_get_ce_safe", ceArgs(anno - 3)),
      rpc("cg_get_sp_safe", { p_anno: anno }),
      rpc("cg_get_rating_safe", { p_anno: anno }),
      rpc("cg_get_indici_avanzati_safe", { p_anno: anno }),
      // Senza scenari il piano risponde con un errore: il pacchetto esce lo stesso.
      rpc("cg_simula_piano_safe", {}),
    ]);

    const errore = ceCorr.error ?? sp.error ?? rating.error;
    if (errore) {
      return errorResponse(`Dati del controllo di gestione non disponibili: ${errore.message}`, 400, corsH);
    }

    const spData = sp.data as SPResp;
    const rtData = rating.data as RTResp;
    const avvisi: string[] = [];
    if (!spData.quadratura?.quadrato) {
      avvisi.push(`Lo Stato patrimoniale non quadra: attivo e passivo differiscono di ${fmtEur(spData.quadratura?.differenza)}.`);
    }
    if (rtData.attendibile !== true) {
      avvisi.push(`Il rating ${rtData.classe} (${rtData.score}/100) è una stima interna non validata.`);
    }
    const provvisorio = avvisi.length > 0;

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("business_name, vat_number")
      .eq("id", companyId)
      .maybeSingle();

    const pdf = await PDFDocument.create();
    const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ctx: DrawCtx = {
      pdf, fontReg, fontBold, anno,
      // Sanitizzati alla fonte: drawHeader/drawFooter li passano anche a
      // widthOfTextAtSize, che lancia sugli stessi caratteri non-WinAnsi.
      companyName: winAnsiSafe((company?.business_name as string) || "Azienda"),
      companyVAT: winAnsiSafe((company?.vat_number as string) || ""),
      pageNum: { v: 0 },
      provvisorio,
    };

    drawCover(ctx, avvisi);
    drawCETable(ctx, ceCorr.data as CEResp);
    drawCEHistory(ctx, [
      cePrec3.error ? null : cePrec3.data as CEResp,
      cePrec2.error ? null : cePrec2.data as CEResp,
      cePrec.error ? null : cePrec.data as CEResp,
      ceCorr.data as CEResp,
    ]);
    drawSPColumns(ctx, spData);
    drawIndici(ctx, indici.error ? null : indici.data as IndiciResp);
    drawRatingPage(ctx, rtData);
    drawPiano(ctx, piano.error ? null : piano.data as PianoResp);

    const bytes = await pdf.save();
    const filename = `pacchetto-banca-${anno}-${Date.now()}.pdf`;
    const path = `${companyId}/${filename}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("controllo-gestione-exports")
      .upload(path, bytes, { contentType: "application/pdf", cacheControl: "3600" });
    if (upErr) return errorResponse(`Salvataggio del PDF non riuscito: ${upErr.message}`, 500, corsH);

    const { data: signed } = await supabaseAdmin.storage
      .from("controllo-gestione-exports")
      .createSignedUrl(path, 3600);

    await supabaseAdmin.from("cg_exports_log").insert({
      company_id: companyId,
      tipo: "pacchetto_banca",
      anno,
      file_path: path,
      pdf_size_bytes: bytes.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        signed_url: signed?.signedUrl ?? null,
        path,
        size: bytes.length,
        provvisorio,
        avvisi,
      }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return errorResponse(msg, 500, corsH);
  }
});
