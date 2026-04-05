import { FileText, Calculator, FolderOpen, Users, Clock, TrendingUp, ClipboardList, MapPin, Shield } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Imprese di Ristrutturazione — Varianti, Margini e Cantieri Sotto Controllo | Edilizia in Cloud",
  seoDescription: "Il gestionale per ristrutturatori: tieni sotto controllo varianti in corso d'opera, SAL, costi reali e margini per cantiere. Rapportini digitali, firma cliente, GPS squadre. Prova gratis 31 giorni.",
  seoKeywords: "software gestionale ristrutturazione, gestionale impresa ristrutturazioni, software preventivi ristrutturazione, gestionale bonus edilizi, software superbonus 110, gestionale ecobonus, software sismabonus, gestionale varianti cantiere, cessione credito software, documentazione SAL ristrutturazione",
  seoCanonical: "/per/ristrutturatori",

  badge: "Imprese di Ristrutturazione",

  heroTitle: (
    <>
      <span className="text-white">Le varianti ti mangiano il margine.</span>{" "}
      <span className="text-[#F97415]">In silenzio. Ogni giorno.</span>
    </>
  ),
  heroSubtitle: "Il preventivo iniziale è già un ricordo dopo la prima settimana. Il cliente cambia il parquet, aggiunge la controparete, sposta la cucina. Ogni variante non tracciata è margine che sparisce. Con Edilizia in Cloud ogni modifica è firmata dal cliente e aggiornata sul conto economico del cantiere — in tempo reale.",

  heroImage: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "RM", name: "Ristrutturazioni Marchetti", city: "Bologna", months: 14, gradient: "from-[#0d8f79] to-[#0a6b5a]" },
    { initials: "EC", name: "Edil Conti Srl", city: "Roma", months: 9, gradient: "from-[#F97415] to-[#c85e0a]" },
    { initials: "BF", name: "Bonus & Fix Srl", city: "Milano", months: 18, gradient: "from-[#1a6fad] to-[#0d4f80]" },
    { initials: "TR", name: "Tecnoristruttura Snc", city: "Torino", months: 11, gradient: "from-[#7c3aed] to-[#5b21b6]" },
  ],

  problemsTitle: "Il vero problema dei ristrutturatori non è trovare lavoro. È guadagnarlo.",
  problemsSubtitle: "I lavori arrivano. I clienti ci sono. Ma a fine cantiere i conti non tornano mai come avrebbero dovuto. Ecco perché.",

  problems: [
    {
      emoji: "📝",
      title: "Varianti non tracciate: ogni modifica è margine che sparisce",
      desc: "Il cliente vuole cambiare il pavimento. Poi aggiunge la controparete. Poi sposta le prese. Ogni variante viaggia su WhatsApp. A fine lavori non sai più cosa era nel preventivo originale — e il cliente nemmeno. Il risultato? Paghi tu la differenza.",
    },
    {
      emoji: "💸",
      title: "I costi reali superano il preventivo — e te ne accorgi troppo tardi",
      desc: "Il parquet costa il 20% in più rispetto a tre mesi fa. Il muratore ha fatto 6 ore di straordinario. Il fabbro è tornato due volte perché le misure erano cambiate. Questi costi non tracciati diventano perdita netta. E tu lo scopri solo quando emetti l'ultima fattura.",
    },
    {
      emoji: "📋",
      title: "Rapportini giornalieri: nessuno li compila, non li ha mai compilati",
      desc: "La legge li richiede. Il cliente li vuole per capire l'avanzamento. Tu li vorresti per sapere quante ore ci sono volute davvero. Ma i tuoi operai finiscono il turno e tornano a casa. Il rapportino si fa il venerdì pomeriggio a memoria — e non vale niente.",
    },
    {
      emoji: "😤",
      title: "Clienti che chiamano ogni giorno: 'A che punto siamo? Quando finite?'",
      desc: "Ogni telefonata ti toglie 20 minuti di lavoro. Se non rispondi, il cliente pensa che stai nascondendo qualcosa. Se non hai i dati aggiornati, improvvisi una risposta che poi smentisce la realtà. È una rincorsa infinita — e logora il rapporto.",
    },
  ],

  roi: {
    lossValue: "€ 22.000",
    lossLabel: "in detrazioni fiscali perse per documentazione errata",
    wasteValue: "€ 13.000",
    wasteLabel: "ore perse su pratiche bonus, ENEA, APE e varianti",
    errorValue: "€ 9.500",
    errorLabel: "in varianti non tracciate e clienti scontenti",
    totalLoss: "€ 44.500",
    softwareCost: "€ 2.388",
    roiX: "19x",
  },

  transformation: {
    title: "Prima di Edilizia in Cloud vs. Dopo",
    subtitle: "La stessa impresa, due realtà completamente diverse. Quella a destra è già possibile da domani.",
    fromTitle: "Senza gestionale — ogni giorno",
    fromItems: [
      "Varianti comunicate su WhatsApp, mai formalizzate né firmate dal cliente",
      "Pratiche Superbonus ed Ecobonus gestite su cartella condivisa senza controllo versioni",
      "SAL calcolati a mano, documentazione raccolta all'ultimo minuto prima della scadenza",
      "Clienti che chiamano per sapere a che punto sono le pratiche CILA/SCIA",
      "Cessione credito o sconto in fattura gestiti con email sparse e nessuna traccia",
      "Scopri di aver dimenticato un documento ENEA solo quando il bonus è già perso",
    ],
    toTitle: "Con Edilizia in Cloud — da subito",
    toItems: [
      "Varianti tracciate, quotate e approvate digitalmente dal cliente in 5 minuti",
      "Documentazione bonus organizzata per tipo di detrazione con checklist ENEA sempre aggiornate",
      "SAL generati automaticamente con i documenti corretti per Superbonus, Ecobonus e Sismabonus",
      "Portale clienti: ogni proprietario vede lo stato del suo cantiere e delle sue pratiche in tempo reale",
      "Cessione credito e sconto in fattura tracciati con cessionario, importi e scadenze",
      "Alert automatici per documenti in scadenza: zero bonus persi, zero brutte sorprese",
    ],
  },

  stats: [
    { value: "−4h", label: "al giorno su pratiche bonus", sublabel: "documentazione automatizzata" },
    { value: "+35%", label: "preventivi vinti", sublabel: "grazie a preventivi con varianti professionali" },
    { value: "0", label: "varianti non tracciate", sublabel: "ogni modifica firmata dal cliente" },
  ],

  modulesTitle: "Gli strumenti che mancavano al tuo ufficio tecnico",
  modulesSubtitle: "Sei moduli costruiti su misura per la complessità delle ristrutturazioni con bonus edilizi.",

  modules: [
    {
      icon: FileText,
      name: "Gestione Varianti in Corso d'Opera",
      desc: "Ogni richiesta di variante viene documentata, preventivata e inviata al cliente per approvazione digitale. Il preventivo originale non si tocca: le varianti si aggiungono con numero progressivo e firma.",
      saving: "Zero contestazioni a fine lavori",
    },
    {
      icon: Calculator,
      name: "Documentazione Bonus Edilizi",
      desc: "Checklist aggiornate per Superbonus 110%, Ecobonus, Sismabonus e Bonus Ristrutturazione. Documenti ENEA, APE pre/post, massimali di spesa e requisiti tecnici sempre sotto controllo per ogni cantiere.",
      saving: "Ogni bonus incassato",
    },
    {
      icon: FolderOpen,
      name: "SAL e Pratiche CILA/SCIA",
      desc: "Genera SAL con la documentazione corretta per ogni tipo di incentivo. Traccia lo stato delle pratiche CILA e SCIA con scadenze, protocolli e riferimenti al Comune. Nessuna scadenza sfugge.",
      saving: "−3h per SAL",
    },
    {
      icon: Users,
      name: "Portale Clienti con Pratiche Detrazioni",
      desc: "Il tuo cliente accede a un'area riservata e vede: stato avanzamento lavori, documenti firmati, stato delle pratiche bonus, importi detrazione e prossimi passi. Niente più telefonate inutili.",
      saving: "−80% chiamate di aggiornamento",
    },
    {
      icon: Clock,
      name: "Cessione Credito e Sconto in Fattura",
      desc: "Gestisci i meccanismi di trasferimento del beneficio fiscale con cessionari, importi, fatture e scadenze tracciati. Il sistema ti avvisa quando serve emettere la fattura con sconto o cedere il credito.",
      saving: "Zero errori sul trasferimento",
    },
    {
      icon: TrendingUp,
      name: "Analisi Margini con Varianti",
      desc: "Confronta preventivo iniziale, varianti approvate e costi reali in ogni momento. Vedi il margine aggiornato in tempo reale e blocca le perdite prima che il cantiere si chiuda in rosso.",
      saving: "+18% margine medio per commessa",
    },
  ],

  caseStudy: {
    company: "RestauroCase Martini SRL",
    city: "Firenze",
    sector: "Ristrutturazioni residenziali con bonus fiscali",
    revenue: "950K €",
    person: "Andrea Martini",
    role: "Titolare",
    initials: "AM",
    gradient: "from-[#0d8f79] to-[#F97415]",
    quote: "Avevo 11 cantieri aperti con pratiche Superbonus ed Ecobonus. Non dormivo la notte pensando a quali documenti mancavano. Con Edilizia in Cloud ogni pratica ha la sua scheda: APE pre e post, documenti ENEA, stato SAL, scadenze. Ho portato il preventivo da 3 ore a 25 minuti e non ho perso un solo bonus dal primo giorno di utilizzo.",
    metrics: [
      { label: "Tempo per preventivo con varianti", before: "3 ore", after: "25 minuti" },
      { label: "Pratiche bonus perse per doc. mancante", before: "2–3 l'anno", after: "0 in 14 mesi" },
      { label: "Chiamate clienti per aggiornamenti", before: "8–10 al giorno", after: "1–2 al giorno" },
    ],
  },

  faq: [
    {
      q: "Il software gestisce davvero la documentazione Superbonus 110% e le sue varianti normative?",
      a: "Sì. Le checklist documentali vengono aggiornate ogni volta che cambia la normativa — e negli ultimi 3 anni il Superbonus è cambiato più di 20 volte. Il sistema distingue tra le diverse aliquote (110%, 90%, 70%, 65%) e i requisiti specifici per condomini, unifamiliari e IACP. Ogni cantiere ha la propria scheda con i documenti richiesti per quella specifica configurazione.",
    },
    {
      q: "Come gestisce le varianti in corso d'opera senza perdere la versione originale del preventivo?",
      a: "Il preventivo originale resta immutato. Ogni variante viene aggiunta come addendum con descrizione, importo, impatto sul SAL e firma digitale del cliente. A fine lavoro hai una cronologia completa di tutte le versioni approvate — esattamente quello che serve se il cliente contesta qualcosa.",
    },
    {
      q: "Posso usarlo per gestire SAL con pratiche Ecobonus e cessione del credito?",
      a: "Sì. Il modulo SAL genera automaticamente la documentazione tecnica necessaria per il tipo di bonus (Ecobonus 65%, Ecobonus 50%, Superbonus) e traccia il cessionario, gli importi ceduti e le fatture con sconto in fattura. Il sistema ti avvisa quando è il momento di emettere il SAL successivo in base all'avanzamento registrato in cantiere.",
    },
    {
      q: "Come funziona la documentazione APE pre e post intervento?",
      a: "Il sistema ha un modulo dedicato per la gestione delle APE (Attestati di Prestazione Energetica). Puoi allegare i file del certificatore, tracciare la classe energetica pre e post intervento, verificare il salto di classe richiesto per l'Ecobonus e avere tutto pronto per l'invio ENEA.",
    },
    {
      q: "Il portale clienti mostra anche lo stato delle pratiche CILA e SCIA?",
      a: "Sì. Il portale clienti mostra in tempo reale: avanzamento lavori con foto, stato delle pratiche urbanistiche (CILA, SCIA, PDC) con numero protocollo e date, stato delle pratiche bonus con documenti mancanti, e prossimo SAL previsto. Il cliente smette di chiamarti perché trova tutto online.",
    },
    {
      q: "Supporta anche il Sismabonus e il Bonus Facciate per lavori già avviati?",
      a: "Sì. Il sistema ha checklist specifiche per Sismabonus ordinario (50–85%), Sismabonus acquisti e Bonus Facciate. Puoi gestire anche pratiche aperte prima dell'adozione del software importando i documenti esistenti nelle schede cantiere.",
    },
  ],

  verticalFeatures: [
    {
      icon: FileText,
      problem: "Varianti non formalizzate: il cliente non riconosce i lavori extra a fine cantiere",
      solution: "Ogni variante viene creata in Edilizia in Cloud con descrizione, importo aggiuntivo e fotografia. Il cliente riceve un link su WhatsApp, legge, approva e firma digitalmente. La variante si aggiunge automaticamente al totale commessa. Fine delle discussioni a saldo.",
      economicBenefit: "+ 18%",
      benefitLabel: "di lavori extra recuperati e fatturati rispetto a prima",
    },
    {
      icon: ClipboardList,
      problem: "Rapportini giornalieri: non li compila nessuno — e costa caro in caso di dispute",
      solution: "Il rapportino si fa dall'app in 3 minuti a fine turno: ore lavorate, materiali usati, foto avanzamento, note. Il cantiere ha uno storico cronologico completo. In caso di contestazione del cliente, hai tutto documentato con timestamp e geolocalizzazione.",
      economicBenefit: "€ 0",
      benefitLabel: "rischi legali per mancata documentazione SAL",
    },
    {
      icon: MapPin,
      problem: "Non sai dove sono le tue squadre — e se stanno davvero lavorando",
      solution: "L'app mostra la posizione dell'operaio quando timbra l'entrata/uscita dal cantiere (geofencing opzionale). Non serve il GPS permanente — solo la conferma di presenze reale. Ore pagate = ore in cantiere. Il controllo torna a te.",
      economicBenefit: "−22%",
      benefitLabel: "ore pagate non in cantiere nel primo trimestre di utilizzo",
    },
    {
      icon: Shield,
      problem: "Sicurezza: cartelli, DVR, DPI, PSC — tutto su carta, sempre incompleto",
      solution: "Il modulo sicurezza gestisce: cartelli di cantiere digitali, consegna DPI firmata dall'operaio via app, scadenze visite mediche con alert automatico, PSC allegato alla commessa. In caso di ispezione ASL hai tutto in 30 secondi.",
      economicBenefit: "−100%",
      benefitLabel: "sanzioni per documentazione sicurezza mancante",
    },
  ],
  verticalFeaturesTitle: "Gestionale ristrutturazione: dal preventivo alla firma finale",
  verticalFeaturesSubtitle: "Rapportini, varianti, GPS squadre, sicurezza cantiere, SAL, firma digitale. Tutto in un unico sistema — usato dagli operai in cantiere e da te dall'ufficio o da casa.",
  demoLabel: "Vedi come un'impresa di ristrutturazione protegge i margini su 5 cantieri attivi con varianti e rapportini digitali",

  ctaTitle: (
    <>
      <span className="text-white">Ogni variante documentata.</span>{" "}
      <span className="text-[#F97415]">Ogni margine protetto.</span>
    </>
  ),
  ctaSubtitle: "30 minuti di demo: ti mostriamo come tracciare varianti, rapportini e costi reali sul tuo tipo di cantiere — con i tuoi numeri. Nessun impegno.",

  schemaFaq: [
    {
      q: "Qual è il miglior software per imprese di ristrutturazione con Superbonus?",
      a: "Edilizia in Cloud è il gestionale per ristrutturatori più completo: gestisce documentazione Superbonus 110%, Ecobonus, Sismabonus, varianti in corso d'opera con firma digitale, SAL, cessione credito e portale clienti. Aggiornato ad ogni modifica normativa.",
    },
    {
      q: "Come si gestisce la documentazione Superbonus con un software gestionale?",
      a: "Il software traccia ogni pratica con documenti ENEA, APE pre/post, SAL, massimali di spesa e requisiti tecnici. Alert automatici per documenti in scadenza e checklist specifiche per condomini, unifamiliari e le diverse aliquote Superbonus.",
    },
  ],
};

export default function Ristrutturatori() {
  return <PerTipoPageTemplate config={config} />;
}
