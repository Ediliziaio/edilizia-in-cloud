import { Link, useParams, Navigate } from "react-router-dom";
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
  const { city } = useParams<{ city: string }>();
  const config = city ? CITY_CONFIGS[city] : undefined;

  if (!config) return <Navigate to="/" replace />;

  const baseUrl = "https://ediliziaincloud.com";
  const pageUrl = `${baseUrl}/software-gestionale-edilizia-${config.slug}`;

  useSEO({
    title: `${config.heroTitle} | Edilizia in Cloud`,
    description: config.heroSubtitle,
    canonical: `/software-gestionale-edilizia-${config.slug}`,
    keywords: `gestionale edilizia ${config.name}, software impresa edile ${config.name}, software cantieri ${config.name}, gestione cantieri ${config.region}, ERP edilizia ${config.name}`,
  });

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
        "@id": `${baseUrl}/#organization`,
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
            fetchPriority="high"
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
            Nessuna carta di credito, nessun contratto.
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
