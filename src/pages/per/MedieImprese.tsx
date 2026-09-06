import {
  Building2, TrendingUp, Wallet, Users, FileSignature, LineChart,
  TrendingDown, Send, Camera, Sparkles, Receipt, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Gestionale per Medie Imprese Edili | Multi-Cantiere",
  seoDescription:
    "Gestionale per medie imprese edili 10-50 dipendenti: consolidamento multi-cantiere, margini real-time, dashboard CFO, ruoli e deleghe.",
  seoKeywords:
    "software medie imprese edili, gestionale 10-50 dipendenti edili, software multi-cantiere, controllo margini cantiere, ERP edilizia media impresa, software cantieri 5 milioni fatturato, gestionale impresa costruzioni media, dashboard CFO edilizia",
  seoCanonical: "/per/medie-imprese",

  // Hero
  badge: "Per Medie Imprese Edili (10-50 dipendenti)",
  heroTitle: (
    <>
      <span className="text-white">Gestisci 10 cantieri</span>{" "}
      <span className="text-[#F97415]">come se fosse uno solo</span>
    </>
  ),
  heroSubtitle:
    "A 30 dipendenti e 8 cantieri attivi succede sempre la stessa cosa: il responsabile cantiere lavora con i suoi Excel, il CFO riceve i dati con due settimane di ritardo, l'HR insegue le presenze su WhatsApp e i margini reali nessuno li conosce davvero. Edilizia in Cloud è la prima piattaforma pensata per medie imprese edili: ruoli e deleghe chiari, dati consolidati in tempo reale, zero ERP enterprise da 200.000 euro l'anno.",
  heroImage: "/hero/stock/cantiere-1541888946425-1400.webp",

  // Social proof
  socialProof: [
    { initials: "CE", name: "Costruzioni Esposito", city: "Napoli", months: 22, gradient: "from-[#F97415] to-[#0d8f79]" },
    { initials: "FB", name: "Fratelli Bianchi", city: "Bologna", months: 18, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "ME", name: "Marini Edilizia", city: "Verona", months: 14, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "GC", name: "Gruppo Costruire", city: "Roma", months: 24, gradient: "from-[#1a1a2e] to-[#F97415]" },
  ],

  // Problems
  problemsTitle: "A questa dimensione, il problema non è più il tempo. È il controllo.",
  problemsSubtitle:
    "Quando hai 10-50 dipendenti e 5-15 cantieri attivi, il vero rischio è perdere visibilità. I numeri girano, ma nessuno sa più dove si stanno facendo i margini — e dove si stanno bruciando.",
  problems: [
    {
      emoji: "🔌",
      title: "Contabilità e cantiere parlano lingue diverse",
      desc: "Il commercialista ha i suoi numeri. Il responsabile cantiere ha i suoi Excel. Le buste paga sono in un altro file. I costi materiali in un terzo. Quando vuoi capire quanto sta guadagnando davvero il cantiere di via Roma, devi mettere insieme 4 fogli e qualche telefonata. Risultato: lo scopri tre settimane dopo.",
    },
    {
      emoji: "📉",
      title: "I margini li vedi a fine mese",
      desc: "I report sui margini di cantiere arrivano con 30-45 giorni di ritardo, perché vanno raccolti, conciliati e consolidati a mano. Quando ti accorgi che il cantiere X sta perdendo il 4%, hai già firmato due SAL e ordinato altri 80.000 euro di materiale. La marginalità si difende in tempo reale, non in retrospettiva.",
    },
    {
      emoji: "📞",
      title: "CFO e HR ridotti a centralinisti dei dati",
      desc: "Il CFO passa metà giornata a rispondere a 'quanto abbiamo speso sul cantiere Y?'. L'HR passa l'altra metà a gestire ferie, presenze e cassa edile via WhatsApp. Sono ruoli pagati per fare strategia e gestione persone, ma li stiamo usando come centralinisti dei dati.",
    },
    {
      emoji: "❓",
      title: "Manca una single source of truth — ognuno ha la sua verità",
      desc: "Il direttore tecnico dice un numero, l'amministrazione un altro, il responsabile cantiere un terzo. Le riunioni iniziano sempre con 30 minuti di 'ma allora qual è il dato giusto?'. Senza un'unica fonte condivisa, ogni decisione è una scommessa basata su dati di chi parla più forte.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 45.000",
    lossLabel: "in margini erosi su cantieri non monitorati in tempo reale",
    wasteValue: "€ 28.000",
    wasteLabel: "ore di CFO, HR e responsabili spese su consolidamenti manuali",
    errorValue: "€ 22.000",
    errorLabel: "in errori di SAL, subappalti non riconciliati e DURC scaduti",
    totalLoss: "€ 95.000",
    softwareCost: "€ 7.200",
    roiX: "13x",
  },

  // Transformation
  transformation: {
    title: "Da 'azienda con 10 Excel' a 'azienda con un cruscotto'",
    subtitle:
      "Non ti chiediamo di rivoluzionare l'organizzazione. Ti chiediamo di dare a ogni ruolo gli strumenti per fare il proprio mestiere — senza inseguire dati su WhatsApp.",
    fromTitle: "Prima: il caos organizzato",
    fromItems: [
      "Consolidamento mensile dei margini fatto a mano dal CFO in 3-5 giorni di lavoro",
      "Responsabile cantiere che lavora su Excel personali, non condivisi con la sede",
      "Presenze, ferie e cassa edile gestiti tra WhatsApp, email e cartaceo",
      "SAL e situazioni economiche di commessa con 30-45 giorni di ritardo",
      "DURC subappaltatori controllati a mano — qualcuno scade sempre",
      "Riunioni di controllo gestione con dati diversi per ogni partecipante",
    ],
    toTitle: "Dopo: visibilità e governance",
    toItems: [
      "Dashboard CFO consolidata in tempo reale: tutti i cantieri, tutti i margini, una sola schermata",
      "Responsabile cantiere con la sua area di lavoro, ruoli e deleghe configurate per centro di costo",
      "Modulo HR integrato con cassa edile, INPS edile e libro unico — zero WhatsApp",
      "Margini di commessa aggiornati ad ogni movimento: vedi se stai perdendo prima di firmare il SAL",
      "Gestione subappalti con DURC e scadenze monitorate automaticamente",
      "Single source of truth: una riunione, un dato, decisioni più veloci",
    ],
  },

  // Stats
  stats: [
    {
      value: "12 cantieri",
      label: "Gestiti contemporaneamente in un'unica dashboard",
      sublabel: "Senza Excel di consolidamento, senza riunioni-fiume",
    },
    {
      value: "−3%",
      label: "Errore medio sui margini di commessa",
      sublabel: "Da scostamenti del 5-7% al budget a meno del 2%",
    },
    {
      value: "+2pp",
      label: "Marginalità operativa media nel primo anno",
      sublabel: "Recuperata vedendo gli scostamenti in tempo per correggere",
    },
    {
      value: "5gg → 5min",
      label: "Tempo per il consolidamento mensile",
      sublabel: "Da 5 giorni di CFO con Excel a una dashboard sempre aggiornata",
    },
  ],

  // Modules
  modulesTitle: "Sei moduli pensati per chi gestisce più cantieri e più persone",
  modulesSubtitle:
    "Non un ERP da configurare per 12 mesi. Una piattaforma verticale edile, già pronta per la tua dimensione: ruoli, deleghe, multi-cantiere e cruscotti direzionali nativi.",
  modules: [
    {
      icon: Building2,
      name: "Multi-Cantiere e Centri di Costo",
      desc: "Gestisci 5-50 cantieri attivi contemporaneamente, ognuno con il proprio responsabile, budget, SAL, costi diretti e indiretti. Centri di costo configurabili, ribaltamento spese generali automatico, confronto tra cantieri in un click.",
      saving: "10 cantieri come fossero uno",
    },
    {
      icon: TrendingUp,
      name: "Margini di Commessa Real-Time",
      desc: "Ad ogni costo registrato (materiali, subappalto, ore operai, mezzi) il margine di commessa si aggiorna istantaneamente. Confronto continuo tra preventivo, budget e consuntivo. Alert automatici quando un cantiere scende sotto la soglia di marginalità.",
      saving: "Margini aggiornati ad ogni movimento",
    },
    {
      icon: Wallet,
      name: "Cassa Centralizzata e Tesoreria",
      desc: "Visione consolidata su tutti i conti correnti, scadenziario clienti e fornitori, previsionale di cassa a 90 giorni. Riconciliazione bancaria automatica via PSD2. Il CFO vede la liquidità reale in tempo reale, non a fine mese.",
      saving: "Forecast cassa a 90 giorni sempre aggiornato",
    },
    {
      icon: Users,
      name: "HR, Cassa Edile e Presenze",
      desc: "Gestione completa del personale edile: presenze da app o badge, assegnazione ore per cantiere, cassa edile, INPS edile, INAIL, libro unico. Integrazione con il consulente del lavoro tramite export standard. Ferie e permessi con workflow di approvazione.",
      saving: "Zero WhatsApp tra HR e cantiere",
    },
    {
      icon: FileSignature,
      name: "Subappalti e DURC Monitorati",
      desc: "Anagrafica subappaltatori con DURC, scadenze, importi, SAL emessi e ricevuti. Alert automatici 30 giorni prima della scadenza DURC. Verifica white list, conformità Codice Appalti, tracciabilità pagamenti L. 136/2010.",
      saving: "Mai più DURC scaduti senza accorgersene",
    },
    {
      icon: LineChart,
      name: "Cruscotto CFO e Direzione",
      desc: "Dashboard direzionale con KPI consolidati: fatturato, margine operativo, EBITDA, DSO, DPO, scaduti, produzione di periodo. Drill-down dal totale aziendale al singolo cantiere in due click. Export automatico per banche e revisori.",
      saving: "Da Excel mensile a cruscotto live",
    },
  ],

  // Sezione AI: cosa fa Silvio per una media impresa strutturata.
  aiShowcase: {
    title: "L'AI che vede gli scostamenti prima del tuo controller",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati consolidati di tutti i cantieri e agiscono. Per una media impresa edile significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un cantiere sfora il budget",
        desc: "Appena il consuntivo supera il budget oltre la soglia, Silvio notifica il responsabile cantiere e il CFO con la voce critica in evidenza — il giorno stesso, non al consolidamento di fine mese.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara solleciti e tiene la cassa sotto controllo",
        desc: "Incassi attesi, scaduti clienti, pagamenti fornitori: Silvio prepara i solleciti per i SAL non incassati e segnala in anticipo quando il previsionale di cassa a 90 giorni si stringe.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Foto e vocali dei capicantiere → rapportini e SAL",
        desc: "I responsabili caricano foto e note vocali dal cantiere: Silvio genera rapportini e avanzamenti, li collega al centro di costo giusto e prepara il SAL — senza Excel personali da consolidare.",
      },
      {
        icon: Sparkles,
        tag: "Direzione",
        title: "Riepiloghi direzionali pronti per la riunione",
        desc: "Chiedi 'come stanno andando i cantieri di Napoli?' e Silvio ti dà la sintesi: margine, scostamenti, scadenze DURC, incassi attesi. La riunione di controllo gestione parte dai numeri, non dal cercarli.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali e consolidati della tua azienda — cantieri, margini, cassa, presenze, subappalti.",
  },

  // Ampiezza piattaforma: tutto l'operativo oltre il controllo di gruppo.
  platformExtra: {
    title: "E tutto il resto dell'azienda? Già incluso.",
    subtitle:
      "Multi-cantiere, margini, cassa, HR e dashboard CFO sono i moduli che usi ogni giorno. Ma dentro Edilizia in Cloud c'è tutto il resto dell'operatività, già collegato.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Ciclo attivo e passivo SDI, SAL, acconti e ritenute collegati alla commessa, export pronto per il commercialista esterno.",
      },
      {
        icon: Users,
        name: "CRM, gare e pipeline",
        desc: "Richieste, offerte e gare in un'unica pipeline commerciale: sai sempre cosa rilanciare e quanto vale il portafoglio in trattativa.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Depositi, scorte, DDT di entrata e uscita collegati a ordini fornitori e cantieri, con ribaltamento costi sul centro giusto.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e qualifiche",
        desc: "DURC, SOA, contratti di subappalto, certificazioni e polizze archiviati per cantiere: tutto pronto in caso di controllo o audit.",
      },
      {
        icon: Building2,
        name: "Preventivi e computi",
        desc: "Computi metrici da prezziario DEI/regionale o listino interno, convertiti in commessa attiva con budget e WBS in un click.",
      },
      {
        icon: BarChart3,
        name: "Report e business intelligence",
        desc: "Fatturato, margini per cantiere e per commessa, EBITDA, DSO/DPO: i numeri direzionali in una schermata, esportabili per banche e revisori.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Costruzioni Esposito S.r.l.",
    city: "Napoli",
    sector: "Media impresa edile — opere civili, ristrutturazioni e Superbonus",
    revenue: "5.200.000 €",
    person: "Giorgia Esposito",
    role: "CFO e socia operativa",
    initials: "GE",
    gradient: "from-[#F97415] to-[#0d8f79]",
    quote:
      "Eravamo 35 dipendenti e 8 cantieri aperti. Il problema non era il fatturato, era il controllo: chiudevo il consolidamento il 20 del mese successivo e quando vedevo che il cantiere di Salerno era andato a margine zero, ormai era finito. Con Edilizia in Cloud vedo lo scostamento il giorno stesso. Nel primo anno abbiamo recuperato due punti di marginalità — su 5 milioni sono 100.000 euro vere, non da slide.",
    metrics: [
      { label: "Tempo consolidamento margini", before: "20 giorni dopo fine mese", after: "in tempo reale" },
      { label: "Cantieri monitorati con KPI", before: "2 grandi su 8", after: "tutti gli 8" },
      { label: "Marginalità operativa media", before: "4,8%", after: "6,9%" },
      { label: "Ore CFO/mese su Excel di consolidamento", before: "60 ore", after: "8 ore" },
    ],
  },

  // FAQ
  faq: [
    {
      q: "Come si integra con il commercialista esterno e con il consulente del lavoro?",
      a: "Edilizia in Cloud è pensato proprio per il modello tipico delle medie imprese edili: contabilità tenuta dal commercialista esterno, gestione operativa interna. Il commercialista accede in sola lettura con le sue credenziali e scarica gli export contabili compatibili con Zucchetti, TeamSystem, Profis e i principali software. Il consulente del lavoro riceve mensilmente l'export presenze e cassa edile pronto per il cedolino. Nessuna duplicazione, nessuna riconciliazione manuale.",
    },
    {
      q: "Stiamo usando Primus, STR o decine di Excel: quanto è complesso migrare?",
      a: "La migrazione tipica per una media impresa dura 4-6 settimane ed è seguita da un nostro consulente dedicato. Importiamo anagrafiche clienti, fornitori, subappaltatori, cantieri attivi con il loro stato di avanzamento, computi metrici da Primus o STR. Gli Excel di controllo gestione vengono ricostruiti come dashboard nativa. Nelle prime 2 settimane lavori in parallelo, poi spegni i vecchi sistemi. Nessun blocco operativo dei cantieri.",
    },
    {
      q: "Quanto costa per una media impresa con 8-15 cantieri attivi?",
      a: "Il piano Medie Imprese parte da 590 €/mese per fascia 10-25 dipendenti e cantieri illimitati, e da 890 €/mese per fascia 25-50 dipendenti, con tutti i moduli inclusi (multi-cantiere, HR, cassa, subappalti, dashboard CFO). Nessun costo per cantiere aggiuntivo, nessun costo per utente. Confrontato a un ERP edilizia tradizionale (40.000-150.000 € di licenza + canone), il TCO sui 3 anni è circa 8 volte inferiore.",
    },
    {
      q: "Come gestite la formazione del team — abbiamo CFO, HR, responsabili cantiere?",
      a: "L'onboarding è strutturato per ruoli: 2 sessioni per il CFO sui cruscotti e tesoreria, 2 sessioni per l'HR su presenze e cassa edile, 2 sessioni per ogni responsabile cantiere sull'area commessa, 1 sessione per la direzione sui report. In totale circa 12-15 ore distribuite su 3-4 settimane. Materiale video on-demand per i nuovi assunti. Customer success dedicato il primo anno con review trimestrale.",
    },
    {
      q: "I dati di un'impresa con 5M€ di fatturato sono sensibili: dove sono ospitati?",
      a: "Datacenter Tier IV certificati ISO 27001, ISO 9001 e ISO 22301. Backup giornaliero crittografato e ridondato. Conformità GDPR completa con DPO indicato. Crittografia AES-256 a riposo e TLS 1.3 in transito. Segregazione dati per tenant. Audit log completo di chi ha visto e modificato cosa. SLA 99,9% contrattualizzato con penali.",
    },
    {
      q: "Siamo conformi al Codice Appalti per gli appalti pubblici?",
      a: "Sì, tutta la gestione subappalti è progettata sul D.Lgs. 36/2023 (nuovo Codice Appalti): verifica DURC e white list, tracciabilità pagamenti L. 136/2010, conto dedicato per commessa pubblica, gestione SAL e CILE/CILA, archiviazione digitale dei contratti di subappalto con AVCPass-ready. Alert automatici sulle scadenze e sui limiti di subappalto consentiti. Export standard per la stazione appaltante in caso di controllo.",
    },
  ],

  verticalFeatures: [
    {
      icon: Building2,
      problem: "Ogni responsabile cantiere lavora a modo suo: dieci cantieri, dieci modi diversi di registrare costi e SAL",
      solution: "Edilizia in Cloud impone un'unica struttura per tutti i cantieri (WBS, voci di costo, fasi SAL, centri di responsabilità) ma lascia a ogni responsabile la sua area di lavoro con permessi mirati. Il direttore tecnico vede tutti i cantieri, il responsabile vede solo i suoi, l'amministrazione vede solo i flussi finanziari. Standard a livello aziendale, autonomia a livello operativo.",
      economicBenefit: "1 modello",
      benefitLabel: "operativo unificato per tutti i cantieri attivi",
    },
    {
      icon: Users,
      problem: "Approvazioni di acquisti, SAL e ferie viaggiano via WhatsApp e email — nessuno sa chi ha approvato cosa",
      solution: "Workflow di approvazione configurabili per soglia e tipo di documento: ordine sotto 5.000 € approvato dal responsabile cantiere, sopra dal direttore tecnico, sopra 50.000 € dal CFO. Ogni approvazione è tracciata con timestamp, utente e firma digitale. Audit log completo per controlli interni e revisori. Niente più 'chi ha autorizzato questo ordine?'.",
      economicBenefit: "100%",
      benefitLabel: "delle autorizzazioni tracciate e firmate digitalmente",
    },
    {
      icon: TrendingUp,
      problem: "Il CFO scopre gli scostamenti di margine 30 giorni dopo — quando il cantiere è ormai compromesso",
      solution: "Sistema di alert proattivi sul margine di commessa: appena il consuntivo supera il budget oltre soglia configurata (es. 3%), il responsabile cantiere e il CFO ricevono notifica con dettaglio della voce critica. Forecast a fine cantiere ricalcolato ad ogni movimento. Decisioni correttive in giorni, non in mesi.",
      economicBenefit: "+2pp",
      benefitLabel: "marginalità recuperata grazie al controllo in tempo reale",
    },
    {
      icon: FileSignature,
      problem: "Subappaltatori, DURC, contratti, SAL ricevuti: una mole di documenti che vive nelle email del responsabile",
      solution: "Anagrafica subappaltatori centralizzata con tutti i documenti (contratto, DURC, white list, polizze, SAL emessi e ricevuti, pagamenti tracciati). Il responsabile cantiere carica un documento e tutta l'azienda lo vede. Alert 30 giorni prima della scadenza DURC. Conformità Codice Appalti garantita anche con turnover dei responsabili.",
      economicBenefit: "0 DURC",
      benefitLabel: "scaduti senza che nessuno se ne accorga",
    },
    {
      icon: LineChart,
      problem: "La direzione decide su dati 'che girano da qualche parte' — ognuno arriva in riunione con il suo Excel",
      solution: "Single source of truth: un'unica dashboard direzionale aggiornata in tempo reale, accessibile a tutti i C-level con la propria visuale. La riunione mensile di direzione non inizia più con 'qual è il dato giusto?' ma con 'cosa facciamo con questo scostamento?'. Tempo riunione dimezzato, qualità delle decisioni migliorata.",
      economicBenefit: "−50%",
      benefitLabel: "tempo nelle riunioni di controllo gestione mensili",
    },
  ],
  verticalFeaturesTitle: "Ruoli, deleghe, governance: la tua azienda media diventa un'organizzazione vera",
  verticalFeaturesSubtitle:
    "A 30 dipendenti non puoi più gestire tutto a voce. Servono ruoli chiari, deleghe scritte, approvazioni tracciate — senza diventare un'azienda burocratica. Edilizia in Cloud lo rende naturale.",
  demoLabel: "Pianifica demo Medie Imprese",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">10 cantieri.</span>{" "}
      <span className="text-[#F97415]">Una sola dashboard.</span>
    </>
  ),
  ctaSubtitle:
    "45 minuti di demo con un nostro consulente: ti mostriamo come una media impresa edile passa da 5 giorni di consolidamento Excel a un cruscotto direzionale sempre aggiornato. Nessun ERP, nessun progetto da 12 mesi.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior software gestionale per medie imprese edili con 10-50 dipendenti?",
      a: "Edilizia in Cloud è il gestionale verticale per medie imprese edili italiane: gestione multi-cantiere, margini di commessa in tempo reale, dashboard CFO, modulo HR con cassa edile e gestione subappalti conforme al Codice Appalti — senza la complessità e i costi di un ERP enterprise.",
    },
    {
      q: "Come si controllano i margini di commessa in una media impresa edile con più cantieri?",
      a: "Con Edilizia in Cloud ogni costo registrato (materiali, subappalto, ore, mezzi) aggiorna istantaneamente il margine del cantiere. Il CFO vede in un'unica dashboard la marginalità di tutti i cantieri attivi e riceve alert automatici quando un cantiere scende sotto la soglia di budget, prima che sia troppo tardi per correggere.",
    },
    {
      q: "Una media impresa edile può sostituire ERP e Excel con un solo software?",
      a: "Sì. Edilizia in Cloud unifica multi-cantiere, contabilità di commessa, HR e cassa edile, tesoreria, subappalti e dashboard CFO in un'unica piattaforma cloud, eliminando i 5-10 Excel paralleli e i costosi ERP edilizia tradizionali, con un TCO fino a 8 volte inferiore sui 3 anni.",
    },
  ],
};

export default function MedieImprese() {
  return <PerTipoPageTemplate config={config} />;
}
