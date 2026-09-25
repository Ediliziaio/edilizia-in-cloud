import { completeModulePhotography } from "./modulePhotography";
import type { FvTemplate } from "@/components/fotovoltaico/FotovoltaicoTemplateEditor";
import { FV_PDF_PAGES_META } from "@/lib/fotovoltaico/pdfPages";
import { FV_ACCUMULO_PAGINE_NON_APPLICABILI } from "../../../supabase/functions/_shared/fvIntervento";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { FV_EDITORIAL, type FvEditorialId } from "./fvEditorialContent";
export const FULL_FV_MODULES = ["accumulo", "nuovo", "ampliamento", "componenti", "manutenzione"] as const;
export type FullFvModuleId = typeof FULL_FV_MODULES[number];
export const isFullFvModuleId = (id: string): id is FullFvModuleId => FULL_FV_MODULES.some(value => value === id);
export const fvModuleTitle = (id: FullFvModuleId) => id === "accumulo" ? "Aggiunta sistema di accumulo" : FV_EDITORIAL[id].title;
export type FullFvTemplate = FvTemplate & { company_id: string; id: string };
type Entry = readonly [string, string];
const photo = "/module-art/fotovoltaico-accumulo-cover.jpg";
const block = (titolo: string, intro: string, items: readonly Entry[], image?: string): ContenutoBlocco & { senzaFoto: boolean } => ({
  occhiello: "ACCUMULO SU IMPIANTO ESISTENTE", titolo, intro,
  voci: items.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] })),
  escluse: [], foto: image ? [image] : [], senzaFoto: !image,
  nota: image ? "Immagine illustrativa. Apparecchiature e collocazione definitive sono quelle confermate nel progetto." : null,
});

export function createFullFvTemplate(base: FvTemplate, companyId: string, id: FullFvModuleId): FullFvTemplate {
  if (id !== "accumulo") return createEditorialFvTemplate(base, companyId, id);
  const t: FullFvTemplate = {
    ...structuredClone(base), id: `local-fotovoltaico-${id}`, company_id: companyId,
    pdf_cover_hero: "Più spazio alla tua\nenergia solare.",
    pdf_cover_subhero: "Un sistema di accumulo da integrare nel tuo impianto esistente.",
    pdf_cover_subhero_template: "Accumulo {accumulo_kwh}: compatibilità, componenti e lavorazioni da confermare per {indirizzo}.",
    pdf_cover_eyebrow: "AGGIUNTA SISTEMA DI ACCUMULO", pdf_cover_image_url: photo,
    pdf_cover_overlay_opacity: 70, pdf_cover_bg_color: "#173c40", pdf_cover_text_color: "#ffffff",
    pdf_cover_text_vertical: "bottom", pdf_cover_text_align: "left", pdf_cover_title_size: 34,
    pdf_cover_subtitle_size: 12, pdf_cover_eyebrow_size: 10, pdf_cover_overlay_style: "gradient",
    pdf_cover_show_decoration: false, pdf_cover_show_client_card: true,
    colore_primario: base.colore_primario || "#173c40", colore_accento: base.colore_accento || "#bb8438",
    presentazione_impresa_html: base.presentazione_impresa_html || "",
    chi_siamo_titolo: "La tua integrazione, con un referente chiaro",
    foto_team_url: base.foto_team_url || null,
    recensioni: [], cantieri_galleria: [], gallery_lavori: [], certificazioni: [],
    percorso_cliente_intro: "<p>Prima di scegliere la batteria si verificano inverter, configurazione esistente, spazio disponibile e profilo dei consumi. L'offerta riguarda l'integrazione descritta, non la fornitura di un nuovo impianto fotovoltaico completo.</p>",
    consulente_descrizione_default: "Confronta con il referente la compatibilità, le dotazioni incluse e le condizioni prima di confermare l'integrazione.",
    render_disclaimer: "Immagini illustrative: non identificano una marca, un modello o un'installazione già realizzata. Schede prodotto e progetto definiscono la fornitura.",
    valore_proposta_html: "<p><strong>Solo ciò che aggiungiamo.</strong> Batteria, dispositivi e lavorazioni sono elencati separatamente. L'impianto esistente resta il punto di partenza e non è incluso come nuova fornitura.</p><p>Capacità nominale e utile, potenza disponibile, compatibilità e funzioni di emergenza vanno confermate nelle schede. Non sono inclusi automaticamente nuovi pannelli, sostituzione dell'inverter, backup o adeguamenti estranei alle voci dell'offerta.</p>",
    garanzie_conversione: [
      { icona: "battery", titolo: "Batteria identificata", descrizione: "Modello, capacità, condizioni di utilizzo e garanzia fanno riferimento alla documentazione del produttore scelto." },
      { icona: "tools", titolo: "Compatibilità verificata", descrizione: "Inverter, dispositivi di controllo e componenti esistenti vengono valutati prima di confermare la configurazione." },
      { icona: "shield", titolo: "Ambito dell'integrazione", descrizione: "La proposta distingue le opere nuove dai componenti già presenti, senza estendere implicitamente le garanzie all'intero impianto." },
      { icona: "clock", titolo: "Uso e assistenza", descrizione: "Istruzioni, contatto per le segnalazioni ed eventuali servizi successivi vengono concordati e documentati." },
    ],
    usp: [
      { titolo: "Partiamo dai dati esistenti", descrizione: "Documentazione dell'inverter e consumi aiutano a scegliere una configurazione pertinente." },
      { titolo: "Distinguiamo capacità e potenza", descrizione: "Energia accumulabile e potenza erogabile sono dati diversi, da leggere nelle schede del sistema." },
      { titolo: "Risparmi senza scorciatoie", descrizione: "Il beneficio aggiuntivo si valuta rispetto all'impianto già presente, non rispetto a una casa senza fotovoltaico." },
    ],
    cronoprogramma: [
      { fase: "Verifica dell'impianto esistente", durata: "Da concordare", descrizione: "Modello dell'inverter, configurazione, documentazione disponibile e spazio per la batteria." },
      { fase: "Scelta e conferma", durata: "Da concordare", descrizione: "Capacità utile, potenza, dispositivi necessari, dotazioni incluse e condizioni." },
      { fase: "Installazione e configurazione", durata: "Da concordare", descrizione: "Posizionamento e integrazione secondo progetto e indicazioni dei produttori." },
      { fase: "Verifica e consegna", durata: "Da concordare", descrizione: "Controlli previsti, configurazione del monitoraggio e documenti concordati." },
    ],
    faq_items: [
      { domanda: "Posso aggiungere qualsiasi batteria?", risposta: "No. Modello dell'inverter, sistema di gestione e configurazione esistente devono essere compatibili con la soluzione proposta." },
      { domanda: "La batteria aumenta la produzione dei pannelli?", risposta: "Non genera energia solare aggiuntiva: può conservare parte dell'energia disponibile per usarla in un altro momento, nei limiti del sistema." },
      { domanda: "Avrò corrente durante un blackout?", risposta: "Non automaticamente. La funzione di emergenza richiede una configurazione dedicata e deve essere espressamente descritta e verificata nell'offerta." },
      { domanda: "Quanto risparmierò in più?", risposta: "Serve un confronto tra la situazione attuale e quella con accumulo, con ipotesi sui consumi, sulle tariffe e sul funzionamento del sistema. Il risparmio dell'intero fotovoltaico non coincide con quello aggiuntivo della batteria." },
      { domanda: "È compreso un nuovo inverter?", risposta: "Solo se elencato tra i componenti. Un'eventuale sostituzione o integrazione deve risultare nelle voci e nel prezzo." },
      { domanda: "Dove verrà installata?", risposta: "Collocazione, accessi e condizioni ambientali vengono verificati rispetto al prodotto e al progetto. La foto del modello è soltanto illustrativa." },
      { domanda: "Quali documenti riceverò?", risposta: "La documentazione applicabile all'integrazione, le schede e le istruzioni disponibili dei prodotti e i riferimenti concordati per monitoraggio e assistenza." },
    ],
    pdf_cta_finale_titolo: "Confermiamo la\nconfigurazione giusta.",
    pdf_cta_finale_testo: "<p>Prima della conferma, controlliamo insieme impianto esistente, capacità e potenza della batteria, eventuale backup, componenti inclusi e condizioni dell'offerta.</p>",
    condizioni_legali_attivo: false, condizioni_legali_testo: "", modulo_recesso_attivo: false,
    urgenza_attiva: false, urgenza_titolo: "", urgenza_descrizione: "", noleggio_operativo_attivo: false, noleggio_note_legali: "",
    pdf_pages_order: FV_PDF_PAGES_META.map(p => ({ id: p.id, visible: !FV_ACCUMULO_PAGINE_NON_APPLICABILI.has(p.id) })),
    pdf_blocchi: {
      modulo_intervento: "accumulo", modulo_edizione: 2,
      modulo_foto: [{ url: photo, nome: "Sistema di accumulo · illustrativa" }],
      testata_garanzie: { occhiello: "COMPATIBILITÀ E ASSISTENZA", titolo: "Le basi di una\nscelta consapevole.", intro: "Componenti identificati, verifiche preliminari e un ambito definito." },
      testata_domande: { occhiello: "PRIMA DI CONFERMARE", titolo: "Le risposte\nsull'accumulo.", intro: "Le differenze che contano quando integri un impianto già presente." },
      comeFunziona: block("L'energia disponibile,\nnel momento utile.", "L'accumulo si integra con l'impianto esistente per gestire parte dell'energia disponibile. Il risultato dipende dalla compatibilità e dalle condizioni d'uso.", [
        ["Capacità", "Nominale e utile non sono la stessa cosa: la fornitura riporta i valori del sistema scelto."],
        ["Potenza", "La potenza di carica e scarica determina ciò che il sistema può gestire istante per istante."],
        ["Compatibilità", "Inverter e controllo devono essere compatibili; eventuali dispositivi aggiuntivi vanno elencati."],
        ["Limiti", "Riserva, perdite e modalità d'uso incidono sul risultato. Il backup è una dotazione distinta."],
      ], photo),
      protezione: block("Uno spazio adatto\nal sistema scelto.", "Collocazione e installazione si definiscono dopo la verifica tecnica. Le immagini non sostituiscono il progetto o le istruzioni del produttore.", [
        ["Locale e accessi", "Verificare spazi, accessibilità e condizioni del luogo rispetto al prodotto proposto."],
        ["Superfici", "Individuare le aree interessate dalla movimentazione e le protezioni previste."],
        ["Impianto esistente", "Pianificare le lavorazioni e le eventuali interruzioni da comunicare al cliente."],
        ["Perimetro", "Eventuali adeguamenti ulteriori si quantificano separatamente prima dell'esecuzione."],
      ]),
      controlli: block("Verifiche sull'integrazione,\nnon promesse generiche.", "Il riscontro finale riguarda la configurazione prevista, con le verifiche applicabili ai componenti installati.", [
        ["Componenti", "Confrontare modelli, capacità e dispositivi con la fornitura concordata."],
        ["Comunicazione", "Verificare l'interazione prevista tra accumulo, inverter e sistema di controllo."],
        ["Monitoraggio", "Controllare la lettura dei dati e la configurazione degli accessi concordati."],
        ["Funzioni aggiuntive", "Verificare solo le funzioni previste, distinguendo l'eventuale backup dall'uso ordinario."],
      ]),
      documenti: block("I documenti\ndella tua integrazione.", "La consegna documentale si riferisce all'intervento descritto. Pratiche e adempimenti applicabili vanno verificati sul caso concreto.", [
        ["Fornitura", "Elenco e identificazione dei componenti nuovi e delle opere eseguite."],
        ["Prodotti", "Schede disponibili, condizioni di garanzia e istruzioni dei produttori."],
        ["Intervento", "Documentazione tecnica e dichiarazioni previste per l'integrazione realizzata."],
        ["Uso", "Indicazioni per monitoraggio, manutenzione e segnalazioni al referente concordato."],
      ]),
      diario: block("L'integrazione,\nresa riconoscibile.", "Le fotografie concordate documentano le nuove parti e il loro contesto. Non vengono presentate immagini illustrative come prove di lavori eseguiti.", [
        ["Stato iniziale", "Configurazione esistente e posizione prevista prima dell'intervento."],
        ["Lavorazioni", "Dettagli utili delle sole opere comprese, dove documentabili."],
        ["Consegna", "Sistema completato e riferimenti dei componenti installati."],
      ]),
      ...Object.fromEntries(["garanzie", "bollette", "componenti", "costi", "cassa", "piano", "faq", "risparmio", "produzione", "recensioni"].map(p => [`pagina_${p}`, { senzaFoto: true }])),
      pagina_decisione: { foto: [photo] },
    },
  };
  t.pdf_blocchi = completeModulePhotography(t.pdf_blocchi, "fotovoltaico");
  t.pdf_blocchi = { ...t.pdf_blocchi, modulo_defaults: structuredClone(t.pdf_blocchi) };
  return t;
}

function createEditorialFvTemplate(base: FvTemplate, companyId: string, id: FvEditorialId): FullFvTemplate {
  const c = FV_EDITORIAL[id];
  const t = createFullFvTemplate(base, companyId, "accumulo");
  const editorialBlock = (title: string, intro: string, entries: readonly Entry[], image?: string) => ({ ...block(title, intro, entries, image), occhiello: c.title.toUpperCase() });
  Object.assign(t, {
    id: `local-fotovoltaico-${id}`, pdf_cover_hero: c.hero, pdf_cover_subhero: c.subtitle,
    pdf_cover_subhero_template: "", pdf_cover_eyebrow: c.title.toUpperCase(), pdf_cover_image_url: c.cover,
    chi_siamo_titolo: "Un referente, dalla scelta alla consegna",
    percorso_cliente_intro: `<p>${c.subtitle}</p>`, valore_proposta_html: `<p>${c.scope}</p>`,
    consulente_descrizione_default: "Confronta con il referente prodotti, lavorazioni, responsabilità e condizioni prima di confermare.",
    usp: c.checks.slice(0, 3).map(([titolo, descrizione]) => ({ titolo, descrizione })),
    cronoprogramma: c.phases.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    faq_items: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })),
    garanzie_conversione: [
      { icona: "shield", titolo: "Perimetro riconoscibile", descrizione: c.scope },
      { icona: "tools", titolo: c.checks[2][0], descrizione: c.checks[2][1] },
      { icona: "clock", titolo: "Programma concordato", descrizione: c.phases[2][1] },
      { icona: "document", titolo: "Consegna documentata", descrizione: c.phases[3][1] },
    ],
    pdf_cta_finale_titolo: "La tua proposta.\nIl prossimo passo.",
    pdf_cta_finale_testo: `<p>Rivediamo insieme ${c.title.toLowerCase()}: attività, componenti, prezzo e condizioni. Le parti non elencate restano da concordare.</p>`,
  });
  t.pdf_blocchi = {
    modulo_intervento: id, modulo_edizione: 2,
    modulo_foto: [{ url: c.cover, nome: `${c.title} · copertina illustrativa` }, { url: c.detail, nome: "Dettaglio · immagine illustrativa" }, { url: "/pdf-stock/fotovoltaico/controllo-termografico.jpg", nome: "Controllo strumentale · solo se previsto, illustrativa" }, { url: "/pdf-stock/fotovoltaico/sopralluogo.jpg", nome: "Sopralluogo · illustrativa" }, { url: "/pdf-stock/fotovoltaico/consegna-app.jpg", nome: "Spiegazione e consegna · illustrativa" }].filter((x, i, all) => all.findIndex(y => y.url === x.url) === i),
    comeFunziona: editorialBlock(c.title, c.subtitle, c.checks, c.detail),
    protezione: editorialBlock("Prima delle lavorazioni.\nSpazi e responsabilità.", c.scope, [c.checks[0], ["Accessi e aree interessate", "Concordare accessi, mezzi e aree di deposito riferiti alle attività descritte."], ["Interruzioni e interferenze", "Comunicare le interruzioni previste e coordinare le lavorazioni con l'utilizzo dell'immobile."], ["Parti da conservare", "Distinguere le componenti interessate dalle parti esistenti che restano escluse."]], "/pdf-stock/fotovoltaico/sopralluogo.jpg"),
    controlli: editorialBlock("Dalle scelte ai riscontri.", "La verifica riguarda ciò che è effettivamente compreso, con evidenza degli eventuali limiti.", c.checks),
    documenti: editorialBlock("Un dossier da conservare.", "Documenti pertinenti all'intervento, non certificazioni o coperture presunte. Monitoraggio e app soltanto se inclusi.", [["Riepilogo delle attività", c.scope], ["Prodotti e materiali", "Identificare i componenti forniti con schede, istruzioni e condizioni applicabili."], ["Riscontri e limiti", "Annotare verifiche svolte, parti non controllate ed eventuali attività residue."], ["Referente e assistenza", "Conservare i contatti e distinguere assistenza inclusa da servizi aggiuntivi."]], "/pdf-stock/fotovoltaico/consegna-app.jpg"),
    diario: editorialBlock("Le immagini del tuo intervento.", "Se concordata, la documentazione fotografica accompagna le fasi reali. Le foto illustrative del modello non sono lavori dell'azienda.", [["Prima", c.phases[0][1]], ["Durante", c.phases[2][1]], ["Consegna", c.phases[3][1]]]),
    testata_garanzie: { occhiello: "IMPEGNI E ASSISTENZA", titolo: "Chiarezza,\nanche dopo l'intervento.", intro: "Perimetro, prodotti e riferimenti da confermare nella proposta." },
    testata_domande: { occhiello: "LE TUE DOMANDE", titolo: "Prima di scegliere.", intro: c.title },
    ...Object.fromEntries(["garanzie", "componenti", "costi", "piano", "faq", "recensioni", "decisione"].map(p => [`pagina_${p}`, { senzaFoto: true }])),
  };
  if (id === "componenti") {
    t.pdf_blocchi.protezione = { ...(t.pdf_blocchi.protezione as ContenutoBlocco), foto: ["/pdf-stock/fotovoltaico/inverter-batteria-garage.jpg"] };
    t.pdf_blocchi.pagina_decisione = { foto: [c.cover], senzaFoto: false };
    t.pdf_blocchi.modulo_foto = (t.pdf_blocchi.modulo_foto as { url: string; nome: string }[]).filter(photo => !["/pdf-stock/fotovoltaico/controllo-termografico.jpg", "/pdf-stock/fotovoltaico/sopralluogo.jpg"].includes(photo.url));
  }
  t.pdf_blocchi = completeModulePhotography(t.pdf_blocchi, "fotovoltaico");
  t.pdf_blocchi.modulo_defaults = structuredClone(t.pdf_blocchi);
  return t;
}
