import {
  AppWindow,
  BadgeCheck,
  Camera,
  Clock,
  FileText,
  Home,
  Layers,
  LineChart,
  MessageCircle,
  Mountain,
  Send,
  ShieldCheck,
  Sun,
  Target,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import RenderPageTemplate from "./RenderPageTemplate";
import type { RenderPageConfig } from "./types";

const config: RenderPageConfig = {
  slug: "render-tetti",
  vertical: "Tetti",
  productName: "Render Tetti AI",
  audience: "Imprese di copertura, lattonieri, installatori fotovoltaico, rivenditori coperture",
  audienceShort: "imprese di copertura e lattonieri",

  seo: {
    title: "Render Tetti AI per Imprese di Copertura",
    description:
      "Render Tetti AI: trasforma la foto reale dell'immobile del cliente in un prima/dopo credibile con nuove tegole, manto di copertura, gronde, lattoneria,…",
    keywords:
      "render tetto, render tetti AI, software imprese copertura, configuratore tetto online, render tegole, render lattoneria, render manto copertura, render fotovoltaico tetto, prima dopo tetto, software lattonieri, gestionale coperture",
    ogImage: "https://www.ediliziaincloud.com/og/render-tetti-og.jpg",
  },

  heroBadge: "Render AI per imprese di copertura · Beta",
  heroH1:
    "Render Tetti AI: fai vedere al cliente come sarà la sua casa con il nuovo tetto, prima del prezzo.",
  heroSubheadline:
    "Render Tetti AI trasforma la foto reale dell'immobile in un prima/dopo credibile: nuovi manti di copertura, tegole, gronde, lattoneria, lucernari e impianto fotovoltaico applicati alla stessa casa. Il preventivo non è più un elenco di metri quadrati, ma una proposta che il cliente riesce finalmente a vedere.",
  heroPrimaryCta: "Prova GRATIS Render Tetti",

  reassurancePoints: ["Setup in 60 secondi", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per imprese di copertura e lattonieri",
    "Prima/dopo sulla foto reale dell'immobile",
    "PDF e WhatsApp pronti per il follow-up",
  ],

  objectiveRow: [
    ["Obiettivo", "Far dire al cliente: adesso lo vedo sul mio tetto"],
    ["Momento chiave", "Sopralluogo, preventivo e follow-up"],
    ["Risultato", "Meno trattativa al ribasso, più cantieri firmati"],
  ],

  betaH2: "Stiamo aprendo l'accesso alle prime 100 imprese di copertura italiane.",
  betaBody:
    "Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto. Quando i 100 posti saranno chiusi, il prezzo sale.",

  speedH2: "In 60 secondi trasformi una foto del tetto in un argomento di vendita.",
  speedSubheadline:
    "Non aspetti rendering 3D di studio. Carichi la foto della casa, scegli manto, gronde, lucernari ed eventuale fotovoltaico e ottieni un prima/dopo da usare subito in trattativa.",
  speedStats: [
    { value: 60, suffix: " sec", label: "per ottenere un render tetto da usare in trattativa" },
    { value: 11, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
    { value: 3, prefix: "x", suffix: "", label: "preventivi ricordati in più rispetto al solo PDF" },
  ],

  videoH2: "Vedi in 60 secondi come trasformi una foto della casa in un cantiere firmato.",
  videoSubheadline:
    "Carichi la foto del tetto, scegli tegole, manto, gronde, lucernari e fotovoltaico, generi il prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.",

  familyH2: "Non solo tetti. Un render AI per ogni intervento sulla casa del cliente.",
  familySubheadline:
    "Lo stesso meccanismo del Render Tetti, esteso a tutte le categorie del mondo edilizia residenziale: facciata, infissi, ristrutturazione e oltre.",
  familyItems: [
    {
      icon: Home,
      title: "Render Tetti",
      text: "Manti di copertura, tegole, coppi e lattoneria sulla foto reale dell'immobile.",
      available: true,
    },
    {
      icon: Layers,
      title: "Render Manto Copertura",
      text: "Tegole, coppi, lamiera, ardesia: confronti i materiali sulla casa reale del cliente.",
      available: true,
    },
    {
      icon: Sun,
      title: "Render Fotovoltaico",
      text: "Pannelli fotovoltaici e batterie posizionati sul tetto reale, con orientamento e impatto visivo.",
      available: true,
    },
    {
      icon: AppWindow,
      title: "Render Lucernari",
      text: "Velux e finestre per tetto integrate nella copertura del cliente, viste dall'esterno.",
      available: true,
    },
    {
      icon: Mountain,
      title: "Render Facciata",
      text: "Cappotto, intonaco e tinteggiatura coordinati al nuovo tetto: una proposta visiva completa.",
      available: true,
    },
  ],
  familyBonusTitle: "Tutta la suite Render AI",
  familyBonusText:
    "Accedi a tutti i moduli con un unico abbonamento. Tetto, facciata, fotovoltaico e infissi inclusi senza costi extra.",

  painKicker: "Il problema vero",
  painH2: "Il cliente non sta scegliendo solo le tegole. Sta decidendo se fidarsi di te.",
  painSubheadline:
    "L'impresa di copertura brava spiega bene. Quella che chiude meglio fa vedere. Quando il cliente riconosce la propria casa con il nuovo tetto, smette di confrontare solo il prezzo al metro quadro.",
  painPoints: [
    {
      icon: Clock,
      title: "Il cliente non compra il manto: compra certezza",
      text: "Tu parli di pendenze, isolamento, ventilazione e lattoneria. Lui pensa: \"come sarà alla fine la mia casa?\". Se non riesce a vederlo, rimanda.",
    },
    {
      icon: XCircle,
      title: "Se il valore non si vede, vince lo sconto",
      text: "Quando due preventivi tetto sembrano simili, il cliente sceglie il più economico. Anche se la tua qualità di posa, le garanzie e i materiali valgono molto di più.",
    },
    {
      icon: MessageCircle,
      title: "I tetti si confrontano in pochi giorni",
      text: "Il cliente chiama 3 imprese, chiede preventivo e poi sparisce. Devi rimanere nella sua testa con un'immagine concreta della SUA casa.",
    },
  ],

  baKicker: "Prima e dopo, dove conta davvero",
  baH2: "Mostri le aree del tetto che fanno decidere il cliente.",
  baSubheadline:
    "Il render deve aiutare il cliente a capire cosa cambia sulla sua casa: manto, gronde, lattoneria, lucernari ed eventuale fotovoltaico, che normalmente restano voci tecniche di preventivo.",
  baAreas: [
    {
      title: "Manto di copertura",
      before: "Tegole vecchie, manto scoloso e segni di muschio: la casa sembra trascurata anche se i muri sono in ordine.",
      after: "Nuovo manto coordinato, colore omogeneo e resa estetica che valorizza tutta la facciata.",
    },
    {
      title: "Gronde, scossaline e lattoneria",
      before: "Lattoneria zincata datata, gronde piegate e pluviali fuori asse che sporcano la facciata.",
      after: "Lattoneria nuova in alluminio o rame, scossaline coordinate al manto: il dettaglio fa la differenza.",
    },
    {
      title: "Lucernari e finestre per tetto",
      before: "Sottotetto buio, scarsa areazione e impossibilità di valorizzare il volume disponibile.",
      after: "Lucernari ben integrati, luce naturale in più e percezione di spazio e abitabilità.",
    },
    {
      title: "Fotovoltaico e impianti integrati",
      before: "Pannelli ipotetici da \"immaginare\": il cliente non sa come staranno sul SUO tetto.",
      after: "Pannelli fotovoltaici posizionati realmente sulla copertura: produzione stimata e impatto visivo trasparente.",
    },
  ],

  mechanismKicker: "Il meccanismo",
  mechanismH2: "Una dimostrazione visiva che entra nella scelta del tetto al momento giusto.",
  mechanismSubheadline:
    "Non vendi \"intelligenza artificiale\". Vendi sicurezza: questa è la sua casa con il nuovo tetto, le gronde e i lucernari che gli stai proponendo.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Scatti o carichi la foto della casa",
      text: "Vista da terra, drone o foto di archivio: parti dall'immobile reale del cliente, non da un'illustrazione.",
    },
    {
      icon: AppWindow,
      title: "Scegli manto, gronde, lucernari e fotovoltaico",
      text: "Imposti tegole, coppi, lattoneria, finestre per tetto e pannelli FV. Le scelte tecniche diventano una proposta visibile.",
    },
    {
      icon: FileText,
      title: "Mostri un prima/dopo che fa decidere",
      text: "Consegni un PDF prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
    },
  ],
  mechanismCta: "Provalo gratis sulla foto della casa del tuo cliente",

  commercialKicker: "Perché funziona commercialmente",
  commercialH2: "Se il cliente non vede la differenza sul tetto, ti chiederà lo sconto.",
  commercialBody:
    "La maggior parte dei concorrenti consegna preventivi pieni di metri quadri e schede tecniche. Tu puoi consegnare una prova visiva: stessa casa, nuovo tetto, impatto immediato.",
  commercialLevers: [
    {
      icon: Target,
      title: "Rendi visibile il valore",
      text: "Il cliente non valuta solo il costo al metro quadro. Valuta l'effetto finale sulla sua casa, sul colore del manto e sull'estetica complessiva.",
    },
    {
      icon: ShieldCheck,
      title: "Riduci il rischio percepito",
      text: "Tonalità del manto, lattoneria e posizione lucernari non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
    },
    {
      icon: Zap,
      title: "Acceleri il follow-up",
      text: "Non richiami dicendo solo \"ha visto il preventivo tetto?\". Richiami partendo da un'immagine chiara della SUA casa con il nuovo tetto.",
    },
    {
      icon: BadgeCheck,
      title: "Ti posizioni sopra il concorrente",
      text: "Non sembri l'impresa che manda un prezzo. Sembri il consulente che guida il cliente in una scelta più sicura.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il render del tetto è solo l'inizio. Il vero salto è quando entra nel tuo CRM.",
  resultsBody:
    "Edilizia in Cloud collega il render al contatto, all'opportunità, al preventivo e alla fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto in un'unica timeline e chiudi il cerchio sulla trattativa.",
  integrationPillars: [
    {
      icon: Users,
      title: "CRM coperture integrato",
      text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
    },
    {
      icon: Send,
      title: "Follow-up automatici WhatsApp & email",
      text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo tetto. Smetti di dimenticarti i clienti tiepidi.",
    },
    {
      icon: LineChart,
      title: "Dashboard margini cantieri tetto",
      text: "Vedi quanti preventivi hai inviato, quanti chiusi, quale margine reale stai facendo per cantiere copertura e quanto rende ogni canale di acquisizione.",
    },
    {
      icon: FileText,
      title: "Preventivi e fatturazione SDI",
      text: "Dal render al preventivo PDF, dall'ordine alla fattura elettronica: una sola piattaforma, zero duplicazioni e zero copia-incolla.",
    },
  ],
  resultStats: [
    { value: 35, suffix: "%", label: "in più di preventivi tetto visualizzati dal cliente" },
    { value: 11, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
    { value: 7, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo tetto" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto fatturato tetto in più puoi fare con un prima/dopo in trattativa?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: preventivi al mese, ticket medio cantiere e close rate. La stima parte da +12 punti di chiusura.",
  roiPreventiviLabel: "Preventivi tetto al mese",
  roiTicketLabel: "Ticket medio per cantiere",

  salesKicker: "Più cantieri firmati, meno preventivi dimenticati",
  salesH2: "Il render del tetto non serve a fare scena. Serve a far avanzare la decisione.",
  salesBody:
    "Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo. Il prima/dopo del tetto crea quella ragione: visuale, semplice, immediata.",
  salesImpact: [
    {
      title: "Preventivi tetto meno freddi",
      text: "Il follow-up non parte da un metro quadrato, ma da un'immagine: \"Le mando come cambierebbe la sua casa\".",
    },
    {
      title: "Meno confronto al ribasso",
      text: "Quando il cliente vede il risultato, è più facile parlare di qualità del manto, posa, garanzia e differenza reale.",
    },
    {
      title: "Più decisione su materiale e accessori",
      text: "Tegole, lattoneria e lucernari diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione.",
    },
    {
      title: "Più autorevolezza commerciale",
      text: "Il cliente percepisce un metodo: rilievo, configurazione, render, PDF, preventivo e follow-up ordinato.",
    },
  ],

  featureKicker: "Cosa consegni",
  featureH2: "Non una bella immagine. Uno strumento commerciale per vendere meglio i cantieri tetto.",
  featureRows: [
    {
      label: "Prima/dopo sulla foto reale della casa",
      value: "Il cliente vede la propria copertura, le proprie gronde e il contesto reale dell'intervento.",
    },
    {
      label: "Scelte tecniche tracciate",
      value: "Manto, lattoneria, lucernari, fotovoltaico ed eventuali finiture restano leggibili e collegati al render.",
    },
    {
      label: "PDF prima/dopo professionale",
      value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
    },
    {
      label: "CRM collegato",
      value: "Ogni render tetto può restare associato a contatto e opportunità, così non perdi la storia commerciale della trattativa.",
    },
    {
      label: "Gallery filtrabile",
      value: "Recuperi i render tetto per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
    },
  ],

  scenarioKicker: "Uso sul campo",
  scenarioH2: "Tre momenti in cui il render tetto può spostare davvero la trattativa.",
  scenarios: [
    {
      title: "Sopralluogo a casa del cliente",
      text: "Scatti la foto della casa, raccogli preferenze e vincoli, poi trasformi il preventivo in una proposta visiva che resta impressa.",
    },
    {
      title: "Preventivo tetto fermo da qualche giorno",
      text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe la sua casa\".",
    },
    {
      title: "Confronto materiali e fotovoltaico",
      text: "Fai confrontare manto in tegola o lamiera, presenza o meno di fotovoltaico, lucernari sì o no, in modo immediato.",
    },
  ],

  faqKicker: "Obiezioni frequenti",
  faqH2: "Le domande che un'impresa di copertura seria si fa prima di usarlo.",
  faqs: [
    {
      q: "Non rischio di promettere un tetto identico al render?",
      a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, colori, proporzioni e impatto visivo, con disclaimer chiaro nel PDF.",
    },
    {
      q: "Funziona anche con foto da drone?",
      a: "Sì. Vista frontale, da drone o di archivio: il modulo lavora sulla foto che hai disponibile, riconosce la copertura e ti permette di sostituirla.",
    },
    {
      q: "Si integra con i preventivi al metro quadro?",
      a: "Sì. Il render diventa un allegato del preventivo già esistente: non sostituisce il computo metrico, lo rende leggibile per il cliente.",
    },
    {
      q: "Vale anche per condomini e tetti complessi?",
      a: "Sì. Il modulo è pensato per case singole, bifamiliari, capannoni e condomini. Più la copertura è grande, più il prima/dopo aiuta a giustificare l'investimento.",
    },
    {
      q: "Quanto costa? È vincolante?",
      a: "Il modulo Render Tetti è incluso nel piano per imprese di copertura e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
    },
  ],

  internalLinksKicker: "Approfondisci",
  internalLinksH2: "Esplora come Edilizia in Cloud aiuta le imprese di copertura a vendere meglio.",
  internalLinksBody:
    "Render Tetti AI è un modulo della piattaforma Edilizia in Cloud, il software gestionale per imprese edili e lattonieri italiani. Scopri tutti i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita",
      title: "Tutte le Funzionalità",
      text: "Cantieri, preventivi, margini, HR, fatturazione SDI e marketing in una sola piattaforma.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi",
      text: "Render AI per nuovi serramenti: completa la proposta tetto + facciata + finestre.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni",
      text: "Render AI per ristrutturazioni complete: tetto, facciata, interni e impianti.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Pianifica fasi, manodopera e materiali del cantiere copertura in un'unica timeline.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Crea preventivi tetto professionali e li alleghi al render prima/dopo.",
    },
    {
      to: "/funzionalita/margini-cantiere",
      title: "Margini Cantiere",
      text: "Vedi quanto guadagni davvero su ogni cantiere tetto: costi, ricavi, marginalità.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti per imprese di copertura. Beta dedicata con prezzo bloccato.",
    },
    {
      to: "/demo",
      title: "Prova GRATIS la Demo",
      text: "Carica una foto della casa e genera il tuo primo render tetto in 60 secondi.",
    },
    {
      to: "/blog",
      title: "Blog · Vendita coperture",
      text: "Consigli pratici su trattativa, follow-up e strategie di vendita per imprese di copertura.",
    },
  ],

  finalCtaH2: "Se il concorrente manda solo un prezzo al metro quadro, tu manda una visione.",
  finalCtaBody:
    "Il cliente deve pensare: \"Questa è la mia casa con il nuovo tetto\". Quando succede, il preventivo diventa più concreto, più memorabile e più difficile da confrontare solo sul prezzo.",
  finalCtaButton: "Prova GRATIS Render Tetti",
  finalCtaMicrocopy: "Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova GRATIS Render Tetti",
  stickyCtaMicrocopy: "Onboarding incluso · Cancelli quando vuoi",

  applicationSubCategory: "Sales Enablement Coperture",
};

export default function RenderTetti() {
  return <RenderPageTemplate config={config} />;
}
