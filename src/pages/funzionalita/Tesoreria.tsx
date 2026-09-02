import {
  AlertTriangle,
  ArrowDownUp,
  Banknote,
  BarChart3,
  Bell,
  Clock,
  Database,
  Gauge,
  Inbox,
  Landmark,
  LineChart,
  Link2,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "tesoreria",
  definizione:
    "Tesoreria di Edilizia in Cloud consolida tutti i conti bancari dell'impresa edile in un'unica dashboard tramite PSD2: posizione di cassa in tempo reale, previsionale a 30, 60 e 90 giorni basato su scadenze di fatture e ordini, e avvisi quando la liquidità scende sotto la soglia.",
  vertical: "Tesoreria",
  productName: "Tesoreria Multi-Banca Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che gestiscono 2-10 conti bancari e vogliono posizione cassa consolidata in tempo reale, previsionale 30/60/90 giorni e alert sconfinamento automatici",
  audienceShort: "imprese edili e general contractor",

  seo: {
    title:
      "Tesoreria Multi-Banca per Edilizia",
    description:
      "Gestione tesoreria multi-banca PSD2 con posizione cassa consolidata, previsionale 30/60/90 giorni, alert sconfinamento automatici, conciliazione automatica.",
    keywords:
      "tesoreria edilizia, multi-banca PSD2 edilizia, previsionale cassa impresa edile, alert sconfinamento conto edilizia, gestione cassa cantieri, software tesoreria edile, posizione consolidata banche edilizia, conciliazione bancaria edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Tesoreria",
  heroH1Lead: "Tesoreria multi-banca",
  heroH1Highlight: "consolidata real-time",
  heroH1Tail: "via PSD2",
  heroSubheadline:
    "Tutti i tuoi conti bancari (Intesa, Unicredit, BPER, BCC) consolidati in un'unica dashboard PSD2: posizione cassa in tempo reale, previsionale 30/60/90 giorni basato su scadenze fatture e ordini, alert sconfinamento automatici, conciliazione contabile zero data entry. Smetti di pagare interessi passivi che non sapevi di avere.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Multi-banca PSD2 nativo", "Previsionale 90 giorni"],
  proofPoints: [
    "Posizione consolidata real-time",
    "Alert sconfinamento automatici",
    "Conciliazione zero data entry",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare le sorprese di sconfinamento e interessi passivi"],
    ["Momento chiave", "Decisioni di pagamento giornaliere e settimanali"],
    ["Risultato", "60% di interessi passivi risparmiati"],
  ],

  betaH2:
    "Più di 300 imprese italiane gestiscono la tesoreria multi-banca con Edilizia in Cloud, eliminando sorprese di sconfinamento.",
  betaBody:
    "La Tesoreria la attiviamo in 48 ore: configuriamo le connessioni PSD2 con tutti i tuoi conti, importiamo lo storico, attiviamo previsionale 30/60/90 gg basato su scadenze, configuriamo alert sconfinamento e ti accompagniamo in 4 sessioni 1-a-1 con il nostro tesoriere dedicato.",

  speedH2:
    "Senza tesoreria consolidata, scopri lo sconfinamento dall'estratto conto. Con interessi al 14% pagati per inerzia.",
  speedSubheadline:
    "Le imprese edili hanno mediamente 3-7 conti bancari attivi (operativo, anticipi fatture, leasing, mutuo). Senza vista consolidata, accade che un conto vada in scoperto mentre un altro abbia liquidità ferma. Risultato: interessi passivi al 12-14% pagati senza necessità.",
  speedStats: [
    { value: 60, prefix: "-", suffix: "%", label: "interessi passivi risparmiati con previsionale" },
    { value: 90, suffix: " giorni", label: "previsionale cassa rolling sempre aggiornato" },
    { value: 24, suffix: "/7", label: "monitoraggio cassa multi-banca consolidata" },
  ],

  familyH2: "La Tesoreria nutrita da prima nota, scadenzario e cassetto SDI.",
  familySubheadline:
    "La Tesoreria non è un modulo isolato: vive in simbiosi con prima nota (movimenti già classificati), scadenzario (incassi attesi), ordini (pagamenti previsti), cassetto SDI (fatture passive in scadenza). Il previsionale 90 giorni è preciso perché si nutre di dati veri.",
  familyItems: [
    {
      icon: Banknote,
      title: "Prima Nota",
      text: "Movimenti banca importati e classificati alimentano la tesoreria automaticamente.",
      to: "/funzionalita/prima-nota",
    },
    {
      icon: Clock,
      title: "Scadenzario",
      text: "Scadenze incassi/pagamenti popolano il previsionale 30/60/90 giorni.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: Inbox,
      title: "Cassetto Fiscale SDI",
      text: "Fatture passive imminenti dal cassetto AdE entrano nel previsionale uscite.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture attive emesse alimentano il previsionale incassi atteso.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: TrendingUp,
      title: "Cruscotto Aziendale",
      text: "Cassa, fatturato e margini nel dashboard direzionale unico.",
      to: "/funzionalita/cruscotto-aziendale",
    },
    {
      icon: PiggyBank,
      title: "Cassa Cantiere",
      text: "Movimenti cassa cantiere consolidati nella tesoreria multi-banca.",
      to: "/funzionalita/cassa-cantiere",
    },
  ],
  familyBonusTitle: "Una sola tesoreria. Una sola posizione cassa. Zero sorprese.",
  familyBonusText:
    "Quando emetti una fattura, il previsionale incassi si aggiorna. Quando ricevi una fattura passiva via cassetto SDI, il previsionale uscite si aggiorna. Quando un cliente paga, la posizione cassa multi-banca si aggiorna. Tu apri la dashboard e vedi sempre la verità, non un'istantanea vecchia di 7 giorni.",

  painKicker: "Il problema vero",
  painH2:
    "Sconfinamento scoperto a fine mese. Interessi passivi al 14% pagati senza saperlo. Pagamenti pianificati a sensazione.",
  painSubheadline:
    "Senza vista consolidata multi-banca, il titolare gestisce la cassa per sensazione: 'mi sembra che ci siano soldi sull'operativo'. Risultato: sconfinamenti silenziosi su un conto, liquidità ferma su un altro, pagamenti rinviati senza motivo, fornitori irritati e interessi passivi al 12-14%.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Sconfinamento scoperto a posteriori",
      text: "Estratto conto di fine mese rivela 12 giorni di scoperto su un conto. Interessi passivi al 14% per importi ridicoli, ma il titolare scopre tutto dopo. Senza alert in tempo reale, la prevenzione è impossibile.",
    },
    {
      icon: ArrowDownUp,
      title: "Liquidità ferma su un conto, scoperto su un altro",
      text: "Conto operativo in scoperto di 8.000€, mentre conto anticipi ha 25.000€ fermi. Ma senza vista consolidata, il titolare non se ne accorge. Risultato: interessi pagati su 8k senza necessità.",
    },
    {
      icon: TrendingDown,
      title: "Previsionale cassa basato su sensazione",
      text: "'Lunedì paghiamo i fornitori X e Y, mi sembra che ci sia abbastanza': previsionale a sensazione. Quando arriva la realtà, sorprese, telefonate alla banca per anticipi urgenti, costi imprevisti.",
    },
    {
      icon: Database,
      title: "Conciliazione bancaria manuale a fine mese",
      text: "Segretaria a fine mese ricopia estratti conto, fa conciliazione manuale fattura per fattura. 8-12 ore di lavoro che non genera valore, errori inevitabili, decisioni prese su dati di 30 giorni fa.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesse banche, stessi conti, stesso volume. Cambia il controllo e il costo finanziario.",
  baSubheadline:
    "La Tesoreria multi-banca non aumenta la tua liquidità: ti permette di usare quella che hai già in modo intelligente. Conti che si parlano, sconfinamenti evitati, interessi passivi azzerati su importi piccoli evitabili.",
  baAreas: [
    {
      title: "Posizione cassa consolidata",
      before:
        "Tre login bancari diversi al mattino, somma a mente, posizione consolidata stimata. Decisioni prese su sensazione, non su dato. Tempo perso, sicurezza zero.",
      after:
        "Apri dashboard Tesoreria, vedi posizione consolidata multi-banca aggiornata via PSD2 (es. operativo 12k, anticipi 25k, leasing -45k, totale liquidità netta -8k). Decisione informata.",
    },
    {
      title: "Previsionale cassa 30/60/90 giorni",
      before:
        "Previsionale fatto a mano su Excel ogni inizio mese, già obsoleto al 5 del mese. Decisioni di investimento o spesa basate su numeri vecchi.",
      after:
        "Previsionale rolling 30/60/90 gg che si aggiorna in tempo reale: incassi attesi da scadenzario, uscite previste da fatture passive, salari, ratei. Sempre vero, sempre attendibile.",
    },
    {
      title: "Alert sconfinamento e liquidità",
      before:
        "Sconfinamento scoperto a posteriori, interessi al 14% pagati senza saperlo. Liquidità ferma su conti accessori non sfruttata.",
      after:
        "Alert push/email a -3 giorni dallo sconfinamento previsto, con suggerimento di trasferimento da conto con liquidità. Sconfinamenti evitati, interessi azzerati.",
    },
    {
      title: "Conciliazione bancaria",
      before:
        "Manuale, fatto a fine mese, 8-12 ore di lavoro segreteria. Riconciliazione 60-70% accurata, errori frequenti, scadenzario non sempre allineato.",
      after:
        "Automatica via PSD2: 95% dei movimenti riconciliati con fatture/scadenze. Tu approvi le ambiguità in 5 secondi. Scadenzario sempre vero, prima nota sempre chiusa.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per dare alla tua tesoreria un controllo da banca privata.",
  mechanismSubheadline:
    "La Tesoreria multi-banca PSD2 lavora in modo passivo: importa, consolida, prevede, segnala. Tu intervieni solo quando serve una decisione di pagamento, mai per fare data entry.",
  mechanismSteps: [
    {
      icon: Link2,
      title: "Connessione PSD2 multi-banca",
      text: "Configuri una volta tutte le tue banche italiane (anche 5+ conti). Da quel momento, posizione cassa consolidata aggiornata ogni 4 ore, cifrata GDPR, autenticata SCA.",
    },
    {
      icon: LineChart,
      title: "Previsionale rolling 30/60/90 giorni",
      text: "Sistema costruisce previsionale dinamico unendo: incassi attesi (scadenzario), uscite previste (fatture passive cassetto, salari, ratei), trend storico. Sempre rolling, sempre vero.",
    },
    {
      icon: Bell,
      title: "Alert sconfinamento e opportunità",
      text: "Notifiche push/email per: sconfinamento previsto (-3 gg), liquidità ferma su conto accessorio, scadenza fido in arrivo, opportunità di pagamento anticipato con sconto.",
    },
  ],
  mechanismCta: "Apri la demo Tesoreria",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "60% di interessi passivi evitati. Pagamenti pianificati come una banca privata.",
  commercialBody:
    "La Tesoreria multi-banca non aumenta la tua liquidità: ottimizza l'uso di quella che hai. Le imprese che la attivano riducono in media del 60% gli interessi passivi su sconfinamenti evitabili e migliorano le condizioni bancarie grazie a dati strutturati.",
  commercialLevers: [
    {
      icon: TrendingDown,
      title: "60% di interessi passivi risparmiati",
      text: "Sconfinamenti evitati grazie ad alert tempestivi e trasferimenti automatici da conti con liquidità. Risparmio reale misurato sui clienti che hanno attivato il modulo.",
    },
    {
      icon: Gauge,
      title: "Previsionale cassa attendibile",
      text: "Previsionale 30/60/90 gg basato su dati veri (scadenze, ordini, fatture passive). Pianifichi pagamenti, investimenti, leasing senza sorprese. Niente più 'speriamo che basti'.",
    },
    {
      icon: Landmark,
      title: "Condizioni bancarie migliorate",
      text: "Quando chiedi fido o leasing, banca riceve dossier con tesoreria strutturata, conciliazione automatica, audit trail. Approvazione veloce, tassi migliori del 0,3-0,5%.",
    },
    {
      icon: Sparkles,
      title: "Sconto pagamenti anticipati colti",
      text: "Quando hai liquidità su un conto accessorio, sistema suggerisce pagamenti fornitore anticipati con sconto 2-3%. Sconto colto = ROI immediato sulla liquidità ferma.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "La cassa smette di essere un mistero. Diventa una leva strategica.",
  resultsBody:
    "Quando hai vista consolidata multi-banca in tempo reale e previsionale rolling 90 giorni, la tesoreria smette di essere 'tema da gestire' e diventa 'leva strategica'. Le imprese che attivano la Tesoreria vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Database,
      title: "Sync PSD2 multi-banca",
      text: "Tutte le principali banche italiane: Intesa, Unicredit, BPER, Banco BPM, Crédit Agricole, BCC. Sync ogni 4 ore, posizione consolidata sempre aggiornata.",
    },
    {
      icon: BarChart3,
      title: "Previsionale rolling 30/60/90",
      text: "Costruito da scadenze fatture, ordini, salari, ratei. Aggiornamento real-time ad ogni nuova fattura emessa o ricevuta. Sempre rolling, sempre vero.",
    },
    {
      icon: Bell,
      title: "Alert intelligenti",
      text: "Sconfinamento previsto, liquidità ferma, scadenza fido, opportunità sconto. Notifiche push/email mirate, mai spam, sempre azionabili.",
    },
    {
      icon: ArrowDownUp,
      title: "Conciliazione automatica",
      text: "95% dei movimenti riconciliati automaticamente con fatture/scadenze. Tu approvi solo le ambiguità in 5 secondi. Scadenzario e prima nota sempre allineati.",
    },
  ],
  resultStats: [
    { value: 60, prefix: "-", suffix: "%", label: "interessi passivi su sconfinamenti evitabili" },
    { value: 90, suffix: " giorni", label: "previsionale rolling sempre aggiornato" },
    { value: 95, suffix: "%", label: "movimenti banca riconciliati automaticamente" },
  ],
  resultsCta: "Apri la demo Tesoreria",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto risparmi se eviti il 60% degli interessi passivi su sconfinamenti?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: scoperto medio mensile e tasso interesse passivo della tua banca. La stima parte dal -60% di interessi osservato sui clienti che hanno attivato la Tesoreria.",
  roi: {
    input1Label: "Scoperto medio mensile (€)",
    input1Default: 15000,
    input1Min: 1000,
    input1Max: 200000,
    input1Step: 500,
    input1Suffix: " €",
    input2Label: "Tasso interesse banca (%)",
    input2Default: 12,
    input2Min: 5,
    input2Max: 18,
    input2Step: 0.5,
    input2Suffix: " %",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * (b / 100) * 0.6),
    computeSecondary: (a, b) => [
      { label: "Interessi passivi annui attuali stima", value: `€ ${Math.round(a * (b / 100)).toLocaleString("it-IT")}` },
      { label: "Riduzione interessi attesa", value: "60%" },
      { label: "Previsionale cassa rolling", value: "30/60/90 giorni" },
    ],
    closingPitch:
      "Stima prudenziale basata su -60% di interessi su sconfinamenti evitabili (alert tempestivi + trasferimenti automatici). Aggiungi le condizioni bancarie migliorate (-0,3% medio sui tassi) e gli sconti pagamento anticipato colti.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un cruscotto bancario. Una sala controllo finanziaria che lavora 24/7.",
  salesBody:
    "La Tesoreria Edilizia in Cloud non è solo dashboard di lettura: è un sistema attivo che ti avvisa, suggerisce, ottimizza. Le imprese che la attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Decisioni di pagamento informate",
      text: "Titolare apre dashboard al mattino, vede posizione consolidata e previsionale 90 gg. Decide cosa pagare oggi, cosa rinviare, dove spostare liquidità. Decisioni basate su dato, non su sensazione.",
    },
    {
      title: "Sconfinamenti evitati alla fonte",
      text: "Alert -3 gg dallo sconfinamento previsto: trasferisci da conto accessorio o anticipi un incasso. Niente più sorprese da estratto conto, niente più interessi al 14%.",
    },
    {
      title: "Trattative bancarie su dato strutturato",
      text: "Quando chiedi fido, banca vede tesoreria storica strutturata, conciliazione automatica, previsionale 90 gg. Istruttoria veloce, tassi migliori, accesso a finanziamenti agevolati.",
    },
    {
      title: "Sconti fornitore colti sistematicamente",
      text: "Sistema suggerisce pagamenti anticipati a fornitori che offrono sconto 2-3%. Liquidità ferma viene messa al lavoro, ROI immediato e prevedibile.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Sync PSD2 multi-banca multi-conto",
      value:
        "Connessione con Intesa, Unicredit, BPER, Banco BPM, Crédit Agricole, BCC, Mediolanum, Fineco, Sella e altre. Conti illimitati, sync ogni 4 ore.",
    },
    {
      label: "Posizione cassa consolidata real-time",
      value:
        "Vista unica con saldi per conto, totale liquidità netta, fido residuo, leasing in essere, mutui. Dashboard mobile e desktop, sempre allineata.",
    },
    {
      label: "Previsionale rolling 30/60/90 giorni",
      value:
        "Costruito da scadenze fatture attive/passive, ordini, salari, ratei mutui/leasing. Aggiornamento real-time, scenari what-if, grafici trend.",
    },
    {
      label: "Alert sconfinamento intelligenti",
      value:
        "Notifica push/email a -3 gg dallo sconfinamento previsto, con suggerimento azione (trasferimento, anticipo fattura). Mai spam, sempre azionabile.",
    },
    {
      label: "Conciliazione bancaria automatica",
      value:
        "95% dei movimenti riconciliati con fatture/scadenze via match P.IVA/importo/causale. Tu approvi le ambiguità in 5 secondi. Scadenzario sempre allineato.",
    },
    {
      label: "Suggerimenti ottimizzazione liquidità",
      value:
        "Sistema rileva: liquidità ferma su conto accessorio (suggerisce pagamento anticipato con sconto), scadenza fido in arrivo, opportunità leasing.",
    },
    {
      label: "Export dossier banca/commercialista",
      value:
        "Tesoreria 12 mesi, previsionale 90 gg, conciliazione automatica, audit trail. PDF firmato + Excel pronto per istruttoria fido o chiusura bilancio.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Tesoreria multi-banca cambia la giornata.",
  scenarios: [
    {
      title: "Sconfinamento evitato il martedì mattina",
      text: "Martedì alle 8:00 alert: 'tra 3 giorni conto operativo in scoperto -7.500€, conto anticipi ha +18.000€ fermi'. Trasferisci 10k con 2 click. Sconfinamento evitato, 105€ di interessi al 14% risparmiati.",
    },
    {
      title: "Decisione di pagamento al venerdì",
      text: "Venerdì pomeriggio fornitore X chiede 18.000€ entro lunedì. Apri Tesoreria: posizione consolidata 22.000€, ma incassi attesi lunedì 35.000€. Decidi di pagare lunedì pomeriggio: scelta basata su previsionale, non su sensazione.",
    },
    {
      title: "Richiesta fido 200k alla banca",
      text: "Banca chiede dossier finanziario per fido 200k. Esporti tesoreria 12 mesi, previsionale 90 gg, conciliazione strutturata. Banca approva fido in 7 giorni a tasso 3,8% invece di 4,2%: -800€/anno.",
    },
  ],

  testimonialQuote:
    "Avevo 5 conti in 3 banche diverse, e ogni mattina aprivo 5 home banking per sapere quanti soldi avevo. Ho attivato la Tesoreria multi-banca: adesso una sola dashboard, posizione vera in 5 secondi. Nei primi 6 mesi ho evitato 2.300€ di interessi passivi su sconfinamenti che non sapevo nemmeno di avere. La banca mi ha rifatto il fido a tasso più basso vedendo il mio dossier strutturato.",
  testimonialAuthor: "Antonio R.",
  testimonialRole: "Romano Costruzioni Spa, Napoli",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "PSD2 mi permette di vedere tutti i conti, anche quelli di altre banche?",
      a: "Sì. PSD2 è la direttiva europea che obbliga le banche a esporre API per accesso autorizzato dai clienti tramite provider AISP. Edilizia in Cloud è iscritta al registro AISP italiano. Connetti tutti i tuoi conti italiani, vista consolidata in dashboard unica.",
    },
    {
      q: "Posso eseguire bonifici dalla dashboard Tesoreria?",
      a: "Sì, tramite PISP (Payment Initiation Service Provider): autorizzi il pagamento con SCA della tua banca, il bonifico parte dal tuo conto. Operazione cifrata, conforme PSD2, audit trail completo. Funzionalità disponibile nei piani Business.",
    },
    {
      q: "Come funziona il previsionale 30/60/90 giorni?",
      a: "Il sistema costruisce previsionale rolling unendo: incassi attesi (scadenze fatture attive da scadenzario), uscite previste (fatture passive cassetto SDI, salari calcolati da CCNL Edilizia, ratei mutui/leasing). Aggiornamento real-time ad ogni nuovo evento.",
    },
    {
      q: "Cosa succede se la mia banca ha un'API PSD2 instabile?",
      a: "Il sistema gestisce automaticamente i tentativi di sync con backoff esponenziale e notifica solo se un conto è non sincronizzato per >24h. Hai sempre possibilità di sync manuale. Le banche italiane principali hanno SLA PSD2 stabili al 99%+.",
    },
    {
      q: "Gli alert sconfinamento sono affidabili?",
      a: "Sì, basati sul previsionale rolling più movimenti banca real-time. Falsi positivi <2% sui clienti monitorati 90 giorni. Alert configurabile per soglia importo (es. solo se sconfinamento previsto >1.000€) e per anticipo (es. -1/-3/-7 gg).",
    },
    {
      q: "Quanto costa? Ci sono limiti sui conti collegati?",
      a: "La Tesoreria è inclusa nei piani Professional e Business di Edilizia in Cloud. Conti bancari illimitati, sync PSD2 illimitato, previsionale 90 giorni incluso. Funzionalità PISP (bonifici da dashboard) disponibile nel piano Business.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La Tesoreria è il centro nervoso finanziario di un sistema più ampio.",
  internalLinksBody:
    "Posizione cassa, previsionale e alert si nutrono di prima nota, scadenzario, fatturazione e cassetto SDI. Una sola fonte di verità.",
  internalLinks: [
    { to: "/funzionalita/prima-nota", title: "Prima Nota", text: "Movimenti banca importati e classificati alimentano la tesoreria." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Scadenze incassi/pagamenti popolano il previsionale 30/60/90." },
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto Fiscale SDI", text: "Fatture passive imminenti entrano nel previsionale uscite." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture attive emesse alimentano previsionale incassi." },
    { to: "/funzionalita/cassa-cantiere", title: "Cassa Cantiere", text: "Movimenti cassa cantiere consolidati nella tesoreria." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "Cassa, fatturato, margini nel dashboard direzionale." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costi e ricavi cantiere imputati per analisi margine real-time." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Tesoreria inclusa nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di scoprire lo sconfinamento dall'estratto conto. Inizia a pianificare la cassa come una banca privata.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Tesoreria multi-banca dentro la tua impresa edile. Setup in 48 ore, sync PSD2 con tutte le banche italiane, previsionale 90 giorni e alert sconfinamento inclusi. Onboarding 1-a-1 con tesoriere dedicato, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Multi-banca PSD2 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Tesoreria",
  stickyCtaMicrocopy: "Setup 48h · Multi-banca PSD2",

  applicationSubCategory: "Construction Treasury Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function Tesoreria() {
  return <FunzionalitaPageTemplate config={config} />;
}
