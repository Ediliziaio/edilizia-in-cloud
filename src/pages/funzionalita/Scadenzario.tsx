import {
  AlertCircle,
  Bell,
  CalendarClock,
  Clock,
  Filter,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "scadenzario",
  definizione:
    "Lo Scadenzario di Edilizia in Cloud gestisce le scadenze di clienti e fornitori dell'impresa edile con solleciti automatici a più passi via email, WhatsApp e SMS, avvisi al titolare prima della scadenza, report di anzianità dei crediti in tempo reale ed export per il commercialista.",
  vertical: "Scadenzario",
  productName: "Scadenzario Clienti & Fornitori Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor che vogliono ridurre i giorni medi di incasso e automatizzare i solleciti senza pagare un credit manager esterno",
  audienceShort: "imprese edili e general contractor",

  seo: {
    title:
      "Scadenzario Edilizia: Solleciti Automatici e Incassi",
    description:
      "Scadenzario clienti e fornitori con solleciti automatici via email e WhatsApp, aging report, avvisi pre-scadenza ed export per il commercialista.",
    keywords:
      "scadenzario edilizia, solleciti automatici clienti edili, recupero crediti impresa costruzione, aging report edilizia, gestione scadenze fornitori edilizia, sollecito WhatsApp edilizia, scadenzario fatture impresa edile, incassi edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Scadenzario",
  heroH1Lead: "Solleciti automatici",
  heroH1Highlight: "che incassano davvero",
  heroH1Tail: "senza scocciare",
  heroSubheadline:
    "Scadenzario clienti e fornitori con solleciti automatici multi-step (email + WhatsApp + SMS), alert pre-scadenza per il titolare, aging report aggiornato in tempo reale, export commercialista in 1 click. Recuperi crediti come un credit manager senza pagarlo, riduci giorni medi di incasso del 30%.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Solleciti multi-canale automatici", "Aging report in tempo reale"],
  proofPoints: [
    "Alert pre-scadenza al titolare",
    "Solleciti email + WhatsApp + SMS",
    "Aging cliente sempre aggiornato",
  ],

  objectiveRow: [
    ["Obiettivo", "Ridurre i giorni medi di incasso da 90 a 60"],
    ["Momento chiave", "Liquidità mensile per pagare fornitori e operai"],
    ["Risultato", "4% di crediti recuperati da minor sofferenza"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano lo Scadenzario per recuperare crediti senza scocciare i clienti e senza credit manager.",
  betaBody:
    "Lo Scadenzario lo attiviamo in 48 ore: importiamo lo storico crediti, configuriamo le sequenze di sollecito (giorni, canali, tono), colleghiamo il cassetto fiscale per le fatture passive, attiviamo gli alert pre-scadenza per il titolare e ti accompagniamo in 4 sessioni 1-a-1 fino al primo recupero.",

  speedH2:
    "Le imprese edili italiane incassano in media a 90 giorni. Con scadenzario automatico si scende a 60.",
  speedSubheadline:
    "Il problema non è 'i clienti non pagano': è 'nessuno gestisce strutturalmente il credito'. Senza solleciti automatici, i clienti pagano per ultimi i fornitori più silenziosi. Lo Scadenzario rende impossibile dimenticarli.",
  speedStats: [
    { value: 30, prefix: "-", suffix: "%", label: "giorni medi di incasso (DSO)" },
    { value: 4, prefix: "+", suffix: "%", label: "crediti recuperati su sofferenze" },
    { value: 24, suffix: "/7", label: "monitoraggio scadenze e alert automatici" },
  ],

  familyH2: "Lo Scadenzario alimentato da fatturazione, cassetto SDI e tesoreria.",
  familySubheadline:
    "Le scadenze nascono dalle fatture (attive e passive), gli incassi vengono riconciliati con la banca via PSD2, i solleciti partono via WhatsApp Business e email transazionale. Tutto integrato, niente data entry duplicato.",
  familyItems: [
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Scadenze clienti generate automaticamente dalle fatture attive emesse via SDI.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Inbox,
      title: "Cassetto Fiscale SDI",
      text: "Scadenze fornitori popolate dalle fatture passive sincronizzate dal cassetto AdE.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Riconciliazione automatica incassi/pagamenti con estratti conto banca PSD2.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp Marketing",
      text: "Solleciti via WhatsApp Business con template approvati Meta.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Mail,
      title: "Email Marketing",
      text: "Solleciti email transazionali con tracking aperture e click.",
      to: "/funzionalita/email-marketing",
    },
    {
      icon: Zap,
      title: "Automazioni",
      text: "Sequenze multi-step di sollecito programmate per cliente o categoria.",
      to: "/funzionalita/automazioni",
    },
  ],
  familyBonusTitle: "Una sola sorgente delle scadenze. Solleciti che partono da soli.",
  familyBonusText:
    "Quando emetti una fattura, la scadenza nasce nello scadenzario. Quando il cliente paga, la riconciliazione automatica con la banca chiude la posta. Quando il cliente non paga, il sistema lancia il sollecito al giorno -3, 0, +7, +15 senza che tu debba ricordartene. Tu intervieni solo sui casi davvero critici.",

  painKicker: "Il problema vero",
  painH2: "I clienti pagano per ultimi i fornitori che non chiamano. E tu non chiami perché non hai tempo.",
  painSubheadline:
    "Le imprese edili medie hanno 50-200 fatture aperte alla volta. Senza un sistema, le scadenze si dimenticano, i solleciti partono in ritardo o non partono, l'aging cliente è una stima a occhio. Risultato: DSO a 90+ giorni e liquidità che manca quando serve davvero.",
  painPoints: [
    {
      icon: Clock,
      title: "Scadenze dimenticate per giorni o settimane",
      text: "Fattura emessa il 15, scadenza il 15 del mese successivo. Nessuno la ricorda al -3, nessuno chiama al +1, il cliente paga al +30 perché 'tanto nessuno mi chiama'. Liquidità persa, fornitori da pagare con anticipo banca.",
    },
    {
      icon: AlertCircle,
      title: "Solleciti improvvisati e tardivi",
      text: "Quando finalmente segretaria/titolare ricorda, sollecito mandato a casaccio: email troppo dura o troppo morbida, WhatsApp confidenziale che danneggia il rapporto. Senza sequenza strutturata, il sollecito è inefficace o controproducente.",
    },
    {
      icon: TrendingDown,
      title: "Aging report inesistente o a 1 mese fa",
      text: "Quanto dovuto a 0-30 gg, 30-60 gg, oltre 90 gg per cliente? Risposta: 'non lo so esattamente, faccio un giro nei file'. Senza aging in tempo reale, decisioni di credito prese al buio.",
    },
    {
      icon: Phone,
      title: "Titolare che diventa 'ufficio recupero crediti'",
      text: "Il titolare che dovrebbe vendere e gestire cantieri passa 1-2 ore al giorno a chiamare clienti per pagamenti scaduti. Tempo che non torna, lavoro a basso valore, cliente trattato come problema.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi clienti, stesse fatture, stessi importi. Cambia DSO e liquidità.",
  baSubheadline:
    "Lo Scadenzario non cambia la qualità dei tuoi clienti: cambia la frequenza e il tono della comunicazione del credito. I clienti che pagano in ritardo per 'inerzia' iniziano a pagare puntuali. Solo i veri morosi restano da gestire a mano.",
  baAreas: [
    {
      title: "Generazione e tracking scadenze",
      before:
        "Scadenze su Excel manuale o nel gestionale ma senza alert. Il segretario/titolare deve ricordare ogni giorno chi pagare e chi sollecitare. Inevitabilmente qualcuno sfugge.",
      after:
        "Scadenze nascono automaticamente da fatture SDI attive e passive. Alert al titolare il giorno -3 e +1, escalation automatica al +7 e +15. Niente sfugge, niente da ricordare.",
    },
    {
      title: "Solleciti ai clienti morosi",
      before:
        "Sollecito mandato 30 giorni dopo la scadenza, email lunga e fredda, cliente che si offende, rapporto commerciale rovinato. Oppure niente sollecito e attesa indefinita.",
      after:
        "Sequenza multi-step: gentile reminder al -3, sollecito formale al +1 via email, WhatsApp al +7 con tono diretto, telefonata escalation al +15. Tono giusto al momento giusto.",
    },
    {
      title: "Aging report e decisioni di credito",
      before:
        "Aging fatto a fine mese su Excel, già obsoleto al momento dell'analisi. Nuova vendita a cliente con 80.000€ di scaduto perché 'non ricordavo il suo aging'.",
      after:
        "Aging report in dashboard live: per cliente, per fascia (0-30/30-60/60-90/90+), per cantiere. Alert automatico se nuovo preventivo a cliente con scaduto >5.000€.",
    },
    {
      title: "Comunicazione al commercialista",
      before:
        "Commercialista chiede 'mi mandi situazione crediti scaduti per chiusura bilancio?'. Segretaria perde 4 ore a fare l'export, errori inevitabili.",
      after:
        "Commercialista accede direttamente alla dashboard scadenzario, esporta autonomamente XLSX/PDF con scaduti per fascia, valutazione svalutazione crediti, situazione fornitori.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per gestire il credito come un credit manager dedicato.",
  mechanismSubheadline:
    "Lo Scadenzario funziona in modo passivo: una volta configurato, lavora 24/7 senza richiedere intervento. Tu ti svegli e vedi solo le eccezioni che richiedono decisione umana.",
  mechanismSteps: [
    {
      icon: CalendarClock,
      title: "Scadenze nascono automaticamente da fatture",
      text: "Fattura attiva emessa via SDI? Scadenza creata. Fattura passiva sincronizzata dal cassetto? Scadenza fornitore creata. Termine pagamento dedotto da contratto cliente o default impresa.",
    },
    {
      icon: Send,
      title: "Sequenza solleciti multi-canale",
      text: "Configuri una volta la sequenza: -3 gg reminder gentile email, +1 sollecito formale, +7 WhatsApp diretto, +15 escalation a titolare. Tono e canale ottimizzati per fase, mai spam.",
    },
    {
      icon: TrendingUp,
      title: "Riconciliazione automatica e aging live",
      text: "Quando il cliente paga, la banca PSD2 segnala l'incasso, il sistema riconcilia con la fattura, chiude la scadenza. Aging report aggiornato in tempo reale, dashboard sempre vera.",
    },
  ],
  mechanismCta: "Apri la demo Scadenzario",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "DSO -30%, sofferenze -50%, titolare che torna a vendere.",
  commercialBody:
    "Lo Scadenzario non è solo un modulo contabile: è un asset finanziario. Le imprese che lo attivano riducono i giorni medi di incasso del 30%, recuperano il 4% di crediti dalle sofferenze e liberano 20-30 ore al mese del titolare/segreteria.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "DSO ridotto del 30% medio",
      text: "Da 90 a 60 giorni medi di incasso. Liquidità che torna disponibile prima, meno necessità di anticipi banca, meno interessi pagati. Cassa che respira.",
    },
    {
      icon: ShieldCheck,
      title: "Sofferenze recuperate al 4%",
      text: "Crediti che si pensavano persi vengono recuperati grazie a solleciti strutturati: WhatsApp non è invasivo come una telefonata, ma è efficace come una raccomandata.",
    },
    {
      icon: Users,
      title: "Titolare che torna a vendere",
      text: "Il titolare smette di essere 'ufficio recupero crediti' e torna a fare quello per cui è bravo: vendere preventivi, gestire cantieri, sviluppare clienti nuovi.",
    },
    {
      icon: Sparkles,
      title: "Rapporto cliente migliorato",
      text: "Solleciti gentili e tempestivi sono percepiti come professionalità. Il cliente paga puntuale perché 'sa che lo richiameranno', non perché 'lo trattano male'.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "La tua impresa incassa 30 giorni prima. Senza chiamare nessuno.",
  resultsBody:
    "Quando le scadenze sono tracciate in modo automatico e i solleciti partono in sequenza strutturata, il comportamento dei clienti cambia: chi pagava per inerzia inizia a pagare puntuale, chi era moroso strutturale viene identificato presto. Le imprese che attivano lo Scadenzario vedono cambiare 4 dimensioni operative.",
  integrationPillars: [
    {
      icon: Bell,
      title: "Alert pre-scadenza intelligenti",
      text: "Notifiche al titolare al giorno -3 per scadenze sopra soglia, al +1 per ritardi nuovi, al +7 per escalation. Alert mirati, mai spam.",
    },
    {
      icon: Send,
      title: "Solleciti multi-canale automatici",
      text: "Email transazionali, WhatsApp Business con template Meta-approvati, SMS per casi urgenti. Sequenza configurabile per cliente o categoria.",
    },
    {
      icon: Filter,
      title: "Aging report dinamico per fascia",
      text: "0-30 gg, 30-60 gg, 60-90 gg, oltre 90 gg. Per cliente, per cantiere, per categoria. Aggiornato in tempo reale dalla riconciliazione bancaria PSD2.",
    },
    {
      icon: Receipt,
      title: "Export commercialista 1-click",
      text: "Situazione crediti scaduti per chiusura bilancio, valutazione svalutazione, IVA su incassi. Formato CSV/PDF/XBRL pronto per il commercialista.",
    },
  ],
  resultStats: [
    { value: 30, prefix: "-", suffix: "%", label: "giorni medi di incasso (DSO)" },
    { value: 4, prefix: "+", suffix: "%", label: "crediti recuperati su sofferenze" },
    { value: 25, suffix: " h/mese", label: "tempo titolare recuperato dal recupero crediti" },
  ],
  resultsCta: "Apri la demo Scadenzario",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale recuperare il 4% di crediti che oggi vanno in sofferenza?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di fatture aperte e ticket medio per fattura. La stima parte dal 4% di recupero osservato sulle sofferenze grazie al sollecito multi-canale strutturato.",
  roi: {
    input1Label: "Fatture aperte (clienti+fornitori)",
    input1Default: 80,
    input1Min: 10,
    input1Max: 2000,
    input1Step: 5,
    input2Label: "Ticket medio fattura (€)",
    input2Default: 4500,
    input2Min: 500,
    input2Max: 50000,
    input2Step: 100,
    input2Suffix: " €",
    outputLabel: "Recupero annuo stimato",
    computeOutput: (a, b) => Math.round(a * b * 0.04),
    computeSecondary: (a, b) => [
      { label: "Volume crediti gestiti", value: `€ ${(a * b).toLocaleString("it-IT")}` },
      { label: "Riduzione DSO stimata", value: "30%" },
      { label: "Ore titolare recuperate/anno", value: `${25 * 12} h` },
    ],
    closingPitch:
      "Stima prudenziale basata sul 4% di recupero sulle sofferenze osservato sui clienti. Aggiungi il vantaggio finanziario della riduzione DSO (-30 giorni di anticipo banca) e il tempo del titolare che torna a vendere.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un altro tool contabile. Un credit manager virtuale che lavora 24/7.",
  salesBody:
    "Lo Scadenzario Edilizia in Cloud non è un report passivo: è un agente attivo che lavora sui crediti senza pausa. Le imprese che lo attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Liquidità mensile più prevedibile",
      text: "Cassa che entra in modo regolare e prevedibile. Pianificazione pagamenti fornitori e operai senza affanno, senza richiedere anticipi banca all'ultimo minuto.",
    },
    {
      title: "Titolare che torna a vendere",
      text: "Il titolare smette di passare ore a chiamare clienti morosi e torna a generare valore: visite cantieri, preventivi, sviluppo clienti nuovi.",
    },
    {
      title: "Sofferenze identificate presto",
      text: "Aging report live identifica subito i clienti che diventano critici: stop a nuovi cantieri, garanzie aggiuntive richieste, pagamenti progressivi imposti.",
    },
    {
      title: "Rapporti commerciali sani",
      text: "Solleciti gentili e tempestivi sono percepiti come professionalità, non come pressione. I clienti pagano puntuale e il rapporto commerciale resta sano.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Scadenze automatiche da fatture SDI",
      value:
        "Ogni fattura attiva o passiva genera una scadenza automatica con termine pagamento da contratto cliente o default impresa. Niente data entry, niente dimenticanze.",
    },
    {
      label: "Sequenze sollecito multi-step",
      value:
        "Configurabile per cliente o categoria: reminder gentile -3 gg, sollecito formale +1, WhatsApp +7, escalation telefonata +15. Tono e canale ottimizzati per fase.",
    },
    {
      label: "Alert pre-scadenza al titolare",
      value:
        "Notifiche push/email al titolare per scadenze sopra soglia (es. > 10.000€) al giorno -3 e +1. Solo eccezioni, mai spam.",
    },
    {
      label: "Solleciti WhatsApp Business + email + SMS",
      value:
        "Canali multipli con template Meta-approvati. Tracking aperture, click, lettura. Risposte cliente raccolte in inbox unificata.",
    },
    {
      label: "Aging report live in dashboard",
      value:
        "0-30/30-60/60-90/90+ giorni per cliente, cantiere, categoria. Aggiornato in tempo reale da riconciliazione bancaria PSD2.",
    },
    {
      label: "Riconciliazione bancaria PSD2 automatica",
      value:
        "Incassi banca riconciliati automaticamente con scadenze fatture. Match per importo, causale, P.IVA. Tu approvi le ambiguità in 5 secondi.",
    },
    {
      label: "Export commercialista 1-click",
      value:
        "Situazione crediti per fascia, svalutazione crediti per bilancio, IVA su incassi, scaduti per cliente. Formato CSV/PDF/XBRL pronto.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui lo Scadenzario cambia la giornata.",
  scenarios: [
    {
      title: "Cliente abituale che ritarda 'per inerzia'",
      text: "Cliente storico paga a 90 gg per inerzia. Attivi sequenza solleciti: reminder -3 e sollecito +1 partono in automatico. Cliente pagà a 35 gg, scrive 'scusa non avevo visto'. DSO ridotto senza una parola del titolare.",
    },
    {
      title: "Aging report richiesto dalla banca",
      text: "Banca chiede aging clienti per concedere fido. Apri dashboard, esporti aging report PDF con dettaglio per fascia e cliente. Banca lo riceve in 5 minuti, fido approvato in 3 giorni.",
    },
    {
      title: "Nuovo preventivo a cliente moroso",
      text: "Stai per inviare preventivo da 80.000€ a cliente. Sistema avvisa: 'cliente ha 23.000€ scaduto >60 gg'. Decidi di chiedere acconto del 30% prima di iniziare. Il cantiere parte in sicurezza.",
    },
  ],

  testimonialQuote:
    "Avevo crediti scaduti per 95.000€ e nessuno li chiamava perché il titolare ero io e non avevo tempo. Ho attivato lo Scadenzario, ho configurato sequenze WhatsApp+email. In 4 mesi ho recuperato 67.000€ senza fare una telefonata. Adesso il DSO è sceso da 95 a 58 giorni, e mio padre che si occupava dei solleciti torna in pensione vera.",
  testimonialAuthor: "Lorenzo M.",
  testimonialRole: "Costruzioni Marini Srl, Bologna",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "I solleciti automatici non rovinano il rapporto col cliente?",
      a: "Al contrario. Le sequenze sono progettate con tono progressivo: reminder gentile a -3 gg ('le ricordiamo che tra 3 giorni'), sollecito cortese a +1, escalation solo dopo +15 giorni. La maggior parte dei clienti paga al primo reminder e ringrazia di essere stato avvisato.",
    },
    {
      q: "WhatsApp Business per i solleciti è legale?",
      a: "Sì, se usi template approvati Meta per messaggi transazionali (e i nostri lo sono) e se il cliente ha consenso commerciale tramite contratto firmato. Il sistema rispetta GDPR, traccia consensi, fornisce opt-out automatico in ogni messaggio.",
    },
    {
      q: "Si integra con la mia banca per riconciliare gli incassi?",
      a: "Sì. Connessione PSD2 con tutte le principali banche italiane (Intesa, Unicredit, BPER, Banco BPM, Crédit Agricole, ecc.). Gli incassi vengono importati automaticamente e riconciliati con le scadenze per importo, P.IVA e causale.",
    },
    {
      q: "Posso configurare termini diversi per ogni cliente?",
      a: "Sì. Per ogni cliente configuri termine pagamento (30/60/90 gg da fattura o data fattura), modalità sollecito (gentile/formale/aggressivo) e canali abilitati (email/WhatsApp/SMS). Tutto deriva dal contratto firmato in fase di acquisizione.",
    },
    {
      q: "Lo scadenzario funziona anche per le scadenze fornitori?",
      a: "Sì. Le fatture passive sincronizzate dal cassetto SDI generano scadenze fornitori con alert pre-scadenza al titolare/CFO. Pianifichi pagamenti, eviti ritardi che generano interessi di mora, mantieni rapporti sani con i fornitori.",
    },
    {
      q: "Quanto costa? Ci sono limiti su numero di solleciti?",
      a: "Lo Scadenzario è incluso nei piani Professional e Business di Edilizia in Cloud. Numero illimitato di scadenze e solleciti email. WhatsApp Business e SMS hanno costi a consumo trasparenti (a partire da 0,03€ per messaggio).",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Lo Scadenzario è il cuore finanziario di un sistema più ampio.",
  internalLinksBody:
    "Scadenze, solleciti e riconciliazioni si alimentano da fatturazione, cassetto fiscale, tesoreria, WhatsApp e email marketing.",
  internalLinks: [
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture SDI generano scadenze automatiche nello scadenzario." },
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto Fiscale SDI", text: "Fatture passive popolano scadenze fornitori dallo scadenzario." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Riconciliazione bancaria PSD2 chiude le scadenze automaticamente." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Solleciti via WhatsApp Business con template approvati Meta." },
    { to: "/funzionalita/email-marketing", title: "Email Marketing", text: "Solleciti email transazionali con tracking aperture." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Sequenze multi-step di sollecito programmate e personalizzate." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "DSO, aging e sofferenze nel dashboard direzionale." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Scadenzario incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di chiamare clienti per soldi. Inizia a incassare 30 giorni prima.",
  finalCtaBody:
    "31 giorni gratuiti per portare lo Scadenzario dentro la tua impresa edile. Setup in 48 ore, sequenze sollecito multi-canale, aging report live e riconciliazione PSD2 incluse. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · DSO -30% medio · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Scadenzario",
  stickyCtaMicrocopy: "Setup 48h · Solleciti automatici",

  applicationSubCategory: "Construction Accounts Receivable Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function Scadenzario() {
  return <FunzionalitaPageTemplate config={config} />;
}
