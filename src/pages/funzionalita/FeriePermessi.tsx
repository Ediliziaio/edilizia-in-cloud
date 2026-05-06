import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarCheck,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  HardHat,
  Hourglass,
  Plane,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Users,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "ferie-permessi",
  vertical: "Ferie e Permessi",
  productName: "Modulo Ferie e Permessi Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor con 5-200 dipendenti che vogliono gestire ferie, ROL, permessi, malattia e banca ore secondo CCNL Edilizia con app self-service per gli operai e approvazione capocantiere",
  audienceShort: "imprese edili con dipendenti",

  seo: {
    title:
      "Ferie e Permessi Edilizia",
    description:
      "Gestione ferie, ROL, permessi e banca ore per imprese edili: app self-service operaio, approvazione capocantiere, conteggio automatico residui CCNL…",
    keywords:
      "ferie permessi edilizia, gestione ferie operai cantiere, app ferie operai, ROL CCNL edilizia, banca ore edilizia, calendario ferie cantiere, permessi capocantiere, software ferie imprese edili",
    ogImage: "https://www.ediliziaincloud.com/og/ferie-permessi-og.jpg",
  },

  heroBadge: "Funzionalità · Ferie e Permessi",
  heroH1Lead: "Le ferie degli operai gestite",
  heroH1Highlight: "dall'app del cantiere",
  heroH1Tail: "non da fogli Excel",
  heroSubheadline:
    "App self-service per ogni operaio con saldo ferie, ROL, banca ore e permessi sempre aggiornato secondo CCNL Edilizia. Richiesta dal telefono, approvazione capocantiere in 1 click, calendario condiviso multi-cantiere, conflict detection automatica. Stop a foglietti scritti a mano e a sorprese di fine anno sui residui.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "App operaio in italiano semplice",
    "Approvazione capocantiere in 1 click",
    "Saldo CCNL Edilizia sempre corretto",
  ],
  proofPoints: [
    "Ferie ROL malattia banca ore",
    "Calendario multi-cantiere",
    "Conflict detection automatica",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare i 'foglietti ferie' scritti a mano e i conti fatti su Excel"],
    ["Momento chiave", "Quando l'operaio chiede 'mi spettano ancora 3 giorni o 5?'"],
    ["Risultato", "Saldo sempre aggiornato, capocantiere libero, fine anno senza sorprese"],
  ],

  betaH2:
    "Più di 310 imprese edili italiane gestiscono ferie, ROL e permessi degli operai con l'app Edilizia in Cloud.",
  betaBody:
    "Il modulo Ferie e Permessi è attivo in 48 ore: importiamo l'anagrafica dipendenti con saldi iniziali, configuriamo CCNL Edilizia industria/artigianato con maturazioni mensili e festività, attiviamo l'app self-service per ogni operaio. Quattro sessioni 1-a-1 ti accompagnano fino a quando il primo capocantiere approva la prima ferie da telefono.",

  speedH2: "Il capocantiere perde 6 ore a settimana a gestire ferie, permessi e sostituzioni.",
  speedSubheadline:
    "Sui cantieri italiani la gestione ferie/permessi vive ancora su foglietti, WhatsApp e telefonate. Risultato: capocantiere distratto da chi può andare in ferie e quando, sostituzioni decise male, conflitti tra operai sui giorni richiesti, residui di fine anno sbagliati. L'app self-service elimina il 70% di questo lavoro amministrativo.",
  speedStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo amministrativo gestione ferie" },
    { value: 0, suffix: "", label: "errori conteggio residui CCNL Edilizia" },
    { value: 24, suffix: "/7", label: "richiesta ferie da app operaio" },
  ],

  familyH2: "Ferie e Permessi collegati a presenze, cantiere e cedolini.",
  familySubheadline:
    "La ferie approvata diventa automaticamente assenza programmata sul cantiere, voce nel cedolino paga, dato di costo del lavoro. Un workflow unico, niente trascrizioni manuali tra moduli, niente disallineamenti tra app operaio e gestionale aziendale.",
  familyItems: [
    {
      icon: Users,
      title: "HR Personale",
      text: "Anagrafica dipendenti, contratti CCNL Edilizia, livelli alimentano i saldi ferie e ROL.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Smartphone,
      title: "Timbrature GPS",
      text: "Le timbrature mancanti diventano richieste permesso retroattive, niente buchi cedolino.",
      to: "/funzionalita/timbrature-gps",
    },
    {
      icon: Receipt,
      title: "Cedolini Paga",
      text: "Saldo ferie ROL banca ore aggiornato in tempo reale, riportato nel cedolino mensile.",
      to: "/funzionalita/cedolini-paga",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Calendario assenze visibile sul cantiere, sostituzioni programmate, niente sorprese.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Calendar,
      title: "Calendario Lavori",
      text: "Pianificazione cantieri considera assenze approvate, conflict detection automatica.",
      to: "/funzionalita/calendario-lavori",
    },
    {
      icon: Eye,
      title: "App Cantiere Mobile",
      text: "Capocantiere approva ferie e permessi dallo stesso telefono che usa per il giornale lavori.",
      to: "/funzionalita/app-cantiere-mobile",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Ferie, presenze, cantiere e cedolino allineati.",
  familyBonusText:
    "Quando un operaio chiede 3 giorni di ferie a settembre, l'app verifica saldo, manda notifica al capocantiere, registra l'approvazione, aggiorna il calendario del cantiere, alimenta il cedolino di settembre con la voce 'ferie godute'. Un'azione, cinque effetti coordinati, zero data entry manuale.",

  painKicker: "Il problema vero",
  painH2: "Le ferie le decidi a luglio guardando un Excel sbagliato di tre mesi.",
  painSubheadline:
    "Nella maggior parte delle imprese edili italiane le ferie si gestiscono ancora con metodi ottocenteschi: foglietto cartaceo, WhatsApp al capocantiere, Excel della segreteria mai aggiornato in tempo reale. Il risultato è caos amministrativo, conflitti tra operai e residui di fine anno con cui devi ricontrattare ogni gennaio.",
  painPoints: [
    {
      icon: FileText,
      title: "Foglietti ferie e WhatsApp persi",
      text: "Operaio scrive richiesta su carta, capocantiere la perde, segreteria non la riceve. A fine anno saltano fuori 3 giorni di ferie 'mai presi' che nessuno ha registrato. Tribunale del lavoro, contestazione, soldi spesi.",
    },
    {
      icon: AlertTriangle,
      title: "Saldi residui sempre sbagliati",
      text: "Excel della segreteria si aggiorna a fine mese, l'operaio chiede in cantiere 'quanti giorni mi restano?', il capocantiere risponde a memoria. Sbaglia per difetto o per eccesso: in entrambi i casi è un problema legale.",
    },
    {
      icon: Hourglass,
      title: "Conflitti tra operai sulle stesse settimane",
      text: "Tre operai chiedono ferie ad agosto. Il capocantiere ne approva due senza accorgersi che il terzo era già stato approvato dalla segreteria. Cantiere fermo, cliente arrabbiato, recupero straordinario costoso.",
    },
    {
      icon: ClipboardList,
      title: "Residui CCNL Edilizia non rispettati",
      text: "Il CCNL Edilizia prevede ferie, ROL, ex-festività, banca ore con regole specifiche di maturazione e fruizione. Excel generico non li distingue, cedolino sbagliato, vertenza sindacale e accusa di mancato rispetto contrattuale.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi operai, stesse ferie, stesso CCNL. Cambia chi ha il pallino in mano.",
  baSubheadline:
    "Non togli il controllo al capocantiere e alla segreteria: lo formalizzi e lo rendi tracciabile. Il foglietto cartaceo diventa richiesta digitale con notifica, l'Excel diventa saldo aggiornato in tempo reale, il telefonate diventa workflow approvativo.",
  baAreas: [
    {
      title: "Richiesta ferie da operaio",
      before:
        "Operaio scrive richiesta su foglio o WhatsApp al capocantiere. Capocantiere o approva senza controllare saldo, o dimentica, o gira a segreteria. Tracciabilità zero, dispute frequenti.",
      after:
        "Operaio apre l'app, vede saldo (10 ferie + 4 ROL + 2 ex-festività), seleziona date, manda richiesta. Notifica push al capocantiere, vedibile da tutti gli interessati, archiviata.",
    },
    {
      title: "Approvazione capocantiere",
      before:
        "Capocantiere ricorda 'mi ha chiesto Mario le ferie?' due settimane dopo. Approva senza vedere conflitti con altri operai. Sostituzione decisa al volo il giorno prima, costi extra.",
      after:
        "App mostra al capocantiere richiesta + saldo operaio + altre assenze del cantiere nelle stesse date + impatto sul piano lavori. Approva o rifiuta con motivazione in 30 secondi.",
    },
    {
      title: "Conteggio residui fine anno",
      before:
        "Segreteria a dicembre apre Excel, scopre che 4 operai hanno residui non goduti, 2 chiedono monetizzazione, l'azienda contesta i conteggi. Vertenza, costi, clima aziendale rovinato.",
      after:
        "App mostra a ogni operaio in tempo reale residui ferie/ROL/banca ore. A novembre sistema avvisa 'ti restano 4 giorni da godere entro 31/12'. Zero contestazioni, zero monetizzazioni a sorpresa.",
    },
    {
      title: "Calendario assenze cantiere",
      before:
        "Capocantiere pianifica la settimana senza sapere chi è in ferie. Lunedì mattina scopre che 2 operai non si presentano perché 'gli avevi detto di sì la settimana scorsa'. Cantiere bloccato 2 ore.",
      after:
        "Calendario condiviso del cantiere con tutte le assenze approvate visibili. Pianificazione lavori tiene conto delle ferie. Sostituzioni programmate con anticipo, niente buchi imprevisti.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. App operaio, notifica capocantiere, archivio aziendale.",
  mechanismSubheadline:
    "Il modulo Ferie e Permessi è progettato per non richiedere training: l'operaio usa l'app come WhatsApp, il capocantiere approva come legge un messaggio, la segreteria vede tutto archiviato in cloud.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "Operaio richiede ferie dall'app",
      text: "Apre app self-service in italiano semplice, vede saldo (ferie, ROL, ex-festività, banca ore), seleziona date, scrive motivazione facoltativa, conferma. Saldo si blocca preventivamente.",
    },
    {
      icon: ThumbsUp,
      title: "Capocantiere approva o rifiuta",
      text: "Riceve push notification con saldo operaio, conflitti rilevati nel cantiere, impatto sul piano lavori. Approva, rifiuta con motivazione, oppure propone date alternative. Tutto in 30 secondi.",
    },
    {
      icon: CalendarCheck,
      title: "Sistema aggiorna calendario, saldo e cedolino",
      text: "Ferie approvata appare nel calendario condiviso del cantiere, saldo operaio scende, cedolino di fine mese riporta correttamente i giorni goduti. Archivio digitale per CCNL e ispezioni.",
    },
  ],
  mechanismCta: "Apri l'app self-service di prova",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "L'app ferie ti restituisce 6 ore/settimana di capocantiere e zero contestazioni.",
  commercialBody:
    "Le imprese edili che hanno attivato il modulo Ferie e Permessi recuperano in media 6 ore a settimana di capocantiere e segreteria, eliminano le contestazioni di fine anno sui residui e migliorano sensibilmente il clima aziendale grazie alla trasparenza sui saldi.",
  commercialLevers: [
    {
      icon: Clock,
      title: "Capocantiere libero per il cantiere vero",
      text: "Non più 6 ore a settimana a rispondere 'quanti giorni mi restano?', tenere foglietti, calcolare residui. Tornano alla supervisione lavori, alla qualità, alla sicurezza.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità CCNL Edilizia automatica",
      text: "Maturazione mensile ferie, ROL, ex-festività, banca ore secondo CCNL Edilizia industria/artigianato/PMI. Niente più vertenze sindacali per conteggi errati.",
    },
    {
      icon: TrendingUp,
      title: "Clima aziendale migliore",
      text: "Operai sereni perché vedono il saldo in tempo reale, fanno richieste tracciate, ricevono risposte in 30 secondi. Niente più 'sospetto che non mi paghino le ferie giuste'.",
    },
    {
      icon: Sparkles,
      title: "Pianificazione cantieri prevedibile",
      text: "Le assenze sono sul calendario di cantiere prima di succedere. Sostituzioni programmate, niente buchi imprevisti, niente straordinari last-minute costosi.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente più sorprese a fine anno. Niente più 'foglietti persi'.",
  resultsBody:
    "Quando ferie e permessi vivono in app self-service con approvazione capocantiere e archivio cloud, il problema amministrativo sparisce: il saldo è sempre giusto, l'approvazione è sempre tracciata, la pianificazione cantiere è sempre allineata alle assenze reali.",
  integrationPillars: [
    {
      icon: Plane,
      title: "Ferie, ROL, ex-festività, banca ore",
      text: "Tutti i monti ore CCNL Edilizia gestiti separatamente: ferie 26 giorni, ROL 88 ore, ex-festività 4 giorni, banca ore variabile. Maturazione mensile automatica.",
    },
    {
      icon: Bell,
      title: "Notifiche push smart",
      text: "Capocantiere riceve solo notifiche utili: nuova richiesta ferie, conflitto rilevato, scadenza fruizione residui. Operaio riceve notifica di approvazione/rifiuto in tempo reale.",
    },
    {
      icon: Calendar,
      title: "Calendario condiviso multi-cantiere",
      text: "Vista calendario per cantiere, per squadra, per persona. Conflict detection automatica quando 2 operai chiave chiedono le stesse settimane.",
    },
    {
      icon: FileText,
      title: "Archivio digitale ispezioni",
      text: "Tutte le richieste, approvazioni, motivazioni archiviate digitalmente per 10 anni secondo CAD D.Lgs 82/2005. Esibizione INL/INPS in 5 minuti.",
    },
  ],
  resultStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo amministrativo gestione ferie" },
    { value: 6, suffix: " h", label: "settimanali recuperate dal capocantiere" },
    { value: 0, suffix: "", label: "contestazioni fine anno sui residui" },
  ],
  resultsCta: "Apri il modulo ferie e permessi",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quante ore amministrative recuperi se le ferie le gestisce l'app?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di dipendenti tra operai e impiegati e ore mensili dedicate dalla segreteria/capocantiere alla gestione ferie. La stima parte dal -70% di tempo amministrativo osservato nei nostri clienti dopo 90 giorni.",
  roi: {
    input1Label: "Dipendenti totali",
    input1Default: 15,
    input1Min: 5,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Ore amministrazione mensili gestione ferie",
    input2Default: 8,
    input2Min: 2,
    input2Max: 30,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * b * 0.7 * 30),
    computeSecondary: (a, b) => [
      { label: "Ore amministrative recuperate/anno", value: `${Math.round(a * 12 * b * 0.7)} h` },
      { label: "Riduzione tempo gestione", value: "70%" },
      { label: "Stima vertenze evitate/anno", value: `${Math.round(a / 20 + 1)}` },
    ],
    closingPitch:
      "Stima prudenziale basata su 70% di tempo amministrativo eliminato a €30/h. Aggiungi le vertenze sindacali evitate, le sostituzioni programmate e il clima aziendale migliorato.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un calendario digitale. Un workflow approvativo CCNL Edilizia compliant.",
  salesBody:
    "I calendari ferie generici (Google, Outlook) non conoscono CCNL Edilizia, non distinguono ROL da ex-festività, non si parlano con il cedolino. Il modulo Ferie e Permessi nasce edile e produce 4 effetti operativi misurabili.",
  salesImpact: [
    {
      title: "Capocantiere libero da admin",
      text: "Smette di tenere foglietti e calcolare residui. Approva da telefono in 30 secondi, torna alla supervisione lavori e alla sicurezza in cantiere.",
    },
    {
      title: "Operai più sereni e trasparenza vera",
      text: "Vedono saldo aggiornato dall'app, fanno richieste tracciate, ricevono risposte rapide. Clima aziendale migliore, meno turnover, meno vertenze.",
    },
    {
      title: "Pianificazione cantieri solida",
      text: "Le assenze approvate entrano nel piano lavori prima di accadere. Sostituzioni programmate, niente buchi, niente straordinari last-minute.",
    },
    {
      title: "Conformità INL/INPS automatica",
      text: "Maturazioni CCNL Edilizia, archiviazione decennale, log immutabile delle approvazioni. In ispezione esporti dossier completo in 5 minuti.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "App self-service operaio",
      value: "Browser e mobile, italiano semplice, saldi in evidenza, richiesta in 3 tap, storico assenze visibile. Niente formazione necessaria, niente account complessi.",
    },
    {
      label: "Approvazione capocantiere da telefono",
      value: "Push notification, vista conflitti cantiere, impatto piano lavori, approvazione/rifiuto/contropropostadate in 30 secondi.",
    },
    {
      label: "Saldi CCNL Edilizia separati",
      value: "Ferie 26gg, ROL 88h, ex-festività 4gg, banca ore variabile, permessi sindacali, malattia, infortunio. Maturazione mensile automatica per livello CCNL.",
    },
    {
      label: "Calendario condiviso multi-cantiere",
      value: "Vista calendario per cantiere, squadra, persona. Filtri per ruolo, periodo, tipo assenza. Conflict detection automatica.",
    },
    {
      label: "Notifiche scadenza residui",
      value: "Sistema avvisa operai e azienda 60 giorni prima della scadenza fruizione ROL ed ex-festività CCNL Edilizia. Zero monetizzazioni indesiderate.",
    },
    {
      label: "Integrazione cedolino paga",
      value: "Voci ferie godute, ROL goduti, ex-festività entrano automaticamente nel cedolino del mese. Niente trascrizioni, niente errori.",
    },
    {
      label: "Archivio digitale ispezioni",
      value: "Tutte le richieste, approvazioni, motivazioni archiviate per 10 anni a norma CAD. Esportazione dossier INL/INPS in 5 minuti.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Ferie e Permessi cambia la giornata.",
  scenarios: [
    {
      title: "Operaio chiede 3 giorni a 24h",
      text: "Mercoledì sera operaio richiede ferie giovedì-sabato dall'app. Capocantiere riceve push, vede saldo OK, nessun conflitto, approva alle 22:00. Calendario aggiornato, sostituzione assegnata in autonomia.",
    },
    {
      title: "Tre operai vogliono la stessa settimana di agosto",
      text: "Sistema rileva conflitto: 3 richieste sovrapposte sul cantiere principale. Capocantiere riceve alert, propone alternative ai due meno strategici, approva al primo, mantiene il cantiere operativo.",
    },
    {
      title: "Ispezione INL su gestione ferie",
      text: "Ispettore chiede tracciabilità di 12 mesi di richieste/approvazioni ferie e ROL. Esporti dossier digitale con timestamp, motivazioni, saldi maturati e goduti per ogni dipendente in 5 minuti.",
    },
  ],

  testimonialQuote:
    "Avevo un Excel dove la mia segreteria aggiornava le ferie a fine mese. A dicembre saltavano sempre fuori 3-4 giorni 'mancati' di qualcuno e ci si litigava. Ora ogni operaio vede il saldo dall'app, chiede ferie da telefono, il capocantiere approva in cantiere. A dicembre i residui sono giusti al primo colpo.",
  testimonialAuthor: "Stefano R.",
  testimonialRole: "Costruzioni R. Srl, Padova",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare all'app ferie.",
  faqs: [
    {
      q: "I miei operai non sono pratici di app, riusciranno a usarla?",
      a: "Sì. L'app è in italiano semplice, con icone grandi e flusso a 3 tap (saldo, date, conferma). I nostri clienti riportano adozione del 95% degli operai entro 2 settimane, anche con età media oltre 50 anni e poca dimestichezza con le tecnologie.",
    },
    {
      q: "Gestisce la differenza tra CCNL Edilizia industria e artigianato?",
      a: "Sì. Maturazioni ferie, ROL, ex-festività, banca ore configurate separatamente per CCNL Edilizia Industria, Artigianato (CNA, Confartigianato), PMI Edilizia. Aggiornamenti automatici a ogni rinnovo contrattuale.",
    },
    {
      q: "Posso decidere chi approva: capocantiere, ufficio o entrambi?",
      a: "Sì. Workflow configurabile: solo capocantiere, solo ufficio HR, doppia approvazione (capocantiere e poi ufficio), regole diverse per ferie/ROL/permessi sindacali. Tutto tracciato per ispezioni INL.",
    },
    {
      q: "Cosa succede se un operaio non ha lo smartphone?",
      a: "Il capocantiere o l'ufficio possono inserire la richiesta a nome dell'operaio dal gestionale. La firma cartacea della richiesta viene scansionata e allegata, mantenendo il workflow approvativo digitale e l'archiviazione decennale.",
    },
    {
      q: "Si integra con i cedolini paga?",
      a: "Sì. Le ferie, i ROL, le ex-festività godute entrano automaticamente nel cedolino del mese con la voce CCNL corretta. Saldo dei residui aggiornato sul cedolino, niente trascrizioni manuali, niente disallineamenti tra app e busta paga.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di dipendenti?",
      a: "Il modulo Ferie e Permessi è incluso nei piani Professional e Business di Edilizia in Cloud con dipendenti illimitati. Setup in 48 ore, app self-service inclusa, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Ferie e Permessi è il cuore del ciclo HR e cantiere.",
  internalLinksBody:
    "Il modulo collega anagrafica HR, timbrature, cedolini, calendario lavori e gestione cantieri in un unico flusso assenze coordinato.",
  internalLinks: [
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Anagrafica dipendenti e contratti CCNL alimentano i saldi." },
    { to: "/funzionalita/timbrature-gps", title: "Timbrature GPS", text: "Le timbrature mancanti diventano richieste permesso retroattive." },
    { to: "/funzionalita/cedolini-paga", title: "Cedolini Paga", text: "Saldo ferie e ROL riportato nel cedolino mensile." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Calendario assenze visibile sul cantiere." },
    { to: "/funzionalita/calendario-lavori", title: "Calendario Lavori", text: "Pianificazione cantieri considera assenze approvate." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere Mobile", text: "Capocantiere approva ferie dallo stesso telefono del giornale lavori." },
    { to: "/funzionalita/chat-interna", title: "Chat Interna", text: "Comunicazione tra operai e capocantiere su sostituzioni e copertura turni." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Ferie e Permessi incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di tenere foglietti ferie. Inizia a far decidere l'app.",
  finalCtaBody:
    "31 giorni gratuiti per portare la gestione ferie, ROL, permessi e banca ore dentro l'app self-service. CCNL Edilizia preconfigurato, approvazione capocantiere in 30 secondi, calendario condiviso. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · App self-service · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Ferie e Permessi",
  stickyCtaMicrocopy: "Setup 48h · App self-service",

  applicationSubCategory: "Construction HR Leave Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function FeriePermessi() {
  return <FunzionalitaPageTemplate config={config} />;
}
