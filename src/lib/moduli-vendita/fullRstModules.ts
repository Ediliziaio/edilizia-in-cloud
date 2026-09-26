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
import { tinteggiaturaInternaContent, cartaDaParatiContent, cartongessoContent, controsoffittiContent, decorativiContent, umiditaMuffaContent, acusticaContent } from "./fullParetiSoffitti";
import { pergolaBioclimaticaContent, pergolaTeloContent, tendeSoleContent, vetrateChiusureContent, carportContent } from "./fullPergole";

export const FULL_RST_MODULES = ["completa", "parziale", "commerciale", "spazi", "computo"] as const;
// Area «Pareti e soffitti» (Lotto 2): stesso motore Ristrutturazioni, id propri.
export const FULL_PARETI_SOFFITTI_MODULES = ["tinteggiatura-interna", "carta-da-parati", "cartongesso", "controsoffitti", "decorativi", "umidita", "acustica"] as const;
// Area «Pergole e tende» (Lotto 3): stesso motore Ristrutturazioni, id propri.
export const FULL_PERGOLE_MODULES = ["pergola-bioclimatica", "pergola-telo", "tende-sole", "vetrate", "carport"] as const;
export type FullRstModuleId = typeof FULL_RST_MODULES[number] | typeof FULL_PARETI_SOFFITTI_MODULES[number] | typeof FULL_PERGOLE_MODULES[number];
export const RST_MODULE_TITLES: Record<FullRstModuleId, string> = { completa: "Ristrutturazione completa", parziale: "Ristrutturazione parziale", commerciale: "Negozi e uffici", spazi: "Redistribuzione degli spazi", computo: "Intervento a computo", "tinteggiatura-interna": "Tinteggiatura interna", "carta-da-parati": "Carta da parati", cartongesso: "Pareti in cartongesso", controsoffitti: "Controsoffitti e velette", decorativi: "Finiture decorative", umidita: "Umidità e muffa", acustica: "Isolamento acustico", "pergola-bioclimatica": "Pergola bioclimatica", "pergola-telo": "Pergola con telo", "tende-sole": "Tende da sole", vetrate: "Vetrate e chiusure balcone", carport: "Carport e tettoie" };
const CONTENT: Record<FullRstModuleId, import("./fullTettiFactory").TetEditorialContent> = { completa: ristrutturazioneCompletaContent, parziale: ristrutturazioneParzialeContent, commerciale: ristrutturazioneCommercialeContent, spazi: ristrutturazioneSpaziContent, computo: ristrutturazioneComputoContent, "tinteggiatura-interna": tinteggiaturaInternaContent, "carta-da-parati": cartaDaParatiContent, cartongesso: cartongessoContent, controsoffitti: controsoffittiContent, decorativi: decorativiContent, umidita: umiditaMuffaContent, acustica: acusticaContent, "pergola-bioclimatica": pergolaBioclimaticaContent, "pergola-telo": pergolaTeloContent, "tende-sole": tendeSoleContent, vetrate: vetrateChiusureContent, carport: carportContent };
export type FullRstTemplate = RstTemplatePdf & RstCoverPatch & {
  pdf_cover_eyebrow: string | null; pdf_cover_hero: string | null; pdf_cover_subhero: string | null;
  pdf_cover_subhero_template?: string | null;
};
export const isFullRstModuleId = (id: string): id is FullRstModuleId => (FULL_RST_MODULES as readonly string[]).includes(id) || (FULL_PARETI_SOFFITTI_MODULES as readonly string[]).includes(id) || (FULL_PERGOLE_MODULES as readonly string[]).includes(id);

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
  const PARETI: Partial<Record<FullRstModuleId, Array<[string, string, RstComputoVoce["unita_misura"], number, number]>>> = {
    "tinteggiatura-interna": [
      ["Preparazioni", "Protezione dei pavimenti, degli infissi e dei mobili nelle stanze indicate", "corpo", 1, 250],
      ["Preparazione fondo", "Stuccatura di fori e crepe e carteggiatura delle superfici da tinteggiare", "mq", 120, 6],
      ["Preparazione fondo", "Applicazione della mano di fondo isolante dove prevista", "mq", 120, 3.5],
      ["Tinteggiatura", "Due mani di idropittura lavabile su pareti e soffitti indicati", "mq", 120, 9],
      ["Consegna", "Rimozione delle protezioni e pulizia delle aree trattate", "corpo", 1, 180],
    ],
    "carta-da-parati": [
      ["Preparazioni", "Protezione della stanza e smontaggio delle placche elettriche", "corpo", 1, 200],
      ["Preparazione fondo", "Rasatura e primer della parete da rivestire", "mq", 14, 12],
      ["Fornitura", "Carta da parati in tessuto non tessuto, con lo sfrido del disegno", "mq", 17, 28],
      ["Posa", "Posa allineata della carta con raccordi su angoli e prese", "mq", 14, 22],
      ["Consegna", "Pulizia, ritiro degli scarti e rimontaggio delle placche", "corpo", 1, 150],
    ],
    cartongesso: [
      ["Preparazioni", "Protezione dei pavimenti e dei passaggi nella zona di montaggio", "corpo", 1, 200],
      ["Struttura", "Orditura metallica per parete divisoria, con rinforzi nei punti di carico", "mq", 12, 22],
      ["Isolante", "Lana minerale nell'intercapedine per isolamento acustico", "mq", 12, 9],
      ["Lastre", "Doppia lastra per lato, idonea alla stanza indicata", "mq", 12, 26],
      ["Finitura", "Stuccatura e carteggiatura dei giunti, pronta alla pittura", "mq", 24, 7],
    ],
    controsoffitti: [
      ["Preparazioni", "Protezione dei pavimenti e dei mobili sotto la zona di lavoro", "corpo", 1, 250],
      ["Struttura", "Orditura metallica appesa per controsoffitto, con i rinforzi previsti", "mq", 18, 24],
      ["Predisposizioni", "Fori e alimentazioni per i faretti a incasso e la botola d'ispezione", "corpo", 1, 350],
      ["Lastre", "Chiusura con lastra di cartongesso e veletta perimetrale", "mq", 18, 28],
      ["Finitura", "Stuccatura e carteggiatura dei giunti, pronta alla pittura", "mq", 18, 8],
    ],
    decorativi: [
      ["Preparazioni", "Protezione accurata di pavimenti, infissi e bordi", "corpo", 1, 300],
      ["Preparazione fondo", "Rasatura di finezza e primer del ciclo decorativo", "mq", 20, 16],
      ["Finitura decorativa", "Applicazione a più strati dell'effetto scelto, approvato su campione", "mq", 20, 55],
      ["Protezione", "Finitura protettiva sulle superfici d'uso previste", "mq", 20, 12],
      ["Consegna", "Rimozione delle protezioni e pulizia", "corpo", 1, 200],
    ],
    umidita: [
      ["Preparazioni", "Protezione della stanza e sopralluogo diagnostico", "corpo", 1, 300],
      ["Rimozione", "Rimozione dell'intonaco ammalorato fino al vivo", "mq", 15, 22],
      ["Risanamento", "Applicazione dell'intonaco deumidificante traspirante", "mq", 15, 45],
      ["Finitura", "Pittura traspirante sulle superfici risanate", "mq", 15, 11],
      ["Consegna", "Pulizia e indicazioni d'uso per prevenire il ritorno", "corpo", 1, 150],
    ],
    acustica: [
      ["Preparazioni", "Protezione della stanza e individuazione della via del rumore", "corpo", 1, 300],
      ["Struttura", "Controparete fonoisolante con struttura disaccoppiata dal muro", "mq", 16, 30],
      ["Isolante", "Materiale fonoassorbente nell'intercapedine", "mq", 16, 14],
      ["Lastre", "Doppia lastra fonoisolante con trattamento dei giunti e delle prese", "mq", 16, 30],
      ["Finitura", "Stuccatura e carteggiatura, pronta alla pittura", "mq", 16, 7],
    ],
  };
  const PERGOLE: Partial<Record<FullRstModuleId, Array<[string, string, RstComputoVoce["unita_misura"], number, number]>>> = {
    "pergola-bioclimatica": [
      ["Sopralluogo", "Rilievo dello spazio esterno, degli appoggi e dello scarico dell'acqua", "corpo", 1, 250],
      ["Struttura", "Pergola bioclimatica in alluminio con lamelle orientabili, colore a scelta", "mq", 18, 320],
      ["Ancoraggi", "Fissaggi a terra o a parete dimensionati sul supporto e sul vento", "corpo", 1, 600],
      ["Comandi", "Motorizzazione delle lamelle con sensore di pioggia e vento", "corpo", 1, 900],
      ["Avviamento", "Collegamenti, prova dei comandi e dello scarico, consegna", "corpo", 1, 350],
    ],
    "pergola-telo": [
      ["Sopralluogo", "Rilievo della zona da coprire, degli appoggi e dell'esposizione", "corpo", 1, 200],
      ["Struttura", "Pergola con telo avvolgibile impermeabile, profili in alluminio", "mq", 15, 260],
      ["Ancoraggi", "Fissaggi a parete o autoportanti dimensionati sul supporto", "corpo", 1, 500],
      ["Comandi", "Motorizzazione del telo con sensore vento", "corpo", 1, 700],
      ["Avviamento", "Montaggio, tensione del telo e prova di apertura", "corpo", 1, 300],
    ],
    "tende-sole": [
      ["Sopralluogo", "Misura delle aperture, verifica dei supporti e dell'esposizione", "corpo", 1, 150],
      ["Fornitura", "Tenda a bracci con cassonetto, tessuto tecnico a scelta", "cad", 2, 780],
      ["Fissaggi", "Staffe e tasselli adatti al supporto, idonei anche a cappotto", "cad", 2, 90],
      ["Comandi", "Motorizzazione con telecomando e sensore vento", "cad", 2, 260],
      ["Installazione", "Montaggio in quota, collegamenti e prova", "corpo", 1, 250],
    ],
    vetrate: [
      ["Sopralluogo", "Rilievo dei lati da chiudere e verifica dei requisiti", "corpo", 1, 300],
      ["Fornitura", "Vetrata panoramica a tutto vetro con ante impacchettabili", "mq", 12, 480],
      ["Ferramenta", "Guide, carrelli e serrature del sistema scelto", "corpo", 1, 700],
      ["Installazione", "Montaggio delle guide, posa dei vetri e regolazione", "mq", 12, 90],
      ["Sigillature", "Tenuta ad acqua e aria e prova di apertura", "corpo", 1, 350],
    ],
    carport: [
      ["Sopralluogo", "Rilievo dello spazio, del terreno e dello scarico dell'acqua", "corpo", 1, 250],
      ["Fondazioni", "Plinti in calcestruzzo per gli appoggi della struttura", "cad", 4, 220],
      ["Struttura", "Carport per un'auto in alluminio o acciaio zincato", "mq", 15, 240],
      ["Copertura", "Pannelli coibentati con pendenza e fissaggi", "mq", 15, 85],
      ["Scarico", "Canale di gronda e discesa dell'acqua al punto concordato", "corpo", 1, 300],
    ],
  };
  const paretiRows = PARETI[id] ?? PERGOLE[id];
  const rows: Array<[string, string, RstComputoVoce["unita_misura"], number, number]> = paretiRows ? paretiRows : id === "computo" ? [
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
