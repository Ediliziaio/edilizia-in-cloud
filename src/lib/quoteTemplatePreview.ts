import type { QuoteTemplate } from "@/types/quoteTemplate";
import { substituteMergeTags, type MergeContext } from "../../supabase/functions/_shared/quoteTemplateComposer";
import { coloreCopertina, colorePreventivo } from "../../supabase/functions/_shared/blocchiModelloPreventivo";

/** Il modello pronto per le anteprime, coi blocchi collegati già al loro posto. */
export type AnteprimaModello = Partial<QuoteTemplate> & {
  /** Il fondo della copertina: quello della copertina collegata, se scelto. Solo per le anteprime, non si salva. */
  colore_copertina?: string;
};

/**
 * Stessa precedenza della copertina collegata usata dal generatore PDF (anche per il colore).
 * Il colore del documento come nel PDF (colorePreventivo): quello del modello, poi
 * quello del marchio (`marchio`, da «Brand & Azienda»), poi quello dei blocchi collegati.
 */
export function resolveQuoteTemplatePreview(template: Partial<QuoteTemplate>, library: QuoteTemplate[], marchio?: string | null): AnteprimaModello {
  const cover = library.find((item) => item.id === template.linked_cover_id && item.is_active !== false);
  const terms = library.find((item) => item.id === template.linked_terms_id && item.is_active !== false);
  const legal = library.find((item) => item.id === template.linked_legal_id && item.is_active !== false);
  const colore = colorePreventivo(template.primary_color, marchio, [cover, terms, legal]);
  return {
    ...template,
    primary_color: colore,
    ...(cover ? {
      cover_title: cover.cover_title || template.cover_title,
      cover_subtitle: cover.cover_subtitle || template.cover_subtitle,
      cover_image_url: cover.cover_image_url || template.cover_image_url,
      show_cover_image: true,
      colore_copertina: coloreCopertina(colore, cover),
    } : {}),
    ...(terms?.body_html ? { contractual_terms_text: terms.body_html, show_contractual_terms: true } : {}),
    ...(legal?.body_html ? { legal_terms_text: legal.body_html, show_legal_terms: true } : {}),
  };
}

/** I dati di esempio appartengono solo all'anteprima: il template salvato resta intatto. */
export function quoteTemplateSampleData(template: Partial<QuoteTemplate>, companyName: string): Partial<QuoteTemplate> {
  const context: MergeContext = {
    cliente: { nome: "Mario", cognome: "Rossi", nome_completo: "Mario Rossi", email: "mario.rossi@email.it", indirizzo: "Via Garibaldi 10, Roma" },
    cantiere: { indirizzo: "Via Garibaldi 10, Roma", citta: "Roma" },
    azienda: { ragione_sociale: companyName, indirizzo: "Via Roma 1, Milano", email: "info@azienda.it" },
    preventivo: { numero: "OFF-2026-001", data: "09/03/2026", scadenza: "08/04/2026" },
    data: { oggi: "09/03/2026", anno: "2026" },
  };
  const preview = { ...template };
  for (const key of ["cover_title", "cover_subtitle", "cover_tagline", "footer_text", "payment_terms_text", "delivery_terms_text", "contractual_terms_text", "legal_terms_text", "bank_details"] as const) {
    if (typeof template[key] === "string") preview[key] = substituteMergeTags(template[key], context);
  }
  return preview;
}
