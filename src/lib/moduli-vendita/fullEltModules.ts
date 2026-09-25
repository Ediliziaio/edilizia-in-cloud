import type { EleTemplatePdf, EleProgetto, EleComputoVoce, EleProgettoMedia } from "@/types/elettrico";
import type { EleCoverFields } from "@/components/elettrico/coverPresets";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { ELT_EDITORIAL, type EltPair } from "./eltEditorialContent";

export { ELT_EDITORIAL } from "./eltEditorialContent";
export const FULL_ELT_MODULES = ["completo", "adeguamento", "punti", "quadro", "domotica", "videocitofonia", "ricarica"] as const;
export type FullEltModuleId = typeof FULL_ELT_MODULES[number];
export const isFullEltModuleId = (id: string): id is FullEltModuleId => FULL_ELT_MODULES.some(v => v === id);
export const ELT_MODULE_TITLES = Object.fromEntries(FULL_ELT_MODULES.map(id => [id, ELT_EDITORIAL[id].title])) as Record<FullEltModuleId, string>;
/** Central library owns route registration; these are its integration inputs. */
export const ELT_MODULE_COVERS = Object.fromEntries(FULL_ELT_MODULES.map(id => [id, ELT_EDITORIAL[id].cover])) as Record<FullEltModuleId, string>;
export type FullEltTemplate = EleTemplatePdf & EleCoverFields & { pdf_blocchi: Record<string, unknown> };

export function createFullEltTemplate(base: EleTemplatePdf, id: FullEltModuleId): FullEltTemplate {
  const c = ELT_EDITORIAL[id];
  const protection = "/pdf-stock/comune/protezione-ambienti.jpg";
  const checks = "/pdf-stock/ristrutturazione/controllo-elettrico.jpg";
  const documents = "/pdf-stock/comune/consegna-documenti.jpg";
  const items = (pairs: readonly EltPair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const block = (titolo: string, intro: string, pairs: readonly EltPair[], photo: string, excluded: readonly EltPair[] = []) => ({
    occhiello: c.title, titolo, intro,
    voci: pairs.map(([titolo, testo]) => ({ titolo, testo, icona: "verifica" })),
    escluse: excluded.map(([titolo, testo]) => ({ titolo, testo })), foto: [photo], senzaFoto: false,
    nota: "Immagine illustrativa: non documenta un lavoro aziendale e non identifica il prodotto fornito. Fa fede la configurazione descritta nell'offerta.",
  });
  const diary = "/pdf-stock/comune/lavorazioni-nascoste.jpg";
  // The original renderer deduplicates page photos against ALL block photos.
  // Reserve distinct subjects so closing, guarantees and investment really render.
  const used = new Set([c.cover, c.detail, c.context, protection, checks, documents, diary]);
  const reserve = (...candidates: string[]) => {
    const chosen = candidates.find(photo => !used.has(photo));
    if (!chosen) throw new Error(`Fotografia distinta mancante per ${id}`);
    used.add(chosen); return chosen;
  };
  const pages = {
    chiSiamo: reserve("/pdf-stock/comune/giro-consegna.jpg"),
    percorso: reserve("/pdf-stock/comune/pulizia-consegna.jpg"),
    computo: reserve("/pdf-stock/fotovoltaico/componenti-elettrici.jpg", "/pdf-stock/elettrico/quadro.jpg", "/pdf-stock/fotovoltaico/quadro-elettrico.jpg", "/pdf-stock/elettrico/risultato.jpg"),
    compreso: c.context,
    investimento: id === "ricarica" ? reserve("/pdf-stock/fotovoltaico/wallbox.jpg") : reserve("/pdf-stock/elettrico/sera.jpg", "/module-art/elettrico.jpg", "/pdf-stock/elettrico/risultato.jpg", "/pdf-stock/elettrico/quadro.jpg"),
    garanzie: reserve("/pdf-stock/comune/controllo-finale.jpg"),
    tempi: reserve("/pdf-stock/elettrico/tracce.jpg", "/pdf-stock/fotovoltaico/quadro-elettrico.jpg"),
    domande: reserve("/pdf-stock/comune/domande.jpg"),
    chiusura: id === "ricarica" ? reserve("/pdf-stock/fotovoltaico/auto-elettrica-wallbox.jpg") : reserve("/cover-stock/elettrico/1.jpg"),
  };
  const result: FullEltTemplate = {
    ...structuredClone(base), id: `local-elettrico-${id}`,
    cover_title: c.hero, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    pdf_cover_hero: c.hero, pdf_cover_subhero: c.subtitle, pdf_cover_image_url: c.cover,
    pdf_cover_eyebrow: c.title.toUpperCase(), pdf_cover_bg_color: "#263648", pdf_cover_text_color: "#ffffff",
    pdf_cover_overlay_opacity: 65, pdf_cover_overlay_style: "gradient", pdf_cover_text_vertical: "bottom", pdf_cover_text_align: "left",
    pdf_cover_title_size: 34, pdf_cover_subtitle_size: 13, pdf_cover_eyebrow_size: 10,
    pdf_cover_decoration_style: "none", pdf_cover_logo_position: "top_left", pdf_cover_logo_size: 100, pdf_cover_show_decoration: false, pdf_cover_show_client_card: true,
    color_primary: base.color_primary || "#263648", color_accent: base.color_accent || "#a87137",
    condizioni_legali_attivo: false, condizioni_legali_testo: null, modulo_recesso_attivo: false,
    default_iva_pct: 22, default_detrazione_pct: 0, default_validita_giorni: 30,
    show_chi_siamo: !!base.chi_siamo?.trim(), show_margine: false, show_garanzie: true, show_percorso: true, show_cronoprogramma: true,
    esigenze: items(c.specs.slice(0, 2)), soluzione: items(c.specs.slice(2)),
    usp: items([["Configurazione riconoscibile", c.specs[1][1]], ["Perimetro condiviso", c.scope], ["Consegna verificabile", c.stages[3][1]]]),
    percorso: items(c.stages), cronoprogramma: c.stages.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    garanzie: items([["Componenti identificati", "Modelli e caratteristiche devono corrispondere alla fornitura descritta; condizioni dei produttori da conservare."], ["Opere delimitate", c.checks[0][1]], ["Verifiche documentate", c.checks[2][1]], ["Assistenza concordata", "Referente e modalità di segnalazione vengono consegnati con i documenti. Manutenzioni e servizi successivi richiedono un accordo specifico."]]),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })),
    testimonianze: [], gallery_lavori: [], finanziamento_promo: null, pdf_pagine_libere: [],
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(p => ({ chiave: p.chiave, visibile: p.chiave !== "recensioni" })),
    pdf_blocchi: {
      modulo_edizione: 1, modulo_intervento: id,
      modulo_foto: [...new Set([c.cover, c.detail, c.context, protection, checks, documents, diary, ...Object.values(pages)])].map(url => ({ url, nome: `${url.split("/").pop()!.replace(/\.jpg$/, "").replaceAll("-", " ")} · illustrativa` })),
      comeFunziona: block("Le scelte. *Prima dei collegamenti*.", c.subtitle, c.specs, c.detail),
      compreso: block("La fornitura. *Con confini precisi*.", c.scope,
        c.rows.map(([cap, text]) => [cap, text.replaceAll("dimostrativa", "concordata").replaceAll("dimostrativo", "concordato")] as const), c.context,
        [["Opere non elencate", c.scope], ["Servizi successivi", "Abbonamenti, manutenzione e assistenza continuativa non sono compresi salvo voce esplicita."]]),
      protezione: block("Spazi protetti. *Interruzioni concordate*.", "Prima dei lavori si individuano le zone interessate e le utenze da interrompere.",
        [["Accessi e superfici", "Concordare percorsi, appoggi e protezioni nelle sole aree interessate dalle lavorazioni."], ["Alimentazione", "Pianificare le interruzioni e segnalare le utenze che richiedono continuità o una gestione dedicata."], ["Tracce e polveri", "Delimitare le lavorazioni murarie effettivamente previste e la gestione dei materiali rimossi."], ["Ripristini", "Distinguere chiusure, rasature e pitture; la finitura finale segue quanto espressamente quotato."]], protection),
      controlli: block("Prima della consegna. *Riscontri concreti*.", `Per ${c.title.toLowerCase()}, i controlli riguardano le opere previste e le parti effettivamente coinvolte.`, c.checks, checks),
      documenti: block("Le informazioni. *Da ritrovare nel tempo*.", "Un fascicolo riferito all'intervento effettivo e alle funzioni consegnate.",
        [["Opere e configurazione", `Riepilogo di ${c.title.toLowerCase()}, componenti installati e varianti concordate.`], ["Esiti e limitazioni", c.checks[3][1]], ["Documenti tecnici", "Schemi, dichiarazioni e allegati applicabili alle opere eseguite, insieme alle istruzioni dei prodotti."], ["Uso e assistenza", "Comandi, condizioni dei produttori e recapiti per le segnalazioni; credenziali e accessi si consegnano separatamente."]], documents),
      diario: block("Le fasi. *Anche prima di richiudere*.", "Le immagini del modello sono illustrative. Eventuali foto reali si raccolgono soltanto sull'intervento effettivo, se concordato.",
        [["Prima", c.stages[0][1]], ["Durante", c.stages[2][1]], ["Alla consegna", c.stages[3][1]]], diary),
      ...Object.fromEntries(Object.entries(pages).map(([page, photo]) => [`pagina_${page}`, { foto: [photo], senzaFoto: false }])),
      testata_domande: { occhiello: c.title, titolo: "Le risposte. *Prima di scegliere*.", intro: "Chiarimenti sulle funzioni e sulle lavorazioni di questa proposta." },
      testata_garanzie: { occhiello: "Fornitura e assistenza", titolo: "Impegni chiari. *Documenti da conservare*.", intro: "Le condizioni sono riferite ai componenti e alle opere effettivamente offerti." },
    },
  };
  // Prevent stale inherited cover templates from overriding this intervention.
  (result as unknown as Record<string, unknown>).pdf_cover_subhero_template = null;
  result.pdf_blocchi.modulo_defaults = structuredClone(result.pdf_blocchi);
  return result;
}

/** One native fixture shared by the editor button, live panel, dialog and QA. */
export function buildEltModulePreview(companyId: string, template: EleTemplatePdf, id: FullEltModuleId) {
  const c = ELT_EDITORIAL[id];
  const progetto: EleProgetto = {
    id: "preview", company_id: companyId, code: "ELT-DEMO", stato: "bozza", tipo_intervento: c.title,
    numero_punti: null, livello_impianto: null,
    cliente_nome: "Cliente", cliente_cognome: "dimostrativo", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null,
    massimale_detrazione: null, opportunita_id: null, cliente_id: null, template_id: null,
    mostra_finanziamento: false, sconto_pct: 0, iva_pct: 22, detrazione_pct: 0, totale_imponibile: 0, totale: 0,
    note: "ANTEPRIMA DIMOSTRATIVA: configurazione, prezzi e IVA sono esempi da definire. Non è un'offerta da inviare.",
  };
  const computo: EleComputoVoce[] = c.rows.map(([capitolo_nome, descrizione, price], i): EleComputoVoce => ({
    id: `demo-${id}-${i}`, progetto_id: "preview", company_id: companyId, ordine: i, capitolo_nome, descrizione,
    unita_misura: "corpo", quantita: 1, prezzo_unitario: price, costo_materiali: 0, costo_manodopera: 0,
    sconto_pct: 0, importo: price, margine_eur: price, margine_pct: 100, listino_voce_id: null,
  }));
  return { progetto, computo, media: [] as EleProgettoMedia[], template, localOnly: true as const };
}
