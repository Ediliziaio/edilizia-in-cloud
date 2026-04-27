import {
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpen,
  Briefcase,
  Calculator,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  FileSpreadsheet,
  FileText,
  HardHat,
  Inbox,
  Landmark,
  Layers,
  Lock,
  PieChart,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "contabilita-fiscale",
  vertical: "Contabilità Fiscale",
  productName: "Modulo Contabilità Fiscale Edilizia in Cloud",
  audience:
    "Imprese edili in regime ordinario o semplificato, ristrutturatori, general contractor e artigiani edili che vogliono contabilità integrata con piano dei conti settoriale, ammortamenti automatici, bilancio CEE ed esportazione XBRL per il commercialista",
  audienceShort: "imprese edili e artigiani",

  seo: {
    title:
      "Contabilità Fiscale Edilizia — Piano dei Conti Settoriale, Bilancio CEE, XBRL | Edilizia in Cloud",
    description:
      "Contabilità ordinaria e semplificata per imprese edili: piano dei conti edilizia preconfigurato, ammortamenti automatici, bilancio CEE, esportazione XBRL per commercialista, integrazione SDI e cantieri.",
    keywords:
      "contabilità edilizia, software contabilità imprese edili, piano dei conti edilizia, bilancio CEE edilizia, XBRL edilizia, ammortamenti cantieri, contabilità ordinaria edilizia, contabilità semplificata edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/contabilita-fiscale-og.jpg",
  },

  heroBadge: "Funzionalità · Contabilità Fiscale",
  heroH1Lead: "Contabilità edilizia",
  heroH1Highlight: "in tempo reale",
  heroH1Tail: "non a fine anno",
  heroSubheadline:
    "Modulo contabilità ordinaria/semplificata con piano dei conti edilizia preconfigurato, ammortamenti automatici, scritture di assestamento, bilancio CEE, esportazione XBRL per il commercialista, integrazione fatture SDI e cantieri. Sai dove sei e dove andrai, non scopri il bilancio a giugno dell'anno dopo.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Piano conti edilizia preconfigurato",
    "Bilancio CEE in 1 click",
    "Esportazione XBRL commercialista",
  ],
  proofPoints: [
    "Ammortamenti automatici",
    "Integrazione SDI e cantieri",
    "Bilancio mensile in tempo reale",
  ],

  objectiveRow: [
    ["Obiettivo", "Avere contabilità aggiornata mensilmente, non a fine anno"],
    ["Momento chiave", "Quando il commercialista ti consegna il bilancio a giugno per l'anno prima"],
    ["Risultato", "Vedi marginalità mensile, decidi prima, paghi meno data entry"],
  ],

  betaH2:
    "Più di 270 imprese edili italiane gestiscono la contabilità fiscale con piano dei conti settoriale Edilizia in Cloud.",
  betaBody:
    "Il modulo Contabilità Fiscale è attivo in 48 ore: importiamo bilanci ultimi 3 anni, configuriamo piano dei conti edilizia (con conti dedicati per cantieri, subappalti, materiali edili, beni strumentali, ritenute di garanzia), agganciamo cassetto SDI per fatture, sincronizziamo cedolini paga e tesoreria. Quattro sessioni 1-a-1 con il nostro team contabile fino al primo bilancio mensile chiuso.",

  speedH2:
    "Il commercialista ti consegna il bilancio a giugno per dirti come è andato l'anno prima.",
  speedSubheadline:
    "Nelle imprese edili tradizionali la contabilità è 'fotografia ex post': il commercialista chiude i conti 6 mesi dopo, tu scopri marginalità e profittabilità quando ormai non puoi più cambiare nulla. Con il modulo contabile integrato vedi il bilancio in tempo reale, mese per mese, e decidi finché puoi correggere.",
  speedStats: [
    { value: 95, prefix: "+", suffix: "%", label: "movimenti generati automaticamente" },
    { value: 3, suffix: " min", label: "minuti risparmiati per movimento" },
    { value: 100, suffix: "%", label: "bilancio CEE conforme XBRL" },
  ],

  familyH2: "Contabilità connessa a SDI, cedolini, cantieri e tesoreria.",
  familySubheadline:
    "La contabilità è il cuore informativo dell'azienda: riceve fatture da SDI, costi del lavoro dai cedolini, marginalità dai cantieri, movimenti bancari dalla tesoreria. Tutto si parla, tutto è coerente, tutto è in tempo reale.",
  familyItems: [
    {
      icon: Inbox,
      title: "Cassetto SDI",
      text: "Fatture elettroniche generano scritture contabili automatiche con causali corrette.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: Receipt,
      title: "Registro IVA",
      text: "Liquidazioni IVA mensili/trimestrali alimentano scritture contabili e bilancio.",
      to: "/funzionalita/registro-iva",
    },
    {
      icon: Users,
      title: "Cedolini Paga",
      text: "Stipendi e oneri sociali generano scritture in prima nota automatiche.",
      to: "/funzionalita/cedolini-paga",
    },
    {
      icon: HardHat,
      title: "Margini Cantiere",
      text: "Costi e ricavi per cantiere tracciati per centro di costo nel piano dei conti.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Movimenti bancari riconciliati automaticamente con scritture contabili.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: BookOpen,
      title: "Prima Nota",
      text: "Tutte le registrazioni manuali e automatiche centralizzate in prima nota integrata.",
      to: "/funzionalita/prima-nota",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Bilancio mensile vivente, non solo annuale ex-post.",
  familyBonusText:
    "Quando una fattura SDI passiva arriva, genera scrittura contabile con causale 'Acquisto materiali edili - Cantiere Villa Rossi'. La scrittura aggiorna il piano dei conti, il bilancio CEE in tempo reale e la marginalità del cantiere Villa Rossi. Sei sempre in tempo per decidere, non solo per constatare.",

  painKicker: "Il problema vero",
  painH2: "Il commercialista ti chiede 'mi mandi i giustificativi?' e tu cerchi i PDF in 4 cloud.",
  painSubheadline:
    "Anche con SDI obbligatorio, la maggior parte delle imprese edili gestisce la contabilità in modalità 'invia tutto al commercialista che fa lui'. Risultato: il commercialista lavora 30 ore al mese di data entry, costa caro, consegna il bilancio mesi dopo, errori frequenti, marginalità invisibile finché non è tardi per correggere.",
  painPoints: [
    {
      icon: Clock,
      title: "Bilancio consegnato 6 mesi dopo",
      text: "Anno chiuso a dicembre, bilancio CEE consegnato a giugno-luglio. Scopri 7 mesi dopo che il margine 2024 era negativo, che 3 cantieri sono andati in perdita, che la tesoreria ha sofferto. Decisioni correttive impossibili.",
    },
    {
      icon: Database,
      title: "3 minuti per movimento contabile",
      text: "Commercialista riceve PDF, fa data entry, classifica conto, registra. Su 1.500 movimenti/anno (fatture, stipendi, F24, banca) sono 75 ore di lavoro a €40-120/h: €3.000-9.000/anno solo per la registrazione.",
    },
    {
      icon: FileSpreadsheet,
      title: "Piano dei conti generico, non edile",
      text: "Software contabile generalista usa piano conti standard. Manca dettaglio per subappalti, materiali edili, beni strumentali cantiere, ritenute di garanzia. Riclassificazioni manuali, errori, bilancio poco leggibile.",
    },
    {
      icon: AlertTriangle,
      title: "Ammortamenti calcolati a fine anno",
      text: "Beni strumentali (gru, betoniere, ponteggi, software) ammortizzati a posteriori dal commercialista. Margini intermedi sbagliati durante l'anno, decisioni di acquisto basate su dati incompleti.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa contabilità, stesso commercialista, stesse regole fiscali. Cambia il tempismo.",
  baSubheadline:
    "Non escludi il commercialista: gli togli la data entry meccanica e gli lasci la consulenza fiscale strategica. Tu vedi bilancio mensile in tempo reale, lui certifica e ottimizza. Pagamento più equo, valore più alto, stress più basso per tutti.",
  baAreas: [
    {
      title: "Registrazione movimento contabile",
      before:
        "Fattura SDI ricevuta, commercialista la apre, classifica, registra in piano conti generico. 3 minuti per movimento, su 1.500 movimenti/anno sono 75 ore di lavoro manuale.",
      after:
        "Fattura SDI legge causale dal codice ATECO fornitore, classifica automaticamente nel piano conti edilizia, registra scrittura, aggancia cantiere di riferimento se presente. 0 minuti.",
    },
    {
      title: "Bilancio mensile",
      before:
        "Mensilmente non hai bilancio. Vedi solo P&L grezzo da Excel del commercialista a richiesta. Bilancio CEE solo annuale, consegnato 6 mesi dopo. Cieco operativo per 18 mesi su 24.",
      after:
        "Bilancio CEE in tempo reale aggiornato a ogni scrittura. Conto economico, stato patrimoniale, flussi finanziari sempre disponibili. Marginalità per cantiere, per cliente, per mese.",
    },
    {
      title: "Ammortamenti beni strumentali",
      before:
        "Commercialista calcola ammortamenti a fine anno per dichiarazione redditi. Durante l'anno il margine intermedio non considera ammortamento gru, betoniera, software, leasing. Decisioni di investimento sbagliate.",
      after:
        "Ammortamenti calcolati automaticamente mese per mese su tabelle DM 31/12/1988 categoria edilizia. Margine mensile reale considera ammortamento, decisioni di investimento informate.",
    },
    {
      title: "Bilancio CEE per banca/finanziamenti",
      before:
        "Banca chiede bilancio aggiornato per pratica finanziamento. Commercialista impiega 2 settimane a chiudere bilancio infrannuale. Rischi di perdere finanziamento per ritardo documentazione.",
      after:
        "Apri il modulo, esporti bilancio CEE in PDF e XBRL al 31/05/2026. Tutto coerente, tutto firmato digitalmente. Banca riceve documentazione in 5 minuti, finanziamento approvato senza ritardi.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. Eventi → scritture automatiche → bilancio sempre aggiornato.",
  mechanismSubheadline:
    "Il modulo Contabilità Fiscale lavora a flusso: ogni evento aziendale (fattura, cedolino, F24, movimento bancario) genera scrittura contabile automatica con causale corretta. Tu controlli e firmi, il sistema registra e aggiorna il bilancio.",
  mechanismSteps: [
    {
      icon: Database,
      title: "Eventi aziendali generano scritture",
      text: "Fatture SDI, cedolini, F24, movimenti bancari, ammortamenti generano automaticamente scritture contabili con causali edilizia preconfigurate. Niente data entry manuale per il 95% dei movimenti.",
    },
    {
      icon: PieChart,
      title: "Piano dei conti edilizia attivo",
      text: "Conti dedicati per acquisti materiali edili, subappalti, beni strumentali cantiere, ritenute di garanzia, costo del lavoro CCNL Edilizia. Centro di costo per cantiere automatico.",
    },
    {
      icon: Send,
      title: "Bilancio CEE e XBRL in 1 click",
      text: "Bilancio CEE redatto secondo art. 2424-2425 c.c. con riclassificazioni automatiche, esportazione XBRL conforme tassonomia Banca d'Italia, deposito CCIAA semplificato.",
    },
  ],
  mechanismCta: "Apri il bilancio mensile in demo",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Contabilità integrata = -70% data entry + bilancio mensile + decisioni informate.",
  commercialBody:
    "Le imprese edili con il modulo contabile integrato vedono ridurre del 70% il tempo di data entry, hanno bilancio mensile sempre aggiornato e prendono decisioni operative basate su dati reali e non su intuizioni. Il commercialista resta come consulente fiscale strategico.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "-70% costo contabile",
      text: "Da 75 ore/anno di data entry a 20 ore di sola consulenza. Su parcella media €5.000/anno significa €3.500 risparmiati o riallocati su consulenza vera.",
    },
    {
      icon: BarChart3,
      title: "Bilancio mensile sempre aggiornato",
      text: "Conto economico, stato patrimoniale, flussi di cassa in tempo reale. Marginalità per cantiere, per cliente, per categoria. Decisioni operative su dati, non su intuizioni.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità fiscale automatica",
      text: "Piano conti edilizia conforme tassonomia XBRL, scritture di assestamento automatiche, ammortamenti su tabelle DM, bilancio CEE redatto secondo c.c. Niente errori formali.",
    },
    {
      icon: Sparkles,
      title: "Bilancio per banca in 5 minuti",
      text: "Quando serve bilancio infrannuale per pratica finanziamento, è già pronto in PDF e XBRL. Banca riceve documentazione coerente, finanziamenti approvati con tempi dimezzati.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente più 'aspetto il bilancio a giugno'. Lo vedi a fine mese.",
  resultsBody:
    "Quando la contabilità si alimenta dagli eventi aziendali in tempo reale, il bilancio mensile diventa la norma, le decisioni di investimento si basano su dati reali, e il commercialista smette di essere registratore meccanico per tornare a essere consulente fiscale di valore.",
  integrationPillars: [
    {
      icon: Layers,
      title: "Piano dei conti edilizia",
      text: "Conti dedicati per materiali edili, subappalti, beni strumentali cantiere (gru, betoniere, ponteggi), ritenute di garanzia 0,5%, costi CCNL Edilizia, IVA reverse charge.",
    },
    {
      icon: Calculator,
      title: "Ammortamenti automatici",
      text: "Tabelle DM 31/12/1988 categoria 'Costruzioni' precaricate. Calcolo automatico per gru (10%), betoniere (15%), ponteggi (15%), automezzi (20%), software (33%), beni minore valore.",
    },
    {
      icon: Briefcase,
      title: "Bilancio CEE e nota integrativa",
      text: "Bilancio redatto secondo art. 2424-2425 c.c., schema CEE, nota integrativa con commenti automatici su voci principali, rendiconto finanziario art. 2425-ter.",
    },
    {
      icon: Send,
      title: "Esportazione XBRL e deposito CCIAA",
      text: "Tassonomia XBRL Banca d'Italia conforme, esportazione automatica per deposito CCIAA, supporto formato AdE per bilanci semplificati e consolidati.",
    },
  ],
  resultStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo data entry contabile commercialista" },
    { value: 3, suffix: " min", label: "minuti risparmiati per movimento" },
    { value: 100, suffix: "%", label: "bilancio CEE conforme XBRL" },
  ],
  resultsCta: "Apri il modulo contabilità fiscale",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto risparmi se 95 movimenti su 100 si registrano da soli?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di movimenti contabili mensili e costo orario commercialista. La stima parte da 3 minuti per movimento risparmiati grazie all'automazione delle scritture da SDI, cedolini e tesoreria.",
  roi: {
    input1Label: "Movimenti contabili al mese",
    input1Default: 200,
    input1Min: 50,
    input1Max: 5000,
    input1Step: 25,
    input2Label: "Costo orario commercialista (€)",
    input2Default: 60,
    input2Min: 40,
    input2Max: 120,
    input2Step: 5,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.05 * b),
    computeSecondary: (a, b) => [
      { label: "Ore commercialista recuperate/anno", value: `${Math.round(a * 12 * 0.05)} h` },
      { label: "Movimenti automatici/anno", value: `${a * 12}` },
      { label: "Bilanci infrannuali extra/anno", value: "12" },
    ],
    closingPitch:
      "Stima prudenziale basata su 3 minuti per movimento risparmiati. Aggiungi i bilanci mensili che oggi non hai, le decisioni informate sui cantieri e i finanziamenti approvati senza ritardi documentali.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un software contabile generico. Un modulo per la fiscalità edile italiana.",
  salesBody:
    "I gestionali contabili generalisti ignorano le specificità edili (subappalti reverse charge, ritenute garanzia, ammortamenti gru e ponteggi). Il modulo Contabilità Fiscale di Edilizia in Cloud nasce con il piano dei conti del settore costruzioni preconfigurato.",
  salesImpact: [
    {
      title: "Bilancio sempre fresco",
      text: "Non più foto annuale ex-post: bilancio CEE aggiornato a ogni scrittura, marginalità mensile, flussi di cassa previsionali. Operatività informata in tempo reale.",
    },
    {
      title: "Costo contabile dimezzato",
      text: "Commercialista riallocato da data entry meccanica a consulenza strategica. Stessa parcella, più valore aggiunto, oppure parcella più bassa per gli stessi servizi.",
    },
    {
      title: "Documentazione bancaria pronta",
      text: "Bilanci infrannuali su richiesta in 5 minuti, esportazione XBRL conforme. Pratiche di finanziamento e affidamenti approvati con tempi dimezzati.",
    },
    {
      title: "Decisioni di investimento informate",
      text: "Ammortamenti calcolati mensilmente, marginalità reale per cantiere, ROI delle commesse visibile prima della chiusura. Investi in modo informato, non al buio.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Piano dei conti edilizia preconfigurato",
      value: "Conti dedicati per materiali edili, subappalti, beni strumentali cantiere, ritenute di garanzia, oneri CCNL Edilizia. Personalizzabile per le specificità della tua azienda.",
    },
    {
      label: "Scritture automatiche da SDI e cedolini",
      value: "95% dei movimenti generato automaticamente: fatture passive/attive, stipendi, oneri sociali, F24, ammortamenti. Tu intervieni solo sulle eccezioni e le rettifiche.",
    },
    {
      label: "Ammortamenti DM 31/12/1988",
      value: "Tabelle ammortamento categoria 'Costruzioni' precaricate. Calcolo automatico mensile, prospetto cespiti aggiornato, registro beni ammortizzabili sempre conforme.",
    },
    {
      label: "Bilancio CEE in tempo reale",
      value: "Stato patrimoniale, conto economico, rendiconto finanziario aggiornati a ogni scrittura. Riclassificazioni automatiche secondo art. 2424-2425 c.c.",
    },
    {
      label: "Esportazione XBRL e deposito CCIAA",
      value: "Tassonomia Banca d'Italia conforme, esportazione XBRL pronta per deposito CCIAA, supporto formati bilanci semplificati e consolidati.",
    },
    {
      label: "Centro di costo per cantiere",
      value: "Ogni scrittura attribuibile a un cantiere/cliente. Marginalità reale per cantiere disponibile in tempo reale, conto economico per centro di costo.",
    },
    {
      label: "Accesso commercialista come collaboratore",
      value: "Commercialista accede al gestionale con permessi dedicati, controlla, firma, esporta. Niente più 'mandami i giustificativi', tutto in un'unica fonte di verità.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Contabilità Fiscale cambia le decisioni.",
  scenarios: [
    {
      title: "Cantiere in perdita scoperto a marzo",
      text: "A fine marzo guardi marginalità per cantiere: il cantiere Villa Bianchi sta chiudendo a -8%. Indaghi: subappalto idraulico ha sforato 12.000€. Rinegoziazione subappalto, recupero 4.000€, perdita ridotta a -2%. Decisione presa in tempo, non a giugno.",
    },
    {
      title: "Pratica finanziamento a 7 giorni",
      text: "Banca chiede bilancio infrannuale al 31/03 per pratica fido 200.000€. Apri il modulo, esporti bilancio CEE in PDF firmato + XBRL. Documentazione consegnata in 30 minuti. Fido approvato in 7 giorni invece dei 30 standard.",
    },
    {
      title: "Acquisto gru nuova: ROI vero",
      text: "Stai valutando acquisto gru 80.000€. Modulo mostra ammortamento 10% (8.000€/anno), costo orario gru attuale (€85/h), risparmio noleggio (-€60.000/anno). ROI reale 2,3 anni, decidi con dati certi.",
    },
  ],

  testimonialQuote:
    "Avevo il bilancio una volta all'anno a giugno per dirmi come era andato l'anno prima. Ora ho il bilancio CEE aggiornato a ogni movimento, vedo la marginalità di ogni cantiere mese per mese e quando la banca mi chiede documenti li ho pronti in 5 minuti. Il mio commercialista ha smesso di registrare e ha iniziato a consigliarmi: oggi vale i suoi soldi.",
  testimonialAuthor: "Roberto C.",
  testimonialRole: "Costruzioni C. SpA, Brescia",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare alla contabilità integrata.",
  faqs: [
    {
      q: "Funziona sia in regime ordinario che semplificato?",
      a: "Sì. Il modulo supporta contabilità ordinaria (con stato patrimoniale completo) e semplificata per ditte individuali e snc sotto soglia. Cambio regime gestito automaticamente, scritture di assestamento differenziate, bilancio CEE solo per società di capitali.",
    },
    {
      q: "Il piano dei conti è davvero specifico per l'edilizia?",
      a: "Sì. Conti dedicati per acquisti materiali edili (cemento, ferro, laterizi, impianti), subappalti suddivisi per categoria (impiantisti, finiture, strutture), beni strumentali cantiere (gru, betoniere, ponteggi), ritenute di garanzia 0,5%, costi CCNL Edilizia separati per livello.",
    },
    {
      q: "Posso continuare con il mio commercialista di fiducia?",
      a: "Sì. Il commercialista accede al gestionale come collaboratore con permessi dedicati: legge tutte le scritture, modifica/integra dove serve, certifica il bilancio, esporta XBRL per deposito CCIAA. Resta consulente fiscale strategico, libero dalla data entry meccanica.",
    },
    {
      q: "Come gestisce gli ammortamenti dei beni strumentali edilizia?",
      a: "Tabelle DM 31/12/1988 per la categoria 'Costruzioni' precaricate: gru e autogrù 10%, betoniere e impianti cantiere 15%, ponteggi e casseforme 15%, automezzi 20%, software 33%, beni minore valore 100% deducibili. Calcolo mensile, registro cespiti aggiornato, prospetto fiscale automatico.",
    },
    {
      q: "Il bilancio CEE è davvero pronto per il deposito CCIAA?",
      a: "Sì. Bilancio CEE redatto secondo art. 2424-2425 c.c. con schema completo, nota integrativa generata con commenti automatici su voci principali, rendiconto finanziario art. 2425-ter, esportazione XBRL conforme tassonomia Banca d'Italia per deposito CCIAA.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di movimenti?",
      a: "Il modulo Contabilità Fiscale è incluso nel piano Business di Edilizia in Cloud con movimenti illimitati, accesso commercialista incluso, esportazione XBRL inclusa. Setup in 48 ore con import storico 3 anni, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Contabilità Fiscale è il cuore informativo dell'azienda edile.",
  internalLinksBody:
    "Il modulo collega SDI, cedolini, cantieri, tesoreria e prima nota in un unico sistema contabile coerente e in tempo reale.",
  internalLinks: [
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto SDI", text: "Fatture SDI generano scritture contabili automatiche." },
    { to: "/funzionalita/registro-iva", title: "Registro IVA", text: "Liquidazioni IVA alimentano scritture e bilancio." },
    { to: "/funzionalita/cedolini-paga", title: "Cedolini Paga", text: "Stipendi e oneri sociali in prima nota automatici." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costi/ricavi per cantiere come centro di costo." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Movimenti bancari riconciliati con scritture contabili." },
    { to: "/funzionalita/prima-nota", title: "Prima Nota", text: "Tutte le registrazioni centralizzate in un unico modulo." },
    { to: "/funzionalita/conserva-digitale", title: "Conservazione Digitale", text: "Bilanci e libri contabili a norma CAD per 10 anni." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Contabilità Fiscale inclusa nel piano Business." },
  ],

  finalCtaH2: "Smetti di aspettare il bilancio a giugno. Inizia a vedere la marginalità a fine mese.",
  finalCtaBody:
    "31 giorni gratuiti per portare la contabilità edilizia in tempo reale. Piano dei conti settoriale, ammortamenti automatici, bilancio CEE, esportazione XBRL, accesso commercialista. Onboarding 1-a-1 con import storico 3 anni, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Piano conti edilizia · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Contabilità Fiscale",
  stickyCtaMicrocopy: "Setup 48h · Bilancio mensile",

  applicationSubCategory: "Construction Accounting Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function ContabilitaFiscale() {
  return <FunzionalitaPageTemplate config={config} />;
}
