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

const ROUTES = {
  "/": {
    title: "Edilizia in Cloud — Software Gestionale per Imprese Edili Italiane",
    description:
      "Edilizia in Cloud è il gestionale cloud per imprese edili: cantieri, preventivi, fatturazione elettronica SDI e HR. Usato da 500+ imprese. Prova gratis 14 giorni.",
    h1: "Edilizia in Cloud: il software gestionale per imprese edili italiane",
    intro:
      "Edilizia in Cloud è il software gestionale cloud progettato specificamente per le imprese edili italiane. Permette di gestire cantieri, preventivi professionali, fatturazione elettronica SDI (B2B e PA), subappalti, DDT, ordini fornitori, HR con presenze geolocalizzate e prima nota — tutto in un'unica piattaforma accessibile da smartphone anche in cantiere. Utilizzato da oltre 500 imprese edili in Italia, Edilizia in Cloud riduce il tempo amministrativo del 70% e i costi operativi del 20%. Piani a partire da 49€/mese, prova gratuita 14 giorni senza carta di credito.",
    links: [
      { href: "/funzionalita", label: "Scopri le Funzionalità" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
      { href: "/demo", label: "Richiedi una Demo" },
      { href: "/blog", label: "Blog Edilizia" },
      { href: "/confronto", label: "Confronta con Altri Software" },
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
        url: "https://www.ediliziaincloud.com",
        inLanguage: "it",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "EUR",
          lowPrice: "49",
          highPrice: "199",
          offerCount: "3",
        },
        featureList: "Gestione cantieri, Preventivi professionali, Fatturazione elettronica SDI, Gestione subappalti, DDT, Ordini fornitori, HR e presenze, Prima nota, App mobile cantiere",
        screenshot: "https://www.ediliziaincloud.com/og/home.png",
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Edilizia in Cloud",
        legalName: "Domus Group S.r.l.",
        url: "https://www.ediliziaincloud.com",
        logo: "https://www.ediliziaincloud.com/logo.png",
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
    ],
  },

  "/funzionalita": {
    title: "Funzionalità Edilizia in Cloud — Gestionale Completo per Imprese Edili",
    description:
      "Tutte le funzionalità di Edilizia in Cloud: gestione cantieri, preventivi, fatturazione elettronica SDI, subappalti, HR, margini e app mobile cantiere.",
    h1: "Funzionalità di Edilizia in Cloud: tutto quello che serve alla tua impresa edile",
    intro:
      "Edilizia in Cloud offre 8 moduli integrati per gestire ogni aspetto dell'impresa edile: gestione cantieri in tempo reale con app mobile, preventivi professionali con prezziari regionali, fatturazione elettronica SDI (B2B e FatturaPA), controllo margini per commessa, gestione subappalti con tracciamento DURC, DDT e bolle di consegna, HR con presenze geolocalizzate in cantiere e prima nota contabile. Ogni modulo è progettato per il settore edile italiano e funziona anche offline da smartphone.",
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
      ],
    },
  },

  "/funzionalita/gestione-cantieri": {
    title: "Gestione Cantieri Digitale con Edilizia in Cloud — App Mobile e Cloud",
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
    title: "Fatturazione Elettronica Edilizia con Edilizia in Cloud — SDI Integrato",
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
    title: "Preventivi Edilizia Professionali con Edilizia in Cloud — Prezziari e Firma Digitale",
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
    title: "Controllo Margini Cantiere con Edilizia in Cloud — Preventivo vs Consuntivo",
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

  "/prezzi": {
    title: "Prezzi Edilizia in Cloud — Piani da 49€/mese | Prova Gratis 14 Giorni",
    description:
      "Prezzi di Edilizia in Cloud: piano Starter 49€/mese, Professional 99€/mese, Enterprise 199€/mese. Zero costi di attivazione, zero vincoli. Prova gratis 14 giorni.",
    h1: "Prezzi di Edilizia in Cloud: quanto costa il gestionale per imprese edili",
    intro:
      "Edilizia in Cloud propone 3 piani pensati per imprese edili di ogni dimensione. Piano Starter da 49€/mese per imprese fino a 5 utenti, piano Professional da 99€/mese per imprese fino a 15 utenti con controllo margini avanzato, piano Enterprise da 199€/mese con utenti illimitati e API. Nessun costo di attivazione, nessun vincolo contrattuale, disdici quando vuoi. Prova gratuita 14 giorni senza carta di credito. Tutti i piani includono fatturazione elettronica SDI, gestione cantieri e supporto italiano.",
    links: [
      { href: "/demo", label: "Richiedi Demo Gratuita" },
      { href: "/funzionalita", label: "Funzionalità Incluse" },
      { href: "/confronto", label: "Confronta con Altri Software" },
    ],
    // FAQPage JSON-LD gestito dal componente React Prezzi.tsx
    // Non duplicare qui per evitare "Campo duplicato FAQPage" in GSC
  },

  "/confronto": {
    title: "Confronto Software Gestionali Edilizia 2026 — Edilizia in Cloud vs Alternative",
    description:
      "Confronta Edilizia in Cloud con TeamSystem, Primus, EdilNet, Buildertrend e Excel. Tabella comparativa: funzionalità, prezzi, assistenza e facilità d'uso.",
    h1: "Confronto Edilizia in Cloud vs altri software gestionali per edilizia 2026",
    intro:
      "Edilizia in Cloud è un gestionale cloud nato per le imprese edili italiane. A differenza dei gestionali tradizionali (TeamSystem, Primus, EdilNet) o degli strumenti generici (Excel), Edilizia in Cloud integra in un'unica piattaforma: gestione cantieri, preventivi, fatturazione elettronica SDI, subappalti e HR. Prezzo a partire da 49€/mese contro i 200-500€/mese dei competitor. Nessuna installazione locale, nessun vincolo contrattuale, supporto italiano dedicato e aggiornamenti inclusi. Oltre 500 imprese edili hanno già scelto Edilizia in Cloud.",
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
            text: "Edilizia in Cloud è il gestionale cloud più completo per imprese edili italiane. Integra gestione cantieri, preventivi, fatturazione SDI, subappalti e HR a partire da 49€/mese, contro i 200-500€/mese dei concorrenti come TeamSystem o Primus.",
          },
        },
        {
          "@type": "Question",
          name: "Edilizia in Cloud è meglio di TeamSystem per le imprese edili?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "TeamSystem è un ERP generalista potente ma costoso e complesso. Edilizia in Cloud è nato specificamente per le imprese edili: più semplice, più economico (da 49€/mese vs 200+€/mese) e con funzionalità specifiche come gestione subappalti, DURC e presenze geolocalizzate in cantiere.",
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
      ],
    },
  },

  "/confronto/vs-teamsystem": {
    title: "Edilizia in Cloud vs TeamSystem: Confronto 2026",
    description:
      "Confronto completo Edilizia in Cloud vs TeamSystem per imprese edili. ERP generalista vs gestionale nativo: prezzo, funzionalità e semplicità a confronto.",
    canonical: BASE + "/confronto/vs-teamsystem",
    h1: "Edilizia in Cloud vs TeamSystem: quale gestionale scegliere per la tua impresa edile?",
    intro:
      "Edilizia in Cloud e TeamSystem sono entrambi gestionali usati dalle imprese edili, ma con approcci opposti. TeamSystem è un ERP generalista con oltre 300 moduli, pensato per commercialisti e grandi aziende — costo medio 200-500€/mese. Edilizia in Cloud è un gestionale verticale per il cantiere, con interfaccia semplice e app mobile — da 49€/mese. Le imprese edili PMI (1-50 dipendenti) che passano da TeamSystem a Edilizia in Cloud risparmiano in media il 60% sul costo del software e dimezzano i tempi di formazione.",
    links: [
      { href: "/confronto", label: "Tutti i Confronti" },
      { href: "/confronto/vs-primus", label: "vs Primus" },
      { href: "/confronto/vs-excel", label: "vs Excel" },
      { href: "/demo", label: "Prova Gratis" },
    ],
  },

  "/confronto/vs-excel": {
    title: "Gestionale Edilizia vs Excel: Perché Smettere nel 2026 | Edilizia in Cloud",
    description:
      "Excel per gestire i cantieri? Scopri quanto ti costa davvero e perché le imprese edili stanno passando a Edilizia in Cloud. Confronto completo 2026.",
    canonical: BASE + "/confronto/vs-excel",
    h1: "Edilizia in Cloud vs Excel: il vero costo nascosto dei fogli di calcolo per le imprese edili",
    intro:
      "Excel sembra gratuito ma costa alle imprese edili in media 15 ore/settimana di lavoro amministrativo, errori di calcolo nei preventivi (in media 3-5% di margine perso per cantiere) e dati non condivisi tra ufficio e cantiere. Edilizia in Cloud sostituisce Excel con una piattaforma cloud che centralizza cantieri, preventivi, fatture e HR — accessibile da smartphone in cantiere. Oltre 500 imprese edili hanno già abbandonato Excel per Edilizia in Cloud.",
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
    title: "Edilizia in Cloud vs Buildertrend: Confronto 2026 | Alternativa Italiana",
    description:
      "Confronto Edilizia in Cloud vs Buildertrend per imprese edili italiane. Buildertrend è americano, senza SDI, senza Cassa Edile e solo in inglese. Ecco la differenza.",
    canonical: BASE + "/confronto/vs-buildertrend",
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
    title: "Blog Edilizia in Cloud — Guide Pratiche per Imprese Edili Italiane",
    description:
      "Guide pratiche su gestione cantieri, preventivi, fatturazione elettronica, subappalti e digitalizzazione per imprese edili italiane. Scritte da imprenditori edili.",
    h1: "Blog Edilizia in Cloud: guide pratiche per imprese edili italiane",
    intro:
      "Il blog di Edilizia in Cloud pubblica guide pratiche scritte da imprenditori edili per imprenditori edili. Articoli su gestione cantieri, preventivi professionali, fatturazione elettronica SDI, HR edile, subappalti, DURC, normativa e digitalizzazione. Ogni guida è pensata per essere applicata subito nella tua impresa.",
    links: [
      { href: "/blog/categoria/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/blog/categoria/finanza-edilizia", label: "Finanza Edilizia" },
      { href: "/blog/categoria/hr-personale", label: "HR & Personale" },
      { href: "/blog/come-organizzare-cantiere-edile", label: "Come Organizzare un Cantiere Edile" },
      { href: "/blog/documentazione-obbligatoria-cantiere-2025", label: "Documentazione Obbligatoria Cantiere 2025" },
      { href: "/blog/come-fare-preventivo-edilizia", label: "Come Fare un Preventivo Edilizia" },
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
      url: "https://www.ediliziaincloud.com/glossario-edilizia",
      inLanguage: "it",
    },
  },

  "/integrazioni": {
    title: "Integrazioni Software Edilizia | Edilizia in Cloud",
    description:
      "Connetti Edilizia in Cloud con fatturazione elettronica, contabilità, CRM, gestione presenze e molto altro. 20+ integrazioni native e API REST.",
    h1: "Integrazioni con i tuoi strumenti preferiti",
    intro:
      "Oltre 20 integrazioni native con i principali strumenti usati dalle imprese edili: FattureInCloud, Aruba, Zucchetti, Google Calendar, Stripe e molti altri. API REST disponibile per integrazioni custom.",
    links: [
      { href: "/funzionalita", label: "Funzionalità" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/chi-siamo": {
    title: "Chi Siamo — Edilizia in Cloud di Domus Group S.r.l.",
    description:
      "Edilizia in Cloud è un prodotto di Domus Group S.r.l. Fondato da Florin Andriciuc, imprenditore edile e CEO AEDIX. Un team di costruttori e sviluppatori.",
    h1: "Chi ha creato Edilizia in Cloud: nati dall'edilizia, per l'edilizia",
    intro:
      "Edilizia in Cloud è un prodotto di Domus Group S.r.l., fondato da Florin Andriciuc — imprenditore edile e CEO di AEDIX. Il team è composto da imprenditori edili e sviluppatori software con oltre 15 anni di esperienza nel settore delle costruzioni italiano. Edilizia in Cloud è stato creato perché non esisteva un gestionale pensato davvero per chi lavora in cantiere ogni giorno.",
    links: [
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
    ],
  },

  "/demo": {
    title: "Demo Gratuita Edilizia in Cloud — Prenota in 30 Secondi",
    description:
      "Prenota una demo gratuita di 30 minuti di Edilizia in Cloud. Un consulente edile ti mostra come gestire cantieri, preventivi e fatturazione. Nessun obbligo.",
    h1: "Demo gratuita di Edilizia in Cloud: vedi il gestionale in azione",
    intro:
      "Prenota una demo gratuita di 30 minuti con un consulente specializzato nel settore edile. Ti mostriamo come Edilizia in Cloud gestisce cantieri, preventivi, fatturazione elettronica SDI e personale. Nessun obbligo di acquisto. Le imprese edili che provano la demo attivano il gestionale nell'87% dei casi.",
    links: [
      { href: "/funzionalita", label: "Funzionalità" },
      { href: "/prezzi", label: "Prezzi" },
    ],
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

  "/per/imprese-costruzione": {
    title: "Software Gestionale per Imprese di Costruzione | Edilizia in Cloud",
    description:
      "Il gestionale cloud pensato per le imprese di costruzione: gestisci cantieri, contratti, SAL, fatturazione e squadre da un'unica piattaforma.",
    h1: "Gestionale per imprese di costruzione",
    intro:
      "Edilizia in Cloud è progettato per le imprese di costruzione italiane: monitoraggio avanzamento lavori, SAL automatici, gestione subappalti, fatturazione elettronica e controllo dei margini.",
    links: [
      { href: "/per/impiantisti", label: "Per Impiantisti" },
      { href: "/per/ristrutturatori", label: "Per Ristrutturatori" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/impiantisti": {
    title: "Software Gestionale per Impiantisti | Edilizia in Cloud",
    description:
      "Gestionale cloud per impiantisti: preventivi tecnici, SAL, fatturazione, magazzino e gestione squadre. Pensato per impianti elettrici, idraulici e termici.",
    h1: "Gestionale per impiantisti",
    intro:
      "Edilizia in Cloud si adatta alle esigenze degli impiantisti: preventivi tecnici dettagliati, gestione magazzino ricambi, pianificazione interventi e fatturazione automatizzata.",
    links: [
      { href: "/per/imprese-costruzione", label: "Per Imprese di Costruzione" },
      { href: "/per/serramentisti", label: "Per Serramentisti" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/ristrutturatori": {
    title: "Software per Ristrutturatori Edili | Edilizia in Cloud",
    description:
      "Gestionale cloud per imprese di ristrutturazione: preventivi dettagliati, gestione SAL, pratiche bonus edilizi e fatturazione elettronica.",
    h1: "Gestionale per ristrutturatori edili",
    intro:
      "Gestisci le tue ristrutturazioni dalla A alla Z: preventivi con computo dettagliato, SAL mensili, pratiche per bonus 110% e Superbonus, fatturazione elettronica integrata.",
    links: [
      { href: "/per/imprese-costruzione", label: "Per Imprese di Costruzione" },
      { href: "/per/fotovoltaico", label: "Per Fotovoltaico" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/fotovoltaico": {
    title: "Software per Installatori Fotovoltaico | Edilizia in Cloud",
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
    title: "Software Gestionale per Serramentisti | Edilizia in Cloud",
    description:
      "Gestionale cloud per serramentisti: preventivi con configuratore, ordini fornitori, pianificazione posa e fatturazione elettronica.",
    h1: "Gestionale per serramentisti",
    intro:
      "Edilizia in Cloud si adatta ai serramentisti: preventivi con configuratore prodotti, gestione ordini fornitori, pianificazione posa in cantiere e fatturazione automatica.",
    links: [
      { href: "/per/impiantisti", label: "Per Impiantisti" },
      { href: "/per/piccole-imprese", label: "Per Piccole Imprese" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/per/piccole-imprese": {
    title: "Gestionale per Piccole Imprese Edili | Edilizia in Cloud",
    description:
      "Il gestionale adatto anche alle piccole imprese edili: semplice, immediato, accessibile. Inizia gratis, senza vincoli.",
    h1: "Gestionale per piccole imprese edili",
    intro:
      "Anche le piccole imprese edili meritano un gestionale professionale. Con Edilizia in Cloud parti subito, senza formazione lunga e senza costi nascosti. Piano Starter da 49€/mese.",
    links: [
      { href: "/prezzi", label: "Vedi i Prezzi" },
      { href: "/per/imprese-costruzione", label: "Per Imprese di Costruzione" },
      { href: "/demo", label: "Richiedi Demo" },
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

  // /privacy, /termini, /cookie — noindex nel React, non servire ai bot (passthrough alla SPA)

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
};

// ─── HTML builder ────────────────────────────────────────────────────────────

function buildHtml({ title, description, canonical, h1, intro, links = [], jsonLd = null, extra = "", ogType = "website", ogImage = "https://www.ediliziaincloud.com/og/home.png" }) {
  const jsonLdScript = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n  ")
      : `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : "";

  const navLinks = links
    .map((l) => `<li><a href="${l.href}">${escHtml(l.label)}</a></li>`)
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
      <a href="/funzionalita">Funzionalità</a> |
      <a href="/prezzi">Prezzi</a> |
      <a href="/confronto">Confronto</a> |
      <a href="/blog">Blog</a> |
      <a href="/demo">Demo</a>
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
      <a href="/privacy">Privacy Policy</a> |
      <a href="/termini">Termini di Servizio</a> |
      <a href="/cookie">Cookie Policy</a> |
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
      const href = "https://www.ediliziaincloud.com/" + parts.slice(0, i + 1).join("/");
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

// ─── Route resolver ──────────────────────────────────────────────────────────

function resolveRoute(pathname) {
  // Exact match
  if (ROUTES[pathname]) {
    const r = ROUTES[pathname];
    return {
      title: r.title,
      description: r.description,
      canonical: BASE + pathname,
      h1: r.h1,
      intro: r.intro,
      links: r.links || [],
      jsonLd: r.jsonLd || null,
    };
  }

  // City hub: /software-gestionale-edilizia (senza città specifica)
  if (pathname === "/software-gestionale-edilizia") {
    return {
      title: "Software Gestionale Edilizia per Città — Tutta Italia | Edilizia in Cloud",
      description: "Edilizia in Cloud disponibile in 27 città italiane: Milano, Roma, Napoli, Torino, Bologna, Firenze e molte altre. Supporto locale, onboarding in 48 ore.",
      canonical: BASE + "/software-gestionale-edilizia",
      h1: "Software Gestionale Edilizia nella tua città",
      intro: "Edilizia in Cloud è il gestionale per imprese edili disponibile in tutta Italia. Con copertura in 22 città e supporto locale, il tuo onboarding è in 48 ore.",
      links: [
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
    const cityName = cfg ? cfg.city : cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
    const region = cfg ? cfg.region : "Italia";
    return {
      title: `Software Gestionale Edilizia ${cityName} | Edilizia in Cloud`,
      description: cfg
        ? cfg.description
        : `Software gestionale per imprese edili a ${cityName}. Gestisci cantieri, preventivi e fatturazione con Edilizia in Cloud.`,
      canonical: BASE + pathname,
      h1: `Software gestionale per imprese edili a ${cityName}`,
      intro: `Edilizia in Cloud è il software gestionale scelto dalle imprese edili di ${cityName} e ${region}. Gestisci cantieri, preventivi e fatturazione in un'unica piattaforma cloud.`,
      links: [
        { href: "/funzionalita", label: "Funzionalità" },
        { href: "/prezzi", label: "Prezzi" },
        { href: "/demo", label: "Richiedi Demo" },
        { href: "/per/imprese-costruzione", label: "Per Imprese di Costruzione" },
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: "Edilizia in Cloud",
        description: `Software gestionale per imprese edili a ${cityName}`,
        url: BASE + pathname,
        areaServed: [cityName, region],
      },
    };
  }

  // Blog category: /blog/categoria/{slug}
  const catMatch = pathname.match(/^\/blog\/categoria\/(.+)$/);
  if (catMatch) {
    const slug = catMatch[1];
    const cat = BLOG_CATEGORIES[slug];
    const label = cat ? cat.label : slug.replace(/-/g, " ");
    return {
      title: `${label}: Articoli e Guide | Edilizia in Cloud Blog`,
      description: cat
        ? cat.description
        : `Articoli e guide su ${label} per imprese edili italiane.`,
      canonical: BASE + pathname,
      h1: `Blog: ${label}`,
      intro: cat ? cat.description : `Guide pratiche su ${label} per titolari di imprese edili.`,
      links: [
        { href: "/blog", label: "Tutti gli Articoli" },
        { href: "/blog/categoria/gestione-cantieri", label: "Gestione Cantieri" },
        { href: "/blog/categoria/finanza-edilizia", label: "Finanza Edilizia" },
        { href: "/funzionalita", label: "Funzionalità" },
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `Blog Edilizia: ${label}`,
        description: cat ? cat.description : "",
        url: BASE + pathname,
        inLanguage: "it",
      },
    };
  }

  // Blog post: /blog/{slug}
  const blogMatch = pathname.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    const POST_META = {
      "sal-cantiere-come-funziona": { title: "SAL Cantiere: Cos'è, Come Funziona e Come Gestirlo | Blog Edilizia in Cloud", description: "Guida completa allo Stato di Avanzamento dei Lavori: come calcolare il SAL, emettere i certificati di pagamento e gestire la contabilità di cantiere." },
      "durc-edilizia-guida-completa": { title: "DURC in Edilizia: Guida Completa 2026 | Blog Edilizia in Cloud", description: "Cos'è il DURC, come richiederlo, validità 120 giorni, DURC online e cosa fare se l'impresa risulta irregolare." },
      "giornale-dei-lavori-cantiere": { title: "Il Giornale dei Lavori in Cantiere: Guida Pratica | Blog Edilizia in Cloud", description: "Come compilare il giornale dei lavori, chi lo tiene, valore legale e come digitalizzarlo con un software gestionale." },
      "subappalto-edilizia-guida": { title: "Subappalto in Edilizia: Regole, Limiti e Come Gestirlo nel 2026 | Blog Edilizia in Cloud", description: "Tutto sul subappalto edile: limiti percentuali, autorizzazioni, obblighi DURC e responsabilità solidale." },
      "acquisire-clienti-impresa-edile": { title: "Come Acquisire Clienti per un'Impresa Edile nel 2026 | Blog Edilizia in Cloud", description: "7 strategie efficaci per trovare nuovi clienti come impresa edile: referral, preventivi professionali, presenza online e molto altro." },
      "gestione-operai-cantiere-presenze-ore": { title: "Gestione Operai in Cantiere: Presenze e Ore Lavorate | Blog Edilizia in Cloud", description: "Come gestire le presenze degli operai in cantiere, tracciare le ore lavorate per commessa e semplificare le buste paga." },
      "sito-web-impresa-edile-guida": { title: "Come Creare un Sito Web per un'Impresa Edile: Guida Completa | Blog Edilizia in Cloud", description: "Guida passo passo per costruire un sito web professionale per la tua impresa edile: struttura, SEO locale e contenuti che convertono." },
      "digitalizzazione-impresa-edile-passo-passo": { title: "Digitalizzazione dell'Impresa Edile: Guida Passo Passo | Blog Edilizia in Cloud", description: "Come digitalizzare la tua impresa edile in modo graduale: da carta e Excel a un gestionale cloud completo." },
      "computo-metrico-estimativo-guida": { title: "Computo Metrico Estimativo: Cos'è, Come Si Fa e Template Gratis | Blog Edilizia in Cloud", description: "Guida completa al computo metrico estimativo: struttura, prezzari regionali, errori comuni e software per compilarlo in modo professionale." },
      "bim-edilizia-guida-pratica": { title: "BIM in Edilizia: Cos'è, Obblighi e Come Iniziare nel 2026 | Blog Edilizia in Cloud", description: "Guida pratica al BIM per imprese edili italiane: obblighi DM 560, soglie per appalti pubblici e come iniziare senza stravolgere l'organizzazione." },
      "cassa-edile-come-funziona": { title: "Cassa Edile: Come Funziona, Contributi e Obblighi per le Imprese | Blog Edilizia in Cloud", description: "Guida completa alla Cassa Edile: iscrizione obbligatoria, contributi mensili, prestazioni ai lavoratori e come gestirla senza errori di DURC." },
      "appalti-pubblici-edilizia-guida": { title: "Come Partecipare agli Appalti Pubblici in Edilizia: Guida 2026 | Blog Edilizia in Cloud", description: "Guida pratica agli appalti pubblici per imprese edili: requisiti SOA, DURC, portali gare, ribasso d'asta e fondi PNRR." },
      "sicurezza-cantieri-dlgs-81": { title: "Sicurezza Cantieri: D.Lgs 81/2008 Spiegato alle Imprese Edili | Blog Edilizia in Cloud", description: "Guida pratica al D.Lgs 81/2008: obblighi del titolare, DVR, POS, PSC, formazione obbligatoria e sanzioni. Come gestirla senza perdere ore." },
      "ccnl-edilizia-guida": { title: "CCNL Edilizia Industria 2024-2026: Guida Pratica per le Imprese | Blog Edilizia in Cloud", description: "Tutto sul CCNL Edilizia Industria: livelli retributivi, Cassa Edile, costo reale di un operaio, ferie e come calcolare il costo orario effettivo." },
      "attestazione-soa-imprese-edili": { title: "Attestazione SOA per Imprese Edili: Come Ottenerla e Mantenerla | Blog Edilizia in Cloud", description: "Guida completa alla SOA: categorie OG/OS, requisiti di fatturato e personale, costi, rinnovi e verifica triennale per partecipare agli appalti pubblici." },
      "superbonus-imprese-edili-2026": { title: "Superbonus 2025-2026: Cosa Resta per le Imprese Edili e Come Gestirlo | Blog Edilizia in Cloud", description: "Guida aggiornata ai bonus edilizi 2025-2026 per le imprese: aliquote, cessione del credito, SAL obbligatori e documentazione. Come acquisire lavori con i bonus." },
      "gestione-liquidita-impresa-edile": { title: "Gestione della Liquidità per Imprese Edili: Come Evitare la Crisi di Cassa | Blog Edilizia in Cloud", description: "Guida completa alla liquidità per imprese edili: ciclo finanziario del cantiere, previsione flussi di cassa a 90 giorni, SAL e strumenti pratici per non trovarsi mai senza cassa." },
      "pnrr-edilizia-imprese-2026": { title: "PNRR per Imprese Edili 2025-2026: Bandi, Requisiti e Come Partecipare | Blog Edilizia in Cloud", description: "Guida completa al PNRR per le imprese edili: bandi disponibili, requisiti SOA, rendicontazione digitale, SAL asseverati e come organizzarsi per non perdere i pagamenti pubblici." },
      "come-scegliere-software-gestionale-edilizia": { title: "Come Scegliere il Software Gestionale per la Tua Impresa Edile: Guida 2026 | Blog Edilizia in Cloud", description: "Guida pratica alla scelta del software gestionale per imprese edili: funzionalità indispensabili, 10 domande ai vendor, costi reali e errori da evitare." },
      "gestione-subappaltatori-impresa-edile": { title: "Gestione Subappaltatori: Contratti, DURC, Pagamenti e Come Mantenere il Controllo | Blog Edilizia in Cloud", description: "Guida completa alla gestione dei subappaltatori: contratti obbligatori, DURC, responsabilità solidale, limiti subappalto appalti pubblici e software di gestione." },
      "ridurre-costi-cantieri-edili": { title: "Come Ridurre i Costi Nei Cantieri Edili del 20% con il Digitale | Blog Edilizia in Cloud", description: "Scopri le 7 strategie pratiche che permettono alle imprese edili italiane di ridurre i costi operativi del 20-35% attraverso la digitalizzazione dei processi." },
      "gestione-cantieri-digitale": { title: "Gestione Cantieri 2026: Dalla Carta al Cloud — Guida Completa | Blog Edilizia in Cloud", description: "La guida definitiva per trasformare la gestione dei cantieri edili dalla carta al cloud. Dall'avanzamento lavori alle commesse, tutto ciò che devi sapere." },
      "preventivi-edilizia-guida": { title: "Preventivi Vincenti in Edilizia: Come Strutturare un'Offerta che Converte | Blog Edilizia in Cloud", description: "I preventivi perduti costano alle imprese edili milioni di euro ogni anno. Scopri come strutturare preventivi professionali che convincono il cliente." },
      "hr-edilizia-presenze-buste-paga": { title: "HR in Edilizia: Gestione Presenze, Buste Paga e Conformità CCNL | Blog Edilizia in Cloud", description: "La gestione del personale nelle imprese edili è tra le più complesse d'Italia. Scopri come semplificare presenze, buste paga e rispettare il CCNL Edilizia." },
      "analisi-margini-imprese-edili": { title: "Analisi dei Margini per Imprese Edili: La Guida Definitiva 2026 | Blog Edilizia in Cloud", description: "Il 68% delle imprese edili lavora senza conoscere i propri margini reali per commessa. Scopri come calcolare, monitorare e migliorare la redditività." },
      "marketing-digitale-imprese-edili": { title: "Marketing Digitale per Imprese Edili: Trovare Nuovi Clienti Online nel 2026 | Blog Edilizia in Cloud", description: "Il passaparola non basta più. Scopri le strategie di marketing digitale specifiche per le imprese edili italiane: dal Google My Business alle campagne social." },
      "software-gestionale-vs-excel": { title: "Software Gestionale vs Excel: Il Vero Costo Nascosto per la Tua Impresa Edile | Blog Edilizia in Cloud", description: "Molte imprese edili usano Excel convinte di risparmiare. Calcoliamo il vero costo nascosto: tempo perso, errori, opportunità mancate e rischio fiscale." },
      "digitalizzare-impresa-edile": { title: "Come Digitalizzare la Tua Impresa Edile in 30 Giorni | Blog Edilizia in Cloud", description: "Una roadmap concreta e testata per trasformare la tua impresa edile dal cartaceo al digitale in soli 30 giorni. Settimana per settimana, cosa fare." },
      "come-organizzare-cantiere-edile": { title: "Come Organizzare un Cantiere Edile: Guida Pratica per Titolari | Blog Edilizia in Cloud", description: "Hai cantieri aperti ma non sai dove sono i materiali, chi ha fatto cosa ieri, e quanto hai speso. Scopri il metodo in 5 fasi per organizzare ogni cantiere." },
      "documentazione-obbligatoria-cantiere-2025": { title: "Documentazione Obbligatoria Cantiere 2026: Lista Completa | Blog Edilizia in Cloud", description: "Lista aggiornata di tutti i documenti obbligatori per il cantiere nel 2026. POS, DURC, notifica preliminare, DDT e certificazioni finali." },
      "come-fare-preventivo-edilizia": { title: "Come Fare un Preventivo Edilizia Professionale (Senza Perdere Margine) | Blog Edilizia in Cloud", description: "Come fare un preventivo edilizia che vince i lavori e protegge i tuoi margini. Metodo pratico in 5 passi per imprese edili." },
      "alternativa-excel-cantieri": { title: "Alternativa a Excel per Cantieri: Perché le Imprese Edili Lo Stanno Abbandonando | Blog Edilizia in Cloud", description: "Stai usando Excel per gestire i cantieri? Ti costa molto più di quanto pensi. Confronto diretto: Excel vs gestionale di cantiere nel 2026." },
    };
    const meta = POST_META[slug] || {};
    const articleH1 = meta.h1 || (meta.title ? meta.title.split("|")[0].trim() : "Articolo del Blog");
    const articleIntro = meta.description || "Guida pratica per titolari di imprese edili.";
    const articleContent = ""; // Content rendered client-side by React
    const articleJsonLd = meta.title ? {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: articleH1,
      description: meta.description || "",
      url: BASE + pathname,
      datePublished: meta.publishedAt || "",
      author: { "@type": "Person", name: "Florin Andriciuc" },
      publisher: { "@type": "Organization", name: "Edilizia in Cloud", url: "https://www.ediliziaincloud.com" },
      image: meta.coverImage || "https://www.ediliziaincloud.com/og/home.png",
      keywords: meta.tags ? meta.tags.join(", ") : "",
      inLanguage: "it",
    } : null;
    return {
      title: meta.title || "Blog Edilizia | Edilizia in Cloud",
      description: meta.description || "Articoli e guide pratiche per imprese edili italiane.",
      canonical: BASE + pathname,
      h1: articleH1,
      intro: articleIntro,
      extra: articleContent,
      links: [
        { href: "/blog", label: "Tutti gli Articoli" },
        { href: "/funzionalita", label: "Funzionalità" },
        { href: "/demo", label: "Richiedi Demo" },
      ],
      jsonLd: articleJsonLd,
      ogType: "article",
      ogImage: meta.coverImage || "https://www.ediliziaincloud.com/og/home.png",
    };
  }

  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

// ─── Private subdomains — block all bots/crawlers ───────────────────────────
const PRIVATE_SUBDOMAINS = ["app", "lavori", "clienti", "admin"];

function isPrivateSubdomain(hostname) {
  const sub = hostname.split(".")[0].toLowerCase();
  return PRIVATE_SUBDOMAINS.includes(sub);
}

export async function onRequest({ request, next }) {
  const ua = request.headers.get("user-agent") || "";
  const url = new URL(request.url);

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

  // ── Public site (www / root): serve SEO content to bots ────────────────
  if (!isBot(ua)) {
    return next();
  }

  const pathname = url.pathname.replace(/\/$/, "") || "/";

  // Skip asset requests even for bots
  if (/\.(js|css|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot|map|json|xml|txt)$/i.test(pathname)) {
    return next();
  }

  const route = resolveRoute(pathname);
  if (!route) {
    // Unknown route — pass through, let the SPA handle 404
    return next();
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
