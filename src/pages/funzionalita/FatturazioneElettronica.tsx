import {
  Archive,
  Banknote,
  CalendarClock,
  ClipboardList,
  Clock,
  CloudUpload,
  Database,
  FileCheck,
  FileSignature,
  FileText,
  HardHat,
  Landmark,
  Receipt,
  Send,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "fatturazione-elettronica",
  vertical: "Fatturazione Elettronica",
  productName: "Modulo Fatturazione Elettronica Edilizia in Cloud",
  audience: "Imprese edili, costruttori, ristrutturatori, general contractor, studi tecnici",
  audienceShort: "imprese edili",

  seo: {
    title:
      "Fatturazione Elettronica Edilizia",
    description:
      "Emetti fatture elettroniche direttamente dai SAL di cantiere: invio SDI automatico, conservazione sostitutiva 10 anni inclusa, fattura PA con CIG/CUP,…",
    keywords:
      "fatturazione elettronica edilizia, fattura elettronica SDI costruzioni, SAL fattura elettronica, conservazione sostitutiva edilizia, fattura elettronica impresa edile, software fatturazione cantiere, fattura PA edilizia, split payment edilizia, CIG CUP fattura",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Fatturazione Elettronica",
  heroH1Lead: "Dal SAL alla fattura SDI",
  heroH1Highlight: "in due click",
  heroH1Tail: "senza più copia-incolla.",
  heroSubheadline:
    "La fatturazione elettronica nativa per le imprese edili: emetti FE direttamente dal SAL, trasmetti allo SDI in automatico, conservi 10 anni a norma, gestisci CIG/CUP e split payment per la PA. Tutto dentro la stessa piattaforma dove vivono i tuoi cantieri.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Conservazione 10 anni inclusa",
    "Onboarding 1-a-1 incluso",
    "Cancelli quando vuoi",
  ],
  proofPoints: [
    "Conforme SDI · TD01-TD24",
    "Fattura PA con split payment",
    "Export commercialista incluso",
  ],

  objectiveRow: [
    ["Obiettivo", "Trasformare il SAL approvato in fattura SDI senza ricopiature"],
    ["Momento chiave", "Chiusura del SAL, fine mese, scadenza pagamenti PA"],
    ["Risultato", "Tempi di incasso più brevi, zero rifiuti SDI"],
  ],

  betaH2: "320+ imprese italiane fatturano dal nostro gestionale ogni mese, senza un solo rifiuto SDI.",
  betaBody:
    "La fatturazione elettronica di Edilizia in Cloud è già usata in produzione da imprese che fatturano da 100 mila a 30 milioni di euro l'anno. Tracciati TD01-TD24, integrazione nativa con cantieri e SAL, conservazione 10 anni inclusa, supporto italiano e onboarding dedicato per il primo ciclo di fatturazione.",

  speedH2: "Da 4 ore a settimana di lavoro amministrativo a 20 minuti, dimostrato dai nostri clienti.",
  speedSubheadline:
    "Non vendiamo un servizio di fatturazione generico. Vendiamo un flusso integrato in cui il SAL del cantiere genera la fattura, l'invio SDI è automatico, la conservazione è inclusa e il commercialista riceve un export pronto.",
  speedStats: [
    { value: 4, prefix: "-", suffix: " h/sett", label: "tempo amministrativo per emissione fatture e SDI" },
    { value: 0, suffix: "", label: "rifiuti SDI medi sui clienti dopo il primo mese di setup" },
    { value: 100, suffix: "%", label: "fatture archiviate a norma in conserva digitale 10 anni" },
  ],

  familyH2: "La fatturazione non è un'app a sé. È collegata a tutto il ciclo di lavoro.",
  familySubheadline:
    "Ogni fattura nasce da un cantiere, da un SAL o da un ordine, e finisce su uno scadenzario. Edilizia in Cloud connette automaticamente i pezzi: niente più Excel intermedio, niente più richiamo al commercialista.",
  familyItems: [
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Emissione, invio SDI, ricezione passiva, conservazione 10 anni, fattura PA con CIG/CUP e split payment.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "I cantieri generano i SAL, i SAL diventano fatture. Tutta la storia commerciale è nello stesso posto.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Wallet,
      title: "Margini Cantiere",
      text: "Ogni fattura attiva e passiva alimenta il margine reale per commessa, in tempo reale.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Dal preventivo accettato al SAL, dal SAL alla fattura: un solo flusso, zero ricopiature.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Le fatture passive dei subappaltatori arrivano già collegate al SAL del subappalto e al cantiere giusto.",
      to: "/funzionalita/gestione-subappalti",
    },
    {
      icon: Users,
      title: "HR e Personale",
      text: "Costo orario reale e busta paga collegati alla commessa, alimentano marginalità e fatturazione.",
      to: "/funzionalita/hr-personale",
    },
  ],
  familyBonusTitle: "Una piattaforma. Un abbonamento. Sei moduli connessi.",
  familyBonusText:
    "Niente più tre software diversi che non si parlano: cantiere, fatturazione e contabilità sono lo stesso flusso. Il commercialista riceve un export pronto per i suoi tracciati. Tu non ti accorgi nemmeno di stare 'fatturando': sta succedendo nella stessa schermata in cui controlli i cantieri.",

  painKicker: "Il problema vero",
  painH2: "La fatturazione edile non è quella di un consulente. È peggio. Molto peggio.",
  painSubheadline:
    "SAL trimestrali, ritenute, varianti, split payment, CIG e CUP, fattura su PA, fattura su privato, fattura proforma, nota di credito su variante. Senza un sistema integrato, ogni ciclo di fatturazione è un cantiere a sé.",
  painPoints: [
    {
      icon: Clock,
      title: "Emissione fattura lenta e manuale",
      text: "Compilare una FE da zero dopo ogni SAL richiede dati sparsi tra Excel del cantiere, mail del cliente, contratto firmato e DDT dei materiali. Poi devi caricarla su un portale separato.",
    },
    {
      icon: XCircle,
      title: "Rifiuti SDI per errori invisibili",
      text: "Codice fiscale sbagliato, codice SDI errato, formato data non conforme, campo CIG dimenticato: la fattura torna rifiutata e devi ripartire. Nel frattempo l'incasso slitta.",
    },
    {
      icon: Archive,
      title: "Conservazione sostitutiva non a norma",
      text: "Le FE vanno conservate per 10 anni in modo conforme. Salvarle in una cartella OneDrive o sul gestionale del commercialista non basta: in caso di verifica rischi sanzioni reali.",
    },
    {
      icon: FileText,
      title: "Riconciliazione SAL ↔ fattura ↔ contabilità",
      text: "Ogni mese il commercialista chiede tracciati. Ogni mese qualcuno copia righe da un Excel a un PDF a un portale. Errori, discrepanze e ore perse in un processo che potrebbe essere automatico.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa azienda. Stessi clienti. Solo un ciclo di fatturazione che gira da solo.",
  baSubheadline:
    "Non cambia l'organizzazione contabile. Cambia dove vivono i dati e quanto tempo ci metti a chiudere il mese. Ecco cosa cambia nelle 4 dimensioni che pesano di più sull'amministrativo.",
  baAreas: [
    {
      title: "Emissione e invio fattura",
      before:
        "Apri Excel del SAL, copi gli importi su un portale di fatturazione, inserisci i dati cliente, controlli il codice destinatario, generi l'XML, lo invii allo SDI, salvi il file da qualche parte.",
      after:
        "Approvi il SAL nella commessa. La fattura SDI è già pronta con tutti i dati corretti. Un click e parte allo SDI. Le ricevute di consegna e accettazione tornano in dashboard.",
    },
    {
      title: "Conservazione decennale",
      before:
        "PDF e XML salvati in OneDrive, in cartelle anno/mese, sperando che il commercialista li abbia conservati lui. Verifica fiscale = panico.",
      after:
        "Conservazione sostitutiva 10 anni inclusa. Ogni FE è conservata a norma con marca temporale e firma digitale. Esibibile a richiesta dell'Agenzia in 30 secondi.",
    },
    {
      title: "Fattura PA con CIG/CUP",
      before:
        "Errori CIG, split payment scordato, esigibilità IVA sbagliata, formato XMLPA non conforme. Risultato: rifiuti, solleciti, pagamenti che slittano di settimane.",
      after:
        "Codice CIG e CUP gestiti nativamente, split payment automatico, esigibilità preimpostata sul cliente PA. Fattura accettata al primo invio, pagamento entro 30/60 giorni.",
    },
    {
      title: "Chiusura mensile e commercialista",
      before:
        "Email al commercialista con allegati misti, tabella Excel di riepilogo che non torna, telefonate per chiarire codici IVA, registri da rifare.",
      after:
        "Export mensile pronto in 1 click: PDF, Excel e tracciato compatibile con TeamSystem, Zucchetti e Datev. Il commercialista riceve un pacchetto già strutturato.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passi dal cantiere alla fattura, senza nessuno che inserisca dati a mano.",
  mechanismSubheadline:
    "L'integrazione nativa tra cantiere, SAL e fatturazione è quello che cambia tutto. Edilizia in Cloud non è un portale di FE generico: è un flusso pensato per il ciclo di lavoro dell'edilizia italiana.",
  mechanismSteps: [
    {
      icon: ClipboardList,
      title: "Approvi il SAL nel cantiere",
      text: "Il SAL nasce dal cantiere, con avanzamento, ore, materiali e subappalti già imputati. Lo approvi con firma digitale del DL e del cliente.",
    },
    {
      icon: FileSignature,
      title: "La fattura SDI è già pronta",
      text: "Tutti i dati cliente, codice destinatario, IVA, ritenute, CIG/CUP, split payment sono già impostati sull'anagrafica. La fattura si compila da sola sul SAL approvato.",
    },
    {
      icon: Send,
      title: "Invio SDI e conservazione automatica",
      text: "La FE viene trasmessa allo SDI in automatico. Le ricevute tornano in dashboard. La conservazione 10 anni è attivata senza ulteriori passaggi.",
    },
  ],
  mechanismCta: "Provalo gratis sul tuo primo SAL",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Più velocità di incasso, meno rifiuti SDI, conservazione decennale inclusa.",
  commercialBody:
    "La fatturazione elettronica integrata non è un risparmio di tempo: è un cambio di game. Le imprese edili che la adottano abbassano il DSO (giorni medi di incasso), eliminano i rifiuti SDI e tagliano il costo del commercialista per le riconciliazioni.",
  commercialLevers: [
    {
      icon: Zap,
      title: "Tagli i tempi di incasso",
      text: "Una fattura emessa il giorno della chiusura SAL incassa prima di una emessa 10 giorni dopo. Edilizia in Cloud comprime il ciclo a poche ore.",
    },
    {
      icon: ShieldCheck,
      title: "Zero rifiuti SDI dopo il primo mese",
      text: "I controlli sui campi obbligatori, sui formati e sulle anagrafiche bloccano l'invio di una FE non conforme. Una volta impostate le anagrafiche, i rifiuti SDI scendono a zero.",
    },
    {
      icon: Database,
      title: "Conservazione 10 anni inclusa",
      text: "Niente servizio esterno, nessun costo extra a fattura. Marca temporale, firma digitale, esibizione a norma: tutto incluso nel canone.",
    },
    {
      icon: Banknote,
      title: "Scadenzario incassi e solleciti",
      text: "Vedi quali fatture sono pagate, quali in scadenza, quali in ritardo. Solleciti automatici via email con il riepilogo. Riduci i giorni medi di incasso.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Non un portale di fatturazione. Il braccio amministrativo del tuo gestionale.",
  resultsBody:
    "Tutte le fatture parlano con i cantieri, i margini, il commercialista. La conservazione è inclusa, il rapporto col cliente PA è semplice, la chiusura mensile diventa una operazione da 20 minuti.",
  integrationPillars: [
    {
      icon: FileCheck,
      title: "Tracciati TD01 → TD24",
      text: "Tutti i tipi documento gestiti nativamente: TD01 fattura, TD04 nota credito, TD16 reverse charge interno, TD20 autofattura, TD24 fattura differita.",
    },
    {
      icon: Landmark,
      title: "Fattura PA nativa",
      text: "Codice CIG, CUP, split payment, esigibilità IVA, riferimento contratto: tutto preimpostato sull'anagrafica cliente PA.",
    },
    {
      icon: CalendarClock,
      title: "Scadenzario incassi e solleciti",
      text: "Ogni fattura emessa entra nello scadenzario. Solleciti automatici a 7, 15 e 30 giorni dalla scadenza, con riepilogo cumulativo.",
    },
    {
      icon: CloudUpload,
      title: "Export commercialista 1-click",
      text: "Pacchetti mensili e annuali in PDF, Excel e tracciato per TeamSystem, Zucchetti, Datev e principali gestionali contabili italiani.",
    },
  ],
  resultStats: [
    { value: 22, prefix: "-", suffix: " gg", label: "DSO medio (giorni medi di incasso) dopo 6 mesi" },
    { value: 96, prefix: "+", suffix: "%", label: "fatture accettate al primo invio SDI" },
    { value: 8, prefix: "-", suffix: " h/mese", label: "tempo amministrativo per riconciliazioni e commercialista" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale, in euro, smettere di sprecare ore in fatturazione manuale?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero medio di fatture emesse al mese e costo orario dell'amministrazione. La stima parte da 15 minuti risparmiati per fattura, base media osservata nei nostri clienti.",
  roi: {
    input1Label: "Fatture emesse al mese",
    input1Default: 40,
    input1Min: 5,
    input1Max: 500,
    input1Step: 5,
    input2Label: "Costo orario amministrazione",
    input2Default: 30,
    input2Min: 15,
    input2Max: 80,
    input2Step: 5,
    input2Suffix: " €",
    outputLabel: "Risparmio amministrativo annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.25 * b),
    computeSecondary: (a, b) => [
      { label: "Ore amministrative risparmiate/anno", value: `${Math.round(a * 12 * 0.25)} h` },
      { label: "Fatture/anno gestite automaticamente", value: `${a * 12}` },
      { label: "Costo manuale eliminato/mese", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(a * 0.25 * b) },
    ],
    closingPitch:
      "Stima conservativa: 15 minuti risparmiati per fattura. Non include i benefici sulla riduzione DSO, gli incassi anticipati e il taglio dei costi del commercialista.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "La fatturazione che funziona da sola libera tempo per quello che conta davvero.",
  salesBody:
    "Quando la fattura nasce dal SAL e arriva da sola allo SDI, il tempo dell'amministrazione si sposta su attività a valore: chiamare i clienti in ritardo, presentare i numeri al commercialista, pianificare il prossimo mese.",
  salesImpact: [
    {
      title: "Cassa più stabile",
      text: "DSO più basso = liquidità più costante. Niente più tappi a fine mese, niente più anticipo bancario per pagare gli operai.",
    },
    {
      title: "Rapporto col commercialista più sereno",
      text: "Export pronto, niente più richieste urgenti via mail, niente più riconciliazioni che ti costano supplementi sulla parcella.",
    },
    {
      title: "Più tempo per fare commerciale",
      text: "L'ufficio amministrativo non passa più la giornata a inseguire fatture, ma può occuparsi del recupero crediti e del rapporto col cliente.",
    },
    {
      title: "Compliance fiscale serena",
      text: "In caso di verifica fiscale o contestazione cliente, recuperi qualunque fattura e ricevuta SDI in 30 secondi, con marca temporale a norma.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non un portale generico. Una fatturazione disegnata per il ciclo edile italiano.",
  featureRows: [
    {
      label: "Emissione FE da SAL approvato",
      value:
        "La fattura nasce direttamente dal SAL del cantiere, con avanzamento, materiali, subappalti e ritenute già calcolati. Zero ricopiature.",
    },
    {
      label: "Invio SDI automatico",
      value:
        "La FE viene trasmessa al Sistema di Interscambio in automatico al click di approvazione. Ricevute di consegna e accettazione in dashboard.",
    },
    {
      label: "Conservazione sostitutiva 10 anni",
      value:
        "Marca temporale e firma digitale incluse. Esibibilità immediata in caso di verifica. Costi: zero euro a fattura, niente servizi esterni.",
    },
    {
      label: "Fattura PA con CIG/CUP/split payment",
      value:
        "Tutti i campi PA gestiti nativamente: CIG, CUP, esigibilità IVA, split payment, riferimento contratto, riferimento decreto.",
    },
    {
      label: "Tracciati TD01 → TD24",
      value:
        "Fattura ordinaria, nota di credito, reverse charge, autofattura, fattura differita, fattura proforma — tutto previsto e validato.",
    },
    {
      label: "Scadenzario e solleciti",
      value:
        "Ogni fattura entra in scadenzario con data di pagamento prevista. Solleciti automatici a 7/15/30 giorni con riepilogo cumulativo.",
    },
    {
      label: "Export commercialista 1-click",
      value:
        "Pacchetti mensili in PDF/Excel, tracciati per TeamSystem, Zucchetti, Datev, Profis, Sistemi e i principali gestionali contabili italiani.",
    },
  ],

  scenarioKicker: "Tre casi reali",
  scenarioH2: "Tre momenti in cui la fatturazione integrata cambia davvero la giornata.",
  scenarios: [
    {
      title: "Chiusura SAL del 28 del mese",
      text:
        "Il DL approva il SAL in cantiere. Tu apri Edilizia in Cloud e in due click la FE è emessa, inviata allo SDI, conservata. Incasso atteso: 30 giorni dalla data fattura, non 60.",
    },
    {
      title: "Cliente PA che cambia il CIG a metà cantiere",
      text:
        "Il committente PA aggiorna il CIG. Lo cambi sull'anagrafica cliente: tutte le prossime FE escono col CIG nuovo, le precedenti restano archiviate col CIG vecchio. Niente errori, niente rifiuti.",
    },
    {
      title: "Verifica fiscale a sorpresa",
      text:
        "L'Agenzia chiede tutte le FE emesse al cliente X negli ultimi 4 anni. Apri Edilizia in Cloud, filtri per cliente e periodo, esporti il pacchetto in PDF firmato. 30 secondi.",
    },
  ],

  testimonialQuote:
    "Da quando emettiamo le fatture direttamente dal SAL, la chiusura del mese è passata da 3 giorni a 3 ore. Il commercialista ci dice che siamo l'unico cliente che gli manda dati 'puliti'.",
  testimonialAuthor: "Laura B.",
  testimonialRole: "Amministrazione, Edilizia Costruzioni Bianchi Srl",

  faqKicker: "Domande frequenti",
  faqH2: "Tutto quello che vuoi sapere prima di scegliere.",
  faqs: [
    {
      q: "La fatturazione elettronica è davvero conforme allo SDI?",
      a: "Sì. Edilizia in Cloud è accreditato come intermediario per la trasmissione. Generiamo XML conformi a tutti i tracciati TD01-TD24, gestiamo nativamente fattura B2B, B2C e PA con CIG/CUP/split payment. La trasmissione allo SDI avviene tramite canale ufficiale.",
    },
    {
      q: "La conservazione sostitutiva è davvero inclusa per 10 anni?",
      a: "Sì, senza costi aggiuntivi a fattura. Tutte le FE emesse e ricevute vengono conservate con marca temporale e firma digitale a norma, per la durata richiesta dalla legge (10 anni). Sono esibibili immediatamente in caso di verifica fiscale.",
    },
    {
      q: "Posso emettere note di credito e fatture differite?",
      a: "Sì. Edilizia in Cloud gestisce tutti i tipi documento previsti: TD01 fattura ordinaria, TD04 nota di credito, TD05 nota di debito, TD24 fattura differita, TD16/TD17 reverse charge, TD20 autofattura. Ogni tipo è preconfigurato con i campi corretti.",
    },
    {
      q: "Funziona con i cantieri pubblici e con la PA?",
      a: "Sì. La gestione fattura PA è nativa: codice CIG, CUP, split payment, esigibilità IVA, riferimenti a contratto e decreto. Le anagrafiche cliente PA hanno i campi precompilati per evitare i rifiuti più frequenti.",
    },
    {
      q: "Il mio commercialista si troverà bene?",
      a: "Sì. Esportiamo i tracciati compatibili con TeamSystem, Zucchetti, Datev, Profis, Sistemi e i principali gestionali contabili italiani. Il commercialista riceve PDF, Excel e tracciato XML pronto per l'importazione, senza copia-incolla.",
    },
    {
      q: "Cosa succede se sbaglio una fattura emessa?",
      a: "Edilizia in Cloud guida automaticamente l'emissione di una nota di credito (TD04) referenziata alla fattura originale, con tutti i dati precompilati. La rettifica viene tracciata e conservata regolarmente in conserva sostitutiva.",
    },
    {
      q: "Quanto costa? Ci sono limiti al numero di fatture emesse?",
      a: "Il modulo Fatturazione Elettronica è incluso in tutti i piani Edilizia in Cloud, da 49€/mese. Nessun costo a fattura, nessun limite tecnico. Conservazione 10 anni inclusa. Onboarding 1-a-1, supporto italiano e nessun vincolo di durata.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La fatturazione è un capitolo. Il libro è più ampio.",
  internalLinksBody:
    "La FE non vive da sola: è collegata a cantieri, SAL, margini, subappalti, HR e ai moduli Render AI per la vendita. Ecco i pezzi del sistema operativo Edilizia in Cloud.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori digitale e SAL pronti per la fatturazione.",
    },
    {
      to: "/funzionalita/margini-cantiere",
      title: "Margini Cantiere",
      text: "Margine reale per commessa: ogni fattura attiva e passiva alimenta lo scostamento in tempo reale.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Dal preventivo al SAL, dal SAL alla fattura: un solo flusso, zero ricopiature.",
    },
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Le fatture passive dei subappaltatori arrivano già collegate al SAL e al cantiere giusto.",
    },
    {
      to: "/funzionalita/hr-personale",
      title: "HR e Personale",
      text: "Costo orario reale e busta paga collegati al cantiere, alimentano marginalità e fatturazione.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi AI",
      text: "Per serramentisti: prima/dopo sulla foto reale del cliente, integrato al CRM e ai preventivi.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni AI",
      text: "Per imprese di ristrutturazione: prima/dopo sulla casa reale, dalla cucina al living.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma orientata alle imprese edili italiane: gestione, controllo, vendita, fatturazione.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti da 49€/mese. Beta dedicata con prezzo bloccato. Cancelli quando vuoi.",
    },
  ],

  finalCtaH2: "Smetti di copiare numeri da Excel a un portale di fatturazione.",
  finalCtaBody:
    "31 giorni gratuiti per provare la fatturazione elettronica integrata di Edilizia in Cloud. Conservazione 10 anni inclusa, onboarding 1-a-1, zero rifiuti SDI dopo il primo mese. Quello che cambia è quanto velocemente incassi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Conservazione 10 anni inclusa · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Fatturazione SDI",
  stickyCtaMicrocopy: "Conservazione 10 anni inclusa",

  applicationSubCategory: "Electronic Invoicing Software",

  relatedBlogSlugs: [
    "superbonus-imprese-edili-2026",
    "subappalto-edilizia-guida",
    "analisi-margini-imprese-edili",
  ],
};

export default function FatturazioneElettronica() {
  return <FunzionalitaPageTemplate config={config} />;
}
