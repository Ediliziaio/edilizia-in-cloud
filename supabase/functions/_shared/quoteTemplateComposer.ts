/**
 * quoteTemplateComposer — utility shared per la libreria template componibile.
 *
 * - loadTemplateWithBlocks: carica un template offerta + tutti i blocchi linkati
 *   (copertina, condizioni, legali, prodotti, sezioni) in una struttura unica.
 * - substituteMergeTags: sostituisce i placeholder {{cliente.nome}} ecc. con
 *   i valori reali del contesto (cliente/cantiere/preventivo/azienda/data).
 * - composeFinalTemplate: applica i blocchi linkati come override sui campi
 *   inline del template (es. linked_terms.body_html → contractual_terms_text).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface QuoteTemplateRow {
  id: string;
  company_id: string;
  kind?: string;
  name?: string;
  // Composizione (kind=offerta)
  linked_cover_id?: string | null;
  linked_terms_id?: string | null;
  linked_legal_id?: string | null;
  linked_product_ids?: string[] | null;
  linked_section_ids?: string[] | null;
  // Inline (back-compat, usati come fallback)
  cover_image_url?: string | null;
  cover_title?: string | null;
  cover_subtitle?: string | null;
  show_cover_image?: boolean | null;
  contractual_terms_text?: string | null;
  legal_terms_text?: string | null;
  show_contractual_terms?: boolean | null;
  show_legal_terms?: boolean | null;
  // Body (kind=condizioni/legali/sezione)
  body_html?: string | null;
  body_format?: string | null;
  // Prodotto
  product_image_url?: string | null;
  product_short_description?: string | null;
  product_long_description?: string | null;
  product_specs?: Array<{ label: string; value: string }> | null;
  product_indicative_price?: number | null;
  product_unit?: string | null;
  product_category?: string | null;
  // Tutti gli altri campi del template (estetica, layout, ecc.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ComposedTemplate extends QuoteTemplateRow {
  /** Blocco copertina linkato (solo se kind=offerta + linked_cover_id valido). */
  composed_cover?: QuoteTemplateRow | null;
  /** Blocco condizioni linkato. */
  composed_terms?: QuoteTemplateRow | null;
  /** Blocco legali linkato. */
  composed_legal?: QuoteTemplateRow | null;
  /** Schede prodotto linkate (in ordine di linked_product_ids). */
  composed_products?: QuoteTemplateRow[];
  /** Sezioni libere linkate. */
  composed_sections?: QuoteTemplateRow[];
}

/**
 * Carica un template + tutti i blocchi linkati. Se il template non è kind=offerta,
 * ritorna il template stesso senza blocchi (i blocchi standalone non si compongono).
 *
 * Filtra i blocchi inattivi (is_active=false) per evitare contenuti stale.
 * Mantiene ordine dei prodotti/sezioni come definito da linked_product_ids/linked_section_ids.
 */
export async function loadTemplateWithBlocks(
  supabase: SupabaseClient,
  templateId: string,
  expectedCompanyId?: string | null,
): Promise<ComposedTemplate | null> {
  const { data: template, error } = await supabase
    .from("quote_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !template) return null;

  if (expectedCompanyId && template.company_id !== expectedCompanyId) {
    return null;
  }

  return attachLinkedBlocks(supabase, template as QuoteTemplateRow, expectedCompanyId ?? template.company_id);
}

export async function attachLinkedBlocks(
  supabase: SupabaseClient,
  template: QuoteTemplateRow,
  expectedCompanyId?: string | null,
): Promise<ComposedTemplate> {
  const companyId = expectedCompanyId ?? template.company_id;

  // Solo le offerte compongono blocchi
  if ((template.kind ?? "offerta") !== "offerta") {
    return template as ComposedTemplate;
  }

  // Raccogli tutti gli id da fetchare in un solo round-trip
  const idsToFetch: string[] = [];
  if (template.linked_cover_id) idsToFetch.push(template.linked_cover_id);
  if (template.linked_terms_id) idsToFetch.push(template.linked_terms_id);
  if (template.linked_legal_id) idsToFetch.push(template.linked_legal_id);
  const productIds: string[] = template.linked_product_ids ?? [];
  const sectionIds: string[] = template.linked_section_ids ?? [];
  idsToFetch.push(...productIds, ...sectionIds);

  if (idsToFetch.length === 0) {
    return { ...template, composed_products: [], composed_sections: [] };
  }

  const { data: blocks } = await supabase
    .from("quote_templates")
    .select("*")
    .in("id", idsToFetch)
    .eq("company_id", companyId)
    .eq("is_active", true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>();
  for (const b of (blocks ?? [])) byId.set(b.id, b);

  return {
    ...template,
    composed_cover: template.linked_cover_id ? byId.get(template.linked_cover_id) ?? null : null,
    composed_terms: template.linked_terms_id ? byId.get(template.linked_terms_id) ?? null : null,
    composed_legal: template.linked_legal_id ? byId.get(template.linked_legal_id) ?? null : null,
    composed_products: productIds.map((id) => byId.get(id)).filter(Boolean) as QuoteTemplateRow[],
    composed_sections: sectionIds.map((id) => byId.get(id)).filter(Boolean) as QuoteTemplateRow[],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Merge tag substitution
// ──────────────────────────────────────────────────────────────────────────

export interface MergeContext {
  cliente?: {
    nome?: string;
    cognome?: string;
    nome_completo?: string;
    email?: string;
    telefono?: string;
    codice_fiscale?: string;
    indirizzo?: string;
    cap?: string;
    citta?: string;
    provincia?: string;
    ragione_sociale?: string;
    partita_iva?: string;
    sede_legale?: string;
    legale_rappresentante?: string;
    pec?: string;
    codice_destinatario?: string;
  };
  cantiere?: {
    indirizzo?: string;
    citta?: string;
    note?: string;
  };
  preventivo?: {
    numero?: string;
    data?: string;
    scadenza?: string;
    totale?: string;
    subtotale?: string;
    iva?: string;
  };
  azienda?: {
    ragione_sociale?: string;
    partita_iva?: string;
    indirizzo?: string;
    email?: string;
    telefono?: string;
  };
  data?: {
    oggi?: string;
    anno?: string;
  };
}

const TAG_RE = /\{\{\s*([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)?)\s*\}\}/g;

/**
 * Sostituisce {{group.field}} nel testo con valori da ctx. Chiavi non trovate
 * vengono lasciate vuote (non lascia il placeholder grezzo nel PDF, sembrerebbe un bug).
 */
export function substituteMergeTags(text: string | null | undefined, ctx: MergeContext): string {
  if (!text) return "";
  return text.replace(TAG_RE, (match, key: string) => {
    const parts = key.split(".");
    if (parts.length !== 2) return ""; // formato non valido
    const [group, field] = parts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupObj = (ctx as any)[group];
    if (!groupObj || typeof groupObj !== "object") return "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (groupObj as any)[field];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/**
 * Applica substituteMergeTags a tutti i campi text rilevanti di un template
 * composto. Mutates a shallow-copy. Usato lato edge function generate-quote-pdf.
 */
export function applyMergeTagsToTemplate(
  tmpl: ComposedTemplate,
  ctx: MergeContext,
): ComposedTemplate {
  const sub = (s: string | null | undefined) => substituteMergeTags(s, ctx);
  const next: ComposedTemplate = { ...tmpl };

  // Campi inline del template
  next.cover_title = sub(next.cover_title);
  next.cover_subtitle = sub(next.cover_subtitle);
  next.cover_tagline = sub(next.cover_tagline);
  next.footer_text = sub(next.footer_text);
  next.payment_terms_text = sub(next.payment_terms_text);
  next.delivery_terms_text = sub(next.delivery_terms_text);
  next.bank_details = sub(next.bank_details);
  next.contractual_terms_text = sub(next.contractual_terms_text);
  next.legal_terms_text = sub(next.legal_terms_text);

  // Blocco cover linkato
  if (next.composed_cover) {
    next.composed_cover = {
      ...next.composed_cover,
      cover_title: sub(next.composed_cover.cover_title),
      cover_subtitle: sub(next.composed_cover.cover_subtitle),
    };
  }

  // Blocchi terms / legal
  if (next.composed_terms) {
    next.composed_terms = { ...next.composed_terms, body_html: sub(next.composed_terms.body_html) };
  }
  if (next.composed_legal) {
    next.composed_legal = { ...next.composed_legal, body_html: sub(next.composed_legal.body_html) };
  }

  // Prodotti
  if (next.composed_products) {
    next.composed_products = next.composed_products.map((p) => ({
      ...p,
      product_short_description: sub(p.product_short_description),
      product_long_description: sub(p.product_long_description),
    }));
  }

  // Sezioni
  if (next.composed_sections) {
    next.composed_sections = next.composed_sections.map((s) => ({
      ...s,
      body_html: sub(s.body_html),
    }));
  }

  return next;
}

/**
 * Costruisce il MergeContext a partire da quote + company + marketing_contact.
 * Helper centralizzato così tutte le edge function lo costruiscono allo stesso modo.
 */
export function buildMergeContext(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  company?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cantiere?: any;
}): MergeContext {
  const { quote, company, contact, cantiere } = args;
  const fmtMoney = (n: unknown) => {
    if (n === null || n === undefined) return "";
    const num = typeof n === "number" ? n : parseFloat(String(n));
    return isFinite(num) ? `€ ${num.toFixed(2).replace(".", ",")}` : "";
  };
  const fmtDate = (s: unknown) => {
    if (!s) return "";
    try { return new Date(String(s)).toLocaleDateString("it-IT"); } catch { return ""; }
  };
  const today = new Date();

  // Nome completo: priorità contact > quote.client_name
  const nome = contact?.first_name ?? "";
  const cognome = contact?.last_name ?? "";
  const nomeCompleto = (quote?.client_name ?? `${nome} ${cognome}`).trim();

  return {
    cliente: {
      nome,
      cognome,
      nome_completo: nomeCompleto,
      email: contact?.email ?? quote?.client_email ?? "",
      telefono: contact?.phone ?? quote?.client_phone ?? "",
      codice_fiscale: quote?.client_fiscal_code ?? contact?.codice_fiscale ?? "",
      indirizzo: quote?.client_address ?? contact?.address ?? "",
      cap: contact?.cap ?? "",
      citta: contact?.city ?? "",
      provincia: contact?.provincia ?? "",
      ragione_sociale: quote?.client_company ?? contact?.company_name ?? "",
      partita_iva: quote?.client_vat_number ?? contact?.vat_number ?? "",
      sede_legale: contact?.sede_legale ?? "",
      legale_rappresentante: contact?.legale_rappresentante ?? "",
      pec: contact?.pec ?? "",
      codice_destinatario: contact?.codice_destinatario ?? "",
    },
    cantiere: {
      indirizzo: cantiere?.indirizzo ?? quote?.client_address ?? "",
      citta: cantiere?.citta ?? contact?.city ?? "",
      note: cantiere?.note ?? "",
    },
    preventivo: {
      numero: quote?.quote_number ?? "",
      data: fmtDate(quote?.created_at),
      scadenza: fmtDate(quote?.expires_at),
      totale: fmtMoney(quote?.total),
      subtotale: fmtMoney(quote?.subtotal),
      iva: fmtMoney(quote?.vat_amount),
    },
    azienda: {
      ragione_sociale: company?.name ?? "",
      partita_iva: company?.vat_number ?? "",
      indirizzo: company?.address ?? "",
      email: company?.email ?? "",
      telefono: company?.phone ?? "",
    },
    data: {
      oggi: today.toLocaleDateString("it-IT"),
      anno: String(today.getFullYear()),
    },
  };
}
