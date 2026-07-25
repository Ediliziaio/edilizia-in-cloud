import {
  Factory, Layers, Clock, TrendingUp, Smartphone, Wallet, FileText,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software per Carpenteria Metallica | Officina e Cantiere",
  seoDescription: "Software per carpenteria metallica: commesse con officina e posa, distinte materiali, avanzamento, DDT e margini reali. Prova gratis 31 giorni.",
  seoKeywords: "software per carpenteria metallica, gestionale carpenteria metallica, distinta materiali acciaio, commesse officina cantiere, avanzamento produzione carpenteria, DDT carpenteria, software strutture metalliche, margini commessa carpenteria",
  seoCanonical: "/per/carpenteria-metallica",

  // Hero
  badge: "Per Carpenterie Metalliche e Strutture in Acciaio",
  heroTitle: (
    <>
      <span className="text-white">Software per carpenteria metallica: officina e cantiere non si parlano.</span>{" "}
      <span className="text-[#F97415]">Una commessa sola: distinte, DDT, posa e avanzamento.</span>
    </>
  ),
  heroSubtitle:
    "In officina la produzione corre, in cantiere la posa aspetta — e nessuno sa a che punto siamo. Edilizia in Cloud è il software per carpenterie metalliche: ogni commessa tiene insieme produzione in officina e posa in cantiere, con distinte materiali collegate, DDT per le spedizioni, avanzamento documentato con foto e ore di officina e di posa separate. Il margine reale lo vedi mentre la commessa avanza — non quando l'acciaio è già montato e pagato.",
  heroImage: "https://images.unsplash.com/photo-1565043666747-69f6646db940?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "CF", name: "Carpenteria Ferraro", city: "Vicenza", months: 14, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "SM", name: "Strutture Metalliche Bassi", city: "Lecco", months: 9, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "AC", name: "Acciai Conti", city: "Terni", months: 16, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "MS", name: "Metal Sud Carpenterie", city: "Taranto", months: 11, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Metà commessa in officina, metà in cantiere. E nessuno vede l'insieme.",
  problemsSubtitle:
    "La carpenteria metallica è un mestiere spezzato in due: si produce in officina, si monta in cantiere. Se i due pezzi non parlano — distinte, ore, spedizioni, avanzamento — la commessa perde soldi nel passaggio. Ogni volta.",
  problems: [
    {
      emoji: "🏭",
      title: "Officina e cantiere sono due mondi che non si parlano",
      desc: "In officina si taglia e si salda, in cantiere si monta. Ma chi monta non sa cosa è pronto, chi produce non sa quando si posa, e tu fai da ponte al telefono. Basta una trave non pronta il giorno del montaggio e la gru noleggiata sta ferma a tue spese.",
    },
    {
      emoji: "📋",
      title: "Distinte materiali su Excel, ognuna diversa dall'altra",
      desc: "Profili HEA, lamiere, tubolari, bulloneria: la distinta della commessa sta su un Excel, gli ordini al fornitore su un altro, e quello che è arrivato davvero lo sa solo il magazziniere. Quando manca un profilo, lo scopri al taglio — e la commessa slitta.",
    },
    {
      emoji: "⏱️",
      title: "Ore di officina e ore di posa mai separate",
      desc: "Quanto è costato produrre quella scala: taglio, saldatura, verniciatura? E quanto montarla in cantiere? Se le ore stanno tutte in un mucchio, non sai dove guadagni e dove perdi — e i preventivi li fai a sensazione, per sempre.",
    },
    {
      emoji: "🚛",
      title: "Spedizioni in cantiere con DDT scritti a mano",
      desc: "Il camion parte con le travi e il DDT si compila di corsa, a mano, senza legame con la commessa. Cosa è stato spedito e cosa manca? A fine commessa nessuno sa dire se in cantiere è arrivato tutto — finché il montatore non chiama.",
    },
    {
      emoji: "📉",
      title: "Il margine si scopre quando la struttura è già montata",
      desc: "Il preventivo era buono. Poi l'acciaio è aumentato tra ordine e consegna, la saldatura ha preso il doppio delle ore, il montaggio è slittato di una settimana. Il margine vero lo scopri a commessa chiusa — quando non puoi più fare niente.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 21.000",
    lossLabel: "tra commesse preventivate sotto costo e varianti mai fatturate",
    wasteValue: "€ 10.800",
    wasteLabel: "in ore a fare da ponte tra officina e cantiere, distinte rifatte e DDT a mano",
    errorValue: "€ 8.400",
    errorLabel: "in materiale mancante al taglio, spedizioni incomplete e gru ferme",
    totalLoss: "€ 40.200",
    softwareCost: "€ 2.388",
    roiX: "16x",
  },

  // Transformation
  transformation: {
    title: "Com'è una commessa prima e dopo Edilizia in Cloud",
    subtitle:
      "Stessa officina, stesse squadre di posa. Cambia che la commessa è una sola, dall'ordine dell'acciaio all'ultimo bullone — e i numeri si vedono strada facendo.",
    fromTitle: "Prima: la commessa spezzata",
    fromItems: [
      "Officina e cantiere coordinati a telefonate: tu sei il ponte",
      "Distinta materiali su Excel, ordini su email, arrivi nella testa del magazziniere",
      "Ore di taglio, saldatura e montaggio tutte in un mucchio unico",
      "DDT scritti a mano al volo, mai collegati alla commessa",
      "Avanzamento produzione invisibile: 'a che punto siamo?' si chiede in officina",
      "Margine scoperto a commessa chiusa, quando l'errore è già costato",
    ],
    toTitle: "Dopo: una commessa sola",
    toItems: [
      "La commessa tiene insieme officina e cantiere: tutti vedono cosa è pronto e cosa si monta",
      "Distinta materiali collegata alla commessa: ordinato, arrivato e mancante sempre visibili",
      "Ore di officina e ore di posa registrate separate: sai quanto costa produrre e quanto montare",
      "DDT di spedizione generati dal gestionale, collegati alla commessa: spedito e mancante nero su bianco",
      "Avanzamento documentato con foto dall'officina e dal cantiere: lo stato si vede, non si chiede",
      "Margine per commessa aggiornato man mano: acciaio, ore, posa — tutto dentro",
    ],
  },

  // Stats
  stats: [
    {
      value: "1",
      label: "Commessa unica, officina + cantiere",
      sublabel: "Produzione e posa nello stesso flusso, visibile a tutti",
    },
    {
      value: "+10%",
      label: "Margine medio per commessa",
      sublabel: "Quando ore e acciaio si contano separati, i preventivi migliorano",
    },
    {
      value: "0",
      label: "Montaggi fermi per pezzi mancanti",
      sublabel: "Spedizioni con DDT collegati: cosa manca si sa prima, non in cantiere",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti per chi produce in officina e monta in cantiere",
  modulesSubtitle:
    "Commesse doppie, distinte, DDT, ore separate e avanzamento: i moduli seguono il flusso vero di una carpenteria metallica.",
  modules: [
    {
      icon: Factory,
      name: "Commesse Officina + Cantiere",
      desc: "Ogni commessa ha le sue fasi: produzione in officina e posa in cantiere, con date, squadre e stati di avanzamento. Chi produce vede quando si monta, chi monta vede cosa è pronto. Tu smetti di fare da centralino.",
      saving: "Zero gru ferme per pezzi non pronti",
    },
    {
      icon: Layers,
      name: "Distinte Materiali",
      desc: "La distinta della commessa — profili, lamiere, tubolari, bulloneria — sta nel gestionale, collegata a ordini e arrivi. Vedi cosa è ordinato, cosa è arrivato e cosa manca prima di andare al taglio, non durante.",
      saving: "Mai più fermi al taglio per materiale mancante",
    },
    {
      icon: Clock,
      name: "Ore Officina e Ore di Posa Separate",
      desc: "Taglio, saldatura, verniciatura in officina; montaggio in cantiere con timbrature GPS. Le ore finiscono sulla commessa divise per fase: sai quanto costa produrre una struttura e quanto montarla — e preventivi con numeri veri.",
      saving: "Costo di produzione e posa finalmente noti",
    },
    {
      icon: FileText,
      name: "DDT di Spedizione",
      desc: "Il camion parte e il DDT esce dal gestionale, collegato alla commessa: cosa è stato spedito, quando, con che mezzo. A colpo d'occhio vedi cosa è già in cantiere e cosa deve ancora partire. Fine dei DDT scritti sul cofano.",
      saving: "Spedito e mancante sempre nero su bianco",
    },
    {
      icon: Camera,
      name: "Avanzamento con Rapportini e Foto",
      desc: "L'officina carica le foto dei pezzi finiti, la squadra di posa documenta il montaggio giorno per giorno. L'avanzamento della commessa si vede dallo schermo — e i SAL verso il committente si difendono con foto datate.",
      saving: "SAL documentati, non discussi",
    },
    {
      icon: TrendingUp,
      name: "Margini per Commessa",
      desc: "Acciaio comprato, ore di officina, ore di posa, noli e trasporti: ogni costo finisce sulla commessa. Il margine si aggiorna man mano. Se l'acciaio è aumentato o la saldatura sta prendendo il doppio delle ore, lo vedi subito.",
      saving: "+10% margine medio per commessa",
    },
  ],

  // AI showcase
  aiShowcase: {
    title: "L'AI che lavora per te, tra officina e cantiere",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per una carpenteria metallica significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando una commessa sta scivolando",
        desc: "Ore di saldatura oltre il previsto, acciaio pagato più del preventivato, montaggio che slitta: se il margine scende sotto la tua soglia, Silvio ti avvisa mentre la commessa è aperta — in tempo per la variante.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara fatture di SAL e solleciti",
        desc: "SAL di produzione o di montaggio maturato? Silvio ti mette in firma la bozza di fattura. Committente in ritardo con i pagamenti? Prepara il sollecito con il tono giusto. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Avanzamento",
        title: "Trasforma foto e vocali in rapportini",
        desc: "Il capofficina fotografa i pezzi finiti, il montatore manda un vocale dal cantiere: Silvio scrive i rapportini, aggiorna l'avanzamento della commessa e collega tutto alla fase giusta.",
      },
      {
        icon: Sparkles,
        tag: "Preventivi",
        title: "Aiuta a preventivare con i costi veri",
        desc: "Quanto ti costa un'ora di saldatura? E un kg di struttura posata? Silvio lo legge dalle tue commesse chiuse e ti aiuta a preventivare la prossima con numeri reali — non con i prezzi di tre anni fa.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — commesse, distinte, ore, spedizioni, incassi.",
  },

  // Platform extra
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a una carpenteria metallica, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, SAL di produzione e montaggio collegati alle commesse.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi dai committenti, pagamenti ai fornitori di acciaio: la cassa a 30, 60 e 90 giorni.",
      },
      {
        icon: Users,
        name: "CRM e preventivi",
        desc: "Richieste, offerte e trattative in un'unica fila: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino",
        desc: "Profili, lamiere e bulloneria tracciati tra magazzino, officina e cantiere.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e certificazioni",
        desc: "Contratti, disegni, certificati dei materiali archiviati per commessa: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per commessa, costi di officina e posa: i numeri in una schermata.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Carpenteria Ferraro",
    city: "Vicenza",
    sector: "Carpenteria metallica e strutture in acciaio",
    revenue: "1,2M €",
    person: "Giulio Ferraro",
    role: "Titolare",
    initials: "GF",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Facciamo capannoni, scale e soppalchi: metà del lavoro in officina, metà in cantiere. Il mio problema era che i due mondi non si parlavano — la squadra di posa scopriva in cantiere che mancava una trave, e la gru noleggiata stava ferma. Adesso la commessa è una: la distinta dice cosa è arrivato, l'officina carica le foto dei pezzi finiti, i DDT dicono cosa è partito. E per la prima volta so quanto mi costa produrre un kg di struttura e quanto montarlo. I preventivi sono un'altra cosa.",
    metrics: [
      { label: "Montaggi fermi per pezzi mancanti", before: "1 al mese", after: "0" },
      { label: "Ore officina vs posa", before: "un mucchio unico", after: "separate per commessa" },
      { label: "DDT collegati alla commessa", before: "a mano, sparsi", after: "tutti, dal gestionale" },
      { label: "Margine medio per commessa", before: "scoperto a fine", after: "+10%, visibile sempre" },
    ],
    image: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=800&q=80",
  },

  // FAQ
  faq: [
    {
      q: "Come gestisco una commessa che ha produzione in officina e posa in cantiere?",
      a: "La commessa è una sola con le sue fasi: produzione (taglio, saldatura, verniciatura) e posa in cantiere, ognuna con date, squadre e avanzamento. Chi è in officina vede quando è previsto il montaggio, chi monta vede cosa è pronto e cosa è già stato spedito. Tutto lo stato della commessa sta in una schermata, senza telefonate di coordinamento.",
    },
    {
      q: "Come funzionano le distinte materiali?",
      a: "La distinta della commessa — profili, lamiere, tubolari, bulloneria — sta nel gestionale, collegata agli ordini ai fornitori e agli arrivi in magazzino. In ogni momento vedi cosa è ordinato, cosa è arrivato e cosa manca. Il materiale mancante lo scopri prima di programmare il taglio, non quando la sega è ferma.",
    },
    {
      q: "Posso separare le ore di officina dalle ore di montaggio in cantiere?",
      a: "Sì, ed è il punto che cambia i preventivi. Le ore di officina si registrano sulle fasi di produzione, le ore di posa con le timbrature GPS della squadra in cantiere. Ogni commessa ti dice quanto è costato produrre la struttura e quanto montarla. Dopo tre commesse sai i tuoi costi veri al kg e all'ora — e preventivi di conseguenza.",
    },
    {
      q: "Come gestisco i DDT per le spedizioni in cantiere?",
      a: "Il DDT si genera dal gestionale, collegato alla commessa: cosa parte, quando, verso quale cantiere. La squadra di posa vede cosa è in arrivo e a fine commessa hai l'elenco completo di ciò che è stato spedito. Se manca qualcosa, si vede dal confronto con la distinta — prima che il montatore chiami dal cantiere.",
    },
    {
      q: "Come documento l'avanzamento verso il committente?",
      a: "L'officina carica le foto dei pezzi finiti, la squadra di posa documenta il montaggio con rapportini fotografici giornalieri. Ogni avanzamento è datato e archiviato sulla commessa. Quando fatturi un SAL di produzione o di montaggio, la documentazione c'è già — e le contestazioni si chiudono con le foto, non con le discussioni.",
    },
    {
      q: "Vedo il margine reale della commessa, acciaio compreso?",
      a: "Sì. Ogni commessa raccoglie i suoi costi veri: acciaio al prezzo pagato (non a quello preventivato), ore di officina, ore di posa, trasporti e noli. Il margine si aggiorna man mano che la commessa avanza. Se l'acciaio è aumentato tra ordine e consegna o la saldatura sta prendendo più ore, lo vedi subito — in tempo per correggere.",
    },
  ],

  verticalFeatures: [
    {
      icon: Factory,
      problem: "Officina e cantiere non si parlano: la trave non è pronta e la gru noleggiata sta ferma",
      solution: "La commessa unica tiene insieme produzione e posa: fasi, date, squadre, avanzamento. Chi produce vede quando si monta, chi monta vede cosa è pronto e cosa è partito. Il montaggio si programma su dati, non su speranze.",
      economicBenefit: "0",
      benefitLabel: "montaggi fermi per pezzi non pronti",
    },
    {
      icon: Layers,
      problem: "Distinta su Excel, ordini su email: il profilo mancante si scopre al taglio",
      solution: "La distinta materiali è collegata alla commessa, agli ordini fornitori e agli arrivi. Ordinato, arrivato e mancante si vedono in una schermata — e il materiale mancante si scopre quando puoi ancora ordinarlo senza fermare nulla.",
      economicBenefit: "−100%",
      benefitLabel: "fermi produzione per materiale mancante",
    },
    {
      icon: Clock,
      problem: "Ore di taglio, saldatura e montaggio in un mucchio unico: costi veri sconosciuti",
      solution: "Ore di officina per fase di produzione, ore di posa con timbrature GPS in cantiere. Ogni commessa dice quanto costa produrre e quanto montare. Dopo poche commesse conosci i tuoi costi al kg — e i preventivi cambiano faccia.",
      economicBenefit: "€/kg reale",
      benefitLabel: "di produzione e posa, conosciuto e usato nei preventivi",
    },
    {
      icon: FileText,
      problem: "DDT scritti a mano al volo: cosa è arrivato in cantiere non lo sa nessuno",
      solution: "I DDT di spedizione escono dal gestionale collegati alla commessa: cosa è partito, quando, verso dove. Il confronto con la distinta dice subito cosa manca. La squadra di posa lo vede dall'app prima che il camion arrivi.",
      economicBenefit: "100%",
      benefitLabel: "delle spedizioni tracciate sulla commessa",
    },
    {
      icon: TrendingUp,
      problem: "L'acciaio aumenta tra ordine e consegna, le ore lievitano — e il margine si scopre a fine",
      solution: "Ogni costo finisce sulla commessa al valore vero: acciaio pagato, ore registrate, trasporti. Il margine si aggiorna man mano. Se la commessa sta scivolando sotto la soglia, l'avviso arriva quando puoi ancora chiedere la variante.",
      economicBenefit: "+10%",
      benefitLabel: "margine medio sulle commesse monitorate",
    },
  ],
  verticalFeaturesTitle: "Una commessa sola: dall'ordine dell'acciaio all'ultimo bullone",
  verticalFeaturesSubtitle: "Distinte collegate, ore separate tra officina e posa, DDT tracciati, avanzamento fotografato e margini visibili. Il flusso vero di una carpenteria, in un sistema solo.",
  demoLabel: "Vedi una commessa vera: distinta, produzione, spedizione e posa in un'unica schermata con il margine aggiornato",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Officina e cantiere, una commessa sola.</span>{" "}
      <span className="text-[#F97415]">E il margine si vede prima di montare.</span>
    </>
  ),
  ctaSubtitle:
    "Prova Edilizia in Cloud gratis per 31 giorni, oppure prenota 30 minuti di demo: impostiamo una tua commessa vera — distinta, fasi di officina, spedizioni e posa — e ti mostriamo dove stanno finendo i margini.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior software per una carpenteria metallica?",
      a: "Edilizia in Cloud è il software per carpenterie metalliche: commesse che uniscono produzione in officina e posa in cantiere, distinte materiali collegate a ordini e arrivi, DDT di spedizione, ore di officina e posa separate, avanzamento con foto e margini in tempo reale.",
    },
    {
      q: "Come si gestisce una commessa con produzione in officina e montaggio in cantiere?",
      a: "La commessa è unica con fasi di produzione e di posa: date, squadre e avanzamento visibili a tutti. Le distinte materiali, i DDT di spedizione e le ore delle due fasi restano collegati alla stessa commessa.",
    },
    {
      q: "Si possono separare i costi di officina dai costi di posa?",
      a: "Sì. Le ore di officina si registrano sulle fasi di produzione e quelle di posa con timbrature GPS in cantiere. Ogni commessa mostra quanto è costato produrre la struttura e quanto montarla, con il margine aggiornato man mano.",
    },
  ],
};

export default function CarpenteriaMetallica() {
  return <PerTipoPageTemplate config={config} />;
}
