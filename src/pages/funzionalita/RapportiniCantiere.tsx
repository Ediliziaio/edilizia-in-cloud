import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Euro,
  FileSignature,
  FileText,
  Layers,
  PenTool,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "rapportini-cantiere",
  definizione:
    "Rapportini Cantiere di Edilizia in Cloud è il rapportino giornaliero compilato dallo smartphone a fine giornata: foto del lavoro fatto, nota vocale, ore delle persone e materiali usati, in circa due minuti, con firma del cliente e PDF generato in automatico per la commessa.",
  vertical: "Rapportini Cantiere",
  productName: "Rapportini di Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, artigiani strutturati e general contractor che vogliono rapportini di cantiere digitali compilati da smartphone con foto e nota vocale, ore, materiali e mezzi tracciati, firma del cliente a fine lavori e PDF professionale",
  audienceShort: "imprese edili che vogliono la giornata di cantiere documentata",

  seo: {
    title: "Rapportini di Cantiere Digitali",
    description:
      "Rapportini di cantiere digitali da smartphone: foto, nota vocale, ore, materiali e mezzi. Firma cliente e PDF a fine lavori. Prova gratis 31 giorni.",
    keywords:
      "rapportini di cantiere digitali, software rapportini cantiere, rapportino cantiere app, rapportino lavoro edilizia, rapportino giornaliero cantiere, firma cliente rapportino, rapportino con foto cantiere, app rapportini imprese edili",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Rapportini Cantiere",
  heroH1Lead: "La giornata in cantiere non può",
  heroH1Highlight: "finire con mezz'ora di scartoffie.",
  heroH1Tail: "Rapportino dal telefono: foto, vocale, 2 minuti",
  heroSubheadline:
    "Fogli compilati in furgone, foto sparse su WhatsApp, ore ricostruite a memoria il venerdì. Con Edilizia in Cloud il rapportino di cantiere si compila da smartphone a fine giornata: foto del lavoro fatto, nota vocale invece di scrivere, ore della squadra, materiali usati e mezzi impiegati. A fine lavori il cliente firma sul telefono e il sistema genera un PDF professionale con foto e firme. La giornata di cantiere resta documentata, le ore finiscono sulla commessa giusta, le contestazioni si chiudono con le prove.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Compilazione in 2 minuti da smartphone",
    "Firma cliente a fine lavori",
  ],
  proofPoints: [
    "Foto e nota vocale al posto della carta",
    "Ore, materiali e mezzi sulla commessa giusta",
    "PDF professionale con foto e firme",
  ],

  objectiveRow: [
    ["Obiettivo", "Ogni giornata di cantiere documentata senza carta"],
    ["Momento chiave", "Fine giornata in cantiere e firma di fine lavori"],
    ["Risultato", "Ore e materiali imputati, contestazioni chiuse con le prove"],
  ],

  betaH2:
    "Più di 300 imprese italiane hanno mandato in pensione il blocchetto dei rapportini.",
  betaBody:
    "I Rapportini di Cantiere li attiviamo in 48 ore: installiamo l'app sugli smartphone della squadra, configuriamo cantieri, operai e mezzi, prepariamo il modello PDF con il tuo logo e ti accompagniamo in 2 sessioni 1-a-1 fino al primo rapportino firmato dal cliente. Dal primo giorno i capisquadra compilano dal telefono, l'ufficio smette di decifrare calligrafie.",

  speedH2:
    "Il blocchetto dei rapportini è il punto dove l'impresa perde ore, materiali e ragioni.",
  speedSubheadline:
    "Rapportini compilati a fine settimana a memoria, calligrafie da decifrare, fogli persi nel furgone, ore mai imputate al cantiere giusto. E quando il cliente contesta, l'unica prova è un foglio a quadretti scritto in fretta. Il rapportino digitale chiude tutti questi buchi in un colpo solo.",
  speedStats: [
    { value: 2, suffix: " min", label: "per compilare il rapportino da smartphone" },
    { value: 100, suffix: "%", label: "delle ore imputate alla commessa giusta" },
    { value: 5, suffix: " sec", label: "per ritrovare il rapportino di una giornata storica" },
  ],

  familyH2: "Il rapportino alimenta commesse, contabilità lavori e giornale di cantiere.",
  familySubheadline:
    "Il rapportino non è un foglio che finisce in un raccoglitore: è il dato che alimenta tutto il resto. Le ore vanno sul consuntivo della commessa, le quantità sul libretto misure, le foto sull'archivio di cantiere, gli eventi sul giornale lavori.",
  familyItems: [
    {
      icon: ClipboardList,
      title: "Gestione Commesse",
      text: "Ore e materiali dei rapportini entrano nel consuntivo della commessa.",
      to: "/funzionalita/gestione-commesse",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Il costo manodopera reale aggiorna il margine mentre il cantiere avanza.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Receipt,
      title: "Contabilità Lavori",
      text: "Le quantità eseguite alimentano libretto misure e SAL.",
      to: "/funzionalita/contabilita-lavori",
    },
    {
      icon: Camera,
      title: "Foto Cantiere",
      text: "Le foto dei rapportini finiscono nell'archivio fotografico del cantiere.",
      to: "/funzionalita/foto-cantiere",
    },
    {
      icon: FileText,
      title: "Giornale Lavori",
      text: "I dati della giornata alimentano il giornale lavori conforme.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "La firma del cliente a fine lavori con valore legale.",
      to: "/funzionalita/firma-elettronica",
    },
  ],
  familyBonusTitle:
    "Compili una volta, dal telefono. Il dato lavora per te in tutta la piattaforma.",
  familyBonusText:
    "Il caposquadra registra la giornata in 2 minuti: le ore finiscono sul consuntivo della commessa, le foto nell'archivio di cantiere, le quantità sul libretto misure, gli eventi nel giornale lavori. Un solo gesto a fine giornata, zero ricopiature in ufficio. E quando serve la prova di cosa è successo il 12 marzo, la trovi in 5 secondi.",

  painKicker: "Il problema vero",
  painH2:
    "Rapportini scritti a memoria il venerdì, fogli persi nel furgone, ore mai imputate al cantiere giusto.",
  painSubheadline:
    "Il rapportino cartaceo è il documento più maltrattato dell'edilizia: si compila in ritardo, si perde, non si legge. Eppure è la base di tutto: costo manodopera, fatturazione degli extra, difesa nelle contestazioni. Trattarlo male costa caro.",
  painPoints: [
    {
      icon: Clock,
      title: "Compilato a fine settimana, a memoria",
      text: "Il caposquadra compila i rapportini il venerdì sera, ricostruendo la settimana a memoria: ore approssimative, materiali dimenticati, lavori extra non segnati. Il dato nasce già sbagliato, e su quello si calcolano costi e fatture.",
    },
    {
      icon: Search,
      title: "Fogli persi tra furgone, tasche e ufficio",
      text: "Il rapportino di martedì è nel cruscotto, quello di giovedì in tasca alla giacca da lavoro. In ufficio ne arriva la metà, spesso illeggibile. Le ore non imputate finiscono spalmate 'a occhio' sui cantieri: il consuntivo è una finzione.",
    },
    {
      icon: Euro,
      title: "Lavori extra fatti e mai fatturati",
      text: "Il cliente chiede una modifica al volo, la squadra la fa, sul rapportino non c'è o non si capisce. A fine lavori nessuno si ricorda, l'extra non va in fattura. Su un anno di cantieri sono migliaia di euro lavorati gratis.",
    },
    {
      icon: AlertTriangle,
      title: "Contestazioni senza uno straccio di prova",
      text: "Il cliente sostiene che 'quel giorno non avete lavorato' o che 'il danno l'avete fatto voi'. La tua difesa è un foglio a quadretti compilato in fretta, senza foto, senza firma. La discussione parte persa, o si chiude con uno sconto che non dovevi.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa squadra, stessa giornata. Cambia come la registri e cosa puoi dimostrare.",
  baSubheadline:
    "Il rapportino digitale non chiede alla squadra più lavoro: ne chiede meno. Due minuti sul telefono a fine giornata, con foto e nota vocale al posto della penna. Il resto lo fa il sistema.",
  baAreas: [
    {
      title: "Compilazione del rapportino",
      before:
        "Blocchetto a fine settimana, a memoria: ore approssimative, calligrafia da decifrare, materiali dimenticati, extra non segnati. In ufficio qualcuno deve ricopiare tutto.",
      after:
        "App sul telefono a fine giornata: ore della squadra selezionate in tap, foto del lavoro fatto, nota vocale per le annotazioni, materiali e mezzi dalla lista. Due minuti, dato pulito, zero ricopiature.",
    },
    {
      title: "Ore e costo manodopera",
      before:
        "Ore spalmate 'a occhio' sui cantieri quando i fogli arrivano in ufficio. Il costo manodopera per commessa è una stima, il margine di conseguenza pure.",
      after:
        "Le ore di ogni rapportino vanno sulla commessa giusta il giorno stesso. Il costo manodopera è un dato reale che aggiorna il margine mentre il cantiere è aperto.",
    },
    {
      title: "Fine lavori e firma del cliente",
      before:
        "Lavoro finito, saluti e via. Se il cliente poi contesta qualcosa, non c'è un documento di chiusura accettato: parola contro parola.",
      after:
        "A fine lavori il cliente firma sul telefono: lavoro eseguito, foto allegate, data e ora. Il PDF con firma parte via email a entrambi. La chiusura è un documento, non una stretta di mano.",
    },
    {
      title: "Archivio e ricerca",
      before:
        "Raccoglitori pieni di fogli, ordinati quando va bene per mese. Ritrovare il rapportino di una giornata specifica di sei mesi fa richiede ore, se il foglio esiste ancora.",
      after:
        "Ogni rapportino archiviato per cantiere e data, con foto e firme. Cerchi '12 marzo, cantiere Bianchi' e in 5 secondi hai il PDF completo: ore, uomini, materiali, foto, annotazioni.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi: compila dal telefono, l'ufficio approva, il cliente firma.",
  mechanismSubheadline:
    "I Rapportini di Cantiere sono costruiti per chi ha i guanti addosso: interfaccia semplice, foto e voce al posto della tastiera, tutto il resto automatico.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "Il caposquadra compila a fine giornata",
      text: "Apre l'app, seleziona il cantiere: spunta gli operai presenti con le ore, aggiunge foto del lavoro fatto, registra una nota vocale invece di scrivere, segna materiali usati e mezzi impiegati. Due minuti, anche con i guanti, anche senza segnale: sincronizza dopo.",
    },
    {
      icon: ClipboardCheck,
      title: "L'ufficio vede e approva in tempo reale",
      text: "Il rapportino arriva subito in ufficio: niente più attesa del venerdì, niente calligrafie. L'ufficio controlla, approva, e le ore vanno sul consuntivo della commessa, i materiali sul cantiere giusto, le foto in archivio. Gli extra segnalati diventano voci da fatturare.",
    },
    {
      icon: PenTool,
      title: "Il cliente firma a fine lavori sul telefono",
      text: "A lavori finiti, il cliente firma direttamente sullo schermo: lavoro eseguito, foto, date. Il sistema genera un PDF professionale con logo, foto e firme, inviato a entrambi. Chiusura documentata, contestazioni successive disinnescate.",
    },
  ],
  mechanismCta: "Vedi un rapportino di esempio",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Ore vere sulla commessa, extra fatturati, contestazioni chiuse con le prove, ufficio che respira.",
  commercialBody:
    "Il rapportino digitale è il dato grezzo su cui si regge tutto il controllo dell'impresa. Le imprese che lo attivano scoprono nel primo mese quanto costava il blocchetto: ore mai imputate, extra regalati, discussioni perse per mancanza di prove.",
  commercialLevers: [
    {
      icon: Timer,
      title: "Il costo manodopera diventa un dato vero",
      text: "Le ore di ogni giornata finiscono sulla commessa giusta il giorno stesso. Il margine di cantiere si calcola su ore reali, non su stime: e i cantieri che assorbono più ore del previsto si vedono subito, non a fine lavori.",
    },
    {
      icon: Euro,
      title: "Gli extra segnati diventano extra fatturati",
      text: "Il lavoro extra si segna sul rapportino in 20 secondi, con foto. L'ufficio lo vede e lo mette in fattura. Sul lavoro medio, gli extra recuperati valgono il 5% in più incassato: prima si perdevano tra le righe del blocchetto.",
    },
    {
      icon: ShieldCheck,
      title: "Ogni contestazione trova un documento",
      text: "Giornata documentata con ore, foto, annotazioni e firma di fine lavori. Quando il cliente contesta, apri il rapportino e la discussione si chiude sui fatti. Niente più sconti fatti solo perché non potevi dimostrare.",
    },
    {
      icon: Sparkles,
      title: "L'ufficio smette di ricopiare e decifrare",
      text: "Niente più pomeriggi a decifrare calligrafie e ricopiare ore su Excel: il dato arriva già digitale, pulito, imputato. La segreteria recupera ore ogni settimana e il venerdì smette di essere il giorno della caccia ai fogli.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "La giornata di cantiere smette di evaporare. Resta scritta, imputata, difendibile.",
  resultsBody:
    "Quando ogni giornata è registrata in 2 minuti con foto e ore vere, l'impresa guadagna su tre fronti: consuntivi affidabili, extra fatturati, difesa documentale pronta. E la squadra, dopo la prima settimana, non tornerebbe mai al blocchetto.",
  integrationPillars: [
    {
      icon: Smartphone,
      title: "App mobile pensata per il cantiere",
      text: "Interfaccia semplice, compilazione in tap, foto e nota vocale al posto della tastiera. Funziona offline e sincronizza appena torna il segnale: nessuna giornata persa.",
    },
    {
      icon: Layers,
      title: "Ore, materiali e mezzi strutturati",
      text: "Operai con ore, materiali dalla lista, mezzi impiegati, fasi lavorate: ogni voce del rapportino è un dato strutturato che finisce sulla commessa, non testo libero da interpretare.",
    },
    {
      icon: PenTool,
      title: "Firma cliente a fine lavori",
      text: "Il cliente firma sullo schermo del telefono a lavori conclusi. Firma, data e foto entrano nel PDF di chiusura: la consegna del lavoro diventa un documento accettato.",
    },
    {
      icon: FileText,
      title: "PDF professionale con foto e firme",
      text: "Ogni rapportino genera un PDF con il tuo logo, foto della giornata, ore, materiali, annotazioni e firme. Pronto da inviare al cliente, alla DL o da archiviare per anni.",
    },
  ],
  resultStats: [
    { value: 2, suffix: " min", label: "per compilare il rapportino della giornata" },
    { value: 5, prefix: "+", suffix: "%", label: "incassato in più con gli extra fatturati" },
    { value: 100, suffix: "%", label: "giornate documentate con foto e ore" },
  ],
  resultsCta: "Apri la demo Rapportini Cantiere",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto ti costa il blocchetto dei rapportini, davvero?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: operai in squadra e ore medie lavorate a settimana per operaio. La stima calcola il valore delle ore correttamente imputate e degli extra recuperati in fattura.",
  roi: {
    input1Label: "Operai in squadra",
    input1Default: 8,
    input1Min: 1,
    input1Max: 60,
    input1Step: 1,
    input2Label: "Ore/settimana per operaio",
    input2Default: 40,
    input2Min: 20,
    input2Max: 50,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Valore recuperato all'anno",
    computeOutput: (a, b) => Math.round(a * b * 48 * 30 * 0.03),
    computeSecondary: (a, b) => [
      { label: "Ore tracciate/anno", value: `${(a * b * 48).toLocaleString("it-IT")} h` },
      { label: "Ore mal imputate recuperate", value: "3%" },
      { label: "Ore segreteria risparmiate/anno", value: `${a * 15} h` },
    ],
    closingPitch:
      "Stima prudenziale: 3% di ore prima perse o mal imputate, valorizzate a 30 €/h. Non include gli extra recuperati in fattura e le contestazioni chiuse con le prove: sul campo, sono spesso la voce più grossa.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Niente più venerdì a caccia di fogli. La giornata si chiude in cantiere.",
  salesBody:
    "I Rapportini di Cantiere cambiano 4 abitudini concrete: come la squadra chiude la giornata, come l'ufficio riceve i dati, come si fatturano gli extra, come si chiudono i lavori col cliente.",
  salesImpact: [
    {
      title: "La squadra chiude la giornata in 2 minuti",
      text: "Fine giornata, telefono in mano: operai spuntati, foto scattate, nota vocale registrata. Il caposquadra ci mette meno che a compilare il blocchetto, e non deve ricordarsi niente il venerdì.",
    },
    {
      title: "L'ufficio lavora su dati, non su calligrafie",
      text: "I rapportini arrivano in tempo reale, già strutturati: ore per operaio, materiali, mezzi, fasi. Approvazione in un clic e il dato è sulla commessa. Il tempo di ricopiatura sparisce del tutto.",
    },
    {
      title: "Gli extra viaggiano verso la fattura",
      text: "Il lavoro extra segnato sul rapportino con foto arriva in ufficio come voce da fatturare. Niente più 'ah, ma l'avevamo fatto?' a fine cantiere: se è segnato, si fattura.",
    },
    {
      title: "La chiusura lavori è un documento firmato",
      text: "Il cliente firma sul telefono, riceve il PDF con foto e firme. La percezione è di un'impresa seria e organizzata, e le contestazioni post-consegna calano drasticamente.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non un'app per appunti. Un rapportino strutturato che alimenta il gestionale.",
  featureRows: [
    {
      label: "Compilazione da smartphone",
      value:
        "App semplice per il caposquadra: cantiere, operai con ore, materiali, mezzi, fasi lavorate, annotazioni. Due minuti a fine giornata, funziona anche offline.",
    },
    {
      label: "Foto e nota vocale",
      value:
        "Foto del lavoro fatto allegate al rapportino, nota vocale al posto della scrittura. Chi ha i guanti addosso non deve scrivere paragrafi: parla e fotografa.",
    },
    {
      label: "Ore imputate alla commessa",
      value:
        "Le ore di ogni operaio finiscono sul consuntivo della commessa giusta il giorno stesso. Costo manodopera reale, margine aggiornato, niente fogli presenze da ricopiare.",
    },
    {
      label: "Materiali e mezzi tracciati",
      value:
        "Materiali usati e mezzi impiegati registrati per giornata e cantiere. Il consumo reale si confronta col preventivato e alimenta il controllo costi della commessa.",
    },
    {
      label: "Firma cliente a fine lavori",
      value:
        "Il cliente firma sullo schermo a lavori conclusi: lavoro eseguito, foto, data e ora. La chiusura del cantiere diventa un documento accettato dalle due parti.",
    },
    {
      label: "PDF professionale",
      value:
        "Ogni rapportino esporta un PDF con logo, foto, ore, materiali, annotazioni e firme. Pronto per cliente, DL, archivio o contestazione.",
    },
    {
      label: "Archivio cercabile per anni",
      value:
        "Tutti i rapportini archiviati per cantiere e data. Qualsiasi giornata storica si ritrova in 5 secondi, con foto e firme: la memoria dell'impresa non sta più nei raccoglitori.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui i Rapportini di Cantiere cambiano la giornata.",
  scenarios: [
    {
      title: "Il cliente contesta una giornata di sei mesi fa",
      text: "Il cliente sostiene che a marzo il cantiere è rimasto fermo una settimana e chiede uno sconto. Il titolare cerca il cantiere in archivio: 5 rapportini di quella settimana, con ore, 23 foto e annotazioni vocali trascritte. Manda i PDF al cliente: la richiesta di sconto rientra il giorno stesso.",
    },
    {
      title: "L'extra segnato alle 16:40 finisce in fattura",
      text: "Durante una ristrutturazione, la proprietaria chiede di spostare due punti luce. Il caposquadra lo segna sul rapportino con una nota vocale e due foto: 3 ore in più e materiale. L'ufficio lo vede il giorno stesso e lo aggiunge in fattura: 380 € che col blocchetto si sarebbero persi tra le righe.",
    },
    {
      title: "Fine lavori con firma e PDF davanti al caffè",
      text: "Bagno finito, cliente soddisfatto. Il caposquadra apre l'app, mostra le foto del lavoro completato, il cliente firma sullo schermo. Prima ancora di risalire sul furgone, il PDF con foto e firme è nella casella email di entrambi. Tre settimane dopo, quando il cliente segnala un graffio 'fatto da voi', il PDF di consegna dice altro.",
    },
  ],

  testimonialQuote:
    "I miei capisquadra odiavano la carta e io odiavo decifrarla. Adesso a fine giornata fanno tutto dal telefono: foto, vocale, ore. Io la sera vedo tutti i cantieri già aggiornati. La svolta vera è stata la firma a fine lavori: da quando il cliente firma sul telefono con le foto davanti, le contestazioni sono praticamente sparite.",
  testimonialAuthor: "Marco T.",
  testimonialRole: "T. Edilizia Generale Srl, Verona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di pensionare il blocchetto.",
  faqs: [
    {
      q: "Come si compila un rapportino di cantiere digitale?",
      a: "Il rapportino si compila dall'app Edilizia in Cloud sullo smartphone del caposquadra: seleziona il cantiere, spunta gli operai presenti con le ore, scatta le foto del lavoro fatto, registra una nota vocale al posto delle annotazioni scritte, segna materiali e mezzi dalla lista. In tutto servono circa 2 minuti a fine giornata, e il rapportino arriva in ufficio in tempo reale.",
    },
    {
      q: "I miei operai non sono pratici di tecnologia: ce la fanno?",
      a: "Sì, perché l'app è costruita proprio per loro: si spunta, si fotografa e si parla, non si scrive. Chi sa usare WhatsApp sa compilare un rapportino di Edilizia in Cloud. Nell'onboarding facciamo una sessione dedicata ai capisquadra, e l'esperienza dice che dopo la prima settimana nessuno vuole tornare al blocchetto: è più veloce della carta.",
    },
    {
      q: "Come funziona la firma del cliente a fine lavori?",
      a: "A lavori conclusi il caposquadra apre il rapportino di chiusura, mostra al cliente le foto del lavoro eseguito e il cliente firma direttamente sullo schermo dello smartphone. Il sistema genera un PDF professionale con logo, foto, date e firme, inviato via email a entrambe le parti. Quella firma trasforma la consegna del lavoro in un documento accettato, non in una stretta di mano.",
    },
    {
      q: "Le ore dei rapportini finiscono automaticamente sui costi del cantiere?",
      a: "Sì. Quando l'ufficio approva il rapportino, le ore di ogni operaio vengono imputate al consuntivo della commessa corrispondente, con il loro costo. Il margine del cantiere si aggiorna con manodopera reale, non stimata, e le quantità eseguite possono alimentare libretto misure e SAL. Niente fogli presenze da ricopiare su Excel a fine mese.",
    },
    {
      q: "Funziona anche nei cantieri senza copertura di rete?",
      a: "Sì. L'app funziona offline: il caposquadra compila il rapportino, scatta le foto e registra le note vocali anche senza segnale. Appena il telefono torna in copertura, tutto si sincronizza da solo con data e ora originali della compilazione. Nessuna giornata va persa, anche nei cantieri in campagna o nei piani interrati.",
    },
    {
      q: "I Rapportini di Cantiere sono inclusi nei piani Edilizia in Cloud?",
      a: "Sì, i Rapportini di Cantiere fanno parte del gestionale Edilizia in Cloud, senza limiti sul numero di rapportini, cantieri o utenti in squadra. Nella prova gratuita di 31 giorni li usi completi, con app mobile, firma cliente, PDF con il tuo logo, setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il rapportino è il dato grezzo. Il resto della piattaforma lo trasforma in soldi.",
  internalLinksBody:
    "Ore sulla commessa, quantità sul libretto misure, foto in archivio, eventi nel giornale lavori: ogni rapportino alimenta il controllo dell'impresa.",
  internalLinks: [
    { to: "/funzionalita/gestione-commesse", title: "Gestione Commesse", text: "Ore e materiali dei rapportini nel consuntivo di commessa." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costo manodopera reale che aggiorna il margine." },
    { to: "/funzionalita/contabilita-lavori", title: "Contabilità Lavori", text: "Quantità eseguite verso libretto misure e SAL." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Le foto dei rapportini nell'archivio fotografico." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "La giornata registrata alimenta il giornale conforme." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Firme con valore legale su chiusure e documenti." },
    { to: "/funzionalita/timbrature-gps", title: "Timbrature GPS", text: "Presenze in cantiere che si incrociano coi rapportini." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere Mobile", text: "Tutto il cantiere in tasca al caposquadra." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di rincorrere fogli scritti a memoria. Inizia a chiudere ogni giornata in 2 minuti, con foto e firma.",
  finalCtaBody:
    "31 giorni gratuiti per portare i Rapportini di Cantiere dentro la tua impresa edile. App per la squadra, foto e nota vocale, firma cliente a fine lavori, PDF con il tuo logo, setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · 2 minuti a rapportino · Firma cliente inclusa",

  stickyCtaLabel: "Prova gratis Rapportini Cantiere",
  stickyCtaMicrocopy: "Setup 48h · Foto, vocale e firma",

  applicationSubCategory: "Construction Daily Report Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function RapportiniCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
