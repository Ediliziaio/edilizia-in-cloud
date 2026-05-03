/**
 * cg-export-pacchetto-banca
 *
 * Genera un PDF unificato (A4, brand EdiliziaInCloud) con:
 * 1. Copertina (denominazione, P.IVA, anno)
 * 2. Conto Economico Riclassificato (anno corrente)
 * 3. Confronto CE 4 anni (corrente + 3 storici quando disponibili)
 * 4. Stato Patrimoniale Riclassificato
 * 5. Indicatori e Rating Bancario
 * 6. Piano Industriale 5 anni
 * 7. Insight critici (se disponibili)
 *
 * Salvataggio in `controllo-gestione-exports/<company_id>/...pdf` (bucket privato)
 * + log in `cg_exports_log` + signed URL 1h ritornato al client.
 */

import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

interface VoceCE { codice: string; label: string; tipo: string; valore: number; pct_pil?: number; }
interface CEResp { meta: { anno: number; }; voci: VoceCE[]; }
interface SPResp {
  meta: { anno: number; data_riferimento: string; };
  attivo: { attivo_fisso: number; attivo_circolante: number; totale: number; rimanenze: number; crediti_clienti: number; liquidita_immediate: number; };
  passivo: { mezzi_propri: number; capitale_sociale: number; riserve: number; utile_esercizio: number; pas_consolidato: number; pas_corrente: number; debiti_fornitori: number; totale: number; };
  quadratura: { differenza: number; quadrato: boolean; };
}
interface RTResp {
  classe: string; livello: string; score: number;
  indicatori: Array<{ codice: string; label: string; valore: number; punteggio: number; soglia_top: number; }>;
}
interface PianoResp {
  meta: { scenario: string; orizzonte: number; anno_base: number; };
  periodi: Array<{ anno: number; tipo: string; ricavi: number; ebitda: number; utile: number; rating_classe?: string; rating_score?: number; }>;
}

const NAVY = rgb(30 / 255, 58 / 255, 95 / 255);
const ORANGE = rgb(249 / 255, 115 / 255, 22 / 255);
const TEXT = rgb(17 / 255, 24 / 255, 39 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const LIGHT = rgb(243 / 255, 244 / 255, 246 / 255);
const WHITE = rgb(1, 1, 1);

const fmtEur = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(v);
};

interface DrawCtx {
  pdf: PDFDocument;
  fontReg: PDFFont;
  fontBold: PDFFont;
  anno: number;
  companyName: string;
  companyVAT: string;
  pageNum: { v: number };
}

function drawHeader(page: PDFPage, ctx: DrawCtx, title: string) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 50, width, height: 50, color: NAVY });
  page.drawText("EDILIZIA IN CLOUD", { x: 50, y: height - 30, size: 14, font: ctx.fontBold, color: WHITE });
  page.drawText("CONTROLLO DI GESTIONE", { x: 50, y: height - 44, size: 9, font: ctx.fontReg, color: rgb(0.95, 0.7, 0.4) });
  const w = ctx.fontReg.widthOfTextAtSize(ctx.companyName, 9);
  page.drawText(ctx.companyName, { x: width - 50 - w, y: height - 30, size: 9, font: ctx.fontReg, color: WHITE });
  page.drawText(title.toUpperCase(), { x: 50, y: height - 75, size: 18, font: ctx.fontBold, color: NAVY });
  page.drawLine({ start: { x: 50, y: height - 85 }, end: { x: width - 50, y: height - 85 }, thickness: 0.5, color: ORANGE });
}

function drawFooter(page: PDFPage, ctx: DrawCtx) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 50, y: 50 }, end: { x: width - 50, y: 50 }, thickness: 0.5, color: MUTED });
  page.drawText(`Generato il ${new Date().toLocaleDateString("it-IT")} · ${ctx.companyName}${ctx.companyVAT ? ` · ${ctx.companyVAT}` : ""}`,
    { x: 50, y: 35, size: 8, font: ctx.fontReg, color: MUTED });
  const txt = `Pagina ${ctx.pageNum.v}`;
  const w = ctx.fontReg.widthOfTextAtSize(txt, 8);
  page.drawText(txt, { x: width - 50 - w, y: 35, size: 8, font: ctx.fontReg, color: MUTED });
}

function newPage(ctx: DrawCtx, title: string): { page: PDFPage; y: number } {
  const page = ctx.pdf.addPage([595, 842]);
  ctx.pageNum.v += 1;
  drawHeader(page, ctx, title);
  drawFooter(page, ctx);
  return { page, y: 740 };
}

function drawCover(ctx: DrawCtx) {
  const page = ctx.pdf.addPage([595, 842]);
  ctx.pageNum.v += 1;
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: NAVY });
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 200, color: ORANGE });
  page.drawText("PACCHETTO BANCA", { x: 50, y: 600, size: 36, font: ctx.fontBold, color: WHITE });
  page.drawText(`Esercizio ${ctx.anno}`, { x: 50, y: 560, size: 16, font: ctx.fontReg, color: rgb(0.95, 0.7, 0.4) });
  page.drawText(ctx.companyName, { x: 50, y: 480, size: 22, font: ctx.fontBold, color: WHITE });
  if (ctx.companyVAT) page.drawText(`P.IVA ${ctx.companyVAT}`, { x: 50, y: 460, size: 12, font: ctx.fontReg, color: WHITE });
  page.drawText(`Generato il ${new Date().toLocaleDateString("it-IT")}`, { x: 50, y: 100, size: 10, font: ctx.fontReg, color: NAVY });
  page.drawText("EDILIZIA IN CLOUD · CONTROLLO DI GESTIONE", { x: 50, y: 80, size: 9, font: ctx.fontBold, color: NAVY });
}

function drawCETable(ctx: DrawCtx, ce: CEResp) {
  let { page, y } = newPage(ctx, "Conto Economico Riclassificato");
  page.drawText(`Esercizio ${ce.meta.anno}`, { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
  y -= 24;
  page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Cod", { x: 50, y, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Voce", { x: 80, y, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Importo", { x: 380, y, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("% PIL", { x: 480, y, size: 9, font: ctx.fontBold, color: WHITE });
  y -= 22;

  for (const v of ce.voci) {
    const isSubtot = v.tipo === "subtot" || v.tipo === "subtot_grasso";
    const isGrosso = v.tipo === "subtot_grasso";
    const font = isSubtot ? ctx.fontBold : ctx.fontReg;
    if (isGrosso) page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 16, color: LIGHT });
    page.drawText(v.codice, { x: 50, y, size: 9, font, color: TEXT });
    page.drawText(v.label.length > 50 ? v.label.slice(0, 50) + "…" : v.label, { x: 80, y, size: 9, font, color: TEXT });
    const importo = fmtEur(v.valore);
    const w = font.widthOfTextAtSize(importo, 9);
    page.drawText(importo, { x: 470 - w, y, size: 9, font, color: TEXT });
    if (v.pct_pil != null) page.drawText(`${v.pct_pil.toFixed(1)}%`, { x: 480, y, size: 9, font, color: TEXT });
    y -= isGrosso ? 17 : 13;
    if (y < 90) {
      const next = newPage(ctx, "Conto Economico (segue)");
      page = next.page; y = next.y;
    }
  }
}

function drawCEHistory(ctx: DrawCtx, anni: Array<CEResp | null>) {
  const { page, y } = newPage(ctx, "Confronto Multi-Anno");
  const validi = anni.filter((a): a is CEResp => !!a);
  if (validi.length === 0) {
    page.drawText("Storico non disponibile per gli anni precedenti.",
      { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
    return;
  }

  const labelChiave: Array<[string, string]> = [
    ["01", "Ricavi delle vendite"],
    ["A",  "Prodotto Interno Lordo"],
    ["E",  "MOL / EBITDA"],
    ["F",  "EBIT"],
    ["L",  "Utile di bilancio"],
  ];

  let cursorY = y;
  page.drawRectangle({ x: 40, y: cursorY - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Voce chiave", { x: 50, y: cursorY, size: 9, font: ctx.fontBold, color: WHITE });
  let xa = 240;
  for (const a of validi) {
    page.drawText(String(a.meta.anno), { x: xa, y: cursorY, size: 9, font: ctx.fontBold, color: WHITE });
    xa += 80;
  }
  cursorY -= 22;

  for (const [codice, label] of labelChiave) {
    page.drawText(label, { x: 50, y: cursorY, size: 9, font: ctx.fontReg, color: TEXT });
    let x = 240;
    for (const a of validi) {
      const v = a.voci.find((vv) => vv.codice === codice)?.valore ?? 0;
      page.drawText(fmtEur(v), { x, y: cursorY, size: 9, font: ctx.fontReg, color: TEXT });
      x += 80;
    }
    cursorY -= 14;
  }
}

function drawSPColumns(ctx: DrawCtx, sp: SPResp) {
  const { page, y } = newPage(ctx, "Stato Patrimoniale Riclassificato");
  page.drawText(`Esercizio ${sp.meta.anno} · al ${new Date(sp.meta.data_riferimento).toLocaleDateString("it-IT")}`,
    { x: 50, y, size: 10, font: ctx.fontReg, color: MUTED });

  const startY = y - 30;

  // Colonna ATTIVO
  page.drawRectangle({ x: 40, y: startY - 4, width: 250, height: 18, color: NAVY });
  page.drawText("ATTIVO (IMPIEGHI)", { x: 50, y: startY, size: 10, font: ctx.fontBold, color: WHITE });

  const rowsAttivo: Array<[string, number, boolean]> = [
    ["Attivo Fisso", sp.attivo.attivo_fisso, true],
    ["  di cui Rimanenze", sp.attivo.rimanenze, false],
    ["  di cui Crediti vs Clienti", sp.attivo.crediti_clienti, false],
    ["  di cui Liquidità Immediate", sp.attivo.liquidita_immediate, false],
    ["Attivo Circolante", sp.attivo.attivo_circolante, true],
    ["TOTALE ATTIVO", sp.attivo.totale, true],
  ];
  let yAttivo = startY - 24;
  for (const [label, val, bold] of rowsAttivo) {
    page.drawText(label, { x: 50, y: yAttivo, size: 9, font: bold ? ctx.fontBold : ctx.fontReg, color: TEXT });
    page.drawText(fmtEur(val), { x: 220, y: yAttivo, size: 9, font: bold ? ctx.fontBold : ctx.fontReg, color: TEXT });
    yAttivo -= 14;
  }

  // Colonna PASSIVO
  page.drawRectangle({ x: 305, y: startY - 4, width: 250, height: 18, color: NAVY });
  page.drawText("PASSIVO (FONTI)", { x: 315, y: startY, size: 10, font: ctx.fontBold, color: WHITE });

  const rowsPassivo: Array<[string, number, boolean]> = [
    ["Mezzi Propri", sp.passivo.mezzi_propri, true],
    ["  di cui Capitale Sociale", sp.passivo.capitale_sociale, false],
    ["  di cui Riserve", sp.passivo.riserve, false],
    ["  di cui Utile Esercizio", sp.passivo.utile_esercizio, false],
    ["Passivo Consolidato", sp.passivo.pas_consolidato, true],
    ["Passivo Corrente", sp.passivo.pas_corrente, true],
    ["TOTALE PASSIVO", sp.passivo.totale, true],
  ];
  let yPassivo = startY - 24;
  for (const [label, val, bold] of rowsPassivo) {
    page.drawText(label, { x: 315, y: yPassivo, size: 9, font: bold ? ctx.fontBold : ctx.fontReg, color: TEXT });
    page.drawText(fmtEur(val), { x: 485, y: yPassivo, size: 9, font: bold ? ctx.fontBold : ctx.fontReg, color: TEXT });
    yPassivo -= 14;
  }

  const yQuad = Math.min(yAttivo, yPassivo) - 24;
  if (sp.quadratura.quadrato) {
    page.drawText("✓ Stato Patrimoniale quadrato", { x: 50, y: yQuad, size: 10, font: ctx.fontBold, color: rgb(0.06, 0.6, 0.31) });
  } else {
    page.drawText(`Differenza Attivo-Passivo: ${fmtEur(sp.quadratura.differenza)}`,
      { x: 50, y: yQuad, size: 10, font: ctx.fontBold, color: ORANGE });
  }
}

function drawRatingPage(ctx: DrawCtx, rt: RTResp) {
  const { page, y } = newPage(ctx, "Rating Bancario");
  page.drawText(`Classe: ${rt.classe} · Score ${rt.score}/100 · Livello ${rt.livello}`,
    { x: 50, y, size: 12, font: ctx.fontBold, color: NAVY });

  // Box gauge stilizzato
  page.drawRectangle({ x: 40, y: y - 80, width: 515, height: 60, color: LIGHT });
  page.drawText(rt.classe, { x: 60, y: y - 60, size: 32, font: ctx.fontBold, color: NAVY });
  page.drawText(`Score ${rt.score}/100 — Livello: ${rt.livello.replace("_", " ")}`,
    { x: 150, y: y - 50, size: 10, font: ctx.fontReg, color: TEXT });

  // Tabella indicatori
  let yy = y - 110;
  page.drawRectangle({ x: 40, y: yy - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Indicatore", { x: 50, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Valore", { x: 320, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Soglia top", { x: 400, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Punteggio", { x: 480, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  yy -= 22;

  for (const i of rt.indicatori) {
    page.drawText(i.label.length > 45 ? i.label.slice(0, 45) + "…" : i.label,
      { x: 50, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(String(i.valore), { x: 320, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(String(i.soglia_top), { x: 400, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(`${i.punteggio}/25`, { x: 480, y: yy, size: 9, font: ctx.fontBold, color: TEXT });
    yy -= 16;
  }
}

function drawPiano(ctx: DrawCtx, piano: PianoResp | null) {
  const { page, y } = newPage(ctx, "Piano Industriale");
  if (!piano) {
    page.drawText("Piano Industriale non disponibile (nessuna assumption salvata).",
      { x: 50, y, size: 11, font: ctx.fontReg, color: MUTED });
    return;
  }
  page.drawText(`Scenario: ${piano.meta.scenario} · Orizzonte ${piano.meta.orizzonte} anni · Base ${piano.meta.anno_base}`,
    { x: 50, y, size: 10, font: ctx.fontReg, color: MUTED });

  let yy = y - 24;
  page.drawRectangle({ x: 40, y: yy - 4, width: 515, height: 18, color: NAVY });
  page.drawText("Anno", { x: 50, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Tipo", { x: 100, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Ricavi", { x: 170, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("EBITDA", { x: 270, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Utile", { x: 360, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  page.drawText("Rating", { x: 450, y: yy, size: 9, font: ctx.fontBold, color: WHITE });
  yy -= 22;

  for (const p of piano.periodi) {
    page.drawText(String(p.anno), { x: 50, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(p.tipo, { x: 100, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(fmtEur(p.ricavi), { x: 170, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(fmtEur(p.ebitda), { x: 270, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(fmtEur(p.utile), { x: 360, y: yy, size: 9, font: ctx.fontReg, color: TEXT });
    page.drawText(p.rating_classe ?? "—", { x: 450, y: yy, size: 9, font: ctx.fontBold, color: TEXT });
    yy -= 14;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));
    const anno: number = typeof body.anno === "number" ? body.anno : new Date().getFullYear();

    // Risolvi company
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = prof?.company_id as string | undefined;
    if (!companyId) return errorResponse("Profilo senza company_id", 400, corsH);

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("business_name, vat_number")
      .eq("id", companyId)
      .maybeSingle();

    // Carica tutti i dati in parallelo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = supabaseAdmin.rpc as any;
    const [ceCorr, cePrec, cePrec2, cePrec3, sp, rating, piano] = await Promise.all([
      rpc("cg_get_conto_economico_riclassificato", { p_company_id: companyId, p_anno: anno }),
      rpc("cg_get_conto_economico_riclassificato", { p_company_id: companyId, p_anno: anno - 1 }),
      rpc("cg_get_conto_economico_riclassificato", { p_company_id: companyId, p_anno: anno - 2 }),
      rpc("cg_get_conto_economico_riclassificato", { p_company_id: companyId, p_anno: anno - 3 }),
      rpc("cg_get_stato_patrimoniale_riclassificato", { p_company_id: companyId, p_anno: anno }),
      rpc("cg_get_rating", { p_company_id: companyId, p_anno: anno }),
      rpc("cg_simula_piano_industriale", { p_company_id: companyId }).catch(() => ({ data: null })),
    ]);

    if (ceCorr.error || sp.error || rating.error) {
      return errorResponse("Dati non disponibili. Verifica che il modulo sia inizializzato.", 400, corsH);
    }

    // Build PDF
    const pdf = await PDFDocument.create();
    const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ctx: DrawCtx = {
      pdf, fontReg, fontBold, anno,
      companyName: (company?.business_name as string) || "Azienda",
      companyVAT: (company?.vat_number as string) || "",
      pageNum: { v: 0 },
    };

    drawCover(ctx);
    drawCETable(ctx, ceCorr.data as CEResp);
    drawCEHistory(ctx, [
      cePrec3.data as CEResp | null,
      cePrec2.data as CEResp | null,
      cePrec.data as CEResp | null,
      ceCorr.data as CEResp,
    ]);
    drawSPColumns(ctx, sp.data as SPResp);
    drawRatingPage(ctx, rating.data as RTResp);
    drawPiano(ctx, piano.data as PianoResp | null);

    const bytes = await pdf.save();
    const filename = `pacchetto-banca-${anno}-${Date.now()}.pdf`;
    const path = `${companyId}/${filename}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("controllo-gestione-exports")
      .upload(path, bytes, { contentType: "application/pdf", cacheControl: "3600" });
    if (upErr) return errorResponse(`Upload storage: ${upErr.message}`, 500, corsH);

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
      }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return errorResponse(msg, 500, corsH);
  }
});
