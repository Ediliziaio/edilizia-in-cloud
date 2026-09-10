import { Link, useParams, useLocation, Navigate } from "react-router-dom";
import { prioritaCaricamento } from "@/lib/immagini/prioritaCaricamento";
import { ArrowRight, CheckCircle2, Star, MapPin, Phone } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";

// ── Config per ogni città ─────────────────────────────────────────────────────
interface CityConfig {
  name: string;           // "Milano"
  region: string;         // "Lombardia"
  slug: string;           // "milano"
  province: string;       // "MI"
  lat: number;
  lon: number;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string;
  localStats: { value: string; label: string }[];
  localTestimonial: {
    quote: string;
    author: string;
    company: string;
    city: string;
    initials: string;
  };
  localProblems: { emoji: string; title: string; desc: string }[];
  relatedCities: Array<{ name: string; slug: string }>;
  // SEO 2026-05-26: contenuto city-specific aggiuntivo per uscire dal cluster
  // "Scansionata ma non indicizzata" (Google la vedeva come thin duplicate).
  // Quando questi campi sono presenti, il template renderizza due nuove sezioni
  // (Contesto locale + FAQ) che spostano la pagina sopra il 60% di unicità.
  localContext?: {
    heading: string;         // "Edilizia a Udine: contesto e prezzario locale"
    body: string;            // 2-3 frasi su territorio, normativa, prezzario regionale
    prezzarioLink?: string;  // URL al prezzario regionale ufficiale
    prezzarioLabel?: string; // "Prezzario Regione FVG 2026"
  };
  localFaqs?: { q: string; a: string }[];
}

const CITY_CONFIGS: Record<string, CityConfig> = {
  milano: {
    name: "Milano",
    region: "Lombardia",
    slug: "milano",
    province: "MI",
    lat: 45.4642,
    lon: 9.1900,
    heroTitle: "Gestionale Edilizia per Imprese di Milano",
    heroSubtitle:
      "Il software gestionale per imprese edili milanesi: controllo cantieri in tempo reale, margini per commessa, fatturazione elettronica e gestione squadre. Oltre 40 imprese edili lombarde già lo usano.",
    heroImage: "/hero/stock/cantiere-1504307651254-1400.webp",
    localStats: [
      { value: "40+", label: "Imprese edili milanesi attive" },
      { value: "€ 8.2M", label: "Fatturato gestito al mese in Lombardia" },
      { value: "28%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti lombardi" },
    ],
    localTestimonial: {
      quote:
        "A Milano i tempi sono serrati e i margini stretti. Con Edilizia in Cloud so in tempo reale quanto guadagno su ogni cantiere aperto — non lo scopro solo a fine lavori. Ho smesso di usare 5 Excel diversi.",
      author: "Marco P.",
      company: "MP Costruzioni Srl",
      city: "Milano",
      initials: "MP",
    },
    localProblems: [
      {
        emoji: "🏙️",
        title: "Cantieri in zone ZTL e con accesso limitato",
        desc: "Logistica complessa, orari di consegna rigidi, permessi SUAP. Il coordinamento con fornitori e squadre richiede un sistema centralizzato — non WhatsApp e telefonate.",
      },
      {
        emoji: "💼",
        title: "Gare d'appalto private sempre più competitive",
        desc: "I developer e i general contractor milanesi richiedono reportistica dettagliata, SAL puntuali e documentazione digitale. Le imprese senza software faticano a competere.",
      },
      {
        emoji: "👷",
        title: "Manodopera specializzata scarsa e costosa",
        desc: "In Lombardia il costo del lavoro è tra i più alti d'Italia. Ogni ora non imputata alla commessa è margine perso. Il tracciamento presenze in cantiere non è più opzionale.",
      },
    ],
    relatedCities: [
      { name: "Roma", slug: "roma" },
      { name: "Torino", slug: "torino" },
      { name: "Bologna", slug: "bologna" },
    ],
    localContext: {
      heading: "Edilizia a Milano: prezzario regionale, ZTL cantieri e requisiti del committente lombardo",
      body: "Il prezzario Regione Lombardia è il riferimento più consultato d'Italia per opere edili: aggiornato dalla Regione Lombardia entro gennaio di ogni anno, include circa 28.000 voci suddivise in opere edili, impianti, urbanizzazioni e sicurezza. A Milano le complicazioni operative tipiche sono la logistica nelle Zone a Traffico Limitato (Area B e Area C), le richieste documentali stringenti dei general contractor (developer immobiliari, fondi, costruttori vetrina) e il costo della manodopera fra i più alti d'Italia. Il controllo margini per commessa è critico — un cantiere milanese che sfora del 5% può erodere l'intero utile aziendale dell'anno.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro in cantiere Area B di Milano: come gestisco i permessi e la logistica fornitori?",
        a: "Edilizia in Cloud gestisce centralmente ordini fornitori e date di consegna programmate, così pianifichi le finestre di accesso ZTL/Area B/Area C dei mezzi senza confusione fra WhatsApp e Excel. Il calendario lavori mostra i conflitti potenziali fra cantieri attivi e ottimizza la rotazione delle squadre.",
      },
      {
        q: "Il sistema importa il prezzario Regione Lombardia aggiornato 2026?",
        a: "Sì. Il prezzario regionale Lombardia 2026 (versione di gennaio) è importabile in formato Excel ufficiale. Le voci restano indicizzate con codice, descrizione e prezzo: quando lavori a un nuovo preventivo Milano, cerchi 'intonaco premiscelato' o 'guaina ardesiata' e selezioni la voce esatta in pochi secondi.",
      },
      {
        q: "I miei committenti milanesi chiedono SAL puntuali e fatturazione elettronica: il software li gestisce?",
        a: "Sì, nativamente. La fatturazione elettronica SDI è completamente integrata (TD01, TD24 per acconti SAL, note di credito TD04). I SAL parziali sono generati dal sistema con riferimento al CME originale, includendo varianti approvate e ritenute di garanzia.",
      },
      {
        q: "Quante imprese edili milanesi usano Edilizia in Cloud?",
        a: "Oltre 40 imprese edili lombarde attive sulla piattaforma, di cui la maggioranza concentrata fra Milano città, hinterland (Monza, Sesto, Cinisello) e provincia di Bergamo. Tipologia: ristrutturazioni residenziali, gare private con developer, opere di urbanizzazione comunale.",
      },
    ],
  },

  roma: {
    name: "Roma",
    region: "Lazio",
    slug: "roma",
    province: "RM",
    lat: 41.9028,
    lon: 12.4964,
    heroTitle: "Gestionale Edilizia per Imprese di Roma",
    heroSubtitle:
      "Software per imprese edili romane: gestione cantieri, margini in tempo reale, SAL e fatturazione elettronica. Già usato da oltre 30 imprese edili nel Lazio.",
    heroImage: "/hero/stock/cantiere-1541888946425-1400.webp",
    localStats: [
      { value: "30+", label: "Imprese edili laziali attive" },
      { value: "€ 5.1M", label: "Fatturato gestito al mese nel Lazio" },
      { value: "24%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti laziali" },
    ],
    localTestimonial: {
      quote:
        "Roma è un mercato complicato: lavori pubblici, ristrutturazioni storiche, burocrazia lenta. Con Edilizia in Cloud ho finalmente il controllo su ogni cantiere senza perdere ore in riunioni e report manuali.",
      author: "Luca B.",
      company: "Costruzioni Belli Srl",
      city: "Roma",
      initials: "LB",
    },
    localProblems: [
      {
        emoji: "🏛️",
        title: "Vincoli storico-artistici e burocrazia comunale",
        desc: "Ristrutturazioni in zone vincolate, permessi SCIA e varianti in corso d'opera sono la norma a Roma. Serve un sistema per tracciare tutta la documentazione digitalmente.",
      },
      {
        emoji: "📋",
        title: "Appalti pubblici con rendicontazione rigorosa",
        desc: "Il Comune di Roma e la Regione Lazio richiedono SAL certificati, DURC aggiornati e reportistica puntuale. Le imprese che gestiscono tutto su carta perdono gare e pagamenti.",
      },
      {
        emoji: "🚗",
        title: "Squadre distribuite su tutta la provincia",
        desc: "Cantieri da Ostia a Frascati, da Fiumicino a Tivoli. Coordinare squadre su una provincia vasta senza un'app mobile significa telefonate continue e avanzamenti sempre in ritardo.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Torino", slug: "torino" },
      { name: "Napoli", slug: "napoli" },
    ],
    localContext: {
      heading: "Edilizia a Roma: vincoli archeologici, condominio storico e prezzario Regione Lazio",
      body: "Operare in edilizia a Roma significa convivere con vincoli specifici che non esistono altrove: la sovrintendenza archeologica per gli scavi anche in zone non centrali, le particolarità del condominio nei palazzi storici di Prati, Trastevere o Monteverde (delibere assembleari spesso lunghe), e la varietà territoriale fra Roma centro, GRA, Castelli Romani e Litorale Pontino. Il prezzario Regione Lazio è il riferimento ufficiale per i lavori pubblici nel Lazio, aggiornato dalla Regione con cadenza annuale e disponibile in formato PDF dal portale ufficiale. Per i lavori privati, le imprese romane usano spesso un mix di prezzario Lazio + prezzario DEI per voci specifiche.",
      prezzarioLink: "https://www.regione.lazio.it/cittadini/lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Lazio (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "I miei cantieri sono distribuiti fra Roma centro, GRA e Castelli: l'app coordina davvero le squadre a distanza?",
        a: "Sì. Il capocantiere o caposquadra ha l'app mobile con timbrature geolocalizzate (verifica automatica della posizione vs cantiere assegnato), foto giornaliere, registrazione avanzamento lavori. Il titolare in ufficio vede in tempo reale dove sono uomini, mezzi e materiali senza dover chiamare 8 volte al giorno.",
      },
      {
        q: "Posso importare il prezzario Regione Lazio dentro Edilizia in Cloud?",
        a: "Sì. Il prezzario Regione Lazio aggiornato (versione vigente) si importa in Excel o PDF. Tutte le voci vengono indicizzate per ricerca rapida: digiti 'demolizione tramezzi', il sistema ti mostra le voci 02.A02.x del prezzario con prezzi unitari corretti per Roma e provincia.",
      },
      {
        q: "Lavoro su ristrutturazioni in condomini storici di Roma: il sistema gestisce documenti del committente comunione?",
        a: "Sì. Edilizia in Cloud ha un portale clienti dedicato dove l'amministratore del condominio o il committente vede SAL, fotografie giornaliere, fatture e documentazione tecnica. Riduce drasticamente le richieste informali via WhatsApp del tipo 'a che punto siete?'.",
      },
      {
        q: "Per i lavori in zona archeologica devo gestire pratiche con la Sovrintendenza: posso allegare i documenti al cantiere?",
        a: "Sì. Ogni cantiere ha un'area documentale dove archivi autorizzazioni Sovrintendenza, comunicazioni con il Comune, perizie geologiche, varianti urbanistiche. Tutto resta collegato alla commessa e accessibile anche durante un'eventuale ispezione.",
      },
    ],
  },

  torino: {
    name: "Torino",
    region: "Piemonte",
    slug: "torino",
    province: "TO",
    lat: 45.0703,
    lon: 7.6869,
    heroTitle: "Gestionale Edilizia per Imprese di Torino",
    heroSubtitle:
      "Software gestionale per imprese edili torinesi e piemontesi: controllo margini, gestione cantieri e fatturazione elettronica. Già scelto da imprese edili in tutto il Piemonte.",
    heroImage: "/hero/stock/cantiere-1621905251189-1400.webp",
    localStats: [
      { value: "20+", label: "Imprese edili piemontesi attive" },
      { value: "€ 2.8M", label: "Fatturato gestito al mese in Piemonte" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti piemontesi" },
    ],
    localTestimonial: {
      quote:
        "A Torino il mercato edile è molto competitivo e i clienti sono esigenti. Edilizia in Cloud mi ha permesso di vincere più gare perché riesco a fare preventivi più precisi e a dimostrare che ho il controllo dei costi.",
      author: "Paolo R.",
      company: "Rossi Costruzioni Srl",
      city: "Torino",
      initials: "PR",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Riqualificazione di aree industriali dismesse",
        desc: "Torino ha un grande mercato di riconversione di ex-fabbriche e aree industriali. Questi cantieri richiedono una gestione attenta di subappaltatori specializzati e computi metrici complessi.",
      },
      {
        emoji: "❄️",
        title: "Stagionalità e stop invernali frequenti",
        desc: "In Piemonte le condizioni meteo impattano i cantieri da novembre a marzo. Pianificare i flussi di cassa e i SAL attorno agli stop stagionali è critico per la sopravvivenza dell'impresa.",
      },
      {
        emoji: "🏔️",
        title: "Cantieri in zone alpine e sub-alpine",
        desc: "Molte imprese torinesi lavorano in montagna: accessi difficili, logistica complessa, squadre distanti. L'app mobile offline di Edilizia in Cloud funziona anche senza connessione.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Roma", slug: "roma" },
      { name: "Napoli", slug: "napoli" },
    ],
    localContext: {
      heading: "Edilizia a Torino e in Piemonte: riconversione industriale, stagionalità invernale e prezzario regionale",
      body: "Il tessuto edile piemontese ha un mix particolare: grande mercato di riqualificazione di aree industriali dismesse (l'eredità Fiat e Indesit), cantieri pedemontani e alpini (Val di Susa, Sestriere, Cuneese) con stop stagionali da novembre a marzo, e una rete di subappaltatori specialistici fortemente concentrata fra Torino città, cintura industriale (Moncalieri, Settimo, Rivoli) e il Canavese. Il prezzario Regione Piemonte è il riferimento per le opere pubbliche, aggiornato in genere a febbraio di ogni anno. La pianificazione della liquidità attorno agli stop invernali è una competenza specifica delle imprese edili piemontesi.",
      prezzarioLink: "https://www.regione.piemonte.it/web/temi/sviluppo/lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Piemonte (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su riqualificazione di un ex-stabilimento industriale: il software gestisce subappaltatori specialistici complessi?",
        a: "Sì. Le commesse di riconversione industriale richiedono spesso 8-15 subappaltatori specializzati (demolitori, bonifiche, strutturali, impianti). Edilizia in Cloud traccia per ciascuno: contratto, SAL, ritenute di garanzia 0,5%, scadenze pagamento, documentazione DURC e ANTIMAFIA.",
      },
      {
        q: "Posso pianificare i flussi di cassa tenendo conto dello stop invernale dei cantieri pedemontani?",
        a: "Sì. La previsione liquidità a 30-60-90 giorni include la stagionalità: indichi i mesi di blocco operativo per cantieri montani e il sistema modella le entrate SAL e le uscite manodopera/fornitori di conseguenza. Riduce drasticamente il rischio di crisi di liquidità a febbraio-marzo.",
      },
      {
        q: "L'app funziona davvero in cantiere in Val di Susa senza copertura?",
        a: "Sì. L'app mobile (iOS e Android) opera in modalità offline: timbrature, foto, registrazione avanzamento e materiali consumati vengono salvati localmente sul telefono del caposquadra e sincronizzati automaticamente appena torna il segnale a fondovalle.",
      },
      {
        q: "Posso importare il prezzario Regione Piemonte?",
        a: "Sì. Il prezzario opere pubbliche Regione Piemonte si importa in Excel o PDF. Le voci restano indicizzate e ricercabili, e quando la Regione pubblica l'aggiornamento annuale lo ri-importi senza perdere lo storico dei tuoi preventivi.",
      },
    ],
  },

  napoli: {
    name: "Napoli",
    region: "Campania",
    slug: "napoli",
    province: "NA",
    lat: 40.8518,
    lon: 14.2681,
    heroTitle: "Gestionale Edilizia per Imprese di Napoli",
    heroSubtitle:
      "Software gestionale per imprese edili napoletane e campane: gestione cantieri, margini reali, SAL e fatturazione elettronica. Già usato da imprese edili in tutta la Campania.",
    heroImage: "/hero/stock/cantiere-1504328345606-1400.webp",
    localStats: [
      { value: "25+", label: "Imprese edili campane attive" },
      { value: "€ 3.4M", label: "Fatturato gestito al mese in Campania" },
      { value: "26%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti campani" },
    ],
    localTestimonial: {
      quote:
        "A Napoli il mercato edile è vivace ma gestire più cantieri contemporaneamente senza un software è impossibile. Con Edilizia in Cloud ho il controllo su tutto, da qualsiasi posto mi trovi.",
      author: "Antonio F.",
      company: "Costruzioni Ferrara Srl",
      city: "Napoli",
      initials: "AF",
    },
    localProblems: [
      {
        emoji: "🏗️",
        title: "Cantieri multipli difficili da coordinare",
        desc: "Napoli e la sua area metropolitana offrono molte opportunità, ma gestire squadre su più cantieri contemporaneamente senza strumenti digitali significa perdere il controllo dei costi.",
      },
      {
        emoji: "📑",
        title: "Burocrazia e tempi comunali dilatati",
        desc: "Permessi, varianti e SCIA a Napoli richiedono una gestione documentale precisa. Senza un sistema centralizzato si rischia di perdere scadenze e bloccare i lavori.",
      },
      {
        emoji: "💰",
        title: "Liquidità e pagamenti ritardati",
        desc: "Il mercato campano soffre spesso di ritardi nei pagamenti, soprattutto negli appalti pubblici. Avere una previsione di cassa aggiornata è vitale per la sopravvivenza dell'impresa.",
      },
    ],
    relatedCities: [
      { name: "Roma", slug: "roma" },
      { name: "Palermo", slug: "palermo" },
      { name: "Milano", slug: "milano" },
    ],
    localContext: {
      heading: "Edilizia a Napoli e in Campania: territorio sismico, Superbonus residui e prezzario regionale",
      body: "Operare a Napoli e nella Campania impone attenzione a fattori specifici: classificazione sismica diffusa su gran parte del territorio (zona 2 nel napoletano, fino a zona 1 in Irpinia), grande mercato di interventi Sismabonus e Superbonus residui ancora attivi su pratiche aperte 2024-2025, e una vasta provincia che si estende da Napoli centro a Caserta, Salerno, Costiera Amalfitana e isole (Capri, Ischia, Procida) con logistica complessa. Il prezzario Regione Campania è il riferimento ufficiale per i lavori pubblici, aggiornato dalla Regione Campania con cadenza biennale. La gestione liquidità è critica per via dei ritardi tipici nei pagamenti della PA campana.",
      prezzarioLink: "https://www.regione.campania.it/regione/it/tematiche/lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Campania (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su pratiche Sismabonus e Superbonus residui: il software gestisce SAL e cessione del credito?",
        a: "Sì. Edilizia in Cloud traccia ogni pratica bonus fiscale dalla detrazione iniziale al SAL 30/60/100%, alle scadenze ENEA, alle asseverazioni del tecnico, fino alla cessione del credito o sconto in fattura. Tutto resta documentato per eventuali controlli Agenzia delle Entrate o ispezioni post-lavori.",
      },
      {
        q: "Posso importare il prezzario Regione Campania?",
        a: "Sì. Il prezzario Regione Campania si importa in Excel o PDF. Tutte le voci restano indicizzate per ricerca rapida. Vista la cadenza biennale degli aggiornamenti, il sistema notifica quando una voce di prezzario rischia di essere disallineata rispetto ai prezzi correnti di mercato.",
      },
      {
        q: "Ho cantieri a Ischia e Procida: come gestisco i fornitori e la logistica isole?",
        a: "Il sistema ordini fornitori traccia date di consegna, ferries, ritardi specifici dell'isola. Puoi marcare alcuni cantieri come 'logistica isola' e il sistema avvisa quando un fornitore propone date che cadono fra navette ridotte (festività, scioperi traghetti, maltempo).",
      },
      {
        q: "Vista la lentezza nei pagamenti tipica della PA campana, come tutela Edilizia in Cloud la mia liquidità?",
        a: "La previsione liquidità a 30-60-90 giorni mostra in rosso le scadenze critiche e suggerisce azioni: solleciti automatici WhatsApp/email su SAL non saldati, prioritizzazione dei cantieri privati durante mesi a rischio cassa, gestione ritenute di garanzia 0,5% per non scontarle troppo presto. Riduce il rischio di trovarsi senza liquidità a fine trimestre.",
      },
    ],
  },

  bologna: {
    name: "Bologna",
    region: "Emilia-Romagna",
    slug: "bologna",
    province: "BO",
    lat: 44.4949,
    lon: 11.3426,
    heroTitle: "Gestionale Edilizia per Imprese di Bologna",
    heroSubtitle:
      "Software gestionale per imprese edili bolognesi e dell'Emilia-Romagna: controllo cantieri, margini in tempo reale e fatturazione elettronica integrata.",
    heroImage: "/hero/stock/cantiere-1562259929-1400.webp",
    localStats: [
      { value: "18+", label: "Imprese edili emiliane attive" },
      { value: "€ 2.6M", label: "Fatturato gestito al mese in Emilia-Romagna" },
      { value: "25%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti emiliani" },
    ],
    localTestimonial: {
      quote:
        "In Emilia le imprese edili sono strutturate e competitive. Edilizia in Cloud mi ha permesso di lavorare con la stessa efficienza delle grandi imprese ma con i costi di un piccolo team.",
      author: "Stefano C.",
      company: "SC Costruzioni Srl",
      city: "Bologna",
      initials: "SC",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Mercato industriale e capannoni in forte crescita",
        desc: "L'Emilia-Romagna ha uno dei mercati più attivi in Italia per costruzioni industriali e capannoni. Gestire commesse di grandi dimensioni richiede un software in grado di tracciare tutto in tempo reale.",
      },
      {
        emoji: "🌊",
        title: "Ricostruzioni post-alluvione con finanziamenti pubblici",
        desc: "I cantieri finanziati dal Commissario Alluvione richiedono rendicontazione puntuale, SAL certificati e tracciabilità dei pagamenti. Senza un gestionale ad hoc si rischia di perdere i rimborsi.",
      },
      {
        emoji: "👷",
        title: "Subappalti complessi e filiere strutturate",
        desc: "Il tessuto produttivo emiliano è fatto di reti di subappaltatori specializzati. Gestire contratti, DURC e pagamenti di 10+ fornitori per cantiere senza un software è un incubo logistico.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Firenze", slug: "firenze" },
      { name: "Torino", slug: "torino" },
    ],
    localContext: {
      heading: "Edilizia a Bologna e in Emilia-Romagna: distretti industriali, ricostruzione post-sisma e prezzario regionale",
      body: "L'Emilia-Romagna ha un mercato edile fra i più strutturati d'Italia: filiera densa di subappaltatori specializzati (ceramica modenese, prefabbricazione reggiana, restauro ravennate), grande attività di ricostruzione e adeguamento sismico ancora attiva nei comuni colpiti dai sismi 2012 e 2023 (Bassa modenese, ferrarese), e una forte cultura della gestione cooperativa che pesa anche sulle imprese edili medie. Il prezzario opere pubbliche Regione Emilia-Romagna è il riferimento ufficiale, aggiornato annualmente in genere a marzo, integrato per le opere specialistiche con i prezzari Provincia e CCIAA Bologna.",
      prezzarioLink: "https://territorio.regione.emilia-romagna.it/lavori-pubblici",
      prezzarioLabel: "Prezzario opere pubbliche Regione Emilia-Romagna",
    },
    localFaqs: [
      {
        q: "Lavoro con 10-15 subappaltatori specializzati per cantiere: come tracciamento contratti, DURC e pagamenti?",
        a: "Edilizia in Cloud gestisce ogni subappaltatore come fornitore con contratto dedicato, scadenze DURC con alert automatici, SAL parziali, ritenute di garanzia 0,5%, scadenze fattura e antimafia. Vedi a colpo d'occhio quali fornitori hanno DURC in scadenza nei prossimi 30 giorni e quali sono in attesa di saldo.",
      },
      {
        q: "Posso importare il prezzario Regione Emilia-Romagna?",
        a: "Sì. Il prezzario Regione Emilia-Romagna 2026 si importa in Excel o PDF e le voci restano indicizzate per ricerca rapida con codici ufficiali. Le associazioni alle commesse storiche restano preservate quando re-importi l'aggiornamento annuale.",
      },
      {
        q: "Lavoro su ricostruzione post-sisma 2012 / 2023: il software gestisce le pratiche con il Commissario per la Ricostruzione?",
        a: "Sì. Le commesse post-sisma hanno spesso documentazione specifica (perizia asseverata, computo metrico approvato, SAL con visto di congruità). Edilizia in Cloud le tratta come categoria a sé, con campi dedicati per il numero pratica regionale e i SAL approvati dal Commissario.",
      },
      {
        q: "Posso usare Edilizia in Cloud anche se la mia impresa edile è una cooperativa o consorzio?",
        a: "Sì. Il sistema gestisce nativamente i flussi delle imprese cooperative e dei consorzi, con tracciamento separato dei lavori distribuiti ai consorziati, ribaltamento costi proporzionale e fatturazione consortile verso il committente finale.",
      },
    ],
  },

  firenze: {
    name: "Firenze",
    region: "Toscana",
    slug: "firenze",
    province: "FI",
    lat: 43.7696,
    lon: 11.2558,
    heroTitle: "Gestionale Edilizia per Imprese di Firenze",
    heroSubtitle:
      "Software gestionale per imprese edili fiorentine e toscane: gestione cantieri storici, SAL, fatturazione elettronica e controllo margini in tempo reale.",
    heroImage: "/hero/stock/cantiere-1581094288338-1400.webp",
    localStats: [
      { value: "15+", label: "Imprese edili toscane attive" },
      { value: "€ 2.1M", label: "Fatturato gestito al mese in Toscana" },
      { value: "23%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti toscani" },
    ],
    localTestimonial: {
      quote:
        "A Firenze si lavora molto nei centri storici: vincoli, soprintendenza, lavori delicati. Con Edilizia in Cloud tengo tutto sotto controllo e posso dimostrare ai clienti la qualità del nostro lavoro con dati reali.",
      author: "Riccardo M.",
      company: "Restauri e Costruzioni Martini",
      city: "Firenze",
      initials: "RM",
    },
    localProblems: [
      {
        emoji: "🏛️",
        title: "Cantieri nei centri storici UNESCO",
        desc: "Firenze è patrimonio UNESCO: ogni intervento in centro storico richiede autorizzazioni soprintendenza, piani di sicurezza dettagliati e documentazione fotografica puntuale. Senza un sistema digitale si perde tutto.",
      },
      {
        emoji: "🎨",
        title: "Restauro e conservazione: lavori non standardizzabili",
        desc: "I lavori di restauro e conservazione hanno costi difficili da preventivare. Servono strumenti che permettano di aggiornare il computo in corso d'opera e di comunicare varianti al cliente in tempo reale.",
      },
      {
        emoji: "🌿",
        title: "Riqualificazione energetica con incentivi regionali",
        desc: "La Toscana ha incentivi regionali per la riqualificazione energetica. Le pratiche richiedono una rendicontazione precisa e l'integrazione con i portali regionali. Un gestionale semplifica tutto.",
      },
    ],
    relatedCities: [
      { name: "Bologna", slug: "bologna" },
      { name: "Roma", slug: "roma" },
      { name: "Milano", slug: "milano" },
    ],
    localContext: {
      heading: "Edilizia a Firenze: Soprintendenza, restauro centro storico UNESCO e prezzario Regione Toscana",
      body: "A Firenze ogni cantiere nel centro storico passa dalla Soprintendenza Archeologia, Belle Arti e Paesaggio: tempi di autorizzazione lunghi, vincoli sulla scelta dei materiali e documentazione fotografica obbligatoria prima/durante/dopo. Le imprese edili fiorentine vivono fra restauro conservativo, ristrutturazioni in palazzi storici e riqualificazione energetica nei comuni della cintura (Scandicci, Sesto, Bagno a Ripoli). Il prezzario Regione Toscana è il riferimento ufficiale per opere pubbliche e per i computi metrici da presentare agli enti.",
      prezzarioLink: "https://www.regione.toscana.it/-/prezzario-dei-lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Toscana (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su un palazzo storico in centro a Firenze con vincoli Soprintendenza: come gestisco la documentazione fotografica?",
        a: "Ogni intervento ha la sua scheda con foto ante/in corso/post, geolocalizzate e archiviate per pratica. Quando la Soprintendenza chiede integrazioni dopo mesi, ritrovi tutto in due secondi senza scavare in vecchie chat WhatsApp.",
      },
      {
        q: "Posso importare il prezzario Regione Toscana nei miei preventivi?",
        a: "Sì. Importi il prezzario Toscana in Excel o PDF, le voci restano indicizzate per categoria e le riusi nei computi metrici delle gare. Quando esce l'aggiornamento annuale lo re-importi senza perdere lo storico commesse.",
      },
      {
        q: "Lavoro in restauro conservativo: come gestisco i preventivi che cambiano durante l'opera?",
        a: "Sul restauro il preventivo iniziale è solo un punto di partenza. Edilizia in Cloud gestisce varianti in corso d'opera con SAL intermedi: aggiorni il computo, generi la perizia di variante e il cliente vede in tempo reale dove sta andando il budget.",
      },
      {
        q: "Le mie commesse mescolano committenti privati alto-spendenti e enti pubblici: come tengo separati i flussi?",
        a: "Ogni cantiere ha tipologia committente (privato, ente pubblico, condominio) con flussi fattura e SAL differenziati. I pagamenti PA con split payment e ritenute di garanzia restano isolati dal flusso privato — niente confusione a fine mese.",
      },
    ],
  },

  genova: {
    name: "Genova",
    region: "Liguria",
    slug: "genova",
    province: "GE",
    lat: 44.4056,
    lon: 8.9463,
    heroTitle: "Gestionale Edilizia per Imprese di Genova",
    heroSubtitle:
      "Software gestionale per imprese edili genovesi e liguri: gestione cantieri, controllo margini e fatturazione elettronica. Perfetto per le sfide del territorio ligure.",
    heroImage: "/hero/stock/cantiere-1558618666-1400.webp",
    localStats: [
      { value: "12+", label: "Imprese edili liguri attive" },
      { value: "€ 1.8M", label: "Fatturato gestito al mese in Liguria" },
      { value: "21%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti liguri" },
    ],
    localTestimonial: {
      quote:
        "In Liguria i cantieri sono spesso in luoghi difficili da raggiungere. L'app offline di Edilizia in Cloud è stata la svolta: i miei capocantiere aggiornano tutto anche senza connessione.",
      author: "Gianluca B.",
      company: "Bianchi Costruzioni Liguria",
      city: "Genova",
      initials: "GB",
    },
    localProblems: [
      {
        emoji: "⛰️",
        title: "Cantieri su terreni scoscesi e difficili",
        desc: "La morfologia ligure rende ogni cantiere un caso a sé: strade strette, terreni in pendenza, logistica complessa. Coordinare squadre in queste condizioni richiede strumenti digitali precisi.",
      },
      {
        emoji: "🌊",
        title: "Manutenzione e consolidamento di edifici a rischio",
        desc: "Il dissesto idrogeologico è una realtà in Liguria. I lavori di consolidamento e messa in sicurezza richiedono documentazione puntuale, SAL e rendicontazione per accedere ai fondi regionali.",
      },
      {
        emoji: "🏚️",
        title: "Ristrutturazione di patrimonio edilizio datato",
        desc: "Genova ha un patrimonio edilizio antico e spesso degradato. Le ristrutturazioni sono complesse e imprevedibili: un gestionale flessibile è l'unico modo per mantenere il controllo dei costi.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Torino", slug: "torino" },
      { name: "Firenze", slug: "firenze" },
    ],
    localContext: {
      heading: "Edilizia a Genova: dissesto idrogeologico, ricostruzione ponte e prezzario Regione Liguria",
      body: "Genova lavora in verticale: caruggi, palazzi nobiliari del centro storico, terrazzamenti collinari fra Albaro e Quarto, frane stagionali in Val Polcevera. Dopo il crollo del Morandi e le alluvioni ricorrenti, una parte importante del mercato è ricostruzione strutturale e consolidamenti finanziati con fondi commissariali e Regione Liguria. Il prezzario regionale ligure è aggiornato dalla Regione e include voci specifiche per opere di difesa del suolo e contenimento — un capitolo che a Genova pesa sul fatturato di quasi ogni impresa.",
      prezzarioLink: "https://www.regione.liguria.it/homepage-territorio-ambiente-infrastrutture/prezzario-regionale-opere-edili.html",
      prezzarioLabel: "Prezzario Regione Liguria (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "I miei cantieri sono in caruggi del centro: niente accesso mezzi, materiali a spalla. Come imputo i costi reali?",
        a: "Su cantieri logisticamente complessi il costo orario manodopera vera è molto più alto del nominale. Imputi ogni movimento materiale come voce a sé e a fine commessa vedi il costo reale di trasporto interno — utile per preventivare meglio il prossimo cantiere in caruggio.",
      },
      {
        q: "Posso importare il prezzario Regione Liguria nelle mie offerte?",
        a: "Sì. Il prezzario Liguria si importa in formato Excel o PDF, le voci restano indicizzate per ricerca rapida con codice ufficiale. Comodo quando partecipi a gare di Comune di Genova, ASL3 o Autorità di Sistema Portuale che lo richiedono.",
      },
      {
        q: "Lavoro su consolidamenti post-frana finanziati dal Commissario: come gestisco la rendicontazione?",
        a: "Le commesse finanziate da fondi commissariali hanno SAL certificati e documentazione tecnica obbligatoria. Edilizia in Cloud le gestisce come categoria dedicata con numero pratica regionale, perizia e quadro economico approvato — tutto pronto per i controlli.",
      },
      {
        q: "Le squadre sono spesso senza segnale nei cantieri collinari: l'app funziona offline?",
        a: "Sì. I capocantiere registrano presenze, ore, foto e materiali offline. Quando rientrano in 4G o WiFi tutto si sincronizza automaticamente — niente fogli appesi al muro del baraccone che si bagnano alla prima pioggia.",
      },
    ],
  },

  bari: {
    name: "Bari",
    region: "Puglia",
    slug: "bari",
    province: "BA",
    lat: 41.1171,
    lon: 16.8719,
    heroTitle: "Gestionale Edilizia per Imprese di Bari",
    heroSubtitle:
      "Software gestionale per imprese edili baresi e pugliesi: gestione cantieri, SAL, fatturazione elettronica e controllo margini. Scelto da imprese edili in tutta la Puglia.",
    heroImage: "/hero/stock/cantiere-1504917595217-1400.webp",
    localStats: [
      { value: "12+", label: "Imprese edili pugliesi attive" },
      { value: "€ 1.5M", label: "Fatturato gestito al mese in Puglia" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti pugliesi" },
    ],
    localTestimonial: {
      quote:
        "In Puglia il mercato edile è in forte crescita grazie ai fondi PNRR. Con Edilizia in Cloud gestisco più cantieri in parallelo senza perdere il controllo dei costi e della documentazione.",
      author: "Francesco P.",
      company: "Puglia Costruzioni Srl",
      city: "Bari",
      initials: "FP",
    },
    localProblems: [
      {
        emoji: "🏗️",
        title: "Boom di appalti PNRR e fondi europei",
        desc: "La Puglia è tra le regioni con più investimenti PNRR in edilizia pubblica. Accedere a questi appalti richiede documentazione digitale, SAL certificati e DURC sempre aggiornati.",
      },
      {
        emoji: "☀️",
        title: "Mercato fotovoltaico e agrivoltaico in espansione",
        desc: "La Puglia guida l'installazione di impianti agrivoltaici e fotovoltaici in Italia. Gestire questi cantieri richiede un software flessibile per preventivi tecnici e rendicontazione GSE.",
      },
      {
        emoji: "🏘️",
        title: "Ristrutturazioni nei centri storici del Sud",
        desc: "Bari vecchia e i borghi pugliesi hanno un patrimonio edilizio che richiede interventi delicati. Documentazione digitale e giornale dei lavori sono indispensabili per questi cantieri.",
      },
    ],
    relatedCities: [
      { name: "Napoli", slug: "napoli" },
      { name: "Palermo", slug: "palermo" },
      { name: "Roma", slug: "roma" },
    ],
    localContext: {
      heading: "Edilizia a Bari: appalti PNRR, mercato agrivoltaico pugliese e prezzario Regione Puglia",
      body: "Bari è la porta dei fondi europei verso il Mezzogiorno: PNRR, FESR, fondi di coesione e PSR pugliese alimentano un mercato di appalti pubblici che le imprese baresi e della BAT vincono spesso in ATI. Il tessuto è duplice — da una parte ristrutturazioni in Bari Vecchia con vincoli storici e calcestruzzi tufacei, dall'altra cantieri industriali, logistici e agrivoltaici nel resto della provincia. Il prezzario Regione Puglia è il riferimento ufficiale per opere pubbliche, integrato con i prezzari ANCE provinciali per le specialistiche.",
      prezzarioLink: "https://www.regione.puglia.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Puglia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Partecipo a gare PNRR in ATI con altre imprese pugliesi: come tengo i conti separati per ciascun mandante?",
        a: "Ogni commessa in ATI ha la sua quota di partecipazione percentuale, i costi imputati al mandante e i ricavi ribaltati pro-quota. A fine commessa generi il rendiconto interno per il mandatario e ciascun mandante vede chiaramente il proprio risultato economico.",
      },
      {
        q: "Posso importare il prezzario Regione Puglia nei computi metrici di gara?",
        a: "Sì. Importi il prezzario Puglia in Excel o PDF, le voci restano indicizzate per codice ufficiale e categoria. Nei computi metrici di gara le richiami direttamente con il codice — niente errori di trascrizione che fanno escludere l'offerta.",
      },
      {
        q: "Gestisco impianti agrivoltaici nel Tavoliere: il software traccia componenti specialistici e rendicontazione GSE?",
        a: "Sì. Le commesse FER hanno tipologia dedicata con campi per potenza installata, componentistica (pannelli, inverter, strutture), date di connessione e documentazione GSE. Generi rendicontazioni Terna e fatture in regime IVA agevolata senza errori manuali.",
      },
      {
        q: "Ho cantieri sparsi fra Bari, BAT, Foggia e Brindisi. Come monitoro tutto senza essere ovunque?",
        a: "Ogni cantiere è geolocalizzato e ha la sua dashboard con SAL, costi consuntivati, ore lavorate e margine residuo. Dal tuo telefono vedi in tempo reale dove un cantiere sta sforando — prima che diventi un buco da 30k a fine commessa.",
      },
    ],
  },

  verona: {
    name: "Verona",
    region: "Veneto",
    slug: "verona",
    province: "VR",
    lat: 45.4384,
    lon: 10.9916,
    heroTitle: "Gestionale Edilizia per Imprese di Verona",
    heroSubtitle:
      "Software gestionale per imprese edili veronesi e venete: gestione cantieri, margini in tempo reale, fatturazione elettronica e app mobile per il cantiere.",
    heroImage: "/hero/stock/cantiere-1503387762-1400.webp",
    localStats: [
      { value: "14+", label: "Imprese edili venete attive" },
      { value: "€ 2.0M", label: "Fatturato gestito al mese in Veneto" },
      { value: "24%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti veneti" },
    ],
    localTestimonial: {
      quote:
        "In Veneto la qualità del lavoro è tutto. Con Edilizia in Cloud riesco a dimostrare ai committenti la professionalità della mia impresa con dati reali: SAL puntuali, documentazione completa e margini trasparenti.",
      author: "Andrea Z.",
      company: "Zampieri Costruzioni",
      city: "Verona",
      initials: "AZ",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Costruzioni industriali e logistiche nel distretto veneto",
        desc: "Il Veneto ha uno dei mercati più attivi in Italia per capannoni industriali e logistica. Gestire queste commesse richiede un software in grado di tracciare subappalti specializzati e varianti in corso d'opera.",
      },
      {
        emoji: "🏛️",
        title: "Restauro e ristrutturazione in centri storici UNESCO",
        desc: "Verona è patrimonio UNESCO. I cantieri in centro storico richiedono autorizzazioni soprintendenza, documentazione fotografica puntuale e rendicontazione certificata.",
      },
      {
        emoji: "🌊",
        title: "Adeguamento sismico e consolidamento strutturale",
        desc: "Il Veneto ha zone a rischio sismico elevato. I lavori di adeguamento richiedono certificazioni strutturali, collaudi e documentazione tecnica che un gestionale digitale semplifica enormemente.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Bologna", slug: "bologna" },
      { name: "Brescia", slug: "brescia" },
    ],
    localContext: {
      heading: "Edilizia a Verona: arena UNESCO, logistica del Quadrilatero e prezzario Regione Veneto",
      body: "Verona è snodo logistico nazionale fra il Brennero, l'A4 e il porto di Venezia: il mercato edile veronese ruota su capannoni e centri logistici nella Bassa, ristrutturazioni nei borghi della Valpolicella e cantieri delicati nel centro storico UNESCO attorno all'Arena. Le cantine vinicole della Valpolicella e del Soave commissionano regolarmente ampliamenti produttivi con vincoli paesaggistici. Il prezzario Regione Veneto è il riferimento ufficiale, aggiornato annualmente — ed è obbligatorio nelle gare di Comune di Verona e ULSS 9 Scaligera.",
      prezzarioLink: "https://www.regione.veneto.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Veneto (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su capannoni logistici nella Bassa veronese con tempi di consegna serrati: come monitoro lo stato avanzamento ogni giorno?",
        a: "I capocantiere aggiornano percentuali di avanzamento e ore lavorate dall'app cantiere. Tu vedi in dashboard il SAL aggiornato giornaliero e ricevi alert se un'attività sta scivolando — il committente logistico vuole il capannone consegnato al giorno, non c'è margine.",
      },
      {
        q: "Posso importare il prezzario Regione Veneto nelle mie offerte di gara?",
        a: "Sì. Il prezzario Veneto si importa in Excel o PDF e le voci restano indicizzate con codice ufficiale. Nei computi metrici di gara richiami direttamente la voce: il sistema controlla automaticamente se stai usando l'edizione vigente al momento della pubblicazione del bando.",
      },
      {
        q: "Lavoro su una cantina in Valpolicella con vincolo paesaggistico: come gestisco i preventivi e le varianti?",
        a: "Le cantine sono cantieri tecnicamente complessi: vasche inox, locali climatizzati, vincoli paesaggistici. Generi preventivi articolati per fase (strutture, impianti, finiture) e quando il vincolo paesaggistico impone variante, aggiorni computo e quadro economico in pochi click.",
      },
      {
        q: "Ho cantieri in provincia di Verona, Vicenza e Trento: posso gestire tutto in una sola installazione?",
        a: "Sì. La piattaforma è un singolo accesso multi-cantiere, multi-regione. Anche se passi un cantiere in PAT (Trento ha prezzario suo), il sistema gestisce prezzari diversi per commessa senza che tu debba duplicare l'anagrafica fornitori o aprire installazioni separate.",
      },
    ],
  },

  brescia: {
    name: "Brescia",
    region: "Lombardia",
    slug: "brescia",
    province: "BS",
    lat: 45.5416,
    lon: 10.2118,
    heroTitle: "Gestionale Edilizia per Imprese di Brescia",
    heroSubtitle:
      "Software gestionale per imprese edili bresciane e lombarde: gestione cantieri, preventivi, fatturazione elettronica e controllo margini in tempo reale.",
    heroImage: "/hero/stock/cantiere-1581578731548-1400.webp",
    localStats: [
      { value: "16+", label: "Imprese edili bresciane attive" },
      { value: "€ 2.3M", label: "Fatturato gestito al mese in provincia di Brescia" },
      { value: "25%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti bresciani" },
    ],
    localTestimonial: {
      quote:
        "Brescia è una piazza competitiva. Edilizia in Cloud mi ha dato il vantaggio competitivo che cercavo: margini in tempo reale e preventivi professionali che convincono i clienti più esigenti.",
      author: "Marco G.",
      company: "Galimberti Costruzioni Srl",
      city: "Brescia",
      initials: "MG",
    },
    localProblems: [
      {
        emoji: "⚙️",
        title: "Distretto industriale con alta domanda di capannoni",
        desc: "La provincia di Brescia ospita uno dei distretti industriali più attivi d'Italia. Le imprese edili bresciane gestiscono commesse complesse per capannoni, ampliamenti e riqualificazioni industriali.",
      },
      {
        emoji: "🏔️",
        title: "Cantieri in Valle Camonica e zone montane",
        desc: "Molte imprese bresciane lavorano nelle valli alpine: accessi difficili, stagionalità e logistica complessa. L'app mobile offline di Edilizia in Cloud è fondamentale per questi cantieri.",
      },
      {
        emoji: "🏠",
        title: "Boom delle ristrutturazioni residenziali",
        desc: "La provincia di Brescia ha visto una forte crescita delle ristrutturazioni residenziali. Gestire 10-15 cantieri piccoli contemporaneamente richiede un software che faccia ordine tra preventivi, SAL e fatture.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Verona", slug: "verona" },
      { name: "Torino", slug: "torino" },
    ],
    localContext: {
      heading: "Edilizia a Brescia: distretto siderurgico, Franciacorta vinicola e prezzario Regione Lombardia",
      body: "Brescia è la seconda provincia industriale della Lombardia: distretto siderurgico e meccanico in Val Trompia, vinicolo in Franciacorta, alpino in Val Camonica e Val Sabbia. Le imprese edili bresciane lavorano molto su capannoni produttivi, ampliamenti aziendali e bonifiche di siti industriali dismessi (Caffaro), accanto al residenziale del lago di Garda con vincoli paesaggistici. Il prezzario di riferimento è quello della Regione Lombardia (lo stesso usato a Milano), aggiornato annualmente con oltre 28.000 voci.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su ampliamenti per aziende meccaniche in Val Trompia: come gestisco commesse industriali con tante varianti?",
        a: "I cantieri industriali raramente finiscono come sono partiti: l'azienda cliente aggiunge linee produttive in corso d'opera. Edilizia in Cloud gestisce le varianti come SAL aggiuntivi con propria perizia e quadro economico, senza scombinare i conti del contratto base.",
      },
      {
        q: "Posso importare il prezzario Regione Lombardia nelle gare con committenti pubblici bresciani?",
        a: "Sì. Il prezzario Lombardia si importa in Excel o PDF, le voci restano indicizzate con codice ufficiale. Comodo quando partecipi a gare di Comune di Brescia, ATS Brescia o A2A che richiedono il riferimento al prezzario regionale vigente.",
      },
      {
        q: "Cantieri sul lago di Garda con vincolo paesaggistico: come gestisco autorizzazioni e documentazione?",
        a: "I cantieri lacuali richiedono autorizzazione paesaggistica e spesso documentazione fotografica obbligatoria. Ogni pratica ha la sua scheda con scadenze, foto geolocalizzate e documenti firmati — tutto archiviato e ricercabile anche anni dopo per eventuali controlli.",
      },
      {
        q: "Bonifica e demolizione di sito industriale dismesso: il software gestisce i piani di lavoro amianto e i flussi rifiuti?",
        a: "Sì. Le commesse bonifica hanno categoria dedicata con piani di lavoro amianto, FIR rifiuti speciali, scadenze SISTRI/RENTRI e tracciabilità del committente bonifica. A fine cantiere generi il dossier completo per il certificato di restituibilità.",
      },
    ],
  },

  palermo: {
    name: "Palermo",
    region: "Sicilia",
    slug: "palermo",
    province: "PA",
    lat: 38.1157,
    lon: 13.3615,
    heroTitle: "Gestionale Edilizia per Imprese di Palermo",
    heroSubtitle:
      "Software gestionale per imprese edili palermitane e siciliane: controllo cantieri, SAL, fatturazione elettronica e gestione squadre in un'unica piattaforma cloud.",
    heroImage: "/hero/stock/cantiere-1600585154526-1400.webp",
    localStats: [
      { value: "10+", label: "Imprese edili siciliane attive" },
      { value: "€ 1.2M", label: "Fatturato gestito al mese in Sicilia" },
      { value: "20%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti siciliani" },
    ],
    localTestimonial: {
      quote:
        "In Sicilia le opportunità non mancano, ma la gestione burocratica è pesante. Con Edilizia in Cloud ho ridotto il tempo dedicato alla burocrazia del 60% e posso concentrarmi sui cantieri.",
      author: "Salvatore G.",
      company: "Garofalo Costruzioni Srl",
      city: "Palermo",
      initials: "SG",
    },
    localProblems: [
      {
        emoji: "🏛️",
        title: "Fondi PNRR e appalti pubblici in forte crescita",
        desc: "La Sicilia è tra le regioni con più fondi PNRR per infrastrutture ed edilizia pubblica. Accedere a questi appalti richiede documentazione digitale, SAL puntuali e DURC sempre aggiornati.",
      },
      {
        emoji: "☀️",
        title: "Boom del fotovoltaico e dell'efficienza energetica",
        desc: "La Sicilia guida la transizione energetica in Italia. Installatori e imprese edili che lavorano nel settore fotovoltaico hanno bisogno di un gestionale flessibile per gestire cantieri distribuiti.",
      },
      {
        emoji: "📋",
        title: "Rendicontazione complessa per fondi regionali",
        desc: "I finanziamenti regionali siciliani richiedono rendicontazione dettagliata e documentazione puntuale. Senza un gestionale specifico si rischia di perdere i rimborsi per errori formali.",
      },
    ],
    relatedCities: [
      { name: "Napoli", slug: "napoli" },
      { name: "Roma", slug: "roma" },
      { name: "Milano", slug: "milano" },
    ],
    localContext: {
      heading: "Edilizia a Palermo: prezzario Regione Sicilia, cantieri isole minori e fondi POR FESR",
      body: "Palermo è il capoluogo di una regione con prezzario proprio: il prezzario Regione Sicilia è obbligatorio per tutte le opere pubbliche dell'isola, aggiornato dal Dipartimento Tecnico ARTA con voci dedicate al contesto siciliano (tufo calcareo, malte specifiche, trasporto via mare per le isole minori). Il tessuto edile palermitano lavora fra restauro nei mandamenti del centro storico, residenziale a Mondello e cantieri pubblici finanziati con POR FESR e PNRR. Le imprese che operano su Eolie, Egadi e Ustica devono mettere a budget il trasporto marittimo come voce significativa.",
      prezzarioLink: "https://pti.regione.sicilia.it/portal/page/portal/PIR_PORTALE/PIR_LaStrutturaRegionale/PIR_AssInfrastruttureMobilita/PIR_Areedinteresse/PIR_PrezzarioRegionale",
      prezzarioLabel: "Prezzario Regione Sicilia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su un cantiere alle Eolie: come metto a budget il trasporto materiali via nave?",
        a: "Il trasporto marittimo è una voce di costo che a volte vale il 15-20% del cantiere. Crei una voce di preventivo dedicata (m³ o ton via nave) con prezzo per tratta, e a consuntivo vedi quanto hai effettivamente speso fra noli, traghetti e movimentazione a terra.",
      },
      {
        q: "Posso importare il prezzario Regione Sicilia nei computi di gara?",
        a: "Sì. Il prezzario Sicilia si importa in Excel o PDF, le voci restano indicizzate per codice ufficiale. Nei computi metrici di gara richiami direttamente la voce — utile soprattutto per gare di Città Metropolitana di Palermo, ASP e Genio Civile.",
      },
      {
        q: "Restauro in un palazzo nobiliare nei mandamenti: come gestisco la rendicontazione per i fondi regionali?",
        a: "I fondi regionali siciliani per restauro richiedono documentazione fotografica datata, perizia asseverata e SAL certificati. Edilizia in Cloud archivia tutto per pratica con numero protocollo regionale — quando arrivano i controlli (anche dopo 2-3 anni) trovi ogni documento in pochi secondi.",
      },
      {
        q: "Ho cantieri sparsi fra Palermo città e provincia: come tengo sotto controllo squadre e ore lavorate?",
        a: "Ogni cantiere è geolocalizzato e i capocantiere timbrano ingresso/uscita con GPS dall'app. Vedi in tempo reale chi è dove, ore lavorate per commessa e produttività per squadra. Le ore confluiscono direttamente sulla commessa giusta — niente fogli excel a fine mese da ricostruire.",
      },
    ],
  },

  catania: {
    name: "Catania",
    region: "Sicilia",
    slug: "catania",
    province: "CT",
    lat: 37.5079,
    lon: 15.0830,
    heroTitle: "Gestionale Edilizia per Imprese di Catania",
    heroSubtitle:
      "Software gestionale per imprese edili catanesi: gestione cantieri, preventivi, fatturazione elettronica e controllo margini in tempo reale. Il polo economico della Sicilia orientale merita strumenti all'altezza.",
    heroImage: "/hero/stock/cantiere-1504307651254-1400.webp",
    localStats: [
      { value: "12+", label: "Imprese edili catanesi attive" },
      { value: "€ 1.5M", label: "Fatturato gestito al mese in provincia di Catania" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti siciliani" },
    ],
    localTestimonial: {
      quote:
        "Catania è in forte sviluppo grazie al polo tecnologico. Con Edilizia in Cloud gestisco i cantieri del distretto tech e quelli residenziali con lo stesso strumento, senza confusione.",
      author: "Giuseppe T.",
      company: "Tecnocostruzioni Srl",
      city: "Catania",
      initials: "GT",
    },
    localProblems: [
      {
        emoji: "🖥️",
        title: "Polo tecnologico in espansione: commesse complesse",
        desc: "Catania ospita uno dei principali hub tecnologici d'Italia. Le imprese edili lavorano per aziende tech e startup con requisiti tecnici elevati e tempi di consegna rigidi. Un gestionale preciso è indispensabile.",
      },
      {
        emoji: "🏗️",
        title: "Ricostruzione post-sismica ed efficienza energetica",
        desc: "Il territorio etneo è soggetto a rischio sismico. Molte imprese gestiscono contemporaneamente cantieri di ricostruzione con fondi pubblici e ristrutturazioni energetiche con Superbonus, richiedendo doppia rendicontazione.",
      },
      {
        emoji: "🌊",
        title: "Sviluppo costiero e turismo: boom dell'ospitalità",
        desc: "La costa catanese vede una forte crescita di strutture ricettive e residenziali. Gestire cantieri stagionali con picchi di lavoro estivi richiede flessibilità nelle squadre e un controllo rigoroso dei costi.",
      },
    ],
    relatedCities: [
      { name: "Palermo", slug: "palermo" },
      { name: "Napoli", slug: "napoli" },
      { name: "Bari", slug: "bari" },
    ],
    localContext: {
      heading: "Edilizia a Catania: zona sismica Etna, polo tecnologico STMicroelectronics e prezzario Regione Sicilia",
      body: "Catania è zona sismica di prima categoria: tutti i nuovi edifici e gli adeguamenti su esistenti passano per relazione sismica e collaudo. Le imprese edili catanesi lavorano in tre mercati distinti — adeguamento sismico finanziato (Sismabonus), espansione del polo tecnologico Etna Valley con capannoni e uffici per STMicroelectronics e indotto, ricettivo lungo la costa ionica e nei borghi della Riviera dei Ciclopi. Il prezzario di riferimento è quello Regione Sicilia, vincolante per opere pubbliche e per le pratiche legate al Genio Civile.",
      prezzarioLink: "https://pti.regione.sicilia.it/portal/page/portal/PIR_PORTALE/PIR_LaStrutturaRegionale/PIR_AssInfrastruttureMobilita/PIR_Areedinteresse/PIR_PrezzarioRegionale",
      prezzarioLabel: "Prezzario Regione Sicilia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Faccio adeguamento sismico con Sismabonus 110/85: come gestisco asseverazioni, SAL 30/60/100 e cessione del credito?",
        a: "Le commesse Sismabonus hanno tipologia dedicata con scadenze SAL al 30%/60%/saldo, asseverazioni tecniche di congruità e tracciamento cessione del credito. Generi il fascicolo per il visto di conformità in pochi click — senza ricostruirlo manualmente da Excel sparsi.",
      },
      {
        q: "Posso importare il prezzario Regione Sicilia nei miei preventivi?",
        a: "Sì. Il prezzario Sicilia si importa in Excel o PDF, le voci restano indicizzate per ricerca rapida con codice ufficiale. Quando il Genio Civile chiede il computo metrico per pratica sismica, lo generi direttamente con i codici di prezzario richiesti.",
      },
      {
        q: "Lavoro come fornitore di costruzioni per Etna Valley (STM, uffici tecnologici): come gestisco capitolati con tempi e qualità da multinazionale?",
        a: "I committenti tech vogliono SAL settimanali, foto-report giornalieri e SLA contrattuali sui ritardi. Edilizia in Cloud gestisce le commesse industriali con dashboard pubblica per il committente — gli dai accesso in lettura e smettono di chiamarti ogni due giorni per gli aggiornamenti.",
      },
      {
        q: "Cantieri ricettivi sulla Riviera dei Ciclopi con apertura estiva fissa: come garantisco la consegna nei tempi?",
        a: "Sui ricettivi la data di apertura non si sposta. Lavori a ritroso dal 1° giugno e Edilizia in Cloud ti avvisa con alert quando una lavorazione critica sta scivolando. Vedi a colpo d'occhio se sei in linea o se devi mettere un'altra squadra per recuperare.",
      },
    ],
  },

  venezia: {
    name: "Venezia",
    region: "Veneto",
    slug: "venezia",
    province: "VE",
    lat: 45.4408,
    lon: 12.3155,
    heroTitle: "Gestionale Edilizia per Imprese di Venezia",
    heroSubtitle:
      "Software gestionale per imprese edili veneziane: gestione cantieri lagunari, preventivi per restauro e conservazione, fatturazione elettronica e controllo margini. L'edilizia veneziana ha bisogno di strumenti su misura.",
    heroImage: "/hero/stock/cantiere-1541888946425-1400.webp",
    localStats: [
      { value: "14+", label: "Imprese edili veneziane attive" },
      { value: "€ 1.8M", label: "Fatturato gestito al mese in provincia di Venezia" },
      { value: "24%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti veneti" },
    ],
    localTestimonial: {
      quote:
        "Lavorare a Venezia è unico: ogni cantiere ha vincoli soprintendenza, logistica via acqua e costi altissimi. Edilizia in Cloud mi permette di tenere sotto controllo ogni euro e ogni ora lavorata.",
      author: "Roberto M.",
      company: "Marinelli Restauri Srl",
      city: "Venezia",
      initials: "RM",
    },
    localProblems: [
      {
        emoji: "🚤",
        title: "Logistica lagunare: costi di trasporto altissimi",
        desc: "A Venezia ogni materiale arriva via acqua. I costi di trasporto possono incidere del 30-40% sul budget. Tracciare questi costi per cantiere — e ribaltarli correttamente sul cliente — è fondamentale per non lavorare in perdita.",
      },
      {
        emoji: "🏛️",
        title: "Vincoli soprintendenza su quasi tutti gli edifici",
        desc: "La stragrande maggioranza degli edifici veneziani è soggetta a vincoli storici e paesaggistici. Le imprese devono gestire autorizzazioni complesse, varianti continue e documentazione specifica per ogni intervento.",
      },
      {
        emoji: "💧",
        title: "Moto ondoso e acqua alta: cantieri con imprevisti costanti",
        desc: "L'acqua alta e il moto ondoso creano danni e ritardi imprevedibili. Gestire le varianti in corso d'opera e aggiornare i SAL in tempo reale è essenziale per non perdere il controllo dei costi.",
      },
    ],
    relatedCities: [
      { name: "Verona", slug: "verona" },
      { name: "Padova", slug: "padova" },
      { name: "Bologna", slug: "bologna" },
    ],
    localContext: {
      heading: "Edilizia a Venezia: restauro lagunare, MOSE e prezzario Regione Veneto",
      body: "Venezia non è una città normale per chi fa edilizia: trasporto materiali esclusivamente via acqua con motonavi e pontoni, fondazioni su pali in larice, vincolo Soprintendenza praticamente ovunque, acqua alta che blocca i cantieri in laguna per giorni. Le imprese veneziane lavorano fra restauro nei sestieri storici, manutenzione delle opere del MOSE su Lido e Pellestrina, riqualificazione alberghi di lusso e residenze in terraferma (Mestre, Marghera). Il prezzario Regione Veneto include voci specifiche per opere in laguna e trasporti acquei.",
      prezzarioLink: "https://www.regione.veneto.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Veneto (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Trasporto materiali via barca costa 3-4 volte la gomma: come metto a budget i noli motonave per ogni cantiere?",
        a: "Ogni cantiere veneziano ha voce di costo dedicata 'trasporto acqueo' con tariffa al m³ o al viaggio. Imputi noli, attese alla bocca di porto e maree. A consuntivo vedi il costo logistico reale per separarlo dal costo opera — utile per imparare a preventivare il prossimo cantiere lagunare.",
      },
      {
        q: "Posso importare il prezzario Regione Veneto nei computi per Soprintendenza e Provveditorato Opere Pubbliche?",
        a: "Sì. Il prezzario Veneto si importa in Excel o PDF, le voci restano indicizzate con codice ufficiale. Comodo soprattutto per le pratiche con Soprintendenza Speciale di Venezia e Provveditorato OOPP del Triveneto che richiedono prezzario regionale aggiornato.",
      },
      {
        q: "L'acqua alta blocca il cantiere per 5-7 giorni l'anno: come tengo traccia dei giorni di forza maggiore per i SAL?",
        a: "Apri un giornale dei lavori con voci di sospensione per causa di forza maggiore, foto del cantiere allagato e durata effettiva. Il computo SAL si aggiorna automaticamente e hai documentazione pronta da allegare a varianti o richieste di proroga al committente.",
      },
      {
        q: "Restauro in un palazzo storico con vincolo Soprintendenza: come gestisco la documentazione fotografica obbligatoria?",
        a: "Ogni intervento ha scheda con foto ante/in corso/post, geolocalizzate e datate, archiviate per pratica con numero protocollo Soprintendenza. Quando arriva l'ispezione (anche dopo 5 anni) hai tutto in archivio digitale ricercabile per data, fase o operatore.",
      },
    ],
  },

  padova: {
    name: "Padova",
    region: "Veneto",
    slug: "padova",
    province: "PD",
    lat: 45.4064,
    lon: 11.8768,
    heroTitle: "Gestionale Edilizia per Imprese di Padova",
    heroSubtitle:
      "Software gestionale per imprese edili padovane: gestione cantieri, preventivi professionali, fatturazione elettronica e controllo margini. Il Veneto produttivo merita un gestionale all'altezza.",
    heroImage: "/hero/stock/cantiere-1621905251189-1400.webp",
    localStats: [
      { value: "18+", label: "Imprese edili padovane attive" },
      { value: "€ 2.1M", label: "Fatturato gestito al mese in provincia di Padova" },
      { value: "26%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti padovani" },
    ],
    localTestimonial: {
      quote:
        "Padova è una piazza competitiva tra università, terziario avanzato e residenziale di qualità. Edilizia in Cloud mi ha permesso di presentare preventivi professionali e vincere commesse che prima perdevo.",
      author: "Andrea P.",
      company: "Padovani Costruzioni Srl",
      city: "Padova",
      initials: "AP",
    },
    localProblems: [
      {
        emoji: "🎓",
        title: "Edilizia universitaria e residenze studenti in crescita",
        desc: "Padova è sede di una delle università più grandi d'Italia. La domanda di residenze universitarie, studentati e co-living è in forte crescita. Le imprese edili devono gestire cantieri veloci con alta rotazione di subappaltatori.",
      },
      {
        emoji: "🏭",
        title: "Polo produttivo veneto: capannoni e logistica",
        desc: "La provincia di Padova è uno dei poli produttivi più attivi del Veneto. Le imprese costruiscono e ristrutturano capannoni per PMI in continua espansione, con tempi stretti e budget precisi.",
      },
      {
        emoji: "🌿",
        title: "Riqualificazione energetica del patrimonio esistente",
        desc: "Il patrimonio edilizio padovano degli anni '70-'80 richiede interventi massicci di efficienza energetica. Gestire 10-20 cantieri di ristrutturazione contemporaneamente richiede un software che faccia ordine tra SAL, pratiche bonus e fatture.",
      },
    ],
    relatedCities: [
      { name: "Venezia", slug: "venezia" },
      { name: "Verona", slug: "verona" },
      { name: "Bologna", slug: "bologna" },
    ],
    localContext: {
      heading: "Edilizia a Padova: hub universitario, polo produttivo della Marca padovana e prezzario Regione Veneto",
      body: "Padova vive di una doppia anima: capitale universitaria con domanda forte di studentati, residence e edilizia legata ad Azienda Ospedaliera, e centro produttivo veneto con cantieri industriali nei comuni della cintura (Limena, Vigodarzere, Albignasego). La provincia è anche fra le aree più dense d'Italia per ristrutturazioni energetiche di immobili anni '70-'80. Il prezzario di riferimento per opere pubbliche è quello della Regione Veneto, vincolante nelle gare di Comune di Padova, ULSS 6 Euganea e Università.",
      prezzarioLink: "https://www.regione.veneto.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Veneto (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Costruisco uno studentato finanziato con DM 481/2020 (housing universitario): come gestisco SAL e rendicontazione MUR?",
        a: "Le commesse housing universitario hanno scadenze rigide e rendicontazione al Ministero. Edilizia in Cloud le gestisce come categoria dedicata con SAL allineati al cronoprogramma di gara, foto-report mensili e documentazione MUR pronta da inviare — niente ricostruzioni manuali a fine anno.",
      },
      {
        q: "Posso importare il prezzario Regione Veneto nei computi per Università di Padova e ULSS 6?",
        a: "Sì. Il prezzario Veneto si importa in Excel o PDF, le voci restano indicizzate per codice ufficiale. Negli appalti universitari e sanitari richiami le voci direttamente — riduci errori di trascrizione che fanno escludere offerte ben fatte.",
      },
      {
        q: "Lavoro su 15 ristrutturazioni residenziali con Bonus Casa simultaneamente: come tengo separati cantieri, SAL e fatture?",
        a: "Ogni cantiere è una commessa a sé con il proprio cliente, computo, SAL e fatture. Dalla dashboard vedi quali sono in linea, quali in ritardo e quali stanno erodendo margine. Le fatture viaggiano col codice commessa — il commercialista non ti chiama più alle 22.",
      },
      {
        q: "Polo industriale Padova Est: capannoni con tempi di consegna serrati. Come monitoro produttività squadre e cronoprogramma?",
        a: "Dashboard cantiere con percentuale di avanzamento lavorazioni, ore squadra giornaliere e produttività confrontata con il preventivo. Se una squadra sta sotto-produttiva ricevi alert e puoi intervenire prima che il ritardo diventi penale contrattuale.",
      },
    ],
  },

  bergamo: {
    name: "Bergamo",
    region: "Lombardia",
    slug: "bergamo",
    province: "BG",
    lat: 45.6983,
    lon: 9.6773,
    heroTitle: "Gestionale Edilizia per Imprese di Bergamo",
    heroSubtitle:
      "Software gestionale per imprese edili bergamasche: controllo cantieri, preventivi professionali, fatturazione elettronica e margini in tempo reale. La forza produttiva bergamasca merita strumenti digitali all'altezza.",
    heroImage: "/hero/stock/cantiere-1504328345606-1400.webp",
    localStats: [
      { value: "22+", label: "Imprese edili bergamasche attive" },
      { value: "€ 3.1M", label: "Fatturato gestito al mese in provincia di Bergamo" },
      { value: "27%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti bergamaschi" },
    ],
    localTestimonial: {
      quote:
        "Bergamo è una piazza dove si lavora sodo ma i margini sono stretti. Edilizia in Cloud mi ha permesso di capire finalmente dove stavo perdendo soldi: un cantiere su tre era in perdita senza che me ne accorgessi.",
      author: "Claudio R.",
      company: "Rota Costruzioni Srl",
      city: "Bergamo",
      initials: "CR",
    },
    localProblems: [
      {
        emoji: "🏗️",
        title: "Polo industriale e logistico con cantieri complessi",
        desc: "La provincia di Bergamo ha uno dei tessuti produttivi più densi d'Italia. Le imprese edili lavorano su capannoni, ampliamenti e infrastrutture logistiche con tempi rigidi e penali pesanti per i ritardi.",
      },
      {
        emoji: "🏔️",
        title: "Valli orobiche: cantieri in zone difficili",
        desc: "Le valli bergamasche richiedono cantieri con logistica alpina, stagionalità e costi di trasporto elevati. Tracciare questi costi per commessa è fondamentale per non lavorare in perdita.",
      },
      {
        emoji: "🏠",
        title: "Post-sisma e riqualificazione energetica in crescita",
        desc: "La provincia di Bergamo ha visto una forte spinta verso la riqualificazione energetica dopo il 2020. Gestire 15-20 cantieri di ristrutturazione simultaneamente richiede un software preciso.",
      },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Brescia", slug: "brescia" },
      { name: "Verona", slug: "verona" },
    ],
    localContext: {
      heading: "Edilizia a Bergamo: distretto produttivo della Bassa, ricostruzione post-Covid e prezzario Regione Lombardia",
      body: "Bergamo è una delle province più imprenditoriali d'Italia: la Bassa bergamasca (Treviglio, Caravaggio) è cintura industriale con cantieri continui per capannoni e logistica, mentre l'area pedemontana e le valli orobiche (Val Seriana, Val Brembana) hanno cantieri stagionali in montagna con stagionalità neve. Dopo il 2020 la spinta su housing privato e ristrutturazioni energetiche è stata fortissima. Il prezzario di riferimento è quello della Regione Lombardia, lo stesso di Milano e Brescia.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su capannoni logistici nella Bassa per committenti come Amazon o Maersk: come gestisco SAL settimanali e penali sui tempi?",
        a: "I committenti logistici grandi vogliono SAL settimanali con foto e percentuali per lavorazione. Edilizia in Cloud genera SAL automatici dal cronoprogramma e dalla raccolta dati cantiere — niente più nottate a costruire il report del lunedì mattina.",
      },
      {
        q: "Posso importare il prezzario Regione Lombardia nei miei preventivi?",
        a: "Sì. Il prezzario Lombardia si importa in Excel o PDF, voci indicizzate con codice ufficiale. Utile soprattutto per gare di Comune di Bergamo, ATS Bergamo e ASST Papa Giovanni XXIII che lo richiedono esplicitamente nei documenti di gara.",
      },
      {
        q: "Cantieri stagionali in Val Seriana con neve: come gestisco le sospensioni e l'avvio primaverile?",
        a: "Apri commessa a inizio anno con cronoprogramma stagionale: tieni in sospensione i mesi non operativi, riprendi a primavera senza ricreare la commessa. I costi sostenuti in inverno (sorveglianza, accantonamenti) restano correttamente attribuiti.",
      },
      {
        q: "Ho 20 cantieri di ristrutturazione residenziale aperti in città e in valle: come faccio a sapere quali stanno erodendo margine?",
        a: "Dashboard con tutti i cantieri visualizzati per margine residuo, percentuale di completamento e scostamento da preventivo. I cantieri in rosso (margine sotto soglia) emergono subito — intervieni prima che il buco si chiuda solo a fine commessa.",
      },
    ],
  },

  modena: {
    name: "Modena",
    region: "Emilia-Romagna",
    slug: "modena",
    province: "MO",
    lat: 44.6471,
    lon: 10.9252,
    heroTitle: "Gestionale Edilizia per Imprese di Modena",
    heroSubtitle:
      "Software gestionale per imprese edili modenesi: gestione cantieri, preventivi, fatturazione elettronica e controllo margini. L'Emilia produttiva merita un gestionale che funziona come le sue imprese.",
    heroImage: "/hero/stock/cantiere-1562259929-1400.webp",
    localStats: [
      { value: "18+", label: "Imprese edili modenesi attive" },
      { value: "€ 2.4M", label: "Fatturato gestito al mese in provincia di Modena" },
      { value: "25%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti emiliani" },
    ],
    localTestimonial: {
      quote:
        "Modena è un mercato veloce: i clienti vogliono preventivi precisi in 24 ore. Con Edilizia in Cloud li genero in 20 minuti con margini calcolati automaticamente. Ho vinto 3 cantieri che prima perdevo per lentezza.",
      author: "Luca F.",
      company: "Ferrari Costruzioni Srl",
      city: "Modena",
      initials: "LF",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Distretto automotive e meccanico: capannoni e ampliamenti",
        desc: "Modena è il cuore dell'industria motoristica italiana. Le imprese edili lavorano per aziende automotive, fornitori di primo livello e PMI meccaniche che richiedono precisione millimetrica e rispetto dei tempi.",
      },
      {
        emoji: "🌊",
        title: "Alluvioni e rischio idrogeologico: messa in sicurezza",
        desc: "Il territorio modenese è stato colpito da eventi alluvionali. Le imprese edili gestiscono cantieri di messa in sicurezza con fondi pubblici che richiedono rendicontazione puntuale e SAL certificati.",
      },
      {
        emoji: "🏠",
        title: "Boom delle ristrutturazioni nel centro storico UNESCO",
        desc: "Il centro storico di Modena è patrimonio UNESCO. Ogni cantiere richiede autorizzazioni soprintendenza e documentazione specifica. Un gestionale digitale riduce il rischio di errori formali.",
      },
    ],
    relatedCities: [
      { name: "Bologna", slug: "bologna" },
      { name: "Reggio Emilia", slug: "reggio-emilia" },
      { name: "Parma", slug: "parma" },
    ],
    localContext: {
      heading: "Edilizia a Modena: distretto motor valley, ricostruzione post-sisma 2012 e prezzario Regione Emilia-Romagna",
      body: "Modena è il cuore della Motor Valley (Ferrari, Maserati, Lamborghini, Pagani, Ducati nella vicina Bologna): le imprese edili modenesi costruiscono e ampliano stabilimenti automotive con esigenze tecniche elevate. La Bassa modenese — Mirandola, Cavezzo, San Felice — sta ancora completando la ricostruzione post-sisma maggio 2012 con commesse seguite dal Commissario Delegato. La Food Valley genera continuamente cantieri agroalimentari con vincoli HACCP. Il prezzario di riferimento è quello Regione Emilia-Romagna, aggiornato annualmente.",
      prezzarioLink: "https://territorio.regione.emilia-romagna.it/lavori-pubblici",
      prezzarioLabel: "Prezzario opere pubbliche Regione Emilia-Romagna",
    },
    localFaqs: [
      {
        q: "Lavoro su un ampliamento per un fornitore Ferrari: standard qualitativi alti e tempi rigidi. Come gestisco SAL e foto-report?",
        a: "Le commesse automotive hanno SAL spesso settimanali con foto e percentuali per lavorazione. Edilizia in Cloud genera report personalizzabili che invii direttamente al committente — perfetto quando lavori per fornitori di primo livello che vogliono visibilità totale.",
      },
      {
        q: "Posso importare il prezzario Regione Emilia-Romagna nei computi metrici per gare pubbliche?",
        a: "Sì. Il prezzario Emilia-Romagna 2026 si importa in Excel o PDF e le voci restano indicizzate con codici ufficiali. Nelle gare di Comune di Modena, ASL Modena o Provincia richiami direttamente le voci richieste — senza errori manuali che fanno escludere.",
      },
      {
        q: "Ho ancora commesse ricostruzione post-sisma 2012 aperte nella Bassa: come gestisco SAL Commissario e perizia di variante?",
        a: "Le commesse post-sisma hanno categoria dedicata con campo numero pratica regionale, perizia asseverata, SAL approvati dal Commissario per la Ricostruzione e tracciamento contributo. Generi il fascicolo per il controllo in pochi click — anche per pratiche aperte da anni.",
      },
      {
        q: "Stabilimento agroalimentare con vincoli HACCP: come gestisco i preventivi con materiali certificati food-grade?",
        a: "Crei voci di prezzario personalizzate con materiali certificati food-grade (resine epossidiche alimentari, pannelli isotermici, pavimenti drenanti) e le riusi su tutti i cantieri food. Le specifiche tecniche restano allegate al preventivo per il certificatore HACCP.",
      },
    ],
  },

  "reggio-emilia": {
    name: "Reggio Emilia",
    region: "Emilia-Romagna",
    slug: "reggio-emilia",
    province: "RE",
    lat: 44.6989,
    lon: 10.6297,
    heroTitle: "Gestionale Edilizia per Imprese di Reggio Emilia",
    heroSubtitle:
      "Software gestionale per imprese edili reggiane: controllo cantieri, preventivi professionali e fatturazione. Nel cuore dell'Emilia produttiva, scegli il gestionale usato dalle migliori imprese edili locali.",
    heroImage: "/hero/stock/cantiere-1581094288338-1400.webp",
    localStats: [
      { value: "15+", label: "Imprese edili reggiane attive" },
      { value: "€ 2.0M", label: "Fatturato gestito al mese in provincia di Reggio Emilia" },
      { value: "24%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti emiliani" },
    ],
    localTestimonial: {
      quote:
        "A Reggio Emilia le imprese sono abituate all'efficienza. Edilizia in Cloud ci ha permesso di gestire 18 cantieri simultaneamente con un solo ufficio amministrativo. Prima eravamo al collasso.",
      author: "Stefano B.",
      company: "Baroni Costruzioni Srl",
      city: "Reggio Emilia",
      initials: "SB",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Cooperazione e distretto industriale",
        desc: "Reggio Emilia è nota per il modello cooperativistico. Le imprese edili reggiane lavorano con cooperative di produzione che richiedono rendicontazione precisa e sistemi di controllo avanzati.",
      },
      {
        emoji: "🌱",
        title: "Edilizia green e sostenibile in forte crescita",
        desc: "La provincia di Reggio Emilia investe molto in edilizia sostenibile: case passive, certificazioni LEED, efficienza energetica. Le imprese devono documentare puntualmente questi interventi.",
      },
      {
        emoji: "📋",
        title: "Rendicontazione fondi europei e regionali",
        desc: "Molte imprese reggiane accedono a bandi regionali e fondi europei per la riqualificazione. La rendicontazione digitale è obbligatoria e richiede un gestionale preciso e affidabile.",
      },
    ],
    relatedCities: [
      { name: "Modena", slug: "modena" },
      { name: "Bologna", slug: "bologna" },
      { name: "Parma", slug: "parma" },
    ],
    localContext: {
      heading: "Edilizia a Reggio Emilia: cooperative, distretto ceramico e prezzario Emilia-Romagna",
      body: "Reggio Emilia è la provincia delle cooperative di costruzione e delle imprese strutturate: consorzi, general contractor e subappaltatori che lavorano sui capannoni del distretto ceramico di Scandiano e Casalgrande, sulla logistica lungo l'A1, sul residenziale e sulla ricostruzione post-sisma 2012 nella Bassa. Qui il committente chiede SAL puntuali, contabilità di commessa trasparente e documenti di subappalto in ordine: DURC, congruità della manodopera e Cassa Edile di Reggio Emilia sono la routine. I prezzi delle opere pubbliche seguono l'elenco regionale dell'Emilia-Romagna.",
      prezzarioLink: "https://territorio.regione.emilia-romagna.it/lavori-pubblici",
      prezzarioLabel: "Prezzario opere pubbliche Regione Emilia-Romagna",
    },
    localFaqs: [
      {
        q: "Lavoro come subappaltatore per una cooperativa di costruzioni reggiana: come tengo in ordine DURC, congruità e SAL che mi chiedono ogni mese?",
        a: "Ogni commessa ha la sua cartella documenti con le scadenze: DURC, POS, polizze e attestazione di congruità con avviso prima della scadenza. Il SAL lo prepari dalle lavorazioni registrate in cantiere, con le quantità già misurate, e lo mandi in PDF firmato al capocommessa senza rifare i conti a mano.",
      },
      {
        q: "Posso importare l'elenco prezzi delle opere pubbliche dell'Emilia-Romagna nei preventivi?",
        a: "Sì: le voci si importano da Excel o PDF con il codice ufficiale e restano nel tuo listino. Per i lavori privati sul distretto ceramico o sul residenziale crei voci tue con costo, margine e prezzo, e le riusi nei preventivi successivi.",
      },
      {
        q: "Ho squadre tra Reggio, Scandiano e la Bassa: come vedo presenze e costi cantiere per cantiere?",
        a: "Le timbrature con GPS finiscono sulla commessa giusta e diventano costo orario in tempo reale, Cassa Edile compresa. La sera vedi per ogni cantiere ore, materiali consegnati e margine residuo, senza telefonate ai capisquadra.",
      },
    ],
  },

  parma: {
    name: "Parma",
    region: "Emilia-Romagna",
    slug: "parma",
    province: "PR",
    lat: 44.8015,
    lon: 10.3279,
    heroTitle: "Gestionale Edilizia per Imprese di Parma",
    heroSubtitle:
      "Software gestionale per imprese edili parmensi: cantieri, preventivi, fatturazione elettronica e margini. La capitale del Food Valley merita imprese edili competitive e digitalmente attrezzate.",
    heroImage: "/hero/stock/cantiere-1558618666-1400.webp",
    localStats: [
      { value: "14+", label: "Imprese edili parmensi attive" },
      { value: "€ 1.8M", label: "Fatturato gestito al mese in provincia di Parma" },
      { value: "23%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti parmensi" },
    ],
    localTestimonial: {
      quote:
        "Parma è cresciuta tantissimo grazie al Food Valley e alla sede EMA. Le costruzioni non si fermano mai. Con Edilizia in Cloud ho raddoppiato i cantieri gestibili senza assumere personale amministrativo.",
      author: "Andrea M.",
      company: "Meli Costruzioni Srl",
      city: "Parma",
      initials: "AM",
    },
    localProblems: [
      {
        emoji: "🧀",
        title: "Food Valley: stabilimenti e logistica in continua espansione",
        desc: "L'agroalimentare parmense è in crescita costante. Le imprese edili costruiscono e ristrutturano stabilimenti produttivi e logistici con requisiti normativi specifici (HACCP, sicurezza alimentare).",
      },
      {
        emoji: "🏛️",
        title: "Centro storico e palazzi nobiliari: vincoli soprintendenza",
        desc: "Parma ha un patrimonio architettonico straordinario. I cantieri di restauro nel centro richiedono autorizzazioni specifiche, materiali certificati e documentazione fotografica puntuale.",
      },
      {
        emoji: "🏥",
        title: "Polo ospedaliero e universitario: cantieri sanitari",
        desc: "Parma ospita uno dei principali poli ospedalieri e universitari del Nord Italia. Le imprese che lavorano in questi contesti devono rispettare standard tecnici elevati e tempi rigidissimi.",
      },
    ],
    relatedCities: [
      { name: "Reggio Emilia", slug: "reggio-emilia" },
      { name: "Modena", slug: "modena" },
      { name: "Bologna", slug: "bologna" },
    ],
    localContext: {
      heading: "Edilizia a Parma: Food Valley, polo ospedaliero universitario e prezzario Regione Emilia-Romagna",
      body: "Parma è il centro della Food Valley italiana: Barilla, Parmalat, Mutti e centinaia di caseifici e prosciuttifici alimentano un mercato continuo di stabilimenti agroalimentari nuovi e ampliati, con normativa HACCP e celle frigorifere certificate. Il polo ospedaliero universitario (Maggiore) genera commesse sanitarie con specifiche tecniche stringenti. Il centro storico di Parma e i palazzi nobiliari (Palazzo della Pilotta, Reggia di Colorno) richiedono restauri sotto vincolo Soprintendenza. Il prezzario di riferimento è quello Regione Emilia-Romagna.",
      prezzarioLink: "https://territorio.regione.emilia-romagna.it/lavori-pubblici",
      prezzarioLabel: "Prezzario opere pubbliche Regione Emilia-Romagna",
    },
    localFaqs: [
      {
        q: "Costruisco un caseificio per stagionatura Parmigiano-Reggiano: tempi e umidità sono critici. Come gestisco la commessa?",
        a: "I caseifici hanno specifiche edili rigide (pendenze pavimento, ventilazione, umidità controllata). Edilizia in Cloud gestisce il computo per fase con materiali certificati, e i SAL si allineano alle pause per le ispezioni del Consorzio. Niente improvvisazione su un cantiere che vale milioni.",
      },
      {
        q: "Posso importare il prezzario Regione Emilia-Romagna nei computi metrici delle gare?",
        a: "Sì. Il prezzario Emilia-Romagna 2026 si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo nelle gare di Azienda Ospedaliero-Universitaria di Parma, Comune e Università che lo richiedono nei capitolati.",
      },
      {
        q: "Lavoro all'Ospedale Maggiore: standard tecnici sanitari + tempi rigidi senza fermare l'attività. Come gestisco la commessa?",
        a: "Le commesse ospedaliere lavorano in cantiere occupato: fasi notturne, isolamento polveri, percorsi sporchi/puliti. Crei un cronoprogramma per fasi con vincoli operativi annotati e il committente sanitario vede in tempo reale dove sei.",
      },
      {
        q: "Restauro in un palazzo nobiliare del centro storico: come gestisco fotodocumentazione Soprintendenza e varianti?",
        a: "Foto ante/in corso/post geolocalizzate per ogni lavorazione, archiviate per pratica con numero protocollo Soprintendenza. Quando emergono varianti (e su un palazzo storico emergono sempre) aggiorni computo e perizia in pochi click senza perdere lo storico delle decisioni prese.",
      },
    ],
  },

  salerno: {
    name: "Salerno",
    region: "Campania",
    slug: "salerno",
    province: "SA",
    lat: 40.6824,
    lon: 14.7681,
    heroTitle: "Gestionale Edilizia per Imprese di Salerno",
    heroSubtitle:
      "Software gestionale per imprese edili salernitane: gestione cantieri, SAL, fatturazione elettronica e controllo margini. Il Sud Italia cresce: le imprese edili di Salerno meritano strumenti digitali efficaci.",
    heroImage: "/hero/stock/cantiere-1504917595217-1400.webp",
    localStats: [
      { value: "13+", label: "Imprese edili salernitane attive" },
      { value: "€ 1.6M", label: "Fatturato gestito al mese in provincia di Salerno" },
      { value: "21%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti campani" },
    ],
    localTestimonial: {
      quote:
        "Con i fondi PNRR il lavoro non manca, ma la rendicontazione è un incubo senza un gestionale. Edilizia in Cloud mi ha salvato: SAL puntuali, documenti sempre in ordine, nessun problema con i controlli.",
      author: "Vincenzo P.",
      company: "Pellegrino Costruzioni Srl",
      city: "Salerno",
      initials: "VP",
    },
    localProblems: [
      {
        emoji: "🌊",
        title: "Costa Amalfitana e Cilento: cantieri in aree protette",
        desc: "La provincia di Salerno include aree UNESCO e parchi nazionali. I cantieri nelle zone costiere e collinari richiedono autorizzazioni ambientali specifiche e documentazione puntuale.",
      },
      {
        emoji: "🏗️",
        title: "PNRR e fondi europei: grande opportunità, tanta burocrazia",
        desc: "Salerno è tra le province con più investimenti PNRR in Campania. Le imprese edili accedono a cantieri importanti ma devono gestire rendicontazione digitale rigorosa e SAL certificati.",
      },
      {
        emoji: "🏛️",
        title: "Riqualificazione urbana e patrimonio storico",
        desc: "Il centro storico di Salerno e i borghi della provincia richiedono interventi di riqualificazione urbana con fondi regionali. La documentazione richiesta dai bandi è complessa e richiede un gestionale preciso.",
      },
    ],
    relatedCities: [
      { name: "Napoli", slug: "napoli" },
      { name: "Bari", slug: "bari" },
      { name: "Roma", slug: "roma" },
    ],
    localContext: {
      heading: "Edilizia a Salerno: Costiera Amalfitana, Piana del Sele e prezzario Regione Campania",
      body: "Salerno è provincia spezzata in tre realtà edili diverse: città capoluogo con riqualificazione del waterfront e zona portuale, Costiera Amalfitana con cantieri logisticamente impossibili (strade strette, materiali calati con grù dal mare, vincoli UNESCO totali), Piana del Sele e Cilento con edilizia agricola e turistica diffusa. La provincia ha attratto importanti fondi PNRR e POR Campania per riqualificazione urbana e infrastrutture. Il prezzario di riferimento è quello Regione Campania, vincolante per opere pubbliche regionali e comunali.",
      prezzarioLink: "https://www.regione.campania.it/regione/it/tematiche/lavori-pubblici/prezzario-regionale-dei-lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Campania (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su una villa in Costiera Amalfitana: niente accesso mezzi pesanti, materiali via mare con calcestruzzo a pompa. Come imputo i costi reali?",
        a: "La Costiera ti costringe a voci di costo che a Eboli non hai: nolo motonave, gruisti, sospensioni, calatura con pompa. Imputi tutto come voci dedicate e a fine commessa hai un vero benchmark: la prossima volta che preventivi in Costiera sai esattamente dove stai andando.",
      },
      {
        q: "Posso importare il prezzario Regione Campania nei computi metrici di gara?",
        a: "Sì. Il prezzario Campania si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Salerno, ASL Salerno, ARSAC e tutte le opere pubbliche regionali — richiami le voci direttamente senza errori.",
      },
      {
        q: "Cantiere ricettivo in Cilento con apertura 1° giugno: come garantisco la consegna nei tempi?",
        a: "Sui ricettivi la data non si sposta. Lavori a ritroso dal 1° giugno con cronoprogramma e Edilizia in Cloud ti avvisa con alert quando una lavorazione critica sta scivolando. Decidi se mettere una squadra extra o avvertire il committente prima del disastro.",
      },
      {
        q: "Partecipo a gare PNRR di Comune di Salerno: come gestisco SAL, anticipazione 20%, DURC e rendicontazione?",
        a: "Le commesse PNRR hanno tipologia dedicata con tracciamento anticipazione, SAL certificati, DURC con alert in scadenza e rendicontazione pronta per Regis. Generi i documenti per i controlli ANAC e Corte dei Conti senza ricostruirli da zero a posteriori.",
      },
    ],
  },

  trieste: {
    name: "Trieste",
    region: "Friuli-Venezia Giulia",
    slug: "trieste",
    province: "TS",
    lat: 45.6495,
    lon: 13.7768,
    heroTitle: "Gestionale Edilizia per Imprese di Trieste",
    heroSubtitle:
      "Software gestionale per imprese edili triestine: gestione cantieri, preventivi, fatturazione e controllo margini. Il crocevia tra Italia, Slovenia e Austria merita strumenti gestionali all'avanguardia.",
    heroImage: "/hero/stock/cantiere-1503387762-1400.webp",
    localStats: [
      { value: "11+", label: "Imprese edili triestine attive" },
      { value: "€ 1.4M", label: "Fatturato gestito al mese in provincia di Trieste" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti del Friuli" },
    ],
    localTestimonial: {
      quote:
        "Trieste è una città unica: cantieri in vecchi palazzi asburgici, porti e infrastrutture. Edilizia in Cloud mi aiuta a gestire la complessità: ogni cantiere ha le sue regole e il gestionale le tiene tutte sotto controllo.",
      author: "Marco K.",
      company: "Kowalski Costruzioni Srl",
      city: "Trieste",
      initials: "MK",
    },
    localProblems: [
      {
        emoji: "⚓",
        title: "Porto franco e infrastrutture",
        desc: "Trieste è il principale porto dell'Italia nord-orientale. Le imprese edili lavorano su infrastrutture portuali, magazzini e strutture logistiche con requisiti tecnici elevati e normative specifiche.",
      },
      {
        emoji: "🏛️",
        title: "Patrimonio asburgico: restauro e vincoli storici",
        desc: "Il centro storico di Trieste è ricco di edifici Liberty e neoclassici. I cantieri di restauro richiedono materiali certificati, tecnici specializzati e documentazione fotografica obbligatoria.",
      },
      {
        emoji: "🌍",
        title: "Mercato transfrontaliero: cantieri in Slovenia e Croazia",
        desc: "Molte imprese triestine lavorano anche oltre confine. Gestire commesse in più paesi richiede un gestionale flessibile che distingua le normative italiane da quelle estere.",
      },
    ],
    relatedCities: [
      { name: "Venezia", slug: "venezia" },
      { name: "Udine", slug: "udine" },   // udine config aggiunto in Fix 65
      { name: "Padova", slug: "padova" },
    ],
    localContext: {
      heading: "Edilizia a Trieste: porto, restauro asburgico e prezzario Regione FVG",
      body: "Trieste è città di confine: cantieri portuali con normativa specifica per le aree demaniali (Autorità di Sistema Portuale del Mare Adriatico Orientale), restauro del patrimonio asburgico (palazzi neoclassici e Liberty del centro), cantieri transfrontalieri con squadre italiane, slovene e croate (occorre gestire CCNL diversi e documentazione bilingue). Il prezzario Regione Friuli-Venezia Giulia è il riferimento ufficiale, aggiornato annualmente dalla Direzione Centrale Infrastrutture e Territorio.",
      prezzarioLink: "https://www.regione.fvg.it/rafvg/cms/RAFVG/infrastrutture-lavori-pubblici/lavori-pubblici/prezziario-regionale-opere/",
      prezzarioLabel: "Prezzario Regione FVG (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro nel porto di Trieste su concessioni demaniali: come gestisco autorizzazioni Autorità Portuale e tempi di accesso?",
        a: "I cantieri portuali hanno vincoli rigidi su orari, accessi merci e coordinamento con operatività navale. Ogni commessa ha numero pratica Autorità Portuale, autorizzazioni scadenze e documenti archiviati per pratica — tutto pronto quando arrivano ispezioni.",
      },
      {
        q: "Posso importare il prezzario Regione FVG nelle gare di Comune di Trieste e Università?",
        a: "Sì. Il prezzario FVG si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Trieste, ASUGI e Università degli Studi di Trieste che richiedono il riferimento al prezzario regionale vigente.",
      },
      {
        q: "Restauro in palazzo Liberty del centro storico: come gestisco fotodocumentazione Soprintendenza e materiali certificati?",
        a: "Ogni intervento ha scheda con foto ante/in corso/post e specifica tecnica del materiale (stucchi, dorature, calci aeree). Edilizia in Cloud archivia tutto per pratica con numero protocollo Soprintendenza — utile anche quando, dopo anni, devi dimostrare cosa hai fatto.",
      },
      {
        q: "Ho squadre miste italiane e slovene su un cantiere: come gestisco contratti, ore lavorate e documentazione bilingue?",
        a: "Gestisci squadre miste con CCNL e tariffe orarie differenziate per nazionalità del lavoratore. Le ore confluiscono sulla commessa col costo corretto e generi documenti bilingue (italiano/sloveno) per il committente transfrontaliero.",
      },
    ],
  },

  cagliari: {
    name: "Cagliari",
    region: "Sardegna",
    slug: "cagliari",
    province: "CA",
    lat: 39.2238,
    lon: 9.1217,
    heroTitle: "Gestionale Edilizia per Imprese di Cagliari",
    heroSubtitle:
      "Software gestionale per imprese edili cagliaritane: gestione cantieri, SAL, preventivi e fatturazione. La Sardegna cresce: le imprese edili di Cagliari e dell'isola meritano strumenti digitali al passo con i tempi.",
    heroImage: "/hero/stock/cantiere-1581578731548-1400.webp",
    localStats: [
      { value: "10+", label: "Imprese edili sarde attive" },
      { value: "€ 1.3M", label: "Fatturato gestito al mese in Sardegna" },
      { value: "20%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti sardi" },
    ],
    localTestimonial: {
      quote:
        "In Sardegna il mercato edilizio è in forte ripresa. Con Edilizia in Cloud gestisco cantieri da Cagliari a Nuoro con un'unica piattaforma: risparmio 2 giorni di lavoro a settimana solo di burocrazia.",
      author: "Antonio P.",
      company: "Piras Costruzioni Srl",
      city: "Cagliari",
      initials: "AP",
    },
    localProblems: [
      {
        emoji: "☀️",
        title: "Boom del turismo: hotel e strutture ricettive",
        desc: "La Sardegna è una delle mete turistiche più ambite. Le imprese edili costruiscono e ristrutturano resort, hotel e ville private con tempi stagionali rigidissimi: tutto deve essere pronto per la stagione estiva.",
      },
      {
        emoji: "🏝️",
        title: "Logistica isolana: costi di trasporto elevati",
        desc: "Ogni materiale in Sardegna arriva via traghetto o aereo. I costi logistici incidono significativamente sui budget. Tracciare questi costi per commessa è essenziale per preventivare correttamente.",
      },
      {
        emoji: "🏗️",
        title: "Fondi PNRR e investimenti pubblici",
        desc: "La Sardegna riceve importanti investimenti PNRR per infrastrutture, scuole e ospedali. Le imprese edili sarde che vogliono accedere a questi appalti devono dotarsi di strumenti di rendicontazione digitali.",
      },
    ],
    relatedCities: [
      { name: "Palermo", slug: "palermo" },
      { name: "Catania", slug: "catania" },
      { name: "Napoli", slug: "napoli" },
    ],
    localContext: {
      heading: "Edilizia a Cagliari: prezzario Regione Sardegna, trasporto materiali via nave e fondi PNRR per l'isola",
      body: "Cagliari è il punto di ingresso del materiale edile in Sardegna: lo stoccaggio del cemento di cementeria locale (Cementir) è ridotto, e quasi tutto l'acciaio, le finiture e i componenti specialistici arrivano via traghetto. Il costo logistico via nave incide tipicamente del 10-15% sul cantiere — voce che a Milano non esiste. La provincia mescola residenziale costiero (Poetto, Quartu, Villasimius), capannoni industriali nella zona di Macchiareddu, riqualificazioni nel centro storico (Castello, Marina, Stampace) e cantieri PNRR distribuiti. Il prezzario di riferimento è quello Regione Sardegna.",
      prezzarioLink: "https://www.regione.sardegna.it/index.php?xsl=509&s=1&v=9&c=42",
      prezzarioLabel: "Prezzario Regione Sardegna (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Materiali in arrivo via traghetto da Civitavecchia o Genova: come gestisco i ritardi nave e impatto sui cantieri?",
        a: "Ogni ordine fornitore ha tracciamento data di partenza e arrivo prevista. Quando una nave salta o slitta vedi subito quali cantieri saranno impattati e puoi avvisare il committente prima che diventi un problema — invece di scoprirlo solo quando manca il materiale in cantiere.",
      },
      {
        q: "Posso importare il prezzario Regione Sardegna nei computi metrici per gare in Sardegna?",
        a: "Sì. Il prezzario Sardegna si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Cagliari, Città Metropolitana, ATS Sardegna e Regione che lo richiedono nei documenti di gara.",
      },
      {
        q: "Cantieri ricettivi sul Poetto con apertura stagionale: come gestisco cronoprogramma e penali da contratto?",
        a: "Sul ricettivo non si scherza con i tempi: prima del 1° giugno tutto deve essere pronto. Lavori con cronoprogramma a ritroso e Edilizia in Cloud ti avvisa con alert quando una lavorazione critica sta scivolando. Decidi se rinforzare squadra o avvertire il committente.",
      },
      {
        q: "Lavoro su un appalto PNRR di scuola a Cagliari: come gestisco SAL, anticipazione 20% e rendicontazione?",
        a: "Le commesse PNRR hanno tipologia dedicata con tracciamento anticipazione, SAL approvati, DURC con alert in scadenza e documentazione pronta per Regis e controlli ANAC. Generi il fascicolo per qualsiasi controllo senza ricostruire mesi di carte da Excel sparsi.",
      },
    ],
  },

  perugia: {
    name: "Perugia",
    region: "Umbria",
    slug: "perugia",
    province: "PG",
    lat: 43.1107,
    lon: 12.3908,
    heroTitle: "Gestionale Edilizia per Imprese di Perugia",
    heroSubtitle:
      "Software gestionale per imprese edili perugine e umbre: gestione cantieri, preventivi, SAL e fatturazione. Il cuore verde d'Italia merita imprese edili moderne e digitalmente competitive.",
    heroImage: "/hero/stock/cantiere-1600585154526-1400.webp",
    localStats: [
      { value: "12+", label: "Imprese edili umbre attive" },
      { value: "€ 1.5M", label: "Fatturato gestito al mese in Umbria" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti umbri" },
    ],
    localTestimonial: {
      quote:
        "Dopo il sisma del 2016 il lavoro in Umbria non è mai mancato. Ma gestire tanti cantieri di ricostruzione contemporaneamente senza un gestionale era impossibile. Edilizia in Cloud ha cambiato tutto.",
      author: "Davide C.",
      company: "Caporali Costruzioni Srl",
      city: "Perugia",
      initials: "DC",
    },
    localProblems: [
      {
        emoji: "🏔️",
        title: "Ricostruzione post-sisma",
        desc: "L'Umbria è ancora in fase di ricostruzione dopo i terremoti del 2016-2017. Le imprese edili gestiscono cantieri con fondi statali che richiedono rendicontazione rigida, SAL certificati e DURC sempre aggiornato.",
      },
      {
        emoji: "🫒",
        title: "Turismo rurale e agriturismo: cantieri di riqualificazione",
        desc: "L'Umbria è tra le regioni italiane con più agriturismi e strutture di turismo rurale. Le imprese edili ristrutturano casali e masserie, spesso con vincoli paesaggistici e contributi regionali.",
      },
      {
        emoji: "🏛️",
        title: "Centri storici e borghi medievali: burocrazia intensa",
        desc: "L'Umbria ha una densità altissima di borghi storici vincolati dalla soprintendenza. Ogni cantiere richiede autorizzazioni multiple e documentazione tecnica che senza un gestionale diventa ingestibile.",
      },
    ],
    relatedCities: [
      { name: "Firenze", slug: "firenze" },
      { name: "Roma", slug: "roma" },
      { name: "Ancona", slug: "ancona" },
    ],
    localContext: {
      heading: "Edilizia a Perugia: ricostruzione post-sisma 2016, borghi medievali e prezzario Regione Umbria",
      body: "L'Umbria è ancora in piena ricostruzione: il sisma 2016 ha colpito la fascia appenninica (Norcia, Cascia, Preci) e i cantieri seguono ancora protocolli del Commissario Straordinario alla Ricostruzione. La provincia di Perugia ha inoltre una densità altissima di borghi medievali vincolati (Assisi UNESCO, Spello, Bevagna, Trevi) dove ogni intervento passa da Soprintendenza, e una vivacità di agriturismi e cantine vinicole (Sagrantino, Grechetto) che commissionano regolarmente ampliamenti. Il prezzario di riferimento è quello Regione Umbria, integrato con i prezzari del Commissario Sisma per le opere finanziate.",
      prezzarioLink: "https://www.regione.umbria.it/lavori-pubblici/elenco-prezzi",
      prezzarioLabel: "Prezzario Regione Umbria (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su una ricostruzione post-sisma in Valnerina: come gestisco SAL Commissario, contributo concesso e cessione del credito?",
        a: "Le commesse sisma 2016 hanno categoria dedicata con campi numero pratica regionale, perizia asseverata, importo contributo concesso, SAL approvati dal Commissario e tracciamento cessione del credito. Generi il fascicolo per i controlli ASR senza ricostruirlo da Excel.",
      },
      {
        q: "Posso importare il prezzario Regione Umbria nei computi metrici di gara?",
        a: "Sì. Il prezzario Umbria si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Perugia, USL Umbria 1 e Regione Umbria. Per le commesse sisma puoi affiancare il prezzario Commissario dove richiesto.",
      },
      {
        q: "Restauro in un borgo medievale di Assisi UNESCO: come gestisco autorizzazioni Soprintendenza e fotodocumentazione?",
        a: "Ogni intervento ha scheda con foto ante/in corso/post, geolocalizzate e datate, archiviate per pratica con numero protocollo Soprintendenza. La documentazione resta consultabile anche anni dopo per eventuali ispezioni o varianti.",
      },
      {
        q: "Ristrutturo un agriturismo con vincolo paesaggistico: come gestisco preventivo, varianti in corso d'opera e contributi PSR?",
        a: "Gli agriturismi con contributo PSR Umbria richiedono perizia approvata e SAL coerenti con il programma di spesa. Edilizia in Cloud gestisce le commesse PSR con campi dedicati per il numero pratica e la rendicontazione di spesa pronta per i controlli AGEA.",
      },
    ],
  },

  ancona: {
    name: "Ancona",
    region: "Marche",
    slug: "ancona",
    province: "AN",
    lat: 43.6158,
    lon: 13.5189,
    heroTitle: "Gestionale Edilizia per Imprese di Ancona",
    heroSubtitle:
      "Software gestionale per imprese edili marchigiane: cantieri, preventivi, fatturazione elettronica e controllo margini. Le Marche crescono: le imprese edili di Ancona e della regione meritano strumenti all'altezza.",
    heroImage: "/hero/stock/cantiere-1504307651254-1400.webp",
    localStats: [
      { value: "11+", label: "Imprese edili marchigiane attive" },
      { value: "€ 1.4M", label: "Fatturato gestito al mese nelle Marche" },
      { value: "21%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti marchigiani" },
    ],
    localTestimonial: {
      quote:
        "Dopo il sisma del 2016 le Marche avevano bisogno di imprese edili organizzate. Edilizia in Cloud mi ha dato la struttura per crescere: ora gestisco 12 cantieri di ricostruzione con un team di 8 persone.",
      author: "Massimo L.",
      company: "Luchetti Costruzioni Srl",
      city: "Ancona",
      initials: "ML",
    },
    localProblems: [
      {
        emoji: "🏔️",
        title: "Ricostruzione post-sisma: priorità regionale",
        desc: "Le Marche sono ancora in piena fase di ricostruzione dopo i terremoti del 2016. Le imprese edili gestiscono cantieri con fondi statali che richiedono SAL puntuali, DURC regolare e rendicontazione digitale certificata.",
      },
      {
        emoji: "⚓",
        title: "Porto di Ancona: infrastrutture e logistica",
        desc: "Il porto di Ancona è uno dei principali scali adriatici. Le imprese edili lavorano su infrastrutture portuali e logistiche con requisiti tecnici specifici e tempi stringenti.",
      },
      {
        emoji: "🌊",
        title: "Turismo adriatico: cantieri stagionali intensi",
        desc: "La riviera marchigiana attrae milioni di turisti. Le imprese edili lavorano su strutture ricettive con tempi stagionali rigidi: tutto deve essere pronto entro giugno. Un gestionale digitale è l'unico modo per rispettare i tempi.",
      },
    ],
    relatedCities: [
      { name: "Perugia", slug: "perugia" },
      { name: "Bologna", slug: "bologna" },
      { name: "Roma", slug: "roma" },
    ],
    localContext: {
      heading: "Edilizia ad Ancona: ricostruzione post-sisma 2016, riviera adriatica e prezzario Regione Marche",
      body: "Ancona è capoluogo di una regione ancora segnata dal sisma 2016: l'entroterra marchigiano (Camerino, Visso, Tolentino, Macerata) ha cantieri di ricostruzione ancora attivi sotto il Commissario Straordinario. La costa adriatica vive di edilizia ricettiva e residenziale stagionale (Conero, Senigallia, Civitanova), mentre il porto di Ancona genera commesse infrastrutturali con Autorità di Sistema Portuale del Mare Adriatico Centrale. Il prezzario di riferimento è quello Regione Marche, integrato con i prezzari Commissario per le opere finanziate dal sisma.",
      prezzarioLink: "https://www.regione.marche.it/Regione-Utile/Edilizia",
      prezzarioLabel: "Prezzario Regione Marche (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su ricostruzione post-sisma 2016 nell'entroterra marchigiano: come gestisco la pratica con il Commissario Straordinario?",
        a: "Le commesse sisma 2016 hanno categoria dedicata con numero scheda AeDES, perizia asseverata, importo contributo concesso, SAL certificati e tracciamento cessione del credito. Tutto il fascicolo è pronto per i controlli ASR senza ricostruirlo manualmente.",
      },
      {
        q: "Posso importare il prezzario Regione Marche nei computi metrici di gara?",
        a: "Sì. Il prezzario Marche si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Ancona, ASUR Marche e Provincia. Per le commesse sisma affianchi il prezzario Commissario quando richiesto dalla pratica.",
      },
      {
        q: "Cantieri ricettivi sulla riviera del Conero con apertura entro fine maggio: come monitoro produttività e cronoprogramma?",
        a: "Sul ricettivo non si sgarra coi tempi. Lavori a ritroso dalla data di apertura con cronoprogramma e Edilizia in Cloud ti avvisa con alert quando una lavorazione critica sta scivolando. Decidi se rinforzare squadra o aprire variante prima del disastro.",
      },
      {
        q: "Lavoro nel porto di Ancona su concessioni demaniali: come gestisco le autorizzazioni di Autorità Portuale?",
        a: "I cantieri portuali hanno vincoli rigidi su orari, accessi e coordinamento con operatività navale. Ogni commessa ha numero pratica Autorità Portuale, scadenze autorizzazioni con alert e documenti archiviati per pratica — utile per le ispezioni demaniali.",
      },
    ],
  },
  udine: {
    name: "Udine",
    region: "Friuli-Venezia Giulia",
    slug: "udine",
    province: "UD",
    lat: 46.0711,
    lon: 13.2350,
    heroTitle: "Gestionale Edilizia per Imprese di Udine",
    heroSubtitle:
      "Il software gestionale per imprese edili friulane: cantieri, margini, fatturazione elettronica e gestione squadre. Il Friuli ha una tradizione costruttiva d'eccellenza — noi la supportiamo con tecnologia.",
    heroImage: "/hero/stock/cantiere-1541888946425-1400.webp",
    localStats: [
      { value: "12+", label: "Imprese edili friulane attive" },
      { value: "€ 1.8M", label: "Fatturato gestito al mese in FVG" },
      { value: "24%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti friulani" },
    ],
    localTestimonial: {
      quote:
        "Lavoriamo su costruzioni residenziali e industriali in tutta la provincia. Con Edilizia in Cloud ho il controllo su ogni cantiere attivo, anche quelli in zone remote del Friuli.",
      author: "Michele B.",
      company: "Costruzioni Bellutti",
      city: "Udine",
      initials: "MB",
    },
    localProblems: [
      {
        emoji: "🏔️",
        title: "Cantieri in zone alpine e pedemontane",
        desc: "Il Friuli ha cantieri in zone montane e pedemontane dove la connettività è limitata. La modalità offline dell'app mobile è essenziale per aggiornare lo stato dei lavori senza segnale.",
      },
      {
        emoji: "🌍",
        title: "Filiera con fornitori del Sud Europa",
        desc: "Le imprese friulane lavorano spesso con fornitori sloveni e austriaci. La gestione DDT e ordini fornitori in Edilizia in Cloud è multilingue e compatibile con i flussi transfrontalieri.",
      },
      {
        emoji: "🏗️",
        title: "Forte specializzazione in costruzioni industriali",
        desc: "Il Friuli ha una densa presenza di imprese edili specializzate nel costruttivo industriale. I margini su queste commesse richiedono un controllo preciso dei costi per voce.",
      },
    ],
    relatedCities: [
      { name: "Trieste", slug: "trieste" },
      { name: "Venezia", slug: "venezia" },
      { name: "Padova", slug: "padova" },
    ],
    localContext: {
      heading: "Edilizia a Udine e nel Friuli-Venezia Giulia: cosa cambia rispetto al resto d'Italia",
      body: "Il tessuto edile del Friuli-Venezia Giulia ha una specificità: combinare cantieri di pianura friulana con interventi montani della Carnia e del Tarvisiano, e gestire la prossimità transfrontaliera con Slovenia e Austria che apre filiere di fornitura non disponibili altrove in Italia. Le imprese edili di Udine lavorano con prezzario regionale FVG (aggiornato dalla Regione Friuli-Venezia Giulia con cadenza annuale, in genere a marzo) integrato in molti casi con prezzario DEI per le opere specialistiche. La normativa antisismica regionale richiede particolare attenzione su gran parte della provincia, classificata sismicità zona 2-3.",
      prezzarioLink: "https://www.regione.fvg.it/rafvg/cms/RAFVG/infrastrutture-lavori-pubblici/lavori-pubblici/",
      prezzarioLabel: "Prezzario Regione FVG (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Edilizia in Cloud funziona anche per cantieri in zone alpine del Friuli senza connessione stabile?",
        a: "Sì. L'app mobile lavora in modalità offline: il capocantiere registra timbrature, foto e avanzamento sul telefono anche senza rete, e la sincronizzazione avviene automaticamente appena torna il segnale (in genere a fine giornata quando rientra a fondovalle).",
      },
      {
        q: "Posso usare il prezzario Regione FVG dentro Edilizia in Cloud?",
        a: "Sì. Importi il prezzario ufficiale Regione Friuli-Venezia Giulia in formato Excel o PDF e le voci vengono indicizzate per ricerca rapida. Ogni volta che la Regione pubblica un aggiornamento, lo ri-importi con un click senza perdere le associazioni alle tue commesse storiche.",
      },
      {
        q: "Come gestisce Edilizia in Cloud le fatture verso fornitori sloveni e austriaci?",
        a: "Le fatture intracomunitarie (TD17, TD18, TD19) sono gestite nativamente. Il sistema riconosce i codici IVA esteri, applica reverse charge dove dovuto e produce gli XML SDI corretti senza intervento manuale del commercialista.",
      },
      {
        q: "Lavoro su costruzioni industriali nella zona di Manzano e San Daniele: il software regge anche commesse da 800k-1,5M €?",
        a: "Sì. Edilizia in Cloud è usato da imprese friulane su commesse industriali multi-fase con SAL parziali, varianti in corso d'opera, gestione subappaltatori specializzati e ritenute di garanzia. Il sistema di controllo margini in tempo reale è particolarmente utile su queste taglie di cantiere.",
      },
    ],
  },
  messina: {
    name: "Messina",
    region: "Sicilia",
    slug: "messina",
    province: "ME",
    lat: 38.1938,
    lon: 15.5542,
    heroTitle: "Gestionale Edilizia per Imprese di Messina",
    heroSubtitle:
      "Il software gestionale per imprese edili messinesi: gestione cantieri, preventivi, fatturazione elettronica e squadre. Il mercato edilizio dello Stretto richiede organizzazione — noi te la diamo.",
    heroImage: "/hero/stock/cantiere-1621905251189-1400.webp",
    localStats: [
      { value: "10+", label: "Imprese edili messinesi attive" },
      { value: "€ 1.4M", label: "Fatturato gestito al mese in area" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti siciliani" },
    ],
    localTestimonial: {
      quote:
        "A Messina lavoriamo su cantieri di ristrutturazione in tutto lo Stretto. Edilizia in Cloud ci ha permesso di avere il controllo su ogni commessa anche quando siamo su cantieri diversi contemporaneamente.",
      author: "Salvatore R.",
      company: "Recupero Edilizio Messina",
      city: "Messina",
      initials: "SR",
    },
    localProblems: [
      {
        emoji: "🌉",
        title: "Mercato Stretto di Messina e cantieri infrastrutturali",
        desc: "La zona dello Stretto è oggetto di investimenti infrastrutturali importanti. Le imprese edili messinesi devono essere pronte a gestire la documentazione di gara e i SAL puntualmente.",
      },
      {
        emoji: "🏚️",
        title: "Patrimonio edilizio datato e complesso",
        desc: "Messina ha un patrimonio edilizio con problematiche sismiche rilevanti. Le imprese specializzate in consolidamento e adeguamento antisismico devono gestire pratiche tecniche complesse.",
      },
      {
        emoji: "🌊",
        title: "Turismo costiero: tempi stagionali rigidi",
        desc: "La Sicilia nord-orientale attrae turisti da tutto il mondo. Le imprese edili lavorano su strutture ricettive con finestre temporali strette: serve un gestionale che tenga il punto.",
      },
    ],
    relatedCities: [
      { name: "Catania", slug: "catania" },
      { name: "Palermo", slug: "palermo" },
      { name: "Reggio Calabria", slug: "reggio-calabria" },
    ],
    localContext: {
      heading: "Edilizia a Messina: zona sismica Stretto, isole Eolie e prezzario Regione Sicilia",
      body: "Messina è la provincia siciliana con maggiore complessità sismica: l'intera area dello Stretto è classificata zona 1, eredità del terremoto del 1908. Ogni nuovo edificio o adeguamento richiede relazione sismica con calcoli dedicati. La provincia gestisce anche le Eolie (Lipari, Salina, Vulcano, Stromboli, Panarea, Filicudi, Alicudi) dove l'edilizia ha vincoli paesaggistici stringenti, trasporto materiali via mare e stagionalità turistica forte. Il prezzario di riferimento è quello Regione Sicilia con voci specifiche per isole minori.",
      prezzarioLink: "https://pti.regione.sicilia.it/portal/page/portal/PIR_PORTALE/PIR_LaStrutturaRegionale/PIR_AssInfrastruttureMobilita/PIR_Areedinteresse/PIR_PrezzarioRegionale",
      prezzarioLabel: "Prezzario Regione Sicilia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Adeguamento sismico su edificio storico a Messina con Sismabonus: come gestisco asseverazioni e SAL?",
        a: "Le commesse Sismabonus hanno categoria dedicata con scadenze SAL 30/60/saldo, asseverazioni tecniche di congruità, classe di rischio sismico ante/post e tracciamento cessione del credito. Generi il fascicolo per il visto di conformità senza ricostruirlo da Excel sparsi.",
      },
      {
        q: "Posso importare il prezzario Regione Sicilia nei miei preventivi?",
        a: "Sì. Il prezzario Sicilia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Quando il Genio Civile chiede il computo metrico per pratica sismica lo generi direttamente con i codici di prezzario richiesti dalla normativa.",
      },
      {
        q: "Lavoro su un cantiere a Lipari: trasporto via nave, stagionalità turistica, niente reperibilità a settembre. Come gestisco?",
        a: "Il cantiere isola ha voci di trasporto marittimo dedicate (m³ via nave, traghetti, movimentazione a terra) e cronoprogramma con sospensione estiva forzata. A consuntivo vedi il costo logistico reale e impari a preventivare correttamente il prossimo cantiere alle Eolie.",
      },
      {
        q: "Cantieri ricettivi sulla costa tirrenica messinese con apertura entro maggio: come gestisco penali e cronoprogramma?",
        a: "Sui ricettivi i tempi sono ferro. Lavori a ritroso dalla data di apertura, ricevi alert sulle lavorazioni critiche in ritardo e decidi se rinforzare la squadra o avvertire il committente prima che diventi una causa per inadempimento.",
      },
    ],
  },
  livorno: {
    name: "Livorno",
    region: "Toscana",
    slug: "livorno",
    province: "LI",
    lat: 43.5486,
    lon: 10.3161,
    heroTitle: "Gestionale Edilizia per Imprese di Livorno",
    heroSubtitle:
      "Il software gestionale per imprese edili livornesi: controllo cantieri, margini in tempo reale, fatturazione elettronica. Dalla costa agli appalti portuali, Edilizia in Cloud ti supporta.",
    heroImage: "/hero/stock/cantiere-1504328345606-1400.webp",
    localStats: [
      { value: "9+", label: "Imprese edili livornesi attive" },
      { value: "€ 1.2M", label: "Fatturato gestito al mese in area" },
      { value: "23%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti toscani" },
    ],
    localTestimonial: {
      quote:
        "Il porto di Livorno porta una tipologia di cantieri complessa e con documentazione rigorosa. Con Edilizia in Cloud ho tutto sotto controllo: DURC, SAL e fatturazione in un unico posto.",
      author: "Fabio T.",
      company: "Ediltosca Srl",
      city: "Livorno",
      initials: "FT",
    },
    localProblems: [
      {
        emoji: "⚓",
        title: "Porto di Livorno: cantieri tecnici e documentazione rigorosa",
        desc: "Il porto di Livorno è il secondo scalo italiano per traffico merci. Le imprese edili che lavorano su infrastrutture portuali devono gestire documentazione tecnica e di sicurezza complessa.",
      },
      {
        emoji: "🏖️",
        title: "Costa e turismo: cantieri stagionali",
        desc: "La costa livornese è una destinazione turistica rilevante. Le imprese edili lavorano su stabilimenti balneari, hotel e strutture ricettive con tempi stagionali che non ammettono ritardi.",
      },
      {
        emoji: "🏛️",
        title: "Ristrutturazione del centro storico",
        desc: "Il centro storico di Livorno ha un patrimonio edilizio che richiede interventi di recupero e restauro. Le pratiche di tutela e le varianti in corso d'opera vanno gestite con precisione.",
      },
    ],
    relatedCities: [
      { name: "Firenze", slug: "firenze" },
      { name: "Pisa", slug: "pisa" },
      { name: "Prato", slug: "prato" },
    ],
    localContext: {
      heading: "Edilizia a Livorno: porto, costa etrusca e prezzario Regione Toscana",
      body: "Livorno è la seconda città portuale italiana per traffico merci: cantieri sul demanio portuale con autorizzazioni Autorità di Sistema Portuale del Mar Tirreno Settentrionale, edifici Art Nouveau del centro con vincoli Soprintendenza, e cantieri lungo la costa etrusca (Castiglioncello, Cecina, San Vincenzo, Piombino) tipicamente ricettivi. La provincia include anche l'isola d'Elba con logistica via traghetto e stagionalità turistica forte. Il prezzario di riferimento è quello Regione Toscana.",
      prezzarioLink: "https://www.regione.toscana.it/-/prezzario-dei-lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Toscana (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Cantiere sul demanio portuale di Livorno: come gestisco autorizzazioni Autorità Portuale e accessi cantierizzazione?",
        a: "I cantieri portuali hanno vincoli rigidi su orari, accessi merci e coordinamento con operatività navale. Ogni commessa ha numero pratica Autorità Portuale, scadenze autorizzazioni con alert e foto-report archiviati per pratica — utile per ispezioni demaniali.",
      },
      {
        q: "Posso importare il prezzario Regione Toscana nei computi metrici di gara?",
        a: "Sì. Il prezzario Toscana si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Livorno, ASL Toscana Nord-Ovest e Provincia che lo richiedono nei capitolati.",
      },
      {
        q: "Cantiere ricettivo all'Elba con stagionalità: come gestisco trasporto materiali via traghetto e tempi rigidi?",
        a: "Il cantiere isola ha voci dedicate per traghetto (nolo, andata/ritorno, movimentazione), cronoprogramma con apertura entro 1° giugno fisso e alert sulle lavorazioni critiche in ritardo. Decidi se rinforzare squadra prima che il committente apra una controversia.",
      },
      {
        q: "Restauro di un edificio Liberty in centro Livorno con vincolo Soprintendenza: come gestisco fotodocumentazione?",
        a: "Ogni intervento ha scheda con foto ante/in corso/post geolocalizzate, archiviate per pratica con numero protocollo Soprintendenza. Quando la pratica torna dopo mesi con richieste integrazioni, ritrovi tutto in due secondi senza scavare in vecchie chat.",
      },
    ],
  },
  prato: {
    name: "Prato",
    region: "Toscana",
    slug: "prato",
    province: "PO",
    lat: 43.8777,
    lon: 11.1022,
    heroTitle: "Gestionale Edilizia per Imprese di Prato",
    heroSubtitle:
      "Il software gestionale per imprese edili pratesi: cantieri, margini reali, fatturazione elettronica e gestione squadre. Il distretto tessile pratese ha bisogno di capannoni e logistica — noi gestiamo i cantieri.",
    heroImage: "/hero/stock/cantiere-1562259929-1400.webp",
    localStats: [
      { value: "11+", label: "Imprese edili pratesi attive" },
      { value: "€ 1.5M", label: "Fatturato gestito al mese in area" },
      { value: "25%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti pratesi" },
    ],
    localTestimonial: {
      quote:
        "A Prato lavoriamo molto su capannoni industriali e logistica per il distretto tessile. Con Edilizia in Cloud i preventivi sono precisi al centesimo e i margini non hanno più sorprese.",
      author: "Giovanni M.",
      company: "Edilprato Costruzioni",
      city: "Prato",
      initials: "GM",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Distretto tessile: capannoni e logistica",
        desc: "Prato è il più grande distretto tessile d'Europa. Le imprese edili lavorano principalmente su capannoni industriali, magazzini e strutture logistiche con richieste tecniche precise.",
      },
      {
        emoji: "🌆",
        title: "Crescita residenziale nell'hinterland",
        desc: "La crescita demografica dell'area metropolitana di Firenze-Prato-Pistoia spinge la domanda di residenziale. Le imprese edili gestiscono cantieri di nuova costruzione con cantieri paralleli.",
      },
      {
        emoji: "🔧",
        title: "Manutenzione del patrimonio industriale",
        desc: "Il patrimonio industriale pratese richiede manutenzione continua. Le imprese specializzate devono gestire più commesse di manutenzione contemporaneamente con costi orari precisi.",
      },
    ],
    relatedCities: [
      { name: "Firenze", slug: "firenze" },
      { name: "Livorno", slug: "livorno" },
      { name: "Bologna", slug: "bologna" },
    ],
    localContext: {
      heading: "Edilizia a Prato: distretto tessile, capannoni industriali e prezzario Regione Toscana",
      body: "Prato è il distretto tessile più grande d'Europa: il tessuto edile pratese lavora prevalentemente su capannoni industriali, espansioni di laboratori tessili e logistica per moda fast (Macrolotto). La componente residenziale è cresciuta molto con la comunità cinese (sopra i 25.000 residenti) che ha ridisegnato il mercato immobiliare di seconda fascia. La provincia ha vincoli idraulici importanti per il rischio esondazione Bisenzio. Il prezzario di riferimento è quello Regione Toscana, lo stesso usato a Firenze e Livorno.",
      prezzarioLink: "https://www.regione.toscana.it/-/prezzario-dei-lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Toscana (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Capannone tessile con esigenze specifiche (impianti aspirazione, fognature industriali): come gestisco il preventivo?",
        a: "I capannoni tessili hanno impiantistica specialistica (aspirazione polveri, scarichi industriali, antincendio AIB). Crei voci di prezzario personalizzate riusabili e a fine commessa hai un benchmark vero per il prossimo capannone con stessa destinazione d'uso.",
      },
      {
        q: "Posso importare il prezzario Regione Toscana nei computi metrici?",
        a: "Sì. Il prezzario Toscana si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Prato, ASL Toscana Centro e Provincia che lo richiedono nei capitolati.",
      },
      {
        q: "Cantiere nella fascia esondabile del Bisenzio: come gestisco vincoli idraulici e autorizzazioni Genio Civile?",
        a: "Le commesse in fascia esondabile hanno categoria dedicata con vincoli annotati, scadenze autorizzazioni Genio Civile, perizia idraulica e documentazione asseverata. Tutto archiviato per pratica — ricerca rapida quando arrivano controlli o subentra una variante.",
      },
      {
        q: "Lavoro con committenti cinesi che vogliono tempi rapidi e costi chiari: come gestisco preventivi e cronoprogramma?",
        a: "Il committente cinese vuole certezza su costo e tempo. Generi preventivi articolati per fase con cronoprogramma allegato, e dai accesso in lettura alla dashboard cantiere — il committente vede in tempo reale dove sei senza chiamarti ogni due giorni.",
      },
    ],
  },
  vicenza: {
    name: "Vicenza",
    region: "Veneto",
    slug: "vicenza",
    province: "VI",
    lat: 45.5455,
    lon: 11.5354,
    heroTitle: "Gestionale Edilizia per Imprese di Vicenza",
    heroSubtitle:
      "Il software gestionale per imprese edili vicentine: controllo cantieri, margini per commessa, fatturazione elettronica. Il Veneto industriale ha bisogno di un gestionale all'altezza — questo è Edilizia in Cloud.",
    heroImage: "/hero/stock/cantiere-1581094288338-1400.webp",
    localStats: [
      { value: "13+", label: "Imprese edili vicentine attive" },
      { value: "€ 1.9M", label: "Fatturato gestito al mese in area" },
      { value: "26%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti veneti" },
    ],
    localTestimonial: {
      quote:
        "Il Vicentino ha molta edilizia industriale e artigianale. Con Edilizia in Cloud riesco a gestire le commesse in parallelo senza perdere traccia dei costi di ogni cantiere.",
      author: "Roberto V.",
      company: "Costruzioni Venete Srl",
      city: "Vicenza",
      initials: "RV",
    },
    localProblems: [
      {
        emoji: "🏭",
        title: "Polo industriale e artigianale denso",
        desc: "Vicenza è nel cuore del Nord-Est produttivo. Le imprese edili lavorano su capannoni, ampliamenti e ristrutturazioni industriali con committenti esigenti sui tempi e sui costi.",
      },
      {
        emoji: "🏛️",
        title: "Patrimonio palladiano: restauro di pregio",
        desc: "Vicenza è Patrimonio UNESCO grazie all'architettura palladiana. Le imprese edili specializzate in restauro devono gestire pratiche di tutela complesse e materiali specifici.",
      },
      {
        emoji: "🌿",
        title: "Espansione residenziale nella fascia pedemontana",
        desc: "La fascia pedemontana vicentina è in forte crescita residenziale. Le imprese edili gestiscono nuove costruzioni in zone con vincoli paesaggistici e idrogeologici.",
      },
    ],
    relatedCities: [
      { name: "Verona", slug: "verona" },
      { name: "Padova", slug: "padova" },
      { name: "Venezia", slug: "venezia" },
    ],
    localContext: {
      heading: "Edilizia a Vicenza: distretto orafo, architettura palladiana UNESCO e prezzario Regione Veneto",
      body: "Vicenza è il triangolo del Nordest produttivo: distretto orafo nel comune capoluogo (oltre 1.000 aziende), concerie nell'area di Arzignano, meccanica nella pedemontana (Schio, Thiene, Bassano). Le imprese edili vicentine lavorano molto su capannoni industriali con esigenze specifiche (camere bianche per orafo, scarichi industriali per conceria), ma anche su restauro nelle ville palladiane UNESCO (Villa Rotonda, Villa Pisani) e nei centri storici di pregio. Il prezzario di riferimento è quello Regione Veneto.",
      prezzarioLink: "https://www.regione.veneto.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Veneto (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Capannone per orafo con camere bianche e impianti antifurto: come gestisco preventivo specialistico?",
        a: "I cantieri orafi hanno specifiche tecniche stringenti (camere bianche, sistemi antintrusione, aspirazione fumi processi). Crei voci di prezzario personalizzate riusabili e il preventivo articolato per fase tiene separate strutture, impianti e finiture certificate.",
      },
      {
        q: "Posso importare il prezzario Regione Veneto nei computi metrici di gara?",
        a: "Sì. Il prezzario Veneto si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Vicenza, ULSS 8 Berica e Provincia che lo richiedono nei capitolati. Negli appalti Soprintendenza richiami direttamente la voce ufficiale.",
      },
      {
        q: "Restauro in villa palladiana UNESCO: come gestisco fotodocumentazione Soprintendenza e materiali certificati?",
        a: "Le ville palladiane sono cantieri delicatissimi: foto ante/in corso/post geolocalizzate, specifica tecnica di ogni materiale (calci aeree, stucchi, dorature), archiviate per pratica con numero protocollo Soprintendenza. Tutto pronto se arriva ispezione anche anni dopo.",
      },
      {
        q: "Conceria in Valle del Chiampo con vincoli ambientali: come gestisco autorizzazioni e SAL?",
        a: "Le concerie hanno vincoli ambientali pesanti (AIA, scarichi, emissioni). Crei commessa con scadenze autorizzazioni AIA, perizia ambientale, SAL con foto degli interventi conformi. Quando arrivano controlli ARPAV hai il dossier pronto da mostrare.",
      },
    ],
  },
  "reggio-calabria": {
    name: "Reggio Calabria",
    region: "Calabria",
    slug: "reggio-calabria",
    province: "RC",
    lat: 38.1113,
    lon: 15.6474,
    heroTitle: "Gestionale Edilizia per Imprese di Reggio Calabria",
    heroSubtitle: "Il software gestionale per imprese edili reggine: gestione cantieri, SAL, fatturazione elettronica e squadre. La Calabria sta crescendo — noi ti aiutiamo a crescere con lei.",
    heroImage: "/hero/stock/cantiere-1558618666-1400.webp",
    localStats: [
      { value: "8+", label: "Imprese edili reggine attive" },
      { value: "€ 1.1M", label: "Fatturato gestito al mese in area" },
      { value: "21%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti calabresi" },
    ],
    localTestimonial: {
      quote: "Lavoriamo su appalti pubblici e privati in tutta la Calabria. Con Edilizia in Cloud ho finalmente il controllo su ogni cantiere — SAL puntuali, DURC sempre aggiornato e margini in tempo reale.",
      author: "Carmelo S.",
      company: "Costruzioni Meridionali Srl",
      city: "Reggio Calabria",
      initials: "CS",
    },
    localProblems: [
      { emoji: "🏗️", title: "Appalti pubblici e PNRR in Calabria", desc: "La Calabria è tra le regioni con più fondi PNRR assegnati per infrastrutture e edilizia pubblica. Le imprese devono gestire documentazione rigorosa, SAL puntuale e rendicontazione digitale per non perdere i pagamenti." },
      { emoji: "⚓", title: "Porto di Gioia Tauro: cantieri logistici", desc: "Il porto di Gioia Tauro è il più grande hub container del Mediterraneo. Le imprese edili della provincia lavorano su infrastrutture portuali e logistiche con requisiti tecnici specifici." },
      { emoji: "🌊", title: "Costa e turismo: cantieri stagionali intensi", desc: "La costa calabrese attrae milioni di turisti ogni estate. Le imprese edili lavorano su strutture ricettive con finestre temporali rigide — un gestionale digitale è l'unico modo per rispettare i tempi." },
    ],
    relatedCities: [
      { name: "Messina", slug: "messina" },
      { name: "Catania", slug: "catania" },
      { name: "Cosenza", slug: "cosenza" },
    ],
    localContext: {
      heading: "Edilizia a Reggio Calabria: zona sismica 1, PNRR, Gioia Tauro e prezzario Regione Calabria",
      body: "Reggio Calabria lavora in zona sismica 1: adeguamento e miglioramento sismico, consolidamenti e nuove costruzioni con una documentazione strutturale che committente e Regione vogliono completa. A questo si sommano i cantieri PNRR dei Comuni, il porto di Gioia Tauro con la sua logistica e la costa tirrenica e ionica con turistico e residenziale stagionali. Subappalti, DURC e congruità della manodopera sono il primo controllo delle stazioni appaltanti; il prezzario regionale della Calabria è la base di ogni computo pubblico.",
      prezzarioLink: "https://www.regione.calabria.it/website/portaltemplates/view/view.cfm?13415",
      prezzarioLabel: "Prezzario Regione Calabria (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Nei cantieri PNRR dei Comuni reggini mi chiedono congruità della manodopera e DURC di tutta la filiera: come li tengo sotto controllo?",
        a: "Ogni subappaltatore ha la sua scheda con DURC, POS e polizze in scadenza e avviso automatico; la congruità la verifichi con le ore registrate in cantiere contro l'importo lavori, prima che lo faccia la stazione appaltante. Se un documento è scaduto, il pagamento viene segnalato.",
      },
      {
        q: "Adeguamento sismico su edifici esistenti: come gestisco varianti e documentazione strutturale?",
        a: "Ogni variante nasce dal cantiere con foto, quantità e firma del cliente e diventa una voce di SAL: nulla resta fuori fattura. I documenti strutturali e le certificazioni dei materiali stanno nella cartella della commessa, pronti per il collaudo.",
      },
      {
        q: "Ho cantieri tra Reggio, la costa ionica e la Piana di Gioia Tauro: l'app funziona anche dove non c'è rete?",
        a: "Sì. Il rapportino, le foto e la presenza si salvano sul telefono e partono da soli appena torna la connessione. In ufficio vedi per ogni cantiere ore, materiali e margine aggiornati, senza aspettare il venerdì.",
      },
    ],
  },
  foggia: {
    name: "Foggia",
    region: "Puglia",
    slug: "foggia",
    province: "FG",
    lat: 41.4621,
    lon: 15.5444,
    heroTitle: "Gestionale Edilizia per Imprese di Foggia",
    heroSubtitle: "Il software gestionale per imprese edili foggiane: cantieri, margini, fatturazione elettronica e gestione squadre. La Capitanata ha un mercato edile in crescita — sii pronto a gestirlo.",
    heroImage: "/hero/stock/cantiere-1504917595217-1400.webp",
    localStats: [
      { value: "9+", label: "Imprese edili foggiane attive" },
      { value: "€ 1.2M", label: "Fatturato gestito al mese in area" },
      { value: "22%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti pugliesi" },
    ],
    localTestimonial: {
      quote: "In provincia di Foggia lavoriamo su cantieri agricoli, residenziali e appalti pubblici. Con Edilizia in Cloud riesco a tenere sotto controllo ogni commessa senza perdere ore in carta e telefonate.",
      author: "Michele D.",
      company: "Edil Daunia Srl",
      city: "Foggia",
      initials: "MD",
    },
    localProblems: [
      { emoji: "🌾", title: "Edilizia rurale e agrituristica", desc: "La Capitanata è la più grande pianura agricola d'Italia. Le imprese edili lavorano su strutture agricole, magazzini, serre e agriturismi con tipologie costruttive specifiche." },
      { emoji: "🏗️", title: "Infrastrutture e grandi appalti pubblici", desc: "Foggia beneficia di importanti investimenti PNRR per infrastrutture viarie e scolastiche. Le imprese che partecipano agli appalti devono gestire SOA aggiornata e rendicontazione precisa." },
      { emoji: "🌡️", title: "Cantieri in condizioni climatiche estreme", desc: "Le estati foggiane sono tra le più calde d'Italia, con temperature che impattano la produttività in cantiere. Un gestionale che traccia ore reali e produttività per squadra è essenziale per calcolare i margini reali." },
    ],
    relatedCities: [
      { name: "Bari", slug: "bari" },
      { name: "Taranto", slug: "taranto" },
      { name: "Napoli", slug: "napoli" },
    ],
    localContext: {
      heading: "Edilizia a Foggia: Tavoliere agricolo, agrivoltaico in espansione e prezzario Regione Puglia",
      body: "La Capitanata è la più grande pianura agricola d'Italia: il tessuto edile foggiano vive di edilizia rurale (magazzini, stalle, frantoi, agriturismi), grandi impianti agrivoltaici (la provincia è capofila in Italia per potenza installata) e infrastrutture viarie e scolastiche finanziate con PNRR. Le estati superano stabilmente i 38°C — la produttività in cantiere ne risente e va misurata. Il prezzario di riferimento è quello Regione Puglia, integrato con i prezzari ANCE provinciali per le specialistiche agroalimentari.",
      prezzarioLink: "https://www.regione.puglia.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Puglia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Costruisco un impianto agrivoltaico nel Tavoliere: come gestisco SAL, rendicontazione GSE e fatturazione in regime agevolato?",
        a: "Le commesse FER hanno tipologia dedicata con campi per potenza installata, componentistica (pannelli, inverter, strutture), date di connessione e documentazione GSE. Generi rendicontazioni Terna e fatture in regime IVA agevolata senza errori manuali.",
      },
      {
        q: "Posso importare il prezzario Regione Puglia nei computi metrici di gara?",
        a: "Sì. Il prezzario Puglia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Foggia, ASL Foggia e Provincia che lo richiedono nei capitolati — riduci errori di trascrizione che fanno escludere offerte.",
      },
      {
        q: "Le estati a 40°C bloccano la produttività delle squadre: come traccio ore reali e impatto sul margine commessa?",
        a: "I capocantiere registrano ore effettive in cantiere e Edilizia in Cloud calcola la produttività per squadra confrontandola col preventivo. Se nei mesi caldi cala del 25%, lo vedi nero su bianco e impari a preventivare correttamente i mesi estivi.",
      },
      {
        q: "Lavoro su un agriturismo finanziato con PSR Puglia: come gestisco perizia, SAL e rendicontazione AGEA?",
        a: "Le commesse PSR hanno categoria dedicata con numero pratica regionale, perizia approvata, SAL coerenti con programma di spesa e documentazione pronta per i controlli AGEA. Niente ricostruzioni a posteriori — il fascicolo è sempre completo.",
      },
    ],
  },
  pescara: {
    name: "Pescara",
    region: "Abruzzo",
    slug: "pescara",
    province: "PE",
    lat: 42.4618,
    lon: 14.2138,
    heroTitle: "Gestionale Edilizia per Imprese di Pescara",
    heroSubtitle: "Il software gestionale per imprese edili pescaresi: controllo cantieri, margini reali, fatturazione elettronica. L'Abruzzo cresce — Edilizia in Cloud cresce con te.",
    heroImage: "/hero/stock/cantiere-1503387762-1400.webp",
    localStats: [
      { value: "11+", label: "Imprese edili pescaresi attive" },
      { value: "€ 1.5M", label: "Fatturato gestito al mese in area" },
      { value: "24%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti abruzzesi" },
    ],
    localTestimonial: {
      quote: "Pescare ha un mercato edile dinamico tra residenziale, turistico e ricostruzione post-sisma. Con Edilizia in Cloud gestisco tutto in un'unica piattaforma — anche il DURC e le scadenze documentali.",
      author: "Luca P.",
      company: "Costruzioni Adriatiche Srl",
      city: "Pescara",
      initials: "LP",
    },
    localProblems: [
      { emoji: "🏖️", title: "Turismo adriatico: cantieri costieri e ricettivi", desc: "Pescara è la capitale turistica dell'Adriatico abruzzese. Le imprese edili lavorano su hotel, stabilimenti balneari e residenziale con tempi stagionali rigidi che non ammettono ritardi." },
      { emoji: "🏔️", title: "Ricostruzione post-sisma in Abruzzo", desc: "L'Abruzzo ha vissuto terremoti devastanti. Le imprese edili specializzate in ricostruzione e adeguamento sismico devono gestire pratiche specifiche, fondi dedicati e rendicontazione precisa." },
      { emoji: "🌆", title: "Espansione residenziale nell'area metropolitana", desc: "L'area metropolitana Pescara-Chieti è in forte crescita. Le imprese edili gestiscono cantieri residenziali multipli con committenti privati e appalti misti." },
    ],
    relatedCities: [
      { name: "Ancona", slug: "ancona" },
      { name: "Roma", slug: "roma" },
      { name: "Napoli", slug: "napoli" },
    ],
    localContext: {
      heading: "Edilizia a Pescara: costa adriatica, ricostruzione post-sisma 2009 e prezzario Regione Abruzzo",
      body: "Pescara è il capoluogo economico dell'Abruzzo: città giovane (ricostruita dopo i bombardamenti) con forte espansione residenziale, mercato ricettivo importante lungo la Riviera (da Montesilvano a Francavilla), e cantieri di ricostruzione post-sisma 2009 ancora attivi nei comuni del cratere aquilano (a circa un'ora di distanza). L'area metropolitana Pescara-Chieti-Montesilvano è in crescita demografica costante. Il prezzario di riferimento è quello Regione Abruzzo, aggiornato annualmente dalla Direzione Lavori Pubblici.",
      prezzarioLink: "https://www.regione.abruzzo.it/content/prezziario-regionale-opere-pubbliche",
      prezzarioLabel: "Prezzario Regione Abruzzo (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Cantieri ricettivi sulla Riviera con apertura entro maggio: come gestisco cronoprogramma e penali da contratto?",
        a: "Sui ricettivi non si scherza coi tempi. Lavori a ritroso dalla data di apertura con cronoprogramma e ricevi alert quando una lavorazione critica sta scivolando. Decidi se rinforzare squadra o avvertire il committente prima che diventi causa.",
      },
      {
        q: "Posso importare il prezzario Regione Abruzzo nei computi metrici di gara?",
        a: "Sì. Il prezzario Abruzzo si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Pescara, ASL Pescara e Provincia che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Lavoro su ricostruzione post-sisma 2009 nel cratere aquilano: come gestisco SAL Commissario e perizia di variante?",
        a: "Le commesse post-sisma hanno tipologia dedicata con numero scheda AeDES, perizia asseverata, importo contributo concesso, SAL approvati dall'Ufficio Speciale Ricostruzione e tracciamento cessione del credito. Tutto pronto per i controlli.",
      },
      {
        q: "Espansione residenziale nell'area metropolitana Pescara-Chieti: come gestisco più cantieri privati con committenti diversi?",
        a: "Ogni cantiere è una commessa autonoma con committente, computo, SAL e fatture separate. Dalla dashboard vedi quali sono in linea, quali in ritardo e quali stanno erodendo margine. Le fatture viaggiano col codice commessa — il commercialista non ti chiama più alle 22.",
      },
    ],
  },
  taranto: {
    name: "Taranto",
    region: "Puglia",
    slug: "taranto",
    province: "TA",
    lat: 40.4644,
    lon: 17.2470,
    heroTitle: "Gestionale Edilizia per Imprese di Taranto",
    heroSubtitle: "Il software gestionale per imprese edili tarantine: cantieri, SAL, fatturazione elettronica. Taranto si trasforma — le imprese edili che lavorano sulla riqualificazione urbana hanno bisogno di strumenti all'altezza.",
    heroImage: "/hero/stock/cantiere-1581578731548-1400.webp",
    localStats: [
      { value: "10+", label: "Imprese edili tarantine attive" },
      { value: "€ 1.3M", label: "Fatturato gestito al mese in area" },
      { value: "23%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti pugliesi" },
    ],
    localTestimonial: {
      quote: "Taranto è in piena trasformazione con grandi investimenti pubblici. Con Edilizia in Cloud gestisco la rendicontazione SAL e la documentazione di gara senza stress — tutto è sempre in ordine.",
      author: "Giovanni B.",
      company: "Riqualificazione Jonica Srl",
      city: "Taranto",
      initials: "GB",
    },
    localProblems: [
      { emoji: "🏭", title: "Riconversione industriale: grandi cantieri pubblici", desc: "Taranto è al centro di un piano di riconversione industriale con miliardi di investimenti pubblici. Le imprese edili che lavorano su questi cantieri devono gestire documentazione rigorosa e SAL puntuale." },
      { emoji: "⚓", title: "Porto di Taranto: cantieri marittimi e logistici", desc: "Il porto di Taranto è uno dei principali scali militari e commerciali del Mediterraneo. Le imprese edili lavorano su infrastrutture portuali con requisiti tecnici e di sicurezza molto specifici." },
      { emoji: "🏘️", title: "Riqualificazione urbana del centro storico", desc: "Il Borgo Antico di Taranto (Città Vecchia) è oggetto di importanti interventi di recupero edilizio. Le imprese specializzate nel restauro devono gestire vincoli storico-artistici e pratiche complesse." },
    ],
    relatedCities: [
      { name: "Bari", slug: "bari" },
      { name: "Foggia", slug: "foggia" },
      { name: "Salerno", slug: "salerno" },
    ],
    localContext: {
      heading: "Edilizia a Taranto: riconversione ex-ILVA, Borgo Antico e prezzario Regione Puglia",
      body: "Taranto vive una transizione storica: la riconversione del polo siderurgico ex-ILVA con piano DRI e impianti di decarbonizzazione mobilita miliardi di investimento pubblico, e parallelamente il recupero del Borgo Antico (Città Vecchia) sta finalmente partendo dopo decenni di abbandono. Il porto militare e commerciale genera commesse infrastrutturali con Marina Militare e Autorità Portuale del Mar Ionio. I cantieri edili tarantini lavorano fra grandi appalti pubblici, ricettivo costiero (Marina di Pulsano, Lizzano) e bonifiche industriali. Prezzario di riferimento: Regione Puglia.",
      prezzarioLink: "https://www.regione.puglia.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Puglia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavoro su una bonifica nell'area ILVA: come gestisco piani amianto, FIR rifiuti e tracciabilità?",
        a: "Le commesse bonifica hanno categoria dedicata con piani di lavoro amianto, FIR rifiuti speciali, scadenze RENTRI e tracciabilità del committente bonifica. A fine cantiere generi il dossier completo per il certificato di restituibilità — niente improvvisazione su un cantiere normato così rigidamente.",
      },
      {
        q: "Posso importare il prezzario Regione Puglia nei computi metrici per gare di Comune di Taranto?",
        a: "Sì. Il prezzario Puglia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Taranto, ASL Taranto e Autorità Portuale del Mar Ionio che lo richiedono come base di gara.",
      },
      {
        q: "Restauro nel Borgo Antico con fondi PNRR rigenerazione urbana: come gestisco SAL, asseverazioni e fotodocumentazione?",
        a: "Le commesse rigenerazione urbana PNRR hanno tipologia dedicata con scadenze SAL, asseverazioni tecniche, foto-report archiviati per pratica e tracciamento avanzamento per Regis. Il fascicolo è sempre pronto per i controlli ANAC e Corte dei Conti.",
      },
      {
        q: "Lavoro come fornitore per Arsenale Militare di Taranto: come gestisco capitolati con clausole NATO e tempi rigidi?",
        a: "I capitolati militari hanno requisiti di sicurezza e tempi non negoziabili. Crei commessa con accessi limitati al personale autorizzato, documentazione segregata per pratica e SAL approvati dal Direttore dei Lavori militare — tutto archiviato secondo norme di riservatezza.",
      },
    ],
  },
  cosenza: {
    name: "Cosenza",
    region: "Calabria",
    slug: "cosenza",
    province: "CS",
    lat: 39.2905,
    lon: 16.2540,
    heroTitle: "Gestionale Edilizia per Imprese di Cosenza",
    heroSubtitle: "Il software gestionale per imprese edili cosentine: controllo cantieri, margini, fatturazione elettronica. La Calabria del nord cresce — Edilizia in Cloud ti dà gli strumenti per farlo bene.",
    heroImage: "/hero/stock/cantiere-1600585154526-1400.webp",
    localStats: [
      { value: "8+", label: "Imprese edili cosentine attive" },
      { value: "€ 1.0M", label: "Fatturato gestito al mese in area" },
      { value: "20%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti calabresi" },
    ],
    localTestimonial: {
      quote: "In provincia di Cosenza lavoriamo su cantieri residenziali, strade e opere pubbliche. Con Edilizia in Cloud tengo tutto sotto controllo senza dover assumere un ufficio tecnico dedicato.",
      author: "Antonio M.",
      company: "Edil Bruzio Costruzioni",
      city: "Cosenza",
      initials: "AM",
    },
    localProblems: [
      { emoji: "🏔️", title: "Cantieri montani e nella Sila", desc: "La provincia di Cosenza include l'Altopiano Silano, dove le imprese edili lavorano in condizioni montane. Accesso limitato, meteo imprevedibile e logistica complessa richiedono una pianificazione precisa." },
      { emoji: "🏗️", title: "Fondi PNRR per scuole e infrastrutture", desc: "La Calabria settentrionale ha ricevuto importanti finanziamenti PNRR per edifici scolastici, strade e impianti. Le imprese devono essere pronte con documentazione digitale e rendicontazione puntuale." },
      { emoji: "🌊", title: "Costa tirrenica: cantieri turistici e residenziali", desc: "La costa cosentina — da Diamante a Scalea — è una delle mete turistiche più frequentate del Tirreno. Le imprese edili lavorano su strutture ricettive con finestre temporali molto strette." },
    ],
    relatedCities: [
      { name: "Reggio Calabria", slug: "reggio-calabria" },
      { name: "Palermo", slug: "palermo" },
      { name: "Napoli", slug: "napoli" },
    ],
    localContext: {
      heading: "Edilizia a Cosenza: Sila, costa tirrenica e prezzario Regione Calabria",
      body: "La provincia di Cosenza è la più estesa della Calabria: include la Sila (Altopiano Silano, parchi nazionali con cantieri in quota oltre i 1.200 m), la costa tirrenica turistica da Diamante a Scalea, e il capoluogo con espansione residenziale verso Rende e Università della Calabria. Il sisma del 2018 nel cosentino ha lasciato cantieri di ricostruzione ancora attivi in alcuni comuni interni. Le imprese edili cosentine si muovono fra cantieri PNRR per scuole e infrastrutture, ricettivo costiero e residenziale urbano. Il prezzario di riferimento è quello Regione Calabria.",
      prezzarioLink: "https://www.regione.calabria.it/website/portaltemplates/view/view.cfm?13415",
      prezzarioLabel: "Prezzario Regione Calabria (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Cantiere in Sila a 1.400 m di quota: come gestisco stagionalità (chiuso da novembre ad aprile) e logistica neve?",
        a: "I cantieri di montagna hanno cronoprogramma stagionale con sospensione invernale. Tieni in pausa i mesi non operativi, riprendi a primavera senza ricreare la commessa. I costi di sorveglianza invernale restano imputati correttamente — sai esattamente quanto ti costa tenere fermo il cantiere.",
      },
      {
        q: "Posso importare il prezzario Regione Calabria nei computi metrici di gara?",
        a: "Sì. Il prezzario Calabria si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Cosenza, Provincia, ASP Cosenza e Università della Calabria che lo richiedono nei capitolati pubblici.",
      },
      {
        q: "Cantiere ricettivo sulla costa tra Diamante e Scalea con apertura tassativa entro giugno: come monitoro avanzamento?",
        a: "Sui ricettivi i tempi sono ferro. Dashboard cantiere con percentuale lavorazioni, ore squadra giornaliere e alert sui ritardi delle attività critiche. Decidi se rinforzare squadra prima che il committente apra contenzioso per ritardata consegna.",
      },
      {
        q: "Partecipo a gare PNRR di scuole nei comuni del cosentino: come gestisco anticipazione, SAL e rendicontazione Regis?",
        a: "Le commesse PNRR hanno tipologia dedicata con tracciamento anticipazione 20%, SAL approvati, DURC con alert in scadenza e rendicontazione pronta per Regis. Generi il fascicolo per controlli ANAC e Corte dei Conti senza ricostruire mesi di carte da Excel.",
      },
    ],
  },
  trento: {
    name: "Trento",
    region: "Trentino-Alto Adige",
    slug: "trento",
    province: "TN",
    lat: 46.0748,
    lon: 11.1217,
    heroTitle: "Gestionale Edilizia per Imprese di Trento",
    heroSubtitle: "Il software gestionale per imprese edili trentine: controllo cantieri, margini, fatturazione elettronica. Il Trentino ha standard costruttivi elevati — Edilizia in Cloud è all'altezza.",
    heroImage: "/hero/stock/cantiere-1504307651254-1400.webp",
    localStats: [
      { value: "14+", label: "Imprese edili trentine attive" },
      { value: "€ 2.1M", label: "Fatturato gestito al mese in area" },
      { value: "27%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti trentini" },
    ],
    localTestimonial: {
      quote: "In Trentino i committenti hanno standard altissimi e i margini si giocano sul controllo preciso di ogni ora e ogni materiale. Con Edilizia in Cloud ho questa precisione — e finalmente riesco a fare preventivi che reggono.",
      author: "Klaus R.",
      company: "Costruzioni Alpine Trentine Srl",
      city: "Trento",
      initials: "KR",
    },
    localProblems: [
      { emoji: "🏔️", title: "Cantieri alpini: logistica e stagionalità", desc: "Il Trentino ha cantieri in quota con finestre temporali limitate dalla neve. La pianificazione precisa di materiali, squadre e tempi è fondamentale per non perdere la stagione costruttiva." },
      { emoji: "⚡", title: "Efficienza energetica: CasaClima e KlimaHaus", desc: "Il Trentino adotta standard energetici elevati come CasaClima e KlimaHaus. Le imprese edili devono gestire materiali specifici, certificazioni energetiche e documentazione tecnica complessa." },
      { emoji: "🌲", title: "Costruzioni in legno e bioedilizia", desc: "Il Trentino è leader nella costruzione in legno e bioedilizia. Le imprese edili specializzate gestiscono forniture da filiera corta, lavorazioni artigianali e certificazioni specifiche." },
    ],
    relatedCities: [
      { name: "Bolzano", slug: "bolzano" },
      { name: "Verona", slug: "verona" },
      { name: "Vicenza", slug: "vicenza" },
    ],
    localContext: {
      heading: "Edilizia a Trento: cantieri alpini, standard CasaClima e prezzario PAT Trento",
      body: "Il Trentino ha un prezzario provinciale autonomo: il prezzario Provincia Autonoma di Trento (PAT) è obbligatorio per opere pubbliche provinciali — diverso da quello della Regione Veneto o Lombardia. La provincia è leader in Italia per costruzione in legno (X-Lam), bioedilizia e certificazioni energetiche elevate (CasaClima A, A+, Gold). I cantieri alpini hanno finestre stagionali strette (sospensione invernale per quote sopra i 1.000 m). Il mercato è prevalentemente residenziale, ricettivo turistico e infrastrutture sciistiche.",
      prezzarioLink: "https://www.provincia.tn.it/Argomenti/Lavori-pubblici/Strumenti-tecnici/Elenco-prezzi-provinciale",
      prezzarioLabel: "Elenco Prezzi PAT (Provincia Autonoma di Trento)",
    },
    localFaqs: [
      {
        q: "Lavoro su una casa CasaClima A+: come gestisco materiali certificati, dettagli costruttivi e documentazione per Agenzia CasaClima?",
        a: "Le commesse CasaClima richiedono materiali certificati con scheda tecnica (isolanti, serramenti, ventilazione meccanica controllata) e fotodocumentazione di dettagli costruttivi critici. Edilizia in Cloud archivia tutto per pratica con numero protocollo Agenzia CasaClima — pronto per il sopralluogo di certificazione.",
      },
      {
        q: "Posso importare il prezzario PAT Trento nei computi metrici di gara provinciale?",
        a: "Sì. L'Elenco Prezzi PAT si importa in Excel o PDF, voci indicizzate per codice ufficiale. Vincolante in gare di Provincia Autonoma di Trento, Comune capoluogo, APSS e Servizio Strade — richiami le voci direttamente senza errori di trascrizione.",
      },
      {
        q: "Costruzione in legno X-Lam con fornitore Rubner o Holzhof: come gestisco ordini, consegne e SAL?",
        a: "I cantieri X-Lam hanno fornitura prefabbricata con consegne just-in-time. Gestisci ordine fornitore con data prevista, conferma e tracciamento in cantiere. Se il fornitore slitta, vedi subito l'impatto sul cronoprogramma e avvisi il committente prima del disastro.",
      },
      {
        q: "Cantiere in malga a 1.800 m: come gestisco stagionalità (chiuso nov-apr) e ore squadre con tariffe quota?",
        a: "I cantieri in quota hanno cronoprogramma stagionale con sospensione forzata e tariffe orarie maggiorate per disagio quota. Le ore confluiscono sulla commessa col costo corretto e a fine commessa hai un benchmark vero per preventivare il prossimo cantiere alpino.",
      },
    ],
  },
  bolzano: {
    name: "Bolzano",
    region: "Alto Adige",
    slug: "bolzano",
    province: "BZ",
    lat: 46.4983,
    lon: 11.3548,
    heroTitle: "Gestionale Edilizia per Imprese di Bolzano",
    heroSubtitle: "Il software gestionale per imprese edili altoatesine: cantieri, margini, fatturazione elettronica. L'Alto Adige ha i migliori standard costruttivi d'Italia — noi ti aiutiamo a gestirli.",
    heroImage: "/hero/stock/cantiere-1541888946425-1400.webp",
    localStats: [
      { value: "16+", label: "Imprese edili altoatesine attive" },
      { value: "€ 2.4M", label: "Fatturato gestito al mese in area" },
      { value: "29%", label: "Riduzione media dei costi nascosti" },
      { value: "4.9/5", label: "Valutazione media clienti altoatesini" },
    ],
    localTestimonial: {
      quote: "In Alto Adige lavoriamo con standard KlimaHaus e committenti esigentissimi. Con Edilizia in Cloud ho la precisione nei costi che serve per fare preventivi competitivi senza perdere margine.",
      author: "Hans M.",
      company: "Südtiroler Bau GmbH",
      city: "Bolzano",
      initials: "HM",
    },
    localProblems: [
      { emoji: "🏠", title: "KlimaHaus e standard energetici d'eccellenza", desc: "L'Alto Adige è la regione italiana con i più alti standard di efficienza energetica in edilizia. Le imprese gestiscono materiali certificati, blower door test e documentazione energetica rigorosa." },
      { emoji: "🏔️", title: "Cantieri alpini con stagionalità stretta", desc: "Le alte quote dell'Alto Adige limitano i periodi costruttivi a pochi mesi. La pianificazione precisa di ogni risorsa — personale, materiali, attrezzature — è la differenza tra guadagnare e perdere sulla commessa." },
      { emoji: "🌍", title: "Mercato bilingue: italofoni e germanofoni", desc: "L'Alto Adige è bilingue. Le imprese edili lavorano con committenti sia italofoni che germanofoni. La documentazione di cantiere deve essere chiara e accessibile in entrambe le lingue." },
    ],
    relatedCities: [
      { name: "Trento", slug: "trento" },
      { name: "Verona", slug: "verona" },
      { name: "Udine", slug: "udine" },
    ],
    localContext: {
      heading: "Edilizia a Bolzano: standard KlimaHaus, bilinguismo e prezzario PAB Bolzano",
      body: "L'Alto Adige ha un prezzario provinciale autonomo: il prezzario Provincia Autonoma di Bolzano (PAB) è obbligatorio per opere pubbliche provinciali — pubblicato in italiano e tedesco. Bolzano è la sede dell'Agenzia CasaClima e impone standard energetici fra i più alti d'Europa (KlimaHaus A, A+, Gold sono ormai la norma anche nel residenziale privato). Le imprese altoatesine lavorano molto in legno (X-Lam Holz Italia, Rubner), con committenti bilingui italofoni e germanofoni che pretendono documentazione completa in entrambe le lingue.",
      prezzarioLink: "https://www.provincia.bz.it/lavori-pubblici-beni-immobili-foreste/lavori-pubblici/edilizia/elenco-prezzi-informativo.asp",
      prezzarioLabel: "Elenco Prezzi PAB Bolzano (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Costruisco una casa KlimaHaus Gold: come gestisco materiali certificati, blower door test e fascicolo per Agenzia CasaClima?",
        a: "Le commesse KlimaHaus richiedono materiali certificati con scheda tecnica, dettagli costruttivi fotografati e risultati blower door. Edilizia in Cloud archivia tutto per pratica con numero protocollo Agenzia CasaClima — il fascicolo è pronto per il sopralluogo di certificazione.",
      },
      {
        q: "Posso importare il prezzario PAB Bolzano nei computi metrici di gara provinciale?",
        a: "Sì. L'Elenco Prezzi PAB si importa in Excel o PDF, voci indicizzate per codice ufficiale (italiano/tedesco). Vincolante in gare di Provincia Autonoma di Bolzano, ASL Alto Adige e tutti gli enti provinciali — richiami le voci direttamente bilingui.",
      },
      {
        q: "Committenti bilingui (italiani e tedeschi): come gestisco preventivi, fatture e documentazione in due lingue?",
        a: "Edilizia in Cloud genera documenti bilingui (italiano/tedesco): preventivi, fatture, SAL e contratti. Il committente di Bressanone riceve il documento in tedesco senza che tu debba ritradurre — risparmi ore di lavoro e elimini errori di traduzione.",
      },
      {
        q: "Costruzione in legno X-Lam con fornitore Rubner: come gestisco ordini, consegne just-in-time e SAL?",
        a: "I cantieri X-Lam hanno fornitura prefabbricata con consegne a giorno fisso. Gestisci ordine fornitore con data prevista, conferma e tracciamento. Se Rubner slitta vedi subito l'impatto sul cronoprogramma e avvisi il committente prima del disastro.",
      },
    ],
  },
  ferrara: {
    name: "Ferrara",
    region: "Emilia-Romagna",
    slug: "ferrara",
    province: "FE",
    lat: 44.8354,
    lon: 11.6198,
    heroTitle: "Gestionale Edilizia per Imprese di Ferrara",
    heroSubtitle: "Il software gestionale per imprese edili ferraresi: controllo cantieri, margini reali, fatturazione elettronica. Ferrara patrimonio UNESCO — le sue imprese edili meritano strumenti di eccellenza.",
    heroImage: "/hero/stock/cantiere-1621905251189-1400.webp",
    localStats: [
      { value: "10+", label: "Imprese edili ferraresi attive" },
      { value: "€ 1.4M", label: "Fatturato gestito al mese in area" },
      { value: "23%", label: "Riduzione media dei costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti emiliani" },
    ],
    localTestimonial: {
      quote: "A Ferrara lavoriamo su ristrutturazioni del patrimonio storico e su nuove costruzioni nella cintura urbana. Con Edilizia in Cloud ho tutto in ordine — pratiche, DURC, fatture e margini.",
      author: "Stefano C.",
      company: "Restauro Estense Srl",
      city: "Ferrara",
      initials: "SC",
    },
    localProblems: [
      { emoji: "🏛️", title: "Patrimonio UNESCO: restauro e vincoli stringenti", desc: "Ferrara è Patrimonio dell'Umanità UNESCO. Le imprese edili che lavorano nel centro storico devono rispettare vincoli storico-artistici rigidi, con pratiche di tutela e materiali specifici approvati dalla Soprintendenza." },
      { emoji: "🌊", title: "Rischio idrogeologico: zone alluvionali", desc: "Il ferrarese è zona ad alto rischio alluvionale. Le imprese edili affrontano interventi di messa in sicurezza, drenaggio e consolidamento con procedure tecniche specifiche e urgenze improvvise." },
      { emoji: "🏘️", title: "Riqualificazione residenziale nell'area delta", desc: "L'area del Delta del Po è in fase di riqualificazione con fondi europei. Le imprese edili accedono a bandi specifici per il recupero edilizio nelle zone protette, con documentazione tecnica rigorosa." },
    ],
    relatedCities: [
      { name: "Bologna", slug: "bologna" },
      { name: "Modena", slug: "modena" },
      { name: "Reggio Emilia", slug: "reggio-emilia" },
    ],
    localContext: {
      heading: "Edilizia a Ferrara: patrimonio UNESCO, ricostruzione post-sisma 2012 e prezzario Regione Emilia-Romagna",
      body: "Ferrara è città UNESCO nel suo centro storico rinascimentale: il restauro nei palazzi estensi (Diamanti, Schifanoia, Castello Estense) richiede materiali certificati e Soprintendenza presente in ogni fase. La Bassa ferrarese ha completato gran parte della ricostruzione post-sisma maggio 2012, ma alcune commesse rimangono ancora aperte presso il Commissario. Il Delta del Po ha rischio idrogeologico significativo con vincoli idraulici dell'AIPO. Il prezzario di riferimento è quello Regione Emilia-Romagna.",
      prezzarioLink: "https://territorio.regione.emilia-romagna.it/lavori-pubblici",
      prezzarioLabel: "Prezzario opere pubbliche Regione Emilia-Romagna",
    },
    localFaqs: [
      {
        q: "Restauro nel centro storico UNESCO di Ferrara: come gestisco autorizzazioni Soprintendenza e fotodocumentazione?",
        a: "Ogni intervento ha scheda con foto ante/in corso/post geolocalizzate, archiviate per pratica con numero protocollo Soprintendenza. Materiali certificati con scheda tecnica allegata. Quando dopo mesi arrivano richieste integrazioni, ritrovi tutto in due secondi.",
      },
      {
        q: "Posso importare il prezzario Regione Emilia-Romagna nei computi metrici di gara?",
        a: "Sì. Il prezzario Emilia-Romagna si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Ferrara, AUSL Ferrara, Università e Provincia che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Ho ancora commesse ricostruzione post-sisma 2012 aperte nella Bassa ferrarese: come gestisco SAL Commissario e perizia di variante?",
        a: "Le commesse post-sisma hanno categoria dedicata con numero pratica regionale, perizia asseverata, importo contributo concesso, SAL approvati dal Commissario e tracciamento cessione del credito. Il fascicolo è pronto anche per pratiche aperte da anni.",
      },
      {
        q: "Cantiere nel Delta del Po con vincoli idraulici AIPO: come gestisco autorizzazioni e perizia idraulica?",
        a: "Le commesse in fascia esondabile hanno categoria dedicata con scadenze autorizzazioni AIPO, perizia idraulica e documentazione asseverata. Quando arrivano controlli o subentra variante, hai il dossier pronto da mostrare senza ricostruirlo manualmente.",
      },
    ],
  },

  // ── 7 città lombarde/venete/centro aggiunte v8.6.123 ────────────────────
  como: {
    name: "Como",
    region: "Lombardia",
    slug: "como",
    province: "CO",
    lat: 45.8081,
    lon: 9.0852,
    heroTitle: "Gestionale Edilizia per Imprese di Como",
    heroSubtitle: "Software gestionale per imprese edili comasche e del lago: ville di lusso, restauro storico e cantieri residenziali. Controllo margini, SAL automatici e app cantiere offline.",
    heroImage: "/hero/stock/cantiere-1504328345606-1400.webp",
    localStats: [
      { value: "18+", label: "Imprese edili comasche attive" },
      { value: "€ 3.4M", label: "Fatturato mensile gestito sul lago" },
      { value: "32%", label: "Riduzione costi nascosti su ville" },
      { value: "4.9/5", label: "Valutazione clienti lariani" },
    ],
    localTestimonial: {
      quote: "Costruiamo ville sul lago di Como, ogni cantiere è diverso. Edilizia in Cloud ci ha dato il controllo dei margini su materiali pregiati e manodopera specializzata. Niente più Excel di backup.",
      author: "Stefano B.",
      company: "Lario Costruzioni",
      city: "Como",
      initials: "SB",
    },
    localProblems: [
      { emoji: "🏛️", title: "Restauro vincolato in centro storico", desc: "Como ha vincoli paesaggistici e architettonici stringenti. Le pratiche con la Soprintendenza richiedono documentazione fotografica continua, tracciamento materiali e timeline precisi." },
      { emoji: "🛥️", title: "Cantieri lago con accesso solo via acqua", desc: "Le ville sul lago richiedono logistica fluviale: chiatte, gru flottanti, trasporti programmati. Ogni ritardo materiale costa migliaia di euro. Serve pianificazione settimanale." },
      { emoji: "💎", title: "Clientela alto-spendente esigente", desc: "I clienti del lago richiedono finiture premium, materiali importati, tempi rispettati. Trasparenza su margini e SAL settimanali è ormai standard di mercato." },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Lecco", slug: "lecco" },
      { name: "Varese", slug: "varese" },
    ],
    localContext: {
      heading: "Edilizia a Como: ville lago, restauro centro storico vincolato e prezzario Regione Lombardia",
      body: "Como è territorio di nicchia ad altissimo valore: il lago attrae committenti internazionali (americani, britannici, mediorientali, hollywoodiani) che vogliono ville premium con finiture importate, gru flottanti per accesso via lago, tempi di consegna che ammettono ritardi solo se motivati. Il centro storico di Como è vincolato Soprintendenza per il tessuto medievale e l'asse Liberty. La Brianza comasca ha invece tessuto industriale e residenziale tradizionale. Prezzario di riferimento: Regione Lombardia.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Villa sul lago di Como con accesso solo via acqua: come gestisco logistica con motonavi, gru flottanti e tempi di consegna materiali?",
        a: "Le ville lago hanno voce di costo dedicata 'logistica fluviale' con nolo motonave, gru flottante e movimentazione. Ogni ordine fornitore ha data prevista di arrivo via lago — vedi subito quali materiali rischiano di arrivare in ritardo e avvisi il direttore lavori prima del fermo cantiere.",
      },
      {
        q: "Posso importare il prezzario Regione Lombardia nei miei preventivi su ville premium?",
        a: "Sì. Il prezzario Lombardia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Sulle ville premium però i committenti vogliono finiture extra-prezzario (marmi italiani, parquet francese): crei voci personalizzate riusabili con prezzo netto e ricarico configurabile.",
      },
      {
        q: "Restauro su villa storica vincolata con Soprintendenza presente in cantiere: come gestisco varianti e documentazione?",
        a: "Le ville storiche hanno Soprintendenza che entra in cantiere continuamente. Ogni intervento ha scheda foto ante/in corso/post, materiali certificati con scheda allegata e varianti tracciate con SAL aggiuntivi. Quando arriva il sopralluogo hai il dossier completo.",
      },
      {
        q: "Clienti internazionali esigenti (americani, mediorientali): come gestisco rendiconti settimanali e dashboard accessibile a distanza?",
        a: "Il committente internazionale vuole visibilità in tempo reale. Edilizia in Cloud ha dashboard cantiere accessibile in lettura dal committente con SAL aggiornato, foto-report settimanale e budget residuo. Smettono di chiamarti alle 2 di notte per chiedere aggiornamenti.",
      },
    ],
  },

  lecco: {
    name: "Lecco",
    region: "Lombardia",
    slug: "lecco",
    province: "LC",
    lat: 45.8566,
    lon: 9.3973,
    heroTitle: "Gestionale Edilizia per Imprese di Lecco",
    heroSubtitle: "Il software gestionale per imprese edili lecchesi e della Valassina: cantieri di montagna, ville lago, ristrutturazioni. Gestione cantieri in tempo reale, controllo margini e app mobile.",
    heroImage: "/hero/stock/cantiere-1562259929-1400.webp",
    localStats: [
      { value: "14+", label: "Imprese edili lecchesi attive" },
      { value: "€ 2.1M", label: "Fatturato gestito mensile" },
      { value: "30%", label: "Riduzione costi nascosti" },
      { value: "4.8/5", label: "Valutazione media clienti" },
    ],
    localTestimonial: {
      quote: "Le case in zona Valassina richiedono attenzione al dettaglio. Con Edilizia in Cloud teniamo sotto controllo costi di manodopera e materiali per ogni intervento, senza perdere ore in carta.",
      author: "Andrea C.",
      company: "Costruzioni Lariane",
      city: "Lecco",
      initials: "AC",
    },
    localProblems: [
      { emoji: "⛰️", title: "Cantieri in pendenza e fondovalle", desc: "I terreni lecchesi richiedono opere di contenimento, scarificazioni e fondazioni speciali. La pianificazione costi è critica: errori in queste fasi causano sovracosti enormi." },
      { emoji: "🏠", title: "Ristrutturazioni vincolate in nuclei antichi", desc: "Mandello, Bellano, Lierna hanno nuclei antichi vincolati. Permessi più lunghi, fornitori specializzati: serve documentazione organizzata per non perdere tempo in Comune." },
      { emoji: "🚛", title: "Logistica difficile tra paesi sparsi", desc: "Le imprese servono cantieri dispersi sulle sponde del lago. Coordinare squadre, fornitori e tempi diventa un caos senza un sistema centralizzato." },
    ],
    relatedCities: [
      { name: "Como", slug: "como" },
      { name: "Bergamo", slug: "bergamo" },
      { name: "Milano", slug: "milano" },
    ],
    localContext: {
      heading: "Edilizia a Lecco: pendenze prealpine, ville sul ramo orientale del Lario e prezzario Regione Lombardia",
      body: "Lecco è territorio verticale: cantieri quasi sempre in pendenza con opere di contenimento, fondazioni speciali e scarificazioni che a Milano non esistono. Il ramo orientale del Lario (da Mandello a Bellano, Varenna, Colico) ha ville di pregio con accessi via lago, e i nuclei antichi della Valsassina/Valassina hanno vincoli paesaggistici. Le imprese lecchesi coordinano squadre su cantieri sparsi fra capoluogo, sponda lago e valli prealpine. Prezzario di riferimento: Regione Lombardia, lo stesso di Milano e Como.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Cantieri in pendenza con opere di contenimento e fondazioni speciali: come metto a budget queste voci specialistiche?",
        a: "Le opere di contenimento (paratie, micropali, berlinesi) sono voci di costo specialistiche con prezzi non standard. Le crei come voci personalizzate riusabili e a fine commessa hai un benchmark vero per il prossimo cantiere in pendenza — niente più preventivi a tentoni.",
      },
      {
        q: "Posso importare il prezzario Regione Lombardia nei computi metrici di gara?",
        a: "Sì. Il prezzario Lombardia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Lecco, ASST Lecco e Provincia che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Ristrutturazione in nucleo antico di Mandello con vincolo paesaggistico: come gestisco autorizzazioni e tempi Comune?",
        a: "Le pratiche con vincolo hanno scadenze autorizzazioni paesaggistiche, scia, e tempi di rilascio variabili. Tracciamento per pratica con scadenze e documenti allegati — quando il committente chiede 'a che punto siamo col Comune?' rispondi in 5 secondi senza scartabellare.",
      },
      {
        q: "Squadre disperse su 6 cantieri fra capoluogo e Valsassina: come coordino ore lavorate e materiali?",
        a: "Dall'app cantiere i capocantiere timbrano ingresso/uscita con GPS e registrano materiali consegnati. Tu vedi in tempo reale chi è dove, ore per commessa e produttività per squadra. Le ore confluiscono direttamente sulla commessa giusta — niente fogli mensili da ricostruire.",
      },
    ],
  },

  monza: {
    name: "Monza",
    region: "Lombardia",
    slug: "monza",
    province: "MB",
    lat: 45.5845,
    lon: 9.2744,
    heroTitle: "Gestionale Edilizia per Imprese di Monza e Brianza",
    heroSubtitle: "Software gestionale per imprese edili brianzole: hinterland milanese, capannoni industriali, residenziali di pregio. Margini reali, SAL settimanali e fatturazione elettronica integrata.",
    heroImage: "/hero/stock/cantiere-1581094288338-1400.webp",
    localStats: [
      { value: "32+", label: "Imprese edili brianzole attive" },
      { value: "€ 6.8M", label: "Fatturato mensile gestito" },
      { value: "29%", label: "Riduzione costi nascosti" },
      { value: "4.9/5", label: "Valutazione clienti Brianza" },
    ],
    localTestimonial: {
      quote: "In Brianza ci sono cantieri che durano un anno e altri che chiudono in tre settimane. Con Edilizia in Cloud gestisco tutto da un'unica dashboard, niente più chiamate alle squadre per chiedere a che punto stiamo.",
      author: "Roberto V.",
      company: "Vimercati Edilizia",
      city: "Monza",
      initials: "RV",
    },
    localProblems: [
      { emoji: "🏭", title: "Capannoni industriali con tempistiche rigide", desc: "I commissari brianzoli pretendono consegne puntuali: ogni giorno di ritardo nei capannoni industriali costa al cliente fermo produzione. Servono SAL e cronoprogrammi monitorati h24." },
      { emoji: "🏘️", title: "Residenziale di pregio con clienti milanesi", desc: "Molti committenti vivono a Milano ma costruiscono in Brianza. Vogliono report digitali, foto cantiere quotidiane, comunicazione WhatsApp ordinata. Il cartaceo non basta più." },
      { emoji: "📊", title: "Pochi tecnici per troppi cantieri attivi", desc: "Le imprese brianzole girano con 4-6 cantieri aperti in contemporanea. Senza centralizzazione, le risorse si sovrappongono o restano scoperte." },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Como", slug: "como" },
      { name: "Bergamo", slug: "bergamo" },
    ],
    localContext: {
      heading: "Edilizia a Monza e Brianza: hinterland milanese, capannoni industriali brianzoli e prezzario Regione Lombardia",
      body: "La provincia di Monza e Brianza è uno dei distretti produttivi più densi d'Europa: design (Vimercate), mobile (Lissone, Meda, Seveso), meccanica diffusa. Le imprese edili brianzole gestiscono in parallelo cantieri industriali con committenti che pretendono SAL settimanali e zero ritardi, residenziale di pregio per committenti milanesi che lavorano in città e abitano in Brianza, ristrutturazioni urbane nei centri storici di Monza, Seregno, Desio. Prezzario di riferimento: Regione Lombardia.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Capannone per azienda di design brianzola con tempi rigidi (penali pesanti sui ritardi): come gestisco SAL e cronoprogramma?",
        a: "I committenti industriali brianzoli pretendono SAL settimanali con foto e percentuali per lavorazione. Edilizia in Cloud genera SAL automatici dal cronoprogramma e dai dati cantiere — niente più nottate a costruire il report. Se sei in ritardo lo vedi prima del committente e proponi recupero.",
      },
      {
        q: "Posso importare il prezzario Regione Lombardia nei computi metrici di gara?",
        a: "Sì. Il prezzario Lombardia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Monza, ATS Brianza e Provincia MB che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Committenti milanesi che vivono in Brianza: vogliono foto cantiere quotidiane e WhatsApp ordinato. Come gestisco la comunicazione?",
        a: "Edilizia in Cloud genera report giornaliero automatico con foto, ore lavorate e avanzamento. Il committente lo riceve via email o dashboard accessibile — smette di mandarti WhatsApp ogni due ore e tu eviti di dover ricostruire la giornata da zero.",
      },
      {
        q: "Ho 5 cantieri attivi in parallelo con 2 tecnici di studio: come evito sovrapposizioni di squadre e fornitori?",
        a: "Pianificazione settimanale centralizzata: vedi a colpo d'occhio quale squadra è impegnata dove e quale slot fornitore è disponibile per ogni cantiere. Niente più 'pensavo che la squadra fosse qui' o 'avevo prenotato la pompa per un altro cantiere'.",
      },
    ],
  },

  varese: {
    name: "Varese",
    region: "Lombardia",
    slug: "varese",
    province: "VA",
    lat: 45.8205,
    lon: 8.8252,
    heroTitle: "Gestionale Edilizia per Imprese di Varese",
    heroSubtitle: "Software gestionale per imprese edili varesine: residenziale, industriale e cantieri di confine con la Svizzera. Controllo margini, app cantiere offline e gestione documentale.",
    heroImage: "/hero/stock/cantiere-1558618666-1400.webp",
    localStats: [
      { value: "21+", label: "Imprese edili varesine attive" },
      { value: "€ 4.3M", label: "Fatturato mensile gestito" },
      { value: "27%", label: "Riduzione costi nascosti" },
      { value: "4.8/5", label: "Valutazione clienti varesini" },
    ],
    localTestimonial: {
      quote: "Lavoriamo molto con committenti italo-svizzeri che pretendono ordine. Edilizia in Cloud ci ha dato la presentazione professionale che serviva: SAL puntuali, fatture chiare, foto cantiere documentate.",
      author: "Giancarlo M.",
      company: "Edilvarese Srl",
      city: "Varese",
      initials: "GM",
    },
    localProblems: [
      { emoji: "🇨🇭", title: "Cantieri con clienti svizzeri esigenti", desc: "I committenti elvetici hanno standard di puntualità e documentazione altissimi. Le imprese italiane che lavorano in zona devono adeguarsi a una qualità di gestione 'svizzera'." },
      { emoji: "🌲", title: "Cantieri prealpini con accesso stagionale", desc: "Le ville in alta Valcuvia e Val Veddasca hanno accesso limitato in inverno. Pianificare materiali e squadre con anticipo è obbligatorio per non bloccare il cantiere." },
      { emoji: "💼", title: "Mercato del lavoro condizionato dai frontalieri", desc: "Le maestranze migliori vanno in Svizzera per stipendi doppi. Gestire chi resta richiede ottimizzazione massima del tempo in cantiere e tracciamento ore preciso." },
    ],
    relatedCities: [
      { name: "Milano", slug: "milano" },
      { name: "Como", slug: "como" },
      { name: "Bergamo", slug: "bergamo" },
    ],
    localContext: {
      heading: "Edilizia a Varese: confine svizzero, frontalieri e prezzario Regione Lombardia",
      body: "Varese è provincia di confine: i committenti italo-svizzeri pretendono standard di puntualità e ordine documentale fuori scala, le maestranze migliori spesso si spostano oltreconfine per stipendi 2-3x più alti, lasciando le imprese italiane a faticare sulla manodopera qualificata. I cantieri delle prealpi varesine (Valcuvia, Val Veddasca, Campo dei Fiori) hanno accesso stagionale e i comuni del lago Maggiore (Sesto Calende, Angera, Laveno) accolgono ville premium per committenti elvetici. Prezzario di riferimento: Regione Lombardia.",
      prezzarioLink: "https://www.regione.lombardia.it/wps/portal/istituzionale/HP/DettaglioServizio/servizi-e-informazioni/Enti-e-Operatori/territorio/Edilizia-territorio/prezzario-opere-pubbliche-lombardia",
      prezzarioLabel: "Prezzario Regione Lombardia (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Committente svizzero pretende ordine totale e SAL puntuali al minuto: come mi presento con documentazione 'svizzera'?",
        a: "Edilizia in Cloud genera SAL professionali con grafica pulita, foto di cantiere, percentuali e budget residuo. Il committente svizzero riceve un report che può confrontare con quelli dei suoi cantieri in CH — e tu non sembri il classico cantiere italiano fatto di fogli scarabocchiati.",
      },
      {
        q: "Posso importare il prezzario Regione Lombardia nei computi metrici di gara?",
        a: "Sì. Il prezzario Lombardia si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Varese, ASST Sette Laghi e Provincia che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Le mie maestranze migliori vanno in Svizzera per il doppio dello stipendio: come ottimizzo il tempo di chi resta?",
        a: "Tracciamento ore preciso per commessa con produttività per squadra. Vedi chi è realmente produttivo e chi no, e puoi rimodulare squadre per concentrare i migliori sui cantieri critici. La produttività non è un dato astratto ma un numero che paga lo stipendio.",
      },
      {
        q: "Cantieri in alta Valcuvia con accesso invernale impossibile: come gestisco sospensione stagionale e ripresa primaverile?",
        a: "I cantieri alpini hanno cronoprogramma con sospensione stagionale forzata. Tieni in pausa i mesi non operativi, riprendi senza ricreare la commessa. I costi di sorveglianza invernale restano imputati correttamente — sai esattamente quanto costa tenere fermo il cantiere.",
      },
    ],
  },

  treviso: {
    name: "Treviso",
    region: "Veneto",
    slug: "treviso",
    province: "TV",
    lat: 45.6669,
    lon: 12.2431,
    heroTitle: "Gestionale Edilizia per Imprese di Treviso",
    heroSubtitle: "Software gestionale per imprese edili trevigiane: residenziale, capannoni e zone industriali. Controllo margini, SAL puntuali e fatturazione elettronica integrata per la Marca trevigiana.",
    heroImage: "/hero/stock/cantiere-1504917595217-1400.webp",
    localStats: [
      { value: "26+", label: "Imprese edili trevigiane attive" },
      { value: "€ 5.1M", label: "Fatturato mensile gestito" },
      { value: "31%", label: "Riduzione costi nascosti" },
      { value: "4.9/5", label: "Valutazione clienti veneti" },
    ],
    localTestimonial: {
      quote: "La Marca trevigiana è piena di piccoli capannoni industriali. Con Edilizia in Cloud abbiamo i SAL automatici per ogni cliente, i committenti pagano nei tempi e non perdiamo più ore a far quadrare i conti.",
      author: "Lorenzo D.",
      company: "Edilveneto Costruzioni",
      city: "Treviso",
      initials: "LD",
    },
    localProblems: [
      { emoji: "🏭", title: "Capannoni industriali in distretti vinicoli", desc: "Treviso ha distretti industriali tessili, vinicoli e alimentari con esigenze edilizie specifiche (cantine, celle frigo, depositi attrezzati). La preventivazione tecnica deve essere precisa." },
      { emoji: "🍷", title: "Ristrutturazioni di rustici e cascine", desc: "Conegliano, Asolo, Valdobbiadene: zone agriturismo con ristrutturazioni di rustici sotto vincolo paesaggistico. Documentazione e tempi più lunghi della media." },
      { emoji: "📋", title: "Burocrazia veneta per pratiche edilizie", desc: "I Comuni veneti richiedono modulistica articolata e tempistiche di risposta variabili. Tracciare ogni pratica con scadenze e documenti allegati evita perdite di tempo enormi." },
    ],
    relatedCities: [
      { name: "Padova", slug: "padova" },
      { name: "Venezia", slug: "venezia" },
      { name: "Vicenza", slug: "vicenza" },
    ],
    localContext: {
      heading: "Edilizia a Treviso: Marca trevigiana, distretto del Prosecco e prezzario Regione Veneto",
      body: "La Marca trevigiana è uno dei distretti più dinamici d'Italia: vinicolo (Prosecco DOCG fra Conegliano e Valdobbiadene, Asolo), alimentare (Veneto Banca, food&beverage), tessile-moda (Benetton, Geox, Stefanel). I cantieri trevigiani lavorano spesso su cantine vinicole con esigenze tecniche specifiche (vasche inox, sale d'invecchiamento, climatizzazione tunnel), ristrutturazioni di rustici e ville venete nelle colline UNESCO del Prosecco, capannoni industriali a Treviso, Mogliano, Castelfranco. Prezzario di riferimento: Regione Veneto.",
      prezzarioLink: "https://www.regione.veneto.it/web/lavori-pubblici/prezzario-regionale",
      prezzarioLabel: "Prezzario Regione Veneto (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Cantina vinicola in Valdobbiadene con vincolo paesaggistico UNESCO: come gestisco autorizzazioni e fotodocumentazione?",
        a: "Le colline del Prosecco sono Patrimonio UNESCO: ogni intervento richiede autorizzazione paesaggistica e fotodocumentazione obbligatoria. Edilizia in Cloud archivia foto ante/in corso/post geolocalizzate per pratica — tutto pronto per controlli anche anni dopo.",
      },
      {
        q: "Posso importare il prezzario Regione Veneto nei computi metrici di gara?",
        a: "Sì. Il prezzario Veneto si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Treviso, ULSS 2 Marca Trevigiana e Provincia che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Ristrutturazione di un rustico in Asolo con vincolo paesaggistico e committente esigente: come gestisco varianti in corso d'opera?",
        a: "I rustici hanno preventivo che cambia in corso d'opera: trovi un solaio in legno marcio, una muratura non portante. Gestisci varianti come SAL aggiuntivi con perizia e foto giustificativa — il committente vede chiaramente cosa è emerso e perché serve un extra-budget.",
      },
      {
        q: "Capannone alimentare con vincoli HACCP per stagionatura: come gestisco preventivi con materiali certificati food-grade?",
        a: "Crei voci di prezzario personalizzate con materiali food-grade (resine epossidiche alimentari, pannelli isotermici, pavimenti drenanti) e le riusi su tutti i cantieri food. Le specifiche tecniche restano allegate al preventivo per il certificatore HACCP — pronto per ispezione USL.",
      },
    ],
  },

  latina: {
    name: "Latina",
    region: "Lazio",
    slug: "latina",
    province: "LT",
    lat: 41.4677,
    lon: 12.9036,
    heroTitle: "Gestionale Edilizia per Imprese di Latina",
    heroSubtitle: "Software gestionale per imprese edili pontine: residenziale, agricolo, costiero. Controllo margini, gestione SAL e app cantiere mobile pensata per l'edilizia laziale.",
    heroImage: "/hero/stock/cantiere-1503387762-1400.webp",
    localStats: [
      { value: "19+", label: "Imprese edili pontine attive" },
      { value: "€ 3.2M", label: "Fatturato mensile gestito" },
      { value: "28%", label: "Riduzione costi nascosti" },
      { value: "4.8/5", label: "Valutazione clienti pontini" },
    ],
    localTestimonial: {
      quote: "Tra Latina e il litorale lavoriamo su residenziali e ristrutturazioni stagionali. Avere il controllo del margine reale di ogni cantiere ci ha fatto recuperare un 15% di utile che si perdeva nei costi nascosti.",
      author: "Massimo C.",
      company: "Pontina Costruzioni",
      city: "Latina",
      initials: "MC",
    },
    localProblems: [
      { emoji: "🌴", title: "Cantieri stagionali sulla costa", desc: "Sabaudia, Sperlonga, San Felice Circeo: cantieri concentrati nei mesi invernali per essere pronti per la stagione estiva. Pianificazione e SAL settimanali sono critici." },
      { emoji: "🌾", title: "Capannoni agricoli e bonifica pontina", desc: "L'Agro Pontino ha grandi aziende agricole che richiedono capannoni, magazzini, celle frigo. Logistica per cantieri rurali distanti tra loro richiede gestione mobile evoluta." },
      { emoji: "🏚️", title: "Riqualificazione case popolari anni '70", desc: "Bonus 110% e riqualificazione energetica su patrimonio edilizio pontino datato richiedono documentazione fiscale impeccabile e contabilità cantiere precisa." },
    ],
    relatedCities: [
      { name: "Roma", slug: "roma" },
      { name: "Napoli", slug: "napoli" },
      { name: "Pescara", slug: "pescara" },
    ],
    localContext: {
      heading: "Edilizia a Latina: Agro Pontino bonificato, costa tirrenica e prezzario Regione Lazio",
      body: "Latina è città di fondazione (1932): l'Agro Pontino è la più grande pianura bonificata d'Italia con grandi aziende agricole che commissionano regolarmente capannoni, magazzini e celle frigo. La costa pontina (Sabaudia, San Felice Circeo, Sperlonga, Terracina) è destinazione turistica con cantieri stagionali. Il patrimonio edilizio razionalista degli anni '30 nei centri di fondazione (Latina, Aprilia, Pomezia, Sabaudia) richiede interventi di adeguamento sismico. Prezzario di riferimento: Regione Lazio, lo stesso usato a Roma.",
      prezzarioLink: "https://www.regione.lazio.it/cittadini/lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Lazio (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Capannone agricolo nell'Agro Pontino con celle frigo e impianti di refrigerazione: come gestisco preventivo specialistico?",
        a: "I capannoni agroalimentari hanno impiantistica specifica (celle frigo, impianti di refrigerazione industriale, fognature). Crei voci di prezzario personalizzate riusabili e il preventivo articolato per fase tiene separate strutture, impianti e finiture certificate.",
      },
      {
        q: "Posso importare il prezzario Regione Lazio nei computi metrici di gara?",
        a: "Sì. Il prezzario Lazio si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Latina, ASL Latina e Provincia che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Cantieri stagionali sulla costa pontina con consegna tassativa entro maggio: come gestisco cronoprogramma e penali?",
        a: "Sui ricettivi e sulle seconde case costiere i tempi sono ferro. Lavori a ritroso dalla data di apertura e ricevi alert quando una lavorazione critica sta scivolando. Decidi se rinforzare squadra o avvertire il committente prima che diventi contenzioso.",
      },
      {
        q: "Riqualificazione energetica di case popolari anni '70 con Bonus Casa: come gestisco SAL, asseverazioni e fatturazione?",
        a: "Le commesse con bonus fiscali hanno scadenze SAL 30/60/100, asseverazioni tecniche di congruità e tracciamento sconto in fattura o cessione del credito. Generi il fascicolo per il visto di conformità in pochi click — senza ricostruirlo da Excel sparsi.",
      },
    ],
  },

  pisa: {
    name: "Pisa",
    region: "Toscana",
    slug: "pisa",
    province: "PI",
    lat: 43.7228,
    lon: 10.4017,
    heroTitle: "Gestionale Edilizia per Imprese di Pisa",
    heroSubtitle: "Software gestionale per imprese edili pisane: restauro storico, residenziale, edilizia universitaria e costiero versiliese. Controllo margini, fatturazione elettronica e app cantiere mobile.",
    heroImage: "/hero/stock/cantiere-1581578731548-1400.webp",
    localStats: [
      { value: "17+", label: "Imprese edili pisane attive" },
      { value: "€ 2.8M", label: "Fatturato mensile gestito" },
      { value: "30%", label: "Riduzione costi nascosti" },
      { value: "4.9/5", label: "Valutazione clienti toscani" },
    ],
    localTestimonial: {
      quote: "Il restauro storico a Pisa è il nostro pane. Ogni intervento è unico: con Edilizia in Cloud documentiamo materiali, ore e foto step by step. La Soprintendenza ci ha già fatto i complimenti sulla documentazione presentata.",
      author: "Tommaso L.",
      company: "Restauri Pisani Srl",
      city: "Pisa",
      initials: "TL",
    },
    localProblems: [
      { emoji: "🏛️", title: "Restauro vincolato del centro storico", desc: "Pisa è patrimonio UNESCO: ogni intervento richiede iter Soprintendenza, materiali tradizionali e documentazione fotografica continua. Il software deve archiviare tutto in modo strutturato." },
      { emoji: "🏫", title: "Edilizia universitaria con tempistiche rigide", desc: "Università di Pisa, Normale, Sant'Anna: i lavori sono concentrati nei mesi estivi (giugno-settembre) per non interrompere le lezioni. Cronoprogramma serrato e SAL settimanali obbligatori." },
      { emoji: "🌊", title: "Manutenzione case versiliesi", desc: "Le seconde case in Versilia (Tirrenia, Marina di Pisa, Forte dei Marmi) richiedono manutenzione costiera con materiali resistenti alla salsedine. Tracciamento garanzie e interventi nel tempo." },
    ],
    relatedCities: [
      { name: "Firenze", slug: "firenze" },
      { name: "Livorno", slug: "livorno" },
      { name: "Prato", slug: "prato" },
    ],
    localContext: {
      heading: "Edilizia a Pisa: torre, edilizia universitaria e prezzario Regione Toscana",
      body: "Pisa è città piccola con tre università di livello nazionale (Università di Pisa, Scuola Normale Superiore, Sant'Anna): l'edilizia universitaria genera cantieri concentrati nei mesi estivi (giugno-settembre) per non interrompere le lezioni. Il centro storico con la Piazza dei Miracoli UNESCO ha vincoli Soprintendenza totali. La costa pisana (Marina di Pisa, Tirrenia) e la Versilia (Forte dei Marmi, Pietrasanta) accolgono seconde case e ville costiere con manutenzione continua per resistere alla salsedine. Prezzario di riferimento: Regione Toscana.",
      prezzarioLink: "https://www.regione.toscana.it/-/prezzario-dei-lavori-pubblici",
      prezzarioLabel: "Prezzario Regione Toscana (sito ufficiale)",
    },
    localFaqs: [
      {
        q: "Lavori di adeguamento aule dell'Università di Pisa concentrati giugno-settembre: come gestisco cronoprogramma serrato e SAL settimanali?",
        a: "Le commesse universitarie hanno finestra temporale rigida (tre mesi estivi, riapertura a settembre tassativa). Dashboard cantiere con percentuale lavorazioni giornaliera, alert sui ritardi e SAL settimanali pronti per il RUP — non si scherza coi tempi sull'edilizia universitaria.",
      },
      {
        q: "Posso importare il prezzario Regione Toscana nei computi metrici di gara?",
        a: "Sì. Il prezzario Toscana si importa in Excel o PDF, voci indicizzate per codice ufficiale. Comodo per gare di Comune di Pisa, AOUP, Università di Pisa, Scuola Normale e Sant'Anna che lo richiedono nei capitolati di appalto pubblico.",
      },
      {
        q: "Restauro in Piazza dei Miracoli con Soprintendenza presente continuamente: come gestisco fotodocumentazione e materiali certificati?",
        a: "Su Piazza dei Miracoli ogni movimento è documentato: foto ante/in corso/post geolocalizzate, materiali certificati con scheda tecnica, archiviato per pratica con numero protocollo Soprintendenza. Il fascicolo è pronto per qualsiasi sopralluogo o richiesta integrazioni.",
      },
      {
        q: "Manutenzione di case versiliesi con problemi di salsedine: come traccio interventi nel tempo e garanzie?",
        a: "Ogni cliente ha la sua scheda con storico interventi (date, lavorazioni, materiali, garanzie residue). Quando il committente chiama per un problema, vedi subito se è in garanzia, quando hai fatto l'ultimo intervento e con quali materiali — niente improvvisazione.",
      },
    ],
  },
};

// Link contestuali dal territorio al prodotto: ogni pagina città manda alle
// funzionalità che le imprese cercano davvero ("software gestione cantieri",
// "software preventivi edilizia"...) e alla pagina pillar. Prima le 43 pagine
// linkavano solo /funzionalita/ e /demo/: l'autorità locale moriva lì.
const CITY_FEATURE_LINKS: Array<{ href: string; label: string }> = [
  { href: "/funzionalita/gestione-cantieri/", label: "Gestione cantieri" },
  { href: "/funzionalita/preventivi-edilizia/", label: "Preventivi e computi" },
  { href: "/funzionalita/fatturazione-elettronica/", label: "Fatturazione elettronica" },
  { href: "/funzionalita/margini-cantiere/", label: "Margini per commessa" },
  { href: "/funzionalita/timbrature-gps/", label: "Presenze e timbrature GPS" },
  { href: "/funzionalita/gestione-subappalti/", label: "Subappalti e DURC" },
  { href: "/funzionalita/app-cantiere-mobile/", label: "App cantiere" },
  { href: "/funzionalita/crm-edilizia/", label: "CRM e follow-up preventivi" },
];

const FEATURES = [
  "Controllo margini reali su ogni commessa in tempo reale",
  "SAL automatici e fatturazione elettronica integrata",
  "App mobile per cantiere (iOS e Android, anche offline)",
  "Timbrature e presenze operai geolocalizzate",
  "Previsione liquidità a 30-60-90 giorni",
  "Gestione subappaltatori e fornitori locali",
  "Dashboard AI con alert su margini a rischio",
  "CRM per preventivi e acquisizione clienti locali",
];

export default function CityLanding() {
  const { city: cityParam } = useParams<{ city: string }>();
  const { pathname } = useLocation();
  // React Router v7 does not match params embedded mid-segment (/path-:param),
  // so fall back to extracting the city slug from the pathname directly.
  const city = cityParam ?? pathname.match(/^\/software-gestionale-edilizia-(.+)$/)?.[1];
  const config = city ? CITY_CONFIGS[city] : undefined;

  const baseUrl = "https://www.ediliziaincloud.com";
  const pageUrl = config ? `${baseUrl}/software-gestionale-edilizia-${config.slug}` : baseUrl;

  useSEO({
    // "per Imprese di Monza e Brianza" sfora i 60 caratteri e Google tronca: la
    // forma corta dice la stessa cosa e ci sta.
    // SEO 2026-09-07: fino a ieri Googlebot riceveva lo stub "Software Gestionale
    // Edilizia <città> | Edilizia in Cloud"; passando al prerender il title
    // perdeva "Software", cioè metà della keyword locale. Il suffisso si
    // aggiunge solo se il totale resta entro i 60 caratteri.
    title: config
      ? (() => {
          const base = `Software ${config.heroTitle.replace("per Imprese di ", "a ")}`;
          const suffix = " | Edilizia in Cloud";
          return base.length + suffix.length > 60 ? base : `${base}${suffix}`;
        })()
      : "Edilizia in Cloud",
    description: config?.heroSubtitle ?? "",
    canonical: config ? `/software-gestionale-edilizia-${config.slug}` : "/",
    keywords: config ? `gestionale edilizia ${config.name}, software impresa edile ${config.name}, software cantieri ${config.name}, gestione cantieri ${config.region}, ERP edilizia ${config.name}` : "",
  });

  // Guard DOPO tutti gli hooks (Rules of Hooks)
  if (!config) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-white text-[#111111]">

      {/* Structured Data */}
      <JsonLd id="jsonld-breadcrumb-city" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": `Gestionale Edilizia ${config.name}`, "item": pageUrl },
        ]
      }} />
      <JsonLd id="jsonld-city-localbusiness" data={{
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": `${pageUrl}/#localbusiness`,
        "name": "Edilizia in Cloud",
        "url": baseUrl,
        "telephone": "+39-350-178-0908",
        "areaServed": [
          { "@type": "City", "name": config.name },
          { "@type": "AdministrativeArea", "name": config.region },
        ],
        "geo": { "@type": "GeoCoordinates", "latitude": config.lat, "longitude": config.lon },
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Via Aurelio Saffi 29",
          "postalCode": "20123",
          "addressLocality": "Milano",
          "addressCountry": "IT",
        },
        "review": {
          "@type": "Review",
          "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" },
          "author": { "@type": "Person", "name": config.localTestimonial.author },
          "reviewBody": config.localTestimonial.quote,
          "itemReviewed": {
            "@type": "SoftwareApplication",
            "name": "Edilizia in Cloud",
            "url": baseUrl,
          },
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "127",
          "bestRating": "5",
        },
      }} />
      <JsonLd id="jsonld-city-software" data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": `Edilizia in Cloud — Gestionale Edilizia ${config.name}`,
        "applicationCategory": "BusinessApplication",
        "url": baseUrl,
        "description": config.heroSubtitle,
        "areaServed": { "@type": "City", "name": config.name },
        "offers": {
          "@type": "AggregateOffer",
          "lowPrice": 127, "highPrice": 547, "priceCurrency": "EUR", "offerCount": 3,
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9", "reviewCount": "127", "bestRating": "5",
        },
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 md:pt-36 pb-20 bg-[#0d0d0d]">
        <div className="absolute inset-0">
          <img
            src={config.heroImage}
            srcSet={`${config.heroImage.replace("-1400.webp", "-768.webp")} 768w, ${config.heroImage} 1400w`}
            sizes="100vw"
            alt={`Cantiere edile a ${config.name}`}
            width={1400}
            height={700}
            {...prioritaCaricamento("high")}
            loading="eager"
            decoding="sync"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d0d0d]/60 via-[#0d0d0d]/40 to-[#0d0d0d]" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/20 mb-6">
            <MapPin size={13} className="text-[#F97415]" />
            <span className="text-[#F97415] text-xs font-bold uppercase tracking-widest">
              {config.name} · {config.region}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            {config.heroTitle}
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-3xl mx-auto mb-10 leading-relaxed">
            {config.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/demo/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
            >
              Prova Gratis 31 Giorni <ArrowRight size={18} />
            </Link>
            <Link
              to="/prezzi/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white font-bold hover:border-white/40 hover:bg-white/5 transition-all"
            >
              Vedi i Prezzi
            </Link>
          </div>
        </div>
      </section>

      {/* Local Stats */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {config.localStats.map((s, i) => (
              <div key={i}>
                <p className="text-3xl md:text-4xl font-extrabold text-[#F97415]">{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Local Problems */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-4">
              Le sfide specifiche delle imprese edili di {config.name}
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Ogni città ha le sue complessità. Ecco perché le imprese edili di {config.name} scelgono Edilizia in Cloud.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {config.localProblems.map((p, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="text-3xl mb-4">{p.emoji}</div>
                <h3 className="font-bold text-[#111111] mb-2">{p.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-6 leading-tight">
                Tutto ciò che serve a un'impresa edile di {config.name}
              </h2>
              <ul className="space-y-3">
                {FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-[#F97415] mt-0.5 shrink-0" />
                    <span className="text-gray-700 text-sm">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/funzionalita/"
                className="inline-flex items-center gap-2 mt-8 text-[#F97415] font-semibold hover:gap-3 transition-all"
              >
                Vedi tutte le funzionalità <ArrowRight size={16} />
              </Link>
            </div>
            <div className="bg-[#f8f9fa] rounded-3xl p-8">
              <div className="flex items-center gap-2 mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill="#F97415" className="text-[#F97415]" />
                ))}
                <span className="text-sm font-bold text-[#111111] ml-1">4.9/5</span>
              </div>
              <blockquote className="text-[#111111] font-medium leading-relaxed mb-6 text-lg">
                "{config.localTestimonial.quote}"
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F97415] flex items-center justify-center text-white text-sm font-bold">
                  {config.localTestimonial.initials}
                </div>
                <div>
                  <p className="font-bold text-[#111111] text-sm">{config.localTestimonial.author}</p>
                  <p className="text-gray-400 text-xs">{config.localTestimonial.company} · {config.localTestimonial.city}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Local Context — contenuto SEO city-specific (normativa, prezzario, territorio) */}
      {config.localContext && (
        <section className="py-16 md:py-24 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-6 leading-tight">
              {config.localContext.heading}
            </h2>
            <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
              {config.localContext.body}
            </p>
            {config.localContext.prezzarioLink && config.localContext.prezzarioLabel && (
              <a
                href={config.localContext.prezzarioLink}
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex items-center gap-2 text-[#F97415] font-semibold hover:gap-3 transition-all text-sm"
              >
                <MapPin size={16} /> {config.localContext.prezzarioLabel}
                <ArrowRight size={14} />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Local FAQ — domande city-specific con FAQ schema JSON-LD */}
      {config.localFaqs && config.localFaqs.length > 0 && (
        <>
          <JsonLd
            id="jsonld-city-faq"
            data={{
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: config.localFaqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }}
          />
          <section className="py-16 md:py-24 bg-[#f8f9fa] border-t border-gray-100">
            <div className="max-w-3xl mx-auto px-6">
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-10 text-center leading-tight">
                Domande frequenti — Edilizia in Cloud a {config.name}
              </h2>
              <div className="space-y-4">
                {config.localFaqs.map((f, i) => (
                  <details
                    key={i}
                    className="group bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    <summary className="cursor-pointer list-none p-5 md:p-6 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors">
                      <h3 className="font-bold text-[#111111] text-base md:text-lg leading-snug pr-4">
                        {f.q}
                      </h3>
                      <span className="text-[#F97415] text-2xl leading-none shrink-0 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="px-5 md:px-6 pb-5 md:pb-6 text-gray-600 text-sm md:text-base leading-relaxed">
                      {f.a}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* CTA */}
      <section className="py-16 md:py-24 bg-[#111111]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            Inizia gratis — con supporto dedicato in italiano
          </h2>
          <p className="text-white/60 text-lg mb-8">
            31 giorni di prova gratuita. Il nostro team configura tutto con te in 48 ore.
            Cancella quando vuoi, nessun obbligo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              to="/demo/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
            >
              Richiedi Demo Gratuita <ArrowRight size={18} />
            </Link>
            <a
              href="tel:+393501780908"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white font-bold hover:border-white/40 hover:bg-white/5 transition-all"
            >
              <Phone size={16} /> +39 350 178 0908
            </a>
          </div>
          <p className="text-white/25 text-xs">
            Serviamo imprese edili in tutta Italia — {config.name}, {config.region} e oltre.
          </p>
        </div>
      </section>

      {/* Funzionalità più usate + pagina pillar */}
      <section className="py-12 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-[#111111] mb-2">
            Le funzionalità più usate dalle imprese edili di {config.name}
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-2xl mx-auto">
            Cantieri, preventivi, fatture e presenze in un unico gestionale, usato ogni giorno
            dalle imprese di {config.name} e provincia.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {CITY_FEATURE_LINKS.map((f) => (
              <Link
                key={f.href}
                to={f.href}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm hover:border-[#F97415]/40 hover:text-[#F97415] transition-all"
              >
                <CheckCircle2 size={13} className="text-[#F97415]" /> {f.label}
              </Link>
            ))}
          </div>
          <Link
            to="/software-gestionale-edilizia/"
            className="inline-flex items-center gap-2 text-[#F97415] font-semibold hover:gap-3 transition-all"
          >
            Scopri il software gestionale edilizia per tutta Italia <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Other cities */}
      <section className="py-12 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5">
            Edilizia in Cloud in altre città
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {config.relatedCities.map((c) => (
              <Link
                key={c.slug}
                to={`/software-gestionale-edilizia-${c.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm hover:border-[#F97415]/40 hover:text-[#F97415] transition-all"
              >
                <MapPin size={13} /> {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
