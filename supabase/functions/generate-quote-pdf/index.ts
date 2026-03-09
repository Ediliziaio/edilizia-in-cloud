import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts, degrees } from "https://esm.sh/pdf-lib@1.17.1";

// ─── Helpers ───
function hexToRgb(hex: string) {
  const clean = (hex || "#000000").replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function rgbColor(hex: string) {
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
}

async function getFont(pdfDoc: any, family: string, style: "normal" | "bold" | "italic" = "normal") {
  const map: Record<string, Record<string, any>> = {
    helvetica: { normal: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique },
    times: { normal: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic },
    courier: { normal: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique },
  };
  const familyMap = map[family] || map.helvetica;
  return pdfDoc.embedFont(familyMap[style] || familyMap.normal);
}

const DEFAULT_T = {
  layout: "classic",
  primary_color: "#1E40AF",
  secondary_color: "#3B82F6",
  accent_color: "#DBEAFE",
  text_color: "#111827",
  header_text_color: "#FFFFFF",
  font_family: "helvetica",
  logo_position: "left",
  logo_size: "medium",
  show_logo: true,
  show_quote_number: true,
  show_validity_date: true,
  show_company_details: true,
  show_client_details: true,
  show_payment_terms: true,
  show_delivery_terms: true,
  show_notes: true,
  show_page_numbers: true,
  show_watermark: false,
  watermark_text: "",
  footer_text: "",
  cover_tagline: "",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    const body = await req.json();
    const { quote_id, preview_mode, template_data, company_name } = body;

    // ─── PREVIEW MODE ───
    const isPreview = preview_mode === true && template_data;

    let quote: any;
    let items: any[] = [];
    let company: any = null;
    let t: any;
    let attachmentRows: any[] = [];

    if (isPreview) {
      // Use sample data – no DB lookups needed
      t = { ...DEFAULT_T, ...template_data };
      company = {
        name: company_name || "La Tua Azienda Srl",
        email: "info@azienda-esempio.it",
        phone: "+39 02 1234567",
        address: "Via Roma 1, 20100 Milano (MI)",
        vat_number: "IT01234567890",
        logo_url: null,
      };
      quote = {
        quote_number: "OFF-2026-001",
        title: "Fornitura e posa serramenti",
        description: "Offerta per la fornitura e installazione di serramenti in PVC presso l'immobile sito in Via Esempio 10, Roma.",
        client_name: "Mario Rossi",
        client_company: "Rossi Costruzioni Srl",
        client_email: "mario.rossi@esempio.it",
        client_phone: "+39 333 1234567",
        client_fiscal_code: "RSSMRA80A01H501Z",
        client_vat_number: "IT09876543210",
        client_address: "Via Esempio 10, 00100 Roma (RM)",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        subtotal: 6526.00,
        discount_percent: 5,
        discount_amount: 326.30,
        vat_amount: 1363.93,
        total: 7563.63,
        notes: "Pagamento: 50% alla conferma, saldo alla consegna.\nTempo di consegna stimato: 4-6 settimane lavorative.\nGaranzia: 10 anni sui profili, 5 anni sugli accessori.",
        company_id: "preview",
      };
      items = [
        { name: "Finestra PVC 120x140 doppio vetro", description: "Profilo 5 camere, vetro basso-emissivo 4/16/4", quantity: 4, unit_of_measure: "pz", unit_price: 850.00, discount_percent: 0, vat_rate: 22, line_total: 3400.00 },
        { name: "Porta finestra PVC 80x220", description: "Apertura anta-ribalta, soglia bassa", quantity: 2, unit_of_measure: "pz", unit_price: 1200.00, discount_percent: 5, vat_rate: 22, line_total: 2280.00 },
        { name: "Installazione e posa in opera", description: "Inclusi controtelaio, schiuma, silicone e smaltimento", quantity: 1, unit_of_measure: "servizio", unit_price: 846.00, discount_percent: 0, vat_rate: 22, line_total: 846.00 },
      ];
    } else {
      // ─── NORMAL MODE ───
      if (!quote_id) return errorResponse("quote_id richiesto");

      const { data: quoteData, error: qErr } = await supabaseAdmin
        .from("quotes")
        .select("*")
        .eq("id", quote_id)
        .single();
      if (qErr || !quoteData) return errorResponse("Preventivo non trovato", 404);
      quote = quoteData;

      // Verify user belongs to company
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      if (!profile || profile.company_id !== quote.company_id) {
        return errorResponse("Non autorizzato", 403);
      }

      // Load template
      let template = null;
      if (quote.template_id) {
        const { data: tmpl } = await supabaseAdmin
          .from("quote_templates")
          .select("*")
          .eq("id", quote.template_id)
          .single();
        template = tmpl;
      }
      if (!template) {
        const { data: defaultTmpl } = await supabaseAdmin
          .from("quote_templates")
          .select("*")
          .eq("company_id", quote.company_id)
          .eq("is_default", true)
          .maybeSingle();
        template = defaultTmpl;
      }
      t = { ...DEFAULT_T, ...(template || {}) };

      // Load items
      const { data: itemsData = [] } = await supabaseAdmin
        .from("quote_items")
        .select("*")
        .eq("quote_id", quote_id)
        .order("sort_order");
      items = itemsData;

      // Load company info
      const { data: companyData } = await supabaseAdmin
        .from("companies")
        .select("name, email, phone, address, logo_url, vat_number")
        .eq("id", quote.company_id)
        .single();
      company = companyData;

      // Load attached PDF materials
      const { data: attRows = [] } = await supabaseAdmin
        .from("quote_pdf_attachments")
        .select("*, quote_pdf_materials(name, storage_path)")
        .eq("quote_id", quote_id)
        .order("sort_order");
      attachmentRows = attRows;
    }

    // ─── Build PDF ───
    const pdfDoc = await PDFDocument.create();
    const font = await getFont(pdfDoc, t.font_family, "normal");
    const fontBold = await getFont(pdfDoc, t.font_family, "bold");
    const fontItalic = await getFont(pdfDoc, t.font_family, "italic");

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    const primaryC = rgbColor(t.primary_color);
    const secondaryC = rgbColor(t.secondary_color);
    const accentC = rgbColor(t.accent_color);
    const textC = rgbColor(t.text_color);
    const headerTextC = rgbColor(t.header_text_color);
    const grayC = rgb(0.4, 0.4, 0.4);
    const lightGrayC = rgb(0.7, 0.7, 0.7);

    // ─── Logo embed ───
    let logoEmbed: any = null;
    const logoPath = t.logo_url ?? company?.logo_url;
    if (t.show_logo && logoPath) {
      try {
        // Try template assets bucket first, then company-assets
        let fileData = null;
        for (const bucket of ["quote-template-assets", "company-assets"]) {
          const { data } = await supabaseAdmin.storage.from(bucket).download(logoPath);
          if (data) { fileData = data; break; }
        }
        if (fileData) {
          const bytes = await fileData.arrayBuffer();
          if (logoPath.endsWith(".png")) {
            logoEmbed = await pdfDoc.embedPng(bytes);
          } else if (logoPath.endsWith(".jpg") || logoPath.endsWith(".jpeg")) {
            logoEmbed = await pdfDoc.embedJpg(bytes);
          }
        }
      } catch (e) {
        console.warn("Logo not loaded:", e);
      }
    }

    // Helper: draw footer + page number on a page
    function drawPageExtras(page: any, pageNum: number, totalPages: number) {
      if (t.footer_text) {
        page.drawText(t.footer_text, {
          x: margin, y: 25, size: 8, font, color: grayC, maxWidth: contentWidth,
        });
      }
      if (t.show_page_numbers) {
        const pText = `${pageNum} / ${totalPages}`;
        page.drawText(pText, {
          x: pageWidth - margin - 40, y: 25, size: 8, font, color: grayC,
        });
      }
    }

    // Helper: draw watermark
    function drawWatermark(page: any) {
      if (t.show_watermark && t.watermark_text) {
        page.drawText(t.watermark_text, {
          x: pageWidth / 2 - 100,
          y: pageHeight / 2,
          size: 48,
          font,
          color: rgb(0.9, 0.9, 0.9),
          rotate: degrees(45),
        });
      }
    }

    // Helper: draw logo on page
    function drawLogo(page: any, y: number, leftX = margin) {
      if (!logoEmbed || !t.show_logo) return y;
      const maxH = t.logo_size === "small" ? 30 : t.logo_size === "large" ? 60 : 45;
      const scale = Math.min(maxH / logoEmbed.height, 150 / logoEmbed.width);
      const w = logoEmbed.width * scale;
      const h = logoEmbed.height * scale;
      let x = leftX;
      if (t.logo_position === "center") x = (pageWidth - w) / 2;
      else if (t.logo_position === "right") x = pageWidth - margin - w;
      page.drawImage(logoEmbed, { x, y: y - h, width: w, height: h });
      return y - h - 10;
    }

    // ═══════════════════════════════════════
    // COVER PAGE
    // ═══════════════════════════════════════
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    if (t.layout === "modern") {
      // Full-color header
      const headerH = 180;
      page.drawRectangle({ x: 0, y: pageHeight - headerH, width: pageWidth, height: headerH, color: primaryC });
      let hy = pageHeight - 40;
      if (logoEmbed && t.show_logo) {
        hy = drawLogo(page, hy);
      }
      page.drawText(company?.name || "Azienda", { x: margin, y: hy, size: 14, font: fontBold, color: headerTextC });
      hy -= 20;
      if (t.show_quote_number) {
        page.drawText(`OFFERTA N. ${quote.quote_number}`, { x: margin, y: hy, size: 9, font, color: headerTextC });
        hy -= 16;
      }
      page.drawText("OFFERTA COMMERCIALE", { x: margin, y: hy, size: 20, font: fontBold, color: headerTextC });
      hy -= 18;
      if (quote.title) {
        page.drawText(quote.title, { x: margin, y: hy, size: 12, font, color: headerTextC });
        hy -= 16;
      }
      if (t.cover_tagline) {
        page.drawText(t.cover_tagline, { x: margin, y: hy, size: 10, font: fontItalic, color: headerTextC });
      }
      y = pageHeight - headerH - 30;
    } else if (t.layout === "minimal") {
      // Thin line
      page.drawRectangle({ x: margin, y: y, width: contentWidth, height: 2, color: primaryC });
      y -= 20;
      y = drawLogo(page, y);
      page.drawText(company?.name || "Azienda", { x: margin, y, size: 16, font: fontBold, color: textC });
      y -= 20;
      if (t.show_quote_number) {
        page.drawText(`N. ${quote.quote_number}`, { x: margin, y, size: 9, font, color: grayC });
        y -= 14;
      }
      page.drawText("OFFERTA COMMERCIALE", { x: margin, y, size: 18, font: fontBold, color: textC });
      y -= 18;
      if (quote.title) { page.drawText(quote.title, { x: margin, y, size: 11, font, color: grayC }); y -= 14; }
      if (t.cover_tagline) { page.drawText(t.cover_tagline, { x: margin, y, size: 10, font: fontItalic, color: primaryC }); y -= 16; }
    } else if (t.layout === "bold") {
      // Sidebar
      page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
      const contentX = 100;
      y = pageHeight - margin;
      y = drawLogo(page, y, contentX);
      if (t.show_quote_number) {
        page.drawText(`OFFERTA N. ${quote.quote_number}`, { x: contentX, y, size: 9, font, color: grayC });
        y -= 20;
      }
      page.drawText("OFFERTA", { x: contentX, y, size: 26, font: fontBold, color: textC }); y -= 28;
      page.drawText("COMMERCIALE", { x: contentX, y, size: 26, font: fontBold, color: textC }); y -= 24;
      if (quote.title) { page.drawText(quote.title, { x: contentX, y, size: 11, font, color: grayC }); y -= 14; }
      if (t.cover_tagline) { page.drawText(t.cover_tagline, { x: contentX, y, size: 10, font: fontItalic, color: primaryC }); y -= 16; }
    } else {
      // Classic (default)
      page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: primaryC });
      y = pageHeight - 30;
      y = drawLogo(page, y);
      page.drawText(company?.name || "Azienda", { x: margin, y, size: 20, font: fontBold, color: textC });
      y -= 25;
      if (company?.address) { page.drawText(company.address, { x: margin, y, size: 9, font, color: grayC }); y -= 14; }
      if (company?.email) { page.drawText(company.email, { x: margin, y, size: 9, font, color: grayC }); y -= 14; }
      if (company?.phone) { page.drawText(company.phone, { x: margin, y, size: 9, font, color: grayC }); y -= 14; }
      if (company?.vat_number) { page.drawText(`P.IVA: ${company.vat_number}`, { x: margin, y, size: 9, font, color: grayC }); y -= 14; }
      y -= 20;
      page.drawText("OFFERTA / PREVENTIVO", { x: margin, y, size: 16, font: fontBold, color: primaryC }); y -= 25;
      if (t.show_quote_number) {
        page.drawText(`N. ${quote.quote_number}`, { x: margin, y, size: 12, font: fontBold, color: textC }); y -= 18;
      }
      const createdDate = new Date(quote.created_at).toLocaleDateString("it-IT");
      page.drawText(`Data: ${createdDate}`, { x: margin, y, size: 10, font, color: textC }); y -= 14;
      if (t.show_validity_date && quote.expires_at) {
        page.drawText(`Valida fino al: ${new Date(quote.expires_at).toLocaleDateString("it-IT")}`, { x: margin, y, size: 10, font, color: textC }); y -= 14;
      }
      if (t.cover_tagline) {
        y -= 10;
        page.drawText(t.cover_tagline, { x: margin, y, size: 11, font: fontItalic, color: primaryC }); y -= 16;
      }
    }

    // Client info (all layouts)
    const boldLeftX = t.layout === "bold" ? 100 : margin;
    if (t.show_client_details) {
      y -= 20;
      page.drawText("DESTINATARIO", { x: boldLeftX, y, size: 10, font: fontBold, color: grayC }); y -= 16;
      if (quote.client_name) { page.drawText(quote.client_name, { x: boldLeftX, y, size: 11, font: fontBold, color: textC }); y -= 15; }
      if (quote.client_company) { page.drawText(quote.client_company, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_email) { page.drawText(quote.client_email, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_phone) { page.drawText(quote.client_phone, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_fiscal_code) { page.drawText(`CF: ${quote.client_fiscal_code}`, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_vat_number) { page.drawText(`P.IVA: ${quote.client_vat_number}`, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_address) { page.drawText(quote.client_address, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
    }

    if (quote.title && t.layout !== "modern" && t.layout !== "minimal" && t.layout !== "bold") {
      y -= 20;
      page.drawText("Oggetto:", { x: boldLeftX, y, size: 10, font: fontBold, color: textC }); y -= 14;
      page.drawText(quote.title, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14;
    }

    if (quote.description) {
      y -= 10;
      page.drawText(quote.description.substring(0, 300), { x: boldLeftX, y, size: 9, font, color: grayC, maxWidth: t.layout === "bold" ? contentWidth - 50 : contentWidth }); y -= 14;
    }

    drawWatermark(page);

    // ─── Items page ───
    if (items.length > 0) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;

      if (t.layout === "bold") {
        page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
      }

      const itemLeftX = t.layout === "bold" ? 100 : margin;
      const itemWidth = t.layout === "bold" ? contentWidth - 50 : contentWidth;

      page.drawText("DETTAGLIO PRODOTTI E SERVIZI", { x: itemLeftX, y, size: 12, font: fontBold, color: primaryC }); y -= 25;

      // Table header
      const colX = [itemLeftX, itemLeftX + 200, itemLeftX + 270, itemLeftX + 330, itemLeftX + 390, itemLeftX + 445];
      const headers = ["Descrizione", "Q.tà", "Prezzo", "Sconto", "IVA", "Totale"];

      page.drawRectangle({ x: itemLeftX, y: y - 3, width: itemWidth, height: 18, color: primaryC });
      headers.forEach((h, i) => {
        page.drawText(h, { x: colX[i], y, size: 8, font: fontBold, color: headerTextC });
      });
      y -= 20;

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (y < 80) {
          drawWatermark(page);
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
          if (t.layout === "bold") {
            page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
          }
        }

        // Alternate row
        if (idx % 2 === 0) {
          page.drawRectangle({ x: itemLeftX, y: y - 3, width: itemWidth, height: 16, color: accentC });
        }

        const name = (item.name || "").substring(0, 35);
        const qty = `${item.quantity} ${item.unit_of_measure || ""}`.trim();
        const price = `€ ${Number(item.unit_price || 0).toFixed(2)}`;
        const disc = Number(item.discount_percent || 0) > 0 ? `${item.discount_percent}%` : "—";
        const vat = `${Number(item.vat_rate || 0)}%`;
        const total = `€ ${Number(item.line_total || 0).toFixed(2)}`;

        page.drawText(name, { x: colX[0], y, size: 9, font, color: textC });
        page.drawText(qty, { x: colX[1], y, size: 9, font, color: textC });
        page.drawText(price, { x: colX[2], y, size: 9, font, color: textC });
        page.drawText(disc, { x: colX[3], y, size: 9, font, color: textC });
        page.drawText(vat, { x: colX[4], y, size: 9, font, color: textC });
        page.drawText(total, { x: colX[5], y, size: 9, font: fontBold, color: textC });
        y -= 16;

        if (item.description) {
          page.drawText(item.description.substring(0, 80), { x: colX[0], y, size: 7, font, color: grayC });
          y -= 12;
        }
      }

      // Totals
      y -= 15;
      const totX = itemLeftX + 350;
      const totValX = itemLeftX + 445;
      page.drawLine({ start: { x: totX, y: y + 5 }, end: { x: totValX + 50, y: y + 5 }, thickness: 0.5, color: lightGrayC });

      const drawTotal = (label: string, value: string, bold = false) => {
        page.drawText(label, { x: totX, y, size: 9, font: bold ? fontBold : font, color: bold ? primaryC : textC });
        page.drawText(value, { x: totValX, y, size: 9, font: bold ? fontBold : font, color: bold ? primaryC : textC });
        y -= 15;
      };

      drawTotal("Subtotale", `€ ${Number(quote.subtotal || 0).toFixed(2)}`);
      if (Number(quote.discount_percent || 0) > 0) {
        drawTotal(`Sconto ${quote.discount_percent}%`, `- € ${Number(quote.discount_amount || 0).toFixed(2)}`);
      }
      drawTotal("IVA", `€ ${Number(quote.vat_amount || 0).toFixed(2)}`);
      drawTotal("TOTALE", `€ ${Number(quote.total || 0).toFixed(2)}`, true);

      drawWatermark(page);
    }

    // ─── Notes page ───
    if (t.show_notes && quote.notes) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      if (t.layout === "bold") {
        page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
      }
      const nlx = t.layout === "bold" ? 100 : margin;
      page.drawText("NOTE E CONDIZIONI", { x: nlx, y, size: 12, font: fontBold, color: primaryC }); y -= 25;
      page.drawText(quote.notes.substring(0, 2000), { x: nlx, y, size: 9, font, color: textC, maxWidth: t.layout === "bold" ? contentWidth - 50 : contentWidth, lineHeight: 14 });
      drawWatermark(page);
    }

    // ─── Merge attached PDFs ───
    for (const att of attachmentRows) {
      const filePath = att.quote_pdf_materials?.storage_path;
      if (!filePath) continue;
      try {
        const { data: fileData, error: dlErr } = await supabaseAdmin.storage.from("quote-materials").download(filePath);
        if (dlErr || !fileData) continue;
        const pdfBytes = await fileData.arrayBuffer();
        const attachedPdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await pdfDoc.copyPages(attachedPdf, attachedPdf.getPageIndices());
        copiedPages.forEach((p: any) => pdfDoc.addPage(p));
      } catch (e) {
        console.warn("Failed to merge attachment:", filePath, e);
      }
    }

    // ─── Add page numbers to all pages ───
    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      drawPageExtras(pdfDoc.getPage(i), i + 1, totalPages);
    }

    // ─── Save to storage ───
    const pdfBytes = await pdfDoc.save();
    const fileName = `${quote.company_id}/${quote.quote_number.replace(/\//g, "-")}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return errorResponse("Errore upload PDF: " + uploadErr.message, 500);
    }

    await supabaseAdmin
      .from("quotes")
      .update({ pdf_storage_path: fileName, pdf_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", quote_id);

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
