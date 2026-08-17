import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  Clock,
  Database,
  FileSpreadsheet,
  Inbox,
  Link2,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Tag,
  TrendingUp,
  Users,
  Wallet,
  Wand2,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "prima-nota",
  vertical: "Prima Nota",
  productName: "Prima Nota Cassa & Banca Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che vogliono prima nota cassa/banca digitale con riconciliazione automatica PSD2, categorizzazione AI e export commercialista in formato XBRL",
  audienceShort: "imprese edili e amministrazioni",

  seo: {
    title:
      "Prima Nota Cassa e Banca per Edilizia",
    description:
      "Prima nota cassa e banca digitale con riconciliazione automatica estratti conto via PSD2, categorizzazione AI dei movimenti e dashboard cassa giornaliera sempre aggiornata.",
    keywords:
      "prima nota edilizia, prima nota cassa banca impresa edile, riconciliazione PSD2 edilizia, contabilità impresa costruzione, prima nota digitale, software contabilità edilizia, prima nota XBRL commercialista, dashboard cassa edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Prima Nota",
  heroH1Lead: "Prima nota cassa e banca",
  heroH1Highlight: "che si scrive da sola",
  heroH1Tail: "via PSD2",
  heroSubheadline:
    "Prima nota digitale collegata alla tua banca via PSD2: ogni movimento viene importato in tempo reale, categorizzato dall'AI, riconciliato con fatture e ordini, esportato in formato XBRL per il commercialista. Dashboard cassa giornaliera sempre aggiornata, niente più quaderni o fogli Excel.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Sync banca PSD2 automatico", "Categorizzazione AI"],
  proofPoints: [
    "Riconciliazione automatica fatture",
    "Dashboard cassa giornaliera",
    "Export commercialista XBRL",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare la prima nota cartacea o su Excel"],
    ["Momento chiave", "Chiusura mensile e controllo cassa giornaliero"],
    ["Risultato", "3 minuti risparmiati per movimento contabile"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano la Prima Nota Edilizia in Cloud per chiudere il mese in 1 ora invece di 8.",
  betaBody:
    "La Prima Nota la attiviamo in 48 ore: configuriamo le connessioni PSD2 con le tue banche, importiamo lo storico movimenti, configuriamo le regole di categorizzazione AI per cantiere e capitolo, attiviamo la riconciliazione automatica con il cassetto SDI e ti accompagniamo in 4 sessioni 1-a-1 con il nostro contabile dedicato.",

  speedH2:
    "Tre minuti per movimento × 1.500 movimenti/mese = 75 ore di prima nota a mano. Inaccettabile.",
  speedSubheadline:
    "La prima nota tradizionale richiede 3 minuti per movimento (apertura estratto conto, individuazione movimento, classificazione, immissione, riconciliazione fattura). Con il sync PSD2 e l'AI questo tempo si azzera: tu approvi solo le ambiguità.",
  speedStats: [
    { value: 3, suffix: " min", label: "tempo medio risparmiato per movimento" },
    { value: 95, prefix: "+", suffix: "%", label: "movimenti riconciliati automaticamente" },
    { value: 1, suffix: " ora", label: "chiusura prima nota mensile (era 8)" },
  ],

  familyH2: "La Prima Nota nutrita da banca, cassetto SDI e ordini.",
  familySubheadline:
    "Ogni movimento bancario viene importato via PSD2, ogni fattura passiva viene sincronizzata dal cassetto SDI, ogni ordine fornitore alimenta la riconciliazione. La Prima Nota si scrive con dati che arrivano da soli, non con data entry manuale.",
  familyItems: [
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Posizione cassa multi-banca PSD2 consolidata in tempo reale.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: Inbox,
      title: "Cassetto Fiscale SDI",
      text: "Fatture passive sincronizzate dal cassetto AdE riconciliate con i pagamenti.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture attive riconciliate con incassi banca per chiusura automatica.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Tag,
      title: "Ordini Acquisto",
      text: "Pagamenti fornitore collegati automaticamente agli ordini d'acquisto.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: Clock,
      title: "Scadenzario",
      text: "Riconciliazione automatica chiude scadenze quando arriva il movimento.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Costi e ricavi imputati al cantiere giusto per analisi margine real-time.",
      to: "/funzionalita/margini-cantiere",
    },
  ],
  familyBonusTitle: "Una sola contabilità. Una sola fonte di verità sulla cassa.",
  familyBonusText:
    "Quando un cliente paga, la banca importa il movimento via PSD2, l'AI lo riconcilia con la fattura aperta, lo Scadenzario chiude la scadenza, il Cruscotto Aziendale aggiorna il fatturato e la Tesoreria mostra la nuova posizione cassa. Tutto questo senza che tu scriva una riga in prima nota.",

  painKicker: "Il problema vero",
  painH2: "Prima nota a mano su Excel o quaderno. Un mese intero per chiudere il mese precedente.",
  painSubheadline:
    "L'impresa edile media ha 1.000-3.000 movimenti contabili al mese tra cassa, banca, carte. Tenerli a mano significa 60-90 ore di lavoro segreteria, errori inevitabili, chiusure mensili che slittano. La prima nota digitale non è un upgrade: è un cambio di paradigma.",
  painPoints: [
    {
      icon: FileSpreadsheet,
      title: "Excel che diventa illeggibile dopo 6 mesi",
      text: "Foglio prima nota cresce, formule si rompono, categorie aumentano in modo disordinato. Dopo 6 mesi nessuno sa più dove sia un movimento specifico. Quando il commercialista chiede chiarimenti, panico.",
    },
    {
      icon: Clock,
      title: "Movimenti banca ricopiati a mano",
      text: "Estratto conto stampato, segretaria che ricopia uno per uno su Excel, classificazione a memoria. 3 minuti per movimento × 1.500/mese = 75 ore di lavoro che non genera valore.",
    },
    {
      icon: AlertTriangle,
      title: "Riconciliazione fatture/movimenti dimenticata",
      text: "Quale fattura corrisponde a quale incasso? Senza riconciliazione automatica, lo scadenzario resta aperto anche dopo il pagamento. Doppi solleciti, clienti irritati, errori di fatturato.",
    },
    {
      icon: Users,
      title: "Commercialista che chiede chiarimenti per giorni",
      text: "Commercialista riceve prima nota Excel, non capisce categorie, chiede via email 'movimento del 12 febbraio è cosa?'. 30 email in 5 giorni, chiusura ritardata, parcella più alta.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa banca, stesse fatture, stessi movimenti. Cambia il tempo e l'affidabilità.",
  baSubheadline:
    "La Prima Nota digitale non sostituisce il commercialista: gli fornisce dati puliti, classificati e riconciliati. Il risultato è chiusura più veloce, parcelle più basse, controllo cassa giornaliero.",
  baAreas: [
    {
      title: "Importazione movimenti banca",
      before:
        "Estratto conto stampato a fine mese, segretaria ricopia su Excel uno per uno. 3 minuti per movimento, errori inevitabili, ritardo di 30 giorni sulla realtà.",
      after:
        "Sync PSD2 automatico ogni 4 ore con tutte le banche italiane principali. Movimenti in prima nota in tempo reale, già classificati dall'AI per cantiere e capitolo.",
    },
    {
      title: "Categorizzazione movimenti",
      before:
        "Classificazione manuale a memoria: 'forse questo è materiali cantiere X, forse quello è stipendio'. Dopo 6 mesi categorie incoerenti, analisi margini impossibile.",
      after:
        "AI classifica automaticamente movimenti riconoscendo P.IVA, causale, importo, ricorrenza. Dopo 30 giorni accuratezza 95%, tu approvi solo i casi nuovi/ambigui.",
    },
    {
      title: "Riconciliazione fatture/incassi",
      before:
        "Manuale, fatto a fine mese, errori frequenti. Cliente che paga sparisce nello scadenzario, doppia comunicazione di sollecito, clienti irritati.",
      after:
        "Match automatico per importo, P.IVA, causale. Quando cliente paga, fattura chiusa nello scadenzario in tempo reale. Niente solleciti errati.",
    },
    {
      title: "Chiusura mensile e export commercialista",
      before:
        "Fine mese: 8-12 ore di lavoro segreteria per chiudere prima nota Excel + 30 email di chiarimento al commercialista. Chiusura slitta al 25 del mese successivo.",
      after:
        "Chiusura in 1 ora: l'AI ha già classificato e riconciliato il 95% dei movimenti, tu approvi le eccezioni, esporti XBRL al commercialista, finito entro il 5 del mese.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare la tua prima nota nel 21esimo secolo.",
  mechanismSubheadline:
    "La Prima Nota digitale lavora in modo passivo: importa, classifica, riconcilia. Tu intervieni solo per approvare le eccezioni e prendere decisioni manageriali, non per fare data entry.",
  mechanismSteps: [
    {
      icon: Link2,
      title: "Connessione PSD2 con le tue banche",
      text: "Configuri una volta la connessione PSD2 con tutte le tue banche italiane. Da quel momento, ogni movimento viene importato automaticamente ogni 4 ore. Connessione cifrata, GDPR compliant.",
    },
    {
      icon: Wand2,
      title: "Categorizzazione AI dei movimenti",
      text: "L'AI classifica ogni movimento riconoscendo P.IVA controparte, causale, importo, frequenza. Dopo 30 giorni di apprendimento, accuratezza al 95%. Tu approvi le eccezioni in 5 secondi.",
    },
    {
      icon: ArrowRightLeft,
      title: "Riconciliazione automatica fatture",
      text: "Movimenti banca riconciliati con fatture attive (per incassi) e fatture passive del cassetto SDI (per pagamenti). Match per importo, P.IVA, causale. Scadenzario chiuso in tempo reale.",
    },
  ],
  mechanismCta: "Apri la demo Prima Nota",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Chiusura in 1 ora. Parcella commercialista più bassa. Controllo cassa giornaliero.",
  commercialBody:
    "La Prima Nota digitale non è solo risparmio di tempo: è qualità del dato. Quando il dato è pulito, classificato e riconciliato, il commercialista lavora più veloce (parcella più bassa), il titolare ha visibilità giornaliera (decisioni migliori), il bilancio è affidabile (banche più fiduciose).",
  commercialLevers: [
    {
      icon: Zap,
      title: "Chiusura mensile in 1 ora",
      text: "Da 8-12 ore di lavoro segreteria a 1 ora di approvazione eccezioni. Recupero netto di 7-11 ore al mese, 84-132 ore all'anno per amministrazione.",
    },
    {
      icon: Users,
      title: "Parcella commercialista ridotta",
      text: "Commercialista riceve dati puliti e classificati, lavora 50% più veloce. Negozi parcella mensile inferiore o ottieni servizi consulenziali in più allo stesso prezzo.",
    },
    {
      icon: PiggyBank,
      title: "Controllo cassa giornaliero",
      text: "Dashboard cassa aggiornata in tempo reale: posizione consolidata multi-banca, previsionale 30/60/90 gg, alert sconfinamento. Decisioni di pagamento informate.",
    },
    {
      icon: ShieldCheck,
      title: "Bilancio affidabile per banche",
      text: "Quando chiedi fido o leasing, banca riceve bilancio basato su dati riconciliati e categorizzati con audit trail completo. Approvazione fido più veloce e a tassi migliori.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "La prima nota smette di essere un peso. Diventa una risorsa decisionale.",
  resultsBody:
    "Quando i movimenti contabili sono importati, classificati e riconciliati in modo automatico, la prima nota si trasforma da 'lavoro burocratico' a 'fonte di intelligenza decisionale'. Le imprese che attivano il modulo Prima Nota vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Database,
      title: "Sync PSD2 multi-banca continuo",
      text: "Connessione con tutte le principali banche italiane (Intesa, Unicredit, BPER, Banco BPM, Crédit Agricole, BCC). Sync automatico ogni 4 ore, cifrato GDPR.",
    },
    {
      icon: Wand2,
      title: "AI di categorizzazione progressiva",
      text: "Modello che apprende dalle tue correzioni: dopo 30 giorni accuratezza 95%, dopo 90 giorni 98%. Riconosce pattern specifici della tua impresa.",
    },
    {
      icon: ArrowRightLeft,
      title: "Riconciliazione automatica fatture",
      text: "Match incassi con fatture attive, pagamenti con fatture passive del cassetto SDI. Scadenzario chiuso in tempo reale, niente solleciti errati.",
    },
    {
      icon: BookOpen,
      title: "Export commercialista XBRL",
      text: "Esportazione in formato XBRL standard, oltre a CSV e PDF firmato. Pronto per chiusura bilancio, IVA, modello dichiarazione redditi.",
    },
  ],
  resultStats: [
    { value: 3, suffix: " min", label: "tempo medio risparmiato per movimento" },
    { value: 95, prefix: "+", suffix: "%", label: "movimenti riconciliati automaticamente" },
    { value: 1, suffix: " ora", label: "chiusura prima nota mensile (era 8)" },
  ],
  resultsCta: "Apri la demo Prima Nota",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se l'AI fa la prima nota al posto tuo?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di movimenti contabili al mese e costo orario interno di amministrazione. La stima parte da 3 minuti risparmiati per movimento — il dato medio osservato sui clienti dopo 30 giorni.",
  roi: {
    input1Label: "Movimenti contabili al mese",
    input1Default: 1000,
    input1Min: 50,
    input1Max: 5000,
    input1Step: 50,
    input2Label: "Costo orario amministrazione (€)",
    input2Default: 30,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.05 * b),
    computeSecondary: (a, b) => [
      { label: "Ore amministrazione recuperate/anno", value: `${Math.round(a * 12 * 0.05)} h` },
      { label: "Tempo risparmiato per movimento", value: "3 minuti" },
      { label: "Riconciliazione automatica", value: "95% movimenti" },
    ],
    closingPitch:
      "Stima prudenziale basata su 3 minuti risparmiati per movimento (importazione, classificazione, riconciliazione). Aggiungi la riduzione della parcella commercialista (-30% medio) e il valore decisionale del controllo cassa giornaliero.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un foglio Excel digitalizzato. Una contabilità che lavora 24/7 al posto tuo.",
  salesBody:
    "La Prima Nota Edilizia in Cloud non è un semplice software contabile: è un sistema di intelligence finanziaria che lavora in autonomia. Le imprese che lo attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Amministrazione che torna a respirare",
      text: "Segreteria smette di passare giornate sui movimenti banca. Tornano disponibili 75 ore al mese per gestione clienti, controllo crediti, supporto al titolare.",
    },
    {
      title: "Decisioni cassa basate su dati real-time",
      text: "Titolare apre dashboard cassa al mattino, vede posizione consolidata, sa se può pagare i fornitori oggi o se conviene aspettare un incasso. Decisioni informate.",
    },
    {
      title: "Commercialista come consulente, non archivista",
      text: "Commercialista riceve dati puliti, smette di fare data entry, torna a fare consulenza fiscale e strategica. Parcella ottimizzata, valore aggiunto reale.",
    },
    {
      title: "Bilancio che apre porte con le banche",
      text: "Bilancio basato su dati riconciliati e auditabili è più credibile per banche e investitori. Fido più veloce, tassi migliori, accesso a finanziamenti agevolati.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Connessione PSD2 multi-banca",
      value:
        "Sync automatico ogni 4 ore con Intesa, Unicredit, BPER, Banco BPM, Crédit Agricole, BCC, Mediolanum e altre. Connessione cifrata, GDPR compliant.",
    },
    {
      label: "Categorizzazione AI dei movimenti",
      value:
        "Algoritmo ML che riconosce P.IVA, causale, importo, ricorrenza. Apprende dalle tue correzioni: dopo 30 giorni accuratezza 95%, dopo 90 giorni 98%.",
    },
    {
      label: "Riconciliazione automatica fatture",
      value:
        "Match incassi/pagamenti con fatture attive e passive del cassetto SDI. Match per importo, P.IVA, causale. Scadenzario chiuso in tempo reale.",
    },
    {
      label: "Imputazione automatica al cantiere",
      value:
        "Movimenti riconducibili a un cantiere (materiali, subappalti, manodopera) imputati automaticamente per analisi margine real-time.",
    },
    {
      label: "Dashboard cassa giornaliera",
      value:
        "Posizione consolidata multi-banca, previsionale 30/60/90 gg, alert sconfinamento, grafici trend. Aggiornata in tempo reale.",
    },
    {
      label: "Export commercialista XBRL/CSV/PDF",
      value:
        "Formato XBRL standard, CSV per Excel del commercialista, PDF firmato per archiviazione. Pronto per chiusura bilancio e dichiarazioni.",
    },
    {
      label: "Audit trail completo",
      value:
        "Ogni movimento ha cronologia completa: chi ha modificato, quando, perché. Audit pronto per controlli AdE, GdF, revisori bilancio.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Prima Nota digitale cambia la giornata.",
  scenarios: [
    {
      title: "Decisione di pagamento al venerdì pomeriggio",
      text: "Venerdì 16:00, fornitore X sollecita 12.000€. Apri dashboard cassa: posizione consolidata multi-banca 38.000€, incassi attesi lunedì 22.000€. Decidi di pagare oggi senza chiamare la banca: scelta basata su dato reale, non su sensazione.",
    },
    {
      title: "Chiusura IVA del 16 senza panico",
      text: "Il 13 del mese commercialista chiede chiusura. Esporti prima nota XBRL del mese precedente in 5 minuti, già classificata, riconciliata. Commercialista chiude IVA il 14 senza una sola email di chiarimento.",
    },
    {
      title: "Richiesta fido alla banca",
      text: "Banca chiede prima nota ultimi 12 mesi per istruttoria fido 100k. Esporti dossier completo con riconciliazione fatture, categorizzazione, audit trail. Banca approva fido in 5 giorni invece di 25.",
    },
  ],

  testimonialQuote:
    "Mia moglie passava 4 giorni al mese a fare la prima nota su Excel ricopiando l'estratto conto. Ho attivato Prima Nota Edilizia in Cloud, in 30 giorni l'AI ha imparato le nostre categorie, ora chiudiamo il mese in 1 ora. Mio commercialista mi ha abbassato la parcella perché 'finalmente ricevo dati puliti'. Mia moglie si occupa dei clienti adesso.",
  testimonialAuthor: "Stefano L.",
  testimonialRole: "Lombardo Costruzioni Srl, Torino",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "La connessione PSD2 con la mia banca è sicura?",
      a: "Sì. PSD2 è la direttiva europea che impone alle banche di esporre API ufficiali per accesso autorizzato dai clienti. La connessione è cifrata end-to-end, autenticata con SCA (Strong Customer Authentication), revocabile in qualsiasi momento. Edilizia in Cloud è iscritta al registro AISP.",
    },
    {
      q: "Funziona con tutte le banche italiane?",
      a: "Sì con tutte le principali: Intesa Sanpaolo, Unicredit, BPER, Banco BPM, Crédit Agricole, BCC, Mediolanum, Fineco, Banca Sella, Cherry Bank e altre. Per istituti minori valutiamo caso per caso, supporto in espansione continua.",
    },
    {
      q: "Quanto è accurata la categorizzazione AI?",
      a: "Dopo 30 giorni di apprendimento sui tuoi dati specifici, l'accuratezza media è del 95%. Dopo 90 giorni sale al 98%. L'AI riconosce pattern specifici della tua impresa: fornitori abituali, ricorrenze stipendi/affitti, causali tipiche del settore edile.",
    },
    {
      q: "Posso correggere la categorizzazione AI?",
      a: "Sì, e l'AI impara dalle tue correzioni. Quando correggi un movimento, il sistema applica la nuova logica a tutti i movimenti simili passati e futuri. Più correggi all'inizio, più diventa accurato.",
    },
    {
      q: "Il mio commercialista come si interfaccia?",
      a: "Crei un accesso dedicato per il commercialista con permessi consultazione/export. Lui esporta autonomamente in XBRL, CSV o PDF, vede l'audit trail di ogni movimento, pone domande direttamente nei commenti dei movimenti ambigui.",
    },
    {
      q: "Quanto costa? Ci sono limiti sui movimenti?",
      a: "Prima Nota è inclusa nei piani Professional e Business di Edilizia in Cloud. Connessioni PSD2 illimitate, movimenti illimitati fino a 10.000/mese, conservazione decennale inclusa, export commercialista senza costi aggiuntivi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La Prima Nota è il cuore contabile di un sistema più ampio.",
  internalLinksBody:
    "Movimenti banca, fatture e ordini si parlano per chiudere automaticamente scadenze, alimentare margini cantiere e generare bilanci affidabili.",
  internalLinks: [
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Posizione cassa multi-banca PSD2 consolidata in tempo reale." },
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto Fiscale SDI", text: "Fatture passive sincronizzate riconciliate con i pagamenti banca." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture attive riconciliate con incassi banca PSD2." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Riconciliazione automatica chiude le scadenze al pagamento." },
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "Pagamenti fornitore collegati agli ordini d'acquisto." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costi/ricavi imputati al cantiere per analisi margine live." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "Cassa, fatturato, margini nel dashboard direzionale." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Prima Nota inclusa nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di ricopiare l'estratto conto. Inizia a chiudere il mese in 1 ora.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Prima Nota digitale dentro la tua impresa edile. Setup in 48 ore, sync PSD2 con tutte le banche italiane, AI di categorizzazione e riconciliazione automatica fatture inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Sync banca PSD2 · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Prima Nota",
  stickyCtaMicrocopy: "Setup 48h · Sync banca PSD2",

  applicationSubCategory: "Construction Bookkeeping Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function PrimaNota() {
  return <FunzionalitaPageTemplate config={config} />;
}
