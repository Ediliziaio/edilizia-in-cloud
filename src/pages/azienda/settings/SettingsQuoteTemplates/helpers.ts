/**
 * SettingsQuoteTemplates — helpers
 * Estratto da SettingsQuoteTemplates.tsx (MP-IMP-001 Fase 3).
 */
import { supabase } from "@/integrations/supabase/client";
import { userErrorMessage } from "@/lib/userErrorMessage";
import type { QuoteTemplate, QuoteTemplateKind } from "@/types/quoteTemplate";
import { TEMPLATE_ASSET_BUCKET } from "./constants";

export type TemplateFormPayload = Partial<Omit<QuoteTemplate, "created_at" | "updated_at">>;

/**
 * Le frasi che `useQuoteTemplates` lancia già in italiano, scritte a mano per chi usa la pagina:
 * si mostrano com'è. Tutto il resto passa da `userErrorMessage` (vedi `erroreInItaliano`).
 */
export const FRASI_DEI_MODELLI_GIA_ITALIANE: ReadonlySet<string> = new Set([
  "Azienda non disponibile",
  "I modelli li cambia chi può modificare il listino",
]);

/**
 * Il testo di un errore per chi usa la pagina: in italiano e con una cosa da fare, mai il messaggio
 * grezzo del database o della rete («new row violates…», «Failed to fetch»).
 */
export function erroreInItaliano(errore: unknown, ripiego: string): string {
  if (errore instanceof Error && FRASI_DEI_MODELLI_GIA_ITALIANE.has(errore.message)) return errore.message;
  return userErrorMessage(errore, ripiego);
}

/** Cosa fa ogni tipo di modello, con le parole di chi lo usa (KIND_META è condiviso e parla di «template master»). */
export function descrizioneTipo(kind: QuoteTemplateKind): string {
  switch (kind) {
    case "offerta":    return "Il modello completo del preventivo: mette insieme copertina, prodotti e condizioni.";
    case "copertina":  return "Prima pagina del PDF: immagine, titolo e sottotitolo.";
    case "condizioni": return "Un unico blocco in coda al PDF: clausole del contratto (garanzia, varianti, penali) e termini legali (privacy, recesso, foro competente).";
    case "legali":     return "Blocco di una volta. Oggi privacy, recesso e foro competente stanno nel blocco «Condizioni e termini legali».";
    case "prodotto":   return "Un prodotto da riusare nelle offerte: immagine, caratteristiche e prezzo indicativo.";
    case "sezione":    return "Un blocco libero da riusare («Chi siamo», «Garanzie», testimonianze).";
  }
}

/** «Nessuna offerta ancora»: il genere giusto per ogni tipo (prima: «Nessun offerta ancora»). */
export function titoloVuoto(kind: QuoteTemplateKind): string {
  switch (kind) {
    case "offerta":    return "Nessuna offerta ancora";
    case "copertina":  return "Nessuna copertina ancora";
    case "condizioni": return "Nessun blocco di condizioni ancora";
    case "legali":     return "Nessun blocco di termini legali ancora";
    case "prodotto":   return "Nessuna scheda prodotto ancora";
    case "sezione":    return "Nessuna sezione libera ancora";
  }
}

/** Il nome con cui nasce un blocco nuovo, col genere giusto (KIND_META, condiviso, dà «Nuovo Copertina», «Nuovo Scheda prodotto»). */
export function nomeNuovoBlocco(kind: QuoteTemplateKind): string {
  switch (kind) {
    case "offerta":    return "Nuova offerta";
    case "copertina":  return "Nuova copertina";
    case "condizioni": return "Nuovo blocco di condizioni";
    case "legali":     return "Nuovo blocco di termini legali";
    case "prodotto":   return "Nuova scheda prodotto";
    case "sezione":    return "Nuova sezione libera";
  }
}

/** Il pulsante dello stato vuoto, anch'esso con il genere giusto (prima: «Crea il primo» per tutti). */
export function pulsanteVuoto(kind: QuoteTemplateKind): string {
  switch (kind) {
    case "offerta":    return "Scegli un'offerta completa";
    case "copertina":  return "Crea la prima copertina";
    case "condizioni": return "Crea il primo blocco di condizioni";
    case "legali":     return "Crea il primo blocco";
    case "prodotto":   return "Crea la prima scheda prodotto";
    case "sezione":    return "Crea la prima sezione";
  }
}

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
    case 'offerta':    return "Colori di tutto il PDF: intestazione, evidenziazioni, sfondi.";
    case 'copertina':  return "Colori della copertina: titolo, sottotitolo, fascia decorativa.";
    case 'condizioni': return "Colori del blocco: titoli delle sezioni, evidenziazioni, testo.";
    case 'legali':     return "Colori sobri per i termini legali: titoli, evidenziazioni, testo.";
    case 'prodotto':   return "Colori della scheda: nome del prodotto, categoria, prezzo, sfondo.";
    case 'sezione':    return "Colori del blocco libero: titoli, evidenziazioni, testo.";
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
        { key: 'accent_color',       label: 'Fascia decorativa', hint: 'Sfumatura o banda decorativa' },
        { key: 'header_text_color',  label: 'Testo sull\'immagine', hint: 'Colore del testo sopra l\'immagine di copertina' },
        { key: 'text_color',         label: 'Testo',          hint: 'Colore del testo descrittivo' },
      ];
    case 'condizioni':
    case 'legali':
    case 'sezione':
      return [
        { key: 'primary_color',      label: 'Titoli delle sezioni', hint: 'Titoli e sottotitoli colorati' },
        { key: 'accent_color',       label: 'Linee ed evidenziazioni', hint: 'Righe di separazione e parti in risalto' },
        { key: 'text_color',         label: 'Testo',           hint: 'Paragrafi normali' },
        { key: 'secondary_color',    label: 'Citazioni/note',  hint: 'Testo secondario' },
        { key: 'header_text_color',  label: 'Testo sulle evidenziazioni', hint: 'Su sfondo colorato' },
      ];
    case 'prodotto':
      return [
        { key: 'primary_color',      label: 'Nome prodotto', hint: 'Colore del titolo' },
        { key: 'accent_color',       label: 'Sfondo della scheda', hint: 'Sfondo leggero della scheda' },
        { key: 'secondary_color',    label: 'Categoria',     hint: 'Etichetta categoria' },
        { key: 'text_color',         label: 'Descrizione',   hint: 'Testo normale' },
        { key: 'header_text_color',  label: 'Prezzo',        hint: 'Colore del prezzo' },
      ];
    case 'offerta':
    default:
      return [
        { key: 'primary_color',      label: 'Primario',         hint: 'Intestazione e parti in evidenza' },
        { key: 'secondary_color',    label: 'Secondario',       hint: 'Bordi, righe tabella' },
        { key: 'accent_color',       label: 'Sfondo leggero',   hint: 'Righe alternate e riquadri' },
        { key: 'text_color',         label: 'Testo',            hint: 'Paragrafi e voci' },
        { key: 'header_text_color',  label: 'Testo intestazione', hint: 'Sopra il colore principale' },
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
