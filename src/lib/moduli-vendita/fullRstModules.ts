import { completeModulePhotography } from "./modulePhotography";
import type { RstTemplatePdf, RstComputoVoce, RstProgetto, RstProgettoMedia } from "@/types/ristrutturazione";
import type { RstCoverPatch } from "@/components/ristrutturazione/coverPresets";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { TetEditorialPair } from "./fullTettiFactory";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { ristrutturazioneCompletaContent } from "./fullRistrutturazioneCompleta";
import { ristrutturazioneParzialeContent } from "./fullRistrutturazioneParziale";
import { ristrutturazioneCommercialeContent } from "./fullRistrutturazioneCommerciale";
import { ristrutturazioneSpaziContent } from "./fullRistrutturazioneSpazi";
import { ristrutturazioneComputoContent } from "./fullRistrutturazioneComputo";

export const FULL_RST_MODULES = ["completa", "parziale", "commerciale", "spazi", "computo"] as const;
export type FullRstModuleId = typeof FULL_RST_MODULES[number];
export const RST_MODULE_TITLES: Record<FullRstModuleId, string> = { completa: "Ristrutturazione completa", parziale: "Ristrutturazione parziale", commerciale: "Negozi e uffici", spazi: "Redistribuzione degli spazi", computo: "Intervento a computo" };
const CONTENT = { completa: ristrutturazioneCompletaContent, parziale: ristrutturazioneParzialeContent, commerciale: ristrutturazioneCommercialeContent, spazi: ristrutturazioneSpaziContent, computo: ristrutturazioneComputoContent };
export type FullRstTemplate = RstTemplatePdf & RstCoverPatch & {
  pdf_cover_eyebrow: string | null; pdf_cover_hero: string | null; pdf_cover_subhero: string | null;
  pdf_cover_subhero_template?: string | null;
};
export const isFullRstModuleId = (id: string): id is FullRstModuleId => (FULL_RST_MODULES as readonly string[]).includes(id);

/** Each edition supplies the complete original editor/renderer schema, not the generic document. */
export function createFullRstTemplate(base: RstTemplatePdf, id: FullRstModuleId): FullRstTemplate {
  if (!isFullRstModuleId(id)) throw new Error("Modulo Ristrutturazioni non disponibile.");
  const c = CONTENT[id];
  const items = (values: readonly TetEditorialPair[]) => values.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const entries = (values: readonly TetEditorialPair[]) => values.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] }));
  const blocks = Object.fromEntries(Object.entries(c.blocks).map(([key, b]): [string, ContenutoBlocco & { senzaFoto: boolean }] => [key, {
    occhiello: c.eyebrow, titolo: b.title, intro: b.intro, voci: entries(b.items), escluse: entries(b.excluded || []),
    foto: b.photo ? [b.photo] : [], senzaFoto: !b.photo,
    nota: b.photo ? "Immagine illustrativa, non un lavoro aziendale o un progetto del tuo immobile. Forniture e opere sono quelle del computo confermato." : null,
  }]));
  const result: FullRstTemplate = {
    ...structuredClone(base), id: `local-ristrutturazioni-${id}`,
    cover_title: c.title, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    pdf_cover_hero: null, pdf_cover_subhero: null, pdf_cover_subhero_template: null,
    pdf_cover_eyebrow: c.eyebrow, pdf_cover_image_url: c.cover,
    pdf_cover_bg_color: "#263638", pdf_cover_text_color: "#ffffff", pdf_cover_overlay_opacity: 74,
    pdf_cover_overlay_style: "gradient", pdf_cover_text_align: "left", pdf_cover_text_vertical: "bottom",
    pdf_cover_title_size: 36, pdf_cover_subtitle_size: 13, pdf_cover_eyebrow_size: 10,
    pdf_cover_show_decoration: false, pdf_cover_decoration_style: "none", pdf_cover_show_client_card: true,
    pdf_cover_logo_position: "top_left",
    color_primary: base.color_primary || "#563e32", color_accent: base.color_accent || "#b0794e",
    show_chi_siamo: !!base.chi_siamo?.trim(), show_margine: false, show_cronoprogramma: true, show_percorso: true, show_garanzie: true,
    condizioni_legali_testo: null, condizioni_legali_attivo: false, modulo_recesso_attivo: false,
    default_detrazione_pct: 0, default_iva_pct: base.default_iva_pct ?? 22,
    testimonianze: [], gallery_lavori: [], finanziamento_promo: null, pdf_pagine_libere: [],
    esigenze: items(c.needs), soluzione: items(c.solution), usp: items(c.usp), percorso: items(c.journey), garanzie: items(c.guarantees),
    cronoprogramma: c.schedule.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })),
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(p => ({ chiave: p.chiave, visibile: true })),
    pdf_blocchi: {
      ...blocks, modulo_edizione: 2, modulo_intervento: id,
      modulo_foto: [{ url: c.cover, nome: id === "computo" ? "Ambiente in lavorazione · illustrativa" : "Ambiente rinnovato · illustrativa" }, ...c.images.map(i => ({ url: i.url, nome: `${i.name} · illustrativa` }))],
      pagina_computo: { senzaFoto: true }, pagina_compreso: { senzaFoto: true }, pagina_domande: { senzaFoto: true },
      pagina_investimento: c.journeyPhoto ? { foto: [c.journeyPhoto] } : { senzaFoto: true },
      pagina_chiSiamo: { senzaFoto: true }, pagina_tempi: { senzaFoto: true }, pagina_garanzie: { senzaFoto: true },
      pagina_percorso: { senzaFoto: true },
      // Explicit editorial selection precedes the shared helper's unused-library fallback.
      pagina_chiusura: c.closingPhoto ? { foto: [c.closingPhoto], senzaFoto: false } : { senzaFoto: true },
    },
  };
  result.pdf_blocchi = completeModulePhotography(result.pdf_blocchi, "ristrutturazione");
  result.pdf_blocchi = { ...result.pdf_blocchi, modulo_defaults: structuredClone(result.pdf_blocchi) };
  return result;
}

/** Shared by sidebar, dialog, standalone preview and offline QA. No project is saved. */
export function buildRstModulePreview(companyId: string, template: RstTemplatePdf, id: FullRstModuleId): { progetto: RstProgetto; computo: RstComputoVoce[]; media: RstProgettoMedia[]; template: RstTemplatePdf } {
  if (!isFullRstModuleId(id)) throw new Error("Modulo Ristrutturazioni non disponibile.");
  const rows: Array<[string, string, RstComputoVoce["unita_misura"], number, number]> = id === "computo" ? [
    ["Preparazioni", "Ambito A: protezioni delle superfici conservate e dei percorsi indicati", "corpo", 1, 400],
    ["Rimozioni", "Ambito A: rimozione della pavimentazione nelle zone individuate", "mq", 25, 12],
    ["Supporti", "Ambito A: preparazione del supporto nelle superfici previste", "mq", 25, 18],
    ["Finiture", "Ambito A: fornitura e posa della pavimentazione selezionata", "mq", 25, 55],
    ["Finiture", "Ambito A: fornitura e posa del battiscopa indicato", "ml", 22, 14],
    ["Ripristini", "Ambito A: raccordi alle soglie e alle parti conservate come descritti", "corpo", 1, 250],
  ] : id === "spazi" ? [
    ["Preparazioni", "Nuovo layout: protezioni degli ambienti e dei passaggi concordati", "corpo", 1, 500],
    ["Rimozioni", "Nuovo layout: rimozione delle partizioni leggere identificate e confermate nel progetto", "mq", 20, 25],
    ["Nuove partizioni", "Nuovo layout: realizzazione delle partizioni leggere nella configurazione concordata", "mq", 28, 65],
    ["Opere connesse", "Nuovo layout: modifiche dei punti elettrici nelle sole zone individuate", "corpo", 1, 1000],
    ["Ripristini", "Nuovo layout: ripristino dei supporti nelle superfici indicate", "mq", 18, 38],
    ["Finiture", "Nuovo layout: preparazione e tinteggiatura delle superfici concordate", "mq", 95, 12],
  ] : id === "commerciale" ? [
    ["Preparazioni", "Locale ufficio: protezione delle parti mantenute e organizzazione degli accessi previsti", "corpo", 1, 700],
    ["Rimozioni", "Locale ufficio: rimozione delle partizioni leggere identificate nel layout", "mq", 20, 25],
    ["Opere interne", "Locale ufficio: nuove partizioni nella configurazione concordata", "mq", 30, 65],
    ["Impianti", "Locale ufficio: predisposizioni elettriche delle postazioni indicate nel computo", "corpo", 1, 2200],
    ["Finiture", "Locale ufficio: fornitura e posa della pavimentazione selezionata", "mq", 60, 55],
    ["Finiture", "Locale ufficio: preparazione e tinteggiatura delle superfici individuate", "mq", 140, 12],
  ] : id === "parziale" ? [
    ["Preparazioni", "Zona soggiorno: protezioni delle parti conservate e dei percorsi concordati", "corpo", 1, 350],
    ["Rimozioni", "Zona soggiorno: rimozione del rivestimento a pavimento previsto", "mq", 30, 12],
    ["Supporti", "Zona soggiorno: preparazione del supporto per la nuova finitura", "mq", 30, 14],
    ["Finiture", "Zona soggiorno: fornitura e posa del pavimento selezionato", "mq", 30, 55],
    ["Finiture", "Zona soggiorno: preparazione e tinteggiatura delle superfici indicate", "mq", 80, 12],
    ["Raccordi", "Zona soggiorno: finitura dei raccordi e delle soglie previste", "corpo", 1, 280],
  ] : [
    ["Preparazioni", "Protezioni degli ambienti e dei percorsi previsti", "corpo", 1, 800],
    ["Rimozioni", "Rimozione delle pavimentazioni indicate", "mq", 90, 12],
    ["Opere edili", "Realizzazione delle pareti divisorie previste dal progetto", "mq", 35, 45],
    ["Impianti", "Lavorazioni sull'impianto elettrico della configurazione concordata", "corpo", 1, 6500],
    ["Impianti", "Lavorazioni sull'impianto idrico della configurazione concordata", "corpo", 1, 4200],
    ["Finiture", "Fornitura e posa della pavimentazione selezionata", "mq", 90, 55],
  ];
  const computo = rows.map(([capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario], i): RstComputoVoce => ({
    id: `preview-${i}`, progetto_id: "preview", company_id: companyId, capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario,
    costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: quantita * prezzo_unitario,
    margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine: i,
  }));
  const imponibile = computo.reduce((s, r) => s + r.importo, 0), iva = template.default_iva_pct ?? 22;
  const progetto: RstProgetto = {
    id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza", tipo_intervento: RST_MODULE_TITLES[id],
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: id === "commerciale" ? "Ufficio" : "Appartamento", immobile_superficie_mq: id === "completa" ? 90 : null, immobile_anno: null, immobile_piani: id === "completa" ? 1 : null,
    massimale_detrazione: null, numero_vani: null, altezza_media_m: null, opportunita_id: null, cliente_id: null, template_id: null,
    sconto_pct: 0, iva_pct: iva, detrazione_pct: 0, totale_imponibile: imponibile, totale: Math.round(imponibile * (1 + iva / 100) * 100) / 100,
    note: "Dati e prezzi dimostrativi, non un'offerta. IVA da verificare per il singolo intervento.",
  };
  return { progetto, computo, media: [], template };
}
