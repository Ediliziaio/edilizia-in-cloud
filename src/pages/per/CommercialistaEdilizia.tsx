import { FileText, Calculator, ShieldCheck, Building2, BarChart3, Database } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software Edilizia per Commercialisti — Gestionale White-Label | Edilizia in Cloud",
  seoDescription:
    "Gestionale per commercialisti che seguono clienti edili: cassetto fiscale SDI multi-cliente, F24 cassa edile pre-compilato, DURC tracciati, dashboard multi-azienda, white-label studio.",
  seoKeywords:
    "software commercialista edilizia, gestionale studio commercialista cantieri, contabilità edili, cassa edile commercialista, software fiscale edilizia, white label commercialista, multi-cliente edilizia, F24 cassa edile, DURC commercialista",
  seoCanonical: "/per/commercialista-edilizia",

  // Hero
  badge: "Per Commercialisti e Studi Fiscali",
  heroTitle: (
    <>
      <span className="text-white">I tuoi clienti edili</span>{" "}
      <span className="text-[#F97415]">parlano la stessa lingua</span>
    </>
  ),
  heroSubtitle:
    "Hai 30+ clienti edili e ognuno ti manda i documenti come gli pare: WhatsApp, email, foto sgranate, PDF a fine mese. Cassa edile, DURC, F24 specifici dell'edilizia ti rubano ore di lavoro per ogni cliente. Con Edilizia in Cloud gestisci tutti i tuoi clienti edili da un'unica piattaforma multi-azienda: accesso ruolo-based commercialista, sync automatico cassetto fiscale SDI, F24 cassa edile pre-compilato. In white-label, con il tuo brand.",
  heroImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "SB", name: "Studio Bianchi", city: "Milano", months: 14, gradient: "from-[#F97415] to-[#0d8f79]" },
    { initials: "RP", name: "Rossi & Partners", city: "Torino", months: 9, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "CV", name: "Studio Conti & Verdi", city: "Bologna", months: 18, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "FT", name: "Ferrari Tributaristi", city: "Padova", months: 11, gradient: "from-[#1a1a2e] to-[#F97415]" },
  ],

  // Problems
  problemsTitle: "Quanto ti costano davvero i tuoi clienti edili?",
  problemsSubtitle:
    "L'edilizia non è un settore come gli altri: cassa edile, DURC, F24 specifici, contributi paritetici. Ecco i 4 problemi che bruciano le ore del tuo studio ogni mese.",
  problems: [
    {
      emoji: "🏗️",
      title: "Cassa edile: ogni cliente, ogni mese, è una giungla diversa",
      desc: "Cassa Edile provinciale, percentuali diverse per inquadramento, contributi paritetici, APE, ferie e gratifiche. Per ogni cliente edile devi ricalcolare tutto a mano sul portale provinciale. Solo per la cassa edile spendi 1-2 ore a cliente, ogni mese.",
    },
    {
      emoji: "📋",
      title: "DURC scaduti che scopri quando il cliente perde la gara d'appalto",
      desc: "Il cliente ti chiama nel panico: 'Ho perso il SAL, il DURC è scaduto'. Ma tu non hai un sistema centrale per tracciare le scadenze DURC dei 30+ clienti edili. Ogni volta è una rincorsa con INPS, INAIL e cassa edile per regolarizzare in fretta.",
    },
    {
      emoji: "💸",
      title: "F24 sbagliati perché i codici tributo dell'edilizia sono un labirinto",
      desc: "Codici 6781, 6782, contributi cassa edile, ritenute condominio 4%, reverse charge edilizia: sbagli un codice tributo e il cliente paga sanzioni. Il cliente si arrabbia con te. E il rischio responsabilità professionale è sempre dietro l'angolo.",
    },
    {
      emoji: "📱",
      title: "I dati cliente arrivano via WhatsApp, email e foto sfocate",
      desc: "Il geometra ti manda il SAL su WhatsApp. Il titolare ti gira la fattura del fornitore via email. La segretaria ti chiama per leggerti i DDT. A fine mese hai 200 messaggi sparsi, niente è ordinato e ricostruire la contabilità diventa un incubo.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 18.000",
    lossLabel: "ore studio bruciate su raccolta documenti via WhatsApp/email",
    wasteValue: "€ 12.000",
    wasteLabel: "tempo speso a navigare 30+ cassetti fiscali e portali cassa edile",
    errorValue: "€ 6.500",
    errorLabel: "in sanzioni clienti per F24 sbagliati e DURC scaduti (rischio professionale)",
    totalLoss: "€ 36.500",
    softwareCost: "€ 2.388",
    roiX: "15x",
  },

  // Transformation
  transformation: {
    title: "Prima e dopo: lo studio che hai sempre voluto",
    subtitle:
      "Non ti chiediamo di cambiare gestionale di studio. Ti chiediamo di smettere di fare il lavoro che dovrebbe fare il cliente — e di usare un sistema pensato per la specificità dell'edilizia.",
    fromTitle: "Prima: caos quotidiano",
    fromItems: [
      "Documenti dei clienti che arrivano via WhatsApp, email e foto da ricostruire ogni mese",
      "Login manuale a 30+ cassetti fiscali SDI per scaricare le fatture passive",
      "Cassa edile calcolata a mano sul portale provinciale, cliente per cliente",
      "DURC scaduti scoperti quando il cliente perde una gara d'appalto",
      "F24 con codici tributo edilizia copiati a mano — un errore = sanzione cliente",
      "Bilanci CEE+XBRL preparati partendo da zero con export disordinato",
    ],
    toTitle: "Dopo: studio sotto controllo",
    toItems: [
      "Portale unico dove ogni cliente carica documenti, fatture e SAL — accesso commercialista in ruolo dedicato",
      "Cassetto fiscale SDI multi-cliente: tutte le fatture passive sincronizzate automaticamente ogni notte",
      "F24 cassa edile pre-compilato per ogni cliente: codici tributo, contributi paritetici, percentuali corrette",
      "Dashboard scadenze DURC di tutti i clienti — alert con 30 giorni di anticipo",
      "Esport bilancio CEE + XBRL con un click, pronti per il deposito Camera di Commercio",
      "White-label: il cliente vede il logo e i colori del tuo studio, non il nostro",
    ],
  },

  // Stats
  stats: [
    {
      value: "30+",
      label: "Clienti edili gestiti da un'unica dashboard",
      sublabel: "Multi-azienda con switch in 1 click — niente più 30 login al giorno",
    },
    {
      value: "0",
      label: "Errori F24 cassa edile",
      sublabel: "Codici tributo, contributi e percentuali pre-compilati per ogni cliente",
    },
    {
      value: "−80%",
      label: "Tempo di raccolta dati clienti",
      sublabel: "Niente più rincorse via WhatsApp: il cliente carica direttamente nel portale",
    },
    {
      value: "100%",
      label: "DURC tracciati con alert preventivo",
      sublabel: "Mai più clienti che perdono gare per DURC scaduti dimenticati",
    },
  ],

  // Modules
  modulesTitle: "Sei moduli pensati per chi gestisce edilizia, non commercio",
  modulesSubtitle:
    "Abbiamo lavorato con decine di studi commercialisti specializzati in edilizia. Questi sono i moduli che fanno davvero la differenza nel tuo lavoro quotidiano.",
  modules: [
    {
      icon: Database,
      name: "Cassetto SDI Multi-Cliente",
      desc: "Sincronizzazione automatica con il cassetto fiscale Agenzia Entrate per tutti i tuoi clienti edili. Fatture attive e passive scaricate ogni notte, riconciliate automaticamente. Un'unica dashboard per 30+ partite IVA.",
      saving: "−5h/mese per cliente",
    },
    {
      icon: Building2,
      name: "Cassa Edile Provinciale",
      desc: "Tutte le casse edili provinciali italiane integrate. Contributi paritetici, APE, ferie, gratifiche, percentuali per inquadramento: il sistema calcola automaticamente in base alla provincia del cliente. Export pronto per il portale.",
      saving: "−2h/mese per cliente edile",
    },
    {
      icon: Calculator,
      name: "F24 Cassa Edile Automatico",
      desc: "F24 pre-compilato con tutti i codici tributo dell'edilizia: 6781, 6782, contributi cassa edile, ritenute condominio 4%, reverse charge. Generazione bulk per tutti i clienti in un solo click. Zero errori, zero sanzioni.",
      saving: "Zero rischio professionale",
    },
    {
      icon: ShieldCheck,
      name: "DURC Tracking Centralizzato",
      desc: "Dashboard con scadenze DURC di tutti i tuoi clienti edili. Alert automatico 30, 15 e 7 giorni prima della scadenza. Verifica online INPS/INAIL/Cassa Edile integrata. Mai più clienti che perdono gare per DURC scaduti.",
      saving: "0 gare perse per DURC scaduti",
    },
    {
      icon: FileText,
      name: "Bilancio CEE + XBRL",
      desc: "Genera bilancio CEE in formato standard e XBRL pronto per il deposito al Registro Imprese. Riclassificazioni automatiche, conti di mastro, partitari. Export compatibile con Profis, Bilancio Plus e i principali tool del settore.",
      saving: "Da 4 ore a 20 minuti",
    },
    {
      icon: BarChart3,
      name: "Dashboard Multi-Azienda",
      desc: "Visione consolidata di tutti i tuoi clienti edili: fatturato, scadenze, anomalie, alert fiscali. Switch tra clienti in 1 click. Accesso ruolo-based commercialista (sola lettura o piena gestione). White-label con il tuo brand.",
      saving: "1 dashboard, 30+ clienti",
    },
  ],

  // Case Study
  caseStudy: {
    company: "Studio Bianchi & Associati",
    city: "Milano",
    sector: "Studio commercialista specializzato in edilizia — 38 clienti edili attivi",
    revenue: "620.000 €",
    person: "Andrea Bianchi",
    role: "Dottore Commercialista",
    initials: "AB",
    gradient: "from-[#F97415] to-[#0d8f79]",
    quote:
      "Avevamo 38 clienti edili e ogni mese era un incubo: WhatsApp infiniti per recuperare i documenti, errori sui F24 della cassa edile, DURC scaduti scoperti per caso. Con Edilizia in Cloud abbiamo dato a ogni cliente un portale dove carica tutto. Noi vediamo 38 aziende da una sola dashboard, con il nostro logo. Lo studio fattura il 28% in più con 1 collaboratore in meno.",
    metrics: [
      { label: "Clienti edili gestiti", before: "38 (con 4 collaboratori)", after: "52 (con 3 collaboratori)" },
      { label: "Tempo raccolta documenti/mese", before: "60 ore studio", after: "12 ore studio" },
      { label: "Errori F24 cassa edile/anno", before: "8-10 (con sanzioni)", after: "0" },
      { label: "Fatturato annuo studio", before: "485.000 €", after: "620.000 €" },
    ],
  },

  // FAQ
  faq: [
    {
      q: "Come gestisce davvero più aziende clienti dello stesso studio?",
      a: "Edilizia in Cloud nasce multi-azienda: ogni cliente edile è una sua entità con dati separati, ma il commercialista ha un'unica dashboard con switch tra clienti in 1 click. Crei un account 'studio commercialista' che vede tutti i clienti collegati, con permessi ruolo-based (sola lettura, modifica, amministrazione). Niente più 30 login al giorno.",
    },
    {
      q: "Quanto costa per uno studio con 30+ clienti edili?",
      a: "Il piano studio commercialista parte da 199 euro/mese e include accesso commercialista illimitato. Per i clienti edili paga il cliente stesso al suo piano (da 79 €/mese). In alternativa, il piano white-label all-inclusive permette allo studio di rivendere ai clienti con il proprio brand e marginare. Calcolo personalizzato in 15 minuti di chiamata.",
    },
    {
      q: "Quanta formazione serve per i collaboratori dello studio?",
      a: "2 ore di onboarding guidato per i collaboratori dello studio e 30 minuti per ogni cliente edile. L'interfaccia commercialista replica logiche già note (cassetto fiscale, F24, scadenzario): nessuna nuova logica da imparare. Materiale formativo in italiano, video tutorial e supporto telefonico diretto compresi.",
    },
    {
      q: "È conforme GDPR e alla normativa sulla privacy dei clienti?",
      a: "Sì, completamente. Server in UE (Francoforte e Milano), crittografia AES-256 a riposo e TLS 1.3 in transito, log di accesso conformi GDPR, DPA firmato con ogni studio commercialista. Backup giornalieri ridondati. Conforme alla normativa CNDCEC sulla gestione dati clienti dello studio professionale.",
    },
    {
      q: "Gestisce davvero tutte le casse edili provinciali italiane?",
      a: "Sì. Il sistema integra le 90+ casse edili provinciali italiane con percentuali aggiornate, contributi paritetici, APE, ferie, gratifiche e codici tributo specifici. Quando una cassa edile aggiorna le aliquote (2 volte l'anno tipicamente), il sistema si aggiorna automaticamente. Nessun aggiornamento manuale da parte tua.",
    },
    {
      q: "Posso offrire il software ai miei clienti in white-label con il brand del mio studio?",
      a: "Sì. Il piano white-label studio permette di rivendere Edilizia in Cloud ai tuoi clienti con il logo, i colori e il dominio del tuo studio. Il cliente non vede il nostro brand. Tu margini sul prezzo cliente e mantieni il rapporto diretto. Setup white-label in 5 giorni lavorativi, senza costi una tantum.",
    },
  ],

  verticalFeatures: [
    {
      icon: Database,
      problem: "Per ogni cliente edile devi loggare nel suo cassetto fiscale, scaricare fatture, conciliare a mano",
      solution: "Edilizia in Cloud sincronizza ogni notte tutti i cassetti fiscali SDI dei tuoi clienti. Le fatture attive e passive arrivano già riconciliate nella dashboard commercialista. Tu accedi con un solo login al tuo studio e vedi 30+ clienti pronti per la registrazione contabile.",
      economicBenefit: "−5h/mese",
      benefitLabel: "per cliente, solo su accesso cassetto e download fatture",
    },
    {
      icon: Building2,
      problem: "La cassa edile provinciale è diversa per ogni cliente — calcoli a mano per ognuno",
      solution: "Il modulo Cassa Edile riconosce la provincia del cliente, applica percentuali e contributi paritetici corretti, calcola APE, ferie, gratifiche. Genera l'export pronto per il portale provinciale e l'F24 con i codici tributo giusti. Tutto bulk, per tutti i clienti, in 5 minuti.",
      economicBenefit: "−2h/mese",
      benefitLabel: "per cliente edile, solo sulla cassa edile",
    },
    {
      icon: ShieldCheck,
      problem: "Il cliente perde una gara per DURC scaduto e tu scopri di essere il responsabile",
      solution: "La dashboard DURC mostra le scadenze di tutti i tuoi clienti edili in un'unica vista. Alert automatici a 30, 15 e 7 giorni dalla scadenza. Verifica online integrata con INPS, INAIL e Cassa Edile. Il cliente non perde mai una gara — e tu non perdi mai un cliente.",
      economicBenefit: "0 contestazioni",
      benefitLabel: "rischio responsabilità professionale ridotto a zero",
    },
    {
      icon: Calculator,
      problem: "F24 con codici tributo edilizia sbagliati = cliente che paga sanzioni e si arrabbia con te",
      solution: "F24 pre-compilato con tutti i codici tributo edilizia (6781, 6782, ritenuta 4% condominio, reverse charge, contributi cassa edile). Generazione bulk per tutti i clienti, validazione automatica prima dell'invio. Zero errori, zero sanzioni, zero telefonate del cliente arrabbiato.",
      economicBenefit: "€ 6.500/anno",
      benefitLabel: "in sanzioni clienti evitate (e rischio professionale)",
    },
    {
      icon: FileText,
      problem: "Bilancio CEE + XBRL: 4 ore di lavoro a cliente, con riclassificazioni manuali",
      solution: "Bilancio CEE generato automaticamente dai dati contabili, con riclassificazioni automatiche secondo schema civilistico. Export XBRL pronto per il deposito al Registro Imprese. Compatibile con Profis, Bilancio Plus e i principali tool del settore. Da 4 ore a 20 minuti.",
      economicBenefit: "−3,5h",
      benefitLabel: "per ogni bilancio cliente edile depositato",
    },
    {
      icon: BarChart3,
      problem: "I tuoi clienti vedono il logo di un fornitore software, non quello del tuo studio",
      solution: "Modalità white-label: logo, colori, dominio del tuo studio commercialista. Il cliente vede 'Software Edilizia Studio Bianchi', non 'Edilizia in Cloud'. Tu mantieni il rapporto diretto con il cliente, margini sul prezzo e rafforzi il brand dello studio. Setup in 5 giorni.",
      economicBenefit: "+30%",
      benefitLabel: "marginalità dello studio sui servizi software ai clienti",
    },
  ],
  verticalFeaturesTitle: "Multi-cliente, multi-cassa edile, white-label: pensato per il tuo studio",
  verticalFeaturesSubtitle:
    "L'unico gestionale italiano progettato specificatamente per commercialisti che seguono clienti edili. Ogni feature risolve un problema concreto del tuo studio.",
  demoLabel: "Demo studio commercialista — vedi come gestire 30+ clienti edili da una sola dashboard, con il tuo brand",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">30+ clienti edili,</span>{" "}
      <span className="text-[#F97415]">una sola dashboard.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo dedicata agli studi commercialisti: ti mostriamo dashboard multi-cliente, F24 cassa edile bulk, DURC tracking e modalità white-label. Nessun impegno. Setup in 5 giorni.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior software per commercialisti che seguono clienti edili?",
      a: "Edilizia in Cloud è l'unico gestionale italiano specificatamente pensato per commercialisti con clienti edili: cassetto fiscale SDI multi-cliente, F24 cassa edile pre-compilato, DURC tracking centralizzato, dashboard multi-azienda e modalità white-label con il brand dello studio.",
    },
    {
      q: "Un commercialista può gestire più clienti edili con un unico software?",
      a: "Sì. Edilizia in Cloud nasce multi-azienda: dashboard unica con switch tra clienti in 1 click, accesso ruolo-based commercialista, sincronizzazione automatica dei cassetti fiscali SDI di tutti i clienti, F24 cassa edile generati bulk per tutti i clienti contemporaneamente.",
    },
    {
      q: "Come gestisce la cassa edile per i commercialisti?",
      a: "Edilizia in Cloud integra tutte le 90+ casse edili provinciali italiane con percentuali aggiornate, contributi paritetici, APE, ferie e gratifiche. F24 cassa edile pre-compilato con codici tributo corretti (6781, 6782) generato in bulk per tutti i clienti edili dello studio.",
    },
    {
      q: "Esiste un software in white-label per studi commercialisti edili?",
      a: "Sì. Edilizia in Cloud offre la modalità white-label: lo studio commercialista rivende il gestionale ai clienti edili con il proprio logo, colori e dominio. Setup in 5 giorni lavorativi, senza costi una tantum, con marginalità diretta sullo studio.",
    },
  ],
};

export default function CommercialistaEdilizia() {
  return <PerTipoPageTemplate config={config} />;
}
