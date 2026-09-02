import {
  AlertTriangle,
  BookOpen,
  Building2,
  CloudUpload,
  FileSignature,
  FileText,
  Gavel,
  HardHat,
  ListChecks,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stamp,
  Timer,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "giornale-lavori",
  definizione:
    "Il Giornale Lavori di Edilizia in Cloud è il giornale dei lavori digitale conforme all'art. 15 del D.M. 49/2018 e al Codice Appalti: registrazione giornaliera di maestranze, mezzi, forniture, condizioni meteo e fatti rilevanti, firmato dal cantiere e archiviato a norma.",
  vertical: "Giornale Lavori",
  productName: "Giornale Lavori Digitale Edilizia in Cloud",
  audience:
    "Imprese edili e general contractor che lavorano su appalti pubblici e privati e devono tenere giornale lavori conforme art. 15 D.M. 49/2018 e D.Lgs 50/2016, con firma DL e RUP",
  audienceShort: "imprese edili che lavorano su appalti normati",

  seo: {
    title:
      "Giornale Lavori Digitale",
    description:
      "Giornale lavori digitale conforme art. 15 D.M. 49/2018 e D.Lgs 50/2016: registrazione giornaliera maestranze, mezzi, forniture, eventi.",
    keywords:
      "giornale lavori digitale, art 15 dm 49 2018, dlgs 50 2016 giornale lavori, libro giornale cantiere, giornale cantiere appalto pubblico, registrazione giornaliera cantiere, firma dl rup giornale, pdf/a giornale lavori",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Giornale Lavori",
  heroH1Lead: "Il giornale lavori digitale",
  heroH1Highlight: "conforme alla norma",
  heroH1Tail: "che firmi dal cantiere",
  heroSubheadline:
    "Giornale lavori digitale conforme all'art. 15 D.M. 49/2018 e al D.Lgs 50/2016 (Codice Appalti): registrazione giornaliera di maestranze, mezzi, forniture, eventi atmosferici e fatti rilevanti, firma del Direttore dei Lavori e del RUP, esportazione in PDF/A immutabile. Pronto per ispezioni, niente più libri cartacei.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Conforme art. 15 D.M. 49/2018",
    "Firma DL e RUP integrata",
  ],
  proofPoints: [
    "Registrazione mobile da cantiere",
    "Esportazione PDF/A immutabile",
    "Audit trail completo",
  ],

  objectiveRow: [
    ["Obiettivo", "Conformità normativa senza il caos del libro cartaceo"],
    ["Momento chiave", "Ogni giorno di cantiere, ogni ispezione, ogni contestazione"],
    ["Risultato", "Difesa documentale solida e tempo segreteria recuperato"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano il Giornale Lavori digitale per essere pronte alle ispezioni.",
  betaBody:
    "Il Giornale Lavori digitale è già pronto: lo attiviamo in 48 ore configurando i template conformi all'art. 15 D.M. 49/2018, abilitiamo l'app mobile per il capocantiere, configuriamo le firme di Direttore Lavori e RUP, e ti accompagniamo in 3 sessioni 1-a-1 fino al primo giornale lavori chiuso e firmato.",

  speedH2:
    "Il giornale lavori cartaceo è il primo punto debole in caso di ispezione. Il digitale risolve.",
  speedSubheadline:
    "Su un appalto pubblico, il giornale lavori non firmato dal DL o compilato in modo incompleto è motivo di sospensione dei pagamenti. Su appalti privati, è la prima prova in caso di contestazione. Il libro cartaceo si perde, si bagna, si compila in fretta. Il digitale no.",
  speedStats: [
    { value: 100, prefix: "%", suffix: "", label: "conformità art. 15 D.M. 49/2018" },
    { value: 40, prefix: "-", suffix: "%", label: "tempo segreteria su giornali lavori" },
    { value: 30, suffix: " sec", label: "per registrare la giornata da mobile" },
  ],

  familyH2: "Giornale Lavori collegato a tutto il flusso operativo.",
  familySubheadline:
    "Il giornale lavori non è un documento isolato: è alimentato da Gestione Cantieri (maestranze e mezzi), Foto Cantiere (allegati), Sicurezza Cantiere (eventi rilevanti). Tutto si compila quasi da solo, niente data entry doppio.",
  familyItems: [
    {
      icon: BookOpen,
      title: "Giornale Lavori",
      text: "Registrazione giornaliera conforme, firma DL/RUP, esportazione PDF/A.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Maestranze, mezzi e forniture compilati automaticamente nel giornale lavori.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "Eventi rilevanti (near-miss, sopralluoghi sicurezza) integrati nel giornale.",
      to: "/funzionalita/sicurezza-cantiere",
    },
    {
      icon: Smartphone,
      title: "Foto Cantiere",
      text: "Foto geolocalizzate del giorno allegate automaticamente al giornale lavori.",
      to: "/funzionalita/foto-cantiere",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Firma DL e RUP con valore legale eIDAS, archivio cloud immutabile.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: Building2,
      title: "Gestione Subappalti",
      text: "Maestranze subappaltatori tracciate nel giornale lavori per ogni giornata.",
      to: "/funzionalita/gestione-subappalti",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Un solo flusso operativo. Giornale lavori che si compila quasi da solo.",
  familyBonusText:
    "Quando il capocantiere registra le ore della squadra, il giornale lavori si aggiorna. Quando scatta una foto, viene allegata. Quando segna un evento sicurezza, finisce nel giornale. Niente più sere passate a compilare il libro a mano: il sistema lo prepara, tu chiudi e firmi.",

  painKicker: "Il problema vero",
  painH2:
    "Il giornale lavori cartaceo è la prima cosa che fa cadere l'impresa in fase di ispezione.",
  painSubheadline:
    "Sui cantieri pubblici, l'art. 15 del D.M. 49/2018 prescrive la tenuta giornaliera del giornale lavori a cura del Direttore dei Lavori. In pratica, sul libro cartaceo si scrive 'a memoria' a fine settimana, mancano firme RUP, mancano allegati. Per il committente è già motivo di sospensione pagamenti.",
  painPoints: [
    {
      icon: FileText,
      title: "Libro cartaceo compilato 'a memoria' a fine settimana",
      text: "Capocantiere torna venerdì sera, prova a ricordare cosa è successo da lunedì: maestranze, mezzi, forniture, eventi. Errori, omissioni, scrittura illeggibile. In caso di ispezione INL o RUP, il documento è inattendibile.",
    },
    {
      icon: AlertTriangle,
      title: "Firme DL e RUP che mancano sempre",
      text: "L'art. 15 prescrive la firma settimanale del DL e periodica del RUP. In pratica, le firme mancano per settimane perché il DL passa una volta ogni 15 giorni e il RUP una volta al mese. Pagamenti sospesi, contestazioni in salita.",
    },
    {
      icon: Search,
      title: "Documento sparito o danneggiato",
      text: "Libro cartaceo lasciato in cantiere, pioggia improvvisa, libro distrutto. Oppure smarrito durante un trasloco di ufficio. Per appalti pubblici è una catastrofe: ricostruire un anno di registrazioni è impossibile.",
    },
    {
      icon: Gavel,
      title: "In caso di contestazione, niente prova",
      text: "Cliente contesta 'non avete lavorato il 12 marzo'. Tu hai solo il libro a memoria, nessuna foto, nessuna firma cliente sul giorno. La discussione si apre senza prova documentale forte. Causa lunga, esito incerto.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stesso obbligo normativo. Stesso lavoro. Cambia il sistema, sparisce il rischio.",
  baSubheadline:
    "Il Giornale Lavori digitale non aggiunge burocrazia: la riduce, perché si compila quasi da solo dai dati che produci ogni giorno (squadre, mezzi, forniture, foto). E rende ogni giornata immutabile e firmabile dal DL al volo.",
  baAreas: [
    {
      title: "Compilazione giornaliera",
      before:
        "Capocantiere compila a fine settimana sul libro cartaceo, a memoria. Errori, omissioni, scrittura illeggibile, niente foto allegate, niente eventi atmosferici registrati.",
      after:
        "App mobile in cantiere: capocantiere registra in 30 secondi maestranze, mezzi, forniture, eventi atmosferici, allegati foto. Tutto datato, tutto immutabile, tutto già pronto per la firma.",
    },
    {
      title: "Firma Direttore Lavori e RUP",
      before:
        "DL passa ogni 15 giorni, firma in fretta pagine non lette. RUP firma una volta al mese. Spesso le firme mancano, pagamenti sospesi, contestazioni del committente.",
      after:
        "DL riceve notifica push ogni venerdì, firma da remoto con firma elettronica eIDAS in 30 secondi. RUP riceve riepilogo mensile, firma con un click. Niente firme mai in ritardo.",
    },
    {
      title: "Allegati e foto",
      before:
        "Foto cantiere su WhatsApp del capocantiere, mai allegate al libro lavori. In caso di contestazione, recuperare le foto giuste è un incubo, e il loro valore probatorio è basso senza geolocalizzazione/timestamp.",
      after:
        "Foto cantiere con timestamp e geolocalizzazione automaticamente allegate al giornale lavori del giorno. Valore probatorio massimo, recupero in 5 secondi per ogni giornata storica.",
    },
    {
      title: "Conservazione e ispezione",
      before:
        "Libro cartaceo in ufficio, soggetto a smarrimento, danneggiamento, manomissione. Conservazione decennale problematica. In caso di ispezione, trovarlo in 5 minuti è quasi impossibile.",
      after:
        "Archivio cloud immutabile, conservazione decennale digitale, hash SHA-256 di ogni giornata firmata. In caso di ispezione, esporti PDF/A in 30 secondi. Documento legalmente valido.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: registrazione mobile, firma elettronica, esportazione PDF/A.",
  mechanismSubheadline:
    "Il Giornale Lavori digitale è progettato per la realtà del cantiere: app mobile per il capocantiere, firma del DL via notifica push, esportazione PDF/A immutabile per ispezioni e archiviazione legale.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "Registrazione giornaliera da mobile",
      text: "Capocantiere apre l'app, registra in 30 secondi: maestranze presenti, mezzi operativi, forniture ricevute, eventi atmosferici, fatti rilevanti. Foto allegate automaticamente. Tutto datato e geolocalizzato.",
    },
    {
      icon: FileSignature,
      title: "Firma settimanale del DL e periodica del RUP",
      text: "DL riceve notifica push ogni venerdì con il riepilogo settimana, firma elettronicamente eIDAS in 30 secondi. RUP riceve riepilogo mensile, firma con un click. Tutto archiviato con timestamp.",
    },
    {
      icon: Stamp,
      title: "Esportazione PDF/A immutabile per ispezioni",
      text: "In caso di ispezione, di fine appalto, di contestazione: esporti l'intero giornale lavori in PDF/A (formato di archiviazione legale a lungo termine), con firme digitali e hash SHA-256. Documento immutabile valido per anni.",
    },
  ],
  mechanismCta: "Vedi un esempio di giornale lavori digitale",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Conformità normativa garantita + tempo segreteria recuperato + difesa legale solida.",
  commercialBody:
    "Il Giornale Lavori digitale non è solo conformità: è anche un acceleratore operativo e una protezione legale. Le imprese che lo attivano risparmiano 2-3 ore/settimana di segreteria e hanno difesa documentale forte in ogni contestazione.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "Conformità art. 15 D.M. 49/2018 garantita",
      text: "Template conforme alla norma, firme DL/RUP con valore legale eIDAS, archivio PDF/A immutabile. In ispezione INL o RUP, hai tutto pronto in 30 secondi. Niente sospensioni pagamenti per giornale incompleto.",
    },
    {
      icon: Timer,
      title: "Tempo segreteria recuperato",
      text: "Il giornale lavori si compila quasi da solo dai dati operativi (squadre, mezzi, fotografie, forniture). Risparmi 2-3 ore/settimana di segreteria per cantiere. Su 5 cantieri attivi sono 12 ore/settimana.",
    },
    {
      icon: Gavel,
      title: "Difesa legale solida",
      text: "Foto con timestamp e geolocalizzazione, registrazioni datate immutabili, firme elettroniche eIDAS. In contestazione cliente o causa civile, hai prova documentale forte. Vinci più cause.",
    },
    {
      icon: Sparkles,
      title: "Posizionamento da impresa strutturata",
      text: "Su gare pubbliche e private B2B, dimostrare di gestire il giornale lavori in modo digitale conforme è un differenziale competitivo. Posizionamento da impresa moderna e organizzata.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Il libro cartaceo sparisce. Il rischio normativo si azzera. Il tempo segreteria torna libero.",
  resultsBody:
    "Le imprese che attivano il Giornale Lavori digitale vedono cambiare 3 metriche: zero contestazioni del DL/RUP per giornale incompleto, 40% di tempo segreteria recuperato per cantiere, archivio storico cercabile in 5 secondi. Tre cambi che valgono migliaia di euro l'anno.",
  integrationPillars: [
    {
      icon: ListChecks,
      title: "Template conforme art. 15 D.M. 49/2018",
      text: "Tutti i campi richiesti dalla norma: maestranze, mezzi, forniture, eventi atmosferici, eventi rilevanti, ordini di servizio. Pre-compilato dai dati operativi.",
    },
    {
      icon: Smartphone,
      title: "App mobile per capocantiere",
      text: "Registrazione in 30 secondi da telefono. Funziona offline (sincronizza appena torna segnale). Foto, audio, geolocalizzazione automatica.",
    },
    {
      icon: FileSignature,
      title: "Firme elettroniche DL e RUP eIDAS",
      text: "Firma elettronica avanzata conforme eIDAS, marca temporale, archivio cloud immutabile. Valore legale equivalente alla firma autografa.",
    },
    {
      icon: CloudUpload,
      title: "Archivio PDF/A e conservazione decennale",
      text: "Esportazione in PDF/A (standard ISO 19005 per archiviazione legale a lungo termine). Hash SHA-256, conservazione cloud certificata, accesso ispezioni in 30 secondi.",
    },
  ],
  resultStats: [
    { value: 100, prefix: "%", suffix: "", label: "conformità art. 15 D.M. 49/2018" },
    { value: 40, prefix: "-", suffix: "%", label: "tempo segreteria su giornali lavori" },
    { value: 5, suffix: " sec", label: "ricerca giornata storica nell'archivio" },
  ],
  resultsCta: "Apri il modulo Giornale Lavori",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto recuperi se il giornale lavori si compila quasi da solo?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e ore segreteria settimanali dedicate alla gestione giornali lavori. La stima parte dal 40% di tempo recuperato e da un costo orario di 30 €.",
  roi: {
    input1Label: "Cantieri attivi",
    input1Default: 8,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Ore segreteria/sett su giornali lavori",
    input2Default: 12,
    input2Min: 5,
    input2Max: 60,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * b * 0.4 * 30),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 52 * b * 0.4)} h` },
      { label: "Ore recuperate/settimana", value: `${Math.round(a * b * 0.4)} h` },
      { label: "Cantieri sotto controllo", value: `${a}` },
    ],
    closingPitch:
      "Stima conservativa: 40% di tempo segreteria recuperato per cantiere × 52 settimane × 30 €/h. Aggiungi il valore della conformità garantita e della difesa legale: il ROI è triplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Niente più libro cartaceo dimenticato. Niente più firma DL in ritardo. Niente più ispezioni angosciose.",
  salesBody:
    "Il Giornale Lavori digitale cambia 4 dimensioni operative: come compili il giornale, come gestisci le firme DL/RUP, come archivi e ricerchi le giornate storiche, come ti prepari alle ispezioni e contestazioni.",
  salesImpact: [
    {
      title: "Compilazione che non blocca più la giornata",
      text: "Capocantiere registra la giornata in 30 secondi dal cantiere, non a fine settimana a memoria. Segreteria smette di rincorrere il giornale lavori, recupera 2-3 ore/cantiere/settimana.",
    },
    {
      title: "Firme DL/RUP sempre puntuali",
      text: "DL riceve notifica push, firma da remoto in 30 secondi. Niente più firme in ritardo, niente più pagamenti sospesi per giornale lavori incompleto.",
    },
    {
      title: "Ispezione INL/RUP gestita in 30 secondi",
      text: "Esporti il giornale lavori in PDF/A immutabile, lo mostri all'ispettore. Tutto conforme, tutto firmato, tutto datato. L'ispezione si chiude bene, niente sanzioni.",
    },
    {
      title: "Difesa legale solida in contestazione",
      text: "Cliente contesta 'non avete lavorato'. Apri il giornale lavori del giorno: 8 maestranze, 2 mezzi, 12 foto geolocalizzate, firma DL. Discussione chiusa in 5 minuti.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non un PDF generico. Un giornale lavori conforme, mobile, firmabile, immutabile.",
  featureRows: [
    {
      label: "Template conforme art. 15 D.M. 49/2018",
      value:
        "Tutti i campi prescritti dalla norma: maestranze, mezzi, forniture, eventi atmosferici, ordini di servizio, fatti rilevanti. Pre-compilato dai dati operativi.",
    },
    {
      label: "App mobile per capocantiere",
      value:
        "Registrazione in 30 secondi da telefono, funziona offline, sincronizza appena torna segnale. Foto, audio, geolocalizzazione automatica per ogni giornata.",
    },
    {
      label: "Firma elettronica DL e RUP eIDAS",
      value:
        "Firma elettronica avanzata conforme eIDAS, marca temporale, archivio cloud immutabile. Notifica push automatica al DL ogni venerdì, al RUP ogni mese.",
    },
    {
      label: "Allegati foto e documenti automatici",
      value:
        "Foto cantiere geolocalizzate del giorno automaticamente allegate al giornale. Bolle fornitori, ordini di servizio, segnalazioni: tutto archiviato con la giornata.",
    },
    {
      label: "Esportazione PDF/A per archiviazione legale",
      value:
        "Esportazione in PDF/A (ISO 19005), formato standard per archiviazione legale a lungo termine. Hash SHA-256 di ogni giornata, conservazione decennale cloud certificata.",
    },
    {
      label: "Ricerca e archivio storico",
      value:
        "Cerca per data, cantiere, maestranza, evento. Trova qualunque giornata in 5 secondi. Esportazione di periodi (mese, trimestre, intero appalto) in 30 secondi.",
    },
    {
      label: "Audit log e tracciabilità",
      value:
        "Ogni modifica è loggata: chi, quando, cosa. Tracciabilità completa per ispezioni o contestazioni. Niente possibilità di alterazione retroattiva.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui il Giornale Lavori digitale fa la differenza.",
  scenarios: [
    {
      title: "Ispezione INL improvvisa in cantiere",
      text: "Mercoledì mattina arriva ispezione INL sul cantiere principale. Chiede giornale lavori ultimi 30 giorni. Apri il dashboard, esporti PDF/A in 30 secondi: 30 giornate complete, firmate dal DL, foto geolocalizzate, eventi sicurezza. Ispezione si chiude bene, zero sanzioni.",
    },
    {
      title: "Contestazione cliente su giornata di lavoro",
      text: "Cliente privato contesta 'non avete lavorato il 12 marzo, il cantiere era fermo'. Apri il giornale lavori del 12 marzo: 8 maestranze presenti dalle 7:30 alle 17:00, 2 mezzi operativi, 14 foto geolocalizzate dell'avanzamento. Discussione chiusa in 3 minuti, fattura non contestata.",
    },
    {
      title: "Pagamento appalto pubblico sbloccato",
      text: "RUP appalto pubblico sospende pagamento del SAL n.4 perché 'manca la firma RUP sul giornale lavori'. Apri il modulo, mandi notifica push al RUP, RUP firma da remoto in 30 secondi. Pagamento sbloccato il giorno stesso, niente lettere formali, niente DL infuriato.",
    },
  ],

  testimonialQuote:
    "Sui nostri appalti pubblici il giornale lavori cartaceo era sempre un incubo: firme RUP che mancavano, capocantieri che lo riempivano a memoria il venerdì sera. Da quando lo gestiamo digitale, conformità totale e zero pagamenti sospesi. L'ultima ispezione si è chiusa in 10 minuti.",
  testimonialAuthor: "Luca F.",
  testimonialRole: "Edilcostruzioni Lazio Srl, Roma",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di adottare il Giornale Lavori digitale.",
  faqs: [
    {
      q: "Il giornale lavori digitale è legalmente equivalente al cartaceo?",
      a: "Sì. Il D.Lgs 50/2016 e il D.M. 49/2018 ammettono la tenuta digitale del giornale lavori, purché firmato con firma elettronica avanzata o qualificata (eIDAS) e archiviato in formato PDF/A. Edilizia in Cloud rispetta tutti questi requisiti.",
    },
    {
      q: "Funziona anche per cantieri privati o solo pubblici?",
      a: "Funziona per entrambi. Sui cantieri pubblici è obbligatorio per art. 15 D.M. 49/2018. Sui cantieri privati è facoltativo ma utilissimo come prova documentale in caso di contestazione cliente o causa civile. Stesso strumento, doppio uso.",
    },
    {
      q: "Posso allegare foto e documenti?",
      a: "Sì. Le foto cantiere geolocalizzate del giorno vengono automaticamente allegate al giornale lavori. Puoi inoltre allegare bolle fornitori, ordini di servizio, segnalazioni del DL/RUP, certificazioni materiali. Tutto archiviato in PDF/A.",
    },
    {
      q: "Come gestisce le firme di Direttore Lavori e RUP?",
      a: "Il sistema invia notifica push al DL ogni venerdì con riepilogo settimana, firma elettronica eIDAS in 30 secondi. RUP riceve riepilogo mensile, firma con un click. Tutto archiviato con timestamp e marca temporale, valore legale equivalente alla firma autografa.",
    },
    {
      q: "Cosa succede se non c'è segnale in cantiere?",
      a: "L'app mobile funziona offline. Capocantiere registra la giornata, foto, eventi: tutto resta in locale e sincronizza automaticamente appena torna segnale. Niente perdita di dati, niente blocco del lavoro.",
    },
    {
      q: "Il modulo è incluso nei piani Edilizia in Cloud?",
      a: "Il Giornale Lavori digitale è incluso nei piani Professional e Business. Numero cantieri illimitato, archivio decennale incluso, firme eIDAS incluse. Niente costi extra per cantiere o per giornata registrata.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2:
    "Il Giornale Lavori vive collegato a Cantieri, Sicurezza, Foto, Firma.",
  internalLinksBody:
    "Il Giornale Lavori digitale si compila quasi da solo grazie ai dati che produci sui moduli Cantieri, Sicurezza, Foto Cantiere e Firma Elettronica.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Maestranze e mezzi compilati nel giornale lavori." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Foto geolocalizzate allegate automaticamente al giornale." },
    { to: "/funzionalita/sicurezza-cantiere", title: "Sicurezza Cantiere", text: "Eventi rilevanti integrati nel giornale lavori." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Firma DL e RUP con valore legale eIDAS." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Maestranze subappaltatori tracciate nel giornale." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Cliente vede giornale lavori se autorizzato dal DL." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Notifiche push automatiche al DL e RUP per firme." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "Stato firme giornali lavori nel dashboard executive." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di compilare il libro cartaceo a memoria. Inizia a chiudere ogni giornata in 30 secondi con firma DL.",
  finalCtaBody:
    "31 giorni gratuiti per portare il Giornale Lavori digitale dentro la tua impresa edile. Conforme art. 15 D.M. 49/2018, firme DL/RUP eIDAS, esportazione PDF/A, onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Conforme normativa · Firme eIDAS",

  stickyCtaLabel: "Prova gratis Giornale Lavori",
  stickyCtaMicrocopy: "Setup 48h · Conforme art. 15",

  applicationSubCategory: "Construction Daily Site Diary Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function GiornaleLavori() {
  return <FunzionalitaPageTemplate config={config} />;
}
