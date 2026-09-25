import type { TetEditorialContent } from "./fullTettiFactory";
const cover = "/module-art/tetti-lattoneria-cover.jpg";
const detail = "/module-art/tetti-riparazioni-cover.jpg";
export const lattoneriaContent: TetEditorialContent = {
  title: "Ogni tratto conta.\nOgni raccordo, anche.",
  subtitle: "Canali, pluviali e scossaline: materiali, sviluppi e lavorazioni in una proposta ordinata.",
  eyebrow: "GRONDAIE E LATTONERIA", cover,
  journeyPhoto: "/pdf-stock/comune/domande.jpg", closingPhoto: cover,
  images: [{ url: detail, name: "Raccordo metallico illustrativo" }],
  needs: [
    ["Identificare i tratti", "Distinguere canali di gronda, pluviali e raccordi da conservare, riparare o sostituire."],
    ["Concordare materiali e aspetto", "Definire materiale, finitura e forma dei nuovi elementi, considerando le parti con cui devono raccordarsi."],
    ["Leggere quantità e accessori", "Riconoscere sviluppi, pezzi speciali, fissaggi e accessi compresi, senza ridurre tutto a un prezzo indistinto al metro."],
  ],
  solution: [
    ["Un rilievo per elementi", "L'offerta identifica i tratti interessati e i punti di raccordo, indicando cosa resta invariato."],
    ["Una configurazione definita", "Materiali, sezioni e particolari sono quelli confermati per l'intervento; la sola fotografia non stabilisce il dimensionamento."],
    ["Una consegna leggibile", "Il riepilogo collega componenti, controlli previsti e indicazioni di manutenzione all'ambito effettivamente eseguito."],
  ],
  usp: [
    ["Voci confrontabili", "Canali, discese e pezzi speciali hanno descrizioni e quantità riconoscibili."],
    ["Raccordi espliciti", "Le connessioni alle parti esistenti sono definite, insieme a eventuali limiti o opere aggiuntive."],
    ["Scelte condivise", "Aspetto e materiali vengono confermati prima dell'ordine, senza promettere equivalenze cromatiche non verificate."],
  ],
  journey: [
    ["01 · Rilievo", "Tratti, raccordi, accessi e parti esistenti da verificare."],
    ["02 · Configurazione", "Materiali, finiture, sviluppi e accessori da confermare."],
    ["03 · Intervento", "Preparazione e posa degli elementi compresi nella proposta."],
    ["04 · Consegna", "Riscontri concordati, riepilogo e indicazioni di manutenzione."],
  ],
  guarantees: [
    ["Fornitura identificata", "Materiali, finiture e componenti sono quelli specificati nell'offerta confermata."],
    ["Ambito distinto", "I nuovi elementi restano distinguibili dalle parti della rete non interessate dai lavori."],
    ["Condizioni conoscibili", "Coperture e assistenza fanno riferimento ai documenti applicabili alla fornitura e alla posa."],
    ["Cura nel tempo", "Pulizie e controlli successivi vengono indicati in base a materiale, contesto e accessibilità."],
  ],
  schedule: [
    ["Rilievo", "Identificazione degli elementi interessati e delle condizioni di accesso."],
    ["Preparazione", "Conferma di materiali, sviluppi, finiture e disponibilità della fornitura."],
    ["Posa", "Rimozioni e montaggio dei soli elementi previsti, secondo fasi concordate."],
    ["Consegna", "Riscontri sull'ambito eseguito e condivisione dei documenti disponibili."],
  ],
  faq: [
    ["Il prezzo comprende tutti i pluviali?", "Solo quelli identificati nelle voci. Canali, discese, raccordi e accessori devono avere quantità e ambiti riconoscibili."],
    ["Si possono conservare alcune parti?", "La scelta dipende dallo stato riscontrato e dalla compatibilità con i nuovi elementi. Le parti conservate vanno indicate, non date per scontate."],
    ["Quale materiale viene utilizzato?", "Quello specificato nell'offerta. Colore, finitura, sezione e caratteristiche dei componenti si confermano prima dell'ordine."],
    ["Il nuovo tratto avrà lo stesso colore del vecchio?", "Materiale nuovo e parti esposte nel tempo possono differire. Eventuali campioni e aspettative estetiche vanno valutati prima della conferma."],
    ["Sono inclusi ponteggi o piattaforme?", "Solo gli accessi e le opere provvisionali descritti. Modalità operative e protezioni vanno definite per le condizioni reali del cantiere."],
    ["Si verifica anche la rete interrata?", "Non automaticamente. Il collegamento di un pluviale non equivale all'ispezione o al rifacimento della rete a valle, salvo attività dedicate."],
    ["Sono comprese pulizie periodiche?", "Solo se previste da una voce o da un accordo specifico. La consegna delle indicazioni di manutenzione non include automaticamente il servizio."],
    ["La nuova gronda risolve ogni infiltrazione?", "La valutazione riguarda l'ambito verificato. Fenomeni originati da altre parti del tetto, della facciata o della rete possono richiedere ulteriori indagini."],
  ],
  blocks: {
    comeFunziona: { title: "Raccogliere, raccordare, *convogliare*.", intro: "Ogni elemento ha una funzione e un ambito da definire. L'immagine del raccordo è illustrativa, non un dettaglio esecutivo valido per qualsiasi copertura.", photo: detail, items: [
      ["Canali", "Tratti di raccolta delle acque identificati per posizione e sviluppo."],
      ["Pluviali", "Discese e collegamenti specificati nella configurazione confermata."],
      ["Scossaline", "Raccordi metallici previsti tra superfici e punti di discontinuità."],
      ["Accessori", "Pezzi speciali e fissaggi compresi nel perimetro delle lavorazioni."],
    ] },
    compreso: { title: "Metri, pezzi e raccordi. *Tutto leggibile*.", intro: "Le quantità e descrizioni del computo prevalgono sulle immagini illustrative e sui titoli delle sezioni.", items: [
      ["Rimozioni", "Elementi da smontare e gestione dei materiali soltanto dove previsti."],
      ["Fornitura", "Canali, discese e scossaline dei materiali e sviluppi elencati."],
      ["Accessori e posa", "Raccordi, fissaggi e attività di montaggio specificati nell'offerta."],
      ["Riscontri", "Controlli e verifiche espressamente concordati sull'ambito realizzato."],
    ], excluded: [
      ["Rete e parti estranee", "Rete interrata, elementi conservati e tratti non elencati non rientrano automaticamente nel prezzo."],
      ["Opere complementari", "Rifacimenti di tetto, murature, pitture e ulteriori ripristini richiedono voci dedicate."],
    ] },
    protezione: { title: "Accessi definiti. *Spazi organizzati*.", intro: "Il lavoro lungo facciate e coperture richiede una valutazione degli accessi e delle aree coinvolte da parte dei soggetti competenti.", items: [
      ["Accessibilità", "Concordare spazi e modalità per raggiungere i tratti interessati."],
      ["Passaggi", "Individuare accessi all'immobile e zone sottostanti da organizzare."],
      ["Movimentazione", "Definire le aree per nuovi elementi, attrezzature e materiali rimossi."],
      ["Condizioni esterne", "Programmare le attività considerando meteo e interferenze del cantiere."],
    ] },
    controlli: { title: "Il tratto posato. *I collegamenti previsti*.", intro: "Le verifiche devono corrispondere all'intervento, senza estendersi implicitamente alle parti della rete non accessibili o non comprese.", items: [
      ["Configurazione", "Corrispondenza di tratti, materiali e componenti alla fornitura confermata."],
      ["Raccordi", "Riscontro dei collegamenti e dei fissaggi previsti nell'ambito delle opere."],
      ["Deflusso", "Controlli concordati sui percorsi interessati, con esiti e limiti registrati."],
      ["Parti residue", "Annotare criticità delle parti conservate e approfondimenti necessari."],
    ] },
    documenti: { title: "Sapere cosa è stato *sostituito*.", intro: "Un riepilogo chiaro aiuta a riconoscere la fornitura e a gestire manutenzioni o segnalazioni future.", items: [
      ["Tratti e quantità", "Elementi realizzati e variazioni approvate rispetto alla proposta iniziale."],
      ["Componenti", "Materiali e finiture, con i riferimenti disponibili dei prodotti impiegati."],
      ["Controlli", "Riscontri eseguiti e limiti delle verifiche sulle parti della rete."],
      ["Manutenzione", "Indicazioni pertinenti, condizioni applicabili e contatti di assistenza."],
    ] },
    diario: { title: "Riconoscere il tratto. *Prima e dopo*.", intro: "Le fotografie reali, quando concordate, mantengono gli stessi riferimenti della facciata o della copertura. Le illustrazioni non mostrano lavori già svolti.", items: [
      ["Prima", "Posizione degli elementi e condizioni visibili prima delle rimozioni."],
      ["Durante", "Raccordi e componenti significativi prima del completamento."],
      ["Dopo", "Tratti ultimati e parti conservate, con eventuali riserve annotate."],
    ] },
  },
};
