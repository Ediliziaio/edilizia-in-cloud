import {
  AlertTriangle,
  Bell,
  Calculator,
  ClipboardList,
  FileSignature,
  FileText,
  HardHat,
  LineChart,
  Mail,
  Receipt,
  Repeat,
  Send,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "preventivi-edilizia",
  vertical: "Preventivi Edilizia",
  productName: "Modulo Preventivi Edilizia in Cloud",
  audience: "Imprese edili, ristrutturatori, geometri d'impresa, general contractor, capocantieri preventivisti",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Preventivi Edilizia Software",
    description:
      "Software per preventivi edili con computo metrico estimativo, prezzari regionali aggiornati (DEI, Lombardia, Lazio, Sicilia) e firma elettronica online del cliente.",
    keywords:
      "software preventivi edilizia, computo metrico estimativo, prezzari regionali edilizia, preventivo impresa edile, firma elettronica preventivo, programma preventivi ristrutturazione, conversione preventivo commessa, CRM preventivi edili, follow-up preventivi automatico",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Preventivi Edilizia",
  heroH1Lead: "Preventivi professionali",
  heroH1Highlight: "firmati in 24 ore",
  heroH1Tail: "non in 24 giorni",
  heroSubheadline:
    "Computo metrico estimativo con prezzari regionali integrati, firma elettronica del cliente da telefono, follow-up automatico e conversione 1-click in commessa aperta. Smetti di perdere trattative perché il preventivo arriva troppo tardi.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Prezzari sempre aggiornati", "Firma online a valore legale"],
  proofPoints: [
    "Prezzari regionali DEI integrati",
    "Firma elettronica del cliente",
    "Conversione 1-click in commessa",
  ],

  objectiveRow: [
    ["Obiettivo", "Mandare preventivi in poche ore, non in due settimane"],
    ["Momento chiave", "Sopralluogo, computo metrico, follow-up cliente"],
    ["Risultato", "Più trattative chiuse, meno preventivi nel cassetto"],
  ],

  betaH2: "Più di 320 imprese italiane usano Edilizia in Cloud per chiudere preventivi più velocemente.",
  betaBody:
    "Il modulo Preventivi Edilizia è la porta d'ingresso del flusso commerciale: lo attiviamo in 48 ore, importiamo i tuoi listini e i tuoi preventivi storici, configuriamo i prezzari regionali della tua zona e ti accompagniamo in 4 sessioni 1-a-1 fino a quando emetti il primo preventivo firmato online dal cliente. Niente call center: ti seguiamo personalmente.",

  speedH2: "Dal sopralluogo al preventivo firmato in meno di 24 ore. Senza Excel, senza scanner, senza inseguire il cliente.",
  speedSubheadline:
    "Il preventivo non è un atto burocratico: è un momento commerciale che si gioca sul tempo di risposta e sulla qualità della percezione. Il tuo concorrente che manda un Word generico in 5 giorni perde. Tu che mandi un preventivo professionale firmabile online in 24 ore vinci.",
  speedStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo di compilazione del preventivo" },
    { value: 34, prefix: "+", suffix: "%", label: "tasso di chiusura medio dopo 90 giorni" },
    { value: 48, suffix: " h", label: "tempo medio di risposta del cliente" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata al preventivo.",
  familySubheadline:
    "Il preventivo non è un PDF isolato: è il punto in cui nascono la commessa, il margine atteso, il piano di fatturazione e l'allocazione dei subappalti. Edilizia in Cloud collega tutto, così quando il cliente firma il preventivo è già il giorno 1 della commessa.",
  familyItems: [
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Computo metrico, prezzari regionali, listini personalizzati, firma elettronica e follow-up automatico.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori digitale, chat squadra collegati al preventivo accettato.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Wallet,
      title: "Margini Cantiere",
      text: "Margine reale per commessa, scostamento preventivo/consuntivo, alert automatici sui lavori a rischio.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Dal SAL alla fattura elettronica, conserva digitale 10 anni inclusa, conformità AdE pronta.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Users,
      title: "HR e Personale",
      text: "Operai, ferie, malattie, presenze e costo orario reale collegato direttamente alla commessa.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Contratti, SAL, ritenute, DURC e fatture passive dei subappaltatori integrati nel cantiere.",
      to: "/funzionalita/gestione-subappalti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Sei moduli che si parlano.",
  familyBonusText:
    "Il preventivo accettato diventa automaticamente la commessa aperta, con tutte le voci di computo già caricate, il piano di SAL impostato e la prima fattura di acconto pronta da emettere. Nessuna doppia imputazione, nessun copia-incolla tra Excel e gestionale.",

  painKicker: "Il problema vero",
  painH2: "Il preventivo perfetto non basta più: oggi vince chi risponde in 24 ore.",
  painSubheadline:
    "Il cliente medio chiede 3 preventivi e sceglie tra i primi 2 che riceve. Se il tuo arriva quinto, in fotocopia, senza firma online e senza follow-up automatico, hai già perso. Excel e Word non sono lenti: sono fuori mercato.",
  painPoints: [
    {
      icon: Timer,
      title: "Mezza giornata persa per ogni preventivo medio",
      text: "Aprire il PDF del prezzario regionale, cercare la voce, copiarla in Excel, calcolare quantità, applicare margine, formattare il documento, allegare condizioni: ogni preventivo brucia 4-6 ore di un tecnico.",
    },
    {
      icon: AlertTriangle,
      title: "Margini sbagliati per voci sottoprezzate o dimenticate",
      text: "Nel computo metrico fatto a sensazione mancano sempre 2-3 voci di lavorazione. La trovi a cantiere aperto, quando la richiesta di variante al cliente è imbarazzante e il margine è già consumato.",
    },
    {
      icon: Mail,
      title: "Follow-up cliente lasciato al ricordo personale",
      text: "Mandi il preventivo, aspetti 5 giorni, ti dimentichi di richiamare. Il cliente nel frattempo ha firmato col concorrente. Senza un sistema di follow-up automatico, il 60% delle trattative muore di silenzio.",
    },
    {
      icon: FileText,
      title: "Doppia imputazione tra preventivo e commessa",
      text: "Il cliente firma e ricominci da capo: riapri Excel, riporti le voci nel software di cantiere, configuri il piano SAL. Ogni doppio inserimento è un'occasione per sbagliare quantità o prezzo.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa offerta, stesso mercato, stessa concorrenza. Cambia solo la velocità con cui rispondi.",
  baSubheadline:
    "Non parliamo di reinventare il preventivo: parliamo di costruirlo dove i dati vivono già — listini, prezzari regionali, anagrafica clienti, storico margini — e di farlo firmare al cliente dal telefono, non da un fax.",
  baAreas: [
    {
      title: "Compilazione del computo metrico",
      before:
        "Excel con formule che si rompono, prezzario regionale aperto in PDF su un secondo monitor, voci copiate manualmente, errori di battitura sui prezzi unitari. Mezza giornata per un preventivo standard.",
      after:
        "Cerchi la voce del prezzario regionale e si compila da sola con codice, descrizione, unità di misura, prezzo unitario aggiornato. Quantità da inserire, margine applicato in automatico. Preventivo standard in 30 minuti.",
    },
    {
      title: "Layout e percezione del cliente",
      before:
        "Word con logo sgranato, tabelle che si spaccano in stampa, condizioni di pagamento allegate a parte, IBAN scritto a mano. Il cliente apre il PDF e capisce subito che sei un artigiano, non un'impresa strutturata.",
      after:
        "Template professionale con il tuo brand, foto del sopralluogo allegate, condizioni inserite automaticamente, link cliccabile per accettare e firmare online. Il cliente percepisce subito un'impresa moderna e affidabile.",
    },
    {
      title: "Firma e accettazione",
      before:
        "Stampi il preventivo, lo dai al cliente, aspetti che lo firmi a penna, lo scansioni al rientro, lo archivi su una cartella dropbox. 3-5 giorni di lentezza burocratica tra l'OK verbale e la firma reale.",
      after:
        "Il cliente clicca sul link, firma elettronicamente dal telefono in 30 secondi (firma elettronica avanzata a valore legale ai sensi dell'eIDAS). Tu ricevi notifica push immediata e il preventivo diventa contratto.",
    },
    {
      title: "Conversione preventivo → commessa",
      before:
        "Preventivo firmato in PDF, commessa creata a mano nel software di cantiere, voci di computo digitate di nuovo, piano SAL impostato manualmente. 2-3 ore di lavoro per il geometra d'impresa.",
      after:
        "Click su 'Apri commessa': tutte le voci passano automaticamente al modulo Gestione Cantieri, con piano SAL precompilato, scadenze fatture acconto/saldo programmate e budget operativo già caricato.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, niente formazione lunga, niente Excel da abbandonare di colpo.",
  mechanismSubheadline:
    "Il modulo Preventivi è progettato per chi fa sopralluoghi, non per chi vuole certificarsi sull'uso di un software. Carichi il listino una volta, e da lì in poi è solo questione di scegliere voci e quantità.",
  mechanismSteps: [
    {
      icon: Calculator,
      title: "Cerchi la voce nel prezzario, inserisci la quantità",
      text: "Prezzari regionali (DEI, Lombardia, Emilia-Romagna, Lazio, Toscana, Sicilia, Bollettino) integrati e aggiornati. Inizi a digitare il nome della lavorazione, scegli, inserisci la quantità: prezzo unitario, descrizione e unità di misura si compilano da soli.",
    },
    {
      icon: Send,
      title: "Mandi il PDF firmabile online in due click",
      text: "Generi il PDF professionale con il tuo brand, lo invii al cliente via email con un link di accettazione. Il cliente firma elettronicamente dal telefono, tu ricevi notifica push, il sistema attiva il follow-up automatico.",
    },
    {
      icon: Repeat,
      title: "Convertibile in commessa con un click quando firma",
      text: "Quando il cliente firma, hai un pulsante 'Apri commessa' che porta tutto il computo metrico, il margine atteso e il piano SAL nel modulo Gestione Cantieri. Da preventivo accettato a cantiere operativo in 60 secondi.",
    },
  ],
  mechanismCta: "Provalo gratis sul tuo prossimo preventivo",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Non è un software per fare preventivi. È un sistema per chiuderne di più.",
  commercialBody:
    "Tra fare un buon preventivo e chiuderlo passa la differenza tra il fatturato e il margine. Edilizia in Cloud agisce sui tre fattori commerciali che davvero spostano il tasso di chiusura: velocità di risposta, qualità percepita, follow-up sistematico.",
  commercialLevers: [
    {
      icon: Zap,
      title: "Velocità di risposta che batte il concorrente",
      text: "Mentre il tuo concorrente è ancora a copiare voci da Excel, tu hai già mandato il PDF firmabile. Il primo preventivo arrivato e leggibile vince in 7 casi su 10.",
    },
    {
      icon: Target,
      title: "Margine difeso voce per voce",
      text: "Margine commerciale applicato per categoria di lavorazione (manodopera, materiali, noleggi, subappalti) o globalmente. Niente più voci sottoprezzate per fretta o dimenticanze.",
    },
    {
      icon: Bell,
      title: "Follow-up automatico che chiude i tiepidi",
      text: "Reminder automatici al cliente dopo 3, 7 e 14 giorni di silenzio. Lo strumento ricorda al cliente di rispondere mentre tu lavori sul prossimo sopralluogo.",
    },
    {
      icon: TrendingUp,
      title: "Storico per migliorare i prossimi prezzi",
      text: "Vedi quali preventivi vinci, quali perdi e a che prezzo. Prezza il prossimo intervento sui dati reali di trattative simili appena chiuse, non a sentimento.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Dal sopralluogo alla firma in 24 ore. Dalla firma al cantiere aperto in 60 secondi.",
  resultsBody:
    "Il preventivo non è un PDF: è il primo atto di un flusso che arriva fino alla fattura saldata e al margine in cassa. Quando preventivo, commessa, fatturazione e margini parlano la stessa lingua, smetti di gestire l'azienda per silos.",
  integrationPillars: [
    {
      icon: FileText,
      title: "Template professionali brandizzati",
      text: "Logo, colori aziendali, foto di sopralluogo allegate, condizioni di pagamento e privacy precompilate. Il PDF che arriva al cliente è subito 'da impresa strutturata'.",
    },
    {
      icon: FileSignature,
      title: "Firma elettronica avanzata a valore legale",
      text: "Firma del cliente dal telefono in 30 secondi, conforme eIDAS, archiviata in cloud con marca temporale. Il preventivo firmato vale come contratto in un eventuale contenzioso.",
    },
    {
      icon: Bell,
      title: "Follow-up automatico multi-canale",
      text: "Sequenza di email automatiche di promemoria al cliente, configurabili per intensità (cliente caldo / cliente tiepido). Smetti di affidare la chiusura al tuo ricordo personale.",
    },
    {
      icon: LineChart,
      title: "Dashboard pipeline e tasso di conversione",
      text: "Preventivi inviati, accettati, persi, in attesa. Tempo medio di risposta del cliente, tasso di chiusura per tipologia di lavoro. Decidi su numeri, non su sensazioni.",
    },
  ],
  resultStats: [
    { value: 34, prefix: "+", suffix: "%", label: "tasso di chiusura medio sui preventivi inviati" },
    { value: 70, prefix: "-", suffix: "%", label: "tempo di compilazione preventivo standard" },
    { value: 60, suffix: " s", label: "per convertire un preventivo accettato in commessa" },
  ],
  resultsCta: "Apri la tua dashboard pipeline",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato in più chiudi se rispondi in 24 ore invece di 5 giorni?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di preventivi che invii in un mese e ticket medio. La stima parte da +12 punti percentuali di tasso di chiusura, base media osservata nei nostri clienti dopo 90 giorni di utilizzo.",
  roi: {
    input1Label: "Preventivi inviati al mese",
    input1Default: 12,
    input1Min: 2,
    input1Max: 100,
    input1Step: 1,
    input2Label: "Ticket medio del preventivo",
    input2Default: 35000,
    input2Min: 5000,
    input2Max: 500000,
    input2Step: 1000,
    input2Suffix: " €",
    outputLabel: "Fatturato aggiuntivo stimato/anno",
    computeOutput: (a, b) => Math.round(a * 12 * 0.12 * b),
    computeSecondary: (a, b) => [
      { label: "Preventivi inviati/anno", value: `${a * 12}` },
      { label: "Ore tecnico risparmiate/anno", value: `${Math.round(a * 12 * 4)} h` },
      { label: "Trattative aggiuntive chiuse/anno", value: `${Math.round(a * 12 * 0.12)}` },
      { label: "Volume gestito/anno", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(a * 12 * b) },
    ],
    closingPitch:
      "Stima prudenziale basata su +12 punti percentuali di chiusura. La maggior parte dei nostri clienti registra tra il +10% e il +18% nei primi 12 mesi.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un programma per preventivi. Una macchina commerciale per imprese edili.",
  salesBody:
    "Il preventivo è la fase commerciale più sottovalutata in edilizia. Quando smetti di trattarlo come un atto burocratico e inizi a trattarlo come un sales workflow, il tasso di chiusura cambia di colpo. Ecco le 4 dimensioni che si muovono da subito.",
  salesImpact: [
    {
      title: "Tempo tecnico recuperato",
      text: "4 ore in meno per ogni preventivo standard significano 1 giornata di tecnico recuperata ogni settimana. Tempo che torna su sopralluoghi, varianti e gestione cantiere.",
    },
    {
      title: "Più sopralluoghi convertiti",
      text: "Il sopralluogo non si chiude più con 'ti mando il preventivo a settimana prossima'. Si chiude con il preventivo già firmato online prima del weekend.",
    },
    {
      title: "Brand percepito da impresa, non da artigiano",
      text: "PDF professionale, firma elettronica, follow-up curato: il cliente passa dalla percezione 'piccolo artigiano' a 'impresa che sa il fatto suo' senza che tu cambi nulla nel servizio.",
    },
    {
      title: "Pipeline misurabile",
      text: "Smetti di rispondere a 'come stiamo a preventivi?' con sensazioni. Apri la dashboard e mostri: inviati, in attesa, accettati, persi e perché. Decisioni più veloci e più giuste.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Computo metrico estimativo",
      value:
        "Voci di lavorazione strutturate per categorie (movimento terra, strutture, finiture, impianti). Quantità, prezzo unitario, importo, margine. Calcoli automatici di IVA, ritenute, sconti.",
    },
    {
      label: "Prezzari regionali integrati",
      value:
        "Prezzari DEI, Bollettino, Lombardia, Emilia-Romagna, Lazio, Toscana, Sicilia. Aggiornati automaticamente con le revisioni ufficiali. Cerca per codice o per descrizione.",
    },
    {
      label: "Listini personalizzati e ricarichi",
      value:
        "Costruisci il tuo listino interno con voci ricorrenti, prezzi negoziati con fornitori abituali, ricarichi standard per tipologia. Riutilizzo immediato sui prossimi preventivi.",
    },
    {
      label: "Template PDF professionali",
      value:
        "Layout brandizzato (logo, colori, font), copertina, premessa lavori, foto sopralluogo, computo metrico, condizioni generali, IBAN, modalità pagamento. Esportazione PDF firmabile.",
    },
    {
      label: "Firma elettronica del cliente",
      value:
        "Link di accettazione online, firma elettronica avanzata conforme eIDAS, marca temporale, archivio cloud immutabile. Valore legale in eventuale contenzioso.",
    },
    {
      label: "Follow-up automatico",
      value:
        "Reminder email programmati a 3, 7, 14 e 30 giorni. Tracciamento aperture e click. Notifica push al titolare quando il cliente apre il preventivo o firma.",
    },
    {
      label: "Conversione 1-click in commessa",
      value:
        "Preventivo accettato → commessa aperta in 60 secondi. Voci, margini, piano SAL e scadenze fatturazione precompilati. Zero data entry doppio.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud ti fa chiudere il preventivo che ieri perdevi.",
  scenarios: [
    {
      title: "Cliente che chiede 3 preventivi al lunedì mattina",
      text:
        "Sopralluogo lunedì alle 10. Tu apri l'app sul tablet, registri voci, foto e quantità in tempo reale. Mercoledì pomeriggio il cliente riceve il PDF firmabile. Giovedì firma. Il concorrente manderà il suo Word venerdì sera, quando ormai è tardi.",
    },
    {
      title: "Variante in corso d'opera da formalizzare",
      text:
        "Il cliente chiede una variante a metà cantiere. Tu apri il preventivo originale, duplichi le voci coinvolte, applichi prezzi e quantità nuove, generi un addendum firmabile online. In 20 minuti il cliente ha firmato la variante e tu hai protetto il margine.",
    },
    {
      title: "Preventivo per intervento simile a uno appena chiuso",
      text:
        "Il geometra ti chiede un preventivo per una ristrutturazione molto simile a una appena conclusa. Apri lo storico, duplichi il preventivo precedente, aggiorni quantità e foto. In 15 minuti hai un preventivo nuovo, prezzato sui costi reali del cantiere appena chiuso.",
    },
  ],

  testimonialQuote:
    "Mando preventivi firmabili online in 24 ore, non in 5 giorni. Il cliente percepisce subito un'altra azienda. E il follow-up automatico chiude da solo i tiepidi che prima dimenticavo di richiamare.",
  testimonialAuthor: "Stefano R.",
  testimonialRole: "Costruzioni Rinaldi & Figli, Verona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "I prezzari regionali sono aggiornati automaticamente?",
      a: "Sì. Edilizia in Cloud include i prezzari DEI, Bollettino e i prezzari ufficiali di Lombardia, Emilia-Romagna, Lazio, Toscana, Sicilia, Veneto e altre regioni italiane. Vengono aggiornati automaticamente con le revisioni ufficiali, senza che tu debba scaricare o importare nulla manualmente.",
    },
    {
      q: "Posso usare il mio listino interno con prezzi negoziati con i fornitori?",
      a: "Sì. Oltre ai prezzari regionali puoi importare il tuo listino interno (Excel o CSV) con voci ricorrenti, prezzi negoziati con i fornitori abituali e ricarichi commerciali per categoria. Le voci diventano riutilizzabili in tutti i prossimi preventivi.",
    },
    {
      q: "La firma elettronica del cliente ha valore legale?",
      a: "Sì. Edilizia in Cloud usa firma elettronica avanzata conforme al Regolamento eIDAS, con marca temporale e archiviazione cloud immutabile. In caso di contenzioso, il preventivo firmato ha valore probatorio equivalente alla firma autografa.",
    },
    {
      q: "Il preventivo accettato diventa davvero commessa con un click?",
      a: "Sì. Quando il cliente firma, hai un pulsante 'Apri commessa' che porta automaticamente nel modulo Gestione Cantieri tutte le voci di computo, il margine atteso, il piano SAL e le scadenze di fatturazione precompilate. Zero doppia imputazione.",
    },
    {
      q: "Posso gestire varianti e revisioni del preventivo?",
      a: "Sì. Ogni preventivo può avere più revisioni (v1, v2, v3) con storico delle modifiche, oppure puoi generare un addendum/variante a contratto firmato. Il cliente firma elettronicamente la versione aggiornata, archivio e marca temporale aggiornati.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo Preventivi Edilizia è incluso in tutti i piani Edilizia in Cloud, da 49€/mese per il piano Starter. Nessun costo di attivazione, nessun vincolo di durata, cancelli quando vuoi. Onboarding 1-a-1, prezzari aggiornati e supporto italiano sempre inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il preventivo è il punto di partenza. Ecco dove arriva.",
  internalLinksBody:
    "Preventivi Edilizia è il primo passo di un flusso che va fino alla fattura saldata. Ecco i moduli e le pagine collegate, dalla gestione cantiere ai render AI per chiudere preventivi più velocemente.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Dal preventivo accettato alla commessa aperta in 60 secondi: avanzamento lavori, timbrature GPS, giornale lavori digitale.",
    },
    {
      to: "/funzionalita/margini-cantiere",
      title: "Margini Cantiere",
      text: "Margine reale per commessa, scostamento preventivo/consuntivo in tempo reale, alert sui cantieri a rischio.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dal SAL alla fattura elettronica con conserva digitale 10 anni, conformità AdE pronta out-of-the-box.",
    },
    {
      to: "/funzionalita/hr-personale",
      title: "HR e Personale",
      text: "Operai, ferie, malattie, presenze, costo orario reale collegato direttamente al preventivo accettato.",
    },
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Contratti subappalto, SAL, ritenute, DURC e fatture passive integrati nella commessa.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi AI",
      text: "Per serramentisti: prima/dopo sulla foto reale del cliente, allegato al preventivo per chiudere più in fretta.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni AI",
      text: "Per imprese di ristrutturazione: prima/dopo realistico in 60 secondi, allegato al preventivo per migliorare la conversione.",
    },
    {
      to: "/per/imprese-edili",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma orientata alle imprese edili italiane: gestione, controllo, vendita, fatturazione.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti da 49€/mese. Prezzari, firma elettronica e follow-up sempre inclusi. Cancelli quando vuoi.",
    },
  ],

  finalCtaH2: "Smetti di mandare preventivi che finiscono nel cassetto. Inizia a mandarne di firmabili online.",
  finalCtaBody:
    "31 giorni gratuiti per portare Edilizia in Cloud nei tuoi sopralluoghi. Setup in 48 ore, prezzari regionali aggiornati, firma elettronica del cliente e conversione 1-click in commessa inclusi. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Prezzari aggiornati · Firma online a valore legale",

  stickyCtaLabel: "Prova gratis Preventivi Edilizia",
  stickyCtaMicrocopy: "Setup 48h · Cancelli quando vuoi",

  applicationSubCategory: "Construction Estimating Software",

  relatedBlogSlugs: [
    "come-fare-preventivo-edilizia",
    "computo-metrico-estimativo-guida",
    "alternativa-excel-cantieri",
  ],
};

export default function PreventiviEdilizia() {
  return <FunzionalitaPageTemplate config={config} />;
}
