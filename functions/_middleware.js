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

const ROUTES = {
  "/": {
    title: "Gestionale Edilizia Cloud per Imprese Edili",
    description:
      "Edilizia in Cloud è il gestionale cloud per imprese edili: cantieri, preventivi, fatturazione elettronica SDI e HR. Usato da 500+ imprese. Prova gratis 14 giorni.",
    h1: "Edilizia in Cloud: il software gestionale per imprese edili italiane",
    intro:
      "Edilizia in Cloud è il software gestionale cloud progettato specificamente per le imprese edili italiane. Permette di gestire cantieri, preventivi professionali, fatturazione elettronica SDI (B2B e PA), subappalti, DDT, ordini fornitori, HR con presenze geolocalizzate e prima nota — tutto in un'unica piattaforma accessibile da smartphone anche in cantiere. Utilizzato da oltre 500 imprese edili in Italia, Edilizia in Cloud riduce il tempo amministrativo del 70% e i costi operativi del 20%. Piani a partire da 49€/mese, prova gratuita 31 giorni con supporto italiano dedicato.",
    extra: `
    <h2>Perché Edilizia in Cloud è diverso dagli altri gestionali edilizia</h2>
    <p>Edilizia in Cloud è il primo gestionale italiano <strong>AI-native</strong> pensato per chi sta in cantiere, non per il commercialista. Mentre i gestionali tradizionali (Primus, TeamSystem, STR Vision) sono nati per la progettazione e la contabilità di studio, Edilizia in Cloud è ottimizzato per il flusso operativo dell'impresa edile italiana: ordini, presenze, DDT, fatturazione e controllo margini accessibili da smartphone direttamente in cantiere, anche offline.</p>
    <h2>Per chi è pensato Edilizia in Cloud</h2>
    <ul>
      <li><strong>Imprese edili generaliste</strong> con 1-50 dipendenti che gestiscono cantieri residenziali, commerciali, industriali</li>
      <li><strong>Imprese di ristrutturazione</strong> con cantieri di breve-media durata e molti subappalti</li>
      <li><strong>Serramentisti, impiantisti, ditte di tetti</strong> che vogliono uscire da Excel e WhatsApp</li>
      <li><strong>General contractor</strong> con commesse complesse e multi-sito</li>
      <li><strong>Geometri titolari di impresa</strong> e <strong>capocantiere con impresa propria</strong></li>
    </ul>
    <h2>Cosa fa Edilizia in Cloud in concreto</h2>
    <p>Centralizza in un'unica piattaforma tutti i processi dell'impresa edile: dal primo preventivo al saldo finale. Sostituisce 4-5 strumenti separati (Excel, fatturazione in cloud, gestionale presenze, WhatsApp aziendale, calendario condiviso) eliminando errori di trascrizione, dati persi, perdite di margine e contestazioni del cliente.</p>
    <h2>Risultati misurabili per le imprese edili italiane</h2>
    <ul>
      <li><strong>-70% tempo amministrativo</strong> grazie all'automazione fatturazione e ordini</li>
      <li><strong>-20% costi operativi</strong> con il controllo margini di cantiere in tempo reale</li>
      <li><strong>+30% velocità preventivi</strong> con prezzari regionali e voci di capitolato pre-configurate</li>
      <li><strong>0 errori MUT / Cassa Edile</strong> con invio mensile automatico</li>
    </ul>
    `,
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
        url: "https://www.ediliziaincloud.com/",
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
        url: "https://www.ediliziaincloud.com/",
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
      "Edilizia in Cloud integra agenti AI custom per impresa edile: rispondono a clienti via WhatsApp/email, qualificano lead, redigono preventivi base, gestiscono back-office. Architettura privacy GDPR-first con dati ospitati in Italia, niente training su contenuti del cliente. Risparmio medio 70% sulle ore segreteria.",
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
      "Prezzi di Edilizia in Cloud: piano Starter 49€/mese, Professional 99€/mese, Enterprise 199€/mese. Zero costi di attivazione, zero vincoli. Prova gratis 14 giorni.",
    h1: "Prezzi di Edilizia in Cloud: quanto costa il gestionale per imprese edili",
    intro:
      "Edilizia in Cloud propone 3 piani pensati per imprese edili di ogni dimensione. Piano Starter da 49€/mese per imprese fino a 5 utenti, piano Professional da 99€/mese per imprese fino a 15 utenti con controllo margini avanzato, piano Enterprise da 199€/mese con utenti illimitati e API. Nessun costo di attivazione, nessun vincolo contrattuale, disdici quando vuoi. Prova gratuita 31 giorni con supporto italiano dedicato. Tutti i piani includono fatturazione elettronica SDI, gestione cantieri e supporto italiano.",
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
    canonical: canonicalUrl("/confronto/vs-teamsystem"),
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
    title: "Gestionale Edilizia vs Excel | Confronto 2026",
    description:
      "Excel per gestire i cantieri? Scopri quanto ti costa davvero e perché le imprese edili stanno passando a Edilizia in Cloud. Confronto completo 2026.",
    canonical: canonicalUrl("/confronto/vs-excel"),
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
    <p>Edilizia in Cloud applica le seguenti misure: cifratura in transito (TLS 1.3) e a riposo (AES-256), autenticazione multi-fattore opzionale per gli amministratori, segregazione dei dati per tenant (row-level security PostgreSQL), backup giornalieri con retention 30 giorni, log degli accessi conservati 12 mesi, datacenter europei conformi a ISO 27001. Nessun dato esce dall'UE.</p>
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
    title: "Software Gestionale per Imprese di Costruzione",
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
    title: "Software Gestionale per Impiantisti",
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
    title: "Software Gestionale per Ristrutturatori Edili",
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
    title: "Software Gestionale per Serramentisti",
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
        { href: "/per/imprese-costruzione", label: "Per Imprese di Costruzione" },
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
              acceptedAnswer: { "@type": "Answer", text: `Edilizia in Cloud parte da 49€/mese con prova gratuita di 31 giorni senza carta di credito. I piani crescono in base al numero di cantieri, utenti e moduli (HR, subappalti, controllo margini).` },
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
    return {
      title: `${label}: Articoli e Guide | Edilizia in Cloud Blog`,
      description: seoDescription(cat.description),
      canonical: canonicalUrl(pathname),
      h1: `Blog: ${label}`,
      intro: cat.description,
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
    const POST_META = {
      "sal-cantiere-come-funziona": { title: "SAL Cantiere: Cos'è, Come Funziona e Come Gestirlo | Blog Edilizia in Cloud", description: "Guida completa allo Stato di Avanzamento dei Lavori: come calcolare il SAL, emettere i certificati di pagamento e gestire la contabilità di cantiere.", publishedAt: "2025-11-28", coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80" },
      "durc-edilizia-guida-completa": { title: "DURC in Edilizia: Guida Completa 2026 | Blog Edilizia in Cloud", description: "Cos'è il DURC, come richiederlo, validità 120 giorni, DURC online e cosa fare se l'impresa risulta irregolare.", publishedAt: "2025-12-08", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
      "giornale-dei-lavori-cantiere": { title: "Il Giornale dei Lavori in Cantiere: Guida Pratica | Blog Edilizia in Cloud", description: "Come compilare il giornale dei lavori, chi lo tiene, valore legale e come digitalizzarlo con un software gestionale.", publishedAt: "2025-12-18", coverImage: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1600&q=80" },
      "subappalto-edilizia-guida": { title: "Subappalto in Edilizia: Regole, Limiti e Come Gestirlo nel 2026 | Blog Edilizia in Cloud", description: "Tutto sul subappalto edile: limiti percentuali, autorizzazioni, obblighi DURC e responsabilità solidale.", publishedAt: "2025-12-28", coverImage: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80" },
      "acquisire-clienti-impresa-edile": { title: "Come Acquisire Clienti per un'Impresa Edile nel 2026 | Blog Edilizia in Cloud", description: "7 strategie efficaci per trovare nuovi clienti come impresa edile: referral, preventivi professionali, presenza online e molto altro.", publishedAt: "2026-01-06", coverImage: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=80" },
      "gestione-operai-cantiere-presenze-ore": { title: "Gestione Operai in Cantiere: Presenze e Ore Lavorate | Blog Edilizia in Cloud", description: "Come gestire le presenze degli operai in cantiere, tracciare le ore lavorate per commessa e semplificare le buste paga.", publishedAt: "2026-01-09", coverImage: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=80" },
      "sito-web-impresa-edile-guida": { title: "Come Creare un Sito Web per un'Impresa Edile: Guida Completa | Blog Edilizia in Cloud", description: "Guida passo passo per costruire un sito web professionale per la tua impresa edile: struttura, SEO locale e contenuti che convertono.", publishedAt: "2026-01-12", coverImage: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=1600&q=80" },
      "digitalizzazione-impresa-edile-passo-passo": { title: "Digitalizzazione dell'Impresa Edile: Guida Passo Passo | Blog Edilizia in Cloud", description: "Come digitalizzare la tua impresa edile in modo graduale: da carta e Excel a un gestionale cloud completo.", publishedAt: "2026-01-15", coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80" },
      "computo-metrico-estimativo-guida": { title: "Computo Metrico Estimativo: Cos'è, Come Si Fa e Template Gratis | Blog Edilizia in Cloud", description: "Guida completa al computo metrico estimativo: struttura, prezzari regionali, errori comuni e software per compilarlo in modo professionale.", publishedAt: "2026-01-18", coverImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80" },
      "bim-edilizia-guida-pratica": { title: "BIM in Edilizia: Cos'è, Obblighi e Come Iniziare nel 2026 | Blog Edilizia in Cloud", description: "Guida pratica al BIM per imprese edili italiane: obblighi DM 560, soglie per appalti pubblici e come iniziare senza stravolgere l'organizzazione.", publishedAt: "2026-01-21", coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80" },
      "cassa-edile-come-funziona": { title: "Cassa Edile: Come Funziona, Contributi e Obblighi per le Imprese | Blog Edilizia in Cloud", description: "Guida completa alla Cassa Edile: iscrizione obbligatoria, contributi mensili, prestazioni ai lavoratori e come gestirla senza errori di DURC.", publishedAt: "2026-01-24", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
      "appalti-pubblici-edilizia-guida": { title: "Come Partecipare agli Appalti Pubblici in Edilizia: Guida 2026 | Blog Edilizia in Cloud", description: "Guida pratica agli appalti pubblici per imprese edili: requisiti SOA, DURC, portali gare, ribasso d'asta e fondi PNRR.", publishedAt: "2026-01-27", coverImage: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=80" },
      "sicurezza-cantieri-dlgs-81": { title: "Sicurezza Cantieri: D.Lgs 81/2008 Spiegato alle Imprese Edili | Blog Edilizia in Cloud", description: "Guida pratica al D.Lgs 81/2008: obblighi del titolare, DVR, POS, PSC, formazione obbligatoria e sanzioni. Come gestirla senza perdere ore.", publishedAt: "2026-01-30", coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&q=80" },
      "ccnl-edilizia-guida": { title: "CCNL Edilizia Industria 2024-2026: Guida Pratica per le Imprese | Blog Edilizia in Cloud", description: "Tutto sul CCNL Edilizia Industria: livelli retributivi, Cassa Edile, costo reale di un operaio, ferie e come calcolare il costo orario effettivo.", publishedAt: "2026-02-02", coverImage: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=80" },
      "attestazione-soa-imprese-edili": { title: "Attestazione SOA per Imprese Edili: Come Ottenerla e Mantenerla | Blog Edilizia in Cloud", description: "Guida completa alla SOA: categorie OG/OS, requisiti di fatturato e personale, costi, rinnovi e verifica triennale per partecipare agli appalti pubblici.", publishedAt: "2026-02-05", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80" },
      "superbonus-imprese-edili-2026": { title: "Superbonus 2025-2026: Cosa Resta per le Imprese Edili e Come Gestirlo | Blog Edilizia in Cloud", description: "Guida aggiornata ai bonus edilizi 2025-2026 per le imprese: aliquote, cessione del credito, SAL obbligatori e documentazione. Come acquisire lavori con i bonus.", publishedAt: "2026-02-08", coverImage: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1600&q=80" },
      "gestione-liquidita-impresa-edile": { title: "Gestione della Liquidità per Imprese Edili: Come Evitare la Crisi di Cassa | Blog Edilizia in Cloud", description: "Guida completa alla liquidità per imprese edili: ciclo finanziario del cantiere, previsione flussi di cassa a 90 giorni, SAL e strumenti pratici per non trovarsi mai senza cassa.", publishedAt: "2026-02-11", coverImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80" },
      "pnrr-edilizia-imprese-2026": { title: "PNRR per Imprese Edili 2025-2026: Bandi, Requisiti e Come Partecipare | Blog Edilizia in Cloud", description: "Guida completa al PNRR per le imprese edili: bandi disponibili, requisiti SOA, rendicontazione digitale, SAL asseverati e come organizzarsi per non perdere i pagamenti pubblici.", publishedAt: "2026-02-14", coverImage: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=80" },
      "come-scegliere-software-gestionale-edilizia": { title: "Come Scegliere il Software Gestionale per la Tua Impresa Edile: Guida 2026 | Blog Edilizia in Cloud", description: "Guida pratica alla scelta del software gestionale per imprese edili: funzionalità indispensabili, 10 domande ai vendor, costi reali e errori da evitare.", publishedAt: "2026-02-17", coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80" },
      "gestione-subappaltatori-impresa-edile": { title: "Gestione Subappaltatori: Contratti, DURC, Pagamenti e Come Mantenere il Controllo | Blog Edilizia in Cloud", description: "Guida completa alla gestione dei subappaltatori: contratti obbligatori, DURC, responsabilità solidale, limiti subappalto appalti pubblici e software di gestione.", publishedAt: "2026-02-20", coverImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&q=80" },
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
            "come-fare-preventivo-edilizia": { title: "Come Fare un Preventivo Edilizia Professionale (Senza Perdere Margine) | Blog Edilizia in Cloud", description: "Come fare un preventivo edilizia che vince i lavori e protegge i tuoi margini. Metodo pratico in 5 passi per imprese edili.", publishedAt: "2025-11-08", coverImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80" },
            "alternativa-excel-cantieri": { title: "Alternativa a Excel per Cantieri: Perché le Imprese Edili Lo Stanno Abbandonando | Blog Edilizia in Cloud", description: "Stai usando Excel per gestire i cantieri? Ti costa molto più di quanto pensi. Confronto diretto: Excel vs gestionale di cantiere nel 2026.", publishedAt: "2025-11-18", coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80" },
            "cassa-impresa-edile-non-torna": { title: "Ho Fatturato ma Non Ho Soldi: Perché la Cassa dell'Impresa Edile Non Torna | Blog Edilizia in Cloud", description: "Hai cantieri aperti e fatture emesse, ma il conto corrente resta sotto pressione? Ecco perché ricavi e liquidità non sono la stessa cosa e come riprendere il controllo.", publishedAt: "2026-02-23", coverImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80", tags: ["cassa impresa edile", "liquidità edilizia", "cash flow cantiere", "SAL cantiere", "margini cantiere"] },
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
            "fattura-corretta-serramentisti": { title: "Fattura Corretta per Serramentisti: Posa, Materiali, Acconti e IVA | Blog Edilizia in Cloud", description: "Guida pratica per serramentisti: come organizzare fatture, acconti, saldo, posa in opera, varianti e documentazione senza perdere margine.", publishedAt: "2026-04-18", coverImage: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1200&q=80", tags: ["fattura corretta serramentisti", "fatturazione serramenti", "fattura infissi", "IVA serramenti", "acconto serramenti"] },
            "preventivo-rifacimento-tetto-come-farlo": { title: "Preventivo Rifacimento Tetto: Come Farlo Bene e Non Perdere Margine | Blog Edilizia in Cloud", description: "Cosa deve contenere un preventivo per rifacimento tetto: sopralluogo, materiali, sicurezza, ponteggi, varianti e SAL.", publishedAt: "2026-04-21", coverImage: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=1200&q=80", tags: ["preventivo rifacimento tetto", "costo rifacimento tetto", "preventivo tetto", "azienda coperture", "margine tetti"] },
            "seo-locale-impresa-edile": { title: "SEO Locale per Imprese Edili: Come Farsi Trovare nella Propria Zona | Blog Edilizia in Cloud", description: "Guida SEO locale per imprese edili, serramentisti, tetti, impiantisti e ristrutturatori che lavorano su province e città specifiche.", publishedAt: "2026-04-24", coverImage: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80", tags: ["SEO locale impresa edile", "farsi trovare su Google edilizia", "marketing locale edilizia", "Google Business edilizia", "clienti edili zona"] },
            "recupero-crediti-impresa-edile-fatture-scadute": { title: "Recupero Crediti per Imprese Edili: Come Gestire Fatture Scadute e Clienti Lenti | Blog Edilizia in Cloud", description: "Come prevenire e gestire fatture scadute in edilizia: scadenziario, solleciti, SAL, condizioni di pagamento e controllo cassa.", publishedAt: "2026-04-27", coverImage: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80", tags: ["recupero crediti impresa edile", "fatture scadute edilizia", "solleciti pagamento edilizia", "crediti clienti edilizia", "cassa impresa edile"] },
          };
    const meta = POST_META[slug];
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
      image: meta.coverImage || "https://www.ediliziaincloud.com/og/home.png",
      keywords: meta.tags ? meta.tags.join(", ") : "",
      inLanguage: "it",
    } : null;
    return {
      title: meta.title || "Blog Edilizia | Edilizia in Cloud",
      description: seoDescription(meta.description || "Articoli e guide pratiche per imprese edili italiane."),
      canonical: canonicalUrl(pathname),
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

export async function onRequest({ request, next }) {
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
      // /home (legacy) → /
      if (normalizedPath === "/home" || normalizedPath === "/home/") {
        normalizedPath = "/";
      } else if (!isFile && normalizedPath !== "/" && !normalizedPath.endsWith("/")) {
        // Trailing slash normalization (skip root e file con estensione).
        // Le SPA route HTML devono terminare con "/" per matchare la canonical
        // dichiarata in <link rel="canonical"> e nel sitemap.xml.
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

  // Skip asset requests
  if (ASSET_EXT_RE.test(pathname)) {
    return next();
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
  if (!isBot(ua)) {
    return next();
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
