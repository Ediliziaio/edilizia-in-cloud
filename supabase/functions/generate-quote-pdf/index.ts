import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { preventivoVisibile } from "../_shared/preventivoVisibile.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { PDFDocument, rgb, StandardFonts, degrees } from "https://esm.sh/pdf-lib@1.17.1";
// Libreria template componibile: carica i blocchi linkati + sostituisce merge tag
import { fondoPerTestoBianco, scurisci, schiarisci, testoSuChiaro, testoSuScuro, normalizzaHex } from "../_shared/temaColori.ts";
import { loadTemplateWithBlocks, attachLinkedBlocks, applyMergeTagsToTemplate, buildMergeContext, substituteMergeTags, type ComposedTemplate } from "../_shared/quoteTemplateComposer.ts";
import { condizioniStandard, MODULO_RECESSO } from "../_shared/condizioniStandard.ts";
import { testoPerPdf } from "../_shared/testoPerPdf.ts";
import { formatoImmagine, leggiLogo, logoDiRiserva } from "../_shared/logoAzienda.ts";
import { COLORE_ACCENTO_DI_FABBRICA, coloreCopertina, coloreDelBlocco, colorePreventivo, contattiImpresa, titoliMarkdown } from "../_shared/blocchiModelloPreventivo.ts";
import { componiRighe, logoDelModello, nomeLeggibile, paroleDelTitolo, percorsoDellAzienda, pezziConGrassetto, senzaSezioneClausole, sezioneClausole, titoloGenerico, type ParolaTitolo, type Pezzo } from "../_shared/impaginaPreventivo.ts";
import { agevolazioniPreventivo, riepilogoPrezzi } from "../_shared/prezziPreventivo.ts";

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

    // L'azienda di cui si leggono i file riservati del modello (logo, copertina, timbro): nel
    // preventivo vero quella del preventivo; in anteprima quella del modello, se
    // chi chiama ci può entrare, se no la sua.
    let aziendaAnteprima: string | null = null;

    if (isPreview) {
      // Use sample data – no DB lookups needed
      t = { ...DEFAULT_T, ...template_data };
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      aziendaAnteprima = profile?.company_id ?? null;
      const aziendaDelModello = typeof template_data?.company_id === "string" ? template_data.company_id : null;
      if (aziendaDelModello && aziendaDelModello !== aziendaAnteprima) {
        try {
          await requireCompanyAccess(supabaseAdmin, userId, aziendaDelModello, corsH);
          aziendaAnteprima = aziendaDelModello;
        } catch { /* niente accesso a quell'azienda: resta la sua */ }
      }
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
      Object.assign(company, contattiImpresa(t, company));
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
      // E deve poter vedere QUEL preventivo, con le regole dell'app: la RLS di quotes letta
      // col suo token. L'azienda da sola lasciava generare il PDF di qualsiasi preventivo
      // al cliente del portale, all'utente bloccato e allo staff senza permesso.
      const comeChiChiama = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      if (!(await preventivoVisibile(comeChiChiama, quote.id))) {
        return errorResponse("Preventivo non trovato", 404, corsH);
      }

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
          .select("*, quote_pdf_materials(name, storage_path, company_id)")
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
      // Mail e telefono scritti nel modello valgono più di quelli del profilo
      // (25/09/2026): per Ener il profilo aveva la mail di un consulente, e
      // usciva sotto «L'impresa» e nel modulo di recesso.
      if (company) Object.assign(company, contattiImpresa(t, company));
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
    // Se manca anche quello, vale il colore scelto nei blocchi collegati: Ener aveva
    // copertina e condizioni verdi, e tabella e totale uscivano blu (25/09/2026).
    t.primary_color = colorePreventivo(t.primary_color, company?.brand_primary_color, [t.composed_cover, t.composed_terms, t.composed_legal]);
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
    // La tinta appena accennata: righe alterne della tabella, fascia dei dati, riquadri.
    const tintaLeggeraC = rgbColor(schiarisci(primarioHex, 0.965));
    const inchiostroC = rgbColor("#14181F");
    const filettoC = rgbColor("#E3E6EA");
    const grigioEdC = rgbColor("#5B6472");

    // L'azienda di cui si leggono i file del modello (logo, copertina, timbro), dal
    // contenitore riservato e col service role: solo dalla sua cartella.
    const aziendaDeiFile = isPreview ? aziendaAnteprima : quote?.company_id ?? null;

    // ─── Logo embed ───
    let logoEmbed: any = null;
    // Il logo del modello, se è un percorso, solo dalla cartella dell'azienda; se no
    // (o se non passa) quello aziendale, che oggi è sempre un indirizzo dello storage
    // pubblico e, se un giorno fosse un percorso, passa dalla stessa regola.
    const logoPath = logoDiRiserva(logoDelModello(t.logo_url, aziendaDeiFile), logoDelModello(company?.logo_url, aziendaDeiFile));
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
    // La dimensione del logo scelta nel modello (Piccola, Media, Grande): il
    // classico la ignorava e il logo usciva sempre piccolo (25/09/2026).
    const scalaLogo = t.logo_size === "small" ? 0.8 : t.logo_size === "large" ? 1.4 : 1;

    // ─── Timbro e firma dell'impresa (25/09/2026) ───
    // Si caricano una volta nel modello e si stampano nel riquadro «Per l'impresa»
    // di ogni preventivo. Il file sta nel contenitore riservato dei modelli e si
    // legge solo dalla cartella dell'azienda: il percorso di un'altra resta fuori.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let timbroEmbed: any = null;
    const percorsoTimbro = percorsoDellAzienda(t.timbro_firma_url, aziendaDeiFile);
    if (percorsoTimbro) {
      try {
        const { data: fileTimbro } = await supabaseAdmin.storage.from("quote-template-assets").download(percorsoTimbro);
        const bytes = fileTimbro ? new Uint8Array(await fileTimbro.arrayBuffer()) : null;
        const formato = bytes ? formatoImmagine(bytes) : null;
        if (bytes && formato === "png") timbroEmbed = await pdfDoc.embedPng(bytes);
        else if (bytes && formato === "jpg") timbroEmbed = await pdfDoc.embedJpg(bytes);
      } catch (e) {
        console.warn("[generate-quote-pdf] timbro non caricato (riquadro senza timbro):", e instanceof Error ? e.message : e);
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

    // ── Strumenti di impaginazione (25/09/2026) ──
    // Lettere spaziate per le etichette in maiuscoletto: pdf-lib non ha la spaziatura fra i caratteri.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spaziatoSu = (pg: any, testo: string, x: number, yy: number, size: number, f: any, color: any, passo = 1.2) => {
      let ex = x;
      for (const ch of winAnsiSafe(testo)) { pg.drawText(ch, { x: ex, y: yy, size, font: f, color }); ex += f.widthOfTextAtSize(ch, size) + passo; }
      return ex - x;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const larghezzaSpaziataDi = (testo: string, size: number, f: any, passo = 1.2) =>
      [...winAnsiSafe(testo)].reduce((w, ch) => w + f.widthOfTextAtSize(ch, size) + passo, 0);
    // Il testo che va a capo misurato con il carattere vero (componiRighe): prima si
    // contavano i caratteri e le righe finivano a tre quarti della pagina.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type StileTesto = { f: any; size: number; c: any };
    const misuraStile = (testo: string, st: StileTesto) => st.f.widthOfTextAtSize(winAnsiSafe(testo), st.size);
    const righeDi = (pezzi: Array<Pezzo<StileTesto>>, larghezza: number, primaRiga?: number) =>
      componiRighe(pezzi.map((p) => ({ testo: winAnsiSafe(p.testo), stile: p.stile })), larghezza, misuraStile, primaRiga);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disegnaRiga = (pg: any, riga: Array<{ testo: string; stile: StileTesto; x: number }>, x: number, yy: number) => {
      for (const tr of riga) pg.drawText(tr.testo, { x: x + tr.x, y: yy, size: tr.stile.size, font: tr.stile.f, color: tr.stile.c });
    };
    // Il titolino di una parte: maiuscoletto spaziato, un filetto e un tratto nel
    // colore dell'azienda. Se l'etichetta è più larga della colonna si stringe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titolinoSu = (pg: any, testo: string, x: number, yy: number, w: number) => {
      let size = 7, passo = 1.5;
      while ((passo > 0.4 || size > 5.6) && larghezzaSpaziataDi(testo, size, fontBold, passo) > w) {
        if (passo > 0.4) passo -= 0.2; else size -= 0.2;
      }
      spaziatoSu(pg, testo, x, yy, size, fontBold, inchiostroC, passo);
      pg.drawRectangle({ x, y: yy - 7, width: w, height: 0.6, color: filettoC });
      pg.drawRectangle({ x, y: yy - 7.4, width: 22, height: 1.6, color: fondoEdC });
    };
    // Un rettangolo con gli angoli arrotondati (l'etichetta «Opzionale», i numeri del piano).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arrotondato = (pg: any, x: number, yBase: number, w: number, h: number, color: any, raggio = 3) => {
      const r = Math.min(h / 2, w / 2, raggio);
      pg.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`, { x, y: yBase + h, color });
    };

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

    // Il titolo con la parte fra asterischi in corsivo, in righe della larghezza data.
    // La punteggiatura dopo l'asterisco resta attaccata e non va mai a capo da sola.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const righeDelTitolo = (titolo: string, corpo: number, largo: number, fCorsivo: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type Posata = ParolaTitolo & { x: number; f: any; size: number; w: number };
      const spazio = fontBold.widthOfTextAtSize(" ", corpo);
      const righe: Posata[][] = [];
      let riga: Posata[] = [];
      let occupata = 0;
      for (const p of paroleDelTitolo(titolo)) {
        const testo = winAnsiSafe(p.testo);
        if (!testo) continue;
        const f = p.accento ? fCorsivo : fontBold;
        const size = p.accento ? corpo * 1.1 : corpo;
        const w = f.widthOfTextAtSize(testo, size);
        if (riga.length > 0 && !p.attaccata && occupata + spazio + w > largo) {
          righe.push(riga);
          riga = [];
          occupata = 0;
        }
        const gap = riga.length > 0 && !p.attaccata ? spazio : 0;
        riga.push({ ...p, testo, x: occupata + gap, f, size, w });
        occupata += gap + w;
      }
      if (riga.length > 0) righe.push(riga);
      return righe.map((parole) => ({ parole, larghezza: parole.length ? parole[parole.length - 1].x + parole[parole.length - 1].w : 0 }));
    };

    // ═══════════════════════════════════════
    // PAGINA DI COPERTINA (blocco "Copertina" della libreria o campi inline)
    // ═══════════════════════════════════════
    // Prima di oggi i campi cover_title/cover_subtitle/cover_image_url venivano
    // caricati ma nessuno li disegnava: la copertina collegata non usciva mai.
    // Una pagina dedicata: immagine (se c'è) in alto, titolo grande, sottotitolo,
    // riquadro con numero/data/cliente, azienda in basso. Senza numero di pagina.
    let pagineSenzaFooter = 0;
    // L'immagine di copertina, come logo e timbro, solo dalla cartella dell'azienda:
    // un percorso altrui non fa nemmeno nascere la pagina di copertina.
    const percorsoCopertina = percorsoDellAzienda(t.cover_image_url, aziendaDeiFile);
    const haCopertina = !!(String(t.cover_title ?? "").trim() || String(t.cover_subtitle ?? "").trim() || (t.show_cover_image && percorsoCopertina));
    if (haCopertina) {
      // Stesso linguaggio del «Piano dei lavori» dei moduli edili: pagina nel colore
      // dell'azienda, foto in tinta, titolo con una parola in corsivo (fra asterischi),
      // barra a segmenti e scheda in basso. Prima era una pagina bianca da modulo.
      const cover = pdfDoc.addPage([pageWidth, pageHeight]);
      pagineSenzaFooter = 1;
      // Il colore della copertina collegata, se è stato scelto; se no quello del
      // modello. Prima valeva solo il modello: Ener ha messo la copertina verde
      // e il PDF usciva blu (25/09/2026).
      const fondoHex = fondoPerTestoBianco(coloreCopertina(t.primary_color, t.composed_cover));
      const scuroHex = scurisci(fondoHex, 0.4);
      const fondoC = rgbColor(fondoHex);
      const scuroC = rgbColor(scuroHex);
      const biancoC = rgb(1, 1, 1);
      const evidenzaC = rgbColor(testoSuScuro(schiarisci(fondoHex, 0.5), scuroHex, 4.5));
      const fontCorsivo = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: scuroC });

      let conFoto = false;
      if (t.show_cover_image && percorsoCopertina) {
        try {
          const { data: fileData } = await supabaseAdmin.storage.from("quote-template-assets").download(percorsoCopertina);
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

      // In alto: il logo su una targhetta bianca arrotondata (i loghi nascono per il
      // fondo chiaro), grande quanto dice il modello; senza logo, il nome. A destra
      // chi emette il preventivo: nome, mail e telefono dell'impresa.
      // 25/09/2026: prima una targhetta di 40 punti, qualunque dimensione si scegliesse.
      const margineC = 48;
      const largoC = pageWidth - margineC * 2;
      const topC = pageHeight - 44;
      const conLogoC = !!(logoEmbed && t.show_logo);
      let largoTarghetta = 0;
      if (conLogoC) {
        const sc = Math.min((58 * scalaLogo) / logoEmbed.height, (210 * scalaLogo) / logoEmbed.width);
        const lw = logoEmbed.width * sc, lh = logoEmbed.height * sc;
        const padX = 16, padY = 12;
        largoTarghetta = lw + padX * 2;
        arrotondato(cover, margineC, topC - lh - padY * 2, largoTarghetta, lh + padY * 2, biancoC, 8);
        cover.drawImage(logoEmbed, { x: margineC + padX, y: topC - lh - padY, width: lw, height: lh });
      }
      const contattiC = [company?.email, company?.phone ? `Tel. ${company.phone}` : null].filter(Boolean).join("  ·  ");
      // Col logo, nome e contatti a destra, mai sopra la targhetta; senza logo il nome
      // spaziato sta a sinistra e i contatti gli vanno sotto (un nome lungo li copriva).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const righeEmittente: Array<{ testo: string; f: any; size: number; opacity: number }> = [
        ...(conLogoC && company?.name ? [{ testo: String(company.name), f: fontBold, size: 10, opacity: 1 }] : []),
        ...(conLogoC && contattiC ? [{ testo: contattiC, f: font, size: 7.8, opacity: 0.8 }] : []),
      ];
      const largoDestra = Math.min(largoC * 0.5, largoC - largoTarghetta - 24);
      let yEmittente = topC - 12;
      for (const r of righeEmittente) {
        let testo = winAnsiSafe(r.testo);
        while (testo.length > 3 && r.f.widthOfTextAtSize(testo, r.size) > largoDestra) testo = testo.slice(0, -2);
        if (testo !== winAnsiSafe(r.testo)) testo = testo.trimEnd() + "…";
        if (largoDestra > 40) cover.drawText(testo, { x: pageWidth - margineC - r.f.widthOfTextAtSize(testo, r.size), y: yEmittente, size: r.size, font: r.f, color: biancoC, opacity: r.opacity });
        yEmittente -= r.size + 5;
      }
      if (!conLogoC && contattiC) {
        let testo = winAnsiSafe(contattiC);
        while (testo.length > 3 && font.widthOfTextAtSize(testo, 7.8) > largoC) testo = testo.slice(0, -2);
        cover.drawText(testo, { x: margineC, y: pageHeight - 78, size: 7.8, font, color: biancoC, opacity: 0.8 });
      }
      if (!conLogoC && company?.name) {
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
      // Il nome del cliente scritto tutto maiuscolo («ROSSI MARIO») nel titolo
      // grande si legge meglio così: «Rossi Mario». Il dato resta com'è altrove.
      const nomeCliente = String(quote.client_name ?? "").trim();
      const nomeDaRendereLeggibile = nomeCliente.length > 2 && nomeCliente === nomeCliente.toUpperCase() && /\p{Lu}/u.test(nomeCliente);
      const conNomeLeggibile = (testo: string) => nomeDaRendereLeggibile ? testo.split(nomeCliente).join(nomeLeggibile(nomeCliente)) : testo;
      const titoloGrezzo = conNomeLeggibile(String(t.cover_title ?? "").trim()) || "La nostra *offerta* per voi.";
      const corpoT = 38;
      const righeT = righeDelTitolo(titoloGrezzo, corpoT, largoC * 0.94, fontCorsivo).slice(0, 4);
      const sottotitolo = winAnsiSafe(conNomeLeggibile(String(t.cover_subtitle ?? "").trim()) || String(quote.title ?? "").trim());
      const righeSotto = sottotitolo ? wrapText(sottotitolo, 62).slice(0, 3) : [];
      const interlinea = corpoT * 1.2;
      // Dal basso verso l'alto: scheda, sottotitolo, titolo, occhiello.
      let yT = ySch + 34 + 40 + righeSotto.length * 18 + (righeSotto.length ? 14 : 0) + (righeT.length - 1) * interlinea;
      let ex2 = margineC;
      for (const ch of "PREVENTIVO") { cover.drawText(ch, { x: ex2, y: yT + corpoT + 12, size: 8.5, font: fontBold, color: evidenzaC }); ex2 += fontBold.widthOfTextAtSize(ch, 8.5) + 2.4; }
      for (const riga of righeT) {
        for (const pa of riga.parole) {
          cover.drawText(pa.testo, { x: margineC + pa.x, y: yT, size: pa.size, font: pa.f, color: pa.accento ? evidenzaC : biancoC });
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

    // La testata delle pagine interne del classico: il logo (o il nome) a sinistra,
    // il numero del preventivo a destra, un filetto. Restituisce dove comincia il testo.
    // Prima ogni pagina ripeteva il logo grande e un titolo nero con la riga piena.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testataInterna = (pg: any): number => {
      const yT = pageHeight - 40;
      if (logoEmbed && t.show_logo) {
        const sc = Math.min((22 * scalaLogo) / logoEmbed.height, (120 * scalaLogo) / logoEmbed.width);
        pg.drawImage(logoEmbed, { x: margin, y: yT - 6, width: logoEmbed.width * sc, height: logoEmbed.height * sc });
      } else {
        let nome = winAnsiSafe(String(company?.name || "")).toUpperCase();
        while (nome.length > 3 && larghezzaSpaziataDi(nome, 7.5, fontBold, 0.6) > contentWidth - 200) nome = nome.slice(0, -2);
        spaziatoSu(pg, nome, margin, yT, 7.5, fontBold, inchiostroC, 0.6);
      }
      const et = `PREVENTIVO${t.show_quote_number ? ` N. ${quote.quote_number}${revLabel}` : ""}`;
      spaziatoSu(pg, et, pageWidth - margin - larghezzaSpaziataDi(et, 6.3, fontBold, 1.2), yT, 6.3, fontBold, grigioEdC, 1.2);
      pg.drawLine({ start: { x: margin, y: yT - 13 }, end: { x: pageWidth - margin, y: yT - 13 }, thickness: 0.5, color: filettoC });
      return yT - 13 - 30;
    };
    // «CONDIZIONI CONTRATTUALI» → «Condizioni contrattuali»: il titolo grande non urla.
    const leggibile = (titolo: string) =>
      titolo === titolo.toUpperCase() ? titolo.charAt(0) + titolo.slice(1).toLowerCase() : titolo;

    // `continua`: la stessa sezione che passa alla pagina dopo. Nel classico il titolo
    // grande sta solo sulla prima pagina; sulle altre un occhiello «… · segue».
    const startContentPage = (title: string, continua = false) => {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      if (classicPremium) {
        y = testataInterna(page);
        if (continua) {
          spaziatoSu(page, `${title} · SEGUE`.toUpperCase(), margin, y, 6.3, fontBold, inkMarcaC, 1.3);
          y -= 22;
          return;
        }
        y -= 6;
        for (const riga of righeDi([{ testo: leggibile(title), stile: { f: fontBold, size: 19, c: inchiostroC } }], contentWidth).slice(0, 3)) {
          disegnaRiga(page, riga, margin, y);
          y -= 23;
        }
        page.drawRectangle({ x: margin, y: y + 9, width: 34, height: 2.4, color: fondoEdC });
        y -= 16;
        return;
      }
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
      if (classicPremium) {
        spaziatoSu(page, title.toUpperCase(), x, y, 7, fontBold, inchiostroC, 1.5);
        page.drawRectangle({ x, y: y - 7, width: pageWidth - margin - x, height: 0.6, color: filettoC });
        page.drawRectangle({ x, y: y - 7.4, width: 22, height: 1.6, color: fondoEdC });
        y -= 24;
        return;
      }
      page.drawText(title, { x, y, size: 13, font: fontBold, color: primaryC });
      y -= 22;
      page.drawLine({ start: { x, y: y + 8 }, end: { x: pageWidth - margin, y: y + 8 }, thickness: 0.6, color: accentC });
    };

    const ensureSpace = (needed = 40, title = "CONTINUA") => {
      if (y > margin + needed) return;
      drawWatermark(page);
      startContentPage(title, true);
    };

    const contentLeftX = () => (t.layout === "bold" ? 100 : margin);
    const contentMaxWidth = () => (t.layout === "bold" ? contentWidth - 50 : contentWidth);

    // Restituisce il titolo con cui la sezione è uscita (quello del testo, se lo prende da lì).
    const drawRichTextBlock = async (title: string, body: unknown, opts: { titoloDalTesto?: boolean; fontFamily?: string | null; colore?: string | null } = {}): Promise<string> => {
      // …e il suo colore, per i titoli: quello scelto nel blocco o quello del master.
      const titoliC = opts.colore ? rgbColor(opts.colore) : primaryC;
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
      if (!text) return title;
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
      const larghezza = contentMaxWidth();
      // Il testo va a capo misurato su tutta la larghezza (prima: 96 caratteri, tre
      // quarti di pagina). Gli elenchi hanno il pallino e il rientro; «a)» e «1.2»
      // in testa al paragrafo sono in grassetto, come il **grassetto** del testo.
      const corpo = sz(8.8);
      const interlinea = Math.round(13 * lhScale * 10) / 10;
      const normale: StileTesto = { f: fontB, size: corpo, c: textC };
      const grassetto: StileTesto = { f: fontBoldB, size: corpo, c: textC };
      const rimando: StileTesto = { f: fontBoldB, size: corpo, c: titoliC };
      let precedenteEraHeading = true; // in testa alla pagina niente spazio extra
      let precedenteEraVoce = false;
      for (const rawLine of text.split(/\n+/)) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const livello = /^(#{1,4})\s+/.exec(trimmed)?.[1].length ?? 0;
        if (livello > 0) {
          // Gerarchia visibile: H1 13pt, H2 11pt, H3+ 9.8pt; aria prima di ogni titolo,
          // e il titolo non resta in fondo alla pagina senza il suo testo.
          const size = sz((livello === 1 ? 13 : livello === 2 ? 11 : 9.8) * hScale);
          if (!precedenteEraHeading) y -= livello === 1 ? 14 : 9;
          // Gli articoli nel colore del blocco; un titolo di primo livello dentro il
          // testo («Termini legali» dopo le condizioni) nel nero del documento.
          const stile: StileTesto = { f: fontBoldB, size, c: livello === 1 ? inchiostroC : titoliC };
          const righeTitolo = righeDi([{ testo: trimmed.replace(/^#{1,4}\s+/, ""), stile }], larghezza);
          ensureSpace(righeTitolo.length * (size + 5) + interlinea * 2 + 6, title);
          for (const riga of righeTitolo) {
            disegnaRiga(page, riga, x, y);
            y -= size + 5;
          }
          y -= 1;
          precedenteEraHeading = true;
          precedenteEraVoce = false;
          continue;
        }
        const voce = /^[-*•]\s+(.+)$/.exec(trimmed);
        const lettera = voce ? null : /^([a-z]\)|\d{1,2}\))\s+(.+)$/i.exec(trimmed);
        const numerato = voce || lettera ? null : /^(\d{1,2}(?:\.\d{1,2})+\.?)\s+(.+)$/.exec(trimmed);
        const rientro = voce ? 12 : lettera ? 16 : 0;
        // Finito un elenco, il paragrafo che segue prende un po' d'aria.
        if (precedenteEraVoce && !voce) y -= 3;
        precedenteEraVoce = Boolean(voce);
        const pezzi: Array<Pezzo<StileTesto>> = [
          ...(numerato ? [{ testo: `${numerato[1]} `, stile: rimando }] : []),
          ...pezziConGrassetto(voce?.[1] ?? lettera?.[2] ?? numerato?.[2] ?? trimmed, normale, grassetto),
        ];
        const righe = righeDi(pezzi, larghezza - rientro);
        righe.forEach((riga, i) => {
          ensureSpace(18, title);
          if (i === 0 && voce) page.drawCircle({ x: x + 4, y: y + corpo * 0.33, size: 1.4, color: titoliC });
          if (i === 0 && lettera) page.drawText(lettera[1], { x, y, size: corpo, font: fontBoldB, color: titoliC });
          disegnaRiga(page, riga, x + rientro, y);
          y -= interlinea;
        });
        y -= voce ? 1.5 : 4;
        precedenteEraHeading = false;
      }
      drawWatermark(page);
      return title;
    };

    const drawProductBlocks = () => {
      const products = (t.composed_products ?? []).filter(Boolean);
      if (!products.length) return;
      startContentPage("SCHEDE PRODOTTO");
      const x = contentLeftX();
      const w = contentMaxWidth();
      for (const product of products) {
        // I colori scelti nella scheda (bordo, categoria, prezzo; fondo): se no quelli del master.
        const primarioScheda = coloreDelBlocco(product.primary_color);
        const accentoScheda = coloreDelBlocco(product.accent_color, COLORE_ACCENTO_DI_FABBRICA);
        const schedaC = primarioScheda ? rgbColor(primarioScheda) : primaryC;
        const fondoSchedaC = accentoScheda ? rgbColor(accentoScheda) : (classicPremium ? tintaLeggeraC : accentC);
        if (classicPremium) {
          // Nel classico la scheda cresce col suo testo: la categoria, il nome, la
          // descrizione che va a capo, le caratteristiche; il prezzo in alto a destra.
          // Prima era un riquadro alto 82 punti che tagliava la descrizione a due righe.
          const pad = 14;
          const prezzo = product.product_indicative_price !== null && product.product_indicative_price !== undefined
            ? `${fmtEur(Number(product.product_indicative_price))}${product.product_unit ? `/${product.product_unit}` : ""}`
            : "";
          const wPrezzo = prezzo ? textW(prezzo, 11, fontBold) + 16 : 0;
          const righeNome = righeDi([{ testo: String(product.name || "Scheda prodotto"), stile: { f: fontBold, size: 11.5, c: inchiostroC } }], w - pad * 2 - wPrezzo).slice(0, 2);
          const descScheda = normalizeTemplateText(product.product_short_description || product.product_long_description).replace(/\s+/g, " ");
          const righeDesc = descScheda ? righeDi([{ testo: descScheda, stile: { f: font, size: 8.2, c: grigioEdC } }], w - pad * 2).slice(0, 5) : [];
          const caratteristiche = (Array.isArray(product.product_specs) ? product.product_specs : [])
            .filter((sp: any) => sp?.label || sp?.value)
            .slice(0, 6)
            .map((sp: any) => `${sp.label ?? ""}${sp.label && sp.value ? ": " : ""}${sp.value ?? ""}`.trim())
            .join("  ·  ");
          const righeSpec = caratteristiche ? righeDi([{ testo: caratteristiche, stile: { f: fontBold, size: 7.4, c: inchiostroC } }], w - pad * 2).slice(0, 2) : [];
          const cardH = pad + 12 + righeNome.length * 14 + (righeDesc.length ? 4 + righeDesc.length * 11 : 0) + (righeSpec.length ? 8 + righeSpec.length * 10 : 0) + pad - 4;
          ensureSpace(cardH + 16, "SCHEDE PRODOTTO");
          const top = y + 8;
          page.drawRectangle({ x, y: top - cardH, width: w, height: cardH, color: fondoSchedaC });
          page.drawRectangle({ x, y: top - cardH, width: 3, height: cardH, color: schedaC });
          let yy = top - pad - 6;
          spaziatoSu(page, String(product.product_category || "Prodotto").toUpperCase(), x + pad, yy, 6.3, fontBold, schedaC, 1.3);
          if (prezzo) drawRight(page, prezzo, x + w - pad, yy - 12, 11, fontBold, schedaC);
          yy -= 16;
          for (const riga of righeNome) { disegnaRiga(page, riga, x + pad, yy); yy -= 14; }
          if (righeDesc.length) {
            yy -= 3;
            for (const riga of righeDesc) { disegnaRiga(page, riga, x + pad, yy); yy -= 11; }
          }
          if (righeSpec.length) {
            yy -= 6;
            for (const riga of righeSpec) { disegnaRiga(page, riga, x + pad, yy); yy -= 10; }
          }
          y -= cardH + 14;
          continue;
        }
        ensureSpace(92, "SCHEDE PRODOTTO");
        const cardTop = y;
        const cardH = 82;
        page.drawRectangle({
          x,
          y: cardTop - cardH + 8,
          width: w,
          height: cardH,
          color: fondoSchedaC,
          borderColor: schedaC,
          borderWidth: 0.4,
        });
        page.drawText(product.product_category || "Prodotto", {
          x: x + 12,
          y: cardTop - 12,
          size: 7.2,
          font: fontBold,
          color: schedaC,
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
            color: schedaC,
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
      // Classic premium (default): il logo e il numero, la barra a segmenti nel
      // colore dell'azienda, il titolo con il corsivo, la fascia dei dati, le due
      // parti, l'oggetto e il luogo dei lavori.
      // 25/09/2026: logo più grande, il titolo dice per chi è quando il preventivo
      // si chiama solo «Preventivo», i dati stanno in una fascia in tinta e il
      // testo va a capo misurato invece di essere tagliato.
      const spaziato = (testo: string, x: number, yy: number, size: number, f: any, color: any, passo = 1.2) =>
        spaziatoSu(page, testo, x, yy, size, f, color, passo);
      const larghezzaSpaziata = larghezzaSpaziataDi;
      const segmenti = (x: number, yy: number, w: number, spessore = 2.5) => {
        const opacita = [1, 0.72, 0.48, 0.28, 0.14];
        const passo = w / opacita.length;
        opacita.forEach((o, i) => page.drawRectangle({ x: x + i * passo, y: yy, width: passo - (i < opacita.length - 1 ? 3 : 0), height: spessore, color: fondoEdC, opacity: o }));
      };

      const yTesta = pageHeight - 46;
      // Il logo parte a 30 punti dal bordo e scende quanto è alto (Piccola/Media/Grande
      // nel modello): la barra a segmenti e il titolo gli stanno sotto.
      let baseLogo = yTesta - 10;
      if (logoEmbed && t.show_logo) {
        const scale = Math.min((40 * scalaLogo) / logoEmbed.height, (180 * scalaLogo) / logoEmbed.width);
        const altezzaLogo = logoEmbed.height * scale;
        baseLogo = Math.min(yTesta - 10, pageHeight - 30 - altezzaLogo);
        page.drawImage(logoEmbed, { x: margin, y: baseLogo, width: logoEmbed.width * scale, height: altezzaLogo });
      } else {
        let nome = winAnsiSafe(String(company?.name || "Azienda")).toUpperCase();
        while (nome.length > 3 && larghezzaSpaziata(nome, 10, fontBold, 0.6) > contentWidth - 200) nome = nome.slice(0, -2);
        spaziato(nome, margin, yTesta, 10, fontBold, inchiostroC, 0.6);
      }
      const etichettaDoc = `PREVENTIVO${t.show_quote_number ? ` · N. ${quote.quote_number}${revLabel}` : ""}`;
      const wEt = larghezzaSpaziata(etichettaDoc, 6.8, fontBold, 1.3);
      spaziato(etichettaDoc, pageWidth - margin - wEt, yTesta + 6, 6.8, fontBold, inkMarcaC, 1.3);
      const dataDocTesto = new Date(quote.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
      drawRight(page, dataDocTesto, pageWidth - margin, yTesta - 6, 8, font, grigioEdC);
      const ySegmenti = Math.min(yTesta - 22, baseLogo - 12);
      segmenti(margin, ySegmenti, contentWidth);

      // ── Titolo: occhiello e frase, con la parola fra asterischi in corsivo ──
      y = ySegmenti - 34;
      const fontCorsivoT = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      const occhiello = "LA NOSTRA OFFERTA";
      const xTitolo = (w: number) => allineaHeader === "center" ? (pageWidth - w) / 2 : allineaHeader === "right" ? pageWidth - margin - w : margin;
      spaziato(occhiello, xTitolo(larghezzaSpaziata(occhiello, 7, fontBold, 1.6)), y, 7, fontBold, inkMarcaC, 1.6);
      y -= 30;
      // Un preventivo che si chiama solo «Preventivo» (il nome che l'app dà di
      // serie) non dice niente in cima alla pagina: allora si scrive per chi è.
      const titoloPreventivo = String(quote.title ?? "").trim();
      const perChi = nomeLeggibile(String(quote.client_name ?? quote.client_company ?? "")).replace(/\*/g, "");
      const titoloGrezzo = titoloPreventivo && !titoloGenerico(titoloPreventivo, quote.quote_number)
        ? titoloPreventivo
        : perChi ? `Preventivo per *${perChi}*` : (titoloPreventivo || "Il nostro *preventivo*");
      {
        const corpo = 23;
        for (const riga of righeDelTitolo(titoloGrezzo, corpo, contentWidth * 0.9, fontCorsivoT).slice(0, 3)) {
          const x0 = xTitolo(riga.larghezza);
          for (const pa of riga.parole) {
            page.drawText(pa.testo, { x: x0 + pa.x, y, size: pa.size, font: pa.f, color: pa.accento ? inkMarcaC : inchiostroC });
          }
          y -= corpo * 1.2;
        }
      }

      // ── La fascia dei dati del documento ──
      y -= 8;
      const datiDoc: Array<[string, string]> = [
        ...(t.show_quote_number ? [["NUMERO", `${quote.quote_number}${revLabel}`] as [string, string]] : []),
        ["DATA", new Date(quote.created_at).toLocaleDateString("it-IT")],
        ...(t.show_validity_date && quote.expires_at ? [["VALIDO FINO AL", new Date(quote.expires_at).toLocaleDateString("it-IT")] as [string, string]] : []),
        ...(quote.client_name ? [["PREPARATO PER", String(quote.client_name)] as [string, string]] : []),
      ];
      const hFascia = 40;
      page.drawRectangle({ x: margin, y: y - hFascia, width: contentWidth, height: hFascia, color: tintaLeggeraC });
      page.drawRectangle({ x: margin, y: y - hFascia, width: 3, height: hFascia, color: fondoEdC });
      const wCol = (contentWidth - 18) / Math.max(1, datiDoc.length);
      datiDoc.forEach(([etichetta, valore], i) => {
        const cx = margin + 18 + i * wCol;
        spaziato(etichetta, cx, y - 15, 6.3, fontBold, inkMarcaC, 1.2);
        let v = winAnsiSafe(valore);
        while (v.length > 3 && fontBold.widthOfTextAtSize(v, 9.5) > wCol - 10) v = v.slice(0, -2);
        if (v !== winAnsiSafe(valore)) v = v.trimEnd() + "…";
        page.drawText(v, { x: cx, y: y - 29, size: 9.5, font: fontBold, color: inchiostroC });
      });
      y -= hFascia + 26;

      // ── Le due parti: l'impresa e il cliente, senza riquadri ──
      // Il titolino: maiuscoletto spaziato, un filetto e un tratto nel colore dell'azienda.
      const titolino = (testo: string, x: number, yy: number, w: number) => titolinoSu(page, testo, x, yy, w);
      const boxW = (contentWidth - 28) / 2;
      const bX = margin + boxW + 28;
      titolino("L'IMPRESA", margin, y, boxW);
      titolino("IL CLIENTE", bX, y, boxW);
      let ay = y - 22;
      let by = y - 22;
      // Una voce della scheda: va a capo (al massimo due righe) invece di essere tagliata.
      const voce = (xx: number, yy: number, testo: string, bold: boolean): number => {
        const stile: StileTesto = { f: bold ? fontBold : font, size: bold ? 9.5 : 8.8, c: bold ? inchiostroC : grigioEdC };
        let yv = yy;
        for (const r of righeDi([{ testo, stile }], boxW).slice(0, 2)) { disegnaRiga(page, r, xx, yv); yv -= bold ? 13 : 11.5; }
        return yv;
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
      for (const [testo, bold] of righeImpresa) ay = voce(margin, ay, testo, bold);
      for (const [testo, bold] of righeCliente) by = voce(bX, by, testo, bold);
      y = Math.min(ay, by) - 14;

      // ── Oggetto e luogo dei lavori ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const luogo = (quote as any).indirizzo_lavori || quote.client_address;
      const oggetto = quote.description && quote.description !== quote.title ? String(quote.description).replace(/\s+/g, " ") : "";
      if (oggetto) {
        titolino("OGGETTO DELL'INTERVENTO", margin, y, contentWidth);
        y -= 22;
        for (const r of righeDi([{ testo: oggetto, stile: { f: font, size: 9, c: grigioEdC } }], contentWidth).slice(0, 5)) {
          disegnaRiga(page, r, margin, y);
          y -= 12.5;
        }
        y -= 10;
      }
      if (luogo) {
        const wEtichetta = spaziato("LUOGO DEI LAVORI", margin, y, 6.5, fontBold, inkMarcaC, 1.2) + 10;
        for (const r of righeDi([{ testo: String(luogo), stile: { f: fontBold, size: 9, c: inchiostroC } }], contentWidth - wEtichetta).slice(0, 2)) {
          disegnaRiga(page, r, margin + wEtichetta, y);
          y -= 12;
        }
        y -= 14;
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
        y = classicPremium ? testataInterna(page) : pageHeight - margin;
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

      // ── Le colonne del classico (25/09/2026) ──
      // N. | DESCRIZIONE | Q.TÀ con l'unità («4 pz») | PREZZO UNIT. | IVA | IMPORTO.
      // Ogni colonna è larga quanto il suo valore più lungo: quello che avanza va
      // alla descrizione, che prima si fermava a 42 caratteri.
      const mostraImportoRiga = !prezzoManualeAttivo;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mostraPrezziRiga = !prezzoManualeAttivo && (quote as any).pdf_mostra_prezzi_per_riga !== false;
      const mostraScontoRiga = opzione("pdf_mostra_sconti", pdfImp.pdf_mostra_sconti !== false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const righeVere = items.filter((i: any) => !["nota", "subtotale"].includes(i.item_category || "prodotto"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quantitaDi = (i: any) => {
        let um = String(i.unit_of_measure || "pz");
        while (um.length > 1 && textW(um, 8.5) > 44) um = um.slice(0, -1);
        return `${FORMATO_QUANTITA.format(Number(i.quantity ?? 0))} ${um}`;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const importoDi = (i: any) => {
        const lt = i.line_total;
        return lt != null && lt !== ""
          ? Number(lt)
          : Number(i.quantity) * Number(i.unit_price) * (1 - Number(i.discount_percent || 0) / 100);
      };
      const etichettaTab = (testo: string) => larghezzaSpaziataDi(testo, 6.3, fontBold, 0.9);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const piuLargo = (valori: string[], size: number, f: any, minimo: number) =>
        valori.reduce((m, v) => Math.max(m, textW(v, size, f)), minimo);
      const cNumX = itemLeftX + 10;
      const cDescX = itemLeftX + 34;
      const cImportoR = itemLeftX + itemWidth - 10;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wImporto = piuLargo(righeVere.map((i: any) => fmtEur(importoDi(i))), 9, fontBold, etichettaTab("IMPORTO"));
      const cIvaR = cImportoR - (mostraImportoRiga ? wImporto + 18 : 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wIva = piuLargo(righeVere.map((i: any) => `${Number(i.vat_rate || 0)}%`), 8, font, etichettaTab("IVA"));
      const cPrezzoR = cIvaR - (mostraPrezziRiga ? wIva + 16 : 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wPrezzo = piuLargo(righeVere.map((i: any) => fmtEur(Number(i.unit_price || 0))), 8.5, font, etichettaTab("PREZZO UNIT."));
      const cQtaR = mostraPrezziRiga ? cPrezzoR - wPrezzo - 18 : cPrezzoR;
      const wQta = piuLargo(righeVere.map(quantitaDi), 8.5, font, etichettaTab("Q.TÀ"));
      const cDescW = Math.max(150, cQtaR - wQta - 18 - cDescX);

      const drawTableHeader = () => {
        if (classicPremium) {
          // Una fascia nel colore dell'azienda con le etichette in bianco: la tabella
          // si riconosce da lontano. Prima: etichette grigie sopra un filetto scuro.
          const hFascia = 22;
          const bianco = rgb(1, 1, 1);
          page.drawRectangle({ x: itemLeftX, y: y - hFascia, width: itemWidth, height: hFascia, color: fondoEdC });
          const yEt = y - 13.8;
          const aDestra = (testo: string, xR: number) => spaziatoSu(page, testo, xR - etichettaTab(testo) + 0.9, yEt, 6.3, fontBold, bianco, 0.9);
          spaziatoSu(page, "N.", cNumX, yEt, 6.3, fontBold, bianco, 0.9);
          spaziatoSu(page, "DESCRIZIONE", cDescX, yEt, 6.3, fontBold, bianco, 0.9);
          aDestra("Q.TÀ", cQtaR);
          if (mostraPrezziRiga) {
            aDestra("PREZZO UNIT.", cPrezzoR);
            aDestra("IVA", cIvaR);
          }
          if (mostraImportoRiga) aDestra("IMPORTO", cImportoR);
          y -= hFascia;
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

      // ── Una riga della tabella del classico ──
      // Il nome va a capo (prima era tagliato: «Veranda in alluminio a taglio
      // termico 4,2…»), sotto la descrizione in grigio e misure e attributi in
      // corsivo; sulla prima riga quantità, prezzo, IVA e importo. Righe alterne
      // in tinta, un filetto fra una riga e l'altra. `y` è il bordo alto della riga.
      const piedeTabella = 62;
      const paginaDopoTabella = () => {
        drawWatermark(page);
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = testataInterna(page);
        spaziatoSu(page, "DETTAGLIO DELL'OFFERTA · SEGUE", itemLeftX, y, 6.3, fontBold, inkMarcaC, 1.3);
        y -= 14;
        drawTableHeader();
      };
      const rigaDelClassico = async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        item: any,
        idx: number,
        tipo: { isNota: boolean; isSubtotale: boolean; isChild: boolean; isOptional: boolean },
      ) => {
        if (tipo.isNota) {
          const righe = righeDi([{ testo: String(item.name || ""), stile: { f: fontItalic, size: 8, c: grigioEdC } }], cImportoR - cDescX).slice(0, 4);
          const h = 12 + righe.length * 10.5;
          if (y - h < piedeTabella) paginaDopoTabella();
          page.drawRectangle({ x: cDescX - 9, y: y - h + 5, width: 2, height: h - 10, color: fondoEdC });
          let yy = y - 14;
          for (const r of righe) { disegnaRiga(page, r, cDescX, yy); yy -= 10.5; }
          y -= h;
          return;
        }
        if (tipo.isSubtotale) {
          // Righe a 0€ col prezzo scritto a mano: un subtotale di zeri non direbbe niente.
          if (prezzoManualeAttivo) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const subVal = items.slice(0, idx).reduce((somma: number, i: any) => {
            const cat = i.item_category || "prodotto";
            if (i.is_optional || cat === "nota" || cat === "subtotale") return somma;
            return somma + importoDi(i);
          }, 0);
          const h = 26;
          if (y - h < piedeTabella) paginaDopoTabella();
          // Il filetto sta SOPRA il testo: prima passava sulla cifra e la barrava.
          page.drawLine({ start: { x: cPrezzoR - 40, y: y - 5 }, end: { x: cImportoR + 4, y: y - 5 }, thickness: 0.8, color: inchiostroC });
          const et = "SUBTOTALE";
          spaziatoSu(page, et, (mostraPrezziRiga ? cIvaR : cImportoR - wImporto - 18) - larghezzaSpaziataDi(et, 6.3, fontBold, 1.1), y - 17, 6.3, fontBold, grigioEdC, 1.1);
          drawRight(page, fmtEur(subVal), cImportoR, y - 17.5, 9, fontBold, inchiostroC);
          y -= h;
          return;
        }
        rowNumber += 1;
        const { isChild, isOptional } = tipo;
        // Sotto-descrizione solo se aggiunge informazione (spesso ripete il nome).
        const hasDesc = !!(
          item.description &&
          item.description !== item.name &&
          !String(item.name).toLowerCase().includes(String(item.description).toLowerCase().trim())
        );
        // Misure (L×H) e attributi (colore, apertura…), come nelle altre impaginazioni.
        const dettagli: string[] = [];
        if (opzione("pdf_mostra_misure")) {
          const mx = item.misura_x, my = item.misura_y;
          if (mx != null || my != null) {
            const fmtMm = (n: unknown) => n == null ? "—" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 1, useGrouping: false });
            dettagli.push(`L ${fmtMm(mx)} × H ${fmtMm(my)} mm`);
          }
        }
        if (opzione("pdf_mostra_attributi")) {
          const ax = item.axis_selections;
          if (ax && typeof ax === "object" && !Array.isArray(ax)) {
            const coppie = Object.entries(ax as Record<string, unknown>)
              .filter(([, val]) => val != null && String(val).trim() !== "")
              .map(([k, val]) => {
                const nome = nomiAssi.get(`${item.family_id}:${k}`) ?? (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "));
                const grezzo = String(val);
                return `${nome}: ${etichetteValori.get(grezzo) ?? grezzo}`;
              });
            if (coppie.length) dettagli.push(coppie.join(" · "));
          }
        }
        const immagineRiga = opzione("pdf_mostra_immagini", false)
          ? await immagineProdotto(item.image_url || immaginiRighe.get(`a:${item.article_template_id}`) || immaginiRighe.get(`f:${item.family_id}`) || "")
          : null;

        const rientro = isChild ? 13 : 0;
        const stNome: StileTesto = { f: isChild ? font : fontBold, size: isChild ? 8.6 : 9, c: inchiostroC };
        const etOpz = "OPZIONALE";
        const wOpz = isOptional ? larghezzaSpaziataDi(etOpz, 5.6, fontBold, 0.7) + 8 : 0;
        const wTesto = cDescW - rientro;
        const righeNome = righeDi([{ testo: String(item.name || ""), stile: stNome }], wTesto, wTesto - (wOpz ? wOpz + 5 : 0)).slice(0, 3);
        const righeDesc = hasDesc
          ? righeDi([{ testo: String(item.description).replace(/\s+/g, " "), stile: { f: font, size: 7.6, c: grigioEdC } }], wTesto).slice(0, 4)
          : [];
        const righeDett = dettagli.length
          ? righeDi([{ testo: dettagli.join("  ·  "), stile: { f: fontItalic, size: 7.2, c: grigioEdC } }], wTesto).slice(0, 2)
          : [];
        const lead = stNome.size + 3.4;
        const discPct = Number(item.discount_percent || 0);
        const conSconto = mostraPrezziRiga && mostraScontoRiga && discPct > 0;
        const altezzaTesto = stNome.size * 0.72 + (righeNome.length - 1) * lead + righeDesc.length * 10.2 + righeDett.length * 9.4 + (immagineRiga ? 34 : 0);
        const altezzaValori = stNome.size * 0.72 + (conSconto || isOptional ? 10 : 0);
        const pad = 9 + rowExtra / 2;
        const h = Math.max(28 + rowExtra, pad * 2 + Math.max(altezzaTesto, altezzaValori) + 2.5);
        if (y - h < piedeTabella) paginaDopoTabella();

        const top = y;
        if (zebraOn && rowNumber % 2 === 0) {
          page.drawRectangle({ x: itemLeftX, y: top - h, width: itemWidth, height: h, color: tintaLeggeraC });
        }
        if (bordiTabella === "all") {
          page.drawRectangle({ x: itemLeftX, y: top - h, width: itemWidth, height: h, borderColor: filettoC, borderWidth: 0.5 });
        } else if (bordiTabella !== "none") {
          page.drawLine({ start: { x: itemLeftX, y: top - h }, end: { x: itemLeftX + itemWidth, y: top - h }, thickness: 0.5, color: filettoC });
        }
        const yBase = top - pad - stNome.size * 0.72;
        page.drawText(String(rowNumber).padStart(2, "0"), { x: cNumX, y: yBase, size: 7.5, font: fontBold, color: isChild ? grigioEdC : inkMarcaC });
        if (isChild) {
          // La voce figlia (posa, smaltimento…) appesa a quella sopra con un gancio sottile.
          page.drawLine({ start: { x: cDescX + 3, y: top - 3 }, end: { x: cDescX + 3, y: yBase + 2.5 }, thickness: 0.7, color: lightGrayC });
          page.drawLine({ start: { x: cDescX + 3, y: yBase + 2.5 }, end: { x: cDescX + 9, y: yBase + 2.5 }, thickness: 0.7, color: lightGrayC });
        }
        if (isOptional) {
          arrotondato(page, cDescX + rientro, yBase - 2.2, wOpz, 9.4, tintaC, 2.5);
          spaziatoSu(page, etOpz, cDescX + rientro + 4, yBase + 0.4, 5.6, fontBold, inkMarcaC, 0.7);
        }
        let yy = yBase;
        righeNome.forEach((r, i) => {
          if (i > 0) yy -= lead;
          disegnaRiga(page, r, cDescX + rientro + (i === 0 && wOpz ? wOpz + 5 : 0), yy);
        });
        for (const r of righeDesc) { yy -= 10.2; disegnaRiga(page, r, cDescX + rientro, yy); }
        for (const r of righeDett) { yy -= 9.4; disegnaRiga(page, r, cDescX + rientro, yy); }
        if (immagineRiga) {
          const lato = 28;
          const rap = immagineRiga.width / immagineRiga.height;
          const w = rap >= 1 ? lato : lato * rap, hImg = rap >= 1 ? lato / rap : lato;
          page.drawImage(immagineRiga, { x: cDescX + rientro, y: yy - 6 - hImg, width: w, height: hImg });
        }

        const coloreValori = isOptional ? grigioEdC : inchiostroC;
        drawRight(page, quantitaDi(item), cQtaR, yBase, 8.5, font, coloreValori);
        if (mostraPrezziRiga) {
          drawRight(page, fmtEur(Number(item.unit_price || 0)), cPrezzoR, yBase, 8.5, font, coloreValori);
          if (conSconto) drawRight(page, `sconto ${discPct}%`, cPrezzoR, yBase - 10, 6.8, fontBold, inkMarcaC);
          drawRight(page, `${Number(item.vat_rate || 0)}%`, cIvaR, yBase, 8, font, grigioEdC);
        }
        if (mostraImportoRiga) {
          drawRight(page, fmtEur(importoDi(item)), cImportoR, yBase, 9, fontBold, coloreValori);
          if (isOptional) drawRight(page, "non incluso", cImportoR, yBase - 10, 6.6, fontItalic, grigioEdC);
        }
        y -= h;
      };

      if (!soloTotale) {
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const itemCat = (item as any).item_category || "prodotto";
          const isNota = itemCat === "nota";
          const isSubtotale = itemCat === "subtotale";
          const isChild = ["posa", "smaltimento", "trasporto", "nolo"].includes(itemCat);
          const isOptional = (item as any).is_optional === true;

          if (classicPremium) {
            await rigaDelClassico(item, idx, { isNota, isSubtotale, isChild, isOptional });
            continue;
          }

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

      // La tabella del classico chiude con un filetto nel colore della sua fascia.
      if (classicPremium && items.length > 0 && !soloTotale) {
        page.drawRectangle({ x: itemLeftX, y: y - 1.2, width: itemWidth, height: 1.2, color: fondoEdC });
      }

      // Guardia fondo pagina condivisa da totali, box finanziamento, QR e
      // sezioni finali classic: senza, i blocchi finivano sotto la banda footer.
      const newPageIfNeeded = (needed: number, occhiello = "") => {
        if (y < needed) {
          drawWatermark(page);
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = classicPremium ? testataInterna(page) : pageHeight - margin;
          if (classicPremium && occhiello) {
            spaziatoSu(page, occhiello, margin, y, 6.3, fontBold, inkMarcaC, 1.3);
            y -= 26;
          }
          if (t.layout === "bold") {
            page.drawRectangle({ x: 0, y: 0, width: 80, height: pageHeight, color: primaryC });
          }
        }
      };

      // Totals — blocco a destra, valori allineati a destra, TOTALE su barra colorata
      // (nel classico più aria sotto la tabella, e i valori in colonna con gli importi).
      y -= classicPremium ? 30 : 12;
      const totBoxW = 220;
      const totX = itemLeftX + itemWidth - totBoxW;
      const totValX = itemLeftX + itemWidth - (classicPremium ? 10 : 6);
      // ── Il riepilogo economico del classico (25/09/2026) ──
      // Oltre a subtotale e IVA dice quanto costava a listino, quanto si è
      // scontato e quanto risparmia il cliente IVA inclusa (scheda a sinistra e
      // prezzo pieno barrato nella fascia del totale). Si mostra solo se i conti
      // tornano con i totali salvati e se l'azienda non nasconde gli sconti.
      const prezzi = riepilogoPrezzi(items, { subtotal: quote.subtotal, total: quote.total });
      const scontiInVista = classicPremium && !prezzoManualeAttivo && prezzi.coerente
        && opzione("pdf_mostra_sconti", pdfImp.pdf_mostra_sconti !== false);
      const conListino = scontiInVista && prezzi.scontiVoci >= 0.01;
      // Il risparmio nasce da uno sconto vero (sulle voci o sul totale), non dai
      // centesimi di arrotondamento dell'IVA: senza sconti usciva «0,01 €».
      const conRisparmio = scontiInVista && (conListino || Number(quote.discount_amount || 0) >= 0.01) && prezzi.risparmio >= 0.5;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aliquoteIva = new Set(items.filter((i: any) => !i.is_optional && !["nota", "subtotale"].includes(i.item_category || "prodotto")).map((i: any) => Number(i.vat_rate ?? 22))).size;
      const righeAttese = (conListino ? 2 : 1) + (Number(quote.discount_percent || 0) > 0 ? 1 : 0)
        + (conListino || Number(quote.discount_percent || 0) > 0 ? 1 : 0) + Math.max(1, aliquoteIva);
      newPageIfNeeded(classicPremium ? Math.max(150, righeAttese * 15 + 110) : 150, "RIEPILOGO DELL'OFFERTA");
      page.drawLine({ start: { x: totX, y: y + 14 }, end: { x: itemLeftX + itemWidth, y: y + 14 }, thickness: 0.6, color: lightGrayC });

      // Nel classico le righe si raccolgono e si disegnano col totale: accanto a
      // loro sta la scheda del risparmio (o della validità), alta quanto loro.
      const righeRiepilogo: Array<[string, string]> = [];
      const disegnaRiepilogoClassico = () => {
        const top = y + 14;
        for (const [label, value] of righeRiepilogo) {
          const eSconto = /^sconto|^sconti/i.test(label);
          page.drawText(label, { x: totX + 8, y, size: 9, font, color: eSconto ? inkMarcaC : grigioEdC });
          drawRight(page, value, totValX, y, 9, fontBold, eSconto ? inkMarcaC : inchiostroC);
          page.drawLine({ start: { x: totX, y: y - 5 }, end: { x: itemLeftX + itemWidth, y: y - 5 }, thickness: 0.5, color: filettoC });
          y -= 15;
        }
        let fondo = y + 10;
        const xScheda = itemLeftX;
        const wScheda = totX - itemLeftX - 24;
        const scadenza = t.show_validity_date && quote.expires_at
          ? new Date(quote.expires_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
          : "";
        if (conRisparmio || scadenza) {
          const pad = 14;
          // Senza sconti la scheda dice solo fino a quando valgono i prezzi: corta, per
          // non spingere firme e note alla pagina dopo.
          const righeSpiega = conRisparmio
            ? righeDi([{
                testo: `pari al ${prezzi.risparmioPct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% del prezzo pieno di ${fmtEur(prezzi.pieno)}, IVA inclusa.`,
                stile: { f: font, size: 7.8, c: grigioEdC },
              }], wScheda - pad * 2 - 3).slice(0, 2)
            : [];
          const hScheda = Math.max(top - fondo, conRisparmio ? 12 + 28 + righeSpiega.length * 10 + (scadenza ? 16 : 0) + 12 : 48);
          fondo = Math.min(fondo, top - hScheda);
          page.drawRectangle({ x: xScheda, y: fondo, width: wScheda, height: top - fondo, color: tintaLeggeraC });
          page.drawRectangle({ x: xScheda, y: fondo, width: 3, height: top - fondo, color: fondoEdC });
          let yy = top - pad - 4;
          spaziatoSu(page, conRisparmio ? "IL TUO RISPARMIO" : "OFFERTA VALIDA FINO AL", xScheda + pad + 3, yy, 6.5, fontBold, inkMarcaC, 1.4);
          yy -= 22;
          page.drawText(conRisparmio ? fmtEur(prezzi.risparmio) : scadenza, {
            x: xScheda + pad + 3, y: yy, size: conRisparmio ? 20 : 15, font: fontBold, color: conRisparmio ? inkMarcaC : inchiostroC,
          });
          yy -= 14;
          for (const r of righeSpiega) { disegnaRiga(page, r, xScheda + pad + 3, yy); yy -= 10; }
          if (conRisparmio && scadenza) {
            yy -= 4;
            page.drawText(`Prezzi garantiti fino al ${scadenza}.`, { x: xScheda + pad + 3, y: yy, size: 7.8, font: fontBold, color: inchiostroC });
          }
        }
        y = fondo - 10;
      };

      const drawTotal = (label: string, value: string, bold = false) => {
        if (!bold && classicPremium) {
          righeRiepilogo.push([label, value]);
          return;
        }
        if (bold) {
          if (classicPremium) {
            disegnaRiepilogoClassico();
            // La fascia del prezzo a tutta pagina, come nel documento edile: il
            // numero che il cliente cerca, grande, nel colore dell'azienda.
            // Stacco sufficiente: la fascia comincia sotto l'ultima riga (l'IVA), non sopra.
            y -= 18;
            const h = 42;
            page.drawRectangle({ x: 0, y: y - h + 22, width: pageWidth, height: h, color: fondoEdC });
            spaziatoSu(page, "TOTALE PREVENTIVO", margin, y + 2, 7.5, fontBold, rgb(1, 1, 1), 1.6);
            page.drawText("IVA inclusa", { x: margin, y: y - 10, size: 8, font, color: rgb(1, 1, 1), opacity: 0.85 });
            drawRight(page, value, pageWidth - margin - 3, y - 8, 22, fontBold, rgb(1, 1, 1));
            if (conRisparmio) {
              // Il prezzo pieno barrato accanto al totale: lo sconto si vede dove si guarda.
              const xFine = pageWidth - margin - 3 - textW(value, 22, fontBold) - 16;
              const pieno = fmtEur(prezzi.pieno);
              const wPieno = textW(pieno, 10, fontBold);
              page.drawText(pieno, { x: xFine - wPieno, y: y - 7, size: 10, font: fontBold, color: rgb(1, 1, 1), opacity: 0.7 });
              page.drawLine({ start: { x: xFine - wPieno - 1, y: y - 3.6 }, end: { x: xFine + 1, y: y - 3.6 }, thickness: 1, color: rgb(1, 1, 1), opacity: 0.8 });
              drawRight(page, "anziché", xFine - wPieno - 5, y - 7, 7.5, font, rgb(1, 1, 1));
            }
            y -= h;
            // Le voci opzionali stanno in tabella ma non nel totale: si dice qui, sotto il numero, con quanto valgono.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!soloTotale && items.some((i: any) => i.is_optional === true && !["nota", "subtotale"].includes(i.item_category || "prodotto"))) {
              const nota = prezzi.opzionali > 0 && !prezzoManualeAttivo
                ? `Voci opzionali, non comprese nel totale: + ${fmtEur(prezzi.opzionali)} IVA inclusa.`
                : "Le voci opzionali non sono comprese nel totale.";
              drawRight(page, nota, pageWidth - margin - 3, y + 6, 7.2, fontItalic, grigioEdC);
              y -= 10;
            }
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

      if (conListino) {
        // Il subtotale spiegato: a listino, meno gli sconti scritti sulle voci.
        drawTotal("Totale a listino", fmtEur(prezzi.listino));
        drawTotal("Sconti sulle voci", `- ${fmtEur(prezzi.scontiVoci)}`);
      } else {
        drawTotal(classicPremium ? "Subtotale" : "SUBTOTALE", `${fmtEur(subTotShown)}`);
      }
      if (Number(quote.discount_percent || 0) > 0) {
        drawTotal(classicPremium ? `Sconto riservato ${quote.discount_percent}%` : `Sconto ${quote.discount_percent}%`, `- ${fmtEur(scontoShown)}`);
      }
      if (classicPremium && (conListino || Number(quote.discount_percent || 0) > 0)) {
        drawTotal("Imponibile", fmtEur(round2q(subTotShown - scontoShown)));
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

      // ── Le agevolazioni fiscali scelte nel costruttore (25/09/2026) ──
      // Si salvavano sul preventivo (quotes.bonus_lines) e il PDF non le stampava:
      // il cliente firmava senza vedere quanto recupera né che deve pagare con
      // il bonifico parlante. Conti come la scheda «Bonus edilizi» del costruttore.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agevolazioni = classicPremium ? agevolazioniPreventivo((quote as any).bonus_lines, { imponibile: round2q(subTotShown - scontoShown), totale: totShown }) : null;
      if (agevolazioni) {
        const avvertenze = [
          ...(agevolazioni.bonificoParlante ? ["Per non perdere la detrazione, i pagamenti vanno fatti con bonifico parlante (causale, codice fiscale di chi detrae, partita IVA dell'impresa)."] : []),
          "Stima indicativa sulla spesa IVA inclusa, entro i tetti per unità immobiliare: la detrazione effettiva dipende dai requisiti di chi la richiede. Non è consulenza fiscale.",
        ];
        const righeAvvertenze = avvertenze.flatMap((a) => righeDi([{ testo: a, stile: { f: fontItalic, size: 7.4, c: grigioEdC } }], contentWidth));
        const altezza = 24 + agevolazioni.voci.length * 17 + 40 + righeAvvertenze.length * 9.6 + 8;
        newPageIfNeeded(altezza + 60, "RIEPILOGO DELL'OFFERTA");
        y -= 14;
        titolinoSu(page, "AGEVOLAZIONI FISCALI", margin, y, contentWidth);
        y -= 22;
        const xDetr = margin + contentWidth;
        const xSpesa = xDetr - 118;
        for (const v of agevolazioni.voci) {
          const titoloVoce = `${v.etichetta}${v.aliquota > 0 ? ` · detrazione ${v.aliquota.toLocaleString("it-IT")}%` : ""}`;
          let tv = winAnsiSafe(titoloVoce);
          while (tv.length > 3 && textW(tv, 8.8, fontBold) > xSpesa - margin - 90) tv = tv.slice(0, -2);
          if (tv !== winAnsiSafe(titoloVoce)) tv = tv.trimEnd() + "…";
          page.drawText(tv, { x: margin, y, size: 8.8, font: fontBold, color: inchiostroC });
          drawRight(page, `spesa ${fmtEur(v.spesa)}${v.oltreTetto ? " (oltre il tetto)" : ""}`, xSpesa, y, 8, font, grigioEdC);
          drawRight(page, fmtEur(v.detrazione), xDetr, y, 9, fontBold, inkMarcaC);
          page.drawLine({ start: { x: margin, y: y - 6 }, end: { x: xDetr, y: y - 6 }, thickness: 0.5, color: filettoC });
          y -= 17;
        }
        y -= 4;
        page.drawText("Detrazione stimata", { x: margin, y, size: 9, font, color: grigioEdC });
        drawRight(page, fmtEur(agevolazioni.detrazione), xDetr, y, 9.5, fontBold, inkMarcaC);
        y -= 18;
        // Il numero che il cliente ricorda: quanto gli costa davvero, detrazione tolta.
        page.drawRectangle({ x: margin, y: y - 8, width: contentWidth, height: 22, color: tintaLeggeraC });
        page.drawRectangle({ x: margin, y: y - 8, width: 3, height: 22, color: fondoEdC });
        spaziatoSu(page, "COSTO DOPO LA DETRAZIONE", margin + 12, y - 1, 6.8, fontBold, inkMarcaC, 1.3);
        drawRight(page, fmtEur(agevolazioni.costoDopo), xDetr - 8, y - 2, 11.5, fontBold, inchiostroC);
        y -= 24;
        for (const r of righeAvvertenze) { disegnaRiga(page, r, margin, y); y -= 9.6; }
        y -= 4;
      }

      // ── Box Finanziamento (se presente nel preventivo) ─────────────
      // I 6 campi quotes.financing_* vengono popolati dal QuoteBuilder
      // quando l'utente attiva la proposta di finanziamento. Mostriamo
      // un box evidenziato sotto il totale: "Oppure paga in NN rate da €X".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fin = quote as any;
      if (fin.financing_monthly_rate != null && fin.financing_num_installments) {
        // Con sconto + più aliquote IVA il box (56pt + testi) finiva sotto la
        // banda footer: guardia prima di disegnarlo.
        if (classicPremium) newPageIfNeeded(110, "RIEPILOGO DELL'OFFERTA");
        newPageIfNeeded(80);
        y -= 10;
        const finBoxX = totX - 10;
        // Bordo destro allineato al contenuto (itemLeftX + itemWidth): la
        // formula precedente (totValX + 50 …) portava il box a x≈599, oltre il
        // bordo pagina (595.28) e ~54pt fuori dal margine dei contenuti.
        const finBoxW = (itemLeftX + itemWidth) - finBoxX;
        const finBoxH = 56;
        const finBoxY = y - finBoxH + 20;
        // Nel classico i colori dell'azienda, non un azzurro fisso.
        const blueLight = classicPremium ? tintaLeggeraC : rgb(0.94, 0.97, 1);
        const blueAccent = classicPremium ? inkMarcaC : rgb(0.15, 0.39, 0.92);
        // Box con bordo blu evidenziato; nel classico la scheda in tinta con il
        // filetto nel colore dell'azienda, come la firma online e le clausole.
        page.drawRectangle({
          x: finBoxX, y: finBoxY, width: finBoxW, height: finBoxH,
          color: blueLight,
          borderColor: blueAccent,
          borderWidth: classicPremium ? 0 : 1.5,
        });
        if (classicPremium) page.drawRectangle({ x: finBoxX, y: finBoxY, width: 3, height: finBoxH, color: fondoEdC });
        // Label
        if (classicPremium) {
          spaziatoSu(page, "OPPURE IN COMODE RATE MENSILI", finBoxX + 12, y + 8, 6.3, fontBold, blueAccent, 1.1);
        } else {
          page.drawText("Oppure paga in comode rate mensili", {
            x: finBoxX + 8, y: y + 8,
            size: 8, font: fontBold, color: blueAccent,
          });
        }
        // Rata grande
        const rataStr = `${fmtEur(Number(fin.financing_monthly_rate))}`;
        page.drawText(rataStr, {
          x: finBoxX + (classicPremium ? 12 : 8), y: y - 8,
          size: 18, font: fontBold, color: blueAccent,
        });
        // " × N rate" — posizionato con la LARGHEZZA MISURATA della rata (la
        // stima char × 9 disallineava il testo con importi a più cifre).
        const rataW = textW(rataStr, 18, fontBold);
        page.drawText(`× ${fin.financing_num_installments} rate`, {
          x: finBoxX + (classicPremium ? 12 : 8) + rataW + 8, y: y - 4,
          size: 9, font: font, color: textC,
        });
        // Riga TAN/totale dovuto
        const tan = fin.financing_calculation_json?.tan;
        const totDue = fmtEur(Number(fin.financing_total_due ?? 0));
        const detailLine = `Tot. dovuto ${totDue}${tan ? ` · TAN ${Number(tan).toFixed(2)}%` : ""}`;
        page.drawText(detailLine, {
          x: finBoxX + (classicPremium ? 12 : 8), y: y - 22,
          size: 7.5, font: font, color: classicPremium ? grigioEdC : lightGrayC,
        });
        // Disclaimer
        page.drawText("Proposta indicativa salvo approvazione della finanziaria.", {
          x: finBoxX + (classicPremium ? 12 : 8), y: y - 32,
          size: 6.5, font: font, color: classicPremium ? grigioEdC : lightGrayC,
        });
        y -= finBoxH + 5;
      }

      // ── Piano dei pagamenti strutturato (fasi salvate dal builder) ──
      // Prima restava solo nel DB: il cliente firmava un PDF senza acconto e saldo.
      const fasiPag = Array.isArray((quote as any).payment_phases)
        ? ((quote as any).payment_phases as Array<Record<string, unknown>>).filter((p) => p && typeof p === "object")
        : [];
      const metodoPag = typeof (quote as any).payment_method === "string" ? String((quote as any).payment_method).trim() : "";
      if (fasiPag.length > 0 && !classicPremium) {
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

      // Il QR della firma online nel PDF non c'è più (25/09/2026, deciso da Florin):
      // il cliente firma dal link che riceve con il preventivo.

      // ── Classico: il piano dei pagamenti, a tutta larghezza ──
      // Prima era un riquadro azzurro incolonnato sotto il totale.
      if (classicPremium && fasiPag.length > 0) {
        const wPiano = contentWidth;
        const hPiano = 24 + (metodoPag ? 14 : 0) + fasiPag.length * 20;
        newPageIfNeeded(hPiano + 60);
        y -= 14;
        const top = y;
        titolinoSu(page, "PIANO DEI PAGAMENTI", margin, top, wPiano);
        let yy = top - 22;
        if (metodoPag) {
          page.drawText(winAnsiSafe(`Modalità: ${metodoPag}`).slice(0, 80), { x: margin, y: yy, size: 8, font, color: grigioEdC });
          yy -= 15;
        }
        fasiPag.forEach((fase, i) => {
          const etichetta = String(fase.label ?? "").trim() || "Rata";
          const pct = Number(fase.percent) || 0;
          const importo = Number(fase.amount) || 0;
          // Il numero della rata in un cerchio nel colore dell'azienda.
          page.drawCircle({ x: margin + 7, y: yy + 3, size: 7, color: fondoEdC });
          const n = String(i + 1);
          page.drawText(n, { x: margin + 7 - textW(n, 7.2, fontBold) / 2, y: yy + 0.5, size: 7.2, font: fontBold, color: rgb(1, 1, 1) });
          const wImp = textW(fmtEur(importo), 9, fontBold);
          const wPct = pct ? textW(`${pct}%`, 8, font) + 14 : 0;
          let et = winAnsiSafe(etichetta);
          while (et.length > 3 && textW(et, 8.8) > wPiano - 22 - wImp - wPct - 12) et = et.slice(0, -2);
          if (et !== winAnsiSafe(etichetta)) et = et.trimEnd() + "…";
          page.drawText(et, { x: margin + 22, y: yy, size: 8.8, font, color: inchiostroC });
          if (pct) drawRight(page, `${pct}%`, margin + wPiano - wImp - 14, yy, 8, font, grigioEdC);
          drawRight(page, fmtEur(importo), margin + wPiano, yy, 9, fontBold, inchiostroC);
          page.drawLine({ start: { x: margin + 22, y: yy - 7 }, end: { x: margin + wPiano, y: yy - 7 }, thickness: 0.5, color: filettoC });
          yy -= 20;
        });
        y = yy + 8 - 18;
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
        // Coordinate bancarie del template: prima si salvavano e non uscivano mai.
        const bancaTxt = normalizeTemplateText(t.bank_details);
        // Le note stanno nella loro colonna se ci stanno in otto righe; se no vanno
        // intere, a tutta larghezza, prima delle firme. Prima una nota lunga usciva
        // tagliata nella colonna e poi di nuovo in fondo, dopo il modulo di recesso.
        let noteIntere = "";
        if (t.show_notes && opzione("pdf_mostra_note_cliente")) {
          const colonne = infoCols.length + 1 + (bancaTxt ? 1 : 0);
          const wColonna = (contentWidth - 16 * (colonne - 1)) / colonne;
          const righeNota = righeDi([{ testo: noteTxt.replace(/\s+/g, " "), stile: { f: font, size: 8, c: grigioEdC } }], wColonna);
          if (righeNota.length <= 8) infoCols.push({ label: "NOTE", text: noteTxt });
          else noteIntere = noteTxt;
        }
        if (bancaTxt) infoCols.push({ label: "COORDINATE BANCARIE", text: bancaTxt });

        if (infoCols.length > 0) {
          newPageIfNeeded(190);
          const gap = 16;
          const righeColonna = (testo: string, larghezza: number) =>
            righeDi([{ testo: testo.replace(/\s+/g, " ").slice(0, 480), stile: { f: font, size: 8, c: grigioEdC } }], larghezza).slice(0, 8);
          const colW = (contentWidth - gap * (infoCols.length - 1)) / infoCols.length;
          const colTop = y;
          let deepest = colTop;
          infoCols.forEach((c, ci) => {
            const cx = margin + ci * (colW + gap);
            // Il titolino (maiuscoletto, filetto e tratto nel colore dell'azienda) e il
            // testo che va a capo misurato sulla larghezza della colonna.
            titolinoSu(page, c.label, cx, colTop, colW);
            let ty = colTop - 20;
            for (const r of righeColonna(c.text, colW)) {
              disegnaRiga(page, r, cx, ty);
              ty -= 10.8;
            }
            deepest = Math.min(deepest, ty);
          });
          // Niente filetti verticali: ogni colonna ha già il suo titolino col filetto sotto.
          y = deepest - 18;
        }

        if (noteIntere) {
          newPageIfNeeded(130);
          titolinoSu(page, "NOTE", margin, y, contentWidth);
          y -= 20;
          for (const paragrafo of noteIntere.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
            for (const r of righeDi([{ testo: paragrafo, stile: { f: font, size: 8.4, c: grigioEdC } }], contentWidth)) {
              newPageIfNeeded(70, "NOTE · SEGUE");
              disegnaRiga(page, r, margin, y);
              y -= 11.6;
            }
            y -= 4;
          }
          y -= 16;
        }

        // Riquadri firma (più alti col timbro dell'impresa)
        newPageIfNeeded(timbroEmbed ? 170 : 150);
        titolinoSu(page, "ACCETTAZIONE DEL PREVENTIVO", margin, y, contentWidth);
        y -= 20;
        // La firma vale anche per le condizioni che seguono: va detto qui, dove
        // si firma, non solo nelle pagine allegate.
        const conCondizioni = Boolean(
          normalizeTemplateText(t.contractual_terms_text) || normalizeTemplateText(t.legal_terms_text)
          || (t.show_contractual_terms !== false && opzione("pdf_mostra_condizioni")),
        );
        if (conCondizioni) {
          page.drawText(winAnsiSafe("Con la firma il Cliente accetta il preventivo e le condizioni generali di contratto allegate."), {
            x: margin, y: y - 2, size: 8, font: fontItalic, color: grigioEdC, maxWidth: contentWidth,
          });
          y -= 12;
        }
        const sigW = (contentWidth - 14) / 2;
        const sigH = timbroEmbed ? 86 : 66;
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
        if (timbroEmbed) {
          // Timbro e firma caricati nel modello, sopra la riga e un po' a cavallo,
          // come su carta: il cliente riceve il preventivo già firmato dall'impresa.
          // Si disegnano PRIMA della riga e dell'etichetta: una scansione a fondo
          // bianco altrimenti le copre (trovato dal revisore il 25/09).
          const sc = Math.min((sigW * 0.62) / timbroEmbed.width, 56 / timbroEmbed.height);
          const yRiga = y - sigH + 26;
          page.drawImage(timbroEmbed, {
            x: margin + sigW + 14 + 6,
            y: yRiga - 8,
            width: timbroEmbed.width * sc,
            height: timbroEmbed.height * sc,
          });
        }
        // Sotto la riga dell'impresa anche chi firma, se il modello lo dice.
        sigBox(margin + sigW + 14, "PER L'IMPRESA", [company?.name, t.firmatario_impresa].map((v) => String(v ?? "").trim()).filter(Boolean).join(" — "));
        y -= sigH + 12;
      }

      drawWatermark(page);
    }

    drawProductBlocks();

    for (const section of (t.composed_sections ?? [])) {
      await drawRichTextBlock(section.name || "Sezione", section.body_html, {
        titoloDalTesto: true,
        fontFamily: section.font_family ?? null,
        colore: coloreDelBlocco(section.primary_color),
      });
    }

    // Condizioni contrattuali e termini legali: UNA sezione (prima erano due
    // pagine separate). Il vecchio campo legal_terms_text, se ancora presente,
    // viene stampato di seguito nella stessa sezione.
    const scritteDallAzienda = [
      // I titoli HTML restano titoli (e il riquadro dell'art. 1341 li trova): vedi titoliMarkdown.
      t.show_contractual_terms && opzione("pdf_mostra_condizioni") ? normalizeTemplateText(titoliMarkdown(t.contractual_terms_text)) : "",
      t.show_legal_terms && opzione("pdf_mostra_condizioni") ? normalizeTemplateText(titoliMarkdown(t.legal_terms_text)) : "",
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
      const clausole = sezioneClausole(condizioniETermini);
      // L'elenco sta nel riquadro della seconda firma: nel testo sarebbe ripetuto.
      const testoCondizioni = clausole ? senzaSezioneClausole(condizioniETermini) : condizioniETermini;
      // Il titolo della pagina è quello del testo («Condizioni generali di
      // fornitura»), se c'è: prima un titolo fisso e sotto, barrato dal filetto, quello del testo.
      const titoloCondizioni = await drawRichTextBlock("Condizioni contrattuali e termini legali", testoCondizioni, {
        titoloDalTesto: true,
        fontFamily: t.composed_terms?.font_family ?? null,
        // Condizioni e legali stanno in una sezione sola: vale il colore delle condizioni, se no dei legali.
        colore: coloreDelBlocco(t.composed_terms?.primary_color) ?? coloreDelBlocco(t.composed_legal?.primary_color),
      });
      if (clausole) {
        // Il riquadro della seconda firma, tutto su una pagina: le frasi dell'azienda
        // prima e dopo l'elenco (se non ne ha scritte, una di base), le clausole,
        // luogo e data e la firma del Cliente.
        const bx = contentLeftX();
        const bw = contentMaxWidth();
        const pad = 16;
        const wTesto = bw - pad * 2 - 3;
        const stPremessa: StileTesto = { f: font, size: 8.4, c: inchiostroC };
        const stPremessaG: StileTesto = { f: fontBold, size: 8.4, c: inchiostroC };
        const stVoce: StileTesto = { f: fontBold, size: 8.4, c: inchiostroC };
        const stChiusura: StileTesto = { f: fontItalic, size: 7.8, c: grigioEdC };
        const premessa = clausole.premessa.length > 0
          ? clausole.premessa
          : ["Il Cliente, dopo averle rilette, approva specificamente le clausole seguenti:"];
        const righePremessa = premessa.flatMap((p) => righeDi(pezziConGrassetto(p, stPremessa, stPremessaG), wTesto));
        const righeVoci = clausole.voci.map((v) => righeDi([{ testo: v, stile: stVoce }], wTesto - 14));
        const righeChiusura = clausole.chiusura.flatMap((p) => righeDi([{ testo: p, stile: stChiusura }], wTesto));
        const nVoci = righeVoci.reduce((n, r) => n + r.length, 0);
        const altezza = pad + 34 + righePremessa.length * 11.5 + 6 + nVoci * 12 + (righeChiusura.length ? 8 + righeChiusura.length * 10.5 : 0) + 58;
        ensureSpace(altezza + 18, titoloCondizioni);
        y -= 10;
        const top = y;
        page.drawRectangle({ x: bx, y: top - altezza, width: bw, height: altezza, color: tintaLeggeraC });
        page.drawRectangle({ x: bx, y: top - altezza, width: 3, height: altezza, color: fondoEdC });
        const tx = bx + pad + 3;
        let yy = top - pad - 6;
        spaziatoSu(page, "APPROVAZIONE SPECIFICA DELLE CLAUSOLE", tx, yy, 7.2, fontBold, inkMarcaC, 1.4);
        yy -= 13;
        page.drawText("Artt. 1341 e 1342 del Codice civile", { x: tx, y: yy, size: 7.6, font: fontItalic, color: grigioEdC });
        yy -= 17;
        for (const r of righePremessa) { disegnaRiga(page, r, tx, yy); yy -= 11.5; }
        yy -= 5;
        for (const righe of righeVoci) {
          righe.forEach((r, i) => {
            if (i === 0) page.drawCircle({ x: tx + 4, y: yy + 2.9, size: 1.5, color: inkMarcaC });
            disegnaRiga(page, r, tx + 14, yy);
            yy -= 12;
          });
        }
        if (righeChiusura.length) {
          yy -= 7;
          for (const r of righeChiusura) { disegnaRiga(page, r, tx, yy); yy -= 10.5; }
        }
        yy -= 26;
        const wData = 150;
        page.drawLine({ start: { x: tx, y: yy }, end: { x: tx + wData, y: yy }, thickness: 0.7, color: inchiostroC });
        spaziatoSu(page, "LUOGO E DATA", tx, yy - 11, 6.3, font, grigioEdC, 0.9);
        page.drawLine({ start: { x: tx + wData + 30, y: yy }, end: { x: bx + bw - pad, y: yy }, thickness: 0.7, color: inchiostroC });
        spaziatoSu(page, "FIRMA DEL CLIENTE PER APPROVAZIONE SPECIFICA", tx + wData + 30, yy - 11, 6.3, font, grigioEdC, 0.9);
        y = top - altezza - 14;
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
    // Solo per le altre impaginazioni: nel classico le note stanno tutte nella
    // pagina dell'offerta, nella loro colonna o intere prima delle firme.
    if (t.show_notes && opzione("pdf_mostra_note_cliente") && quote.notes && !classicPremium) {
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
        // Solo le schede tecniche dell'azienda del preventivo: il file si scarica col
        // service role, e un allegato non deve portare nel PDF il materiale di
        // un'altra azienda (lo impedisce anche il trigger del 26/09/2026 sul database).
        if (att.quote_pdf_materials?.company_id !== quote.company_id) continue;
        // Si scarica il percorso, non l'azienda del materiale: anche il file deve stare
        // nella cartella del preventivo, con la regola di logo e timbro (percorsoDellAzienda).
        const filePath = percorsoDellAzienda(att.quote_pdf_materials?.storage_path, quote.company_id);
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
