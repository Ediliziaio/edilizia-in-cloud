import { completeModulePhotography } from "./modulePhotography";
import { BGN_CHECK_IMAGES, BGN_GENERATED_CHECK_IMAGES } from "./bgnEditorialPhotography";
import type { BgnTemplatePdf, BgnComputoVoce, BgnProgetto, BgnProgettoMedia } from "@/types/bagni";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { TetEditorialPair } from "./fullTettiFactory";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { bagnoCompletoContent } from "./fullBagnoCompleto";
import { vascaDocciaContent } from "./fullVascaDoccia";
import { zonaDocciaContent } from "./fullZonaDoccia";
import { sanitariContent } from "./fullSanitari";
import { bagnoAccessibileContent } from "./fullBagnoAccessibile";
import { rinnovoBagnoContent } from "./fullRinnovoBagno";
export const FULL_BGN_MODULES = ["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"] as const;
export type FullBgnModuleId = typeof FULL_BGN_MODULES[number];
export type FullBgnTemplate = BgnTemplatePdf;
export const BGN_MODULE_TITLES: Record<FullBgnModuleId, string> = { completo: "Rifacimento completo del bagno", "vasca-doccia": "Da vasca a doccia", doccia: "Rifacimento zona doccia", sanitari: "Sanitari e rubinetteria", accessibilita: "Bagno accessibile", rinnovo: "Rinnovo estetico" };
const CONTENT = { completo: bagnoCompletoContent, "vasca-doccia": vascaDocciaContent, doccia: zonaDocciaContent, sanitari: sanitariContent, accessibilita: bagnoAccessibileContent, rinnovo: rinnovoBagnoContent };
export const isFullBgnModuleId = (id: string): id is FullBgnModuleId => (FULL_BGN_MODULES as readonly string[]).includes(id);

/** Each edition supplies the complete original editor/renderer schema, not the generic document. */
export function createFullBgnTemplate(base: BgnTemplatePdf, id: FullBgnModuleId): FullBgnTemplate {
  if (!isFullBgnModuleId(id)) throw new Error("Modulo Bagni non disponibile.");
  const c = CONTENT[id];
  const items = (values: readonly TetEditorialPair[]) => values.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const entries = (values: readonly TetEditorialPair[]) => values.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] }));
  const blocks = Object.fromEntries(Object.entries(c.blocks).map(([key, b]): [string, ContenutoBlocco & { senzaFoto: boolean }] => {
    const photo = key === "controlli" ? BGN_CHECK_IMAGES[id] : b.photo;
    const illustrative = photo && BGN_GENERATED_CHECK_IMAGES.includes(photo)
      ? "Immagine illustrativa generata con AI" : "Immagine illustrativa";
    return [key, {
    occhiello: c.eyebrow, titolo: b.title, intro: b.intro, voci: entries(b.items), escluse: entries(b.excluded || []),
    foto: photo ? [photo] : [], senzaFoto: !photo,
    nota: photo ? `${illustrative}, non un lavoro aziendale o un progetto del tuo immobile. Forniture e opere sono quelle del computo confermato.` : null,
  }]; }));
  const result: FullBgnTemplate = {
    ...structuredClone(base), id: `local-bagni-${id}`,
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
      modulo_foto: [{ url: c.cover, nome: `${BGN_MODULE_TITLES[id]} · copertina illustrativa` }, ...c.images.map(i => ({ url: i.url, nome: `${i.name} · illustrativa` }))],
      pagina_computo: { senzaFoto: true }, pagina_compreso: { senzaFoto: true }, pagina_domande: { senzaFoto: true },
      pagina_investimento: c.journeyPhoto ? { foto: [c.journeyPhoto] } : { senzaFoto: true },
      pagina_chiSiamo: { senzaFoto: true }, pagina_tempi: { senzaFoto: true }, pagina_garanzie: { senzaFoto: true },
      pagina_percorso: { senzaFoto: true }, pagina_chiusura: c.closingPhoto ? { foto: [c.closingPhoto], senzaFoto: false } : { senzaFoto: true },
    },
  };
  result.pdf_blocchi = completeModulePhotography(result.pdf_blocchi, "bagni");
  result.pdf_blocchi = { ...result.pdf_blocchi, modulo_defaults: structuredClone(result.pdf_blocchi) };
  return result;
}

/** Shared by all three preview entry points and offline PDF QA. */
export function buildBgnModulePreview(companyId: string, template: BgnTemplatePdf, id: FullBgnModuleId = "completo"): { progetto: BgnProgetto; computo: BgnComputoVoce[]; media: BgnProgettoMedia[]; template: BgnTemplatePdf } {
  if (!isFullBgnModuleId(id)) throw new Error("Modulo Bagni non disponibile.");
  const rows: Array<[string, string, BgnComputoVoce["unita_misura"], number, number]> = id === "rinnovo" ? [
    ["Preparazioni", "Rinnovo: protezione di superfici e dotazioni conservate", "corpo", 1, 180],
    ["Preparazioni", "Rinnovo: preparazione delle sole pareti non piastrellate indicate", "mq", 12, 15],
    ["Finiture", "Rinnovo: tinteggiatura delle pareti non piastrellate con prodotto e colore concordati", "mq", 12, 22],
    ["Finiture", "Rinnovo: preparazione e tinteggiatura del soffitto indicato", "mq", 6, 25],
    ["Dotazioni", "Rinnovo: fornitura e montaggio dello specchio non elettrificato selezionato", "cad", 1, 220],
    ["Dotazioni", "Rinnovo: fornitura e montaggio del set accessori espressamente descritto", "corpo", 1, 160],
    ["Consegna", "Rinnovo: pulizia finale delle sole parti interessate", "corpo", 1, 100],
  ] : id === "accessibilita" ? [
    ["Preparazioni", "Adattamento: protezione delle parti conservate e dei passaggi concordati", "corpo", 1, 200],
    ["Rimozioni", "Adattamento: smontaggio degli apparecchi individuati nella configurazione", "corpo", 1, 280],
    ["Predisposizioni", "Adattamento: raccordi idrico-sanitari sui tratti espressamente indicati", "corpo", 1, 520],
    ["Supporti", "Adattamento: preparazioni locali dei supporti verificati per i fissaggi previsti", "corpo", 1, 450],
    ["Dotazioni", "Adattamento: lavabo e rubinetteria della configurazione concordata, con montaggio", "corpo", 1, 780],
    ["Dotazioni", "Adattamento: vaso e accessori identificati nella proposta, con montaggio", "corpo", 1, 680],
    ["Dotazioni", "Adattamento: supporti selezionati con fissaggi previsti, posizioni da confermare sul rilievo", "cad", 2, 260],
    ["Ripristini", "Adattamento: finiture locali sulle sole superfici indicate", "corpo", 1, 350],
  ] : id === "sanitari" ? [
    ["Preparazioni", "Dotazioni: protezione delle parti conservate e dei passaggi concordati", "corpo", 1, 100],
    ["Smontaggi", "Dotazioni: smontaggio e ritiro dei tre apparecchi indicati", "corpo", 1, 210],
    ["Sanitari", "Dotazioni: fornitura e montaggio del vaso a terra selezionato, con sedile e cassetta descritti", "cad", 1, 420],
    ["Sanitari", "Dotazioni: fornitura e montaggio del bidet a terra selezionato", "cad", 1, 280],
    ["Sanitari", "Dotazioni: fornitura e montaggio del lavabo selezionato con fissaggi previsti", "cad", 1, 340],
    ["Rubinetteria", "Dotazioni: fornitura e montaggio dei miscelatori selezionati per lavabo e bidet", "cad", 2, 140],
    ["Collegamenti", "Dotazioni: raccordi, sifoni e componenti di collegamento espressamente previsti", "corpo", 1, 170],
  ] : id === "doccia" ? [
    ["Preparazioni", "Zona doccia: protezione delle parti conservate e dei passaggi concordati", "corpo", 1, 180],
    ["Rimozioni", "Zona doccia: smontaggio del box e del piatto, rimozione delle superfici indicate", "corpo", 1, 420],
    ["Predisposizioni", "Zona doccia: raccordi idrico-sanitari e scarico sui tratti individuati", "corpo", 1, 480],
    ["Supporti", "Zona doccia: preparazione dei supporti e protezioni dall'acqua previste", "corpo", 1, 560],
    ["Finiture", "Zona doccia: fornitura e posa del rivestimento selezionato sulle superfici indicate", "mq", 6, 70],
    ["Dotazioni", "Zona doccia: fornitura e montaggio del piatto selezionato", "cad", 1, 520],
    ["Dotazioni", "Zona doccia: fornitura e montaggio della chiusura selezionata", "cad", 1, 720],
    ["Dotazioni", "Zona doccia: fornitura e montaggio della rubinetteria selezionata", "cad", 1, 300],
  ] : id === "vasca-doccia" ? [
    ["Preparazioni", "Zona vasca: protezione delle parti conservate e dei passaggi concordati", "corpo", 1, 180],
    ["Rimozioni", "Zona vasca: rimozione della vasca e movimentazione dei materiali indicati", "corpo", 1, 380],
    ["Predisposizioni", "Zona vasca: raccordi idrico-sanitari e scarico sui tratti individuati", "corpo", 1, 520],
    ["Supporti e raccordi", "Zona vasca: preparazione supporti e finiture locali della zona doccia concordata", "corpo", 1, 640],
    ["Dotazioni", "Zona vasca: fornitura e montaggio del piatto doccia selezionato", "cad", 1, 650],
    ["Dotazioni", "Zona vasca: fornitura e montaggio della chiusura doccia selezionata", "cad", 1, 780],
    ["Dotazioni", "Zona vasca: fornitura e montaggio della rubinetteria selezionata", "cad", 1, 320],
  ] : [
    ["Preparazioni", "Bagno: protezione delle parti conservate e dei percorsi concordati", "corpo", 1, 350],
    ["Rimozioni", "Bagno: rimozione di pavimento, rivestimenti e dotazioni indicate", "corpo", 1, 850],
    ["Impianti", "Bagno: lavorazioni sui tratti idrico-sanitari e sugli attacchi individuati", "corpo", 1, 1600],
    ["Impianti", "Bagno: adeguamento dei punti elettrici indicati", "corpo", 1, 500],
    ["Supporti", "Bagno: preparazione supporti e trattamento delle zone umide previste", "corpo", 1, 800],
    ["Finiture", "Bagno: fornitura e posa del pavimento selezionato", "mq", 6, 65],
    ["Finiture", "Bagno: fornitura e posa del rivestimento selezionato", "mq", 20, 60],
    ["Dotazioni", "Bagno: fornitura e montaggio di sanitari, rubinetteria e zona doccia della configurazione concordata", "corpo", 1, 2400],
  ];
  const computo = rows.map(([capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario], i): BgnComputoVoce => ({
    id: `preview-${i}`, progetto_id: "preview", company_id: companyId, capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario,
    costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: quantita * prezzo_unitario, margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine: i,
  }));
  const imponibile = computo.reduce((sum, r) => sum + r.importo, 0), iva = template.default_iva_pct ?? 22;
  const progetto: BgnProgetto = {
    id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza", tipo_intervento: BGN_MODULE_TITLES[id], numero_bagni: 1,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: "Appartamento", immobile_superficie_mq: id === "completo" ? 6 : null, immobile_anno: null, immobile_piani: null,
    perimetro_ml: null, altezza_rivestimento_m: null, accessibile: false, massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null, sconto_pct: 0, iva_pct: iva, detrazione_pct: 0,
    totale_imponibile: imponibile, totale: Math.round(imponibile * (1 + iva / 100) * 100) / 100,
    note: "Dati e prezzi dimostrativi, non un'offerta. IVA da verificare per il singolo intervento.",
  };
  return { progetto, computo, media: [], template };
}
