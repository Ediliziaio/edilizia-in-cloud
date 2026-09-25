import { completeModulePhotography } from "./modulePhotography";
import type { TetTemplatePdf } from "@/types/tetti";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";

type Pair = readonly [string, string];
const list = (pairs: readonly Pair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
const cover = "/module-art/tetti.jpg";
const insulation = "/pdf-stock/tetti/isolamento.jpg";
const preparation = "/pdf-stock/tetti/protezione.jpg";
const block = (titolo: string, intro: string, pairs: readonly Pair[], photo?: string): ContenutoBlocco & { senzaFoto: boolean } => ({
  occhiello: "RIFACIMENTO DEL TETTO", titolo, intro,
  voci: pairs.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] })),
  escluse: [], foto: photo ? [photo] : [], senzaFoto: !photo,
  nota: photo ? "Immagine illustrativa, non un cantiere eseguito dall'azienda né una specifica esecutiva. Materiali e opere sono quelli del progetto e del computo confermati." : null,
});

/** Authored on the original Tetti schema: no simplified replacement document. */
export function completeRifacimentoTemplate(seed: TetTemplatePdf, base: TetTemplatePdf): TetTemplatePdf {
  const template: TetTemplatePdf = {
    ...seed,
    cover_title: "Una nuova copertura.\nOgni scelta, chiara.",
    cover_subtitle: "Dal supporto al manto: materiali, lavorazioni e dettagli raccolti in una proposta leggibile.",
    cover_eyebrow: "RIFACIMENTO DEL TETTO", cover_image_url: cover,
    cover_bg_color: "#392e28", cover_overlay_opacity: 0.74, cover_title_size: 36, cover_subtitle_size: 13,
    color_primary: base.color_primary || "#563e32", color_accent: base.color_accent || "#b66b42",
    show_chi_siamo: !!base.chi_siamo?.trim(),
    condizioni_legali_testo: null, condizioni_legali_attivo: false, modulo_recesso_attivo: false,
    esigenze: list([
      ["Conoscere il tetto esistente", "Distinguere lo stato del manto, degli strati e del supporto, indicando le parti accessibili e gli approfondimenti necessari."],
      ["Definire la nuova copertura", "Confrontare materiali, finiture e stratigrafia previsti dal progetto, senza attribuire prestazioni al solo aspetto delle tegole."],
      ["Organizzare i lavori sulla casa", "Chiarire accessi, fasi, protezioni temporanee e interferenze con l'uso dell'immobile prima dell'avvio."],
    ]),
    soluzione: list([
      ["Un perimetro verificato", "La proposta identifica falde, superfici, punti singolari e rimozioni comprese. La struttura non si considera sostituita se non descritta."],
      ["Strati e dettagli riconoscibili", "Supporto, isolante quando previsto, membrane, manto e raccordi sono descritti secondo la soluzione progettata."],
      ["Un computo collegato al programma", "Quantità e lavorazioni si leggono insieme alle fasi del cantiere, alle esclusioni e alla gestione delle varianti."],
    ]),
    usp: list([
      ["Offerta leggibile", "Ogni voce identifica ciò che viene rimosso, conservato o realizzato, con quantità e criteri di misura."],
      ["Dettagli prima della chiusura", "Le verifiche e le fotografie concordate documentano i punti che saranno coperti dagli strati successivi."],
      ["Decisioni tracciate", "Le condizioni non visibili e le varianti vengono condivise con ambito, prezzo e tempi prima dell'esecuzione."],
    ]),
    percorso: list([
      ["01 · Rilievo e progetto", "Si definiscono stato del tetto, falde interessate, soluzione tecnica e approfondimenti necessari."],
      ["02 · Scelte e conferma", "Si approvano materiali, dettagli, computo, esclusioni e programma indicativo dell'intervento."],
      ["03 · Esecuzione per fasi", "Rimozioni, supporti, strati e finiture seguono il progetto e le condizioni effettive di cantiere."],
      ["04 · Riscontro e consegna", "Si verificano le opere eseguite e si condividono documenti, riserve e indicazioni di manutenzione."],
    ]),
    garanzie: list([
      ["Materiali identificati", "I prodotti impiegati sono riconoscibili nelle schede e nella documentazione disponibile della fornitura."],
      ["Ambito documentato", "Il riepilogo distingue opere nuove, elementi conservati e varianti concordate durante i lavori."],
      ["Condizioni esplicite", "Coperture, durate e modalità di assistenza sono quelle dei documenti applicabili; non si presumono garanzie aggiuntive."],
      ["Manutenzione conoscibile", "Le indicazioni di cura e controllo seguono i materiali e le caratteristiche della copertura realizzata."],
    ]),
    cronoprogramma: [
      { fase: "Definizione", durata: "Da concordare", descrizione: "Rilievo, progetto, materiali e perimetro economico confermati." },
      { fase: "Preparazione", durata: "Da concordare", descrizione: "Approvvigionamenti, accessi, protezioni e organizzazione delle aree interessate." },
      { fase: "Rifacimento", durata: "Da concordare", descrizione: "Rimozioni, verifiche del supporto, strati previsti, manto e raccordi per fasi." },
      { fase: "Consegna", durata: "Da concordare", descrizione: "Riscontro delle opere, completamenti e documenti. Il calendario tiene conto delle condizioni meteo." },
    ],
    faq: [
      { domanda: "Il rifacimento comprende anche la struttura?", risposta: "Soltanto se descritta nelle voci e nel progetto. La verifica del supporto non equivale automaticamente alla sostituzione o al consolidamento della struttura." },
      { domanda: "Isolamento e ventilazione sono sempre compresi?", risposta: "No. Materiali, spessori e strati devono essere previsti dalla soluzione progettata e dal computo. Le immagini illustrative non aggiungono lavorazioni alla fornitura." },
      { domanda: "Posso scegliere tegole e finiture?", risposta: "Le alternative si valutano rispetto a progetto, compatibilità, vincoli e disponibilità. Prodotto, colore e campione concordato devono essere identificati prima dell'ordine." },
      { domanda: "Come viene gestita la casa mentre il tetto è aperto?", risposta: "Accessi, fasi e protezioni temporanee si concordano in base all'immobile e alle lavorazioni. Le modalità organizzative e le eventuali limitazioni d'uso devono essere esplicite." },
      { domanda: "Cosa succede se emergono parti deteriorate?", risposta: "Si documenta la condizione riscontrata e si valuta la soluzione con i soggetti competenti. Le opere aggiuntive si definiscono con prezzo e tempi prima di procedere." },
      { domanda: "Grondaie, camini e lucernari sono inclusi?", risposta: "Solo per i tratti, prodotti e raccordi elencati. Conservazione, sostituzione e adattamento devono essere distinti per ogni punto interessato." },
      { domanda: "Quanto durano i lavori?", risposta: "Il programma dipende da superfici, accessi, materiali, fasi e meteo. Il cronoprogramma indica quanto concordato; nessuna durata fissa è presunta dal modello." },
      { domanda: "Quali documenti riceverò?", risposta: "Quelli concordati e applicabili alle opere eseguite: riepilogo, materiali, verifiche, eventuali foto reali e indicazioni di manutenzione. I contenuti illustrativi restano separati dai rilievi del tuo tetto." },
    ],
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(c => ({ chiave: c.chiave, visibile: true })),
    pdf_blocchi: {
      ...seed.pdf_blocchi, modulo_edizione: 2,
      modulo_foto: [
        { url: cover, nome: "Copertura in tegole · illustrativa" },
        { url: insulation, nome: "Materiale isolante · illustrativa" },
        { url: preparation, nome: "Organizzazione del cantiere · illustrativa" },
      ],
      comeFunziona: block("Il tetto è un *insieme di scelte*.", "La stratigrafia è definita dal progetto. Questa pagina spiega le famiglie di elementi: non rappresenta una sezione esecutiva né rende inclusi gli strati non elencati.", [
        ["Supporto", "Stato e idoneità si verificano prima di definire preparazioni, ripristini o opere strutturali specifiche."],
        ["Strati funzionali", "Isolamento, membrane e altri strati si identificano solo quando previsti, con materiali e caratteristiche del progetto."],
        ["Manto", "Tegole, lastre o altri elementi, finitura e fissaggi devono corrispondere alla soluzione approvata."],
        ["Punti singolari", "Colmi, bordi, attraversamenti e raccordi si coordinano con il sistema scelto e le opere incluse."],
      ], insulation),
      compreso: {
        ...block("Cosa comprende *questa proposta*.", "Le voci del computo definiscono quantità, materiali e ambito economico. Le descrizioni generali e le immagini non estendono ciò che è incluso.", [
          ["Rimozioni", "Strati ed elementi da rimuovere, movimentazione e gestione dei materiali nei limiti descritti."],
          ["Preparazioni e strati", "Trattamenti del supporto e nuovi componenti effettivamente previsti dal progetto e dal computo."],
          ["Manto e raccordi", "Superfici di copertura e punti singolari identificati, con finiture e accessori concordati."],
          ["Organizzazione", "Accessi, opere provvisionali e protezioni soltanto secondo quanto elencato e quantificato."],
        ]),
        escluse: [
          { titolo: "Strutture e bonifiche", testo: "Consolidamenti, sostituzioni strutturali e bonifiche non descritte richiedono valutazioni e voci dedicate.", icona: "verifica" },
          { titolo: "Altre opere", testo: "Impianti, finiture interne e interventi esterni al perimetro non sono compresi salvo indicazioni esplicite.", icona: "documenti" },
        ],
      },
      protezione: block("Organizzare le fasi. *Proteggere gli spazi*.", "Accessi e misure del cantiere sono definiti dai soggetti competenti secondo l'immobile e le attività. L'immagine non sostituisce la progettazione delle protezioni.", [
        ["Accessi", "Concordare percorsi, mezzi e disponibilità degli spazi necessari alle lavorazioni."],
        ["Aree sottostanti", "Identificare passaggi, superfici e parti dell'immobile interessate dal cantiere."],
        ["Fasi aperte", "Programmare le lavorazioni e le protezioni temporanee in relazione alle condizioni meteo effettive."],
        ["Materiali", "Definire movimentazione, deposito e gestione delle rimozioni comprese nell'offerta."],
      ], preparation),
      controlli: block("I dettagli contano. *Anche prima di chiudere*.", "I controlli previsti seguono progetto e lavorazioni. Le prove ulteriori vanno definite per modalità e perimetro, senza prometterle in modo generico.", [
        ["Supporto", "Registrare lo stato riscontrato e le preparazioni eseguite prima degli strati successivi."],
        ["Materiali e continuità", "Confrontare prodotti e dettagli realizzati con la soluzione approvata, nei punti accessibili alle verifiche."],
        ["Manto e raccordi", "Riscontrare elementi, fissaggi e punti singolari previsti, prima della consegna."],
        ["Riserve", "Annotare completamenti, variazioni e parti non verificate nel riepilogo finale."],
      ]),
      documenti: block("Le scelte del tuo tetto, *da conservare*.", "La documentazione deve permettere di riconoscere ciò che è stato realizzato e come richiedere assistenza.", [
        ["Opere eseguite", "Perimetro, quantità e varianti concordate, con riferimenti al computo confermato."],
        ["Materiali", "Prodotti e schede disponibili e applicabili ai componenti effettivamente utilizzati."],
        ["Verifiche", "Controlli e prove concordate, con esiti, riserve ed eventuali approfondimenti residui."],
        ["Cura e assistenza", "Indicazioni di manutenzione, condizioni applicabili e contatti per le segnalazioni."],
      ]),
      diario: block("Il rifacimento, *fase per fase*.", "Le foto del cantiere, se concordate, documentano le opere reali. Non vengono sostituite dalle immagini illustrative del modello.", [
        ["Prima", "Falde, supporti accessibili e punti singolari individuati durante il rilievo."],
        ["Durante", "Preparazioni, strati e dettagli che non saranno più visibili dopo la chiusura del manto."],
        ["Dopo", "Copertura e raccordi ultimati nelle aree previste, con eventuali parti da completare annotate."],
      ]),
      pagina_computo: { senzaFoto: true }, pagina_compreso: { senzaFoto: true }, pagina_chiusura: { foto: [cover] },
    },
  };
  template.pdf_blocchi = completeModulePhotography(template.pdf_blocchi, "tetti");
  template.pdf_blocchi = { ...template.pdf_blocchi, modulo_defaults: structuredClone(template.pdf_blocchi) };
  return template;
}
