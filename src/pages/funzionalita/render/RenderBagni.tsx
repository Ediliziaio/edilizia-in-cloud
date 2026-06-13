import {
  AppWindow,
  Bath,
  BadgeCheck,
  Camera,
  Clock,
  DoorOpen,
  Droplets,
  FileText,
  LineChart,
  MessageCircle,
  Send,
  ShieldCheck,
  ShowerHead,
  Target,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import RenderPageTemplate from "./RenderPageTemplate";
import type { RenderPageConfig } from "./types";

const config: RenderPageConfig = {
  slug: "render-bagni",
  vertical: "Bagni",
  productName: "Render Bagni AI",
  audience: "Bagnisti, idraulici, showroom bagno, rivenditori sanitari",
  audienceShort: "bagnisti e showroom bagno",

  seo: {
    title: "Render Bagni AI per Idraulici e Showroom",
    description:
      "Render Bagni AI: trasforma la foto del bagno del cliente in un prima/dopo realistico con nuovi sanitari, doccia, mobile, rivestimenti, pavimento e luci. Pronto in 60 secondi.",
    keywords:
      "render bagno, render bagni AI, software bagnisti, configuratore bagno online, render rivestimenti bagno, render sanitari, render doccia, render arredo bagno, prima dopo bagno, software showroom bagno, gestionale idraulici, AI bagno",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Render AI per bagnisti e showroom · Beta",
  heroH1:
    "Render Bagni AI: fai vedere al cliente come sarà il suo nuovo bagno, prima del prezzo.",
  heroSubheadline:
    "Render Bagni AI trasforma la foto reale del bagno del cliente in un prima/dopo credibile: nuovi sanitari, doccia, mobile, rivestimenti, pavimento e luci applicati allo stesso ambiente. Il preventivo non è più una cifra astratta, ma una proposta che il cliente riesce finalmente a immaginare.",
  heroPrimaryCta: "Prova GRATIS Render Bagni",

  reassurancePoints: ["Setup in 60 secondi", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per bagnisti, idraulici e showroom",
    "Prima/dopo sulla foto del bagno reale",
    "PDF e WhatsApp pronti per il follow-up",
  ],

  objectiveRow: [
    ["Obiettivo", "Far dire al cliente: adesso lo vedo nel mio bagno"],
    ["Momento chiave", "Sopralluogo, showroom e follow-up del preventivo"],
    ["Risultato", "Meno indecisione sulle finiture, più ordini chiusi"],
  ],

  betaH2: "Stiamo aprendo l'accesso ai primi 100 bagnisti italiani.",
  betaBody:
    "Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto. Quando i 100 posti saranno chiusi, il prezzo sale.",

  speedH2: "In 60 secondi trasformi una foto del bagno in un argomento di vendita.",
  speedSubheadline:
    "Non aspetti il rendering 3D di uno studio. Carichi la foto, scegli sanitari, doccia, mobile e rivestimenti e ottieni un prima/dopo da usare subito in showroom o nel follow-up.",
  speedStats: [
    { value: 60, suffix: " sec", label: "per ottenere un render bagno da usare in trattativa" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
    { value: 3, prefix: "x", suffix: "", label: "preventivi ricordati in più rispetto al solo PDF" },
  ],

  videoH2: "Vedi in 60 secondi come trasformi una foto del bagno in una vendita.",
  videoSubheadline:
    "Carichi la foto del bagno del cliente, scegli sanitari, mobile, doccia e rivestimenti, generi il prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.",

  familyH2: "Non solo bagni. Un render AI per ogni prodotto che vendi al cliente.",
  familySubheadline:
    "Lo stesso meccanismo del Render Bagni, esteso a tutte le categorie del mondo casa e ristrutturazione: stanze, pavimenti, finiture e oltre.",
  familyItems: [
    {
      icon: Bath,
      title: "Render Bagni",
      text: "Sanitari, doccia, vasca, mobile lavabo e rivestimenti applicati al bagno reale del cliente.",
      available: true,
    },
    {
      icon: ShowerHead,
      title: "Render Doccia",
      text: "Cabine doccia, soffioni, miscelatori e nicchie inserite nello spazio reale.",
      available: true,
    },
    {
      icon: Droplets,
      title: "Render Sanitari",
      text: "Wc, bidet, lavabo, freestanding o sospesi: confronti modelli direttamente nel bagno del cliente.",
      available: true,
    },
    {
      icon: AppWindow,
      title: "Render Rivestimenti",
      text: "Piastrelle, mosaici, microcemento e gres: vedi come stanno sulle pareti reali del cliente.",
      available: true,
    },
    {
      icon: DoorOpen,
      title: "Render Mobili Bagno",
      text: "Mobili lavabo, colonne e specchi contestualizzati nel bagno reale, non più in catalogo.",
      available: true,
    },
  ],
  familyBonusTitle: "Tutta la suite Render AI",
  familyBonusText:
    "Accedi a tutti i moduli con un unico abbonamento. Bagno, stanza, pavimenti e ristrutturazioni inclusi senza costi extra.",

  painKicker: "Il problema vero",
  painH2: "Il cliente non sta scegliendo solo un sanitario. Sta decidendo se fidarsi di te.",
  painSubheadline:
    "Il bagnista bravo spiega bene. Quello che chiude meglio fa vedere. Quando il cliente riconosce il proprio bagno migliorato, smette di confrontare solo prezzo e marca delle piastrelle.",
  painPoints: [
    {
      icon: Clock,
      title: "Il cliente non compra il sanitario: compra certezza",
      text: "Tu parli di marche, materiali, idraulica e posa. Lui pensa: \"come sarà davvero il mio bagno alla fine?\". Se non riesce a vederlo, rimanda.",
    },
    {
      icon: XCircle,
      title: "Se il valore non si vede, vince lo sconto",
      text: "Quando due preventivi bagno sembrano uguali, il cliente sceglie quello che costa meno. Anche se la tua qualità di posa, le marche e la garanzia valgono molto di più.",
    },
    {
      icon: MessageCircle,
      title: "Il cliente in showroom è caldo per poco",
      text: "Tra preventivi diversi, parenti che consigliano e influencer Pinterest, il cliente perde il filo. Devi rimanere nella sua testa con un'immagine concreta del SUO bagno.",
    },
  ],

  baKicker: "Prima e dopo, dove conta davvero",
  baH2: "Mostri le aree che fanno decidere il cliente sul bagno.",
  baSubheadline:
    "Il render deve aiutare il cliente a capire cosa cambia nel suo bagno: zona doccia, mobile lavabo, parete sanitari, rivestimenti e illuminazione che normalmente restano voci tecniche di preventivo.",
  baAreas: [
    {
      title: "Zona doccia o vasca",
      before: "Il cliente vede una doccia datata, vasca ingombrante o un box scuro che riduce lo spazio percepito.",
      after: "Vede una nuova doccia walk-in, soffione moderno e vetri trasparenti che rendono il bagno più ampio e luminoso.",
    },
    {
      title: "Mobile lavabo e specchio",
      before: "Mobile vecchio, specchio piccolo e luci fredde: il bagno sembra più piccolo e meno funzionale.",
      after: "Nuovo mobile sospeso, specchio retroilluminato e finiture coordinate che danno carattere all'ambiente.",
    },
    {
      title: "Pareti e rivestimenti",
      before: "Piastrelle anni '90, fughe scure e pareti bianche che fanno percepire il bagno come datato.",
      after: "Gres effetto pietra, microcemento o mosaico: vedi come cambia la percezione di pulizia e modernità.",
    },
    {
      title: "Sanitari e piccoli dettagli",
      before: "Wc, bidet e lavabo a terra: ingombro, fughe difficili da pulire e linee discontinue.",
      after: "Sanitari sospesi, ferramenta nera o oro, dettagli coordinati: il preventivo finalmente dice qualcosa al cliente.",
    },
  ],

  mechanismKicker: "Il meccanismo",
  mechanismH2: "Una dimostrazione visiva che entra nella scelta del bagno al momento giusto.",
  mechanismSubheadline:
    "Non vendi \"intelligenza artificiale\". Vendi sicurezza: questo è il suo bagno con i sanitari, la doccia e i rivestimenti che gli stai proponendo.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Scatti o carichi la foto del bagno reale",
      text: "Vasca, doccia, parete sanitari, mobile o vista d'insieme: parti dal bagno del cliente, non da una render generica di catalogo.",
    },
    {
      icon: AppWindow,
      title: "Scegli sanitari, doccia, mobile e rivestimenti",
      text: "Imposti modelli, finiture, pavimento, rivestimenti e illuminazione. Le scelte tecniche diventano una proposta visibile.",
    },
    {
      icon: FileText,
      title: "Mostri un prima/dopo che fa decidere",
      text: "Consegni un PDF prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
    },
  ],
  mechanismCta: "Provalo gratis sulla foto del bagno del tuo cliente",

  commercialKicker: "Perché funziona commercialmente",
  commercialH2: "Se il cliente non vede la differenza nel suo bagno, ti chiederà lo sconto.",
  commercialBody:
    "La maggior parte dei concorrenti consegna preventivi pieni di codici sanitari e marche. Tu puoi consegnare una prova visiva: stesso bagno, nuove finiture, impatto immediato.",
  commercialLevers: [
    {
      icon: Target,
      title: "Rendi visibile il valore",
      text: "Il cliente non valuta solo il costo della doccia. Valuta l'effetto finale sul suo bagno, sulla luce e sulla percezione di pulizia.",
    },
    {
      icon: ShieldCheck,
      title: "Riduci il rischio percepito",
      text: "Colore dei rivestimenti, proporzioni e stile non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
    },
    {
      icon: Zap,
      title: "Acceleri il follow-up",
      text: "Non richiami dicendo solo \"ha visto il preventivo bagno?\". Richiami partendo da un'immagine chiara e memorabile del SUO bagno.",
    },
    {
      icon: BadgeCheck,
      title: "Ti posizioni sopra il concorrente",
      text: "Non sembri il bagnista che manda un prezzo. Sembri il consulente che guida il cliente in una scelta più sicura.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il render del bagno è solo l'inizio. Il vero salto è quando entra nel tuo CRM.",
  resultsBody:
    "Edilizia in Cloud collega il render al contatto, all'opportunità, al preventivo e alla fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto in un'unica timeline e chiudi il cerchio sulla trattativa.",
  integrationPillars: [
    {
      icon: Users,
      title: "CRM bagnisti integrato",
      text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
    },
    {
      icon: Send,
      title: "Follow-up automatici WhatsApp & email",
      text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo. Smetti di dimenticarti i clienti tiepidi.",
    },
    {
      icon: LineChart,
      title: "Dashboard margini e cantieri bagno",
      text: "Vedi quanti preventivi hai inviato, quanti chiusi, quale margine reale stai facendo per cantiere bagno e quanto rende ogni canale di acquisizione.",
    },
    {
      icon: FileText,
      title: "Preventivi e fatturazione SDI",
      text: "Dal render al preventivo PDF, dall'ordine alla fattura elettronica: una sola piattaforma, zero duplicazioni e zero copia-incolla.",
    },
  ],
  resultStats: [
    { value: 38, suffix: "%", label: "in più di preventivi bagno visualizzati dal cliente" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
    { value: 5, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo bagno" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato bagno in più puoi fare con un prima/dopo in trattativa?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: preventivi al mese, ticket medio bagno e close rate. La stima parte da +12 punti di chiusura.",
  roiPreventiviLabel: "Preventivi bagno al mese",
  roiTicketLabel: "Ticket medio per bagno",

  salesKicker: "Più vendite bagno, meno preventivi dimenticati",
  salesH2: "Il render bagno non serve a fare scena. Serve a far avanzare la decisione.",
  salesBody:
    "Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo. Il prima/dopo del bagno crea quella ragione: visuale, semplice, immediata.",
  salesImpact: [
    {
      title: "Preventivi bagno meno freddi",
      text: "Il follow-up non parte da una cifra, ma da un'immagine: \"Le mando come cambierebbe il suo bagno\".",
    },
    {
      title: "Meno confronto al ribasso",
      text: "Quando il cliente vede il risultato, è più facile parlare di qualità sanitari, posa, garanzia e differenza reale.",
    },
    {
      title: "Più decisione in showroom bagno",
      text: "Sanitari, mobili e rivestimenti diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione.",
    },
    {
      title: "Più autorevolezza commerciale",
      text: "Il cliente percepisce un metodo: rilievo, configurazione, render, PDF, preventivo e follow-up ordinato.",
    },
  ],

  featureKicker: "Cosa consegni",
  featureH2: "Non una bella immagine. Uno strumento commerciale per vendere meglio i bagni.",
  featureRows: [
    {
      label: "Prima/dopo sulla foto reale del bagno",
      value: "Il cliente vede il proprio bagno, le proprie misure, la propria luce e il contesto reale dell'intervento.",
    },
    {
      label: "Scelte tecniche tracciate",
      value: "Sanitari, doccia, mobile, rivestimenti, pavimento e illuminazione restano leggibili e collegati al render.",
    },
    {
      label: "PDF prima/dopo professionale",
      value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
    },
    {
      label: "CRM collegato",
      value: "Ogni render bagno può restare associato a contatto e opportunità, così non perdi la storia commerciale della trattativa.",
    },
    {
      label: "Gallery filtrabile",
      value: "Recuperi i render bagno per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
    },
  ],

  scenarioKicker: "Uso sul campo",
  scenarioH2: "Tre momenti in cui il render bagno può spostare davvero la trattativa.",
  scenarios: [
    {
      title: "Sopralluogo a casa del cliente",
      text: "Scatti la foto del bagno, raccogli preferenze e obiezioni, poi trasformi il preventivo in una proposta visiva che resta impressa.",
    },
    {
      title: "Preventivo bagno fermo da qualche giorno",
      text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe il suo bagno\".",
    },
    {
      title: "Showroom bagno e scelta finiture",
      text: "Fai confrontare due alternative senza lasciarle astratte: gres chiaro o microcemento scuro, sanitari sospesi o filomuro.",
    },
  ],

  faqKicker: "Obiezioni frequenti",
  faqH2: "Le domande che un bagnista serio si fa prima di usarlo.",
  faqs: [
    {
      q: "Non rischio di promettere un bagno identico al render?",
      a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, proporzioni e impatto visivo del bagno, con disclaimer chiaro nel PDF.",
    },
    {
      q: "Serve anche se vendo bagni di fascia alta?",
      a: "Sì, soprattutto lì. Più il prezzo del bagno sale, più il cliente vuole sentirsi sicuro. Il render aiuta a giustificare valore, scelta estetica e differenza rispetto al preventivo più economico.",
    },
    {
      q: "Funziona anche per ristrutturazioni complete del bagno?",
      a: "Sì. Il modulo è pensato per il mondo bagno: sanitari, doccia, vasca, mobili, pavimenti, rivestimenti, illuminazione e accessori visibili.",
    },
    {
      q: "Non bastano cataloghi, campioni e showroom bagno?",
      a: "Cataloghi e campioni parlano del prodotto. Il render parla del bagno del cliente. È una differenza enorme: il cliente non deve immaginare, deve riconoscere il risultato.",
    },
    {
      q: "Quanto costa? È vincolante?",
      a: "Il modulo Render Bagni è incluso nel piano per bagnisti e showroom e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
    },
  ],

  internalLinksKicker: "Approfondisci",
  internalLinksH2: "Esplora come Edilizia in Cloud aiuta i bagnisti a vendere meglio.",
  internalLinksBody:
    "Render Bagni AI è un modulo della piattaforma Edilizia in Cloud, il software gestionale per bagnisti, idraulici e showroom italiani. Scopri tutti i moduli collegati.",
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
      text: "Mostra al cliente come cambia il pavimento del bagno o di tutta la casa, sulla foto reale.",
    },
    {
      to: "/funzionalita/render-stanza",
      title: "Render Stanza",
      text: "Render AI per cucina, soggiorno, camera da letto e ogni stanza che ristrutturi.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Crea preventivi bagno professionali e li alleghi al render prima/dopo.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dal render bagno all'ordine, dalla conferma alla fattura elettronica senza copia-incolla.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti per imprese edili, bagnisti e showroom. Beta dedicata con prezzo bloccato.",
    },
    {
      to: "/demo",
      title: "Prova GRATIS la Demo",
      text: "Carica una foto del bagno e genera il tuo primo render in 60 secondi.",
    },
    {
      to: "/blog",
      title: "Blog · Vendita bagni",
      text: "Consigli pratici su trattativa, follow-up, prezzi e strategie di vendita per bagnisti.",
    },
  ],

  finalCtaH2: "Se il concorrente manda solo un preventivo bagno, tu manda una visione.",
  finalCtaBody:
    "Il cliente deve pensare: \"Questo è il mio bagno con i nuovi sanitari\". Quando succede, il preventivo diventa più concreto, più memorabile e più difficile da confrontare solo sul prezzo.",
  finalCtaButton: "Prova GRATIS Render Bagni",
  finalCtaMicrocopy: "Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova GRATIS Render Bagni",
  stickyCtaMicrocopy: "Onboarding incluso · Cancelli quando vuoi",

  applicationSubCategory: "Sales Enablement Bagno",
};

export default function RenderBagni() {
  return <RenderPageTemplate config={config} />;
}
