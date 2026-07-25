import {
  Truck, Fuel, Clock, TrendingUp, Smartphone, Wallet, FileText,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software Imprese Movimento Terra | Mezzi e Costi a Commessa",
  seoDescription: "Software per imprese di movimento terra: ore macchina, gasolio e manutenzioni sulla commessa, noli e margini reali. Prova gratis 31 giorni.",
  seoKeywords: "software imprese movimento terra, gestionale movimento terra, ore macchina escavatore, costi gasolio commessa, gestione noli, software scavi e demolizioni, rapportini scavo, margini cantiere movimento terra, manutenzione mezzi",
  seoCanonical: "/per/movimento-terra",

  // Hero
  badge: "Per Imprese di Movimento Terra, Scavi e Demolizioni",
  heroTitle: (
    <>
      <span className="text-white">Software per movimento terra: a fine mese le ore macchina non tornano mai.</span>{" "}
      <span className="text-[#F97415]">Mezzi, gasolio e noli sulla commessa giusta.</span>
    </>
  ),
  heroSubtitle:
    "L'escavatore ha lavorato tutto il mese, ma su quali cantieri — e a che costo? Edilizia in Cloud è il software per le imprese di movimento terra: le ore macchina di ogni mezzo si registrano dal telefono con i rapportini di giornata, gasolio, manutenzioni e noli si caricano come costi sulla commessa giusta, e il margine di ogni cantiere si vede mentre scavi — non a fine anno. Con DDT e fattura elettronica compresi.",
  heroImage: "https://images.unsplash.com/photo-1506784365847-bbad939e9335?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "SB", name: "Scavi Bonetti", city: "Brescia", months: 13, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "MT", name: "Movimento Terra Rossi", city: "Piacenza", months: 9, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "ED", name: "Escavazioni De Luca", city: "Frosinone", months: 17, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "GS", name: "Gerardi Scavi e Demolizioni", city: "Sassari", months: 11, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "I mezzi lavorano tutto il giorno. Ma quanto rendono, nessuno lo sa.",
  problemsSubtitle:
    "Escavatori, pale, camion: capitali fermi sotto il sole che costano anche quando non girano. Se ore macchina, gasolio e manutenzioni non finiscono sul cantiere giusto, il margine è un numero inventato — e i preventivi dopo li fai sbagliati uguale.",
  problems: [
    {
      emoji: "⏱️",
      title: "Le ore macchina non le registra nessuno",
      desc: "L'escavatore ha lavorato sei ore al cantiere A e due al cantiere B — ma sul foglio, se c'è un foglio, c'è scritto 'giornata'. Senza le ore vere per mezzo e per cantiere, non sai quanto è costato uno scavo e il prossimo lo preventivi a occhio.",
    },
    {
      emoji: "⛽",
      title: "Gasolio e manutenzioni spariscono nei costi generali",
      desc: "Il pieno alla cisterna, il ricambio del martello, il tagliando della pala: tutto finisce in un mucchio unico di 'spese'. Nessuno sa quanto costa davvero far girare ogni mezzo — né quanto di quel costo va addebitato a ogni commessa.",
    },
    {
      emoji: "🚛",
      title: "Noli attivi e passivi tracciati sui foglietti",
      desc: "Il tuo escavatore a nolo dal cliente, il camion preso a nolo dal collega: giorni e ore segnati su un'agenda, fatture ricostruite a fine mese a memoria. Basta un giorno dimenticato e sono centinaia di euro regalati — a ogni giro.",
    },
    {
      emoji: "📉",
      title: "Il margine del cantiere lo scopri quando hai già smobilitato",
      desc: "Lo scavo sembrava pagato bene. Poi conti il gasolio, le ore extra per la roccia trovata sotto, il trasporto in discarica: il guadagno si è dimezzato. E lo scopri mesi dopo, quando ormai il preventivo sbagliato l'hai già rifatto altre tre volte.",
    },
    {
      emoji: "📋",
      title: "Rapportini di scavo su carta, contestazioni a voce",
      desc: "Metri cubi scavati, viaggi in discarica, ore di fermo per pioggia o attese: se non sono scritti da nessuna parte, quando il committente contesta il SAL vince chi urla più forte. E i fermi cantiere non li paga mai nessuno.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 19.000",
    lossLabel: "tra ore macchina non addebitate, noli dimenticati e scavi preventivati sotto costo",
    wasteValue: "€ 9.200",
    wasteLabel: "in ore a ricostruire giornate, gasolio e fatture di nolo a fine mese",
    errorValue: "€ 7.800",
    errorLabel: "in fermi non riconosciuti, contestazioni sui SAL e costi mezzi mai recuperati",
    totalLoss: "€ 36.000",
    softwareCost: "€ 2.388",
    roiX: "15x",
  },

  // Transformation
  transformation: {
    title: "Com'è gestire i mezzi prima e dopo Edilizia in Cloud",
    subtitle:
      "Gli stessi escavatori, le stesse pale. Cambia che ogni ora e ogni litro finiscono sul cantiere che li ha consumati — e i numeri parlano.",
    fromTitle: "Prima: si scava alla cieca",
    fromItems: [
      "Ore macchina segnate 'a giornata', quando vengono segnate",
      "Gasolio e manutenzioni in un mucchio unico di spese generali",
      "Noli attivi e passivi su agende e foglietti, fatturati a memoria",
      "Margine del cantiere scoperto mesi dopo la smobilitazione",
      "Rapportini di scavo su carta: fermi e attese mai riconosciuti",
      "Preventivi fatti a occhio, ripetendo gli stessi errori",
    ],
    toTitle: "Dopo: ogni ora ha un padrone",
    toItems: [
      "Rapportino di giornata dal telefono: mezzo, cantiere, ore, lavorazione — in un minuto",
      "Gasolio, ricambi e manutenzioni caricati come costi sulla commessa giusta",
      "Noli registrati giorno per giorno: a fine mese la fattura è già pronta, completa",
      "Margine per cantiere aggiornato mentre i lavori avanzano — mezzi compresi",
      "Fermi, attese e viaggi in discarica documentati con foto e data: i SAL si difendono da soli",
      "Preventivi costruiti sui costi orari veri dei tuoi mezzi",
    ],
  },

  // Stats
  stats: [
    {
      value: "100%",
      label: "Delle ore macchina registrate",
      sublabel: "Per mezzo e per cantiere, dal telefono dell'operatore",
    },
    {
      value: "+11%",
      label: "Margine medio per cantiere",
      sublabel: "Quando gasolio e ore finiscono sulla commessa giusta, i prezzi si aggiustano",
    },
    {
      value: "0",
      label: "Giorni di nolo dimenticati",
      sublabel: "Registrati giorno per giorno, fatturati tutti",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti per chi lavora con i mezzi, non solo con le mani",
  modulesSubtitle:
    "Ore macchina, costi per commessa, noli, rapportini di scavo, DDT e fatturazione: tutto quello che serve a un'impresa di movimento terra, collegato nello stesso posto.",
  modules: [
    {
      icon: Clock,
      name: "Ore Macchina per Mezzo e Cantiere",
      desc: "Ogni operatore registra dal telefono la giornata: mezzo usato, cantiere, ore, lavorazione. Le ore diventano costi sulla commessa giusta, con il costo orario di ogni mezzo. Fine delle 'giornate' generiche.",
      saving: "Ogni ora addebitata al cantiere giusto",
    },
    {
      icon: Fuel,
      name: "Gasolio e Manutenzioni sulla Commessa",
      desc: "Pieni, ricambi, tagliandi, riparazioni: ogni spesa si carica come costo sulla commessa o sul mezzo. Vedi quanto costa far girare ogni escavatore — e quel costo entra nel margine del cantiere, non in un mucchio di spese generali.",
      saving: "Costi mezzi visibili, non nascosti",
    },
    {
      icon: Truck,
      name: "Noli Attivi e Passivi",
      desc: "Il tuo mezzo a nolo dal committente, il camion preso dal collega: registri giorni e ore sulla commessa man mano. A fine mese la fattura di nolo è già pronta, senza ricostruzioni a memoria e senza giorni dimenticati.",
      saving: "Zero giorni di nolo regalati",
    },
    {
      icon: TrendingUp,
      name: "Commesse con Margini Reali",
      desc: "Ogni cantiere ha il suo conto: preventivato, ore macchina, ore uomo, gasolio, noli, trasporti, discarica. Il margine si aggiorna mentre scavi. Se la roccia sotto ti sta mangiando il guadagno, lo vedi subito — e chiedi la variante.",
      saving: "+11% margine medio per cantiere",
    },
    {
      icon: Camera,
      name: "Rapportini di Scavo con Foto",
      desc: "Metri cubi, viaggi in discarica, fermi per pioggia o attese: l'operatore documenta la giornata con foto e note dal telefono. Quando il committente discute il SAL, apri la commessa e mostri date, foto e quantità.",
      saving: "SAL documentati, non discussi",
    },
    {
      icon: FileText,
      name: "DDT e Fatturazione Elettronica",
      desc: "DDT per trasporti e movimentazioni collegati alle commesse, fatture elettroniche SDI per SAL, noli e lavori a misura. Tutto parte dal gestionale, collegato al cantiere, senza ricopiare nulla.",
      saving: "Fatture e DDT in un click",
    },
  ],

  // AI showcase
  aiShowcase: {
    title: "L'AI che lavora per te, mentre tu sei in cava o in cantiere",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua impresa e agiscono. Per un'impresa di movimento terra significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un cantiere sta mangiando il margine",
        desc: "Ore macchina oltre il preventivato, gasolio sopra la media, fermi che si accumulano: se il margine del cantiere scende sotto la tua soglia, Silvio ti avvisa mentre i mezzi sono ancora lì — in tempo per chiedere la variante.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara fatture di nolo e solleciti",
        desc: "Fine mese? Silvio ti mette in firma le fatture dei noli con i giorni registrati. SAL maturato e non pagato? Prepara il sollecito con il tono giusto. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Cantiere",
        title: "Trasforma foto e vocali in rapportini di giornata",
        desc: "L'operatore manda una foto dello scavo e un vocale: Silvio compila il rapportino — mezzo, ore, lavorazione, viaggi — e lo attacca alla commessa giusta. Nessuno si siede a scrivere.",
      },
      {
        icon: Sparkles,
        tag: "Preventivi",
        title: "Costruisce preventivi sui costi veri dei tuoi mezzi",
        desc: "Quanto ti costa un'ora di escavatore, gasolio e operatore compresi? Silvio lo sa dai tuoi dati — e ti aiuta a preventivare il prossimo scavo con numeri veri, non a occhio.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua impresa — mezzi, ore, gasolio, noli, cantieri.",
  },

  // Platform extra
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'impresa di movimento terra, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, SAL e noli collegati alle commesse, bozze pronte da approvare.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi dai committenti, pagamenti a fornitori di gasolio e ricambi: la cassa a 30, 60 e 90 giorni.",
      },
      {
        icon: Clock,
        name: "Timbrature GPS",
        desc: "Operatori e autisti timbrano dal telefono: presenze e ore uomo sul cantiere giusto.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Ricambi, attrezzature e materiali tracciati, DDT di entrata e uscita collegati alle commesse.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e scadenze",
        desc: "Contratti, verbali e documenti dei mezzi archiviati e in ordine: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per cantiere, costi per mezzo: i numeri dell'impresa in una schermata.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Scavi Bonetti",
    city: "Brescia",
    sector: "Movimento terra, scavi e demolizioni",
    revenue: "890.000 €",
    person: "Davide Bonetti",
    role: "Titolare",
    initials: "DB",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Ho sei mezzi tra escavatori, pale e camion. Prima le ore le segnavano gli operatori su un blocchetto, il gasolio era una voce unica a fine mese e i noli li fatturavo ricostruendo l'agenda. Quando ho iniziato a caricare tutto sulla commessa mi è preso un colpo: c'erano cantieri che credevo buoni dove praticamente pagavo io per scavare. Adesso ogni ora macchina ha il suo cantiere, i fermi li documento con le foto e i preventivi li faccio sui costi veri. Il margine è salito senza prendere un metro cubo in più.",
    metrics: [
      { label: "Ore macchina registrate", before: "blocchetti, a metà", after: "tutte, per mezzo e cantiere" },
      { label: "Costo orario reale dei mezzi", before: "sconosciuto", after: "noto, gasolio compreso" },
      { label: "Giorni di nolo fatturati", before: "quelli ricordati", after: "tutti" },
      { label: "Margine medio per cantiere", before: "un'ipotesi", after: "+11% e misurato" },
    ],
    image: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80",
  },

  // FAQ
  faq: [
    {
      q: "Come registro le ore macchina dei miei mezzi sui cantieri?",
      a: "L'operatore compila il rapportino di giornata dal telefono: mezzo usato, cantiere, ore lavorate, lavorazione fatta, eventuali fermi. Le ore diventano costi sulla commessa, valorizzate al costo orario di quel mezzo. A fine cantiere sai esattamente quante ore di escavatore, pala o camion ha assorbito lo scavo — e le confronti con il preventivo.",
    },
    {
      q: "Posso caricare gasolio e manutenzioni sui costi del cantiere?",
      a: "Sì. Pieni di gasolio, ricambi, tagliandi e riparazioni si registrano come costi sulla commessa o sul mezzo. Così il margine del cantiere è quello vero — gasolio compreso — e scopri anche quanto costa all'ora far girare ogni mezzo. Un numero che ti serve per preventivare gli scavi ai prezzi giusti.",
    },
    {
      q: "Come gestisco i noli, sia quando noleggio i miei mezzi sia quando li prendo da altri?",
      a: "Registri i giorni e le ore di nolo sulla commessa man mano che succedono: il tuo escavatore a nolo dal committente come ricavo, il camion preso dal collega come costo. A fine mese la fattura di nolo attivo si prepara dai dati registrati, senza ricostruire l'agenda a memoria. Niente più giorni dimenticati e regalati.",
    },
    {
      q: "Come documento fermi cantiere, attese e viaggi in discarica?",
      a: "Nel rapportino di giornata l'operatore registra anche fermi per pioggia, attese per interferenze e viaggi in discarica, con foto e note. Tutto resta datato sulla commessa. Quando il committente discute il SAL o non vuole riconoscere un fermo, apri la commessa e mostri le prove: date, foto, quantità.",
    },
    {
      q: "Vedo il margine reale di ogni cantiere, mezzi compresi?",
      a: "Sì. Ogni commessa ha il suo conto economico: preventivato, ore macchina valorizzate, ore uomo, gasolio, noli passivi, trasporti e discarica. Il margine si aggiorna mentre il cantiere avanza. Se uno scavo sta andando peggio del previsto — roccia, fermi, viaggi extra — lo vedi subito e chiedi la variante prima di smobilitare.",
    },
  ],

  verticalFeatures: [
    {
      icon: Clock,
      problem: "Ore macchina segnate 'a giornata' sul blocchetto: nessuno sa quanto è costato uno scavo",
      solution: "Il rapportino dal telefono registra mezzo, cantiere, ore e lavorazione in un minuto. Ogni ora è valorizzata al costo orario del mezzo e finisce sulla commessa giusta. A fine cantiere il costo dello scavo è un numero, non un'ipotesi.",
      economicBenefit: "100%",
      benefitLabel: "delle ore macchina addebitate al cantiere giusto",
    },
    {
      icon: Fuel,
      problem: "Gasolio e manutenzioni in un mucchio unico: il costo vero dei mezzi non lo conosce nessuno",
      solution: "Ogni pieno, ricambio e riparazione si carica sulla commessa o sul mezzo. Scopri il costo orario vero di ogni escavatore — gasolio compreso — e lo usi per preventivare ai prezzi giusti invece che a occhio.",
      economicBenefit: "€/h reale",
      benefitLabel: "di ogni mezzo, conosciuto e usato nei preventivi",
    },
    {
      icon: Truck,
      problem: "Noli su agende e foglietti: a fine mese fatturi a memoria, e qualche giorno lo regali",
      solution: "Giorni e ore di nolo si registrano sulla commessa man mano. La fattura di fine mese si prepara dai dati già registrati: completa, documentata, senza giorni persi. Vale per i noli attivi e per i costi di quelli passivi.",
      economicBenefit: "0",
      benefitLabel: "giorni di nolo dimenticati in fattura",
    },
    {
      icon: Camera,
      problem: "Fermi per pioggia, attese, viaggi extra in discarica: mai documentati, mai riconosciuti",
      solution: "L'operatore documenta la giornata con foto, note e quantità dal telefono. Fermi e viaggi restano scritti e datati sulla commessa. Quando il committente contesta il SAL, mostri le prove invece di alzare la voce.",
      economicBenefit: "SAL",
      benefitLabel: "difesi con foto e date, non a parole",
    },
    {
      icon: TrendingUp,
      problem: "Il margine dello scavo si scopre dopo la smobilitazione — quando è tardi per tutto",
      solution: "Il conto economico della commessa si aggiorna giorno per giorno: ore macchina, gasolio, noli, trasporti. Se la roccia trovata sotto sta mangiando il margine, lo vedi mentre i mezzi sono ancora lì — e la variante la chiedi in tempo.",
      economicBenefit: "+11%",
      benefitLabel: "margine medio sui cantieri monitorati",
    },
  ],
  verticalFeaturesTitle: "Ore macchina, gasolio, noli: ogni costo sul cantiere che lo ha consumato",
  verticalFeaturesSubtitle: "Il movimento terra si vince sui costi dei mezzi. Quando ore, gasolio e noli finiscono sulla commessa giusta, i margini si vedono e i preventivi si fanno con numeri veri.",
  demoLabel: "Vedi il conto economico di un cantiere di scavo: ore macchina, gasolio, noli e margine in un'unica schermata",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">I mezzi costano anche da fermi.</span>{" "}
      <span className="text-[#F97415]">Almeno sappi quanto rendono quando girano.</span>
    </>
  ),
  ctaSubtitle:
    "Prova Edilizia in Cloud gratis per 31 giorni, oppure prenota 30 minuti di demo: prendiamo un tuo cantiere vero e ti mostriamo dove finiscono ore macchina, gasolio e noli — e quanto margine stai lasciando per strada.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior software per imprese di movimento terra?",
      a: "Edilizia in Cloud è il software per imprese di movimento terra: ore macchina registrate per mezzo e cantiere, gasolio e manutenzioni caricati sulla commessa, gestione noli attivi e passivi, rapportini di scavo con foto, DDT e fatturazione elettronica SDI.",
    },
    {
      q: "Come si registrano le ore macchina sui cantieri?",
      a: "L'operatore compila il rapportino di giornata dal telefono: mezzo, cantiere, ore e lavorazione. Le ore vengono valorizzate al costo orario del mezzo e addebitate alla commessa giusta.",
    },
    {
      q: "Si possono caricare gasolio e manutenzioni sui costi di commessa?",
      a: "Sì. Pieni, ricambi e riparazioni si registrano come costi sulla commessa o sul mezzo, così il margine di ogni cantiere include i costi reali dei mezzi e il costo orario di ogni macchina è conosciuto.",
    },
  ],
};

export default function MovimentoTerra() {
  return <PerTipoPageTemplate config={config} />;
}
