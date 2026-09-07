import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Euro,
  FileSpreadsheet,
  FileText,
  HardHat,
  Hourglass,
  Layers,
  LineChart,
  Receipt,
  Ruler,
  ShieldCheck,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "contabilita-lavori",
  definizione:
    "Contabilità Lavori di Edilizia in Cloud porta la contabilità lavori fuori da Excel: libretto delle misure e stati di avanzamento si emettono in pochi clic dalle voci di computo, i SAL si trasformano in fatture con un passaggio e le ritenute restano tracciate su ogni stato.",
  vertical: "Contabilità Lavori",
  productName: "Contabilità Lavori Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che emettono stati avanzamento lavori su appalti pubblici e privati e vogliono SAL in pochi clic, libretto misure digitale e fatture di acconto collegate agli avanzamenti",
  audienceShort: "imprese edili che emettono SAL e fatturano ad avanzamento",

  seo: {
    title: "Software Contabilità Lavori e SAL",
    description:
      "Software contabilità lavori: SAL in pochi clic, stati avanzamento collegati alle fatture, libretto misure digitale. Niente Excel. Prova gratis 31 giorni.",
    keywords:
      "software contabilita lavori, SAL software, stato avanzamento lavori software, libretto misure digitale, contabilita lavori edilizia, sal cantiere, fatturazione avanzamento lavori, software sal appalti",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Contabilità Lavori",
  heroH1Lead: "Il SAL non può costarti",
  heroH1Highlight: "un weekend su Excel.",
  heroH1Tail: "Contabilità lavori e fatture in pochi clic",
  heroSubheadline:
    "Libretto misure a mano, righe ricopiate, formule che saltano: ogni SAL è una serata persa. Con Edilizia in Cloud la contabilità lavori esce da Excel: gli stati avanzamento si emettono in pochi clic dalle voci della commessa, il libretto misure si compila con le quantità realmente eseguite, ogni SAL genera la sua fattura di acconto già collegata. Sai sempre quanto hai prodotto, quanto hai fatturato e quanto ti manca da incassare, cantiere per cantiere.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "SAL dalle voci di commessa",
    "Fatture di acconto collegate",
  ],
  proofPoints: [
    "Libretto misure digitale",
    "Avanzamento per voce in percentuale o quantità",
    "Prodotto vs fatturato sempre visibile",
  ],

  objectiveRow: [
    ["Obiettivo", "Fatturare l'avanzamento reale, quando avviene, senza ricostruzioni"],
    ["Momento chiave", "Ogni chiusura SAL e ogni fattura di acconto"],
    ["Risultato", "SAL emessi in 20 minuti invece che in mezza giornata"],
  ],

  betaH2:
    "Più di 300 imprese italiane emettono i SAL dal gestionale invece che da Excel.",
  betaBody:
    "La Contabilità Lavori la attiviamo in 48 ore: importiamo le commesse aperte con le voci di preventivo, configuriamo le percentuali di avanzamento già maturate, colleghiamo la fatturazione e ti accompagniamo in 3 sessioni 1-a-1 fino al primo SAL emesso e fatturato. Dal primo mese fatturi gli avanzamenti senza ricostruire niente a mano.",

  speedH2:
    "Ogni SAL fatto su Excel è mezza giornata persa e un rischio di errore che finisce in fattura.",
  speedSubheadline:
    "Il giro classico: copi le voci del preventivo su un foglio nuovo, cerchi le quantità eseguite tra rapportini e memoria, ricalcoli le percentuali, sbagli una cella, il cliente contesta. E intanto la fattura di acconto parte in ritardo di settimane: il circolante lo paghi tu.",
  speedStats: [
    { value: 20, suffix: " min", label: "per emettere un SAL completo (era mezza giornata)" },
    { value: 100, suffix: "%", label: "delle fatture di acconto collegate a un SAL" },
    { value: 15, prefix: "-", suffix: " gg", label: "di ritardo medio tra avanzamento e fattura" },
  ],

  familyH2: "La contabilità lavori collegata a commesse, rapportini e fatture.",
  familySubheadline:
    "Il SAL non nasce dal nulla: le voci arrivano dal preventivo della commessa, le quantità eseguite dai rapportini di cantiere, la fattura di acconto parte dal SAL approvato. Un flusso solo, dal cantiere all'incasso.",
  familyItems: [
    {
      icon: ClipboardList,
      title: "Gestione Commesse",
      text: "Le voci di preventivo della commessa sono la base di ogni SAL.",
      to: "/funzionalita/gestione-commesse",
    },
    {
      icon: FileText,
      title: "Preventivi Edilizia",
      text: "Il preventivo accettato definisce voci, quantità e prezzi del lavoro.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Rapportini Cantiere",
      text: "Le quantità eseguite arrivano dal cantiere, non dalla memoria.",
      to: "/funzionalita/rapportini-cantiere",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica",
      text: "Ogni SAL approvato genera la fattura di acconto già collegata.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Prodotto, fatturato e costi si leggono insieme sul margine di commessa.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Wallet,
      title: "Scadenzario",
      text: "Gli acconti fatturati entrano nello scadenzario incassi automaticamente.",
      to: "/funzionalita/scadenzario",
    },
  ],
  familyBonusTitle:
    "Dal cantiere alla fattura senza ricopiare niente: il SAL si prepara quasi da solo.",
  familyBonusText:
    "Le voci ci sono già, perché vengono dal preventivo della commessa. Le quantità ci sono già, perché arrivano dai rapportini. Tu apri il SAL, controlli gli avanzamenti proposti, aggiusti dove serve, approvi. La fattura di acconto parte collegata, lo scadenzario si aggiorna, il margine di commessa pure. Excel resta chiuso.",

  painKicker: "Il problema vero",
  painH2:
    "Lavori prodotti e non fatturati: il modo più silenzioso di finanziare i clienti a tasso zero.",
  painSubheadline:
    "Quando la contabilità lavori vive su Excel, il SAL è una corvée che si rimanda: si fattura in ritardo, si dimenticano voci, si litigano percentuali con la DL. Ogni settimana di ritardo tra lavoro eseguito e fattura emessa è credito che regali.",
  painPoints: [
    {
      icon: FileSpreadsheet,
      title: "Il SAL su Excel: mezza giornata e mille errori",
      text: "Copia le voci dal preventivo, cerca le quantità nei rapportini di carta, ricalcola le percentuali sul totale, controlla le ritenute. Una cella sbagliata e il SAL è da rifare, o peggio: parte sbagliato e il cliente contesta tutto il documento.",
    },
    {
      icon: Hourglass,
      title: "Fatture di acconto in ritardo di settimane",
      text: "Il lavoro è stato eseguito a inizio mese, il SAL si prepara 'appena c'è tempo', la fattura parte a fine mese dopo. Su un appalto da 200.000 € vuol dire decine di migliaia di euro prodotti e non incassati per settimane.",
    },
    {
      icon: Ruler,
      title: "Libretto misure ricostruito a memoria",
      text: "Le quantità eseguite stanno nella testa del capocantiere e su fogli sparsi. Quando la DL chiede il libretto misure, si ricostruisce a ritroso: quantità stimate, date incerte, contestazioni assicurate al momento del collaudo.",
    },
    {
      icon: AlertTriangle,
      title: "Prodotto e fatturato che nessuno riconcilia",
      text: "Quanto abbiamo prodotto su quel cantiere? Quanto abbiamo fatturato? Quanto manca? Tre domande semplici che richiedono ore di ricostruzione. Intanto le varianti eseguite e mai portate in contabilità lavori si perdono per strada.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi appalti, stessi SAL. Cambia il tempo che ci metti e gli errori che non fai più.",
  baSubheadline:
    "La Contabilità Lavori non cambia le regole dell'appalto: cambia il lavoro che serve per rispettarle. Le voci, le quantità e le percentuali esistono già nel sistema: il SAL li mette in fila, tu approvi.",
  baAreas: [
    {
      title: "Emissione del SAL",
      before:
        "Foglio Excel copiato dal preventivo, quantità cercate tra rapportini cartacei e telefonate, percentuali ricalcolate a mano. Mezza giornata a SAL, errori frequenti, versioni multiple del file.",
      after:
        "Apri il SAL sulla commessa: voci già presenti, avanzamenti proposti dalle quantità registrate, ritenute e acconti precedenti calcolati. Controlli, aggiusti, approvi: 20 minuti.",
    },
    {
      title: "Fatturazione degli avanzamenti",
      before:
        "SAL approvato in una mail, fattura fatta a parte ricopiando gli importi. Ritardi di settimane, importi che non tornano con il SAL, acconti precedenti dimenticati.",
      after:
        "Dal SAL approvato generi la fattura di acconto collegata: importi, ritenute e acconti precedenti già corretti. La fattura parte il giorno stesso e finisce nello scadenzario incassi.",
    },
    {
      title: "Libretto misure",
      before:
        "Quantità eseguite su fogli volanti e nella memoria del capocantiere. Libretto ricostruito a ritroso quando lo chiede la DL, con stime e date approssimative.",
      after:
        "Quantità registrate man mano dal cantiere, con data e autore. Il libretto misure è sempre aggiornato e si esporta quando serve: niente ricostruzioni, niente contestazioni sulle date.",
    },
    {
      title: "Controllo prodotto vs fatturato",
      before:
        "Per sapere quanto manca da fatturare su un appalto servono ore di riconciliazione tra preventivo, SAL emessi e fatture. Le varianti eseguite spesso restano fuori.",
      after:
        "Su ogni commessa leggi in tempo reale: prodotto, fatturato, residuo da fatturare, varianti incluse. Un colpo d'occhio e sai esattamente dove sei con i soldi.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi: registra gli avanzamenti, emetti il SAL, fattura l'acconto.",
  mechanismSubheadline:
    "La Contabilità Lavori segue il ritmo reale dell'appalto: il cantiere registra cosa è stato eseguito, l'ufficio emette il SAL in pochi clic, la fattura di acconto parte collegata. Niente ricopiature tra sistemi.",
  mechanismSteps: [
    {
      icon: Ruler,
      title: "Registra gli avanzamenti per voce",
      text: "Per ogni voce della commessa registri l'avanzamento in percentuale o in quantità, anche dal telefono. Le quantità dei rapportini alimentano il libretto misure con data e autore: la base del SAL cresce mentre il cantiere lavora.",
    },
    {
      icon: ClipboardCheck,
      title: "Emetti il SAL in pochi clic",
      text: "Apri un nuovo SAL: il sistema propone gli avanzamenti maturati dall'ultimo stato, calcola importi, ritenute di garanzia e acconti precedenti. Controlli, aggiusti dove serve, approvi. Il documento è pronto per DL e committente.",
    },
    {
      icon: Receipt,
      title: "Fattura l'acconto collegato al SAL",
      text: "Dal SAL approvato generi la fattura di acconto elettronica con importi già corretti. La fattura resta collegata al suo SAL e alla commessa: scadenzario incassi aggiornato, riconciliazione automatica quando arriva il bonifico.",
    },
  ],
  mechanismCta: "Vedi un SAL di esempio",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Fatturi prima, sbagli meno, discuti meno con la DL, vedi sempre quanto ti manca da incassare.",
  commercialBody:
    "La Contabilità Lavori è il pezzo che trasforma il lavoro eseguito in soldi incassati. Le imprese che la attivano riducono di 2 settimane il ritardo medio tra avanzamento e fattura: su un portafoglio da un milione, è circolante vero che torna in azienda.",
  commercialLevers: [
    {
      icon: Euro,
      title: "Circolante recuperato con fatture puntuali",
      text: "Il SAL si emette in 20 minuti, la fattura parte il giorno stesso. Due settimane di ritardo eliminate su ogni acconto: su un portafoglio da 1M€ sono circa 40.000 € di circolante che smetti di anticipare tu.",
    },
    {
      icon: ShieldCheck,
      title: "Meno contestazioni con DL e committente",
      text: "Ogni quantità ha data, autore e voce di riferimento. Quando la DL discute una percentuale, apri il libretto misure e la discussione si chiude sui dati, non sulle opinioni. I SAL passano più lisci, gli incassi pure.",
    },
    {
      icon: Timer,
      title: "Mezza giornata a SAL recuperata",
      text: "Su un'impresa con 5 appalti a SAL mensile sono 2-3 giorni di ufficio recuperati ogni mese. La segreteria smette di fare copia-incolla tra Excel e fatture e il titolare smette di ricontrollare le celle.",
    },
    {
      icon: LineChart,
      title: "Varianti ed extra dentro la contabilità lavori",
      text: "Le varianti registrate sulla commessa entrano nei SAL successivi con il loro prezzo. Niente più lavori eseguiti che restano fuori dalla contabilità e si 'dimenticano' fino alla chiusura, quando è troppo tardi per discuterli.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il SAL smette di essere una corvée. Diventa il momento in cui incassi.",
  resultsBody:
    "Quando la contabilità lavori vive sulla commessa, ogni avanzamento maturato diventa una fattura puntuale e ogni quantità è difendibile davanti alla DL. Le imprese che attivano il modulo vedono cambiare tre numeri: tempo di emissione SAL, ritardo di fatturazione, contestazioni sulle misure.",
  integrationPillars: [
    {
      icon: Layers,
      title: "SAL dalle voci di commessa",
      text: "Ogni SAL nasce dalle voci del preventivo accettato: avanzamenti proposti, importi, ritenute di garanzia e acconti precedenti calcolati in automatico. Numerazione e storico per commessa.",
    },
    {
      icon: Ruler,
      title: "Libretto misure digitale",
      text: "Quantità eseguite registrate per voce con data e autore, dal cantiere o dall'ufficio. Sempre aggiornato, esportabile, pronto per DL, collaudo e contestazioni.",
    },
    {
      icon: Receipt,
      title: "Fatture di acconto collegate",
      text: "Ogni SAL approvato genera la sua fattura elettronica di acconto con importi corretti. Fattura, SAL e commessa restano collegati: riconciliazione incassi automatica.",
    },
    {
      icon: BarChart3,
      title: "Prodotto vs fatturato per commessa",
      text: "Su ogni appalto leggi prodotto, fatturato, residuo e varianti in tempo reale. Il quadro incassi dell'impresa è la somma delle commesse, non una stima di fine mese.",
    },
  ],
  resultStats: [
    { value: 20, suffix: " min", label: "per emettere un SAL completo" },
    { value: 15, prefix: "-", suffix: " gg", label: "ritardo medio tra avanzamento e fattura" },
    { value: 100, suffix: "%", label: "quantità con data e autore nel libretto misure" },
  ],
  resultsCta: "Apri la demo Contabilità Lavori",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto ti costa fatturare gli avanzamenti in ritardo?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: appalti attivi con SAL e valore medio del SAL mensile. La stima calcola il circolante recuperato anticipando la fatturazione di 2 settimane, più le ore d'ufficio risparmiate.",
  roi: {
    input1Label: "Appalti attivi con SAL",
    input1Default: 4,
    input1Min: 1,
    input1Max: 30,
    input1Step: 1,
    input2Label: "Valore medio SAL mensile (€)",
    input2Default: 25000,
    input2Min: 2000,
    input2Max: 300000,
    input2Step: 1000,
    input2Suffix: " €",
    outputLabel: "Circolante recuperato (stima annua)",
    computeOutput: (a, b) => Math.round(a * b * 12 * 0.04),
    computeSecondary: (a, b) => [
      { label: "Fatturato ad avanzamento gestito", value: `€ ${(a * b * 12).toLocaleString("it-IT")}` },
      { label: "Giorni di fatturazione anticipati", value: "15 gg" },
      { label: "Ore ufficio recuperate/anno", value: `${a * 12 * 3} h` },
    ],
    closingPitch:
      "Stima prudenziale: 15 giorni di fatturazione anticipata valorizzati al costo del denaro e degli insoluti evitati (4%), più 3 ore recuperate a SAL. Aggiungi le contestazioni DL chiuse sui dati del libretto misure: il ROI reale è più alto.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Niente più fine mese di panico. La contabilità lavori corre insieme al cantiere.",
  salesBody:
    "La Contabilità Lavori cambia 4 abitudini operative: come registri le quantità, come emetti i SAL, come fatturi gli acconti, come rispondi alla DL quando discute una misura.",
  salesImpact: [
    {
      title: "Le quantità si registrano quando accadono",
      text: "Il capocantiere registra le quantità eseguite dal telefono, con la voce giusta. Fine del 'me lo segno dopo': il libretto misure cresce ogni giorno e il SAL a fine mese è già mezzo pronto.",
    },
    {
      title: "Il SAL diventa un controllo, non una costruzione",
      text: "L'ufficio non costruisce più il SAL da zero: controlla gli avanzamenti proposti, aggiusta i casi dubbi, approva. Il tempo passa dal copia-incolla al controllo vero dei numeri.",
    },
    {
      title: "Le fatture di acconto partono il giorno stesso",
      text: "SAL approvato, fattura generata, scadenzario aggiornato: tre passaggi nella stessa schermata. Il committente riceve fattura coerente col SAL e paga senza rimpalli.",
    },
    {
      title: "Con la DL discuti sui dati",
      text: "Percentuale contestata? Apri la voce: quantità registrate con date, rapportini collegati, foto del cantiere. La discussione dura minuti e la firma sul SAL arriva prima.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non un modello Excel migliorato. Una contabilità lavori collegata a tutto.",
  featureRows: [
    {
      label: "SAL in pochi clic",
      value:
        "Nuovo SAL dalle voci della commessa: avanzamenti proposti dall'ultimo stato, importi, ritenute di garanzia e acconti precedenti calcolati. Storico SAL numerato per commessa.",
    },
    {
      label: "Avanzamenti per voce",
      value:
        "Registrazione in percentuale o quantità, da ufficio o da telefono. Ogni avanzamento ha data e autore: la base del SAL è tracciata e difendibile.",
    },
    {
      label: "Libretto misure digitale",
      value:
        "Quantità eseguite per voce con date, autori e note. Sempre aggiornato, esportabile per DL e collaudo, collegato ai rapportini di cantiere.",
    },
    {
      label: "Fatture di acconto collegate",
      value:
        "Dal SAL approvato generi la fattura elettronica di acconto con importi corretti. Fattura, SAL e commessa restano collegati per la riconciliazione incassi.",
    },
    {
      label: "Ritenute di garanzia gestite",
      value:
        "Ritenute calcolate su ogni SAL e tracciate fino allo svincolo. Sai sempre quanto hai maturato in ritenute e quando chiederle indietro.",
    },
    {
      label: "Varianti dentro la contabilità",
      value:
        "Extra e varianti registrati sulla commessa entrano nei SAL successivi con il loro prezzo. Niente lavori eseguiti che restano fuori dalla contabilità lavori.",
    },
    {
      label: "Quadro prodotto vs fatturato",
      value:
        "Per ogni commessa: prodotto, fatturato, residuo da fatturare, incassato. Il quadro del portafoglio appalti aggiornato in tempo reale, senza riconciliazioni manuali.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Contabilità Lavori cambia la giornata.",
  scenarios: [
    {
      title: "Il SAL di fine mese pronto in 20 minuti",
      text: "Ultimo giorno del mese, appalto condominio da 380.000 €. L'ufficio apre il SAL n.5: avanzamenti proposti dalle quantità registrate durante il mese, ritenute e acconti calcolati. Controllo, due aggiustamenti, approvazione: 20 minuti. Prima era la mattinata intera più i ricontrolli del titolare.",
    },
    {
      title: "La DL contesta la percentuale degli intonaci",
      text: "La DL sostiene che gli intonaci sono al 60%, non all'80% dichiarato. Il geometra apre la voce: 1.240 m² registrati su 1.550 totali, con date, rapportini e foto collegate. La DL verifica, concorda l'80%, firma il SAL. Discussione chiusa in 10 minuti invece che a suon di PEC per due settimane.",
    },
    {
      title: "La variante che sarebbe sparita",
      text: "A metà appalto il committente chiede un vespaio aggiuntivo, eseguito in una settimana. La variante viene registrata sulla commessa con quantità e prezzo. Al SAL successivo entra in automatico: 6.800 € fatturati puntuali. Con Excel sarebbe rimasta su un foglio volante fino alla chiusura, buona fortuna a farsela pagare.",
    },
  ],

  testimonialQuote:
    "I SAL li facevo io, di sera, su Excel: mezza giornata a stato e la paura costante di sbagliare una cella. Adesso li emette la segreteria in venti minuti e io li controllo dal telefono. Ma la differenza vera è che fatturiamo gli acconti quando maturano, non quando ci ricordiamo: il conto in banca respira.",
  testimonialAuthor: "Stefano R.",
  testimonialRole: "R. Appalti e Costruzioni Srl, Padova",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di lasciare Excel.",
  faqs: [
    {
      q: "Come funziona l'emissione di un SAL in Edilizia in Cloud?",
      a: "In Edilizia in Cloud il SAL si emette dalla commessa: il sistema propone gli avanzamenti maturati dall'ultimo stato sulla base delle quantità e percentuali registrate, calcola importi, ritenute di garanzia e acconti precedenti. Tu controlli, aggiusti dove serve e approvi. Il documento è pronto per Direttore Lavori e committente in circa 20 minuti, con numerazione e storico per commessa.",
    },
    {
      q: "Il SAL è collegato alla fattura di acconto?",
      a: "Sì. Da ogni SAL approvato generi la fattura elettronica di acconto con importi, ritenute e acconti precedenti già corretti. Fattura, SAL e commessa restano collegati: lo scadenzario incassi si aggiorna e quando arriva il bonifico la riconciliazione è immediata. Niente più fatture ricopiate a mano da un foglio Excel con il rischio di importi che non tornano.",
    },
    {
      q: "Cos'è il libretto misure digitale e chi lo compila?",
      a: "Il libretto misure digitale è il registro delle quantità realmente eseguite, voce per voce, con data e autore di ogni registrazione. Lo compila chi è sul campo: il capocantiere o il geometra registrano le quantità dal telefono man mano che i lavori avanzano, anche a partire dai rapportini di cantiere. Quando la DL o il collaudatore lo chiedono, lo esporti aggiornato in pochi secondi.",
    },
    {
      q: "Funziona sia su appalti pubblici che privati?",
      a: "Sì. Sugli appalti pubblici gestisci SAL, libretto misure e ritenute secondo il flusso richiesto da DL e RUP. Sui lavori privati usi lo stesso strumento in versione più snella: stati di avanzamento concordati col cliente e fatture di acconto collegate. In entrambi i casi il principio è lo stesso: fatturare l'avanzamento reale, documentato, senza Excel.",
    },
    {
      q: "Come vengono gestite le ritenute di garanzia?",
      a: "Le ritenute di garanzia si configurano per commessa e vengono calcolate in automatico su ogni SAL. Il sistema tiene il conto delle ritenute maturate, le mostra sulla commessa e le traccia fino allo svincolo a collaudo. Così sai sempre quanti soldi tuoi sono fermi in ritenute e quando è il momento di chiederli indietro, invece di scoprirlo anni dopo.",
    },
    {
      q: "La Contabilità Lavori è inclusa nei piani Edilizia in Cloud?",
      a: "Sì, la Contabilità Lavori fa parte del gestionale Edilizia in Cloud insieme a commesse, preventivi e fatturazione, senza limiti sul numero di SAL o di appalti gestiti. Nella prova gratuita di 31 giorni la usi completa: setup in 48 ore con import delle commesse aperte e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La contabilità lavori vive tra commessa, cantiere e fattura.",
  internalLinksBody:
    "Voci dal preventivo, quantità dai rapportini, fatture dagli avanzamenti: la contabilità lavori è il ponte tra il cantiere che produce e l'impresa che incassa.",
  internalLinks: [
    { to: "/funzionalita/gestione-commesse", title: "Gestione Commesse", text: "Ogni SAL nasce dalle voci della commessa e ne aggiorna il quadro." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Il preventivo accettato definisce voci e prezzi del lavoro." },
    { to: "/funzionalita/computo-metrico", title: "Computo Metrico", text: "Dal computo alle voci di preventivo fino al consuntivo." },
    { to: "/funzionalita/rapportini-cantiere", title: "Rapportini Cantiere", text: "Le quantità eseguite arrivano dal campo con data e autore." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Prodotto, fatturato e costi letti insieme sul margine." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture di acconto elettroniche generate dai SAL." },
    { to: "/funzionalita/ritenute-garanzia", title: "Ritenute di Garanzia", text: "Ritenute calcolate sui SAL e tracciate fino allo svincolo." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "La registrazione giornaliera che documenta l'avanzamento." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di costruire i SAL su Excel. Inizia a fatturare gli avanzamenti quando maturano.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Contabilità Lavori dentro la tua impresa edile. SAL in pochi clic, libretto misure digitale, fatture di acconto collegate, setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · SAL in 20 minuti · Fatture collegate",

  stickyCtaLabel: "Prova gratis Contabilità Lavori",
  stickyCtaMicrocopy: "Setup 48h · SAL senza Excel",

  applicationSubCategory: "Construction Progress Billing Software",

  relatedBlogSlugs: [
    "contabilita-di-cantiere-guida",
    "sal-cantiere-come-funziona",
    "libretto-delle-misure",
  ],
};

export default function ContabilitaLavori() {
  return <FunzionalitaPageTemplate config={config} />;
}
