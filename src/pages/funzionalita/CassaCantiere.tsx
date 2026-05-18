import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building,
  Calendar,
  ClipboardList,
  Database,
  HardHat,
  LineChart,
  PiggyBank,
  Receipt,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "cassa-cantiere",
  vertical: "Previsionale di Cassa",
  productName: "Modulo Cassa & Cash Flow Edilizia in Cloud",
  audience: "Imprese edili strutturate, general contractor, controller finanziari, CFO PMI edili, titolari che vogliono prevedere la liquidità",
  audienceShort: "imprese edili strutturate",

  seo: {
    title:
      "Previsionale di Cassa Edilizia",
    description:
      "Previsionale di cassa per impresa edile a 30/60/90 giorni: incassi previsti, pagamenti programmati, fatturato in arrivo, scadenze fornitori.",
    keywords:
      "previsionale di cassa edilizia, cash flow forecast impresa edile, software tesoreria edilizia, gestione liquidità cantiere, cash flow cantieri, software finanziario imprese edili, riconciliazione bancaria edilizia, scadenzario impresa edile",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Previsionale di Cassa",
  heroH1Lead: "Vedi la cassa dei prossimi 90 giorni",
  heroH1Highlight: "prima che diventi un problema",
  heroSubheadline:
    "Previsionale di cassa a 30/60/90 giorni che incrocia incassi previsti dai SAL, pagamenti programmati ai fornitori, scadenze busta paga, ritenute IVA e finanziamenti. Sai oggi se a fine mese sarai in scoperto, hai 60 giorni per intervenire — non 5.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Riconciliazione bancaria automatica", "Alert push su scoperti previsti"],
  proofPoints: [
    "Incassi previsti dai SAL firmati",
    "Pagamenti fornitori programmati",
    "Riconciliazione PSD2 con la banca",
  ],

  objectiveRow: [
    ["Obiettivo", "Sapere oggi se a 60 giorni sarai in scoperto"],
    ["Momento chiave", "Inizio mese, prima di firmare un nuovo SAL passivo"],
    ["Risultato", "Niente più scoperti a sorpresa, decisioni di cassa basate su dati"],
  ],

  betaH2: "Più di 320 imprese italiane usano Edilizia in Cloud per pianificare la cassa con anticipo.",
  betaBody:
    "Il modulo Cassa & Cash Flow è il pannello finanziario della tua impresa edile: lo attiviamo in 48 ore, importiamo i tuoi conti correnti via API PSD2 (UniCredit, Intesa Sanpaolo, BPER, BPM, Banco Desio, Crédit Agricole, Banca Popolare di Sondrio e oltre 30 banche italiane), riconciliamo automaticamente i movimenti con scadenzario e fatture, ti mostriamo cassa attesa a 30/60/90 giorni dal giorno 1.",

  speedH2: "Il previsionale di cassa edile non è un Excel del commercialista. È un sistema vivo che ti avvisa prima dello scoperto.",
  speedSubheadline:
    "Le imprese edili italiane vivono tra anticipi, SAL, ritenute di garanzia (5%), pagamenti fornitori a 30/60/90 e busta paga del 27. Senza un previsionale strutturato, la cassa si scopre il giorno dopo aver già emesso la disposizione. Edilizia in Cloud te la mostra prima.",
  speedStats: [
    { value: 90, suffix: " gg", label: "di orizzonte previsionale di cassa rolling" },
    { value: 70, prefix: "-", suffix: "%", label: "tempo dedicato alla riconciliazione bancaria" },
    { value: 95, prefix: "+", suffix: "%", label: "accuratezza forecast a 30 giorni nei nostri clienti" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata alla cassa.",
  familySubheadline:
    "La cassa non è un foglio Excel dell'amministrazione: è il riflesso reale di SAL emessi, fatture ricevute, busta paga del personale, ritenute subappaltatori. Edilizia in Cloud collega tutto, così il previsionale è già il tuo dato operativo, non una stima.",
  familyItems: [
    {
      icon: Wallet,
      title: "Cassa & Cash Flow",
      text: "Previsionale a 30/60/90 giorni, riconciliazione bancaria PSD2, alert push su scoperti previsti.",
      to: "/funzionalita/cassa-cantiere",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori e SAL emessi che alimentano direttamente il forecast incassi.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture attive e passive che entrano nel previsionale il giorno dell'invio o ricezione SDI.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Preventivi accettati che diventano commesse e popolano il piano incassi futuro.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Pagamenti SAL subappalto, ritenute 4% INPS, scadenze DURC nel forecast pagamenti.",
      to: "/funzionalita/gestione-subappalti",
    },
    {
      icon: Users,
      title: "HR e Personale",
      text: "Costo busta paga del 27 e contributi INPS calcolati nel forecast pagamenti mensili.",
      to: "/funzionalita/hr-personale",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Una sola cassa. Sei moduli che la alimentano in tempo reale.",
  familyBonusText:
    "Quando un SAL viene firmato, il forecast incassi si aggiorna. Quando arriva una fattura passiva via SDI, il forecast pagamenti si aggiorna. Quando timbri una busta paga, l'uscita del 27 viene anticipata. Niente Excel intermedi, niente forecast del lunedì basato su dati di venerdì scorso.",

  painKicker: "Il problema vero",
  painH2: "L'impresa edile fallisce per cassa, non per fatturato.",
  painSubheadline:
    "Il 70% dei fallimenti delle PMI edili italiane non avviene per perdita di redditività ma per crisi di liquidità: fatturato alto, marginalità positiva, ma incassi che arrivano dopo i pagamenti. Senza previsionale, lo scopri il giorno in cui la banca rifiuta un bonifico.",
  painPoints: [
    {
      icon: TrendingDown,
      title: "Scoperti bancari scoperti il giorno dopo",
      text: "Banca chiama, scopri di essere a 8.000€ di scoperto. Il SAL al cliente l'avevi messo in conto per il 15, è arrivato il 28. Il bonifico al fornitore l'avevi disposto per il 20. Tre settimane di interessi passivi sull'ottimismo.",
    },
    {
      icon: Calendar,
      title: "Pagamenti fornitori 'a memoria'",
      text: "Hai 12 fornitori con scadenze diverse (30/60/90 giorni dalla fattura), 4 finanziamenti in ammortamento, 3 contratti di leasing. Tenere a mente tutte le scadenze è impossibile. Una saltata = sospensione fornitura.",
    },
    {
      icon: Timer,
      title: "Riconciliazione bancaria a fine mese",
      text: "L'amministrazione passa 2 giorni al mese a riconciliare estratto conto e prima nota. Movimenti dimenticati, bonifici non riconciliati, IBAN sbagliati. La verità della cassa la sa solo l'estratto conto, mai il gestionale.",
    },
    {
      icon: AlertTriangle,
      title: "Decisioni commerciali senza base finanziaria",
      text: "Accetti un cantiere da 200.000€ senza sapere se hai la cassa per pagare manodopera e materiali nei 4 mesi necessari. Risultato: anticipi richiesti al cliente in modo aggressivo, trattativa persa, oppure cantiere preso e cassa in crisi.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi clienti, stessi fornitori, stessi tempi di pagamento. Cambia la visibilità.",
  baSubheadline:
    "Non promettiamo di ridurre i giorni di pagamento dei tuoi clienti né di allungare quelli dei fornitori: promettiamo di darti visibilità prima dello scoperto, così puoi rinegoziare scadenze, anticipare fatture o prendere un fido senza panico.",
  baAreas: [
    {
      title: "Forecast incassi",
      before:
        "Excel manuale aggiornato a fine mese, basato sui SAL emessi e su una stima 'a sentimento' dei tempi di pagamento dei clienti. Margine di errore ±25%, inutile per decisioni operative.",
      after:
        "Forecast automatico basato su SAL firmati con data di pagamento contrattuale, fatture emesse via SDI e storico effettivo dei tempi di incasso per cliente. Margine di errore ±5% a 30 giorni.",
    },
    {
      title: "Forecast pagamenti",
      before:
        "Scadenzario fornitori su Excel, busta paga del 27 ricordata 'a memoria', F24 ritenute calcolato dal commercialista 3 giorni prima, leasing dimenticati. Outflow scoperto a sorpresa.",
      after:
        "Forecast pagamenti aggregato: fatture passive (DDT importati e fatture SDI ricevute), busta paga e contributi, F24 ritenute 4% subappalto, rate finanziamenti. Tutto pianificato sui giorni esatti.",
    },
    {
      title: "Riconciliazione bancaria",
      before:
        "Estratto conto scaricato in PDF a fine mese, riconciliato manualmente in Excel, 2 giorni di lavoro per amministrazione. Movimenti vecchi di 30 giorni quando si scopre un errore.",
      after:
        "API PSD2 collegate ai conti correnti: movimenti importati ogni notte, riconciliazione automatica con scadenzario e fatture, anomalie evidenziate in dashboard il giorno stesso.",
    },
    {
      title: "Decisioni commerciali",
      before:
        "Accetti il cantiere se ti piace il cliente, valuti la fattibilità di cassa dopo 30 giorni quando ormai hai firmato il contratto. Spesso la cassa dice no quando il contratto dice sì.",
      after:
        "Apri il forecast prima di firmare: se a 90 giorni sarai a -15.000€, sai che devi chiedere più anticipo o anticipare un SAL su un altro cantiere. Decisione informata, non speranzosa.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, niente Excel finanziari, niente fogli del commercialista.",
  mechanismSubheadline:
    "Il modulo Cassa è progettato per essere acceso e dimenticato: una volta collegate le banche e attivato lo scadenzario, il previsionale si aggiorna da solo ogni notte. Tu apri la dashboard e vedi la cassa rolling.",
  mechanismSteps: [
    {
      icon: Database,
      title: "Colleghi i conti correnti via PSD2",
      text: "Connessione a UniCredit, Intesa Sanpaolo, BPER, BPM, Banco Desio, Crédit Agricole, BPS e oltre 30 banche italiane. Movimenti importati automaticamente ogni notte, sicurezza bancaria PSD2 certificata.",
    },
    {
      icon: LineChart,
      title: "Il forecast si compone in automatico",
      text: "Fatture attive emesse + SAL firmati = incassi previsti. Fatture passive ricevute + scadenzario + busta paga + F24 = pagamenti previsti. Storico tempi di pagamento per cliente affina la stima.",
    },
    {
      icon: Bell,
      title: "Alert push prima dello scoperto",
      text: "Il sistema simula la cassa rolling 90 giorni e ti avvisa 30 giorni prima se sarai in scoperto. Hai tempo per rinegoziare scadenze, anticipare un SAL, attivare un fido, fare valutazioni di anticipo fattura.",
    },
  ],
  mechanismCta: "Prova il previsionale gratis sui tuoi conti",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Un mese senza scoperto bancario vale molto più di un anno di abbonamento.",
  commercialBody:
    "Le imprese edili italiane sostengono in media 8.000-15.000€ di interessi passivi annui per scoperti evitabili e ritardi di pagamento causati da fornitori sospesi. Edilizia in Cloud ti dà 60-90 giorni di anticipo per evitarli, mentre il commercialista te li scopre quando sono già maturati.",
  commercialLevers: [
    {
      icon: Target,
      title: "Anticipi di 60-90 giorni sulle decisioni di cassa",
      text: "Quando vedi lo scoperto in arrivo a 60 giorni, hai tempo per anticipare un SAL, chiedere un acconto al cliente, attivare un fido a condizioni umane. Non sono soluzioni a freddo del giorno dopo.",
    },
    {
      icon: Bell,
      title: "Alert push su scoperti previsti",
      text: "Notifica push quando il forecast prevede scoperto a 30/60/90 giorni. Notifica push quando una rata finanziamento scade in 7 giorni. Niente più scadenze 'dimenticate'.",
    },
    {
      icon: PiggyBank,
      title: "Anticipo fatture e factoring più conveniente",
      text: "Quando devi anticipare una fattura, mostri alla banca/factor un previsionale strutturato e storico tempi pagamento del cliente. Tassi più bassi, decisioni più rapide.",
    },
    {
      icon: TrendingUp,
      title: "Crescita commerciale sostenibile",
      text: "Quando aggiungi un cantiere da 300.000€ con pagamenti a 90 giorni, sai prima se la cassa lo regge. Niente più cantieri 'belli' presi che diventano poi cantieri 'ansiogeni'.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "La cassa smette di essere una fotografia mensile. Diventa un forecast vivo.",
  resultsBody:
    "Quando il previsionale è collegato a SAL, fatture, busta paga e banca, smetti di prendere decisioni di cassa al buio. Il commercialista riceve dati strutturati, la banca ti vede come impresa controllata, i fornitori sanno che paghi puntuale. Tutta la reputazione finanziaria cambia.",
  integrationPillars: [
    {
      icon: LineChart,
      title: "Cash flow rolling 90 giorni",
      text: "Forecast incassi - pagamenti = saldo previsto giorno per giorno. Visualizzazione a calendario o grafico. Filtri per conto corrente, per categoria di flusso, per cantiere.",
    },
    {
      icon: Building,
      title: "Riconciliazione bancaria PSD2",
      text: "Connessione diretta a 30+ banche italiane via API PSD2 certificata. Movimenti importati automaticamente, riconciliazione con scadenzario e fatture, anomalie segnalate.",
    },
    {
      icon: BarChart3,
      title: "Storico tempi pagamento per cliente",
      text: "Tempo medio reale di incasso per cliente, basato su storico fatture saldate. Forecast incassi affinato sui dati veri, non sulle promesse contrattuali.",
    },
    {
      icon: Bell,
      title: "Alert su scoperti, rate, scadenze fornitori",
      text: "Notifica push quando il forecast prevede scoperto, quando una rata finanziamento scade, quando una fattura fornitore ha 7 giorni alla scadenza. Tu non dimentichi nulla.",
    },
  ],
  resultStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo dedicato alla riconciliazione bancaria" },
    { value: 8000, suffix: " €", label: "interessi passivi medi evitati nel primo anno" },
    { value: 95, prefix: "+", suffix: "%", label: "accuratezza forecast a 30 giorni" },
  ],
  resultsCta: "Apri la tua dashboard cassa di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto ti costa lo scoperto bancario che potresti evitare?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: scoperto medio mensile e tasso di interesse applicato dalla banca. La stima del risparmio parte dall'eliminazione del 70% degli scoperti evitabili (causati da mancanza di visibilità) osservata nei nostri clienti.",
  roi: {
    input1Label: "Scoperto medio mensile attuale (€)",
    input1Default: 12000,
    input1Min: 0,
    input1Max: 200000,
    input1Step: 500,
    input1Suffix: " €",
    input2Label: "Tasso interesse passivo (%)",
    input2Default: 9,
    input2Min: 3,
    input2Max: 20,
    input2Step: 0.5,
    input2Suffix: "%",
    outputLabel: "Risparmio interessi passivi/anno",
    computeOutput: (a, b) => Math.round(a * (b / 100) * 0.7),
    computeSecondary: (a, b) => [
      { label: "Interessi passivi attuali/anno", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(a * (b / 100))) },
      { label: "Riduzione attesa scoperti", value: "70%" },
      { label: "Ore amministrative risparmiate/anno", value: "~120 h" },
    ],
    closingPitch:
      "Stima prudenziale basata sulla riduzione del 70% degli scoperti evitabili. Aggiungi i costi indiretti (commissioni, valuta, sospensioni fornitura) e l'abbonamento si ripaga nelle prime 4 settimane.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un altro report del commercialista. Un cruscotto che fa decidere meglio.",
  salesBody:
    "Il previsionale di cassa non è un esercizio contabile: è un sistema operativo che cambia il modo in cui guidi l'impresa. Le 4 dimensioni che cambiano subito quando la cassa è sempre lì, viva, davanti agli occhi.",
  salesImpact: [
    {
      title: "Trattative commerciali più solide",
      text: "Sai quanto puoi concedere come dilazione al cliente senza mettere in crisi la cassa. Le trattative finali non si chiudono più con dilazioni 'a sentimento' che poi pesano.",
    },
    {
      title: "Conversazioni con la banca più professionali",
      text: "Quando chiedi un fido o un anticipo fattura, mostri un forecast strutturato e storico saldi. La banca decide più in fretta, a tassi migliori, con meno garanzie aggiuntive.",
    },
    {
      title: "Fornitori più disposti a darti tempo",
      text: "Quando devi rinegoziare una scadenza, lo fai con 60 giorni di anticipo basandoti su un forecast — non con una telefonata di emergenza il giorno della scadenza. I fornitori dicono di sì, perché sai cosa stai facendo.",
    },
    {
      title: "Notti più tranquille",
      text: "Niente più sveglie alle 3 di notte a chiederti se domani il bonifico fornitore passa. La cassa dei prossimi 90 giorni la sai e quindi puoi dormire.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Cash flow rolling a 30/60/90 giorni",
      value:
        "Visualizzazione giorno per giorno di incassi previsti, pagamenti previsti, saldo previsto. Grafico, calendario e tabella esportabili. Filtri per conto corrente e per cantiere.",
    },
    {
      label: "Riconciliazione bancaria PSD2",
      value:
        "Connessione API PSD2 a 30+ banche italiane (UniCredit, Intesa Sanpaolo, BPER, BPM, BPS, Crédit Agricole, Banco Desio e altri). Movimenti importati ogni notte, riconciliazione automatica.",
    },
    {
      label: "Forecast pagamenti automatico",
      value:
        "Aggrega fatture passive ricevute via SDI, scadenzario fornitori, busta paga e contributi, F24 ritenute 4% subappalto, rate finanziamenti e leasing. Tutto su scadenze esatte.",
    },
    {
      label: "Forecast incassi affinato sullo storico",
      value:
        "Tempi medi reali di incasso per cliente basati su storico fatture saldate. Il forecast cliente A (puntuale) e cliente B (in ritardo cronico) considera la differenza.",
    },
    {
      label: "Alert push su scoperti previsti",
      value:
        "Notifica push e email quando il forecast prevede scoperto a 30/60/90 giorni. Notifica push quando una rata finanziamento o leasing è in scadenza in 7 giorni.",
    },
    {
      label: "Scadenzario fornitori e clienti",
      value:
        "Lista interattiva di fatture in scadenza, raggruppabili per data, per fornitore, per cantiere. Possibilità di marcare 'pagamento confermato', 'in ritardo', 'rinegoziato'.",
    },
    {
      label: "Export per commercialista e banca",
      value:
        "Esporta forecast in Excel/PDF firmato per banca o commercialista. Tracciato bancario standard CBI per home banking. Riconciliazione automatica con prima nota.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud ti salva il bilancio finanziario.",
  scenarios: [
    {
      title: "Scoperto previsto tra 45 giorni",
      text:
        "Apri la dashboard lunedì mattina: il forecast prevede scoperto di -22.000€ il 15 del mese prossimo. Hai 6 settimane per agire: chiami il cliente del cantiere Rossi per anticipare un SAL, posticipi 2 fatture fornitore di 15 giorni, attivi un anticipo fattura su un cliente puntuale. Crisi evitata.",
    },
    {
      title: "Decisione su un nuovo cantiere da 400.000€",
      text:
        "Cliente offre cantiere da 400.000€ con pagamento a 60 giorni e SAL ogni 30. Apri il forecast simulato includendo il nuovo cantiere: scoperto previsto di -45.000€ a 90 giorni. Decidi di accettare con anticipo del 25% — cliente accetta, cassa salvata.",
    },
    {
      title: "Richiesta fido in banca",
      text:
        "Vai in banca per chiedere un aumento del fido di 50.000€. Mostri il forecast cassa rolling 12 mesi, tempi medi di incasso clienti, storico marginalità. La banca approva in una settimana invece di un mese, con tasso più basso del 1,5%.",
    },
  ],

  testimonialQuote:
    "Avevo 4 cantieri attivi e la cassa era una preoccupazione costante. Adesso vedo la cassa dei prossimi 90 giorni ogni mattina con il caffè. Non ho più chiamate dalla banca per scoperti improvvisi e la mia commercialista mi dice che siamo l'azienda più ordinata che gestisce.",
  testimonialAuthor: "Giulia M.",
  testimonialRole: "Edilizia Moderna SRL, Torino",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "La connessione PSD2 con la banca è sicura?",
      a: "Sì. Edilizia in Cloud usa API PSD2 certificate dalla Banca d'Italia (provider AISP autorizzato). I dati di accesso non vengono memorizzati: ci colleghiamo solo per leggere movimenti, non per disporre bonifici. Connessione cifrata end-to-end conforme allo standard PSD2 e GDPR.",
    },
    {
      q: "Quali banche italiane sono supportate?",
      a: "Oltre 30 banche italiane: UniCredit, Intesa Sanpaolo, BPER, BPM, Banco BPM, Banca Popolare di Sondrio, Banco Desio, Crédit Agricole, BNL, Mediolanum, Cassa di Risparmio di Asti, Banca Sella, Banca Monte dei Paschi di Siena, FinecoBank e altre. Se la tua banca non è supportata, possiamo lavorare con import CSV/Excel.",
    },
    {
      q: "Il forecast è affidabile o è solo una stima?",
      a: "Il forecast a 30 giorni è accurato al 95% nei nostri clienti, perché si basa su SAL firmati e fatture emesse via SDI con scadenze contrattuali esatte. Il forecast a 60-90 giorni ha accuratezza ±10%, sufficiente per decisioni operative. La variabilità principale resta nei tempi reali di pagamento dei clienti.",
    },
    {
      q: "Si integra con il mio software contabile?",
      a: "Sì. Esportiamo forecast e movimenti riconciliati in tracciati nativi per TeamSystem, Zucchetti, Datev e altri sistemi. Per il commercialista forniamo prima nota già strutturata e movimenti bancari riconciliati con scadenzario.",
    },
    {
      q: "Posso usarlo per gestire più conti correnti contemporaneamente?",
      a: "Sì. Il forecast aggrega tutti i conti correnti aziendali e mostra anche un saldo consolidato. Puoi filtrare per singolo conto, per gruppo di conti (es. 'operativi' vs 'investimenti'), per valuta. Supporto per conti in EUR e in altre valute principali.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo Cassa & Cash Flow è incluso nei piani Professional e Business di Edilizia in Cloud. Nessun costo di attivazione, nessun vincolo di durata, cancelli quando vuoi. Onboarding 1-a-1, configurazione PSD2 e supporto italiano sempre inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La cassa vive collegata a tutto il resto. Ecco come.",
  internalLinksBody:
    "Il previsionale di cassa è il pannello finanziario, ma vive grazie ai dati che entrano da SAL, fatture, busta paga, subappalti. Ecco i moduli e le pagine collegate.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Avanzamento lavori e SAL emessi che alimentano il forecast incassi." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica SDI", text: "Fatture attive e passive che entrano nel forecast il giorno SDI." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Pagamenti da fare e da ricevere, alert automatici prima della scadenza." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Riconciliazione bancaria PSD2 e gestione conti correnti aziendali." },
    { to: "/funzionalita/prima-nota", title: "Prima Nota", text: "Registro contabile con riconciliazione automatica dei movimenti bancari." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Margine reale per commessa che alimenta forecast e decisioni." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Pagamenti SAL subappalto e ritenute 4% nel forecast pagamenti." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Modulo Cassa incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di scoprire gli scoperti il giorno dopo. Inizia a vederli con 60 giorni di anticipo.",
  finalCtaBody:
    "31 giorni gratuiti per portare Edilizia in Cloud nel controllo della tua cassa. Setup in 48 ore, connessione PSD2 alle banche, riconciliazione automatica e alert push inclusi. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · PSD2 sicuro · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Cassa Cantiere",
  stickyCtaMicrocopy: "Setup 48h · Forecast 90gg",

  applicationSubCategory: "Construction Cash Flow Management Software",

  relatedBlogSlugs: ["controllo-costi-cantiere-guida", "alternativa-excel-cantieri", "sal-cantiere-come-funziona"],
};

export default function CassaCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
