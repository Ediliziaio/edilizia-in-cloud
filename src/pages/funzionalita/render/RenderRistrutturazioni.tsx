import {
  AppWindow,
  BadgeCheck,
  Bath,
  Camera,
  ChefHat,
  Clock,
  FileText,
  Home,
  Layers,
  LineChart,
  MessageCircle,
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
  slug: "render-ristrutturazioni",
  vertical: "Ristrutturazioni",
  productName: "Render Ristrutturazioni AI",
  audience: "Imprese edili, ristrutturatori chiavi in mano, interior designer, general contractor",
  audienceShort: "imprese di ristrutturazione",

  seo: {
    title:
      "Render Ristrutturazioni AI per Imprese Edili",
    description:
      "Render Ristrutturazioni AI: trasforma la foto reale dell'appartamento del cliente in un prima/dopo credibile per ristrutturazioni complete.",
    keywords:
      "render ristrutturazione, render ristrutturazioni AI, software imprese ristrutturazione, configuratore ristrutturazione, render appartamento, render casa AI, prima dopo ristrutturazione, software interior designer, gestionale ristrutturatori, AI casa",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Render AI per ristrutturatori e general contractor · Beta",
  heroH1:
    "Render Ristrutturazioni AI: fai vedere al cliente come sarà la sua casa ristrutturata, prima del prezzo.",
  heroSubheadline:
    "Render Ristrutturazioni AI trasforma la foto reale dell'appartamento del cliente in un prima/dopo credibile: cucina, soggiorno, bagni, camere, infissi, pavimenti, tinteggiatura e arredo applicati alla stessa casa. Il preventivo non è più una somma di voci tecniche, ma una proposta che il cliente riesce finalmente a vedere.",
  heroPrimaryCta: "Prova GRATIS Render Ristrutturazioni",

  reassurancePoints: ["Setup in 60 secondi", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per imprese edili e general contractor",
    "Prima/dopo sulla foto reale dell'appartamento",
    "PDF e WhatsApp pronti per il follow-up",
  ],

  objectiveRow: [
    ["Obiettivo", "Far dire al cliente: adesso vedo la mia casa ristrutturata"],
    ["Momento chiave", "Sopralluogo, presentazione progetto, follow-up"],
    ["Risultato", "Meno trattativa al ribasso, ticket medio più alto"],
  ],

  betaH2: "Stiamo aprendo l'accesso alle prime 100 imprese di ristrutturazione italiane.",
  betaBody:
    "Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto. Quando i 100 posti saranno chiusi, il prezzo sale.",

  speedH2: "In 60 secondi trasformi una foto in una visione di ristrutturazione completa.",
  speedSubheadline:
    "Non aspetti settimane di rendering 3D in studio. Carichi le foto delle stanze, scegli finiture, infissi, pavimenti e arredo e ottieni un prima/dopo da usare subito in trattativa.",
  speedStats: [
    { value: 60, suffix: " sec", label: "per ottenere un render ristrutturazione da usare in trattativa" },
    { value: 12, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
    { value: 4, prefix: "x", suffix: "", label: "preventivi ricordati in più rispetto al solo PDF" },
  ],

  videoH2: "Vedi in 60 secondi come trasformi una foto della casa in un cantiere firmato.",
  videoSubheadline:
    "Carichi le foto delle stanze, scegli pavimenti, infissi, bagno, cucina e tinteggiatura, generi il prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.",

  familyH2: "Non solo ristrutturazioni. Un render AI per ogni stanza e finitura del cliente.",
  familySubheadline:
    "Lo stesso meccanismo del Render Ristrutturazioni, esteso a tutte le categorie del mondo casa: bagno, cucina, pavimenti, infissi, esterni e oltre.",
  familyItems: [
    {
      icon: Home,
      title: "Render Ristrutturazioni",
      text: "Tutte le stanze in una sola proposta: cucina, soggiorno, bagni, camere viste insieme.",
      available: true,
    },
    {
      icon: Bath,
      title: "Render Bagni",
      text: "Sanitari, doccia, mobile e rivestimenti applicati al bagno reale del cliente.",
      available: true,
    },
    {
      icon: ChefHat,
      title: "Render Cucina",
      text: "Disposizione, finiture, top e elettrodomestici nella cucina reale del cliente.",
      available: true,
    },
    {
      icon: Layers,
      title: "Render Pavimenti",
      text: "Gres, parquet, microcemento e resina applicati al pavimento reale di ogni stanza.",
      available: true,
    },
    {
      icon: PaintRoller,
      title: "Render Tinteggiatura",
      text: "Colori e finiture pareti coordinate al pavimento e all'arredo: il cliente vede l'insieme.",
      available: true,
    },
  ],
  familyBonusTitle: "Tutta la suite Render AI",
  familyBonusText:
    "Accedi a tutti i moduli con un unico abbonamento. Bagni, cucine, pavimenti, infissi, tetti, esterni e ristrutturazioni inclusi senza costi extra.",

  painKicker: "Il problema vero",
  painH2: "Il cliente non sta scegliendo solo le finiture. Sta decidendo se affidarti casa sua.",
  painSubheadline:
    "L'impresa brava spiega bene. Quella che chiude meglio fa vedere. Quando il cliente riconosce il proprio appartamento ristrutturato, smette di confrontare solo il computo metrico estimativo.",
  painPoints: [
    {
      icon: Clock,
      title: "Il cliente non compra il computo: compra certezza",
      text: "Tu parli di demolizioni, impianti, massetti, finiture. Lui pensa: \"come sarà davvero la mia casa?\". Se non riesce a vederlo, rimanda la firma.",
    },
    {
      icon: XCircle,
      title: "Se il valore non si vede, vince lo sconto",
      text: "Quando due imprese sembrano simili, il cliente sceglie quella che costa meno. Anche se la tua qualità di posa, le marche e la garanzia valgono di più.",
    },
    {
      icon: MessageCircle,
      title: "Il cliente confronta troppe imprese",
      text: "Tra preventivi, cugini ingegneri e influencer, il cliente perde il filo. Devi rimanere nella sua testa con un'immagine concreta della SUA casa.",
    },
  ],

  baKicker: "Prima e dopo, dove conta davvero",
  baH2: "Mostri le stanze che fanno decidere il cliente sulla ristrutturazione.",
  baSubheadline:
    "Il render deve aiutare il cliente a capire cosa cambia in casa: zona giorno, zona notte, bagni, cucina, infissi e dettagli che normalmente restano voci tecniche di preventivo.",
  baAreas: [
    {
      title: "Zona giorno e cucina",
      before: "Cucina datata, salotto disordinato e divisori che bloccano la luce naturale.",
      after: "Open space coordinato, cucina con isola, finiture moderne: il cliente vede la casa che vorrebbe vivere.",
    },
    {
      title: "Bagni e zona notte",
      before: "Bagni anni '90, camere con armadi vecchi e pavimento da sostituire.",
      after: "Bagni con sanitari sospesi, camere ridipinte, parquet uniforme e armadi a filo muro.",
    },
    {
      title: "Infissi e luce naturale",
      before: "Finestre datate, persiane scolorite e infiltrazioni che riducono comfort termico.",
      after: "Infissi nuovi, persiane coordinate, più luce naturale e percezione di casa nuova dall'esterno.",
    },
    {
      title: "Finiture, colori e dettagli",
      before: "Pareti gialle, battiscopa marrone e finiture che fanno sembrare casa più vecchia.",
      after: "Tinteggiatura coordinata, dettagli neri o oro, finiture che rendono moderno l'intero appartamento.",
    },
  ],

  mechanismKicker: "Il meccanismo",
  mechanismH2: "Una dimostrazione visiva che entra nella decisione di ristrutturazione al momento giusto.",
  mechanismSubheadline:
    "Non vendi \"intelligenza artificiale\". Vendi sicurezza: questa è la sua casa con la cucina, i bagni, gli infissi e i pavimenti che gli stai proponendo.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Scatti o carichi le foto delle stanze",
      text: "Cucina, soggiorno, bagno, camera, ingresso: parti dall'appartamento reale del cliente, non da un'illustrazione di catalogo.",
    },
    {
      icon: AppWindow,
      title: "Scegli finiture, pavimenti, infissi e arredo",
      text: "Imposti pavimento, tinteggiatura, infissi, sanitari, mobili e luci. Le scelte tecniche diventano una proposta visibile.",
    },
    {
      icon: FileText,
      title: "Mostri un prima/dopo che fa firmare",
      text: "Consegni un PDF prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
    },
  ],
  mechanismCta: "Provalo gratis sulla foto della casa del tuo cliente",

  commercialKicker: "Perché funziona commercialmente",
  commercialH2: "Se il cliente non vede la casa ristrutturata, ti chiederà lo sconto.",
  commercialBody:
    "La maggior parte dei concorrenti consegna preventivi pieni di voci tecniche e prezzi al mq. Tu puoi consegnare una prova visiva: stesso appartamento, casa nuova, impatto immediato.",
  commercialLevers: [
    {
      icon: Target,
      title: "Rendi visibile il valore",
      text: "Il cliente non valuta solo il prezzo della ristrutturazione. Valuta come cambia la sua vita quotidiana e l'estetica della casa.",
    },
    {
      icon: ShieldCheck,
      title: "Riduci il rischio percepito",
      text: "Tono dei pavimenti, scelta della cucina, colore delle pareti non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
    },
    {
      icon: Zap,
      title: "Acceleri il follow-up",
      text: "Non richiami dicendo solo \"ha visto il preventivo?\". Richiami partendo da un'immagine chiara della SUA casa ristrutturata.",
    },
    {
      icon: BadgeCheck,
      title: "Ti posizioni sopra il concorrente",
      text: "Non sembri l'impresa che manda un prezzo. Sembri il general contractor che guida il cliente in un percorso sicuro.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Il render della ristrutturazione è solo l'inizio. Il vero salto è quando entra nel tuo gestionale.",
  resultsBody:
    "Edilizia in Cloud collega il render al contatto, all'opportunità, al cantiere e alla fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto in un'unica timeline e chiudi il cerchio sulla trattativa.",
  integrationPillars: [
    {
      icon: Users,
      title: "CRM ristrutturazioni integrato",
      text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo e chi è da richiamare.",
    },
    {
      icon: Send,
      title: "Follow-up automatici WhatsApp & email",
      text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo ristrutturazione.",
    },
    {
      icon: LineChart,
      title: "Dashboard cantieri e margini",
      text: "Vedi quanti preventivi hai inviato, quanti chiusi, quale margine reale stai facendo per cantiere e quanto rende ogni canale di acquisizione.",
    },
    {
      icon: FileText,
      title: "Preventivi e fatturazione SDI",
      text: "Dal render al preventivo PDF, dalla SAL alla fattura elettronica: una sola piattaforma, zero copia-incolla.",
    },
  ],
  resultStats: [
    { value: 42, suffix: "%", label: "in più di preventivi visualizzati dal cliente" },
    { value: 12, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
    { value: 8, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato ristrutturazione in più puoi fare con un prima/dopo in trattativa?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: preventivi al mese, ticket medio cantiere e close rate. La stima parte da +12 punti di chiusura.",
  roiPreventiviLabel: "Preventivi ristrutturazione al mese",
  roiTicketLabel: "Ticket medio per cantiere",

  salesKicker: "Più cantieri firmati, meno preventivi dimenticati",
  salesH2:
    "Il render della ristrutturazione non serve a fare scena. Serve a far avanzare la decisione.",
  salesBody:
    "Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo. Il prima/dopo della casa crea quella ragione: visuale, semplice, immediata.",
  salesImpact: [
    {
      title: "Preventivi meno freddi",
      text: "Il follow-up non parte da un computo, ma da un'immagine: \"Le mando come cambierebbe la sua casa\".",
    },
    {
      title: "Meno confronto al ribasso",
      text: "Quando il cliente vede il risultato, è più facile parlare di qualità, posa, tempistiche e differenza reale.",
    },
    {
      title: "Più ticket medio",
      text: "Il cliente sceglie più volentieri finiture e infissi premium quando li vede già nella sua casa.",
    },
    {
      title: "Più autorevolezza commerciale",
      text: "Il cliente percepisce un metodo: rilievo, configurazione, render, PDF, preventivo e cantiere ordinato.",
    },
  ],

  featureKicker: "Cosa consegni",
  featureH2:
    "Non una bella immagine. Uno strumento commerciale per vendere meglio la ristrutturazione.",
  featureRows: [
    {
      label: "Prima/dopo sulle foto reali della casa",
      value: "Il cliente vede il proprio appartamento, le proprie stanze, la propria luce e il contesto reale dell'intervento.",
    },
    {
      label: "Scelte tecniche tracciate per stanza",
      value: "Pavimenti, infissi, bagni, cucina, tinteggiatura: tutte le scelte restano leggibili e collegate al render.",
    },
    {
      label: "PDF prima/dopo professionale",
      value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
    },
    {
      label: "CRM e cantieri collegati",
      value: "Ogni render può restare associato a contatto, opportunità e cantiere, così non perdi la storia commerciale.",
    },
    {
      label: "Gallery filtrabile",
      value: "Recuperi i render per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
    },
  ],

  scenarioKicker: "Uso sul campo",
  scenarioH2: "Tre momenti in cui il render della ristrutturazione può spostare la trattativa.",
  scenarios: [
    {
      title: "Sopralluogo a casa del cliente",
      text: "Scatti le foto delle stanze, raccogli preferenze e budget, poi trasformi il preventivo in una proposta visiva che resta impressa.",
    },
    {
      title: "Presentazione progetto e capitolato",
      text: "Mostri al cliente le scelte di finitura affiancate al prima/dopo: capisce subito dove vanno i suoi soldi.",
    },
    {
      title: "Preventivo fermo da qualche settimana",
      text: "Invii il prima/dopo su WhatsApp e riapri la conversazione: \"Le faccio vedere come cambierebbe la sua casa\".",
    },
  ],

  faqKicker: "Obiezioni frequenti",
  faqH2: "Le domande che un'impresa di ristrutturazione seria si fa prima di usarlo.",
  faqs: [
    {
      q: "Non rischio di promettere una casa identica al render?",
      a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, finiture e impatto visivo, con disclaimer chiaro nel PDF.",
    },
    {
      q: "Funziona anche per ristrutturazioni complete chiavi in mano?",
      a: "Sì, è il caso ideale. Più stanze e finiture sono coinvolte, più il prima/dopo aiuta il cliente a visualizzare e firmare.",
    },
    {
      q: "Si integra con il computo metrico estimativo?",
      a: "Sì. Il render è un allegato del preventivo: non sostituisce il CME, lo rende leggibile per il cliente.",
    },
    {
      q: "Vale anche per appartamenti piccoli o monolocali?",
      a: "Sì. Anche su 35-50 mq, vedere il prima/dopo della propria casa fa la differenza tra firmare e rimandare.",
    },
    {
      q: "Quanto costa? È vincolante?",
      a: "Il modulo Render Ristrutturazioni è incluso nel piano per imprese di ristrutturazione e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
    },
  ],

  internalLinksKicker: "Approfondisci",
  internalLinksH2:
    "Esplora come Edilizia in Cloud aiuta le imprese di ristrutturazione a vendere meglio.",
  internalLinksBody:
    "Render Ristrutturazioni AI è un modulo della piattaforma Edilizia in Cloud, il software gestionale per imprese edili italiane. Scopri tutti i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita",
      title: "Tutte le Funzionalità",
      text: "Cantieri, preventivi, margini, HR, fatturazione SDI e marketing in una sola piattaforma.",
    },
    {
      to: "/funzionalita/render-bagni",
      title: "Render Bagni",
      text: "Render AI per bagni: sanitari, doccia, mobile e rivestimenti nel bagno reale.",
    },
    {
      to: "/funzionalita/render-pavimenti",
      title: "Render Pavimenti",
      text: "Render AI per ogni pavimento di casa: gres, parquet, microcemento, resina.",
    },
    {
      to: "/funzionalita/render-stanza",
      title: "Render Stanza",
      text: "Render AI per cucina, soggiorno, camera: vedi insieme finiture e arredo.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi",
      text: "Render AI per nuovi serramenti: completa la proposta di ristrutturazione.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Pianifica fasi, manodopera e materiali della ristrutturazione in un'unica timeline.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Crea preventivi ristrutturazione professionali e li alleghi al render prima/dopo.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti per imprese di ristrutturazione. Beta dedicata con prezzo bloccato.",
    },
    {
      to: "/demo",
      title: "Prova GRATIS la Demo",
      text: "Carica le foto della casa e genera la tua prima ristrutturazione virtuale in minuti.",
    },
  ],

  finalCtaH2: "Se il concorrente manda solo un computo, tu manda una visione.",
  finalCtaBody:
    "Il cliente deve pensare: \"Questa è casa mia ristrutturata\". Quando succede, il preventivo diventa più concreto, più memorabile e più difficile da confrontare solo sul prezzo.",
  finalCtaButton: "Prova GRATIS Render Ristrutturazioni",
  finalCtaMicrocopy: "Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova GRATIS Render Ristrutturazioni",
  stickyCtaMicrocopy: "Onboarding incluso · Cancelli quando vuoi",

  applicationSubCategory: "Sales Enablement Ristrutturazioni",
};

export default function RenderRistrutturazioni() {
  return <RenderPageTemplate config={config} />;
}
