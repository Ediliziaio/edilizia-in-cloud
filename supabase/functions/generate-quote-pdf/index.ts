import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { PDFDocument, rgb, StandardFonts, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4?target=deno";
// Libreria template componibile: carica i blocchi linkati + sostituisce merge tag
import { fondoPerTestoBianco, scurisci, schiarisci, testoSuChiaro, testoSuScuro, normalizzaHex } from "../_shared/temaColori.ts";
import { loadTemplateWithBlocks, attachLinkedBlocks, applyMergeTagsToTemplate, buildMergeContext, substituteMergeTags, type ComposedTemplate } from "../_shared/quoteTemplateComposer.ts";
import { condizioniStandard, MODULO_RECESSO } from "../_shared/condizioniStandard.ts";
import { testoPerPdf } from "../_shared/testoPerPdf.ts";
import { formatoImmagine, leggiLogo, logoDiRiserva } from "../_shared/logoAzienda.ts";

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

/**
 * Le clausole che il cliente approva con una seconda firma: le voci elencate
 * sotto il titolo dell'art. 1341 c.c. Si leggono dal testo delle condizioni,
 * così valgono anche per quelle scritte dall'azienda; se quel titolo non c'è,
 * la seconda firma non si stampa.
 */
function clausoleDaApprovare(testo: string): string[] {
  const righe = testo.split("\n").map((r) => r.trim());
  const inizio = righe.findIndex((r) => /^#{1,4}\s/.test(r) && /1341|approvare specificamente/i.test(r));
  if (inizio < 0) return [];
  const voci: string[] = [];
  for (const r of righe.slice(inizio + 1)) {
    if (/^#{1,4}\s/.test(r)) break;
    if (/^[-*]\s+/.test(r)) voci.push(r.replace(/^[-*]\s+/, ""));
  }
  return voci;
}

/** Il testo senza la sezione delle clausole da approvare: quella sta nel riquadro. */
function senzaSezioneClausole(testo: string): string {
  const righe = testo.split("\n");
  const inizio = righe.findIndex((r) => /^#{1,4}\s/.test(r.trim()) && /1341|approvare specificamente/i.test(r));
  if (inizio < 0) return testo;
  let fine = righe.length;
  for (let i = inizio + 1; i < righe.length; i++) {
    if (/^#{1,4}\s/.test(righe[i].trim())) { fine = i; break; }
  }
  return [...righe.slice(0, inizio), ...righe.slice(fine)].join("\n").trim();
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
// «always»: il CLDR italiano toglie il punto delle migliaia sotto le cinque
// cifre («3400,00 €» accanto a «12.500,00 €»). In un preventivo sembra una
// svista: stessa regola di formatCurrency nell'app, «3.400,00 €» ovunque.
const FORMATO_EURO = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);
function fmtEur(n: number): string {
  return FORMATO_EURO.format(Number.isFinite(n) ? n : 0) + " €";
}
// Quantità: «4», non «4,00»; i decimali restano solo quando servono («2,5»).
const FORMATO_QUANTITA = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);

// Rimuove i caratteri fuori WinAnsi (le StandardFonts non li codificano).
// I campi utente/AI (client_name, title, item.name, notes, testi template…)
// arrivano spesso con emoji, frecce o simboli matematici: un solo carattere
// fuori set fa lanciare drawText e fallire l'INTERO preventivo.
function winAnsiSafe(str: string): string {
  // Prima si traduce quello che ha un equivalente (la freccia diventa un
  // trattino, «Ivić» diventa «Ivic»): prima sparivano, e «30% → 40%» usciva
  // «30%  40%». Poi il filtro stretto di sempre, che tiene in piedi il PDF.
  // eslint-disable-next-line no-control-regex
  return testoPerPdf(String(str)).replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…€]/g, "");
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
  secondary_color: "#2563EB",
  accent_color: "#EFF6FF",
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
  show_contractual_terms: true,
  show_page_numbers: true,
  show_watermark: false,
  watermark_text: "",
  footer_text: "Grazie per la fiducia. Il tuo referente resta disponibile per ogni chiarimento.",
  cover_tagline: "Una proposta chiara, pensata per il tuo progetto.",
  cover_title: "Il tuo *progetto*, spiegato bene",
  cover_subtitle: "Un'offerta completa con priorità, tempi e investimento trasparenti.",
  payment_terms_text: "Acconto del 30% alla conferma. Eventuali SAL e saldo vengono definiti nel piano di lavoro.",
  delivery_terms_text: "Tempi e calendario vengono confermati dopo il rilievo e la disponibilità dei materiali.",
  // Tipografia e tabella: campi del form salvati da mesi e mai letti qui.
  font_size_base: 10,
  heading_size_scale: 1.7,
  line_height: 1.45,
  row_density: "comfortable",
  table_zebra: true,
  table_borders: "horizontal",
  header_alignment: "left",
  page_margin_mm: 20,
  bank_details: "",
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
    const immaginiRighe = new Map<string, string>(); // «a:<articolo>» / «f:<famiglia>» → foto
    let company: any = null;
    let t: any;
    let attachmentRows: any[] = [];
    let branding: any = null;
    let pdfImp: any = {};
    // Attributi di famiglia: axis_selections salva gli ID dei valori scelti
    // (UUID). Nel PDF vanno i nomi — "Colore: Bianco" — non gli identificativi.
    const nomiAssi = new Map<string, string>();        // "<family_id>:<codice>" → nome asse
    const etichetteValori = new Map<string, string>(); // id valore → label
    // Opzioni PDF scelte sul singolo preventivo (step «Documenti e PDF»).
    // Erano esposte in interfaccia e ignorate qui: l'utente spuntava «mostra
    // misure» e il PDF usciva identico. Default = attivo, come nella UI.
    const opzione = (chiave: string, predefinito = true): boolean => {
      const v = quote?.[chiave];
      return v == null ? predefinito : v !== false;
    };

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
      t = applyMergeTagsToTemplate(t as ComposedTemplate, buildMergeContext({ quote, company, template: t }));
    } else {
      // ─── NORMAL MODE ───
      if (!quote_id) return errorResponse("quote_id richiesto", 400, corsH);

      const quoteRes = await supabaseAdmin.from("quotes").select("*").eq("id", quote_id).single();
      if (quoteRes.error || !quoteRes.data) return errorResponse("Preventivo non trovato", 404, corsH);
      quote = quoteRes.data;
      // Accesso all'azienda del preventivo: azienda principale, accesso
      // multi-azienda o super admin. Prima chi lavora su più aziende prendeva 403.
      await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, corsH);

      // Copia di firma di un preventivo di modulo (source «modulo:…», vedi
      // src/lib/moduli/quoteBridge.ts): il PDF è quello del modulo, caricato dal
      // bridge. Rigenerarlo qui metteva al suo posto un preventivo classico vuoto,
      // ed era quello che il cliente riceveva in firma.
      if (typeof quote.source === "string" && quote.source.startsWith("modulo:")) {
        if (!quote.pdf_storage_path) {
          return errorResponse("Il PDF di questo preventivo si crea dal preventivo del modulo.", 409, corsH);
        }
        const { data: delModulo } = await supabaseAdmin.storage
          .from("quote-pdfs")
          .createSignedUrl(quote.pdf_storage_path, 3600);
        if (!delModulo?.signedUrl) return errorResponse("PDF del preventivo del modulo non disponibile.", 404, corsH);
        return jsonResponse({
          success: true,
          pdf_path: quote.pdf_storage_path,
          signed_url: delModulo.signedUrl,
          da_modulo: true,
          message: "PDF del preventivo del modulo: non si rigenera da qui.",
        }, 200, corsH);
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
          .select("name, email, phone, legal_address, legal_city, logo_url, vat_number, brand_primary_color")
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
      // Le righe non salvano image_url: il builder mostra la foto dell'articolo o
      // della famiglia, il PDF guardava solo quella della riga e con «mostra
      // immagini» acceso non usciva niente.
      if (opzione("pdf_mostra_immagini", false)) {
        type RigaConProdotto = { article_template_id?: string | null; family_id?: string | null };
        const idArticoli = [...new Set((items as RigaConProdotto[]).map((i) => i.article_template_id).filter(Boolean))] as string[];
        const idFamiglie = [...new Set((items as RigaConProdotto[]).map((i) => i.family_id).filter(Boolean))] as string[];
        const [fotoArticoli, fotoFamiglie] = await Promise.all([
          idArticoli.length > 0
            ? supabaseAdmin.from("article_templates").select("id, immagine_url").eq("company_id", quote.company_id).in("id", idArticoli)
            : Promise.resolve({ data: [] }),
          idFamiglie.length > 0
            ? supabaseAdmin.from("article_families").select("id, immagine_url").eq("company_id", quote.company_id).in("id", idFamiglie)
            : Promise.resolve({ data: [] }),
        ]);
        for (const r of (fotoArticoli.data ?? []) as Array<{ id: string; immagine_url: string | null }>) {
          if (r.immagine_url) immaginiRighe.set(`a:${r.id}`, r.immagine_url);
        }
        for (const r of (fotoFamiglie.data ?? []) as Array<{ id: string; immagine_url: string | null }>) {
          if (r.immagine_url) immaginiRighe.set(`f:${r.id}`, r.immagine_url);
        }
      }
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

      const famiglieConAssi = [...new Set(
        items.filter((i: any) => i.family_id && i.axis_selections).map((i: any) => String(i.family_id)),
      )];
      if (famiglieConAssi.length) {
        const idValori = [...new Set(
          items.flatMap((i: any) => Object.values((i.axis_selections ?? {}) as Record<string, unknown>).map(String)),
        )].filter((x) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(x));
        const [assiRes, valoriRes] = await Promise.all([
          supabaseAdmin.from("article_family_axes").select("family_id, nome, codice").in("family_id", famiglieConAssi),
          idValori.length
            ? supabaseAdmin.from("article_family_axis_values").select("id, label, valore").in("id", idValori)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        for (const a of (assiRes.data ?? []) as any[]) nomiAssi.set(`${a.family_id}:${a.codice}`, a.nome);
        for (const vv of (valoriRes.data ?? []) as any[]) etichetteValori.set(vv.id, vv.label || vv.valore);
      }

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
        const mergeCtx = buildMergeContext({ quote, company, contact: prefetchedContact, template: t });
        t = applyMergeTagsToTemplate(t as ComposedTemplate, mergeCtx);
      } catch (e) {
        console.warn("[generate-quote-pdf] merge tag substitution fallita (non bloccante):", e instanceof Error ? e.message : e);
      }
    }

    // Miniature prodotto per riga (opzione «mostra immagini»): scaricate una
    // volta per URL, con timeout breve; qualunque errore = nessuna immagine,
    // mai un PDF che non esce.
    const cacheImmagini = new Map<string, any>();
    async function immagineProdotto(url: string): Promise<any> {
      if (!url || !/^https?:\/\//i.test(url)) return null;
      if (cacheImmagini.has(url)) return cacheImmagini.get(url);
      let img: any = null;
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (resp.ok) {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          if (bytes.length > 0 && bytes.length < 4_000_000) {
            img = bytes[0] === 0x89 && bytes[1] === 0x50 ? await pdfDoc.embedPng(bytes)
              : bytes[0] === 0xff && bytes[1] === 0xd8 ? await pdfDoc.embedJpg(bytes) : null;
          }
        }
      } catch { /* niente immagine */ }
      cacheImmagini.set(url, img);
      return img;
    }

    // Prezzo scritto a mano (21/09/2026): sostituisce la somma delle righe.
    // Con le righe a 0€ mostrare PREZZO/IVA/TOTALE per riga (e il subtotale
    // per categoria) non direbbe niente di vero — si nascondono, come nel
    // documento condiviso degli 8 moduli edili (DocumentoEdilePDF).
    const prezzoManualeAttivo = Number((quote as any)?.prezzo_manuale ?? 0) > 0;

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
    // Margine pagina dal template (mm → pt); 18 mm ≈ il vecchio 50 pt fisso.
    const marginMm = Number(t.page_margin_mm);
    const margin = Number.isFinite(marginMm) && marginMm >= 8 && marginMm <= 40 ? Math.round(marginMm * 2.8346) : 50;
    const contentWidth = pageWidth - margin * 2;
    // ── Tipografia dal template: dimensione base, scala titoli, interlinea,
    // densità righe, zebra, bordi. Erano nel form e nel DB, il PDF li ignorava.
    const fsBase = Number(t.font_size_base);
    const tipoScale = Number.isFinite(fsBase) && fsBase >= 8 && fsBase <= 14 ? fsBase / 10 : 1;
    const sz = (n: number) => Math.round(n * tipoScale * 10) / 10;
    const headingScaleRaw = Number(t.heading_size_scale);
    const hScale = Number.isFinite(headingScaleRaw) && headingScaleRaw >= 1 && headingScaleRaw <= 2.5 ? headingScaleRaw / 1.6 : 1;
    const lineHeightRaw = Number(t.line_height);
    const lhScale = Number.isFinite(lineHeightRaw) && lineHeightRaw >= 1 && lineHeightRaw <= 2 ? lineHeightRaw / 1.4 : 1;
    const densitaRighe = String(t.row_density ?? "normal");
    const rowExtra = densitaRighe === "compact" ? -3 : densitaRighe === "comfortable" ? 4 : 0;
    const zebraOn = t.table_zebra !== false;
    const bordiTabella = String(t.table_borders ?? "horizontal");
    const allineaHeader = String(t.header_alignment ?? "center");
    // Numero di revisione accanto al numero preventivo (solo dalla prima revisione in poi).
    const revisione = Number((quote as any)?.revision_number) || 0;
    const revLabel = revisione > 0 ? ` · Rev. ${revisione}` : "";

    // Kit del marchio: un modello rimasto al blu di fabbrica prende il colore scelto
    // dall'azienda in «Brand & Azienda». Si sceglie una volta, vale per ogni documento.
    const BLU_DI_FABBRICA = "#1E40AF";
    const coloreMarca = normalizzaHex(company?.brand_primary_color);
    if (coloreMarca && (normalizzaHex(t.primary_color) ?? BLU_DI_FABBRICA) === BLU_DI_FABBRICA) {
      t.primary_color = coloreMarca;
    }
    const primaryC = rgbColor(t.primary_color);
    const secondaryC = rgbColor(t.secondary_color);
    const accentC = rgbColor(t.accent_color);
    const textC = rgbColor(t.text_color);
    const headerTextC = rgbColor(t.header_text_color);
    const grayC = rgb(0.4, 0.4, 0.4);
    const lightGrayC = rgb(0.7, 0.7, 0.7);
    // Le tinte del documento edile, dal colore del modello: il fondo per il testo
    // bianco, l'inchiostro del marchio per scrivere sul bianco, la tinta chiara.
    const primarioHex = normalizzaHex(t.primary_color) ?? "#1E40AF";
    const fondoEdC = rgbColor(fondoPerTestoBianco(primarioHex));
    const inkMarcaC = rgbColor(testoSuChiaro(primarioHex));
    const tintaC = rgbColor(schiarisci(primarioHex, 0.93));
    const inchiostroC = rgbColor("#14181F");
    const filettoC = rgbColor("#E3E6EA");
    const grigioEdC = rgbColor("#5B6472");

    // ─── Logo embed ───
    let logoEmbed: any = null;
    const logoPath = logoDiRiserva(t.logo_url, company?.logo_url);
    if (t.show_logo && logoPath) {
      try {
        // Il logo del modello è un percorso nei due bucket dei modelli; quello
        // aziendale è un indirizzo dello storage pubblico (?t=… in coda). Prima
        // anche l'indirizzo si cercava come percorso: senza logo nel modello,
        // il preventivo usciva senza logo.
        const bytes = await leggiLogo(supabaseAdmin, logoPath, {
          supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
          bucket: ["quote-template-assets", "company-assets"],
        });
        const formato = bytes ? formatoImmagine(bytes) : null;
        if (bytes && formato === "png") {
          logoEmbed = await pdfDoc.embedPng(bytes);
        } else if (bytes && formato === "jpg") {
          logoEmbed = await pdfDoc.embedJpg(bytes);
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
    // «Copia cliente / archivio / commerciale»: dicitura in piè di pagina.
    const copiaDest = String(quote?.pdf_copia_destinatario ?? "").trim().toLowerCase();
    const etichettaCopia = copiaDest && copiaDest !== "nessuna" && copiaDest !== "none"
      ? "Copia " + copiaDest.charAt(0).toUpperCase() + copiaDest.slice(1)
      : "";
    function drawPageExtras(page: any, pageNum: number, totalPages: number) {
      if (classicPremium) {
        // Come il documento edile: un filetto, il nome dell'impresa, la pagina.
        // Prima era una banda piena di colore con una striscia arancione.
        page.drawLine({ start: { x: margin, y: 36 }, end: { x: pageWidth - margin, y: 36 }, thickness: 0.6, color: filettoC });
        const footLabel = t.footer_text || `${company?.name ?? ""}${t.cover_tagline ? " — " + t.cover_tagline : ""}`;
        if (footLabel.trim()) {
          page.drawText(winAnsiSafe(String(footLabel)).slice(0, 96), { x: margin, y: 22, size: 7, font: fontBold, color: inchiostroC });
        }
        if (t.show_page_numbers) {
          drawRight(page, `Pag. ${pageNum} / ${totalPages}`, pageWidth - margin, 22, 7, fontBold, inkMarcaC);
        }
        if (etichettaCopia) drawRight(page, etichettaCopia, pageWidth - margin - (t.show_page_numbers ? 60 : 0), 22, 7, fontItalic, grigioEdC);
        return;
      }
      if (etichettaCopia) {
        page.drawText(etichettaCopia, { x: pageWidth / 2 - 30, y: 25, size: 7.5, font: fontItalic, color: grayC });
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
      const wmPreventivo = String(quote?.pdf_watermark_text ?? "").trim();
      const wm = wmPreventivo || ((t.show_watermark && t.watermark_text) ? String(t.watermark_text) : "");
      if (wm) {
        page.drawText(wm.slice(0, 40), {
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
    // PAGINA DI COPERTINA (blocco "Copertina" della libreria o campi inline)
    // ═══════════════════════════════════════
    // Prima di oggi i campi cover_title/cover_subtitle/cover_image_url venivano
    // caricati ma nessuno li disegnava: la copertina collegata non usciva mai.
    // Una pagina dedicata: immagine (se c'è) in alto, titolo grande, sottotitolo,
    // riquadro con numero/data/cliente, azienda in basso. Senza numero di pagina.
    let pagineSenzaFooter = 0;
    const haCopertina = !!(String(t.cover_title ?? "").trim() || String(t.cover_subtitle ?? "").trim() || (t.show_cover_image && t.cover_image_url));
    if (haCopertina) {
      // Stesso linguaggio del «Piano dei lavori» dei moduli edili: pagina nel colore
      // dell'azienda, foto in tinta, titolo con una parola in corsivo (fra asterischi),
      // barra a segmenti e scheda in basso. Prima era una pagina bianca da modulo.
      const cover = pdfDoc.addPage([pageWidth, pageHeight]);
      pagineSenzaFooter = 1;
      const fondoHex = fondoPerTestoBianco(normalizzaHex(t.primary_color) ?? "#1E40AF");
      const scuroHex = scurisci(fondoHex, 0.4);
      const fondoC = rgbColor(fondoHex);
      const scuroC = rgbColor(scuroHex);
      const biancoC = rgb(1, 1, 1);
      const evidenzaC = rgbColor(testoSuScuro(schiarisci(fondoHex, 0.5), scuroHex, 4.5));
      const fontCorsivo = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: scuroC });

      let conFoto = false;
      if (t.show_cover_image && t.cover_image_url) {
        try {
          const path = String(t.cover_image_url);
          const { data: fileData } = await supabaseAdmin.storage.from("quote-template-assets").download(path);
          if (fileData) {
            const bytes = new Uint8Array(await fileData.arrayBuffer());
            const img = bytes[0] === 0x89 && bytes[1] === 0x50 ? await pdfDoc.embedPng(bytes)
              : bytes[0] === 0xff && bytes[1] === 0xd8 ? await pdfDoc.embedJpg(bytes) : null;
            if (img) {
              // A tutta pagina, riempiendo (come object-fit: cover): quel che avanza esce dal foglio.
              const scale = Math.max(pageWidth / img.width, pageHeight / img.height);
              const w = img.width * scale;
              const h = img.height * scale;
              cover.drawImage(img, { x: (pageWidth - w) / 2, y: (pageHeight - h) / 2, width: w, height: h });
              // Il velo nel colore dell'azienda…
              cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: fondoC, opacity: 0.58 });
              // …e l'appoggio per il testo, che sfuma dal basso (pdf-lib non ha le sfumature: fasce sottili).
              const fasce = 40;
              const altezzaSfumata = pageHeight * 0.62;
              for (let i = 0; i < fasce; i++) {
                const quota = 1 - i / fasce; // 1 in basso, 0 in alto
                cover.drawRectangle({
                  x: 0, y: (altezzaSfumata / fasce) * i, width: pageWidth, height: altezzaSfumata / fasce + 0.5,
                  color: scuroC, opacity: Math.min(0.95, quota * quota * 1.05),
                });
              }
              conFoto = true;
            }
          }
        } catch (e) {
          console.warn("[generate-quote-pdf] immagine copertina non caricata (pagina senza immagine):", e instanceof Error ? e.message : e);
        }
      }
      if (!conFoto) {
        // Senza foto: tavola di progetto (griglia sottile, due cerchi, assi tratteggiati).
        cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: fondoC, opacity: 0.55 });
        for (let gx = 35; gx < pageWidth; gx += 35) cover.drawLine({ start: { x: gx, y: 0 }, end: { x: gx, y: pageHeight }, thickness: 0.4, color: biancoC, opacity: 0.07 });
        for (let gy = 35; gy < pageHeight; gy += 35) cover.drawLine({ start: { x: 0, y: gy }, end: { x: pageWidth, y: gy }, thickness: 0.4, color: biancoC, opacity: 0.07 });
        cover.drawCircle({ x: 470, y: pageHeight - 250, size: 190, borderColor: biancoC, borderWidth: 0.8, borderOpacity: 0.16, opacity: 0 });
        cover.drawCircle({ x: 470, y: pageHeight - 250, size: 120, borderColor: biancoC, borderWidth: 0.6, borderOpacity: 0.16, opacity: 0 });
        cover.drawLine({ start: { x: 210, y: pageHeight - 250 }, end: { x: pageWidth, y: pageHeight - 250 }, thickness: 0.6, color: biancoC, opacity: 0.16, dashArray: [6, 5] });
        cover.drawLine({ start: { x: 470, y: pageHeight - 20 }, end: { x: 470, y: pageHeight - 520 }, thickness: 0.6, color: biancoC, opacity: 0.16, dashArray: [6, 5] });
      }

      // In alto: il logo su una targhetta bianca (i loghi nascono per il fondo chiaro), o il nome.
      const margineC = 48;
      const largoC = pageWidth - margineC * 2;
      if (logoEmbed && t.show_logo) {
        const sc = Math.min(40 / logoEmbed.height, 150 / logoEmbed.width);
        const lw = logoEmbed.width * sc, lh = logoEmbed.height * sc;
        cover.drawRectangle({ x: margineC, y: pageHeight - 46 - lh - 16, width: lw + 24, height: lh + 16, color: biancoC });
        cover.drawImage(logoEmbed, { x: margineC + 12, y: pageHeight - 46 - lh - 8, width: lw, height: lh });
      } else if (company?.name) {
        const nome = winAnsiSafe(String(company.name).toUpperCase()).slice(0, 48);
        let nx = margineC;
        for (const ch of nome) { // lettere spaziate: pdf-lib non ha la spaziatura fra i caratteri
          cover.drawText(ch, { x: nx, y: pageHeight - 60, size: 12, font: fontBold, color: biancoC });
          nx += fontBold.widthOfTextAtSize(ch, 12) + 2.1;
        }
      }

      // Barra a segmenti: il segno ricorrente del documento.
      const segmenti = (yy: number, colore: any, spessore: number) => {
        const opacita = [1, 0.72, 0.48, 0.28, 0.14];
        const passo = largoC / opacita.length;
        opacita.forEach((o, i) => cover.drawRectangle({ x: margineC + i * passo, y: yy, width: passo - (i < 4 ? 3 : 0), height: spessore, color: colore, opacity: o }));
      };

      // In basso: la scheda del documento su quattro colonne.
      const dataDoc = quote.created_at ? new Date(quote.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
      const colonne: Array<[string, string]> = [
        ["PREPARATO PER", String(quote.client_name ?? quote.client_company ?? "—")],
        ["INDIRIZZO", String(quote.client_address ?? "—")],
        ["RIFERIMENTO", `${quote.quote_number ?? "—"}${revLabel}`],
        ["DATA", dataDoc],
      ];
      const ySch = 74;
      segmenti(ySch + 34, biancoC, 2);
      const pesi = [1, 1.5, 1, 1];
      const totPesi = pesi.reduce((a, b) => a + b, 0);
      let cxCol = margineC;
      colonne.forEach(([etichetta, valore], i) => {
        const wCol = (largoC * pesi[i]) / totPesi;
        let ex = cxCol;
        for (const ch of etichetta) { cover.drawText(ch, { x: ex, y: ySch + 16, size: 6.5, font: fontBold, color: evidenzaC }); ex += fontBold.widthOfTextAtSize(ch, 6.5) + 1.2; }
        let testo = winAnsiSafe(valore);
        while (testo.length > 3 && fontBold.widthOfTextAtSize(testo, 9.5) > wCol - 12) testo = testo.slice(0, -2);
        if (testo !== winAnsiSafe(valore)) testo = testo.trimEnd() + "…";
        cover.drawText(testo, { x: cxCol, y: ySch, size: 9.5, font: fontBold, color: biancoC });
        cxCol += wCol;
      });

      // Il titolo: nero del carattere, con la parola fra asterischi in corsivo e nel colore d'evidenza.
      const titoloGrezzo = String(t.cover_title ?? "").trim() || "La nostra *offerta* per voi.";
      const corpoT = 38;
      type Parola = { testo: string; accento: boolean };
      const parole: Parola[] = [];
      {
        let inAccento = false;
        for (const pezzo of titoloGrezzo.split(/(\*)/)) {
          if (pezzo === "*") { inAccento = !inAccento; continue; }
          for (const w of pezzo.split(/\s+/).filter(Boolean)) parole.push({ testo: winAnsiSafe(w), accento: inAccento });
        }
      }
      const fontDi = (pa: Parola) => (pa.accento ? fontCorsivo : fontBold);
      const corpoDi = (pa: Parola) => (pa.accento ? corpoT * 1.1 : corpoT);
      const larga = (pa: Parola) => fontDi(pa).widthOfTextAtSize(pa.testo, corpoDi(pa));
      const spazio = fontBold.widthOfTextAtSize(" ", corpoT);
      const righeTitolo: Parola[][] = [[]];
      let wRiga = 0;
      for (const pa of parole) {
        const w = larga(pa);
        if (wRiga > 0 && wRiga + spazio + w > largoC * 0.94) { righeTitolo.push([]); wRiga = 0; }
        righeTitolo[righeTitolo.length - 1].push(pa);
        wRiga += (wRiga > 0 ? spazio : 0) + w;
      }
      const righeT = righeTitolo.slice(0, 4);
      const sottotitolo = winAnsiSafe(String(t.cover_subtitle ?? "").trim() || String(quote.title ?? "").trim());
      const righeSotto = sottotitolo ? wrapText(sottotitolo, 62).slice(0, 3) : [];
      const interlinea = corpoT * 1.2;
      // Dal basso verso l'alto: scheda, sottotitolo, titolo, occhiello.
      let yT = ySch + 34 + 40 + righeSotto.length * 18 + (righeSotto.length ? 14 : 0) + (righeT.length - 1) * interlinea;
      let ex2 = margineC;
      for (const ch of "PREVENTIVO") { cover.drawText(ch, { x: ex2, y: yT + corpoT + 12, size: 8.5, font: fontBold, color: evidenzaC }); ex2 += fontBold.widthOfTextAtSize(ch, 8.5) + 2.4; }
      for (const riga of righeT) {
        let tx = margineC;
        for (const pa of riga) {
          cover.drawText(pa.testo, { x: tx, y: yT, size: corpoDi(pa), font: fontDi(pa), color: pa.accento ? evidenzaC : biancoC });
          tx += larga(pa) + spazio;
        }
        yT -= interlinea;
      }
      let yS = yT + interlinea - 26;
      for (const riga of righeSotto) {
        cover.drawText(riga, { x: margineC, y: yS, size: 12.5, font, color: biancoC, opacity: 0.86 });
        yS -= 18;
      }
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
      page.drawText(title, { x, y, size: 13, font: fontBold, color: classicPremium ? inchiostroC : primaryC });
      y -= 22;
      if (classicPremium) page.drawRectangle({ x, y: y + 7, width: pageWidth - margin - x, height: 1, color: inchiostroC });
      else page.drawLine({ start: { x, y: y + 8 }, end: { x: pageWidth - margin, y: y + 8 }, thickness: 0.6, color: accentC });
    };

    // Sezione breve (le note): prosegue sulla pagina in corso se c'è posto,
    // col suo titolo; pagina nuova solo se non ci sta. Prima le note andavano
    // SEMPRE su un foglio a parte, anche quando erano tre righe.
    const startSection = (title: string, spazioMinimo: number) => {
      if (y <= margin + spazioMinimo) {
        drawWatermark(page);
        startContentPage(title);
        return;
      }
      y -= 14;
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

    const drawRichTextBlock = async (title: string, body: unknown, opts: { titoloDalTesto?: boolean; fontFamily?: string | null } = {}) => {
      // Ogni blocco della libreria può avere il suo carattere (helvetica/times/courier):
      // se impostato vale per questa sezione, altrimenti quello del master.
      const famBlocco = opts.fontFamily && opts.fontFamily !== t.font_family ? opts.fontFamily : null;
      const fontB = famBlocco ? await getFont(pdfDoc, famBlocco, "normal") : font;
      const fontBoldB = famBlocco ? await getFont(pdfDoc, famBlocco, "bold") : fontBold;
      // L'editor rich text salva HTML: i titoli <h1-4> diventano heading
      // markdown (# …) così sotto vengono resi in grassetto e colore primario
      // invece di sparire nel testo piatto.
      const conHeading = String(body ?? "").replace(/<h([1-4])[^>]*>/gi, (_m, n: string) => `\n${"#".repeat(Number(n))} `);
      let text = normalizeTemplateText(conHeading);
      if (!text) return;
      // Se il testo apre con un titolo di primo livello, non lo ripetiamo sotto
      // l'intestazione di pagina. Per le sezioni libere (titoloDalTesto) quel
      // titolo DIVENTA l'intestazione: il nome del blocco è un'etichetta di
      // libreria ("Chi siamo v2"), non un titolo da stampare.
      const primaRiga = text.split(/\n/)[0].trim();
      const primoH1 = /^#\s+(.+)$/.exec(primaRiga)?.[1]?.trim();
      if (primoH1 && (opts.titoloDalTesto || primoH1.toLowerCase() === String(title).toLowerCase())) {
        if (opts.titoloDalTesto) title = primoH1;
        text = text.split(/\n/).slice(1).join("\n").trim();
      }
      startContentPage(title);
      const x = contentLeftX();
      const maxChars = t.layout === "bold" ? 86 : 96;
      let precedenteEraHeading = true; // in testa alla pagina niente spazio extra
      for (const rawLine of text.split(/\n+/)) {
        const trimmed = rawLine.trim();
        if (!trimmed) {
          y -= 8;
          continue;
        }
        const livello = /^(#{1,4})\s+/.exec(trimmed)?.[1].length ?? 0;
        const isHeading = livello > 0;
        const isList = /^[-*]\s+/.test(trimmed);
        // "-" al posto di "•": il bullet non è garantito in WinAnsi e sparirebbe.
        const normalized = trimmed
          .replace(/^#{1,4}\s+/, "")
          .replace(/^[-*]\s+/, "- ");
        // Gerarchia visibile: H1 13pt, H2 11pt, H3+ 9.8pt; aria prima di ogni titolo.
        const size = isHeading ? sz((livello === 1 ? 13 : livello === 2 ? 11 : 9.8) * hScale) : sz(8.8);
        if (isHeading && !precedenteEraHeading) y -= 8;
        const lines = wrapText(normalized, isHeading ? 72 : maxChars);
        for (const line of lines) {
          ensureSpace(isHeading ? 28 : 18, title);
          page.drawText(line, {
            x: isList ? x + 6 : x,
            y,
            size,
            font: isHeading ? fontBoldB : fontB,
            color: isHeading ? primaryC : textC,
            maxWidth: contentMaxWidth() - (isList ? 6 : 0),
          });
          y -= isHeading ? size + 5 : Math.round(13 * lhScale);
        }
        if (!isList) y -= isHeading ? 3 : 4;
        precedenteEraHeading = isHeading;
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
        page.drawText(`OFFERTA N. ${quote.quote_number}${revLabel}`, { x: margin, y: hy, size: 9, font, color: headerTextC });
        hy -= 27;
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
        page.drawText(`N. ${quote.quote_number}${revLabel}`, { x: margin, y, size: 9, font, color: grayC });
        y -= 25;
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
        page.drawText(`OFFERTA N. ${quote.quote_number}${revLabel}`, { x: contentX, y, size: 9, font, color: grayC });
        y -= 34;
      }
      page.drawText("OFFERTA", { x: contentX, y, size: 26, font: fontBold, color: textC }); y -= 28;
      page.drawText("COMMERCIALE", { x: contentX, y, size: 26, font: fontBold, color: textC }); y -= 24;
      if (quote.title) { page.drawText(String(quote.title).slice(0, 82), { x: contentX, y, size: 11, font, color: grayC }); y -= 14; }
      if (t.cover_tagline) { page.drawText(t.cover_tagline, { x: contentX, y, size: 10, font: fontItalic, color: primaryC }); y -= 16; }
    } else {
      // Classic premium (default) — header brand su bianco, barra bicolore,
      // titolo centrato, box Dati azienda/cliente, Oggetto, Luogo + Data.

      // ── Intestazione come nel documento edile ──
      // Logo (o nome) a sinistra, «Preventivo · N.» a destra, la barra a segmenti
      // nel colore dell'azienda. Poi il titolo, la riga dei dati, le due parti.
      // Prima: contatti con quadratini colorati, barra bicolore arancione, titolo
      // centrato e riquadri con etichette piene.
      const spaziato = (testo: string, x: number, yy: number, size: number, f: any, color: any, passo = 1.2) => {
        let ex = x;
        for (const ch of winAnsiSafe(testo)) { page.drawText(ch, { x: ex, y: yy, size, font: f, color }); ex += f.widthOfTextAtSize(ch, size) + passo; }
        return ex - x;
      };
      const larghezzaSpaziata = (testo: string, size: number, f: any, passo = 1.2) =>
        [...winAnsiSafe(testo)].reduce((w, ch) => w + f.widthOfTextAtSize(ch, size) + passo, 0);
      const segmenti = (x: number, yy: number, w: number, spessore = 2.5) => {
        const opacita = [1, 0.72, 0.48, 0.28, 0.14];
        const passo = w / opacita.length;
        opacita.forEach((o, i) => page.drawRectangle({ x: x + i * passo, y: yy, width: passo - (i < opacita.length - 1 ? 3 : 0), height: spessore, color: fondoEdC, opacity: o }));
      };

      const yTesta = pageHeight - 44;
      if (logoEmbed && t.show_logo) {
        const scale = Math.min(26 / logoEmbed.height, 140 / logoEmbed.width);
        page.drawImage(logoEmbed, { x: margin, y: yTesta - 6, width: logoEmbed.width * scale, height: logoEmbed.height * scale });
      } else {
        let nome = winAnsiSafe(String(company?.name || "Azienda")).toUpperCase();
        while (nome.length > 3 && larghezzaSpaziata(nome, 9.5, fontBold, 0.6) > contentWidth - 200) nome = nome.slice(0, -2);
        spaziato(nome, margin, yTesta, 9.5, fontBold, inchiostroC, 0.6);
      }
      const etichettaDoc = `PREVENTIVO${t.show_quote_number ? ` · N. ${quote.quote_number}${revLabel}` : ""}`;
      const wEt = larghezzaSpaziata(etichettaDoc, 6.5, fontBold, 1.3);
      spaziato(etichettaDoc, pageWidth - margin - wEt, yTesta + 4, 6.5, fontBold, inkMarcaC, 1.3);
      const dataDocTesto = new Date(quote.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
      drawRight(page, dataDocTesto, pageWidth - margin, yTesta - 7, 7.5, font, grigioEdC);
      segmenti(margin, yTesta - 20, contentWidth);

      // ── Titolo: occhiello e frase, con la parola fra asterischi in corsivo ──
      y = yTesta - 50;
      const fontCorsivoT = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      const occhiello = "LA NOSTRA OFFERTA";
      const xTitolo = (w: number) => allineaHeader === "center" ? (pageWidth - w) / 2 : allineaHeader === "right" ? pageWidth - margin - w : margin;
      spaziato(occhiello, xTitolo(larghezzaSpaziata(occhiello, 7, fontBold, 1.6)), y, 7, fontBold, inkMarcaC, 1.6);
      y -= 30;
      const titoloGrezzo = String(quote.title ?? "").trim()
        || (quote.client_name ? `Preventivo per *${String(quote.client_name).trim()}*` : "Il nostro *preventivo*");
      {
        const corpo = 22;
        const parole: Array<{ testo: string; accento: boolean }> = [];
        let inAccento = false;
        for (const pezzo of titoloGrezzo.split(/(\*)/)) {
          if (pezzo === "*") { inAccento = !inAccento; continue; }
          for (const w of pezzo.split(/\s+/).filter(Boolean)) parole.push({ testo: winAnsiSafe(w), accento: inAccento });
        }
        const fDi = (pa: { accento: boolean }) => (pa.accento ? fontCorsivoT : fontBold);
        const cDi = (pa: { accento: boolean }) => (pa.accento ? corpo * 1.1 : corpo);
        const largo = (pa: { testo: string; accento: boolean }) => fDi(pa).widthOfTextAtSize(pa.testo, cDi(pa));
        const spazio = fontBold.widthOfTextAtSize(" ", corpo);
        const righe: Array<typeof parole> = [[]];
        let wr = 0;
        for (const pa of parole) {
          const w = largo(pa);
          if (wr > 0 && wr + spazio + w > contentWidth * 0.9) { righe.push([]); wr = 0; }
          righe[righe.length - 1].push(pa); wr += (wr > 0 ? spazio : 0) + w;
        }
        for (const riga of righe.slice(0, 3)) {
          const wRiga = riga.reduce((a, pa, i) => a + largo(pa) + (i ? spazio : 0), 0);
          let tx = xTitolo(wRiga);
          for (const pa of riga) {
            page.drawText(pa.testo, { x: tx, y, size: cDi(pa), font: fDi(pa), color: pa.accento ? inkMarcaC : inchiostroC });
            tx += largo(pa) + spazio;
          }
          y -= corpo * 1.2;
        }
      }

      // ── La riga dei dati del documento ──
      y -= 6;
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.6, color: filettoC });
      y -= 16;
      const datiDoc: Array<[string, string]> = [
        ...(t.show_quote_number ? [["NUMERO", `${quote.quote_number}${revLabel}`] as [string, string]] : []),
        ["DATA", new Date(quote.created_at).toLocaleDateString("it-IT")],
        ...(t.show_validity_date && quote.expires_at ? [["VALIDO FINO AL", new Date(quote.expires_at).toLocaleDateString("it-IT")] as [string, string]] : []),
        ...(quote.client_name ? [["PREPARATO PER", String(quote.client_name)] as [string, string]] : []),
      ];
      const wCol = contentWidth / Math.max(1, datiDoc.length);
      datiDoc.forEach(([etichetta, valore], i) => {
        const cx = margin + i * wCol;
        spaziato(etichetta, cx, y, 6.5, fontBold, inkMarcaC, 1.2);
        let v = winAnsiSafe(valore);
        while (v.length > 3 && fontBold.widthOfTextAtSize(v, 9.5) > wCol - 10) v = v.slice(0, -2);
        if (v !== winAnsiSafe(valore)) v = v.trimEnd() + "…";
        page.drawText(v, { x: cx, y: y - 13, size: 9.5, font: fontBold, color: inchiostroC });
      });
      y -= 40;

      // ── Le due parti: l'impresa e il cliente, senza riquadri ──
      const titolino = (testo: string, x: number, yy: number, w: number) => {
        spaziato(testo, x, yy, 7, fontBold, inchiostroC, 1.5);
        page.drawRectangle({ x, y: yy - 7, width: w, height: 1, color: inchiostroC });
      };
      const boxW = (contentWidth - 24) / 2;
      const bX = margin + boxW + 24;
      titolino("L'IMPRESA", margin, y, boxW);
      titolino("IL CLIENTE", bX, y, boxW);
      let ay = y - 22;
      let by = y - 22;
      const riga = (xx: number, yy: number, testo: string, bold: boolean) => {
        let v = winAnsiSafe(testo);
        while (v.length > 3 && (bold ? fontBold : font).widthOfTextAtSize(v, 9) > boxW) v = v.slice(0, -2);
        page.drawText(v, { x: xx, y: yy, size: 9, font: bold ? fontBold : font, color: bold ? inchiostroC : grigioEdC });
      };
      const righeImpresa = [
        company?.name ? [String(company.name), true] : null,
        company?.address ? [String(company.address), false] : null,
        company?.vat_number ? [`P.IVA ${company.vat_number}`, false] : null,
        company?.phone ? [`Tel. ${company.phone}`, false] : null,
        company?.email ? [String(company.email), false] : null,
      ].filter(Boolean) as Array<[string, boolean]>;
      const righeCliente = [
        quote.client_name ? [String(quote.client_name), true] : null,
        quote.client_company ? [String(quote.client_company), false] : null,
        quote.client_address ? [String(quote.client_address), false] : null,
        quote.client_fiscal_code ? [`Cod. Fisc. ${quote.client_fiscal_code}`, false] : null,
        quote.client_vat_number ? [`P.IVA ${quote.client_vat_number}`, false] : null,
        quote.client_phone ? [`Tel. ${quote.client_phone}`, false] : null,
        quote.client_email ? [String(quote.client_email), false] : null,
      ].filter(Boolean) as Array<[string, boolean]>;
      for (const [testo, bold] of righeImpresa) { riga(margin, ay, testo, bold); ay -= 11.5; }
      for (const [testo, bold] of righeCliente) { riga(bX, by, testo, bold); by -= 11.5; }
      y = Math.min(ay, by) - 12;

      // ── Oggetto e luogo dei lavori ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const luogo = (quote as any).indirizzo_lavori || quote.client_address;
      const oggetto = quote.description && quote.description !== quote.title ? String(quote.description).replace(/\s+/g, " ") : "";
      if (oggetto) {
        titolino("OGGETTO DELL'INTERVENTO", margin, y, contentWidth);
        y -= 22;
        for (const l of wrapText(winAnsiSafe(oggetto), 104).slice(0, 4)) {
          page.drawText(l, { x: margin, y, size: 9, font, color: grigioEdC });
          y -= 12.5;
        }
        y -= 10;
      }
      if (luogo) {
        spaziato("LUOGO DEI LAVORI", margin, y, 6.5, fontBold, inkMarcaC, 1.2);
        page.drawText(winAnsiSafe(String(luogo)).slice(0, 90), { x: margin + larghezzaSpaziata("LUOGO DEI LAVORI", 6.5, fontBold, 1.2) + 10, y, size: 9, font: fontBold, color: inchiostroC });
        y -= 24;
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
      if (y < 280) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      if (t.layout === "bold") {
        page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
      }

      const itemLeftX = t.layout === "bold" ? 100 : margin;
      const itemWidth = t.layout === "bold" ? contentWidth - 50 : contentWidth;

      if (!classicPremium && items.length > 0) {
        // Ora la tabella può seguire il destinatario sulla stessa pagina: serve aria sopra il titolo.
        y -= 18;
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
      const qtyRight = itemLeftX + itemWidth - 236;
      const umX = qtyRight + 10;
      const umMaxW = 30; // cella U.M.: oltre → troncamento per larghezza misurata
      const priceRight = itemLeftX + itemWidth - 106;
      // Bordo sinistro GARANTITO della colonna prezzo: il prezzo non scende mai
      // sotto questa x, così non tocca mai la U.M. (fine cella = umX + umMaxW).
      const priceLeftBound = umX + umMaxW + 8;
      // IVA a -70 (≈475): lascia 64pt alla colonna TOTALE (i totali riga da
      // 100.000+ € sono larghi ~50pt) senza invadere PREZZO UNIT. a sinistra.
      const ivaRight = itemLeftX + itemWidth - 70;
      const totRight = itemLeftX + itemWidth - 6;

      const drawTableHeader = () => {
        if (classicPremium) {
          // Come il computo del documento edile: etichette piccole in grigio sopra
          // un filetto scuro. Prima era una barra piena col testo bianco.
          const eC = grigioEdC;
          page.drawText("N.", { x: nX, y, size: 6.5, font: fontBold, color: eC });
          page.drawText("DESCRIZIONE", { x: descX, y, size: 6.5, font: fontBold, color: eC });
          drawRight(page, "Q.TÀ", qtyRight, y, 6.5, fontBold, eC);
          page.drawText("U.M.", { x: umX, y, size: 6.5, font: fontBold, color: eC });
          if (!prezzoManualeAttivo) {
            drawRight(page, "PREZZO", priceRight, y, 6.5, fontBold, eC);
            drawRight(page, "IVA", ivaRight, y, 6.5, fontBold, eC);
            drawRight(page, "IMPORTO", totRight, y, 6.5, fontBold, eC);
          }
          page.drawRectangle({ x: itemLeftX, y: y - 6, width: itemWidth, height: 1, color: inchiostroC });
          y -= 22;
          return;
        }
        page.drawRectangle({ x: itemLeftX, y: y - 6, width: itemWidth, height: 20, color: primaryC });
        page.drawText("N.", { x: nX, y, size: 8, font: fontBold, color: headerTextC });
        page.drawText("DESCRIZIONE", { x: descX, y, size: 8, font: fontBold, color: headerTextC });
        drawRight(page, "Q.TÀ", qtyRight, y, 8, fontBold, headerTextC);
        page.drawText("U.M.", { x: umX, y, size: 8, font: fontBold, color: headerTextC });
        if (!prezzoManualeAttivo) {
          drawRight(page, "PREZZO UNIT.", priceRight, y, 8, fontBold, headerTextC);
          drawRight(page, "IVA", ivaRight, y, 8, fontBold, headerTextC);
          drawRight(page, "TOTALE", totRight, y, 8, fontBold, headerTextC);
        }
        y -= 24;
      };

      // If pdf_mostra_solo_totale: skip item rows, only draw totals
      // Vale la scelta del preventivo, che nasce dal predefinito dell'azienda: il
      // predefinito serve solo ai preventivi che non l'hanno salvata. Prima
      // l'azienda scavalcava il singolo preventivo.
      const soloTotale = opzione("pdf_mostra_solo_totale", pdfImp.pdf_mostra_solo_totale === true);

      // Header solo se ci sono righe da mostrare (con 0 righe si va dritti ai totali)
      // e solo se non è attivo "solo totale", altrimenti resterebbe orfana senza righe sotto.
      if (items.length > 0 && !soloTotale) drawTableHeader();
      let rowNumber = 0;

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
            // Righe a 0€ col prezzo scritto a mano: un subtotale di zeri non
            // direbbe niente di vero, si salta senza occupare spazio.
            if (prezzoManualeAttivo) continue;
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
          // Misure (L×H) e attributi (colore, apertura…) sotto la descrizione,
          // e miniatura del prodotto: le tre opzioni che nessuno leggeva.
          const dettagli: string[] = [];
          if (opzione("pdf_mostra_misure") && !isNota && !isSubtotale) {
            const mx = (item as any).misura_x, my = (item as any).misura_y;
            if (mx != null || my != null) {
              // Le misure viaggiano in millimetri (configuratori e riga del builder).
              const fmtMm = (n: unknown) => n == null ? "—" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 1, useGrouping: false });
              dettagli.push(`L ${fmtMm(mx)} × H ${fmtMm(my)} mm`);
            }
          }
          if (opzione("pdf_mostra_attributi") && !isNota && !isSubtotale) {
            const ax = (item as any).axis_selections;
            if (ax && typeof ax === "object" && !Array.isArray(ax)) {
              const coppie = Object.entries(ax as Record<string, unknown>)
                .filter(([, val]) => val != null && String(val).trim() !== "")
                .map(([k, val]) => {
                  const nome = nomiAssi.get(`${(item as any).family_id}:${k}`)
                    ?? (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "));
                  const grezzo = String(val);
                  return `${nome}: ${etichetteValori.get(grezzo) ?? grezzo}`;
                });
              if (coppie.length) dettagli.push(coppie.join(" · "));
            }
          }
          // Misure + attributi possono superare una riga: si va a capo (max 2 righe)
          // invece di tagliare a metà «Tipo apertura: Wasistas classi».
          const rigaDettagli = dettagli.join("  ·  ");
          const righeDettagli = rigaDettagli ? wrapText(rigaDettagli, 95).slice(0, 2) : [];
          const conFoto = item as { image_url?: string | null; article_template_id?: string | null; family_id?: string | null };
          const immagineRiga = opzione("pdf_mostra_immagini", false) && !isNota && !isSubtotale
            ? await immagineProdotto(
                conFoto.image_url
                  || immaginiRighe.get(`a:${conFoto.article_template_id}`)
                  || immaginiRighe.get(`f:${conFoto.family_id}`)
                  || "",
              )
            : null;
          const rowH = (hasDesc ? 29 : 18) + rowExtra + righeDettagli.length * 11 + (immagineRiga ? 30 : 0);

          // Bordo completo di riga (template "tutti i bordi"), sotto il testo
          if (bordiTabella === "all") {
            page.drawRectangle({ x: itemLeftX, y: y - (rowH - 12), width: itemWidth, height: rowH, borderColor: lightGrayC, borderWidth: 0.4 });
          }
          // Alternate row background (zebra), disattivabile dal template
          if (zebraOn && rowNumber % 2 === 1) {
            page.drawRectangle({ x: itemLeftX, y: y - (rowH - 12), width: itemWidth, height: rowH, color: isChild ? rgb(0.97, 0.97, 0.97) : (classicPremium ? tintaC : accentC) });
          }

          // Name prefix for child rows / optional
          let namePrefix = "";
          if (isChild) namePrefix = "  - "; // niente U+2514: non \u00e8 WinAnsi, pdf-lib lancerebbe
          if (isOptional) namePrefix += "[OPZIONALE] ";

          const rawName = namePrefix + (item.name || "");
          const nameText = rawName.length > 42 ? rawName.slice(0, 41) + "…" : rawName;
          const rowColor = isChild ? grayC : textC;

          // Q.tà formato italiano, U.M. in colonna separata, sconto riga accodato al prezzo
          const qtyText = FORMATO_QUANTITA.format(Number(item.quantity ?? 0));
          // U.M. troncata per LARGHEZZA misurata (non per numero di caratteri):
          // una unità di misura larga non deve invadere la colonna prezzo.
          let umText = String(item.unit_of_measure || "pz");
          while (umText.length > 1 && textW(umText, sz(8.5)) > umMaxW) umText = umText.slice(0, -1);
          const showDiscount = opzione("pdf_mostra_sconti", pdfImp.pdf_mostra_sconti !== false);
          const discPct = Number(item.discount_percent || 0);
          const priceBase = fmtEur(Number(item.unit_price || 0));
          // Sconto riga accodato al prezzo SOLO se la stringa completa entra
          // nella cella prezzo senza scavalcare il bordo sinistro garantito
          // (quindi senza mai toccare la colonna U.M.).
          let priceText = priceBase;
          if (showDiscount && discPct > 0) {
            const withDisc = `${priceBase} (-${discPct}%)`;
            if (priceRight - textW(withDisc, sz(8.5)) >= priceLeftBound) priceText = withDisc;
          }
          const vatText = `${Number(item.vat_rate || 0)}%`;
          // null-safe: un line_total legittimamente 0 (riga omaggio / 100% sconto)
          // NON deve ricadere sul calcolo (|| inghiottiva lo zero).
          const ltRaw = (item as any).line_total;
          const lineTotal = ltRaw != null && ltRaw !== ""
            ? Number(ltRaw)
            : Number(item.quantity) * Number(item.unit_price) * (1 - discPct / 100);

          page.drawText(String(rowNumber), { x: nX, y, size: sz(8.5), font, color: grayC });
          page.drawText(nameText, { x: descX, y, size: sz(8.5), font, color: rowColor });
          // Col prezzo scritto a mano le righe sono a 0€: prezzo/IVA/totale di
          // riga non si mostrano mai, a prescindere dall'impostazione del
          // preventivo (che qui non avrebbe niente di vero da mostrare).
          const showPrezziRiga = !prezzoManualeAttivo && (quote as any).pdf_mostra_prezzi_per_riga !== false;
          drawRight(page, qtyText, qtyRight, y, sz(8.5), font, rowColor);
          page.drawText(umText, { x: umX, y, size: sz(8.5), font, color: rowColor });
          if (showPrezziRiga) {
            drawRight(page, priceText, priceRight, y, sz(8.5), font, rowColor);
            drawRight(page, vatText, ivaRight, y, sz(8.5), font, rowColor);
          }
          if (!prezzoManualeAttivo) {
            drawRight(page, fmtEur(lineTotal), totRight, y, sz(8.5), fontBold, isOptional ? grayC : textC);
          }
          y -= 12;

          if (hasDesc) {
            page.drawText(item.description.substring(0, 85), { x: descX, y, size: sz(7), font, color: grayC });
            y -= 11;
          }
          for (const rd of righeDettagli) {
            page.drawText(rd, { x: descX, y, size: sz(7), font: fontItalic, color: grayC });
            y -= 11;
          }
          if (immagineRiga) {
            const lato = 26;
            const rap = immagineRiga.width / immagineRiga.height;
            const w = rap >= 1 ? lato : lato * rap, h = rap >= 1 ? lato / rap : lato;
            page.drawImage(immagineRiga, { x: descX, y: y - h + 4, width: w, height: h });
            y -= 30;
          }
          y -= 6 + rowExtra;
          // Filetto orizzontale tra le righe (template "orizzontali" o "tutti")
          // `y` è già la linea di base della riga DOPO: il confine fra le due
          // righe sta 12pt più su (dove comincia il fondo zebrato). A `y + 4`
          // il filetto attraversava il testo della riga successiva, che usciva
          // barrata (dal 02/09/2026, su ogni riga pari e sul subtotale).
          if (bordiTabella === "horizontal") {
            page.drawLine({ start: { x: itemLeftX, y: y + 12 }, end: { x: itemLeftX + itemWidth, y: y + 12 }, thickness: 0.35, color: lightGrayC });
          }
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
      page.drawLine({ start: { x: totX, y: y + 14 }, end: { x: itemLeftX + itemWidth, y: y + 14 }, thickness: 0.6, color: lightGrayC });

      const drawTotal = (label: string, value: string, bold = false) => {
        if (bold) {
          if (classicPremium) {
            // La fascia del prezzo a tutta pagina, come nel documento edile: il
            // numero che il cliente cerca, grande, nel colore dell'azienda.
            // Stacco sufficiente: la fascia comincia sotto l'ultima riga (l'IVA), non sopra.
            y -= 18;
            const h = 42;
            page.drawRectangle({ x: 0, y: y - h + 22, width: pageWidth, height: h, color: fondoEdC });
            let ex = margin;
            for (const ch of "TOTALE PREVENTIVO") { page.drawText(ch, { x: ex, y: y + 2, size: 7.5, font: fontBold, color: rgb(1, 1, 1) }); ex += fontBold.widthOfTextAtSize(ch, 7.5) + 1.6; }
            page.drawText("IVA inclusa", { x: margin, y: y - 10, size: 8, font, color: rgb(1, 1, 1), opacity: 0.85 });
            drawRight(page, value, pageWidth - margin - 3, y - 7, 20, fontBold, rgb(1, 1, 1));
            y -= h;
            return;
          }
          // Barra TOTALE in evidenza (respiro di 5pt dalla riga precedente)
          y -= 5;
          page.drawRectangle({ x: totX, y: y - 6, width: totBoxW, height: 21, color: accentStrongC });
          page.drawText(label, { x: totX + 8, y, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });
          drawRight(page, value, totValX, y, 10.5, fontBold, rgb(1, 1, 1));
          y -= 24;
          return;
        }
        page.drawText(label, { x: totX + 8, y, size: 9, font, color: classicPremium ? grigioEdC : textC });
        drawRight(page, value, totValX, y, 9, classicPremium ? fontBold : font, classicPremium ? inchiostroC : textC);
        if (classicPremium) page.drawLine({ start: { x: totX, y: y - 5 }, end: { x: itemLeftX + itemWidth, y: y - 5 }, thickness: 0.5, color: filettoC });
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

      if (prezzoManualeAttivo) {
        // Col prezzo scritto a mano le righe sono a 0€: non c'è niente da
        // ripartire per aliquota (il ramo sotto darebbe un'aliquota a caso o
        // nessuna). L'aliquota è quella esplicita scelta insieme al prezzo;
        // l'importo (ivaToShow) è comunque quello autoritativo dai totali salvati.
        const ivaPctManuale = Number((quote as any).prezzo_manuale_iva_pct ?? 0);
        drawTotal(`IVA ${ivaPctManuale}%`, `${fmtEur(ivaToShow)}`);
      } else {
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

      // ── Piano dei pagamenti strutturato (fasi salvate dal builder) ──
      // Prima restava solo nel DB: il cliente firmava un PDF senza acconto e saldo.
      const fasiPag = Array.isArray((quote as any).payment_phases)
        ? ((quote as any).payment_phases as Array<Record<string, unknown>>).filter((p) => p && typeof p === "object")
        : [];
      if (fasiPag.length > 0) {
        const metodoPag = typeof (quote as any).payment_method === "string" ? String((quote as any).payment_method).trim() : "";
        const altezzaPiano = 30 + fasiPag.length * 13 + (metodoPag ? 12 : 0);
        newPageIfNeeded(altezzaPiano + 20);
        y -= 8;
        const pianoX = totX - 10;
        const pianoW = (itemLeftX + itemWidth) - pianoX;
        page.drawRectangle({ x: pianoX, y: y - altezzaPiano + 14, width: pianoW, height: altezzaPiano, color: accentC, borderColor: primaryC, borderWidth: 0.6 });
        page.drawText("PIANO DEI PAGAMENTI", { x: pianoX + 8, y, size: sz(8), font: fontBold, color: primaryC });
        y -= 13;
        if (metodoPag) {
          page.drawText(`Modalità: ${metodoPag.slice(0, 40)}`, { x: pianoX + 8, y, size: sz(7.5), font, color: textC });
          y -= 12;
        }
        for (const fase of fasiPag) {
          const etichetta = String(fase.label ?? "").trim() || "Rata";
          const pct = Number(fase.percent) || 0;
          const importo = Number(fase.amount) || 0;
          page.drawText(`${etichetta.slice(0, 26)}${pct ? ` (${pct}%)` : ""}`, { x: pianoX + 8, y, size: sz(7.5), font, color: textC });
          drawRight(page, fmtEur(importo), totValX, y, sz(7.5), fontBold, textC);
          y -= 13;
        }
        y -= 6;
      }

      // ── QR firma digitale ──────────────────────────────────────────
      if ((quote as any).firma_digitale_abilitata && (quote as any).signature_token) {
        try {
          // QR (55pt) + etichetta: senza guardia usciva dal fondo pagina.
          newPageIfNeeded(100);
          const siteUrl = branding?.siteUrl || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
          const signUrl = `${siteUrl}/preventivo/${quote.id}?token=${(quote as any).signature_token}`;
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
        if (t.show_notes && opzione("pdf_mostra_note_cliente")) infoCols.push({ label: "NOTE", text: noteTxt });
        // Coordinate bancarie del template: prima si salvavano e non uscivano mai.
        const bancaTxt = normalizeTemplateText(t.bank_details);
        if (bancaTxt) infoCols.push({ label: "COORDINATE BANCARIE", text: bancaTxt });

        if (infoCols.length > 0) {
          newPageIfNeeded(190);
          const gap = 12;
          const colW = (contentWidth - gap * (infoCols.length - 1)) / infoCols.length;
          const maxChars = Math.max(20, Math.floor(colW / 3.9));
          const colTop = y;
          let deepest = colTop;
          infoCols.forEach((c, ci) => {
            const cx = margin + ci * (colW + gap);
            // Come i titolini del documento edile: maiuscoletto spaziato e un filetto.
            // Prima: un quadratino e l'etichetta nel colore del modello.
            let ex = cx;
            for (const ch of c.label) { page.drawText(ch, { x: ex, y: colTop, size: 6.5, font: fontBold, color: inchiostroC }); ex += fontBold.widthOfTextAtSize(ch, 6.5) + 1.3; }
            page.drawRectangle({ x: cx, y: colTop - 6, width: colW, height: 0.8, color: inchiostroC });
            let ty = colTop - 18;
            for (const line of wrapText(c.text.replace(/\s+/g, " ").slice(0, 320), maxChars).slice(0, 6)) {
              page.drawText(line, { x: cx, y: ty, size: 8, font, color: grigioEdC });
              ty -= 10.5;
            }
            deepest = Math.min(deepest, ty);
          });
          // Niente filetti verticali: ogni colonna ha già il suo titolino col filetto sotto.
          y = deepest - 18;
        }

        // Riquadri firma
        newPageIfNeeded(126);
        // La firma vale anche per le condizioni che seguono: va detto qui, dove
        // si firma, non solo nelle pagine allegate.
        const conCondizioni = Boolean(
          normalizeTemplateText(t.contractual_terms_text) || normalizeTemplateText(t.legal_terms_text)
          || (t.show_contractual_terms !== false && opzione("pdf_mostra_condizioni")),
        );
        if (conCondizioni) {
          page.drawText(winAnsiSafe("Con la firma il Cliente accetta il preventivo e le condizioni generali di contratto allegate."), {
            x: margin, y: y - 2, size: 7.8, font: fontItalic, color: grayC, maxWidth: contentWidth,
          });
          y -= 16;
        }
        const sigW = (contentWidth - 14) / 2;
        const sigH = 66;
        // Righe da firmare, come nel documento edile: il filetto, sotto che cosa ci
        // va e di chi è la firma. Prima erano due riquadri con il titolo colorato.
        const sigBox = (x: number, label: string, chi: string) => {
          page.drawLine({ start: { x, y: y - sigH + 26 }, end: { x: x + sigW, y: y - sigH + 26 }, thickness: 0.7, color: inchiostroC });
          let ex = x;
          for (const ch of label) { page.drawText(ch, { x: ex, y: y - sigH + 15, size: 6.5, font, color: grigioEdC }); ex += font.widthOfTextAtSize(ch, 6.5) + 0.9; }
          let c = winAnsiSafe(chi);
          while (c.length > 3 && fontBold.widthOfTextAtSize(c, 7.5) > sigW) c = c.slice(0, -2);
          page.drawText(c, { x, y: y - sigH + 5, size: 7.5, font: fontBold, color: inchiostroC });
        };
        sigBox(margin, "LUOGO, DATA E FIRMA DEL CLIENTE", String(quote.client_name ?? ""));
        sigBox(margin + sigW + 14, "PER L'IMPRESA", String(company?.name ?? ""));
        y -= sigH + 12;
      }

      drawWatermark(page);
    }

    drawProductBlocks();

    for (const section of (t.composed_sections ?? [])) {
      await drawRichTextBlock(section.name || "Sezione", section.body_html, { titoloDalTesto: true, fontFamily: section.font_family ?? null });
    }

    // Condizioni contrattuali e termini legali: UNA sezione (prima erano due
    // pagine separate). Il vecchio campo legal_terms_text, se ancora presente,
    // viene stampato di seguito nella stessa sezione.
    const scritteDallAzienda = [
      t.show_contractual_terms && opzione("pdf_mostra_condizioni") ? normalizeTemplateText(t.contractual_terms_text) : "",
      t.show_legal_terms && opzione("pdf_mostra_condizioni") ? normalizeTemplateText(t.legal_terms_text) : "",
    ].filter(Boolean).join("\n\n");
    // Nessuna delle venti aziende aveva scritto una riga di condizioni: il
    // preventivo si firmava senza niente su tempi, varianti, garanzie e recesso.
    // Ora, se le condizioni sono attive e il testo manca, valgono quelle di base.
    const condizioniETermini = scritteDallAzienda
      // `undefined` vale come acceso: è il default della colonna e dell'editor.
      || (t.show_contractual_terms !== false && opzione("pdf_mostra_condizioni")
        ? substituteMergeTags(condizioniStandard("generico"), buildMergeContext({ quote, company, template: t }))
        : "");
    if (condizioniETermini) {
      // Le clausole che vogliono una firma a parte (art. 1341 c.c.): si leggono
      // dal testo, quindi valgono anche per le condizioni scritte dall'azienda.
      const daApprovare = clausoleDaApprovare(condizioniETermini);
      // L'elenco sta nel riquadro della seconda firma: nel testo sarebbe ripetuto.
      const testoCondizioni = daApprovare.length > 0 ? senzaSezioneClausole(condizioniETermini) : condizioniETermini;
      await drawRichTextBlock("CONDIZIONI CONTRATTUALI E TERMINI LEGALI", testoCondizioni, { fontFamily: t.composed_terms?.font_family ?? null });
      if (daApprovare.length > 0) {
        ensureSpace(120, "CONDIZIONI CONTRATTUALI E TERMINI LEGALI");
        y -= 6;
        const boxX = contentLeftX();
        const boxW = contentMaxWidth();
        const altezza = 44 + daApprovare.length * 12 + 44;
        page.drawRectangle({ x: boxX, y: y - altezza, width: boxW, height: altezza, borderColor: textC, borderWidth: 0.8 });
        page.drawText("APPROVAZIONE SPECIFICA (ARTT. 1341 E 1342 C.C.)", { x: boxX + 12, y: y - 18, size: 8, font: fontBold, color: textC });
        page.drawText("Il Committente, dopo averle rilette, approva specificamente le clausole seguenti:", { x: boxX + 12, y: y - 32, size: 8, font, color: grayC });
        let ry = y - 46;
        for (const c of daApprovare) {
          page.drawText(`- ${c}`.slice(0, 110), { x: boxX + 12, y: ry, size: 8, font, color: textC });
          ry -= 12;
        }
        page.drawLine({ start: { x: boxX + 12, y: ry - 22 }, end: { x: boxX + 150, y: ry - 22 }, thickness: 0.6, color: grayC });
        page.drawText("LUOGO E DATA", { x: boxX + 12, y: ry - 32, size: 7, font, color: grayC });
        page.drawLine({ start: { x: boxX + 180, y: ry - 22 }, end: { x: boxX + boxW - 12, y: ry - 22 }, thickness: 0.6, color: grayC });
        page.drawText("SECONDA FIRMA DEL COMMITTENTE", { x: boxX + 180, y: ry - 32, size: 7, font, color: grayC });
        y -= altezza + 12;
      }

      // ─── Il modulo di recesso ───
      // Lo accende l'azienda nel modello (spento di serie dal 21/09/2026): serve a
      // chi firma con un privato a casa sua o a distanza, e allora va consegnato
      // con il contratto. Stesso testo di tutti i documenti.
      if (t.modulo_recesso_attivo === true) {
        drawWatermark(page);
        startContentPage(MODULO_RECESSO.titolo.toUpperCase());
        const mx = contentLeftX();
        const mw = contentMaxWidth();
        for (const l of wrapText(MODULO_RECESSO.istruzioni, 100)) {
          page.drawText(l, { x: mx, y, size: 9, font, color: grayC });
          y -= 12.5;
        }
        y -= 12;
        const topBox = y;
        let ry = y - 20;
        const destinatario = winAnsiSafe([company?.name, company?.address, company?.email].filter(Boolean).join(" — "));
        page.drawText("Destinatario:", { x: mx + 14, y: ry, size: 9, font: fontBold, color: textC });
        for (const l of wrapText(destinatario, 78)) {
          page.drawText(l, { x: mx + 14 + fontBold.widthOfTextAtSize("Destinatario: ", 9), y: ry, size: 9, font, color: textC });
          ry -= 13;
        }
        ry -= 6;
        for (const l of wrapText(winAnsiSafe(MODULO_RECESSO.dichiarazione(String(quote.quote_number ?? ""))), 96)) {
          page.drawText(l, { x: mx + 14, y: ry, size: 9, font, color: textC });
          ry -= 13;
        }
        ry -= 10;
        for (const campo of MODULO_RECESSO.campi) {
          page.drawText(campo.toUpperCase(), { x: mx + 14, y: ry, size: 7, font, color: grayC });
          ry -= 22;
          page.drawLine({ start: { x: mx + 14, y: ry }, end: { x: mx + mw - 14, y: ry }, thickness: 0.6, color: lightGrayC });
          ry -= 16;
        }
        ry -= 18;
        page.drawLine({ start: { x: mx + 14, y: ry }, end: { x: mx + 150, y: ry }, thickness: 0.7, color: textC });
        page.drawText(MODULO_RECESSO.firme[0].toUpperCase(), { x: mx + 14, y: ry - 11, size: 7, font, color: grayC });
        page.drawLine({ start: { x: mx + 180, y: ry }, end: { x: mx + mw - 14, y: ry }, thickness: 0.7, color: textC });
        page.drawText(MODULO_RECESSO.firme[1].toUpperCase(), { x: mx + 180, y: ry - 11, size: 7, font, color: grayC });
        ry -= 24;
        page.drawRectangle({ x: mx, y: ry, width: mw, height: topBox - ry, borderColor: textC, borderWidth: 0.8 });
        y = ry - 12;
      }
    }

    // ─── Notes page ───
    // Nel classic le note brevi sono già nella colonna NOTE: pagina dedicata
    // solo se il testo è lungo.
    if (t.show_notes && opzione("pdf_mostra_note_cliente") && quote.notes && (!classicPremium || String(quote.notes).length > 320)) {
      // Riga per riga con guardia di pagina (stesso pattern di drawRichTextBlock):
      // il drawText monolitico faceva finire il testo lungo sotto la banda footer.
      const notesTitle = "NOTE E CONDIZIONI";
      startSection(notesTitle, 120);
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
    if (!isPreview && opzione("pdf_includi_schede_tecniche")) {
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
    // La copertina (se c'è) resta senza banda footer e non entra nella numerazione.
    const totalPages = pdfDoc.getPageCount();
    for (let i = pagineSenzaFooter; i < totalPages; i++) {
      drawPageExtras(pdfDoc.getPage(i), i + 1 - pagineSenzaFooter, totalPages - pagineSenzaFooter);
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

    // ─── Documento già firmato: non si sovrascrive ───
    // Il cliente ha firmato (OTP) proprio QUEL file, e documento_hash è la sua
    // impronta: rigenerare con upsert sullo stesso percorso cancellerebbe la
    // prova. Restituiamo il PDF firmato così com'è.
    if (quote.signed_at && quote.pdf_storage_path) {
      const { data: giaFirmato } = await supabaseAdmin.storage
        .from("quote-pdfs")
        .createSignedUrl(quote.pdf_storage_path, 3600);
      if (giaFirmato?.signedUrl) {
        return jsonResponse({
          success: true,
          pdf_path: quote.pdf_storage_path,
          signed_url: giaFirmato.signedUrl,
          gia_firmato: true,
          message: "Preventivo già firmato dal cliente: il PDF firmato non viene rigenerato.",
        }, 200, corsH);
      }
    }

    // ─── Documento in firma: non si sovrascrive ───
    // Con una richiesta di firma aperta il cliente sta firmando QUEL file, e la
    // sua impronta è sulla richiesta: rigenerarlo sullo stesso percorso cambiava
    // il documento sotto la firma. Per cambiarlo si rimanda la firma, che prima
    // annulla la richiesta aperta e poi congela il PDF nuovo.
    if (quote.pdf_storage_path) {
      const { data: inFirma } = await supabaseAdmin
        .from("signature_requests")
        .select("id")
        .eq("quote_id", quote.id)
        .in("status", ["pending", "otp_verified"])
        .limit(1);
      if (inFirma && inFirma.length > 0) {
        const { data: congelato } = await supabaseAdmin.storage
          .from("quote-pdfs")
          .createSignedUrl(quote.pdf_storage_path, 3600);
        if (congelato?.signedUrl) {
          return jsonResponse({
            success: true,
            pdf_path: quote.pdf_storage_path,
            signed_url: congelato.signedUrl,
            in_firma: true,
            message: "Preventivo in firma dal cliente: si mostra il PDF inviato, non se ne genera uno nuovo.",
          }, 200, corsH);
        }
      }
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
