import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  CloudUpload,
  Clock,
  Download,
  Eye,
  FileSignature,
  FileText,
  FolderOpen,
  Gavel,
  HardHat,
  Image as ImageIcon,
  Layers,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stamp,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "foto-cantiere",
  vertical: "Foto Cantiere",
  productName: "Foto Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, capocantieri e general contractor che vogliono organizzare in modo strutturato le foto del cantiere: app mobile, geolocalizzazione, timestamp, archivio cloud, condivisione cliente, prova legale di stato cantiere",
  audienceShort: "imprese edili che vogliono foto cantiere strutturate",

  seo: {
    title:
      "Foto Cantiere — App Mobile Capocantiere, Foto…",
    description:
      "App mobile per capocantiere: foto geolocalizzate con timestamp, organizzazione automatica per cantiere/giorno, condivisione cliente via portale, archivio…",
    keywords:
      "foto cantiere app, foto geolocalizzate cantiere, app capocantiere foto, archivio foto cantiere cloud, condivisione foto cliente edilizia, prova legale stato cantiere, foto datate cantiere edile",
    ogImage: "https://www.ediliziaincloud.com/og/foto-cantiere-og.jpg",
  },

  heroBadge: "Funzionalità · Foto Cantiere",
  heroH1Lead: "Le foto del cantiere",
  heroH1Highlight: "organizzate da sole",
  heroH1Tail: "non più sparpagliate su WhatsApp",
  heroSubheadline:
    "App mobile per il capocantiere: foto geolocalizzate con timestamp automatico, organizzazione automatica per cantiere e giornata, condivisione con il cliente tramite portale, archivio cloud immutabile. Prova legale di stato cantiere in caso di contestazioni, niente più foto perse su WhatsApp del titolare.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "App mobile capocantiere",
    "Geolocalizzazione e timestamp automatici",
  ],
  proofPoints: [
    "Foto organizzate per cantiere/giorno",
    "Condivisione cliente via portale",
    "Prova legale di stato cantiere",
  ],

  objectiveRow: [
    ["Obiettivo", "Foto cantiere strutturate, sempre disponibili, mai perse"],
    ["Momento chiave", "Ogni giornata di cantiere, ogni contestazione, ogni SAL"],
    ["Risultato", "Cliente più sereno, segreteria più libera, contestazioni vinte"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano Foto Cantiere per organizzare migliaia di foto e condividerle col cliente.",
  betaBody:
    "Foto Cantiere è già pronto: lo attiviamo in 48 ore configurando l'app mobile per i capocantieri, abilitiamo la condivisione automatica al portale cliente, importiamo l'archivio storico se hai foto su Drive/Dropbox, e ti accompagniamo in 3 sessioni 1-a-1 fino al primo cantiere completamente documentato.",

  speedH2:
    "Le foto sparpagliate su WhatsApp del capocantiere costano 6 ore al mese di segreteria. Lo capisci solo quando perdi una contestazione.",
  speedSubheadline:
    "Il capocantiere medio scatta 30-80 foto al giorno: foto WhatsApp al titolare, foto su Drive personale, foto sul telefono che si rompe. Quando il cliente chiede 'mi mandi la foto del 12 marzo?' o quando arriva una contestazione, ricostruire l'archivio è un incubo. Foto Cantiere risolve.",
  speedStats: [
    { value: 6, prefix: "+", suffix: " h/mese", label: "tempo segreteria recuperato sull'archivio foto" },
    { value: 100, prefix: "%", suffix: "", label: "foto geolocalizzate e datate immutabili" },
    { value: 5, suffix: " sec", label: "per trovare una foto storica nell'archivio" },
  ],

  familyH2: "Foto Cantiere collegata a tutto il flusso operativo.",
  familySubheadline:
    "Le foto cantiere non sono un silos: alimentano il portale cliente, il giornale lavori, il SAL firmato, il fascicolo cantiere. Tutto integrato, niente più foto su 5 piattaforme diverse, niente più 'dov'è quella foto?'.",
  familyItems: [
    {
      icon: Camera,
      title: "Foto Cantiere",
      text: "App mobile capocantiere, geolocalizzazione, archivio cloud, condivisione cliente.",
      to: "/funzionalita/foto-cantiere",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Foto allegate automaticamente al cantiere giusto, organizzate per giornata e milestone.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Eye,
      title: "Portale Clienti",
      text: "Cliente vede galleria foto del suo cantiere, organizzate per giorno, in tempo reale.",
      to: "/funzionalita/portale-clienti",
    },
    {
      icon: ClipboardList,
      title: "Giornale Lavori",
      text: "Foto del giorno automaticamente allegate al giornale lavori, con valore probatorio.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "Foto allegate ai sopralluoghi sicurezza, ai near-miss, alla consegna DPI.",
      to: "/funzionalita/sicurezza-cantiere",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Foto come prova allegata al SAL firmato elettronicamente dal cliente.",
      to: "/funzionalita/firma-elettronica",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Ogni foto al posto giusto. Niente più caos su 5 strumenti diversi.",
  familyBonusText:
    "Quando il capocantiere scatta una foto, finisce nel cantiere giusto, nel giorno giusto, nel portale cliente, nel giornale lavori. Senza data entry doppio, senza spostare file tra cartelle Drive e Dropbox, senza perdere foto importanti. Un sistema unico, tutto al posto giusto.",

  painKicker: "Il problema vero",
  painH2:
    "Capocantiere scatta 50 foto al giorno. Finiscono tutte su WhatsApp del titolare. Il caos.",
  painSubheadline:
    "L'impresa edile media accumula 10.000-30.000 foto cantiere all'anno tra capocantieri, titolare, segreteria. Sparpagliate tra WhatsApp, Drive, telefoni personali, hard disk. Quando serve una foto specifica, è un incubo. Quando arriva contestazione, prova documentale debole.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Foto su WhatsApp del titolare = telefono pieno e foto…",
      text: "Capocantiere manda 50 foto al giorno al titolare via WhatsApp. Telefono titolare si riempie, WhatsApp comprime le foto perdendo qualità, foto si perdono nei thread, contesto temporale sparisce. Inutilizzabili come prova.",
    },
    {
      icon: Search,
      title: "Cliente chiede 'mi mandi la foto del 12 marzo?' e…",
      text: "Cliente vuole vedere lavori del giorno X. Segreteria deve cercare nei thread WhatsApp, nelle cartelle Drive, nei telefoni dei capocantieri. 30-60 minuti per trovare le foto giuste, se ci si arriva.",
    },
    {
      icon: Gavel,
      title: "Contestazione cliente senza prova documentale",
      text: "Cliente contesta 'non avete fatto questi lavori il 12 marzo'. Tu hai 8 foto nel WhatsApp del capocantiere, senza geolocalizzazione, senza timestamp certificato, comunque rinominate. Valore probatorio basso, causa incerta.",
    },
    {
      icon: FolderOpen,
      title: "Archivio fotografico storico inutilizzabile",
      text: "20.000 foto accumulate in 5 anni tra Drive, hard disk, telefoni. Per trovare le foto di un cantiere specifico ci vogliono ore. Per fare un fascicolo post-vendita o un caso studio commerciale, ore di lavoro segreteria.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stesso capocantiere. Stessi scatti. Cambia il sistema, sparisce il caos.",
  baSubheadline:
    "Foto Cantiere non chiede al capocantiere di scattare di più o di meno: chiede solo di scattare dall'app invece che da WhatsApp. Da quel momento le foto si organizzano da sole, hanno timestamp e geolocalizzazione certificati, sono disponibili a cliente e segreteria in tempo reale.",
  baAreas: [
    {
      title: "Gestione foto giornaliere",
      before:
        "Capocantiere manda foto su WhatsApp del titolare. Titolare con telefono pieno, foto compresse, niente organizzazione. Niente data certificata, niente posizione, niente contesto.",
      after:
        "Capocantiere scatta dall'app in 5 secondi. Foto in alta risoluzione, timestamp e geolocalizzazione automatici, organizzate per cantiere e giorno. Telefono titolare libero, segreteria libera.",
    },
    {
      title: "Condivisione foto al cliente",
      before:
        "Cliente chiede foto, segreteria cerca su WhatsApp e Drive, manda email con allegati pesanti, perde 30 minuti per richiesta. Cliente comunque insoddisfatto perché vede solo le foto che gli mandiamo.",
      after:
        "Cliente accede al portale, vede galleria foto cantiere in tempo reale, organizzata per giorno, scaricabile. Self-service totale, segreteria zero richieste, cliente felice.",
    },
    {
      title: "Contestazione cliente",
      before:
        "Cliente contesta 'non avete lavorato il 12 marzo'. Tu cerchi nel WhatsApp, trovi 4 foto compresse senza timestamp ufficiale, senza geolocalizzazione. Valore probatorio basso, contestazione difficile.",
      after:
        "Apri il giorno 12 marzo: 23 foto in alta risoluzione, geolocalizzate al cantiere, timestamp certificato, hash SHA-256. Valore probatorio massimo, contestazione chiusa in 2 minuti.",
    },
    {
      title: "Archivio storico e marketing",
      before:
        "20.000 foto sparpagliate. Per fare un caso studio commerciale o un post Instagram, ore di lavoro a cercare e selezionare. Materiale marketing scarso nonostante mille foto disponibili.",
      after:
        "Archivio cloud cercabile per cantiere, cliente, data, milestone. Selezioni 12 foto best-of in 2 minuti, esporti per Instagram/sito/preventivo. Marketing visivo finalmente fattibile.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: app mobile, organizzazione automatica, condivisione e archivio.",
  mechanismSubheadline:
    "Foto Cantiere è progettato per il capocantiere che ha 5 secondi tra una posa e l'altra. App veloce, scatti e via, l'organizzazione la fa il sistema. Funziona offline, sincronizza appena torna segnale.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "App mobile capocantiere veloce e offline",
      text: "Capocantiere apre l'app, scatta foto in 5 secondi. Funziona offline (cantieri senza segnale OK). Foto in alta risoluzione, geolocalizzazione GPS automatica, timestamp certificato, opzionale tag della fase di lavoro.",
    },
    {
      icon: Layers,
      title: "Organizzazione automatica per cantiere e giorno",
      text: "Sistema riconosce il cantiere dalla geolocalizzazione (o lo chiede 1 volta), organizza la foto nel cantiere giusto, nel giorno giusto, nella milestone giusta. Niente lavoro manuale, niente foto in cartella sbagliata.",
    },
    {
      icon: CloudUpload,
      title: "Condivisione cliente e archivio cloud immutabile",
      text: "Foto disponibili in tempo reale al cliente sul portale, archiviate in cloud immutabile con hash SHA-256. In caso di contestazione, valore probatorio massimo. Conservazione decennale inclusa.",
    },
  ],
  mechanismCta: "Prova l'app capocantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Cliente più sereno + segreteria libera + contestazioni vinte = ROI immediato.",
  commercialBody:
    "Foto Cantiere non è solo organizzazione: è strumento commerciale, operativo e legale. Le imprese che lo attivano vedono cambiare 4 dimensioni: trasparenza cliente, tempo segreteria, valore probatorio, marketing visivo dei propri lavori.",
  commercialLevers: [
    {
      icon: Eye,
      title: "Trasparenza totale al cliente",
      text: "Cliente vede in tempo reale le foto del suo cantiere sul portale. Si tranquillizza da solo, smette di chiamare per chiedere update, lascia recensioni positive. Cambia totalmente la percezione del servizio.",
    },
    {
      icon: Timer,
      title: "Segreteria libera dal recupero foto",
      text: "Niente più richieste 'mi mandi le foto del giorno X'. Cliente accede al portale, scarica da solo. Segreteria recupera 6+ ore al mese per cantiere, recuperi enormi su volumi alti.",
    },
    {
      icon: Gavel,
      title: "Valore probatorio massimo in contestazione",
      text: "Foto con geolocalizzazione, timestamp certificato, hash SHA-256, archiviazione immutabile. In contestazione cliente o causa civile, prova documentale di livello forense. Vinci più cause.",
    },
    {
      icon: Sparkles,
      title: "Marketing visivo finalmente fattibile",
      text: "Archivio cercabile per cantiere/data/tipo lavoro. Selezioni 12 foto best-of in 2 minuti per caso studio, post Instagram, preventivo brandizzato. Marketing visivo regolare invece che sporadico.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Il caos delle foto sparite finisce. Inizia un archivio strutturato che lavora per te.",
  resultsBody:
    "Le imprese che attivano Foto Cantiere vedono cambiare 4 metriche: 6+ ore/mese di segreteria recuperate, contestazioni cliente vinte 3x più spesso, recensioni Google +35% (per la trasparenza percepita), marketing visivo regolare con 4-6 casi studio/mese invece di 0.",
  integrationPillars: [
    {
      icon: Smartphone,
      title: "App mobile veloce e offline",
      text: "iOS e Android. Scatto in 5 secondi, geolocalizzazione GPS, timestamp certificato. Funziona offline, sincronizza al ritorno del segnale. Pensata per il cantiere reale.",
    },
    {
      icon: Layers,
      title: "Organizzazione automatica per cantiere/giorno",
      text: "Sistema riconosce il cantiere dalla geolocalizzazione, organizza per giorno e milestone. Niente lavoro manuale, niente foto in cartella sbagliata. Cercabile in 5 secondi.",
    },
    {
      icon: Lock,
      title: "Archivio cloud immutabile decennale",
      text: "Hash SHA-256 di ogni foto, archiviazione cloud certificata, conservazione decennale. Valore probatorio forense in caso di contestazione o causa civile.",
    },
    {
      icon: Eye,
      title: "Condivisione cliente integrata",
      text: "Foto disponibili in tempo reale al cliente sul portale, organizzate per giorno. Cliente self-service, segreteria zero richieste. Trasparenza che genera recensioni positive.",
    },
  ],
  resultStats: [
    { value: 6, prefix: "+", suffix: " h/mese", label: "tempo segreteria recuperato per cantiere" },
    { value: 100, prefix: "%", suffix: "", label: "foto geolocalizzate e datate immutabili" },
    { value: 35, prefix: "+", suffix: "%", label: "recensioni Google da trasparenza percepita" },
  ],
  resultsCta: "Apri il modulo Foto Cantiere",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto recuperi se la segreteria smette di rincorrere foto su WhatsApp?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e ore segreteria settimanali dedicate alla gestione/archivio foto. La stima parte da un costo orario di 30 €.",
  roi: {
    input1Label: "Cantieri attivi",
    input1Default: 8,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Ore segreteria/sett su archivio foto",
    input2Default: 6,
    input2Min: 1,
    input2Max: 20,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * b * 30),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 52 * b)} h` },
      { label: "Foto stimate/anno (40/giorno)", value: `${(a * 40 * 220).toLocaleString("it-IT")}` },
      { label: "Telefonate cliente evitate", value: "60%" },
    ],
    closingPitch:
      "Stima conservativa: ore segreteria × 52 settimane × 30 €/h. Aggiungi le contestazioni vinte (valore probatorio forense) e le recensioni positive da trasparenza: il ROI è triplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Foto al posto giusto. Cliente sereno. Segreteria libera. Contestazioni vinte.",
  salesBody:
    "Foto Cantiere cambia 4 dimensioni operative: come gestisci le foto giornaliere, come le condividi col cliente, come ti difendi in contestazione, come usi il materiale visivo per marketing.",
  salesImpact: [
    {
      title: "Foto sempre al posto giusto",
      text: "Capocantiere scatta dall'app, sistema organizza per cantiere/giorno automaticamente. Niente più foto perse, niente più WhatsApp pieni, niente più ricerca disperata di 'quella foto'.",
    },
    {
      title: "Cliente trasparente in tempo reale",
      text: "Cliente vede galleria del suo cantiere sul portale, organizzata per giorno. Vede progressi, si tranquillizza, smette di chiamare. Recensioni Google migliorano del 35% in 6 mesi.",
    },
    {
      title: "Contestazione vinta in 2 minuti",
      text: "Cliente contesta giornata di lavoro: apri il giorno X, mostri 23 foto geolocalizzate con timestamp certificato. Discussione chiusa subito, fattura non contestata.",
    },
    {
      title: "Marketing visivo regolare",
      text: "Archivio cercabile per cantiere/tipo lavoro. Selezioni best-of per Instagram, sito, preventivi brandizzati in 2 minuti. Marketing visivo regolare invece che sporadico, ROI commerciale alto.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non un'app generica per fare foto. Un sistema completo per gestire migliaia di foto cantiere.",
  featureRows: [
    {
      label: "App mobile iOS/Android per capocantiere",
      value:
        "Scatto in 5 secondi, geolocalizzazione GPS automatica, timestamp certificato, alta risoluzione. Funziona offline (cantieri senza segnale OK), sincronizza al ritorno del segnale.",
    },
    {
      label: "Organizzazione automatica per cantiere/giorno",
      value:
        "Sistema riconosce il cantiere dalla geolocalizzazione (o lo chiede 1 volta), organizza la foto nel cantiere giusto, nel giorno giusto, opzionalmente nella milestone giusta.",
    },
    {
      label: "Tag di fase lavoro e nota vocale",
      value:
        "Capocantiere può aggiungere tag fase (demolizione, getti, finiture, ecc.) e nota vocale di 30 secondi. Foto contestualizzate, archivio ricco di metadati cercabili.",
    },
    {
      label: "Condivisione cliente via portale",
      value:
        "Cliente vede galleria foto del suo cantiere in tempo reale sul portale, organizzata per giorno. Self-service, scaricabile in alta risoluzione. Niente più richieste alla segreteria.",
    },
    {
      label: "Archivio cloud immutabile decennale",
      value:
        "Hash SHA-256 di ogni foto, archiviazione cloud certificata, conservazione decennale inclusa. Valore probatorio forense in caso di contestazione o causa civile.",
    },
    {
      label: "Ricerca avanzata multi-criterio",
      value:
        "Cerca per cantiere, cliente, data, tag fase, geolocalizzazione, milestone. Trova qualunque foto in 5 secondi su archivi da decine di migliaia di scatti.",
    },
    {
      label: "Esportazione e condivisione marketing",
      value:
        "Selezioni foto best-of per Instagram, sito web, preventivi brandizzati, casi studio. Esportazione in vari formati e risoluzioni. Marketing visivo finalmente fattibile.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui Foto Cantiere cambia la giornata della segreteria e del cliente.",
  scenarios: [
    {
      title: "Cliente curioso domenica sera",
      text: "Domenica alle 22:00 cliente vuole vedere come va il cantiere. Apre il portale dal telefono, vede 12 foto della settimana organizzate per giorno: lunedì demolizione, mercoledì getti, venerdì pavimentazione iniziata. Soddisfatto, niente messaggio al titolare, niente ansia.",
    },
    {
      title: "Contestazione cliente su giornata",
      text: "Cliente contesta 'non avete lavorato il 12 marzo, il cantiere era fermo'. Apri il 12 marzo nell'archivio: 28 foto in alta risoluzione, geolocalizzate al cantiere, timestamp certificato dalle 7:30 alle 17:00. Discussione chiusa in 90 secondi, fattura non contestata.",
    },
    {
      title: "Caso studio commerciale per gara",
      text: "Devi presentare gara per un appalto importante. Hai bisogno di un caso studio visivo di un cantiere simile chiuso 6 mesi fa. Cerchi nel sistema 'ristrutturazione capannone industriale 2024', selezioni 14 foto best-of in 3 minuti, esporti in PDF brandizzato. Caso studio pronto in 10 minuti totali.",
    },
  ],

  testimonialQuote:
    "Avevamo migliaia di foto cantiere sparpagliate tra WhatsApp del titolare, Drive personale, telefoni dei capocantieri. Quando il cliente chiedeva una foto era un'ora di lavoro segreteria. Da quando usiamo Foto Cantiere, foto organizzate da sole, cliente accede al portale e si serve da solo. Recuperate 8 ore a settimana di segreteria su tre cantieri attivi.",
  testimonialAuthor: "Simone D.",
  testimonialRole: "Costruzioni Emilia Srl, Bologna",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di adottare Foto Cantiere.",
  faqs: [
    {
      q: "L'app funziona anche senza segnale in cantiere?",
      a: "Sì. L'app è progettata per la realtà del cantiere: funziona offline, le foto vengono salvate in locale con timestamp e geolocalizzazione, e sincronizzano automaticamente appena torna segnale. Niente perdita di dati, niente blocchi di lavoro.",
    },
    {
      q: "Le foto hanno valore legale in contestazione?",
      a: "Sì. Ogni foto è certificata con hash SHA-256, geolocalizzazione GPS, timestamp affidabile, archiviazione cloud immutabile. In caso di contestazione cliente o causa civile, il valore probatorio è di livello forense, equivalente a una perizia tecnica.",
    },
    {
      q: "Il cliente accede a tutte le foto del suo cantiere?",
      a: "Sì, in tempo reale. Cliente accede al portale, vede galleria foto del suo cantiere organizzata per giorno, scaricabile in alta risoluzione. Vede solo le foto del SUO cantiere, niente accessi incrociati. Permessi configurabili (puoi nascondere foto specifiche se necessario).",
    },
    {
      q: "Posso importare le foto storiche da Drive/Dropbox/WhatsApp?",
      a: "Sì. Durante l'onboarding importiamo le foto esistenti da Drive, Dropbox, WhatsApp Business, hard disk. Sistema le organizza automaticamente per cantiere e data (basandosi su metadati EXIF). Migliaia di foto storiche tornano cercabili in 1 ora.",
    },
    {
      q: "Quante foto posso archiviare?",
      a: "Illimitate. Nei piani Professional e Business non ci sono limiti al numero di foto archiviate, conservazione decennale inclusa. Le imprese più strutturate arrivano a 100.000+ foto archiviate, sempre cercabili in 5 secondi.",
    },
    {
      q: "Il modulo è incluso nei piani Edilizia in Cloud?",
      a: "Sì. Foto Cantiere è incluso nei piani Professional e Business. Numero cantieri illimitato, foto illimitate, archivio decennale incluso, app mobile capocantiere inclusa. Niente costi extra per foto archiviata o scaricata.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2:
    "Foto Cantiere alimenta Portale Clienti, Giornale Lavori, Sicurezza, Marketing.",
  internalLinksBody:
    "Le foto cantiere alimentano in tempo reale Portale Clienti, Giornale Lavori, Sicurezza Cantiere, marketing visivo. Ecco gli altri moduli che le rendono potenti.",
  internalLinks: [
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Cliente vede galleria foto del suo cantiere in tempo reale." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Foto allegate automaticamente al cantiere e alla milestone." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Foto del giorno allegate al giornale lavori con valore probatorio." },
    { to: "/funzionalita/sicurezza-cantiere", title: "Sicurezza Cantiere", text: "Foto allegate a sopralluoghi e near-miss." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Foto come prova allegata al SAL firmato dal cliente." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Notifica WhatsApp al cliente con foto del giorno." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Foto di milestone triggerano notifiche cliente automatiche." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "Statistiche foto cantieri nel dashboard executive." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di cercare foto su WhatsApp e Drive. Inizia ad avere un archivio cantiere strutturato.",
  finalCtaBody:
    "31 giorni gratuiti per portare Foto Cantiere dentro la tua impresa edile. App mobile capocantiere, organizzazione automatica, archivio cloud immutabile, condivisione cliente, onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · App mobile · Foto illimitate",

  stickyCtaLabel: "Prova gratis Foto Cantiere",
  stickyCtaMicrocopy: "Setup 48h · App offline · Cloud immutabile",

  applicationSubCategory: "Construction Photo Documentation Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function FotoCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
