import { BLOG_BODIES } from "./_blog-bodies.js";

/**
 * Cloudflare Pages Middleware — Bot Detection & Static Pre-render
 *
 * For known search engine and AI bots, returns a lightweight static HTML
 * page with all critical SEO signals (title, meta, canonical, og, JSON-LD,
 * visible text, internal links) so they don't need to execute JavaScript.
 *
 * For regular users, passes through to the SPA as usual.
 */

const BOT_PATTERNS = [
  /googlebot/i,
  /google-inspectiontool/i,
  /bingbot/i,
  /slurp/i,           // Yahoo
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /pinterestbot/i,
  /redditbot/i,
  /embedly/i,
  /skypeuripreview/i,
  /microsoftpreview/i,
  /teams/i,
  /vkshare/i,
  /tumblr/i,
  /applebot/i,
  /gptbot/i,          // OpenAI
  /chatgpt-user/i,
  /claudebot/i,       // Anthropic
  /claude-web/i,
  /perplexitybot/i,
  /perplexity/i,
  /cohere-ai/i,
  /meta-externalagent/i,
  /amazonbot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /sogou/i,
  /exabot/i,
  /ia_archiver/i,
];

function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_PATTERNS.some((re) => re.test(userAgent));
}

// ─── Route meta definitions ──────────────────────────────────────────────────

const BASE = "https://www.ediliziaincloud.com";

function canonicalUrl(pathname = "/") {
  const path = pathname || "/";
  if (path === "/") return `${BASE}/`;
  if (/\.[a-z0-9]{2,8}$/i.test(path)) return `${BASE}${path}`;
  return `${BASE}${path.replace(/\/$/, "")}/`;
}

// ─── Alias legacy / SEO short-URL → canonical FINALE (un solo 301) ────────────
// Causa-radice GSC "Pagina con reindirizzamento": prima questi alias stavano
// solo in public/_redirects (sorgente SENZA trailing slash). Ma il middleware
// normalizza lo slash PRIMA che _redirects scatti, quindi:
//   /gestionale-cantieri → 301 /gestionale-cantieri/ → (non matcha più la
//   regola _redirects) → 200 SPA shell  ❌ soft-404 / contenuto duplicato
//   /per/imprese-costruzione → 301 …/  → 301 /per/imprese-edili/  ❌ catena 2 hop
// Risolvendoli QUI, nel blocco di canonicalizzazione, ogni alias fa UN SOLO 301
// verso la destinazione canonica (già con slash), host/protocol inclusi.
// La chiave è SEMPRE senza trailing slash; il valore è la canonical 200 finale.
const LEGACY_REDIRECTS = {
  "/home": "/",
  "/register": "/demo/",
  "/gestionale-edilizia": "/software-gestionale-edilizia/",
  "/software-edilizia": "/software-gestionale-edilizia/",
  "/software-imprese-edili": "/software-gestionale-edilizia/",
  "/software-gestione-cantieri": "/funzionalita/gestione-cantieri/",
  "/gestionale-cantieri": "/funzionalita/gestione-cantieri/",
  "/gestione-cantieri-software": "/funzionalita/gestione-cantieri/",
  "/app-gestione-cantiere": "/funzionalita/app-cantiere-mobile/",
  "/app-cantiere": "/funzionalita/app-cantiere-mobile/",
  "/rapportini-cantiere": "/funzionalita/app-cantiere-mobile/",
  "/software-preventivi-edilizia": "/funzionalita/preventivi-edilizia/",
  "/gestione-magazzino-edilizia": "/funzionalita/magazzino-cantiere/",
  "/software-magazzino-edilizia": "/funzionalita/magazzino-cantiere/",
  "/ddt-cantiere": "/funzionalita/ddt-digitali/",
  "/giornale-lavori-cantiere": "/funzionalita/giornale-lavori/",
  "/cronoprogramma-lavori": "/funzionalita/calendario-lavori/",
  "/contabilita-cantiere": "/funzionalita/contabilita-fiscale/",
  "/crm-edilizia": "/funzionalita/crm-edilizia/",
  "/sal-cantiere": "/blog/sal-cantiere-come-funziona/",
  "/computo-metrico": "/blog/computo-metrico-estimativo-guida/",
  "/computo-metrico-estimativo": "/blog/computo-metrico-estimativo-guida/",
  "/software-serramentisti": "/per/serramentisti/",
  "/gestionale-serramentisti": "/per/serramentisti/",
  "/software-impiantisti": "/per/impiantisti/",
  "/gestionale-impiantisti": "/per/impiantisti/",
  "/software-ristrutturazioni": "/per/ristrutturatori/",
  "/software-ristrutturazioni-edilizie": "/per/ristrutturatori/",
  "/migrazione-gestionale-edilizia": "/pianifica-migrazione/",
  "/migrare-da-primus": "/pianifica-migrazione/",
  "/passare-da-primus": "/pianifica-migrazione/",
  "/migrare-da-teamsystem": "/pianifica-migrazione/",
  "/import-dati-gestionale-edilizia": "/pianifica-migrazione/",
  "/onboarding-gestionale-edilizia": "/pianifica-migrazione/",
  // route rinominata: imprese-costruzione (vecchio) → imprese-edili (canonical)
  "/per/imprese-costruzione": "/per/imprese-edili/",
  "/per": "/per/imprese-edili/",
  // alias legali legacy
  "/privacy": "/privacy-policy/",
  "/termini": "/termini-e-condizioni/",
  "/cookie": "/cookie-policy/",
  "/blog/categoria": "/blog/",
};

// ─── Blog: metadati post a scope modulo ──────────────────────────────────────
// Fix GSC 2026-06: l'indice /blog linkava solo 3 articoli su 54 → il resto
// erano pagine orfane senza link interni ("Scansionata ma non indicizzata").
// Ora l'indice linka TUTTI i post e le pagine categoria linkano i propri.
const BLOG_POST_META = {
      "sal-cantiere-come-funziona": { title: "SAL Cantiere: Cos'è, Come Funziona e Come Gestirlo | Blog Edilizia in Cloud", description: "Guida completa allo Stato di Avanzamento dei Lavori: come calcolare il SAL, emettere i certificati di pagamento e gestire la contabilità di cantiere.", publishedAt: "2025-11-28", coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80" },
      "durc-edilizia-guida-completa": { title: "DURC in Edilizia: Guida Completa 2026 | Blog Edilizia in Cloud", description: "Cos'è il DURC, come richiederlo, validità 120 giorni, DURC online e cosa fare se l'impresa risulta irregolare.", publishedAt: "2025-12-08", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
      "giornale-dei-lavori-cantiere": { title: "Il Giornale dei Lavori in Cantiere: Guida Pratica | Blog Edilizia in Cloud", description: "Come compilare il giornale dei lavori, chi lo tiene, valore legale e come digitalizzarlo con un software gestionale.", publishedAt: "2025-12-18", coverImage: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1600&q=80" },
      "subappalto-edilizia-guida": { title: "Subappalto in Edilizia: Regole, Limiti e Come Gestirlo nel 2026 | Blog Edilizia in Cloud", description: "Tutto sul subappalto edile: limiti percentuali, autorizzazioni, obblighi DURC e responsabilità solidale.", publishedAt: "2025-12-28", coverImage: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80" },
      "acquisire-clienti-impresa-edile": { title: "Come Acquisire Clienti per un'Impresa Edile nel 2026 | Blog Edilizia in Cloud", description: "7 strategie efficaci per trovare nuovi clienti come impresa edile: referral, preventivi professionali, presenza online e molto altro.", publishedAt: "2026-01-06", coverImage: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=80" },
      "gestione-operai-cantiere-presenze-ore": { title: "Gestione Operai in Cantiere: Presenze e Ore Lavorate | Blog Edilizia in Cloud", description: "Come gestire le presenze degli operai in cantiere, tracciare le ore lavorate per commessa e semplificare le buste paga.", publishedAt: "2026-01-09", coverImage: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=80" },
      "sito-web-impresa-edile-guida": { title: "Come Creare un Sito Web per un'Impresa Edile: Guida Completa | Blog Edilizia in Cloud", description: "Guida passo passo per costruire un sito web professionale per la tua impresa edile: struttura, SEO locale e contenuti che convertono.", publishedAt: "2026-01-12", coverImage: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=1600&q=80" },
      "digitalizzazione-impresa-edile-passo-passo": { title: "Digitalizzazione dell'Impresa Edile: Guida Passo Passo | Blog Edilizia in Cloud", description: "Come digitalizzare la tua impresa edile in modo graduale: da carta e Excel a un gestionale cloud completo.", publishedAt: "2026-01-15", coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80" },
      "computo-metrico-estimativo-guida": { title: "Computo Metrico Estimativo: Cos'è, Come Si Fa e Template Gratis | Blog Edilizia in Cloud", description: "Guida completa al computo metrico estimativo: struttura, prezzari regionali, errori comuni e software per compilarlo in modo professionale.", publishedAt: "2026-01-18", coverImage: "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1600&q=80" },
      "bim-edilizia-guida-pratica": { title: "BIM in Edilizia: Cos'è, Obblighi e Come Iniziare nel 2026 | Blog Edilizia in Cloud", description: "Guida pratica al BIM per imprese edili italiane: obblighi DM 560, soglie per appalti pubblici e come iniziare senza stravolgere l'organizzazione.", publishedAt: "2026-01-21", coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80" },
      "cassa-edile-come-funziona": { title: "Cassa Edile: Come Funziona, Contributi e Obblighi per le Imprese | Blog Edilizia in Cloud", description: "Guida completa alla Cassa Edile: iscrizione obbligatoria, contributi mensili, prestazioni ai lavoratori e come gestirla senza errori di DURC.", publishedAt: "2026-01-24", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
      "appalti-pubblici-edilizia-guida": { title: "Come Partecipare agli Appalti Pubblici in Edilizia: Guida 2026 | Blog Edilizia in Cloud", description: "Guida pratica agli appalti pubblici per imprese edili: requisiti SOA, DURC, portali gare, ribasso d'asta e fondi PNRR.", publishedAt: "2026-01-27", coverImage: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=80" },
      "sicurezza-cantieri-dlgs-81": { title: "Sicurezza Cantieri: D.Lgs 81/2008 Spiegato alle Imprese Edili | Blog Edilizia in Cloud", description: "Guida pratica al D.Lgs 81/2008: obblighi del titolare, DVR, POS, PSC, formazione obbligatoria e sanzioni. Come gestirla senza perdere ore.", publishedAt: "2026-01-30", coverImage: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=1600&q=80" },
      "ccnl-edilizia-guida": { title: "CCNL Edilizia Industria 2024-2026: Guida Pratica per le Imprese | Blog Edilizia in Cloud", description: "Tutto sul CCNL Edilizia Industria: livelli retributivi, Cassa Edile, costo reale di un operaio, ferie e come calcolare il costo orario effettivo.", publishedAt: "2026-02-02", coverImage: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=80" },
      "attestazione-soa-imprese-edili": { title: "Attestazione SOA per Imprese Edili: Come Ottenerla e Mantenerla | Blog Edilizia in Cloud", description: "Guida completa alla SOA: categorie OG/OS, requisiti di fatturato e personale, costi, rinnovi e verifica triennale per partecipare agli appalti pubblici.", publishedAt: "2026-02-05", coverImage: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80" },
      "superbonus-imprese-edili-2026": { title: "Superbonus 2025-2026: Cosa Resta per le Imprese Edili e Come Gestirlo | Blog Edilizia in Cloud", description: "Guida aggiornata ai bonus edilizi 2025-2026 per le imprese: aliquote, cessione del credito, SAL obbligatori e documentazione. Come acquisire lavori con i bonus.", publishedAt: "2026-02-08", coverImage: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1600&q=80" },
      "gestione-liquidita-impresa-edile": { title: "Gestione della Liquidità per Imprese Edili: Come Evitare la Crisi di Cassa | Blog Edilizia in Cloud", description: "Guida completa alla liquidità per imprese edili: ciclo finanziario del cantiere, previsione flussi di cassa a 90 giorni, SAL e strumenti pratici per non trovarsi mai senza cassa.", publishedAt: "2026-02-11", coverImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80" },
      "pnrr-edilizia-imprese-2026": { title: "PNRR per Imprese Edili 2025-2026: Bandi, Requisiti e Come Partecipare | Blog Edilizia in Cloud", description: "Guida completa al PNRR per le imprese edili: bandi disponibili, requisiti SOA, rendicontazione digitale, SAL asseverati e come organizzarsi per non perdere i pagamenti pubblici.", publishedAt: "2026-02-14", coverImage: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=80" },
      "come-scegliere-software-gestionale-edilizia": { title: "Come Scegliere il Software Gestionale per la Tua Impresa Edile: Guida 2026 | Blog Edilizia in Cloud", description: "Guida pratica alla scelta del software gestionale per imprese edili: funzionalità indispensabili, 10 domande ai vendor, costi reali e errori da evitare.", publishedAt: "2026-02-17", coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80" },
      "gestione-subappaltatori-impresa-edile": { title: "Gestione Subappaltatori: Contratti, DURC, Pagamenti e Come Mantenere il Controllo | Blog Edilizia in Cloud", description: "Guida completa alla gestione dei subappaltatori: contratti obbligatori, DURC, responsabilità solidale, limiti subappalto appalti pubblici e software di gestione.", publishedAt: "2026-02-20", coverImage: "https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?auto=format&fit=crop&w=1600&q=80" },
      "ridurre-costi-cantieri-edili": { title: "Come Ridurre i Costi Nei Cantieri Edili del 20% con il Digitale | Blog Edilizia in Cloud", description: "Scopri le 7 strategie pratiche che permettono alle imprese edili italiane di ridurre i costi operativi del 20-35% attraverso la digitalizzazione dei processi.", publishedAt: "2025-07-31", coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80" },
      "gestione-cantieri-digitale": { title: "Gestione Cantieri 2026: Dalla Carta al Cloud — Guida Completa | Blog Edilizia in Cloud", description: "La guida definitiva per trasformare la gestione dei cantieri edili dalla carta al cloud. Dall'avanzamento lavori alle commesse, tutto ciò che devi sapere.", publishedAt: "2025-08-10", coverImage: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1600&q=80" },
      "preventivi-edilizia-guida": { title: "Preventivi Vincenti in Edilizia: Come Strutturare un'Offerta che Converte | Blog Edilizia in Cloud", description: "I preventivi perduti costano alle imprese edili milioni di euro ogni anno. Scopri come strutturare preventivi professionali che convincono il cliente.", publishedAt: "2025-08-20", coverImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80" },
      "hr-edilizia-presenze-buste-paga": { title: "HR in Edilizia: Gestione Presenze, Buste Paga e Conformità CCNL | Blog Edilizia in Cloud", description: "La gestione del personale nelle imprese edili è tra le più complesse d'Italia. Scopri come semplificare presenze, buste paga e rispettare il CCNL Edilizia.", publishedAt: "2025-08-30", coverImage: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80" },
      "analisi-margini-imprese-edili": { title: "Analisi dei Margini per Imprese Edili: La Guida Definitiva 2026 | Blog Edilizia in Cloud", description: "Il 68% delle imprese edili lavora senza conoscere i propri margini reali per commessa. Scopri come calcolare, monitorare e migliorare la redditività.", publishedAt: "2025-09-09", coverImage: "https://images.unsplash.com/photo-1543286386-713bdd548da4?auto=format&fit=crop&w=1600&q=80" },
      "marketing-digitale-imprese-edili": { title: "Marketing Digitale per Imprese Edili: Trovare Nuovi Clienti Online nel 2026 | Blog Edilizia in Cloud", description: "Il passaparola non basta più. Scopri le strategie di marketing digitale specifiche per le imprese edili italiane: dal Google My Business alle campagne social.", publishedAt: "2025-09-19", coverImage: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=1600&q=80" },
      "software-gestionale-vs-excel": { title: "Software Gestionale vs Excel: Il Vero Costo Nascosto per la Tua Impresa Edile | Blog Edilizia in Cloud", description: "Molte imprese edili usano Excel convinte di risparmiare. Calcoliamo il vero costo nascosto: tempo perso, errori, opportunità mancate e rischio fiscale.", publishedAt: "2025-09-29", coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80" },
      "digitalizzare-impresa-edile": { title: "Come Digitalizzare la Tua Impresa Edile in 30 Giorni | Blog Edilizia in Cloud", description: "Una roadmap concreta e testata per trasformare la tua impresa edile dal cartaceo al digitale in soli 30 giorni. Settimana per settimana, cosa fare.", publishedAt: "2025-10-09", coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80" },
      "come-organizzare-cantiere-edile": { title: "Come Organizzare un Cantiere Edile: Guida Pratica per Titolari | Blog Edilizia in Cloud", description: "Hai cantieri aperti ma non sai dove sono i materiali, chi ha fatto cosa ieri, e quanto hai speso. Scopri il metodo in 5 fasi per organizzare ogni cantiere.", publishedAt: "2025-10-19", coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&q=80" },
            "documentazione-obbligatoria-cantiere-2025": { title: "Documentazione Obbligatoria Cantiere 2026: Lista Completa | Blog Edilizia in Cloud", description: "Lista aggiornata di tutti i documenti obbligatori per il cantiere nel 2026. POS, DURC, notifica preliminare, DDT e certificazioni finali.", publishedAt: "2025-10-29", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
            "come-fare-preventivo-edilizia": { title: "Come Fare un Preventivo Edilizia Professionale (Senza Perdere Margine) | Blog Edilizia in Cloud", description: "Come fare un preventivo edilizia che vince i lavori e protegge i tuoi margini. Metodo pratico in 5 passi per imprese edili.", publishedAt: "2025-11-08", coverImage: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1600&q=80" },
            "alternativa-excel-cantieri": { title: "Alternativa a Excel per Cantieri: Perché le Imprese Edili Lo Stanno Abbandonando | Blog Edilizia in Cloud", description: "Stai usando Excel per gestire i cantieri? Ti costa molto più di quanto pensi. Confronto diretto: Excel vs gestionale di cantiere nel 2026.", publishedAt: "2025-11-18", coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80" },
            "cassa-impresa-edile-non-torna": { title: "Ho Fatturato ma Non Ho Soldi: Perché la Cassa dell'Impresa Edile Non Torna | Blog Edilizia in Cloud", description: "Hai cantieri aperti e fatture emesse, ma il conto corrente resta sotto pressione? Ecco perché ricavi e liquidità non sono la stessa cosa e come riprendere il controllo.", publishedAt: "2026-02-23", coverImage: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1600&q=80", tags: ["cassa impresa edile", "liquidità edilizia", "cash flow cantiere", "SAL cantiere", "margini cantiere"] },
            "trovare-operai-edili-qualificati": { title: "Come Trovare Operai Edili Qualificati e Capire Chi Rende Davvero in Cantiere | Blog Edilizia in Cloud", description: "La manodopera manca, ma il problema non è solo assumere: è misurare produttività, presenze, formazione, costi reali e affidabilità di ogni operaio.", publishedAt: "2026-02-26", coverImage: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=80", tags: ["trovare operai edili", "gestione operai", "presenze cantiere", "produttività operai", "costo operaio edile"] },
            "passaparola-impresa-edile-non-basta": { title: "Il Passaparola Non Basta Più: Come Creare un Flusso Clienti per l'Impresa Edile | Blog Edilizia in Cloud", description: "Se aspetti che i clienti arrivino solo da conoscenze e raccomandazioni, non hai un sistema commerciale. Ecco come rendere prevedibili contatti, preventivi e follow-up.", publishedAt: "2026-03-01", coverImage: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80", tags: ["clienti impresa edile", "marketing edilizia", "passaparola impresa edile", "lead edilizia", "preventivi edilizia"] },
            "gestire-piu-cantieri-contemporaneamente": { title: "Come Gestire Più Cantieri Contemporaneamente Senza Perdere il Controllo | Blog Edilizia in Cloud", description: "Tre cantieri aperti, materiali in ritardo, squadre da coordinare e clienti che chiamano: il caos nasce quando tutto vive nella testa del titolare.", publishedAt: "2026-03-04", coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80", tags: ["gestire più cantieri", "organizzazione cantieri", "avanzamento lavori", "diario cantiere", "pianificazione cantiere"] },
            "burocrazia-impresa-edile-scadenze-documenti": { title: "Burocrazia Edile: Come Non Dimenticare DURC, POS, Polizze e Documenti di Cantiere | Blog Edilizia in Cloud", description: "La burocrazia non fa rumore finché blocca un cantiere. Scopri quali scadenze controllare e come trasformarle in un processo automatico.", publishedAt: "2026-03-07", coverImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80", tags: ["burocrazia edilizia", "documenti cantiere", "DURC scadenza", "POS cantiere", "scadenze impresa edile"] },
            "delegare-impresa-edile-senza-perdere-controllo": { title: "Come Delegare in un'Impresa Edile Senza Perdere il Controllo dei Cantieri | Blog Edilizia in Cloud", description: "Se ogni decisione passa da te, non hai un'azienda: hai un lavoro molto pesante. La delega funziona solo con procedure, ruoli e numeri visibili.", publishedAt: "2026-03-10", coverImage: "https://images.unsplash.com/photo-1507209696998-3c532be9b2b5?auto=format&fit=crop&w=1200&q=80", tags: ["delegare impresa edile", "organizzare azienda edile", "procedure cantiere", "titolare impresa edile", "gestione team edile"] },
            "preventivi-edili-non-si-chiudono": { title: "Perché i Preventivi Edili Non Si Chiudono: 7 Errori che Fanno Perdere Lavori | Blog Edilizia in Cloud", description: "Fai sopralluoghi, calcoli, invii preventivi e poi il cliente sparisce? Il problema spesso non è il prezzo, ma processo, valore e follow-up.", publishedAt: "2026-03-13", coverImage: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1200&q=80", tags: ["preventivi edili", "chiudere preventivi", "preventivo impresa edile", "follow up preventivo", "vendita edilizia"] },
            "segnali-crisi-impresa-edile": { title: "Segnali di Crisi in un'Impresa Edile: Come Accorgertene 90 Giorni Prima | Blog Edilizia in Cloud", description: "La crisi non arriva all'improvviso: lascia segnali su margini, cassa, clienti, costi fissi e crediti scaduti. Il punto è vederli in tempo.", publishedAt: "2026-03-16", coverImage: "https://images.unsplash.com/photo-1543286386-713bdd548da4?auto=format&fit=crop&w=1200&q=80", tags: ["crisi impresa edile", "segnali crisi aziendale", "margini edilizia", "crediti scaduti edilizia", "salute aziendale"] },
            "come-trovare-clienti-impresa-edile-marketing": { title: "Come Trovare Clienti per un'Impresa Edile con il Marketing: Metodo Pratico | Blog Edilizia in Cloud", description: "Vuoi più clienti per lavori edili, ristrutturazioni o manutenzioni? Ecco un sistema concreto per generare richieste, gestire contatti e chiudere preventivi.", publishedAt: "2026-03-19", coverImage: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80", tags: ["come trovare clienti impresa edile", "marketing impresa edile", "clienti edilizia", "lead edilizia", "acquisire clienti edilizia"] },
            "aumentare-vendite-impresa-edile": { title: "Come Aumentare le Vendite di un'Impresa Edile Senza Abbassare i Prezzi | Blog Edilizia in Cloud", description: "Più vendite non significa fare più sconti. Scopri come aumentare il tasso di chiusura con preventivi migliori, follow-up e controllo del margine.", publishedAt: "2026-03-22", coverImage: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&w=1200&q=80", tags: ["aumentare vendite impresa edile", "vendere lavori edili", "chiudere preventivi edilizia", "commerciale edilizia", "margine preventivi"] },
            "lead-serramenti-come-generare-richieste-qualificate": { title: "Lead Serramenti: Come Generare Richieste Qualificate per Infissi, Porte e Finestre | Blog Edilizia in Cloud", description: "Chi vende serramenti ha bisogno di lead con misure, zona, budget e urgenza. Ecco come evitare contatti inutili e trasformare richieste online in preventivi seri.", publishedAt: "2026-03-25", coverImage: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80", tags: ["lead serramenti", "clienti serramenti", "marketing serramenti", "preventivi infissi", "vendere serramenti"] },
            "richieste-preventivo-ristrutturazione-online": { title: "Richieste di Preventivo Ristrutturazione: Come Trasformare i Contatti Online in Cantieri | Blog Edilizia in Cloud", description: "Le richieste online per ristrutturazioni sono preziose solo se vengono qualificate, seguite e trasformate in sopralluoghi con un processo chiaro.", publishedAt: "2026-03-28", coverImage: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80", tags: ["richieste preventivo ristrutturazione", "lead ristrutturazioni", "clienti ristrutturazione", "preventivo ristrutturazione", "marketing ristrutturazioni"] },
            "google-ads-impresa-edile-errori-budget": { title: "Google Ads per Imprese Edili: Errori da Evitare e Budget da Controllare | Blog Edilizia in Cloud", description: "Google Ads può portare clienti edili, ma solo se campagne, landing page e CRM lavorano insieme. Ecco cosa controllare prima di bruciare budget.", publishedAt: "2026-03-31", coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80", tags: ["Google Ads impresa edile", "pubblicità edilizia", "campagne Google edilizia", "lead edilizia Google Ads", "budget marketing edilizia"] },
            "crm-edilizia-gestire-lead-preventivi-follow-up": { title: "CRM per Edilizia: Come Gestire Lead, Preventivi e Follow-up Senza Perdere Clienti | Blog Edilizia in Cloud", description: "Un CRM per edilizia serve a non perdere contatti, sopralluoghi e preventivi. Ecco il flusso che ogni impresa edile dovrebbe avere.", publishedAt: "2026-04-03", coverImage: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80", tags: ["CRM edilizia", "gestione lead edilizia", "follow up preventivi", "pipeline commerciale edilizia", "clienti impresa edile"] },
            "come-trovare-clienti-serramentisti": { title: "Come Trovare Clienti per Serramentisti: SEO, Lead e Preventivi che Si Chiudono | Blog Edilizia in Cloud", description: "Una guida pratica per aziende di serramenti che vogliono più richieste qualificate, meno preventivi persi e una pipeline commerciale misurabile.", publishedAt: "2026-04-06", coverImage: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80", tags: ["come trovare clienti serramentisti", "marketing serramentisti", "clienti serramenti", "lead infissi", "vendere serramenti"] },
            "come-trovare-clienti-rifacimento-tetti": { title: "Come Trovare Clienti per Aziende di Rifacimento Tetti e Coperture | Blog Edilizia in Cloud", description: "Strategia SEO e commerciale per imprese che fanno tetti, coperture, lattoneria, isolamento e impermeabilizzazioni.", publishedAt: "2026-04-09", coverImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80", tags: ["clienti rifacimento tetti", "marketing coperture", "lead tetti", "preventivo rifacimento tetto", "impresa tetti"] },
            "come-trovare-clienti-fotovoltaico": { title: "Come Trovare Clienti per Aziende Fotovoltaiche: Lead, SEO e Vendita Consultiva | Blog Edilizia in Cloud", description: "Per installatori fotovoltaici: come generare richieste qualificate, spiegare il ritorno economico e trasformare lead in contratti firmati.", publishedAt: "2026-04-12", coverImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1200&q=80", tags: ["clienti fotovoltaico", "lead fotovoltaico", "marketing fotovoltaico", "vendere impianti fotovoltaici", "installatori fotovoltaico"] },
            "sistema-fatturazione-aziende-edili": { title: "Sistema di Fatturazione per Aziende Edili: SAL, Acconti, Varianti e Margini | Blog Edilizia in Cloud", description: "Come scegliere e organizzare un sistema di fatturazione per imprese edili, serramentisti, installatori e aziende di ristrutturazione.", publishedAt: "2026-04-15", coverImage: "https://images.unsplash.com/photo-1554224154-26032fced8bd?auto=format&fit=crop&w=1200&q=80", tags: ["sistema fatturazione aziende edili", "fatturazione edilizia", "SAL fatture", "fattura elettronica edilizia", "gestionale fatture edilizia"] },
            "fattura-corretta-serramentisti": { title: "Fattura Corretta per Serramentisti: Posa, Materiali, Acconti e IVA | Blog Edilizia in Cloud", description: "Guida pratica per serramentisti: come organizzare fatture, acconti, saldo, posa in opera, varianti e documentazione senza perdere margine.", publishedAt: "2026-04-18", coverImage: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=80", tags: ["fattura corretta serramentisti", "fatturazione serramenti", "fattura infissi", "IVA serramenti", "acconto serramenti"] },
            "preventivo-rifacimento-tetto-come-farlo": { title: "Preventivo Rifacimento Tetto: Come Farlo Bene e Non Perdere Margine | Blog Edilizia in Cloud", description: "Cosa deve contenere un preventivo per rifacimento tetto: sopralluogo, materiali, sicurezza, ponteggi, varianti e SAL.", publishedAt: "2026-04-21", coverImage: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1600&q=80", tags: ["preventivo rifacimento tetto", "costo rifacimento tetto", "preventivo tetto", "azienda coperture", "margine tetti"] },
            "seo-locale-impresa-edile": { title: "SEO Locale per Imprese Edili: Come Farsi Trovare nella Propria Zona | Blog Edilizia in Cloud", description: "Guida SEO locale per imprese edili, serramentisti, tetti, impiantisti e ristrutturatori che lavorano su province e città specifiche.", publishedAt: "2026-04-24", coverImage: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80", tags: ["SEO locale impresa edile", "farsi trovare su Google edilizia", "marketing locale edilizia", "Google Business edilizia", "clienti edili zona"] },
            "recupero-crediti-impresa-edile-fatture-scadute": { title: "Recupero Crediti per Imprese Edili: Come Gestire Fatture Scadute e Clienti Lenti | Blog Edilizia in Cloud", description: "Come prevenire e gestire fatture scadute in edilizia: scadenziario, solleciti, SAL, condizioni di pagamento e controllo cassa.", publishedAt: "2026-04-27", coverImage: "https://images.unsplash.com/photo-1565514020179-026b92b84bb6?auto=format&fit=crop&w=1600&q=80", tags: ["recupero crediti impresa edile", "fatture scadute edilizia", "solleciti pagamento edilizia", "crediti clienti edilizia", "cassa impresa edile"] },
  "intelligenza-artificiale-edilizia-2026": { title: "Intelligenza Artificiale in Edilizia 2026: 8 Use Case Reali | Blog Edilizia in Cloud", description: "AI in edilizia non è futuro: è già qui. 8 use case reali con dati e ROI. Come le imprese edili italiane usano l'AI per margini, cantieri, preventivi.", publishedAt: "2026-05-22", coverImage: "https://images.unsplash.com/photo-1677442d019cecf8328cd4fab61a67a96f4a7e0d?auto=format&fit=crop&w=1600&q=80" },
  "ai-analisi-margini-cantiere": { title: "AI per Margini di Cantiere: Smetti di Perdere Soldi | Blog Edilizia in Cloud", description: "L'80% delle imprese edili scopre i margini reali a cantiere chiuso. L'AI li calcola in tempo reale. Caso studio: -18.400€ salvati in 8 settimane.", publishedAt: "2026-05-22", coverImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80" },
  "come-scegliere-gestionale-ai-impresa-edile": { title: "Gestionale AI per Edilizia: 7 Criteri per Sceglierlo Bene | Blog Edilizia in Cloud", description: "Scegliere il gestionale AI sbagliato per la tua impresa edile costa 10.000€/anno. 7 criteri tecnici, 5 errori da evitare, domande chiave al vendor.", publishedAt: "2026-05-22", coverImage: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80" },
  "miglior-gestionale-edilizia-guida-scelta": { title: "Miglior gestionale per l'edilizia nel 2026: la guida completa alla scelta | Blog Edilizia in Cloud", description: "Cloud o desktop? Verticale o ERP generalista? I 7 criteri che contano davvero per scegliere il gestionale della tua impresa edile, con i range di prezzo reali e gli errori da evitare.", publishedAt: "2026-06-11", coverImage: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1600&q=80" },
  "quanto-costa-gestionale-impresa-edile": { title: "Quanto costa un gestionale per impresa edile? Prezzi reali 2026 | Blog Edilizia in Cloud", description: "Dai 200-500€/mese degli ERP alle licenze una tantum dei software desktop, fino ai gestionali cloud verticali: tutti i range di prezzo 2026, i costi nascosti e come calcolare il ritorno reale.", publishedAt: "2026-06-11", coverImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80" },
  "patente-a-crediti-edilizia-guida": { title: "Patente a crediti in edilizia: come funziona, punteggi e sanzioni | Blog Edilizia in Cloud", description: "Obbligatoria dal 1° ottobre 2024 per chi opera nei cantieri: come si ottiene la patente a crediti, come si perdono e si recuperano i punti, chi è esonerato e cosa rischia chi lavora sotto soglia.", publishedAt: "2026-06-11", coverImage: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1600&q=80" },
  "durc-congruita-manodopera-soglie": { title: "DURC di congruità: soglie di manodopera e come evitare lo scarto | Blog Edilizia in Cloud", description: "Per i lavori pubblici e i privati sopra 70.000€ l'incidenza della manodopera deve rispettare le soglie del DM 143/2021. Come funziona la verifica CNCE, le percentuali per categoria e come monitorarle in corso d'opera.", publishedAt: "2026-06-11", coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&q=80" },
      "cila-scia-permesso-di-costruire-differenze": { title: "CILA, SCIA o Permesso di Costruire: le Differenze | Blog Edilizia in Cloud", description: "Quale titolo abilitativo serve per il tuo cantiere? Differenze tra CILA, SCIA e permesso di costruire: quando si usano, costi, tempi e sanzioni.", publishedAt: "2026-07-10", coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80" },
      "contabilita-di-cantiere-guida": { title: "Contabilità di Cantiere: la Guida Completa 2026 | Blog Edilizia in Cloud", description: "Come funziona la contabilità di cantiere: libretto misure, SAL, contabilità industriale per commessa e strumenti per controllare i costi in tempo reale.", publishedAt: "2026-07-10", coverImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80" },
      "ritenuta-di-garanzia-appalti-come-funziona": { title: "Ritenuta di Garanzia negli Appalti: Come Funziona | Blog Edilizia in Cloud", description: "Ritenute di garanzia negli appalti pubblici e privati: percentuali, quando si applicano, come si svincolano e come tracciarle per non perdere soldi.", publishedAt: "2026-07-10", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
      "report-avanzamento-cantiere-guida": { title: "Report Avanzamento Cantiere: Cosa Deve Contenere | Blog Edilizia in Cloud", description: "Come fare un report di avanzamento cantiere utile: i dati da includere, la frequenza giusta e come produrlo in automatico dai rapportini di campo.", publishedAt: "2026-07-10", coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&q=80" },
      "nota-di-credito-edilizia-quando-come": { title: "Nota di Credito in Edilizia: Quando e Come Emetterla | Blog Edilizia in Cloud", description: "Nota di credito nei lavori edili: quando emetterla, come funziona con SAL, acconti e reverse charge, tempi per il recupero IVA ed errori da evitare.", publishedAt: "2026-07-10", coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80" },
};

// slug → categoria (pagine /blog/categoria/* + related links nei post)
const BLOG_POST_CATEGORY = {
  "ridurre-costi-cantieri-edili": "gestione-cantieri",
  "gestione-cantieri-digitale": "gestione-cantieri",
  "preventivi-edilizia-guida": "commerciale-edilizia",
  "hr-edilizia-presenze-buste-paga": "hr-personale",
  "analisi-margini-imprese-edili": "finanza-edilizia",
  "marketing-digitale-imprese-edili": "marketing-edilizia",
  "software-gestionale-vs-excel": "digitalizzazione-edilizia",
  "digitalizzare-impresa-edile": "digitalizzazione-edilizia",
  "come-organizzare-cantiere-edile": "gestione-cantieri",
  "documentazione-obbligatoria-cantiere-2025": "normativa-edilizia",
  "come-fare-preventivo-edilizia": "commerciale-edilizia",
  "alternativa-excel-cantieri": "gestione-cantieri",
  "sal-cantiere-come-funziona": "gestione-cantieri",
  "durc-edilizia-guida-completa": "gestione-cantieri",
  "giornale-dei-lavori-cantiere": "gestione-cantieri",
  "subappalto-edilizia-guida": "finanza-edilizia",
  "acquisire-clienti-impresa-edile": "commerciale-edilizia",
  "gestione-operai-cantiere-presenze-ore": "hr-personale",
  "sito-web-impresa-edile-guida": "marketing-edilizia",
  "digitalizzazione-impresa-edile-passo-passo": "digitalizzazione-edilizia",
  "computo-metrico-estimativo-guida": "gestione-cantieri",
  "bim-edilizia-guida-pratica": "digitalizzazione-edilizia",
  "cassa-edile-come-funziona": "hr-personale",
  "appalti-pubblici-edilizia-guida": "commerciale-edilizia",
  "sicurezza-cantieri-dlgs-81": "normativa-edilizia",
  "ccnl-edilizia-guida": "hr-personale",
  "attestazione-soa-imprese-edili": "normativa-edilizia",
  "superbonus-imprese-edili-2026": "normativa-edilizia",
  "gestione-liquidita-impresa-edile": "finanza-edilizia",
  "pnrr-edilizia-imprese-2026": "normativa-edilizia",
  "come-scegliere-software-gestionale-edilizia": "digitalizzazione-edilizia",
  "gestione-subappaltatori-impresa-edile": "gestione-cantieri",
  "cassa-impresa-edile-non-torna": "finanza-edilizia",
  "trovare-operai-edili-qualificati": "hr-personale",
  "passaparola-impresa-edile-non-basta": "marketing-edilizia",
  "gestire-piu-cantieri-contemporaneamente": "gestione-cantieri",
  "burocrazia-impresa-edile-scadenze-documenti": "normativa-edilizia",
  "delegare-impresa-edile-senza-perdere-controllo": "digitalizzazione-edilizia",
  "preventivi-edili-non-si-chiudono": "commerciale-edilizia",
  "segnali-crisi-impresa-edile": "finanza-edilizia",
  "come-trovare-clienti-impresa-edile-marketing": "marketing-edilizia",
  "aumentare-vendite-impresa-edile": "commerciale-edilizia",
  "lead-serramenti-come-generare-richieste-qualificate": "marketing-edilizia",
  "richieste-preventivo-ristrutturazione-online": "marketing-edilizia",
  "google-ads-impresa-edile-errori-budget": "marketing-edilizia",
  "crm-edilizia-gestire-lead-preventivi-follow-up": "commerciale-edilizia",
  "come-trovare-clienti-serramentisti": "marketing-edilizia",
  "come-trovare-clienti-rifacimento-tetti": "marketing-edilizia",
  "come-trovare-clienti-fotovoltaico": "marketing-edilizia",
  "sistema-fatturazione-aziende-edili": "finanza-edilizia",
  "fattura-corretta-serramentisti": "finanza-edilizia",
  "preventivo-rifacimento-tetto-come-farlo": "commerciale-edilizia",
  "seo-locale-impresa-edile": "marketing-edilizia",
  "recupero-crediti-impresa-edile-fatture-scadute": "finanza-edilizia",
  "intelligenza-artificiale-edilizia-2026": "digitalizzazione-edilizia",
  "ai-analisi-margini-cantiere": "digitalizzazione-edilizia",
  "come-scegliere-gestionale-ai-impresa-edile": "digitalizzazione-edilizia",
  "miglior-gestionale-edilizia-guida-scelta": "digitalizzazione-edilizia",
  "quanto-costa-gestionale-impresa-edile": "finanza-edilizia",
  "patente-a-crediti-edilizia-guida": "normativa-edilizia",
  "durc-congruita-manodopera-soglie": "normativa-edilizia",
  "cila-scia-permesso-di-costruire-differenze": "normativa-edilizia",
  "contabilita-di-cantiere-guida": "finanza-edilizia",
  "ritenuta-di-garanzia-appalti-come-funziona": "finanza-edilizia",
  "report-avanzamento-cantiere-guida": "gestione-cantieri",
  "nota-di-credito-edilizia-quando-come": "finanza-edilizia",
};

// Tutti i post ordinati per data di pubblicazione (desc), come link interni.
const BLOG_ALL_POST_LINKS = Object.keys(BLOG_POST_META)
  .sort((a, b) => (BLOG_POST_META[b].publishedAt || "").localeCompare(BLOG_POST_META[a].publishedAt || ""))
  .map((slug) => ({
    href: `/blog/${slug}`,
    label: (BLOG_POST_META[slug].title || slug).split("|")[0].trim(),
  }));

function blogCategoryPostLinks(catSlug) {
  return BLOG_ALL_POST_LINKS.filter(
    (l) => BLOG_POST_CATEGORY[l.href.slice("/blog/".length)] === catSlug,
  );
}


const ROUTES = {
  "/": {
    title: "Gestionale Edilizia Cloud per Imprese Edili",
    description:
      "Edilizia in Cloud è il gestionale cloud per imprese edili: cantieri, preventivi, fatturazione elettronica SDI e HR. Usato da 150+ imprese. Prova gratis 31 giorni.",
    h1: "Edilizia in Cloud: il software gestionale per imprese edili italiane",
    intro:
      "Edilizia in Cloud è il software gestionale cloud progettato specificamente per le imprese edili italiane. Permette di gestire cantieri, preventivi professionali, fatturazione elettronica SDI (B2B e PA), subappalti, DDT, ordini fornitori, HR con presenze geolocalizzate e prima nota — tutto in un'unica piattaforma accessibile da smartphone anche in cantiere. Utilizzato da oltre 150 imprese edili in Italia, Edilizia in Cloud riduce il tempo amministrativo del 70% e i costi operativi del 20%. Piani a partire da 127€/mese, prova gratuita 31 giorni con supporto italiano dedicato.",
    extra: `
    <p><strong>Edilizia in Cloud è il gestionale cloud AI-native per imprese edili italiane che unifica cantieri, preventivi, fatturazione elettronica SDI, subappalti e HR in un'unica piattaforma mobile, accessibile anche dal cantiere e offline.</strong> A differenza dei gestionali nati per lo studio tecnico o la contabilità, è costruito attorno al flusso reale dell'impresa edile: dal primo sopralluogo al saldo finale, ogni dato è inserito una sola volta e segue automaticamente il cantiere fino in fattura.</p>

    <h2>Perché Edilizia in Cloud è diverso dagli altri gestionali edilizia</h2>
    <p>Edilizia in Cloud è il primo gestionale italiano <strong>AI-native</strong> pensato per chi sta in cantiere, non per il commercialista. Mentre i gestionali tradizionali (Primus, TeamSystem, STR Vision) sono nati per la progettazione e la contabilità di studio, Edilizia in Cloud è ottimizzato per il flusso operativo dell'impresa edile italiana: ordini, presenze, DDT, fatturazione e controllo margini accessibili da smartphone direttamente in cantiere, anche offline.</p>
    <p>La differenza pratica è tutta nella semplicità d'uso. Un capocantiere registra una presenza con timbratura GPS, fotografa l'avanzamento e firma un DDT senza saper usare un software complesso. Il titolare, dal telefono, vede in tempo reale il margine di ogni commessa e la cassa consolidata a 90 giorni. L'assistente AI <strong>Silvio</strong> redige bozze di preventivo da una descrizione testuale, classifica le fatture passive e suggerisce i solleciti, lasciando sempre la conferma finale all'utente sulle operazioni che contano.</p>

    <h2>Per chi è pensato Edilizia in Cloud</h2>
    <ul>
      <li><strong>Imprese edili generaliste</strong> con 1-50 dipendenti che gestiscono cantieri residenziali, commerciali, industriali</li>
      <li><strong>Imprese di ristrutturazione</strong> con cantieri di breve-media durata e molti subappalti</li>
      <li><strong>Serramentisti, impiantisti, ditte di tetti e lattonieri</strong> che vogliono uscire da Excel e WhatsApp</li>
      <li><strong>General contractor</strong> con commesse complesse e multi-sito</li>
      <li><strong>Geometri titolari di impresa</strong> e <strong>capocantiere con impresa propria</strong></li>
      <li><strong>Pavimentisti, piscinisti, posatori e showroom</strong> che vendono progetti, non solo prezzi</li>
    </ul>

    <h2>Cosa fa Edilizia in Cloud in concreto</h2>
    <p>Centralizza in un'unica piattaforma tutti i processi dell'impresa edile: dal primo preventivo al saldo finale. Sostituisce 4-5 strumenti separati (Excel, fatturazione in cloud, gestionale presenze, WhatsApp aziendale, calendario condiviso) eliminando errori di trascrizione, dati persi, perdite di margine e contestazioni del cliente.</p>
    <h3>I moduli principali</h3>
    <ul>
      <li><strong>Gestione cantieri</strong> — avanzamento lavori, SAL, varianti, giornale dei lavori digitale e gantt multi-cantiere.</li>
      <li><strong>Preventivi e capitolati</strong> — voci da prezzari regionali (DEI, Lombardia, Veneto, Sicilia), computo metrico, firma elettronica del cliente.</li>
      <li><strong>Fatturazione elettronica SDI</strong> — fatture B2B e FatturaPA, split payment, reverse charge edilizia, note di credito, conservazione a norma decennale.</li>
      <li><strong>Controllo margini</strong> — confronto preventivo vs consuntivo in tempo reale con alert sotto soglia.</li>
      <li><strong>Subappalti e DURC</strong> — verifica automatica scadenze DURC, POS e polizze, gestione ritenuta d'acconto e responsabilità solidale.</li>
      <li><strong>HR e Cassa Edile</strong> — presenze GPS, CCNL Edilizia Industria e Artigianato, calcolo TFR e MUT mensile pronto all'invio.</li>
      <li><strong>DDT, ordini fornitori e prima nota</strong> — documenti di trasporto, magazzino di cantiere, riconciliazione bancaria PSD2 e scadenzario.</li>
      <li><strong>App mobile cantiere</strong> — funziona offline e sincronizza appena torna la connettività.</li>
    </ul>

    <h2>Come Edilizia in Cloud aiuta a fatturare di più e perdere meno margine</h2>
    <p>La perdita di margine in edilizia nasce quasi sempre fuori dall'ufficio: ore non segnate, varianti non fatturate, materiali ordinati due volte, subappalti pagati prima di verificare il DURC. Edilizia in Cloud chiude queste falle collegando ogni costo direttamente al cantiere che lo ha generato. Quando il margine di una commessa scende sotto la soglia impostata, il titolare riceve un alert prima che il cantiere chiuda in perdita, non a consuntivo. Le varianti firmate dal cliente sul portale diventano automaticamente nuove voci di SAL, così nessun lavoro extra resta non fatturato.</p>

    <h2>Risultati misurabili per le imprese edili italiane</h2>
    <ul>
      <li><strong>-70% tempo amministrativo</strong> grazie all'automazione fatturazione e ordini</li>
      <li><strong>-20% costi operativi</strong> con il controllo margini di cantiere in tempo reale</li>
      <li><strong>+30% velocità preventivi</strong> con prezzari regionali e voci di capitolato pre-configurate</li>
      <li><strong>0 errori MUT / Cassa Edile</strong> con invio mensile automatico</li>
      <li><strong>Cassa accelerata di 7-12 giorni</strong> per ogni SAL grazie alla firma elettronica del cliente</li>
    </ul>

    <h2>Conformità normativa italiana inclusa</h2>
    <p>Edilizia in Cloud è progettato sulla normativa italiana del settore costruzioni: fatturazione elettronica SDI secondo le regole dell'Agenzia delle Entrate, reverse charge edilizia e split payment, denuncia mensile MUT alla Cassa Edile, CCNL Edilizia Industria e Artigianato per il calcolo di paghe e contributi, gestione DURC e responsabilità solidale del committente sui subappalti, conservazione digitale a norma CAD (D.Lgs 82/2005) e trattamento dati conforme al GDPR. Tutta la documentazione fiscale e di cantiere resta esibibile su richiesta degli organi di controllo.</p>

    <h2>Domande frequenti su Edilizia in Cloud</h2>
    <h3>Che cos'è Edilizia in Cloud?</h3>
    <p>Edilizia in Cloud è un software gestionale cloud per imprese edili italiane che unifica cantieri, preventivi, fatturazione elettronica SDI, subappalti, DDT e HR in un'unica piattaforma accessibile da computer e smartphone. È usato da oltre 150 imprese edili e parte da 127€/mese.</p>
    <h3>Quanto costa Edilizia in Cloud?</h3>
    <p>I prezzi partono da 127€/mese per il piano Gestionale (imprese fino a 500K € di fatturato), 247€/mese per il Professionista (da 500K a 2M €) e 547€/mese per Impresa AI (oltre 2M € o multi-cantiere), tutti con utenti illimitati. Non ci sono costi di attivazione né vincoli contrattuali ed è disponibile una prova gratuita di 31 giorni.</p>
    <h3>Edilizia in Cloud funziona in cantiere senza connessione?</h3>
    <p>Sì. L'app mobile per iOS e Android funziona anche offline: il capocantiere può timbrare le presenze, scattare foto, registrare DDT e consultare i documenti tecnici. I dati si sincronizzano automaticamente appena torna la connessione.</p>
    <h3>Edilizia in Cloud gestisce la fatturazione elettronica SDI?</h3>
    <p>Sì. Emette fatture B2B e FatturaPA verso la pubblica amministrazione direttamente dal gestionale, con split payment, reverse charge edilizia, note di credito e conservazione fiscale a norma decennale. Ogni fattura è collegata al cantiere e aggiorna i margini in automatico.</p>
    <h3>Per quali imprese è adatto?</h3>
    <p>È adatto a imprese edili generaliste, di ristrutturazione, general contractor, serramentisti, impiantisti, lattonieri, pavimentisti e posatori con team da 1 a 50 dipendenti che vogliono sostituire Excel, WhatsApp e fogli sparsi con un'unica piattaforma.</p>
    <h3>Quanto tempo serve per iniziare a usarlo?</h3>
    <p>L'attivazione è immediata: non c'è installazione locale. La maggior parte delle imprese è operativa in pochi giorni con l'aiuto del supporto italiano dedicato e dell'onboarding guidato, importando anagrafiche, cantieri e fatture esistenti.</p>
    `,
    links: [
      // Candidati sitelinks per la query brand "edilizia in cloud": Google li
      // sceglie dai link più prominenti della home — tenerli allineati con
      // l'ItemList SiteNavigationElement più sotto.
      { href: "/funzionalita", label: "Scopri le Funzionalità" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
      { href: "/demo", label: "Richiedi una Demo" },
      { href: "/blog", label: "Blog Edilizia" },
      { href: "/confronto", label: "Confronta con Altri Software" },
      { href: "/software-gestionale-edilizia", label: "Software Gestionale Edilizia" },
      { href: "/casi-studio", label: "Casi Studio delle Imprese" },
      { href: "/chi-siamo", label: "Chi Siamo" },
      { href: "/formazione", label: "Formazione e Tutorial" },
    ],
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Edilizia in Cloud",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Construction Management Software",
        operatingSystem: "Web, iOS, Android",
        description:
          "Software gestionale cloud per imprese edili italiane: gestione cantieri, preventivi, fatturazione elettronica SDI, subappalti, DDT e HR.",
        url: "https://www.ediliziaincloud.com/",
        inLanguage: "it",
        offers: {
          // Prezzi REALI dei piani (Gestionale 127 / Professionista 247 / Impresa AI 547):
          // i vecchi 49-199 contraddicevano FAQ, /prezzi e llms.txt — Google e i
          // motori AI citavano prezzi sbagliati.
          "@type": "AggregateOffer",
          priceCurrency: "EUR",
          lowPrice: "127",
          highPrice: "547",
          offerCount: "3",
        },
        featureList: "Gestione cantieri, Preventivi professionali, Fatturazione elettronica SDI, Gestione subappalti, DDT, Ordini fornitori, HR e presenze, Prima nota, App mobile cantiere",
        // Allineato allo schema della Home React (4.9/127): il sintetico non
        // dichiarava alcun rating → niente stelle sul brand in SERP.
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.9",
          reviewCount: "127",
          bestRating: "5",
        },
        screenshot: "https://www.ediliziaincloud.com/og/og-default.png",
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Edilizia in Cloud",
        alternateName: "EdiliziaInCloud",
        legalName: "Domus Group S.r.l.",
        url: "https://www.ediliziaincloud.com/",
        // /logo.png non esiste (404): usare l'icona PWA 512px che è servita davvero.
        logo: "https://www.ediliziaincloud.com/icons/icon-512.png",
        sameAs: [
          "https://www.linkedin.com/company/ediliziaincloud",
          "https://www.youtube.com/@ediliziaincloud",
        ],
        address: {
          "@type": "PostalAddress",
          streetAddress: "Via Aurelio Saffi 29",
          addressLocality: "Milano",
          postalCode: "20123",
          addressCountry: "IT",
        },
        founder: {
          "@type": "Person",
          name: "Florin Andriciuc",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Edilizia in Cloud",
        url: "https://www.ediliziaincloud.com/",
        inLanguage: "it",
        publisher: {
          "@type": "Organization",
          name: "Domus Group S.r.l.",
        },
        // SearchAction RIMOSSO (fix GSC 2026-06): Google scansionava l'URL
        // template letterale /blog?q={search_term_string} e lo segnalava per
        // sempre come "Pagina alternativa con tag canonical" facendo fallire
        // la convalida. Il rich result Sitelinks Searchbox è stato dismesso
        // da Google a ottobre 2024: lo schema non porta più alcun beneficio.
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Sezioni principali di Edilizia in Cloud",
        itemListElement: [
          { "@type": "SiteNavigationElement", position: 1, name: "Funzionalità", url: "https://www.ediliziaincloud.com/funzionalita/" },
          { "@type": "SiteNavigationElement", position: 2, name: "Prezzi", url: "https://www.ediliziaincloud.com/prezzi/" },
          { "@type": "SiteNavigationElement", position: 3, name: "Confronto", url: "https://www.ediliziaincloud.com/confronto/" },
          { "@type": "SiteNavigationElement", position: 4, name: "Demo", url: "https://www.ediliziaincloud.com/demo/" },
          { "@type": "SiteNavigationElement", position: 5, name: "Blog", url: "https://www.ediliziaincloud.com/blog/" },
          { "@type": "SiteNavigationElement", position: 6, name: "Chi siamo", url: "https://www.ediliziaincloud.com/chi-siamo/" },
          { "@type": "SiteNavigationElement", position: 7, name: "Casi Studio", url: "https://www.ediliziaincloud.com/casi-studio/" },
          { "@type": "SiteNavigationElement", position: 8, name: "Software Gestionale Edilizia", url: "https://www.ediliziaincloud.com/software-gestionale-edilizia/" },
          { "@type": "SiteNavigationElement", position: 9, name: "Formazione e Tutorial", url: "https://www.ediliziaincloud.com/formazione/" },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Che cos'è Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Edilizia in Cloud è un software gestionale cloud per imprese edili italiane che unifica cantieri, preventivi, fatturazione elettronica SDI, subappalti, DDT e HR in un'unica piattaforma accessibile da computer e smartphone. È usato da oltre 150 imprese edili e parte da 127€/mese.",
            },
          },
          {
            "@type": "Question",
            name: "Quanto costa Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "I prezzi partono da 127€/mese per il piano Gestionale (imprese fino a 500K € di fatturato), 247€/mese per il Professionista (da 500K a 2M €) e 547€/mese per Impresa AI (oltre 2M € o multi-cantiere), tutti con utenti illimitati. Nessun costo di attivazione, nessun vincolo contrattuale e prova gratuita di 31 giorni.",
            },
          },
          {
            "@type": "Question",
            name: "Edilizia in Cloud funziona in cantiere senza connessione?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Sì. L'app mobile per iOS e Android funziona anche offline: il capocantiere può timbrare presenze con GPS, scattare foto, registrare DDT e consultare i documenti tecnici. I dati si sincronizzano automaticamente appena torna la connessione.",
            },
          },
          {
            "@type": "Question",
            name: "Edilizia in Cloud gestisce la fatturazione elettronica SDI?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Sì. Emette fatture B2B e FatturaPA direttamente dal gestionale, con split payment, reverse charge edilizia, note di credito e conservazione fiscale a norma decennale. Ogni fattura è collegata al cantiere e aggiorna i margini in automatico.",
            },
          },
          {
            "@type": "Question",
            name: "Per quali imprese è adatto Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "È adatto a imprese edili generaliste, di ristrutturazione, general contractor, serramentisti, impiantisti, lattonieri, pavimentisti e posatori con team da 1 a 50 dipendenti che vogliono sostituire Excel, WhatsApp e fogli sparsi con un'unica piattaforma.",
            },
          },
          {
            "@type": "Question",
            name: "Quanto tempo serve per iniziare a usare Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "L'attivazione è immediata perché non c'è installazione locale. La maggior parte delle imprese è operativa in pochi giorni grazie al supporto italiano dedicato e all'onboarding guidato, importando anagrafiche, cantieri e fatture esistenti.",
            },
          },
        ],
      },
    ],
  },

  "/funzionalita": {
    title: "Funzionalità Gestionale Edilizia | Edilizia in Cloud",
    description:
      "Tutte le funzionalità di Edilizia in Cloud: gestione cantieri, preventivi, fatturazione elettronica SDI, subappalti, HR, margini, app mobile cantiere, agenti AI.",
    h1: "Funzionalità di Edilizia in Cloud: tutto quello che serve alla tua impresa edile",
    intro:
      "Edilizia in Cloud offre 8 moduli integrati per gestire ogni aspetto dell'impresa edile italiana: gestione cantieri in tempo reale con app mobile, preventivi professionali con prezziari regionali, fatturazione elettronica SDI (B2B e FatturaPA), controllo margini per commessa, gestione subappalti con tracciamento DURC, DDT e bolle di consegna, HR con presenze geolocalizzate in cantiere e prima nota contabile. Ogni modulo è progettato per il settore edile italiano e funziona anche offline da smartphone.",
    extra: `
    <h2>I moduli del gestionale edilizia cloud</h2>
    <h3>1. Gestione cantieri</h3>
    <p>Pianificazione, avanzamento lavori, fotografie geolocalizzate, giornale dei lavori digitale, gantt multi-cantiere, gestione varianti e SAL. Tutto accessibile dal capocantiere via app mobile, anche offline.</p>
    <h3>2. Preventivi e capitolati</h3>
    <p>Costruzione di preventivi professionali con voci da prezzari regionali (DEI, Lombardia, Veneto, Sicilia), capitolati personalizzati, listini fornitori, conversione automatica preventivo → cantiere → fattura. Firma elettronica del cliente direttamente sul preventivo PDF.</p>
    <h3>3. Fatturazione elettronica SDI</h3>
    <p>Emissione fatture B2B e FatturaPA conformi alle regole AdE, gestione SAL, acconti, note di credito, split payment, reverse charge edilizia, conservazione fiscale a norma decennale. Invio diretto al SDI via Aruba o SDICoop.</p>
    <h3>4. Controllo margini per commessa</h3>
    <p>Confronto in tempo reale preventivo vs consuntivo per ogni cantiere, analisi di manodopera, materiali, subappalti e oneri di sicurezza. Alert automatici quando il margine scende sotto soglia configurabile.</p>
    <h3>5. Subappalti e DURC</h3>
    <p>Anagrafica subappaltatori con verifica automatica scadenza DURC, POS, polizze assicurative e tracciamento ritenuta d'acconto. Conformità al D.Lgs 50/2016 e successive modifiche (Codice degli Appalti).</p>
    <h3>6. HR, presenze e CCNL Edilizia</h3>
    <p>Timbratura GPS in cantiere, calcolo automatico ore ordinarie/straordinarie, gestione CCNL Edilizia Industria e Artigianato, calcolo TFR e Cassa Edile, export per consulente del lavoro, MUT mensile pronto all'invio.</p>
    <h3>7. DDT e ordini fornitori</h3>
    <p>Gestione documenti di trasporto in entrata/uscita, ordini materiali con conferma fornitore, lettura barcode/QR su packaging, integrazione con magazzino di cantiere e centrale.</p>
    <h3>8. Prima nota e tesoreria</h3>
    <p>Prima nota di cassa, banca e carte di credito aziendali, riconciliazione automatica via PSD2 con le principali banche italiane, scadenzario fatture clienti/fornitori, previsione flussi di cassa a 90 giorni.</p>
    <h2>Funzionalità AI e automazioni</h2>
    <p>Edilizia in Cloud è il primo gestionale italiano AI-native per l'edilizia: l'assistente Silvio risponde via chat, redige preventivi da specifiche testuali, classifica fatture in arrivo, suggerisce solleciti per fatture scadute, monitora il margine di cantiere e propone correzioni in tempo reale. Tutte le azioni passano per un sistema di conferma esplicita dell'utente sulle operazioni invasive.</p>
    <h2>App mobile cantiere</h2>
    <p>App iOS e Android pensata per il capocantiere: timbratura GPS, foto cantiere, DDT digitale, lettura barcode materiali, giornale dei lavori vocale, accesso offline ai documenti tecnici (CSA, POS, PSC, schede tecniche). Sincronizzazione automatica al ritorno della connettività.</p>

    <h2>Come i moduli lavorano insieme: un unico flusso dal preventivo al saldo</h2>
    <p>La forza di Edilizia in Cloud non sta nei singoli moduli, ma nel fatto che condividono gli stessi dati. Un preventivo accettato diventa con un clic un cantiere già popolato di voci, materiali e manodopera previste. Le presenze GPS e i DDT registrati in cantiere alimentano automaticamente il consuntivo, che il modulo margini confronta in tempo reale con il preventivo iniziale. Quando il cantiere raggiunge un SAL, la fatturazione elettronica genera il documento già collegato alla commessa, e l'incasso aggiorna lo scadenzario e la previsione di cassa. Nessun dato viene inserito due volte e nessuna informazione si perde nel passaggio tra ufficio e cantiere.</p>

    <h3>Esempio pratico di flusso operativo</h3>
    <ol>
      <li>Il commerciale crea un <strong>preventivo</strong> con voci da prezzario regionale e lo invia al cliente, che lo firma online.</li>
      <li>Il preventivo accettato si trasforma in <strong>cantiere</strong> con budget di manodopera, materiali e subappalti.</li>
      <li>Il capocantiere registra <strong>presenze GPS</strong>, foto e <strong>DDT</strong> dall'app, anche offline.</li>
      <li>Il modulo <strong>margini</strong> confronta in tempo reale costi reali e preventivo, con alert se si scende sotto soglia.</li>
      <li>Al raggiungimento del <strong>SAL</strong>, la <strong>fatturazione SDI</strong> emette la fattura collegata alla commessa.</li>
      <li>L'incasso aggiorna <strong>scadenzario, prima nota e previsione di cassa</strong> a 90 giorni.</li>
    </ol>

    <h2>Per chi sono pensate queste funzionalità</h2>
    <p>Ogni modulo è tarato sul lavoro reale dell'impresa edile italiana, non su quello dello studio tecnico. La gestione subappalti serve a chi affida lavorazioni a terzi e deve tutelarsi dalla responsabilità solidale; il modulo HR con Cassa Edile serve a chi ha operai inquadrati con il CCNL Edilizia; il controllo margini serve al titolare che vuole sapere quale cantiere guadagna davvero. Serramentisti, idraulici, posatori e lattonieri trovano inoltre i moduli Render AI per mostrare al cliente un prima/dopo realistico e chiudere più preventivi.</p>

    <h2>Domande frequenti sulle funzionalità</h2>
    <h3>Quali funzionalità offre Edilizia in Cloud?</h3>
    <p>Edilizia in Cloud offre 8 moduli integrati: gestione cantieri, preventivi professionali, fatturazione elettronica SDI, controllo margini per commessa, gestione subappalti e DURC, DDT e ordini fornitori, HR con presenze geolocalizzate e prima nota contabile. A questi si aggiungono assistente AI, portale clienti, firma elettronica e moduli Render AI.</p>
    <h3>Edilizia in Cloud funziona da smartphone in cantiere?</h3>
    <p>Sì. L'app mobile è ottimizzata per il cantiere e funziona anche offline: si possono timbrare presenze con geolocalizzazione, consultare documenti, aggiornare lo stato dei lavori e registrare DDT direttamente dal telefono. La sincronizzazione avviene appena torna la connessione.</p>
    <h3>Come funziona il controllo dei margini di cantiere?</h3>
    <p>Il modulo margini confronta in tempo reale il preventivo con il consuntivo per ogni cantiere, analizzando costi di manodopera, materiali, subappalti e oneri di sicurezza. Quando il margine scende sotto la soglia configurata, il titolare riceve un alert immediato, prima che il cantiere chiuda in perdita.</p>
    <h3>Edilizia in Cloud invia il MUT alla Cassa Edile?</h3>
    <p>Sì. Il modulo HR calcola ore ordinarie e straordinarie secondo il CCNL Edilizia, gestisce TFR e contributi e genera la denuncia mensile MUT pronta per l'invio alla Cassa Edile, oltre all'export per il consulente del lavoro.</p>
    <h3>Posso gestire i subappaltatori e il DURC?</h3>
    <p>Sì. Il modulo subappalti tiene l'anagrafica dei subappaltatori con verifica automatica delle scadenze di DURC, POS e polizze, traccia la ritenuta d'acconto e aiuta a gestire la responsabilità solidale del committente secondo il Codice degli Appalti.</p>
    <h3>L'assistente AI Silvio cosa può fare?</h3>
    <p>Silvio redige bozze di preventivo da una descrizione testuale, classifica le fatture passive in arrivo, suggerisce solleciti per le fatture scadute e monitora il margine di cantiere proponendo correzioni. Ogni operazione sensibile richiede sempre la conferma esplicita dell'utente.</p>
    `,
    links: [
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi Professionali" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione Elettronica" },
      { href: "/funzionalita/margini-cantiere", label: "Controllo Margini" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
      { href: "/funzionalita/gestione-subappalti", label: "Gestione Subappalti" },
      { href: "/prezzi", label: "Piani e Prezzi" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Quali funzionalità offre Edilizia in Cloud?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Edilizia in Cloud offre 8 moduli integrati: gestione cantieri, preventivi professionali, fatturazione elettronica SDI, controllo margini per commessa, gestione subappalti e DURC, DDT, HR con presenze geolocalizzate e prima nota contabile.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud funziona da smartphone in cantiere?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì, Edilizia in Cloud ha un'app mobile ottimizzata per il cantiere che funziona anche offline. Puoi timbrare presenze con geolocalizzazione, consultare documenti, aggiornare lo stato dei lavori e registrare DDT direttamente dal telefono.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud gestisce la fatturazione elettronica SDI?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì, Edilizia in Cloud integra la fatturazione elettronica SDI completa: fatture B2B, FatturaPA per la pubblica amministrazione, split payment, reverse charge edilizia, note di credito e archiviazione fiscale a norma.",
          },
        },
        {
          "@type": "Question",
          name: "Come funziona il controllo margini di Edilizia in Cloud?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Il modulo margini confronta in tempo reale il preventivo con il consuntivo per ogni cantiere. Analizza costi di manodopera, materiali e subappalti, segnalando immediatamente quando un cantiere sta perdendo margine.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud invia il MUT alla Cassa Edile?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì. Il modulo HR calcola ore ordinarie e straordinarie secondo il CCNL Edilizia, gestisce TFR e contributi e genera la denuncia mensile MUT pronta per l'invio alla Cassa Edile, oltre all'export per il consulente del lavoro.",
          },
        },
        {
          "@type": "Question",
          name: "Posso gestire i subappaltatori e il DURC con Edilizia in Cloud?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì. Il modulo subappalti tiene l'anagrafica dei subappaltatori con verifica automatica delle scadenze di DURC, POS e polizze, traccia la ritenuta d'acconto e aiuta a gestire la responsabilità solidale del committente secondo il Codice degli Appalti.",
          },
        },
        {
          "@type": "Question",
          name: "Cosa può fare l'assistente AI Silvio di Edilizia in Cloud?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Silvio redige bozze di preventivo da una descrizione testuale, classifica le fatture passive in arrivo, suggerisce solleciti per le fatture scadute e monitora il margine di cantiere proponendo correzioni. Ogni operazione sensibile richiede la conferma esplicita dell'utente.",
          },
        },
      ],
    },
  },

  "/funzionalita/gestione-cantieri": {
    title: "Gestione Cantieri Digitale | App e Cloud Edilizia",
    description:
      "Edilizia in Cloud gestisce i tuoi cantieri in tempo reale: avanzamento lavori, squadre, materiali, SAL e costi. App mobile con funzionamento offline.",
    h1: "Gestione cantieri digitale con Edilizia in Cloud",
    intro:
      "Edilizia in Cloud trasforma la gestione cantieri: monitora avanzamento lavori, presenze squadre con geolocalizzazione, consumo materiali e scostamento dal budget in tempo reale. L'app mobile funziona anche offline, sincronizzando i dati appena torna la connessione. Le imprese edili che usano Edilizia in Cloud riducono i tempi di reportistica cantiere dell'80%.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/fatturazione-elettronica": {
    title: "Fatturazione Elettronica Edilizia SDI",
    description:
      "Edilizia in Cloud integra la fatturazione elettronica SDI: fatture B2B e PA, split payment, reverse charge edilizia, note di credito e archiviazione a norma.",
    h1: "Fatturazione elettronica per imprese edili con Edilizia in Cloud",
    intro:
      "Edilizia in Cloud integra la fatturazione elettronica SDI completa per imprese edili: emetti fatture B2B e FatturaPA direttamente dal gestionale, con split payment, reverse charge edilizia, note di credito e archiviazione fiscale a norma. Zero doppio inserimento: ogni fattura è collegata al cantiere e aggiorna automaticamente i margini. Riduce gli errori di fatturazione del 95% e il tempo di emissione da 15 minuti a 2 minuti per fattura.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/integrazioni", label: "Integrazioni" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/preventivi-edilizia": {
    title: "Preventivi Edilizia con Prezziari e Firma Digitale",
    description:
      "Edilizia in Cloud crea preventivi edili professionali in minuti: computi metrici, prezziari regionali, calcolo ricarichi, firma digitale e accettazione online.",
    h1: "Preventivi edilizia professionali con Edilizia in Cloud",
    intro:
      "Edilizia in Cloud genera preventivi edili professionali in minuti: prezziari regionali aggiornati, calcolo automatico dei ricarichi, computo metrico integrato, firma digitale e portale di accettazione online per il cliente. Le imprese edili che usano Edilizia in Cloud per i preventivi aumentano il tasso di accettazione del 35% grazie alla presentazione professionale.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/margini-cantiere": {
    title: "Controllo Margini Cantiere | Preventivo vs Consuntivo",
    description:
      "Edilizia in Cloud analizza la redditività di ogni cantiere in tempo reale. Confronta preventivo vs consuntivo: manodopera, materiali e subappalti.",
    h1: "Controllo margini per cantiere con Edilizia in Cloud",
    intro:
      "Edilizia in Cloud confronta preventivo vs consuntivo in tempo reale per ogni cantiere. Analizza costi di manodopera, materiali e subappalti con alert automatici quando un cantiere supera il budget previsto. Il 68% delle imprese edili non conosce i margini reali per commessa: con Edilizia in Cloud hai il controllo completo e scopri dove perdi margine prima che sia troppo tardi.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/hr-personale": {
    title: "Gestione HR e Personale Edile | Edilizia in Cloud",
    description:
      "Gestisci presenze cantiere, buste paga, ferie e documentazione del personale edile. Tutto integrato nel gestionale.",
    h1: "Gestione HR e Personale per Imprese Edili",
    intro:
      "Gestisci presenze in cantiere con geolocalizzazione, calcola ore lavorate per commessa, gestisci ferie, permessi e malattie. Tutto collegato alla contabilità cantiere.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/gestione-subappalti": {
    title: "Gestione Subappalti Edilizia | Edilizia in Cloud",
    description:
      "Gestisci contratti, DURC, pagamenti e scadenze dei subappaltatori. Tutto tracciato e sotto controllo nel gestionale.",
    h1: "Gestione Subappalti per Imprese Edili",
    intro:
      "Tieni sotto controllo ogni subappaltatore: contratti, DURC, scadenze assicurative, SAL e pagamenti. Responsabilità solidale gestita senza rischi.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/blog/subappalto-edilizia-guida", label: "Guida Subappalto" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/render-infissi": {
    title: "Render Infissi AI per Serramentisti",
    description:
      "Render Infissi AI: mostra al cliente come cambieranno i suoi serramenti sulla foto reale della sua casa. Differenziati dal prezzo e chiudi più preventivi.",
    h1: "Render Infissi AI per Serramentisti",
    intro:
      "Trasforma la foto del cliente in un prima/dopo credibile: nuovi serramenti, colori, vetri, cassonetti, tapparelle e persiane sulla stessa facciata. Il preventivo non è più solo una cifra, ma una scelta che il cliente riesce finalmente a vedere.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/per/serramentisti", label: "Software per Serramentisti" },
      { href: "/demo", label: "Prova GRATIS il Render AI" },
    ],
  },

  "/funzionalita/render-bagni": {
    title: "Render Bagni AI per Idraulici e Showroom",
    description:
      "Render Bagni AI: trasforma la foto del bagno del cliente in un prima/dopo realistico con nuovi sanitari, doccia, mobile e rivestimenti. Chiudi più preventivi.",
    h1: "Render Bagni AI per Idraulici e Showroom",
    intro:
      "Trasforma la foto reale del bagno del cliente in un prima/dopo credibile: nuovi sanitari, doccia, mobile lavabo, rivestimenti, pavimento e illuminazione applicati allo stesso ambiente. Il preventivo bagno non è più una cifra astratta, ma una proposta che il cliente riesce finalmente a immaginare.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/render-pavimenti", label: "Render Pavimenti" },
      { href: "/demo", label: "Prova GRATIS Render Bagni" },
    ],
  },

  "/funzionalita/render-tetti": {
    title: "Render Tetti AI per Imprese di Copertura",
    description:
      "Render Tetti AI: mostra al cliente come cambierà il suo tetto sulla foto reale della casa. Coperture, lattoneria, fotovoltaico e lucernari pronti per la trattativa.",
    h1: "Render Tetti AI per Imprese di Copertura e Lattonieri",
    intro:
      "Trasforma la foto reale della casa del cliente in un prima/dopo credibile: nuovo manto di copertura, lattoneria, lucernari, fotovoltaico e finiture applicati alla stessa abitazione. Il preventivo tetto non è più una cifra opaca, ma una proposta che il cliente riesce finalmente a vedere.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/render-ristrutturazioni", label: "Render Ristrutturazioni" },
      { href: "/demo", label: "Prova GRATIS Render Tetti" },
    ],
  },

  "/funzionalita/render-pavimenti": {
    title: "Render Pavimenti AI per Posatori",
    description:
      "Render Pavimenti AI: trasforma la foto della stanza del cliente in un prima/dopo realistico con nuovo gres, parquet, resine e finiture. Chiudi più preventivi.",
    h1: "Render Pavimenti AI per Posatori e Showroom",
    intro:
      "Trasforma la foto reale della stanza del cliente in un prima/dopo credibile: nuovo pavimento in gres, parquet, resina o piastrelle applicato allo stesso ambiente. Il preventivo pavimenti non è più una scheda tecnica, ma una proposta che il cliente riesce finalmente a immaginare.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/render-bagni", label: "Render Bagni" },
      { href: "/demo", label: "Prova GRATIS Render Pavimenti" },
    ],
  },

  "/funzionalita/render-ristrutturazioni": {
    title: "Render Ristrutturazioni AI per Imprese Edili",
    description:
      "Render Ristrutturazioni AI: mostra al cliente come cambierà la sua casa dopo la ristrutturazione, sulla foto reale. Cucina, bagno, living e finiture in trattativa.",
    h1: "Render Ristrutturazioni AI per Imprese Edili e General Contractor",
    intro:
      "Trasforma la foto reale della casa del cliente in un prima/dopo credibile dell'intera ristrutturazione: cucina, bagno, soggiorno, camera, pavimenti, pareti e finiture applicate agli stessi ambienti. Il preventivo ristrutturazione non è più una stima astratta, ma un progetto che il cliente riesce finalmente a vedere.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/per/ristrutturatori", label: "Software per Ristrutturatori" },
      { href: "/demo", label: "Prova GRATIS Render Ristrutturazioni" },
    ],
  },

  "/funzionalita/render-stanza": {
    title: "Render Stanza AI per Arredatori",
    description:
      "Render Stanza AI: trasforma la foto della stanza del cliente in un prima/dopo realistico con nuovi mobili, divani, illuminazione e tessuti. Chiudi più ordini arredo.",
    h1: "Render Stanza AI per Arredatori, Mobilieri e Interior Designer",
    intro:
      "Trasforma la foto reale del soggiorno, della cucina o della camera del cliente in un prima/dopo credibile: nuovi mobili, divani, cucine, illuminazione e tessili applicati allo stesso ambiente. Il preventivo arredo non è più una lista di codici, ma una proposta che il cliente riesce finalmente a immaginare.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/render-ristrutturazioni", label: "Render Ristrutturazioni" },
      { href: "/demo", label: "Prova GRATIS Render Stanza" },
    ],
  },

  "/funzionalita/render-piscine": {
    title: "Render Piscine AI per Piscinisti",
    description:
      "Render Piscine AI: trasforma la foto del giardino del cliente in un prima/dopo realistico con nuova piscina, bordo, pavimentazione, pergola e verde. Chiudi più contratti.",
    h1: "Render Piscine AI per Piscinisti e Installatori Outdoor",
    intro:
      "Trasforma la foto reale del giardino del cliente in un prima/dopo credibile: nuova piscina, bordo, pavimentazione esterna, pergola, illuminazione e verde applicati allo stesso spazio. Il preventivo piscina non è più una cifra alta e astratta, ma una proposta che il cliente riesce finalmente a immaginare.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/render-ristrutturazioni", label: "Render Ristrutturazioni" },
      { href: "/demo", label: "Prova GRATIS Render Piscine" },
    ],
  },

  // ── Funzionalità — TIER 1 (high-impact SEO landing pages) ─────────
  "/funzionalita/cassa-cantiere": {
    title: "Cassa Cantiere e Cash Flow PSD2 Edilizia",
    description:
      "Gestione cassa multi-banca PSD2 con previsionale 30/60/90 giorni per imprese edili. Niente più sorprese di liquidità: alert sconfinamento e proiezione dei pagamenti automatica.",
    h1: "Cassa Cantiere e Previsionale Cash Flow PSD2",
    intro:
      "Edilizia in Cloud collega tutti i tuoi conti banca via PSD2 e calcola in tempo reale la cassa consolidata, il previsionale a 30/60/90 giorni e l'impatto di ogni SAL e fattura sui flussi futuri. Le imprese che usano la Cassa Cantiere riducono lo scoperto medio del 60% e azzerano le sorprese di fine mese.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/tesoreria", label: "Tesoreria" },
      { href: "/funzionalita/scadenzario", label: "Scadenzario" },
    ],
  },

  "/funzionalita/agenti-ai": {
    title: "Agenti AI per Imprese Edili — GDPR-First | Edilizia in Cloud",
    description:
      "Agenti AI verticali per impresa edile: rispondono ai clienti, qualificano lead, redigono preventivi base e gestiscono back-office. Privacy GDPR-first, dati italiani.",
    h1: "Agenti AI per Imprese Edili: privacy GDPR-first",
    intro:
      "Edilizia in Cloud integra agenti AI custom per impresa edile: rispondono a clienti via WhatsApp/email, qualificano lead, redigono preventivi base, gestiscono back-office. Architettura privacy GDPR-first, niente training su contenuti del cliente. Risparmio medio 70% sulle ore segreteria.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/automazioni", label: "Automazioni" },
      { href: "/funzionalita/quote-builder-ai", label: "Quote Builder AI" },
    ],
  },

  "/funzionalita/portale-clienti": {
    title: "Portale Clienti Edilizia con SAL Online",
    description:
      "Area cliente brandizzata con avanzamento cantiere live, foto, documenti, SAL firmabili online. Riduce del 60% le telefonate di update e migliora la percezione della tua impresa.",
    h1: "Portale Clienti per Imprese Edili e Ristrutturatori",
    intro:
      "Edilizia in Cloud offre un portale cliente brandizzato dove ogni cliente accede da web e mobile per vedere avanzamento lavori in tempo reale, foto del giorno, documenti tecnici, SAL firmabili online e fatture. Trasparenza che riduce del 60% le telefonate di update e fa crescere del 35% le recensioni Google a 5 stelle.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/firma-elettronica", label: "Firma Elettronica" },
      { href: "/funzionalita/foto-cantiere", label: "Foto Cantiere" },
    ],
  },

  "/funzionalita/firma-elettronica": {
    title: "Firma Elettronica Edilizia per SAL e Contratti",
    description:
      "Firma elettronica avanzata eIDAS per imprese edili: preventivi, SAL, varianti, contratti firmati in 30 secondi dal telefono del cliente. Marca temporale e archivio cloud immutabile.",
    h1: "Firma Elettronica eIDAS per Imprese Edili",
    intro:
      "Edilizia in Cloud integra la firma elettronica avanzata conforme eIDAS in ogni documento: preventivi, SAL, varianti, contratti, DURC. Il cliente firma dal telefono in 30 secondi, marca temporale qualificata, archivio cloud immutabile decennale conforme CAD. Cassa accelerata di 7-12 giorni per ogni SAL.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/portale-clienti", label: "Portale Clienti" },
      { href: "/funzionalita/conserva-digitale", label: "Conservazione Digitale" },
    ],
  },

  "/funzionalita/whatsapp-marketing": {
    title: "WhatsApp Marketing per Imprese Edili",
    description:
      "WhatsApp Business API integrato per imprese edili: notifiche cantiere automatiche, broadcast, template approvati Meta, consensi GDPR. Conversione 8x rispetto all'email.",
    h1: "WhatsApp Marketing per Imprese Edili",
    intro:
      "Edilizia in Cloud integra WhatsApp Business API per inviare notifiche cantiere automatiche, broadcast a clienti edili, follow-up post-consegna. Template approvati Meta, gestione consensi GDPR, tasso di apertura 95%+ e conversione 8x rispetto all'email tradizionale.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/email-marketing", label: "Email Marketing" },
      { href: "/funzionalita/sms-marketing", label: "SMS Marketing" },
    ],
  },

  "/funzionalita/email-marketing": {
    title: "Email Marketing per Imprese Edili",
    description:
      "Email marketing verticale per imprese edili: segmentazione clienti attivi/dormienti/lead, template settoriali, automazioni post-cantiere, GDPR. Riattiva i clienti dormienti.",
    h1: "Email Marketing per Imprese Edili",
    intro:
      "Edilizia in Cloud offre email marketing verticale per il settore edile: segmentazione automatica (clienti attivi, dormienti, lead caldi), template settoriali, automazioni post-cantiere ('come va dopo 6 mesi?'), gestione consensi GDPR. Riattiva i clienti dormienti e genera passaparola caldo.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/whatsapp-marketing", label: "WhatsApp Marketing" },
      { href: "/funzionalita/automazioni", label: "Automazioni" },
    ],
  },

  "/funzionalita/automazioni": {
    title: "Automazioni Workflow per Edilizia | Edilizia in Cloud",
    description:
      "Automazioni no-code per imprese edili: trigger su SAL, fatture, scadenze, cantieri. Azioni email, WhatsApp, task, notifiche. Libreria template settoriali pronti all'uso.",
    h1: "Automazioni Workflow per Imprese Edili",
    intro:
      "Edilizia in Cloud automatizza i flussi operativi tipici dell'edilizia: trigger su eventi cantiere, SAL, fatture, scadenze; azioni email, WhatsApp, task interni, notifiche team. Libreria di template settoriali pronti (sollecito DURC, follow-up post-cantiere, alert ritenute). Risparmia 1,5 ore a settimana per ogni automazione attiva.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/agenti-ai", label: "Agenti AI" },
      { href: "/funzionalita/email-marketing", label: "Email Marketing" },
    ],
  },

  "/funzionalita/crm-edilizia": {
    title: "CRM Edilizia per Lead, Preventivi e Follow-up",
    description:
      "CRM verticale per imprese edili: pipeline preventivi, lead da Google/Facebook/passaparola, tagging cantieri (residenziale/commerciale), follow-up automatici, conversion rate per fonte.",
    h1: "CRM Verticale per Imprese Edili",
    intro:
      "Edilizia in Cloud è il CRM verticale per imprese edili e ristrutturatori: pipeline preventivi visuale, gestione lead da tutti i canali (Google, Facebook, passaparola, sito), tagging cantieri (residenziale, commerciale, fotovoltaico), follow-up automatici e conversion rate per fonte. Aumenta la conversione lead-cliente del 5-8%.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/pipeline-vendite", label: "Pipeline Vendite" },
      { href: "/funzionalita/lead-form-facebook", label: "Lead Form Facebook" },
    ],
  },

  "/funzionalita/cruscotto-aziendale": {
    title: "Cruscotto Aziendale Edilizia con KPI Real-Time",
    description:
      "Dashboard executive per titolari edili: margine cantieri live, cassa 90 giorni, fatturato, pipeline. Drill-down per cantiere/cliente, mobile-first. Decisioni informate.",
    h1: "Cruscotto Aziendale per Imprese Edili",
    intro:
      "Edilizia in Cloud offre un cruscotto aziendale real-time per titolari edili: KPI di margine cantieri, cassa consolidata 90 giorni, fatturato per periodo, pipeline preventivi. Drill-down completo per cantiere/cliente, mobile-first per il titolare in cantiere. Recupera il 3% di margine grazie a decisioni più rapide e informate.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
      { href: "/funzionalita/report-fatturazione", label: "Report Fatturazione" },
    ],
  },

  "/funzionalita/giornale-lavori": {
    title: "Giornale Lavori Digitale per Cantieri",
    description:
      "Giornale lavori digitale conforme art. 15 D.M. 49/2018 e D.Lgs 50/2016. Registrazione giornaliera maestranze, mezzi, forniture, eventi. Firma DL e RUP, esportazione PDF/A.",
    h1: "Giornale Lavori Digitale per Imprese Edili",
    intro:
      "Edilizia in Cloud digitalizza il giornale lavori conforme art. 15 D.M. 49/2018 e D.Lgs 50/2016: registrazione giornaliera di maestranze, mezzi, forniture, eventi atmosferici, sospensioni. Firma elettronica del Direttore Lavori e del RUP, esportazione PDF/A per archivio decennale, riduzione 40% del tempo segreteria.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/funzionalita/foto-cantiere", label: "Foto Cantiere" },
    ],
  },

  "/funzionalita/sicurezza-cantiere": {
    title: "Sicurezza Cantiere e POS Digitali",
    description:
      "Gestione sicurezza cantiere conforme D.Lgs 81/2008: POS digitali, DUVRI, formazione tracciata, DPI, sopralluoghi, near-miss. Integrazione coordinatore sicurezza, scadenze visite mediche.",
    h1: "Sicurezza Cantiere per Imprese Edili",
    intro:
      "Edilizia in Cloud digitalizza la sicurezza cantiere conforme D.Lgs 81/2008: POS digitali per ogni cantiere, DUVRI, formazione operai tracciata, DPI tracciati con scadenze, sopralluoghi sicurezza, gestione near-miss. Integrazione con il coordinatore sicurezza, scadenze visite mediche operai monitorate, conformità ispezioni ASL pronte in tempo reale.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
      { href: "/funzionalita/giornale-lavori", label: "Giornale Lavori" },
    ],
  },

  "/funzionalita/foto-cantiere": {
    title: "Foto Cantiere Geolocalizzate — App Mobile | Edilizia in Cloud",
    description:
      "App mobile per capocantieri: foto geolocalizzate con timestamp, organizzate per cantiere/giorno, condivise sul portale cliente. Archivio cloud, prova legale di stato cantiere.",
    h1: "Foto Cantiere per Imprese Edili",
    intro:
      "Edilizia in Cloud offre un'app mobile dedicata al capocantiere per scattare foto geolocalizzate con timestamp, organizzate automaticamente per cantiere e giorno, condivise sul portale cliente in tempo reale. Archivio cloud illimitato, prova legale di stato cantiere in caso di contestazione, integrazione con giornale lavori.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/portale-clienti", label: "Portale Clienti" },
      { href: "/funzionalita/app-cantiere-mobile", label: "App Cantiere Mobile" },
    ],
  },

  // ── Funzionalità — TIER 2 (financial / fiscal / operational) ──────
  "/funzionalita/cassetto-sdi": {
    title: "Cassetto Fiscale SDI per Edilizia",
    description:
      "Cassetto fiscale Agenzia Entrate integrato: sincronizzazione automatica fatture B2B/B2C ricevute via SDI, riconciliazione contabile, ricerca semantica, export commercialista.",
    h1: "Cassetto Fiscale SDI per Imprese Edili",
    intro:
      "Edilizia in Cloud sincronizza automaticamente con il tuo cassetto fiscale Agenzia Entrate: tutte le fatture B2B e B2C ricevute via SDI vengono importate, riconciliate con i tuoi registri contabili e indicizzate per ricerca semantica. Niente più download manuali, export pronto per il commercialista in 1 click.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione Elettronica SDI" },
      { href: "/funzionalita/conserva-digitale", label: "Conservazione Digitale" },
    ],
  },

  "/funzionalita/conserva-digitale": {
    title: "Conservazione Digitale CAD per Edilizia",
    description:
      "Conservazione decennale conforme CAD (D.Lgs 82/2005) per fatture, contratti, DDT, libri contabili. Marca temporale qualificata AgID, esibizione su richiesta GdF in 30 secondi.",
    h1: "Conservazione Digitale per Imprese Edili",
    intro:
      "Edilizia in Cloud offre conservazione digitale decennale conforme CAD (D.Lgs 82/2005) per tutti i documenti dell'impresa edile: fatture, contratti, DDT, libri contabili, registri IVA. Marca temporale qualificata AgID, hash SHA-256 per integrità, esibizione su richiesta Guardia di Finanza in 30 secondi con dossier completo.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/cassetto-sdi", label: "Cassetto Fiscale SDI" },
      { href: "/funzionalita/registro-iva", label: "Registro IVA" },
    ],
  },

  "/funzionalita/scadenzario": {
    title: "Scadenzario Clienti e Fornitori Edilizia | Edilizia in Cloud",
    description:
      "Scadenzario clienti e fornitori: alert pre-scadenza, solleciti automatici multi-step (email/WhatsApp), aging report, recupero credito strutturato. Riduce le sofferenze del 4%.",
    h1: "Scadenzario per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce lo scadenzario clienti e fornitori con alert pre-scadenza, solleciti automatici multi-step (email/WhatsApp/SMS), aging report dettagliato, integrazione con il modulo cassa. Recupera in media il 4% delle sofferenze con un sistema di sollecito strutturato e tracciato.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/tesoreria", label: "Tesoreria" },
      { href: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere" },
    ],
  },

  "/funzionalita/prima-nota": {
    title: "Prima Nota Cassa/Banca Digitale Edilizia | Edilizia in Cloud",
    description:
      "Prima nota cassa/banca digitale con riconciliazione automatica estratti conto, categorizzazione AI, dashboard cassa giornaliera, export commercialista in formato XBRL.",
    h1: "Prima Nota Digitale per Imprese Edili",
    intro:
      "Edilizia in Cloud digitalizza la prima nota cassa e banca con riconciliazione automatica degli estratti conto via PSD2, categorizzazione AI dei movimenti (cantieri, fornitori, F24, stipendi), dashboard cassa giornaliera. Export per il commercialista in formato XBRL Banca d'Italia, risparmio 3 minuti per movimento.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/contabilita-fiscale", label: "Contabilità Fiscale" },
      { href: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere" },
    ],
  },

  "/funzionalita/tesoreria": {
    title: "Tesoreria Multi-Banca PSD2 Edilizia | Edilizia in Cloud",
    description:
      "Gestione tesoreria multi-banca PSD2 per imprese edili: posizione cassa consolidata, previsionale 30/60/90 gg, alert sconfinamento, conciliazione automatica. Riduce gli interessi del 60%.",
    h1: "Tesoreria Multi-Banca per Imprese Edili",
    intro:
      "Edilizia in Cloud collega via PSD2 tutti i tuoi conti banca italiani per una posizione cassa consolidata real-time, previsionale 30/60/90 giorni, alert sconfinamento automatici, conciliazione automatica con prima nota. Riduce gli interessi passivi del 60% e azzera le sorprese di fine mese.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere" },
      { href: "/funzionalita/prima-nota", label: "Prima Nota" },
    ],
  },

  "/funzionalita/timbrature-gps": {
    title: "Timbrature GPS Cantiere per Operai",
    description:
      "App mobile timbrature operai con GPS geofence cantiere, antifrode foto-timbratura, integrazione cedolini paga CCNL Edilizia, ore extra/notturne calcolate automaticamente.",
    h1: "Timbrature GPS per Imprese Edili",
    intro:
      "Edilizia in Cloud offre un'app mobile dedicata alle timbrature operai con GPS geofence per cantiere, antifrode foto-timbratura opzionale, integrazione diretta con cedolini paga CCNL Edilizia industria/artigianato, calcolo automatico ore extra, notturne, festive. Recupero medio 1-3 ore al mese per operaio.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/cedolini-paga", label: "Cedolini Paga" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
    ],
  },

  "/funzionalita/ordini-acquisto": {
    title: "Ordini Acquisto Fornitori Edilizia | Edilizia in Cloud",
    description:
      "Gestione ordini fornitori con PO digitali, conferma firma elettronica, riconciliazione DDT/fatture, listini fornitori aggiornati, tracking arrivi cantiere. Recupero 4% sui prezzi.",
    h1: "Ordini Acquisto per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce gli ordini fornitori con PO digitali, conferma firma elettronica del fornitore, riconciliazione automatica DDT/fatture/ordine, listini fornitori aggiornati, tracking arrivi in cantiere via app. Recupero medio del 4% sui prezzi grazie a controllo prezzi storici e gare automatiche.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/magazzino-cantiere", label: "Magazzino Cantiere" },
      { href: "/funzionalita/ddt-digitali", label: "DDT Digitali" },
    ],
  },

  "/funzionalita/magazzino-cantiere": {
    title: "Magazzino Cantiere Multi-Sede",
    description:
      "Magazzino multi-cantiere con stock per cantiere, prelievi tracciati via app, scorte minime, ordini automatici, codici a barre, valorizzazione FIFO. Recupero 8% su scorte sprecate.",
    h1: "Magazzino Cantiere per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce il magazzino multi-cantiere: stock per cantiere, prelievi tracciati via app mobile, scorte minime con ordini automatici, codici a barre per identificazione rapida, valorizzazione FIFO conforme principi contabili. Recupero medio dell'8% su scorte sprecate o duplicate tra cantieri.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/ordini-acquisto", label: "Ordini Acquisto" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
    ],
  },

  "/funzionalita/sms-marketing": {
    title: "SMS Marketing Edilizia per Clienti e Cantieri",
    description:
      "SMS transazionali e marketing per imprese edili: notifiche cantiere automatiche, promemoria sopralluogo, alert SAL/fattura. Deliverability 99% Italia, integrazione CRM.",
    h1: "SMS Marketing per Imprese Edili",
    intro:
      "Edilizia in Cloud integra SMS transazionali e marketing per imprese edili: notifiche cantiere automatiche, promemoria sopralluoghi, alert SAL pronti, scadenze fatture. Deliverability 99% sui circuiti italiani, integrazione CRM per personalizzazione, conformità GDPR per consensi e disiscrizione.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/whatsapp-marketing", label: "WhatsApp Marketing" },
      { href: "/funzionalita/email-marketing", label: "Email Marketing" },
    ],
  },

  "/funzionalita/pipeline-vendite": {
    title: "Pipeline Vendite Edilizia e Preventivi",
    description:
      "Pipeline preventivi visuale per imprese edili: drag&drop fasi (lead/sopralluogo/preventivo/trattativa/firmato), forecast cassa, conversion rate per fonte, target vs actual.",
    h1: "Pipeline Vendite per Imprese Edili",
    intro:
      "Edilizia in Cloud offre una pipeline preventivi visuale stile Trello per imprese edili: drag&drop tra fasi (lead, sopralluogo, preventivo inviato, trattativa, firmato), forecast cassa basato su probabilità chiusura, conversion rate per fonte (Google, Facebook, passaparola), target vs actual mensile.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/crm-edilizia", label: "CRM Edilizia" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia" },
    ],
  },

  // ── Funzionalità — TIER 3 (vertical / niche / advanced) ───────────
  "/funzionalita/fotovoltaico": {
    title: "Software Gestione Cantieri Fotovoltaico",
    description:
      "Gestione progetti fotovoltaico residenziale e industriale: pratiche GSE, Superbonus 110%/Conto Termico, pratiche Enel, schede tecniche pannelli, monitoraggio post-installazione.",
    h1: "Software Fotovoltaico per Installatori e Costruttori",
    intro:
      "Edilizia in Cloud digitalizza la gestione completa dei cantieri fotovoltaici residenziali e industriali: pratiche GSE Scambio sul Posto e Ritiro Dedicato, Superbonus 110% e Conto Termico, pratiche Enel/distributore, schede tecniche pannelli e inverter, monitoraggio post-installazione, garanzia 25 anni gestita.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/per/fotovoltaico", label: "Per Installatori Fotovoltaico" },
      { href: "/funzionalita/finanziamenti-cantieri", label: "Finanziamenti Cantieri" },
    ],
  },

  "/funzionalita/manutenzione-impianti": {
    title: "Manutenzione Impianti e Libretti Digitali",
    description:
      "Manutenzione programmata e correttiva impianti idraulici, elettrici, climatizzazione, fotovoltaici. Libretti d'impianto, scadenze normative DPR 74/2013, FGAS, app tecnico mobile.",
    h1: "Manutenzione Impianti per Manutentori Edili",
    intro:
      "Edilizia in Cloud gestisce la manutenzione programmata e correttiva di impianti termici, idraulici, elettrici, climatizzazione e fotovoltaici. Libretti d'impianto digitali, scadenze normative DPR 74/2013 e FGAS controllate, contratti di manutenzione tracciati, app mobile per tecnico in trasferta.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/ticket-assistenza", label: "Ticket Assistenza" },
      { href: "/funzionalita/calendario-lavori", label: "Calendario Lavori" },
    ],
  },

  "/funzionalita/ddt-digitali": {
    title: "DDT Digitali Edilizia con Firma Mobile",
    description:
      "Documenti di trasporto digitali con integrazione fatturazione SDI, firma autista in mobilità, archivio CAD decennale, riconciliazione automatica con ordini e fatture.",
    h1: "DDT Digitali per Imprese Edili",
    intro:
      "Edilizia in Cloud digitalizza i documenti di trasporto: emissione DDT in 30 secondi, firma elettronica autista in mobilità, integrazione fatturazione SDI per emissione differita, archivio decennale conforme CAD, riconciliazione automatica con ordini di acquisto e fatture fornitori.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/ordini-acquisto", label: "Ordini Acquisto" },
      { href: "/funzionalita/magazzino-cantiere", label: "Magazzino Cantiere" },
    ],
  },

  "/funzionalita/ritenute-garanzia": {
    title: "Ritenute di Garanzia e Subappalto Edilizia",
    description:
      "Gestione ritenute 0,5% L. 296/2006 e 4% INPS subappalto art. 17 ter D.P.R. 633/72. Scadenze svincolo controllate, DURC verificati, archivio documentale a norma.",
    h1: "Ritenute di Garanzia per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce le ritenute di garanzia 0,5% L. 296/2006 sui cantieri pubblici e la ritenuta 4% INPS sul subappalto art. 17 ter D.P.R. 633/72: scadenze svincolo controllate, DURC verificati prima dello svincolo, archivio documentale conforme CAD. Recupero medio 0,5% di valore cantiere mai svincolato per dimenticanza.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-subappalti", label: "Gestione Subappalti" },
      { href: "/funzionalita/scadenzario", label: "Scadenzario" },
    ],
  },

  "/funzionalita/finanziamenti-cantieri": {
    title: "Finanziamenti Cantieri e Cessione Credito",
    description:
      "Gestione cessione credito Superbonus/Sismabonus/Ecobonus, factoring fatture cantiere, anticipo SAL banche, dossier finanziabilità. Banche concorrenti per ridurre lo sconto.",
    h1: "Finanziamenti Cantieri per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce la cessione del credito Superbonus 110%, Sismabonus, Ecobonus, il factoring delle fatture cantiere, l'anticipo SAL bancario. Dossier finanziabilità preparato automaticamente, banche concorrenti messe in competizione per ridurre il costo dello sconto. Recupero medio 2% sul valore del credito ceduto.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/fotovoltaico", label: "Fotovoltaico" },
      { href: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere" },
    ],
  },

  "/funzionalita/lead-form-facebook": {
    title: "Lead Form Facebook per Imprese Edili",
    description:
      "Integrazione Lead Ads Facebook/Instagram: sync automatico CRM, qualificazione AI, distribuzione commerciali. Conversione lead-cliente edilizia 8-12% medio.",
    h1: "Lead Form Facebook per Imprese Edili",
    intro:
      "Edilizia in Cloud integra direttamente i Lead Ads Facebook e Instagram: sync automatico nel CRM, qualificazione AI dei lead in base a budget/zona/intento, distribuzione automatica ai commerciali, follow-up multi-canale. Conversione lead-cliente edilizia media 8-12% con qualificazione AI.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/crm-edilizia", label: "CRM Edilizia" },
      { href: "/funzionalita/pipeline-vendite", label: "Pipeline Vendite" },
    ],
  },

  "/funzionalita/quote-builder-ai": {
    title: "Quote Builder AI per Preventivi Edilizia",
    description:
      "Generatore preventivi AI per imprese edili: riconoscimento foto cantiere, suggerimento computo metrico, prezzari regionali integrati, draft in 5 minuti invece di 4 ore.",
    h1: "Quote Builder AI per Imprese Edili",
    intro:
      "Edilizia in Cloud usa l'AI per generare preventivi edili in 5 minuti invece di 4 ore: il sistema analizza le foto del cantiere, suggerisce le voci di computo metrico, applica i prezzari regionali aggiornati (DEI Lombardia, Lazio, Sicilia), genera la pre-bozza pronta per essere rifinita. Risparmio 70% del tempo per preventivo.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia" },
      { href: "/funzionalita/agenti-ai", label: "Agenti AI" },
    ],
  },

  "/funzionalita/app-cantiere-mobile": {
    title: "App Cantiere Mobile iOS e Android",
    description:
      "App mobile dedicata capocantiere/operai (iOS/Android): timbrature, foto, ordini, SAL, giornale lavori, comunicazione team. Offline-first per cantieri senza copertura.",
    h1: "App Cantiere Mobile per Imprese Edili",
    intro:
      "Edilizia in Cloud offre un'app mobile dedicata a capocantieri e operai (iOS e Android): timbrature GPS, foto geolocalizzate, ordini materiali, registrazione SAL, giornale lavori, comunicazione team. Architettura offline-first che funziona anche in cantieri senza copertura, sincronizzazione appena torna la connessione.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/foto-cantiere", label: "Foto Cantiere" },
      { href: "/funzionalita/timbrature-gps", label: "Timbrature GPS" },
    ],
  },

  // ── Funzionalità — TIER 4 (HR / accounting / supporting) ──────────
  "/funzionalita/cedolini-paga": {
    title: "Cedolini Paga Edilizia e CCNL",
    description:
      "Cedolini paga edilizia con CCNL Edilizia industria/artigianato, calcolo automatico cassa edile, ferie/permessi/banca ore, F24 telematico, UNILAV/UNIEMENS integrati.",
    h1: "Cedolini Paga per Imprese Edili",
    intro:
      "Edilizia in Cloud emette i cedolini paga con CCNL Edilizia industria, artigianato e PMI integrati, calcolo automatico cassa edile (91 casse provinciali), ferie/permessi/banca ore, gratifica natalizia, anzianità professionale edile. F24 telematico Entratel, UNILAV e UNIEMENS automatici, MUT e GNF integrati.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
      { href: "/funzionalita/timbrature-gps", label: "Timbrature GPS" },
    ],
  },

  "/funzionalita/ferie-permessi": {
    title: "Ferie e Permessi Edilizia per Operai",
    description:
      "Gestione ferie, ROL, permessi, malattie integrata con CCNL Edilizia. App self-service operaio, approvazione capocantiere, conteggio automatico residui, calendario condiviso.",
    h1: "Ferie e Permessi per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce ferie, ROL, permessi e malattie integrati con CCNL Edilizia: app self-service per l'operaio (richiesta dal telefono), approvazione capocantiere con un click, conteggio automatico residui, calendario condiviso per evitare sovrapposizioni cantieri. Risparmio 70% del tempo amministrazione.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/cedolini-paga", label: "Cedolini Paga" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
    ],
  },

  "/funzionalita/ticket-assistenza": {
    title: "Ticket Assistenza Edilizia e Garanzie",
    description:
      "Ticketing post-cantiere e garanzia 10 anni edilizia (art. 1669 c.c.): SLA, escalation, integrazione portale cliente, knowledge base, app tecnico mobile per interventi.",
    h1: "Ticket Assistenza per Imprese Edili",
    intro:
      "Edilizia in Cloud gestisce il post-cantiere e la garanzia decennale art. 1669 c.c. con un sistema di ticketing dedicato: SLA configurabili, escalation automatica, integrazione portale cliente per apertura ticket self-service, knowledge base, app tecnico mobile per intervento sul posto. Riduce 1,5 ore per ticket.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/manutenzione-impianti", label: "Manutenzione Impianti" },
      { href: "/funzionalita/portale-clienti", label: "Portale Clienti" },
    ],
  },

  "/funzionalita/chat-interna": {
    title: "Chat Aziendale Edilizia per Cantieri",
    description:
      "Chat aziendale per impresa edile: capocantiere, operai, ufficio. Canali per cantiere, condivisione foto/file/audio, conformità GDPR (no WhatsApp privato), notifiche urgenti.",
    h1: "Chat Aziendale per Imprese Edili",
    intro:
      "Edilizia in Cloud offre una chat aziendale dedicata all'impresa edile: canali per ogni cantiere, condivisione foto/file/audio, conformità GDPR (i messaggi restano dell'azienda quando l'operaio se ne va, a differenza di WhatsApp privato), notifiche urgenti, integrazione con i moduli operativi.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/app-cantiere-mobile", label: "App Cantiere Mobile" },
      { href: "/funzionalita/giornale-lavori", label: "Giornale Lavori" },
    ],
  },

  "/funzionalita/registro-iva": {
    title: "Registri IVA Edilizia e LIPE Automatica",
    description:
      "Registri IVA acquisti/vendite/corrispettivi automatici da SDI, liquidazione periodica IVA (LIPE), conservazione decennale CAD, esibizione GdF in 30 secondi.",
    h1: "Registri IVA per Imprese Edili",
    intro:
      "Edilizia in Cloud genera automaticamente registri IVA acquisti, vendite e corrispettivi a partire dalle fatture SDI, calcola la liquidazione periodica IVA (LIPE) trimestrale o mensile, gestisce reverse charge edilizia (art. 17 c. 6 D.P.R. 633/72) e split payment PA. Conservazione decennale CAD inclusa.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/contabilita-fiscale", label: "Contabilità Fiscale" },
      { href: "/funzionalita/cassetto-sdi", label: "Cassetto Fiscale SDI" },
    ],
  },

  "/funzionalita/contabilita-fiscale": {
    title: "Contabilità Fiscale Edilizia e XBRL",
    description:
      "Contabilità ordinaria/semplificata edilizia: piano dei conti settoriale, ammortamenti automatici, bilancio CEE, esportazione XBRL Banca d'Italia, integrazione fatture SDI.",
    h1: "Contabilità Fiscale per Imprese Edili",
    intro:
      "Edilizia in Cloud offre contabilità ordinaria e semplificata dedicata all'edilizia: piano dei conti settoriale, ammortamenti automatici secondo DM 31/12/1988, bilancio CEE conforme art. 2424-2425 c.c., esportazione XBRL Banca d'Italia per il commercialista, integrazione automatica con fatture SDI e prima nota.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/registro-iva", label: "Registri IVA" },
      { href: "/funzionalita/prima-nota", label: "Prima Nota" },
    ],
  },

  "/funzionalita/calendario-lavori": {
    title: "Calendario Lavori Edilizia e Gantt Cantieri",
    description:
      "Calendario condiviso per pianificazione cantieri: gantt visuale multi-cantiere, allocazione squadre, conflict detection, integrazione meteo, sync Google/Outlook.",
    h1: "Calendario Lavori per Imprese Edili",
    intro:
      "Edilizia in Cloud offre un calendario condiviso per la pianificazione cantieri: gantt visuale multi-cantiere, allocazione squadre con conflict detection automatica, integrazione previsioni meteo per riprogrammazione, sincronizzazione Google Calendar e Outlook, app mobile per il capocantiere.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
    ],
  },

  "/funzionalita/report-fatturazione": {
    title: "Report Fatturazione Edilizia Mensile",
    description:
      "Reportistica fatturazione (per cliente, cantiere, periodo, agente), dashboard mensile fatturato/incassato/scaduto, export PDF/Excel, KPI commerciali, target vs actual.",
    h1: "Report Fatturazione per Imprese Edili",
    intro:
      "Edilizia in Cloud genera reportistica completa sulla fatturazione: vista per cliente, cantiere, periodo, agente. Dashboard mensile con fatturato, incassato e scaduto, export PDF/Excel per il commercialista, KPI commerciali per la rete vendita, target vs actual mensile per ogni filiale o agente.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/cruscotto-aziendale", label: "Cruscotto Aziendale" },
      { href: "/funzionalita/scadenzario", label: "Scadenzario" },
    ],
  },

  "/prezzi": {
    title: "Prezzi Edilizia in Cloud | Piani e Prova Gratis",
    description:
      "Prezzi di Edilizia in Cloud: piano Gestionale 127€/mese, Professionista 247€/mese, Impresa AI 547€/mese. Utenti illimitati, zero costi di attivazione, zero vincoli. Prova gratis 31 giorni.",
    h1: "Prezzi di Edilizia in Cloud: quanto costa il gestionale per imprese edili",
    intro:
      "Edilizia in Cloud propone 3 piani pensati per imprese edili di ogni dimensione, in base al fatturato e non al numero di utenti. Piano Gestionale da 127€/mese per imprese fino a 500K € di fatturato, piano Professionista da 247€/mese per imprese da 500K a 2M € con CRM e controllo di gestione completo, piano Impresa AI da 547€/mese per imprese oltre 2M € o multi-cantiere con agenti AI inclusi. Utenti illimitati in tutti i piani, nessun costo di attivazione, nessun vincolo contrattuale, disdici quando vuoi. Prova gratuita 31 giorni con supporto italiano dedicato. Tutti i piani includono fatturazione elettronica SDI, gestione cantieri con marginalità per commessa e app mobile per gli operai.",
    extra: `
    <p><strong>Edilizia in Cloud costa da 127€ al mese per il piano Gestionale, 247€ al mese per il Professionista e 547€ al mese per Impresa AI, con utenti illimitati in tutti i piani e senza costi di attivazione né vincoli contrattuali.</strong> Il piano si sceglie in base al fatturato dell'impresa, non al numero di utenti. Tutti i piani includono la fatturazione elettronica SDI, la gestione cantieri con marginalità per commessa e il supporto in italiano, con una prova gratuita di 31 giorni. Il prezzo è per impresa, non per cantiere: commesse e clienti sono sempre illimitati.</p>

    <h2>I tre piani di Edilizia in Cloud</h2>
    <h3>Piano Gestionale — 127€/mese</h3>
    <p>Pensato per imprese edili fino a 500K € di fatturato che vogliono uscire da Excel e WhatsApp. Include commesse illimitate con SAL e marginalità per commessa, fatturazione elettronica SDI con DDT, note di credito e proforma, previsionale di cassa a 60 giorni, app operai con GPS e rapportino, utenti illimitati e 10 GB di storage con SLA 99,5%. È il punto di partenza ideale per chi digitalizza per la prima volta l'impresa.</p>
    <h3>Piano Professionista — 247€/mese</h3>
    <p>Per imprese da 500K a 2M € di fatturato. Aggiunge giornale lavori, ordini di acquisto e adempimenti D.Lgs 81, gestione subappalti con Gantt e ritenute, scadenzario con tesoreria e liquidazione IVA, collegamento bancario PSD2, previsionale di cassa a 90 giorni, CRM con pipeline opportunità, 5.000 email marketing al mese, computo metrico AI, portale clienti e HR con cedolini strutturati. È il piano più popolare tra le imprese edili strutturate.</p>
    <h3>Piano Impresa AI — 547€/mese</h3>
    <p>Per imprese oltre 2M € di fatturato o multi-cantiere. Include tutto il Professionista più gestione multi-sede, 3 conti bancari PSD2, previsionale di cassa a 365 giorni, export XBRL con archiviazione decennale, 20.000 email marketing al mese, portale clienti white-label, agenti AI inclusi (render AI, verifica ordini AI, agente vocale con 200 minuti, bot WhatsApp), API REST con webhook, 100 GB di storage, SLA 99,9% e supporto dedicato con risposta in 1 ora.</p>

    <h2>Cosa è incluso in tutti i piani</h2>
    <ul>
      <li><strong>Fatturazione elettronica SDI</strong> — fatture B2B e FatturaPA, split payment, reverse charge edilizia, conservazione a norma decennale</li>
      <li><strong>Gestione cantieri e preventivi</strong> con prezzari regionali (DEI, Lombardia, Veneto, Sicilia)</li>
      <li><strong>App mobile iOS e Android</strong> con funzionamento offline</li>
      <li><strong>Aggiornamenti continui</strong> inclusi, senza costi extra</li>
      <li><strong>Supporto italiano dedicato</strong> via chat, email e telefono</li>
      <li><strong>Conformità GDPR e cifratura</strong>, backup giornalieri</li>
    </ul>

    <h2>Quanto costa davvero un gestionale edilizia?</h2>
    <p>Confrontato con i gestionali tradizionali, Edilizia in Cloud ha un costo trasparente e prevedibile. Gli ERP generalisti come TeamSystem o STR Vision partono spesso da 200-500€/mese e richiedono costi di setup, formazione e canoni per modulo; i software desktop come Primus prevedono licenze una tantum di centinaia o migliaia di euro più aggiornamenti annuali. Edilizia in Cloud non ha costi nascosti: paghi un canone mensile, tutto è incluso e puoi disdire quando vuoi. A questo va aggiunto il risparmio operativo: in media -70% di tempo amministrativo e -20% di costi, che per molte imprese ripaga l'abbonamento già nel primo mese.</p>

    <h2>Senza vincoli e con prova gratuita</h2>
    <p>Ogni piano parte con 31 giorni di prova gratuita completa, senza carta di credito obbligatoria all'inizio e con il supporto del team per importare anagrafiche, cantieri e fatture esistenti. Non ci sono costi di attivazione, non c'è un contratto minimo: l'abbonamento è mensile e si può cambiare piano o disdire in qualsiasi momento. I dati restano sempre tuoi e sono esportabili in formato strutturato.</p>

    <h2>Quale piano scegliere per la tua impresa edile</h2>
    <p>La scelta dipende dal fatturato e dalle esigenze gestionali, non dal numero di utenti: gli utenti sono illimitati in tutti i piani. Se la tua impresa fattura fino a 500K € e vuoi soprattutto commesse, fatturazione SDI e marginalità ordinate, il <strong>Gestionale</strong> è il punto di partenza naturale. Se fatturi tra 500K e 2M €, gestisci più cantieri contemporaneamente, affidi lavorazioni in subappalto e vuoi anche CRM e controllo di tesoreria, il <strong>Professionista</strong> ti dà giornale lavori, subappalti con ritenute, banca PSD2 e HR con cedolini. Se superi i 2M € o lavori multi-sede e vuoi delegare lavoro agli agenti AI e integrare altri sistemi via API, <strong>Impresa AI</strong> è la scelta giusta. In ogni caso puoi iniziare da un piano e fare l'upgrade quando l'impresa cresce, senza perdere alcun dato.</p>

    <h2>Il ritorno sull'investimento</h2>
    <p>Per molte imprese edili l'abbonamento si ripaga già nel primo mese. Recuperare anche solo poche ore a settimana di lavoro amministrativo, evitare un errore di fatturazione o intercettare in tempo un cantiere che sta perdendo margine vale spesso più del canone annuale. Considera che gli ERP tradizionali aggiungono al canone costi di setup, formazione e consulenza che con Edilizia in Cloud non esistono: l'onboarding guidato e il supporto italiano sono inclusi. Il prezzo che vedi è il prezzo che paghi.</p>

    <h2>Domande frequenti sui prezzi</h2>
    <h3>Quanto costa Edilizia in Cloud?</h3>
    <p>Edilizia in Cloud parte da 127€/mese per il piano Gestionale (imprese fino a 500K € di fatturato), 247€/mese per il Professionista (da 500K a 2M €) e 547€/mese per Impresa AI (oltre 2M € o multi-cantiere). Gli utenti sono illimitati in tutti i piani, i prezzi sono per impresa e non prevedono costi di attivazione.</p>
    <h3>Ci sono costi di attivazione o vincoli contrattuali?</h3>
    <p>No. Non ci sono costi di attivazione né vincoli di durata. L'abbonamento è mensile, puoi cambiare piano o disdire quando vuoi e gli aggiornamenti sono sempre inclusi nel canone.</p>
    <h3>È prevista una prova gratuita?</h3>
    <p>Sì, tutti i piani includono 31 giorni di prova gratuita con accesso completo alle funzionalità e supporto italiano dedicato per la configurazione iniziale e l'importazione dei dati.</p>
    <h3>Il prezzo si paga per cantiere o per impresa?</h3>
    <p>Il prezzo è per impresa, in base al numero di utenti del piano. Puoi gestire un numero illimitato di cantieri e clienti senza costi aggiuntivi.</p>
    <h3>Cosa succede ai miei dati se disdico?</h3>
    <p>I dati restano sempre tuoi. In caso di disdetta puoi esportarli in formato strutturato (JSON/CSV) e vengono poi cancellati dai sistemi nei tempi previsti, salvo gli obblighi di conservazione fiscale di legge.</p>
    <h3>Il supporto è incluso nel prezzo?</h3>
    <p>Sì. Il supporto italiano via chat, email e telefono è incluso in tutti i piani. Il piano Impresa AI aggiunge SLA 99,9%, supporto dedicato con risposta in 1 ora e 2 call con un consulente al mese.</p>
    <h2>Tabella prezzi Edilizia in Cloud (2026)</h2>
    <table>
      <thead>
        <tr><th>Piano</th><th>Prezzo</th><th>Per chi è</th><th>Differenze chiave</th></tr>
      </thead>
      <tbody>
        <tr><td>Gestionale</td><td>127€/mese</td><td>Imprese fino a 500K € di fatturato</td><td>Commesse illimitate con SAL e marginalità, fatturazione SDI + DDT, previsionale cassa 60 gg, app operai GPS, utenti illimitati</td></tr>
        <tr><td>Professionista</td><td>247€/mese</td><td>Imprese da 500K a 2M € di fatturato</td><td>Tutto Gestionale + giornale lavori e ODA, subappalti con Gantt e ritenute, tesoreria e banca PSD2, CRM, computo metrico AI, HR con cedolini</td></tr>
        <tr><td>Impresa AI</td><td>547€/mese</td><td>Imprese oltre 2M € o multi-cantiere</td><td>Tutto Professionista + multi-sede, agenti AI (render, vocale, WhatsApp), portale white-label, API REST, SLA 99,9%</td></tr>
      </tbody>
    </table>
    <p>Tutti i piani: prova gratuita di 31 giorni, nessun costo di attivazione, nessun vincolo contrattuale, cantieri e clienti illimitati.</p>
    `,
    links: [
      { href: "/demo", label: "Richiedi Demo Gratuita" },
      { href: "/funzionalita", label: "Funzionalità Incluse" },
      { href: "/confronto", label: "Confronta con Altri Software" },
    ],
    // FAQPage JSON-LD gestito dal componente React Prezzi.tsx
    // Non duplicare qui per evitare "Campo duplicato FAQPage" in GSC
  },

  "/confronto": {
    title: "Confronto Software Gestionale Edilizia 2026",
    description:
      "Confronta Edilizia in Cloud con TeamSystem, Primus, EdilNet, Buildertrend e Excel. Tabella comparativa: funzionalità, prezzi, assistenza e facilità d'uso.",
    h1: "Confronto Edilizia in Cloud vs altri software gestionali per edilizia 2026",
    intro:
      "Edilizia in Cloud è un gestionale cloud nato per le imprese edili italiane. A differenza dei gestionali tradizionali (TeamSystem, Primus, EdilNet) o degli strumenti generici (Excel), Edilizia in Cloud integra in un'unica piattaforma: gestione cantieri, preventivi, fatturazione elettronica SDI, subappalti e HR. Prezzo a partire da 127€/mese contro i 200-500€/mese dei competitor. Nessuna installazione locale, nessun vincolo contrattuale, supporto italiano dedicato e aggiornamenti inclusi. Oltre 150 imprese edili hanno già scelto Edilizia in Cloud.",
    extra: `
    <p><strong>Edilizia in Cloud è il gestionale cloud AI-native e mobile-first per imprese edili italiane, pensato per chi sta in cantiere; i competitor come Cloudness, TeamSystem, STR Vision, Primus e Danea nascono invece per lo studio tecnico, la contabilità o l'ERP generalista.</strong> Di seguito un confronto onesto e fattuale per aiutarti a scegliere lo strumento giusto per la tua impresa, senza slogan.</p>

    <h2>Come abbiamo confrontato i gestionali edilizia</h2>
    <p>Abbiamo messo a confronto i software più diffusi tra le imprese edili italiane su sei criteri concreti: target di utente ideale, presenza di AI nativa, app mobile per il cantiere, fatturazione elettronica SDI integrata, fascia di prezzo e curva di apprendimento. L'obiettivo non è dichiarare un vincitore assoluto, ma chiarire per quale impresa ogni strumento è la scelta migliore.</p>

    <h2>Edilizia in Cloud vs Cloudness</h2>
    <p>Cloudness propone un ERP per edilizia, costruzioni, ristrutturazione e manutenzione, con un'impostazione orientata alla gestione strutturata di commesse e processi. Edilizia in Cloud condivide l'ambito edile ma parte da un presupposto diverso: essere usabile davvero dal capocantiere e dal titolare ogni giorno, con un'app mobile che funziona offline e un assistente AI nativo. Per un'impresa PMI italiana che vuole partire subito, gestire la Cassa Edile e il MUT, emettere fatture SDI e tenere sotto controllo i margini di commessa senza un lungo progetto di implementazione, Edilizia in Cloud offre un percorso più rapido e un costo trasparente da 127€/mese.</p>

    <h2>Edilizia in Cloud vs TeamSystem</h2>
    <p>TeamSystem CPM ed Enterprise sono ERP generalisti molto potenti, con centinaia di moduli, nati per commercialisti e grandi aziende strutturate. Sono la scelta giusta per organizzazioni complesse con un IT interno. Per la PMI edile (1-50 dipendenti) sono però spesso sovradimensionati, costosi (200-500€/mese più setup) e con tempi di formazione lunghi. Edilizia in Cloud copre ciò che serve davvero all'impresa edile con un'interfaccia semplice, un'app da cantiere e un costo nettamente inferiore.</p>

    <h2>Edilizia in Cloud vs STR Vision (Teamsystem Construction)</h2>
    <p>STR Vision è un riferimento per computi metrici, capitolati, BIM e contabilità lavori, molto apprezzato da studi di progettazione, direzione lavori e general contractor sulle opere pubbliche. È uno strumento da scrivania, orientato al progettista. Edilizia in Cloud non sostituisce il software di computo avanzato, ma è complementare e superiore sul lato operativo: presenze, DDT, margini real-time, fatturazione SDI e gestione del cantiere dal telefono. Per l'impresa che esegue i lavori (non solo li progetta) è più immediato.</p>

    <h2>Edilizia in Cloud vs Primus (ACCA)</h2>
    <p>Primus di ACCA è lo standard de facto per il computo metrico estimativo e i preventivi tecnici, con un'enorme base di prezzari. È un software desktop con licenza una tantum, focalizzato sulla fase di preventivazione tecnica. Edilizia in Cloud copre tutta la vita della commessa dopo il preventivo — cantiere, costi, fatturazione, HR, cassa — in cloud e in mobilità. Molte imprese usano Primus per il computo e Edilizia in Cloud per gestire l'impresa: i preventivi Primus si possono anche importare.</p>

    <h2>Edilizia in Cloud vs Danea Easyfatt</h2>
    <p>Danea Easyfatt è un ottimo gestionale di fatturazione e magazzino, generico e diffuso tra piccole attività. Non è però verticale sull'edilizia: non gestisce cantieri, SAL, subappalti con DURC, presenze GPS o Cassa Edile. Edilizia in Cloud fa la fatturazione SDI come Danea, ma la collega ai cantieri e ai margini e aggiunge tutto il mondo operativo edile che a Danea manca.</p>

    <h2>Edilizia in Cloud vs Excel</h2>
    <p>Excel sembra gratuito ma costa alle imprese edili in media 15 ore a settimana di lavoro amministrativo, errori di calcolo nei preventivi (3-5% di margine perso per cantiere) e dati non condivisi tra ufficio e cantiere. Edilizia in Cloud sostituisce i fogli sparsi con una piattaforma unica accessibile da smartphone, in cui ogni dato è inserito una sola volta e segue il cantiere fino in fattura.</p>

    <h2>In sintesi: per chi è ogni strumento</h2>
    <ul>
      <li><strong>Edilizia in Cloud</strong> — impresa edile PMI che esegue i lavori e vuole AI nativa, app da cantiere, SDI, margini e HR in un'unica piattaforma cloud da 127€/mese.</li>
      <li><strong>Cloudness</strong> — chi cerca un ERP edilizia strutturato e accetta un'implementazione più articolata.</li>
      <li><strong>TeamSystem</strong> — grande azienda strutturata con IT interno e processi complessi.</li>
      <li><strong>STR Vision</strong> — studi di progettazione e direzione lavori, opere pubbliche, BIM e contabilità lavori.</li>
      <li><strong>Primus</strong> — chi ha bisogno del computo metrico tecnico avanzato in fase di preventivo.</li>
      <li><strong>Danea Easyfatt</strong> — piccola attività che vuole solo fatturazione e magazzino generici.</li>
      <li><strong>Excel</strong> — chi sta iniziando ma è pronto a perdere tempo e margine quando l'impresa cresce.</li>
    </ul>

    <h2>Domande frequenti sul confronto</h2>
    <h3>Qual è il miglior software gestionale per imprese edili nel 2026?</h3>
    <p>Per le imprese edili PMI italiane che eseguono i lavori, Edilizia in Cloud è il gestionale cloud più completo e accessibile: integra cantieri, preventivi, fatturazione SDI, subappalti, HR e AI a partire da 127€/mese, contro i 200-500€/mese degli ERP generalisti. Strumenti come Primus o STR Vision restano preferibili per il computo tecnico e la progettazione.</p>
    <h3>Edilizia in Cloud è meglio di Cloudness?</h3>
    <p>Dipende dall'esigenza. Cloudness è un ERP edilizia strutturato; Edilizia in Cloud è più mobile-first e AI-native, pensato per essere operativo subito anche dal capocantiere, con gestione nativa di Cassa Edile, MUT, DURC e margini in tempo reale e un costo trasparente da 127€/mese.</p>
    <h3>Edilizia in Cloud sostituisce Primus o STR Vision?</h3>
    <p>No, è complementare. Primus e STR Vision eccellono nel computo metrico e nella progettazione tecnica; Edilizia in Cloud gestisce tutta la vita operativa della commessa dopo il preventivo: cantiere, costi, fatturazione, HR e cassa. I preventivi tecnici possono essere importati.</p>
    <h3>Perché non usare Excel per gestire un'impresa edile?</h3>
    <p>Excel sembra gratuito ma costa in tempo perso, errori di calcolo, dati non condivisi e rischio fiscale. Le imprese che passano da Excel a Edilizia in Cloud risparmiano in media 15 ore a settimana di lavoro amministrativo e riducono gli errori di fatturazione del 95%.</p>
    <h3>Edilizia in Cloud va bene per i lavori sulla pubblica amministrazione?</h3>
    <p>Sì. Gestisce la FatturaPA verso la pubblica amministrazione con split payment, il giornale dei lavori digitale, i SAL e la conservazione a norma. Per opere pubbliche complesse con BIM e contabilità lavori avanzata può affiancarsi a software specialistici di computo.</p>
    <h2>Tabella comparativa: Edilizia in Cloud vs competitor (2026)</h2>
    <table>
      <thead>
        <tr><th>Criterio</th><th>Edilizia in Cloud</th><th>TeamSystem CPM</th><th>Primus (ACCA)</th><th>Cloudness</th><th>Danea</th><th>Excel</th></tr>
      </thead>
      <tbody>
        <tr><td>Target principale</td><td>PMI edili 1-50 dipendenti</td><td>Medie-grandi imprese</td><td>Studi tecnici / computi</td><td>Imprese strutturate</td><td>PMI generiche</td><td>Qualsiasi</td></tr>
        <tr><td>AI nativa</td><td>Sì (assistente, OCR, margini)</td><td>No</td><td>No</td><td>No</td><td>No</td><td>No</td></tr>
        <tr><td>App cantiere mobile</td><td>Sì (iOS/Android, GPS, foto, DDT)</td><td>Parziale</td><td>No</td><td>Parziale</td><td>No</td><td>No</td></tr>
        <tr><td>Fatturazione SDI inclusa</td><td>Sì</td><td>Sì (modulo)</td><td>No</td><td>Sì</td><td>Sì</td><td>No</td></tr>
        <tr><td>Cassa Edile / MUT / DURC</td><td>Sì, nativo</td><td>Parziale</td><td>No</td><td>Parziale</td><td>No</td><td>No</td></tr>
        <tr><td>Prezzo di partenza</td><td>127€/mese</td><td>200-500€/mese</td><td>Licenza una tantum</td><td>Su preventivo</td><td>~150€/anno + moduli</td><td>Incluso in Office</td></tr>
        <tr><td>Vincolo contrattuale</td><td>Nessuno</td><td>Annuale</td><td>—</td><td>Annuale</td><td>Annuale</td><td>—</td></tr>
      </tbody>
    </table>
    `,
    links: [
      { href: "/confronto/vs-teamsystem", label: "Edilizia in Cloud vs TeamSystem" },
      { href: "/confronto/vs-primus", label: "Edilizia in Cloud vs Primus" },
      { href: "/confronto/vs-edilnet", label: "Edilizia in Cloud vs EdilNet" },
      { href: "/confronto/vs-excel", label: "Edilizia in Cloud vs Excel" },
      { href: "/confronto/vs-buildertrend", label: "Edilizia in Cloud vs Buildertrend" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
      { href: "/demo", label: "Prova Gratis" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Qual è il miglior software gestionale per imprese edili nel 2026?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Edilizia in Cloud è il gestionale cloud più completo per imprese edili italiane. Integra gestione cantieri, preventivi, fatturazione SDI, subappalti e HR a partire da 127€/mese, contro i 200-500€/mese dei concorrenti come TeamSystem o Primus.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud è meglio di TeamSystem per le imprese edili?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "TeamSystem è un ERP generalista potente ma costoso e complesso. Edilizia in Cloud è nato specificamente per le imprese edili: più semplice, più economico (da 127€/mese vs 200+€/mese) e con funzionalità specifiche come gestione subappalti, DURC e presenze geolocalizzate in cantiere.",
          },
        },
        {
          "@type": "Question",
          name: "Perché non usare Excel per gestire un'impresa edile?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Excel sembra gratuito ma costa in tempo perso, errori di calcolo, dati non condivisi e rischio fiscale. Le imprese edili che passano da Excel a Edilizia in Cloud risparmiano in media 15 ore/settimana di lavoro amministrativo e riducono gli errori di fatturazione del 95%.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud è meglio di Cloudness?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Dipende dall'esigenza. Cloudness è un ERP edilizia strutturato; Edilizia in Cloud è più mobile-first e AI-native, pensato per essere operativo subito anche dal capocantiere, con gestione nativa di Cassa Edile, MUT, DURC e margini in tempo reale e un costo trasparente da 127€/mese.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud sostituisce Primus o STR Vision?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No, è complementare. Primus e STR Vision eccellono nel computo metrico e nella progettazione tecnica; Edilizia in Cloud gestisce tutta la vita operativa della commessa dopo il preventivo: cantiere, costi, fatturazione, HR e cassa. I preventivi tecnici possono essere importati.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud va bene per i lavori sulla pubblica amministrazione?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì. Gestisce la FatturaPA verso la pubblica amministrazione con split payment, il giornale dei lavori digitale, i SAL e la conservazione a norma. Per opere pubbliche complesse con BIM e contabilità lavori avanzata può affiancarsi a software specialistici di computo.",
          },
        },
      ],
    },
  },

  "/confronto/vs-teamsystem": {
    title: "Edilizia in Cloud vs TeamSystem: Confronto 2026",
    description:
      "Confronto completo Edilizia in Cloud vs TeamSystem per imprese edili. ERP generalista vs gestionale nativo: prezzo, funzionalità e semplicità a confronto.",
    canonical: canonicalUrl("/confronto/vs-teamsystem"),
    h1: "Edilizia in Cloud vs TeamSystem: quale gestionale scegliere per la tua impresa edile?",
    intro:
      "Edilizia in Cloud e TeamSystem sono entrambi gestionali usati dalle imprese edili, ma con approcci opposti. TeamSystem è un ERP generalista con oltre 300 moduli, pensato per commercialisti e grandi aziende — costo medio 200-500€/mese. Edilizia in Cloud è un gestionale verticale per il cantiere, con interfaccia semplice e app mobile — da 127€/mese. Le imprese edili PMI (1-50 dipendenti) che passano da TeamSystem a Edilizia in Cloud risparmiano in media il 60% sul costo del software e dimezzano i tempi di formazione.",
    links: [
      { href: "/confronto", label: "Tutti i Confronti" },
      { href: "/confronto/vs-primus", label: "vs Primus" },
      { href: "/confronto/vs-excel", label: "vs Excel" },
      { href: "/demo", label: "Prova Gratis" },
    ],
  },

  "/confronto/vs-excel": {
    title: "Gestionale Edilizia vs Excel | Confronto 2026",
    description:
      "Excel per gestire i cantieri? Scopri quanto ti costa davvero e perché le imprese edili stanno passando a Edilizia in Cloud. Confronto completo 2026.",
    canonical: canonicalUrl("/confronto/vs-excel"),
    h1: "Edilizia in Cloud vs Excel: il vero costo nascosto dei fogli di calcolo per le imprese edili",
    intro:
      "Excel sembra gratuito ma costa alle imprese edili in media 15 ore/settimana di lavoro amministrativo, errori di calcolo nei preventivi (in media 3-5% di margine perso per cantiere) e dati non condivisi tra ufficio e cantiere. Edilizia in Cloud sostituisce Excel con una piattaforma cloud che centralizza cantieri, preventivi, fatture e HR — accessibile da smartphone in cantiere. Oltre 150 imprese edili hanno già abbandonato Excel per Edilizia in Cloud.",
    links: [
      { href: "/confronto", label: "Tutti i Confronti" },
      { href: "/confronto/vs-teamsystem", label: "vs TeamSystem" },
      { href: "/blog/alternativa-excel-cantieri", label: "Alternativa Excel per Cantieri" },
      { href: "/demo", label: "Prova Gratis" },
    ],
    // FAQPage rimosso dal middleware — gestito dal componente React VsExcel.tsx
    // Evita "Campo duplicato FAQPage" in GSC (Googlebot esegue JS e vede entrambi)
  },

  "/confronto/vs-buildertrend": {
    title: "Edilizia in Cloud vs Buildertrend | Confronto 2026",
    description:
      "Confronto Edilizia in Cloud vs Buildertrend per imprese edili italiane. Buildertrend è americano, senza SDI, senza Cassa Edile e solo in inglese. Ecco la differenza.",
    canonical: canonicalUrl("/confronto/vs-buildertrend"),
    h1: "Edilizia in Cloud vs Buildertrend: il gestionale italiano per le imprese edili",
    intro:
      "Buildertrend è nato per il mercato americano. Non ha la fatturazione SDI, non conosce la Cassa Edile e non parla italiano. Ecco perché le imprese edili italiane scelgono Edilizia in Cloud.",
    links: [
      { href: "/confronto", label: "Tutti i Confronti" },
      { href: "/confronto/vs-teamsystem", label: "vs TeamSystem" },
      { href: "/demo", label: "Prova Gratis" },
    ],
  },

  "/confronto/vs-primus": {
    title: "Edilizia in Cloud vs Primus: Confronto 2026",
    description:
      "Confronto dettagliato tra Edilizia in Cloud e Primus PriMus. Funzionalità, prezzo, assistenza e facilità d'uso a confronto.",
    h1: "Edilizia in Cloud vs Primus: quale scegliere?",
    intro:
      "Confronto completo tra Edilizia in Cloud e Primus PriMus per le imprese edili italiane. Analisi su gestione cantieri, preventivi, fatturazione e supporto clienti.",
    links: [
      { href: "/confronto", label: "Tutti i Confronti" },
      { href: "/confronto/vs-edilnet", label: "vs EdilNet" },
      { href: "/demo", label: "Prova Gratis" },
    ],
  },

  "/confronto/vs-edilnet": {
    title: "Edilizia in Cloud vs EdilNet: Confronto 2026",
    description:
      "Confronto dettagliato tra Edilizia in Cloud e EdilNet. Scopri le differenze su funzionalità, prezzo e assistenza.",
    h1: "Edilizia in Cloud vs EdilNet: quale scegliere?",
    intro:
      "Confronto completo tra Edilizia in Cloud e EdilNet per imprese edili. Analisi dettagliata su prezzi, funzionalità di gestione cantieri e qualità del supporto.",
    links: [
      { href: "/confronto", label: "Tutti i Confronti" },
      { href: "/confronto/vs-primus", label: "vs Primus" },
      { href: "/demo", label: "Prova Gratis" },
    ],
  },

  "/blog": {
    title: "Blog Edilizia | Guide per Imprese Edili",
    description:
      "Guide pratiche su gestione cantieri, preventivi, fatturazione elettronica, subappalti e digitalizzazione per imprese edili italiane. Scritte da imprenditori edili.",
    h1: "Blog Edilizia in Cloud: guide pratiche per imprese edili italiane",
    intro:
      "Il blog di Edilizia in Cloud pubblica guide pratiche scritte da imprenditori edili per imprenditori edili. Articoli su gestione cantieri, preventivi professionali, fatturazione elettronica SDI, HR edile, subappalti, DURC, normativa e digitalizzazione. Ogni guida è pensata per essere applicata subito nella tua impresa.",
    // Fix GSC 2026-06: l'archivio DEVE linkare tutti i post — prima ne linkava
    // 3 su 61 e Google trattava il resto come pagine orfane non indicizzabili.
    links: [
      { href: "/blog/categoria/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/blog/categoria/finanza-edilizia", label: "Finanza Edilizia" },
      { href: "/blog/categoria/hr-personale", label: "HR & Personale" },
      { href: "/blog/categoria/marketing-edilizia", label: "Marketing Edilizia" },
      { href: "/blog/categoria/commerciale-edilizia", label: "Commerciale Edilizia" },
      { href: "/blog/categoria/digitalizzazione-edilizia", label: "Digitalizzazione Edilizia" },
      { href: "/blog/categoria/normativa-edilizia", label: "Normativa Edilizia" },
      ...BLOG_ALL_POST_LINKS,
    ],
  },

  "/glossario-edilizia": {
    title: "Glossario Edilizia: 40+ Termini Spiegati | Edilizia in Cloud",
    description:
      "Dizionario completo dei termini edili: computo metrico, SAL, DL, subappalto, reverse charge e molto altro. Con definizioni chiare per imprenditori edili.",
    h1: "Glossario dell'edilizia italiana",
    intro:
      "Oltre 40 termini del settore edile spiegati in modo chiaro: dalla contabilità di cantiere alla normativa fiscale, dall'HR alla sicurezza sul lavoro.",
    links: [
      { href: "/blog", label: "Blog Edilizia" },
      { href: "/funzionalita", label: "Funzionalità" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      name: "Glossario Edilizia",
      description: "Dizionario dei principali termini del settore edile italiano",
      url: "https://www.ediliziaincloud.com/glossario-edilizia/",
      inLanguage: "it",
    },
  },

  "/integrazioni": {
    title: "Integrazioni Software Edilizia | Edilizia in Cloud",
    description:
      "Connetti Edilizia in Cloud con fatturazione elettronica, contabilità, CRM, banche, posta certificata e Cassa Edile. 20+ integrazioni native e API REST per l'edilizia.",
    h1: "Integrazioni native per il software gestionale edilizia",
    intro:
      "Edilizia in Cloud si collega in tempo reale con i principali strumenti utilizzati dalle imprese edili italiane: fatturazione elettronica SDI, contabilità, CRM, banche con PSD2, presenze e paghe, Cassa Edile, Google Calendar e Outlook, posta certificata, firma elettronica, marketplace e prezzari edilizi. Oltre 20 integrazioni native già pronte e API REST documentata per sviluppi custom.",
    extra: `
    <h2>Categorie di integrazioni disponibili</h2>
    <h3>Fatturazione elettronica e contabilità</h3>
    <ul>
      <li><strong>SDI Agenzia delle Entrate</strong> — invio e ricezione fatture B2B e FatturaPA via web service ufficiale</li>
      <li><strong>Fatture in Cloud, Aruba Fatturazione, Danea Easyfatt</strong> — import storico fatture e anagrafiche</li>
      <li><strong>Zucchetti, Profis, TeamSystem Contabilità</strong> — export prima nota per il commercialista</li>
      <li><strong>SDICoop / Aruba PEC</strong> — canali certificati per la trasmissione SDI</li>
    </ul>
    <h3>Banche, pagamenti e tesoreria</h3>
    <ul>
      <li><strong>API PSD2</strong> — riconciliazione automatica estratti conto Intesa Sanpaolo, UniCredit, BPER, BNL, Crédit Agricole, Banco BPM, Banca Popolare di Sondrio</li>
      <li><strong>Stripe</strong> — pagamenti acconti e saldi via link in fattura</li>
      <li><strong>SEPA Direct Debit</strong> — RID per canoni periodici</li>
    </ul>
    <h3>HR, presenze e Cassa Edile</h3>
    <ul>
      <li><strong>Cassa Edile</strong> — invio mensile MUT (denuncia operai) per le principali province italiane</li>
      <li><strong>INPS UniEMens</strong> — export per consulente del lavoro</li>
      <li><strong>Zucchetti HR Infinity, Inaz Easy, EcosAgile</strong> — sincronizzazione anagrafiche dipendenti e presenze</li>
    </ul>
    <h3>Calendario, comunicazione e firma</h3>
    <ul>
      <li><strong>Google Calendar e Outlook 365</strong> — sync cantieri e appuntamenti commerciali</li>
      <li><strong>WhatsApp Business API</strong> — notifiche cantiere automatiche al cliente</li>
      <li><strong>PEC certificata Aruba, Legalmail, PostecertPEC</strong> — invio documenti certificati</li>
      <li><strong>Namirial / InfoCert / Universign</strong> — firma elettronica avanzata (FEA) e qualificata (FEQ) per preventivi e SAL</li>
    </ul>
    <h3>Preventivi, prezzari e BIM</h3>
    <ul>
      <li><strong>DEI, Prezzario Regione Lombardia, Prezzario DEI Tipografia del Genio Civile</strong> — import voci di capitolato</li>
      <li><strong>ACCA Primus / Primus DCF</strong> — import preventivi e computi metrici (formato XPWE/PMU)</li>
      <li><strong>IFC / BIM viewer</strong> — visualizzazione modelli per quantità e quote di cantiere</li>
    </ul>
    <h3>CRM, marketing e portali</h3>
    <ul>
      <li><strong>HubSpot, Pipedrive</strong> — sync lead e opportunità commerciali</li>
      <li><strong>Mailchimp, Brevo</strong> — newsletter mirate a clienti esistenti</li>
      <li><strong>Google Ads e Meta Ads</strong> — tracciamento conversioni preventivi</li>
    </ul>
    <h2>API REST per integrazioni custom</h2>
    <p>Edilizia in Cloud espone un'API REST documentata (OpenAPI 3.0) che permette di costruire integrazioni custom verso ERP proprietari, software di nicchia o sistemi legacy dell'impresa. Autenticazione tramite API key con scope granulari, rate limiting, webhook per eventi (nuovo cantiere, fattura emessa, presenza registrata, DDT firmato). Ambiente sandbox gratuito per test prima del go-live in produzione.</p>
    <h2>Roadmap nuove integrazioni 2026</h2>
    <p>In rilascio nei prossimi trimestri: integrazione SOA (verifica automatica attestazioni), MEPA per appalti pubblici, sistemi GPS per macchine movimento terra, sistemi di pesatura automezzi con DDT digitale e piattaforme cessione crediti bonus edilizia.</p>
    `,
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione SDI" },
      { href: "/funzionalita/hr-personale", label: "HR e Personale" },
      { href: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere" },
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/prezzi", label: "Piani e Prezzi" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Edilizia in Cloud si integra con la fatturazione elettronica SDI?", acceptedAnswer: { "@type": "Answer", text: "Sì, Edilizia in Cloud invia e riceve fatture B2B e FatturaPA via web service ufficiale Agenzia delle Entrate e gestisce conservazione fiscale a norma. Compatibile con SDICoop e Aruba PEC." } },
        { "@type": "Question", name: "Posso collegare Edilizia in Cloud al mio conto bancario?", acceptedAnswer: { "@type": "Answer", text: "Sì, tramite API PSD2 puoi connettere Intesa Sanpaolo, UniCredit, BPER, BNL, Banco BPM e altre banche italiane per la riconciliazione automatica degli incassi clienti e il monitoraggio cash flow." } },
        { "@type": "Question", name: "Edilizia in Cloud invia il MUT alla Cassa Edile?", acceptedAnswer: { "@type": "Answer", text: "Sì, il modulo HR genera ed invia in automatico la denuncia MUT mensile alla Cassa Edile per le principali province italiane (Milano, Roma, Torino, Bologna, Firenze, Napoli, Genova e oltre 60 province coperte)." } },
        { "@type": "Question", name: "Esiste un'API per integrazioni custom?", acceptedAnswer: { "@type": "Answer", text: "Sì, Edilizia in Cloud espone un'API REST documentata (OpenAPI 3.0) con autenticazione API key, webhook eventi e ambiente sandbox gratuito. Adatta per integrazioni con ERP proprietari, software di nicchia o sistemi legacy aziendali." } },
      ],
    },
  },

  "/privacy-policy": {
    title: "Privacy Policy — Edilizia in Cloud",
    description:
      "Privacy Policy di Edilizia in Cloud: trattamento dei dati personali, basi giuridiche, diritti degli interessati e contatti privacy.",
    h1: "Privacy Policy",
    intro:
      "Informativa privacy di Edilizia in Cloud per utenti, clienti, visitatori e interessati. Il documento descrive finalità, basi giuridiche, conservazione dei dati, diritti esercitabili e contatti del titolare.",
    links: [
      { href: "/termini-e-condizioni", label: "Termini e Condizioni" },
      { href: "/cookie-policy", label: "Cookie Policy" },
      { href: "/dpa", label: "DPA" },
    ],
  },

  "/termini-e-condizioni": {
    title: "Termini e Condizioni — Edilizia in Cloud",
    description:
      "Termini e Condizioni di Edilizia in Cloud: regole di utilizzo della piattaforma, abbonamenti, responsabilità e condizioni contrattuali.",
    h1: "Termini e Condizioni",
    intro:
      "Condizioni contrattuali e termini di servizio applicabili all'utilizzo di Edilizia in Cloud, con regole su account, piani, pagamenti, responsabilità, sospensione e recesso.",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/condizioni-utilizzo", label: "Condizioni di Utilizzo" },
      { href: "/avviso-legale", label: "Avviso Legale" },
    ],
  },

  "/avviso-legale": {
    title: "Avviso Legale — Edilizia in Cloud",
    description:
      "Avviso legale di Edilizia in Cloud: dati societari Domus Group S.r.l., P.IVA, sede legale, responsabilità sui contenuti pubblicati, proprietà intellettuale del software.",
    h1: "Avviso Legale di Edilizia in Cloud",
    intro:
      "Documento che identifica il titolare del sito www.ediliziaincloud.com e del servizio Edilizia in Cloud: Domus Group S.r.l., con sede legale a Milano. Definisce limiti di responsabilità sui contenuti pubblicati, proprietà intellettuale del software e dei marchi, modalità di comunicazione ufficiale e foro competente.",
    extra: `
    <h2>Dati identificativi del titolare</h2>
    <p>Il sito www.ediliziaincloud.com e il servizio software Edilizia in Cloud sono di proprietà di Domus Group S.r.l., con sede legale in Via Aurelio Saffi 29, 20123 Milano. P.IVA e Codice Fiscale 13132010961. Iscrizione al Registro delle Imprese di Milano Monza Brianza Lodi. PEC pubblicata nell'apposito registro INI-PEC.</p>
    <h2>Contenuti pubblicati e responsabilità</h2>
    <p>I contenuti del sito (articoli del blog, guide, schede funzionalità, comparazioni) hanno finalità informativa generale. Le informazioni normative, fiscali e tecniche presentate non sostituiscono la consulenza di professionisti qualificati (commercialisti, consulenti del lavoro, ingegneri, avvocati). Domus Group S.r.l. non è responsabile di decisioni assunte dagli utenti esclusivamente sulla base di tali contenuti.</p>
    <h2>Proprietà intellettuale</h2>
    <p>Il software Edilizia in Cloud, il codice sorgente, l'interfaccia utente, i marchi "Edilizia in Cloud" e i loghi correlati sono di proprietà esclusiva di Domus Group S.r.l. e protetti dalle leggi italiane ed europee sul diritto d'autore. Riproduzione, distribuzione, decompilazione o reverse engineering sono vietati senza autorizzazione scritta.</p>
    <h2>Foro competente e legge applicabile</h2>
    <p>Per ogni controversia relativa al sito o ai contenuti pubblicati è competente il Foro di Milano, salvo diversa norma inderogabile. La legge applicabile è quella italiana, in conformità alle norme europee in materia di consumatori e prestazione di servizi digitali.</p>
    `,
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/termini-e-condizioni", label: "Termini e Condizioni" },
      { href: "/cookie-policy", label: "Cookie Policy" },
    ],
  },

  "/condizioni-utilizzo": {
    title: "Condizioni di Utilizzo del Sito — Edilizia in Cloud",
    description:
      "Condizioni di utilizzo del sito Edilizia in Cloud: accesso, contenuti, link, responsabilità e corretto uso delle informazioni pubblicate.",
    h1: "Condizioni di Utilizzo del Sito",
    intro:
      "Regole di utilizzo del sito pubblico Edilizia in Cloud, inclusi accesso, contenuti informativi, link esterni, disponibilità del servizio e responsabilità dell'utente.",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/termini-e-condizioni", label: "Termini e Condizioni" },
      { href: "/avviso-legale", label: "Avviso Legale" },
    ],
  },

  "/cookie-policy": {
    title: "Cookie Policy — Edilizia in Cloud",
    description:
      "Cookie Policy di Edilizia in Cloud: categorie di cookie, finalità, durata, preferenze e gestione del consenso.",
    h1: "Cookie Policy",
    intro:
      "Informativa cookie del sito Edilizia in Cloud: cookie tecnici, preferenze, analytics, marketing, durata dei cookie e modalità per gestire o revocare il consenso.",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/termini-e-condizioni", label: "Termini e Condizioni" },
      { href: "/dpa", label: "DPA" },
    ],
  },

  "/dpa": {
    title: "Data Processing Agreement (DPA) — Edilizia in Cloud",
    description:
      "Accordo sul trattamento dei dati GDPR Art. 28 tra Edilizia in Cloud (responsabile) e il cliente impresa edile (titolare): ruoli, misure di sicurezza, sub-responsabili.",
    h1: "Data Processing Agreement (DPA) GDPR Art. 28",
    intro:
      "Documento contrattuale che regola, ai sensi dell'art. 28 GDPR, il trattamento dei dati personali effettuato da Domus Group S.r.l. (in qualità di responsabile del trattamento) per conto del cliente impresa edile titolare. Disciplina ruoli, finalità, durata, misure tecniche e organizzative di sicurezza, sub-responsabili autorizzati, gestione delle violazioni e supporto al titolare nell'esercizio dei diritti degli interessati.",
    extra: `
    <h2>Ruoli ai sensi del GDPR</h2>
    <p>Quando un'impresa edile utilizza Edilizia in Cloud per gestire dati di clienti, fornitori, dipendenti o subappaltatori, l'impresa è il <strong>titolare del trattamento</strong>. Domus Group S.r.l. agisce in qualità di <strong>responsabile del trattamento</strong> ai sensi dell'art. 28 GDPR, eseguendo le operazioni di trattamento esclusivamente su istruzione documentata del titolare.</p>
    <h2>Categorie di dati trattati</h2>
    <ul>
      <li><strong>Dati identificativi</strong> di clienti e fornitori dell'impresa edile (ragione sociale, P.IVA, indirizzi, contatti)</li>
      <li><strong>Dati dei dipendenti e collaboratori</strong> dell'impresa (anagrafica, CCNL, presenze, mansionario, retribuzione lorda)</li>
      <li><strong>Dati di cantiere</strong> (foto, note, geolocalizzazione presenze)</li>
      <li><strong>Documenti fiscali</strong> (fatture elettroniche, DDT, prima nota)</li>
    </ul>
    <h2>Misure tecniche e organizzative di sicurezza</h2>
    <p>Edilizia in Cloud applica le seguenti misure: cifratura in transito (TLS 1.3) e a riposo (AES-256), autenticazione multi-fattore opzionale per gli amministratori, segregazione dei dati per tenant (row-level security PostgreSQL), backup giornalieri con retention 30 giorni, log degli accessi conservati 12 mesi, datacenter conformi a ISO 27001.</p>
    <h2>Sub-responsabili autorizzati</h2>
    <p>Domus Group S.r.l. utilizza sub-responsabili selezionati per servizi infrastrutturali: cloud provider (datacenter UE), provider di posta transazionale, provider di firma elettronica, provider di fatturazione elettronica SDI. L'elenco completo è disponibile su richiesta scritta al DPO. Il titolare ha diritto di opporsi a nuovi sub-responsabili entro 14 giorni dalla notifica.</p>
    <h2>Notifica violazioni e supporto al titolare</h2>
    <p>In caso di violazione di dati personali (data breach) Domus Group notifica al titolare entro 24 ore dalla scoperta, fornendo le informazioni necessarie per l'eventuale notifica al Garante Privacy ex art. 33 GDPR. Domus Group supporta inoltre il titolare nella gestione delle richieste degli interessati (accesso, rettifica, cancellazione, portabilità).</p>
    <h2>Conservazione e cancellazione dei dati</h2>
    <p>Alla cessazione del contratto, su scelta del cliente, i dati vengono restituiti in formato strutturato (export JSON/CSV) e successivamente cancellati definitivamente dai sistemi di produzione entro 30 giorni e dai backup entro 90 giorni, salvo obblighi di legge che impongano una conservazione prolungata (es. fatture elettroniche, libro unico del lavoro).</p>
    `,
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/termini-e-condizioni", label: "Termini e Condizioni" },
      { href: "/cookie-policy", label: "Cookie Policy" },
    ],
  },

  "/chi-siamo": {
    title: "Chi Siamo — Edilizia in Cloud | Software edile nato in cantiere",
    description:
      "Edilizia in Cloud è fondato da Florin Andriciuc, imprenditore edile e CEO AEDIX. Un team di costruttori e sviluppatori, nato dentro un'impresa edile reale.",
    h1: "Chi ha creato Edilizia in Cloud: nati dall'edilizia, per l'edilizia",
    intro:
      "Edilizia in Cloud è fondato da Florin Andriciuc — imprenditore edile e CEO di AEDIX. Il team è composto da imprenditori edili e sviluppatori software con oltre 15 anni di esperienza nel settore delle costruzioni italiano. Edilizia in Cloud è stato creato perché non esisteva un gestionale pensato davvero per chi lavora in cantiere ogni giorno.",
    extra: `
    <p><strong>Edilizia in Cloud è il gestionale per imprese edili sviluppato da un team italiano con sede a Milano, fondato da Florin Andriciuc, imprenditore edile e CEO di AEDIX.</strong> Non nasce in un laboratorio software lontano dal cantiere: nasce dall'esperienza diretta di chi gestisce imprese edili e ogni giorno affronta preventivi, SAL, fatture, presenze e margini da tenere sotto controllo.</p>

    <h2>Perché abbiamo creato Edilizia in Cloud</h2>
    <p>Il progetto è partito da un problema concreto: nessun gestionale sul mercato italiano era pensato davvero per l'impresa che esegue i lavori. I software più diffusi erano nati per lo studio tecnico, per il commercialista o come ERP generalisti complessi e costosi. In cantiere si continuava a lavorare con Excel, WhatsApp e fogli sparsi, perdendo tempo e margine. Edilizia in Cloud è la risposta: uno strumento unico, semplice, accessibile dal telefono, che parla la lingua del cantiere italiano — SAL, DURC, MUT, Cassa Edile, reverse charge, CCNL Edilizia.</p>

    <h2>La nostra missione</h2>
    <p>La missione di Edilizia in Cloud è restituire tempo e controllo agli imprenditori edili. Vogliamo che il titolare di un'impresa edile possa sapere in ogni momento se un cantiere sta guadagnando, fatturare in pochi clic, gestire il personale a norma di CCNL e dormire tranquillo sui DURC dei subappaltatori — senza dover diventare un esperto di software. Riduciamo la burocrazia per liberare le persone e farle tornare a fare ciò che sanno fare: costruire.</p>

    <h2>L'ecosistema AEDIX</h2>
    <p>Edilizia in Cloud è sviluppato da un team italiano con sede a Milano e fa parte dell'ecosistema AEDIX, il gruppo guidato da Florin Andriciuc dedicato alla digitalizzazione del settore edile e dei suoi processi. Questa appartenenza ci permette di unire la conoscenza profonda del cantiere alla competenza tecnologica nello sviluppo software e nell'intelligenza artificiale applicata.</p>

    <h2>Il team</h2>
    <p>Il team di Edilizia in Cloud mette insieme due mondi che di solito non si parlano: imprenditori edili e capocantiere che conoscono i problemi reali della commessa, e sviluppatori, designer e specialisti AI che li traducono in software. Questa combinazione è il motivo per cui ogni funzionalità nasce da un'esigenza concreta del cantiere e non da una checklist di marketing. Sviluppiamo in Italia, con piena conformità GDPR, e offriamo supporto in italiano perché chi usa il prodotto possa parlare con chi lo costruisce.</p>

    <h2>I nostri valori</h2>
    <ul>
      <li><strong>Concretezza</strong> — costruiamo strumenti che risolvono problemi veri, non funzioni da brochure.</li>
      <li><strong>Semplicità</strong> — deve poterlo usare il capocantiere, non solo l'esperto di software.</li>
      <li><strong>Conformità</strong> — fatturazione SDI, Cassa Edile, GDPR e conservazione a norma fanno parte del prodotto, non sono un extra.</li>
      <li><strong>Vicinanza</strong> — supporto italiano dedicato e ascolto continuo delle imprese che usano la piattaforma.</li>
    </ul>

    <h2>Domande frequenti su chi siamo</h2>
    <h3>Chi ha creato Edilizia in Cloud?</h3>
    <p>Edilizia in Cloud è creato da un team italiano con sede a Milano, fondato da Florin Andriciuc, imprenditore edile e CEO di AEDIX. Il prodotto nasce dall'esperienza diretta nel settore delle costruzioni italiano.</p>
    <h3>Chi sviluppa Edilizia in Cloud?</h3>
    <p>Edilizia in Cloud è sviluppato da un team italiano con sede a Milano, parte dell'ecosistema AEDIX dedicato alla digitalizzazione dell'edilizia. I riferimenti societari completi sono indicati nel footer del sito.</p>
    <h3>Dove ha sede Edilizia in Cloud?</h3>
    <p>La sede legale è a Milano, in Via Aurelio Saffi 29. Lo sviluppo è italiano e i dati sono trattati in conformità al GDPR.</p>
    <h3>Perché un altro gestionale edilizia?</h3>
    <p>Perché nessuno strumento era pensato davvero per l'impresa che esegue i lavori. Edilizia in Cloud è nato per il cantiere, con app mobile, AI nativa e gestione di SDI, Cassa Edile, MUT e DURC, dove gli altri sono nati per lo studio o la contabilità.</p>
    `,
    links: [
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
    ],
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "Chi siamo — Edilizia in Cloud",
        url: "https://www.ediliziaincloud.com/chi-siamo/",
        inLanguage: "it",
        about: {
          "@type": "Organization",
          name: "Edilizia in Cloud",
          legalName: "Domus Group S.r.l.",
          url: "https://www.ediliziaincloud.com/",
          logo: "https://www.ediliziaincloud.com/icons/icon-512.png",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Via Aurelio Saffi 29",
            addressLocality: "Milano",
            postalCode: "20123",
            addressCountry: "IT",
          },
          founder: {
            "@type": "Person",
            name: "Florin Andriciuc",
            jobTitle: "Founder & CEO",
          },
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Chi ha creato Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Edilizia in Cloud è creato da un team italiano con sede a Milano, fondato da Florin Andriciuc, imprenditore edile e CEO di AEDIX. Il prodotto nasce dall'esperienza diretta nel settore delle costruzioni italiano.",
            },
          },
          {
            "@type": "Question",
            name: "Chi sviluppa Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Edilizia in Cloud è sviluppato da un team italiano con sede a Milano, parte dell'ecosistema AEDIX dedicato alla digitalizzazione dell'edilizia. I riferimenti societari completi sono indicati nel footer del sito.",
            },
          },
          {
            "@type": "Question",
            name: "Dove ha sede Edilizia in Cloud?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "La sede legale è a Milano, in Via Aurelio Saffi 29. Lo sviluppo è italiano e i dati sono trattati in conformità al GDPR.",
            },
          },
        ],
      },
    ],
  },

  "/demo": {
    title: "Demo Gratuita Edilizia in Cloud — Prenota in 30 Secondi",
    description:
      "Prenota una demo gratuita di 30 minuti di Edilizia in Cloud. Un consulente edile ti mostra come gestire cantieri, preventivi e fatturazione. Nessun obbligo.",
    h1: "Demo gratuita di Edilizia in Cloud: vedi il gestionale in azione",
    intro:
      "Prenota una demo gratuita di 30 minuti con un consulente specializzato nel settore edile. Ti mostriamo come Edilizia in Cloud gestisce cantieri, preventivi, fatturazione elettronica SDI e personale. Nessun obbligo di acquisto. Le imprese edili che provano la demo attivano il gestionale nell'87% dei casi.",
    extra: `
    <p><strong>La demo di Edilizia in Cloud è una sessione gratuita di 30 minuti in cui un consulente edile ti mostra il gestionale applicato alla tua impresa, sui tuoi processi reali, senza alcun obbligo di acquisto.</strong> Non è una presentazione generica: porti un tuo cantiere o un tuo preventivo e vedi come gestirlo dentro la piattaforma.</p>

    <h2>Come funziona la demo di Edilizia in Cloud</h2>
    <p>Dopo la richiesta, ti contattiamo per fissare l'orario più comodo. La demo si svolge online in videochiamata: condividiamo lo schermo e ti accompagniamo passo passo nei moduli che contano di più per la tua attività. Puoi invitare il tuo responsabile amministrativo o il capocantiere, fare domande in diretta e capire subito se Edilizia in Cloud è lo strumento giusto per te.</p>

    <h2>Cosa vedrai durante la demo</h2>
    <ul>
      <li><strong>Gestione di un cantiere reale</strong> — avanzamento lavori, SAL, foto e giornale dei lavori digitale</li>
      <li><strong>Creazione di un preventivo</strong> con prezzari regionali e firma elettronica del cliente</li>
      <li><strong>Fatturazione elettronica SDI</strong> collegata alla commessa, con split payment e reverse charge edilizia</li>
      <li><strong>Controllo margini</strong> preventivo vs consuntivo in tempo reale</li>
      <li><strong>HR e Cassa Edile</strong> — presenze GPS, CCNL Edilizia e MUT mensile</li>
      <li><strong>App mobile cantiere</strong> in azione, anche offline</li>
      <li><strong>Assistente AI Silvio</strong> che redige preventivi e gestisce il back-office</li>
    </ul>

    <h2>A chi è utile la demo</h2>
    <p>La demo è pensata per titolari di imprese edili, geometri con impresa propria, responsabili amministrativi e capocantiere che valutano la digitalizzazione. Tariamo la sessione sul tuo settore specifico — impresa generalista, ristrutturazioni, serramenti, impianti, tetti, pavimenti — così vedi esattamente come Edilizia in Cloud risolve i tuoi problemi quotidiani.</p>

    <h2>Cosa succede dopo la demo</h2>
    <p>Al termine puoi attivare subito la prova gratuita di 31 giorni con accesso completo alla piattaforma. Il team ti supporta nell'importazione di anagrafiche, cantieri e fatture esistenti, così parti già operativo. Non c'è alcun impegno: se decidi di non proseguire, nessun costo e nessun vincolo. Le imprese edili che provano la demo attivano poi il gestionale nell'87% dei casi.</p>

    <h2>Come prepararti alla demo per sfruttarla al meglio</h2>
    <p>Per rendere la mezz'ora davvero utile, ti consigliamo di arrivare con un caso concreto: un preventivo recente, un cantiere in corso o il problema che oggi ti fa perdere più tempo — che sia la fatturazione, il controllo dei margini, le presenze degli operai o la gestione dei subappaltatori. In questo modo il consulente costruisce la demo intorno alla tua realtà e tu capisci subito il ritorno concreto, non un beneficio teorico. Se vuoi, puoi coinvolgere anche il tuo commercialista o il consulente del lavoro: Edilizia in Cloud genera gli export di prima nota e i dati MUT che servono a loro.</p>

    <h2>Demo, prova gratuita e attivazione: le differenze</h2>
    <p>La <strong>demo</strong> è la sessione guidata di 30 minuti con un consulente, ideale per capire se il prodotto fa per te. La <strong>prova gratuita</strong> di 31 giorni è l'accesso completo alla piattaforma con i tuoi dati, per toccarla con mano nel lavoro quotidiano. L'<strong>attivazione</strong> è il passaggio a un piano a pagamento (da 127€/mese), sempre senza vincoli e con possibilità di disdetta. Puoi fermarti a ognuno di questi passaggi: non c'è alcun automatismo che ti obbliga a proseguire.</p>

    <h2>Domande frequenti sulla demo</h2>
    <h3>La demo di Edilizia in Cloud è gratuita?</h3>
    <p>Sì, la demo è completamente gratuita e dura circa 30 minuti. Non è richiesto alcun acquisto né l'inserimento della carta di credito per prenotarla.</p>
    <h3>Devo installare qualcosa per la demo?</h3>
    <p>No. La demo si svolge online in videochiamata con condivisione schermo. Edilizia in Cloud è un software cloud, quindi non c'è nulla da installare né durante la demo né dopo l'attivazione.</p>
    <h3>Posso provare il software con i miei dati?</h3>
    <p>Sì. Dopo la demo puoi attivare la prova gratuita di 31 giorni e importare le tue anagrafiche, i tuoi cantieri e le tue fatture con il supporto del nostro team, così valuti la piattaforma sul tuo lavoro reale.</p>
    <h3>Quanto tempo serve per essere operativi dopo la demo?</h3>
    <p>La maggior parte delle imprese è operativa in pochi giorni grazie all'onboarding guidato e al supporto italiano dedicato, che aiuta a configurare la piattaforma e importare i dati esistenti.</p>
    <h3>Sono obbligato ad acquistare dopo la demo?</h3>
    <p>No. La demo e la prova gratuita non comportano alcun obbligo. Se Edilizia in Cloud non fa per te, non paghi nulla e non resti vincolato ad alcun contratto.</p>
    `,
    links: [
      { href: "/funzionalita", label: "Funzionalità" },
      { href: "/prezzi", label: "Prezzi" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "La demo di Edilizia in Cloud è gratuita?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì, la demo è completamente gratuita e dura circa 30 minuti. Non è richiesto alcun acquisto né l'inserimento della carta di credito per prenotarla.",
          },
        },
        {
          "@type": "Question",
          name: "Devo installare qualcosa per la demo di Edilizia in Cloud?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. La demo si svolge online in videochiamata con condivisione schermo. Edilizia in Cloud è un software cloud, quindi non c'è nulla da installare né durante la demo né dopo l'attivazione.",
          },
        },
        {
          "@type": "Question",
          name: "Posso provare Edilizia in Cloud con i miei dati?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sì. Dopo la demo puoi attivare la prova gratuita di 31 giorni e importare le tue anagrafiche, i tuoi cantieri e le tue fatture con il supporto del team, così valuti la piattaforma sul tuo lavoro reale.",
          },
        },
        {
          "@type": "Question",
          name: "Sono obbligato ad acquistare dopo la demo?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. La demo e la prova gratuita non comportano alcun obbligo. Se Edilizia in Cloud non fa per te, non paghi nulla e non resti vincolato ad alcun contratto.",
          },
        },
      ],
    },
  },

  "/casi-studio": {
    title: "Casi Studio: Imprese Edili che hanno scelto Edilizia in Cloud",
    description:
      "Scopri come altre imprese edili italiane hanno digitalizzato la gestione cantieri, aumentato i margini e risparmiato tempo con Edilizia in Cloud.",
    h1: "Storie di successo di imprese edili",
    intro:
      "Leggi come titolari di imprese edili in tutta Italia hanno trasformato il loro modo di lavorare con Edilizia in Cloud: meno burocrazia, più controllo, margini più alti.",
    links: [
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/prezzi", label: "Piani e Prezzi" },
    ],
  },

  // Canonical = /per/imprese-edili (route rinominata): il prerender SEO deve
  // stare sulla destinazione, non sul vecchio /per/imprese-costruzione che ora
  // fa 301 (vedi LEGACY_REDIRECTS). Prima il prerender era sull'URL sbagliato.
  "/per/imprese-edili": {
    title: "Gestionale per Imprese di Costruzione | Più Margini, Più Controllo, Zero Caos",
    description:
      "Il gestionale con AI per imprese di costruzione: margine reale per commessa in tempo reale, SAL automatici, subappaltatori, forecast di cassa a 90 giorni e computi metrici.",
    h1: "Aumenta i margini e controlla ogni cantiere della tua impresa di costruzione",
    intro:
      "Edilizia in Cloud governa tutta l'impresa di costruzione: margine reale di ogni commessa aggiornato in tempo reale, SAL automatici, gestione subappaltatori con ritenute, forecast di cassa a 90 giorni e fatturazione elettronica.",
    links: [
      { href: "/per/impiantisti", label: "Per Impiantisti" },
      { href: "/per/ristrutturatori", label: "Per Ristrutturatori" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/impiantisti": {
    title: "Gestionale per Impiantisti | Più Margini, Più Controllo, Zero Caos",
    description:
      "Il gestionale con AI per impiantisti: margine reale per intervento, fatturazione lo stesso giorno, magazzino furgone sempre giusto e tecnici in campo coordinati senza telefonate.",
    h1: "Aumenta i margini e controlla interventi, tecnici e magazzino",
    intro:
      "Edilizia in Cloud governa tutta l'impresa impiantistica: margine reale per intervento con ore di trasferta e collaudo sempre fatturate, fatturazione automatica post-intervento, magazzino ricambi per furgone e contratti di manutenzione ricorrente.",
    links: [
      { href: "/per/imprese-edili", label: "Per Imprese di Costruzione" },
      { href: "/per/serramentisti", label: "Per Serramentisti" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/ristrutturatori": {
    title: "Software Gestionale per Ristrutturatori Edili",
    description:
      "Gestionale cloud per imprese di ristrutturazione: preventivi dettagliati, gestione SAL, pratiche bonus edilizi e fatturazione elettronica.",
    h1: "Gestionale per ristrutturatori edili",
    intro:
      "Gestisci le tue ristrutturazioni dalla A alla Z: preventivi con computo dettagliato, SAL mensili, pratiche per bonus 110% e Superbonus, fatturazione elettronica integrata.",
    links: [
      { href: "/per/imprese-edili", label: "Per Imprese di Costruzione" },
      { href: "/per/fotovoltaico", label: "Per Fotovoltaico" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/fotovoltaico": {
    title: "Software Gestionale per Installatori Fotovoltaico",
    description:
      "Gestionale per installatori di impianti fotovoltaici: preventivi tecnici, pratiche GSE, fatturazione e gestione cantieri. Cresce con te.",
    h1: "Gestionale per installatori fotovoltaico",
    intro:
      "Gestisci i tuoi impianti fotovoltaici con Edilizia in Cloud: preventivi tecnici automatizzati, pratiche per incentivi GSE, SAL, fatturazione elettronica e reportistica cantiere.",
    links: [
      { href: "/per/impiantisti", label: "Per Impiantisti" },
      { href: "/per/ristrutturatori", label: "Per Ristrutturatori" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/serramentisti": {
    title: "Software per Serramentisti | Più Margini, Più Controllo, Zero Caos",
    description:
      "Il gestionale completo per serramentisti e installatori di infissi: margine reale per commessa, cassa a 90 giorni, ordini e pose senza errori, squadre organizzate — e preventivi su misura in 60 secondi.",
    h1: "Aumenta i margini e controlla la tua azienda di serramenti",
    intro:
      "Edilizia in Cloud è il gestionale completo per serramentisti — non solo un preventivatore: margine reale per commessa e per linea di prodotto (PVC, alluminio, portoni), scadenzario incassi e pagamenti con cassa a 90 giorni, ordini fornitori generati dal preventivo, planning installazioni, verbale di consegna firmato e configuratore preventivi con listini fornitore che genera un preventivo in 60 secondi.",
    links: [
      { href: "/per/impiantisti", label: "Per Impiantisti" },
      { href: "/per/piccole-imprese", label: "Per Piccole Imprese" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi AI" },
      { href: "/funzionalita/margini-cantiere", label: "Margini di Cantiere" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/piccole-imprese": {
    title: "Gestionale per Piccole Imprese Edili | Edilizia in Cloud",
    description:
      "Il gestionale adatto anche alle piccole imprese edili: semplice, immediato, accessibile. Inizia gratis, senza vincoli.",
    h1: "Gestionale per piccole imprese edili",
    intro:
      "Anche le piccole imprese edili meritano un gestionale professionale. Con Edilizia in Cloud parti subito, senza formazione lunga e senza costi nascosti. Piano Starter da 127€/mese.",
    links: [
      { href: "/prezzi", label: "Vedi i Prezzi" },
      { href: "/per/imprese-edili", label: "Per Imprese di Costruzione" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/medie-imprese": {
    title: "Software Gestionale per Medie Imprese Edili",
    description:
      "Gestionale multi-cantiere per medie imprese edili 10-50 dipendenti: margini real-time, cassa centralizzata, cruscotto CFO.",
    h1: "Software per medie imprese edili",
    intro:
      "Gestisci 5-15 cantieri attivi e 10-50 dipendenti come un'unica realtà: margini real-time, controllo subappalti, dashboard CFO con KPI consolidati. Migrazione da Primus, Excel o ERP legacy in 30 giorni.",
    links: [
      { href: "/funzionalita/margini-cantiere", label: "Margini Cantiere Real-Time" },
      { href: "/funzionalita/cruscotto-aziendale", label: "Cruscotto Aziendale" },
      { href: "/per/grandi-imprese", label: "Sei oltre i 50 dipendenti?" },
      { href: "/demo", label: "Demo Medie Imprese" },
    ],
  },

  "/per/grandi-imprese": {
    title: "Software per Grandi Imprese Edili e General Contractor",
    description:
      "Gestionale enterprise per grandi imprese edili e general contractor: multi-società, API ERP, dashboard direzionale, governance Codice Appalti.",
    h1: "Software per grandi imprese edili e general contractor",
    intro:
      "50+ dipendenti, 10-50 cantieri attivi, holding multi-società: una sola fonte di verità per CFO e direzione. API integration con SAP/Microsoft Dynamics, audit trail, governance approvazioni multi-livello.",
    links: [
      { href: "/integrazioni", label: "Integrazioni ERP" },
      { href: "/funzionalita/cruscotto-aziendale", label: "Dashboard Direzionale" },
      { href: "/per/medie-imprese", label: "Per Medie Imprese" },
      { href: "/demo", label: "Demo Enterprise" },
    ],
  },

  "/per/commercialista-edilizia": {
    title: "Software per Commercialisti Edilizia e Cassa Edile",
    description:
      "Gestionale white-label per commercialisti che seguono imprese edili: cassetto SDI multi-cliente, F24 cassa edile, DURC tracking, bilancio CEE+XBRL.",
    h1: "Software gestionale per commercialisti dell'edilizia",
    intro:
      "Gestisci 30+ clienti edili da un'unica piattaforma multi-azienda: sync cassetto fiscale SDI, F24 cassa edile pre-compilato, DURC tracking automatico, bilancio CEE+XBRL. Programma white-label per studi.",
    links: [
      { href: "/funzionalita/cassetto-sdi", label: "Cassetto SDI Multi-Cliente" },
      { href: "/funzionalita/cedolini-paga", label: "Cedolini & Cassa Edile" },
      { href: "/funzionalita/contabilita-fiscale", label: "Contabilità Fiscale CEE" },
      { href: "/diventa-partner", label: "Programma Partner" },
    ],
  },

  "/diventa-partner": {
    title: "Diventa Partner | Edilizia in Cloud",
    description:
      "Diventa partner di Edilizia in Cloud: programma rivenditori, consulenti e studi tecnici. Guadagna ricorrente portando clienti.",
    h1: "Diventa Partner di Edilizia in Cloud",
    intro:
      "Sei un consulente, uno studio tecnico o un rivenditore software? Entra nel programma partner di Edilizia in Cloud: commissioni ricorrenti, formazione gratuita e supporto dedicato.",
    links: [
      { href: "/prezzi", label: "Prezzi" },
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/chi-siamo", label: "Chi Siamo" },
    ],
  },

  "/novita": {
    title: "Novità del Prodotto | Edilizia in Cloud",
    description:
      "Le novità di Edilizia in Cloud mese per mese: AI, commesse, dashboard, mobile e preventivi. Aggiornamenti settimanali sempre inclusi nel canone, per tutti i piani.",
    h1: "Le novità di Edilizia in Cloud",
    intro:
      "Edilizia in Cloud rilascia miglioramenti ogni settimana, inclusi nel canone per tutti i piani e senza moduli a pagamento. Negli ultimi mesi sono arrivati: creazione di automazioni descrivendole in linguaggio naturale, incassi SAL semplificati con alert sulla prossima azione, dashboard con drill-down e cashflow reale, knowledge graph 3D della memoria AI, Render AI v6 con slider prima/dopo e firma digitale dei preventivi con QR e WhatsApp.",
    extra: `
    <h2>Ultimi rilasci principali</h2>
    <ul>
      <li><strong>Giugno 2026</strong> — Automazioni create dall'AI a partire da una descrizione testuale; incassi SAL con "Registra incasso" e avanzamento visibile; grafici della dashboard con drill-down per mese; navigazione mobile ridisegnata con accesso diretto a Silvio AI.</li>
      <li><strong>Maggio 2026</strong> — Cervello AI con knowledge graph 3D esplorabile; sei nuovi sistemi AI operativi: chatbot pubblico, pricing dinamico, gestione visite, video di sicurezza, ottimizzazione percorsi e gestione reclami.</li>
      <li><strong>Aprile 2026</strong> — Dashboard "War Room" con semafori di salute aziendale e cashflow reale; HR con contributi CCNL Edilizia, alert DURC e stato cedolini; Render AI v6 con slider prima/dopo; app da cantiere più veloce con installazione PWA.</li>
      <li><strong>Marzo 2026</strong> — Firma digitale dei preventivi con QR code e condivisione WhatsApp; conversione del preventivo accettato in cantiere con un click; storico versioni e reminder automatici di scadenza.</li>
    </ul>
    <p>Tutti gli aggiornamenti di Edilizia in Cloud sono inclusi nel canone di ogni piano — Gestionale, Professionista e Impresa AI — senza costi aggiuntivi né interventi di installazione: essendo una piattaforma cloud, le novità arrivano automaticamente a tutte le imprese.</p>
    `,
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/prezzi", label: "Prezzi" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/pianifica-migrazione": {
    title: "Migrazione Gestionale Edilizia in 48 Ore | Edilizia in Cloud",
    description:
      "Migra da Primus, EdilNet, TeamSystem, STR Vision, Buildertrend o Excel a Edilizia in Cloud: import assistito di cantieri, fatture, anagrafiche e archivio storico.",
    h1: "Migrazione gestionale edilizia assistita in 48 ore",
    intro:
      "Passa dal vecchio gestionale a Edilizia in Cloud senza fermare l'attività. Il team Domus Group importa cantieri, fatture elettroniche, anagrafiche clienti e fornitori, preventivi, DDT, prima nota, foto e documenti in ambiente di test, poi va live solo dopo la tua validazione finale.",
    extra: `
    <h2>Come funziona la migrazione del gestionale edilizia</h2>
    <p>La migrazione assistita di Edilizia in Cloud è strutturata in 4 fasi precise per garantire continuità operativa: audit dei dati esistenti, mappatura dei campi, import in ambiente di test (sandbox), validazione finale e go-live. Tutta l'attività richiede in media 48 ore lavorative e non blocca la fatturazione corrente dell'impresa.</p>
    <h2>Da quali gestionali edilizia possiamo migrare i tuoi dati</h2>
    <ul>
      <li><strong>Primus / Primus DCF / Primus Revolution</strong> (ACCA Software) — preventivi, capitolati, voci di prezzario</li>
      <li><strong>TeamSystem Construction / TeamSystem Cantieri</strong> — cantieri, fatturazione SDI, contabilità</li>
      <li><strong>STR Vision CPM</strong> — gestione commesse, computi, contabilità di cantiere</li>
      <li><strong>EdilNet</strong> — anagrafiche, preventivi, fatture</li>
      <li><strong>Buildertrend</strong> — progetti, comunicazioni cliente, time tracking</li>
      <li><strong>Excel, Google Sheets, fogli di calcolo</strong> — anagrafiche e cantieri, anche se non strutturati</li>
      <li><strong>Fatture in Cloud, Aruba Fatturazione, Danea</strong> — fatture elettroniche storiche e anagrafiche</li>
    </ul>
    <h2>Cosa importiamo dal tuo vecchio gestionale</h2>
    <p>Vengono trasferiti: anagrafiche clienti e fornitori (con P.IVA, codice destinatario SDI, riferimenti), preventivi e capitolati con voci dettagliate, cantieri aperti con stato avanzamento, fatture elettroniche emesse e ricevute (archivio fiscale a norma), DDT e bolle di consegna, ordini fornitori, registro presenze operai, prima nota di cassa, foto e documenti di cantiere, archivio storico DURC e POS. Nessuno dato dell'impresa viene perso nel passaggio.</p>
    <h2>Tempi e costi della migrazione</h2>
    <p>La migrazione standard richiede 48 ore lavorative ed è inclusa gratuitamente nei piani Business e Enterprise. Per migrazioni complesse (oltre 50.000 record o multi-azienda con holding) il team valuta un audit dedicato. Nessun costo nascosto: ti viene fornito un preventivo chiaro dopo il primo audit di 30 minuti gratuito.</p>
    <h2>Continuità del lavoro durante la migrazione</h2>
    <p>Durante la migrazione l'impresa continua a operare normalmente sul vecchio gestionale. Il go-live avviene in un fine settimana scelto da te, con team Domus Group in supporto live per le prime 8 ore lavorative del lunedì successivo. Se qualcosa non funziona, si torna indietro al vecchio sistema in meno di 1 ora.</p>
    `,
    links: [
      { href: "/demo", label: "Pianifica Audit Gratuito" },
      { href: "/confronto/vs-primus", label: "Migrare da Primus" },
      { href: "/confronto/vs-teamsystem", label: "Migrare da TeamSystem" },
      { href: "/confronto/vs-excel", label: "Migrare da Excel" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione SDI" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Migrazione dati gestionale edilizia",
      serviceType: "Data migration and onboarding for construction management software",
      provider: {
        "@type": "Organization",
        name: "Edilizia in Cloud",
        url: "https://www.ediliziaincloud.com/",
      },
      areaServed: "IT",
      availableChannel: {
        "@type": "ServiceChannel",
        serviceUrl: "https://www.ediliziaincloud.com/pianifica-migrazione/",
      },
      description:
        "Servizio di migrazione assistita per imprese edili da Primus, EdilNet, TeamSystem, STR Vision, Buildertrend, Excel e archivi CSV verso Edilizia in Cloud.",
    },
  },

  // /privacy-policy, /termini-e-condizioni, /avviso-legale, /condizioni-utilizzo, /cookie-policy, /dpa
  // Pagine legali indicizzabili (trasparenza GDPR) — gestite dalla SPA con LegalLayout

  "/formazione": {
    title: "Formazione e Tutorial | Edilizia in Cloud",
    description:
      "Video tutorial, webinar e guide pratiche per imparare a usare Edilizia in Cloud al massimo. Accademia gratuita per tutti i clienti.",
    h1: "Accademia Edilizia in Cloud",
    intro:
      "Video tutorial, webinar mensili e guide PDF per padroneggiare Edilizia in Cloud. L'accademia è gratuita per tutti i clienti attivi.",
    links: [
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/funzionalita", label: "Funzionalità" },
    ],
  },
};

// City-specific routes (dynamic)
const CITY_CONFIGS = {
  milano: {
    city: "Milano",
    region: "Lombardia",
    description: "Software gestionale per imprese edili a Milano. Gestisci cantieri nella ZTL, preventivi e fatturazione elettronica.",
  },
  roma: {
    city: "Roma",
    region: "Lazio",
    description: "Software gestionale per imprese edili a Roma. Lavori con vincoli storici e soprintendenza? Edilizia in Cloud ti semplifica la vita.",
  },
  torino: {
    city: "Torino",
    region: "Piemonte",
    description: "Software gestionale per imprese edili a Torino. Gestisci la stagionalità dei cantieri e il personale con Edilizia in Cloud.",
  },
  napoli: {
    city: "Napoli",
    region: "Campania",
    description: "Software gestionale per imprese edili a Napoli. Preventivi, cantieri e fatturazione in un'unica piattaforma cloud.",
  },
  bologna: {
    city: "Bologna",
    region: "Emilia-Romagna",
    description: "Software gestionale per imprese edili a Bologna. Digitalizza la gestione cantieri e la fatturazione con Edilizia in Cloud.",
  },
  firenze: {
    city: "Firenze",
    region: "Toscana",
    description: "Software gestionale per imprese edili a Firenze. Lavori in centri storici? Gestisci documenti e SAL con Edilizia in Cloud.",
  },
  genova: {
    city: "Genova",
    region: "Liguria",
    description: "Software gestionale per imprese edili a Genova. Gestisci cantieri e preventivi con Edilizia in Cloud.",
  },
  palermo: {
    city: "Palermo",
    region: "Sicilia",
    description: "Software gestionale per imprese edili a Palermo. Preventivi, fatturazione e gestione squadre con Edilizia in Cloud.",
  },
  bari: {
    city: "Bari",
    region: "Puglia",
    description: "Software gestionale per imprese edili a Bari. Gestisci cantieri, appalti pubblici e fatturazione elettronica con Edilizia in Cloud.",
  },
  verona: {
    city: "Verona",
    region: "Veneto",
    description: "Software gestionale per imprese edili a Verona. Controllo margini, preventivi e gestione squadre per il mercato veneto.",
  },
  brescia: {
    city: "Brescia",
    region: "Lombardia",
    description: "Software gestionale per imprese edili a Brescia. Digitalizza cantieri, preventivi e fatturazione con Edilizia in Cloud.",
  },
  catania: {
    city: "Catania",
    region: "Sicilia",
    description: "Software gestionale per imprese edili a Catania. Gestisci cantieri nel polo tech siciliano, appalti PNRR e restauro con Edilizia in Cloud.",
  },
  venezia: {
    city: "Venezia",
    region: "Veneto",
    description: "Software gestionale per imprese edili a Venezia. Controlla costi lagunari, SAL e documentazione vincoli soprintendenza con Edilizia in Cloud.",
  },
  padova: {
    city: "Padova",
    region: "Veneto",
    description: "Software gestionale per imprese edili a Padova. Preventivi professionali, gestione cantieri e fatturazione per il mercato veneto.",
  },
  bergamo: {
    city: "Bergamo",
    region: "Lombardia",
    description: "Software gestionale per imprese edili a Bergamo. Controllo cantieri, margini e fatturazione per il polo produttivo bergamasco.",
  },
  modena: {
    city: "Modena",
    region: "Emilia-Romagna",
    description: "Software gestionale per imprese edili a Modena. Preventivi veloci, gestione cantieri e fatturazione per il distretto automotive emiliano.",
  },
  "reggio-emilia": {
    city: "Reggio Emilia",
    region: "Emilia-Romagna",
    description: "Software gestionale per imprese edili a Reggio Emilia. Cantieri, preventivi e fatturazione nel cuore della cooperazione emiliana.",
  },
  parma: {
    city: "Parma",
    region: "Emilia-Romagna",
    description: "Software gestionale per imprese edili a Parma. Gestione cantieri, SAL e fatturazione elettronica nella Food Valley italiana.",
  },
  salerno: {
    city: "Salerno",
    region: "Campania",
    description: "Software gestionale per imprese edili a Salerno. Rendicontazione PNRR, SAL e gestione cantieri nella Campania meridionale.",
  },
  trieste: {
    city: "Trieste",
    region: "Friuli-Venezia Giulia",
    description: "Software gestionale per imprese edili a Trieste. Gestione cantieri portuali, restauro e fatturazione nel crocevia adriatico.",
  },
  cagliari: {
    city: "Cagliari",
    region: "Sardegna",
    description: "Software gestionale per imprese edili a Cagliari. Cantieri turistici, SAL e fatturazione per le imprese edili sarde.",
  },
  perugia: {
    city: "Perugia",
    region: "Umbria",
    description: "Software gestionale per imprese edili a Perugia. Ricostruzione post-sisma, centri storici e cantieri umbri con Edilizia in Cloud.",
  },
  ancona: {
    city: "Ancona",
    region: "Marche",
    description: "Software gestionale per imprese edili ad Ancona. Ricostruzione post-sisma, porto e turismo adriatico: gestisci tutto con Edilizia in Cloud.",
  },
  udine: {
    city: "Udine",
    region: "Friuli-Venezia Giulia",
    description: "Software gestionale per imprese edili a Udine. Cantieri alpini, costruttivo industriale friulano e gestione subappalti con Edilizia in Cloud.",
  },
  messina: {
    city: "Messina",
    region: "Sicilia",
    description: "Software gestionale per imprese edili a Messina. Cantieri infrastrutturali, interventi antisismici e SAL puntuali per le imprese dello Stretto.",
  },
  livorno: {
    city: "Livorno",
    region: "Toscana",
    description: "Software gestionale per imprese edili a Livorno. Cantieri portuali, ristrutturazioni e lavori costieri: tutto gestito con Edilizia in Cloud.",
  },
  prato: {
    city: "Prato",
    region: "Toscana",
    description: "Software gestionale per imprese edili a Prato. Capannoni industriali, logistica tessile e ristrutturazioni nel distretto più dinamico della Toscana.",
  },
  vicenza: {
    city: "Vicenza",
    region: "Veneto",
    description: "Software gestionale per imprese edili a Vicenza. Edilizia industriale, restauro palladiano e cantieri residenziali nel cuore del Nord-Est produttivo.",
  },
  "reggio-calabria": { city: "Reggio Calabria", region: "Calabria", description: "Software gestionale per imprese edili a Reggio Calabria. Appalti PNRR, porto di Gioia Tauro e cantieri sulla costa tirrenica con Edilizia in Cloud." },
  foggia: { city: "Foggia", region: "Puglia", description: "Software gestionale per imprese edili a Foggia. Edilizia rurale, appalti pubblici nella Capitanata e cantieri estivi con Edilizia in Cloud." },
  pescara: { city: "Pescara", region: "Abruzzo", description: "Software gestionale per imprese edili a Pescara. Cantieri costieri, ricostruzione post-sisma e residenziale nell'area metropolitana con Edilizia in Cloud." },
  taranto: { city: "Taranto", region: "Puglia", description: "Software gestionale per imprese edili a Taranto. Riqualificazione urbana, porto militare e grandi appalti pubblici con Edilizia in Cloud." },
  cosenza: { city: "Cosenza", region: "Calabria", description: "Software gestionale per imprese edili a Cosenza. Cantieri montani nella Sila, fondi PNRR e costa tirrenica con Edilizia in Cloud." },
  trento: { city: "Trento", region: "Trentino-Alto Adige", description: "Software gestionale per imprese edili a Trento. Cantieri alpini, standard CasaClima e bioedilizia in legno con Edilizia in Cloud." },
  bolzano: { city: "Bolzano", region: "Alto Adige", description: "Software gestionale per imprese edili a Bolzano. Standard KlimaHaus, cantieri alpini e mercato bilingue con Edilizia in Cloud." },
  ferrara: { city: "Ferrara", region: "Emilia-Romagna", description: "Software gestionale per imprese edili a Ferrara. Restauro patrimonio UNESCO, zona alluvionale e riqualificazione delta con Edilizia in Cloud." },
  // ── Aggiunte 2026-05-22 dal commit 990d1f1ca (allineate a CityLanding.tsx) ──
  // BUG FIX: queste città erano nel sitemap + componente React ma NON nel
  // middleware → bot Google riceveva 404. Ora coerente.
  como: { city: "Como", region: "Lombardia", description: "Software gestionale per imprese edili a Como. Ville di lusso sul lago, restauro storico in centro UNESCO e cantieri lariani con Edilizia in Cloud." },
  lecco: { city: "Lecco", region: "Lombardia", description: "Software gestionale per imprese edili a Lecco. Cantieri in pendenza in Valassina, ristrutturazioni vincolate nei nuclei antichi e logistica lago con Edilizia in Cloud." },
  monza: { city: "Monza", region: "Lombardia", description: "Software gestionale per imprese edili a Monza e Brianza. Capannoni industriali con tempistiche rigide, residenziale di pregio per clienti milanesi e SAL settimanali con Edilizia in Cloud." },
  varese: { city: "Varese", region: "Lombardia", description: "Software gestionale per imprese edili a Varese. Clienti italo-svizzeri esigenti, cantieri prealpini stagionali e gestione frontalieri con Edilizia in Cloud." },
  treviso: { city: "Treviso", region: "Veneto", description: "Software gestionale per imprese edili a Treviso. Capannoni industriali nei distretti vinicoli, ristrutturazioni di rustici sotto vincolo e burocrazia veneta con Edilizia in Cloud." },
  latina: { city: "Latina", region: "Lazio", description: "Software gestionale per imprese edili a Latina. Cantieri stagionali sulla costa pontina, capannoni agricoli dell'Agro Pontino e riqualificazione case popolari con Edilizia in Cloud." },
  pisa: { city: "Pisa", region: "Toscana", description: "Software gestionale per imprese edili a Pisa. Restauro vincolato del centro storico UNESCO, edilizia universitaria estiva e manutenzione case versiliesi con Edilizia in Cloud." },
};

// Blog category meta
const BLOG_CATEGORIES = {
  "gestione-cantieri": {
    label: "Gestione Cantieri",
    description: "Guide e articoli sulla gestione dei cantieri edili: organizzazione, sicurezza, documentazione e software.",
  },
  "finanza-edilizia": {
    label: "Finanza Edilizia",
    description: "Articoli su fatturazione, margini, SAL e gestione finanziaria per imprese edili.",
  },
  "hr-personale": {
    label: "HR & Personale",
    description: "Guide sulla gestione del personale edile: presenze, buste paga, CCNL edilizia e formazione.",
  },
  "marketing-edilizia": {
    label: "Marketing Edilizia",
    description: "Strategie di marketing per imprese edili: preventivi vincenti, recensioni e presenza online.",
  },
  "commerciale-edilizia": {
    label: "Commerciale Edilizia",
    description: "Articoli su vendita, preventivi e acquisizione clienti per imprese edili.",
  },
  "digitalizzazione-edilizia": {
    label: "Digitalizzazione Edilizia",
    description: "Come digitalizzare l'impresa edile: software, processi e strumenti per il 2026.",
  },
  "normativa-edilizia": {
    label: "Normativa Edilizia",
    description: "Guide sulla normativa per imprese edili: DURC, CCNL, sicurezza D.Lgs 81, SOA, Codice Appalti, patente a crediti e bonus.",
  },
};

// ─── HTML builder ────────────────────────────────────────────────────────────

function buildHtml({ title, description, canonical, h1, intro, links = [], jsonLd = null, extra = "", ogType = "website", ogImage = "https://www.ediliziaincloud.com/og/og-default.png" }) {
  const jsonLdScript = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n  ")
      : `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : "";

  // Normalize internal href: add trailing slash for SPA routes (skip files,
  // skip root, skip already-slashed). Senza questo Googlebot segue link verso
  // URL non canonici che generano un 301 extra (e prima del fix middleware
  // canonicale ricevevano 200 con stesso contenuto → duplicato indicizzato).
  const normalizeInternalHref = (href) => {
    if (!href || !href.startsWith("/")) return href;
    if (href.endsWith("/")) return href;
    if (/\.[a-z0-9]{2,8}$/i.test(href)) return href;
    return `${href}/`;
  };

  const navLinks = links
    .map((l) => `<li><a href="${normalizeInternalHref(l.href)}">${escHtml(l.label)}</a></li>`)
    .join("\n        ");

  const breadcrumb = canonical
    .replace("https://www.ediliziaincloud.com", "")
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/-/g, " "))
    .join(" › ");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}"/>
  <link rel="canonical" href="${escAttr(canonical)}"/>
  <meta property="og:title" content="${escAttr(title)}"/>
  <meta property="og:description" content="${escAttr(description)}"/>
  <meta property="og:url" content="${escAttr(canonical)}"/>
  <meta property="og:type" content="${escAttr(ogType)}"/>
  <meta property="og:site_name" content="Edilizia in Cloud"/>
  <meta property="og:image" content="${escAttr(ogImage)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escAttr(title)}"/>
  <meta name="twitter:description" content="${escAttr(description)}"/>
  ${jsonLdScript}
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://www.ediliziaincloud.com/"}${breadcrumb ? `,${ buildBreadcrumbItems(canonical) }` : ""}]}</script>
  <link rel="alternate" type="text/plain" title="LLMs.txt" href="/llms.txt"/>
  <link rel="alternate" type="text/plain" title="LLMs Full" href="/llms-full.txt"/>
  <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"/>
</head>
<body>
  <header>
    <nav aria-label="Navigazione principale">
      <a href="/">Edilizia in Cloud</a> |
      <a href="/funzionalita/">Funzionalità</a> |
      <a href="/prezzi/">Prezzi</a> |
      <a href="/confronto/">Confronto</a> |
      <a href="/blog/">Blog</a> |
      <a href="/demo/">Demo</a>
    </nav>
  </header>
  <main>
    ${breadcrumb ? `<nav aria-label="Breadcrumb"><span>Home › ${escHtml(breadcrumb)}</span></nav>` : ""}
    <h1>${escHtml(h1)}</h1>
    <p>${escHtml(intro)}</p>
    ${extra}
    <nav aria-label="Link correlati">
      <ul>
        ${navLinks}
      </ul>
    </nav>
  </main>
  <footer>
    <p>© 2026 Domus Group S.r.l. — P.IVA 13132010961 — Via Aurelio Saffi 29, 20123 Milano</p>
    <nav>
      <a href="/privacy-policy/">Privacy Policy</a> |
      <a href="/termini-e-condizioni/">Termini e Condizioni</a> |
      <a href="/avviso-legale/">Avviso Legale</a> |
      <a href="/condizioni-utilizzo/">Condizioni di Utilizzo</a> |
      <a href="/cookie-policy/">Cookie Policy</a> |
      <a href="/dpa/">DPA</a> |
      <a href="/sitemap.xml">Sitemap</a> |
      <a href="/llms.txt">LLMs.txt</a>
    </nav>
  </footer>
</body>
</html>`;
}

function buildBreadcrumbItems(canonical) {
  const parts = canonical.replace("https://www.ediliziaincloud.com", "").split("/").filter(Boolean);
  return parts
    .map((part, i) => {
      const pos = i + 2;
      const href = canonicalUrl("/" + parts.slice(0, i + 1).join("/"));
      const name = part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `{"@type":"ListItem","position":${pos},"name":"${name}","item":"${href}"}`;
    })
    .join(",");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function seoDescription(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 165) return text;
  const clipped = text.slice(0, 162);
  const boundary = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf(";"), clipped.lastIndexOf(","));
  if (boundary >= 120) return clipped.slice(0, boundary).trim();
  return `${clipped.replace(/\s+\S*$/, "").trim()}…`;
}

function buildNoindexHtml(pathname) {
  const canonical = `${BASE}${pathname}`;
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow,noarchive"/>
  <title>Area riservata | Edilizia in Cloud</title>
  <meta name="description" content="Questa pagina appartiene a un'area riservata o transazionale di Edilizia in Cloud e non deve essere indicizzata."/>
  <link rel="canonical" href="${escAttr(canonical)}"/>
</head>
<body>
  <main>
    <h1>Area riservata</h1>
    <p>Questa pagina non è destinata ai risultati di ricerca.</p>
    <a href="/">Torna a Edilizia in Cloud</a>
  </main>
</body>
</html>`;
}

function buildNotFoundHtml(pathname) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow,noarchive"/>
  <title>Pagina non trovata | Edilizia in Cloud</title>
  <meta name="description" content="La pagina richiesta non esiste su Edilizia in Cloud."/>
</head>
<body>
  <main>
    <h1>Pagina non trovata</h1>
    <p>La pagina ${escHtml(pathname)} non esiste o è stata spostata.</p>
    <a href="/">Torna alla home</a>
  </main>
</body>
</html>`;
}

// ─── Route resolver ──────────────────────────────────────────────────────────

function resolveRoute(pathname) {
  // Exact match
  if (ROUTES[pathname]) {
    const r = ROUTES[pathname];
    return {
      title: r.title,
      description: seoDescription(r.description),
      canonical: canonicalUrl(pathname),
      h1: r.h1,
      intro: r.intro,
      links: r.links || [],
      jsonLd: r.jsonLd || null,
      // 2026-06-01 BUG FIX CRITICO: `extra` veniva SCARTATO qui.
      // Tutto il contenuto SEO ricco (sezioni h2/h3, FAQ, confronti) era
      // definito nelle config ROUTES ma resolveRoute non lo passava a
      // buildHtml → Google riceveva solo h1+intro (~166 parole) invece del
      // contenuto completo (~1000+ parole). Questa singola riga mancante è
      // la causa per cui gli arricchimenti SEO passati "non funzionavano mai":
      // il contenuto c'era nel codice ma non veniva MAI servito ai bot.
      extra: r.extra || "",
      ogType: r.ogType,
      ogImage: r.ogImage,
    };
  }

  // City hub: /software-gestionale-edilizia (senza città specifica)
  if (pathname === "/software-gestionale-edilizia") {
    return {
      title: "Software Gestionale Edilizia — Cantieri, Preventivi e Margini | Edilizia in Cloud",
      description: seoDescription("Software gestionale per imprese edili italiane: cantieri, preventivi, fatturazione, magazzino, personale, CRM e margini in un'unica piattaforma cloud."),
      canonical: canonicalUrl("/software-gestionale-edilizia"),
      h1: "Software gestionale edilizia per imprese edili italiane",
      intro: "Edilizia in Cloud unisce cantieri, preventivi, fatturazione, magazzino, personale, CRM e controllo margini in una piattaforma cloud mobile-first. La pagina include anche la copertura nelle principali città italiane per supporto e onboarding locale.",
      links: [
        { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
        { href: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia" },
        { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione SDI" },
        { href: "/funzionalita/app-cantiere-mobile", label: "App Cantiere Mobile" },
        { href: "/funzionalita/magazzino-cantiere", label: "Magazzino Cantiere" },
        { href: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
        { href: "/software-gestionale-edilizia-milano", label: "Milano" },
        { href: "/software-gestionale-edilizia-roma", label: "Roma" },
        { href: "/software-gestionale-edilizia-napoli", label: "Napoli" },
        { href: "/software-gestionale-edilizia-torino", label: "Torino" },
        { href: "/software-gestionale-edilizia-bologna", label: "Bologna" },
        { href: "/software-gestionale-edilizia-firenze", label: "Firenze" },
        { href: "/demo", label: "Richiedi Demo" },
      ],
      jsonLd: null,
    };
  }

  // City landing: /software-gestionale-edilizia-{city}
  const cityMatch = pathname.match(/^\/software-gestionale-edilizia-(.+)$/);
  if (cityMatch) {
    const cityKey = cityMatch[1].toLowerCase();
    const cfg = CITY_CONFIGS[cityKey];
    if (!cfg) return null;

    const cityName = cfg.city;
    const region = cfg.region;
    // v8.6.118 — fix GSC "Pagina duplicata / scansionata non indicizzata".
    // Le city pages condividevano il template (h1+intro+links uguali),
    // Google le foldava come duplicati o le ignorava per thin content.
    // Aggiungiamo:
    //  - Unique intro che incorpora cfg.description (varia per città)
    //  - extra body con sezioni differenziate (mercato locale, normativa,
    //    casi d'uso edili specifici della regione)
    //  - FAQ schema con domande locali
    const cityBody = `
    <h2>Edilizia in Cloud per le imprese edili di ${escHtml(cityName)}</h2>
    <p>${escHtml(cfg.description)}</p>
    <p>Le imprese edili che operano a ${escHtml(cityName)} e in tutta la regione ${escHtml(region)} affrontano sfide specifiche: gestione cantieri distribuiti, coordinamento di subappaltatori locali, conformità alle normative regionali ${escHtml(region)} e rapporti con Cassa Edile territoriale. Edilizia in Cloud centralizza ordini, DDT, presenze, fatturazione SDI e contabilità di cantiere in un'unica piattaforma cloud accessibile da smartphone direttamente in cantiere.</p>
    <h2>Cosa puoi gestire con Edilizia in Cloud a ${escHtml(cityName)}</h2>
    <ul>
      <li><strong>Cantieri multipli</strong> in ${escHtml(cityName)}, ${escHtml(region)} e tutto il territorio nazionale</li>
      <li><strong>Preventivi professionali</strong> con prezzari regionali aggiornati e voci di capitolato per ${escHtml(region)}</li>
      <li><strong>Fatturazione elettronica SDI</strong> B2B e FatturaPA conforme alle regole AdE</li>
      <li><strong>Presenze geolocalizzate</strong> degli operai in cantiere a ${escHtml(cityName)}, con timbratura GPS e gestione CCNL Edilizia</li>
      <li><strong>Subappalti e DURC</strong>: verifica scadenza automatica, alert su POS e polizze</li>
      <li><strong>Controllo margini</strong> per commessa, confronto preventivo vs consuntivo in tempo reale</li>
    </ul>
    <h2>Mercato edile a ${escHtml(cityName)} e tipologia di cantieri</h2>
    <p>Le imprese edili attive nell'area di ${escHtml(cityName)} servono prevalentemente clientela privata (ristrutturazioni, nuove costruzioni residenziali), appalti pubblici (PNRR, opere infrastrutturali, riqualificazione urbana) e progetti specialistici tipici del territorio ${escHtml(region)}. Edilizia in Cloud è progettato per coprire l'intero ciclo dell'impresa edile italiana, dal primo sopralluogo fino alla fatturazione finale e archivio fiscale a norma.</p>
    <h2>Onboarding rapido per imprese di ${escHtml(cityName)}</h2>
    <p>Il setup di Edilizia in Cloud richiede in media 48 ore: import dati da Excel, Primus, TeamSystem o STR Vision, configurazione fatturazione elettronica SDI, attivazione utenti per squadra e formazione iniziale del titolare e del capocantiere. Supporto in italiano via chat, email e telefono direttamente dal team Domus Group.</p>
    `;
    return {
      title: `Software Gestionale Edilizia ${cityName} | Edilizia in Cloud`,
      description: seoDescription(cfg.description),
      canonical: canonicalUrl(pathname),
      h1: `Software gestionale per imprese edili a ${cityName}`,
      intro: `${cfg.description} Edilizia in Cloud serve imprese di ${cityName} e dell'intera regione ${region} con cantieri, preventivi, fatturazione SDI e HR in un'unica piattaforma cloud mobile-first.`,
      extra: cityBody,
      links: [
        { href: "/funzionalita", label: "Funzionalità" },
        { href: "/prezzi", label: "Prezzi" },
        { href: "/demo", label: `Demo Imprese ${cityName}` },
        { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
        { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione SDI" },
        { href: "/per/imprese-edili", label: "Per Imprese di Costruzione" },
        { href: "/software-gestionale-edilizia", label: "Tutte le città" },
      ],
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Edilizia in Cloud",
          description: `Software gestionale per imprese edili a ${cityName}, ${region}`,
          url: canonicalUrl(pathname),
          areaServed: [{ "@type": "City", name: cityName }, { "@type": "AdministrativeArea", name: region }],
          provider: { "@type": "Organization", name: "Domus Group S.r.l.", url: "https://www.ediliziaincloud.com/" },
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: `Edilizia in Cloud funziona per imprese edili di ${cityName}?`,
              acceptedAnswer: { "@type": "Answer", text: `Sì, Edilizia in Cloud è utilizzato da imprese edili di ${cityName} e in tutta la regione ${region}. Il software gestisce cantieri, preventivi, fatturazione SDI, presenze operai e subappalti con prezzari regionali aggiornati per ${region}.` },
            },
            {
              "@type": "Question",
              name: `Quanto costa Edilizia in Cloud per un'impresa edile di ${cityName}?`,
              acceptedAnswer: { "@type": "Answer", text: `Edilizia in Cloud parte da 127€/mese con prova gratuita di 31 giorni senza carta di credito. I piani crescono in base al numero di cantieri, utenti e moduli (HR, subappalti, controllo margini).` },
            },
            {
              "@type": "Question",
              name: `Come migro i dati del vecchio gestionale a Edilizia in Cloud da ${cityName}?`,
              acceptedAnswer: { "@type": "Answer", text: `Il team Domus Group esegue la migrazione assistita in 48 ore: import da Excel, Primus, TeamSystem, STR Vision o EdilNet. Cantieri, anagrafiche clienti/fornitori, fatture e archivio storico vengono trasferiti in ambiente di test prima del go-live.` },
            },
          ],
        },
      ],
    };
  }

  // Blog category: /blog/categoria/{slug}
  const catMatch = pathname.match(/^\/blog\/categoria\/(.+)$/);
  if (catMatch) {
    const slug = catMatch[1];
    const cat = BLOG_CATEGORIES[slug];
    if (!cat) return null;

    const label = cat.label;
    // Fix GSC 2026-06: la pagina categoria DEVE linkare i propri articoli —
    // prima linkava solo altre categorie, lasciando i post senza link interni.
    const otherCategories = Object.keys(BLOG_CATEGORIES)
      .filter((c) => c !== slug)
      .map((c) => ({ href: `/blog/categoria/${c}`, label: BLOG_CATEGORIES[c].label }));
    return {
      title: `${label}: Articoli e Guide | Edilizia in Cloud Blog`,
      description: seoDescription(cat.description),
      canonical: canonicalUrl(pathname),
      h1: `Blog: ${label}`,
      intro: cat.description,
      links: [
        { href: "/blog", label: "Tutti gli Articoli" },
        ...blogCategoryPostLinks(slug),
        ...otherCategories,
        { href: "/funzionalita", label: "Funzionalità" },
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `Blog Edilizia: ${label}`,
        description: seoDescription(cat.description),
        url: canonicalUrl(pathname),
        inLanguage: "it",
      },
    };
  }

  // Blog post: /blog/{slug}
  const blogMatch = pathname.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    const meta = BLOG_POST_META[slug];
    if (!meta) return null;

    const articleH1 = meta.h1 || meta.title.split("|")[0].trim();
    const articleIntro = meta.description;
    // v8.6.115 — Inietta preview HTML del body articolo (prime 3-4 sezioni)
    // da BLOG_BODIES (generato via script da src/data/blogPosts.ts).
    // Risolve 'thin content' SEO: prima Google vedeva solo intro 1 paragrafo,
    // ora vede 600-2000 char di contenuto reale + heading semantici H2.
    const articleContent = BLOG_BODIES[slug] || ""; // fallback: client renderizza
    const articleJsonLd = meta.title ? {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: articleH1,
      description: meta.description || "",
      url: canonicalUrl(pathname),
      datePublished: meta.publishedAt || "",
      author: { "@type": "Person", name: "Florin Andriciuc" },
      publisher: { "@type": "Organization", name: "Edilizia in Cloud", url: "https://www.ediliziaincloud.com/" },
      image: meta.coverImage || "https://www.ediliziaincloud.com/og/og-default.png",
      keywords: meta.tags ? meta.tags.join(", ") : "",
      inLanguage: "it",
    } : null;
    // Link correlati: post della stessa categoria (max 4, escluso il corrente).
    // Rafforza l'interlinking articolo→articolo per la distribuzione del
    // PageRank interno (fix GSC "Scansionata ma non indicizzata").
    const postCategory = BLOG_POST_CATEGORY[slug];
    const relatedLinks = BLOG_ALL_POST_LINKS
      .filter((l) => l.href !== `/blog/${slug}` && BLOG_POST_CATEGORY[l.href.slice("/blog/".length)] === postCategory)
      .slice(0, 4);
    return {
      title: meta.title || "Blog Edilizia | Edilizia in Cloud",
      description: seoDescription(meta.description || "Articoli e guide pratiche per imprese edili italiane."),
      canonical: canonicalUrl(pathname),
      h1: articleH1,
      intro: articleIntro,
      extra: articleContent,
      links: [
        { href: "/blog", label: "Tutti gli Articoli" },
        ...relatedLinks,
        ...(postCategory ? [{ href: `/blog/categoria/${postCategory}`, label: BLOG_CATEGORIES[postCategory]?.label || "Categoria" }] : []),
        { href: "/funzionalita", label: "Funzionalità" },
        { href: "/demo", label: "Richiedi Demo" },
      ],
      jsonLd: articleJsonLd,
      ogType: "article",
      ogImage: meta.coverImage || "https://www.ediliziaincloud.com/og/og-default.png",
    };
  }

  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

// ─── Private subdomains — block all bots/crawlers ───────────────────────────
// Subdomain privati dell'app: ricevono X-Robots-Tag noindex + 403 ai bot.
// Aggiornato 2026-05-25: aggiunti commercialista + referral (portali dedicati
// introdotti dal commit 359972c97 senza aggiornamento del middleware).
const PRIVATE_SUBDOMAINS = ["app", "lavori", "clienti", "admin", "commercialista", "referral"];
const ASSET_EXT_RE = /\.(js|css|png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?|ttf|eot|map|json|xml|txt|pdf|webmanifest)$/i;
const PUBLIC_NOINDEX_PATTERNS = [
  /^\/(admin|azienda|cliente|dipendente|venditore|partner|tecnico|campo|portale|portale-cliente|app)(\/|$)/,
  /^\/(login|admin-login|clienti-login|lavori-login|cambia-password|reset-password)(\/|$)/,
  /^\/(prenota|offerta|firma|firma-odv|firma-fea|preventivo|ref|feedback\/nps|widget|qr|stima)(\/|$)/,
];

function isPrivateSubdomain(hostname) {
  const sub = hostname.split(".")[0].toLowerCase();
  return PRIVATE_SUBDOMAINS.includes(sub);
}

function isPublicNoindexPath(pathname) {
  return PUBLIC_NOINDEX_PATTERNS.some((pattern) => pattern.test(pathname));
}

export async function onRequest({ request, next, env }) {
  const ua = request.headers.get("user-agent") || "";
  const url = new URL(request.url);

  // ── Canonical URL normalization (root cause GSC "Pagina duplicata") ──────
  // Le regole `_redirects` di Cloudflare Pages NON scattano per Googlebot
  // perché il middleware risponde 200 direttamente con HTML statico per le
  // varianti non canoniche (`/blog` vs `/blog/`, apex vs www, ecc.).
  // Risultato: Google indicizza entrambe le versioni come pagine valide e
  // sceglie un canonical arbitrario, ignorando il <link rel="canonical">.
  // Forziamo qui un singolo 301 per host/protocol/trailing-slash PRIMA
  // di ogni altra logica, così bot e utenti vedono la stessa canonical.
  if (!isPrivateSubdomain(url.hostname)) {
    const host = url.hostname.toLowerCase();
    const isMain = host === "ediliziaincloud.com" || host === "www.ediliziaincloud.com";
    const path = url.pathname;
    const isFile = ASSET_EXT_RE.test(path) || /\.[a-z0-9]{2,8}$/i.test(path);

    // Calcola in un solo passaggio il path normalizzato (trailing slash + /home)
    // così le redirect host/protocol non producono catene a due hop (es.
    // http://ediliziaincloud.com/blog → https://www.ediliziaincloud.com/blog
    // → https://www.ediliziaincloud.com/blog/). Google penalizza i redirect
    // chain e GSC li segnala come "Pagina con reindirizzamento".
    let normalizedPath = path;
    if (isMain) {
      // 1) Alias legacy / SEO short-URL → canonical finale in UN SOLO hop.
      //    La chiave si cerca SEMPRE senza trailing slash, così sia /ddt-cantiere
      //    sia /ddt-cantiere/ risolvono alla stessa destinazione senza catena.
      const aliasKey = normalizedPath !== "/" ? normalizedPath.replace(/\/$/, "") : "/";
      if (LEGACY_REDIRECTS[aliasKey]) {
        normalizedPath = LEGACY_REDIRECTS[aliasKey];
      } else if (!isFile && normalizedPath !== "/" && !normalizedPath.endsWith("/")) {
        // 2) Trailing slash normalization (skip root e file con estensione).
        //    Le SPA route HTML devono terminare con "/" per matchare la canonical
        //    dichiarata in <link rel="canonical"> e nel sitemap.xml.
        normalizedPath = `${normalizedPath}/`;
      }
    }

    const needsHostFix = isMain && (url.protocol !== "https:" || host !== "www.ediliziaincloud.com");
    const needsPathFix = isMain && normalizedPath !== path;

    if (needsHostFix || needsPathFix) {
      return Response.redirect(
        `https://www.ediliziaincloud.com${normalizedPath}${url.search}`,
        301,
      );
    }
  }

  const pathname = url.pathname.replace(/\/$/, "") || "/";

  // ── Private subdomains: block all bots, serve noindex ──────────────────
  if (isPrivateSubdomain(url.hostname)) {
    // Serve robots.txt that blocks everything on private subdomains
    if (url.pathname === "/robots.txt") {
      return new Response(
        "User-agent: *\nDisallow: /\n",
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        }
      );
    }

    // For bots: return 403 with noindex — don't reveal any content
    if (isBot(ua)) {
      return new Response("", {
        status: 403,
        headers: {
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    // Regular users on private subdomains: pass through to SPA, add noindex header
    const response = await next();
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
    return newResponse;
  }

  // Skip asset requests — MA con guard anti cache-poisoning.
  // Se la SPA-fallback di Cloudflare Pages serve index.html (HTML, 200) per un
  // URL di asset (es. /assets-cbN/Foo-hash.js) perché il file manca durante una
  // race di deploy, l'edge lo cacha come quell'asset → ogni richiesta successiva
  // di quel chunk torna HTML → ChunkLoadError in loop, NON risolvibile lato
  // browser (l'avvelenamento è all'edge). Convertiamo l'HTML-per-asset in un 404
  // no-store: l'edge non lo memorizza e, appena il deploy completa, il file vero
  // (200 con il giusto content-type) viene servito e cachato correttamente.
  if (ASSET_EXT_RE.test(pathname)) {
    const assetRes = await next();
    const ct = assetRes.headers.get("content-type") || "";
    if (assetRes.status === 200 && ct.includes("text/html")) {
      return new Response("Asset not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return assetRes;
  }

  // Public host but private/auth/transactional path: always noindex.
  // Non-bot users can still use the SPA; crawlers receive a lightweight noindex page.
  if (isPublicNoindexPath(pathname)) {
    if (isBot(ua)) {
      return new Response(buildNoindexHtml(pathname), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
          Vary: "User-Agent",
        },
      });
    }

    const response = await next();
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
    return newResponse;
  }

  // ── Public site (www / root): serve SEO content to bots ────────────────
  // Real users always get the normal SPA shell (dist/index.html) served by
  // Cloudflare's static file match → JS loads immediately → React hydrates
  // → menu, animations, chat, all interactivity works as expected.
  // Bots get the lightweight SEO HTML below.
  if (!isBot(ua)) {
    return next();
  }

  // ── Audit GEO 2026-06 + estensione 2026-07-04: PRERENDER COMPLETO ai bot ─
  // Nato per i soli /blog/<slug>: il sintetico aveva ~426 parole vs ~1.800+
  // del prerender Playwright. L'audit GEO di luglio ha misurato lo stesso
  // divario sulle pagine COMMERCIALI servite ai bot: /confronto/vs-primus
  // 102 parole (prerender: 1.316 + tabella comparativa), /funzionalita/
  // gestione-cantieri 129 (prerender: 4.128 + FAQPage), /per/serramentisti
  // 147 (prerender: 3.683 + FAQPage). I motori AI citano i passaggi: il
  // sintetico thin rendeva incitabili proprio le pagine delle query
  // commerciali ("alternativa a Primus", "software per serramentisti").
  // → Ora il prerender-first vale per TUTTE le route pubbliche TRANNE:
  //   • "/"            — sintetico curato superiore (answer block, 4 schema,
  //                      FAQ 5Q; il prerender home non è mai stato servito)
  //   • "/funzionalita" (hub esatto) — il sintetico ha FAQPage 7Q che il
  //                      prerender non ha; le sotto-pagine invece switchano
  //   • città (/software-gestionale-edilizia-<city>) — sintetico con
  //                      LocalBusiness+FAQ locali; NON esiste prerender
  //                      (il guard fallirebbe comunque: doppia sicurezza)
  // Guard anti-shell invariato: si usa la risposta SOLO se è un vero
  // prerender (canonical presente + contenuto con H2) — mai la shell SPA.
  const keepSynthetic =
    pathname === "/" ||
    pathname === "/funzionalita" ||
    /^\/software-gestionale-edilizia-[^/]+$/.test(pathname);
  if (!keepSynthetic) {
    try {
      const assetUrl = new URL(`${pathname}/index.html`, url.origin);
      const assetResp = await env.ASSETS.fetch(new Request(assetUrl, { headers: { accept: "text/html" } }));
      if (assetResp && assetResp.ok) {
        const body = await assetResp.text();
        const isRealPrerender = body.includes('rel="canonical"') && body.includes("<h2");
        if (isRealPrerender) {
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=3600, s-maxage=86400",
              "X-Robots-Tag": "index, follow",
              Vary: "User-Agent",
            },
          });
        }
      }
    } catch {
      // Asset binding non disponibile o errore: fallback al sintetico sotto.
    }
  }

  const route = resolveRoute(pathname);
  if (!route) {
    return new Response(buildNotFoundHtml(pathname), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        Vary: "User-Agent",
      },
    });
  }

  const html = buildHtml(route);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Robots-Tag": "index, follow",
      Vary: "User-Agent",
    },
  });
}
