import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Clock,
  FileSignature,
  Filter,
  HardHat,
  Kanban,
  LineChart,
  PieChart,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "pipeline-vendite",
  definizione:
    "Pipeline Vendite di Edilizia in Cloud è la pipeline dei preventivi a colonne trascinabili per imprese edili: lead, sopralluogo, preventivo inviato, trattativa, firmato o perso, con previsione di cassa basata sulle trattative aperte e tasso di conversione per fase.",
  vertical: "Pipeline Vendite",
  productName: "Pipeline Vendite Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che gestiscono 10-200 preventivi al mese e vogliono pipeline visuale drag&drop, conversion rate per fonte e forecast cassa basato su preventivi in trattativa",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Pipeline Vendite Edilizia",
    description:
      "Pipeline preventivi visuale per imprese edili: drag&drop delle fasi da lead a firmato, forecast cassa e conversion rate per fase. Vedi subito quale preventivo chiudere.",
    keywords:
      "pipeline vendite edilizia, kanban preventivi edili, conversion rate edilizia, forecast cassa preventivi, gestione lead edilizia, pipeline preventivi cantiere, software vendite edili, sales pipeline edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Pipeline Vendite",
  heroH1Lead: "Pipeline preventivi visuale",
  heroH1Highlight: "drag&drop",
  heroH1Tail: "per imprese edili",
  heroSubheadline:
    "Pipeline vendite kanban per imprese edili: fasi drag&drop (lead, sopralluogo, preventivo inviato, trattativa, firmato/perso), forecast cassa basato su preventivi in trattativa, conversion rate per fonte (passaparola, web, social), attività commerciale tracciata. Smetti di perdere preventivi nel limbo.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Drag&drop kanban",
    "Forecast cassa automatico",
  ],
  proofPoints: [
    "Pipeline visuale per fase",
    "Conversion rate per fonte",
    "Forecast preventivi in trattativa",
  ],

  objectiveRow: [
    ["Obiettivo", "Aumentare il tasso di conversione preventivo→firma"],
    ["Momento chiave", "Ogni cambio di fase del preventivo"],
    ["Risultato", "6% di conversione extra catturata"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano Pipeline Vendite per portare disciplina commerciale e fermare la perdita preventivi.",
  betaBody:
    "La Pipeline Vendite la attiviamo in 48 ore: configuriamo le fasi della tua pipeline, importiamo i preventivi attivi, configuriamo le fonti lead (passaparola, web, social, agenti), attiviamo i trigger di follow-up automatico e ti accompagniamo in 4 sessioni 1-a-1 fino al primo preventivo firmato.",

  speedH2:
    "Le imprese edili convertono mediamente il 18% dei preventivi. Con pipeline strutturata sale al 24%. 6 punti che valgono cantieri.",
  speedSubheadline:
    "Senza pipeline visuale, i preventivi entrano in un limbo: capocantiere fa sopralluogo, tu fai preventivo, lo invii, poi nessuno lo segue. Cliente non risponde, tu non lo chiami, dopo 30 giorni è 'perso' senza che nessuno l'abbia chiuso. La pipeline rende impossibile dimenticare.",
  speedStats: [
    { value: 6, prefix: "+", suffix: "%", label: "conversione extra catturata con pipeline" },
    { value: 24, suffix: "/7", label: "pipeline aggiornata da app mobile" },
    { value: 30, prefix: "-", suffix: "%", label: "preventivi 'persi nel limbo' senza follow-up" },
  ],

  familyH2: "La Pipeline Vendite collegata a CRM, preventivi e cantieri.",
  familySubheadline:
    "Ogni preventivo nasce da un lead, viene firmato e diventa cantiere, fattura e SAL. La Pipeline è il cuore commerciale che alimenta forecast cassa, controllo conversione, attività agenti.",
  familyItems: [
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Lead e clienti gestiti con storico contatti, segmentazione e comunicazioni.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Preventivi generati dalla pipeline alimentano analisi conversione.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Preventivo firmato genera automaticamente apertura cantiere.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Preventivo firmato eIDAS dal cliente, accettazione tracciata.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Forecast cassa basato su preventivi in pipeline e probabilità chiusura.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: BarChart3,
      title: "Cruscotto Aziendale",
      text: "KPI commerciali nel dashboard direzionale: conversione, ticket medio, fonte.",
      to: "/funzionalita/cruscotto-aziendale",
    },
  ],
  familyBonusTitle: "Una sola pipeline. Un solo forecast. Una sola fonte di verità commerciale.",
  familyBonusText:
    "Quando un lead entra (passaparola, web, social), atterra in pipeline. Tu lo qualifichi, fissi sopralluogo, generi preventivo, lo invii. Sistema traccia ogni cambio fase, genera follow-up automatici, calcola probabilità chiusura, alimenta forecast cassa. Quando si firma, diventa cantiere automaticamente.",

  painKicker: "Il problema vero",
  painH2:
    "Preventivi inviati e dimenticati. Lead persi nel limbo. Forecast cassa basato su sensazione del titolare.",
  painSubheadline:
    "Le imprese edili medie generano 30-100 preventivi al mese e li gestiscono in Excel, email, post-it. Senza pipeline visuale strutturata, il 30% dei preventivi finisce 'nel limbo': non firmati, non persi, semplicemente dimenticati. Conversione bassa, cantieri persi senza saperlo.",
  painPoints: [
    {
      icon: Search,
      title: "Preventivi inviati e dimenticati",
      text: "Generi preventivo da 35k, lo invii al cliente, cliente non risponde. Tu fai il successivo, ti dimentichi del precedente. Dopo 60 giorni il cliente ha scelto un concorrente che ha richiamato. Cantiere perso senza saperlo.",
    },
    {
      icon: Filter,
      title: "Conversion rate per fonte sconosciuto",
      text: "Quale fonte porta i clienti che firmano davvero? Passaparola? Google? Facebook? Senza pipeline, risposta a sentimento. Investi in pubblicità a caso, sprechi budget marketing.",
    },
    {
      icon: AlertTriangle,
      title: "Forecast cassa basato su 'sensazione'",
      text: "Banca chiede forecast 90 gg. Risposta: 'mi sembra che ci saranno 200k di firme'. Senza pipeline strutturata con probabilità chiusura per fase, forecast inattendibile, decisioni di leasing/investimenti rinviate.",
    },
    {
      icon: Clock,
      title: "Tempo medio chiusura preventivo lunghissimo",
      text: "Preventivo inviato il 12 marzo, firmato il 5 luglio. Tempo medio chiusura 90+ giorni. Con follow-up strutturati scende a 30-45 giorni: ciclo di vendita più veloce, cassa che entra prima.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi lead, stessi preventivi, stessi clienti. Cambia il tasso di chiusura e la velocità.",
  baSubheadline:
    "La Pipeline Vendite non aumenta i lead in arrivo: massimizza la conversione di quelli che hai già. Preventivi che 'sarebbero andati persi' vengono recuperati con follow-up strutturati, conversion rate sale di 6 punti, fatturato cresce senza più costi acquisizione.",
  baAreas: [
    {
      title: "Tracking preventivi inviati",
      before:
        "Preventivi su Excel, email, post-it. Capisci dopo 60 giorni quanti hai inviato, quanti sono firmati, quanti persi. Stato preventivo dipende dalla memoria del titolare.",
      after:
        "Pipeline kanban visuale con fasi (lead, sopralluogo, preventivo, trattativa, firmato/perso). Apri dashboard, vedi 47 preventivi in trattativa per 1,2M€ di valore. Niente più dubbi.",
    },
    {
      title: "Follow-up cliente sistemico",
      before:
        "Follow-up dopo invio preventivo: a memoria del titolare. Il cliente più simpatico viene richiamato, gli altri restano nel limbo. Conversione bassa, cantieri persi.",
      after:
        "Follow-up automatici per fase: +3 gg dopo invio email reminder, +7 gg WhatsApp, +14 gg telefonata schedulata. Niente preventivo dimenticato, conversione +6%.",
    },
    {
      title: "Conversion rate per fonte",
      before:
        "Pubblicità Facebook spende 800€/mese. Funziona? 'Boh, qualche cliente arriva'. Senza tracking fonte, decisioni marketing prese al buio, budget sprecato.",
      after:
        "Dashboard conversione per fonte: passaparola 32%, Google 28%, Facebook 12%, agenti 22%. Ticket medio per fonte. Decidi dove investire con dato vero.",
    },
    {
      title: "Forecast cassa per banca",
      before:
        "Banca chiede forecast 90 gg per fido: stima a sentimento. Forecast inattendibile, fido approvato in 25 giorni a tassi non ottimali.",
      after:
        "Forecast automatico basato su preventivi in pipeline × probabilità chiusura per fase: 'previsto 380k firme nei prossimi 90 gg'. Forecast strutturato, fido approvato in 7 giorni a tasso migliore.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare disciplina commerciale nella tua impresa edile.",
  mechanismSubheadline:
    "La Pipeline Vendite funziona come un sistema kanban visuale: trascini i preventivi tra fasi, sistema attiva follow-up automatici, dashboard aggiornata in tempo reale. Niente formazione complicata, niente data entry pesante.",
  mechanismSteps: [
    {
      icon: Kanban,
      title: "Pipeline kanban visuale drag&drop",
      text: "Configuri le fasi della tua pipeline (lead, sopralluogo, preventivo inviato, trattativa, firmato/perso). Trascini ogni preventivo tra fasi, sistema aggiorna stato in tempo reale, dashboard sempre vera.",
    },
    {
      icon: Send,
      title: "Follow-up automatici per fase",
      text: "Per ogni fase configuri regole follow-up: +3 gg dopo invio preventivo email reminder, +7 gg WhatsApp, +14 gg attività telefonata schedulata. Niente preventivo dimenticato.",
    },
    {
      icon: LineChart,
      title: "Forecast cassa e conversion analytics",
      text: "Sistema calcola forecast cassa basato su preventivi in pipeline × probabilità chiusura per fase. Dashboard conversion rate per fonte, agente, ticket. Decisioni commerciali su dato vero.",
    },
  ],
  mechanismCta: "Apri la demo Pipeline Vendite",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "+6% di conversione. Forecast cassa attendibile. Marketing che spende dove rende.",
  commercialBody:
    "La Pipeline Vendite non è un CRM in più: è il sistema che impedisce ai preventivi di morire nel limbo. Le imprese che la attivano vedono crescere la conversione di 6 punti percentuali e ottenere forecast cassa attendibili per banca e investimenti.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "+6% di conversione preventivo→firma",
      text: "Follow-up sistemici recuperano preventivi che andrebbero persi. Su 60 preventivi/mese × ticket 30k = +108k di fatturato annuo recuperato senza nuovi lead.",
    },
    {
      icon: PieChart,
      title: "Marketing dove rende davvero",
      text: "Conversion rate per fonte mostra dove investire: passaparola converte al 32%, Facebook al 12%. Sposti budget verso fonti redditizie, ROI marketing raddoppia.",
    },
    {
      icon: ShieldCheck,
      title: "Forecast cassa per banca",
      text: "Forecast 90 gg basato su pipeline × probabilità chiusura: attendibile, documentato, auditabile. Banca approva fido più veloce a tassi migliori.",
    },
    {
      icon: Sparkles,
      title: "Ciclo vendita ridotto del 40%",
      text: "Tempo medio chiusura preventivo da 90 gg a 50 gg con follow-up strutturati. Cassa che entra prima, capacità di prendere più cantieri all'anno.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "I preventivi smettono di sparire. Ogni lead viene seguito fino al sì o al no.",
  resultsBody:
    "Quando ogni preventivo è in pipeline visuale e ogni cambio di fase attiva follow-up automatici, l'impresa cambia paradigma: niente più preventivi dimenticati, niente più conversion sconosciuta, niente più forecast a sensazione. Le imprese che attivano Pipeline Vendite vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Kanban,
      title: "Pipeline kanban visuale",
      text: "Fasi configurabili (default: lead, sopralluogo, preventivo, trattativa, firmato/perso). Drag&drop tra fasi, dashboard sempre real-time, app mobile inclusa.",
    },
    {
      icon: Send,
      title: "Follow-up automatici per fase",
      text: "Email, WhatsApp, SMS, attività schedulate per agente. Trigger configurabili per giorni in fase, ticket, fonte. Niente preventivo dimenticato.",
    },
    {
      icon: PieChart,
      title: "Conversion analytics multi-dimensionale",
      text: "Conversione per fonte (passaparola, web, social, agenti), per ticket medio, per area geografica, per tipologia lavori. Decisioni marketing su dato vero.",
    },
    {
      icon: LineChart,
      title: "Forecast cassa attendibile",
      text: "Calcolo automatico basato su preventivi in pipeline × probabilità chiusura per fase. Dashboard 30/60/90 gg, scenari what-if, export per banca.",
    },
  ],
  resultStats: [
    { value: 6, prefix: "+", suffix: "%", label: "conversione extra catturata" },
    { value: 40, prefix: "-", suffix: "%", label: "tempo medio chiusura preventivo" },
    { value: 30, prefix: "-", suffix: "%", label: "preventivi 'persi nel limbo' senza follow-up" },
  ],
  resultsCta: "Apri la demo Pipeline Vendite",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale il 6% di conversione extra catturata grazie a follow-up strutturati?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di preventivi al mese e ticket medio. La stima parte dal 6% di conversione extra osservato sui clienti dopo 90 giorni di utilizzo Pipeline Vendite.",
  roi: {
    input1Label: "Preventivi al mese",
    input1Default: 25,
    input1Min: 5,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Ticket medio preventivo (€)",
    input2Default: 28000,
    input2Min: 1000,
    input2Max: 500000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Fatturato annuo extra stimato",
    computeOutput: (a, b) => Math.round(a * 12 * b * 0.06),
    computeSecondary: (a, b) => [
      { label: "Volume preventivi annui", value: `${a * 12}` },
      { label: "Conversione extra catturata", value: "+6%" },
      { label: "Tempo medio chiusura ridotto", value: "-40%" },
    ],
    closingPitch:
      "Stima prudenziale basata sul +6% di conversione catturata grazie a follow-up automatici e pipeline disciplinata. Aggiungi il valore del marketing redirezionato verso fonti redditizie e del forecast cassa attendibile per banca.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non solo CRM. Un sistema commerciale disciplinato che lavora 24/7.",
  salesBody:
    "La Pipeline Vendite Edilizia in Cloud non è un CRM in più: è disciplina commerciale applicata in modo sistemico. Le imprese che la attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Niente preventivi dimenticati",
      text: "Ogni preventivo ha follow-up automatici per fase. Se cliente non risponde dopo +14 gg, sistema ti chiede 'chiudi come perso?' o 'pianifica chiamata?'. Niente preventivo nel limbo per mesi.",
    },
    {
      title: "Marketing che spende dove rende",
      text: "Conversion rate per fonte: smetti di buttare 800€/mese su Facebook se converte al 12% e passaparola al 32%. Sposti budget verso fonti redditizie, ROI marketing raddoppia.",
    },
    {
      title: "Agenti e venditori responsabilizzati",
      text: "Pipeline per agente: vedi quanti preventivi gestisce, conversion rate, ticket medio, ciclo vendita. Coaching basato su dato, premi su risultati misurabili.",
    },
    {
      title: "Forecast cassa per investimenti",
      text: "Stai per acquistare un mezzo da 80k? Forecast cassa attendibile mostra che 90 gg avrai +250k firme: investimento sicuro. Decisioni informate, niente più 'speriamo'.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Pipeline kanban drag&drop",
      value:
        "Fasi configurabili (default: lead, sopralluogo, preventivo, trattativa, firmato/perso). Trascini preventivi tra fasi, dashboard sempre real-time, app mobile.",
    },
    {
      label: "Follow-up automatici per fase",
      value:
        "Email reminder a +3 gg dopo invio preventivo, WhatsApp a +7 gg, SMS a +10 gg, attività telefonata schedulata a +14 gg. Niente preventivo dimenticato.",
    },
    {
      label: "Probabilità chiusura per fase",
      value:
        "Configurabile per impresa: lead 10%, sopralluogo 25%, preventivo inviato 40%, trattativa 70%, firmato 100%. Forecast cassa basato su pipeline × probabilità.",
    },
    {
      label: "Conversion rate per fonte e agente",
      value:
        "Dashboard analytics: conversione per fonte (passaparola, web, social, agenti), per ticket, area geografica, tipologia lavori. Per agente: pipeline, ciclo, ticket medio.",
    },
    {
      label: "Forecast cassa 30/60/90 giorni",
      value:
        "Calcolo automatico basato su pipeline × probabilità chiusura. Scenari what-if, export PDF/Excel per banca, integrazione con Tesoreria multi-banca PSD2.",
    },
    {
      label: "Attività commerciali tracciate",
      value:
        "Telefonate, email, sopralluoghi, riunioni: log completo per ogni preventivo. Storico cliente sempre disponibile, niente più 'chi l'aveva chiamato l'ultima volta?'.",
    },
    {
      label: "Conversione automatica preventivo→cantiere",
      value:
        "Quando cliente firma elettronicamente preventivo, sistema crea automaticamente cantiere, importa anagrafica, genera ordini fornitore, attiva timbrature.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Pipeline Vendite cambia la giornata.",
  scenarios: [
    {
      title: "Preventivo recuperato dopo 30 giorni",
      text: "Preventivo da 45k inviato il 12 marzo. A +14 gg sistema schedula attività 'chiama Sig. Rossi'. Tu chiami, scopri che stava aspettando una variante minima. Modifichi il preventivo, lui firma il 28 marzo. Cantiere recuperato che era avviato a perdersi.",
    },
    {
      title: "Decisione marketing basata su dato",
      text: "Investi 800€/mese su Facebook, 600€ su Google Ads. Apri analytics: Facebook converte all'11% con ticket medio 18k, Google al 24% con ticket medio 35k. Sposti tutto budget su Google: ROI marketing raddoppia in 60 giorni.",
    },
    {
      title: "Forecast cassa per fido banca",
      text: "Banca chiede forecast 90 gg per fido 200k. Esporti report Pipeline Vendite: 47 preventivi in trattativa per 1,2M€ × probabilità chiusura per fase = forecast 380k firme. Banca approva fido in 6 giorni a tasso 3,5% invece di 4,1%.",
    },
  ],

  testimonialQuote:
    "Ho 4 venditori e prima non sapevo nemmeno quanti preventivi avessero in pipeline ognuno. Ho attivato Pipeline Vendite: ogni mattina apro dashboard e vedo 89 preventivi attivi per 2,1M€ di valore. Conversion rate è passato dal 19% al 26% in 6 mesi grazie ai follow-up automatici. Solo questo recupero vale 8.000€/mese di fatturato extra catturato senza un lead in più.",
  testimonialAuthor: "Massimo G.",
  testimonialRole: "Galimberti Costruzioni Spa, Milano",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "I miei agenti accetteranno la pipeline o si ribelleranno?",
      a: "Gli agenti bravi la apprezzano: vedono pipeline strutturata, ricevono follow-up automatici, smettono di dimenticare preventivi. Gli agenti che lavorano male possono lamentarsi: in questo caso, il problema è il dato che emerge, non lo strumento. Statisticamente, dopo 60 giorni l'85% degli agenti considera la pipeline 'più giusta del precedente'.",
    },
    {
      q: "Posso configurare le fasi della pipeline a misura della mia impresa?",
      a: "Sì. Default 5 fasi (lead, sopralluogo, preventivo, trattativa, firmato/perso) ma personalizzabili. Per ristrutturatori si aggiunge 'progetto in elaborazione', per general contractor 'gara'. Configurazione su misura nel piano di onboarding 1-a-1.",
    },
    {
      q: "Il forecast cassa è davvero affidabile?",
      a: "Sì se la pipeline è gestita con disciplina. Forecast = somma di (preventivi in fase × probabilità chiusura per fase). Probabilità calibrate sui tuoi dati storici dopo 90 giorni di utilizzo. Affidabilità misurata: ±10% rispetto al consuntivo reale per la maggior parte dei clienti.",
    },
    {
      q: "Si integra con il mio modulo preventivi?",
      a: "Sì se è il modulo Preventivi Edilizia in Cloud. Preventivi generati confluiscono automaticamente in pipeline alla fase 'preventivo inviato'. Per gestionali esterni, API REST disponibili nel piano Business.",
    },
    {
      q: "Posso vedere la pipeline da telefono?",
      a: "Sì. App iOS/Android con pipeline kanban completa: trascini preventivi tra fasi, vedi follow-up schedulati, chiami clienti direttamente, registri attività. Sync real-time con desktop, niente perdite dati.",
    },
    {
      q: "Quanto costa? Ci sono limiti su agenti o preventivi?",
      a: "Pipeline Vendite è inclusa nei piani Professional e Business di Edilizia in Cloud. Agenti illimitati nel piano Business (3 agenti nel Professional), preventivi illimitati, app mobile inclusa, forecast cassa e analytics inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La Pipeline Vendite è il cuore commerciale di un sistema più ampio.",
  internalLinksBody:
    "Lead, preventivi, firme, cantieri si parlano per garantire continuità tra acquisizione cliente e produzione. Una sola fonte di verità commerciale.",
  internalLinks: [
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Lead e clienti gestiti con storico contatti e segmentazione." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Preventivi generati alimentano la pipeline e analisi conversione." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Preventivo firmato eIDAS dal cliente, accettazione tracciata." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Preventivo firmato genera apertura cantiere automaticamente." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Forecast cassa basato su preventivi in pipeline × probabilità." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI commerciali nel dashboard direzionale: conversione, ticket, fonte." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Trigger automatici di follow-up per fase pipeline." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Pipeline Vendite inclusa nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di perdere preventivi nel limbo. Inizia a chiudere il 6% in più senza nuovi lead.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Pipeline Vendite dentro la tua impresa edile. Setup in 48 ore, kanban drag&drop, follow-up automatici, forecast cassa e conversion analytics inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Kanban drag&drop · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Pipeline Vendite",
  stickyCtaMicrocopy: "Setup 48h · Kanban + forecast cassa",

  applicationSubCategory: "Construction Sales Pipeline Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function PipelineVendite() {
  return <FunzionalitaPageTemplate config={config} />;
}
