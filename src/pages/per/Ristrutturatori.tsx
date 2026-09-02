import {
  FileText, Calculator, FolderOpen, Users, Clock, TrendingUp, ClipboardList, MapPin, Shield,
  TrendingDown, Send, Camera, Sparkles, Receipt, Wallet, Warehouse, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software per Ristrutturatori | Più Margini, Zero Caos",
  seoDescription: "Il gestionale per imprese di ristrutturazione che controlla i margini per cantiere in real-time, gestisce cassa e SAL a 90 giorni, tiene traccia di varianti e bonus edilizi.",
  seoKeywords: "software gestionale ristrutturazione, gestionale impresa ristrutturazioni, software preventivi ristrutturazione, gestionale bonus edilizi, software superbonus 110, gestionale ecobonus, software sismabonus, gestionale varianti cantiere, cessione credito software, documentazione SAL ristrutturazione",
  seoCanonical: "/per/ristrutturatori",

  badge: "Imprese di Ristrutturazione",

  heroTitle: (
    <>
      <span className="text-white">Aumenta i margini. Blinda la cassa.</span>{" "}
      <span className="text-[#F97415]">Controlla ogni cantiere di ristrutturazione.</span>
    </>
  ),
  heroSubtitle: "Non è solo un software per varianti e bonus: è il sistema che governa tutta l'azienda. Il margine reale di ogni cantiere lo vedi mentre lavori (+18% medio sulle commesse monitorate), la cassa la conosci a 90 giorni, varianti e SAL filano senza contestazioni — e sì, la documentazione bonus esce con checklist sempre aggiornate. Con l'AI che ti avvisa prima che una variante non tracciata diventi una perdita.",

  heroImage: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "RM", name: "Ristrutturazioni Marchetti", city: "Bologna", months: 14, gradient: "from-[#0d8f79] to-[#0a6b5a]" },
    { initials: "EC", name: "Edil Conti Srl", city: "Roma", months: 9, gradient: "from-[#F97415] to-[#c85e0a]" },
    { initials: "BF", name: "Bonus & Fix Srl", city: "Milano", months: 18, gradient: "from-[#1a6fad] to-[#0d4f80]" },
    { initials: "TR", name: "Tecnoristruttura Snc", city: "Torino", months: 11, gradient: "from-[#7c3aed] to-[#5b21b6]" },
  ],

  problemsTitle: "Il vero problema non è trovare lavoro — è guadagnarlo davvero.",
  problemsSubtitle: "I lavori arrivano. I clienti ci sono. Ma a fine cantiere i conti non tornano mai come avrebbero dovuto. Ecco perché.",

  problems: [
    {
      emoji: "💸",
      title: "I costi reali superano il preventivo",
      desc: "Il parquet costa il 20% in più rispetto a tre mesi fa. Il muratore ha fatto 6 ore di straordinario. Il fabbro è tornato due volte perché le misure erano cambiate. Questi costi non tracciati diventano perdita netta. E tu lo scopri solo quando emetti l'ultima fattura.",
    },
    {
      emoji: "📝",
      title: "Varianti non tracciate: ogni modifica è margine che sparisce",
      desc: "Il cliente vuole cambiare il pavimento. Poi aggiunge la controparete. Poi sposta le prese. Ogni variante viaggia su WhatsApp. A fine lavori non sai più cosa era nel preventivo originale — e il cliente nemmeno. Il risultato? Paghi tu la differenza.",
    },
    {
      emoji: "🏦",
      title: "SAL e acconti che non arrivano",
      desc: "SAL emesso e il cliente non paga. Acconto in ritardo di tre settimane. Su cinque cantieri aperti, almeno uno ha sempre un pagamento bloccato — e la cassa va in negativo mentre tu hai già comprato i materiali per il cantiere successivo.",
    },
    {
      emoji: "😤",
      title: "Clienti che chiamano ogni giorno",
      desc: "Ogni telefonata ti toglie 20 minuti di lavoro. Se non rispondi, il cliente pensa che stai nascondendo qualcosa. Se non hai i dati aggiornati, improvvisi una risposta che poi smentisce la realtà. È una rincorsa infinita — e logora il rapporto.",
    },
  ],

  roi: {
    lossValue: "€ 24.000",
    lossLabel: "in margini erosi da varianti non tracciate e costi reali sopra preventivo",
    wasteValue: "€ 11.000",
    wasteLabel: "ore perse su pratiche bonus, SAL, rapportini e coordinamento cantieri",
    errorValue: "€ 9.500",
    errorLabel: "in SAL e acconti incassati in ritardo: cassa negativa per settimane",
    totalLoss: "€ 44.500",
    softwareCost: "€ 2.388",
    roiX: "19x",
  },

  transformation: {
    title: "Prima di Edilizia in Cloud vs. Dopo",
    subtitle: "La stessa impresa, due realtà completamente diverse. Quella a destra è già possibile da domani.",
    fromTitle: "Senza gestionale — ogni giorno",
    fromItems: [
      "Margini calcolati a spanne: costi reali oltre il preventivo scoperti solo alla fattura finale",
      "Varianti comunicate su WhatsApp, mai formalizzate né firmate dal cliente",
      "SAL emessi e non incassati: chi segue e chi sollecita? Nessuno, di solito",
      "Pratiche bonus gestite su cartella condivisa senza controllo versioni e senza checklist",
      "Squadre coordinate via telefono: non sai quante ore hanno fatto davvero",
      "Scopri di aver dimenticato un documento ENEA solo quando il bonus è già perso",
    ],
    toTitle: "Con Edilizia in Cloud — da subito",
    toItems: [
      "Margini per cantiere in real-time: varianti approvate, costi reali e preventivo a confronto sempre",
      "Varianti tracciate, quotate e approvate digitalmente dal cliente in 5 minuti — zero discussioni a saldo",
      "Scadenzario SAL e acconti: ogni pagamento atteso ha la sua data, il suo importo e il suo sollecito automatico",
      "Documentazione bonus organizzata per tipo di detrazione con checklist ENEA sempre aggiornate",
      "App cantiere: ore registrate dal telefono, posizioni verificate, rapportini generati in 3 minuti",
      "Alert automatici per documenti in scadenza: zero bonus persi, zero brutte sorprese",
    ],
  },

  stats: [
    { value: "+18%", label: "margine medio per cantiere", sublabel: "sulle commesse monitorate in real-time" },
    { value: "90gg", label: "cassa prevista", sublabel: "SAL e acconti sempre tracciati" },
    { value: "0", label: "varianti non tracciate", sublabel: "ogni modifica firmata dal cliente" },
  ],

  modulesTitle: "Strumenti che governano tutta l'azienda di ristrutturazioni",
  modulesSubtitle: "Sei moduli per tenere il controllo su margini, cassa, varianti e bonus: dal sopralluogo alla firma finale del cliente.",

  modules: [
    {
      icon: TrendingUp,
      name: "Analisi Margini per Cantiere",
      desc: "Confronta preventivo iniziale, varianti approvate e costi reali in ogni momento. Vedi il margine aggiornato in tempo reale — voce per voce — e blocca le perdite prima che il cantiere si chiuda in rosso.",
      saving: "+18% margine medio per commessa",
    },
    {
      icon: Wallet,
      name: "Cassa, SAL e Scadenzario",
      desc: "SAL emesso e non incassato, acconto in ritardo, pagamento subappaltatore in scadenza: tutto in un unico scadenzario. La cassa prevista a 30, 60 e 90 giorni — con visibilità per ogni cantiere aperto. Il sollecito parte automaticamente se l'incasso tarda.",
      saving: "Cassa previsionale a 90 giorni",
    },
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
      desc: "Genera SAL con la documentazione corretta per ogni tipo di incentivo. Traccia lo stato delle pratiche CILA e SCIA con scadenze, protocolli e riferimenti al Comune. Gestisce anche cessione credito e sconto in fattura con cessionari e scadenze tracciati.",
      saving: "−3h per SAL",
    },
    {
      icon: Users,
      name: "Portale Clienti con Pratiche Detrazioni",
      desc: "Il tuo cliente accede a un'area riservata e vede: stato avanzamento lavori, documenti firmati, stato delle pratiche bonus, importi detrazione e prossimi passi. Niente più telefonate inutili.",
      saving: "−80% chiamate di aggiornamento",
    },
  ],

  aiShowcase: {
    title: "L'AI che lavora per te, anche quando sei in cantiere",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per un'impresa di ristrutturazioni significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un cantiere va in rosso",
        desc: "Ore oltre il previsto, materiali rincarati, costi extra non fatturati: se il margine del cantiere scende sotto la tua soglia, Silvio ti avvisa subito — non alla chiusura, quando è troppo tardi.",
      },
      {
        icon: Sparkles,
        tag: "Varianti",
        title: "Dalla richiesta a voce alla variante firmata",
        desc: "Il cliente chiede di spostare la cucina? Silvio prepara la variante con descrizione e importo, pronta da inviare per la firma digitale. Niente più modifiche regalate perché 'tanto era una cosa veloce'.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara i solleciti per SAL e saldi",
        desc: "SAL emesso e non incassato, acconto in ritardo? Silvio prepara il sollecito con il tono giusto — email o WhatsApp — e te lo mette in firma. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Trasforma foto e vocali in rapportini",
        desc: "La squadra carica le foto e una nota vocale dal cantiere: Silvio genera il rapportino, aggiorna il diario lavori e collega tutto al cantiere giusto — con timestamp che valgono in caso di contestazione.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — cantieri, varianti, costi, incassi, squadre.",
  },

  platformExtra: {
    title: "E tutto il resto dell'azienda? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'impresa di ristrutturazioni, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, acconti, SAL e sconto in fattura collegati al cantiere, bozze pronte da approvare.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi, pagamenti fornitori e subappaltatori: la cassa prevista a 30, 60 e 90 giorni, cantiere per cantiere.",
      },
      {
        icon: Users,
        name: "CRM e pipeline vendite",
        desc: "Richieste, sopralluoghi e trattative in un'unica pipeline: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Arrivi merce, lotti, DDT di entrata e uscita collegati a ordini fornitori e cantieri.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e scadenze",
        desc: "CILA, SCIA, DURC, contratti e garanzie archiviati per cantiere: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per cantiere, previsioni: i numeri dell'azienda in una schermata.",
      },
    ],
  },

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
  verticalFeaturesTitle: "Gestionale ristrutturazioni: margini protetti, cassa prevista, varianti firmate",
  verticalFeaturesSubtitle: "Non un generico gestionale cantieri. Un sistema costruito attorno ai margini che scappano, alla cassa che non quadra e alle varianti che il cliente non vuole pagare.",
  demoLabel: "Vedi come un'impresa di ristrutturazione protegge i margini e blinda la cassa su 5 cantieri attivi",

  ctaTitle: (
    <>
      <span className="text-white">Margini protetti. Cassa blindata.</span>{" "}
      <span className="text-[#F97415]">Ogni variante firmata, ogni cantiere sotto controllo.</span>
    </>
  ),
  ctaSubtitle: "30 minuti di demo: ti mostriamo come tracciare margini, cassa e varianti su un cantiere tipo — con i tuoi numeri. Nessun impegno.",

  schemaFaq: [
    {
      q: "Qual è il miglior software per imprese di ristrutturazione con Superbonus?",
      a: "Edilizia in Cloud è il gestionale per ristrutturatori più completo: controlla i margini per cantiere in real-time, gestisce la cassa a 90 giorni, traccia varianti con firma digitale, documenta Superbonus 110%, Ecobonus, Sismabonus, SAL e cessione credito. Aggiornato ad ogni modifica normativa.",
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
