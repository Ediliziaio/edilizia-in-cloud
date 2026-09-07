import {
  AlertTriangle,
  Camera,
  ClipboardList,
  Clock,
  Cloud,
  Database,
  Fingerprint,
  HardHat,
  Image as ImageIcon,
  Layers,
  Package,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  WifiOff,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "app-cantiere-mobile",
  definizione:
    "L'App Cantiere di Edilizia in Cloud è l'app nativa iOS e Android per capocantieri, operai e tecnici: timbratura GPS, foto geolocalizzate, ordini di materiali, SAL giornaliero, giornale lavori, chat di squadra e firma del cliente, funzionante anche senza segnale grazie alla modalità offline.",
  vertical: "App Cantiere Mobile",
  productName: "App Cantiere Mobile Edilizia in Cloud",
  audience:
    "Imprese edili e di manutenzione che vogliono dotare capocantieri, operai e tecnici di un'app iOS/Android per timbrature GPS, foto cantiere geolocalizzate, ordini materiali, SAL, giornale lavori, comunicazione team, funzionante anche offline in cantieri con scarso segnale",
  audienceShort: "imprese edili e capocantieri",

  seo: {
    title:
      "App Cantiere Mobile: iOS e Android per Operai",
    description:
      "App mobile dedicata ai cantieri: timbratura GPS, foto cantiere, ordini materiali, SAL, giornale lavori e chat team. Funziona offline anche con scarso segnale.",
    keywords:
      "app cantiere mobile, app capocantiere, app operai edilizia, app timbratura GPS cantiere, app foto cantiere, app giornale lavori, software cantiere offline, app iOS Android edilizia, gestione cantiere mobile, app cantiere senza segnale",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · App Cantiere Mobile",
  heroH1Lead: "Il cantiere in tasca",
  heroH1Highlight: "anche senza segnale",
  heroH1Tail: "iOS e Android",
  heroSubheadline:
    "App nativa iOS e Android per capocantieri, operai e tecnici: timbratura GPS, foto cantiere geolocalizzate, ordini materiali, SAL giornaliero, giornale lavori, comunicazione team, firma cliente. Offline-first: lavora in cantine, sottotetti, zone industriali isolate. Sync automatica al rientro online. 31 giorni gratis.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import operai e cantieri",
    "iOS e Android nativi, non web app",
    "Funziona offline in cantieri senza segnale",
  ],
  proofPoints: [
    "Timbratura GPS conforme CCNL Edilizia",
    "Foto cantiere geolocalizzate",
    "Sync automatica al rientro online",
  ],

  objectiveRow: [
    ["Obiettivo", "Capocantieri operativi senza tornare in ufficio"],
    ["Momento chiave", "Inizio giornata, intervento, fine cantiere, sync sera"],
    ["Risultato", "Operai produttivi, dati real-time, amministrazione semplificata"],
  ],

  betaH2:
    "Più di 410 imprese edili italiane usano App Cantiere Mobile per gestire i loro team in cantiere.",
  betaBody:
    "Attiviamo l'App in 48 ore: importiamo anagrafiche operai e capocantieri, configuriamo cantieri attivi con geofencing, attiviamo timbratura GPS conforme CCNL Edilizia, configuriamo permessi per ruolo (capocantiere, operaio, tecnico), formiamo il team con 4 sessioni 1-a-1 fino al primo cantiere gestito 100% via app.",

  speedH2:
    "Capocantiere passa il 30-40% della giornata tornando in ufficio per consegnare carta, prendere ricambi, firmare documenti. App Cantiere lo elimina.",
  speedSubheadline:
    "L'impresa edile media perde 2-4 ore al giorno per capocantiere in viaggi inutili tra cantiere e ufficio: consegnare giornale lavori, prendere ricambi, firmare DDT, ricevere foto da titolare, scambiare informazioni. App Cantiere Mobile elimina questi viaggi: tutto avviene direttamente dal telefono in cantiere.",
  speedStats: [
    { value: 4, prefix: "+", suffix: " h", label: "ore/settimana recuperate per capocantiere" },
    { value: 100, suffix: "%", label: "cantiere gestibile da telefono" },
    { value: 0, suffix: "", label: "viaggi inutili cantiere-ufficio" },
  ],

  familyH2: "L'app vive collegata a tutta la piattaforma: cantieri, fatturazione, magazzino, HR.",
  familySubheadline:
    "L'App Cantiere non è un'app standalone: è la finestra mobile di tutta la piattaforma Edilizia in Cloud. Ogni timbratura aggiorna le ore CCNL, ogni foto va al portale cliente, ogni ordine scarica magazzino, ogni SAL alimenta marginalità. Mobile-first, integrazione totale.",
  familyItems: [
    {
      icon: Smartphone,
      title: "App Cantiere Mobile",
      text: "App iOS/Android per operai e capocantieri, offline-first, timbratura GPS.",
      to: "/funzionalita/app-cantiere-mobile",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Cantieri sincronizzati live con app: avanzamento, foto, SAL, giornale lavori.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Clock,
      title: "Timbrature GPS",
      text: "Timbratura ingresso/uscita con geofencing cantiere, conforme CCNL Edilizia.",
      to: "/funzionalita/timbrature-gps",
    },
    {
      icon: ImageIcon,
      title: "Foto Cantiere",
      text: "Galleria foto cantiere geolocalizzate alimenta portale cliente in tempo reale.",
      to: "/funzionalita/foto-cantiere",
    },
    {
      icon: Wrench,
      title: "Manutenzione Impianti",
      text: "Tecnici manutenzione usano l'app per interventi, libretti digitali, firma cliente.",
      to: "/funzionalita/manutenzione-impianti",
    },
    {
      icon: Package,
      title: "Ordini di Acquisto",
      text: "Capocantiere ordina materiali da app con foto, fornitore riceve ordine in tempo reale.",
      to: "/funzionalita/ordini-acquisto",
    },
  ],
  familyBonusTitle: "Una app. Tutta la piattaforma in tasca.",
  familyBonusText:
    "Quando un capocantiere timbra l'ingresso, parte il calcolo ore CCNL. Quando scatta una foto, va al portale cliente. Quando ordina materiali, il fornitore riceve PDF. Quando chiude la giornata con SAL, il consuntivo si aggiorna. Mobile-first, integrazione totale, niente data entry duplicato in ufficio.",

  painKicker: "Il problema vero",
  painH2:
    "Capocantiere passa la metà della giornata in macchina tra cantiere e ufficio. È così che muore la produttività delle imprese edili.",
  painSubheadline:
    "Le imprese edili medie perdono 8-15 ore alla settimana per capocantiere in viaggi inutili: consegnare giornale lavori, prendere fatture firmate, mostrare foto al titolare, ricevere ricambi, firmare DDT. Senza un'app mobile integrata, il cantiere è un'isola disconnessa dall'ufficio.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Capocantiere in macchina, non in cantiere",
      text: "30-40% della giornata in viaggi tra cantiere e ufficio: consegnare carta, prendere materiali, firmare documenti, mostrare foto. Su 8 ore di lavoro, 2,5-3,5 ore non produttive. Su 4 capocantieri = 60-80h/settimana perse.",
    },
    {
      icon: WifiOff,
      title: "App che non funzionano in cantieri isolati",
      text: "App generiche cloud-only smettono di funzionare in cantine, sottotetti, gallerie, zone industriali isolate. Capocantiere non può timbrare, non può scattare foto utili, non può chiudere SAL. Sistema inutile dove serve di più.",
    },
    {
      icon: ClipboardList,
      title: "Giornale lavori cartaceo che si perde",
      text: "Capocantiere compila giornale lavori a fine giornata su carta, lo porta in ufficio settimana dopo. Spesso illeggibile, parziale, perso. Ricostruire ore e attività di un cantiere chiuso 6 mesi fa: missione impossibile.",
    },
    {
      icon: Phone,
      title: "Comunicazione team via WhatsApp privato",
      text: "Capocantieri e operai comunicano via WhatsApp privato, gruppi misti con clienti, foto sparse. Niente tracciabilità, niente integrazione gestionale, dati persi quando un capocantiere lascia l'azienda. Caos informativo.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stessi capocantieri, stessi operai. Cambia il numero di ore produttive e la qualità dei dati.",
  baSubheadline:
    "L'App Cantiere Mobile non sostituisce il capocantiere né l'operaio: gli toglie il peso burocratico che oggi divora 2-4 ore al giorno. Risultato: capocantieri in cantiere a guidare il team, dati real-time in ufficio, amministrazione che gira da sola.",
  baAreas: [
    {
      title: "Inizio giornata in cantiere",
      before:
        "Capocantiere passa in ufficio alle 7, prende fogli giornale lavori, schede materiali, indicazioni titolare. Arriva in cantiere alle 8:30. 1 ora persa al giorno.",
      after:
        "Capocantiere apre app sul telefono alle 7: cantieri assegnati, operai presenti, materiali necessari, foto giorno precedente, comunicazioni titolare. Arriva in cantiere alle 7:45 e parte. 45 min recuperati.",
    },
    {
      title: "Timbratura ingresso operai",
      before:
        "Capocantiere segna ingresso operai su quaderno cartaceo. A fine settimana porta in ufficio, segretaria trascrive in Excel paghe. Errori, contestazioni, ricostruzioni a memoria.",
      after:
        "Operai timbrano da app con GPS al varco cantiere (geofencing). Ore calcolate automatiche per CCNL Edilizia (ordinarie, straordinarie, festive). Pronte per cedolino senza data entry.",
    },
    {
      title: "Foto cantiere e portale cliente",
      before:
        "Capocantiere scatta foto sul telefono privato, le manda al titolare via WhatsApp, il titolare le inoltra al cliente o al commerciale. Foto che si perdono, qualità varia, niente geolocalizzazione.",
      after:
        "Capocantiere scatta foto da app con tag automatico (cantiere, fase lavori, ora, GPS). Vanno al portale cliente in tempo reale, archiviate cloud, ricercabili per data/cantiere. Cliente felice.",
    },
    {
      title: "Chiusura giornata con SAL",
      before:
        "Capocantiere torna in ufficio a fine giornata, scrive giornale lavori a mano, racconta al titolare attività e problemi. 1 ora dopo la fine cantiere. Capocantiere torna a casa alle 19:30.",
      after:
        "Capocantiere chiude SAL giornaliero da app in 5 minuti dal cantiere: attività svolte, ore operai, materiali consumati, foto, note. Va a casa alle 18 dal cantiere direttamente. Dati live in ufficio.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dalla tasca del capocantiere alla dashboard del titolare.",
  mechanismSubheadline:
    "L'App Cantiere Mobile è progettata per imprese che gestiscono 5-100 cantieri attivi: app nativa iOS/Android, offline-first, sync intelligente, permessi per ruolo. Tutto integrato senza tablet aziendali e senza training di settimane.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "Capocantiere apre app, vede cantieri assegnati",
      text: "Login biometrico (FaceID/TouchID), dashboard con cantieri attivi, operai assegnati, attività programmate, materiali da ordinare, foto giorno precedente, comunicazioni titolare. Tutto pronto in 10 secondi.",
    },
    {
      icon: WifiOff,
      title: "Lavora in cantiere, anche offline",
      text: "Timbratura GPS, foto, SAL, ordini materiali, giornale lavori, firma cliente: tutto funziona anche senza segnale. App salva in locale, sync automatica al rientro in zona coperta. Cantiere mai bloccato.",
    },
    {
      icon: Cloud,
      title: "Sync automatica + dashboard live ufficio",
      text: "Quando l'app rientra online, sync automatica e silente. Dashboard ufficio aggiornata in tempo reale: ore CCNL, foto al portale cliente, ordini al fornitore, marginalità cantiere. Nessuna duplicazione dati.",
    },
  ],
  mechanismCta: "Apri la dashboard App Cantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Capocantieri produttivi, dati real-time, amministrazione che si fa da sola.",
  commercialBody:
    "Le imprese edili che adottano l'App Cantiere Mobile recuperano in media 4-8 ore alla settimana per capocantiere, alimentano dashboard live in ufficio senza data entry e azzerano gli errori di timbratura, paga, fattura legati al cartaceo. Il ritorno operativo si vede dalla prima settimana.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "+4-8 ore/settimana per capocantiere",
      text: "Niente più viaggi cantiere-ufficio per consegnare carta, prendere materiali, mostrare foto. Capocantiere guida operai, gestisce cantiere, parla con cliente. Tempo produttivo cresce, qualità cantiere sale.",
    },
    {
      icon: Database,
      title: "Dati real-time in ufficio",
      text: "Ore CCNL, foto cantiere, materiali consumati, SAL giornaliero: tutto in dashboard live in ufficio. Niente più 'aspettiamo che capocantiere torni a fine settimana'. Decisioni rapide, problemi visti subito.",
    },
    {
      icon: ShieldCheck,
      title: "Errori paga e fattura azzerati",
      text: "Timbrature GPS conformi CCNL Edilizia, ore calcolate automatiche (ordinarie, straordinarie, festive, notturne). Cedolini senza errori, contestazioni operai sparite, contestazioni cliente su DDT/ore sparite.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come impresa moderna",
      text: "Operai che usano app moderna iOS/Android, capocantieri che fanno timbratura GPS, clienti che vedono foto in tempo reale: percezione aziendale 'strutturata'. Ricruiting più facile, retention operai più alta.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Capocantieri che gestiscono cantiere dal telefono. Titolare che vede tutto in dashboard.",
  resultsBody:
    "Quando ogni cantiere vive in tempo reale nel telefono di chi lo gestisce, l'impresa edile cambia ritmo. Capocantieri liberi dal cartaceo, titolari informati senza interrogare nessuno, amministrazione semplificata, errori azzerati. È la digital transformation reale del cantiere edile.",
  integrationPillars: [
    {
      icon: Fingerprint,
      title: "Timbratura GPS conforme CCNL Edilizia",
      text: "Geofencing cantiere, calcolo automatico ore ordinarie/straordinarie/festive/notturne. Conforme CCNL Edilizia industria e artigianato. Pronte per cedolino senza data entry.",
    },
    {
      icon: Camera,
      title: "Foto cantiere geolocalizzate",
      text: "Scatti da app con tag automatico (cantiere, fase, ora, GPS). Galleria organizzata, ricercabile, condivisa al portale cliente in tempo reale. Documentazione visiva continua.",
    },
    {
      icon: WifiOff,
      title: "Offline-first totale",
      text: "Tutte le funzioni operano senza connessione: timbratura, foto, SAL, ordini, giornale lavori, firma cliente. App salva in locale, sync automatica al rientro online. Cantiere mai bloccato.",
    },
    {
      icon: Layers,
      title: "Permessi per ruolo granulari",
      text: "Capocantiere vede tutto cantiere, operaio solo timbratura e foto, tecnico manutenzione solo interventi assegnati, amministrazione vista globale. Ogni utente vede ciò che gli serve.",
    },
  ],
  resultStats: [
    { value: 4, prefix: "+", suffix: " h", label: "ore/settimana recuperate per capocantiere" },
    { value: 100, suffix: "%", label: "cantiere gestibile da telefono" },
    { value: 0, suffix: "", label: "errori timbratura per cartaceo" },
  ],
  resultsCta: "Apri la dashboard App Cantiere",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale recuperare ore di amministrazione cantiere ogni settimana × tutto il team operativo?",
  roiSubheadline:
    "Sposta i cursori sui tuoi numeri reali: numero operai/capocantieri attivi e ore amministrazione cantiere risparmiate a settimana. Stima a 30€/h costo orario medio impresa edile.",
  roi: {
    input1Label: "Operai/capocantieri attivi",
    input1Default: 15,
    input1Min: 5,
    input1Max: 100,
    input1Step: 1,
    input2Label: "Ore amministrazione/sett risparmiate",
    input2Default: 4,
    input2Min: 1,
    input2Max: 15,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * b * 30),
    computeSecondary: (a, b) => [
      { label: "Ore/anno recuperate team", value: `${a * 52 * b} h` },
      { label: "Equivalente FTE liberato", value: `${(a * 52 * b / 1700).toFixed(1)} FTE` },
      { label: "Errori paga evitati/anno", value: "100%" },
    ],
    closingPitch:
      "Stima conservativa con 30€/h costo orario medio. Aggiungi gli errori cedolino azzerati, le contestazioni cliente eliminate e la qualità dei dati real-time: il ROI reale è multiplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un'app generica. La piattaforma in tasca per chi vive di cantieri.",
  salesBody:
    "L'App Cantiere Mobile trasforma il cantiere da isola disconnessa a nodo della piattaforma. Le 4 dimensioni operative che cambiano dal primo giorno di adozione.",
  salesImpact: [
    {
      title: "Capocantieri produttivi",
      text: "Smettono di essere postini tra cantiere e ufficio. Tornano a fare il loro lavoro vero: guidare squadra, gestire fornitori, parlare con cliente, supervisionare qualità lavori. +4-8h/sett.",
    },
    {
      title: "Amministrazione semplificata",
      text: "Niente più trascrizione di ore da quaderno cartaceo, niente foto inoltrate via WhatsApp, niente DDT scansionati a mano. Dati arrivano già strutturati. Segretaria libera per attività a valore.",
    },
    {
      title: "Cliente percepisce trasparenza",
      text: "Foto cantiere live sul portale, avanzamento aggiornato dalla app, comunicazioni tracciate. Cliente vede l'impresa che lavora bene, recensioni 5★ crescono, passaparola caldo si moltiplica.",
    },
    {
      title: "Conformità CCNL Edilizia garantita",
      text: "Timbrature GPS conformi, ore calcolate automatiche, paghe corrette. Niente più contestazioni operai per ore non riconosciute, niente più errori cedolino, niente sanzioni Ispettorato Lavoro.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per operai e capocantieri, non slogan tech.",
  featureRows: [
    {
      label: "App nativa iOS e Android",
      value:
        "Sviluppata in Swift (iOS) e Kotlin (Android), non è una web app travestita. Performance native, accesso fotocamera/GPS/biometria, notifiche push affidabili. Funziona su iPhone 11+ e Android 8+.",
    },
    {
      label: "Timbratura GPS conforme CCNL Edilizia",
      value:
        "Geofencing cantiere (raggio configurabile), timbratura ingresso/uscita, ore calcolate automatiche (ordinarie, straordinarie, festive, notturne) per CCNL Edilizia industria e artigianato.",
    },
    {
      label: "Foto cantiere con tag automatico",
      value:
        "Scatto fotografico da app con tag automatico cantiere, fase lavori, GPS, timestamp. Galleria organizzata per cantiere, condivisione al portale cliente in tempo reale, archivio cloud illimitato.",
    },
    {
      label: "Ordini materiali da cantiere",
      value:
        "Capocantiere ordina ricambi/materiali da app con foto e quantità, fornitore riceve PDF ordine in tempo reale via PEC/email. Magazzino aggiornato, scadenze pagamento tracciate.",
    },
    {
      label: "SAL giornaliero e giornale lavori",
      value:
        "Chiusura giornata in 5 minuti: attività svolte, operai presenti, ore lavorate, materiali consumati, problemi riscontrati, foto. Compila giornale lavori automaticamente, conforme normative.",
    },
    {
      label: "Comunicazione team interna",
      value:
        "Chat per cantiere con team operai/capocantieri/titolare, allegati foto/video/PDF, messaggi tracciati. Niente più WhatsApp privato disperso, tutto archiviato per cantiere.",
    },
    {
      label: "Offline-first con sync intelligente",
      value:
        "Tutte le funzioni operano senza connessione, dati salvati in locale criptati. Sync automatica e silente al rientro online, gestione conflitti automatica, niente perdita dati garantita.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui App Cantiere Mobile cambia la giornata.",
  scenarios: [
    {
      title: "Cantiere in centro storico senza segnale 4G",
      text:
        "Cantiere ristrutturazione palazzo storico, scantinati senza segnale. Capocantiere timbra operai, scatta 12 foto, chiude SAL giornaliero, ordina ricambi: tutto offline. Esce dal cantiere alle 18, sync automatica al primo bar, dati in dashboard ufficio in 10 secondi.",
    },
    {
      title: "Operaio dimentica ingresso, contestazione paga",
      text:
        "Operaio dice di essere entrato alle 7, capocantiere segna 7:30 sul cartaceo, contestazione cedolino. Apri app: timbratura GPS al varco cantiere alle 7:04, geolocalizzata, datata. Discussione chiusa in 30 secondi, paga corretta.",
    },
    {
      title: "Cliente chiede foto progressi a mezzogiorno",
      text:
        "Cliente alle 13 vuole vedere come va il cantiere. Capocantiere ha scattato 8 foto della mattina, già caricate al portale cliente con tag e GPS. Cliente apre portale, vede progressi reali in tempo reale. Niente telefonata al titolare, niente ansia.",
    },
  ],

  testimonialQuote:
    "Avevo 3 capocantieri che passavano la metà della giornata in macchina tra ufficio e cantiere. Con l'App Cantiere Mobile sono tornati a fare i capocantieri veri: 4 ore in più a settimana ciascuno in cantiere, 12 ore totali. La cosa più sorprendente: zero contestazioni paga in 8 mesi, prima ne avevamo 2-3 al mese. Le timbrature GPS hanno chiuso un capitolo che drenava energia.",
  testimonialAuthor: "Paolo G.",
  testimonialRole: "Costruzioni Generali GM Srl, Genova",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "L'app funziona davvero offline in cantieri senza segnale?",
      a: "Sì. È nativa iOS/Android (non web app), tutte le funzioni operano in locale: timbratura GPS, foto, SAL, ordini materiali, giornale lavori, firma cliente. Dati salvati cryptati nel telefono. Sync automatica e silente al rientro online. Testato in cantine, sottotetti, gallerie, zone industriali isolate.",
    },
    {
      q: "I miei operai sono anziani e poco tech, riusciranno a usarla?",
      a: "Sì. UI semplificata stile WhatsApp con icone grandi, testo chiaro, navigazione a 1-2 tap. Operai over 50 imparano in 15 minuti. Funzioni essenziali (timbratura, foto) richiedono solo 1 tap. Formazione inclusa nell'onboarding 1-a-1, supporto continuo per primi 30 giorni.",
    },
    {
      q: "La timbratura GPS è davvero conforme CCNL Edilizia?",
      a: "Sì. Geofencing cantiere con raggio configurabile, calcolo automatico ore ordinarie/straordinarie/festive/notturne secondo CCNL Edilizia industria e artigianato. Esportabile in formato compatibile con i principali software paghe italiani (TeamSystem, Zucchetti, Datev). Conformità GDPR garantita.",
    },
    {
      q: "Posso dare permessi diversi a operai, capocantieri, tecnici?",
      a: "Sì. Permessi granulari per ruolo: operaio vede solo timbratura e foto del proprio cantiere; capocantiere vede tutto cantiere assegnato; tecnico manutenzione vede solo interventi assegnati; titolare/amministrazione vista globale. Configurabili da dashboard.",
    },
    {
      q: "Funziona su telefoni aziendali o anche personali degli operai?",
      a: "Funziona su entrambi. Per telefoni aziendali: deploy via MDM (Mobile Device Management) o store privato. Per BYOD (telefoni personali): app scaricabile da App Store/Play Store, accesso solo ai dati lavoro, separazione totale dai dati personali. Conformità GDPR.",
    },
    {
      q: "Quanto costa? Ci sono costi per utente o per cantiere?",
      a: "L'App Cantiere Mobile è inclusa nei piani Professional e Business. Utenti illimitati, cantieri illimitati, sync illimitata, foto illimitate, archivio cloud incluso. Nessun costo per utente attivato, nessun vincolo pluriennale. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "L'App vive collegata a tutta la piattaforma.",
  internalLinksBody:
    "L'App Cantiere Mobile è la finestra di tutta Edilizia in Cloud: cantieri, timbrature, foto, manutenzione, ordini. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Cantieri sincronizzati live con app, avanzamento, foto, SAL.",
    },
    {
      to: "/funzionalita/timbrature-gps",
      title: "Timbrature GPS",
      text: "Timbratura ingresso/uscita con geofencing, conforme CCNL Edilizia.",
    },
    {
      to: "/funzionalita/foto-cantiere",
      title: "Foto Cantiere",
      text: "Galleria foto geolocalizzate alimenta portale cliente in tempo reale.",
    },
    {
      to: "/funzionalita/manutenzione-impianti",
      title: "Manutenzione Impianti",
      text: "Tecnici manutenzione usano app per interventi e libretti digitali.",
    },
    {
      to: "/funzionalita/ordini-acquisto",
      title: "Ordini di Acquisto",
      text: "Capocantiere ordina materiali da app con foto e quantità.",
    },
    {
      to: "/funzionalita/giornale-lavori",
      title: "Giornale Lavori",
      text: "Compilazione giornale lavori automatica da app, conforme normative.",
    },
    {
      to: "/funzionalita/portale-clienti",
      title: "Portale Clienti",
      text: "Foto e avanzamenti dall'app vanno al portale cliente in tempo reale.",
    },
    {
      to: "/per/imprese-edili",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e cantieri.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "App Cantiere Mobile inclusa nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di far perdere ore ai tuoi capocantieri in viaggi inutili. Inizia a metterli in cantiere col telefono in mano.",
  finalCtaBody:
    "31 giorni gratuiti per portare l'App Cantiere Mobile dentro la tua impresa: setup in 48 ore, app iOS/Android nativa, timbratura GPS conforme CCNL Edilizia, foto cantiere geolocalizzate, offline-first totale. Onboarding 1-a-1, formazione team inclusa. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · iOS/Android nativi · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis App Cantiere",
  stickyCtaMicrocopy: "Setup 48h · iOS/Android nativi",

  applicationSubCategory: "Construction Mobile App Software",

  relatedBlogSlugs: [
    "rapportino-di-cantiere-app-e-modello",
    "app-gestione-cantieri-gratis",
    "gestione-cantieri-digitale",
  ],
};

export default function AppCantiereMobile() {
  return <FunzionalitaPageTemplate config={config} />;
}
