import {
  Armchair,
  BadgeCheck,
  Bed,
  Camera,
  ChefHat,
  Clock,
  FileText,
  Lamp,
  LineChart,
  MessageCircle,
  Send,
  ShieldCheck,
  Sofa,
  Sparkles,
  Target,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import RenderPageTemplate from "./RenderPageTemplate";
import type { RenderPageConfig } from "./types";

const config: RenderPageConfig = {
  slug: "render-stanza",
  vertical: "Stanza",
  productName: "Render Stanza AI",
  audience: "Arredatori, mobilieri, interior designer, showroom arredo",
  audienceShort: "arredatori e showroom",

  seo: {
    title: "Render Stanza AI per Arredatori e Showroom",
    description:
      "Render Stanza AI: dalla foto di soggiorno, cucina, camera o ufficio del cliente a un prima/dopo realistico con nuovi mobili, luci, tessuti e finiture.",
    keywords:
      "render stanza, render arredo, render cucina, render soggiorno, render camera da letto, software arredatori, configuratore arredo online, AI arredo, render mobili, prima dopo arredo, software showroom mobili, gestionale interior designer",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Render AI per arredatori e showroom · Beta",
  heroH1:
    "Render Stanza AI: fai vedere al cliente come sarà la sua nuova stanza, prima del prezzo.",
  heroSubheadline:
    "Render Stanza AI trasforma la foto reale del soggiorno, della cucina o della camera del cliente in un prima/dopo credibile: nuovi mobili, divani, illuminazione, tessuti e finiture applicati allo stesso ambiente. Il preventivo arredo non è più una lista di codici, ma una proposta che il cliente riesce finalmente a immaginare.",
  heroPrimaryCta: "Prova GRATIS Render Stanza",

  reassurancePoints: ["Setup in 60 secondi", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per arredatori, mobilieri e interior designer",
    "Prima/dopo sulla foto reale della stanza",
    "PDF e WhatsApp pronti per il follow-up",
  ],

  objectiveRow: [
    ["Obiettivo", "Far dire al cliente: adesso lo vedo a casa mia"],
    ["Momento chiave", "Sopralluogo, showroom e follow-up del progetto arredo"],
    ["Risultato", "Meno indecisione sui mobili, più ordini chiusi"],
  ],

  betaH2: "Stiamo aprendo l'accesso ai primi 100 arredatori italiani.",
  betaBody:
    "Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto. Quando i 100 posti saranno chiusi, il prezzo sale.",

  speedH2: "In 60 secondi trasformi una foto della stanza in un argomento di vendita.",
  speedSubheadline:
    "Non aspetti il render 3D di uno studio. Carichi la foto, scegli mobili, divano, tavolo, illuminazione e tessuti e ottieni un prima/dopo da usare subito in showroom o nel follow-up.",
  speedStats: [
    { value: 60, suffix: " sec", label: "per ottenere un render stanza da usare in trattativa" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
    { value: 3, prefix: "x", suffix: "", label: "preventivi arredo ricordati in più rispetto al solo PDF" },
  ],

  videoH2: "Vedi in 60 secondi come trasformi una foto della stanza in una vendita.",
  videoSubheadline:
    "Carichi la foto della stanza del cliente, scegli mobili, divani, illuminazione e finiture, generi il prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.",

  familyH2: "Non solo soggiorno. Un render AI per ogni stanza che arredi al cliente.",
  familySubheadline:
    "Lo stesso meccanismo del Render Stanza, esteso a tutte le stanze della casa: dalla zona giorno alla zona notte, dalla cucina all'ufficio.",
  familyItems: [
    {
      icon: Sofa,
      title: "Render Soggiorno",
      text: "Divani, poltrone, librerie, tappeti e mobili TV applicati al soggiorno reale del cliente.",
      available: true,
    },
    {
      icon: Bed,
      title: "Render Camera",
      text: "Letti, armadi, comodini, tessili e illuminazione inseriti nella camera vera del cliente.",
      available: true,
    },
    {
      icon: ChefHat,
      title: "Render Cucina",
      text: "Cucine componibili, isole, top, ante e pensili: confronti modelli direttamente nella cucina del cliente.",
      available: true,
    },
    {
      icon: Lamp,
      title: "Render Illuminazione",
      text: "Lampade a sospensione, applique, faretti e tende: vedi come cambia la luce della stanza reale.",
      available: true,
    },
    {
      icon: Armchair,
      title: "Render Ufficio & Studio",
      text: "Scrivanie, sedute, librerie e arredi smart working contestualizzati nello spazio reale.",
      available: true,
    },
  ],
  familyBonusTitle: "Tutta la suite Render AI",
  familyBonusText:
    "Accedi a tutti i moduli con un unico abbonamento. Stanza, bagno, pavimenti e ristrutturazioni inclusi senza costi extra.",

  painKicker: "Il problema vero",
  painH2: "Il cliente non sta scegliendo solo un divano. Sta decidendo se fidarsi di te.",
  painSubheadline:
    "L'arredatore bravo spiega bene. Quello che chiude meglio fa vedere. Quando il cliente riconosce la propria stanza arredata, smette di confrontare solo prezzo e marca dei mobili.",
  painPoints: [
    {
      icon: Clock,
      title: "Il cliente non compra il mobile: compra immaginazione",
      text: "Tu parli di marche, finiture, tessuti e dimensioni. Lui pensa: \"come starà davvero a casa mia?\". Se non riesce a vederlo, rimanda l'ordine.",
    },
    {
      icon: XCircle,
      title: "Se il valore non si vede, vince lo sconto",
      text: "Quando due preventivi arredo sembrano simili, il cliente sceglie quello che costa meno. Anche se la tua selezione, i materiali e il servizio valgono molto di più.",
    },
    {
      icon: MessageCircle,
      title: "Il cliente in showroom è caldo per poco",
      text: "Tra preventivi diversi, ispirazioni Pinterest e parenti che consigliano, il cliente perde il filo. Devi rimanere nella sua testa con un'immagine concreta della SUA stanza.",
    },
  ],

  baKicker: "Prima e dopo, dove conta davvero",
  baH2: "Mostri le aree che fanno decidere il cliente sull'arredo.",
  baSubheadline:
    "Il render deve aiutare il cliente a capire cosa cambia nella sua stanza: zona divano, parete TV, zona pranzo, camera o ufficio che normalmente restano voci di un preventivo astratto.",
  baAreas: [
    {
      title: "Zona divano e living",
      before: "Il cliente vede un soggiorno con mobili datati, colori spenti e disposizione poco funzionale.",
      after: "Vede un nuovo divano, libreria coordinata e tappeto che danno carattere e luce alla zona living.",
    },
    {
      title: "Cucina e zona pranzo",
      before: "Cucina anni passati, top usurato e tavolo poco coerente con il resto dello spazio.",
      after: "Nuovi pensili, isola, top in pietra ricomposta e illuminazione a sospensione che modernizzano l'ambiente.",
    },
    {
      title: "Camera da letto",
      before: "Letto vecchio, armadio scuro e luci centrali fredde: la camera sembra più piccola e poco rilassante.",
      after: "Nuovo letto imbottito, armadio in finitura chiara e illuminazione calda: il cliente percepisce subito il comfort.",
    },
    {
      title: "Ufficio e zona studio",
      before: "Scrivania improvvisata, scaffali misti e cavi a vista: lo spazio non comunica professionalità.",
      after: "Scrivania ergonomica, libreria coordinata e illuminazione corretta: la stanza diventa un vero ambiente di lavoro.",
    },
  ],

  mechanismKicker: "Il meccanismo",
  mechanismH2: "Una dimostrazione visiva che entra nella scelta dell'arredo al momento giusto.",
  mechanismSubheadline:
    "Non vendi \"intelligenza artificiale\". Vendi sicurezza: questa è la sua stanza con i mobili, i colori e la luce che gli stai proponendo.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Scatti o carichi la foto della stanza reale",
      text: "Soggiorno, cucina, camera o ufficio: parti dalla stanza del cliente, non da una render generica di catalogo.",
    },
    {
      icon: Sparkles,
      title: "Scegli mobili, tessuti, illuminazione e finiture",
      text: "Imposti divani, letti, cucine, tavoli, lampade e tessili. Le scelte tecniche diventano una proposta visibile.",
    },
    {
      icon: FileText,
      title: "Mostri un prima/dopo che fa decidere",
      text: "Consegni un PDF prima/dopo, lo alleghi al preventivo arredo, lo invii su WhatsApp e lo tieni collegato al contatto.",
    },
  ],
  mechanismCta: "Provalo gratis sulla foto della stanza del tuo cliente",

  commercialKicker: "Perché funziona commercialmente",
  commercialH2: "Se il cliente non vede la differenza nella sua stanza, ti chiederà lo sconto.",
  commercialBody:
    "La maggior parte dei concorrenti consegna preventivi pieni di codici articolo e marche. Tu puoi consegnare una prova visiva: stessa stanza, nuovi mobili, impatto immediato.",
  commercialLevers: [
    {
      icon: Target,
      title: "Rendi visibile il valore",
      text: "Il cliente non valuta solo il costo del divano. Valuta l'effetto finale sulla stanza, sulla luce e sul comfort percepito.",
    },
    {
      icon: ShieldCheck,
      title: "Riduci il rischio percepito",
      text: "Colori, tessuti, proporzioni e stile non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
    },
    {
      icon: Zap,
      title: "Acceleri il follow-up",
      text: "Non richiami dicendo solo \"ha visto il preventivo arredo?\". Richiami partendo da un'immagine chiara e memorabile della SUA stanza.",
    },
    {
      icon: BadgeCheck,
      title: "Ti posizioni sopra il concorrente",
      text: "Non sembri un mobiliere che manda un prezzo. Sembri il consulente arredo che guida il cliente in una scelta più sicura.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il render della stanza è solo l'inizio. Il vero salto è quando entra nel tuo CRM.",
  resultsBody:
    "Edilizia in Cloud collega il render al contatto, all'opportunità, al preventivo arredo e alla fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto in un'unica timeline e chiudi il cerchio sulla trattativa.",
  integrationPillars: [
    {
      icon: Users,
      title: "CRM arredatori integrato",
      text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
    },
    {
      icon: Send,
      title: "Follow-up automatici WhatsApp & email",
      text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del progetto arredo. Smetti di dimenticarti i clienti tiepidi.",
    },
    {
      icon: LineChart,
      title: "Dashboard margini e progetti arredo",
      text: "Vedi quanti progetti hai inviato, quanti chiusi, quale margine reale stai facendo per ordine arredo e quanto rende ogni canale di acquisizione.",
    },
    {
      icon: FileText,
      title: "Preventivi e fatturazione SDI",
      text: "Dal render al preventivo PDF, dall'ordine alla fattura elettronica: una sola piattaforma, zero duplicazioni e zero copia-incolla.",
    },
  ],
  resultStats: [
    { value: 38, suffix: "%", label: "in più di preventivi arredo visualizzati dal cliente" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
    { value: 5, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo arredo" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato arredo in più puoi fare con un prima/dopo in trattativa?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: progetti al mese, ticket medio arredo e close rate. La stima parte da +12 punti di chiusura.",
  roiPreventiviLabel: "Progetti arredo al mese",
  roiTicketLabel: "Ticket medio per progetto",

  salesKicker: "Più vendite arredo, meno preventivi dimenticati",
  salesH2: "Il render stanza non serve a fare scena. Serve a far avanzare la decisione.",
  salesBody:
    "Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo. Il prima/dopo della stanza crea quella ragione: visuale, semplice, immediata.",
  salesImpact: [
    {
      title: "Preventivi arredo meno freddi",
      text: "Il follow-up non parte da una cifra, ma da un'immagine: \"Le mando come cambierebbe il suo soggiorno\".",
    },
    {
      title: "Meno confronto al ribasso",
      text: "Quando il cliente vede il risultato, è più facile parlare di qualità mobili, tessuti, garanzia e differenza reale.",
    },
    {
      title: "Più decisione in showroom arredo",
      text: "Divani, cucine e camere diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione.",
    },
    {
      title: "Più autorevolezza commerciale",
      text: "Il cliente percepisce un metodo: rilievo, configurazione, render, PDF, preventivo e follow-up ordinato.",
    },
  ],

  featureKicker: "Cosa consegni",
  featureH2: "Non una bella immagine. Uno strumento commerciale per vendere meglio l'arredo.",
  featureRows: [
    {
      label: "Prima/dopo sulla foto reale della stanza",
      value: "Il cliente vede la propria stanza, le proprie misure, la propria luce e il contesto reale dell'arredo.",
    },
    {
      label: "Scelte di arredo tracciate",
      value: "Mobili, divani, cucine, illuminazione, tessuti e finiture restano leggibili e collegati al render.",
    },
    {
      label: "PDF prima/dopo professionale",
      value: "Un documento ordinato da inviare al cliente, allegare al preventivo arredo e usare in fase di follow-up, con disclaimer dimostrativo.",
    },
    {
      label: "CRM collegato",
      value: "Ogni render stanza può restare associato a contatto e opportunità, così non perdi la storia commerciale del progetto.",
    },
    {
      label: "Gallery filtrabile",
      value: "Recuperi i render per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
    },
  ],

  scenarioKicker: "Uso sul campo",
  scenarioH2: "Tre momenti in cui il render stanza può spostare davvero la trattativa.",
  scenarios: [
    {
      title: "Sopralluogo a casa del cliente",
      text: "Scatti la foto della stanza, raccogli preferenze e obiezioni, poi trasformi il preventivo in una proposta visiva che resta impressa.",
    },
    {
      title: "Preventivo arredo fermo da qualche giorno",
      text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe il suo soggiorno\".",
    },
    {
      title: "Showroom mobili e scelta finiture",
      text: "Fai confrontare due alternative senza lasciarle astratte: divano grigio o blu, rovere chiaro o noce, lineare o ad angolo.",
    },
  ],

  faqKicker: "Obiezioni frequenti",
  faqH2: "Le domande che un arredatore serio si fa prima di usarlo.",
  faqs: [
    {
      q: "Non rischio di promettere una stanza identica al render?",
      a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, proporzioni e impatto visivo della stanza, con disclaimer chiaro nel PDF.",
    },
    {
      q: "Serve anche se vendo arredo di fascia alta?",
      a: "Sì, soprattutto lì. Più il prezzo dell'arredo sale, più il cliente vuole sentirsi sicuro. Il render aiuta a giustificare valore, scelta estetica e differenza rispetto al preventivo più economico.",
    },
    {
      q: "Funziona anche per progetti completi di interior design?",
      a: "Sì. Il modulo è pensato per il mondo arredo: soggiorno, cucina, camera, bagno, ufficio, illuminazione, tessuti e accessori visibili.",
    },
    {
      q: "Non bastano cataloghi, campioni e showroom?",
      a: "Cataloghi e campioni parlano del prodotto. Il render parla della stanza del cliente. È una differenza enorme: il cliente non deve immaginare, deve riconoscere il risultato.",
    },
    {
      q: "Quanto costa? È vincolante?",
      a: "Il modulo Render Stanza è incluso nel piano per arredatori e showroom e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
    },
  ],

  internalLinksKicker: "Approfondisci",
  internalLinksH2: "Esplora come Edilizia in Cloud aiuta gli arredatori a vendere meglio.",
  internalLinksBody:
    "Render Stanza AI è un modulo della piattaforma Edilizia in Cloud, il software gestionale per arredatori, mobilieri e interior designer italiani. Scopri tutti i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita",
      title: "Tutte le Funzionalità",
      text: "Cantieri, preventivi, margini, HR, fatturazione SDI e marketing in una sola piattaforma.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni",
      text: "Render AI per ristrutturazioni complete: dalla cucina al living, dal bagno alla zona notte.",
    },
    {
      to: "/funzionalita/render-pavimenti",
      title: "Render Pavimenti",
      text: "Mostra al cliente come cambia il pavimento della stanza o di tutta la casa, sulla foto reale.",
    },
    {
      to: "/funzionalita/render-bagni",
      title: "Render Bagni",
      text: "Render AI per bagnisti e showroom: sanitari, doccia, mobile e rivestimenti sulla foto reale.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Crea preventivi arredo professionali e li alleghi al render prima/dopo.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dal render arredo all'ordine, dalla conferma alla fattura elettronica senza copia-incolla.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti per imprese, arredatori e showroom. Beta dedicata con prezzo bloccato.",
    },
    {
      to: "/demo",
      title: "Prova GRATIS la Demo",
      text: "Carica una foto della stanza e genera il tuo primo render in 60 secondi.",
    },
    {
      to: "/blog",
      title: "Blog · Vendita arredo",
      text: "Consigli pratici su trattativa, follow-up, prezzi e strategie di vendita per arredatori.",
    },
  ],

  finalCtaH2: "Se il concorrente manda solo un preventivo arredo, tu manda una visione.",
  finalCtaBody:
    "Il cliente deve pensare: \"Questo è il mio soggiorno con i nuovi mobili\". Quando succede, il preventivo diventa più concreto, più memorabile e più difficile da confrontare solo sul prezzo.",
  finalCtaButton: "Prova GRATIS Render Stanza",
  finalCtaMicrocopy: "Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova GRATIS Render Stanza",
  stickyCtaMicrocopy: "Onboarding incluso · Cancelli quando vuoi",

  applicationSubCategory: "Sales Enablement Arredo",
};

export default function RenderStanza() {
  return <RenderPageTemplate config={config} />;
}
