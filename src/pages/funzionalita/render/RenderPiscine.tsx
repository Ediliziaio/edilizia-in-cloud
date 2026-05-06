import {
  BadgeCheck,
  Camera,
  Clock,
  FileText,
  Layers,
  LineChart,
  MessageCircle,
  Mountain,
  Palmtree,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Users,
  Waves,
  XCircle,
  Zap,
} from "lucide-react";
import RenderPageTemplate from "./RenderPageTemplate";
import type { RenderPageConfig } from "./types";

const config: RenderPageConfig = {
  slug: "render-piscine",
  vertical: "Piscine",
  productName: "Render Piscine AI",
  audience: "Piscinisti, costruttori piscine, installatori outdoor, rivenditori piscine",
  audienceShort: "piscinisti e installatori outdoor",

  seo: {
    title: "Render Piscine AI per Piscinisti e Costruttori",
    description:
      "Render Piscine AI: trasforma la foto del giardino del cliente in un prima/dopo realistico con nuova piscina, bordo, pavimentazione, pergola, illuminazione…",
    keywords:
      "render piscina, render piscine AI, software piscinisti, configuratore piscina online, render bordo piscina, render giardino, render pergola, render outdoor, prima dopo piscina, software costruttori piscine, gestionale piscinisti, AI piscine",
    ogImage: "https://www.ediliziaincloud.com/og/render-piscine-og.jpg",
  },

  heroBadge: "Render AI per piscinisti e installatori outdoor · Beta",
  heroH1:
    "Render Piscine AI: fai vedere al cliente come sarà il suo nuovo giardino con la piscina, prima del prezzo.",
  heroSubheadline:
    "Render Piscine AI trasforma la foto reale del giardino del cliente in un prima/dopo credibile: nuova piscina, bordo, pavimentazione esterna, pergola, illuminazione e verde applicati allo stesso spazio. Il preventivo non è più una cifra alta e astratta, ma una proposta che il cliente riesce finalmente a immaginare.",
  heroPrimaryCta: "Prova GRATIS Render Piscine",

  reassurancePoints: ["Setup in 60 secondi", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per piscinisti, costruttori e installatori outdoor",
    "Prima/dopo sulla foto reale del giardino",
    "PDF e WhatsApp pronti per il follow-up",
  ],

  objectiveRow: [
    ["Obiettivo", "Far dire al cliente: adesso lo vedo nel mio giardino"],
    ["Momento chiave", "Sopralluogo, showroom e follow-up del preventivo piscina"],
    ["Risultato", "Meno indecisione sull'investimento, più contratti firmati"],
  ],

  betaH2: "Stiamo aprendo l'accesso ai primi 100 piscinisti italiani.",
  betaBody:
    "Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto. Quando i 100 posti saranno chiusi, il prezzo sale.",

  speedH2: "In 60 secondi trasformi una foto del giardino in un argomento di vendita.",
  speedSubheadline:
    "Non aspetti il rendering 3D di uno studio. Carichi la foto, scegli forma piscina, bordo, pavimentazione e verde e ottieni un prima/dopo da usare subito al sopralluogo o nel follow-up.",
  speedStats: [
    { value: 60, suffix: " sec", label: "per ottenere un render piscina da usare in trattativa" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
    { value: 3, prefix: "x", suffix: "", label: "preventivi piscina ricordati in più rispetto al solo PDF" },
  ],

  videoH2: "Vedi in 60 secondi come trasformi una foto del giardino in una vendita.",
  videoSubheadline:
    "Carichi la foto del giardino del cliente, scegli piscina, bordo, pavimentazione, pergola e verde, generi il prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.",

  familyH2: "Non solo piscine. Un render AI per ogni elemento outdoor che vendi al cliente.",
  familySubheadline:
    "Lo stesso meccanismo del Render Piscine, esteso a tutto l'outdoor: dal bordo piscina al solarium, dalle pergole al verde di progetto.",
  familyItems: [
    {
      icon: Waves,
      title: "Render Piscine",
      text: "Piscine a sfioro, interrate, fuori terra, rettangolari o sagomate inserite nel giardino reale del cliente.",
      available: true,
    },
    {
      icon: Layers,
      title: "Render Bordo Piscina",
      text: "Bordi sfioranti, scaletta, gradoni e finiture in pietra o gres applicati al perimetro reale.",
      available: true,
    },
    {
      icon: Mountain,
      title: "Render Pergole & Coperture",
      text: "Pergole bioclimatiche, tende, coperture mobili e gazebo: vedi l'effetto sul giardino del cliente.",
      available: true,
    },
    {
      icon: Palmtree,
      title: "Render Verde di Progetto",
      text: "Prato, alberi, siepi, palme e cespugli per costruire l'ambientazione attorno alla piscina.",
      available: true,
    },
    {
      icon: Sun,
      title: "Render Solarium & Illuminazione",
      text: "Pavimentazione solarium, lettini, illuminazione subacquea e perimetrale contestualizzati nel giardino reale.",
      available: true,
    },
  ],
  familyBonusTitle: "Tutta la suite Render AI",
  familyBonusText:
    "Accedi a tutti i moduli con un unico abbonamento. Piscine, ristrutturazioni, pavimenti e bagni inclusi senza costi extra.",

  painKicker: "Il problema vero",
  painH2: "Il cliente non sta scegliendo solo una piscina. Sta decidendo se fidarsi di te.",
  painSubheadline:
    "Il piscinista bravo spiega bene. Quello che chiude meglio fa vedere. Quando il cliente riconosce il proprio giardino con la piscina, smette di confrontare solo prezzo e marca della struttura.",
  painPoints: [
    {
      icon: Clock,
      title: "Il cliente non compra la piscina: compra un sogno",
      text: "Tu parli di skimmer, sfioro, filtri, scavo e finiture. Lui pensa: \"come sarà davvero il mio giardino con la piscina?\". Se non riesce a vederlo, rimanda.",
    },
    {
      icon: XCircle,
      title: "Se il valore non si vede, vince lo sconto",
      text: "Quando due preventivi piscina sembrano simili, il cliente sceglie quello che costa meno. Anche se la tua qualità di posa, le marche e la garanzia valgono molto di più.",
    },
    {
      icon: MessageCircle,
      title: "Il cliente al sopralluogo è caldo per poco",
      text: "Tra preventivi diversi, parenti che consigliano e dubbi sull'investimento, il cliente perde il filo. Devi rimanere nella sua testa con un'immagine concreta del SUO giardino.",
    },
  ],

  baKicker: "Prima e dopo, dove conta davvero",
  baH2: "Mostri le aree che fanno decidere il cliente sulla piscina.",
  baSubheadline:
    "Il render deve aiutare il cliente a capire cosa cambia nel suo giardino: posizione e forma della piscina, bordo, solarium, verde e illuminazione che normalmente restano voci tecniche di preventivo.",
  baAreas: [
    {
      title: "Posizione e forma piscina",
      before: "Il cliente vede un giardino vuoto o con prato non sfruttato e fatica a immaginare dimensioni e ingombri reali.",
      after: "Vede una piscina della giusta forma e dimensione inserita nello spazio reale, con la corretta percezione di proporzioni e luce.",
    },
    {
      title: "Bordo e pavimentazione solarium",
      before: "Il bordo piscina e l'area circostante sono solo numeri e codici materiale: pietra, gres, legno composito.",
      after: "Vede pavimentazione coordinata, bordo sfiorante e zona lettini nel SUO giardino, non in una foto di catalogo.",
    },
    {
      title: "Pergola, copertura e zona relax",
      before: "Pergole, gazebo e coperture sono solo voci di preventivo: il cliente non sa se davvero saranno gradevoli alla vista.",
      after: "La pergola bioclimatica, i tendaggi e la zona pranzo all'aperto vengono mostrati nello spazio reale con luce coerente.",
    },
    {
      title: "Verde e illuminazione perimetrale",
      before: "Prato spelato, siepi disordinate e nessuna illuminazione: il giardino sembra incompiuto attorno alla piscina.",
      after: "Vede verde curato, alberi di altezza giusta, palme o cespugli ornamentali e luci d'ambiente che valorizzano l'investimento.",
    },
  ],

  mechanismKicker: "Il meccanismo",
  mechanismH2: "Una dimostrazione visiva che entra nella scelta della piscina al momento giusto.",
  mechanismSubheadline:
    "Non vendi \"intelligenza artificiale\". Vendi sicurezza: questo è il suo giardino con la piscina, il bordo e il verde che gli stai proponendo.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Scatti o carichi la foto del giardino reale",
      text: "Vista d'insieme, lato casa, prospettiva sul prato: parti dal giardino del cliente, non da una render di catalogo.",
    },
    {
      icon: Sparkles,
      title: "Scegli piscina, bordo, pavimentazione e verde",
      text: "Imposti forma piscina, bordo, finiture, pergola, illuminazione e verde. Le scelte tecniche diventano una proposta visibile.",
    },
    {
      icon: FileText,
      title: "Mostri un prima/dopo che fa decidere",
      text: "Consegni un PDF prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
    },
  ],
  mechanismCta: "Provalo gratis sulla foto del giardino del tuo cliente",

  commercialKicker: "Perché funziona commercialmente",
  commercialH2: "Se il cliente non vede la piscina nel suo giardino, ti chiederà lo sconto.",
  commercialBody:
    "La maggior parte dei concorrenti consegna preventivi pieni di codici materiale e schede tecniche. Tu puoi consegnare una prova visiva: stesso giardino, nuova piscina, impatto immediato.",
  commercialLevers: [
    {
      icon: Target,
      title: "Rendi visibile il valore",
      text: "Il cliente non valuta solo il costo dello scavo. Valuta l'effetto finale sul suo giardino, sulla luce, sul tempo libero e sulla qualità di vita.",
    },
    {
      icon: ShieldCheck,
      title: "Riduci il rischio percepito",
      text: "Forma, dimensioni, bordo, verde e illuminazione non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare un investimento importante.",
    },
    {
      icon: Zap,
      title: "Acceleri il follow-up",
      text: "Non richiami dicendo solo \"ha visto il preventivo piscina?\". Richiami partendo da un'immagine chiara e memorabile del SUO giardino.",
    },
    {
      icon: BadgeCheck,
      title: "Ti posizioni sopra il concorrente",
      text: "Non sembri il piscinista che manda un prezzo. Sembri il consulente outdoor che guida il cliente in una scelta più sicura.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il render della piscina è solo l'inizio. Il vero salto è quando entra nel tuo CRM.",
  resultsBody:
    "Edilizia in Cloud collega il render al contatto, all'opportunità, al preventivo e alla fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto in un'unica timeline e chiudi il cerchio sulla trattativa.",
  integrationPillars: [
    {
      icon: Users,
      title: "CRM piscinisti integrato",
      text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
    },
    {
      icon: Send,
      title: "Follow-up automatici WhatsApp & email",
      text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo piscina. Smetti di dimenticarti i clienti tiepidi.",
    },
    {
      icon: LineChart,
      title: "Dashboard margini e cantieri piscina",
      text: "Vedi quanti preventivi hai inviato, quanti chiusi, quale margine reale stai facendo per cantiere piscina e quanto rende ogni canale di acquisizione.",
    },
    {
      icon: FileText,
      title: "Preventivi e fatturazione SDI",
      text: "Dal render al preventivo PDF, dall'ordine alla fattura elettronica: una sola piattaforma, zero duplicazioni e zero copia-incolla.",
    },
  ],
  resultStats: [
    { value: 38, suffix: "%", label: "in più di preventivi piscina visualizzati dal cliente" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
    { value: 7, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo piscina" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato piscine in più puoi fare con un prima/dopo in trattativa?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: preventivi al mese, ticket medio piscina e close rate. La stima parte da +12 punti di chiusura.",
  roiPreventiviLabel: "Preventivi piscina al mese",
  roiTicketLabel: "Ticket medio per piscina",

  salesKicker: "Più piscine vendute, meno preventivi dimenticati",
  salesH2: "Il render piscina non serve a fare scena. Serve a far avanzare la decisione su un investimento importante.",
  salesBody:
    "Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo. Il prima/dopo del giardino con la piscina crea quella ragione: visuale, semplice, immediata.",
  salesImpact: [
    {
      title: "Preventivi piscina meno freddi",
      text: "Il follow-up non parte da una cifra alta, ma da un'immagine: \"Le mando come cambierebbe il suo giardino con la piscina\".",
    },
    {
      title: "Meno confronto al ribasso",
      text: "Quando il cliente vede il risultato, è più facile parlare di qualità struttura, posa, garanzia, manutenzione e differenza reale.",
    },
    {
      title: "Più decisione al sopralluogo",
      text: "Forma, dimensioni e finiture diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione del cliente.",
    },
    {
      title: "Più autorevolezza commerciale",
      text: "Il cliente percepisce un metodo: rilievo, configurazione, render, PDF, preventivo e follow-up ordinato.",
    },
  ],

  featureKicker: "Cosa consegni",
  featureH2: "Non una bella immagine. Uno strumento commerciale per vendere meglio le piscine.",
  featureRows: [
    {
      label: "Prima/dopo sulla foto reale del giardino",
      value: "Il cliente vede il proprio giardino, le proprie misure, la propria luce e il contesto reale dell'intervento.",
    },
    {
      label: "Scelte tecniche tracciate",
      value: "Piscina, bordo, pavimentazione, pergola, verde e illuminazione restano leggibili e collegati al render.",
    },
    {
      label: "PDF prima/dopo professionale",
      value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
    },
    {
      label: "CRM collegato",
      value: "Ogni render piscina può restare associato a contatto e opportunità, così non perdi la storia commerciale della trattativa.",
    },
    {
      label: "Gallery filtrabile",
      value: "Recuperi i render piscina per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
    },
  ],

  scenarioKicker: "Uso sul campo",
  scenarioH2: "Tre momenti in cui il render piscina può spostare davvero la trattativa.",
  scenarios: [
    {
      title: "Sopralluogo nel giardino del cliente",
      text: "Scatti la foto del giardino, raccogli preferenze e obiezioni, poi trasformi il preventivo in una proposta visiva che resta impressa.",
    },
    {
      title: "Preventivo piscina fermo da qualche giorno",
      text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe il suo giardino\".",
    },
    {
      title: "Showroom e scelta forma/finiture",
      text: "Fai confrontare due alternative senza lasciarle astratte: piscina rettangolare o sagomata, bordo in pietra o gres, pergola lineare o ad angolo.",
    },
  ],

  faqKicker: "Obiezioni frequenti",
  faqH2: "Le domande che un piscinista serio si fa prima di usarlo.",
  faqs: [
    {
      q: "Non rischio di promettere una piscina identica al render?",
      a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, proporzioni e impatto visivo nel giardino, con disclaimer chiaro nel PDF.",
    },
    {
      q: "Serve anche se vendo piscine di fascia alta?",
      a: "Sì, soprattutto lì. Più il prezzo della piscina sale, più il cliente vuole sentirsi sicuro. Il render aiuta a giustificare valore, scelta estetica e differenza rispetto al preventivo più economico.",
    },
    {
      q: "Funziona anche per progetti outdoor completi?",
      a: "Sì. Il modulo è pensato per il mondo piscine e outdoor: piscina, bordo, pavimentazione esterna, pergole, illuminazione, verde e accessori visibili.",
    },
    {
      q: "Non bastano cataloghi, schede tecniche e foto di altri cantieri?",
      a: "Cataloghi e foto di altri cantieri parlano del prodotto. Il render parla del giardino del cliente. È una differenza enorme: il cliente non deve immaginare, deve riconoscere il risultato.",
    },
    {
      q: "Quanto costa? È vincolante?",
      a: "Il modulo Render Piscine è incluso nel piano per piscinisti e installatori outdoor e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
    },
  ],

  internalLinksKicker: "Approfondisci",
  internalLinksH2: "Esplora come Edilizia in Cloud aiuta i piscinisti a vendere meglio.",
  internalLinksBody:
    "Render Piscine AI è un modulo della piattaforma Edilizia in Cloud, il software gestionale per piscinisti, costruttori piscine e installatori outdoor italiani. Scopri tutti i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita",
      title: "Tutte le Funzionalità",
      text: "Cantieri, preventivi, margini, HR, fatturazione SDI e marketing in una sola piattaforma.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni",
      text: "Render AI per ristrutturazioni complete, anche con piscina e outdoor.",
    },
    {
      to: "/funzionalita/render-pavimenti",
      title: "Render Pavimenti",
      text: "Mostra al cliente come cambia la pavimentazione del solarium o dell'esterno, sulla foto reale.",
    },
    {
      to: "/funzionalita/render-tetti",
      title: "Render Tetti",
      text: "Render AI per imprese di copertura: lattonerie, fotovoltaico e rifacimenti tetto sulla casa reale.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Crea preventivi piscina professionali e li alleghi al render prima/dopo.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dal render piscina all'ordine, dalla conferma alla fattura elettronica senza copia-incolla.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti per imprese, piscinisti e installatori outdoor. Beta dedicata con prezzo bloccato.",
    },
    {
      to: "/demo",
      title: "Prova GRATIS la Demo",
      text: "Carica una foto del giardino e genera il tuo primo render piscina in 60 secondi.",
    },
    {
      to: "/blog",
      title: "Blog · Vendita piscine",
      text: "Consigli pratici su trattativa, follow-up, prezzi e strategie di vendita per piscinisti.",
    },
  ],

  finalCtaH2: "Se il concorrente manda solo un preventivo piscina, tu manda una visione.",
  finalCtaBody:
    "Il cliente deve pensare: \"Questo è il mio giardino con la nuova piscina\". Quando succede, l'investimento diventa più concreto, più memorabile e più difficile da confrontare solo sul prezzo.",
  finalCtaButton: "Prova GRATIS Render Piscine",
  finalCtaMicrocopy: "Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova GRATIS Render Piscine",
  stickyCtaMicrocopy: "Onboarding incluso · Cancelli quando vuoi",

  applicationSubCategory: "Sales Enablement Piscine",
};

export default function RenderPiscine() {
  return <RenderPageTemplate config={config} />;
}
