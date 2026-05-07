import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { PDFDocument, rgb, StandardFonts, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4?target=deno";
// Libreria template componibile: carica i blocchi linkati + sostituisce merge tag
import { loadTemplateWithBlocks, applyMergeTagsToTemplate, buildMergeContext, type ComposedTemplate } from "../_shared/quoteTemplateComposer.ts";

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
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json();
    const { quote_id, preview_mode, template_data, company_name } = body;

    // ─── PREVIEW MODE ───
    const isPreview = preview_mode === true && template_data;

    let quote: any;
    let items: any[] = [];
    let company: any = null;
    let t: any;
    let attachmentRows: any[] = [];
    let branding: any = null;
    let pdfImp: any = {};

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

      // Load template + blocchi linkati (libreria componibile per kind)
      let template: ComposedTemplate | null = null;
      if (quote.template_id) {
        template = await loadTemplateWithBlocks(supabaseAdmin, quote.template_id);
      }
      if (!template) {
        // Fallback: cerca template default kind=offerta della company
        const { data: defaultTmpl } = await supabaseAdmin
          .from("quote_templates")
          .select("id")
          .eq("company_id", quote.company_id)
          .eq("kind", "offerta")
          .eq("is_default", true)
          .eq("is_active", true)
          .maybeSingle();
        if (defaultTmpl?.id) {
          template = await loadTemplateWithBlocks(supabaseAdmin, defaultTmpl.id);
        }
      }
      t = { ...DEFAULT_T, ...(template || {}) };

      // Load items
      const { data: itemsData = [] } = await supabaseAdmin
        .from("quote_items")
        .select("*")
        .eq("quote_id", quote_id)
        .order("sort_order");
      items = itemsData;

      // Load preventivo_impostazioni
      const { data: impData } = await supabaseAdmin
        .from("preventivo_impostazioni" as any)
        .select("*")
        .eq("company_id", (quoteData as any).company_id)
        .maybeSingle();
      pdfImp = impData ?? {};

      // Filter items: skip mostra_nel_pdf=false
      const allItems = items;
      const visibileItems = allItems.filter((i: any) => i.mostra_nel_pdf !== false);
      items = visibileItems;

      // Load company info
      const { data: companyData } = await supabaseAdmin
        .from("companies")
        .select("name, email, phone, address, logo_url, vat_number")
        .eq("id", quote.company_id)
        .single();
      company = companyData;

      // Branding dinamico per white-label
      branding = await getBrandingForCompany(supabaseAdmin, quote.company_id);

      // ── Composizione blocchi linkati + merge tag substitution ────────────
      // Se l'offerta ha blocchi linkati (cover/condizioni/legali), i loro
      // contenuti hanno priorità sui campi inline. Sostituiamo poi {{tag}}.
      if (t && (t.composed_cover || t.composed_terms || t.composed_legal)) {
        if (t.composed_cover) {
          if (t.composed_cover.cover_image_url) t.cover_image_url = t.composed_cover.cover_image_url;
          if (t.composed_cover.cover_title) t.cover_title = t.composed_cover.cover_title;
          if (t.composed_cover.cover_subtitle) t.cover_subtitle = t.composed_cover.cover_subtitle;
          t.show_cover_image = true;
        }
        if (t.composed_terms?.body_html) {
          t.contractual_terms_text = t.composed_terms.body_html;
          t.show_contractual_terms = true;
        }
        if (t.composed_legal?.body_html) {
          t.legal_terms_text = t.composed_legal.body_html;
          t.show_legal_terms = true;
        }
      }
      try {
        // Carica contact se presente per merge tag
        let contact: Record<string, unknown> | null = null;
        if (quote.contact_id) {
          const { data: c } = await supabaseAdmin
            .from("marketing_contacts")
            .select("*")
            .eq("id", quote.contact_id)
            .maybeSingle();
          contact = c ?? null;
        }
        const mergeCtx = buildMergeContext({ quote, company, contact });
        t = applyMergeTagsToTemplate(t as ComposedTemplate, mergeCtx);
      } catch (e) {
        console.warn("[generate-quote-pdf] merge tag substitution fallita (non bloccante):", e instanceof Error ? e.message : e);
      }

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
      // Classic (default) — header band + logo + company info a sinistra, dati offerta a destra
      const headerH = 90;
      page.drawRectangle({ x: 0, y: pageHeight - headerH, width: pageWidth, height: headerH, color: primaryC });
      // Logo in header
      let hy = pageHeight - 20;
      if (logoEmbed && t.show_logo) {
        const maxH = t.logo_size === "small" ? 25 : t.logo_size === "large" ? 55 : 40;
        const scale = Math.min(maxH / logoEmbed.height, 140 / logoEmbed.width);
        const w = logoEmbed.width * scale;
        const h = logoEmbed.height * scale;
        page.drawImage(logoEmbed, { x: margin, y: pageHeight - headerH + (headerH - h) / 2, width: w, height: h });
        hy -= h;
      }
      // Company name in header right
      const compNameX = pageWidth - margin - Math.min((company?.name || "").length * 7, 200);
      page.drawText(company?.name || "Azienda", { x: Math.max(compNameX, pageWidth / 2), y: pageHeight - 35, size: 13, font: fontBold, color: headerTextC, maxWidth: 220 });
      if (company?.vat_number) {
        page.drawText(`P.IVA ${company.vat_number}`, { x: Math.max(compNameX, pageWidth / 2), y: pageHeight - 52, size: 8, font, color: rgb(0.85, 0.85, 0.85), maxWidth: 220 });
      }
      y = pageHeight - headerH - 25;

      // Company details (left column) + Quote info (right column)
      const col1X = margin;
      const col2X = pageWidth / 2 + 20;

      // Left: company contact details
      let yl = y;
      page.drawText("Emittente", { x: col1X, y: yl, size: 8, font: fontBold, color: grayC }); yl -= 14;
      if (company?.address) { page.drawText(company.address, { x: col1X, y: yl, size: 9, font, color: textC, maxWidth: contentWidth / 2 - 10 }); yl -= 13; }
      if (company?.email) { page.drawText(company.email, { x: col1X, y: yl, size: 9, font, color: textC }); yl -= 13; }
      if (company?.phone) { page.drawText(company.phone, { x: col1X, y: yl, size: 9, font, color: textC }); yl -= 13; }

      // Right: quote identifiers
      let yr = y;
      page.drawText("Offerta commerciale", { x: col2X, y: yr, size: 8, font: fontBold, color: grayC }); yr -= 14;
      if (t.show_quote_number) {
        page.drawText(`N. ${quote.quote_number}`, { x: col2X, y: yr, size: 14, font: fontBold, color: primaryC }); yr -= 20;
      }
      const createdDate = new Date(quote.created_at).toLocaleDateString("it-IT");
      page.drawText(`Data: ${createdDate}`, { x: col2X, y: yr, size: 9, font, color: textC }); yr -= 13;
      if (t.show_validity_date && quote.expires_at) {
        page.drawText(`Valida fino al: ${new Date(quote.expires_at).toLocaleDateString("it-IT")}`, { x: col2X, y: yr, size: 9, font, color: textC }); yr -= 13;
      }

      y = Math.min(yl, yr) - 20;
      // Divider
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: lightGrayC });
      y -= 15;

      // Title
      if (quote.title) {
        page.drawText("Oggetto:", { x: margin, y, size: 9, font: fontBold, color: grayC }); y -= 14;
        page.drawText(quote.title, { x: margin, y, size: 12, font: fontBold, color: textC, maxWidth: contentWidth }); y -= 18;
      }
      if (t.cover_tagline) {
        page.drawText(t.cover_tagline, { x: margin, y, size: 10, font: fontItalic, color: primaryC }); y -= 16;
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

      // If pdf_mostra_solo_totale: skip item rows, only draw totals
      const soloTotale = (quote as any).pdf_mostra_solo_totale === true || pdfImp.pdf_mostra_solo_totale === true;

      if (!soloTotale) {
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const itemCat = (item as any).item_category || "prodotto";
          const isNota = itemCat === "nota";
          const isSubtotale = itemCat === "subtotale";
          const isChild = ["posa", "smaltimento", "trasporto", "nolo"].includes(itemCat);
          const isOptional = (item as any).is_optional === true;

          if (y < 80) {
            drawWatermark(page);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
            if (t.layout === "bold") {
              page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
            }
          }

          // Nota row: italic text only
          if (isNota) {
            page.drawText((item.name || "").substring(0, 90), { x: colX[0], y, size: 8, font: fontItalic, color: grayC, maxWidth: itemWidth });
            y -= 14;
            continue;
          }

          // Subtotale row: line + bold text
          if (isSubtotale) {
            page.drawLine({ start: { x: itemLeftX, y: y + 5 }, end: { x: itemLeftX + itemWidth, y: y + 5 }, thickness: 0.5, color: lightGrayC });
            const subVal = items.slice(0, idx).reduce((s: number, i: any) => {
              if ((i as any).is_optional) return s;
              return s + Number(i.line_total || (i.quantity * i.unit_price * (1 - (i.discount_percent || 0) / 100)));
            }, 0);
            page.drawText("Subtotale", { x: colX[0], y, size: 9, font: fontBold, color: textC });
            page.drawText(`€ ${subVal.toFixed(2)}`, { x: colX[5], y, size: 9, font: fontBold, color: primaryC });
            y -= 18;
            continue;
          }

          // Alternate row background
          if (idx % 2 === 0) {
            page.drawRectangle({ x: itemLeftX, y: y - 3, width: itemWidth, height: 16, color: isChild ? rgb(0.97, 0.97, 0.97) : accentC });
          }

          // Name prefix for child rows / optional
          let namePrefix = "";
          if (isChild) namePrefix = "  \u2514 ";
          if (isOptional) namePrefix += "[OPZIONALE] ";

          const nameText = (namePrefix + (item.name || "")).substring(0, 40);
          const rowColor = isChild ? grayC : textC;

          const qty = `${item.quantity} ${item.unit_of_measure || ""}`.trim();
          const price = `€ ${Number(item.unit_price || 0).toFixed(2)}`;
          const showDiscount = (quote as any).pdf_mostra_sconti !== false && pdfImp.pdf_mostra_sconti !== false;
          const disc = showDiscount && Number(item.discount_percent || 0) > 0 ? `${item.discount_percent}%` : (showDiscount ? "—" : "");
          const vat = `${Number(item.vat_rate || 0)}%`;
          const lineTotal = Number(item.line_total || (Number(item.quantity) * Number(item.unit_price) * (1 - Number(item.discount_percent || 0) / 100)));
          const totalText = `€ ${lineTotal.toFixed(2)}`;

          page.drawText(nameText, { x: colX[0], y, size: 9, font, color: rowColor });
          page.drawText(qty, { x: colX[1], y, size: 9, font, color: rowColor });
          // Show price per row based on setting
          const showPrezziRiga = (quote as any).pdf_mostra_prezzi_per_riga !== false;
          if (showPrezziRiga) {
            page.drawText(price, { x: colX[2], y, size: 9, font, color: rowColor });
            if (showDiscount) page.drawText(disc, { x: colX[3], y, size: 9, font, color: rowColor });
            page.drawText(vat, { x: colX[4], y, size: 9, font, color: rowColor });
          }
          page.drawText(totalText, { x: colX[5], y, size: 9, font: fontBold, color: isOptional ? grayC : textC });
          y -= 16;

          if (item.description) {
            page.drawText(item.description.substring(0, 80), { x: colX[0], y, size: 7, font, color: grayC });
            y -= 12;
          }
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

      // ── IVA breakdown per aliquota ─────────────────────────────────
      const ivaBreakdown: Record<number, number> = {};
      const discFactor = 1 - Number(quote.discount_percent || 0) / 100;
      for (const item of items.filter((i: any) => !i.is_optional)) {
        const rate = Number(item.vat_rate ?? 22);
        const lineAmt = Number(
          item.line_total ??
          (Number(item.quantity) * Number(item.unit_price) * (1 - Number(item.discount_percent || 0) / 100))
        );
        ivaBreakdown[rate] = (ivaBreakdown[rate] || 0) + lineAmt * (rate / 100);
      }
      const ivaRates = Object.keys(ivaBreakdown)
        .map(Number)
        .sort((a, b) => a - b);
      if (ivaRates.length > 1) {
        // Show per-rate breakdown
        for (const rate of ivaRates) {
          const iva = Math.round(ivaBreakdown[rate] * discFactor * 100) / 100;
          drawTotal(`IVA ${rate}%`, `€ ${iva.toFixed(2)}`);
        }
      } else {
        // Single rate: show total IVA
        drawTotal("IVA", `€ ${Number(quote.vat_amount || 0).toFixed(2)}`);
      }

      drawTotal("TOTALE", `€ ${Number(quote.total || 0).toFixed(2)}`, true);

      // ── Box Finanziamento (se presente nel preventivo) ─────────────
      // I 6 campi quotes.financing_* vengono popolati dal QuoteBuilder
      // quando l'utente attiva la proposta di finanziamento. Mostriamo
      // un box evidenziato sotto il totale: "Oppure paga in NN rate da €X".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fin = quote as any;
      if (fin.financing_monthly_rate != null && fin.financing_num_installments) {
        y -= 10;
        const finBoxX = totX - 10;
        const finBoxW = (totValX + 50) - finBoxX + 10;
        const finBoxH = 56;
        const finBoxY = y - finBoxH + 20;
        const blueLight = rgb(0.94, 0.97, 1);
        const blueAccent = rgb(0.15, 0.39, 0.92);
        // Box con bordo blu evidenziato
        page.drawRectangle({
          x: finBoxX, y: finBoxY, width: finBoxW, height: finBoxH,
          color: blueLight,
          borderColor: blueAccent,
          borderWidth: 1.5,
        });
        // Label
        page.drawText("Oppure paga in comode rate mensili", {
          x: finBoxX + 8, y: y + 8,
          size: 8, font: fontBold, color: blueAccent,
        });
        // Rata grande
        const rataStr = `€ ${Number(fin.financing_monthly_rate).toFixed(2)}`;
        page.drawText(rataStr, {
          x: finBoxX + 8, y: y - 8,
          size: 18, font: fontBold, color: blueAccent,
        });
        // " × N rate"
        page.drawText(`× ${fin.financing_num_installments} rate`, {
          x: finBoxX + 8 + (rataStr.length * 9), y: y - 6,
          size: 9, font: font, color: textC,
        });
        // Riga TAN/totale dovuto
        const tan = fin.financing_calculation_json?.tan;
        const totDue = Number(fin.financing_total_due ?? 0).toFixed(2);
        const detailLine = `Tot. dovuto € ${totDue}${tan ? ` · TAN ${Number(tan).toFixed(2)}%` : ""}`;
        page.drawText(detailLine, {
          x: finBoxX + 8, y: y - 22,
          size: 7.5, font: font, color: lightGrayC,
        });
        // Disclaimer
        page.drawText("Proposta indicativa salvo approvazione della finanziaria.", {
          x: finBoxX + 8, y: y - 32,
          size: 6.5, font: font, color: lightGrayC,
        });
        y -= finBoxH + 5;
      }

      // ── QR firma digitale ──────────────────────────────────────────
      if (!isPreview && (quote as any).firma_digitale_abilitata && (quote as any).signature_token) {
        try {
          const siteUrl = branding?.siteUrl || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.it";
          const signUrl = `${siteUrl}/accetta-preventivo/${quote.id}?token=${(quote as any).signature_token}`;
          const qr = qrcode(0, "M");
          qr.addData(signUrl);
          qr.make();
          const count = qr.getModuleCount();
          const qrSize = 55;
          const cellSize = qrSize / count;
          const qrX = totX;
          const qrY = y - 10;
          // White background
          page.drawRectangle({ x: qrX - 2, y: qrY - qrSize - 2, width: qrSize + 4, height: qrSize + 4, color: rgb(1, 1, 1) });
          for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
              if (qr.isDark(r, c)) {
                page.drawRectangle({
                  x: qrX + c * cellSize,
                  y: qrY - (r + 1) * cellSize,
                  width: cellSize,
                  height: cellSize,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
          page.drawText("Firma online", { x: qrX, y: qrY - qrSize - 12, size: 7, font, color: grayC });
          y = qrY - qrSize - 25;
        } catch (qrErr) {
          console.warn("QR generation failed:", qrErr);
        }
      }

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

    // ─── Merge attached PDFs (skip in preview mode) ───
    if (!isPreview) {
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
    }

    // ─── Add page numbers to all pages ───
    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      drawPageExtras(pdfDoc.getPage(i), i + 1, totalPages);
    }

    // ─── Preview mode: return PDF directly without storage ───
    if (isPreview) {
      const pdfBytes = await pdfDoc.save();
      const uint8 = new Uint8Array(pdfBytes);
      // Convert to base64
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      return jsonResponse({ success: true, pdf_base64: base64 });
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
