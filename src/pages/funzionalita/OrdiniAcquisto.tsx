import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Database,
  FileSignature,
  HardHat,
  Inbox,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "ordini-acquisto",
  vertical: "Ordini Acquisto",
  productName: "Ordini Acquisto Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor che gestiscono decine di fornitori per cantiere e vogliono ordini digitali firmati, riconciliazione DDT/fatture e listini sotto controllo",
  audienceShort: "imprese edili e general contractor",

  seo: {
    title:
      "Ordini Acquisto Edilizia",
    description:
      "Ordini fornitori di cantiere con PO digitali firmati elettronicamente, riconciliazione automatica DDT e fatture, listini fornitori centralizzati e tracking consegne.",
    keywords:
      "ordini acquisto edilizia, PO digitali cantiere, gestione fornitori impresa edile, riconciliazione DDT fatture edilizia, listini fornitori edilizia, tracking arrivi cantiere, ordini fornitore cantiere, software acquisti edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Ordini Acquisto",
  heroH1Lead: "Ordini fornitori digitali",
  heroH1Highlight: "firmati e riconciliati",
  heroH1Tail: "in automatico",
  heroSubheadline:
    "Gestione ordini fornitori con PO digitali firmati elettronicamente, riconciliazione automatica DDT e fatture passive del cassetto SDI, listini fornitori centralizzati con prezzi storicizzati, tracking arrivi cantiere. Smetti di ordinare via WhatsApp e di scoprire prezzi gonfiati a fine mese.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Firma elettronica eIDAS inclusa",
    "Riconciliazione DDT/fatture automatica",
  ],
  proofPoints: [
    "PO digitali firmabili online",
    "Listini fornitori centralizzati",
    "Tracking arrivi cantiere",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare ordini WhatsApp e prezzi senza controllo"],
    ["Momento chiave", "Ogni richiesta di materiale dal capocantiere"],
    ["Risultato", "4% di recupero costi su prezzi controllati"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano Ordini Acquisto per portare disciplina nei loro processi di acquisto cantiere.",
  betaBody:
    "Gli Ordini Acquisto li attiviamo in 48 ore: importiamo l'anagrafica fornitori, configuriamo i listini storici, attiviamo la firma elettronica eIDAS, integriamo con il cassetto SDI per riconciliazione fatture passive e ti accompagniamo in 4 sessioni 1-a-1 fino al primo PO chiuso.",

  speedH2:
    "Ordini via WhatsApp + prezzi 'come l'altra volta' = 4-7% di costo extra che si paga senza accorgersene.",
  speedSubheadline:
    "Le imprese edili medie ordinano materiali e subforniture via WhatsApp/telefono senza listini di riferimento, senza ordini formali, senza tracking. I fornitori applicano prezzi 'a memoria' che spesso sono 4-7% superiori al miglior prezzo storico.",
  speedStats: [
    { value: 4, prefix: "+", suffix: "%", label: "recupero su costi acquisti con prezzi controllati" },
    { value: 95, prefix: "+", suffix: "%", label: "PO riconciliati automaticamente con DDT/fatture" },
    { value: 24, suffix: "/7", label: "tracking arrivi cantiere e backlog ordini" },
  ],

  familyH2: "Gli Ordini Acquisto al centro tra cantiere, fornitori e contabilità.",
  familySubheadline:
    "Un ordine d'acquisto vive integrato: nasce da una richiesta cantiere, si firma elettronicamente, si riconcilia con DDT e fatture passive, popola il magazzino cantiere, alimenta il margine progetto. Tutto in un flusso, niente data entry duplicato.",
  familyItems: [
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Ordini d'acquisto generati da richieste capocantiere, imputati al cantiere giusto.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Boxes,
      title: "Magazzino Cantiere",
      text: "DDT in arrivo aggiornano stock di magazzino cantiere automaticamente.",
      to: "/funzionalita/magazzino-cantiere",
    },
    {
      icon: Inbox,
      title: "Cassetto Fiscale SDI",
      text: "Fatture passive ricevute via SDI riconciliate automaticamente con i PO.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "PO firmati elettronicamente eIDAS per tracciabilità e validità legale.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Costi reali da PO/fatture imputati per analisi margine progetto.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Clock,
      title: "Scadenzario",
      text: "Scadenze pagamento fornitori popolate da PO + fatture passive.",
      to: "/funzionalita/scadenzario",
    },
  ],
  familyBonusTitle: "Un solo flusso ordini. Una sola fonte di prezzi. Un solo controllo costi.",
  familyBonusText:
    "Quando il capocantiere richiede materiali, il sistema crea PO con prezzi listino fornitore, lo invia firmato eIDAS, lo confronta con DDT in arrivo (quantità, articolo) e con fattura passiva del cassetto SDI (prezzo). Discrepanze segnalate automaticamente, contestazioni gestite in 30 secondi.",

  painKicker: "Il problema vero",
  painH2:
    "Ordini via WhatsApp del capocantiere. Prezzi 'a memoria'. Fatture che arrivano gonfiate e nessuno le contesta.",
  painSubheadline:
    "Senza un sistema di ordini formale, l'acquisto cantiere è un caos: capocantiere ordina via WhatsApp, fornitore applica prezzo 'a memoria', DDT non corrisponde all'ordine, fattura passiva arriva 30 giorni dopo e nessuno controlla. Costo extra reale 4-7%, marginalità erosa silenziosamente.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Prezzi 'a memoria' del fornitore",
      text: "Senza listini di riferimento, fornitore applica prezzo che ricorda dell'ordine precedente: spesso 4-7% sopra al miglior prezzo storico. Su 200k di acquisti annui sono 8-14k bruciati silenziosamente.",
    },
    {
      icon: Search,
      title: "Riconciliazione DDT/fattura impossibile",
      text: "Fattura arriva via SDI, ma corrisponde a quale DDT? Quale ordine? A che prezzo era stato concordato? Senza ordini formali, segretaria fa caccia al tesoro 10 minuti per fattura.",
    },
    {
      icon: ClipboardList,
      title: "Tracking arrivi cantiere zero",
      text: "Capocantiere chiede 'è arrivato il ferro?'. Risposta: 'mi sembra di sì'. Senza tracking PO/DDT, nessuno sa cosa è ordinato, cosa è arrivato, cosa è ancora in attesa. Ritardi cantiere causati dal nulla.",
    },
    {
      icon: TrendingDown,
      title: "Margine cantiere stimato a fine lavori",
      text: "Quanto è costato il cantiere X in materiali? 'A occhio 80k'. Senza imputazione PO al cantiere giusto, costo materiali certo solo a fine lavori, troppo tardi per agire su cantieri marginali.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi fornitori, stessi materiali, stessi cantieri. Cambia il controllo costi e tempi.",
  baSubheadline:
    "Gli Ordini Acquisto digitali non rallentano il flusso operativo: lo strutturano. Capocantiere richiede da app, sistema genera PO con prezzo listino, fornitore conferma firma eIDAS in 30 secondi, materiale arriva, DDT/fattura si riconciliano in automatico.",
  baAreas: [
    {
      title: "Generazione e invio ordine",
      before:
        "Capocantiere chiama o WhatsApp al fornitore: '30 sacchi di calce per cantiere Roma'. Niente PO formale, niente prezzo concordato in scritto, niente conferma fornitore.",
      after:
        "Capocantiere apre app, seleziona cantiere e articoli da listino, genera PO automatico con prezzo storico, invia per firma eIDAS al fornitore. Conferma in 30 secondi.",
    },
    {
      title: "Riconciliazione DDT al ricevimento",
      before:
        "DDT arriva, capocantiere firma a memoria 'sì è quello giusto', segretaria archivia. Niente match automatico, niente controllo prezzo, niente verifica quantità.",
      after:
        "Capocantiere scansiona DDT da app, sistema confronta con PO firmato: quantità ok? articoli ok? prezzo ok? Discrepanze evidenziate, contestazione fornitore gestita in 30 secondi.",
    },
    {
      title: "Riconciliazione fattura passiva",
      before:
        "Fattura arriva via SDI 30 giorni dopo, segretaria cerca il DDT, cerca l'ordine, controlla a mano. 10-15 minuti per fattura, errori frequenti, contestazioni mancate.",
      after:
        "Cassetto SDI sincronizza fattura, sistema match automatico con PO+DDT: prezzo coerente? quantità coerente? Discrepanze segnalate, conferma fattura in 30 secondi.",
    },
    {
      title: "Controllo costi cantiere real-time",
      before:
        "Costi cantiere certi solo a fine lavori, dopo che fatture passive sono arrivate e classificate manualmente. Cantieri in perdita scoperti troppo tardi.",
      after:
        "Costo materiali per cantiere aggiornato in tempo reale ad ogni PO firmato. Margine cantiere previsionale e reale sempre allineati, decisioni di variante prese in tempo.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare disciplina e controllo nei tuoi acquisti cantiere.",
  mechanismSubheadline:
    "Gli Ordini Acquisto sono progettati per non rallentare il capocantiere: 30 secondi per generare un PO da app, 30 secondi per il fornitore per firmarlo. Velocità di WhatsApp ma con tracciabilità totale.",
  mechanismSteps: [
    {
      icon: ClipboardCheck,
      title: "PO generato da listino fornitore",
      text: "Capocantiere apre app, seleziona cantiere e articoli, sistema applica prezzo da listino fornitore (storico ultimo ordine + sconti negoziati). PO pronto in 30 secondi, niente più 'quanto l'avevi pagato la volta scorsa'.",
    },
    {
      icon: Send,
      title: "Firma eIDAS del fornitore",
      text: "PO inviato via email/SMS al fornitore con link firma elettronica eIDAS. Fornitore firma da telefono in 30 secondi, validità legale, marca temporale qualificata, conservazione decennale automatica.",
    },
    {
      icon: ArrowRightLeft,
      title: "Riconciliazione DDT/fattura automatica",
      text: "DDT scansionato all'arrivo + fattura passiva sincronizzata da cassetto SDI: sistema confronta con PO firmato. Match per articolo, quantità, prezzo. Discrepanze evidenziate per contestazione 30 secondi.",
    },
  ],
  mechanismCta: "Apri la demo Ordini Acquisto",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "4% in meno sui costi acquisti. 95% di riconciliazione automatica. Margine cantiere certo.",
  commercialBody:
    "Gli Ordini Acquisto digitali non rallentano l'operatività cantiere: la rendono tracciabile e controllata. Le imprese che li attivano recuperano in media il 4% sui costi acquisti grazie a prezzi listino e riconciliazioni automatiche.",
  commercialLevers: [
    {
      icon: TrendingDown,
      title: "4% recupero costi acquisti",
      text: "Prezzi listino applicati automaticamente, niente più 'a memoria'. Su 500k di acquisti annui sono 20k recuperati netti, ROI sull'intero modulo in 1 mese.",
    },
    {
      icon: ShieldCheck,
      title: "Discrepanze contestate sempre",
      text: "Ogni discrepanza prezzo/quantità tra PO, DDT e fattura viene segnalata. Tu contesti in 30 secondi prima di pagare. Niente più sorprese a fine mese, niente più riconoscimenti tardivi.",
    },
    {
      icon: Target,
      title: "Margine cantiere certo in tempo reale",
      text: "Costo materiali per cantiere aggiornato ad ogni PO firmato. Cantieri marginali identificati al 30% di avanzamento, varianti negoziate in tempo, perdite evitate.",
    },
    {
      icon: Sparkles,
      title: "Negoziazione fornitori basata su dato",
      text: "Storico acquisti per fornitore con prezzi e volumi consolidati. Negoziazione annuale basata su dato reale, non sensazioni. Sconti volume sistematici.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Gli ordini smettono di essere il caos. Diventano la base del controllo costi.",
  resultsBody:
    "Quando ogni acquisto cantiere genera un PO firmato, riconciliato e imputato, l'impresa cambia paradigma: prezzi controllati, costi reali per cantiere, contestazioni puntuali. Le imprese che attivano Ordini Acquisto vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Database,
      title: "Listini fornitori centralizzati",
      text: "Anagrafica fornitori con prezzi storici, sconti negoziati, condizioni pagamento. Aggiornamento listino automatico ad ogni nuovo ordine, niente prezzi 'a memoria'.",
    },
    {
      icon: FileSignature,
      title: "PO digitali firmati eIDAS",
      text: "Generazione PO da app capocantiere, firma elettronica fornitore via email/SMS, marca temporale qualificata, conservazione decennale automatica.",
    },
    {
      icon: Truck,
      title: "Tracking arrivi cantiere",
      text: "Stato di ogni PO: emesso, firmato fornitore, in produzione, in consegna, arrivato. Capocantiere apre app e sa esattamente cosa è in arrivo.",
    },
    {
      icon: ArrowRightLeft,
      title: "Riconciliazione automatica DDT/fatture",
      text: "Match automatico PO-DDT-fattura per articolo, quantità, prezzo. 95% di riconciliazione automatica, tu approvi le discrepanze in 30 secondi.",
    },
  ],
  resultStats: [
    { value: 4, prefix: "+", suffix: "%", label: "recupero su costi acquisti totali" },
    { value: 95, prefix: "+", suffix: "%", label: "PO riconciliati automaticamente" },
    { value: 30, suffix: " sec", label: "tempo per contestare una discrepanza" },
  ],
  resultsCta: "Apri la demo Ordini Acquisto",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se i prezzi non sono più 'a memoria' del fornitore?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di ordini fornitore al mese e ticket medio per ordine. La stima parte dal 4% di recupero medio osservato grazie ai prezzi listino e riconciliazioni automatiche.",
  roi: {
    input1Label: "Ordini fornitore al mese",
    input1Default: 80,
    input1Min: 10,
    input1Max: 500,
    input1Step: 5,
    input2Label: "Ticket medio ordine (€)",
    input2Default: 1800,
    input2Min: 100,
    input2Max: 50000,
    input2Step: 50,
    input2Suffix: " €",
    outputLabel: "Recupero annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * b * 0.04),
    computeSecondary: (a, b) => [
      { label: "Volume acquisti annui", value: `€ ${(a * 12 * b).toLocaleString("it-IT")}` },
      { label: "Riconciliazione automatica PO/fatture", value: "95%" },
      { label: "Tempo capocantiere risparmiato/anno", value: `${Math.round(a * 12 * 0.1)} h` },
    ],
    closingPitch:
      "Stima prudenziale basata sul 4% di recupero medio osservato (prezzi listino + contestazioni puntuali su DDT/fatture). Aggiungi il valore del controllo costi cantiere in tempo reale e la negoziazione annuale basata su dato vero.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non burocrazia. Disciplina che rende l'impresa più redditizia.",
  salesBody:
    "Gli Ordini Acquisto Edilizia in Cloud non sono uno step burocratico in più: sono lo strumento che trasforma acquisti caotici in costo controllato. Le imprese che li attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Capocantiere veloce ma tracciabile",
      text: "Capocantiere genera PO in 30 secondi da app, niente burocrazia in più rispetto a un WhatsApp. Ma il PO è firmato, tracciato, riconciliato. Velocità + controllo.",
    },
    {
      title: "Fornitori più competitivi",
      text: "Quando i fornitori sanno che i prezzi sono confrontati con storico e listini, applicano prezzi corretti dal primo ordine. Negoziazione annuale facilitata da dato strutturato.",
    },
    {
      title: "Segreteria liberata da caccia al tesoro",
      text: "Riconciliazione DDT/fattura automatica al 95%. Segreteria smette di passare ore a cercare ordini e DDT, torna disponibile per gestione clienti e crediti.",
    },
    {
      title: "Decisioni cantiere informate",
      text: "Costo cantiere reale aggiornato in tempo reale. Variante necessaria? Negozi con cliente con dati alla mano, non con stime ottimistiche.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Generazione PO da app capocantiere",
      value:
        "App mobile per richiesta materiale: seleziona cantiere, articoli, fornitore (suggerito da listino). PO generato automaticamente con prezzi storici e sconti negoziati.",
    },
    {
      label: "Firma elettronica eIDAS fornitore",
      value:
        "PO inviato via email/SMS, fornitore firma da telefono in 30 secondi, validità legale, marca temporale qualificata, conservazione decennale automatica.",
    },
    {
      label: "Listini fornitori storicizzati",
      value:
        "Prezzi storici per articolo per fornitore, sconti negoziati, condizioni pagamento. Storico ultimo ordine sempre disponibile, niente più 'a memoria'.",
    },
    {
      label: "Tracking arrivi e backlog",
      value:
        "Stato di ogni PO: emesso, firmato, in produzione, in consegna, arrivato. Capocantiere sa cosa aspettarsi, niente più 'è arrivato il ferro?' al telefono.",
    },
    {
      label: "Riconciliazione automatica DDT/PO",
      value:
        "DDT scansionato all'arrivo confrontato con PO: articoli, quantità, prezzo. Discrepanze evidenziate per contestazione fornitore in 30 secondi.",
    },
    {
      label: "Riconciliazione automatica fatture passive",
      value:
        "Fatture passive sincronizzate dal cassetto SDI confrontate con PO+DDT. 95% di match automatico, tu approvi le discrepanze in 30 secondi.",
    },
    {
      label: "Imputazione automatica al cantiere",
      value:
        "Ogni PO è collegato a un cantiere. Costo materiali aggiornato in tempo reale per analisi margine cantiere senza data entry duplicato.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui gli Ordini Acquisto cambiano la giornata.",
  scenarios: [
    {
      title: "Fattura passiva con prezzo gonfiato",
      text: "Fattura arriva via SDI con sacco di cemento a 4,80€ contro listino 4,20€. Sistema segnala discrepanza con PO firmato. Tu contesti il fornitore con dato alla mano in 30 secondi: ricevi nota di credito, recuperi 240€.",
    },
    {
      title: "Cantiere con costo materiali fuori controllo",
      text: "Apri analisi margini: cantiere Via Roma ha già speso 95k in materiali contro 80k preventivato, e siamo al 60% di avanzamento. Capisci subito che servono varianti. Negozi con cliente con dati alla mano, salvi marginalità.",
    },
    {
      title: "Negoziazione annuale fornitore ferro",
      text: "Fornitore ferro chiama per rinnovare listino. Apri storico: 280k acquistati nell'anno, sconto medio 8%. Negozi sconto volume al 12% basato su dato. Risparmio annuo 11.200€ documentato e prevedibile.",
    },
  ],

  testimonialQuote:
    "Ordinavo via WhatsApp e mio capocantiere comprava 'come al solito'. Ho attivato Ordini Acquisto: il primo mese ho scoperto che pagavamo il ferro 6% sopra il listino storico, sacchi di cemento 4% sopra. Discussione con i fornitori, sistemato. In un anno ho recuperato 18.000€ solo sui materiali, senza tagliare niente, solo eliminando l'inerzia dei prezzi.",
  testimonialAuthor: "Francesco V.",
  testimonialRole: "Vivaldi Costruzioni Srl, Verona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "I miei fornitori accetteranno la firma elettronica eIDAS?",
      a: "Sì, statisticamente nel 95% dei casi. La firma eIDAS è uno standard europeo, riconosciuta legalmente come la firma autografa. Per fornitori non digitalizzati esiste opzione 'firma con OTP via SMS' che funziona anche senza app. Nei primi 30 giorni ti aiutiamo a onboardare i fornitori principali.",
    },
    {
      q: "Posso gestire fornitori con condizioni diverse (sconti, dilazioni)?",
      a: "Sì. Per ogni fornitore configuri sconti standard, sconti per volume, condizioni pagamento (30/60/90 gg), modalità di consegna, IVA applicata, eventuali ritenute reverse charge edilizia art. 17 ter. Il PO applica automaticamente le condizioni corrette.",
    },
    {
      q: "La riconciliazione automatica DDT/fattura come funziona?",
      a: "Quando il DDT arriva e viene scansionato in app, sistema OCR riconosce articoli e quantità, confronta con PO firmato. Quando la fattura passiva sincronizza dal cassetto SDI, sistema match per P.IVA, importo, riferimento PO. 95% di match automatico, le discrepanze sono evidenziate per la tua approvazione.",
    },
    {
      q: "Funziona anche per subappalti edili (non solo materiali)?",
      a: "Sì. Gli ordini di subappalto sono gestiti come PO speciali con riferimento a SAL e ritenute art. 17 ter reverse charge edilizia. Tracking lavori subappaltatore, fatture passive subappalto riconciliate automaticamente. Modulo subappalti dedicato disponibile.",
    },
    {
      q: "Posso vedere lo storico prezzi di un articolo nel tempo?",
      a: "Sì. Per ogni articolo a listino vedi: storico prezzi ultimi 12 mesi, fornitore migliore, prezzo medio mercato, trend. Strumenti decisionali per negoziazioni e capisci quando un fornitore sta gonfiando i prezzi.",
    },
    {
      q: "Quanto costa? Ci sono limiti su numero ordini?",
      a: "Ordini Acquisto è incluso nei piani Professional e Business di Edilizia in Cloud. PO illimitati, fornitori illimitati, firma eIDAS inclusa, conservazione decennale inclusa. Riconciliazione automatica con cassetto SDI inclusa.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Gli Ordini Acquisto sono il fulcro tra cantiere, fornitori e contabilità.",
  internalLinksBody:
    "Ogni PO firmato alimenta magazzino, scadenzario, margine cantiere e analisi controllo costi. Una sola fonte di verità sugli acquisti.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "PO generati da richieste capocantiere e imputati al cantiere giusto." },
    { to: "/funzionalita/magazzino-cantiere", title: "Magazzino Cantiere", text: "DDT in arrivo aggiornano stock di magazzino cantiere." },
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto Fiscale SDI", text: "Fatture passive riconciliate automaticamente con i PO firmati." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "PO firmati eIDAS con valore legale e marca temporale." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costi reali da PO/fatture per analisi margine progetto." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Scadenze pagamento fornitori popolate da PO e fatture passive." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Ordini di subappalto con SAL e reverse charge art. 17 ter." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Ordini Acquisto inclusi nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di ordinare via WhatsApp. Inizia a controllare i prezzi e i tempi cantiere.",
  finalCtaBody:
    "31 giorni gratuiti per portare gli Ordini Acquisto digitali dentro la tua impresa edile. Setup in 48 ore, listini fornitori, firma eIDAS e riconciliazione automatica DDT/fatture inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Firma eIDAS · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Ordini Acquisto",
  stickyCtaMicrocopy: "Setup 48h · PO digitali firmati",

  applicationSubCategory: "Construction Purchase Order Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function OrdiniAcquisto() {
  return <FunzionalitaPageTemplate config={config} />;
}
