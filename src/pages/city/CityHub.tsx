import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import {
  MapPin,
  ArrowRight,
  CheckCircle,
  HardHat,
  ClipboardList,
  Receipt,
  Smartphone,
  Warehouse,
  TrendingUp,
  Users,
  Handshake,
  FileCheck2,
} from "lucide-react";

// SEO 2026-09-07: questa è la pagina "pillar" della keyword principale
// ("software gestionale edilizia cloud"). Prima era solo un elenco di città
// con sei card: 2.000 parole senza mai spiegare cos'è un gestionale edile,
// cosa costa rispetto a un programma installato o come si sceglie. Ora è
// una guida: definizione, cloud contro installato con i costi, i moduli,
// le domande per scegliere, le FAQ — e in fondo, come prima, le 43 città.

const CITIES = [
  { name: "Milano", slug: "milano", region: "Lombardia", desc: "Hub finanziario, massima concentrazione di imprese edili" },
  { name: "Roma", slug: "roma", region: "Lazio", desc: "Capitale, ampio mercato appalti pubblici e privati" },
  { name: "Napoli", slug: "napoli", region: "Campania", desc: "Prima città del Sud per volume di commesse edili" },
  { name: "Torino", slug: "torino", region: "Piemonte", desc: "Forte tradizione manifatturiera e cantieristica" },
  { name: "Bologna", slug: "bologna", region: "Emilia-Romagna", desc: "Eccellenza nella gestione cantieri e ristrutturazioni" },
  { name: "Firenze", slug: "firenze", region: "Toscana", desc: "Mercato restauro e recupero edilizio di pregio" },
  { name: "Bari", slug: "bari", region: "Puglia", desc: "Polo di riferimento per l'edilizia del Sud-Est" },
  { name: "Verona", slug: "verona", region: "Veneto", desc: "Distretto produttivo con alta densità di PMI edili" },
  { name: "Brescia", slug: "brescia", region: "Lombardia", desc: "Forte presenza di imprese edili e carpenterie" },
  { name: "Genova", slug: "genova", region: "Liguria", desc: "Mercato ristrutturazione e consolidamento strutturale" },
  { name: "Palermo", slug: "palermo", region: "Sicilia", desc: "Prima città della Sicilia per cantieri attivi" },
  { name: "Catania", slug: "catania", region: "Sicilia", desc: "Crescita costante del settore costruzioni civili" },
  { name: "Venezia", slug: "venezia", region: "Veneto", desc: "Specializzazione restauro e recupero conservativo" },
  { name: "Padova", slug: "padova", region: "Veneto", desc: "Distretto edile in espansione nel Veneto centrale" },
  { name: "Bergamo", slug: "bergamo", region: "Lombardia", desc: "Alta concentrazione di subappaltatori e artigiani" },
  { name: "Modena", slug: "modena", region: "Emilia-Romagna", desc: "PMI edili specializzate in costruzioni industriali" },
  { name: "Reggio Emilia", slug: "reggio-emilia", region: "Emilia-Romagna", desc: "Distretto cooperativo edile tra i più attivi d'Italia" },
  { name: "Parma", slug: "parma", region: "Emilia-Romagna", desc: "Forte sviluppo residenziale e commerciale" },
  { name: "Salerno", slug: "salerno", region: "Campania", desc: "Secondo polo campano per volumi di cantieri" },
  { name: "Trieste", slug: "trieste", region: "Friuli-Venezia Giulia", desc: "Mercato caratteristico tra cantieri portuali e civili" },
  { name: "Cagliari", slug: "cagliari", region: "Sardegna", desc: "Principale mercato edile della Sardegna" },
  { name: "Perugia", slug: "perugia", region: "Umbria", desc: "PMI edili attive su ristrutturazioni e nuove costruzioni" },
  { name: "Ancona", slug: "ancona", region: "Marche", desc: "Polo edilizio marchigiano in espansione" },
  { name: "Udine", slug: "udine", region: "Friuli-Venezia Giulia", desc: "Eccellenza costruttiva friulana con cantieri alpini e industriali" },
  { name: "Messina", slug: "messina", region: "Sicilia", desc: "Polo edilizio dello Stretto con interventi antisismici e infrastrutturali" },
  { name: "Livorno", slug: "livorno", region: "Toscana", desc: "Cantieri portuali, costieri e ristrutturazioni nella Toscana tirrenica" },
  { name: "Prato", slug: "prato", region: "Toscana", desc: "Distretto industriale tessile: capannoni, logistica e residenziale" },
  { name: "Vicenza", slug: "vicenza", region: "Veneto", desc: "Edilizia industriale e restauro palladiano nel cuore del Nord-Est" },
  { name: "Reggio Calabria", slug: "reggio-calabria", region: "Calabria", desc: "Polo edilizio calabrese tra PNRR, porto di Gioia Tauro e costa tirrenica" },
  { name: "Foggia", slug: "foggia", region: "Puglia", desc: "Edilizia rurale nella Capitanata: capannoni, infrastrutture e appalti pubblici" },
  { name: "Pescara", slug: "pescara", region: "Abruzzo", desc: "Costa adriatica, ricostruzione post-sisma e residenziale in forte crescita" },
  { name: "Taranto", slug: "taranto", region: "Puglia", desc: "Riqualificazione urbana, porto militare e grandi investimenti pubblici" },
  { name: "Cosenza", slug: "cosenza", region: "Calabria", desc: "Cantieri montani nella Sila, PNRR e costa tirrenica cosentina" },
  { name: "Trento", slug: "trento", region: "Trentino-Alto Adige", desc: "Standard CasaClima, costruzioni in legno e cantieri alpini d'eccellenza" },
  { name: "Bolzano", slug: "bolzano", region: "Alto Adige", desc: "Leader italiano per standard energetici KlimaHaus e bioedilizia alpina" },
  { name: "Ferrara", slug: "ferrara", region: "Emilia-Romagna", desc: "Restauro patrimonio UNESCO, zona delta e riqualificazione residenziale" },
  // Le 7 sotto esistevano in sitemap e middleware ma NON qui: pagine orfane
  // per Google (zero link interni in entrata) — la lista hub deve coprire
  // TUTTE le città del dizionario middleware (43), non fermarsi a 36.
  { name: "Como", slug: "como", region: "Lombardia", desc: "Ville sul lago, clientela internazionale e ristrutturazioni di pregio" },
  { name: "Lecco", slug: "lecco", region: "Lombardia", desc: "Cantieri prealpini, capannoni del distretto metalmeccanico e residenziale" },
  { name: "Monza", slug: "monza", region: "Lombardia", desc: "Brianza produttiva: capannoni, residenziale di pregio e SAL settimanali" },
  { name: "Varese", slug: "varese", region: "Lombardia", desc: "Clienti italo-svizzeri, cantieri prealpini e gestione frontalieri" },
  { name: "Treviso", slug: "treviso", region: "Veneto", desc: "Distretti vinicoli, rustici sotto vincolo e capannoni industriali" },
  { name: "Latina", slug: "latina", region: "Lazio", desc: "Agro pontino, edilizia industriale e residenziale in espansione" },
  { name: "Pisa", slug: "pisa", region: "Toscana", desc: "Restauro storico, edilizia universitaria e cantieri della costa toscana" },
];

const baseUrl = "https://www.ediliziaincloud.com";

const CORE_MODULES = [
  {
    title: "Gestione cantieri",
    href: "/funzionalita/gestione-cantieri/",
    desc: "Commesse, fasi, squadre, avanzamento lavori e documenti sempre collegati al cantiere.",
    icon: HardHat,
  },
  {
    title: "Preventivi edilizia",
    href: "/funzionalita/preventivi-edilizia/",
    desc: "Preventivi, computi, prezziari, firma digitale e accettazione cliente senza doppio inserimento.",
    icon: ClipboardList,
  },
  {
    title: "Fatturazione SDI",
    href: "/funzionalita/fatturazione-elettronica/",
    desc: "Fatture elettroniche B2B e PA collegate a cantieri, SAL, scadenze e margini reali.",
    icon: Receipt,
  },
  {
    title: "App cantiere mobile",
    href: "/funzionalita/app-cantiere-mobile/",
    desc: "Foto, rapportini, presenze e aggiornamenti lavori da smartphone, anche con connessione instabile.",
    icon: Smartphone,
  },
  {
    title: "Magazzino cantiere",
    href: "/funzionalita/magazzino-cantiere/",
    desc: "Materiali, DDT, carichi, scarichi e giacenze tracciati per commessa e fornitore.",
    icon: Warehouse,
  },
  {
    title: "Margini cantiere",
    href: "/funzionalita/margini-cantiere/",
    desc: "Preventivo vs consuntivo, costi manodopera, materiali e subappalti sempre sotto controllo.",
    icon: TrendingUp,
  },
  {
    title: "Presenze e personale",
    href: "/funzionalita/timbrature-gps/",
    desc: "Timbrature con GPS che diventano costo orario sul cantiere giusto, Cassa Edile e cedolini.",
    icon: Users,
  },
  {
    title: "Subappalti e DURC",
    href: "/funzionalita/gestione-subappalti/",
    desc: "DURC, POS e polizze controllati prima di pagare, con avvisi automatici sulle scadenze.",
    icon: FileCheck2,
  },
  {
    title: "CRM per imprese edili",
    href: "/funzionalita/crm-edilizia/",
    desc: "Richieste, preventivi e follow-up in un unico posto: nessuna trattativa dimenticata.",
    icon: Handshake,
  },
];

// Ordini di grandezza che incontriamo quando un'impresa migra da un
// gestionale installato: variano per fornitore, ma la struttura dei costi
// è sempre questa. Non sono listini: sono le voci da farsi scrivere.
const CLOUD_VS_INSTALLATO = [
  {
    voce: "Licenza iniziale",
    installato: "Una tantum, tipicamente da qualche migliaio di euro a oltre diecimila per una PMI, per postazione o per modulo",
    cloud: "Nessuna: si paga il canone",
  },
  {
    voce: "Canone annuo",
    installato: "Manutenzione e aggiornamenti, di solito il 15-20% della licenza ogni anno",
    cloud: "Canone mensile o annuale, tutto incluso: in questa fascia di mercato da 0 a poche centinaia di euro al mese",
  },
  {
    voce: "Server, PC e backup",
    installato: "A tuo carico: un server o un PC dedicato, i backup, l'antivirus, chi li tiene in piedi",
    cloud: "Inclusi: dati nel data center del fornitore, backup automatici, nessun hardware da comprare",
  },
  {
    voce: "Aggiornamenti normativi (SDI, IVA, CCNL)",
    installato: "Da installare, a volte a pagamento, spesso con fermo del lavoro",
    cloud: "Arrivano da soli, per tutti, senza fermare nessuno",
  },
  {
    voce: "Accesso dal cantiere",
    installato: "Dall'ufficio, o con connessioni remote da configurare; il telefono raramente è previsto",
    cloud: "Da qualsiasi telefono, tablet o PC con un browser; l'app lavora anche senza rete",
  },
  {
    voce: "Utenti in più",
    installato: "Nuova postazione o nuova licenza",
    cloud: "Dipende dal fornitore: con Edilizia in Cloud sono illimitati, altri fanno pagare per utente",
  },
  {
    voce: "Uscita",
    installato: "I dati sono sul tuo server: li hai, ma in un formato che spesso legge solo quel programma",
    cloud: "Chiedi sempre l'esportazione completa: un fornitore serio te la dà in qualsiasi momento",
  },
];

const FAQS = [
  {
    q: "Cos'è un software gestionale per l'edilizia?",
    a: "È il programma che amministra l'impresa edile intera, dal preventivo al saldo: preventivi e computi, commesse con il loro margine, cantiere (rapportini, presenze, foto, DDT), fatturazione elettronica verso SDI, subappalti e scadenze. Si distingue da un software di contabilità generica, che non conosce il cantiere, da un software di computo come PriMus, che produce computi e SAL ma non amministra l'impresa, e da un'app di documentazione di cantiere, che non fattura e non calcola margini.",
  },
  {
    q: "Cosa cambia tra un gestionale edilizia cloud e uno installato?",
    a: "Con un gestionale installato compri una licenza, la installi su un PC o un server della tua impresa e paghi ogni anno la manutenzione; server, backup e aggiornamenti sono a tuo carico e dal cantiere di solito non ci arrivi. Con un gestionale cloud paghi un canone che include tutto, i dati stanno nel data center del fornitore con backup automatici, gli aggiornamenti normativi arrivano da soli e ci entri da qualsiasi telefono o PC. Per una PMI edile il cloud costa meno nei primi anni e soprattutto porta il cantiere dentro il flusso.",
  },
  {
    q: "Quanto costa un software gestionale edilizia cloud?",
    a: "A settembre 2026 i prezzi pubblici nel mercato italiano vanno da zero a poche centinaia di euro al mese per azienda, oppure da alcune decine a oltre cento euro per utente al mese nei prodotti che fanno pagare a persona. Edilizia in Cloud parte da un piano gratuito per sempre, il piano Scopri, e definisce i piani superiori in una consulenza gratuita dopo 31 giorni di prova con setup e migrazione dati inclusi. Il confronto con i prezzi degli altri produttori è nell'articolo sui migliori software gestionali per l'edilizia.",
  },
  {
    q: "Un gestionale edile sostituisce il commercialista o il software di fatturazione?",
    a: "Il software di fatturazione sì, quando la fatturazione elettronica è nativa: le fatture partono verso SDI dal gestionale, collegate alla commessa, con reverse charge e split payment già gestiti. Il commercialista no: continua a fare bilancio, dichiarazioni e paghe, ma riceve dati ordinati invece di scatoloni di fatture, e con il portale dedicato può entrare da solo a leggere quello che gli serve.",
  },
  {
    q: "Quanto tempo serve per partire con un gestionale edilizia cloud?",
    a: "Con Edilizia in Cloud la configurazione si fa insieme in 48 ore: listino, anagrafiche e commesse aperte vengono importati durante il setup incluso nella prova. Il primo rapportino dal telefono si fa il giorno stesso; il primo margine di commessa si legge appena la squadra ha timbrato una settimana. Il tempo vero non è quello tecnico, è quello dell'abitudine: per questo la prova dura 31 giorni e non 7.",
  },
];

export default function CityHub() {
  useSEO({
    title: "Software Gestionale Edilizia Cloud: Guida e Confronto 2026",
    description:
      "Cos'è un software gestionale edilizia cloud, cosa deve fare per un'impresa edile, quanto costa rispetto a uno installato e come sceglierlo. Guida 2026.",
    canonical: "/software-gestionale-edilizia",
    keywords:
      "software gestionale edilizia, gestionale edilizia cloud, software imprese edili, software gestione cantieri, gestionale cantieri, software edilizia cloud, gestionale edilizia Italia",
  });

  const itemListElements = CITIES.map((city, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "name": `Software Gestionale Edilizia ${city.name}`,
    "url": `${baseUrl}/software-gestionale-edilizia-${city.slug}`,
    "description": city.desc,
  }));

  const coreModuleElements = CORE_MODULES.map((module, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "name": module.title,
    "url": `${baseUrl}${module.href}`,
    "description": module.desc,
  }));

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Software Gestionale Edilizia Cloud", "item": `${baseUrl}/software-gestionale-edilizia` },
        ]
      }} />
      <JsonLd id="jsonld-itemlist-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Software Gestionale Edilizia — Copertura Geografica",
        "description": `Edilizia in Cloud disponibile in ${CITIES.length} città italiane con supporto e onboarding locale`,
        "url": `${baseUrl}/software-gestionale-edilizia`,
        "numberOfItems": CITIES.length,
        "itemListElement": itemListElements,
      }} />
      <JsonLd id="jsonld-core-modules-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Moduli principali del software gestionale edilizia",
        "description": "Funzionalità core per gestire cantieri, preventivi, fatturazione, magazzino, app mobile, margini, personale, subappalti e CRM.",
        "url": `${baseUrl}/software-gestionale-edilizia`,
        "numberOfItems": CORE_MODULES.length,
        "itemListElement": coreModuleElements,
      }} />
      <JsonLd id="jsonld-webpage-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Software Gestionale Edilizia Cloud: Guida e Confronto 2026",
        "description": "Cos'è un software gestionale edilizia cloud, cosa deve fare per un'impresa edile, quanto costa rispetto a un programma installato e come sceglierlo.",
        "url": `${baseUrl}/software-gestionale-edilizia`,
        "inLanguage": "it",
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
            { "@type": "ListItem", "position": 2, "name": "Software Gestionale Edilizia Cloud", "item": `${baseUrl}/software-gestionale-edilizia` },
          ]
        }
      }} />
      <JsonLd id="jsonld-faq-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": FAQS.map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a },
        })),
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="py-16 bg-gradient-to-b from-[#FFF7F0] to-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#F97415]/10 text-[#F97415] px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <MapPin className="h-4 w-4" />
            Guida 2026 — copertura nazionale, {CITIES.length} città
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[#111111] mb-6 leading-tight">
            Software Gestionale Edilizia Cloud<br />
            <span className="text-[#F97415]">per imprese edili italiane</span>
          </h1>
          <p className="text-xl text-[#111111]/60 mb-8 max-w-2xl mx-auto">
            Cos'è un gestionale edile, cosa deve fare davvero, quanto costa rispetto a un programma installato e come si sceglie senza pentirsene. E in fondo, la pagina della tua città.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/demo/"
              className="inline-flex items-center gap-2 bg-[#F97415] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-[#e8650f] transition-colors"
            >
              Richiedi Demo Gratuita
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/prezzi/"
              className="inline-flex items-center gap-2 border-2 border-gray-200 text-[#111111] px-8 py-4 rounded-xl font-bold text-lg hover:border-[#F97415] hover:text-[#F97415] transition-colors"
            >
              Vedi i Prezzi
            </Link>
          </div>
        </div>
      </section>

      {/* Cos'è (e cosa non è) */}
      <section className="py-14 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-[#111111] mb-5">
            Cos'è un software gestionale per l'edilizia (e cosa non è)
          </h2>
          <div className="space-y-4 text-[#111111]/75 leading-relaxed">
            <p>
              Un software gestionale per l'edilizia è il programma che segue il lavoro dell'impresa dall'inizio alla fine:
              la richiesta del cliente diventa preventivo, il preventivo diventa commessa, la commessa produce rapportini,
              presenze, DDT e stati di avanzamento, e alla fine fatture e incassi. Ogni dato si inserisce una volta sola e
              segue il cantiere fino al saldo. Il risultato che conta è uno: sapere <strong>stasera</strong>, non a fine
              anno, se il cantiere di via Roma sta guadagnando.
            </p>
            <p>
              «Cloud» vuol dire che il programma non è installato su un PC in ufficio: gira nel data center del fornitore e
              ci entri da qualsiasi telefono, tablet o computer con un browser. Per un'impresa edile non è un dettaglio
              tecnico. È la differenza tra un capocantiere che compila il rapportino dal telefono in due minuti e un
              capocantiere che lo scrive su un foglio e lo porta in ufficio il venerdì.
            </p>
            <p>
              Tre cose che un gestionale edile <strong>non</strong> è, e che vengono confuse ogni giorno:
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            {[
              {
                title: "Non è un programma di fatturazione",
                desc: "Un software di fatturazione generico emette fatture ma non sa cos'è una commessa: non collega la fattura al cantiere, non conosce reverse charge e split payment, non ti dice il margine.",
                href: "/confronto/vs-excel/",
                label: "Il confronto con Excel e i programmi generici",
              },
              {
                title: "Non è un software di computo",
                desc: "PriMus e simili producono computi metrici e contabilità lavori a norma, indispensabili negli appalti. Ma non amministrano l'impresa: niente SDI, presenze, subappalti o margine reale.",
                href: "/confronto/vs-primus/",
                label: "Dove finisce PriMus e dove comincia il gestionale",
              },
              {
                title: "Non è un'app di difetti e ispezioni",
                desc: "Le app di documentazione di cantiere fotografano, segnalano e archiviano benissimo. Non fatturano, non fanno preventivi e non calcolano margini: affiancano il gestionale, non lo sostituiscono.",
                href: "/blog/migliori-software-gestionali-edilizia-confronto/",
                label: "Gli 8 software a confronto, con prezzi",
              },
            ].map((item) => (
              <div key={item.title} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col">
                <h3 className="font-bold text-[#111111] mb-2">{item.title}</h3>
                <p className="text-sm text-[#111111]/60 leading-relaxed flex-1">{item.desc}</p>
                <Link to={item.href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#F97415] hover:gap-2 transition-all">
                  {item.label} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Moduli core */}
      <section className="py-14 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <h2 className="text-3xl font-bold text-[#111111] mb-3">
              Cosa deve fare un software gestionale edilizia
            </h2>
            <p className="text-[#111111]/60 leading-relaxed">
              Nove aree, una sola base dati. Se una di queste vive in un altro programma, prima o poi qualcuno ricopia un numero a mano — ed è lì che il margine sparisce.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CORE_MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  to={module.href}
                  className="group rounded-lg border border-gray-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[#F97415] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97415] focus-visible:ring-offset-2"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#F97415]/10 text-[#F97415] transition-colors group-hover:bg-[#F97415] group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-[#111111] transition-colors group-hover:text-[#F97415]">
                      {module.title}
                    </h3>
                    <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-[#F97415]" />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#111111]/60">{module.desc}</p>
                </Link>
              );
            })}
          </div>
          <p className="text-center text-sm text-[#111111]/50 mt-8">
            Tutte le funzionalità, modulo per modulo, sono nella{" "}
            <Link to="/funzionalita/" className="font-semibold text-[#F97415] hover:underline">pagina delle funzionalità</Link>.
          </p>
        </div>
      </section>

      {/* Cloud vs installato */}
      <section className="py-14 bg-gray-50 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-[#111111] mb-4">
            Cloud o installato: i costi veri, voce per voce
          </h2>
          <p className="text-[#111111]/70 leading-relaxed max-w-3xl mb-3">
            La domanda giusta non è «quanto costa la licenza» ma «quanto mi costa in tre anni, con tutte le persone dentro».
            Un gestionale installato sembra più economico il primo giorno e lo diventa sempre meno: manutenzione annua,
            server, backup, aggiornamenti normativi da installare, e il cantiere che resta fuori. Un gestionale cloud si
            paga a canone e include tutto il resto.
          </p>
          <p className="text-sm text-[#111111]/50 mb-6 max-w-3xl">
            Gli ordini di grandezza qui sotto sono quelli che incontriamo quando un'impresa migra da un gestionale
            installato: variano per fornitore, ma la struttura dei costi è sempre questa. Usali come lista di voci da
            farti scrivere in ogni preventivo.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111] text-white text-left">
                  <th className="px-4 py-3 font-semibold">Voce di costo</th>
                  <th className="px-4 py-3 font-semibold">Gestionale installato</th>
                  <th className="px-4 py-3 font-semibold">Gestionale cloud</th>
                </tr>
              </thead>
              <tbody>
                {CLOUD_VS_INSTALLATO.map((r, i) => (
                  <tr key={r.voce} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 font-semibold text-[#111111] align-top whitespace-nowrap">{r.voce}</td>
                    <td className="px-4 py-3 text-[#111111]/70 align-top">{r.installato}</td>
                    <td className="px-4 py-3 text-[#111111]/70 align-top">{r.cloud}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h3 className="font-bold text-[#111111] mb-2">Quando l'installato ha ancora senso</h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                Se per policy i dati devono restare fisicamente in sede, se hai già un reparto IT che tiene in piedi un
                server, o se lavori con una suite enterprise che esiste solo in quella forma. Sono casi reali, ma rari
                sotto i cinquanta dipendenti.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h3 className="font-bold text-[#111111] mb-2">Quanto costa Edilizia in Cloud</h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                Si parte dal piano Scopri, gratis per sempre fino a tre commesse attive. I piani Gestionale, Professionista
                e Impresa AI si provano per 31 giorni con setup e migrazione dati inclusi, senza carta di credito, e il
                preventivo si definisce in una consulenza gratuita. Gli utenti sono sempre illimitati.{" "}
                <Link to="/prezzi/" className="font-semibold text-[#F97415] hover:underline">Vedi i piani</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Come scegliere */}
      <section className="py-14 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-[#111111] mb-5">
            Come scegliere: le cinque domande che decidono
          </h2>
          <p className="text-[#111111]/70 leading-relaxed mb-6">
            Il gestionale non fallisce quasi mai per una funzione mancante. Fallisce perché la squadra non lo usa. Per
            questo le domande da fare in demo riguardano le persone prima dei moduli.
          </p>
          <ol className="space-y-4">
            {[
              {
                t: "Il capocantiere lo usa dal telefono in meno di un minuto?",
                d: "Fattelo fare in demo: un rapportino con foto, una presenza, senza corso. Se serve una giornata di formazione per un rapportino, hai già perso.",
              },
              {
                t: "Il margine si aggiorna mentre il cantiere è aperto?",
                d: "Ore, materiali, subappalti e varianti devono muovere il margine oggi, non a consuntivo tre mesi dopo. Fai due conti prima della demo con il calcolatore del margine di commessa.",
                href: "/strumenti/calcolatore-margine-commessa/",
                label: "Calcolatore del margine di commessa",
              },
              {
                t: "Dal preventivo alla fattura ricopi qualcosa?",
                d: "Il preventivo deve diventare commessa, la commessa SAL e fattura verso SDI, con reverse charge e split payment già gestiti. Ogni ricopiatura è un errore che aspetta.",
              },
              {
                t: "Quanto costa il primo anno con tutte le persone dentro?",
                d: "Prezzo per azienda o per utente, implementazione, formazione, esportazione dei dati quando vuoi andartene. Fattelo scrivere.",
                href: "/blog/quanto-costa-gestionale-impresa-edile/",
                label: "Quanto costa un gestionale per impresa edile",
              },
              {
                t: "Chi ti aiuta a leggere i numeri, non solo a cliccare?",
                d: "Assistenza in italiano con tempi dichiarati, e qualcuno che dopo il primo mese ti dice cosa raccontano i margini. Le opinioni di chi lo usa contano più della brochure.",
                href: "/blog/gestionale-edilizia-opinioni/",
                label: "Gestionale edilizia: le opinioni di chi lo usa",
              },
            ].map((q, i) => (
              <li key={q.t} className="flex gap-4">
                <span className="flex-shrink-0 h-8 w-8 rounded-full bg-[#F97415]/10 text-[#F97415] font-bold flex items-center justify-center text-sm">{i + 1}</span>
                <div>
                  <h3 className="font-bold text-[#111111]">{q.t}</h3>
                  <p className="text-sm text-[#111111]/60 leading-relaxed mt-1">{q.d}</p>
                  {q.href && (
                    <Link to={q.href} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#F97415] hover:gap-2 transition-all">
                      {q.label} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-2xl border border-[#F97415]/30 bg-[#FFF7F0] p-6">
            <p className="text-sm text-[#111111]/70 leading-relaxed">
              Vuoi i nomi? Nel confronto dei{" "}
              <Link to="/blog/migliori-software-gestionali-edilizia-confronto/" className="font-semibold text-[#F97415] hover:underline">
                migliori software gestionali per l'edilizia
              </Link>{" "}
              trovi otto prodotti con pro, contro, matrice delle funzioni, prezzi pubblici a settembre 2026 e la checklist da portare in demo. La guida su{" "}
              <Link to="/blog/come-scegliere-software-gestionale-edilizia/" className="font-semibold text-[#F97415] hover:underline">
                come scegliere il software gestionale
              </Link>{" "}
              spiega le dieci domande da fare a ogni fornitore.
            </p>
          </div>
        </div>
      </section>

      {/* Perché locale */}
      <section className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center text-[#111111] mb-8">Perché il supporto locale fa la differenza</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Mercato locale",
                desc: "Ogni provincia ha le sue specificità: prezzi dei materiali, normative regionali, Cassa Edile territoriale. Il nostro team conosce il mercato della tua città.",
              },
              {
                title: "Onboarding personalizzato",
                desc: "Configuriamo il software in base alla tipologia di lavori dominante nella tua area — ristrutturazioni, nuove costruzioni, appalti pubblici locali o subappalti.",
              },
              {
                title: "Supporto in italiano",
                desc: "Telefono, email, WhatsApp. Rispondiamo entro 2 ore in orario lavorativo. Nessun call center estero, nessun bot: persone reali che capiscono l'edilizia.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <CheckCircle className="h-6 w-6 text-[#F97415] mb-3" />
                <h3 className="font-bold text-[#111111] mb-2">{item.title}</h3>
                <p className="text-sm text-[#111111]/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cities grid */}
      <section className="py-16 bg-gray-50 border-t border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-[#111111] mb-3">
            Software gestionale edilizia nella tua città
          </h2>
          <p className="text-center text-[#111111]/50 mb-10">
            {CITIES.length} pagine dedicate con contesto locale, prezzario regionale, testimonianze e domande frequenti per ogni mercato
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CITIES.map((city) => (
              <Link
                key={city.slug}
                to={`/software-gestionale-edilizia-${city.slug}/`}
                className="group bg-white rounded-2xl p-5 border border-gray-200 hover:border-[#F97415] hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-[#111111] group-hover:text-[#F97415] transition-colors">
                      {city.name}
                    </h3>
                    <span className="text-xs text-[#111111]/40 font-medium">{city.region}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#F97415] transition-colors mt-1 flex-shrink-0" />
                </div>
                <p className="text-sm text-[#111111]/60 leading-relaxed">{city.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-[#111111] mb-8">Domande frequenti sul gestionale edilizia cloud</h2>
          <div className="space-y-6">
            {FAQS.map((f) => (
              <div key={f.q} className="border-b border-gray-100 pb-6">
                <h3 className="font-bold text-[#111111] mb-2">{f.q}</h3>
                <p className="text-sm text-[#111111]/65 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#111111] mb-4">
            Non trovi la tua città?
          </h2>
          <p className="text-lg text-[#111111]/60 mb-8">
            Edilizia in Cloud funziona in tutta Italia. Abbiamo pagine dedicate per {CITIES.length} città ma serviamo imprese in ogni provincia. Contattaci e ti mostriamo come il software si adatta al tuo mercato locale.
          </p>
          <Link
            to="/demo/"
            className="inline-flex items-center gap-2 bg-[#F97415] text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-[#e8650f] transition-colors"
          >
            Parla con un Consulente
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
