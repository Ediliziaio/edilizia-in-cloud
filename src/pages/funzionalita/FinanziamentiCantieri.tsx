import {
  AlertTriangle,
  Banknote,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  Euro,
  FileSignature,
  FileText,
  HandCoins,
  HardHat,
  Handshake,
  Layers,
  Landmark,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "finanziamenti-cantieri",
  vertical: "Finanziamenti Cantieri",
  productName: "Modulo Finanziamenti Cantieri Edilizia in Cloud",
  audience:
    "Imprese edili che operano su Superbonus 110%, Sismabonus, Ecobonus con cessione del credito, hanno bisogno di anticipo SAL bancario, factoring fatture cantiere, dossier di finanziabilità da presentare a banche, factor e piattaforme cessione",
  audienceShort: "imprese edili con bisogni di liquidità",

  seo: {
    title:
      "Finanziamenti Cantieri Edili",
    description:
      "Gestisci cessione del credito Superbonus/Sismabonus/Ecobonus, factoring fatture cantiere, anticipo SAL bancario. Dossier di finanziabilità pronti per…",
    keywords:
      "cessione credito Superbonus software, factoring cantieri edilizia, anticipo SAL banca, software finanziamenti edilizia, dossier cessione credito, Sismabonus cessione, Ecobonus cessione credito, factoring fatture edilizia, anticipo cantiere banca, finanziamenti imprese edili",
    ogImage: "https://www.ediliziaincloud.com/og/finanziamenti-cantieri-og.jpg",
  },

  heroBadge: "Funzionalità · Finanziamenti Cantieri",
  heroH1Lead: "Cessione credito, factoring e anticipo SAL",
  heroH1Highlight: "in un solo dossier",
  heroH1Tail: "pronto per la banca",
  heroSubheadline:
    "Modulo dedicato alle imprese edili che hanno bisogno di liquidità sui cantieri: gestione cessione del credito Superbonus 110%, Sismabonus, Ecobonus, factoring fatture cantiere, anticipo SAL bancario. Dossier di finanziabilità completo pronto in 1 giorno per banche, factor e piattaforme di cessione. Banche concorrenti, sconti ridotti, cassa disponibile.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import dossier in corso",
    "Template pronti per banche e factor",
    "Asseverazioni e fatture SDI integrate",
  ],
  proofPoints: [
    "Dossier cessione credito in 1 giorno",
    "Banche concorrenti su tuoi crediti",
    "Sconto cessione ridotto del 2%",
  ],

  objectiveRow: [
    ["Obiettivo", "Liquidità immediata su cantieri Superbonus e SAL aperti"],
    ["Momento chiave", "Cessione credito, anticipo SAL, factoring fatture"],
    ["Risultato", "Banche in concorrenza, sconto ridotto, cassa prevedibile"],
  ],

  betaH2:
    "Più di 110 imprese edili italiane gestiscono cessioni del credito Superbonus e anticipi SAL con Edilizia in Cloud.",
  betaBody:
    "Attiviamo il modulo Finanziamenti in 48 ore: importiamo i dossier cessione in corso, configuriamo template per banche e factor partner, integriamo asseverazioni tecniche e fatture SDI con codici natura corretti, predisponiamo flussi anticipo SAL e factoring. 4 sessioni 1-a-1 fino al primo dossier accettato.",

  speedH2:
    "Un dossier cessione credito Superbonus preparato a mano costa 2 settimane. In quelle 2 settimane il prezzo della cessione cala dello 0,5-1%.",
  speedSubheadline:
    "Le banche e i factor accettano cessioni Superbonus a sconto variabile (oggi 8-15% sotto il valore nominale). Più velocemente presenti dossier completi, più riesci a far concorrere più banche e ridurre lo sconto. Edilizia in Cloud porta il dossier da 2 settimane a 1 giorno: due punti percentuali recuperati su ogni cessione.",
  speedStats: [
    { value: 1, suffix: " gg", label: "tempo medio per dossier cessione completo" },
    { value: 2, prefix: "-", suffix: "%", label: "sconto cessione ridotto grazie a concorrenza banche" },
    { value: 100, suffix: "%", label: "dossier accettati al primo invio" },
  ],

  familyH2: "Finanziamenti vivono collegati a cantieri, fatture, ritenute e tesoreria.",
  familySubheadline:
    "Un dossier finanziamento non è un PDF isolato: è il risultato di un cantiere ben tracciato, di fatture SDI con codici natura corretti, di asseverazioni tecniche firmate, di ritenute conformi. Edilizia in Cloud assembla il dossier dai dati che già produci ogni giorno.",
  familyItems: [
    {
      icon: Banknote,
      title: "Finanziamenti Cantieri",
      text: "Cessione credito Superbonus, anticipo SAL, factoring fatture, dossier finanziabilità.",
      to: "/funzionalita/finanziamenti-cantieri",
    },
    {
      icon: Sun,
      title: "Cantieri Fotovoltaico",
      text: "Cessione credito Superbonus 110% su impianti fotovoltaici residenziali e industriali.",
      to: "/funzionalita/fotovoltaico",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "SAL aperti alimentano richieste anticipo bancario con tracking marginalità.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture cantiere con codici natura corretti per cessione credito e factoring.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Cassa prevista da finanziamenti, cessioni in essere, anticipi SAL programmati.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Asseverazioni tecniche, vista commercialista, contratti banca firmati eIDAS.",
      to: "/funzionalita/firma-elettronica",
    },
  ],
  familyBonusTitle: "Una piattaforma. Dal cantiere alla banca senza compilazioni doppie.",
  familyBonusText:
    "Quando un capocantiere registra avanzamento, la fattura SAL si aggiorna. Quando il tecnico firma asseverazione, il dossier cessione si completa. Quando il commercialista appone visto, il dossier è pronto per banca o factor. Tutto integrato senza data entry duplicato: il dossier finanziamento vive grazie ai dati operativi che già produci.",

  painKicker: "Il problema vero",
  painH2:
    "Banche e factor ti tengono in attesa 2 settimane per dossier incompleto. Intanto la liquidità del cantiere muore.",
  painSubheadline:
    "Le imprese edili con cessione credito Superbonus, factoring o anticipo SAL spendono 2 settimane a preparare ogni dossier: cartelle Drive, fatture SDI rincorrese, asseverazioni in PDF, visti del commercialista. Banche scartano per documenti mancanti, il prezzo cala mentre aspetti, la concorrenza tra banche svanisce.",
  painPoints: [
    {
      icon: Timer,
      title: "Dossier banca in 2 settimane = sconto +1-2%",
      text: "Banche valutano cessioni in tempi brevi quando dossier completo, in tempi lunghi quando incompleto. Ogni settimana di attesa = 0,3-0,5% in più di sconto cessione. Su un credito da 100k€, sono 1.000-2.000€ persi per ogni settimana di lentezza.",
    },
    {
      icon: AlertTriangle,
      title: "Banche che rifiutano per 'documenti mancanti'",
      text: "Asseverazione del tecnico, APE pre/post, computo metrico, fatture SDI con codici natura corretti, bonifici parlanti tracciati, visto di conformità del commercialista. Se manca anche solo un elemento, banca rinvia: 2 settimane perse, contesto cambiato.",
    },
    {
      icon: Database,
      title: "Concorrenza banche impossibile a parità di dossier",
      text: "Per far concorrere 3 banche su una cessione serve preparare 3 volte il dossier (formati diversi). Tempo per concorrenza = 3 settimane. Risultato: si presenta a 1 banca sola, niente concorrenza, sconto subito al ribasso.",
    },
    {
      icon: Wallet,
      title: "Cantiere fermo per cassa, fornitori non pagati",
      text: "SAL emesso al committente con pagamento a 90 giorni. Tu hai pagato fornitori, manodopera, fideiussioni. Cassa in negativo per 3 mesi, fornitori che bloccano forniture, cantiere rallenta. L'anticipo SAL bancario sarebbe la soluzione, ma serve dossier veloce.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesse banche, stessi factor, stessi crediti. Cambia il tempo di preparazione e lo sconto applicato.",
  baSubheadline:
    "Edilizia in Cloud non sostituisce il commercialista né il direttore commerciale della banca: toglie il caos amministrativo che oggi rende ogni dossier un'odissea. Risultato: dossier in 1 giorno, 3 banche in concorrenza, sconto -2% in media.",
  baAreas: [
    {
      title: "Preparazione dossier cessione Superbonus",
      before:
        "2 settimane per radunare asseverazione tecnica, APE pre/post, computo metrico, fatture SDI, bonifici parlanti, visto commercialista. Cartelle Drive, email, scansioni, copie multiple, errori frequenti.",
      after:
        "Dossier generato automaticamente dal sistema in PDF unico con indice, tutti i documenti firmati eIDAS, fatture SDI con codice natura N6.7, asseverazioni timbrate. Pronto in 1 giorno.",
    },
    {
      title: "Concorrenza tra banche su cessione",
      before:
        "Preparare dossier per 3 banche serve 3 settimane (formati diversi, richieste extra). Si presenta a 1 banca sola, sconto al ribasso al 13-15%, take-it-or-leave-it.",
      after:
        "Dossier modulare adattabile in 30 minuti per ciascuna banca/factor. Inviato a 3-4 partner contemporaneamente, banche in concorrenza, sconto medio scende a 10-11%.",
    },
    {
      title: "Anticipo SAL su cantiere aperto",
      before:
        "Banca chiede contratto appalto, SAL emesso, asseverazione di stato avanzamento, visura camerale, ultimo bilancio, DURC. Ricerca dispersa, 1 settimana per dossier, banca rinvia.",
      after:
        "Dossier anticipo SAL generato dai dati cantiere già strutturati: contratto firmato eIDAS, SAL con asseverazione, fatturazione SDI, DURC live. Banca riceve dossier completo in 1 giorno, sblocco anticipo in 5-7 giorni.",
    },
    {
      title: "Factoring fatture cantiere multipli",
      before:
        "Factoring chiede fatture SDI, contratti commerciali, prove di consegna, garanzie. Per ogni fattura serve preparare dossier separato. Tempo amministrativo erode beneficio factoring.",
      after:
        "Sistema raggruppa fatture per cliente/cantiere, dossier factoring multipli generati in batch, contratti già archiviati cloud, prove consegna allegate. Factor processa pacchetti, sconto factoring competitivo.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dal cantiere alla liquidità in conto.",
  mechanismSubheadline:
    "Il modulo Finanziamenti è progettato per imprese che gestiscono 5-30 dossier finanziamento all'anno: assemblaggio automatico dossier, template per banche partner, tracking offerte e accettazioni. Tutto integrato senza data entry duplicato.",
  mechanismSteps: [
    {
      icon: ClipboardList,
      title: "Sistema assembla dossier dai dati cantiere",
      text: "Dal cantiere attivo, il sistema raccoglie automaticamente: contratto firmato eIDAS, asseverazione tecnica timbrata, APE pre/post, computo metrico, fatture SDI con codici natura, bonifici parlanti, visto commercialista. PDF unico con indice generato.",
    },
    {
      icon: Handshake,
      title: "Invio multiplo a banche e factor partner",
      text: "Dossier inviato in parallelo a 3-4 banche e factor partner via portale dedicato. Tracking delle offerte ricevute, comparatore sconti applicati, scelta migliore offerta automatica con notifica al titolare.",
    },
    {
      icon: Bell,
      title: "Accettazione, bonifico, riconciliazione tesoreria",
      text: "Banca/factor accetta cessione o anticipo, bonifico in conto, sistema riconcilia con tesoreria, aggiorna stato cantiere e marginalità. Dossier archiviato cloud per controlli successivi.",
    },
  ],
  mechanismCta: "Apri la dashboard Finanziamenti",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Sconto cessione -2%, cassa più veloce, concorrenza banche reale.",
  commercialBody:
    "Le imprese edili che usano Edilizia in Cloud per la gestione finanziamenti riducono lo sconto medio sulle cessioni del 2%, sbloccano anticipi SAL in 5-7 giorni anziché 3-4 settimane e sopravvivono ai cantieri Superbonus 110% senza tensioni di cassa. Il ROI si misura in liquidità reale recuperata.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Sconto cessione -2% grazie a concorrenza",
      text: "Su cessione credito da 100k€ Superbonus, lo sconto medio passa dal 13% al 10-11% grazie a banche in concorrenza con dossier già pronto. Sono 2.000-3.000€ recuperati per cessione, su 10 cessioni/anno = 20-30k€.",
    },
    {
      icon: Timer,
      title: "Anticipo SAL in 5-7 giorni",
      text: "Banche sbloccano anticipo SAL in 5-7 giorni quando dossier è completo al primo invio. Niente più ping-pong di documenti, niente settimane di attesa, niente cassa in negativo. Cantiere prosegue senza tensioni.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità garantita su cessioni",
      text: "Codici natura N6.7 corretti, bonifici parlanti tracciati, asseverazioni firmate digitalmente, visto commercialista archiviato. Banche e Agenzia Entrate non contestano, cessione passa al primo controllo.",
    },
    {
      icon: Sparkles,
      title: "Affidabilità percepita da banche e factor",
      text: "Banche partner percepiscono la tua impresa come strutturata: dossier impeccabili, documentazione completa, conformità documentata. Costo del finanziamento scende, fido bancario sale, gare future invitate.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Liquidità immediata sui cantieri, banche in concorrenza, dossier sempre accettati.",
  resultsBody:
    "Quando ogni dossier finanziamento è generato dai dati operativi che già produci, la presentazione è veloce, le banche concorrono, lo sconto cala e i cantieri non si fermano mai per cassa. È la differenza tra chi vive di Superbonus con tensione e chi lo gestisce con serenità.",
  integrationPillars: [
    {
      icon: Banknote,
      title: "Cessione credito Superbonus/Sismabonus/Ecobonus",
      text: "Dossier completo con asseverazione, APE, computo, fatture SDI N6.7, bonifici parlanti, visto. Pronto per banche partner (Intesa, UniCredit, Poste, BNL, Crédit Agricole) e piattaforme cessione.",
    },
    {
      icon: HandCoins,
      title: "Factoring fatture cantiere",
      text: "Fatture SDI raggruppate per cliente/cantiere con prove di consegna allegate. Dossier factoring multipli in batch per factor partner, sconto competitivo grazie a volume aggregato.",
    },
    {
      icon: Landmark,
      title: "Anticipo SAL bancario",
      text: "SAL emesso con asseverazione di avanzamento, contratto appalto allegato, DURC live, ultimo bilancio. Sblocco anticipo in 5-7 giorni con banche partner abituate al format.",
    },
    {
      icon: Database,
      title: "Comparatore offerte banche/factor",
      text: "Per ogni dossier inviato, traccia offerte ricevute (sconto applicato, tempi erogazione, condizioni). Sceglie automatica migliore offerta o suggerisce trattativa. Storico per relazioni future.",
    },
  ],
  resultStats: [
    { value: 2, prefix: "-", suffix: "%", label: "sconto medio cessione credito" },
    { value: 7, suffix: " gg", label: "tempo medio anticipo SAL" },
    { value: 100, suffix: "%", label: "dossier accettati al primo invio" },
  ],
  resultsCta: "Apri la dashboard Finanziamenti",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale ridurre del 2% lo sconto su ogni cessione credito che fai?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero cantieri/anno con cessione credito e valore medio del credito ceduto. La stima parte dal -2% di sconto cessione recuperato grazie alla concorrenza tra banche con dossier già pronto.",
  roi: {
    input1Label: "Cantieri/anno con cessione credito",
    input1Default: 8,
    input1Min: 1,
    input1Max: 30,
    input1Step: 1,
    input2Label: "Valore medio credito ceduto (€)",
    input2Default: 80000,
    input2Min: 10000,
    input2Max: 1000000,
    input2Step: 1000,
    input2Suffix: " €",
    outputLabel: "Liquidità recuperata stimata/anno",
    computeOutput: (a, b) => Math.round(a * b * 0.02),
    computeSecondary: (a, b) => [
      { label: "Volume crediti ceduti/anno", value: `${(a * b).toLocaleString("it-IT")} €` },
      { label: "Sconto evitato grazie a concorrenza", value: "2%" },
      { label: "Tempo medio anticipo SAL", value: "5-7 giorni" },
    ],
    closingPitch:
      "Stima conservativa al 2% di sconto evitato. Aggiungi il valore degli anticipi SAL sbloccati in 5-7 giorni e i cantieri che non si fermano per cassa: il ROI reale è multiplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un PDF generator. Una macchina di liquidità per imprese edili.",
  salesBody:
    "Edilizia in Cloud trasforma i dati operativi in dossier finanziamento pronti per banche. Le 4 dimensioni operative che cambiano dal primo dossier inviato.",
  salesImpact: [
    {
      title: "Cassa prevedibile sui cantieri Superbonus",
      text: "Smetti di vivere mese per mese con tensione: cessione credito programmata, anticipo SAL pianificato, factoring fatture in batch. La cassa è un dato che vedi, non una sorpresa.",
    },
    {
      title: "Banche partner che ti cercano",
      text: "Quando le banche vedono che presenti dossier impeccabili, sono loro a cercarti per offrire cessioni. Costo del finanziamento scende, fido bancario sale, partnership pluriennali.",
    },
    {
      title: "Cantieri che non si fermano mai",
      text: "Anticipo SAL in 5-7 giorni significa fornitori pagati, manodopera puntuale, cantiere che procede. Niente più 'aspettiamo che il committente paghi tra 90 giorni': la liquidità arriva subito.",
    },
    {
      title: "Conformità Agenzia Entrate garantita",
      text: "Codici natura corretti, bonifici parlanti, asseverazioni firmate digitalmente, vista commercialista. In caso di controllo Agenzia Entrate, dossier impeccabile esportabile in 5 minuti.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi vive di Superbonus e cantieri pubblici, non slogan finanziari.",
  featureRows: [
    {
      label: "Dossier cessione credito Superbonus 110%/Sismabonus/Ecobonus",
      value:
        "Generazione automatica PDF con asseverazione tecnica, APE pre/post, computo metrico, fatture SDI N6.7, bonifici parlanti, visto commercialista. Indice navigabile, firme eIDAS, archivio cloud.",
    },
    {
      label: "Template per banche e factor partner",
      value:
        "Format predefiniti per Intesa Sanpaolo, UniCredit, BNL, Crédit Agricole, Poste, Banca IFIS, factor MBC, Generalfinance. Adattamento automatico struttura dossier in base a richieste partner.",
    },
    {
      label: "Anticipo SAL bancario in 5-7 giorni",
      value:
        "Dossier con contratto appalto, SAL asseverato, ultimo bilancio, DURC live, fatturazione SDI. Invio a banche partner abituate al format, sblocco anticipo veloce per cassa cantiere.",
    },
    {
      label: "Factoring fatture cantiere in batch",
      value:
        "Raggruppamento fatture SDI per cliente/cantiere, prove di consegna allegate, contratti commerciali. Dossier factoring multipli generati in batch per factor partner, sconto competitivo.",
    },
    {
      label: "Comparatore offerte cessione",
      value:
        "Per ogni dossier inviato in parallelo a più banche/factor, traccia sconto applicato, tempi erogazione, condizioni. Suggerisce migliore offerta o trattativa, storico relazioni per futuro.",
    },
    {
      label: "Tesoreria integrata con finanziamenti in essere",
      value:
        "Cassa prevista da cessioni accettate, anticipi SAL programmati, factoring in lavorazione. Previsione cassa a 90 giorni, alert su scadenze rimborso anticipi e cessioni in scadenza.",
    },
    {
      label: "Conformità codici natura SDI per cessione",
      value:
        "Fatture cantiere con codice natura corretto N6.7 reverse charge edilizia, codici esonero per cessione, codici esenzione Superbonus. Niente contestazioni Agenzia Entrate al controllo.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Finanziamenti cambia la cassa.",
  scenarios: [
    {
      title: "Cessione Superbonus 110% da 95k€",
      text:
        "Cantiere chiuso, dossier cessione generato in 4 ore: asseverazione, APE, fatture SDI, bonifici, visto commercialista. Inviato a 3 banche in parallelo. Migliore offerta sconto 9,5% vs media mercato 13%. 3.300€ recuperati in una cessione.",
    },
    {
      title: "Anticipo SAL urgente per pagare fornitori",
      text:
        "Venerdì: SAL 180k€ emesso al Comune con pagamento 90 giorni, fornitori chiedono saldo lunedì. Dossier anticipo SAL generato sabato, inviato banca partner lunedì mattina, bonifico 70% del SAL accreditato venerdì successivo. Cantiere salvo.",
    },
    {
      title: "Factoring fatture cliente privato",
      text:
        "12 fatture SDI da 240k€ totali emesse a generale di costruzioni privato con pagamento 120 giorni. Dossier factoring batch generato in 1 ora, factor accetta sconto 4,5% (vs 6% offerto inizialmente), cassa 230k€ in conto entro 5 giorni.",
    },
  ],

  testimonialQuote:
    "Lavoriamo Superbonus per 4-5 cantieri all'anno. Prima ogni cessione era 2 settimane di lavoro per il commercialista, e accettavamo lo sconto della banca senza concorrenza perché non avevamo tempo per fare il giro. Con Edilizia in Cloud il dossier è pronto in 4 ore, lo mando a 3 banche in parallelo, e lo sconto medio è sceso dal 14% al 10,5%. Su 350k€ di crediti ceduti l'anno scorso = 12.000€ recuperati.",
  testimonialAuthor: "Federico M.",
  testimonialRole: "Mascagni Edilizia Srl, Firenze",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Il dossier cessione credito è davvero accettato dalle banche al primo invio?",
      a: "Sì, nel 95-100% dei casi. Il dossier include tutti gli elementi richiesti dalle banche partner (Intesa, UniCredit, BNL, Crédit Agricole, Poste, Banca IFIS): asseverazione tecnica abilitata, APE pre/post, computo metrico, fatture SDI con codice natura N6.7, bonifici parlanti, visto del commercialista. Format collaudato.",
    },
    {
      q: "Posso davvero far concorrere più banche sulla stessa cessione?",
      a: "Sì. Il dossier modulare si adatta in 30 minuti al format di ciascuna banca. Lo invii a 3-4 banche partner in parallelo, ricevi offerte di sconto diverse, scegli la migliore. Lo sconto medio scende dal 13-15% a 10-11% grazie alla concorrenza reale.",
    },
    {
      q: "Quanto tempo serve per sbloccare un anticipo SAL bancario?",
      a: "5-7 giorni lavorativi quando il dossier è completo al primo invio. Il sistema genera dossier con contratto appalto firmato eIDAS, SAL asseverato, ultimo bilancio, DURC live, fatturazione SDI. Banche partner abituate al format processano rapidamente.",
    },
    {
      q: "Il modulo si integra con il mio commercialista per il visto di conformità?",
      a: "Sì. Il commercialista ha accesso dedicato per apporre visto di conformità sui dossier cessione, archivio condiviso documenti, firma digitale eIDAS. Niente più scambi email, scansioni, visti smarriti. Tempi visto -70%.",
    },
    {
      q: "Cosa succede se l'Agenzia Entrate contesta una cessione?",
      a: "Tutti i documenti sono firmati digitalmente eIDAS, archiviati cloud certificato AgID, conservazione decennale a norma. In caso di controllo, esporti dossier completo in 5 minuti con codici natura corretti, bonifici parlanti tracciati, asseverazioni timbrate. Conformità garantita.",
    },
    {
      q: "Quanto costa? È compreso o è add-on?",
      a: "Il modulo Finanziamenti Cantieri è incluso nei piani Professional e Business. Numero di dossier illimitato, banche/factor partner illimitati, integrazione commercialista inclusa. ROI tipicamente alla prima cessione completata grazie al risparmio sullo sconto applicato.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "I finanziamenti vivono collegati a tutta la piattaforma.",
  internalLinksBody:
    "Il modulo Finanziamenti è alimentato da Cantieri, Fatturazione, Tesoreria, Firma Elettronica e Fotovoltaico. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/fotovoltaico",
      title: "Cantieri Fotovoltaico",
      text: "Cessione credito Superbonus 110% su impianti FV residenziali e industriali.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "SAL aperti alimentano richieste anticipo bancario con marginalità.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Fatture cantiere con codici natura N6.7 corretti per cessione credito.",
    },
    {
      to: "/funzionalita/tesoreria",
      title: "Tesoreria",
      text: "Cassa prevista da finanziamenti, cessioni in essere, anticipi SAL.",
    },
    {
      to: "/funzionalita/firma-elettronica",
      title: "Firma Elettronica",
      text: "Asseverazioni, visti, contratti banca firmati digitalmente eIDAS.",
    },
    {
      to: "/funzionalita/ritenute-garanzia",
      title: "Ritenute di Garanzia",
      text: "Anticipo SAL banche con cessione ritenute future come garanzia.",
    },
    {
      to: "/funzionalita/conserva-digitale",
      title: "Conservazione Digitale",
      text: "Archivio cloud decennale dossier finanziamento conforme AgID.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e Superbonus.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Modulo Finanziamenti incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di accettare il primo sconto della banca. Inizia a far concorrere chi vuole il tuo credito.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Finanziamenti Cantieri dentro la tua impresa: setup in 48 ore, dossier cessione/anticipo/factoring pronti in 1 giorno, banche partner integrate, comparatore offerte, conformità Agenzia Entrate garantita. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · Banche partner incluse · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Finanziamenti",
  stickyCtaMicrocopy: "Setup 48h · Dossier in 1 giorno",

  applicationSubCategory: "Construction Financing Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function FinanziamentiCantieri() {
  return <FunzionalitaPageTemplate config={config} />;
}
