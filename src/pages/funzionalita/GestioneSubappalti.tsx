import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  HardHat,
  HandCoins,
  Lock,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Target,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "gestione-subappalti",
  vertical: "Gestione Subappalti",
  productName: "Modulo Gestione Subappalti Edilizia in Cloud",
  audience: "General contractor, imprese edili, ristrutturatori, capi cantiere, controller di cantiere, geometri d'impresa",
  audienceShort: "general contractor e imprese edili",

  seo: {
    title:
      "Gestione Subappalti Edilizia",
    description:
      "Gestisci subappaltatori, contratti, SAL, ritenute 4% INPS, DURC e fatture passive in un unico modulo, con alert automatico sui DURC scaduti e blocco pagamenti a rischio.",
    keywords:
      "gestione subappalti software, software subappalti edilizia, ritenuta 4% INPS subappalto, DURC subappaltatore, SAL subappalto edilizia, responsabilità solidale subappalto, fatture passive cantiere, contratto subappalto edile, controllo subappaltatori",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Gestione Subappalti",
  heroH1Lead: "Gestisci subappaltatori, SAL, DURC e ritenute",
  heroH1Highlight: "senza Excel paralleli",
  heroH1Tail: "e senza rischi di responsabilità solidale",
  heroSubheadline:
    "Contratti subappalto, SAL firmati online, ritenuta 4% INPS calcolata in automatico, DURC tracciati con alert prima della scadenza, fatture passive collegate alla commessa giusta. Smetti di rischiare la responsabilità solidale e di pagare subappaltatori non conformi.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "DURC tracciato automaticamente", "Conformità responsabilità solidale"],
  proofPoints: [
    "Ritenuta 4% INPS automatica",
    "Alert DURC in scadenza",
    "Blocca pagamenti non conformi",
  ],

  objectiveRow: [
    ["Obiettivo", "Pagare i subappaltatori giusti, al momento giusto, con i documenti giusti"],
    ["Momento chiave", "Firma contratto, approvazione SAL, fattura passiva, DURC"],
    ["Risultato", "Zero rischio di responsabilità solidale, margine subappalti difeso"],
  ],

  betaH2: "Più di 320 imprese italiane usano Edilizia in Cloud per gestire subappaltatori senza rischi.",
  betaBody:
    "Il modulo Gestione Subappalti è il presidio di compliance del cantiere: lo attiviamo in 48 ore, importiamo l'anagrafica subappaltatori e i contratti aperti, configuriamo il flusso DURC con i tuoi enti (Cassa Edile, INPS, INAIL) e ti accompagniamo in 4 sessioni 1-a-1 fino a quando ogni SAL passa con DURC verificato e ritenuta calcolata in automatico.",

  speedH2: "Il subappalto non è solo un costo: è un rischio legale che vivi ogni giorno.",
  speedSubheadline:
    "L'art. 29 del D.Lgs 276/2003 rende il committente solidalmente responsabile per i debiti retributivi e contributivi del subappaltatore. Significa che se il tuo subappaltatore non paga gli operai o i contributi, lo paghi tu. Edilizia in Cloud ti protegge bloccando i pagamenti quando manca un DURC o quando una ritenuta non è stata applicata.",
  speedStats: [
    { value: 100, suffix: "%", label: "DURC verificati prima del pagamento SAL" },
    { value: 80, prefix: "-", suffix: "%", label: "tempo amministrativo dedicato ai subappalti" },
    { value: 0, suffix: "", label: "rischio di responsabilità solidale per DURC scaduti" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata ai subappalti.",
  familySubheadline:
    "Il subappalto non è un foglio Excel a parte: è una parte centrale del cantiere, del margine, della fatturazione passiva e della compliance fiscale. Edilizia in Cloud lo collega a tutto il resto, così ogni SAL approvato è già il costo della commessa, già la fattura passiva, già il margine aggiornato.",
  familyItems: [
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Contratti, SAL, ritenute, DURC e fatture passive subappaltatori in un unico modulo conforme.",
      to: "/funzionalita/gestione-subappalti",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori. I SAL subappalto si firmano sul cantiere giusto.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Wallet,
      title: "Margini Cantiere",
      text: "Margine reale per commessa. La voce subappalti entra nel margine il giorno del SAL, non della fattura.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Computo metrico con voci di subappalto e margine atteso. Base di confronto per il SAL reale.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture passive subappalto importate e collegate alla commessa, ritenuta 4% applicata in automatico.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Users,
      title: "HR e Personale",
      text: "Operai diretti gestiti fianco a fianco con manodopera in subappalto. Costo orario reale per cantiere.",
      to: "/funzionalita/hr-personale",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Sei moduli che ti proteggono.",
  familyBonusText:
    "Quando contratto subappalto, SAL, ritenuta, DURC, fattura passiva e margine vivono nello stesso strumento, smetti di rischiare omissioni. Il sistema blocca i pagamenti se manca un documento, applica la ritenuta in automatico e tiene tutto pronto per un'eventuale ispezione. Senza file Excel paralleli, senza dimenticanze.",

  painKicker: "Il problema vero",
  painH2: "Pagare un subappaltatore senza DURC ti rende solidalmente responsabile dei suoi debiti.",
  painSubheadline:
    "I subappalti sono la voce di spesa più rischiosa di un'impresa edile: tra responsabilità solidale (art. 29 D.Lgs 276/2003), ritenuta 4% INPS, DURC obbligatorio, asseverazione congruità manodopera (D.L. 76/2020), il margine di errore amministrativo è zero. Una fattura pagata senza DURC verificato vale potenzialmente decine di migliaia di euro di contestazioni.",
  painPoints: [
    {
      icon: ShieldAlert,
      title: "Responsabilità solidale per debiti retributivi e contributivi",
      text: "Se paghi un subappaltatore che non versa contributi INPS o stipendi agli operai, ne rispondi tu come committente (art. 29 D.Lgs 276/2003). Significa potenzialmente decine di migliaia di euro di passività su un subappalto da 30.000€.",
    },
    {
      icon: AlertTriangle,
      title: "DURC scaduti e non rinnovati",
      text: "Il DURC ha validità 4 mesi, dopo va richiesto di nuovo. Se il tuo subappaltatore ti consegna un DURC scaduto e tu paghi, non hai protezione. Senza tracciamento sistematico, il rischio è settimanale.",
    },
    {
      icon: HandCoins,
      title: "Ritenuta 4% INPS calcolata male o dimenticata",
      text: "Il committente deve trattenere il 4% del netto fattura subappaltatore e versarlo all'INPS (art. 35 D.L. 223/2006). Calcolata male o non versata? Sanzioni amministrative e penali fino al 30% dell'importo.",
    },
    {
      icon: FileText,
      title: "Excel paralleli per contratti, SAL e fatture",
      text: "Excel contratti, Excel SAL, Excel ritenute, archivio DURC su Dropbox, fatture passive nella cartella del commercialista. 5 fonti diverse mai allineate, riconciliate manualmente quando arriva un'ispezione.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi subappaltatori, stessi contratti, stesso CCNL. Cambia il presidio di compliance.",
  baSubheadline:
    "I subappalti non si gestiscono per affetto né per fiducia: si gestiscono per documenti. Quando contratti, SAL, DURC e ritenute vivono in un solo strumento, smetti di rischiare e cominci a pagare con tranquillità.",
  baAreas: [
    {
      title: "Contratti subappalto",
      before:
        "Word generico copiato da un vecchio contratto, modificato a mano, firmato in cartaceo, archiviato sulla cartella di rete. Quando il cliente o l'ispettore lo chiede, lo cerchi mezza giornata.",
      after:
        "Template contratto subappalto conforme (con clausole su responsabilità solidale, ritenuta 4%, DURC obbligatorio), firmato elettronicamente dal subappaltatore, archiviato in cloud con marca temporale.",
    },
    {
      title: "Approvazione SAL subappalto",
      before:
        "Subappaltatore presenta un Word con il SAL, capocantiere lo approva a voce, l'amministrazione lo digita su Excel, ci si accorge dopo che le quantità sono diverse dal contratto.",
      after:
        "SAL strutturato sulle voci del contratto, approvazione digitale del DL e capocantiere, confronto automatico con stato avanzamento del cantiere e con le quantità contrattuali. Niente più sorprese.",
    },
    {
      title: "DURC e ritenuta 4%",
      before:
        "DURC richiesto manualmente quando ti ricordi, archiviato come PDF, ritenuta 4% calcolata a mano dal commercialista. Il rischio di pagare senza DURC valido è una bomba a orologeria settimanale.",
      after:
        "DURC tracciato in automatico, alert push prima della scadenza, blocco pagamento se DURC non è valido. Ritenuta 4% calcolata automaticamente in fattura passiva, tracciata per F24 mensile.",
    },
    {
      title: "Fatture passive e margine",
      before:
        "Fattura subappaltatore arriva all'amministrazione, viene caricata su un Excel, riconciliata col SAL settimane dopo, imputata al cantiere giusto se il commercialista se lo ricorda.",
      after:
        "Fattura passiva ricevuta via SDI, riconciliata automaticamente con il SAL, imputata alla commessa giusta, ritenuta 4% applicata in automatico, costo subappalto già nel margine reale del cantiere.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, niente Excel paralleli, niente call di ricordo al commercialista.",
  mechanismSubheadline:
    "Il modulo Subappalti è progettato per chi gestisce 5, 10, 30 subappaltatori in parallelo su più cantieri. La logica è: contratto → SAL → DURC → fattura → ritenuta. Tutto in un solo flusso, tutto tracciato, tutto conforme.",
  mechanismSteps: [
    {
      icon: FileSignature,
      title: "Contratto subappalto firmato online dal subappaltatore",
      text: "Generi il contratto subappalto con template conforme (clausole su responsabilità solidale, ritenuta 4%, DURC obbligatorio, asseverazione congruità manodopera). Il subappaltatore firma online dal telefono, archivio cloud con marca temporale.",
    },
    {
      icon: ClipboardCheck,
      title: "Il SAL è approvato solo se DURC è valido",
      text: "Il subappaltatore presenta SAL dall'app, capocantiere e DL approvano digitalmente. Il sistema verifica automaticamente la validità del DURC: se manca o è scaduto, il SAL non passa allo step successivo.",
    },
    {
      icon: HandCoins,
      title: "Fattura passiva con ritenuta 4% in automatico",
      text: "La fattura passiva arriva via SDI, viene riconciliata col SAL approvato, imputata alla commessa, applica ritenuta 4% INPS in automatico. Il pagamento parte solo dopo verifica DURC e calcolo ritenuta.",
    },
  ],
  mechanismCta: "Prova Subappalti sul tuo prossimo cantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Non un software amministrativo. Una scudo legale e finanziario per la tua impresa.",
  commercialBody:
    "I subappalti generano in media il 25-50% del costo di una commessa edile. Tra rischio responsabilità solidale, ritenute non versate e DURC scaduti, una sola omissione può costarti decine di migliaia di euro di sanzioni e contestazioni. Edilizia in Cloud trasforma il presidio di compliance in un automatismo, non in una preoccupazione.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "Conformità responsabilità solidale",
      text: "Sistema progettato per art. 29 D.Lgs 276/2003 e successive modifiche. Verifica DURC prima di ogni pagamento, traccia ritenuta 4% INPS, conserva contratti firmati e SAL approvati a valore probatorio.",
    },
    {
      icon: Lock,
      title: "Blocco pagamenti non conformi",
      text: "Se manca un DURC valido, se la ritenuta non è applicata, se il SAL non è firmato dal DL, il sistema blocca il pagamento. Tu non rischi di pagare una fattura non conforme nemmeno per distrazione.",
    },
    {
      icon: Bell,
      title: "Alert DURC e congruità manodopera",
      text: "Notifica push 30 giorni prima della scadenza DURC, alert automatico sull'asseverazione congruità manodopera (D.L. 76/2020) e sulla verifica ANAC dei subappaltatori per appalti pubblici.",
    },
    {
      icon: Target,
      title: "Margine subappalti difeso",
      text: "Il SAL approvato entra nel margine reale della commessa il giorno della firma, non il giorno della fattura. Lo scostamento sul preventivo subappalto si vede in tempo reale, non a fine cantiere.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "I subappalti smettono di essere un rischio. Diventano un sistema gestito.",
  resultsBody:
    "Quando i subappalti vivono nello stesso strumento di cantieri, margini, fatturazione e HR, smetti di gestire l'amministrazione 'a sentimento'. Vedi tutto da una dashboard, paghi senza ansia, comunichi al commercialista dati strutturati, dormi tranquillo davanti a un'ispezione.",
  integrationPillars: [
    {
      icon: FileSignature,
      title: "Anagrafica subappaltatori e contratti",
      text: "Anagrafica completa: P.IVA, sede legale, REA, CCNL applicato, codice univoco fatturazione. Contratti subappalto firmati elettronicamente, archivio con marca temporale.",
    },
    {
      icon: ClipboardCheck,
      title: "SAL strutturato e firmato online",
      text: "SAL costruito sulle voci del contratto, percentuale di avanzamento, foto a corredo, firma digitale del DL. Confronto automatico con avanzamento cantiere e con le quantità contrattuali.",
    },
    {
      icon: BadgeCheck,
      title: "DURC e congruità manodopera tracciati",
      text: "Validità DURC monitorata, alert push 30 giorni prima della scadenza, blocco pagamento se scaduto. Asseverazione congruità manodopera (D.L. 76/2020) tracciata per appalti pubblici sopra soglia.",
    },
    {
      icon: HandCoins,
      title: "Ritenuta 4% INPS automatica",
      text: "Calcolata sul netto fattura subappaltatore, tracciata per versamento F24 mensile, esportabile per il commercialista. Mai più sanzioni per ritenute dimenticate o calcolate male.",
    },
  ],
  resultStats: [
    { value: 100, suffix: "%", label: "DURC verificati prima di ogni pagamento SAL" },
    { value: 0, suffix: " €", label: "ritenute 4% dimenticate dopo l'attivazione" },
    { value: 80, prefix: "-", suffix: "%", label: "tempo amministrativo subappalti" },
  ],
  resultsCta: "Apri la dashboard Subappalti",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale evitare un'unica contestazione di responsabilità solidale?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di subappaltatori attivi e volume medio annuo per subappaltatore. La stima parte dal recupero del 2% di margine medio (DURC scaduti pagati, ritenute dimenticate, contestazioni evitate) osservato nei nostri clienti.",
  roi: {
    input1Label: "Subappaltatori attivi",
    input1Default: 8,
    input1Min: 1,
    input1Max: 100,
    input1Step: 1,
    input2Label: "Volume medio annuo per subappaltatore",
    input2Default: 60000,
    input2Min: 5000,
    input2Max: 500000,
    input2Step: 5000,
    input2Suffix: " €",
    outputLabel: "Rischio evitato + margine recuperato/anno",
    computeOutput: (a, b) => Math.round(a * b * 0.02),
    computeSecondary: (a, b) => [
      { label: "Volume subappalti gestito", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(a * b) },
      { label: "Ritenuta 4% gestita/anno", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(a * b * 0.04) },
      { label: "DURC verificati/anno", value: `${a * 4}` },
      { label: "Ore amministrative risparmiate", value: `${Math.round(a * 24)} h` },
    ],
    closingPitch:
      "Stima prudenziale basata su 2% di rischio/margine recuperato. Una sola contestazione di responsabilità solidale evitata vale potenzialmente 10-50x l'abbonamento di un anno.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un modulo amministrativo. Un sistema di protezione e di controllo del subappalto.",
  salesBody:
    "I subappalti sono il punto di rottura più frequente delle PMI edili: rischio legale, costo opaco, amministrazione frammentata. Quando il sistema gestisce in automatico DURC, ritenute, SAL e fatture passive, smetti di temere ispezioni e cominci a vedere il subappalto come una leva di margine, non come una bomba.",
  salesImpact: [
    {
      title: "Compliance senza ansia",
      text: "DURC verificato a ogni pagamento, ritenuta 4% applicata in automatico, congruità manodopera tracciata. Quando arriva un'ispezione INPS o ITL, esporti tutto in 5 minuti.",
    },
    {
      title: "Trattative con subappaltatori più solide",
      text: "Hai dati storici per tipologia di lavoro: chi marginava bene, chi sforava, chi consegnava in tempo. Le prossime trattative si fanno sui numeri, non sulla buona fede.",
    },
    {
      title: "Cassa più prevedibile",
      text: "I pagamenti subappalto sono pianificati su SAL approvati, fatture ricevute, DURC validi. Niente più sorprese di cassa per fatture dimenticate o accelerate dal subappaltatore.",
    },
    {
      title: "Margine subappalti monitorato",
      text: "Lo scostamento tra subappalto preventivato e SAL reali si vede in tempo reale. Quando un subappaltatore sfora del 20%, lo intercetti subito, non a chiusura cantiere.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Anagrafica subappaltatori completa",
      value:
        "P.IVA, sede legale, REA, CCNL applicato, codice univoco SDI, IBAN. Storico contratti, SAL, fatture e DURC consultabili in un click.",
    },
    {
      label: "Contratti subappalto firmabili online",
      value:
        "Template conformi (responsabilità solidale, ritenuta 4%, DURC, asseverazione congruità manodopera). Firma elettronica del subappaltatore, archivio cloud con marca temporale.",
    },
    {
      label: "SAL strutturato e approvazione digitale",
      value:
        "SAL costruito sulle voci del contratto, foto a corredo, percentuali di avanzamento, firma digitale del DL e del capocantiere. Confronto automatico con stato cantiere.",
    },
    {
      label: "Tracciamento DURC e alert scadenze",
      value:
        "Validità DURC monitorata in automatico, alert push 30 giorni prima della scadenza, blocco pagamenti se DURC è scaduto o non valido.",
    },
    {
      label: "Ritenuta 4% INPS automatica",
      value:
        "Calcolata sul netto fattura, tracciata per versamento F24 mensile, esportabile per il commercialista. Conformità art. 35 D.L. 223/2006.",
    },
    {
      label: "Fatture passive collegate alla commessa",
      value:
        "Fatture ricevute via SDI riconciliate automaticamente col SAL, imputate alla commessa giusta, integrate nel margine reale del cantiere senza data entry manuale.",
    },
    {
      label: "Asseverazione congruità manodopera",
      value:
        "Tracciamento dell'asseverazione congruità manodopera (D.L. 76/2020) per appalti pubblici sopra soglia. Alert sui subappalti che richiedono asseverazione CNCE-EdilConnect.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud ti protegge da un rischio reale.",
  scenarios: [
    {
      title: "Stai per pagare un SAL e il DURC è scaduto",
      text:
        "Apri il pagamento SAL del subappaltatore Rossi Edilizia. Il sistema blocca: il DURC è scaduto da 6 giorni. Notifica push, email automatica al subappaltatore per richiedere DURC aggiornato. Niente pagamento finché DURC non è valido. Eviti la responsabilità solidale.",
    },
    {
      title: "Ispezione INPS sui subappalti degli ultimi 12 mesi",
      text:
        "L'ispettore chiede contratti, SAL, DURC e ritenute degli ultimi 12 mesi per 6 subappaltatori. Apri il modulo, esporti il dossier in PDF firmato in 3 minuti: contratti firmati, SAL approvati, DURC al momento del pagamento, ritenute versate. L'ispezione si chiude senza rilievi.",
    },
    {
      title: "Subappaltatore presenta SAL gonfiato",
      text:
        "Il subappaltatore Bianchi presenta un SAL del 40% di avanzamento. Il sistema confronta con lo stato del cantiere registrato dal capocantiere: in realtà il lavoro è al 28%. Il DL approva solo per la quota reale. Eviti di pagare 4.500€ in più per lavori non fatti.",
    },
  ],

  testimonialQuote:
    "Tre anni fa ho pagato un SAL a un subappaltatore che poi non ha versato i contributi. L'INPS è venuta da me. Ora con Edilizia in Cloud ogni pagamento parte solo se il DURC è valido. Non rischio più nulla, e il commercialista riceve dati già pronti per il F24.",
  testimonialAuthor: "Roberto F.",
  testimonialRole: "Costruzioni Ferrari & C., Milano",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Il sistema verifica davvero il DURC prima di ogni pagamento?",
      a: "Sì. La validità DURC è una condizione bloccante per autorizzare il pagamento del SAL e della fattura passiva. Se il DURC è scaduto o non valido, il sistema blocca il pagamento e invia notifica al subappaltatore per richiedere il documento aggiornato. Tu sei automaticamente protetto rispetto all'art. 29 D.Lgs 276/2003.",
    },
    {
      q: "La ritenuta 4% INPS è calcolata in automatico?",
      a: "Sì. La ritenuta 4% (art. 35 D.L. 223/2006) viene calcolata automaticamente sul netto fattura del subappaltatore, tracciata per il versamento F24 mensile e resa esportabile per il commercialista. Mai più sanzioni per ritenute dimenticate o calcolate male.",
    },
    {
      q: "Posso firmare i contratti subappalto online?",
      a: "Sì. Edilizia in Cloud genera contratti subappalto su template conforme (con clausole su responsabilità solidale, ritenuta 4%, DURC obbligatorio, asseverazione congruità manodopera) firmabili elettronicamente dal subappaltatore. Archivio cloud con marca temporale a valore legale.",
    },
    {
      q: "Gestisce l'asseverazione congruità manodopera (D.L. 76/2020)?",
      a: "Sì. Per appalti pubblici sopra soglia, il sistema traccia l'asseverazione congruità manodopera CNCE-EdilConnect e blocca il pagamento se l'asseverazione non è presente. Compatibile con i flussi di Cassa Edile e CNCE.",
    },
    {
      q: "I dati sono compatibili con il mio commercialista?",
      a: "Sì. Edilizia in Cloud esporta dossier subappalto (contratto, SAL, DURC, fatture passive, ritenute) in PDF firmato e tracciati per TeamSystem, Zucchetti, Datev. Il commercialista riceve dati già strutturati per il versamento F24 della ritenuta 4%.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo Gestione Subappalti è incluso nei piani Professional e Business di Edilizia in Cloud. Nessun costo di attivazione, nessun vincolo di durata, cancelli quando vuoi. Onboarding 1-a-1, configurazione DURC e supporto italiano sempre inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "I subappalti vivono collegati a tutto il resto. Ecco come.",
  internalLinksBody:
    "Gestione Subappalti è il presidio di compliance, ma vive grazie ai dati che entrano da preventivi, cantieri, margini, HR e fatturazione. Ecco i moduli e le pagine collegate.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori. I SAL subappalto si firmano sul cantiere giusto.",
    },
    {
      to: "/funzionalita/margini-cantiere",
      title: "Margini Cantiere",
      text: "Margine reale per commessa. La voce subappalti entra nel margine il giorno del SAL approvato.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Computo metrico con voci di subappalto e margine atteso. Base di confronto per il SAL reale.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Fatture passive subappalto importate via SDI, ritenuta 4% applicata in automatico.",
    },
    {
      to: "/funzionalita/hr-personale",
      title: "HR e Personale",
      text: "Operai diretti gestiti fianco a fianco con manodopera in subappalto. Costo orario reale per cantiere.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi AI",
      text: "Per serramentisti: prima/dopo realistico per chiudere preventivi più velocemente.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni AI",
      text: "Per imprese di ristrutturazione: prima/dopo sulla foto reale del cliente.",
    },
    {
      to: "/per/imprese-edili",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma orientata alle imprese edili italiane: gestione, controllo, vendita, fatturazione.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti da 49€/mese. Modulo Subappalti incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di rischiare la responsabilità solidale. Inizia a pagare con tranquillità.",
  finalCtaBody:
    "31 giorni gratuiti per portare Edilizia in Cloud nella gestione dei tuoi subappalti. Setup in 48 ore, importazione anagrafica subappaltatori, configurazione DURC e ritenuta 4% inclusi. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · DURC tracciati · Ritenuta 4% automatica",

  stickyCtaLabel: "Prova gratis Subappalti",
  stickyCtaMicrocopy: "Setup 48h · Cancelli quando vuoi",

  applicationSubCategory: "Construction Subcontractor Management Software",

  relatedBlogSlugs: [
    "sal-cantiere-come-funziona",
    "ccnl-edilizia-guida",
    "controllo-costi-cantiere-guida",
  ],
};

export default function GestioneSubappalti() {
  return <FunzionalitaPageTemplate config={config} />;
}
