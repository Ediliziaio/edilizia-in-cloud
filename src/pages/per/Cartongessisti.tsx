import {
  Calculator, Layers, Clock, TrendingUp, Smartphone, Wallet,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Gestionale per Cartongessisti | Preventivi al Mq e SAL",
  seoDescription: "Gestionale per cartongessisti: preventivi al mq in minuti, squadre su più cantieri, acconti e SAL sotto controllo, fattura SDI. Gratis 31 giorni.",
  seoKeywords: "gestionale per cartongessisti, software cartongesso, preventivi al mq cartongesso, gestione squadre cantieri, SAL cartongessista, acconti cantiere, contropareti controsoffitti preventivo, fatturazione elettronica cartongessista",
  seoCanonical: "/per/cartongessisti",

  // Hero
  badge: "Per Imprese di Cartongesso e Opere a Secco",
  heroTitle: (
    <>
      <span className="text-white">Gestionale per cartongessisti: preventivi al mq in minuti,</span>{" "}
      <span className="text-[#F97415]">squadre e SAL sotto controllo su ogni cantiere.</span>
    </>
  ),
  heroSubtitle:
    "Edilizia in Cloud è il gestionale per cartongessisti: fai il preventivo al metro quadro in pochi minuti — pareti, contropareti, controsoffitti con i tuoi prezzi — segui le squadre sparse su più cantieri con timbrature GPS e rapportini con foto, e tieni acconti e SAL brevi sotto controllo fino all'ultima fattura elettronica.",
  heroImage: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "CG", name: "Cartongessi Greco", city: "Bari", months: 12, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "OS", name: "Opere a Secco Martini", city: "Rimini", months: 8, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "IC", name: "Interni Costa", city: "Genova", months: 15, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "DP", name: "DP Controsoffitti", city: "Catania", months: 10, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Lavori a mq, ma i conti li fai a sensazione",
  problemsSubtitle:
    "Il cartongesso è un mestiere di numeri: metri quadri, prezzi al mq, giornate di squadra. Eppure preventivi, ore e SAL girano ancora su fogli e memoria — e ogni cantiere ne perde un pezzo.",
  problems: [
    {
      emoji: "📏",
      title: "Preventivi al mq calcolati ogni volta da capo",
      desc: "Parete singola, doppia lastra, idrolastra in bagno, controsoffitto con faretti: ogni preventivo riparte da zero tra appunti e vecchi Excel. Un'ora buona a preventivo — e se sbagli il prezzo di una lavorazione, te lo porti dietro per tutto il cantiere.",
    },
    {
      emoji: "👷",
      title: "Squadre su quattro cantieri, e tu che fai il giro a controllarle",
      desc: "Due montatori di qua, tre stuccatori di là: chi c'è oggi al cantiere del centro commerciale? A che punto sono le contropareti? Senza un sistema, l'unico modo per saperlo è andarci — e la giornata se ne va in giri di controllo.",
    },
    {
      emoji: "💶",
      title: "Acconti e SAL brevi che si perdono tra un cantiere e l'altro",
      desc: "Nel cartongesso i lavori durano poco e i pagamenti sono spezzati: acconto, SAL a metà, saldo a fine. Con dieci cantieri l'anno che si accavallano, qualche acconto parte in ritardo e qualche saldo resta indietro. E te ne accorgi quando la cassa piange.",
    },
    {
      emoji: "📉",
      title: "Il margine al mq non lo conosce nessuno",
      desc: "A preventivo il prezzo al mq sembrava giusto. Ma tra lastre sprecate, giornate in più per gli imprevisti e viaggi extra al magazzino, quanto ti è rimasto davvero su quel controsoffitto? Se non lo misuri, il prossimo preventivo ripete lo stesso errore.",
    },
    {
      emoji: "🧱",
      title: "Materiale comprato a occhio, avanzi e mancanze a ogni cantiere",
      desc: "Lastre, profili, viti, stucco: si ordina 'abbondante' per non restare fermi, e gli avanzi si accumulano nel furgone o spariscono. Oppure manca un bancale a metà lavoro e la squadra sta ferma ad aspettare la consegna.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 13.500",
    lossLabel: "tra extra non fatturati, prezzi al mq sbagliati e SAL incassati in ritardo",
    wasteValue: "€ 8.900",
    wasteLabel: "in preventivi rifatti da capo, giri di controllo cantieri e ore ricostruite",
    errorValue: "€ 5.600",
    errorLabel: "in materiale comprato a occhio, sprechi e squadre ferme per mancanze",
    totalLoss: "€ 28.000",
    softwareCost: "€ 2.388",
    roiX: "11x",
  },

  // Transformation
  transformation: {
    title: "Com'è gestire i cantieri prima e dopo Edilizia in Cloud",
    subtitle:
      "Stesse squadre, stessi cantieri. Cambia che i metri quadri, le ore e i soldi si contano da soli — e tu smetti di fare il giro di controllo.",
    fromTitle: "Prima: tutto a memoria",
    fromItems: [
      "Preventivi al mq rifatti da capo ogni volta, un'ora l'uno",
      "Squadre controllate di persona, un giro di cantieri al giorno",
      "Acconti e SAL segnati sull'agenda: qualcuno parte sempre in ritardo",
      "Margine al mq sconosciuto: i prezzi si aggiustano a sensazione",
      "Materiale ordinato 'abbondante': avanzi nel furgone e mancanze a metà lavoro",
      "Lavori extra fatti a voce e dimenticati al momento della fattura",
    ],
    toTitle: "Dopo: i numeri si contano da soli",
    toItems: [
      "Preventivo al mq dalle tue lavorazioni standard: pareti, contropareti, controsoffitti — in minuti",
      "Timbrature GPS e rapportini con foto: vedi chi è dove e a che punto è, senza fare il giro",
      "Scadenzario con acconti, SAL e saldi di tutti i cantieri: niente parte in ritardo",
      "Margine per cantiere e per lavorazione: sai quanto rende un mq di controsoffitto davvero",
      "Materiale a magazzino e DDT collegati alle commesse: ordini quello che serve",
      "Ogni extra registrato con foto sulla commessa: a fine lavoro si fattura, non si discute",
    ],
  },

  // Stats
  stats: [
    {
      value: "10 min",
      label: "Per un preventivo al mq",
      sublabel: "Dalle tue lavorazioni standard con i tuoi prezzi",
    },
    {
      value: "5",
      label: "Cantieri seguiti in parallelo",
      sublabel: "Senza fare il giro di controllo ogni giorno",
    },
    {
      value: "+9%",
      label: "Margine medio per cantiere",
      sublabel: "Quando extra e ore si contano tutti, il prezzo al mq si aggiusta",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti giusti per chi monta cartongesso",
  modulesSubtitle:
    "Preventivi al mq, squadre su più cantieri, SAL brevi e materiale: i moduli sono costruiti sul modo di lavorare delle imprese di opere a secco.",
  modules: [
    {
      icon: Calculator,
      name: "Preventivi al Metro Quadro",
      desc: "Le tue lavorazioni standard — parete singola, doppia lastra, idrolastra, controsoffitto, velette — con i tuoi prezzi al mq. Metti i metri, il preventivo si calcola e il PDF esce impaginato. Le varianti si aggiungono senza rifare tutto.",
      saving: "Da 1 ora a 10 minuti",
    },
    {
      icon: Clock,
      name: "Timbrature GPS delle Squadre",
      desc: "Ogni operaio timbra dal telefono con posizione: sai chi è in quale cantiere senza telefonare al capsquadra. Le ore finiscono in automatico sul costo della commessa giusta — anche quando la squadra si sposta a metà giornata.",
      saving: "Zero giri di controllo",
    },
    {
      icon: Wallet,
      name: "Acconti, SAL e Scadenzario",
      desc: "Ogni cantiere ha il suo piano: acconto alla firma, SAL a metà lavoro, saldo a fine. Lo scadenzario li tiene in fila per tutti i cantieri insieme: vedi cosa devi incassare questa settimana e cosa è in ritardo — prima che la cassa si accorga.",
      saving: "Nessun SAL dimenticato",
    },
    {
      icon: TrendingUp,
      name: "Commesse con Margini",
      desc: "Preventivato, lastre e profili comprati, ore delle squadre, extra: ogni cantiere ha il suo conto. Vedi il margine mentre monti — e scopri quanto rende davvero un mq di controsoffitto rispetto a uno di controparete.",
      saving: "Prezzi al mq aggiustati sui numeri veri",
    },
    {
      icon: Camera,
      name: "Rapportini con Foto",
      desc: "A fine giornata il capsquadra carica foto e due righe: cosa è stato montato, cosa serve domani. Gli extra chiesti dal committente si fotografano e si registrano al volo — così a fine cantiere li fatturi tutti.",
      saving: "Extra fatturati, non regalati",
    },
    {
      icon: Layers,
      name: "Magazzino Materiali e DDT",
      desc: "Lastre, profili, viti, stucco: sai cosa hai a magazzino e cosa è andato su ogni cantiere. I DDT di consegna si fanno dal gestionale, collegati alla commessa. Ordini quello che serve, non 'abbondante per sicurezza'.",
      saving: "Meno sprechi, zero squadre ferme",
    },
  ],

  // AI showcase
  aiShowcase: {
    title: "L'AI che lavora per te, mentre tu sei sul ponteggio",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua impresa e agiscono. Per un cartongessista significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un cantiere rende meno del previsto",
        desc: "Giornate in più del preventivato, materiale sopra la media, extra non registrati: se il margine scende sotto la tua soglia, Silvio ti avvisa mentre la squadra è ancora lì — non a saldo incassato.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Tiene in fila acconti e SAL di tutti i cantieri",
        desc: "SAL maturato e non fatturato? Acconto non ancora chiesto sul cantiere nuovo? Silvio te lo segnala e prepara fattura o sollecito con il tono giusto. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Cantiere",
        title: "Trasforma foto e vocali in rapportini",
        desc: "Il capsquadra manda le foto del controsoffitto e un vocale: Silvio scrive il rapportino, aggiorna l'avanzamento e attacca tutto alla commessa giusta. Nessuno si ferma a scrivere.",
      },
      {
        icon: Sparkles,
        tag: "Preventivi",
        title: "Rinforza preventivi e richiama chi non risponde",
        desc: "Sistema il preventivo perché il committente capisca cosa è compreso — lastre, struttura, finitura — e prepara il follow-up per i preventivi rimasti fermi. Così i lavori non li perdi per silenzio.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua impresa — cantieri, mq, ore, materiali, incassi.",
  },

  // Platform extra
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'impresa di opere a secco, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, acconti e SAL collegati ai cantieri, bozze pronte da approvare.",
      },
      {
        icon: Users,
        name: "CRM e preventivi",
        desc: "Richieste, sopralluoghi e trattative in un'unica fila: sai sempre chi richiamare e quando.",
      },
      {
        icon: Smartphone,
        name: "App per le squadre",
        desc: "Timbrature, rapportini, foto e materiali dal telefono — funziona anche dove il segnale balla.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Lastre, profili e ferramenta tracciati, DDT di entrata e uscita collegati alle commesse.",
      },
      {
        icon: FolderOpen,
        name: "Documenti in ordine",
        desc: "Contratti, foto e carte di ogni cantiere archiviati sulla commessa: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per cantiere e per lavorazione: i numeri dell'impresa in una schermata.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Cartongessi Greco",
    city: "Bari",
    sector: "Cartongesso, contropareti e controsoffitti",
    revenue: "460.000 €",
    person: "Nicola Greco",
    role: "Titolare",
    initials: "NG",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Ho due squadre e in stagione arriviamo a cinque cantieri aperti insieme. Prima passavo le mattine a fare il giro per vedere a che punto erano, e la sera facevo i preventivi. I SAL li segnavo sull'agenda: qualcuno partiva in ritardo di settimane. Adesso il preventivo al mq lo chiudo in dieci minuti con le mie lavorazioni, le squadre timbrano e caricano le foto, e lo scadenzario mi dice cosa incassare questa settimana. Ho smesso di fare il controllore e ho ripreso a fare l'imprenditore.",
    metrics: [
      { label: "Tempo per un preventivo al mq", before: "1 ora la sera", after: "10 minuti" },
      { label: "Giri di controllo cantieri", before: "ogni mattina", after: "solo quando serve" },
      { label: "SAL fatturati in ritardo", before: "1 su 3", after: "nessuno" },
      { label: "Cantieri gestiti in parallelo", before: "3, con affanno", after: "5" },
    ],
    image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80",
  },

  // FAQ
  faq: [
    {
      q: "Come funzionano i preventivi al metro quadro per il cartongesso?",
      a: "Carichi una volta le tue lavorazioni standard — parete singola, doppia lastra, idrolastra, controsoffitto, velette — ognuna con il suo prezzo al mq. Per il preventivo selezioni le lavorazioni, inserisci i metri quadri e il totale si calcola da solo, con il PDF impaginato pronto da mandare. Le varianti si aggiungono in corso d'opera senza rifare il documento.",
    },
    {
      q: "Come seguo le squadre sparse su più cantieri senza fare il giro ogni giorno?",
      a: "Ogni operaio timbra dal telefono con GPS quando arriva e quando va via: vedi chi è in quale cantiere in tempo reale. A fine giornata il capsquadra carica il rapportino con le foto dell'avanzamento. Il giro di controllo lo fai quando serve davvero, non per sapere se la squadra è arrivata.",
    },
    {
      q: "Come tengo sotto controllo acconti e SAL con tanti cantieri brevi?",
      a: "Ogni cantiere ha il suo piano di pagamenti: acconto, SAL intermedi, saldo. Lo scadenzario li mette in fila per tutti i cantieri insieme e ti mostra cosa fatturare e incassare questa settimana, cosa è in ritardo e quanto ti aspetti a 30, 60 e 90 giorni. Le fatture partono via SDI direttamente dal gestionale.",
    },
    {
      q: "Posso sapere quanto mi rende davvero un metro quadro di controsoffitto?",
      a: "Sì. Ogni cantiere raccoglie i suoi costi: lastre e profili, ore delle squadre dalle timbrature, extra. Confrontando con il preventivato vedi il margine per cantiere e per tipo di lavorazione. Così scopri se le contropareti ti rendono più dei controsoffitti — e aggiusti i prezzi al mq sui numeri, non a sensazione.",
    },
    {
      q: "Come gestisco lastre, profili e materiale tra magazzino e cantieri?",
      a: "Il magazzino traccia cosa hai e cosa è andato su ogni cantiere, con i DDT di consegna collegati alle commesse. Vedi i consumi reali per cantiere: ordini quello che serve davvero invece di abbondare per sicurezza, gli avanzi non spariscono e la squadra non resta ferma ad aspettare un bancale a metà lavoro.",
    },
  ],

  verticalFeatures: [
    {
      icon: Calculator,
      problem: "Ogni preventivo al mq riparte da zero: un'ora tra appunti e vecchi Excel",
      solution: "Le tue lavorazioni standard con i tuoi prezzi al mq stanno nel gestionale: selezioni, metti i metri, il preventivo si calcola. PDF impaginato in dieci minuti, varianti aggiunte senza rifare nulla. E il prezzo è sempre quello giusto.",
      economicBenefit: "10 min",
      benefitLabel: "per un preventivo al mq completo",
    },
    {
      icon: Clock,
      problem: "Squadre su più cantieri: per sapere chi è dove devi telefonare o andarci",
      solution: "Timbrature GPS dal telefono di ogni operaio: vedi in tempo reale chi è in quale cantiere e le ore finiscono sul costo della commessa giusta. Il giro di controllo quotidiano diventa un'occhiata dallo schermo.",
      economicBenefit: "−2 h/gg",
      benefitLabel: "di giri e telefonate di controllo",
    },
    {
      icon: Wallet,
      problem: "Acconti e SAL brevi su tanti cantieri: qualcosa parte sempre in ritardo",
      solution: "Il piano pagamenti di ogni cantiere sta nello scadenzario unico: acconti da chiedere, SAL da fatturare, saldi da sollecitare. Vedi la settimana e i prossimi 90 giorni. La fattura parte via SDI in un click, al momento giusto.",
      economicBenefit: "0",
      benefitLabel: "SAL dimenticati o fatturati in ritardo",
    },
    {
      icon: Camera,
      problem: "Extra chiesti a voce dal committente: a fine cantiere 'era compreso' — e tu regali",
      solution: "Ogni extra si registra al volo sulla commessa con foto e data, dal telefono. A fine cantiere l'elenco è pronto: si fattura tutto, e le contestazioni si chiudono mostrando foto datate invece di discutere.",
      economicBenefit: "€ 0",
      benefitLabel: "di lavori extra regalati",
    },
    {
      icon: TrendingUp,
      problem: "Il margine al mq è un mistero: i prezzi si aggiustano a sensazione, sbagliando",
      solution: "Ogni cantiere ha il suo conto: materiali, ore dalle timbrature, extra. Il margine si vede per cantiere e per lavorazione — pareti, contropareti, controsoffitti. Il prossimo listino lo scrivi sui numeri veri.",
      economicBenefit: "+9%",
      benefitLabel: "margine medio sui cantieri monitorati",
    },
  ],
  verticalFeaturesTitle: "Metri quadri, ore e SAL: tutto contato, niente regalato",
  verticalFeaturesSubtitle: "Preventivi al mq in minuti, squadre visibili senza giri di controllo, scadenzario che non dimentica un SAL e margini per lavorazione. Tutto collegato. Tutto dal telefono.",
  demoLabel: "Vedi un preventivo al mq uscire in 10 minuti e lo scadenzario che tiene in fila acconti e SAL di 5 cantieri",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Tu pensa a montare.</span>{" "}
      <span className="text-[#F97415]">Ai conti al mq pensa il gestionale.</span>
    </>
  ),
  ctaSubtitle:
    "Prova Edilizia in Cloud gratis per 31 giorni, oppure prenota 30 minuti di demo: carichiamo le tue lavorazioni al mq e facciamo insieme un preventivo vero — così vedi subito quanto tempo recuperi.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior gestionale per cartongessisti?",
      a: "Edilizia in Cloud è il gestionale per imprese di cartongesso: preventivi al mq dalle lavorazioni standard, timbrature GPS delle squadre su più cantieri, scadenzario per acconti e SAL brevi, rapportini con foto, magazzino materiali e fatturazione elettronica SDI.",
    },
    {
      q: "Come si fa un preventivo al metro quadro per il cartongesso?",
      a: "Si caricano una volta le lavorazioni standard con i prezzi al mq — pareti, contropareti, controsoffitti — e per ogni preventivo si selezionano le lavorazioni e i metri quadri: il totale si calcola da solo con PDF impaginato in circa 10 minuti.",
    },
    {
      q: "Come si gestiscono acconti e SAL su tanti cantieri brevi?",
      a: "Ogni cantiere ha il suo piano di pagamenti e lo scadenzario unico mette in fila acconti, SAL e saldi di tutti i cantieri, con avvisi su cosa fatturare e incassare e la cassa prevista a 30, 60 e 90 giorni.",
    },
  ],
};

export default function Cartongessisti() {
  return <PerTipoPageTemplate config={config} />;
}
