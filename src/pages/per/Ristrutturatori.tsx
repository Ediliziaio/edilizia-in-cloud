import { FileText, Calculator, FolderOpen, Users, Clock, TrendingUp } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Imprese di Ristrutturazione — Superbonus, Ecobonus, Varianti | Edilizia in Cloud",
  seoDescription: "Il gestionale per ristrutturatori che gestisce varianti in corso d'opera, documentazione Superbonus 110%, Ecobonus, Sismabonus, SAL e cessione credito. Ogni pratica tracciata, ogni bonus incassato. Prova gratis 30 giorni.",
  seoKeywords: "software gestionale ristrutturazione, gestionale impresa ristrutturazioni, software preventivi ristrutturazione, gestionale bonus edilizi, software superbonus 110, gestionale ecobonus, software sismabonus, gestionale varianti cantiere, cessione credito software, documentazione SAL ristrutturazione",
  seoCanonical: "/per/ristrutturatori",

  badge: "Imprese di Ristrutturazione",

  heroTitle: (
    <>
      <span className="text-white">Basta perdere bonus edilizi</span>{" "}
      <span className="text-[#F97415]">per un documento mancante.</span>
    </>
  ),
  heroSubtitle: "Superbonus 110%, Ecobonus, Sismabonus, SAL, varianti, CILA, SCIA, APE: tutta la documentazione delle detrazioni in un unico gestionale. Smetti di gestire le pratiche bonus su cartelle condivise e WhatsApp — prima che un cliente perda l'agevolazione.",

  heroImage: "https://images.unsplash.com/photo-1503387837-b154d5074bd2?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "RM", name: "Ristrutturazioni Marchetti", city: "Bologna", months: 14, gradient: "from-[#0d8f79] to-[#0a6b5a]" },
    { initials: "EC", name: "Edil Conti Srl", city: "Roma", months: 9, gradient: "from-[#F97415] to-[#c85e0a]" },
    { initials: "BF", name: "Bonus & Fix Srl", city: "Milano", months: 18, gradient: "from-[#1a6fad] to-[#0d4f80]" },
    { initials: "TR", name: "Tecnoristruttura Snc", city: "Torino", months: 11, gradient: "from-[#7c3aed] to-[#5b21b6]" },
  ],

  problemsTitle: "La documentazione bonus ti sta mangiando vivo",
  problemsSubtitle: "Ogni ristrutturatore con più di 3 cantieri attivi riconosce almeno due di questi problemi. Se li riconosci tutti e quattro, continua a leggere.",

  problems: [
    {
      emoji: "📝",
      title: "Varianti fuori controllo: il preventivo è già un ricordo",
      desc: "Il cliente cambia idea, il geometra richiede modifiche, il cantiere riserva sorprese. Ogni variante finisce su WhatsApp o su un foglietto. A fine lavori non sai più quale versione del preventivo è quella finale — e il cliente nemmeno.",
    },
    {
      emoji: "💰",
      title: "Documentazione bonus caotica: Superbonus, Ecobonus, Sismabonus",
      desc: "Ogni tipo di detrazione ha la sua documentazione, i suoi SAL, la sua APE pre e post, i suoi massimali. Le normative cambiano ogni 6 mesi. Chi nella tua impresa sa con certezza quali documenti mancano per non perdere il bonus del cantiere aperto a gennaio?",
    },
    {
      emoji: "🔄",
      title: "SAL e cessione credito: tempi dilatati per colpa della burocrazia",
      desc: "Il SAL va prodotto al momento giusto, la documentazione per la cessione del credito deve essere ineccepibile, lo sconto in fattura va gestito con il cessionario. Un passo falso e il cliente non incassa l'incentivo — e la colpa ricade su di te.",
    },
    {
      emoji: "😤",
      title: "Clienti che ti chiamano ogni giorno chiedendo aggiornamenti",
      desc: "CILA presentata? SCIA approvata? L'APE è pronta? Quando iniziamo il secondo SAL? Ogni telefonata ti toglie 20 minuti di lavoro reale. E se non rispondi subito, il cliente pensa che stai nascondendo qualcosa.",
    },
  ],

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

  ctaTitle: (
    <>
      <span className="text-white">Ogni variante documentata.</span>{" "}
      <span className="text-[#F97415]">Ogni bonus incassato.</span>
    </>
  ),
  ctaSubtitle: "Vedi in 30 minuti come gestire ristrutturazioni, bonus fiscali e clienti privati — tutto da un unico posto, senza più cartelle condivise e WhatsApp.",

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
