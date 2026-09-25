/**
 * SettingsQuoteTemplates — helpers
 * Estratto da SettingsQuoteTemplates.tsx (MP-IMP-001 Fase 3).
 */
import { supabase } from "@/integrations/supabase/client";
import type { QuoteTemplate, QuoteTemplateKind } from "@/types/quoteTemplate";
import { TEMPLATE_ASSET_BUCKET } from "./constants";

export type TemplateFormPayload = Partial<Omit<QuoteTemplate, "created_at" | "updated_at">>;

export type TemplateColorKey =
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "text_color"
  | "header_text_color";

export type TemplateVisibilityKey =
  | "show_quote_number"
  | "show_validity_date"
  | "show_company_details"
  | "show_client_details"
  | "show_payment_terms"
  | "show_delivery_terms"
  | "show_notes"
  | "show_page_numbers";

/**
 * L'indirizzo pubblico di un'immagine del modello; undefined se non c'è.
 * Senza il controllo, un modello «offerta» senza copertina (quasi tutti)
 * mandava in crash l'intera pagina Modelli di preventivo: `null.replace`
 * (Ener Italia, 25/09/2026). Come templateAssetUrl del QuoteBuilder.
 */
export const getLogoPublicUrl = (path: string | null | undefined): string | undefined => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.replace(/^\/+/, "");
  const [maybeBucket, ...rest] = clean.split("/");
  if ((maybeBucket === TEMPLATE_ASSET_BUCKET || maybeBucket === "company-assets") && rest.length > 0) {
    return supabase.storage.from(maybeBucket).getPublicUrl(rest.join("/")).data.publicUrl;
  }
  return supabase.storage.from(TEMPLATE_ASSET_BUCKET).getPublicUrl(clean).data.publicUrl;
};

/** Hint contestuale per la sezione "Palette colori" in base al kind. */
export function kindColorHint(kind: QuoteTemplateKind): string {
  switch (kind) {
    case 'offerta':    return "Colori globali del PDF: header, evidenziazioni, sfondi.";
    case 'copertina':  return "Colori della copertina: titolo, sottotitolo, accent overlay.";
    case 'condizioni': return "Colori del blocco: heading sezioni, accent, testo corpo.";
    case 'legali':     return "Colori sobri per termini legali: heading, accent, corpo.";
    case 'prodotto':   return "Colori della scheda: nome prodotto, categoria, prezzo, accent.";
    case 'sezione':    return "Colori del blocco libero: heading, accent, corpo.";
  }
}

/** Etichette kind-aware per i 5 picker colore (Canva-style). */
export function kindColorLabels(kind: QuoteTemplateKind): Array<{
  key: TemplateColorKey;
  label: string;
  hint?: string;
}> {
  switch (kind) {
    case 'copertina':
      return [
        { key: 'primary_color',      label: 'Titolo',         hint: 'Colore del titolo principale' },
        { key: 'secondary_color',    label: 'Sottotitolo',    hint: 'Colore del claim/sottotitolo' },
        { key: 'accent_color',       label: 'Accent overlay', hint: 'Sfumatura/banda decorativa' },
        { key: 'header_text_color',  label: 'Testo su immagine', hint: 'Colore testo sopra cover image' },
        { key: 'text_color',         label: 'Testo corpo',    hint: 'Colore testo descrittivo' },
      ];
    case 'condizioni':
    case 'legali':
    case 'sezione':
      return [
        { key: 'primary_color',      label: 'Heading sezioni', hint: 'H1/H2/H3 colorati' },
        { key: 'accent_color',       label: 'Accent / divider', hint: 'Linee, evidenziazioni' },
        { key: 'text_color',         label: 'Testo corpo',     hint: 'Paragrafi standard' },
        { key: 'secondary_color',    label: 'Citazioni/note',  hint: 'Testo secondario' },
        { key: 'header_text_color',  label: 'Testo su accent', hint: 'Su sfondo colorato' },
      ];
    case 'prodotto':
      return [
        { key: 'primary_color',      label: 'Nome prodotto', hint: 'Colore del titolo' },
        { key: 'accent_color',       label: 'Sfondo card',   hint: 'Sfondo leggero card' },
        { key: 'secondary_color',    label: 'Categoria',     hint: 'Etichetta categoria' },
        { key: 'text_color',         label: 'Descrizione',   hint: 'Testo corpo' },
        { key: 'header_text_color',  label: 'Prezzo',        hint: 'Colore del prezzo' },
      ];
    case 'offerta':
    default:
      return [
        { key: 'primary_color',      label: 'Primario',         hint: 'Header e accenti forti' },
        { key: 'secondary_color',    label: 'Secondario',       hint: 'Bordi, righe tabella' },
        { key: 'accent_color',       label: 'Sfondo leggero',   hint: 'Sfondo zebra, alert' },
        { key: 'text_color',         label: 'Testo corpo',      hint: 'Paragrafi e voci' },
        { key: 'header_text_color',  label: 'Testo header',     hint: 'Su sfondo primario' },
      ];
  }
}

/** Compone le classi per le tab kind (active vs inactive). */
export function cnTab(active: boolean, color: string, borderColor: string, bgColor: string): string {
  const base = "inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-t-lg transition-all -mb-px";
  if (active) {
    return `${base} ${bgColor} ${color} ${borderColor} border border-b-transparent`;
  }
  return `${base} text-slate-600 hover:bg-slate-50 border border-transparent`;
}

export function quoteTemplateKind(tmpl: Partial<QuoteTemplate>): QuoteTemplateKind {
  return (tmpl.kind as QuoteTemplateKind | undefined) ?? "offerta";
}

export function getReferencingOffers(tmpl: QuoteTemplate, templates: QuoteTemplate[]): QuoteTemplate[] {
  if (quoteTemplateKind(tmpl) === "offerta") return [];
  return templates.filter((t) =>
    quoteTemplateKind(t) === "offerta" && (
      t.linked_cover_id === tmpl.id ||
      t.linked_terms_id === tmpl.id ||
      t.linked_legal_id === tmpl.id ||
      (t.linked_product_ids ?? []).includes(tmpl.id) ||
      (t.linked_section_ids ?? []).includes(tmpl.id)
    ),
  );
}
