import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    const { quote_id } = await req.json();

    if (!quote_id) return errorResponse("quote_id richiesto");

    // Load quote
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (qErr || !quote) return errorResponse("Preventivo non trovato", 404);

    // Verify user belongs to company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    if (!profile || profile.company_id !== quote.company_id) {
      return errorResponse("Non autorizzato", 403);
    }

    // Load items
    const { data: items = [] } = await supabaseAdmin
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote_id)
      .order("sort_order");

    // Load company info
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, email, phone, address, logo_url, vat_number")
      .eq("id", quote.company_id)
      .single();

    // Load attached PDF materials
    const { data: attachmentRows = [] } = await supabaseAdmin
      .from("quote_pdf_attachments")
      .select("*, quote_pdf_materials(name, storagrage_path)")
      .eq("quote_id", quote_id)
      .order("sort_order");

    // ─── Build main PDF ───
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    // ─── Cover page ───
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Company name
    const companyName = company?.name || "Azienda";
    page.drawText(companyName, { x: margin, y, size: 20, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    y -= 25;

    if (company?.address) {
      page.drawText(company.address, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
    }
    if (company?.email) {
      page.drawText(company.email, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
    }
    if (company?.phone) {
      page.drawText(company.phone, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
    }
    if (company?.vat_number) {
      page.drawText(`P.IVA: ${company.vat_number}`, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
    }

    y -= 30;

    // Title block
    page.drawText("OFFERTA / PREVENTIVO", { x: margin, y, size: 16, font: fontBold, color: rgb(0.15, 0.35, 0.6) });
    y -= 25;
    page.drawText(`N. ${quote.quote_number}`, { x: margin, y, size: 12, font: fontBold });
    y -= 18;

    const createdDate = new Date(quote.created_at).toLocaleDateString("it-IT");
    page.drawText(`Data: ${createdDate}`, { x: margin, y, size: 10, font });
    y -= 14;

    if (quote.valid_until) {
      const validDate = new Date(quote.valid_until).toLocaleDateString("it-IT");
      page.drawText(`Valida fino al: ${validDate}`, { x: margin, y, size: 10, font });
      y -= 14;
    }

    y -= 25;

    // Client info
    page.drawText("DESTINATARIO", { x: margin, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    y -= 16;
    if (quote.client_name) { page.drawText(quote.client_name, { x: margin, y, size: 11, font: fontBold }); y -= 15; }
    if (quote.client_company) { page.drawText(quote.client_company, { x: margin, y, size: 10, font }); y -= 14; }
    if (quote.client_email) { page.drawText(quote.client_email, { x: margin, y, size: 10, font }); y -= 14; }
    if (quote.client_phone) { page.drawText(quote.client_phone, { x: margin, y, size: 10, font }); y -= 14; }
    if (quote.client_fiscal_code) { page.drawText(`CF: ${quote.client_fiscal_code}`, { x: margin, y, size: 10, font }); y -= 14; }
    if (quote.client_vat_number) { page.drawText(`P.IVA: ${quote.client_vat_number}`, { x: margin, y, size: 10, font }); y -= 14; }
    if (quote.client_address) { page.drawText(quote.client_address, { x: margin, y, size: 10, font }); y -= 14; }

    if (quote.title) {
      y -= 20;
      page.drawText("Oggetto:", { x: margin, y, size: 10, font: fontBold });
      y -= 14;
      page.drawText(quote.title, { x: margin, y, size: 10, font });
      y -= 14;
    }

    if (quote.description) {
      y -= 10;
      page.drawText(quote.description.substring(0, 300), { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3), maxWidth: contentWidth });
      y -= 14;
    }

    // ─── Items page ───
    if (items.length > 0) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;

      page.drawText("DETTAGLIO PRODOTTI E SERVIZI", { x: margin, y, size: 12, font: fontBold, color: rgb(0.15, 0.35, 0.6) });
      y -= 25;

      // Table header
      const colX = [margin, margin + 200, margin + 270, margin + 330, margin + 390, margin + 445];
      const headers = ["Descrizione", "Q.tà", "Prezzo", "Sconto", "IVA", "Totale"];

      page.drawRectangle({ x: margin, y: y - 3, width: contentWidth, height: 18, color: rgb(0.93, 0.93, 0.93) });
      headers.forEach((h, i) => {
        page.drawText(h, { x: colX[i], y, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      });
      y -= 20;

      for (const item of items) {
        if (y < 80) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }

        const name = (item.name || "").substring(0, 35);
        const qty = `${item.quantity} ${item.unit_of_measure || ""}`.trim();
        const price = `€ ${(item.unit_price || 0).toFixed(2)}`;
        const disc = item.discount_percent > 0 ? `${item.discount_percent}%` : "—";
        const vat = `${item.vat_rate || 0}%`;
        const total = `€ ${(item.line_total || 0).toFixed(2)}`;

        page.drawText(name, { x: colX[0], y, size: 9, font });
        page.drawText(qty, { x: colX[1], y, size: 9, font });
        page.drawText(price, { x: colX[2], y, size: 9, font });
        page.drawText(disc, { x: colX[3], y, size: 9, font });
        page.drawText(vat, { x: colX[4], y, size: 9, font });
        page.drawText(total, { x: colX[5], y, size: 9, font: fontBold });
        y -= 16;

        if (item.description) {
          page.drawText(item.description.substring(0, 80), { x: colX[0], y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
          y -= 12;
        }
      }

      // Totals
      y -= 15;
      page.drawLine({ start: { x: margin + 350, y: y + 5 }, end: { x: margin + contentWidth, y: y + 5 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });

      const drawTotal = (label: string, value: string, bold = false) => {
        page.drawText(label, { x: margin + 360, y, size: 9, font: bold ? fontBold : font });
        page.drawText(value, { x: margin + 445, y, size: 9, font: bold ? fontBold : font });
        y -= 15;
      };

      drawTotal("Subtotale", `€ ${(quote.subtotal || 0).toFixed(2)}`);
      if ((quote.discount_percent || 0) > 0) {
        drawTotal(`Sconto ${quote.discount_percent}%`, `- € ${(quote.discount_amount || 0).toFixed(2)}`);
      }
      drawTotal("IVA", `€ ${(quote.vat_amount || 0).toFixed(2)}`);
      drawTotal("TOTALE", `€ ${(quote.total || 0).toFixed(2)}`, true);
    }

    // ─── Notes page ───
    if (quote.notes) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      page.drawText("NOTE E CONDIZIONI", { x: margin, y, size: 12, font: fontBold, color: rgb(0.15, 0.35, 0.6) });
      y -= 25;
      page.drawText(quote.notes.substring(0, 2000), { x: margin, y, size: 9, font, maxWidth: contentWidth, lineHeight: 14 });
    }

    // ─── Merge attached PDFs ───
    for (const att of attachmentRows) {
      const filePath = att.quote_pdf_materials?.file_path;
      if (!filePath) continue;

      try {
        const { data: fileData, error: dlErr } = await supabaseAdmin.storage
          .from("quote-materials")
          .download(filePath);
        if (dlErr || !fileData) continue;

        const pdfBytes = await fileData.arrayBuffer();
        const attachedPdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await pdfDoc.copyPages(attachedPdf, attachedPdf.getPageIndices());
        copiedPages.forEach((p) => pdfDoc.addPage(p));
      } catch (e) {
        console.warn("Failed to merge attachment:", filePath, e);
      }
    }

    // ─── Save to storage ───
    const pdfBytes = await pdfDoc.save();
    const fileName = `${quote.company_id}/${quote.quote_number.replace(/\//g, "-")}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return errorResponse("Errore upload PDF: " + uploadErr.message, 500);
    }

    // Update quote with pdf path
    await supabaseAdmin
      .from("quotes")
      .update({ pdf_url: fileName, updated_at: new Date().toISOString() })
      .eq("id", quote_id);

    // Create signed URL (1 hour)
    const { data: signedData } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .createSignedUrl(fileName, 3600);

    return jsonResponse({
      success: true,
      pdf_path: fileName,
      signed_url: signedData?.signedUrl || null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("generate-quote-pdf error:", e);
    return errorResponse("Errore interno", 500);
  }
});
