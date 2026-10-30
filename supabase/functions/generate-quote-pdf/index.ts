// 31/10/2026: il renderer comune stampa il cronoprogramma del preventivo classico (quotes.cronoprogramma). Questo commento fa ripubblicare la funzione: la CI guarda solo i file sotto la sua cartella.
// @ts-ignore bundle generato da scripts/preventivi-render/build.mjs
import { renderGenerico } from "../_shared/preventivoRenderer.mjs";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
import { preventivoVisibile, type ClienteDiChiChiama } from "../_shared/preventivoVisibile.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
// Libreria template componibile: carica i blocchi linkati + sostituisce merge tag
import { loadTemplateWithBlocks, attachLinkedBlocks, applyMergeTagsToTemplate, buildMergeContext, TemplateCompositionError, type ComposedTemplate } from "../_shared/quoteTemplateComposer.ts";
import { formatoImmagine, leggiLogo, logoDiRiserva } from "../_shared/logoAzienda.ts";
import { coloreDelBlocco, colorePreventivo, contattiImpresa } from "../_shared/blocchiModelloPreventivo.ts";
import { logoDelModello, percorsoDellAzienda } from "../_shared/impaginaPreventivo.ts";
import { haTesto } from "../_shared/condizioniDelPreventivo.ts";
import { campiContratto, erroriCampiContratto, leggiValoriContratto } from '../_shared/campiContratto.ts';

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
    const body = await req.json();
    // Chiamata interna del bot operativo WhatsApp (27/09/2026): chiave di
    // servizio + l'utente per cui si genera («per_utente», già riconosciuto dal
    // bot come ufficio o amministratore). L'accesso di QUELL'utente all'azienda
    // del preventivo si ricontrolla sotto con requireCompanyAccess; niente
    // anteprime per questa via.
    const interna = chiamataInternaValida(req) && typeof body?.per_utente === "string" && body?.preview_mode !== true;
    const { userId, supabaseAdmin } = interna
      ? {
        userId: body.per_utente as string,
        supabaseAdmin: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
      }
      : await requireAuth(req, corsH);
    const { quote_id, preview_mode, template_data, company_name, preview_signature } = body;
    // Il PDF che va in FIRMA ha sempre le condizioni contrattuali, anche se il preventivo è impostato per uscire
    // senza (lo step «Documenti e PDF»): il preventivo firmato è il contratto, e senza condizioni non dice niente
    // su tempi, varianti, garanzie e recesso. Lo chiede send-quote-signature: la regola sta qui, nel server, così
    // nessuna strada la salta.
    const perFirma = body?.per_firma === true;

    // ─── PREVIEW MODE ───
    const isPreview = preview_mode === true && template_data;

    let quote: any;
    let items: any[] = [];
    // TUTTE le righe del preventivo, anche quelle nascoste nel PDF: totale e IVA le comprendono.
    let righePerIva: any[] = [];
    const immaginiRighe = new Map<string, string>(); // «a:<articolo>» / «f:<famiglia>» → foto
    let company: any = null;
    let t: any;
    let attachmentRows: any[] = [];
    // Le impostazioni PDF dell'azienda (preventivo_impostazioni): valgono quando il singolo
    // preventivo non ha scelto (sconti in vista, solo il totale).
    let pdfImp: any = {};
    // Attributi di famiglia: axis_selections salva gli ID dei valori scelti
    // (UUID). Nel PDF vanno i nomi — "Colore: Bianco" — non gli identificativi.
    const nomiAssi = new Map<string, string>();        // "<family_id>:<codice>" → nome asse
    const etichetteValori = new Map<string, string>(); // id valore → label
    // Opzioni PDF scelte sul singolo preventivo (step «Documenti e PDF»).
    // Erano esposte in interfaccia e ignorate qui: l'utente spuntava «mostra
    // misure» e il PDF usciva identico. Default = attivo, come nella UI.
    const opzione = (chiave: string, predefinito = true): boolean => {
      if (perFirma && chiave === "pdf_mostra_condizioni") return true;
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
        } catch { return errorResponse("Non puoi generare l’anteprima per questa azienda.", 403, corsH); }
      }
      if (aziendaAnteprima) {
        t = await attachLinkedBlocks(
          supabaseAdmin,
          { ...t, company_id: aziendaAnteprima } as ComposedTemplate,
          aziendaAnteprima,
        );
      }
      const { data: previewBrand } = aziendaAnteprima ? await supabaseAdmin.from('companies')
        .select('logo_url,brand_logo_dark_url,business_name,email,phone,vat_number,legal_address,legal_city,legal_postal_code,legal_province').eq('id', aziendaAnteprima).maybeSingle() : { data: null };
      company = {
        name: company_name || "La Tua Azienda Srl",
        business_name: previewBrand?.business_name ?? null,
        email: previewBrand?.email ?? "info@azienda-esempio.it",
        phone: previewBrand?.phone ?? "+39 02 1234567",
        address: [previewBrand?.legal_address,previewBrand?.legal_postal_code,previewBrand?.legal_city,previewBrand?.legal_province].filter(Boolean).join(', ') || "Via Roma 1, 20100 Milano (MI)",
        vat_number: previewBrand?.vat_number ?? "IT01234567890",
        logo_url: previewBrand?.logo_url ?? null,
        brand_logo_dark_url: previewBrand?.brand_logo_dark_url ?? null,
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
      righePerIva = items;
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
      const previewContext = buildMergeContext({ quote, company, template: t });
      previewContext.contratto = Object.fromEntries(campiContratto(t.contractual_terms_text, t.legal_terms_text).map(f => [f.nome, `[${f.etichetta}]`]));
      t = applyMergeTagsToTemplate(t as ComposedTemplate, previewContext);
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
      // Dal bot non c'è il token dell'utente: la RLS non si può leggere, e il bot
      // manda il PDF solo a chi l'ha chiesto e solo per preventivi della sua azienda.
      // Il contratto minimo evita l'espansione ricorsiva dei generici del client in Deno.
      if (!interna && !(await preventivoVisibile(comeChiChiama as unknown as ClienteDiChiChiama, quote.id))) {
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

      const [template, itemsRes, impRes, companyRes, contactRes, attRes] = await Promise.all([
        resolveTemplate(),
        supabaseAdmin.from("quote_items").select("*").eq("quote_id", quote_id).order("sort_order"),
        supabaseAdmin.from("preventivo_impostazioni").select("pdf_mostra_sconti, pdf_mostra_solo_totale").eq("company_id", quote.company_id).maybeSingle(),
        supabaseAdmin
          .from("companies")
          .select("name, business_name, email, phone, legal_address, legal_city, legal_province, legal_postal_code, logo_url, brand_logo_dark_url, vat_number, brand_primary_color")
          .eq("id", quote.company_id)
          .single(),
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
      righePerIva = itemsRes.data ?? [];
      pdfImp = impRes.data ?? {};
      items = (itemsRes.data ?? []).filter((i: any) => i.mostra_nel_pdf !== false);
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
      // Le condizioni riscritte per QUESTO preventivo (27/10/2026): vincono su quelle del modello e sui blocchi
      // collegati, perché sono state scritte per questo cliente. Le riscrive solo chi ha il permesso dei modelli.
      // L'interruttore «stampa condizioni contrattuali» resta sopra: a PDF senza condizioni non esce nulla.
      if (haTesto(quote?.condizioni_testo)) {
        t.contractual_terms_text = String(quote.condizioni_testo);
        t.show_contractual_terms = true;
      }
      try {
        // Contact già prefetchato nel batch parallelo
        const customFields = opzione('pdf_mostra_condizioni') ? campiContratto(t.contractual_terms_text, t.legal_terms_text) : [];
        const customErrors = erroriCampiContratto(customFields, leggiValoriContratto(quote?.custom_field_values?._template_values));
        if (customErrors.length) return errorResponse(`Completa i dati contrattuali: ${customErrors.join('; ')}`, 400, corsH);
        const mergeCtx = buildMergeContext({ quote, company, contact: prefetchedContact, template: t });
        t = applyMergeTagsToTemplate(t as ComposedTemplate, mergeCtx);
      } catch (e) {
        console.warn("[generate-quote-pdf] merge tag substitution fallita (non bloccante):", e instanceof Error ? e.message : e);
      }
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

    // Unico motore per i preventivi: qui restano autorizzazione e dati.
    // L'azienda di cui si leggono i file del modello (logo, copertina, timbro), dal
    // contenitore riservato e col service role: solo dalla sua cartella.
    const aziendaDeiFile = isPreview ? aziendaAnteprima : quote?.company_id ?? null;
    // I byte di un'immagine diventano un data URL per il renderer: solo PNG o JPEG
    // (il formato si legge dai byte, non dall'estensione), al massimo 6 MB.
    const comeDataUrl = (bytes: Uint8Array | null): string | null => {
      if (!bytes || bytes.length > 6 * 1024 * 1024) return null;
      const formato = formatoImmagine(bytes);
      if (!formato) return null;
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:image/${formato === "png" ? "png" : "jpeg"};base64,${btoa(bin)}`;
    };
    const immagineDelLogo = async (logoPath: string | null): Promise<string | null> => {
      if (!logoPath) return null;
      try {
        return comeDataUrl(await leggiLogo(supabaseAdmin, logoPath, {
          supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "", bucket: ["quote-template-assets", "company-assets"],
          scarica: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
        }));
      } catch { return null; }
    };
    // Copertina e timbro stanno nel contenitore riservato dei modelli: si leggono solo
    // con un percorso della cartella dell'azienda, mai con un indirizzo.
    const immagineRiservata = async (percorso: string | null): Promise<string | null> => {
      if (!percorso) return null;
      try {
        const { data: file } = await supabaseAdmin.storage.from("quote-template-assets").download(percorso);
        return file ? comeDataUrl(new Uint8Array(await file.arrayBuffer())) : null;
      } catch (e) {
        console.warn("[generate-quote-pdf] immagine del modello non caricata:", percorso, e instanceof Error ? e.message : e);
        return null;
      }
    };
    // Il logo del modello, se è un percorso, solo dalla cartella dell'azienda; se no
    // (o se non passa) quello aziendale, che oggi è sempre un indirizzo dello storage
    // pubblico e, se un giorno fosse un percorso, passa dalla stessa regola.
    const logoPath = logoDiRiserva(logoDelModello(t.logo_url, aziendaDeiFile), logoDelModello(company?.logo_url, aziendaDeiFile));
    const percorsoCopertina = percorsoDellAzienda(t.cover_image_url, aziendaDeiFile);
    // Timbro e firma dell'impresa (25/09/2026): si caricano una volta nel modello e si
    // stampano nel riquadro «Per l'impresa» della pagina della firma.
    const percorsoTimbro = percorsoDellAzienda(t.timbro_firma_url, aziendaDeiFile);
    const [logo, logoChiaro, copertina, timbro] = await Promise.all([
      immagineDelLogo(logoPath),
      immagineDelLogo(logoDelModello(company?.brand_logo_dark_url, aziendaDeiFile)),
      t.show_cover_image === false ? Promise.resolve(null) : immagineRiservata(percorsoCopertina),
      immagineRiservata(percorsoTimbro),
    ]);
    // Il fondo della copertina collegata, se l'ha scelto: Ener ha messo la copertina verde
    // e il PDF usciva blu (25/09/2026). Un fondo scritto nel modello vince.
    const fondoCopertina = coloreDelBlocco(t.composed_cover?.primary_color);
    if (fondoCopertina && !t.pdf_cover_bg_color && !t.cover_bg_color) t.pdf_cover_bg_color = fondoCopertina;
    t = { ...t, logo_url: t.show_logo === false ? null : logo, cover_image_url: copertina, timbro_firma_url: timbro,
      primary_color: colorePreventivo(t.primary_color, company?.brand_primary_color, [t.composed_cover, t.composed_terms, t.composed_legal]) };
    company = { ...company, logo_url: t.show_logo === false ? null : logo, brand_logo_dark_url: t.show_logo === false ? null : logoChiaro };
    const pdfDoc = await PDFDocument.load(await renderGenerico({
      // Le opzioni del singolo preventivo passano da `opzione`: il PDF che va in FIRMA
      // ha sempre le condizioni (per_firma), e le note escono solo se lo step
      // «Documenti e PDF» le lascia accese.
      quote: {
        ...quote,
        pdf_mostra_condizioni: opzione("pdf_mostra_condizioni"),
        pdf_mostra_sconti: opzione("pdf_mostra_sconti", pdfImp.pdf_mostra_sconti !== false),
        pdf_mostra_solo_totale: opzione("pdf_mostra_solo_totale", pdfImp.pdf_mostra_solo_totale === true),
        notes: opzione("pdf_mostra_note_cliente") ? quote.notes : null,
      },
      righePerIva,
      items: items.map(riga => ({
        ...riga,
        description: [riga.description, ...Object.entries(riga.axis_selections ?? {}).map(([asse, valore]) => `${nomiAssi.get(`${riga.family_id}:${asse}`) ?? asse}: ${etichetteValori.get(String(valore)) ?? valore}`)].filter(Boolean).join("\n"),
        image_url: opzione("pdf_mostra_immagini")
          ? immaginiRighe.get(`a:${riga.article_template_id}`) ?? immaginiRighe.get(`f:${riga.family_id}`) ?? null : null,
      })),
      company,
      template: t,
    }));

    // La copertina PDF del modello (una pagina sola, caricata nell'editor) prende il
    // posto della copertina disegnata: si incorpora solo la pagina grafica, niente
    // moduli, azioni o annotazioni del file sorgente. Percorso verificato, mai URL.
    if (t.show_cover_image !== false && percorsoCopertina?.toLowerCase().endsWith(".pdf")) {
      const { data, error } = await supabaseAdmin.storage.from("quote-template-assets").download(percorsoCopertina);
      if (error || !data || data.size > 5 * 1024 * 1024) return errorResponse("Copertina PDF non disponibile o troppo grande. Caricala nuovamente nel modello.", 422, corsH);
      const sorgente = await PDFDocument.load(await data.arrayBuffer());
      if (sorgente.getPageCount() !== 1) return errorResponse("La copertina PDF deve contenere una sola pagina.", 422, corsH);
      const [grafica] = await pdfDoc.embedPages([sorgente.getPage(0)]);
      const { width: largo, height: alto } = pdfDoc.getPage(0).getSize();
      pdfDoc.removePage(0);
      const cover = pdfDoc.insertPage(0, [largo, alto]);
      const scala = Math.min(largo / grafica.width, alto / grafica.height);
      cover.drawPage(grafica, { x: (largo - grafica.width * scala) / 2, y: (alto - grafica.height * scala) / 2, width: grafica.width * scala, height: grafica.height * scala });
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
    if (e instanceof TemplateCompositionError) return errorResponse(e.message, 422, corsH);
    console.error("generate-quote-pdf error:", e);
    return errorResponse("Errore interno", 500, corsH);
  }
});
