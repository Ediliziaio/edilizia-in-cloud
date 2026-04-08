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

const BASE = "https://ediliziaincloud.com";

const ROUTES = {
  "/": {
    title: "Software Gestionale Edilizia | Edilizia in Cloud",
    description:
      "Gestisci cantieri, preventivi, fatturazione e squadre con il gestionale edile pensato da imprenditori edili. Prova gratis 14 giorni.",
    h1: "Il software gestionale per imprese edili che fa tutto",
    intro:
      "Edilizia in Cloud è il primo software gestionale pensato da imprenditori edili, per imprenditori edili. Gestisci cantieri, preventivi, fatturazione elettronica e squadre in un'unica piattaforma cloud.",
    links: [
      { href: "/funzionalita", label: "Scopri le Funzionalità" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
      { href: "/demo", label: "Richiedi una Demo" },
      { href: "/blog", label: "Blog Edilizia" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Edilizia in Cloud",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Software gestionale per imprese edili: cantieri, preventivi, fatturazione elettronica, HR.",
      url: "https://ediliziaincloud.com",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "EUR",
        lowPrice: "49",
        highPrice: "199",
        offerCount: "3",
      },
    },
  },

  "/funzionalita": {
    title: "Funzionalità del Software Edile | Edilizia in Cloud",
    description:
      "Scopri tutte le funzionalità: gestione cantieri, preventivi professionali, fatturazione elettronica, controllo margini e HR edile.",
    h1: "Tutte le funzionalità per la tua impresa edile",
    intro:
      "Una suite completa pensata per le imprese edili italiane: gestione cantieri in tempo reale, preventivi professionali, fatturazione elettronica integrata, controllo dei margini e gestione del personale.",
    links: [
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi Professionali" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione Elettronica" },
      { href: "/funzionalita/margini-cantiere", label: "Controllo Margini" },
      { href: "/prezzi", label: "Piani e Prezzi" },
    ],
  },

  "/funzionalita/gestione-cantieri": {
    title: "Gestione Cantieri Digitale | Edilizia in Cloud",
    description:
      "Monitora avanzamento lavori, squadre, materiali e costi in tempo reale. Il modulo gestione cantieri di Edilizia in Cloud.",
    h1: "Gestione Cantieri Digitale",
    intro:
      "Monitora ogni cantiere in tempo reale: avanzamento lavori, presenze squadre, consumo materiali e scostamento dal budget. Tutto accessibile da smartphone anche in assenza di connessione.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/preventivi-edilizia", label: "Preventivi" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/fatturazione-elettronica": {
    title: "Fatturazione Elettronica Edilizia | Edilizia in Cloud",
    description:
      "Emetti fatture elettroniche B2B e PA dal gestionale cantieri. SDI integrato, split payment, reverse charge e archiviazione automatica.",
    h1: "Fatturazione Elettronica per Imprese Edili",
    intro:
      "Emetti fatture elettroniche direttamente dal gestionale: SDI integrato, split payment, reverse charge edilizia, note di credito e archiviazione fiscale a norma. Zero doppio inserimento.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/integrazioni", label: "Integrazioni" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/preventivi-edilizia": {
    title: "Preventivi Edilizia Professionali | Edilizia in Cloud",
    description:
      "Crea preventivi edili professionali in minuti. Computi metrici, prezziari regionali, firma digitale e accettazione online inclusi.",
    h1: "Preventivi Edilizia Professionali",
    intro:
      "Genera preventivi professionali con prezziari aggiornati, calcolo automatico dei ricarichi, firma digitale integrata e portale di accettazione online per il cliente.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/funzionalita/margini-cantiere": {
    title: "Controllo Margini Cantiere | Edilizia in Cloud",
    description:
      "Analizza la redditività di ogni cantiere in tempo reale. Confronta preventivo vs consuntivo e identifica dove perdi denaro.",
    h1: "Controllo Margini per Cantiere",
    intro:
      "Confronta preventivo vs consuntivo in tempo reale per ogni cantiere. Analizza costi di manodopera, materiali e subappalti. Scopri subito dove perdi margine prima che sia troppo tardi.",
    links: [
      { href: "/funzionalita", label: "Tutte le Funzionalità" },
      { href: "/funzionalita/fatturazione-elettronica", label: "Fatturazione" },
      { href: "/demo", label: "Richiedi Demo" },
    ],
  },

  "/prezzi": {
    title: "Prezzi Software Gestionale Edilizia | Edilizia in Cloud",
    description:
      "Piani da 49€/mese. Nessun costo di attivazione, nessun vincolo contrattuale. Prova gratuita 14 giorni.",
    h1: "Piani e prezzi trasparenti",
    intro:
      "Scegli il piano adatto alla dimensione della tua impresa. Nessun costo di attivazione, nessun vincolo contrattuale. Cambia o disdici quando vuoi. Prova gratis per 14 giorni.",
    links: [
      { href: "/demo", label: "Richiedi Demo Gratuita" },
      { href: "/funzionalita", label: "Funzionalità Incluse" },
    ],
  },

  "/confronto": {
    title: "Confronto Software Gestionale Edilizia 2026 | Edilizia in Cloud",
    description:
      "Confronta Edilizia in Cloud con Excel, Primus, EdilNet e altri software. Scopri perché 500+ imprese edili hanno scelto noi.",
    h1: "Confronto software gestionali per edilizia 2026",
    intro:
      "Confronta Edilizia in Cloud con le alternative più usate dalle imprese edili italiane. Analisi imparziale di funzionalità, prezzo, assistenza e semplicità d'uso.",
    links: [
      { href: "/confronto/vs-primus", label: "Edilizia in Cloud vs Primus" },
      { href: "/confronto/vs-edilnet", label: "Edilizia in Cloud vs EdilNet" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
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
    title: "Blog Edilizia: Gestione Cantieri e Digitalizzazione | Edilizia in Cloud",
    description:
      "Guide pratiche su gestione cantieri, preventivi, fatturazione e digitalizzazione per imprese edili italiane.",
    h1: "Blog: guide per imprese edili",
    intro:
      "Articoli pratici su gestione cantieri, preventivi professionali, fatturazione elettronica, HR edile e digitalizzazione per titolari di imprese edili.",
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
      url: "https://ediliziaincloud.com/glossario-edilizia",
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
    title: "Chi Siamo | Edilizia in Cloud — Domus Group S.r.l.",
    description:
      "Siamo un team di imprenditori edili e sviluppatori software. Abbiamo creato Edilizia in Cloud perché non trovavamo nulla di adeguato per le nostre imprese.",
    h1: "Chi siamo: nati dall'edilizia, per l'edilizia",
    intro:
      "Edilizia in Cloud è un prodotto di Domus Group S.r.l., fondata da imprenditori edili e sviluppatori software con oltre 15 anni di esperienza nel settore delle costruzioni italiano.",
    links: [
      { href: "/demo", label: "Richiedi Demo" },
      { href: "/prezzi", label: "Vedi i Prezzi" },
    ],
  },

  "/demo": {
    title: "Richiedi una Demo Gratuita | Edilizia in Cloud",
    description:
      "Prenota una demo gratuita di 30 minuti con un nostro consulente. Scopri come Edilizia in Cloud può trasformare la tua impresa edile.",
    h1: "Prenota la tua demo gratuita",
    intro:
      "Demo personalizzata di 30 minuti con un consulente specializzato in edilizia. Nessun obbligo di acquisto. Scopri come altri titolari hanno ridotto i costi del 20% con Edilizia in Cloud.",
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

function buildHtml({ title, description, canonical, h1, intro, links = [], jsonLd = null, extra = "" }) {
  const jsonLdScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : "";

  const navLinks = links
    .map((l) => `<li><a href="${l.href}">${escHtml(l.label)}</a></li>`)
    .join("\n        ");

  const breadcrumb = canonical
    .replace("https://ediliziaincloud.com", "")
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
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="Edilizia in Cloud"/>
  <meta property="og:image" content="https://ediliziaincloud.com/og/home.png"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escAttr(title)}"/>
  <meta name="twitter:description" content="${escAttr(description)}"/>
  ${jsonLdScript}
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://ediliziaincloud.com/"}${breadcrumb ? `,${ buildBreadcrumbItems(canonical) }` : ""}]}</script>
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
      <a href="/sitemap.xml">Sitemap</a>
    </nav>
  </footer>
</body>
</html>`;
}

function buildBreadcrumbItems(canonical) {
  const parts = canonical.replace("https://ediliziaincloud.com", "").split("/").filter(Boolean);
  return parts
    .map((part, i) => {
      const pos = i + 2;
      const href = "https://ediliziaincloud.com/" + parts.slice(0, i + 1).join("/");
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
    return {
      title: "Blog Edilizia | Edilizia in Cloud",
      description: "Articoli e guide pratiche per imprese edili italiane.",
      canonical: BASE + pathname,
      h1: "Articolo del Blog",
      intro: "Guida pratica per titolari di imprese edili.",
      links: [
        { href: "/blog", label: "Tutti gli Articoli" },
        { href: "/funzionalita", label: "Funzionalità" },
        { href: "/demo", label: "Richiedi Demo" },
      ],
    };
  }

  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function onRequest({ request, next }) {
  const ua = request.headers.get("user-agent") || "";
  if (!isBot(ua)) {
    return next();
  }

  const url = new URL(request.url);
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
