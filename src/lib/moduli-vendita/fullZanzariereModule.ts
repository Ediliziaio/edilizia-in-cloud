import { completeModulePhotography } from "./modulePhotography";
import type { SrTemplatePdfRow } from "@/types/serramenti";
import { SR_PDF_PAGES_META } from "@/types/serramenti";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";

type Pair = readonly [string, string];
const list = (items: readonly Pair[]) => items.map(([titolo, descrizione]) => ({ titolo, descrizione }));
const cover = "/module-art/serramenti-zanzariere-cover.jpg";
const block = (titolo: string, intro: string, items: readonly Pair[]): ContenutoBlocco & { senzaFoto: boolean } => ({
  occhiello: "ZANZARIERE SU MISURA", titolo, intro,
  voci: items.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] })),
  foto: [], senzaFoto: true, escluse: [], nota: null,
});

/** Original Serramenti document, with every editorial page authored for insect screens. */
export function completeZanzariereTemplate(seed: Partial<SrTemplatePdfRow>, base: Partial<SrTemplatePdfRow>): Partial<SrTemplatePdfRow> {
  const enabled = new Set(["chi_siamo", "proposta", "come_funziona", "macro_dedicate", "linee_dedicate", "render", "articoli_dedicati", "allegato_tecnico", "investimento", "percorso", "protezione", "controlli", "documenti", "diario", "garanzie", "gallery_lavori", "recensioni", "faq", "cta", "condizioni"]);
  const template: Partial<SrTemplatePdfRow> = {
    ...seed,
    pdf_cover_hero: "Apri la casa.\nScegli la tua protezione.",
    pdf_cover_subhero: "Zanzariere su misura per vivere aperture e passaggi con più tranquillità.",
    pdf_cover_eyebrow: "ZANZARIERE · PROPOSTA SU MISURA",
    pdf_cover_image_url: cover, pdf_cover_text_vertical: "bottom", pdf_cover_overlay_opacity: 75,
    pdf_font_family: base.pdf_font_family || "helvetica",
    chi_siamo_attivo: !!base.chi_siamo_testo?.trim(), chi_siamo_titolo: "Una soluzione per ogni apertura",
    chi_siamo_testo: base.chi_siamo_testo || "Partiamo da come usi gli spazi: una finestra, una portafinestra molto frequentata e un accesso al giardino richiedono valutazioni diverse. La proposta associa a ciascun vano un sistema di apertura, una rete e una finitura da confermare prima dell'ordine.",
    chi_siamo_foto_url: base.chi_siamo_foto_url || null,
    esigenze_default: list([
      ["Aprire mantenendo una barriera agli insetti", "Identificare i vani da proteggere e verificare la chiusura del sistema sui lati. La scelta della rete dipende dall'uso e dal prodotto disponibile."],
      ["Passare senza manovre scomode", "Valutare frequenza di passaggio, facilità di presa, ingombro della guida e necessità degli utilizzatori."],
      ["Integrare la zanzariera nell'infisso", "Controllare lo spazio tra serramento e oscurante, il supporto di fissaggio e la finitura dei profili."],
    ]),
    soluzione_default: list([
      ["Apertura scelta vano per vano", "Avvolgibile, plissettata, a battente o fissa: il sistema proposto è indicato nella scheda di ogni apertura."],
      ["Misure e componenti confermati", "Luce del vano, ingombri, rete, profili e comando vengono verificati prima dell'ordine. Non basta la misura del vetro."],
      ["Prova d'uso alla consegna", "Apertura, richiamo e chiusura si verificano con il sistema installato; vengono spiegate pulizia e precauzioni del modello."],
    ]),
    perche_noi_default: ["Un sistema scelto in base all'uso del vano", "Rete, colore e accessori identificati nella fornitura", "Funzionamento e manutenzione spiegati alla consegna"],
    percorso_cliente: { attivo: true, titolo: "Dal vano alla prova d'uso", sottotitolo: "Scelte semplici, confermate prima di ordinare. Tempi e disponibilità sono indicati nell'offerta.", fasi: [
      { nome: "Rilievo", icona: "chiamata", step: ["Misure del vano", "Ingombri e supporti", "Abitudini di passaggio"] },
      { nome: "Scelta", icona: "proposta", step: ["Sistema di apertura", "Rete e profili", "Colore e accessori"] },
      { nome: "Conferma", icona: "produzione", step: ["Schede per apertura", "Prezzo e condizioni", "Disponibilità e posa"] },
      { nome: "Consegna", icona: "montaggio", step: ["Fissaggio e regolazione", "Prova d'uso", "Pulizia e precauzioni"] },
    ] },
    garanzie: [
      { icona: "shield", titolo: "Prodotto identificato", descrizione: "Modello, rete e componenti sono quelli riportati nella fornitura e nella documentazione disponibile del produttore." },
      { icona: "tools", titolo: "Funzionamento verificato", descrizione: "Controllo di scorrimento, chiusura e fissaggi sulle aperture oggetto dell'intervento." },
      { icona: "refresh", titolo: "Cura della rete", descrizione: "Pulizia e modalità di utilizzo seguono le istruzioni del modello. Urti, animali e condizioni di esposizione richiedono precauzioni specifiche." },
      { icona: "clock", titolo: "Assistenza chiara", descrizione: "Durate, coperture, esclusioni e modalità di segnalazione sono quelle dei documenti applicabili, senza estensioni presunte." },
    ],
    faq_items: [...(seed.faq_items || []),
      { domanda: "La guida a pavimento è sempre assente?", risposta: "No. Altezza e ingombro dipendono dal sistema. Nelle portefinestre si valuta il passaggio e si verifica la guida del modello proposto prima della conferma." },
      { domanda: "La rete protegge anche da cadute o intrusioni?", risposta: "No. Una normale zanzariera non è una barriera anticaduta né un dispositivo antieffrazione. Non va usata come appoggio o protezione per bambini e animali." },
      { domanda: "Posso montarla insieme a persiane o avvolgibili?", risposta: "Va verificato lo spazio disponibile e il movimento dei prodotti esistenti. Eventuali adattamenti devono essere descritti e quotati." },
      { domanda: "È compresa una rete antipolline o rinforzata?", risposta: "Solo se il prodotto e le caratteristiche sono indicati in offerta e documentati dal produttore. Non sono prestazioni automatiche di qualsiasi rete." },
      { domanda: "Come pulisco rete e guide?", risposta: "Segui le istruzioni del modello installato. La consegna deve chiarire prodotti ammessi, modalità di pulizia e precauzioni per non danneggiare rete o meccanismo." },
    ],
    pdf_cta_finale_titolo: "Confermiamo le aperture,\npoi pensiamo alla posa.",
    pdf_cta_finale_passi: ["Controlla i vani e i sistemi proposti", "Conferma rete, finitura e accessori", "Concordiamo rilievo definitivo e installazione"],
    pdf_pagine_articolo_dedicate: true, recensioni_attivo: true,
    render_disclaimer: "Immagini illustrative, anche generate con AI. Non rappresentano necessariamente il prodotto fornito o un lavoro eseguito. Fanno fede misure, modello e specifiche confermati nell'offerta.",
    pdf_pages_order: SR_PDF_PAGES_META.map(p => ({ id: p.id, visible: p.obbligatoria || enabled.has(p.id) })),
    pdf_blocchi: {
      ...seed.pdf_blocchi, modulo_edizione: 2, modulo_intervento: "zanzariere", copertina_layout: "editoriale-v1",
      modulo_foto: [{ url: cover, nome: "Zanzariera plissettata · scena illustrativa" }],
      testata_domande: { occhiello: "PRIMA DELLA SCELTA", titolo: "Le risposte\nsulle zanzariere.", intro: "Apertura, passaggio e manutenzione: cosa chiarire prima dell'ordine." },
      testata_garanzie: { occhiello: "PRODOTTO E ASSISTENZA", titolo: "Specifiche chiare.\nUso consapevole.", intro: "Riferimenti e verifiche sui prodotti effettivamente forniti." },
      comeFunziona: block("Una zanzariera, *quattro scelte*.", "Il sistema adatto nasce dall'incontro tra vano, abitudini d'uso e caratteristiche documentate del prodotto.", [
        ["Apertura", "Verticale o laterale, plissettata, a battente o fissa: considera lo spazio e quanto spesso attraversi il vano."],
        ["Rete", "Materiale, trama ed eventuali caratteristiche aggiuntive vanno identificati nella scheda del modello."],
        ["Guide e comando", "Ingombri, altezza della guida e punto di presa devono essere compatibili con il passaggio e con chi usa il sistema."],
        ["Profili e fissaggi", "Colore, telaio e supporti si verificano insieme agli infissi e agli oscuranti già presenti."],
      ]),
      protezione: block("Preparare il vano, *rispettare le finiture*.", "La posa è circoscritta alle aperture elencate. Rimozioni e ripristini non diventano inclusi per il solo fatto di essere citati nel modello.", [
        ["Accessibilità", "Lasciare disponibili i vani e concordare lo spostamento di tende, arredi o accessori interferenti."],
        ["Supporti", "Verificare la possibilità di fissaggio; segnalare superfici deteriorate o non idonee prima di installare."],
        ["Finiture", "Concordare le protezioni necessarie per davanzali, pavimenti e infissi nelle zone interessate."],
        ["Preesistenze", "Definire se la rimozione delle vecchie zanzariere e la gestione dei materiali siano comprese nelle voci."],
      ]),
      controlli: block("La prova, *apertura per apertura*.", "Il riscontro finale riguarda la configurazione concordata, non prestazioni aggiuntive non documentate.", [
        ["Fornitura", "Confronto di vani, misure, colore e sistema di apertura con il riepilogo approvato."],
        ["Scorrimento", "Prova del movimento, del richiamo se presente e dell'assenza di interferenze con infissi e oscuranti."],
        ["Chiusura", "Riscontro della rete e dei bordi, della battuta e dell'aggancio previsti dal sistema."],
        ["Utilizzo", "Dimostrazione del comando e delle precauzioni, con annotazione delle eventuali regolazioni residue."],
      ]),
      documenti: block("Tutto ciò che serve, *anche dopo la posa*.", "Conserva i riferimenti del sistema installato per la manutenzione o l'eventuale sostituzione della rete.", [
        ["Elenco vani", "Associazione tra ogni apertura e il modello, la misura e la finitura forniti."],
        ["Schede", "Documentazione disponibile del produttore su rete, meccanismo e accessori previsti."],
        ["Istruzioni", "Modalità di apertura, pulizia, utilizzo in condizioni di vento e altre precauzioni del modello."],
        ["Assistenza", "Recapito per le segnalazioni e condizioni applicabili a prodotto e lavorazioni."],
      ]),
      diario: block("I dettagli del tuo intervento, *riconoscibili*.", "Se concordato, il diario raccoglie foto reali dei vani. Le immagini illustrative del modello non sostituiscono questa documentazione.", [
        ["Prima", "Vano, spazi disponibili e prodotti già presenti, con eventuali criticità annotate."],
        ["Durante", "Fissaggi e raccordi che risulteranno poco visibili al termine della posa."],
        ["Dopo", "Sistema aperto e chiuso per ogni vano e riscontro delle finiture concordate."],
      ]),
      pagina_percorso: { foto: [cover] }, pagina_cta: { foto: [cover] },
    },
  };
  template.pdf_blocchi = completeModulePhotography(template.pdf_blocchi, "serramenti");
  template.pdf_blocchi = { ...template.pdf_blocchi, modulo_defaults: structuredClone(template.pdf_blocchi) };
  return template;
}
