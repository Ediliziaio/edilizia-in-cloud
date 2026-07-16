import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { PDFDocument, rgb, StandardFonts, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4?target=deno";
// Libreria template componibile: carica i blocchi linkati + sostituisce merge tag
import { loadTemplateWithBlocks, attachLinkedBlocks, applyMergeTagsToTemplate, buildMergeContext, type ComposedTemplate } from "../_shared/quoteTemplateComposer.ts";

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

function normalizeTemplateText(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// Importi in formato italiano: 1.234,56 € (WinAnsi-safe per pdf-lib)
function fmtEur(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Rimuove i caratteri fuori WinAnsi (le StandardFonts non li codificano).
// I campi utente/AI (client_name, title, item.name, notes, testi template…)
// arrivano spesso con emoji, frecce o simboli matematici: un solo carattere
// fuori set fa lanciare drawText e fallire l'INTERO preventivo.
function winAnsiSafe(str: string): string {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…€]/g, "");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
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
  const startedAt = Date.now();
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json();
    const { quote_id, preview_mode, template_data, company_name, preview_signature } = body;

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
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.company_id) {
        t = await attachLinkedBlocks(
          supabaseAdmin,
          { ...t, company_id: profile.company_id } as ComposedTemplate,
          profile.company_id,
        );
      }
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
        id: "preview",
        firma_digitale_abilitata: preview_signature === true,
        signature_token: preview_signature === true ? "preview-token" : null,
      };
      items = [
        { name: "Finestra PVC 120x140 doppio vetro", description: "Profilo 5 camere, vetro basso-emissivo 4/16/4", quantity: 4, unit_of_measure: "pz", unit_price: 850.00, discount_percent: 0, vat_rate: 22, line_total: 3400.00 },
        { name: "Porta finestra PVC 80x220", description: "Apertura anta-ribalta, soglia bassa", quantity: 2, unit_of_measure: "pz", unit_price: 1200.00, discount_percent: 5, vat_rate: 22, line_total: 2280.00 },
        { name: "Installazione e posa in opera", description: "Inclusi controtelaio, schiuma, silicone e smaltimento", quantity: 1, unit_of_measure: "servizio", unit_price: 846.00, discount_percent: 0, vat_rate: 22, line_total: 846.00 },
      ];
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
      t = applyMergeTagsToTemplate(t as ComposedTemplate, buildMergeContext({ quote, company }));
    } else {
      // ─── NORMAL MODE ───
      if (!quote_id) return errorResponse("quote_id richiesto", 400, corsH);

      // Batch 1 — quote e profilo utente sono indipendenti: in parallelo.
      const [quoteRes, profileRes] = await Promise.all([
        supabaseAdmin.from("quotes").select("*").eq("id", quote_id).single(),
        supabaseAdmin.from("profiles").select("company_id").eq("id", userId).single(),
      ]);
      if (quoteRes.error || !quoteRes.data) return errorResponse("Preventivo non trovato", 404, corsH);
      quote = quoteRes.data;
      const profile = profileRes.data;
      if (!profile || profile.company_id !== quote.company_id) {
        return errorResponse("Non autorizzato", 403, corsH);
      }

      // Batch 2 — tutto il resto dipende solo da quote/company: un giro solo
      // di rete invece di 7 round-trip sequenziali (≈ -300ms a generazione).
      const resolveTemplate = async (): Promise<ComposedTemplate | null> => {
        let tmpl: ComposedTemplate | null = null;
        if (quote.template_id) {
          tmpl = await loadTemplateWithBlocks(supabaseAdmin, quote.template_id, quote.company_id);
        }
        if (!tmpl) {
          const { data: defaultTmpl } = await supabaseAdmin
            .from("quote_templates")
            .select("id")
            .eq("company_id", quote.company_id)
            .eq("kind", "offerta")
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle();
          if (defaultTmpl?.id) {
            tmpl = await loadTemplateWithBlocks(supabaseAdmin, defaultTmpl.id, quote.company_id);
          }
        }
        return tmpl;
      };

      const [template, itemsRes, impRes, companyRes, brandingData, contactRes, attRes] = await Promise.all([
        resolveTemplate(),
        supabaseAdmin.from("quote_items").select("*").eq("quote_id", quote_id).order("sort_order"),
        supabaseAdmin.from("preventivo_impostazioni" as any).select("*").eq("company_id", quote.company_id).maybeSingle(),
        supabaseAdmin
          .from("companies")
          .select("name, email, phone, legal_address, legal_city, logo_url, vat_number")
          .eq("id", quote.company_id)
          .single(),
        getBrandingForCompany(supabaseAdmin, quote.company_id),
        quote.contact_id
          ? supabaseAdmin.from("marketing_contacts").select("*").eq("id", quote.contact_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabaseAdmin
          .from("quote_pdf_attachments")
          .select("*, quote_pdf_materials(name, storage_path)")
          .eq("quote_id", quote_id)
          .order("sort_order"),
      ]);

      t = { ...DEFAULT_T, ...(template || {}) };
      items = (itemsRes.data ?? []).filter((i: any) => i.mostra_nel_pdf !== false);
      pdfImp = impRes.data ?? {};
      const companyData = companyRes.data;
      company = companyData
        ? {
            ...companyData,
            address: [companyData.legal_address, companyData.legal_city].filter(Boolean).join(", ") || null,
          }
        : null;
      branding = brandingData;
      const prefetchedContact = (contactRes as { data: Record<string, unknown> | null }).data ?? null;
      attachmentRows = attRes.data ?? [];

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
        // Contact già prefetchato nel batch parallelo
        const mergeCtx = buildMergeContext({ quote, company, contact: prefetchedContact });
        t = applyMergeTagsToTemplate(t as ComposedTemplate, mergeCtx);
      } catch (e) {
        console.warn("[generate-quote-pdf] merge tag substitution fallita (non bloccante):", e instanceof Error ? e.message : e);
      }
    }

    // ─── Build PDF ───
    const pdfDoc = await PDFDocument.create();
    // Difesa strutturale WinAnsi: ogni pagina creata (incluse quelle dei salti
    // pagina e degli allegati) esce con drawText già sanitizzato, così nessun
    // carattere fuori set può far fallire la generazione. Nessuna modifica al
    // layout: cambia solo il testo passato a pdf-lib.
    {
      const rawAddPage = pdfDoc.addPage.bind(pdfDoc);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfDoc.addPage = ((...args: any[]) => {
        const pg = rawAddPage(...args);
        const rawDrawText = pg.drawText.bind(pg);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pg.drawText = ((text: string, opts?: any) => rawDrawText(winAnsiSafe(text), opts)) as typeof pg.drawText;
        return pg;
      }) as typeof pdfDoc.addPage;
    }
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
        // I due bucket possibili vengono interrogati in parallelo
        const [tplRes, compRes] = await Promise.all([
          supabaseAdmin.storage.from("quote-template-assets").download(logoPath).catch(() => ({ data: null })),
          supabaseAdmin.storage.from("company-assets").download(logoPath).catch(() => ({ data: null })),
        ]);
        const fileData = tplRes?.data ?? compRes?.data ?? null;
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

    // ── Layout "classic premium" (default): stile documento professionale ──
    // Colore forte per la barra del totale e i dettagli: brand white-label se
    // configurato, altrimenti arancio EiC.
    const classicPremium = t.layout !== "modern" && t.layout !== "minimal" && t.layout !== "bold";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let accentStrongC: any;
    try {
      accentStrongC = branding?.primaryColor ? rgbColor(branding.primaryColor) : rgbColor("#F97415");
    } catch {
      accentStrongC = rgbColor("#F97415");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // winAnsiSafe anche qui: widthOfTextAtSize lancia sugli stessi caratteri
    // non codificabili di drawText.
    const textW = (s: string, size: number, f: any = font) => f.widthOfTextAtSize(winAnsiSafe(s), size);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawRight = (pg: any, s: string, xRight: number, yy: number, size: number, f: any, color: any) =>
      pg.drawText(s, { x: xRight - textW(s, size, f), y: yy, size, font: f, color });

    // Helper: draw footer + page number on a page
    function drawPageExtras(page: any, pageNum: number, totalPages: number) {
      if (classicPremium) {
        // Banda footer brand: nome azienda a sinistra, pagina a destra.
        page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 22, color: primaryC });
        page.drawRectangle({ x: pageWidth * 0.78, y: 22, width: pageWidth * 0.22, height: 3, color: accentStrongC });
        const footLabel = t.footer_text || `${company?.name ?? ""}${t.cover_tagline ? " — " + t.cover_tagline : ""}`;
        if (footLabel.trim()) {
          page.drawText(String(footLabel).slice(0, 90), { x: margin, y: 8, size: 7.5, font: fontBold, color: headerTextC });
        }
        if (t.show_page_numbers) {
          drawRight(page, `${pageNum} / ${totalPages}`, pageWidth - margin, 8, 7.5, font, headerTextC);
        }
        return;
      }
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

    const startContentPage = (title: string) => {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      if (t.layout === "bold") {
        page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
        y = drawLogo(page, y, 100);
      } else {
        y = drawLogo(page, y);
      }
      const x = t.layout === "bold" ? 100 : margin;
      page.drawText(title, { x, y, size: 13, font: fontBold, color: primaryC });
      y -= 22;
      page.drawLine({ start: { x, y: y + 8 }, end: { x: pageWidth - margin, y: y + 8 }, thickness: 0.6, color: accentC });
    };

    const ensureSpace = (needed = 40, title = "CONTINUA") => {
      if (y > margin + needed) return;
      drawWatermark(page);
      startContentPage(title);
    };

    const contentLeftX = () => (t.layout === "bold" ? 100 : margin);
    const contentMaxWidth = () => (t.layout === "bold" ? contentWidth - 50 : contentWidth);

    const drawRichTextBlock = (title: string, body: unknown) => {
      const text = normalizeTemplateText(body);
      if (!text) return;
      startContentPage(title);
      const x = contentLeftX();
      const maxChars = t.layout === "bold" ? 86 : 96;
      for (const rawLine of text.split(/\n+/)) {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          y -= 8;
          continue;
        }
        const isHeading = /^#{1,4}\s+/.test(trimmed);
        const isList = /^[-*]\s+/.test(trimmed);
        const normalized = trimmed
          .replace(/^#{1,4}\s+/, "")
          .replace(/^[-*]\s+/, "• ");
        const lines = wrapText(normalized, isHeading ? 72 : maxChars);
        for (const line of lines) {
          ensureSpace(isHeading ? 26 : 18, title);
          page.drawText(line, {
            x,
            y,
            size: isHeading ? 11 : 8.8,
            font: isHeading ? fontBold : font,
            color: isHeading ? primaryC : textC,
            maxWidth: contentMaxWidth(),
          });
          y -= isHeading ? 16 : 13;
        }
        if (!isList) y -= isHeading ? 4 : 2;
      }
      drawWatermark(page);
    };

    const drawProductBlocks = () => {
      const products = (t.composed_products ?? []).filter(Boolean);
      if (!products.length) return;
      startContentPage("SCHEDE PRODOTTO");
      const x = contentLeftX();
      const w = contentMaxWidth();
      for (const product of products) {
        ensureSpace(92, "SCHEDE PRODOTTO");
        const cardTop = y;
        const cardH = 82;
        page.drawRectangle({
          x,
          y: cardTop - cardH + 8,
          width: w,
          height: cardH,
          color: accentC,
          borderColor: primaryC,
          borderWidth: 0.4,
        });
        page.drawText(product.product_category || "Prodotto", {
          x: x + 12,
          y: cardTop - 12,
          size: 7.2,
          font: fontBold,
          color: primaryC,
        });
        page.drawText(product.name || "Scheda prodotto", {
          x: x + 12,
          y: cardTop - 28,
          size: 11,
          font: fontBold,
          color: textC,
          maxWidth: w - 24,
        });
        const desc = normalizeTemplateText(product.product_short_description || product.product_long_description);
        if (desc) {
          const descLines = wrapText(desc, 86).slice(0, 2);
          descLines.forEach((line, idx) => {
            page.drawText(line, {
              x: x + 12,
              y: cardTop - 44 - (idx * 11),
              size: 8,
              font,
              color: grayC,
              maxWidth: w - 24,
            });
          });
        }
        const specs = Array.isArray(product.product_specs) ? product.product_specs.slice(0, 3) : [];
        if (specs.length) {
          const specText = specs
            .filter((s: any) => s?.label || s?.value)
            .map((s: any) => `${s.label}: ${s.value}`.trim())
            .join("  ·  ");
          if (specText) {
            page.drawText(specText.substring(0, 130), {
              x: x + 12,
              y: cardTop - 68,
              size: 7.2,
              font,
              color: textC,
              maxWidth: w - 150,
            });
          }
        }
        if (product.product_indicative_price !== null && product.product_indicative_price !== undefined) {
          const unit = product.product_unit ? `/${product.product_unit}` : "";
          page.drawText(`${fmtEur(Number(product.product_indicative_price))}${unit}`, {
            x: x + w - 125,
            y: cardTop - 68,
            size: 10,
            font: fontBold,
            color: primaryC,
          });
        }
        y -= cardH + 12;
      }
      drawWatermark(page);
    };

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
        page.drawText(String(quote.title).slice(0, 82), { x: margin, y: hy, size: 12, font, color: headerTextC });
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
      if (quote.title) { page.drawText(String(quote.title).slice(0, 82), { x: margin, y, size: 11, font, color: grayC }); y -= 14; }
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
      if (quote.title) { page.drawText(String(quote.title).slice(0, 82), { x: contentX, y, size: 11, font, color: grayC }); y -= 14; }
      if (t.cover_tagline) { page.drawText(t.cover_tagline, { x: contentX, y, size: 10, font: fontItalic, color: primaryC }); y -= 16; }
    } else {
      // Classic premium (default) — header brand su bianco, barra bicolore,
      // titolo centrato, box Dati azienda/cliente, Oggetto, Luogo + Data.

      // ── Header: logo + nome a sinistra, contatti a destra col filetto ──
      let nameX = margin;
      if (logoEmbed && t.show_logo) {
        const maxH = 42;
        const scale = Math.min(maxH / logoEmbed.height, 110 / logoEmbed.width);
        const w = logoEmbed.width * scale;
        const h = logoEmbed.height * scale;
        page.drawImage(logoEmbed, { x: margin, y: pageHeight - 30 - h, width: w, height: h });
        nameX = margin + w + 12;
      }
      // Il nome non deve invadere il blocco contatti (filetto a x=330): larghezza
      // dinamica rispetto a nameX (che cresce col logo) + troncamento con ellissi.
      const nameMaxW = 330 - nameX - 10;
      let companyNameTxt = String(company?.name || "Azienda");
      if (textW(companyNameTxt, 16, fontBold) > nameMaxW) {
        while (companyNameTxt.length > 1 && textW(companyNameTxt + "…", 16, fontBold) > nameMaxW) {
          companyNameTxt = companyNameTxt.slice(0, -1);
        }
        companyNameTxt += "…";
      }
      page.drawText(companyNameTxt, { x: nameX, y: pageHeight - 44, size: 16, font: fontBold, color: primaryC, maxWidth: nameMaxW });
      if (t.cover_tagline) {
        page.drawText(String(t.cover_tagline).toUpperCase().slice(0, 50), { x: nameX, y: pageHeight - 58, size: 6.5, font: fontBold, color: grayC });
      }
      page.drawLine({ start: { x: 330, y: pageHeight - 28 }, end: { x: 330, y: pageHeight - 70 }, thickness: 0.7, color: lightGrayC });
      let cy = pageHeight - 36;
      const contactLine = (label: string) => {
        page.drawRectangle({ x: 344, y: cy - 0.5, width: 5, height: 5, color: primaryC });
        page.drawText(label.slice(0, 44), { x: 354, y: cy, size: 7.5, font, color: textC });
        cy -= 12;
      };
      if (company?.address) contactLine(company.address);
      if (company?.phone) contactLine(`Tel. ${company.phone}`);
      if (company?.vat_number) contactLine(`P.IVA ${company.vat_number}`);
      if (company?.email) contactLine(company.email);

      // Barra bicolore sotto l'header
      const barY = pageHeight - 86;
      page.drawRectangle({ x: 0, y: barY, width: pageWidth * 0.72, height: 5, color: primaryC });
      page.drawRectangle({ x: pageWidth * 0.72, y: barY, width: pageWidth * 0.28, height: 5, color: accentStrongC });

      // ── Titolo centrato + riga meta ──
      y = barY - 36;
      const bigTitle = "PREVENTIVO";
      page.drawText(bigTitle, { x: (pageWidth - textW(bigTitle, 26, fontBold)) / 2, y, size: 26, font: fontBold, color: primaryC });
      y -= 17;
      if (quote.title) {
        const sub = String(quote.title).slice(0, 82);
        page.drawText(sub, { x: (pageWidth - textW(sub, 10, fontItalic)) / 2, y, size: 10, font: fontItalic, color: grayC });
        y -= 15;
      }
      const metaParts: string[] = [];
      if (t.show_quote_number) metaParts.push(`N. ${quote.quote_number}`);
      metaParts.push(`Data: ${new Date(quote.created_at).toLocaleDateString("it-IT")}`);
      if (t.show_validity_date && quote.expires_at) {
        metaParts.push(`Valido fino al: ${new Date(quote.expires_at).toLocaleDateString("it-IT")}`);
      }
      const meta = metaParts.join("   ·   ");
      page.drawText(meta, { x: (pageWidth - textW(meta, 9)) / 2, y, size: 9, font, color: textC });
      y -= 24;

      // ── Helper box con chip titolo ──
      const boxW = (contentWidth - 14) / 2;
      const chipBox = (x: number, topY: number, w: number, h: number, label: string) => {
        page.drawRectangle({ x, y: topY - h, width: w, height: h, borderColor: lightGrayC, borderWidth: 0.7 });
        const chipW = Math.min(190, textW(label, 8, fontBold) + 28);
        page.drawRectangle({ x, y: topY - 17, width: chipW, height: 17, color: primaryC });
        page.drawRectangle({ x: x + 8, y: topY - 11.5, width: 5, height: 5, color: accentStrongC });
        page.drawText(label, { x: x + 19, y: topY - 12, size: 8, font: fontBold, color: headerTextC });
      };

      // ── Dati azienda | Dati cliente ──
      const boxTop = y;
      const boxH = 100;
      chipBox(margin, boxTop, boxW, boxH, "DATI AZIENDA");
      chipBox(margin + boxW + 14, boxTop, boxW, boxH, "DATI CLIENTE");
      // Passo 11 + offset 26 (erano 12 e 30): un cliente B2B completo ha 7
      // righe (nome, azienda, indirizzo, CF, P.IVA, tel, email) e col vecchio
      // packing la 7ª — di solito l'email — veniva tagliata in silenzio.
      let ay = boxTop - 26;
      const aLine = (s: string, bold = false) => {
        if (ay < boxTop - boxH + 8) return;
        page.drawText(s.slice(0, 46), { x: margin + 10, y: ay, size: 8.5, font: bold ? fontBold : font, color: textC });
        ay -= 11;
      };
      if (company?.name) aLine(company.name, true);
      if (company?.address) aLine(company.address);
      if (company?.vat_number) aLine(`P.IVA ${company.vat_number}`);
      if (company?.phone) aLine(`Tel. ${company.phone}`);
      if (company?.email) aLine(`Email: ${company.email}`);
      const bX = margin + boxW + 14 + 10;
      let by = boxTop - 26;
      const bLine = (s: string, bold = false) => {
        if (by < boxTop - boxH + 8) return;
        page.drawText(s.slice(0, 46), { x: bX, y: by, size: 8.5, font: bold ? fontBold : font, color: textC });
        by -= 11;
      };
      if (quote.client_name) bLine(quote.client_name, true);
      if (quote.client_company) bLine(quote.client_company);
      if (quote.client_address) bLine(quote.client_address);
      if (quote.client_fiscal_code) bLine(`Cod. Fisc. ${quote.client_fiscal_code}`);
      if (quote.client_vat_number) bLine(`P.IVA ${quote.client_vat_number}`);
      if (quote.client_phone) bLine(`Tel. ${quote.client_phone}`);
      if (quote.client_email) bLine(`Email: ${quote.client_email}`);
      y = boxTop - boxH - 14;

      // ── Oggetto dell'intervento ──
      if (quote.description || quote.title) {
        const ogText = String(quote.description || quote.title).replace(/\s+/g, " ");
        const ogLines = wrapText(ogText, 106).slice(0, 3);
        const ogH = 34 + ogLines.length * 11;
        chipBox(margin, y, contentWidth, ogH, "OGGETTO DELL'INTERVENTO");
        ogLines.forEach((l, li) => {
          page.drawText(l, { x: margin + 10, y: y - 29 - li * 11, size: 8.5, font, color: textC });
        });
        y -= ogH + 14;
      }

      // ── Luogo intervento | Data ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const luogo = (quote as any).indirizzo_lavori || quote.client_address;
      if (luogo) {
        const smallH = 44;
        chipBox(margin, y, boxW, smallH, "LUOGO INTERVENTO");
        page.drawText(String(luogo).slice(0, 46), { x: margin + 10, y: y - 31, size: 8.5, font, color: textC });
        chipBox(margin + boxW + 14, y, boxW, smallH, "DATA");
        page.drawText(new Date(quote.created_at).toLocaleDateString("it-IT"), { x: bX, y: y - 31, size: 8.5, font, color: textC });
        y -= smallH + 14;
      }
    }

    // Client info (solo layout non-classic: nel classic è già nei box dedicati)
    const boldLeftX = t.layout === "bold" ? 100 : margin;
    if (!classicPremium && t.show_client_details) {
      y -= 20;
      page.drawText("DESTINATARIO", { x: boldLeftX, y, size: 10, font: fontBold, color: grayC }); y -= 16;
      // Slice come nel classic: senza, un campo lungo esce dal bordo destro.
      if (quote.client_name) { page.drawText(String(quote.client_name).slice(0, 60), { x: boldLeftX, y, size: 11, font: fontBold, color: textC }); y -= 15; }
      if (quote.client_company) { page.drawText(String(quote.client_company).slice(0, 85), { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_email) { page.drawText(String(quote.client_email).slice(0, 85), { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_phone) { page.drawText(String(quote.client_phone).slice(0, 85), { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_fiscal_code) { page.drawText(`CF: ${String(quote.client_fiscal_code).slice(0, 80)}`, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_vat_number) { page.drawText(`P.IVA: ${String(quote.client_vat_number).slice(0, 80)}`, { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
      if (quote.client_address) { page.drawText(String(quote.client_address).slice(0, 85), { x: boldLeftX, y, size: 10, font, color: textC }); y -= 14; }
    }

    // (niente secondo blocco "Oggetto": nel layout classic il titolo è già
    // stampato nell'header sopra il destinatario — evitiamo il doppione)

    if (!classicPremium && quote.description) {
      y -= 10;
      page.drawText(quote.description.substring(0, 300), { x: boldLeftX, y, size: 9, font, color: grayC, maxWidth: t.layout === "bold" ? contentWidth - 50 : contentWidth }); y -= 14;
    }

    drawWatermark(page);

    // ─── Items table + totali ───
    // Blocco SEMPRE eseguito: header e righe della tabella sono guardati da
    // items.length, ma totali/finanziamento/QR/firme devono comparire anche su
    // un preventivo senza righe visibili (tutte mostra_nel_pdf=false, oppure
    // lump-sum). Prima erano dentro `if (items.length > 0)` e sparivano.
    {
      // Nel classic la tabella resta sulla prima pagina se c'è spazio
      // (documento monopagina come da impaginazione professionale).
      if (!classicPremium || y < 280) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      if (t.layout === "bold") {
        page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
      }

      const itemLeftX = t.layout === "bold" ? 100 : margin;
      const itemWidth = t.layout === "bold" ? contentWidth - 50 : contentWidth;

      if (!classicPremium && items.length > 0) {
        page.drawText("DETTAGLIO PRODOTTI E SERVIZI", { x: itemLeftX, y, size: 12, font: fontBold, color: primaryC });
        y -= 25;
      }

      // Colonne: N. | DESCRIZIONE | Q.TÀ | U.M. | PREZZO UNIT. | IVA | TOTALE
      // (numeri allineati a destra; lo sconto riga, se presente, è accodato al prezzo)
      const nX = itemLeftX + 4;
      const descX = itemLeftX + 26;
      // Q.tà spostata a -220 (era -200) per dare respiro alla colonna prezzo:
      // con lo sconto riga accodato il prezzo può arrivare a ~80pt e con il
      // vecchio layout invadeva la cella U.M.
      const qtyRight = itemLeftX + itemWidth - 220;
      const umX = qtyRight + 10;
      const umMaxW = 30; // cella U.M.: oltre → troncamento per larghezza misurata
      const priceRight = itemLeftX + itemWidth - 90;
      // Bordo sinistro GARANTITO della colonna prezzo: il prezzo non scende mai
      // sotto questa x, così non tocca mai la U.M. (fine cella = umX + umMaxW).
      const priceLeftBound = umX + umMaxW + 8;
      // IVA a -70 (≈475): lascia 64pt alla colonna TOTALE (i totali riga da
      // 100.000+ € sono larghi ~50pt) senza invadere PREZZO UNIT. a sinistra.
      const ivaRight = itemLeftX + itemWidth - 70;
      const totRight = itemLeftX + itemWidth - 6;

      const drawTableHeader = () => {
        page.drawRectangle({ x: itemLeftX, y: y - 6, width: itemWidth, height: 20, color: primaryC });
        page.drawText("N.", { x: nX, y, size: 8, font: fontBold, color: headerTextC });
        page.drawText("DESCRIZIONE", { x: descX, y, size: 8, font: fontBold, color: headerTextC });
        drawRight(page, "Q.TÀ", qtyRight, y, 8, fontBold, headerTextC);
        page.drawText("U.M.", { x: umX, y, size: 8, font: fontBold, color: headerTextC });
        drawRight(page, "PREZZO UNIT.", priceRight, y, 8, fontBold, headerTextC);
        drawRight(page, "IVA", ivaRight, y, 8, fontBold, headerTextC);
        drawRight(page, "TOTALE", totRight, y, 8, fontBold, headerTextC);
        y -= 24;
      };
      // Header solo se ci sono righe da mostrare (con 0 righe si va dritti ai totali).
      if (items.length > 0) drawTableHeader();
      let rowNumber = 0;

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
            // La tabella continua: ridisegna l'intestazione delle colonne
            drawTableHeader();
          }

          // Nota row: italic text only
          if (isNota) {
            page.drawText((item.name || "").substring(0, 90), { x: descX, y, size: 8, font: fontItalic, color: grayC, maxWidth: itemWidth - 30 });
            y -= 14;
            continue;
          }

          // Subtotale row: line + bold text
          if (isSubtotale) {
            page.drawLine({ start: { x: itemLeftX, y: y + 5 }, end: { x: itemLeftX + itemWidth, y: y + 5 }, thickness: 0.5, color: lightGrayC });
            const subVal = items.slice(0, idx).reduce((s: number, i: any) => {
              if ((i as any).is_optional) return s;
              const lt = (i as any).line_total;
              const amt = lt != null && lt !== ""
                ? Number(lt)
                : i.quantity * i.unit_price * (1 - (i.discount_percent || 0) / 100);
              return s + amt;
            }, 0);
            page.drawText("Subtotale", { x: descX, y, size: 9, font: fontBold, color: textC });
            drawRight(page, fmtEur(subVal), totRight, y, 9, fontBold, primaryC);
            y -= 18;
            continue;
          }

          rowNumber += 1;
          // Sotto-descrizione solo se aggiunge informazione (spesso è un
          // prefisso/duplicato del nome, es. estrazioni AI)
          const hasDesc = !!(
            item.description &&
            item.description !== item.name &&
            !String(item.name).toLowerCase().includes(String(item.description).toLowerCase().trim())
          );
          const rowH = hasDesc ? 29 : 18;

          // Alternate row background (zebra)
          if (rowNumber % 2 === 1) {
            page.drawRectangle({ x: itemLeftX, y: y - (rowH - 12), width: itemWidth, height: rowH, color: isChild ? rgb(0.97, 0.97, 0.97) : accentC });
          }

          // Name prefix for child rows / optional
          let namePrefix = "";
          if (isChild) namePrefix = "  - "; // niente U+2514: non \u00e8 WinAnsi, pdf-lib lancerebbe
          if (isOptional) namePrefix += "[OPZIONALE] ";

          const rawName = namePrefix + (item.name || "");
          const nameText = rawName.length > 42 ? rawName.slice(0, 41) + "…" : rawName;
          const rowColor = isChild ? grayC : textC;

          // Q.tà formato italiano, U.M. in colonna separata, sconto riga accodato al prezzo
          const qtyText = Number(item.quantity ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          // U.M. troncata per LARGHEZZA misurata (non per numero di caratteri):
          // una unità di misura larga non deve invadere la colonna prezzo.
          let umText = String(item.unit_of_measure || "pz");
          while (umText.length > 1 && textW(umText, 8.5) > umMaxW) umText = umText.slice(0, -1);
          const showDiscount = (quote as any).pdf_mostra_sconti !== false && pdfImp.pdf_mostra_sconti !== false;
          const discPct = Number(item.discount_percent || 0);
          const priceBase = fmtEur(Number(item.unit_price || 0));
          // Sconto riga accodato al prezzo SOLO se la stringa completa entra
          // nella cella prezzo senza scavalcare il bordo sinistro garantito
          // (quindi senza mai toccare la colonna U.M.).
          let priceText = priceBase;
          if (showDiscount && discPct > 0) {
            const withDisc = `${priceBase} (-${discPct}%)`;
            if (priceRight - textW(withDisc, 8.5) >= priceLeftBound) priceText = withDisc;
          }
          const vatText = `${Number(item.vat_rate || 0)}%`;
          // null-safe: un line_total legittimamente 0 (riga omaggio / 100% sconto)
          // NON deve ricadere sul calcolo (|| inghiottiva lo zero).
          const ltRaw = (item as any).line_total;
          const lineTotal = ltRaw != null && ltRaw !== ""
            ? Number(ltRaw)
            : Number(item.quantity) * Number(item.unit_price) * (1 - discPct / 100);

          page.drawText(String(rowNumber), { x: nX, y, size: 8.5, font, color: grayC });
          page.drawText(nameText, { x: descX, y, size: 8.5, font, color: rowColor });
          const showPrezziRiga = (quote as any).pdf_mostra_prezzi_per_riga !== false;
          drawRight(page, qtyText, qtyRight, y, 8.5, font, rowColor);
          page.drawText(umText, { x: umX, y, size: 8.5, font, color: rowColor });
          if (showPrezziRiga) {
            drawRight(page, priceText, priceRight, y, 8.5, font, rowColor);
            drawRight(page, vatText, ivaRight, y, 8.5, font, rowColor);
          }
          drawRight(page, fmtEur(lineTotal), totRight, y, 8.5, fontBold, isOptional ? grayC : textC);
          y -= 12;

          if (hasDesc) {
            page.drawText(item.description.substring(0, 85), { x: descX, y, size: 7, font, color: grayC });
            y -= 11;
          }
          y -= 6;
        }
      }

      // Guardia fondo pagina condivisa da totali, box finanziamento, QR e
      // sezioni finali classic: senza, i blocchi finivano sotto la banda footer.
      const newPageIfNeeded = (needed: number) => {
        if (y < needed) {
          drawWatermark(page);
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
          if (t.layout === "bold") {
            page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
          }
        }
      };

      // Totals — blocco a destra, valori allineati a destra, TOTALE su barra colorata
      y -= 12;
      const totBoxW = 220;
      const totX = itemLeftX + itemWidth - totBoxW;
      const totValX = itemLeftX + itemWidth - 6;
      newPageIfNeeded(150);
      page.drawLine({ start: { x: totX, y: y + 6 }, end: { x: itemLeftX + itemWidth, y: y + 6 }, thickness: 0.6, color: lightGrayC });

      const drawTotal = (label: string, value: string, bold = false) => {
        if (bold) {
          // Barra TOTALE in evidenza (respiro di 5pt dalla riga precedente)
          y -= 5;
          page.drawRectangle({ x: totX, y: y - 6, width: totBoxW, height: 21, color: accentStrongC });
          page.drawText(classicPremium ? "TOTALE PREVENTIVO" : label, { x: totX + 8, y, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });
          drawRight(page, value, totValX, y, 10.5, fontBold, rgb(1, 1, 1));
          y -= 24;
          return;
        }
        page.drawText(label, { x: totX + 8, y, size: 9, font, color: textC });
        drawRight(page, value, totValX, y, 9, font, textC);
        y -= 15;
      };

      // ── FOOTING garantito al centesimo: SUBTOTALE − Sconto + ΣIVA = TOTALE ──
      // Valori AUTORITATIVI stored (subtotal / total). L'IVA è DERIVATA dal
      // totale (non fidata a quote.vat_amount, che a monte può divergere per
      // gli arrotondamenti a catena). Calcolati PRIMA di disegnarli.
      const round2q = (n: number) => Math.round(n * 100) / 100;
      const subTotShown = round2q(Number(quote.subtotal || 0));
      const totShown = round2q(Number(quote.total || 0));
      let scontoShown = round2q(Number(quote.discount_amount || 0));
      let ivaToShow = round2q(totShown - (subTotShown - scontoShown));
      if (ivaToShow < 0) {
        // Preventivo (quasi) esente con sconto: uno scarto di arrotondamento
        // ≤1 cent renderebbe l'IVA negativa. Lo assorbiamo nello SCONTO (già
        // esposto), così l'IVA resta ≥ 0 e il documento torna comunque.
        scontoShown = round2q(scontoShown - ivaToShow);
        ivaToShow = 0;
      }

      drawTotal("SUBTOTALE", `${fmtEur(subTotShown)}`);
      if (Number(quote.discount_percent || 0) > 0) {
        drawTotal(`Sconto ${quote.discount_percent}%`, `- ${fmtEur(scontoShown)}`);
      }

      const ivaBreakdown: Record<number, number> = {};
      const discFactor = 1 - Number(quote.discount_percent || 0) / 100;
      for (const item of items.filter((i: any) => !i.is_optional)) {
        const rate = Number(item.vat_rate ?? 22);
        const lt = (item as any).line_total;
        const lineAmt = lt != null && lt !== ""
          ? Number(lt)
          : Number(item.quantity) * Number(item.unit_price) * (1 - Number(item.discount_percent || 0) / 100);
        ivaBreakdown[rate] = (ivaBreakdown[rate] || 0) + lineAmt * (rate / 100);
      }
      const ivaRates = Object.keys(ivaBreakdown).map(Number).sort((a, b) => a - b);
      // Aliquote che contribuiscono davvero (≥ 0,01 € dopo sconto globale).
      const positiveRates = ivaRates.filter((r) => ivaBreakdown[r] * discFactor >= 0.005);

      if (positiveRates.length > 1) {
        // Più aliquote: ciascuna arrotondata, poi il residuo di arrotondamento
        // viene assorbito dalla riga di VALORE MASSIMO (mai negativa: dominare
        // il residuo di ±0.01 è garantito). Così Σrighe = ESATTAMENTE ivaToShow.
        const rows = positiveRates.map((rate) => ({ rate, value: round2q(ivaBreakdown[rate] * discFactor) }));
        const sumRows = round2q(rows.reduce((s, r) => s + r.value, 0));
        const residual = round2q(ivaToShow - sumRows);
        if (residual !== 0) {
          let maxI = 0;
          for (let i = 1; i < rows.length; i++) if (rows[i].value > rows[maxI].value) maxI = i;
          rows[maxI].value = round2q(rows[maxI].value + residual);
        }
        for (const r of rows) drawTotal(`IVA ${r.rate}%`, `${fmtEur(r.value)}`);
      } else {
        // Aliquota unica (o tutte a 0): una sola riga IVA = ivaToShow.
        const soleRate = positiveRates.length === 1
          ? positiveRates[0]
          : (ivaRates.length === 1 ? ivaRates[0] : null);
        drawTotal(`IVA${soleRate != null ? ` ${soleRate}%` : ""}`, `${fmtEur(ivaToShow)}`);
      }

      drawTotal("TOTALE", `${fmtEur(totShown)}`, true);

      // ── Box Finanziamento (se presente nel preventivo) ─────────────
      // I 6 campi quotes.financing_* vengono popolati dal QuoteBuilder
      // quando l'utente attiva la proposta di finanziamento. Mostriamo
      // un box evidenziato sotto il totale: "Oppure paga in NN rate da €X".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fin = quote as any;
      if (fin.financing_monthly_rate != null && fin.financing_num_installments) {
        // Con sconto + più aliquote IVA il box (56pt + testi) finiva sotto la
        // banda footer: guardia prima di disegnarlo.
        newPageIfNeeded(80);
        y -= 10;
        const finBoxX = totX - 10;
        // Bordo destro allineato al contenuto (itemLeftX + itemWidth): la
        // formula precedente (totValX + 50 …) portava il box a x≈599, oltre il
        // bordo pagina (595.28) e ~54pt fuori dal margine dei contenuti.
        const finBoxW = (itemLeftX + itemWidth) - finBoxX;
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
        const rataStr = `${fmtEur(Number(fin.financing_monthly_rate))}`;
        page.drawText(rataStr, {
          x: finBoxX + 8, y: y - 8,
          size: 18, font: fontBold, color: blueAccent,
        });
        // " × N rate" — posizionato con la LARGHEZZA MISURATA della rata (la
        // stima char × 9 disallineava il testo con importi a più cifre).
        const rataW = textW(rataStr, 18, fontBold);
        page.drawText(`× ${fin.financing_num_installments} rate`, {
          x: finBoxX + 8 + rataW + 8, y: y - 4,
          size: 9, font: font, color: textC,
        });
        // Riga TAN/totale dovuto
        const tan = fin.financing_calculation_json?.tan;
        const totDue = fmtEur(Number(fin.financing_total_due ?? 0));
        const detailLine = `Tot. dovuto ${totDue}${tan ? ` · TAN ${Number(tan).toFixed(2)}%` : ""}`;
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
      if ((quote as any).firma_digitale_abilitata && (quote as any).signature_token) {
        try {
          // QR (55pt) + etichetta: senza guardia usciva dal fondo pagina.
          newPageIfNeeded(100);
          const siteUrl = branding?.siteUrl || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
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

      // ── Sezioni finali classic: condizioni/tempi/note + firme ──
      // (riusa la newPageIfNeeded condivisa definita sopra i totali)
      if (classicPremium) {
        // Tre colonne informative (solo quelle con contenuto)
        const infoCols: Array<{ label: string; text: string }> = [];
        const payTxt = normalizeTemplateText(t.payment_terms_text);
        const delTxt = normalizeTemplateText(t.delivery_terms_text);
        const noteTxt = normalizeTemplateText(quote.notes) ||
          `Il presente preventivo ha validità di ${quote.validity_days ?? t.validity_days ?? 30} giorni dalla data indicata. Eventuali variazioni saranno concordate per iscritto.`;
        if (t.show_payment_terms && payTxt) infoCols.push({ label: "CONDIZIONI DI PAGAMENTO", text: payTxt });
        if (t.show_delivery_terms && delTxt) infoCols.push({ label: "TEMPI DI ESECUZIONE", text: delTxt });
        if (t.show_notes) infoCols.push({ label: "NOTE", text: noteTxt });

        if (infoCols.length > 0) {
          newPageIfNeeded(190);
          const gap = 12;
          const colW = (contentWidth - gap * (infoCols.length - 1)) / infoCols.length;
          const maxChars = Math.max(20, Math.floor(colW / 3.9));
          const colTop = y;
          let deepest = colTop;
          infoCols.forEach((c, ci) => {
            const cx = margin + ci * (colW + gap);
            page.drawRectangle({ x: cx, y: colTop - 1, width: 6, height: 6, color: primaryC });
            page.drawText(c.label, { x: cx + 11, y: colTop, size: 8, font: fontBold, color: primaryC });
            let ty = colTop - 14;
            for (const line of wrapText(c.text.replace(/\s+/g, " ").slice(0, 320), maxChars).slice(0, 6)) {
              page.drawText(line, { x: cx, y: ty, size: 7.5, font, color: grayC });
              ty -= 10;
            }
            deepest = Math.min(deepest, ty);
          });
          // Filetti verticali tra le colonne
          for (let ci = 1; ci < infoCols.length; ci++) {
            const lx = margin + ci * (colW + gap) - gap / 2;
            page.drawLine({ start: { x: lx, y: colTop + 6 }, end: { x: lx, y: deepest + 4 }, thickness: 0.5, color: lightGrayC });
          }
          y = deepest - 18;
        }

        // Riquadri firma
        newPageIfNeeded(110);
        const sigW = (contentWidth - 14) / 2;
        const sigH = 66;
        const sigBox = (x: number, label: string) => {
          page.drawRectangle({ x, y: y - sigH, width: sigW, height: sigH, borderColor: lightGrayC, borderWidth: 0.7 });
          page.drawText(label, { x: x + (sigW - textW(label, 8.5, fontBold)) / 2, y: y - 15, size: 8.5, font: fontBold, color: primaryC });
          page.drawLine({ start: { x: x + 24, y: y - sigH + 26 }, end: { x: x + sigW - 24, y: y - sigH + 26 }, thickness: 0.6, color: grayC });
          page.drawText("Data ____ / ____ / ________", { x: x + 24, y: y - sigH + 10, size: 7.5, font, color: grayC });
        };
        sigBox(margin, "FIRMA CLIENTE");
        sigBox(margin + sigW + 14, `FIRMA ${String(company?.name ?? "AZIENDA").toUpperCase().slice(0, 26)}`);
        y -= sigH + 12;
      }

      drawWatermark(page);
    }

    drawProductBlocks();

    for (const section of (t.composed_sections ?? [])) {
      drawRichTextBlock(section.name || "Sezione", section.body_html);
    }

    if (t.show_contractual_terms && t.contractual_terms_text) {
      drawRichTextBlock("CONDIZIONI CONTRATTUALI", t.contractual_terms_text);
    }

    if (t.show_legal_terms && t.legal_terms_text) {
      drawRichTextBlock("TERMINI LEGALI E PRIVACY", t.legal_terms_text);
    }

    // ─── Notes page ───
    // Nel classic le note brevi sono già nella colonna NOTE: pagina dedicata
    // solo se il testo è lungo.
    if (t.show_notes && quote.notes && (!classicPremium || String(quote.notes).length > 320)) {
      // Riga per riga con guardia di pagina (stesso pattern di drawRichTextBlock):
      // il drawText monolitico faceva finire il testo lungo sotto la banda footer.
      const notesTitle = "NOTE E CONDIZIONI";
      startContentPage(notesTitle);
      const noteX = contentLeftX();
      const noteMaxChars = t.layout === "bold" ? 86 : 96;
      for (const rawLine of String(quote.notes).substring(0, 2000).split(/\n/)) {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          y -= 8;
          continue;
        }
        for (const line of wrapText(trimmed, noteMaxChars)) {
          ensureSpace(18, notesTitle);
          page.drawText(line, { x: noteX, y, size: 9, font, color: textC, maxWidth: contentMaxWidth() });
          y -= 13;
        }
      }
      drawWatermark(page);
    }

    // ─── Pagina finale "Anteprima render AI" (ponte render→preventivo) ───
    // Se il preventivo è nato dal wizard render (quotes.render_url), il PDF
    // chiude con l'immagine fotorealistica + disclaimer. Best-effort: qualunque
    // errore (fetch, formato webp non incorporabile da pdf-lib) salta la pagina
    // senza far fallire la generazione.
    if (quote.render_url && typeof quote.render_url === "string") {
      try {
        const imgResp = await fetch(quote.render_url, { signal: AbortSignal.timeout(15_000) });
        if (imgResp.ok) {
          const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
          let renderImg: { width: number; height: number } | null = null;
          if (imgBytes[0] === 0x89 && imgBytes[1] === 0x50) {
            renderImg = await pdfDoc.embedPng(imgBytes);
          } else if (imgBytes[0] === 0xff && imgBytes[1] === 0xd8) {
            renderImg = await pdfDoc.embedJpg(imgBytes);
          } else {
            console.warn("[generate-quote-pdf] render_url in formato non PNG/JPEG (webp?): pagina render saltata");
          }
          if (renderImg) {
            const rp = pdfDoc.addPage([pageWidth, pageHeight]);
            rp.drawText("ANTEPRIMA RENDER AI", {
              x: margin, y: pageHeight - margin - 18, size: 16, font: fontBold, color: primaryC,
            });
            rp.drawText("Visualizzazione fotorealistica dell'intervento proposto", {
              x: margin, y: pageHeight - margin - 34, size: 9.5, font, color: grayC,
            });
            const imgTop = pageHeight - margin - 52;
            const imgBottom = margin + 58; // riserva per il disclaimer
            const maxW = contentWidth;
            const maxH = imgTop - imgBottom;
            const ratio = Math.min(maxW / renderImg.width, maxH / renderImg.height);
            const w = renderImg.width * ratio;
            const h = renderImg.height * ratio;
            // deno-lint-ignore no-explicit-any
            rp.drawImage(renderImg as any, {
              x: margin + (maxW - w) / 2,
              y: imgTop - h,
              width: w,
              height: h,
            });
            const disclaimer =
              "Render generato con intelligenza artificiale a scopo esclusivamente dimostrativo e illustrativo. " +
              "L'immagine non rappresenta il risultato finale dell'intervento, che potrà variare in base a rilievi " +
              "tecnici, materiali scelti, misure reali, condizioni dell'ambiente e fattibilità esecutiva.";
            let dy = margin + 40;
            for (const line of wrapText(disclaimer, 110).slice(0, 4)) {
              rp.drawText(line, { x: margin, y: dy, size: 7.5, font: fontItalic, color: grayC });
              dy -= 10;
            }
            drawWatermark(rp);
          }
        } else {
          console.warn(`[generate-quote-pdf] fetch render_url fallito (${imgResp.status}): pagina render saltata`);
        }
      } catch (e) {
        console.warn("[generate-quote-pdf] pagina render saltata:", e);
      }
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
    console.log(`[generate-quote-pdf] ${quote?.quote_number ?? "?"} — dati+render in ${Date.now() - startedAt}ms`);
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
      return jsonResponse({ success: true, pdf_base64: base64 }, 200, corsH);
    }

    // ─── Save to storage ───
    const pdfBytes = await pdfDoc.save();
    const fileName = `${quote.company_id}/${quote.quote_number.replace(/\//g, "-")}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return errorResponse("Errore upload PDF: " + uploadErr.message, 500, corsH);
    }

    // Update del record e firma URL sono indipendenti: in parallelo
    const [, signedRes] = await Promise.all([
      supabaseAdmin
        .from("quotes")
        .update({ pdf_storage_path: fileName, pdf_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", quote_id),
      supabaseAdmin.storage.from("quote-pdfs").createSignedUrl(fileName, 3600),
    ]);
    const signedData = signedRes.data;

    return jsonResponse({
      success: true,
      pdf_path: fileName,
      signed_url: signedData?.signedUrl || null,
    }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("generate-quote-pdf error:", e);
    return errorResponse("Errore interno", 500, corsH);
  }
});
