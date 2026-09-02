import {
  AlertTriangle,
  BookOpen,
  Brain,
  Calculator,
  Camera,
  ClipboardList,
  Database,
  Euro,
  FileSpreadsheet,
  FileText,
  Layers,
  LineChart,
  ListChecks,
  Receipt,
  Search,
  Tag,
  Timer,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "computo-metrico",
  definizione:
    "Computo Metrico di Edilizia in Cloud costruisce il computo metrico estimativo online dalle voci del listino dell'impresa e dei prezzari regionali, e lo tiene collegato a preventivo e consuntivo: un prezzo cambia una volta sola e si aggiorna ovunque, senza ricopiare tre volte.",
  vertical: "Computo Metrico",
  productName: "Computo Metrico Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, geometri d'impresa e general contractor che preparano computi metrici estimativi da listino e prezzari e vogliono passare da computo a preventivo a consuntivo senza ricopiare le voci, con l'AI che compila da foto e testo",
  audienceShort: "imprese edili che preparano computi e preventivi ogni settimana",

  seo: {
    title: "Software Computo Metrico Estimativo",
    description:
      "Software computo metrico estimativo: voci da listino e prezzari, dal computo al preventivo al consuntivo, AI da foto e testo. Prova gratis 31 giorni.",
    keywords:
      "software computo metrico, computo metrico estimativo online, computo metrico edilizia, voci computo listino prezzi, prezzario computo metrico, computo metrico AI, da computo a preventivo, software computo imprese edili",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Computo Metrico",
  heroH1Lead: "Ricopiare il computo tre volte:",
  heroH1Highlight: "è lì che nascono gli errori.",
  heroH1Tail: "Computo, preventivo e consuntivo in una volta sola",
  heroSubheadline:
    "Un prezzo aggiornato nel computo ma non nel preventivo, e il margine sparisce. Con Edilizia in Cloud il computo metrico estimativo si costruisce online dalle voci del tuo listino e dei prezzari: quantità, prezzi unitari, totali per categoria. Le stesse voci diventano preventivo con un clic e consuntivo mentre il cantiere avanza. E l'AI ti dà una mano vera: descrivi il lavoro a parole o carichi le foto del sopralluogo, e le voci compilate te le trovi già pronte da controllare.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Voci da listino e prezzari",
    "AI da foto e testo inclusa",
  ],
  proofPoints: [
    "Computo → preventivo → consuntivo",
    "Prezzi tuoi, non di listino generico",
    "Voci controllabili riga per riga",
  ],

  objectiveRow: [
    ["Obiettivo", "Computi precisi in una frazione del tempo, con i tuoi prezzi"],
    ["Momento chiave", "Ogni sopralluogo, ogni richiesta di preventivo"],
    ["Risultato", "Computo pronto in 1 ora invece che in una serata"],
  ],

  betaH2:
    "Più di 300 imprese italiane costruiscono computi e preventivi dalle stesse voci, senza ricopiature.",
  betaBody:
    "Il Computo Metrico lo attiviamo in 48 ore: importiamo il tuo listino con prezzi e tariffe manodopera, configuriamo le categorie di lavorazione, attiviamo l'AI che compila da foto e testo e ti accompagniamo in 3 sessioni 1-a-1 fino al primo computo trasformato in preventivo inviato. Dal primo lavoro nuovo, il giro computo-preventivo cambia passo.",

  speedH2:
    "Ogni computo fatto a mano è una serata persa. Ogni voce dimenticata è margine regalato.",
  speedSubheadline:
    "Il giro classico: sopralluogo con foto sul telefono, appunti sul blocchetto, poi la sera su Excel a cercare voci e prezzi, ricalcolare quantità, sperare di non aver dimenticato nulla. Una voce saltata su venti non si vede nel computo: si vede a fine cantiere, nel margine.",
  speedStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo per costruire un computo metrico" },
    { value: 1, suffix: " h", label: "dal sopralluogo al computo pronto da controllare" },
    { value: 100, suffix: "%", label: "voci con prezzo dal tuo listino, non generico" },
  ],

  familyH2: "Il computo collegato a preventivi, commesse e consuntivo.",
  familySubheadline:
    "Il computo metrico non è un documento a parte: è la spina dorsale economica del lavoro. Le voci del computo diventano preventivo, il preventivo accettato diventa commessa, la commessa consuntiva le stesse voci. Una catena sola, dal sopralluogo al margine finale.",
  familyItems: [
    {
      icon: Brain,
      title: "Preventivi con AI",
      text: "L'AI compila le voci da foto e descrizione, sui prezzi del tuo listino.",
      to: "/funzionalita/quote-builder-ai",
    },
    {
      icon: FileText,
      title: "Preventivi Edilizia",
      text: "Il computo diventa preventivo presentabile al cliente con un clic.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: ClipboardList,
      title: "Gestione Commesse",
      text: "Le voci del computo diventano la baseline economica della commessa.",
      to: "/funzionalita/gestione-commesse",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Ogni voce computata si confronta col suo consuntivo in tempo reale.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Receipt,
      title: "Contabilità Lavori",
      text: "Le voci del computo alimentano SAL e libretto misure.",
      to: "/funzionalita/contabilita-lavori",
    },
    {
      icon: Tag,
      title: "Ordini Acquisto",
      text: "Dalle quantità computate agli ordini fornitore per il cantiere.",
      to: "/funzionalita/ordini-acquisto",
    },
  ],
  familyBonusTitle:
    "Scrivi le voci una volta sola. Poi le usi per preventivo, SAL, consuntivo e ordini.",
  familyBonusText:
    "La voce 'demolizione tramezzi, 45 m², 18 €/m²' la inserisci una volta: nel computo. Da lì diventa riga di preventivo, base del SAL, voce di consuntivo da confrontare col preventivato, riferimento per l'ordine materiali. Il lavoro di misurare e prezzare lo fai una volta; il sistema lo riusa ovunque serva.",

  painKicker: "Il problema vero",
  painH2:
    "Computi fatti di sera su Excel, con prezzi vecchi e voci dimenticate che si pagano a fine cantiere.",
  painSubheadline:
    "Il computo metrico è il documento che decide se un lavoro sarà in utile o in perdita. Eppure nella maggior parte delle imprese si fa di fretta, su fogli riciclati dal lavoro precedente, con prezzi non aggiornati. Gli errori non si vedono lì: si vedono mesi dopo, sul conto in banca.",
  painPoints: [
    {
      icon: FileSpreadsheet,
      title: "Excel riciclato dal lavoro precedente",
      text: "Il computo nuovo parte copiando quello vecchio: voci che non c'entrano restano dentro, voci nuove mancano, prezzi fermi a due anni fa. Ogni computo eredita gli errori del precedente e ne aggiunge di suoi.",
    },
    {
      icon: Search,
      title: "Voci dimenticate che erodono il margine",
      text: "Ponteggio, smaltimento, assistenze murarie, oneri di discarica: le voci 'di contorno' si dimenticano nel computo ma si pagano in cantiere. Il 5-8% di costi non computati esce dritto dal tuo margine.",
    },
    {
      icon: Timer,
      title: "Serate intere per ogni richiesta di preventivo",
      text: "Il cliente chiede il preventivo, tu hai le foto del sopralluogo e due ore la sera. Risultato: computi consegnati dopo una settimana, quando il concorrente più veloce ha già preso il lavoro, o computi fatti di fretta con errori.",
    },
    {
      icon: AlertTriangle,
      title: "Computo e consuntivo che non si parlano",
      text: "Il computo sta su Excel, il consuntivo (quando si fa) su un altro Excel. Confrontare voce per voce cosa avevi stimato e cosa hai speso è un lavoro che nessuno fa mai: così gli stessi errori di stima si ripetono su ogni lavoro.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi sopralluoghi, stessi prezzari. Cambia quanto tempo ci metti e cosa non dimentichi più.",
  baSubheadline:
    "Il Computo Metrico di Edilizia in Cloud non ti chiede di cambiare il modo di misurare: cambia dove finiscono le misure. Le voci vengono dal tuo listino, l'AI prepara la bozza, tu resti quello che controlla e decide i prezzi.",
  baAreas: [
    {
      title: "Costruzione del computo",
      before:
        "Excel riciclato, voci cercate a memoria, prezzi da aggiornare a mano, formule che si rompono. Una serata a computo, con la calcolatrice accanto per verificare i totali.",
      after:
        "Voci scelte dal listino con prezzi aggiornati, quantità inserite per categoria, totali e riepiloghi calcolati. Un'ora dal sopralluogo al computo pronto da controllare.",
    },
    {
      title: "Dal sopralluogo alle voci",
      before:
        "Foto sul telefono, appunti sul blocchetto, poi la sera a tradurre tutto in voci sperando di ricordare i dettagli. Le voci di contorno si dimenticano sistematicamente.",
      after:
        "Carichi le foto del sopralluogo o descrivi il lavoro a parole: l'AI propone le voci compilate dal tuo listino, comprese quelle di contorno. Tu controlli riga per riga, correggi, approvi.",
    },
    {
      title: "Dal computo al preventivo",
      before:
        "Il computo va ricopiato in un documento presentabile: altre ore, altri errori di trascrizione, versioni multiple tra computo e preventivo che non tornano mai.",
      after:
        "Il computo diventa preventivo con un clic: stesse voci, layout presentabile con il tuo logo, invio al cliente tracciato. Una sola fonte, zero trascrizioni.",
    },
    {
      title: "Dal preventivo al consuntivo",
      before:
        "A fine lavoro nessuno confronta più il computo con la realtà: troppo faticoso. Gli errori di stima si ripetono identici sul lavoro successivo.",
      after:
        "Le voci computate si consuntivano sulla commessa mentre il cantiere avanza. A fine lavoro vedi voce per voce dove hai stimato giusto e dove no: il prossimo computo parte dai tuoi numeri veri.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi: voci dal listino, AI che compila, un clic per il preventivo.",
  mechanismSubheadline:
    "Il Computo Metrico è costruito attorno al tuo listino: prodotti, lavorazioni e tariffe manodopera con i tuoi prezzi reali. Su quella base lavori a mano, con l'AI, o metà e metà.",
  mechanismSteps: [
    {
      icon: BookOpen,
      title: "Parti dal tuo listino e dai prezzari",
      text: "In onboarding importiamo il tuo listino: materiali, lavorazioni, tariffe manodopera, prezzi tuoi. Le voci del computo le peschi da lì con la ricerca, per categoria: prezzi aggiornati, descrizioni coerenti, niente voci scritte ogni volta da capo.",
    },
    {
      icon: Camera,
      title: "Lascia che l'AI prepari la bozza da foto o testo",
      text: "Carichi le foto del sopralluogo o scrivi due righe: 'rifacimento bagno 6 m², demolizione, impianti, rivestimenti'. L'AI propone le voci compilate con quantità stimate e prezzi dal tuo listino. Tu controlli ogni riga, correggi le quantità, approvi.",
    },
    {
      icon: FileText,
      title: "Trasforma il computo in preventivo e commessa",
      text: "Computo pronto? Un clic e diventa preventivo presentabile con il tuo logo, pronto da inviare. Il cliente accetta? Le stesse voci diventano la baseline della commessa: consuntivo e SAL lavoreranno su quelle, senza ricopiare niente.",
    },
  ],
  mechanismCta: "Prova il computo con AI",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Più computi in meno tempo, voci di contorno mai più dimenticate, stime che migliorano a ogni lavoro.",
  commercialBody:
    "Il computo metrico è dove si decide il margine, prima ancora di aprire il cantiere. Le imprese che lo fanno con Edilizia in Cloud rispondono più in fretta alle richieste, dimenticano meno voci e imparano dai propri consuntivi.",
  commercialLevers: [
    {
      icon: Timer,
      title: "Rispondi ai clienti in giorni, non settimane",
      text: "Un computo in un'ora invece che in una serata significa preventivi consegnati in 2-3 giorni invece che in una settimana. Chi risponde prima, prende più lavori: a parità di prezzo, la velocità chiude.",
    },
    {
      icon: ListChecks,
      title: "Le voci di contorno non si dimenticano più",
      text: "Ponteggi, smaltimenti, assistenze, oneri: l'AI le propone e il listino le tiene in evidenza per categoria di lavoro. Il 5-8% di costi che prima uscivano dal margine adesso stanno nel computo, e quindi nel prezzo.",
    },
    {
      icon: Euro,
      title: "Prezzi tuoi, aggiornati una volta sola",
      text: "Aggiorni il prezzo del listino e tutti i computi futuri lo usano. Niente più preventivi fatti con prezzi di due anni fa perché 'l'Excel era quello': ogni punto di aggiornamento prezzi è margine protetto.",
    },
    {
      icon: LineChart,
      title: "Ogni consuntivo migliora il computo successivo",
      text: "Confrontando computo e consuntivo voce per voce vedi dove sbagli sistematicamente le stime: la demolizione che sottovaluti sempre, la posa che sopravvaluti. Dopo 6 mesi i tuoi computi sono tarati sui tuoi cantieri veri.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il computo smette di essere il collo di bottiglia. Diventa il punto di forza.",
  resultsBody:
    "Quando il computo si costruisce dal listino in un'ora e le stesse voci vivono fino al consuntivo, cambia il modo in cui l'impresa vende e controlla i lavori: più preventivi emessi, meno voci regalate, stime sempre più precise.",
  integrationPillars: [
    {
      icon: Database,
      title: "Listino unico con i tuoi prezzi",
      text: "Materiali, lavorazioni e tariffe manodopera in un listino solo, organizzato per categorie. Prezzi tuoi, aggiornabili in blocco, usati da computi, preventivi e consuntivi.",
    },
    {
      icon: Brain,
      title: "AI che compila da foto e testo",
      text: "Foto del sopralluogo o descrizione scritta: l'AI propone le voci compilate con quantità e prezzi dal tuo listino. Tu resti il controllore: ogni riga si verifica e si corregge prima di approvare.",
    },
    {
      icon: Calculator,
      title: "Computo strutturato per categorie",
      text: "Voci raggruppate per categoria di lavorazione, totali e riepiloghi calcolati, quantità e prezzi unitari sempre visibili. Il documento è ordinato e difendibile davanti al cliente.",
    },
    {
      icon: Layers,
      title: "Una catena sola fino al consuntivo",
      text: "Computo, preventivo, commessa, SAL, consuntivo: le stesse voci scorrono lungo tutta la catena senza ricopiature. Ogni passaggio manuale eliminato è un errore che non fai.",
    },
  ],
  resultStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo di costruzione del computo" },
    { value: 2, suffix: "x", label: "preventivi emessi a parità di ore ufficio" },
    { value: 100, suffix: "%", label: "voci riusate da computo a consuntivo" },
  ],
  resultsCta: "Apri la demo Computo Metrico",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto valgono i computi fatti in un'ora invece che in una serata?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: computi preparati al mese e ore per computo oggi. La stima calcola le ore recuperate con il 70% di tempo in meno, valorizzate a 35 €/h di costo tecnico.",
  roi: {
    input1Label: "Computi/preventivi al mese",
    input1Default: 8,
    input1Min: 1,
    input1Max: 60,
    input1Step: 1,
    input2Label: "Ore per computo oggi",
    input2Default: 4,
    input2Min: 1,
    input2Max: 16,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * b * 0.7 * 35),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 12 * b * 0.7)} h` },
      { label: "Ore recuperate/mese", value: `${Math.round(a * b * 0.7)} h` },
      { label: "Computi gestiti/anno", value: `${a * 12}` },
    ],
    closingPitch:
      "Stima prudenziale: 70% di tempo recuperato per computo × 35 €/h di costo tecnico. Non include il valore dei lavori vinti rispondendo prima e delle voci di contorno non più regalate: per la maggior parte delle imprese valgono più del tempo stesso.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Il preventivo veloce non è un lusso. È il modo in cui si vincono i lavori.",
  salesBody:
    "Il Computo Metrico cambia 4 abitudini concrete: come esci dal sopralluogo, come costruisci le voci, come presenti il preventivo, come impari dai lavori chiusi.",
  salesImpact: [
    {
      title: "Dal sopralluogo esci con metà lavoro fatto",
      text: "Foto scattate, due note vocali o due righe scritte: quando torni in ufficio l'AI ha già proposto la bozza delle voci. Il sopralluogo smette di essere solo raccolta: è già inizio del computo.",
    },
    {
      title: "Il listino diventa patrimonio dell'impresa",
      text: "Prezzi, descrizioni e tariffe non stanno più nella testa del titolare o in dieci Excel diversi: stanno nel listino, aggiornati, usabili da chiunque in ufficio prepari computi. L'impresa smette di dipendere dalla memoria di una persona.",
    },
    {
      title: "Il cliente riceve un documento serio, in fretta",
      text: "Computo ordinato per categorie, preventivo con logo e condizioni, consegnato in giorni. La prima impressione dice: impresa organizzata. E l'impresa organizzata si può permettere di non essere la più economica.",
    },
    {
      title: "Le stime migliorano lavoro dopo lavoro",
      text: "Ogni commessa chiusa confronta computo e consuntivo voce per voce. Le voci che sbagli sistematicamente saltano fuori: le correggi nel listino e il computo successivo è già più preciso. Un ciclo che Excel non ti darà mai.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non un foglio di calcolo con un altro nome. Un computo collegato a tutto il gestionale.",
  featureRows: [
    {
      label: "Computo metrico estimativo online",
      value:
        "Voci con descrizione, unità di misura, quantità, prezzo unitario e totale, raggruppate per categorie di lavorazione. Riepiloghi e totali calcolati, documento esportabile e presentabile.",
    },
    {
      label: "Listino prezzi e tariffe manodopera",
      value:
        "Il tuo listino importato in onboarding: materiali, lavorazioni, tariffe orarie. Prezzi aggiornabili in blocco, ricerca veloce per costruire il computo senza scrivere voci da zero.",
    },
    {
      label: "AI da foto e testo",
      value:
        "Carichi foto del sopralluogo o descrivi il lavoro: l'AI propone voci compilate con quantità stimate e prezzi dal tuo listino. Ogni voce resta verificabile e modificabile prima dell'approvazione.",
    },
    {
      label: "Da computo a preventivo con un clic",
      value:
        "Le voci del computo diventano un preventivo presentabile: logo, condizioni, layout professionale. Invio tracciato e accettazione collegata all'apertura della commessa.",
    },
    {
      label: "Da preventivo a consuntivo",
      value:
        "Le voci accettate diventano la baseline della commessa: ogni costo reale si confronta con la voce computata. Scostamenti visibili voce per voce mentre il cantiere è aperto.",
    },
    {
      label: "Varianti e revisioni",
      value:
        "Il computo si revisiona senza perdere lo storico: versioni tracciate, varianti aggiunte come voci nuove. Sai sempre cosa hai quotato, quando e a che prezzo.",
    },
    {
      label: "Archivio computi riusabile",
      value:
        "Ogni computo resta in archivio, cercabile. Il bagno tipo, il cappotto tipo, il rifacimento tetto tipo: i lavori ricorrenti partono da una base già fatta e verificata sul campo.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il Computo Metrico cambia la giornata.",
  scenarios: [
    {
      title: "Sopralluogo alle 17, computo pronto per cena",
      text: "Sopralluogo per un rifacimento bagno: 12 foto e due righe di descrizione caricate dal telefono. In ufficio l'AI ha proposto 18 voci dal listino: demolizioni, impianti, massetto, rivestimenti, smaltimento incluso. Il geometra controlla, corregge tre quantità, approva. Computo e preventivo inviati la sera stessa: il cliente firma due giorni dopo.",
    },
    {
      title: "La voce di smaltimento che non sfugge più",
      text: "Ristrutturazione completa da 85.000 €: l'AI propone anche oneri di discarica e assistenze murarie che nei computi a mano saltavano una volta su due. Sono 3.100 € di costi reali che prima uscivano dal margine a fine cantiere. Adesso stanno nel computo, quindi nel prezzo, quindi pagati dal cliente e non da te.",
    },
    {
      title: "Il consuntivo che corregge il listino",
      text: "A fine anno il confronto computo-consuntivo mostra che le demolizioni chiudono sempre a +15% sulle ore stimate. Il titolare aggiorna la tariffa nel listino una volta sola: tutti i computi successivi partono già corretti. L'errore sistematico che durava da anni sparisce in cinque minuti.",
    },
  ],

  testimonialQuote:
    "I computi li facevo la sera, riciclando l'Excel del lavoro prima. Adesso carico le foto del sopralluogo e mi trovo le voci pronte dal mio listino, con i miei prezzi: io controllo e aggiusto. Ne facciamo il doppio nello stesso tempo, e da quando il computo si confronta col consuntivo ho scoperto due voci che sbagliavo da sempre.",
  testimonialAuthor: "Davide C.",
  testimonialRole: "C. Ristrutturazioni Srl, Torino",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di lasciare l'Excel dei computi.",
  faqs: [
    {
      q: "Come si costruisce un computo metrico in Edilizia in Cloud?",
      a: "Il computo metrico si costruisce scegliendo le voci dal tuo listino: materiali, lavorazioni e tariffe manodopera con i tuoi prezzi. Inserisci le quantità, il sistema calcola totali e riepiloghi per categoria. In alternativa lasci che l'AI proponga la bozza da foto o descrizione e tu controlli riga per riga. Il computo finito diventa preventivo con un clic, senza ricopiare nulla.",
    },
    {
      q: "L'AI compila davvero il computo da foto e testo?",
      a: "Sì. Carichi le foto del sopralluogo o descrivi il lavoro a parole e l'AI di Edilizia in Cloud propone le voci compilate, con quantità stimate e prezzi presi dal tuo listino, non da tariffari generici. Le voci proposte sono una bozza da controllare: verifichi, correggi le quantità e approvi. L'AI toglie il lavoro meccanico, la decisione su misure e prezzi resta tua.",
    },
    {
      q: "Posso usare i miei prezzi invece di un prezzario generico?",
      a: "Sì, ed è il punto centrale: il computo si costruisce sul tuo listino, importato in onboarding con i tuoi materiali, le tue lavorazioni e le tue tariffe manodopera. I prezzi li aggiorni tu, in blocco o voce per voce, e tutti i computi successivi li usano. Puoi partire da un prezzario di riferimento e adattarlo ai tuoi costi reali.",
    },
    {
      q: "Cosa succede al computo quando il cliente accetta il preventivo?",
      a: "Quando il cliente accetta, le voci del computo diventano la baseline economica della commessa con un clic. Da lì in avanti ogni costo reale — ordini, DDT, ore, subappalti — si confronta con la voce computata: vedi gli scostamenti voce per voce mentre il cantiere è aperto, e le stesse voci alimentano SAL e libretto misure. Niente ricopiature tra documenti.",
    },
    {
      q: "Serve saper usare software complicati tipo i CAD di computo?",
      a: "No. Il Computo Metrico di Edilizia in Cloud è pensato per chi in impresa prepara preventivi tutti i giorni, non per studi di progettazione: ricerca voci, quantità, totali, tutto online da browser, anche dal tablet. Il setup lo facciamo insieme in 48 ore e le prime sessioni 1-a-1 servono proprio a farti costruire i primi computi con noi accanto.",
    },
    {
      q: "Il Computo Metrico è incluso nei piani Edilizia in Cloud?",
      a: "Sì. Il Computo Metrico fa parte del flusso preventivi di Edilizia in Cloud, insieme al listino, all'AI da foto e testo e alla trasformazione in preventivo e commessa. Nella prova gratuita di 31 giorni lo usi completo, con import del listino e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il computo è l'inizio della catena. Il margine è la fine.",
  internalLinksBody:
    "Le voci che scrivi nel computo attraversano preventivo, commessa, SAL e consuntivo. Una sola fonte di verità dal sopralluogo all'ultimo euro incassato.",
  internalLinks: [
    { to: "/funzionalita/quote-builder-ai", title: "Preventivi con AI", text: "L'AI compila voci da foto e testo sul tuo listino." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Il computo diventa preventivo presentabile con un clic." },
    { to: "/funzionalita/gestione-commesse", title: "Gestione Commesse", text: "Le voci computate diventano la baseline della commessa." },
    { to: "/funzionalita/contabilita-lavori", title: "Contabilità Lavori", text: "SAL e libretto misure sulle stesse voci del computo." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Computato vs speso, voce per voce, in tempo reale." },
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "Dalle quantità computate agli ordini fornitore." },
    { to: "/funzionalita/magazzino-cantiere", title: "Magazzino Cantiere", text: "Materiali computati e materiali consumati a confronto." },
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Richieste, sopralluoghi e preventivi in un flusso solo." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di fare i computi di sera su Excel. Inizia a farli in un'ora, con i tuoi prezzi e l'AI che lavora per te.",
  finalCtaBody:
    "31 giorni gratuiti per portare il Computo Metrico dentro la tua impresa edile. Import del listino, AI da foto e testo, computo che diventa preventivo e consuntivo, setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Listino con i tuoi prezzi · AI inclusa",

  stickyCtaLabel: "Prova gratis Computo Metrico",
  stickyCtaMicrocopy: "Setup 48h · Computo in 1 ora",

  applicationSubCategory: "Construction Estimating Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function ComputoMetrico() {
  return <FunzionalitaPageTemplate config={config} />;
}
