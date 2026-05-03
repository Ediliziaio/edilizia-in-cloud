import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Coins,
  Database,
  FileText,
  HardHat,
  LineChart,
  PieChart,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "margini-cantiere",
  vertical: "Margini Cantiere",
  productName: "Modulo Margini Cantiere Edilizia in Cloud",
  audience: "Imprese edili, general contractor, controller di cantiere, titolari, geometri d'impresa, CFO PMI edili",
  audienceShort: "imprese edili strutturate",

  seo: {
    title:
      "Margini di Cantiere — Software Controllo Costi…",
    description:
      "Margine reale per commessa in tempo reale, scostamento preventivo/consuntivo automatico, alert sui cantieri a rischio. Smetti di scoprire i buchi a fine…",
    keywords:
      "margini cantiere software, controllo costi commessa edile, margine reale commessa, scostamento preventivo consuntivo, software controllo cantieri, dashboard margini edilizia, KPI cantiere, controllo gestione impresa edile, software ROI commessa edile",
    ogImage: "https://www.ediliziaincloud.com/og/margini-cantiere-og.jpg",
  },

  heroBadge: "Funzionalità · Margini Cantiere",
  heroH1Lead: "Vedi il margine reale di ogni commessa",
  heroH1Highlight: "in tempo reale",
  heroH1Tail: "non a fine cantiere",
  heroSubheadline:
    "Costi di manodopera dalle timbrature, materiali dai DDT, subappalti dai SAL: tutto imputato automaticamente alla commessa giusta. Lo scostamento preventivo/consuntivo lo vedi giorno per giorno, gli alert ti arrivano quando il cantiere rischia di andare in perdita — non a chiusura, quando è troppo tardi.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Alert push automatici", "Conformità CCNL inclusa"],
  proofPoints: [
    "Margine reale aggiornato ogni notte",
    "Scostamento preventivo / consuntivo",
    "Alert configurabili per soglia",
  ],

  objectiveRow: [
    ["Obiettivo", "Difendere il margine prima che il cantiere chiuda in perdita"],
    ["Momento chiave", "Ogni volta che entra un costo (DDT, busta paga, SAL subappalto)"],
    ["Risultato", "+18% margine medio recuperato sui cantieri controllati"],
  ],

  betaH2: "Più di 320 imprese italiane usano Edilizia in Cloud per controllare i margini dei cantieri ogni giorno.",
  betaBody:
    "Il modulo Margini Cantiere è il pannello di controllo finanziario della commessa: lo attiviamo in 48 ore, importiamo i tuoi cantieri aperti e i tuoi preventivi originali, configuriamo soglie di alert personalizzate sul tuo modello operativo e ti accompagniamo in 4 sessioni 1-a-1 fino a quando vedi il margine reale aggiornato di ogni cantiere senza dover chiedere a nessuno.",

  speedH2: "Il margine reale visto giorno per giorno cambia il modo in cui guidi l'azienda.",
  speedSubheadline:
    "Il problema del margine in edilizia non è la marginalità teorica: è la marginalità reale, scoperta tre mesi dopo la chiusura. Edilizia in Cloud accorcia quel gap a un clic, così puoi correggere mentre il cantiere è ancora aperto, non quando il danno è già fatto.",
  speedStats: [
    { value: 18, prefix: "+", suffix: "%", label: "margine medio recuperato sui cantieri controllati" },
    { value: 80, prefix: "-", suffix: "%", label: "tempo dedicato al controllo costi manuale" },
    { value: 24, suffix: " h", label: "ritardo massimo tra costo registrato e margine aggiornato" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata al margine.",
  familySubheadline:
    "Il margine reale non si calcola in Excel: si compone automaticamente quando timbrature, DDT materiali, SAL subappalto e busta paga parlano la stessa lingua. Edilizia in Cloud unisce tutto, così il margine è già il risultato del lavoro che fai ogni giorno.",
  familyItems: [
    {
      icon: Wallet,
      title: "Margini Cantiere",
      text: "Margine reale per commessa, scostamento preventivo/consuntivo, alert sui cantieri a rischio in tempo reale.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori, chat squadra. Fonte dati primaria per il margine reale.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Computo metrico, prezzari regionali, listini personalizzati. Definisce la base di confronto del margine.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Dalla fattura attiva alla fattura passiva, tutto imputato alla commessa. Cassa reale collegata al margine.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Users,
      title: "HR e Personale",
      text: "Operai, ferie, malattie, presenze e costo orario reale. Dati primari della voce manodopera.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Contratti, SAL, ritenute, DURC, fatture passive subappaltatori. Voce critica del margine.",
      to: "/funzionalita/gestione-subappalti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Sei moduli che alimentano il margine.",
  familyBonusText:
    "Il margine reale di ogni commessa è la somma vera di costi che già esistono nel tuo gestionale: ore via timbratura, materiali via DDT, subappalti via SAL, busta paga via cedolino. Edilizia in Cloud li mette in conversazione tra loro automaticamente, senza file Excel intermedi e senza data entry manuale.",

  painKicker: "Il problema vero",
  painH2: "Scoprire il buco a chiusura cantiere è scoprirlo troppo tardi.",
  painSubheadline:
    "Il vero problema dei margini in edilizia non è la marginalità teorica del preventivo: è la differenza tra preventivo e consuntivo che si rivela solo a chiusura, quando non puoi più correggere nulla. Quando il cantiere è chiuso, hai già perso. L'unica leva possibile è la visibilità in tempo reale.",
  painPoints: [
    {
      icon: TrendingDown,
      title: "Margine reale scoperto solo a fine cantiere",
      text: "Tre mesi dopo la chiusura il commercialista ti dice che la commessa ha perso 12.000€. Tu non sai dove. Materiali fuori budget? Ore non imputate? Subappalti gonfiati? Senza dato in tempo reale, l'analisi è archeologica.",
    },
    {
      icon: AlertTriangle,
      title: "Ore extra non imputate alla commessa giusta",
      text: "Il capocantiere fa 2 ore extra il sabato per recuperare un ritardo, ma le registra a forfait sulla commessa sbagliata o non le registra affatto. Il margine reale scende, tu non lo sai, e la causa diventa irrintracciabile.",
    },
    {
      icon: FileText,
      title: "Materiali in fattura un mese dopo la consegna",
      text: "Il fornitore consegna il 5 marzo, fattura il 20 aprile. Il margine reale del cantiere risulta 'positivo' fino al 20 aprile, poi crolla quando arriva la fattura. Nessuna anticipazione, nessun alert, nessuna possibilità di correggere.",
    },
    {
      icon: Search,
      title: "Excel multipli che non concordano mai",
      text: "Excel preventivo, Excel consuntivo, Excel ore operai, Excel subappalti. Quattro fogli con formule fragili, mantenuti da persone diverse, mai allineati. Quando li confronti, il margine cambia a seconda del file che apri.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stessi costi, stessa squadra. Cambia solo quando li vedi.",
  baSubheadline:
    "Il margine in edilizia non si crea con un software: si difende. Edilizia in Cloud non promette di farti guadagnare di più: ti promette di farti vedere prima quello che già stai perdendo, così puoi correggere mentre sei ancora in tempo.",
  baAreas: [
    {
      title: "Costi della manodopera",
      before:
        "Ore imputate a fine settimana, magari su un foglio di carta, magari a forfait. Il costo orario reale per cantiere è una stima a posteriori. Le ore straordinarie spariscono nel margine.",
      after:
        "Timbratura GPS al check-in, costo orario reale (con CCNL applicato) imputato in automatico alla commessa. Manodopera registrata mentre accade, scostamento sul preventivo aggiornato giorno per giorno.",
    },
    {
      title: "Costi dei materiali",
      before:
        "Costo materiali noto solo quando arriva la fattura, settimane dopo la consegna. Margine reale 'falsato' positivamente fino all'arrivo del passivo. Reazione possibile solo a fatto compiuto.",
      after:
        "Importazione automatica dei DDT (anche da PDF/email): costo materiali imputato alla commessa il giorno della consegna, non il giorno della fattura. Il margine si aggiorna in tempo reale.",
    },
    {
      title: "Costi dei subappalti",
      before:
        "SAL subappaltatore conteggiato a chiusura, ritenute calcolate manualmente, DURC scaduti che bloccano il pagamento. Il vero costo subappalto entra nel margine con due mesi di ritardo.",
      after:
        "Ogni SAL subappalto entra nel margine il giorno della firma, con ritenute (4% INPS) e DURC tracciati. Alert automatico su DURC in scadenza. Il costo subappalto è già il costo reale.",
    },
    {
      title: "Visione d'insieme del titolare",
      before:
        "Riunione settimanale con tre Excel diversi, ognuno con un margine diverso. Riconciliazione in due ore. Decisione operativa a 5 giorni di distanza dal problema. Cantiere già perso.",
      after:
        "Una dashboard unica con margine reale e atteso per tutti i cantieri attivi. Filtri per cliente, capocantiere, tipologia. Alert push quando un cantiere supera la soglia. Decisione in 5 minuti.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, niente formula Excel da scrivere, niente Excel multipli da riconciliare.",
  mechanismSubheadline:
    "Il margine reale non è il risultato di un calcolo aggiuntivo: è il sottoprodotto naturale di timbrature, DDT e SAL già registrati. Edilizia in Cloud li aggrega automaticamente. Tu fai esattamente quello che facevi prima — è solo il dato che si organizza da solo.",
  mechanismSteps: [
    {
      icon: Database,
      title: "I costi entrano nella commessa giusta automaticamente",
      text: "Ore via timbratura GPS, materiali via DDT importato (anche email/PDF), subappalti via SAL firmato, costi indiretti via causale di contabilità. Niente data entry manuale, niente Excel intermedio.",
    },
    {
      icon: PieChart,
      title: "Il margine reale si compone in tempo reale",
      text: "Il sistema confronta automaticamente costi reali e preventivo iniziale, calcola scostamenti per voce di lavorazione, evidenzia le categorie sotto pressione (manodopera, materiali, subappalti, indiretti).",
    },
    {
      icon: Bell,
      title: "Alert automatici sui cantieri a rischio",
      text: "Soglie configurabili per cantiere o per categoria di lavoro. Quando un cantiere supera l'80% del budget, ricevi notifica push e email. Tu intervieni mentre il margine è ancora difendibile.",
    },
  ],
  mechanismCta: "Prova il margine reale sul tuo primo cantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Il margine recuperato vale 10x l'abbonamento. Sempre.",
  commercialBody:
    "Le imprese edili italiane perdono in media 3-5 punti di margine per cantiere a causa di costi non controllati in tempo reale. Su un cantiere da 200.000€, sono 6.000-10.000€ di margine evaporato. Recuperarne anche solo metà vale 30 anni di abbonamento Edilizia in Cloud.",
  commercialLevers: [
    {
      icon: Target,
      title: "Difendi il margine prima del danno",
      text: "Non recuperi il margine 'a posteriori': lo difendi mentre il cantiere è aperto. La giornata di squadra recuperata, il fornitore richiamato sul prezzo, il subappalto rinegoziato valgono molto di più dell'abbonamento di un anno.",
    },
    {
      icon: Bell,
      title: "Alert push prima del superamento budget",
      text: "Soglie automatiche configurabili (50%, 80%, 100% del budget per voce). Notifica push e email quando un cantiere si avvicina al rischio. Tu agisci subito, non a fine cantiere.",
    },
    {
      icon: BarChart3,
      title: "Decisioni su numeri, non su sensazioni",
      text: "Smetti di scegliere il prossimo cantiere a sentimento. La dashboard ti mostra quali tipologie di lavoro hanno marginato di più negli ultimi 12 mesi. Prezzi e selezioni clienti meglio.",
    },
    {
      icon: TrendingUp,
      title: "Storico margini per prezzare meglio",
      text: "Lo storico per tipologia di intervento ti permette di prezzare il prossimo preventivo sui dati reali, non sulla teoria. Margine atteso e margine reale si avvicinano cantiere dopo cantiere.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il margine reale non è un report mensile. È un cruscotto sempre vivo.",
  resultsBody:
    "Quando il margine vive nello stesso strumento di cantieri, fatture e busta paga, smetti di gestire l'impresa per silos. Apri una dashboard, vedi tutto, decidi in fretta, comunichi meglio al commercialista, alla banca e ai soci.",
  integrationPillars: [
    {
      icon: LineChart,
      title: "Dashboard margini multi-cantiere",
      text: "Margine atteso, margine reale, scostamento %, voci sotto pressione. Filtri per cliente, capocantiere, area, tipologia. Vista titolare sempre aggiornata, vista capocantiere limitata al proprio cantiere.",
    },
    {
      icon: Bell,
      title: "Alert configurabili per soglia",
      text: "Soglie su scostamento globale, scostamento per voce (manodopera, materiali, subappalti), DURC subappaltatori, ritardi. Notifica push, email e Slack se configurato.",
    },
    {
      icon: Coins,
      title: "Fatturato vs incassato vs costi",
      text: "Tre dimensioni separate: fatturato emesso, incassato reale, costi imputati. Il margine reale tiene conto della cassa, non solo della contabilità.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità CCNL e fiscale tracciata",
      text: "Costo orario CCNL applicato per qualifica e contratto, ritenute subappaltatori calcolate, DURC tracciati. Il margine reale riflette i costi pieni, non quelli ottimistici.",
    },
  ],
  resultStats: [
    { value: 18, prefix: "+", suffix: "%", label: "margine medio recuperato sui cantieri controllati" },
    { value: 92, prefix: "+", suffix: "%", label: "soddisfazione titolari dopo 90 giorni" },
    { value: 5, prefix: "-", suffix: " gg", label: "ritardo medio nell'identificare cantieri a rischio" },
  ],
  resultsCta: "Apri la tua dashboard margini",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto margine puoi recuperare se vedi i costi mentre accadono?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e fatturato medio annuo per cantiere. La stima parte da 4 punti percentuali di margine recuperato, base media osservata nei nostri clienti dopo 90 giorni.",
  roi: {
    input1Label: "Cantieri attivi in media",
    input1Default: 6,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Fatturato medio annuo per cantiere",
    input2Default: 150000,
    input2Min: 20000,
    input2Max: 1500000,
    input2Step: 10000,
    input2Suffix: " €",
    outputLabel: "Margine recuperato stimato/anno",
    computeOutput: (a, b) => Math.round(a * b * 0.04),
    computeSecondary: (a, b) => [
      { label: "Fatturato totale gestito", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(a * b) },
      { label: "Cantieri salvati da rosso (stima)", value: `${Math.max(1, Math.round(a * 0.15))}` },
      { label: "Ore controller risparmiate/anno", value: `${Math.round(a * 60)} h` },
    ],
    closingPitch:
      "Stima prudenziale basata su 4% di margine recuperato. Le imprese più strutturate registrano tra il 5% e l'8% nei primi 12 mesi grazie agli alert preventivi.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un dashboard in più. Un sistema di controllo costi sempre acceso.",
  salesBody:
    "Il margine reale non è un KPI da consultare ogni tanto: è un sistema operativo che cambia il modo in cui guidi l'impresa. Quando il dato è sempre lì, vivo, decidi in modo diverso. Ecco le 4 dimensioni che cambiano subito.",
  salesImpact: [
    {
      title: "Riunioni di controllo costi più brevi",
      text: "Le riunioni 'come stiamo a margini?' diventano 'cosa facciamo sul cantiere X?'. Si parte già dal dato condiviso, si discute solo di azioni.",
    },
    {
      title: "Trattative col cliente più solide",
      text: "Quando hai dati reali sul margine, sai quanto puoi sconto fare e dove no. Le trattative finali si chiudono con margini protetti, non con sconti spannometrici.",
    },
    {
      title: "Conversazioni col commercialista più semplici",
      text: "Esporti il consuntivo per cantiere a un click, mostri costi imputati e margine reale, il commercialista prepara il bilancio sulla base di numeri già strutturati.",
    },
    {
      title: "Banche e finanziatori più rassicurati",
      text: "Quando chiedi un fido o presenti un business plan, mostri storico marginalità per tipologia di intervento. La banca vede un'impresa in controllo, non un artigiano spannometrico.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Margine reale per commessa",
      value:
        "Aggregazione automatica di manodopera (timbrature), materiali (DDT), subappalti (SAL), costi indiretti (causali). Margine atteso vs margine reale aggiornato giorno per giorno.",
    },
    {
      label: "Scostamento preventivo / consuntivo",
      value:
        "Confronto automatico con il preventivo originale per voce di lavorazione. Evidenza delle voci sotto pressione (es. manodopera +18%, materiali -5%, subappalti +12%).",
    },
    {
      label: "Alert configurabili per soglia",
      value:
        "Soglie globali e per voce. Notifiche push, email e Slack quando un cantiere supera la soglia. Configurabili per ruolo (titolare, controller, geometra d'impresa).",
    },
    {
      label: "Importazione automatica DDT e fatture",
      value:
        "Lettura automatica di DDT e fatture passive (anche da PDF/email) con riconciliazione sulla commessa giusta. Riduce il ritardo del costo materiali da settimane a giorni.",
    },
    {
      label: "Costo orario CCNL per qualifica",
      value:
        "Costo orario reale per qualifica e contratto applicato in automatico. La manodopera entra nel margine con il costo pieno, non con stime ottimistiche.",
    },
    {
      label: "Storico margini per tipologia",
      value:
        "Dashboard che mostra marginalità media per tipologia di lavoro (ristrutturazione, costruzione nuova, infissi, copertura). Base di prezzaggio per i prossimi preventivi.",
    },
    {
      label: "Export consuntivo per commercialista",
      value:
        "Esporta consuntivo per commessa in formato Excel, CSV o tracciato per TeamSystem, Zucchetti, Datev. Il commercialista parte da dati già imputati, non da bolle Excel.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud salva il margine prima che sia troppo tardi.",
  scenarios: [
    {
      title: "Cantiere che sfora il budget materiali al 60%",
      text:
        "Il cantiere è al 60% di avanzamento ma ha già consumato l'85% del budget materiali. Ricevi notifica push. Apri il dettaglio: una variante in corso d'opera non era stata formalizzata. Richiami il cliente, formalizzi la variante con addendum firmato online, recuperi 8.500€ di margine.",
    },
    {
      title: "Subappaltatore con DURC scaduto",
      text:
        "Stai per pagare un SAL al subappaltatore. Il sistema blocca il pagamento perché il DURC è scaduto. Eviti il rischio di responsabilità solidale (art. 29 D.Lgs 276/2003), richiedi DURC aggiornato, paghi solo dopo verifica.",
    },
    {
      title: "Nuovo preventivo per intervento già fatto",
      text:
        "Il geometra ti chiede un preventivo per una ristrutturazione 'simile a quella di Via Roma'. Apri lo storico margini di Via Roma: vedi che il margine reale è stato 11% (atteso 18%). Capisci dove hai sbagliato a prezzare e correggi il nuovo preventivo: parti già con +7 punti di margine atteso.",
    },
  ],

  testimonialQuote:
    "Il primo mese ho scoperto che due cantieri stavano marginando metà di quello che pensavo. Ho corretto in corsa: variante firmata su uno, fornitore rinegoziato sull'altro. A fine anno mi sono trovato 24.000€ di margine in più.",
  testimonialAuthor: "Andrea M.",
  testimonialRole: "Edil Costruzioni Marchetti, Bologna",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Il margine si aggiorna davvero in tempo reale?",
      a: "Sì. Ogni timbratura GPS, ogni DDT importato, ogni SAL firmato aggiorna immediatamente il consuntivo del cantiere. Il margine reale è ricalcolato a ogni nuovo costo, con un ritardo massimo di pochi minuti tra l'evento e l'aggiornamento dashboard.",
    },
    {
      q: "Come si imputano i costi indiretti (sede, ammortamenti, assicurazioni)?",
      a: "Definisci un coefficiente di costi indiretti (es. 8%) applicato in automatico alla manodopera diretta di ogni cantiere. Oppure imputi causali specifiche (assicurazione cantiere, sicurezza, fideiussioni) direttamente sulla commessa interessata.",
    },
    {
      q: "Posso confrontare il margine reale con il preventivo originale?",
      a: "Sì. Ogni commessa nasce dal preventivo accettato (o importato) e mantiene il confronto preventivo/consuntivo per tutta la vita. Vedi scostamento globale e per voce (manodopera, materiali, subappalti, indiretti).",
    },
    {
      q: "Posso configurare alert personalizzati?",
      a: "Sì. Soglie globali (es. 80% del budget consumato) e per voce (es. materiali +10%). Notifiche push, email e Slack se configurato. Configurabili per ruolo: il titolare riceve tutto, il geometra d'impresa solo i suoi cantieri.",
    },
    {
      q: "I dati sono compatibili con il mio commercialista?",
      a: "Sì. Edilizia in Cloud esporta consuntivi per commessa in Excel, CSV o tracciati specifici per TeamSystem, Zucchetti, Datev. Il commercialista riceve dati già imputati per centro di costo, non bolle Excel.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo Margini Cantiere è incluso nei piani Professional e Business di Edilizia in Cloud. Nessun costo di attivazione, nessun vincolo di durata, cancelli quando vuoi. Onboarding 1-a-1, configurazione soglie e supporto italiano sempre inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il margine vive collegato a tutto il resto. Ecco come.",
  internalLinksBody:
    "Margini Cantiere è il pannello di controllo, ma vive grazie ai dati che entrano da preventivi, gestione cantieri, fatturazione, HR e subappalti. Ecco i moduli e le pagine collegate.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori. Fonte primaria dei dati operativi che alimentano il margine.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Computo metrico, prezzari regionali, listini personalizzati. Definisce la base di confronto del margine atteso.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dalla fattura attiva alla fattura passiva, tutto collegato alla commessa. Cassa reale che entra nel margine.",
    },
    {
      to: "/funzionalita/hr-personale",
      title: "HR e Personale",
      text: "Operai, ferie, malattie, presenze, costo orario reale CCNL. Voce manodopera del margine.",
    },
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Contratti, SAL, ritenute, DURC. Voce critica del margine che spesso esplode senza controllo.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi AI",
      text: "Per serramentisti: prima/dopo realistico per chiudere preventivi più velocemente con margini più solidi.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni AI",
      text: "Per imprese di ristrutturazione: prima/dopo sulla foto reale del cliente per migliorare il pricing.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma orientata alle imprese edili italiane: gestione, controllo, vendita, fatturazione.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti da 49€/mese. Margini Cantiere è incluso in Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di scoprire i buchi a fine cantiere. Inizia a vederli mentre puoi correggerli.",
  finalCtaBody:
    "31 giorni gratuiti per portare Edilizia in Cloud nel controllo dei tuoi cantieri. Setup in 48 ore, alert push automatici sui cantieri a rischio, dashboard margini multi-cantiere e integrazione completa con preventivi, HR e subappalti. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Alert push · Dashboard sempre aggiornata",

  stickyCtaLabel: "Prova gratis Margini Cantiere",
  stickyCtaMicrocopy: "Setup 48h · Cancelli quando vuoi",

  applicationSubCategory: "Construction Cost Control Software",

  relatedBlogSlugs: [
    "controllo-costi-cantiere-guida",
    "alternativa-excel-cantieri",
    "sal-cantiere-come-funziona",
  ],
};

export default function MarginiCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
