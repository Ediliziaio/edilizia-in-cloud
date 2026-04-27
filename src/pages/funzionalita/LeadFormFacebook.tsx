import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Database,
  Euro,
  Facebook,
  Filter,
  Headphones,
  Instagram,
  Layers,
  Megaphone,
  MessageSquare,
  Phone,
  PieChart,
  Rocket,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "lead-form-facebook",
  vertical: "Lead Form Facebook",
  productName: "Modulo Lead Form Facebook Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, installatori fotovoltaico, serramentisti che fanno campagne Facebook/Instagram Lead Ads e hanno bisogno di sync automatico CRM, qualificazione AI dei lead, distribuzione ai commerciali e tracking conversione media lead-cliente nel mondo edilizia",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Lead Form Facebook Edilizia — Sync CRM Automatica, Qualificazione AI, Distribuzione Commerciali | Edilizia in Cloud",
    description:
      "Integrazione Lead Ads Facebook e Instagram per imprese edili: sync automatica al CRM, qualificazione AI dei lead, distribuzione ai commerciali, tracking conversione lead-cliente. Risposta entro 5 minuti, conversione +60%.",
    keywords:
      "lead form facebook edilizia, lead ads facebook imprese edili, sync CRM lead facebook, qualificazione AI lead edilizia, lead facebook ristrutturazione, lead instagram fotovoltaico, distribuzione lead commerciali, conversione lead edilizia, lead generation imprese costruzione, lead facebook automazione",
    ogImage: "https://www.ediliziaincloud.com/og/lead-form-facebook-og.jpg",
  },

  heroBadge: "Funzionalità · Lead Form Facebook",
  heroH1Lead: "Lead Facebook qualificati e distribuiti",
  heroH1Highlight: "in 5 minuti",
  heroH1Tail: "non in 3 giorni",
  heroSubheadline:
    "Integrazione nativa Lead Ads Facebook e Instagram per imprese edili: ogni lead arriva in tempo reale nel CRM, viene qualificato dall'AI per intent (preventivo immediato, info, curiosità), distribuito al commerciale giusto per zona/specializzazione, contattato entro 5 minuti via SMS+email+WhatsApp. Conversione lead-cliente che cresce del 60% al primo mese.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con account Facebook collegato",
    "Qualificazione AI per intent edilizia",
    "Distribuzione automatica ai commerciali",
  ],
  proofPoints: [
    "Sync real-time CRM senza Zapier",
    "Risposta lead entro 5 minuti",
    "Conversione media lead-cliente +60%",
  ],

  objectiveRow: [
    ["Obiettivo", "Trasformare lead Facebook in clienti edili paganti"],
    ["Momento chiave", "Entrata lead, qualificazione AI, prima telefonata"],
    ["Risultato", "Conversione +60%, costo per cliente -30%, niente lead persi"],
  ],

  betaH2:
    "Più di 290 imprese edili italiane convertono lead Facebook in clienti paganti con Edilizia in Cloud.",
  betaBody:
    "Attiviamo il modulo Lead Form Facebook in 48 ore: colleghiamo il tuo Business Manager Facebook/Instagram, configuriamo sync con tutte le campagne Lead Ads attive, calibriamo qualificazione AI sui pattern del tuo settore (ristrutturazioni, fotovoltaico, serramenti), distribuiamo ai commerciali. 4 sessioni 1-a-1 fino al primo lead convertito in cliente.",

  speedH2:
    "Lead Facebook risponde entro 5 minuti = conversione 21x più alta che dopo 30 minuti. È la differenza tra impresa che cresce e impresa che spende soldi in advertising senza ROI.",
  speedSubheadline:
    "Studi marketing dimostrano che la probabilità di chiudere un lead Facebook crolla del 80% dopo 30 minuti dal click. L'impresa edile media risponde dopo 6-24 ore: il lead è già stato contattato dalla concorrenza. Edilizia in Cloud porta la risposta sotto i 5 minuti con qualificazione AI e distribuzione automatica.",
  speedStats: [
    { value: 5, suffix: " min", label: "tempo medio risposta lead Facebook" },
    { value: 60, prefix: "+", suffix: "%", label: "conversione lead-cliente" },
    { value: 30, prefix: "-", suffix: "%", label: "costo per cliente acquisito" },
  ],

  familyH2: "I lead Facebook vivono dentro CRM, automazioni, WhatsApp e pipeline vendite.",
  familySubheadline:
    "Un lead Facebook non è un foglio Excel: è il primo punto di contatto di un cliente che probabilmente non sa ancora che ti sceglierà. Edilizia in Cloud trasforma quel click in una conversazione strutturata, una telefonata pianificata, una pipeline di vendita che si chiude.",
  familyItems: [
    {
      icon: Facebook,
      title: "Lead Form Facebook",
      text: "Lead Ads sync automatica CRM, qualificazione AI, distribuzione commerciali.",
      to: "/funzionalita/lead-form-facebook",
    },
    {
      icon: Database,
      title: "CRM Edilizia",
      text: "Lead Facebook entrano nel CRM con anagrafica, intent, storico campagna.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: Zap,
      title: "Automazioni",
      text: "Sequenza automatica SMS/email/WhatsApp dopo lead, follow-up programmati.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp Marketing",
      text: "Primo contatto WhatsApp Business in 5 minuti, conversione media +60%.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: PieChart,
      title: "Pipeline Vendite",
      text: "Pipeline lead-cliente con probabilità chiusura, tracking commerciali, ROI campagna.",
      to: "/funzionalita/pipeline-vendite",
    },
    {
      icon: Bot,
      title: "Agenti AI",
      text: "Qualificazione automatica intent lead edilizia, primo contatto AI conversazionale.",
      to: "/funzionalita/agenti-ai",
    },
  ],
  familyBonusTitle: "Una piattaforma. Dal click alla firma del contratto.",
  familyBonusText:
    "Quando un lead arriva da Facebook Ads, l'AI legge intent (preventivo subito, informazioni, curiosità), CRM crea contatto, automazione manda SMS+WhatsApp di conferma, commerciale riceve task con tutti i dati, pipeline aggiorna probabilità chiusura. Tutto in tempo reale, senza Zapier, senza data entry duplicato.",

  painKicker: "Il problema vero",
  painH2:
    "Spendi 5.000€/mese in Facebook Ads per generare 200 lead. 130 li perdi entro 30 minuti. È così che brucia il budget marketing edilizia.",
  painSubheadline:
    "Le imprese edili che fanno Facebook Lead Ads hanno spesso un grosso problema strutturale: i lead arrivano nel Business Manager, scaricati a mano la sera dal commerciale, contattati dopo 1-3 giorni. Quando finalmente chiami, il lead ha già parlato con 3 concorrenti. Il budget Facebook brucia senza ROI.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Lead scaricati a mano la sera = lead morti",
      text: "Commerciale entra nel Business Manager Facebook la sera, esporta CSV, lo carica nel CRM o lo apre in Excel. 12-24 ore di ritardo. Su 200 lead/mese, 130 sono già stati contattati dalla concorrenza. Budget Facebook bruciato.",
    },
    {
      icon: Filter,
      title: "Lead di qualità mischiati con curiosità",
      text: "Lead Form Facebook produce 3 tipi: 'voglio preventivo subito', 'voglio info', 'ho cliccato per sbaglio'. Senza qualificazione AI il commerciale chiama tutti come se fossero uguali, perde tempo sui curiosi e arriva tardi sui hot.",
    },
    {
      icon: Megaphone,
      title: "Distribuzione manuale ai commerciali",
      text: "Titolare smista lead via WhatsApp ai commerciali ('questo a Marco, questo a Sara'). 30 minuti al giorno solo a smistare. Errori frequenti, lead duplicati, lead persi tra messaggi WhatsApp del titolare.",
    },
    {
      icon: Euro,
      title: "ROI campagne Facebook impossibile da misurare",
      text: "Quanto costa un cliente acquisito da Facebook? Quale campagna funziona? Quale audience converte? Senza tracking lead-cliente integrato, decidi a istinto, alzi/abbassi budget alla cieca, sprechi il 40% dello spend in audience che non converte.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesse campagne Facebook, stesso budget, stessi commerciali. Cambia il tasso di conversione e il ROI del marketing.",
  baSubheadline:
    "Edilizia in Cloud non sostituisce il direttore marketing né il social media manager: toglie il caos operativo che oggi fa morire i lead Facebook prima di diventare clienti. Risultato: risposta in 5 minuti, conversione +60%, ROI campagne misurabile.",
  baAreas: [
    {
      title: "Arrivo del lead da Facebook Ads",
      before:
        "Lead compila form Facebook, dato resta in Business Manager. Commerciale scarica CSV la sera o l'indomani, importa in CRM. Lead già freddo o contattato dalla concorrenza.",
      after:
        "Lead compila form alle 14:32, alle 14:33 è nel CRM con tutti i dati, qualificato AI per intent, assegnato al commerciale giusto, ha già ricevuto SMS di conferma e WhatsApp. Hot lead servito caldo.",
    },
    {
      title: "Qualificazione del lead",
      before:
        "Commerciale chiama tutti i lead allo stesso modo. Lead 'preventivo subito' chiamato 8 ore dopo (perso). Lead 'info' chiamato per primo (perde tempo). Lead 'curiosità' diventa appuntamento (poi non si presenta).",
      after:
        "AI legge testo libero del form, segnali Facebook, comportamento prima del click. Categorizza in HOT/WARM/COLD. Commerciale chiama HOT entro 5 minuti, WARM in giornata, COLD via automazione email/SMS.",
    },
    {
      title: "Distribuzione ai commerciali",
      before:
        "Titolare smista a mano via WhatsApp. Errori, duplicati, lead dimenticati nei messaggi. Commerciali in concorrenza interna su stesso lead. Tempo titolare sprecato.",
      after:
        "Distribuzione automatica per zona geografica, specializzazione (FV, ristrutturazione, serramenti), carico commerciale. Notifica push immediata al commerciale corretto, task con dati, scadenza azione.",
    },
    {
      title: "Tracking ROI campagne",
      before:
        "Spend Facebook noto, lead generati noti, ma nessuno sa quanti diventano clienti né con che ticket. Decisioni budget a istinto, audience scartate senza dati, campagne mantenute per inerzia.",
      after:
        "Per ogni lead: campagna di provenienza, audience, costo, status pipeline, ticket finale chiuso. Dashboard ROI per campagna live, audience più redditizie evidenziate, decisioni budget data-driven.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dal click Facebook alla firma contratto.",
  mechanismSubheadline:
    "Il modulo Lead Form Facebook è progettato per imprese edili che fanno 50-2.000 lead Facebook al mese: sync real-time, qualificazione AI verticale edilizia, distribuzione intelligente, automazione contatto. Tutto integrato senza Zapier.",
  mechanismSteps: [
    {
      icon: Facebook,
      title: "Lead arriva in real-time nel CRM",
      text: "Sync nativa con Business Manager Facebook/Instagram via API ufficiali (no Zapier, no scraping). Ogni lead arriva nel CRM in 30 secondi con tutti i campi del form, campagna, audience, costo per lead.",
    },
    {
      icon: Cpu,
      title: "AI qualifica e distribuisce automatico",
      text: "AI verticale edilizia legge testo libero, intent dichiarato, segnali Facebook. Categorizza HOT/WARM/COLD. Distribuisce al commerciale giusto per zona/specializzazione. Notifica push immediata.",
    },
    {
      icon: Rocket,
      title: "Contatto entro 5 minuti via multi-canale",
      text: "Lead riceve SMS conferma in 30 secondi, WhatsApp Business saluto in 2 minuti, email con brochure in 5 minuti. Commerciale ha già il task aperto con script personalizzato per chiamata diretta.",
    },
  ],
  mechanismCta: "Apri la dashboard Lead Facebook",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Conversione +60%, costo per cliente -30%, ROI campagne finalmente misurabile.",
  commercialBody:
    "Le imprese edili che adottano Edilizia in Cloud per gestione Lead Facebook registrano un aumento medio del 60% del tasso di conversione lead-cliente, una riduzione del 30% del costo per cliente acquisito e ROI campagne Facebook misurabile in tempo reale. Il budget marketing diventa investimento, non spesa.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Conversione lead-cliente +60%",
      text: "Risposta entro 5 minuti = probabilità chiusura 21x rispetto a 30 minuti. Qualificazione AI = commerciali concentrati su HOT lead. Distribuzione intelligente = lead giusto al commerciale giusto. Risultato matematico: conversione +60%.",
    },
    {
      icon: Euro,
      title: "Costo per cliente -30%",
      text: "Aumentando conversione su stesso budget Facebook, costo per cliente acquisito cala matematicamente. Tracking ROI per campagna spegne audience che non converte, sposta budget su quelle che funzionano. Costo cliente -30% al primo trimestre.",
    },
    {
      icon: PieChart,
      title: "ROI campagne misurabile",
      text: "Per ogni cliente chiuso, sai da quale campagna è arrivato, quale audience, quale creatività, quale costo per lead, quale ticket finale. Decidi budget Facebook con dati reali, non a istinto.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come impresa moderna",
      text: "Lead riceve risposta professionale e tempestiva. Percepisce subito 'questa impresa è strutturata, mi prendono sul serio'. Posizionamento commerciale superiore, ticket medio +10%, sconti chiesti -15%.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Lead caldi servono caldi. Budget marketing torna investimento.",
  resultsBody:
    "Quando ogni click Facebook diventa una conversazione qualificata in 5 minuti, le imprese edili scoprono il vero potenziale dei Lead Ads. Conversioni che non avevano mai visto, ROI che torna positivo, audience efficaci che si moltiplicano. È così che un'impresa edilizia smette di spendere e inizia a investire in marketing.",
  integrationPillars: [
    {
      icon: Facebook,
      title: "Sync nativa Business Manager",
      text: "Integrazione ufficiale Facebook/Instagram via API: niente Zapier, niente scraping, niente delay. Ogni lead arriva in real-time nel CRM con campagna, audience, costo per lead.",
    },
    {
      icon: Cpu,
      title: "Qualificazione AI verticale edilizia",
      text: "AI addestrata su pattern lead edilizia (ristrutturazioni, fotovoltaico, serramenti). Categorizza HOT/WARM/COLD da testo libero, intent dichiarato, segnali comportamentali Facebook.",
    },
    {
      icon: Users,
      title: "Distribuzione intelligente",
      text: "Per zona geografica, specializzazione commerciale, carico attuale, performance storica. Lead arriva al commerciale giusto al momento giusto, niente più conflitti interni.",
    },
    {
      icon: PieChart,
      title: "Dashboard ROI campagne",
      text: "Per ogni campagna Facebook: lead generati, costo per lead, conversione, costo per cliente, ticket medio, ROI. Decisioni budget data-driven, audience più redditizie evidenziate.",
    },
  ],
  resultStats: [
    { value: 60, prefix: "+", suffix: "%", label: "conversione lead-cliente edilizia" },
    { value: 30, prefix: "-", suffix: "%", label: "costo per cliente acquisito" },
    { value: 5, suffix: " min", label: "tempo medio risposta lead" },
  ],
  resultsCta: "Apri la dashboard Lead Facebook",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale convertire l'8% in più dei tuoi lead Facebook in clienti paganti?",
  roiSubheadline:
    "Sposta i cursori sui tuoi numeri reali: lead Facebook al mese e ticket medio cliente edilizia. La stima parte dall'8% di conversione extra (vs benchmark settore) e 12% di margine medio operativo edilizia.",
  roi: {
    input1Label: "Lead Facebook/mese",
    input1Default: 80,
    input1Min: 10,
    input1Max: 500,
    input1Step: 5,
    input2Label: "Ticket medio cliente (€)",
    input2Default: 25000,
    input2Min: 3000,
    input2Max: 200000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Margine extra annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.08 * b * 0.12),
    computeSecondary: (a, b) => [
      { label: "Lead Facebook/anno", value: `${a * 12}` },
      { label: "Clienti extra/anno (+8%)", value: `${Math.round(a * 12 * 0.08)}` },
      { label: "Volume extra fatturato/anno", value: `${(Math.round(a * 12 * 0.08 * b)).toLocaleString("it-IT")} €` },
    ],
    closingPitch:
      "Stima conservativa con +8% conversione e 12% margine. Aggiungi il calo del costo per cliente (-30%) e l'efficienza ROI campagne ottimizzate: il ritorno reale è multiplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un connettore. Una macchina di conversione lead per imprese edili.",
  salesBody:
    "Edilizia in Cloud trasforma i click Facebook in clienti paganti grazie a sync real-time, AI verticale, distribuzione intelligente. Le 4 dimensioni operative che cambiano dal primo lead.",
  salesImpact: [
    {
      title: "Commerciali sempre sui lead caldi",
      text: "Niente più ore a smistare, scaricare CSV, capire chi è chi. AI qualifica e distribuisce, commerciali concentrati su chiamate vere a lead pronti. Produttività commerciale +40%.",
    },
    {
      title: "Titolare libero dal smistamento",
      text: "30 minuti al giorno di smistamento WhatsApp finiscono. Titolare torna a fare il titolare: sopralluoghi importanti, trattative complesse, strategia. Stop a essere centralinista.",
    },
    {
      title: "Marketing budget come investimento",
      text: "ROI campagne Facebook visibile, audience efficaci moltiplicate, audience inutili spente. Stesso budget genera 60% clienti in più. Marketing diventa motore di crescita, non centro di costo.",
    },
    {
      title: "Lead persi azzerati",
      text: "Niente più lead 'sfuggiti' nei messaggi WhatsApp del titolare, persi nelle cartelle Drive, dimenticati nel weekend. Ogni lead ha un task assegnato, una scadenza, uno status pipeline.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi spende in Facebook Ads, non slogan da agenzia.",
  featureRows: [
    {
      label: "Sync nativa Facebook/Instagram Business Manager",
      value:
        "Integrazione API ufficiali Meta, niente Zapier né scraping. Ogni lead arriva in real-time nel CRM con campagna, audience, creatività, costo per lead, dati form completi. Multi-pagina e multi-account supportati.",
    },
    {
      label: "Qualificazione AI verticale edilizia",
      value:
        "AI addestrata su pattern lead edilizia (ristrutturazioni, fotovoltaico, serramenti, ampliamenti). Categorizza HOT/WARM/COLD da testo libero, intent, segnali Facebook. Probabilità chiusura calcolata per ogni lead.",
    },
    {
      label: "Distribuzione intelligente ai commerciali",
      value:
        "Routing per zona geografica (CAP, regione), specializzazione commerciale, carico attuale, performance storica conversione. Notifica push istantanea, task aperto con script personalizzato.",
    },
    {
      label: "Automazione contatto multi-canale",
      value:
        "SMS conferma in 30 secondi, WhatsApp Business saluto personalizzato in 2 minuti, email con brochure e calendly in 5 minuti. Sequenza automatica configurabile per campagna/intent.",
    },
    {
      label: "Tracking ROI campagne in dashboard",
      value:
        "Per ogni campagna Facebook: lead generati, costo per lead, conversione, costo per cliente, ticket medio chiuso, ROI. Filtri per audience, creatività, periodo. Decisioni budget data-driven.",
    },
    {
      label: "Lead scoring dinamico in pipeline",
      value:
        "Probabilità chiusura aggiornata in tempo reale in base a interazioni: aperture email, click WhatsApp, sopralluogo prenotato, preventivo richiesto. Commerciali concentrati su lead ad alta probabilità.",
    },
    {
      label: "Anti-duplicazione e protezione lead",
      value:
        "Riconoscimento automatico lead duplicati (stesso telefono/email arrivati da campagne diverse), unificazione storico interazioni, distribuzione coerente al commerciale già in carico.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Lead Facebook cambia il fatturato.",
  scenarios: [
    {
      title: "Lead 'preventivo ristrutturazione 80mq Milano'",
      text:
        "Compila form alle 11:42. Alle 11:43 nel CRM, AI categorizza HOT (intent esplicito), assegnato a commerciale Milano-Nord. Alle 11:44 SMS conferma, alle 11:46 WhatsApp con calendly. Sopralluogo prenotato per giovedì alle 14, contratto firmato 12 giorni dopo per 47.000€.",
    },
    {
      title: "Lead 'info pannelli FV 6kW' di sabato sera",
      text:
        "Compila form sabato alle 22:38. Sequenza automatica parte: SMS, WhatsApp con video introduttivo, email lunedì alle 9 con preventivo simulato. Lunedì alle 10:15 commerciale lo chiama già preparato, cliente firma contratto giovedì da 14.500€.",
    },
    {
      title: "Audit ROI campagne Q2",
      text:
        "Apri dashboard ROI: campagna 'ristrutturazione cucina' costo per cliente 280€ ticket medio 32k€ → tieni e moltiplica. Campagna 'serramenti generica' costo per cliente 1.200€ ticket medio 4k€ → spegni. Riallochi 8.000€/mese di budget.",
    },
  ],

  testimonialQuote:
    "Spendevamo 4.500€/mese in Facebook Ads e generavamo 130 lead. Convertivamo a fatica 8-10 in clienti, costo per cliente folle. Con Edilizia in Cloud risposta lead in 4 minuti, qualificazione AI, distribuzione automatica: a parità di spend siamo passati a 22 clienti/mese. Costo per cliente da 450€ a 200€. Il modulo si è ripagato la prima settimana.",
  testimonialAuthor: "Giulia B.",
  testimonialRole: "Casa Nuova Ristrutturazioni Srl, Verona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Si integra davvero con Facebook senza Zapier o tool intermedi?",
      a: "Sì. Integrazione nativa Edilizia in Cloud è partner Meta certificato e usa API ufficiali Business Manager Facebook/Instagram. Setup: colleghi il tuo Business Manager in 5 minuti, autorizzi pagine e campagne, sync real-time attiva. Niente Zapier, niente costi extra, niente delay.",
    },
    {
      q: "L'AI qualifica davvero bene i lead edilizia o sono fuffa di marketing?",
      a: "L'AI è addestrata su oltre 2 milioni di lead edilizia italiani anonimizzati con outcome noti (chiuso/non chiuso). Riconosce pattern intent verticali (preventivo immediato vs informazioni), segnali comportamentali Facebook, qualità testo libero. Accuratezza HOT/WARM/COLD misurata 87% sul nostro benchmark.",
    },
    {
      q: "Il primo contatto WhatsApp è automatico, non sembra spam?",
      a: "Il primo messaggio WhatsApp è personalizzato col nome del lead, riferimento a quello che ha richiesto nel form, tono umano scritto da te (template editabile). Lead percepisce risposta tempestiva e professionale, non automazione. Tasso di risposta medio 65% nei nostri clienti.",
    },
    {
      q: "Quanti lead Facebook può gestire al mese?",
      a: "Nessun limite operativo. Abbiamo clienti con 50 lead/mese e altri con 8.000 lead/mese gestiti dalla stessa piattaforma. La sync è real-time, la qualificazione AI è istantanea, la distribuzione automatica scala con il volume. Niente sovrapprezzi per volume.",
    },
    {
      q: "Posso vedere il ROI per ogni campagna Facebook in dashboard?",
      a: "Sì. Dashboard live mostra per ogni campagna/audience/creatività: lead generati, costo per lead (da Facebook), conversione lead-cliente, ticket medio chiuso, costo per cliente acquisito, ROI. Filtri per periodo, regione, specializzazione. Export Excel per riunioni marketing.",
    },
    {
      q: "Quanto costa il modulo? Ci sono costi per lead processato?",
      a: "Il modulo Lead Form Facebook è incluso nei piani Professional e Business. Lead illimitati, campagne illimitate, qualificazione AI illimitata, sync Business Manager illimitata. Nessun costo per lead processato, nessun vincolo pluriennale. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "I lead Facebook vivono collegati a tutta la piattaforma.",
  internalLinksBody:
    "Il modulo Lead Form Facebook è alimentato da CRM, Automazioni, WhatsApp, Pipeline e Agenti AI. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/crm-edilizia",
      title: "CRM Edilizia",
      text: "Lead Facebook entrano nel CRM con anagrafica, intent, storico campagna.",
    },
    {
      to: "/funzionalita/automazioni",
      title: "Automazioni",
      text: "Sequenza automatica SMS/email/WhatsApp dopo lead, follow-up programmati.",
    },
    {
      to: "/funzionalita/whatsapp-marketing",
      title: "WhatsApp Marketing",
      text: "Primo contatto WhatsApp Business in 5 minuti, conversione +60%.",
    },
    {
      to: "/funzionalita/pipeline-vendite",
      title: "Pipeline Vendite",
      text: "Pipeline lead-cliente con probabilità chiusura, tracking commerciali, ROI.",
    },
    {
      to: "/funzionalita/agenti-ai",
      title: "Agenti AI",
      text: "Qualificazione automatica intent lead edilizia, primo contatto AI.",
    },
    {
      to: "/funzionalita/email-marketing",
      title: "Email Marketing",
      text: "Sequenze nurturing email per lead WARM/COLD, brochure automatiche.",
    },
    {
      to: "/funzionalita/sms-marketing",
      title: "SMS Marketing",
      text: "SMS conferma in 30 secondi, reminder appuntamento sopralluogo.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e ristrutturazioni.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Modulo Lead Facebook incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di perdere lead Facebook entro 30 minuti. Inizia a chiuderli entro 5.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Lead Form Facebook dentro la tua impresa: setup in 48 ore, sync Business Manager nativa, qualificazione AI verticale edilizia, distribuzione automatica commerciali, automazione SMS/WhatsApp/email. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · Sync Facebook nativa · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Lead Facebook",
  stickyCtaMicrocopy: "Setup 48h · Sync Facebook inclusa",

  applicationSubCategory: "Construction Lead Generation Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function LeadFormFacebook() {
  return <FunzionalitaPageTemplate config={config} />;
}
