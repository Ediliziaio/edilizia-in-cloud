import {
  AppWindow,
  BadgeCheck,
  Camera,
  Clock,
  FileText,
  Grid2x2,
  Layers,
  LineChart,
  MessageCircle,
  PaintBucket,
  PaintRoller,
  Send,
  ShieldCheck,
  Target,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import RenderPageTemplate from "./RenderPageTemplate";
import type { RenderPageConfig } from "./types";

const config: RenderPageConfig = {
  slug: "render-pavimenti",
  vertical: "Pavimenti",
  productName: "Render Pavimenti AI",
  audience: "Posatori, rivenditori pavimenti, showroom ceramica, parquet e gres",
  audienceShort: "posatori e rivenditori pavimenti",

  seo: {
    title: "Render Pavimenti AI per Posatori e Showroom",
    description:
      "Render Pavimenti AI: trasforma la foto reale della stanza del cliente in un prima/dopo credibile con nuovi pavimenti in gres, parquet, microcemento,…",
    keywords:
      "render pavimento, render pavimenti AI, software posatori pavimenti, configuratore pavimento online, render gres, render parquet, render ceramica, render microcemento, render resina, prima dopo pavimento, software showroom pavimenti, gestionale posatori",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Render AI per posatori e showroom · Beta",
  heroH1:
    "Render Pavimenti AI: fai vedere al cliente come sarà la stanza con il nuovo pavimento, prima del prezzo.",
  heroSubheadline:
    "Render Pavimenti AI trasforma la foto della stanza del cliente in un prima/dopo realistico: gres, parquet, microcemento, resina, ceramica o LVT applicati al pavimento reale. Il preventivo non è più una scheda di formati e fughe, ma una proposta che il cliente riesce finalmente a vedere a casa sua.",
  heroPrimaryCta: "Prova GRATIS Render Pavimenti",

  reassurancePoints: ["Setup in 60 secondi", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per posatori e showroom pavimenti",
    "Prima/dopo sulla foto della stanza reale",
    "PDF e WhatsApp pronti per il follow-up",
  ],

  objectiveRow: [
    ["Obiettivo", "Far dire al cliente: adesso lo vedo a casa mia"],
    ["Momento chiave", "Showroom, sopralluogo e follow-up"],
    ["Risultato", "Decisione più rapida sulla finitura, più mq venduti"],
  ],

  betaH2: "Stiamo aprendo l'accesso ai primi 100 posatori e showroom italiani.",
  betaBody:
    "Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto. Quando i 100 posti saranno chiusi, il prezzo sale.",

  speedH2: "In 60 secondi trasformi una foto della stanza in una proposta visiva.",
  speedSubheadline:
    "Non aspetti la posa di campioni in cantiere. Carichi la foto della stanza, scegli formato, colore e fuga e ottieni un prima/dopo da usare subito in showroom o nel follow-up.",
  speedStats: [
    { value: 60, suffix: " sec", label: "per ottenere un render pavimento da usare in trattativa" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
    { value: 3, prefix: "x", suffix: "", label: "preventivi ricordati in più rispetto al solo PDF" },
  ],

  videoH2: "Vedi in 60 secondi come trasformi una foto della stanza in mq venduti.",
  videoSubheadline:
    "Carichi la foto della stanza del cliente, scegli formato, finitura, posa e fuga, generi il prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.",

  familyH2: "Non solo pavimenti. Un render AI per ogni superficie che vendi al cliente.",
  familySubheadline:
    "Lo stesso meccanismo del Render Pavimenti, esteso a tutte le superfici della casa: pareti, scale, esterno, terrazza e oltre.",
  familyItems: [
    {
      icon: Grid2x2,
      title: "Render Pavimenti",
      text: "Gres, parquet, microcemento, resina e LVT applicati alla stanza reale del cliente.",
      available: true,
    },
    {
      icon: Layers,
      title: "Render Rivestimenti Pareti",
      text: "Boiserie, gres a parete, microcemento e mosaici visti sulle pareti reali della stanza.",
      available: true,
    },
    {
      icon: PaintBucket,
      title: "Render Resine e Microcemento",
      text: "Soluzioni continue senza fuga: confronti finiture, colori e effetti su pavimento e parete.",
      available: true,
    },
    {
      icon: AppWindow,
      title: "Render Esterni e Terrazze",
      text: "Pavimenti per balcone, terrazza, bordo piscina e camminamenti contestualizzati.",
      available: true,
    },
    {
      icon: PaintRoller,
      title: "Render Tinteggiatura",
      text: "Colori e finiture pareti coordinate al pavimento: il cliente vede l'insieme, non singole scelte.",
      available: true,
    },
  ],
  familyBonusTitle: "Tutta la suite Render AI",
  familyBonusText:
    "Accedi a tutti i moduli con un unico abbonamento. Pavimenti, pareti, resine, esterni e ristrutturazioni inclusi senza costi extra.",

  painKicker: "Il problema vero",
  painH2: "Il cliente non sta scegliendo solo un pavimento. Sta decidendo se fidarsi di te.",
  painSubheadline:
    "Il posatore bravo spiega bene. Quello che chiude meglio fa vedere. Quando il cliente riconosce il proprio salotto con il nuovo pavimento, smette di confrontare solo €/mq.",
  painPoints: [
    {
      icon: Clock,
      title: "Il cliente non compra il gres: compra certezza",
      text: "Tu parli di formati, posa, fuga e materiali. Lui pensa: \"come starà davvero a casa mia?\". Se non riesce a vederlo, rimanda.",
    },
    {
      icon: XCircle,
      title: "Se il valore non si vede, vince lo sconto",
      text: "Quando due preventivi pavimento sembrano simili, il cliente sceglie il più economico. Anche se la tua qualità di posa, le marche e la garanzia valgono molto di più.",
    },
    {
      icon: MessageCircle,
      title: "Il cliente in showroom è caldo per poco",
      text: "Tra campioni, schede tecniche e Pinterest, il cliente perde il filo. Devi rimanere nella sua testa con un'immagine concreta della SUA stanza.",
    },
  ],

  baKicker: "Prima e dopo, dove conta davvero",
  baH2: "Mostri le superfici che fanno decidere il cliente.",
  baSubheadline:
    "Il render deve aiutare il cliente a capire cosa cambia in casa sua: pavimento del salotto, della cucina, dei bagni, di camera o degli esterni, che normalmente restano scelte difficili da visualizzare.",
  baAreas: [
    {
      title: "Salotto e zona giorno",
      before: "Pavimento datato, fughe scure e colori che rimpiccioliscono la stanza.",
      after: "Nuovo gres effetto pietra o parquet rovere, posa diritta o spina ungherese: la stanza cambia aria.",
    },
    {
      title: "Cucina e zona pranzo",
      before: "Pavimento usurato dal traffico, macchie e tonalità che fanno sembrare la cucina vecchia.",
      after: "Gres porcellanato resistente, finitura opaca o lucida, formati grandi che fanno percepire pulizia.",
    },
    {
      title: "Bagno e camera da letto",
      before: "Piastrelle anni 2000, fughe ingiallite e finiture che non dialogano con il resto della casa.",
      after: "Pavimento coordinato a tutta la casa, microcemento o resine continue per un effetto contemporaneo.",
    },
    {
      title: "Esterni, terrazza e balcone",
      before: "Pavimento esterno scolorito, cementine fessurate o piastrelle anti-estetiche.",
      after: "Gres esterno R11, legno composito o pietra ricostruita: il render fa decidere prima della posa.",
    },
  ],

  mechanismKicker: "Il meccanismo",
  mechanismH2: "Una dimostrazione visiva che entra nella scelta del pavimento al momento giusto.",
  mechanismSubheadline:
    "Non vendi \"intelligenza artificiale\". Vendi sicurezza: questa è la sua stanza con il nuovo pavimento, la posa e la fuga che gli stai proponendo.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Scatti o carichi la foto della stanza",
      text: "Salotto, cucina, bagno, camera o esterno: parti dalla stanza reale del cliente, non da un'illustrazione di catalogo.",
    },
    {
      icon: AppWindow,
      title: "Scegli formato, finitura, posa e fuga",
      text: "Imposti gres, parquet, resina o microcemento, scegli formato, posa, colore della fuga e finitura. Le scelte tecniche diventano una proposta visibile.",
    },
    {
      icon: FileText,
      title: "Mostri un prima/dopo che fa decidere",
      text: "Consegni un PDF prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
    },
  ],
  mechanismCta: "Provalo gratis sulla foto della stanza del tuo cliente",

  commercialKicker: "Perché funziona commercialmente",
  commercialH2: "Se il cliente non vede il pavimento a casa sua, ti chiederà lo sconto.",
  commercialBody:
    "La maggior parte dei concorrenti consegna preventivi pieni di codici prodotto e €/mq. Tu puoi consegnare una prova visiva: stessa stanza, nuovo pavimento, impatto immediato.",
  commercialLevers: [
    {
      icon: Target,
      title: "Rendi visibile il valore",
      text: "Il cliente non valuta solo il costo al mq. Valuta come cambia la luce, la percezione dello spazio e l'estetica complessiva della casa.",
    },
    {
      icon: ShieldCheck,
      title: "Riduci il rischio percepito",
      text: "Tono del legno, dimensione delle piastrelle, colore della fuga non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
    },
    {
      icon: Zap,
      title: "Acceleri il follow-up",
      text: "Non richiami dicendo solo \"ha visto il preventivo pavimento?\". Richiami partendo da un'immagine chiara e memorabile della SUA stanza.",
    },
    {
      icon: BadgeCheck,
      title: "Ti posizioni sopra il concorrente",
      text: "Non sembri il posatore che manda un prezzo. Sembri il consulente che guida il cliente in una scelta più sicura.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il render del pavimento è solo l'inizio. Il vero salto è quando entra nel tuo CRM.",
  resultsBody:
    "Edilizia in Cloud collega il render al contatto, all'opportunità, al preventivo e alla fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto in un'unica timeline e chiudi il cerchio sulla trattativa.",
  integrationPillars: [
    {
      icon: Users,
      title: "CRM posatori integrato",
      text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
    },
    {
      icon: Send,
      title: "Follow-up automatici WhatsApp & email",
      text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo pavimento. Smetti di dimenticarti i clienti tiepidi.",
    },
    {
      icon: LineChart,
      title: "Dashboard margini e cantieri pavimento",
      text: "Vedi quanti preventivi hai inviato, quanti chiusi, quale margine reale stai facendo per cantiere e quanto rende ogni canale di acquisizione.",
    },
    {
      icon: FileText,
      title: "Preventivi e fatturazione SDI",
      text: "Dal render al preventivo PDF, dall'ordine alla fattura elettronica: una sola piattaforma, zero duplicazioni e zero copia-incolla.",
    },
  ],
  resultStats: [
    { value: 38, suffix: "%", label: "in più di preventivi pavimento visualizzati dal cliente" },
    { value: 14, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
    { value: 5, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato in più puoi fare con un prima/dopo del pavimento in trattativa?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: preventivi al mese, ticket medio cantiere e close rate. La stima parte da +12 punti di chiusura.",
  roiPreventiviLabel: "Preventivi pavimento al mese",
  roiTicketLabel: "Ticket medio per cantiere",

  salesKicker: "Più mq venduti, meno preventivi dimenticati",
  salesH2: "Il render del pavimento non serve a fare scena. Serve a far avanzare la decisione.",
  salesBody:
    "Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo. Il prima/dopo del pavimento crea quella ragione: visuale, semplice, immediata.",
  salesImpact: [
    {
      title: "Preventivi pavimento meno freddi",
      text: "Il follow-up non parte da un €/mq, ma da un'immagine: \"Le mando come cambierebbe il suo salotto\".",
    },
    {
      title: "Meno confronto al ribasso",
      text: "Quando il cliente vede il risultato, è più facile parlare di qualità del materiale, posa, garanzia e differenza reale.",
    },
    {
      title: "Più decisione in showroom",
      text: "Formati, colori e fughe diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione.",
    },
    {
      title: "Più autorevolezza commerciale",
      text: "Il cliente percepisce un metodo: rilievo, configurazione, render, PDF, preventivo e follow-up ordinato.",
    },
  ],

  featureKicker: "Cosa consegni",
  featureH2: "Non una bella immagine. Uno strumento commerciale per vendere meglio i pavimenti.",
  featureRows: [
    {
      label: "Prima/dopo sulla foto reale della stanza",
      value: "Il cliente vede la propria stanza, le proprie misure, la propria luce e il contesto reale dell'intervento.",
    },
    {
      label: "Scelte tecniche tracciate",
      value: "Formato, materiale, posa, colore della fuga e finitura restano leggibili e collegati al render.",
    },
    {
      label: "PDF prima/dopo professionale",
      value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
    },
    {
      label: "CRM collegato",
      value: "Ogni render pavimento può restare associato a contatto e opportunità, così non perdi la storia commerciale della trattativa.",
    },
    {
      label: "Gallery filtrabile",
      value: "Recuperi i render pavimento per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
    },
  ],

  scenarioKicker: "Uso sul campo",
  scenarioH2: "Tre momenti in cui il render del pavimento può spostare davvero la trattativa.",
  scenarios: [
    {
      title: "Showroom e scelta finiture",
      text: "Fai confrontare due alternative senza lasciarle astratte: gres effetto pietra o parquet rovere, posa diritta o spina ungherese.",
    },
    {
      title: "Sopralluogo a casa del cliente",
      text: "Scatti la foto della stanza, raccogli preferenze e obiezioni, poi trasformi il preventivo in una proposta visiva che resta impressa.",
    },
    {
      title: "Preventivo fermo da qualche giorno",
      text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe il salotto\".",
    },
  ],

  faqKicker: "Obiezioni frequenti",
  faqH2: "Le domande che un posatore o un rivenditore serio si fa prima di usarlo.",
  faqs: [
    {
      q: "Non rischio di promettere un pavimento identico al render?",
      a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, formato, colore della fuga e impatto visivo, con disclaimer chiaro nel PDF.",
    },
    {
      q: "Funziona con parquet, gres, microcemento e resina?",
      a: "Sì. Il modulo è pensato per l'intero mondo pavimenti: gres porcellanato, parquet prefinito o massello, ceramica, microcemento, resine continue, LVT, marmo e pietre naturali.",
    },
    {
      q: "Posso confrontare due alternative nello stesso ambiente?",
      a: "Sì. Generi più render della stessa stanza con materiali diversi e li mostri al cliente affiancati, su carta o in WhatsApp.",
    },
    {
      q: "Vale anche per esterni e terrazze?",
      a: "Sì. Pavimenti per balcone, terrazza, bordo piscina e camminamenti possono essere visualizzati allo stesso modo.",
    },
    {
      q: "Quanto costa? È vincolante?",
      a: "Il modulo Render Pavimenti è incluso nel piano per posatori e showroom e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
    },
  ],

  internalLinksKicker: "Approfondisci",
  internalLinksH2: "Esplora come Edilizia in Cloud aiuta i posatori a vendere meglio.",
  internalLinksBody:
    "Render Pavimenti AI è un modulo della piattaforma Edilizia in Cloud, il software gestionale per posatori, rivenditori e showroom italiani. Scopri tutti i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita",
      title: "Tutte le Funzionalità",
      text: "Cantieri, preventivi, margini, HR, fatturazione SDI e marketing in una sola piattaforma.",
    },
    {
      to: "/funzionalita/render-stanza",
      title: "Render Stanza",
      text: "Render AI per cucine, soggiorni, camere: vedi insieme pavimento e arredo coordinati.",
    },
    {
      to: "/funzionalita/render-bagni",
      title: "Render Bagni",
      text: "Render AI per bagni: pavimento, rivestimenti, sanitari e mobili nel bagno reale.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni",
      text: "Render AI per ristrutturazioni complete: pavimento, pareti, infissi e arredo.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Crea preventivi pavimento professionali e li alleghi al render prima/dopo.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dal render all'ordine, dalla conferma alla fattura elettronica senza copia-incolla.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti per posatori e showroom. Beta dedicata con prezzo bloccato.",
    },
    {
      to: "/demo",
      title: "Prova GRATIS la Demo",
      text: "Carica una foto della stanza e genera il tuo primo render pavimento in 60 secondi.",
    },
    {
      to: "/blog",
      title: "Blog · Vendita pavimenti",
      text: "Consigli pratici su trattativa, follow-up, prezzi e strategie di vendita per posatori.",
    },
  ],

  finalCtaH2: "Se il concorrente manda solo un €/mq, tu manda una visione.",
  finalCtaBody:
    "Il cliente deve pensare: \"Questo è il mio salotto con il nuovo pavimento\". Quando succede, il preventivo diventa più concreto, più memorabile e più difficile da confrontare solo sul prezzo.",
  finalCtaButton: "Prova GRATIS Render Pavimenti",
  finalCtaMicrocopy: "Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova GRATIS Render Pavimenti",
  stickyCtaMicrocopy: "Onboarding incluso · Cancelli quando vuoi",

  applicationSubCategory: "Sales Enablement Pavimenti",
};

export default function RenderPavimenti() {
  return <RenderPageTemplate config={config} />;
}
