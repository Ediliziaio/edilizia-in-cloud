import {
  AlertTriangle,
  Camera,
  Clock,
  Database,
  FileSpreadsheet,
  HardHat,
  MapPin,
  Navigation,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "timbrature-gps",
  definizione:
    "Timbrature GPS di Edilizia in Cloud è l'app con cui gli operai timbrano solo dentro il perimetro del cantiere, grazie al geofence, con foto antifrode alla timbratura e calcolo automatico di ore straordinarie, notturne e festive secondo il CCNL Edilizia.",
  vertical: "Timbrature GPS",
  productName: "Timbrature GPS Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor che gestiscono squadre di operai su più cantieri e vogliono timbrature antifrode con GPS geofence, foto-timbratura e integrazione cedolini paga CCNL Edilizia",
  audienceShort: "imprese edili e general contractor con operai",

  seo: {
    title:
      "Timbrature GPS Cantiere Edilizia",
    description:
      "App mobile timbrature operai con GPS geofence cantiere, foto-timbratura antifrode, calcolo automatico ore extra e notturne CCNL Edilizia e integrazione paghe.",
    keywords:
      "timbrature GPS edilizia, app timbrature operai cantiere, geofence cantiere edilizia, antifrode timbrature edilizia, CCNL edilizia ore extra, cedolini paga edilizia, timbratura foto cantiere, software presenze edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Timbrature GPS",
  heroH1Lead: "Timbrature operai con GPS",
  heroH1Highlight: "geofence cantiere",
  heroH1Tail: "e foto antifrode",
  heroSubheadline:
    "App mobile timbrature per operai con GPS geofence che valida l'ingresso solo dentro i confini del cantiere, foto-timbratura antifrode, calcolo automatico ore extra/notturne/festive secondo CCNL Edilizia, integrazione cedolini paga. Recupera 30€/h di ore non lavorate ma dichiarate, conformità D.Lgs 81/2008 garantita.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Antifrode GPS + foto", "Conformità CCNL Edilizia"],
  proofPoints: [
    "Geofence cantiere automatico",
    "Foto-timbratura antifrode",
    "Cedolini paga integrati",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare ore dichiarate ma non lavorate"],
    ["Momento chiave", "Ingresso e uscita di ogni operaio in cantiere"],
    ["Risultato", "Recupero medio 1.800€/operaio/anno"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano Timbrature GPS per chiudere il problema delle ore non tracciate.",
  betaBody:
    "Le Timbrature GPS le attiviamo in 48 ore: configuriamo i geofence dei cantieri attivi (raggio personalizzabile), distribuiamo l'app agli operai, configuriamo i turni CCNL Edilizia, integriamo con il software cedolini paga e ti accompagniamo in 4 sessioni 1-a-1 fino al primo cedolino calcolato in automatico.",

  speedH2:
    "Un'impresa con 20 operai perde mediamente 6 ore/operaio/mese di ore dichiarate ma non lavorate. A 30€/h fa 43.200€/anno.",
  speedSubheadline:
    "Senza tracciamento GPS oggettivo, l'autodichiarazione cartacea genera 4-8 ore al mese di ore 'gonfiate' per operaio: arrivi posticipati non dichiarati, pause prolungate, uscite anticipate. Le timbrature GPS rendono questo impossibile, recuperando il valore reale del lavoro.",
  speedStats: [
    { value: 1800, prefix: "€ ", suffix: "/anno", label: "recupero medio per operaio" },
    { value: 6, suffix: " h/mese", label: "ore non lavorate ma dichiarate (media)" },
    { value: 100, suffix: "%", label: "timbrature validate da GPS geofence" },
  ],

  familyH2: "Le Timbrature GPS collegate a HR, cantieri e fatturazione.",
  familySubheadline:
    "Le ore tracciate alimentano direttamente cedolini paga, costo orario cantiere, margine progetto, fatture in stato avanzamento lavori. Una sola fonte di verità per ore lavorate, niente foglio Excel del capocantiere.",
  familyItems: [
    {
      icon: Users,
      title: "HR & Personale",
      text: "Cedolini paga calcolati automaticamente dalle ore GPS per CCNL Edilizia.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Ore operai imputate al cantiere giusto per costo e margine reale.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Costo manodopera reale alimenta analisi margine in tempo reale.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "Presenza certificata su cantiere per conformità D.Lgs 81/2008.",
      to: "/funzionalita/sicurezza-cantiere",
    },
    {
      icon: Wallet,
      title: "Cassa Cantiere",
      text: "Ore lavorate tracciate alimentano fatturazione SAL clienti.",
      to: "/funzionalita/cassa-cantiere",
    },
    {
      icon: FileSpreadsheet,
      title: "Giornale Lavori",
      text: "Squadra presente in cantiere registrata automaticamente nel giornale.",
      to: "/funzionalita/giornale-lavori",
    },
  ],
  familyBonusTitle: "Una sola fonte di ore lavorate. Cedolini, costo cantiere, sicurezza allineati.",
  familyBonusText:
    "Quando l'operaio timbra all'ingresso cantiere, il sistema valida via GPS, foto, eventualmente fingerprint, registra l'ora, imputa al cantiere giusto, alimenta giornale lavori sicurezza, popola cedolino paga, aggiorna costo manodopera del cantiere. Tu non tocchi un foglio.",

  painKicker: "Il problema vero",
  painH2:
    "Operai che dichiarano 8 ore ma ne lavorano 6. Capocantiere che firma fogli a memoria. Cedolini paga che bruciano weekend.",
  painSubheadline:
    "L'autodichiarazione cartacea o WhatsApp è il sistema standard nelle imprese edili: produce 4-8 ore al mese di ore 'gonfiate' per operaio e cedolini paga calcolati a mano nel weekend dal titolare. È un costo enorme che non si vede in bilancio.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Ore dichiarate ma non lavorate",
      text: "Operaio dichiara 8:00-17:00 ma è arrivato alle 8:30 e uscito alle 16:30. Su 20 operai per 22 giorni fa 88 ore al mese non lavorate ma pagate. A 30€/h sono 2.640€/mese, 31.680€/anno bruciati.",
    },
    {
      icon: Clock,
      title: "Calcolo cedolini paga manuale",
      text: "Titolare passa il weekend a calcolare ore extra, notturne, festive secondo CCNL Edilizia. Errori frequenti, contestazioni operai, riliquidazioni. 8-12 ore di lavoro mensile improduttivo.",
    },
    {
      icon: ShieldCheck,
      title: "Mancanza prova presenza per sicurezza",
      text: "In caso di infortunio o controllo ASL, serve prova certificata di chi era in cantiere e quando. Foglio firme cartaceo è facilmente contestabile, GPS oggettivo no. Conformità D.Lgs 81/2008 a rischio.",
    },
    {
      icon: Database,
      title: "Costo manodopera cantiere stimato",
      text: "Quanto è costato il cantiere X in manodopera? 'Faccio una stima a sentimento'. Senza ore certificate per cantiere, il margine è opaco. Cantieri in perdita scoperti solo a fine lavori.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi operai, stessi cantieri, stessi turni. Cambia il valore reale recuperato.",
  baSubheadline:
    "Le Timbrature GPS non aumentano la produttività degli operai bravi: eliminano l'inefficienza nascosta. Chi lavorava bene continua a lavorare bene, chi gonfiava le ore smette. Il valore recuperato va sul margine.",
  baAreas: [
    {
      title: "Validazione presenza in cantiere",
      before:
        "Foglio firme cartaceo o WhatsApp '8:00 in cantiere'. Capocantiere che firma a memoria a fine settimana. Ore facilmente contestabili in tribunale e davanti all'ASL.",
      after:
        "Timbratura validata via GPS dentro geofence cantiere + foto + timestamp criptato. Prova oggettiva e inattaccabile, conforme D.Lgs 81/2008 e CCNL Edilizia.",
    },
    {
      title: "Calcolo ore extra e notturne",
      before:
        "Titolare nel weekend con foglio CCNL Edilizia in mano, calcola maggiorazioni ore extra (25%/35%/50%), notturne, festive. 8-12 ore di lavoro mensile, errori frequenti.",
      after:
        "Sistema calcola automaticamente maggiorazioni CCNL Edilizia in tempo reale. Ore extra +25%, notturne +35%, festive +50%, riposi compensativi. Cedolino pronto in 5 minuti.",
    },
    {
      title: "Imputazione ore al cantiere",
      before:
        "Capocantiere annota a memoria 'oggi Mario al Cantiere Roma, Luca al Cantiere Milano'. Errori di imputazione, costo manodopera per cantiere stimato.",
      after:
        "GPS riconosce automaticamente in quale cantiere si trova l'operaio. Ore imputate al cantiere giusto al minuto. Costo manodopera per cantiere certificato e accurato.",
    },
    {
      title: "Conformità sicurezza ASL/SPRESAL",
      before:
        "ASL/SPRESAL chiede registro presenze. Foglio firme cartaceo presentato, possibili dubbi sulla veridicità, sanzioni.",
      after:
        "Esporti registro presenze GPS-validato con timestamp, geolocalizzazione, foto. ASL accetta come prova oggettiva, conformità D.Lgs 81/2008 garantita.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare le timbrature dei tuoi operai nel 21esimo secolo.",
  mechanismSubheadline:
    "Le Timbrature GPS funzionano in modo passivo per l'operaio (apre app, timbra, va) e attivo per il sistema (valida GPS, foto, calcola maggiorazioni CCNL, imputa al cantiere). Niente formazione operaio richiesta.",
  mechanismSteps: [
    {
      icon: MapPin,
      title: "Geofence cantiere configurato",
      text: "Configuri il perimetro di ogni cantiere attivo (raggio 50-200 metri). La timbratura è valida solo se l'operaio è dentro il geofence. Indirizzo automatico da preventivo cantiere.",
    },
    {
      icon: Smartphone,
      title: "Operaio timbra da app mobile",
      text: "App iOS/Android: operaio apre, app rileva GPS, scatta foto se richiesta, timbra. Tempo medio: 8 secondi. Funziona offline (sync quando rientra in copertura).",
    },
    {
      icon: Sparkles,
      title: "Calcolo automatico CCNL Edilizia",
      text: "Sistema calcola in tempo reale: ore ordinarie, extra (+25%), notturne (+35%), festive (+50%), riposi compensativi. Cedolini pronti automaticamente, esportabili al consulente del lavoro.",
    },
  ],
  mechanismCta: "Apri la demo Timbrature GPS",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "1.800€/operaio/anno recuperati. Cedolini in 5 minuti. ASL serena.",
  commercialBody:
    "Le Timbrature GPS non sono un controllo punitivo: sono uno strumento di equità (chi lavora bene è valorizzato, chi gonfiava smette) e di efficienza (cedolini calcolati in 5 minuti, costo cantiere reale).",
  commercialLevers: [
    {
      icon: TrendingDown,
      title: "Recupero 1.800€/operaio/anno",
      text: "Stima media basata su 6 ore/mese di ore non lavorate × 12 mesi × 30€/h. Per impresa con 20 operai: 36.000€ anno recuperati netti, ROI in 1 mese.",
    },
    {
      icon: Zap,
      title: "Cedolini in 5 minuti, non 12 ore",
      text: "Calcolo automatico maggiorazioni CCNL Edilizia. Da 12 ore di weekend del titolare a 5 minuti di approvazione. Recupero netto 11+ ore al mese del titolare.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità ASL/SPRESAL garantita",
      text: "Registro presenze GPS-validato con timestamp e foto, accettato come prova oggettiva da ASL. Sanzioni evitate, controlli che si chiudono in 10 minuti.",
    },
    {
      icon: Target,
      title: "Margine cantiere finalmente reale",
      text: "Costo manodopera per cantiere certificato al minuto. Margini cantiere veri, decisioni di pricing future basate su dato vero, non stime.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Le ore in cantiere smettono di essere un'opinione. Diventano un dato certificato.",
  resultsBody:
    "Quando le ore lavorate sono validate via GPS oggettivo, l'impresa cambia paradigma: chi lavora bene è valorizzato, chi gonfiava smette di farlo, costo cantiere è certificato, conformità D.Lgs 81/2008 garantita. Le imprese che attivano Timbrature GPS vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Navigation,
      title: "GPS geofence intelligente",
      text: "Perimetro cantiere con raggio configurabile (50-200m). Validazione in tempo reale, niente timbrature 'da casa'. Riconoscimento automatico cantiere per operai multi-sito.",
    },
    {
      icon: Camera,
      title: "Foto-timbratura antifrode",
      text: "Foto del volto operaio scattata al momento della timbratura, validata con face matching opzionale. Niente scambi di telefoni, niente timbrature per conto.",
    },
    {
      icon: Sun,
      title: "CCNL Edilizia integrato",
      text: "Maggiorazioni ore extra (+25%), notturne (+35%), festive (+50%), pasti, indennità trasferta. Aggiornato automaticamente alle ultime versioni CCNL.",
    },
    {
      icon: Wallet,
      title: "Cedolini paga 1-click",
      text: "Esportazione cedolini in formato del consulente del lavoro (Zucchetti, TeamSystem, Buffetti), o calcolo diretto se gestisci la paga internamente.",
    },
  ],
  resultStats: [
    { value: 1800, prefix: "€ ", suffix: "/anno", label: "recupero medio per operaio" },
    { value: 95, prefix: "+", suffix: "%", label: "tempo risparmiato sul calcolo cedolini" },
    { value: 100, suffix: "%", label: "presenze certificate per ASL e D.Lgs 81/2008" },
  ],
  resultsCta: "Apri la demo Timbrature GPS",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se le ore non lavorate ma dichiarate diventano impossibili?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di operai e ore mediamente perse al mese per operaio. La stima usa 30€/h di costo orario lordo medio CCNL Edilizia.",
  roi: {
    input1Label: "Operai gestiti",
    input1Default: 20,
    input1Min: 5,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Ore perse/operaio/mese",
    input2Default: 6,
    input2Min: 1,
    input2Max: 15,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Recupero annuo stimato",
    computeOutput: (a, b) => Math.round(a * b * 12 * 30),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno totale", value: `${a * b * 12} h` },
      { label: "Cantieri con costo certificato", value: "Tutti" },
      { label: "Tempo titolare cedolini risparmiato/anno", value: `${11 * 12} h` },
    ],
    closingPitch:
      "Stima prudenziale basata su 30€/h costo orario lordo CCNL Edilizia (operaio comune + oneri). Aggiungi le 11+ ore mensili del titolare risparmiate sui cedolini e le sanzioni ASL evitate.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un controllore. Uno strumento di equità che valorizza chi lavora bene.",
  salesBody:
    "Le Timbrature GPS Edilizia in Cloud non sono percepite come 'sorveglianza' dagli operai: sono percepite come 'finalmente le mie ore extra vengono pagate giuste'. Le imprese che le attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Operai bravi che restano",
      text: "Operai diligenti vedono ore extra finalmente pagate giuste con maggiorazioni CCNL automatiche. Smettono di sentirsi 'sfruttati' come quelli che gonfiano. Turnover ridotto.",
    },
    {
      title: "Operai che gonfiavano si auto-selezionano",
      text: "Operai che gonfiavano sistematicamente le ore vedono che il sistema non lo permette più. O cambiano comportamento, o se ne vanno. Selezione naturale.",
    },
    {
      title: "Cedolini paga in 5 minuti",
      text: "Titolare smette di passare il weekend a calcolare maggiorazioni a mano. 11+ ore mensili recuperate da dedicare a vendita, gestione cantieri, sviluppo impresa.",
    },
    {
      title: "Margine cantiere certificato",
      text: "Costo manodopera per cantiere preciso al minuto. Pricing futuri basati su dato reale, non stime ottimistiche. Cantieri marginali identificati subito.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "App mobile iOS/Android",
      value:
        "App nativa multi-lingua (italiano, rumeno, albanese, arabo). Funziona offline, sync automatico in copertura. Tempo timbratura medio 8 secondi.",
    },
    {
      label: "GPS geofence per cantiere",
      value:
        "Perimetro configurabile 50-200m da indirizzo cantiere o pin geografico. Validazione in tempo reale, riconoscimento automatico cantiere per operai multi-sito.",
    },
    {
      label: "Foto-timbratura antifrode",
      value:
        "Foto operaio scattata al momento timbratura, opzionale face matching. Impedisce scambi di telefoni e timbrature 'per conto'. Storico foto consultabile.",
    },
    {
      label: "Calcolo automatico CCNL Edilizia",
      value:
        "Ore ordinarie, extra +25%, notturne +35%, festive +50%, riposi compensativi, pasti, indennità trasferta. CCNL aggiornato automaticamente alle ultime versioni.",
    },
    {
      label: "Imputazione automatica al cantiere",
      value:
        "GPS riconosce in quale cantiere è l'operaio, imputa ore al cantiere giusto. Operai multi-sito gestiti senza intervento del capocantiere.",
    },
    {
      label: "Cedolini paga 1-click",
      value:
        "Export Zucchetti, TeamSystem, Buffetti, o formato custom per il consulente del lavoro. Cedolino calcolato in 5 minuti, niente più weekend bruciati.",
    },
    {
      label: "Registro presenze ASL/SPRESAL",
      value:
        "Esportazione registro presenze GPS-validato con timestamp e foto, formato accettato da ASL/SPRESAL come prova oggettiva. Conformità D.Lgs 81/2008.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui le Timbrature GPS cambiano la giornata.",
  scenarios: [
    {
      title: "Calcolo cedolini paga del 27",
      text: "Il 27 del mese, anziché 12 ore di weekend con CCNL Edilizia in mano, apri Timbrature GPS, esporti cedolini calcolati in automatico, mandi al consulente. Lavoro fatto in 15 minuti, weekend libero per la famiglia.",
    },
    {
      title: "Controllo SPRESAL improvviso",
      text: "Mercoledì 9:00 arriva SPRESAL: vogliono registro presenze ultimi 90 giorni. Esporti registro GPS con foto e timestamp in 3 minuti. Ispettore valida la conformità, audit chiuso senza sanzioni.",
    },
    {
      title: "Cantiere in perdita identificato presto",
      text: "Apri analisi margini: cantiere Via Roma ha 320 ore di manodopera GPS-validate vs 200 stimate. Costo +60% rispetto a preventivo. Capisci subito che il cantiere è in perdita, intervieni con varianti prima di chiudere in rosso.",
    },
  ],

  testimonialQuote:
    "Avevo 18 operai e dichiaravano tutti 8 ore al giorno. Il primo mese con Timbrature GPS ho scoperto che la media reale era 7,2 ore: 0,8 ore al giorno × 18 operai × 22 giorni = 317 ore al mese non lavorate ma pagate. A 30€/h sono 9.500€/mese, 114.000€/anno. Non ero ottimista quando ho attivato il modulo, sono rimasto a bocca aperta.",
  testimonialAuthor: "Giuseppe C.",
  testimonialRole: "Cantieri Mediterraneo Srl, Bari",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Gli operai accettano la timbratura GPS o si ribellano?",
      a: "Gli operai diligenti la apprezzano, perché vedono ore extra finalmente pagate giuste con maggiorazioni CCNL automatiche. Solo chi gonfiava le ore può lamentarsi: in questo caso, il problema non è il GPS ma il comportamento. Statisticamente, dopo 30 giorni l'80% degli operai considera il sistema 'più giusto del precedente'.",
    },
    {
      q: "È legale fare timbrature GPS ai dipendenti? Cosa dice il GDPR?",
      a: "Sì, conforme allo Statuto dei Lavoratori e GDPR purché: 1) accordo sindacale o autorizzazione INL, 2) informativa privacy specifica, 3) GPS attivo solo durante orario di lavoro. Nei piani di onboarding ti forniamo modelli di accordo e informativa pronti per consulente del lavoro.",
    },
    {
      q: "Funziona anche dove non c'è copertura mobile (cantieri remoti)?",
      a: "Sì. L'app funziona offline: registra timbratura, GPS, foto, timestamp localmente. Quando l'operaio rientra in copertura, sync automatico. I dati GPS sono criptati e firmati, non manipolabili nemmeno offline.",
    },
    {
      q: "Si integra con il software del consulente del lavoro?",
      a: "Sì. Esportazione nei formati Zucchetti, TeamSystem, Buffetti e altri principali consulenti italiani. Se il tuo consulente usa un sistema custom, configuriamo export CSV/Excel su misura nel piano Business.",
    },
    {
      q: "Cosa succede se l'operaio lascia il telefono in cantiere e se ne va?",
      a: "Sistema rileva GPS fermo per >30 minuti, invia push 'sei ancora in cantiere?'. Se nessuna risposta, segnala anomalia al capocantiere. La foto-timbratura uscita è obbligatoria: chi se ne va senza timbrare non chiude le ore lavorate.",
    },
    {
      q: "Quanto costa? Ci sono limiti su numero di operai o cantieri?",
      a: "Timbrature GPS è inclusa nei piani Professional e Business di Edilizia in Cloud. Operai illimitati, cantieri illimitati, app iOS/Android incluse. Costo aggiuntivo solo se vuoi face matching avanzato (piano Business).",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Le Timbrature GPS sono il fondamento dell'amministrazione operativa.",
  internalLinksBody:
    "Le ore certificate alimentano cedolini, costo cantiere, margine progetto e conformità sicurezza. Una sola fonte di verità per le ore lavorate.",
  internalLinks: [
    { to: "/funzionalita/hr-personale", title: "HR & Personale", text: "Cedolini paga calcolati automaticamente dalle ore GPS." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Ore operai imputate al cantiere giusto per costo reale." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costo manodopera reale per analisi margine in tempo reale." },
    { to: "/funzionalita/sicurezza-cantiere", title: "Sicurezza Cantiere", text: "Presenza certificata per conformità D.Lgs 81/2008." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Squadra presente registrata automaticamente nel giornale." },
    { to: "/funzionalita/cassa-cantiere", title: "Cassa Cantiere", text: "Ore lavorate alimentano fatturazione SAL clienti." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Timbrature GPS anche per ditte subappaltatrici." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Timbrature GPS incluse nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di pagare ore non lavorate. Inizia a sapere chi era in cantiere e quando.",
  finalCtaBody:
    "31 giorni gratuiti per portare le Timbrature GPS dentro la tua impresa edile. Setup in 48 ore, geofence cantieri, foto-timbratura, calcolo CCNL Edilizia automatico e integrazione cedolini paga inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · GPS + foto antifrode · CCNL Edilizia",

  stickyCtaLabel: "Prova gratis Timbrature GPS",
  stickyCtaMicrocopy: "Setup 48h · Geofence + foto antifrode",

  applicationSubCategory: "Construction Time Tracking GPS Software",

  relatedBlogSlugs: [
    "gestione-operai-cantiere-presenze-ore",
    "registro-presenze-cantiere-obbligatorio",
    "durc-congruita-manodopera-soglie",
  ],
};

export default function TimbratureGps() {
  return <FunzionalitaPageTemplate config={config} />;
}
