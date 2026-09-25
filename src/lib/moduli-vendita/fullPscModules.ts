import type { PisTemplatePdf, PisProgetto, PisComputoVoce, PisProgettoMedia } from "@/types/piscine";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { PSC_EDITORIAL, type PscEditorialPair } from "./pscEditorialContent";

export { PSC_EDITORIAL } from "./pscEditorialContent";
export const FULL_PSC_MODULES = ["nuova", "ristrutturazione", "rivestimento", "impianti", "accessori", "manutenzione"] as const;
export type FullPscModuleId = typeof FULL_PSC_MODULES[number];
export const isFullPscModuleId = (id: string): id is FullPscModuleId => FULL_PSC_MODULES.some(value => value === id);
export const PSC_MODULE_TITLES = Object.fromEntries(FULL_PSC_MODULES.map(id => [id, PSC_EDITORIAL[id].title])) as Record<FullPscModuleId, string>;
export const PSC_MODULE_COVERS = Object.fromEntries(FULL_PSC_MODULES.map(id => [id, PSC_EDITORIAL[id].cover])) as Record<FullPscModuleId, string>;

/** Native Piscine template: same chapters, renderer and editing controls as the original. */
export function createFullPscTemplate(base: PisTemplatePdf, id: FullPscModuleId): PisTemplatePdf {
  const c = PSC_EDITORIAL[id];
  const inherited = structuredClone(base) as PisTemplatePdf & Record<string, unknown>;
  // Piscine edits the historical cover_* fields. Do not let old aliases override them.
  for (const key of ["hero", "subhero", "subhero_template", "image_url", "title_size", "text_align", "text_color", "overlay_opacity", "logo_url", "logo_position"]) delete inherited[`pdf_cover_${key}`];
  const note = "Immagine illustrativa: non documenta un cantiere aziendale e non identifica prodotti o dotazioni compresi. Fa fede la proposta.";
  const items = (pairs: readonly PscEditorialPair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const block = (titolo: string, intro: string, pairs: readonly PscEditorialPair[], photo: string, excluded: readonly PscEditorialPair[] = []) => ({
    occhiello: c.title, titolo, intro, voci: pairs.map(([titolo, testo]) => ({ titolo, testo, icona: "verifica" })),
    escluse: excluded.map(([titolo, testo]) => ({ titolo, testo })), foto: [photo], senzaFoto: false, nota: note,
  });
  const construction = id === "nuova" || id === "ristrutturazione" || id === "rivestimento";
  const protection = construction ? "/pdf-stock/piscine/protezione.jpg" : id === "accessori" ? "/pdf-stock/piscine/risultato.jpg" : "/pdf-stock/piscine/locale-tecnico.jpg";
  const scopePhoto = id === "nuova" ? "/pdf-stock/piscine/installazione.jpg" : id === "impianti" ? "/pdf-stock/piscine/locale-tecnico.jpg" : id === "manutenzione" ? "/pdf-stock/piscine/collaudo.jpg" : "/pdf-stock/piscine/risultato.jpg";
  const checkPhoto = id === "accessori" ? c.detail : id === "rivestimento" ? "/pdf-stock/piscine/tecnica-vasca.jpg" : "/pdf-stock/piscine/collaudo.jpg";
  const closingPhoto = id === "accessori" ? "/cover-stock/piscine/1.jpg" : id === "manutenzione" ? "/pdf-stock/piscine/risultato.jpg" : "/pdf-stock/piscine/famiglia.jpg";
  const diaryPhoto = construction ? "/pdf-stock/piscine/installazione.jpg" : id === "accessori" ? "/pdf-stock/piscine/famiglia.jpg" : "/pdf-stock/piscine/tecnica-filtrazione.jpg";
  const documentation = "/pdf-stock/comune/consegna-documenti.jpg";
  const blocks: Record<string, unknown> = {
    modulo_edizione: 2, modulo_intervento: id,
    comeFunziona: block("Le scelte. *Dentro il progetto*.", c.subtitle, c.specs, c.detail),
    compreso: block("La fornitura. *Senza sottintesi*.", c.scope, c.rows.map(([title, text]) => [title, text.replace("dimostrativa", "concordata")] as const), scopePhoto, c.exclusions),
    protezione: block(construction ? "Il giardino. *Durante i lavori*." : "Spazi e accessi. *Prima di intervenire*.", construction ? "La piscina è parte di uno spazio vissuto: accessi e aree di lavoro si definiscono prima di iniziare." : "Il fermo della piscina e l'accesso alle apparecchiature si concordano in funzione delle attività previste.", [
      ["Area interessata", construction ? "Concordare delimitazione, percorso dei mezzi e deposito dei materiali; tenere distinti i passaggi del cantiere dalle zone utilizzate." : "Identificare il percorso fino alla vasca e al locale tecnico; delimitare le zone interessate dalle attività concordate."],
      ["Parti da conservare", construction ? "Individuare verde, pavimentazioni e bordi da proteggere. Documentare lo stato iniziale delle superfici interessate." : "Proteggere bordo, finiture e componenti conservati nelle sole zone di montaggio o manutenzione."],
      ["Utenze e fermo vasca", "Concordare disponibilità di acqua ed energia, interruzioni e modalità di gestione della vasca durante l'intervento."],
      ["Materiali e riordino", "Definire gestione dei materiali rimossi, dei prodotti e degli imballaggi; precisare pulizia finale e ripristini compresi."],
    ], protection),
    controlli: block("I riscontri. *Prima della consegna*.", "Le verifiche riguardano le lavorazioni previste e vengono riferite alle condizioni effettivamente riscontrate.", c.checks, checkPhoto),
    documenti: block("Le informazioni. *Restano con te*.", "Un fascicolo riferito alla fornitura e alle attività effettive, senza attestazioni generiche.", [
      ["Perimetro e componenti", `${c.title}: riepilogo di attività, prodotti e parti conservate, con le varianti eventualmente concordate.`],
      ["Verifiche effettuate", `${c.checks[0][0]} e altri riscontri previsti: registrare esiti, data e anomalie da affrontare.`],
      ["Istruzioni e gestione", "Schede e manuali dei prodotti forniti, indicazioni di uso e manutenzione e documentazione tecnica applicabile alle opere effettuate."],
      ["Assistenza e attività residue", "Contatti, condizioni di garanzia dei prodotti e delle opere, attività ancora da completare e servizi successivi concordati."],
    ], documentation),
    diario: block("Le fasi. *Da documentare*.", "Questa pagina descrive le foto da raccogliere durante il lavoro; l'immagine è illustrativa e non rappresenta un prima e dopo del cliente.", [
      ["Stato iniziale", c.stages[0][1]], ["Dettagli accessibili", c.stages[2][1]], ["Consegna", c.stages[3][1]],
    ], diaryPhoto),
    // Avoid unrelated default building photos; assign real landscape assets to meaningful pages.
    ...Object.fromEntries(["computo", "compreso", "percorso", "tempi", "garanzie", "domande", "chiSiamo", "recensioni"].map(page => [`pagina_${page}`, { senzaFoto: true }])),
    pagina_investimento: { foto: [id === "accessori" ? closingPhoto : "/pdf-stock/piscine/risultato.jpg"], senzaFoto: false },
    pagina_chiusura: { foto: [closingPhoto], senzaFoto: false },
    modulo_foto: [...new Set([c.cover, c.detail, protection, scopePhoto, checkPhoto, closingPhoto, diaryPhoto, documentation, "/pdf-stock/piscine/risultato.jpg", "/pdf-stock/piscine/installazione.jpg", "/pdf-stock/piscine/locale-tecnico.jpg", "/pdf-stock/piscine/tecnica-filtrazione.jpg"])].map(url => ({ url, nome: `${c.title} · immagine illustrativa` })),
  };
  blocks.modulo_defaults = structuredClone(blocks);
  return {
    ...inherited, id: `local-piscine-${id}`,
    color_primary: base.color_primary || "#174e59", color_secondary: base.color_secondary || "#267785", color_accent: base.color_accent || "#a88048", color_text: base.color_text || "#253c43",
    cover_title: c.hero, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    cover_text_color: "#FFFFFF", cover_overlay_opacity: 0.65, cover_title_size: 35, cover_text_align: "left", cover_logo_position: "top_left",
    pdf_cover_overlay_style: "gradient", pdf_cover_text_vertical: "bottom", pdf_cover_decoration_style: "none", pdf_cover_show_decoration: false, pdf_cover_show_client_card: true, pdf_cover_eyebrow_size: 10, pdf_cover_subtitle_size: 13,
    condizioni_legali_attivo: false, condizioni_legali_testo: null, modulo_recesso_attivo: false,
    default_iva_pct: 22, default_detrazione_pct: 0, default_validita_giorni: 30,
    show_chi_siamo: !!base.chi_siamo?.trim(), show_margine: false, show_garanzie: true, show_percorso: true, show_cronoprogramma: true,
    esigenze: items(c.specs.slice(0, 2)), soluzione: items(c.specs.slice(2)),
    usp: items([["Scelte riconoscibili", c.specs[1][1]], ["Un perimetro esplicito", c.scope], ["Consegna accompagnata", c.stages[3][1]]]),
    percorso: items(c.stages), cronoprogramma: c.stages.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    garanzie: items([["Fornitura identificata", c.specs[1][1]], ["Verifiche circoscritte", c.checks[2][1]], ["Documenti e assistenza", "Condizioni dei prodotti e delle opere, riferimenti e servizi successivi sono quelli concordati; nessuna durata aggiuntiva è presunta."]]),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })), testimonianze: [], gallery_lavori: [], finanziamento_promo: null,
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(page => ({ chiave: page.chiave, visibile: !["recensioni", "lavori", "foto"].includes(page.chiave) })), pdf_pagine_libere: [], pdf_blocchi: blocks,
  };
}

/** Demonstration only: no fictional customer site, measured dimensions or fiscal benefit. */
export function buildPscModulePreview(companyId: string, template: PisTemplatePdf, id: FullPscModuleId) {
  const progetto: PisProgetto = {
    id: "preview", company_id: companyId, code: "PSC-DEMO", stato: "bozza", tipo_intervento: PSC_MODULE_TITLES[id], tipo_piscina: null, tipo_costruzione: null,
    cliente_nome: "Cliente", cliente_cognome: "dimostrativo", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null, sconto_pct: 0, iva_pct: 22, detrazione_pct: 0, totale_imponibile: 0, totale: 0,
    note: "ANTEPRIMA DIMOSTRATIVA: prezzi, prodotti e IVA sono esempi da definire per il caso concreto. Non è un'offerta da inviare.",
  };
  const computo: PisComputoVoce[] = PSC_EDITORIAL[id].rows.map(([capitolo_nome, descrizione, price], i): PisComputoVoce => ({ id: `demo-${i}`, progetto_id: "preview", company_id: companyId, ordine: i, capitolo_nome, descrizione, unita_misura: "corpo", quantita: 1, prezzo_unitario: price, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: price, margine_eur: price, margine_pct: 100, listino_voce_id: null }));
  return { progetto, computo, media: [] as PisProgettoMedia[], template, localOnly: true as const };
}
