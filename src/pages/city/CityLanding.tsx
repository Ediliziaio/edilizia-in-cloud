import { Link, useParams, useLocation, Navigate } from "react-router-dom";
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
    heroImage:
      "https://images.unsplash.com/photo-1513581166391-887a96ddeafd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1555992336-03a23c7b20ee?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1565514020179-026b92b84bb6?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1533676802871-eca1ae998cd5?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1541343672885-9be56236302a?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1554629947-334ff61d85dc?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1612595434655-c758e8ea9b79?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1567604458536-1fcb6a4f9c91?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
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
        title: "PNRR e fondi europei: grande opportunità, burocrazia…",
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
    heroImage:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=80",
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
    heroImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
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
  },
};

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
    title: config ? `${config.heroTitle} | Edilizia in Cloud` : "Edilizia in Cloud",
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
        "name": "Edilizia in Cloud — Domus Group S.r.l.",
        "url": baseUrl,
        "telephone": "+39-02-87198520",
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
          "lowPrice": 79, "highPrice": 319, "priceCurrency": "EUR", "offerCount": 3,
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
            alt={`Cantiere edile a ${config.name}`}
            width={1400}
            height={700}
            fetchpriority="high"
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
              to="/demo"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
            >
              Prova Gratis 31 Giorni <ArrowRight size={18} />
            </Link>
            <Link
              to="/prezzi"
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
                to="/funzionalita"
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
              to="/demo"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
            >
              Richiedi Demo Gratuita <ArrowRight size={18} />
            </Link>
            <a
              href="tel:+390287198520"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white font-bold hover:border-white/40 hover:bg-white/5 transition-all"
            >
              <Phone size={16} /> +39 02 87198520
            </a>
          </div>
          <p className="text-white/25 text-xs">
            Serviamo imprese edili in tutta Italia — {config.name}, {config.region} e oltre.
          </p>
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
