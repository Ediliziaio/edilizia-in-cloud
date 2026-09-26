import type { SrTemplatePdfRow } from "@/types/serramenti";
import { completeModulePhotography } from "./modulePhotography";
import { SR_PDF_PAGES_META } from "@/types/serramenti";
import { createSerramentiModuleTemplate, type SerramentiTemplateModuleId } from "./serramentiTemplateModules";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { completeZanzariereTemplate } from "./fullZanzariereModule";
import { completeSerramentiEdition } from "./fullSerramentiFactory";
import { finestreContent } from "./fullFinestreModule";
import { avvolgibiliContent } from "./fullAvvolgibiliModule";
import { porteIngressoContent } from "./fullPorteIngressoModule";
import { porteInterneContent } from "./fullPorteInterneModule";
import { combinatoContent } from "./fullCombinatoModule";
import { portoniGarageContent, grateContent } from "./fullSerramentiExtra";

/** Full editions use the SAME renderer/editor as the original company document. */
export const FULL_SERRAMENTI_MODULES: readonly SerramentiTemplateModuleId[] = ["finestre", "persiane", "avvolgibili", "zanzariere", "porte-ingresso", "porte-interne", "combinato", "portoni-garage", "grate"];
export const isFullSerramentiTemplate = (template: Partial<SrTemplatePdfRow>) =>
  (template.pdf_blocchi as Record<string, unknown> | null)?.modulo_edizione === 2;

type Entry = readonly [string, string];
const block = (title: string, intro: string, items: readonly Entry[], photo?: string): ContenutoBlocco & { senzaFoto: boolean } => ({
  occhiello: "PERSIANE E SCURI", titolo: title, intro,
  voci: items.map(([titolo, testo], index) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[index % 4] })),
  escluse: [], foto: photo ? [photo] : [], senzaFoto: !photo,
  nota: photo ? "Immagine illustrativa. Modello, finitura e accessori sono quelli descritti nell'offerta." : null,
});

export function createFullSerramentiTemplate(base: Partial<SrTemplatePdfRow>, id: SerramentiTemplateModuleId): Partial<SrTemplatePdfRow> {
  const seed = createSerramentiModuleTemplate(base, id);
  if (id === "finestre") return completeSerramentiEdition(seed, base, finestreContent);
  if (id === "avvolgibili") return completeSerramentiEdition(seed, base, avvolgibiliContent);
  if (id === "porte-ingresso") return completeSerramentiEdition(seed, base, porteIngressoContent);
  if (id === "porte-interne") return completeSerramentiEdition(seed, base, porteInterneContent);
  if (id === "combinato") return completeSerramentiEdition(seed, base, combinatoContent);
  if (id === "portoni-garage") return completeSerramentiEdition(seed, base, portoniGarageContent);
  if (id === "grate") return completeSerramentiEdition(seed, base, grateContent);
  if (id === "zanzariere") return completeZanzariereTemplate(seed, base);
  if (id !== "persiane") return seed;
  const enabled = new Set(["chi_siamo", "proposta", "come_funziona", "macro_dedicate", "linee_dedicate", "render", "articoli_dedicati", "allegato_tecnico", "investimento", "percorso", "protezione", "controlli", "documenti", "diario", "garanzie", "gallery_lavori", "recensioni", "faq", "cta", "condizioni"]);
  const template: Partial<SrTemplatePdfRow> = {
    ...seed,
    pdf_font_family: base.pdf_font_family || "helvetica",
    pdf_cover_image_url: "/module-art/serramenti-persiane-cover.jpg",
    pdf_cover_text_vertical: "bottom", pdf_cover_overlay_opacity: 75,
    chi_siamo_attivo: !!base.chi_siamo_testo?.trim(), chi_siamo_titolo: "Dalle tue esigenze alla scelta delle persiane",
    // Company identity/proof is inherited, never fictitious years, ratings or jobs.
    chi_siamo_testo: base.chi_siamo_testo || "Un progetto chiaro parte dalle aperture della tua casa. In questa proposta trovi le esigenze da risolvere, le caratteristiche da confermare per ciascun vano e le lavorazioni previste. Materiali, finiture, ferramenta e condizioni vengono riepilogati prima dell'ordine.",
    chi_siamo_foto_url: base.chi_siamo_foto_url || null,
    esigenze_default: [
      { titolo: "Gestire luce e privacy", descrizione: "Definire quanto oscurare gli ambienti e se serve regolare le lamelle durante la giornata." },
      { titolo: "Aprire senza interferenze", descrizione: "Verificare spallette, davanzali, ringhiere e spazio di raccolta delle ante per ogni vano." },
      { titolo: "Rispettare il carattere della facciata", descrizione: "Concordare materiale, campione colore e vincoli dell'immobile prima della produzione." },
    ],
    soluzione_default: [
      { titolo: "Una scheda per ogni apertura", descrizione: "Misure, numero di ante, senso di apertura, lamelle e finitura identificano ciò che verrà fornito." },
      { titolo: "Ferramenta e posa coerenti con il supporto", descrizione: "Cardini, cerniere e fermapersiane si scelgono dopo la verifica del muro e delle condizioni esistenti." },
      { titolo: "Una consegna verificabile", descrizione: "Aperture, chiusure e fermi sono controllati insieme alle finiture concordate." },
    ],
    percorso_cliente: { attivo: true, titolo: "Dalla facciata al dettaglio", sottotitolo: "Quattro fasi per confermare scelte, posa e consegna. Date e disponibilità vengono concordate nell'offerta.", fasi: [
      { nome: "Rilievo", icona: "chiamata", step: ["Misure di ogni vano", "Supporti e ingombri", "Vincoli della facciata"] },
      { nome: "Scelte", icona: "proposta", step: ["Materiale e lamelle", "Campione colore", "Ferramenta e fermi"] },
      { nome: "Conferma", icona: "produzione", step: ["Schede vano per vano", "Prezzo e condizioni", "Tempi concordati"] },
      { nome: "Consegna", icona: "montaggio", step: ["Posa e regolazione", "Prova delle aperture", "Uso e manutenzione"] },
    ] },
    garanzie: [
      { icona: "shield", titolo: "Garanzie documentate", descrizione: "Copertura, durata e limitazioni sono quelle riportate dal produttore e dalle condizioni applicabili. Nessuna durata aggiuntiva è presunta." },
      { icona: "tools", titolo: "Verifica della posa", descrizione: "Il controllo riguarda fissaggi, aperture, chiusure e funzionamento degli accessori previsti nella fornitura." },
      { icona: "refresh", titolo: "Manutenzione chiara", descrizione: "Pulizia, lubrificazione e verifiche periodiche seguono le istruzioni del modello scelto e le condizioni di esposizione." },
      { icona: "clock", titolo: "Assistenza da concordare", descrizione: "Referente, modalità di segnalazione e servizi successivi alla consegna vengono definiti nelle condizioni dell'offerta." },
    ],
    faq_items: [...(seed.faq_items || []),
      { domanda: "Posso conservare cardini e fissaggi esistenti?", risposta: "Solo dopo averne verificato stato, posizione e compatibilità con le nuove ante. Le sostituzioni necessarie devono essere indicate nell'offerta." },
      { domanda: "Come scelgo colore e materiale?", risposta: "Si confrontano campioni e schede del produttore, tenendo conto di esposizione e manutenzione. Verifica anche gli eventuali vincoli della facciata o del condominio." },
      { domanda: "Sono comprese rimozione e ripristino?", risposta: "Rimozione, trasporto, smaltimento e ripristino degli intonaci vanno riportati come lavorazioni esplicite. Non sono inclusi automaticamente." },
      { domanda: "Le immagini mostrano il prodotto definitivo?", risposta: "Le immagini illustrative aiutano a comprendere il risultato. Fanno riferimento alla fornitura solo le schede, i campioni e le specifiche approvate nell'offerta." },
    ],
    pdf_pagine_articolo_dedicate: true,
    render_disclaimer: "Le immagini generate con AI sono simulazioni illustrative. Non sostituiscono rilievo, schede prodotto, campioni e verifica tecnica. Misure, materiali e finiture definitive sono quelli confermati nell'offerta.",
    // Conditional pages stay supported, but no borrowed reviews or unrelated gallery.
    recensioni_attivo: true,
    pdf_pages_order: SR_PDF_PAGES_META.map(p => ({ id: p.id, visible: p.obbligatoria || enabled.has(p.id) })),
    pdf_blocchi: {
      ...seed.pdf_blocchi, modulo_edizione: 2, modulo_intervento: id, copertina_layout: "editoriale-v1",
      modulo_foto: [
        { url: "/module-art/serramenti-persiane-cover.jpg", nome: "Persiane sulla facciata · illustrativa" },
        { url: "/module-art/serramenti-persiane-dettaglio.jpg", nome: "Lamelle e ferramenta · illustrativa" },
        { url: "/module-art/serramenti-persiane-controlli.jpg", nome: "Tavola dei controlli · illustrativa" },
        { url: "/module-art/serramenti-persiane-protezione.jpg", nome: "Preparazione degli spazi · illustrativa" },
      ],
      comeFunziona: block("Come scegliere le tue *persiane*", "Luce, apertura e durata dipendono da un insieme di scelte: non dal solo colore. Questi sono i dettagli da confrontare.", [
        ["Materiale e finitura", "Legno, alluminio o altro materiale vengono identificati in scheda insieme al trattamento e al campione colore."],
        ["Lamelle o pannello", "Lamelle fisse, orientabili o scuri pieni cambiano il controllo della luce. La configurazione va specificata per vano."],
        ["Ante e apertura", "Numero di ante, verso e ingombri devono essere compatibili con facciata, davanzale e passaggi."],
        ["Ferramenta e fissaggi", "Cardini, cerniere, chiusure e fermi si scelgono in funzione del prodotto e del supporto reale."],
      ], "/module-art/serramenti-persiane-dettaglio.jpg"),
      protezione: block("Preparare la posa, *proteggere gli spazi*", "Le precauzioni e le opere provvisionali si definiscono in base a quota, accessi e condizioni della facciata. Le attività previste devono comparire nell'offerta.", [
        ["Accessi", "Concordare passaggi e aree di movimentazione; valutare gli accessi esterni prima di fissare la posa."],
        ["Superfici", "Individuare pavimenti, davanzali e finiture da proteggere durante le lavorazioni."],
        ["Rimozioni", "Definire la gestione degli oscuranti esistenti e dei materiali rimossi, quando inclusa."],
        ["Facciata", "Segnalare supporti deteriorati prima di fissare le ante; quantificare a parte gli eventuali ripristini."],
      ], "/module-art/serramenti-persiane-protezione.jpg"),
      controlli: block("La verifica, *vano per vano*", "La consegna comprende il riscontro della configurazione prevista. Eventuali anomalie si annotano prima di chiudere l'intervento.", [
        ["Corrispondenza", "Confronto di misure, colore, numero di ante e tipo di lamelle con le scelte approvate."],
        ["Movimento", "Verifica dell'apertura completa, delle interferenze e della regolazione delle ante."],
        ["Chiusure e fermi", "Prova di chiusure, fermapersiane e, quando presenti, meccanismi delle lamelle orientabili."],
        ["Fissaggi e finiture", "Controllo dei fissaggi previsti e riscontro visivo di finiture, urti o danneggiamenti."],
      ], "/module-art/serramenti-persiane-controlli.jpg"),
      documenti: block("Le informazioni da *conservare*", "La documentazione è riferita ai prodotti e alle lavorazioni effettivamente forniti. Gli adempimenti applicabili si verificano sul caso concreto.", [
        ["Riepilogo fornitura", "Elenco dei vani con configurazione, materiali, colori e accessori concordati."],
        ["Schede prodotto", "Identificazione del modello e documentazione tecnica disponibile del produttore."],
        ["Uso e manutenzione", "Istruzioni su pulizia, lubrificazione, utilizzo dei fermi e precauzioni in caso di vento."],
        ["Garanzie e assistenza", "Condizioni applicabili e contatto per segnalazioni, con eventuali servizi aggiuntivi indicati separatamente."],
      ]),
      diario: block("Le fasi del lavoro, *tracciabili*", "Se concordato, le fotografie documentano i punti utili al confronto prima e dopo la posa. Le immagini presenti qui non costituiscono un resoconto di un lavoro già eseguito.", [
        ["Prima", "Aperture esistenti, supporti, cardini e criticità rilevate."],
        ["Durante", "Fissaggi e dettagli che potrebbero risultare poco visibili a lavoro concluso."],
        ["Dopo", "Ogni vano con ante aperte e chiuse e dettaglio della finitura scelta."],
        ["Consegna", "Eventuali riserve o regolazioni da completare riportate nel verbale, se previsto."],
      ]),
      pagina_percorso: { foto: ["/module-art/serramenti-persiane-cover.jpg"] },
      pagina_cta: { foto: ["/module-art/serramenti-persiane-cover.jpg"] },
    },
  };
  template.pdf_blocchi = completeModulePhotography(template.pdf_blocchi, "serramenti");
  template.pdf_blocchi = { ...template.pdf_blocchi, modulo_defaults: structuredClone(template.pdf_blocchi) };
  return template;
}

/** Explicit upgrade: only replace unchanged v1 defaults, retain user edits. No writes here. */
export function upgradeSerramentiModuleTemplate(saved: Partial<SrTemplatePdfRow>, base: Partial<SrTemplatePdfRow>, id: SerramentiTemplateModuleId) {
  const old = createSerramentiModuleTemplate(base, id);
  const next = createFullSerramentiTemplate(base, id);
  const merged = { ...saved } as Record<string, unknown>;
  // The first local edition accidentally stored fractional instead of percentage opacity.
  if (saved.pdf_cover_overlay_opacity === 0.65) merged.pdf_cover_overlay_opacity = next.pdf_cover_overlay_opacity;
  for (const [key, value] of Object.entries(next)) {
    if (!(key in saved) || JSON.stringify(saved[key as keyof SrTemplatePdfRow]) === JSON.stringify(old[key as keyof SrTemplatePdfRow])) merged[key] = value;
  }
  // Merge blocks separately so a custom photo or heading does not discard all new sections.
  const blocks = { ...(saved.pdf_blocchi || {}) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(next.pdf_blocchi || {})) {
    // Updating the text/photo edition must not silently redesign a saved cover.
    if (key === "copertina_layout") continue;
    if (!(key in blocks) || JSON.stringify(blocks[key]) === JSON.stringify((old.pdf_blocchi as Record<string, unknown> | null)?.[key])) blocks[key] = value;
  }
  blocks.modulo_edizione = 2;
  merged.pdf_blocchi = blocks;
  return merged as Partial<SrTemplatePdfRow>;
}
