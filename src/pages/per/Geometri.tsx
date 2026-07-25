import {
  Calculator, FileText, TrendingUp, Smartphone, Wallet, FolderOpen,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, BarChart3, ClipboardList,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Gestionale per Geometra | Computi, SAL e Cantieri in Ordine",
  seoDescription: "Gestionale per geometra con più cantieri: preventivi e computi, SAL tracciati, documenti di commessa e margini reali. Prova gratis 31 giorni.",
  seoKeywords: "gestionale per geometra, software geometra cantieri, computo metrico geometra, SAL geometra, gestione commesse geometra, preventivi geometra, documenti cantiere geometra, software direzione lavori, geometra impresa edile",
  seoCanonical: "/per/geometri",

  // Hero
  badge: "Per Geometri con Impresa o più Cantieri da Seguire",
  heroTitle: (
    <>
      <span className="text-white">Gestionale per geometra: basta sere sui computi e telefonate alle imprese.</span>{" "}
      <span className="text-[#F97415]">Cantieri, SAL e documenti in ordine — dal telefono.</span>
    </>
  ),
  heroSubtitle:
    "Il computo rifatto tre volte, l'impresa che non manda gli avanzamenti, il committente che chiama te. Edilizia in Cloud è il gestionale per il geometra che segue più cantieri: preventivi e computi pronti in minuti, SAL e avanzamenti tracciati, documenti di commessa archiviati e condivisi con le imprese, margini reali visibili mentre i lavori vanno avanti. Tutto in un unico posto, anche dal telefono in cantiere.",
  heroImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "SF", name: "Studio Tecnico Ferrari", city: "Modena", months: 13, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "GC", name: "Geom. Colombo & Partner", city: "Como", months: 8, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "ST", name: "Studio Tecnico Amato", city: "Salerno", months: 16, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "EP", name: "Edil Progetti", city: "Ancona", months: 10, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Sei tu l'unico che sa a che punto è ogni cantiere. E questo ti costa caro.",
  problemsSubtitle:
    "Computi la sera, documenti sparsi tra email e cartelle, SAL ricostruiti a memoria, imprese da rincorrere al telefono. Quando i cantieri diventano cinque o sei, il metodo 'me lo ricordo io' smette di funzionare — e il primo a pagare sei tu.",
  problems: [
    {
      emoji: "📐",
      title: "Preventivi e computi che ti mangiano le serate",
      desc: "Voci ribattute a mano da un Excel all'altro, prezzi da ricontrollare ogni volta, un errore di battitura e il conto cambia di migliaia di euro. Il computo di una ristrutturazione ti porta via una serata intera — e ne hai tre in coda.",
    },
    {
      emoji: "🗂️",
      title: "I documenti di ogni cantiere sono ovunque tranne dove servono",
      desc: "Verbali, foto, contratti con le imprese, comunicazioni: metà in email, metà sul telefono, metà in una cartella sul PC dello studio. Quando l'impresa contesta o il cliente chiede conto, perdi un'ora a ricostruire la storia.",
    },
    {
      emoji: "📊",
      title: "SAL ricostruiti a memoria, contestazioni assicurate",
      desc: "Quanto ha davvero fatto l'impresa questo mese? Se l'avanzamento non è tracciato nero su bianco con date e foto, ogni SAL diventa una trattativa. E quando c'è da liquidare, vince chi ha la memoria migliore — o la voce più grossa.",
    },
    {
      emoji: "📉",
      title: "Il margine della commessa lo scopri quando è finita",
      desc: "Tra varianti, imprevisti e ore tue mai contate, quello che sembrava un lavoro buono si rivela un pareggio. Nessuno ti dice mentre il cantiere è aperto se stai guadagnando o solo lavorando.",
    },
    {
      emoji: "📞",
      title: "Il coordinamento con le imprese vive di telefonate e WhatsApp",
      desc: "L'idraulico non sa che il muratore ha finito, il cliente chiede aggiornamenti, tu fai da centralino. Ogni informazione passa da te — e ogni volta che sei in riunione o in ferie, i cantieri rallentano.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 15.000",
    lossLabel: "tra varianti mai fatturate, SAL contestati e lavori presi sotto margine",
    wasteValue: "€ 11.200",
    wasteLabel: "in serate su computi manuali, documenti da ricostruire e telefonate di coordinamento",
    errorValue: "€ 5.400",
    errorLabel: "in errori di computo, voci dimenticate e contestazioni senza documentazione",
    totalLoss: "€ 31.600",
    softwareCost: "€ 2.388",
    roiX: "13x",
  },

  // Transformation
  transformation: {
    title: "Com'è seguire sei cantieri prima e dopo Edilizia in Cloud",
    subtitle:
      "La differenza non è lavorare di più o di meno. È smettere di fare da archivio e da centralino, e tornare a fare il tecnico — con i numeri in mano.",
    fromTitle: "Prima: tutto nella tua testa",
    fromItems: [
      "Computi e preventivi ribattuti a mano su Excel, una serata a lavoro",
      "Documenti di cantiere sparsi tra email, telefono e cartelle dello studio",
      "SAL ricostruiti a memoria: ogni liquidazione è una trattativa con l'impresa",
      "Margine della commessa scoperto a lavori chiusi, quando non puoi più correggere",
      "Coordinamento imprese via telefonate: sei tu il collo di bottiglia",
      "Foto dei lavori sul telefono personale, mai collegate al cantiere giusto",
    ],
    toTitle: "Dopo: ogni cantiere ha il suo posto",
    toItems: [
      "Preventivi e computi dal listino: voci, quantità e prezzi in pochi minuti, PDF pronto da firmare",
      "Ogni commessa ha il suo archivio: verbali, contratti, foto e comunicazioni in un posto solo",
      "Avanzamento tracciato con rapportini fotografici datati: il SAL si difende da solo",
      "Margine reale per commessa aggiornato mentre il cantiere avanza — varianti comprese",
      "Le imprese e le squadre vedono il loro pezzo sull'app: meno telefonate, meno fermi",
      "Foto e note dal cantiere caricate dall'app, già archiviate sulla commessa giusta",
    ],
  },

  // Stats
  stats: [
    {
      value: "6+",
      label: "Cantieri seguiti in parallelo",
      sublabel: "Senza perdere il filo di documenti, SAL e avanzamenti",
    },
    {
      value: "−70%",
      label: "Tempo sui computi",
      sublabel: "Voci e prezzi dal listino, niente più serate su Excel",
    },
    {
      value: "0",
      label: "SAL contestati senza documenti",
      sublabel: "Avanzamento fotografato, datato e archiviato per commessa",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti che servono a un geometra, non a un ragioniere",
  modulesSubtitle:
    "Preventivi, commesse, SAL, documenti e squadre: i moduli sono costruiti attorno al modo in cui lavori davvero — tra studio e cantiere.",
  modules: [
    {
      icon: Calculator,
      name: "Preventivi e Computi",
      desc: "Costruisci il preventivo dalle voci del tuo listino: quantità, prezzi, ricarichi. Le varianti si aggiungono alla commessa senza rifare tutto. Il PDF esce impaginato, pronto da mandare al cliente o all'impresa.",
      saving: "Da una serata a 20 minuti",
    },
    {
      icon: TrendingUp,
      name: "Commesse con Margini Reali",
      desc: "Ogni cantiere ha il suo conto economico: preventivato, costi delle imprese, varianti, extra. Il margine si aggiorna mentre i lavori avanzano — così vedi subito quale commessa rende e quale ti sta solo tenendo occupato.",
      saving: "Margine visibile a cantiere aperto",
    },
    {
      icon: ClipboardList,
      name: "SAL e Avanzamento Lavori",
      desc: "Registri gli stati di avanzamento con date, importi e foto collegate. Quando arriva il momento di liquidare l'impresa o fatturare al cliente, l'avanzamento è documentato — non ricostruito a memoria.",
      saving: "SAL che si difendono da soli",
    },
    {
      icon: FolderOpen,
      name: "Documenti di Commessa",
      desc: "Contratti, verbali, comunicazioni, pratiche e foto: tutto archiviato sulla commessa giusta, con date. Quando il cliente o l'impresa contesta, apri la commessa e hai la storia completa in 5 secondi.",
      saving: "Zero ore a cercare documenti",
    },
    {
      icon: Camera,
      name: "Rapportini con Foto dal Cantiere",
      desc: "Le squadre e le imprese caricano foto e note dei lavori direttamente dall'app. Ogni rapportino finisce sulla commessa giusta, datato. Il diario dei lavori si scrive da solo, giorno per giorno.",
      saving: "Diario lavori sempre aggiornato",
    },
    {
      icon: Smartphone,
      name: "App Mobile per Sopralluoghi e Cantieri",
      desc: "In cantiere apri la commessa dal telefono: vedi computo, avanzamento, documenti e foto. Annoti misure e note del sopralluogo sul posto, senza ricopiare nulla tornato in studio.",
      saving: "Lo studio in tasca",
    },
  ],

  // AI showcase
  aiShowcase: {
    title: "L'AI che lavora per te, anche quando sei in cantiere",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati dei tuoi cantieri e agiscono. Per un geometra che segue più commesse significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando una commessa sta scivolando",
        desc: "Costi delle imprese oltre il preventivato, varianti non ancora fatturate, extra che si accumulano: se il margine scende sotto la soglia che hai fissato, Silvio ti avvisa mentre il cantiere è ancora aperto.",
      },
      {
        icon: Camera,
        tag: "Cantiere",
        title: "Trasforma foto e vocali in rapportini",
        desc: "Dal sopralluogo carichi le foto e una nota vocale: Silvio genera il rapportino, aggiorna il diario lavori e collega tutto alla commessa giusta. Tornato in studio, il lavoro di segreteria è già fatto.",
      },
      {
        icon: Send,
        tag: "Incassi",
        title: "Prepara i solleciti per SAL e parcelle",
        desc: "SAL maturato e non ancora incassato? Parcella ferma da 60 giorni? Silvio prepara il sollecito con il tono giusto — email o WhatsApp — e te lo mette in firma. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Sparkles,
        tag: "Preventivi",
        title: "Rinforza preventivi e follow-up",
        desc: "Riscrive la proposta mettendo in chiaro cosa è compreso e cosa no, e prepara il follow-up per i preventivi rimasti fermi — così non perdi lavori solo perché non hai avuto tempo di richiamare.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali dei tuoi cantieri — commesse, computi, SAL, documenti, incassi.",
  },

  // Platform extra
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a chi gestisce cantieri, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, acconti e SAL collegati alle commesse, bozze pronte da approvare.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi dai clienti, pagamenti alle imprese: la cassa prevista a 30, 60 e 90 giorni.",
      },
      {
        icon: Users,
        name: "CRM e pipeline",
        desc: "Richieste, sopralluoghi e trattative in un'unica pipeline: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Materiali e DDT di entrata e uscita collegati alle commesse, quando gestisci anche le forniture.",
      },
      {
        icon: FileText,
        name: "Timbrature GPS",
        desc: "Se hai squadre tue, le presenze in cantiere si registrano dal telefono con posizione e orario.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per commessa, previsioni: i numeri di tutti i cantieri in una schermata.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Studio Tecnico Ferrari",
    city: "Modena",
    sector: "Direzione lavori e gestione cantieri",
    revenue: "340.000 €",
    person: "Luca Ferrari",
    role: "Geometra titolare",
    initials: "LF",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Seguivo otto cantieri con la memoria e una cartella per ognuno sul PC. Ogni SAL era una discussione con l'impresa, ogni variante un appunto perso. Adesso apro la commessa e vedo tutto: avanzamento con le foto, documenti, quanto ho fatturato e quanto manca. Le contestazioni sono finite perché la storia del cantiere è scritta, datata e fotografata. E i computi che facevo la sera ora li chiudo in studio in mezz'ora.",
    metrics: [
      { label: "Cantieri seguiti in parallelo", before: "5, con fatica", after: "9" },
      { label: "Tempo per un computo", before: "una serata", after: "30 minuti" },
      { label: "SAL contestati dalle imprese", before: "1 su 3", after: "quasi zero" },
      { label: "Varianti fatturate", before: "quelle ricordate", after: "tutte" },
    ],
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
  },

  // FAQ
  faq: [
    {
      q: "Sono un geometra che segue cantieri di imprese diverse: posso tenerli separati?",
      a: "Sì. Ogni cantiere è una commessa a sé, con il suo cliente, i suoi documenti, il suo computo, i suoi SAL e i suoi numeri. Passi da un cantiere all'altro senza mischiare nulla, e ogni impresa o cliente vede solo quello che riguarda il suo lavoro. Che tu ne segua tre o quindici, la struttura è la stessa.",
    },
    {
      q: "Come funziona la gestione dei SAL per un geometra?",
      a: "Registri ogni stato di avanzamento sulla commessa: data, importo maturato, lavorazioni completate e foto collegate. Quando devi liquidare l'impresa o fatturare al cliente, l'avanzamento è già documentato nero su bianco. Se qualcuno contesta, apri la commessa e mostri foto datate e rapportini — non ricordi, prove.",
    },
    {
      q: "Posso fare preventivi e computi con il mio listino prezzi?",
      a: "Sì. Carichi le tue voci con prezzi e ricarichi, e costruisci il preventivo selezionando voci e quantità. Le varianti in corso d'opera si aggiungono alla commessa senza rifare il documento da capo, e restano tracciate — così a fine lavori le fatturi tutte, non solo quelle che ricordi.",
    },
    {
      q: "Le imprese e le squadre in cantiere possono caricare foto e rapportini?",
      a: "Sì. Dall'app mobile chi lavora in cantiere carica foto, note e rapportini di giornata che finiscono direttamente sulla commessa giusta, con data e autore. Tu vedi l'avanzamento reale senza andare in cantiere ogni giorno, e il diario lavori si costruisce da solo.",
    },
    {
      q: "Vedo quanto sto guadagnando davvero su ogni cantiere?",
      a: "Sì. Ogni commessa ha il suo conto economico: preventivato al cliente, costi delle imprese e dei materiali, varianti, extra. Il margine si aggiorna mentre il cantiere avanza, non a consuntivo. Così scopri subito se una commessa sta scivolando — quando puoi ancora intervenire, non sei mesi dopo.",
    },
    {
      q: "Funziona anche dal telefono, in cantiere?",
      a: "Sì. Dall'app mobile apri la commessa e trovi computo, documenti, foto e avanzamento. Durante il sopralluogo annoti misure e osservazioni direttamente sul posto: niente foglietti da ricopiare tornato in studio. Le foto scattate finiscono già archiviate sulla commessa giusta.",
    },
  ],

  verticalFeatures: [
    {
      icon: Calculator,
      problem: "Computi e preventivi ribattuti a mano: una serata a documento, errori compresi",
      solution: "Il preventivo si costruisce dalle voci del tuo listino: quantità, prezzi, ricarichi. Le varianti si aggiungono alla commessa e restano tracciate. Il PDF esce impaginato e firmabile — in minuti, non in serate.",
      economicBenefit: "−70%",
      benefitLabel: "tempo su preventivi e computi",
    },
    {
      icon: ClipboardList,
      problem: "SAL ricostruiti a memoria: ogni liquidazione è una trattativa con l'impresa",
      solution: "Ogni stato di avanzamento è registrato con data, importo e foto collegate. Quando c'è da liquidare o fatturare, la documentazione c'è già. Le contestazioni si chiudono aprendo la commessa, non alzando la voce.",
      economicBenefit: "0",
      benefitLabel: "SAL contestati senza documentazione",
    },
    {
      icon: FolderOpen,
      problem: "Documenti sparsi tra email, telefono e cartelle: ricostruire una storia costa ore",
      solution: "Ogni commessa ha il suo archivio: contratti, verbali, comunicazioni, pratiche, foto — tutto datato e nello stesso posto. Cliente o impresa che contesta? La storia completa del cantiere è a 5 secondi di distanza.",
      economicBenefit: "5 sec",
      benefitLabel: "per trovare qualsiasi documento di cantiere",
    },
    {
      icon: TrendingUp,
      problem: "Il margine della commessa si scopre a lavori finiti, quando non puoi più correggere",
      solution: "Il conto economico della commessa si aggiorna mentre il cantiere avanza: preventivato, costi imprese, varianti, extra. Se il margine scende sotto la tua soglia, ricevi l'avviso a cantiere aperto — quando intervenire serve ancora.",
      economicBenefit: "+9%",
      benefitLabel: "margine medio recuperato sulle commesse monitorate",
    },
    {
      icon: Camera,
      problem: "Foto dei lavori sul telefono personale, mai collegate al cantiere giusto",
      solution: "Le foto scattate dall'app finiscono già archiviate sulla commessa, con data e autore. I rapportini di giornata delle squadre costruiscono il diario lavori da soli. A fine cantiere hai la storia fotografica completa, senza averla mai ordinata a mano.",
      economicBenefit: "100%",
      benefitLabel: "delle foto archiviate sulla commessa giusta",
    },
  ],
  verticalFeaturesTitle: "Più cantieri seguiti, meno serate perse, zero contestazioni scoperte",
  verticalFeaturesSubtitle: "Computi veloci, SAL documentati, archivio per commessa, margini in tempo reale e foto che si ordinano da sole. Tutto collegato. Tutto tracciato.",
  demoLabel: "Vedi come un geometra segue 9 cantieri da un'unica schermata — computi, SAL, documenti e margini",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Ogni cantiere documentato. Ogni margine visibile.</span>{" "}
      <span className="text-[#F97415]">E le serate tornano tue.</span>
    </>
  ),
  ctaSubtitle:
    "Prova Edilizia in Cloud gratis per 31 giorni, oppure prenota 30 minuti di demo: ti mostriamo come impostare i tuoi cantieri reali — computi, SAL e documenti — e quanto tempo recuperi già la prima settimana.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior gestionale per un geometra che segue più cantieri?",
      a: "Edilizia in Cloud è il gestionale per geometri che gestiscono più cantieri: preventivi e computi dal listino, SAL documentati con foto, archivio documenti per commessa, margini in tempo reale e app mobile per i sopralluoghi.",
    },
    {
      q: "Come gestisce i SAL un gestionale per geometra?",
      a: "Ogni stato di avanzamento viene registrato sulla commessa con data, importo e foto collegate. La liquidazione delle imprese e la fatturazione al cliente si basano su avanzamenti documentati, non ricostruiti a memoria.",
    },
    {
      q: "Un geometra può vedere il margine reale di ogni commessa?",
      a: "Sì. Ogni commessa ha il suo conto economico con preventivato, costi delle imprese, varianti ed extra. Il margine si aggiorna mentre il cantiere avanza, con avvisi se scende sotto la soglia impostata.",
    },
  ],
};

export default function Geometri() {
  return <PerTipoPageTemplate config={config} />;
}
