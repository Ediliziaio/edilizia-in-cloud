/**
 * genera-pdf-rapportino
 * Genera un PDF del rapportino giornaliero, lo carica su storage e
 * aggiorna il campo pdf_url nella tabella campo_rapportini.
 *
 * POST body: { rapportino_id: string }
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function drawLine(
  page: any,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 0.5,
  color = rgb(0.8, 0.8, 0.8),
) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
}

function drawText(
  page: any,
  text: string,
  x: number,
  y: number,
  font: any,
  size: number,
  color = rgb(0.1, 0.1, 0.1),
) {
  page.drawText(text, { x, y, font, size, color });
}

// Wrap text to fit within maxWidth using the given font+size
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      current = probe;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Fetch an image URL and embed it as PNG or JPEG in the PDF
async function embedImage(pdfDoc: any, url: string): Promise<any | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("png") || url.endsWith(".png")) {
      return await pdfDoc.embedPng(buf);
    }
    return await pdfDoc.embedJpg(buf);
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const { rapportino_id } = body as { rapportino_id: string };
    if (!rapportino_id) return errorResponse("rapportino_id mancante");

    // ── Fetch rapportino ──────────────────────────────────────────────────────
    const { data: rap, error: rapErr } = await supabaseAdmin
      .from("campo_rapportini")
      .select(
        "*, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name), ordine:orders!campo_rapportini_order_id_fkey(title, order_number)",
      )
      .eq("id", rapportino_id)
      .single();

    if (rapErr || !rap) return errorResponse("Rapportino non trovato", 404);

    // Verifica che l'utente appartenga alla stessa azienda
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (!profile || profile.company_id !== rap.company_id) {
      return errorResponse("Non autorizzato", 403);
    }

    // ── Fetch dati azienda ────────────────────────────────────────────────────
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, address, city, email, phone, vat_number")
      .eq("id", rap.company_id)
      .single();

    // ── Costruzione PDF ───────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    const contentW = width - margin * 2;

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const colorPrimary = rgb(0.06, 0.25, 0.67);   // #1040AB
    const colorText = rgb(0.08, 0.08, 0.08);
    const colorMuted = rgb(0.45, 0.45, 0.45);
    const colorLight = rgb(0.9, 0.9, 0.9);

    let y = height - margin;

    // ── Header band ──────────────────────────────────────────────────────────
    page.drawRectangle({
      x: 0,
      y: height - 70,
      width,
      height: 70,
      color: colorPrimary,
    });
    drawText(page, "RAPPORTINO GIORNALIERO", margin, height - 38, fontBold, 16, rgb(1, 1, 1));
    const aziendaNome = truncate(company?.name ?? "Azienda", 50);
    drawText(page, aziendaNome, margin, height - 58, fontReg, 10, rgb(0.8, 0.85, 1));

    y = height - 80;

    // ── Sezione Info ──────────────────────────────────────────────────────────
    y -= 20;
    const autoreName =
      `${rap.autore?.first_name ?? ""} ${rap.autore?.last_name ?? ""}`.trim() || "—";
    const dataLavoro = rap.data_lavoro
      ? new Date(rap.data_lavoro + "T00:00:00").toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

    const infoRows: [string, string][] = [
      ["Operaio", autoreName],
      ["Data", dataLavoro],
      ["Ore lavorate", `${rap.ore_lavorate ?? 0}h`],
      ...(rap.ore_straordinario > 0 ? [["Ore straordinario", `${rap.ore_straordinario}h`] as [string, string]] : []),
      ["Avanzamento", `${rap.percentuale_avanzamento ?? 0}%`],
      ["Lavoro completato", rap.lavoro_completato ? "Sì" : "No"],
    ];

    if (rap.ordine?.order_number || rap.ordine?.title) {
      infoRows.unshift(["Commessa", truncate(`${rap.ordine.order_number ?? ""} ${rap.ordine.title ?? ""}`.trim(), 60)]);
    }

    if (rap.meteo) {
      const meteoLabel: Record<string, string> = {
        soleggiato: "☀ Soleggiato", nuvoloso: "☁ Nuvoloso",
        pioggia: "🌧 Pioggia", neve: "❄ Neve", vento: "💨 Vento",
      };
      infoRows.push(["Meteo", meteoLabel[rap.meteo] ?? rap.meteo]);
    }

    const col1 = margin;
    const col2 = margin + 150;

    for (const [label, value] of infoRows) {
      drawText(page, label, col1, y, fontBold, 9, colorMuted);
      drawText(page, value, col2, y, fontReg, 9, colorText);
      y -= 16;
    }

    drawLine(page, margin, y - 4, width - margin, y - 4);
    y -= 16;

    // ── Descrizione lavori ────────────────────────────────────────────────────
    if (rap.descrizione_lavori) {
      drawText(page, "DESCRIZIONE LAVORI", margin, y, fontBold, 10, colorPrimary);
      y -= 14;
      const lines = wrapText(rap.descrizione_lavori, fontReg, 9, contentW);
      for (const line of lines.slice(0, 15)) {
        drawText(page, line, margin, y, fontReg, 9, colorText);
        y -= 13;
      }
      drawLine(page, margin, y - 4, width - margin, y - 4);
      y -= 16;
    }

    // ── Materiali ─────────────────────────────────────────────────────────────
    const materiali: any[] = Array.isArray(rap.materiali_usati) ? rap.materiali_usati : [];
    if (materiali.length > 0) {
      drawText(page, "MATERIALI UTILIZZATI", margin, y, fontBold, 10, colorPrimary);
      y -= 14;

      // Table header
      page.drawRectangle({ x: margin, y: y - 12, width: contentW, height: 14, color: rgb(0.94, 0.95, 0.98) });
      drawText(page, "Materiale", margin + 4, y - 2, fontBold, 8, colorText);
      drawText(page, "Qtà", margin + 280, y - 2, fontBold, 8, colorText);
      drawText(page, "Unità", margin + 320, y - 2, fontBold, 8, colorText);
      drawText(page, "Fonte", margin + 370, y - 2, fontBold, 8, colorText);
      y -= 16;

      for (const m of materiali.slice(0, 20)) {
        drawText(page, truncate(m.nome, 40), margin + 4, y, fontReg, 8, colorText);
        drawText(page, String(m.quantita ?? ""), margin + 280, y, fontReg, 8, colorText);
        drawText(page, truncate(m.unita, 8), margin + 320, y, fontReg, 8, colorText);
        drawText(page, m.da_furgone ? "Furgone" : "Manuale", margin + 370, y, fontReg, 8, colorMuted);
        y -= 13;
        drawLine(page, margin, y + 1, width - margin, y + 1, 0.3, colorLight);
      }
      y -= 8;
      drawLine(page, margin, y - 4, width - margin, y - 4);
      y -= 16;
    }

    // ── Firma operaio ─────────────────────────────────────────────────────────
    let firmaOperaioImg: any = null;
    if (rap.firma_operaio_url) {
      firmaOperaioImg = await embedImage(pdfDoc, rap.firma_operaio_url);
    }

    // ── Firma cliente ─────────────────────────────────────────────────────────
    let firmaClienteImg: any = null;
    if (rap.firma_cliente_url) {
      firmaClienteImg = await embedImage(pdfDoc, rap.firma_cliente_url);
    }

    // Determine available space for signatures (min 120px each + labels)
    const sigsNeeded = (firmaOperaioImg ? 1 : 0) + (firmaClienteImg ? 1 : 0);
    if (sigsNeeded > 0 && y > 120) {
      drawText(page, "FIRME", margin, y, fontBold, 10, colorPrimary);
      y -= 18;

      const sigH = 80;
      const sigW = Math.min(200, (contentW - 20) / sigsNeeded);

      let sigX = margin;

      if (firmaOperaioImg) {
        drawText(page, "Firma Operaio", sigX, y, fontReg, 8, colorMuted);
        y -= 4;
        page.drawRectangle({
          x: sigX, y: y - sigH, width: sigW, height: sigH,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: colorLight,
          borderWidth: 0.5,
        });
        const dims = firmaOperaioImg.scaleToFit(sigW - 8, sigH - 8);
        page.drawImage(firmaOperaioImg, {
          x: sigX + 4, y: y - sigH + 4,
          width: dims.width, height: dims.height,
        });
        if (autoreName) {
          drawText(page, autoreName, sigX, y - sigH - 10, fontReg, 7, colorMuted);
        }
        sigX += sigW + 20;
      }

      if (firmaClienteImg) {
        const clienteY = y + (firmaOperaioImg ? 4 : 0);
        drawText(page, "Firma Cliente", sigX, clienteY, fontReg, 8, colorMuted);
        page.drawRectangle({
          x: sigX, y: clienteY - 4 - sigH, width: sigW, height: sigH,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: colorLight,
          borderWidth: 0.5,
        });
        const dims2 = firmaClienteImg.scaleToFit(sigW - 8, sigH - 8);
        page.drawImage(firmaClienteImg, {
          x: sigX + 4, y: clienteY - 4 - sigH + 4,
          width: dims2.width, height: dims2.height,
        });
        if (rap.firma_cliente_nome) {
          drawText(page, rap.firma_cliente_nome, sigX, clienteY - 4 - sigH - 10, fontReg, 7, colorMuted);
        }
      }

      y -= sigH + 30;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const generatedAt = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    drawLine(page, margin, 40, width - margin, 40, 0.5, colorLight);
    drawText(page, `Generato il ${generatedAt} · Edilizia in Cloud`, margin, 26, fontReg, 7, colorMuted);
    const rapId = truncate(rapportino_id, 20);
    drawText(
      page,
      `ID: ${rapId}`,
      width - margin - fontReg.widthOfTextAtSize(`ID: ${rapId}`, 7),
      26,
      fontReg,
      7,
      colorMuted,
    );

    // ── Serialize ─────────────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();

    // ── Upload to storage ─────────────────────────────────────────────────────
    const pdfPath = `${rap.company_id}/${rapportino_id}/rapportino.pdf`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("campo-rapportini")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return errorResponse(`Errore upload PDF: ${uploadErr.message}`, 500);
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("campo-rapportini")
      .getPublicUrl(pdfPath);

    const pdfUrl = urlData.publicUrl;

    // ── Update rapportino ─────────────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from("campo_rapportini")
      .update({ pdf_url: pdfUrl })
      .eq("id", rapportino_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return errorResponse(`Errore aggiornamento: ${updateErr.message}`, 500);
    }

    return jsonResponse({ pdf_url: pdfUrl });
  } catch (e: any) {
    console.error("genera-pdf-rapportino error:", e);
    return errorResponse(e.message ?? "Errore interno", 500);
  }
});
