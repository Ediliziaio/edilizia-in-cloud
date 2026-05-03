/**
 * cg-export-ce-pdf
 *
 * Esporta in PDF (A4, brand EdiliziaInCloud) il CE Riclassificato + box BEP
 * di una company per un anno. Verrà inglobato nel "Pacchetto Banca" (MP-CG-07).
 *
 * Body: { company_id?: uuid, anno: number, mese_da?: number, mese_a?: number }
 * Risposta: application/pdf (download)
 */

import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

interface VoceCE {
  codice: string;
  label: string;
  tipo: "voce" | "subtot" | "subtot_grasso";
  valore: number;
  pct_pil?: number;
}
interface CEResult {
  meta: {
    company_id: string;
    anno: number;
    mese_da: number;
    mese_a: number;
    modalita: string;
    has_cedolini: boolean;
    aliquota_imposte_pct: number;
    generato_il: string;
  };
  voci: VoceCE[];
}
interface BEPResult {
  anno: number;
  ricavi_consuntivi: number;
  costi_fissi: number;
  costi_variabili: number;
  margine_contribuzione_pct: number;
  bep_fatturato_minimo: number | null;
  bep_pct_fatturato: number | null;
  bep_giorno_anno: number | null;
  bep_data: string | null;
  gia_raggiunto: boolean;
  giorni_residui: number | null;
}

const fmtEur = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(n));
};

const fmtPct = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(1)}%`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);

  try {
    const { supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json().catch(() => ({}));
    const { company_id, anno, mese_da = 1, mese_a = 12 } = body as {
      company_id?: string;
      anno?: number;
      mese_da?: number;
      mese_a?: number;
    };
    if (!anno || typeof anno !== "number") {
      return errorResponse("Parametro 'anno' obbligatorio (es. 2026)", 400, corsH);
    }

    const { data: ceData, error: ceErr } = await supabaseAdmin.rpc(
      "cg_get_conto_economico_riclassificato" as never,
      { p_company_id: company_id ?? null, p_anno: anno, p_mese_da: mese_da, p_mese_a: mese_a } as never,
    );
    if (ceErr) return errorResponse(`RPC CE: ${ceErr.message}`, 400, corsH);

    const { data: bepData, error: bepErr } = await supabaseAdmin.rpc(
      "cg_get_bep" as never,
      { p_company_id: company_id ?? null, p_anno: anno } as never,
    );
    if (bepErr) return errorResponse(`RPC BEP: ${bepErr.message}`, 400, corsH);

    const ce = ceData as unknown as CEResult;
    const bep = bepData as unknown as BEPResult;

    // ── Build PDF (A4 portrait, 595x842) ─────────────────────────────────
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const ORANGE = rgb(0.97, 0.45, 0.09);
    const NAVY = rgb(0.09, 0.20, 0.36);
    const SLATE = rgb(0.27, 0.31, 0.40);
    const SLATE_LIGHT = rgb(0.55, 0.60, 0.69);

    let y = 800;

    // Header brand
    page.drawText("Conto Economico Riclassificato", { x: 40, y, size: 18, font: fontBold, color: NAVY });
    y -= 24;
    page.drawText(
      `Anno ${ce.meta.anno} · Mesi ${ce.meta.mese_da}-${ce.meta.mese_a} · ` +
      `Modalità: ${ce.meta.modalita} · ${new Date(ce.meta.generato_il).toLocaleString("it-IT")}`,
      { x: 40, y, size: 9, font: fontReg, color: SLATE },
    );
    y -= 12;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: ORANGE });
    y -= 18;

    // Tabella voci
    const X_LABEL = 50;
    const X_VAL = 480;
    const X_PCT = 540;

    page.drawText("Voce", { x: X_LABEL, y, size: 9, font: fontBold, color: SLATE });
    page.drawText("Importo", { x: X_VAL - 40, y, size: 9, font: fontBold, color: SLATE });
    page.drawText("% PIL", { x: X_PCT - 28, y, size: 9, font: fontBold, color: SLATE });
    y -= 4;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: SLATE_LIGHT });
    y -= 10;

    for (const v of ce.voci) {
      const isSubtot = v.tipo === "subtot" || v.tipo === "subtot_grasso";
      const isFatto = v.tipo === "subtot_grasso";
      const font = isSubtot ? fontBold : fontReg;
      const size = isFatto ? 11 : isSubtot ? 10 : 9;
      const color = isFatto ? NAVY : isSubtot ? SLATE : SLATE;

      if (isSubtot) {
        page.drawRectangle({
          x: 40, y: y - 3, width: 515, height: 14,
          color: isFatto ? rgb(0.95, 0.97, 1) : rgb(0.97, 0.97, 0.97),
        });
      }

      page.drawText(`${v.codice}.`, { x: X_LABEL - 18, y, size, font: fontBold, color });
      page.drawText(v.label.length > 60 ? v.label.slice(0, 60) + "…" : v.label, {
        x: X_LABEL, y, size, font, color,
      });
      const importo = fmtEur(v.valore);
      const importoWidth = font.widthOfTextAtSize(importo, size);
      page.drawText(importo, { x: X_VAL + 60 - importoWidth, y, size, font, color });
      if (v.pct_pil !== undefined && v.pct_pil !== null) {
        const pct = fmtPct(v.pct_pil);
        const pctWidth = font.widthOfTextAtSize(pct, size);
        page.drawText(pct, { x: X_PCT + 15 - pctWidth, y, size, font, color });
      }

      y -= isSubtot ? 18 : 14;
      if (y < 140) break; // riserva spazio per footer BEP
    }

    // Footer: Box BEP
    y = Math.max(y, 130);
    y -= 8;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: ORANGE });
    y -= 14;
    page.drawText("Break Even Point", { x: 40, y, size: 12, font: fontBold, color: NAVY });
    y -= 16;

    const bepLines = [
      `Ricavi consuntivi: ${fmtEur(bep.ricavi_consuntivi)}`,
      `Costi fissi: ${fmtEur(bep.costi_fissi)} · Costi variabili: ${fmtEur(bep.costi_variabili)}`,
      `Margine di contribuzione: ${fmtPct(bep.margine_contribuzione_pct)}`,
      `Fatturato di pareggio: ${fmtEur(bep.bep_fatturato_minimo)} (${fmtPct(bep.bep_pct_fatturato)})`,
      bep.bep_data
        ? `Giorno BEP: ${bep.bep_giorno_anno} (${new Date(bep.bep_data).toLocaleDateString("it-IT")}) — ${
            bep.gia_raggiunto ? "✓ raggiunto" : `mancano ${bep.giorni_residui} giorni`
          }`
        : "Giorno BEP: non calcolabile (margine di contribuzione ≤ 0)",
    ];
    for (const line of bepLines) {
      page.drawText(line, { x: 50, y, size: 9, font: fontReg, color: SLATE });
      y -= 12;
    }

    // Footer brand
    page.drawText("Generato con EdiliziaInCloud · Controllo di Gestione", {
      x: 40, y: 30, size: 8, font: fontReg, color: SLATE_LIGHT,
    });

    const bytes = await pdf.save();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsH,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CE-Riclassificato-${anno}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return errorResponse(msg, 500, corsH);
  }
});
