import type { IntestazioneComputo } from "./esportaComputo";
import type { ModelloComputo } from "./modelloComputo";
import type { QuoteTemplate } from "@/types/quoteTemplate";

/** Copia solo l'aspetto: scegliere un'offerta non riscrive prezzi, clausole o bozze salvate. */
export function aspettoDaOfferta(template: QuoteTemplate): Partial<ModelloComputo> {
  return {
    modelloOffertaId: template.id,
    colorePrimario: /^#[\da-f]{6}$/i.test(template.primary_color ?? "") ? template.primary_color : "",
    fontFamiglia: ["helvetica", "times", "courier"].includes(template.font_family) ? template.font_family : "helvetica",
    copertina: template.layout === "minimal" ? "sobria" : template.layout === "classic" ? "fascia" : template.layout === "modern" ? "editoriale" : "piena",
    mostraLogo: template.show_logo !== false,
    mostraNumeriPagina: template.show_page_numbers !== false,
    piePagina: template.footer_text ?? "",
    sopratitolo: template.cover_tagline ?? "",
  };
}

/** La stessa selezione di sezioni vale per anteprima, download e documento inviato in firma. */
export function personalizzaDocumento(i: IntestazioneComputo): IntestazioneComputo {
  const modello = i.veste?.sezioni;
  const sezioni = { ...i.sezioni };
  for (const key of Object.keys(modello ?? {}) as (keyof NonNullable<typeof modello>)[]) {
    // Una sezione esclusa dall'azienda non ricompare per il default di una vecchia bozza.
    sezioni[key] = sezioni[key] !== false && modello![key] !== false;
  }
  return {
    ...i, sezioni,
    soloRiepilogo: i.soloRiepilogo || sezioni.lavorazioni === false,
    veste: i.veste && { ...i.veste, premessa: sezioni.premessa === false ? "" : i.veste.premessa,
      clausoleDaApprovare: sezioni.contrattuali === false ? "" : i.veste.clausoleDaApprovare },
    cronoprogramma: sezioni.cronoprogramma === false ? null : i.cronoprogramma,
    ratePagamento: sezioni.pagamenti === false ? [] : i.ratePagamento,
    ritenutaPagamenti: sezioni.pagamenti === false ? null : i.ritenutaPagamenti,
    calcoloDetrazione: sezioni.detrazione === false ? null : i.calcoloDetrazione,
    condizioniContrattuali: sezioni.contrattuali === false ? "" : i.condizioniContrattuali,
  };
}
