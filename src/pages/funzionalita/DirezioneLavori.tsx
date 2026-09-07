import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Camera,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FolderOpen,
  GanttChart,
  HardHat,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "direzione-lavori",
  definizione:
    "Direzione Lavori di Edilizia in Cloud tiene vivo il cronoprogramma dopo l'inizio dei lavori: le fasi si aggiornano con l'avanzamento registrato dal campo, il giornale lavori si compila dal cantiere e i ritardi emergono mentre si formano, non quando è troppo tardi per recuperare.",
  vertical: "Direzione Lavori",
  productName: "Direzione Lavori Edilizia in Cloud",
  audience:
    "Imprese edili, geometri e tecnici d'impresa che seguono la direzione lavori dei cantieri e voglono cronoprogramma aggiornato, giornale lavori in ordine, documenti DL raccolti e un calendario lavori che segnala i conflitti tra squadre e fasi",
  audienceShort: "imprese e tecnici che dirigono i lavori dei cantieri",

  seo: {
    title: "Software Direzione Lavori e Cronoprogramma",
    description:
      "Software direzione lavori: cronoprogramma, giornale lavori, documenti DL e calendario con conflitti sotto controllo. Prova gratis 31 giorni.",
    keywords:
      "software direzione lavori, cronoprogramma lavori, cronoprogramma cantiere, direzione lavori edilizia, documenti direzione lavori, calendario lavori cantiere, gestione fasi cantiere, pianificazione lavori edili",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Direzione Lavori",
  heroH1Lead: "Il ritardo in cantiere lo scopri",
  heroH1Highlight: "sempre quando è troppo tardi.",
  heroH1Tail: "Cronoprogramma e giornale lavori aggiornati dal campo",
  heroSubheadline:
    "Il cronoprogramma fatto a inizio lavori muore in un cassetto la settimana dopo. Con Edilizia in Cloud la direzione lavori ha finalmente una casa: cronoprogramma delle fasi aggiornato con l'avanzamento reale, giornale lavori compilato dal cantiere, documenti DL raccolti sulla commessa, calendario lavori che segnala i conflitti quando due fasi o due squadre si pestano i piedi. Il quadro del cantiere si legge in una schermata, non si ricostruisce a telefonate.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Cronoprogramma per fasi",
    "Conflitti segnalati in automatico",
  ],
  proofPoints: [
    "Giornale lavori collegato al cantiere",
    "Documenti DL sulla commessa",
    "Calendario squadre e fasi in una vista",
  ],

  objectiveRow: [
    ["Obiettivo", "Cantieri che avanzano secondo programma, senza sorprese"],
    ["Momento chiave", "Ogni slittamento di fase e ogni sovrapposizione di squadre"],
    ["Risultato", "Ritardi visti in anticipo, cantieri consegnati in data"],
  ],

  betaH2:
    "Più di 300 imprese italiane dirigono i lavori con cronoprogramma e giornale nello stesso sistema.",
  betaBody:
    "La Direzione Lavori la attiviamo in 48 ore: carichiamo i cantieri aperti con le loro fasi, costruiamo il cronoprogramma, colleghiamo giornale lavori e calendario squadre e ti accompagniamo in 3 sessioni 1-a-1 fino al primo cantiere pianificato e monitorato. Dalla prima settimana, gli slittamenti si vedono sul cronoprogramma, non si scoprono in cantiere.",

  speedH2:
    "Un ritardo visto con due settimane di anticipo si gestisce. Visto il giorno prima, si subisce.",
  speedSubheadline:
    "Senza cronoprogramma vivo, il programma lavori è un Gantt stampato a inizio cantiere e mai più aggiornato: le fasi slittano in silenzio, le squadre si sovrappongono, il piastrellista arriva quando il massetto non è asciutto. Ogni conflitto non visto è un giorno di squadra persa o una penale che si avvicina.",
  speedStats: [
    { value: 14, suffix: " gg", label: "di anticipo medio nel vedere gli slittamenti" },
    { value: 100, suffix: "%", label: "conflitti squadre/fasi segnalati dal calendario" },
    { value: 30, suffix: " sec", label: "per leggere lo stato avanzamento di un cantiere" },
  ],

  familyH2: "La direzione lavori collegata a commesse, rapportini e calendario.",
  familySubheadline:
    "Il cronoprogramma non vive su un file a parte: le fasi sono quelle della commessa, l'avanzamento arriva dai rapportini, il giornale lavori si compila dai dati del cantiere, il calendario incrocia squadre e fasi. Una piattaforma sola, un quadro solo.",
  familyItems: [
    {
      icon: CalendarDays,
      title: "Calendario Lavori",
      text: "Squadre e fasi pianificate, con i conflitti segnalati in automatico.",
      to: "/funzionalita/calendario-lavori",
    },
    {
      icon: BookOpen,
      title: "Giornale Lavori",
      text: "La registrazione giornaliera conforme, alimentata dal cantiere.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: ClipboardList,
      title: "Gestione Commesse",
      text: "Fasi, costi e documenti della commessa in un posto solo.",
      to: "/funzionalita/gestione-commesse",
    },
    {
      icon: HardHat,
      title: "Rapportini Cantiere",
      text: "L'avanzamento reale delle fasi arriva dai rapportini quotidiani.",
      to: "/funzionalita/rapportini-cantiere",
    },
    {
      icon: Camera,
      title: "Foto Cantiere",
      text: "L'avanzamento documentato con foto datate e geolocalizzate.",
      to: "/funzionalita/foto-cantiere",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Verbali e documenti DL firmati con valore legale.",
      to: "/funzionalita/firma-elettronica",
    },
  ],
  familyBonusTitle:
    "Il cronoprogramma si aggiorna da solo, perché il cantiere lo alimenta ogni giorno.",
  familyBonusText:
    "Quando il caposquadra chiude il rapportino, le fasi lavorate registrano l'avanzamento. Quando una fase slitta, il cronoprogramma lo mostra e il calendario ricalcola gli incastri delle squadre. Quando serve il quadro per il committente o la DL esterna, apri la commessa: fasi, giornale, foto e documenti sono già lì. Dirigere i lavori smette di essere rincorrere informazioni.",

  painKicker: "Il problema vero",
  painH2:
    "Il Gantt stampato a inizio cantiere è già vecchio la seconda settimana. Da lì in poi si naviga a vista.",
  painSubheadline:
    "La direzione lavori nella pratica di molte imprese è un misto di memoria, telefonate e fogli sparsi: il cronoprogramma non si aggiorna, i conflitti tra squadre si scoprono sul posto, i documenti DL stanno tra email e cartelle. Il costo è ritardi, giorni di squadra persi e consegne che slittano.",
  painPoints: [
    {
      icon: GanttChart,
      title: "Cronoprogramma fatto una volta e mai aggiornato",
      text: "Il programma lavori si prepara per il contratto, poi resta appeso in baracca. Le fasi slittano in silenzio, nessuno ricalcola gli effetti a catena: il ritardo si scopre quando ormai è il problema di tutti, committente compreso.",
    },
    {
      icon: AlertTriangle,
      title: "Squadre e fasi che si pestano i piedi",
      text: "L'elettricista e l'idraulico convocati lo stesso giorno nello stesso vano. Il piastrellista arriva col massetto ancora umido. Ogni conflitto non visto prima è mezza giornata di squadra pagata a non lavorare, più la figura con l'artigiano.",
    },
    {
      icon: Search,
      title: "Documenti DL sparsi tra email, WhatsApp e cartelle",
      text: "Verbali di sopralluogo in una email, ordini di servizio su WhatsApp, la relazione in una cartella del PC. Quando serve ricostruire una decisione — chi ha autorizzato cosa, quando — si perde un pomeriggio, se va bene.",
    },
    {
      icon: Timer,
      title: "Lo stato avanzamento si ricostruisce a telefonate",
      text: "Il committente chiede 'a che punto siamo?'. La risposta richiede un giro di chiamate ai capisquadra e una passata in cantiere. Ogni aggiornamento è un'ora persa, e la risposta è comunque una stima a voce.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stesse squadre, stesse scadenze. Cambia quanto prima vedi i problemi.",
  baSubheadline:
    "La Direzione Lavori di Edilizia in Cloud non aggiunge riunioni: toglie sorprese. Il cronoprogramma vive dei dati che il cantiere produce comunque, e i conflitti si vedono sul calendario prima che succedano sul campo.",
  baAreas: [
    {
      title: "Cronoprogramma e avanzamento",
      before:
        "Gantt preparato a inizio lavori e mai più toccato. L'avanzamento reale sta nella testa del capocantiere: gli slittamenti si scoprono tardi e gli effetti a catena non li calcola nessuno.",
      after:
        "Fasi con date e dipendenze, avanzamento alimentato dai rapportini. Quando una fase slitta lo vedi subito, con l'effetto sulle fasi successive: decidi il recupero con due settimane di margine.",
    },
    {
      title: "Pianificazione squadre e artigiani",
      before:
        "Convocazioni a telefono e a memoria: doppi appuntamenti, artigiani sul posto quando la fase precedente non è finita, squadre spostate all'ultimo con giornate perse.",
      after:
        "Calendario lavori con squadre e fasi insieme: le sovrapposizioni vengono segnalate quando le crei, non quando esplodono in cantiere. Gli artigiani si convocano su date che reggono.",
    },
    {
      title: "Documenti della direzione lavori",
      before:
        "Verbali, ordini di servizio, comunicazioni al committente sparsi tra email, chat e cartelle. Ricostruire chi ha deciso cosa richiede ore di ricerca.",
      after:
        "Tutti i documenti DL sulla commessa: verbali, ordini di servizio, comunicazioni, firmati elettronicamente dove serve. La storia decisionale del cantiere in un archivio cercabile.",
    },
    {
      title: "Rendicontazione verso il committente",
      before:
        "Ogni richiesta di aggiornamento è un giro di telefonate e un report scritto a mano. Il committente riceve stime a voce e la fiducia si costruisce a fatica.",
      after:
        "Stato avanzamento leggibile in 30 secondi: fasi, percentuali, foto datate, giornale lavori. Il report per il committente si prepara in minuti, con dati e immagini invece di impressioni.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi: pianifica le fasi, lascia che il cantiere aggiorni, intervieni dove serve.",
  mechanismSubheadline:
    "La Direzione Lavori è costruita sul principio che il cronoprogramma deve vivere dei dati di cantiere, non di aggiornamenti manuali che nessuno ha tempo di fare.",
  mechanismSteps: [
    {
      icon: GanttChart,
      title: "Costruisci il cronoprogramma per fasi",
      text: "Definisci le fasi del cantiere con date, durate e squadre assegnate: demolizioni, impianti, massetti, finiture. Il calendario lavori le mette in fila e segnala subito se due fasi o due squadre si sovrappongono dove non devono.",
    },
    {
      icon: Smartphone,
      title: "Il cantiere aggiorna l'avanzamento ogni giorno",
      text: "I rapportini quotidiani registrano le fasi lavorate, le ore e le foto. Il cronoprogramma si aggiorna con l'avanzamento reale e il giornale lavori si compila dai dati della giornata: nessun aggiornamento manuale del Gantt, mai più.",
    },
    {
      icon: ClipboardCheck,
      title: "Gli scostamenti si vedono, tu decidi",
      text: "Fase in ritardo, squadra in conflitto, consegna a rischio: il quadro te lo mostra con giorni di anticipo. Riorganizzi il calendario, emetti l'ordine di servizio, informi il committente con dati e foto. Dirigere, non rincorrere.",
    },
  ],
  mechanismCta: "Vedi un cronoprogramma di esempio",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Consegne in data, giornate di squadra non sprecate, decisioni documentate, committenti tranquilli.",
  commercialBody:
    "La direzione lavori fatta con i dati cambia i numeri del cantiere: i ritardi si recuperano quando costano poco, le squadre lavorano senza buchi, e la reputazione di impresa che consegna puntuale vale più di qualsiasi sconto.",
  commercialLevers: [
    {
      icon: CalendarClock,
      title: "Ritardi gestiti con due settimane di anticipo",
      text: "Lo slittamento visto presto si recupera riorganizzando le fasi; visto tardi, si paga in penali e straordinari. Il cronoprogramma vivo sposta il momento della scoperta da 'troppo tardi' a 'in tempo utile'.",
    },
    {
      icon: TrendingUp,
      title: "Giornate di squadra piene, non a metà",
      text: "Ogni conflitto evitato è mezza giornata di squadra che lavora invece di aspettare. Su un cantiere di sei mesi, i conflitti di pianificazione evitati valgono giorni interi di produzione recuperata.",
    },
    {
      icon: ShieldCheck,
      title: "Ogni decisione ha data, autore e documento",
      text: "Ordini di servizio, verbali e comunicazioni stanno sulla commessa, firmati dove serve. In caso di contenzioso con committente o subappaltatori, la storia decisionale del cantiere è ricostruibile in minuti.",
    },
    {
      icon: Sparkles,
      title: "Il committente vede un'impresa in controllo",
      text: "Aggiornamenti con fasi, percentuali e foto invece di stime a voce. Il committente che riceve report puntuali si fida, paga più volentieri e richiama per il lavoro successivo: la puntualità è il miglior commerciale.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il cantiere smette di essere diretto a memoria. Il programma torna a comandare.",
  resultsBody:
    "Quando cronoprogramma, giornale, calendario e documenti stanno nello stesso sistema e si aggiornano dai dati del cantiere, la direzione lavori cambia natura: meno rincorse, più decisioni prese in anticipo, consegne che tengono la data.",
  integrationPillars: [
    {
      icon: GanttChart,
      title: "Cronoprogramma per fasi",
      text: "Fasi con date, durate, squadre e avanzamento reale dai rapportini. Gli slittamenti e i loro effetti a catena si vedono sul programma, con l'anticipo che serve per agire.",
    },
    {
      icon: CalendarDays,
      title: "Calendario lavori con conflitti",
      text: "Squadre, fasi e appuntamenti in una vista unica. Le sovrapposizioni vengono segnalate al momento della pianificazione: i conflitti si risolvono sul calendario, non in cantiere.",
    },
    {
      icon: BookOpen,
      title: "Giornale lavori collegato",
      text: "La registrazione giornaliera conforme si alimenta dai dati del cantiere: maestranze, mezzi, eventi. Il giornale è sempre in ordine, pronto per DL, RUP e ispezioni.",
    },
    {
      icon: FolderOpen,
      title: "Documenti DL sulla commessa",
      text: "Verbali di sopralluogo, ordini di servizio, comunicazioni e relazioni raccolti sulla commessa, con firma elettronica dove serve. L'archivio della direzione lavori, cercabile in secondi.",
    },
  ],
  resultStats: [
    { value: 14, suffix: " gg", label: "anticipo medio nella scoperta degli slittamenti" },
    { value: 100, suffix: "%", label: "documenti DL archiviati sulla commessa" },
    { value: 30, suffix: " sec", label: "per il quadro avanzamento di un cantiere" },
  ],
  resultsCta: "Apri la demo Direzione Lavori",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto costano i conflitti di pianificazione e i ritardi visti tardi?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: cantieri attivi e giornate perse al mese tra conflitti squadre, attese e ripianificazioni dell'ultimo minuto. La stima valorizza le giornate di squadra recuperate.",
  roi: {
    input1Label: "Cantieri attivi",
    input1Default: 5,
    input1Min: 1,
    input1Max: 40,
    input1Step: 1,
    input2Label: "Giornate squadra perse/mese (conflitti e attese)",
    input2Default: 4,
    input2Min: 1,
    input2Max: 30,
    input2Step: 1,
    input2Suffix: " gg",
    outputLabel: "Valore recuperato all'anno",
    computeOutput: (a, b) => Math.round(b * 12 * 0.7 * 600),
    computeSecondary: (a, b) => [
      { label: "Giornate squadra recuperate/anno", value: `${Math.round(b * 12 * 0.7)} gg` },
      { label: "Conflitti evitati dal calendario", value: "7 su 10" },
      { label: "Cantieri pianificati", value: `${a}` },
    ],
    closingPitch:
      "Stima prudenziale: 70% delle giornate perse recuperate grazie ai conflitti segnalati in anticipo, valorizzate a 600 € di squadra al giorno. Non include le penali evitate e i committenti che tornano perché consegni in data: quelli valgono il resto.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Dirigere i lavori torna a essere un lavoro di testa, non di telefono.",
  salesBody:
    "La Direzione Lavori cambia 4 abitudini concrete: come pianifichi le fasi, come convochi squadre e artigiani, come documenti le decisioni, come aggiorni il committente.",
  salesImpact: [
    {
      title: "La settimana si pianifica sul calendario, non sul telefono",
      text: "Fasi e squadre si incastrano sul calendario lavori, con i conflitti segnalati mentre pianifichi. Il giro di telefonate del venerdì per organizzare la settimana si riduce a un controllo di 10 minuti.",
    },
    {
      title: "Gli artigiani arrivano quando il cantiere è pronto",
      text: "Le convocazioni si fanno su date che tengono conto delle dipendenze tra fasi. Il piastrellista non trova più il massetto umido, e la tua reputazione con gli artigiani migliora quanto quella coi clienti.",
    },
    {
      title: "Ordini di servizio e verbali in ordine, sempre",
      text: "Ogni decisione della direzione lavori diventa un documento sulla commessa, firmato dove serve. Le discussioni 'io non l'ho mai autorizzato' si chiudono aprendo l'archivio.",
    },
    {
      title: "Il committente si aggiorna da solo, o quasi",
      text: "Report di avanzamento con fasi, percentuali e foto pronti in minuti. Il committente informato regolarmente chiama meno, contesta meno e paga più volentieri.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non un Gantt da stampare. Una direzione lavori collegata al cantiere vero.",
  featureRows: [
    {
      label: "Cronoprogramma per fasi",
      value:
        "Fasi con date, durate, squadre assegnate e dipendenze. Avanzamento alimentato dai rapportini di cantiere: il programma riflette la realtà, non le intenzioni.",
    },
    {
      label: "Calendario lavori con conflitti",
      value:
        "Squadre, fasi e appuntamenti in una vista unica per cantiere e trasversale. Sovrapposizioni e conflitti segnalati al momento della pianificazione.",
    },
    {
      label: "Giornale lavori collegato",
      value:
        "Registrazione giornaliera conforme alimentata dai dati del cantiere: maestranze, mezzi, eventi, foto. Esportazione ordinata per DL, RUP e ispezioni.",
    },
    {
      label: "Documenti DL sulla commessa",
      value:
        "Verbali di sopralluogo, ordini di servizio, comunicazioni, relazioni: tutto archiviato sulla commessa con data e autore, firmabile elettronicamente.",
    },
    {
      label: "Avanzamento fotografico",
      value:
        "Foto datate e geolocalizzate collegate a giornate e fasi. L'avanzamento si dimostra con immagini, non si racconta a voce.",
    },
    {
      label: "Stato avanzamento in 30 secondi",
      value:
        "Per ogni cantiere: fasi completate, in corso e in ritardo, percentuali, prossime scadenze. Il quadro per decidere e per riferire al committente, sempre pronto.",
    },
    {
      label: "Vista multi-cantiere",
      value:
        "Tutti i cantieri con il loro stato di salute in un colpo d'occhio: quali avanzano secondo programma e quali chiedono attenzione questa settimana.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Direzione Lavori cambia la giornata.",
  scenarios: [
    {
      title: "Lo slittamento del massetto visto con 12 giorni di anticipo",
      text: "Il cronoprogramma segnala che la fase massetti è al 40% quando doveva essere al 70%: al ritmo attuale, la posa pavimenti slitta di una settimana. Il DL lo vede 12 giorni prima della convocazione del piastrellista: rinforza la squadra sui massetti e sposta il piastrellista di tre giorni soli. Consegna finale salva, zero giornate perse.",
    },
    {
      title: "Il conflitto elettricista-idraulico che non è mai esistito",
      text: "Pianificando la settimana, il calendario segnala che elettricista e idraulico risultano convocati nello stesso vano tecnico negli stessi due giorni. Il geometra sposta l'idraulico di 48 ore prima ancora di mandare le convocazioni. Sul vecchio metodo si sarebbero incrociati sul posto: mezza giornata persa a testa e due artigiani irritati.",
    },
    {
      title: "Il committente che voleva 'un aggiornamento urgente'",
      text: "Venerdì sera, il committente dell'appalto più grosso chiede lo stato avanzamento per il CDA di lunedì. Il DL apre la commessa: fasi con percentuali, cronoprogramma aggiornato, 40 foto datate, giornale lavori in ordine. Report impaginato e inviato in 20 minuti. Prima sarebbe stato un sabato di telefonate e un documento scritto di corsa domenica notte.",
    },
  ],

  testimonialQuote:
    "Il cronoprogramma lo facevo per il contratto e poi moriva lì: il cantiere andava avanti a telefonate. Adesso le fasi si aggiornano dai rapportini e i conflitti li vedo sul calendario prima di convocare gli artigiani. Sull'ultimo cantiere abbiamo recuperato uno slittamento di due settimane senza toccare la data di consegna: il committente non si è accorto di niente, ed è esattamente il punto.",
  testimonialAuthor: "Fabio D.",
  testimonialRole: "D. Costruzioni e Restauri Srl, Bologna",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare o un tecnico d'impresa vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Cosa include il modulo Direzione Lavori di Edilizia in Cloud?",
      a: "Il modulo Direzione Lavori di Edilizia in Cloud riunisce gli strumenti con cui si dirige un cantiere: cronoprogramma per fasi con avanzamento reale, calendario lavori che segnala i conflitti tra squadre e fasi, giornale lavori collegato ai dati del cantiere e archivio dei documenti DL sulla commessa, con firma elettronica dove serve. Il tutto alimentato dai rapportini quotidiani, senza aggiornamenti manuali.",
    },
    {
      q: "Come si costruisce il cronoprogramma dei lavori?",
      a: "Il cronoprogramma si costruisce definendo le fasi del cantiere — demolizioni, impianti, massetti, finiture — con date, durate e squadre assegnate. Da lì l'avanzamento si aggiorna con i dati dei rapportini di cantiere: quando una fase slitta, lo vedi sul programma con l'effetto sulle fasi successive. Il Gantt stampato e mai aggiornato viene sostituito da un programma che riflette il cantiere vero.",
    },
    {
      q: "Come funziona la segnalazione dei conflitti sul calendario lavori?",
      a: "Il calendario lavori mette nella stessa vista squadre, fasi e appuntamenti di tutti i cantieri. Quando pianifichi qualcosa che si sovrappone — la stessa squadra su due cantieri, due lavorazioni incompatibili nello stesso momento — il conflitto viene segnalato subito, mentre stai pianificando. Così le sovrapposizioni si risolvono sul calendario in ufficio, non sul posto con le squadre ferme.",
    },
    {
      q: "Il giornale lavori è compreso nella Direzione Lavori?",
      a: "Sì. Il giornale lavori digitale è collegato alla Direzione Lavori: la registrazione giornaliera di maestranze, mezzi ed eventi si alimenta dai dati che il cantiere produce con i rapportini, e resta sempre in ordine per DL, RUP e ispezioni. Per gli appalti pubblici è conforme ai requisiti normativi del giornale dei lavori, con firme ed esportazione ordinata.",
    },
    {
      q: "Serve anche al geometra o tecnico esterno che segue i nostri cantieri?",
      a: "Sì. Il tecnico che segue i cantieri — interno o esterno — trova nella stessa piattaforma cronoprogramma, avanzamento, foto datate, giornale e documenti, con accessi controllati dall'impresa. Gli aggiornamenti che prima richiedevano sopralluoghi e telefonate si leggono da remoto in 30 secondi, e i sopralluoghi si concentrano dove servono davvero.",
    },
    {
      q: "La Direzione Lavori è inclusa nei piani Edilizia in Cloud?",
      a: "Sì, gli strumenti di Direzione Lavori — cronoprogramma, calendario con conflitti, giornale lavori e documenti di commessa — fanno parte del gestionale Edilizia in Cloud, senza limiti sul numero di cantieri pianificati. Nella prova gratuita di 31 giorni usi tutto completo, con setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La direzione lavori legge quello che il cantiere scrive ogni giorno.",
  internalLinksBody:
    "Rapportini, foto, giornale, calendario e commesse alimentano lo stesso quadro: chi dirige i lavori decide su dati freschi, non su ricostruzioni.",
  internalLinks: [
    { to: "/funzionalita/calendario-lavori", title: "Calendario Lavori", text: "Squadre e fasi pianificate con conflitti segnalati." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "La registrazione giornaliera conforme del cantiere." },
    { to: "/funzionalita/gestione-commesse", title: "Gestione Commesse", text: "Fasi, costi e documenti della commessa in un posto solo." },
    { to: "/funzionalita/rapportini-cantiere", title: "Rapportini Cantiere", text: "L'avanzamento reale che aggiorna il cronoprogramma." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Avanzamento documentato con foto datate e geolocalizzate." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Verbali e ordini di servizio firmati con valore legale." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Avanzamento fisico ed economico letti insieme." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Il committente aggiornato senza telefonate." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di dirigere i lavori a telefonate. Inizia a vedere slittamenti e conflitti prima che costino.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Direzione Lavori dentro la tua impresa edile. Cronoprogramma per fasi, calendario con conflitti, giornale lavori e documenti DL sulla commessa, setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Cronoprogramma vivo · Conflitti segnalati",

  stickyCtaLabel: "Prova gratis Direzione Lavori",
  stickyCtaMicrocopy: "Setup 48h · Cronoprogramma + calendario",

  applicationSubCategory: "Construction Scheduling Software",

  relatedBlogSlugs: [
    "giornale-dei-lavori-cantiere",
    "libretto-delle-misure",
    "sal-cantiere-come-funziona",
  ],
};

export default function DirezioneLavori() {
  return <FunzionalitaPageTemplate config={config} />;
}
