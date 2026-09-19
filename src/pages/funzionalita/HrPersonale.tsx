import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CalendarDays,
  ClipboardList,
  Cloud,
  FileSignature,
  FileText,
  HardHat,
  HeartPulse,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "hr-personale",
  definizione:
    "HR Personale di Edilizia in Cloud gestisce operai, presenze, ferie e busta paga in un'unica app collegata al cantiere: timbrature GPS conformi al CCNL Edilizia, ferie e malattie richieste dal telefono, costo orario reale per operaio e una bozza di cedolino, calcolata dalle ore timbrate, da passare al consulente del lavoro.",
  vertical: "HR e Personale",
  productName: "Modulo HR e Personale Edilizia in Cloud",
  audience: "Imprese edili, costruttori, ristrutturatori, responsabili HR di PMI edili, consulenti del lavoro, capi cantiere",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Software HR Edilizia: Presenze, Ferie e Malattie",
    description:
      "Gestisci operai e impiegati con timbrature GPS, ferie, malattie, presenze e costo orario CCNL automatico. Il consulente del lavoro riceve ore già contate.",
    keywords:
      "software HR edilizia, gestione personale impresa edile, timbrature GPS cantiere, costo orario CCNL edilizia, ferie malattie presenze edilizia, busta paga edilizia, software paghe imprese edili, gestione operai cantiere, presenze cantiere edile",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · HR e Personale",
  heroH1Lead: "Gestisci operai, ferie, presenze e busta paga",
  heroH1Highlight: "in un'unica app",
  heroH1Tail: "collegata al cantiere",
  heroSubheadline:
    "Timbrature GPS dal cantiere, ferie e malattie gestite dall'app, costo orario reale di ogni operaio, bozza di cedolino calcolata dalle ore per il consulente del lavoro. Tutto collegato direttamente alla commessa, così sai il costo reale di ogni cantiere giorno per giorno.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Straordinari 25/50/100% separati", "Ore pronte per il consulente"],
  proofPoints: [
    "Timbrature GPS conformi al CCNL",
    "Ferie e malattie da app mobile",
    "Costo orario per commessa in tempo reale",
  ],

  objectiveRow: [
    ["Obiettivo", "Sapere quanto costa davvero ogni operaio su ogni cantiere"],
    ["Momento chiave", "Check-in mattina, fine turno, comunicazione assenze"],
    ["Risultato", "Costo manodopera reale per commessa, niente più stime"],
  ],

  betaH2: "Personale e presenze in un'unica app, collegata ai cantieri dove le ore nascono.",
  betaBody:
    "Il modulo HR e Personale è il nervo centrale della tua impresa edile: lo attiviamo in 48 ore, importiamo l'anagrafica operai e impiegati con stipendi e costi orari e ti accompagniamo in 4 sessioni 1-a-1 fino a quando l'operaio medio timbra dal telefono e tu vedi il costo orario reale per commessa.",

  speedH2: "L'operaio timbra dal telefono. Tu vedi il costo orario reale di ogni cantiere giorno per giorno.",
  speedSubheadline:
    "Gestire il personale di un'impresa edile non è gestire un ufficio: è gestire persone che lavorano in 5 cantieri diversi, con turni variabili, straordinari, malattie e ferie da monitorare. Edilizia in Cloud trasforma tutto questo in un flusso semplice, fatto dal telefono dell'operaio e visibile dalla dashboard del titolare.",
  speedStats: [
    { value: 80, prefix: "-", suffix: "%", label: "tempo dedicato a fogli presenze e Excel HR" },
    { value: 95, prefix: "+", suffix: "%", label: "operai che timbrano in autonomia entro 14 giorni" },
    { value: 24, suffix: " h", label: "ritardo massimo tra timbratura e ore visibili in ufficio" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata al personale.",
  familySubheadline:
    "Il personale non è un'isola amministrativa: ogni ora dell'operaio è un costo della commessa, ogni assenza è un'ora che manca al cantiere, ogni straordinario è un margine che cambia. Edilizia in Cloud collega HR a cantieri, margini e fatturazione, così l'amministrazione e l'operazione parlano finalmente la stessa lingua.",
  familyItems: [
    {
      icon: Users,
      title: "HR e Personale",
      text: "Operai, ferie, malattie, presenze, bozza di cedolino e costo orario reale collegato alla commessa.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori, chat squadra. Dove le ore HR diventano produttività.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Wallet,
      title: "Margini Cantiere",
      text: "Margine reale per commessa, scostamento preventivo/consuntivo. La voce manodopera arriva dal modulo HR.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Computo metrico con manodopera prezzata sui costi orari reali della tua impresa, non su standard astratti.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Dalla commessa al SAL, dalla fattura attiva alla fattura passiva. Cassa collegata al costo del personale.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Subappaltatori, manodopera in subappalto, ritenute e DURC. Fianco a fianco con la manodopera diretta.",
      to: "/funzionalita/gestione-subappalti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Sei moduli che si parlano.",
  familyBonusText:
    "Il costo del personale entra automaticamente nel margine della commessa e le stesse ore finiscono nella bozza del cedolino, senza copia-incolla. La timbratura GPS dell'operaio è già il costo del cantiere e già il dato di partenza per il consulente del lavoro.",

  painKicker: "Il problema vero",
  painH2: "Gestire 20 operai su 5 cantieri con Excel e WhatsApp è una bomba a orologeria.",
  painSubheadline:
    "Il personale di un'impresa edile non è un foglio Excel: è un sistema vivo fatto di turni, malattie comunicate alle 6 del mattino, ferie chieste in WhatsApp, straordinari del sabato, infortuni da gestire. Senza uno strumento dedicato, il rischio non è solo amministrativo: è di compliance CCNL, di contestazioni INPS e di costi nascosti che mangiano il margine.",
  painPoints: [
    {
      icon: Phone,
      title: "Comunicazioni operai sparse tra WhatsApp, telefono e SMS",
      text: "Il lunedì mattina arrivano 4 messaggi: uno chiede ferie, due segnalano malattia, uno avvisa di un ritardo. Tu rispondi a singhiozzo mentre apri il cantiere. A fine settimana non ricordi cosa hai approvato e cosa no.",
    },
    {
      icon: FileText,
      title: "Foglio presenze cartaceo o Excel sempre in ritardo",
      text: "Il capocantiere ti dà il foglio presenze il venerdì sera. Tu lo digiti sull'Excel HR il lunedì. Il consulente del lavoro lo riceve il giovedì successivo. Ogni passaggio è un'occasione di errore e di compliance al limite.",
    },
    {
      icon: Timer,
      title: "Costo orario reale per cantiere sconosciuto",
      text: "Sai quanto guadagni dalla commessa, ma non sai davvero quanto ti è costata in manodopera diretta. Le ore straordinarie spariscono, le riunioni di cantiere non sono imputate, i tempi morti tra cantiere e cantiere svaniscono.",
    },
    {
      icon: AlertTriangle,
      title: "Compliance CCNL al limite a ogni ispezione",
      text: "Se domani arriva un'ispezione INPS o INAIL, hai sotto controllo: presenze tracciate, riposi rispettati, ferie godute, formazione sicurezza? La risposta onesta è 'forse'. E 'forse' davanti a un ispettore non basta.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi operai, stessi turni, stesso CCNL. Cambia solo dove vivono i dati.",
  baSubheadline:
    "Il personale è la voce di costo più importante (40-60% del fatturato in edilizia). Quando i dati HR sono frammentati tra Excel, telefono e cervello del titolare, perdi controllo, margine e tranquillità. Ecco cosa cambia con Edilizia in Cloud.",
  baAreas: [
    {
      title: "Timbrature e presenze",
      before:
        "Foglio cartaceo firmato dal capocantiere a fine giornata, raccolto a fine settimana, digitato a inizio settimana successiva. 7 giorni di latenza tra ora lavorata e dato in dashboard.",
      after:
        "Timbratura GPS al check-in, registrazione automatica delle ore sulla commessa giusta. Il dato è nel sistema in tempo reale e resta archiviato.",
    },
    {
      title: "Ferie e malattie",
      before:
        "Richiesta ferie su WhatsApp, malattia comunicata via SMS alle 6 del mattino, certificato medico in fotocopia, archiviazione su una cartella che non trovi quando serve. Caos quando arriva l'ispezione.",
      after:
        "Operaio chiede ferie da app, allega certificato medico, tu approvi/rifiuti con un click. Tutto archiviato in cloud, esportabile a richiesta del consulente del lavoro o degli enti.",
    },
    {
      title: "Costo orario per commessa",
      before:
        "Costo orario stimato a forfait (es. 22€/ora 'standard'). Ore straordinarie a sentimento, riunioni non imputate, tempi morti dispersi. Il costo manodopera reale per commessa è una stima a posteriori.",
      after:
        "Il costo orario di ogni operaio applicato alle ore timbrate, con gli straordinari distinti. La manodopera entra nel margine della commessa giusta con il costo pieno reale.",
    },
    {
      title: "Comunicazione con il consulente del lavoro",
      before:
        "Excel mensile inviato via email, riconciliato manualmente dal consulente, errori di battitura corretti via telefono, busta paga emessa con 5 giorni di ritardo. Costo orario amministrativo molto alto.",
      after:
        "Le ore del mese sono già contate dalle timbrature, con gli straordinari al 25, 50 e 100% separati e i giorni incompleti segnalati. Il consulente parte da una bozza di cedolino da controllare, non da un foglio da ricostruire.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, una sola app per l'operaio, una dashboard sola per il titolare.",
  mechanismSubheadline:
    "Il modulo HR è progettato per chi ha 5, 10, 30 operai sparsi su più cantieri. Funziona dal telefono per chi sta in cantiere e dal browser per chi sta in ufficio. Niente formazione lunga: l'operaio medio impara in 15 minuti.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "L'operaio timbra e comunica dall'app",
      text: "Check-in GPS al cantiere, check-out a fine turno, richieste ferie e malattie con allegati, foto del cantiere con timestamp. Tutto dal telefono personale o aziendale, anche offline.",
    },
    {
      icon: Cloud,
      title: "I dati entrano nella commessa giusta automaticamente",
      text: "Le ore vanno sulla commessa giusta con il costo orario dell'operaio, le assenze vanno nel piano ferie/malattie, gli straordinari vengono evidenziati. Niente data entry, niente Excel intermedio.",
    },
    {
      icon: BadgeCheck,
      title: "Il consulente del lavoro parte da una bozza",
      text: "A fine mese la bozza di cedolino è già calcolata dalle ore: lordo, contributi INPS e Cassa Edile, IRPEF. Il consulente del lavoro controlla e chiude, senza ricostruire le presenze.",
    },
  ],
  mechanismCta: "Prova HR sul tuo team operai",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Non un software HR. Un sistema operativo per la voce di costo più importante della tua impresa.",
  commercialBody:
    "La manodopera è il 40-60% del fatturato di un'impresa edile. Anche solo 1 punto percentuale recuperato qui vale molto più di un abbonamento. Edilizia in Cloud ti restituisce controllo su ore, costi e compliance, riducendo al tempo stesso il carico amministrativo.",
  commercialLevers: [
    {
      icon: Target,
      title: "Costo orario reale per commessa",
      text: "Il margine atteso del preventivo era basato su un costo orario di 22€. Quello reale, includendo straordinari e tempi morti, è 26€. Vederlo in tempo reale ti permette di correggere il prossimo preventivo o riprezzare la variante.",
    },
    {
      icon: Bell,
      title: "Alert su superamenti orari e CCNL",
      text: "Notifica push quando un operaio si avvicina al limite settimanale di straordinari, quando un riposo settimanale non è stato rispettato, quando una formazione sicurezza è in scadenza.",
    },
    {
      icon: ShieldCheck,
      title: "Compliance CCNL e ispezioni tracciate",
      text: "Timbrature GPS conformi, riposi giornalieri e settimanali rispettati, formazione sicurezza tracciata, certificati medici archiviati. In caso di ispezione INPS o INAIL hai tutto in cloud, esportabile in 2 minuti.",
    },
    {
      icon: TrendingUp,
      title: "Meno carico amministrativo, meno errori",
      text: "L'impiegata HR smette di fare riconciliazioni Excel: le ore sono già contate e le anomalie segnalate. Gli errori sulle ore si vedono prima che arrivino in busta paga.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "L'HR non è un'isola amministrativa. È il cuore operativo dell'impresa edile.",
  resultsBody:
    "Quando il personale è collegato a cantieri, margini e fatturazione, smetti di vedere l'amministrazione come un costo e inizi a vederla come un sistema di controllo. Il costo orario reale di ogni cantiere ti restituisce decisioni più giuste e una compliance solida.",
  integrationPillars: [
    {
      icon: MapPin,
      title: "Timbrature GPS dal cantiere",
      text: "Check-in georeferenziato al cantiere, ore ordinarie e straordinari distinti, archivio delle timbrature con orario e posizione da mostrare in caso di contestazione.",
    },
    {
      icon: CalendarDays,
      title: "Pianificazione ferie e malattie",
      text: "Calendario ferie multi-operaio, gestione richieste, approvazioni dal capocantiere o titolare, alert su sovrapposizioni. Certificati medici allegati e archiviati a norma.",
    },
    {
      icon: HeartPulse,
      title: "Sicurezza e formazione tracciate",
      text: "Scadenze formazione sicurezza (D.Lgs 81/2008), DPI consegnati, visite mediche periodiche, idoneità sanitaria. Alert automatico in scadenza per evitare blocchi in cantiere.",
    },
    {
      icon: FileSignature,
      title: "Bozza di cedolino per il consulente",
      text: "Ore ordinarie, straordinari al 25, 50 e 100%, lordo, contributi e IRPEF calcolati dalle timbrature. Il consulente del lavoro controlla la bozza invece di ricostruire le presenze.",
    },
  ],
  resultStats: [
    { value: 80, prefix: "-", suffix: "%", label: "tempo amministrativo dedicato all'HR" },
    { value: 95, prefix: "+", suffix: "%", label: "operai che timbrano in autonomia entro 14 giorni" },
    { value: 3, label: "fasce di straordinario separate per il consulente: 25, 50 e 100%" },
  ],
  resultsCta: "Apri la dashboard HR di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto tempo amministrativo recuperi se gli operai timbrano dall'app?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di operai gestiti e ore amministrative settimanali dedicate a HR. La stima parte dalla riduzione media dell'80% del tempo HR osservata nei nostri clienti dopo 90 giorni.",
  roi: {
    input1Label: "Operai gestiti",
    input1Default: 12,
    input1Min: 1,
    input1Max: 200,
    input1Step: 1,
    input1Suffix: "",
    input2Label: "Costo orario amministrazione (€)",
    input2Default: 28,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio amministrativo stimato/anno",
    computeOutput: (a, b) => Math.round(a * 1.5 * 0.8 * 50 * b),
    computeSecondary: (a, b) => [
      { label: "Ore HR risparmiate/anno", value: `${Math.round(a * 1.5 * 0.8 * 50)} h` },
      { label: "Errori busta paga evitati/anno (stima)", value: `${Math.max(2, Math.round(a * 0.5))}` },
      { label: "Costo HR attuale stimato/anno", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(a * 1.5 * 50 * b) },
    ],
    closingPitch:
      "Stima prudenziale basata su 1,5h HR/operaio/settimana risparmiate (-80% con timbrature digitali). Le imprese più strutturate registrano riduzioni fino al 90%.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un'app per timbrare. Un sistema che ti restituisce il controllo del costo del lavoro.",
  salesBody:
    "L'HR digitale non è un dettaglio: è il modo in cui smetti di gestire l'azienda 'a sentimento' sul costo del personale. Ecco le 4 dimensioni operative che cambiano da subito quando timbrature, ferie e busta paga vivono in un solo strumento.",
  salesImpact: [
    {
      title: "Amministrazione HR alleggerita",
      text: "L'impiegata HR non passa più 2 giorni al mese su Excel: passa 4 ore. Il consulente del lavoro riceve i dati già strutturati, le buste paga escono nei tempi previsti.",
    },
    {
      title: "Capocantieri più liberi",
      text: "Il capocantiere non deve più raccogliere fogli presenze a fine settimana e inseguire chi non li ha consegnati. Il dato c'è già: lui supervisiona solo le anomalie.",
    },
    {
      title: "Conversazioni con gli operai più chiare",
      text: "Quando l'operaio chiede 'ho fatto X ore questo mese?' apri l'app e gli rispondi in 5 secondi. Niente più contestazioni a fine mese su ferie, straordinari, presenze.",
    },
    {
      title: "Compliance e ispezioni senza ansia",
      text: "Quando arriva un'ispezione INPS, INAIL o ASL, esporti documenti a norma in 2 minuti. Niente notti perse a riassemblare cartellini o certificati medici sparsi.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Timbrature GPS multi-cantiere",
      value:
        "Check-in/check-out via app con verifica geografica del cantiere. Ogni timbratura resta in archivio con orario e posizione.",
    },
    {
      label: "Costo orario per operaio",
      value:
        "Il costo orario di ogni operaio applicato in automatico alle ore timbrate sulla commessa, con gli straordinari distinti. La manodopera entra nel margine con il costo pieno, non con una stima a forfait.",
    },
    {
      label: "Ferie, malattie, permessi",
      value:
        "Richieste da app con allegato certificato medico, approvazione titolare/capocantiere, calendario multi-operaio, alert su sovrapposizioni e limiti contrattuali.",
    },
    {
      label: "Sicurezza e DPI",
      value:
        "Tracciamento corsi sicurezza D.Lgs 81/2008, DPI consegnati con firma digitale, scadenze visite mediche e idoneità sanitaria. Alert automatici in scadenza.",
    },
    {
      label: "Bozza di cedolino per il consulente",
      value:
        "Ore ordinarie e straordinari al 25, 50 e 100% dalle timbrature, lordo dallo stipendio in anagrafica, contributi INPS e Cassa Edile e IRPEF con le aliquote dell'Edilizia Industria. Il consulente del lavoro controlla e chiude.",
    },
    {
      label: "Dashboard costi del personale",
      value:
        "Costo manodopera reale per cantiere, ore lavorate per operaio, straordinari accumulati, ferie residue. Vista per titolare, vista filtrata per capocantiere.",
    },
    {
      label: "App offline per zone senza segnale",
      value:
        "Tutte le funzioni di campo (timbrature, foto, note, richieste assenza) funzionano offline. Sincronizzazione automatica appena torna il segnale.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud ti salva la giornata.",
  scenarios: [
    {
      title: "Lunedì mattina, due operai si danno malati",
      text:
        "Alle 7:30 ricevi due notifiche: malattia comunicata da app con certificato allegato. In dashboard vedi quali cantieri sono scoperti, ridistribuisci la squadra in 5 minuti dal browser. I capocantieri ricevono la riassegnazione, gli operai presenti vedono il piano aggiornato.",
    },
    {
      title: "Ispezione INPS a sorpresa",
      text:
        "L'ispettore chiede timbrature degli ultimi 6 mesi, certificati medici, formazione sicurezza, registro infortuni. Apri l'app, esporti in PDF firmato in 2 minuti. L'ispezione si chiude senza rilievi.",
    },
    {
      title: "Operaio contesta le ore di un mese",
      text:
        "L'operaio dice 'ho fatto 12 ore di straordinario, in busta paga ne sono pagate 10'. Apri il dettaglio timbrature: vedi check-in e check-out, geolocalizzazione, cantiere. La discussione si chiude in 5 minuti, con i dati alla mano.",
    },
  ],

  testimonialQuote:
    "Avevo 18 operai su 6 cantieri e l'HR mi rubava 2 giorni a settimana. Ora i cartellini si compilano da soli, il consulente del lavoro mi dice 'finalmente dati puliti' e io ho riguadagnato un giorno e mezzo di lavoro vero.",
  testimonialAuthor: "Paolo G.",
  testimonialRole: "Edil Group Greco, Bari",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Le timbrature GPS sono conformi al CCNL Edilizia?",
      a: "Il sistema registra l'orario esatto di ingresso e uscita, verifica che l'operaio sia al cantiere e tiene in archivio ogni timbratura con orario e posizione. Straordinari e giorni incompleti sono evidenziati. Come applicare le regole del tuo contratto lo decide il consulente del lavoro, che parte da questi dati.",
    },
    {
      q: "Funziona anche se il cantiere non ha segnale?",
      a: "Sì. L'app ha modalità offline completa: timbrature, foto, richieste assenze e note funzionano senza connessione. La sincronizzazione è automatica appena torna il segnale, senza che l'operaio debba fare nulla.",
    },
    {
      q: "Si integra col mio consulente del lavoro?",
      a: "Sì, ma non con un collegamento diretto al suo programma paghe. Il modulo conta le ore dalle timbrature, separa gli straordinari al 25, 50 e 100%, segnala i giorni incompleti e calcola una bozza di cedolino con le aliquote dell'Edilizia Industria. Il consulente parte da lì, controlla e chiude i cedolini con il suo software.",
    },
    {
      q: "Posso gestire più contratti CCNL contemporaneamente?",
      a: "Presenze, ferie e costo orario funzionano per ogni operaio, qualunque contratto applichi. La bozza di cedolino invece usa solo le aliquote standard dell'Edilizia Industria: per Artigianato, cooperative o altri CCNL i conti li fa il consulente del lavoro.",
    },
    {
      q: "Cosa succede se un operaio non vuole usare il telefono personale?",
      a: "Hai tre opzioni: (1) telefono aziendale dedicato, (2) tablet condiviso al cantiere con timbratura individuale via PIN, (3) timbratura via QR code stampato in cantiere. La maggior parte dei nostri clienti adotta l'opzione 1 o 2 senza resistenze.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo HR e Personale è incluso nei piani Professionista e Impresa AI di Edilizia in Cloud. Il prezzo lo definiamo in consulenza sulla tua impresa. Nessun costo di attivazione, nessun vincolo di durata, cancelli quando vuoi. Onboarding 1-a-1 e supporto italiano sempre inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "L'HR non vive da solo. Ecco a cosa è collegato.",
  internalLinksBody:
    "HR e Personale è il cuore amministrativo dell'impresa, ma vive collegato ai cantieri, ai margini, ai subappalti e alla fatturazione. Ecco i moduli e le pagine collegate.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori, chat squadra. Dove le ore HR diventano produttività.",
    },
    {
      to: "/funzionalita/margini-cantiere",
      title: "Margini Cantiere",
      text: "Margine reale per commessa. La voce manodopera arriva direttamente dal modulo HR, in tempo reale.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Computo metrico con manodopera prezzata sui costi orari reali della tua impresa, non su standard astratti.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dalla commessa al SAL, dalla fattura attiva alla fattura passiva, conserva digitale 10 anni inclusa.",
    },
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Subappaltatori, contratti, SAL, ritenute, DURC. Fianco a fianco con la gestione della manodopera diretta.",
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
      text: "Piani su misura per la tua impresa. Modulo HR e Personale incluso in Professionista e Impresa AI.",
    },
  ],

  finalCtaH2: "Smetti di gestire il personale tra Excel, WhatsApp e fogli cartacei. Inizia a gestirlo da un'app.",
  finalCtaBody:
    "31 giorni gratuiti per portare Edilizia in Cloud nella tua amministrazione HR. Setup in 48 ore, importazione anagrafica operai e bozza di cedolino per il consulente del lavoro inclusi. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Ore pronte per il consulente · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis HR e Personale",
  stickyCtaMicrocopy: "Setup 48h · Cancelli quando vuoi",

  applicationSubCategory: "Construction Workforce Management Software",

  relatedBlogSlugs: [
    "hr-edilizia-presenze-buste-paga",
    "ccnl-edilizia-guida",
    "trovare-operai-edili-qualificati",
  ],
};

export default function HrPersonale() {
  return <FunzionalitaPageTemplate config={config} />;
}
