import {
  AlertTriangle,
  Bell,
  BookOpen,
  Code,
  GitBranch,
  HardHat,
  Hourglass,
  Layers,
  Mail,
  MessageCircle,
  PlayCircle,
  Receipt,
  Settings,
  ShieldCheck,
  TimerReset,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "automazioni",
  definizione:
    "Le Automazioni di Edilizia in Cloud sono flussi di lavoro senza codice per imprese edili: oltre trenta eventi scatenanti su cantieri, SAL, fatture e scadenze, azioni via email, WhatsApp, attività e notifiche, e una libreria di oltre cinquanta modelli pronti per il settore.",
  vertical: "Automazioni",
  productName: "Automazioni Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che vogliono eliminare il lavoro ripetitivo di segreteria e capocantiere con workflow automation no-code, trigger su eventi cantiere, SAL, fatture e scadenze",
  audienceShort: "imprese edili che vogliono automatizzare il lavoro ripetitivo",

  seo: {
    title:
      "Automazioni Edilizia: Workflow No-Code per Imprese",
    description:
      "Automazioni no-code per imprese edili: trigger su eventi cantiere/SAL/fatture/scadenze, azioni email/WhatsApp/task/notifiche, libreria template settoriali.",
    keywords:
      "automazioni edilizia, workflow automation impresa edile, no-code edilizia, trigger cantiere automatico, automazioni sal scadenze, zapier edilizia, ifttt impresa costruzioni, automation builder edile",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Automazioni",
  heroH1Lead: "Il lavoro ripetitivo di segreteria",
  heroH1Highlight: "lo fa il sistema",
  heroH1Tail: "non più tu",
  heroSubheadline:
    "Workflow automation no-code per imprese edili italiane: 30+ trigger su eventi cantiere/SAL/fatture/scadenze, azioni email/WhatsApp/task/notifiche, libreria di 50+ template pronti per il settore. Configuri in 5 minuti senza scrivere codice. Ogni automazione attiva risparmia in media 1,5 ore di segreteria a settimana.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore, niente codice",
    "50+ template pronti settoriali",
    "Risparmio medio 1,5h/sett per automazione",
  ],
  proofPoints: [
    "30+ trigger nativi su moduli edili",
    "Azioni email/WhatsApp/task/notifiche",
    "Logging e audit trail completo",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare il lavoro ripetitivo di segreteria e capocantiere"],
    ["Momento chiave", "Ogni evento cantiere, scadenza fattura, milestone SAL"],
    ["Risultato", "Tempo recuperato per il lavoro vero, niente cose dimenticate"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano le Automazioni per eliminare il lavoro ripetitivo di segreteria.",
  betaBody:
    "Le Automazioni sono già pronte: le attiviamo in 48 ore mappando i tuoi processi attuali, configurando le prime 8 automazioni più impattanti (reminder fatture, follow-up preventivi, notifiche SAL, scadenze visite mediche), e ti accompagniamo in 3 sessioni 1-a-1 fino a quando il sistema lavora da solo.",

  speedH2:
    "L'impresa edile media spreca 12 ore a settimana di segreteria in attività ripetitive. Sono 600 ore l'anno.",
  speedSubheadline:
    "Reminder fatture insolute, follow-up preventivi, notifiche cliente sui SAL, comunicazioni capocantiere su scadenze: tutto fatto a mano, ogni giorno, in modo soggetto a errori e dimenticanze. Le Automazioni prendono questi processi e li mettono in pilota automatico, lasciando alla persona solo l'eccezione.",
  speedStats: [
    { value: 1.5, suffix: " h/sett", label: "risparmiate per ogni automazione attiva" },
    { value: 50, prefix: "+", suffix: "", label: "template settoriali pronti" },
    { value: 12, prefix: "+", suffix: " h/sett", label: "lavoro ripetitivo recuperato in media" },
  ],

  familyH2: "Le Automazioni collegano tutta la piattaforma Edilizia in Cloud.",
  familySubheadline:
    "Le Automazioni non sono un modulo isolato: sono il sistema nervoso che fa parlare tra loro Cantieri, Fatturazione, CRM, WhatsApp, Email. Ogni evento può triggerare azioni in altri moduli, senza data entry duplicato e senza dimenticanze.",
  familyItems: [
    {
      icon: Workflow,
      title: "Automazioni",
      text: "Workflow no-code con trigger su eventi cantiere, fatture, SAL, scadenze.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Eventi cantiere (avvio, milestone, chiusura) come trigger di automazioni multi-step.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Trigger su scadenze, insoluti, pagamenti per reminder automatici e dunning.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Mail,
      title: "Email Marketing",
      text: "Le automazioni lanciano sequenze email post-cantiere e nurturing lead.",
      to: "/funzionalita/email-marketing",
    },
    {
      icon: MessageCircle,
      title: "WhatsApp Marketing",
      text: "Trigger automatici per notifiche WhatsApp Business su eventi cantiere.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Trigger su pipeline: preventivo inviato → reminder a 7gg, lead nuovo → notifica titolare.",
      to: "/funzionalita/crm-edilizia",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Trigger ovunque. Azioni ovunque. Niente integrazioni esterne.",
  familyBonusText:
    "Niente Zapier, niente Make, niente integrazioni con webhook che si rompono. Tutti i moduli vivono nella stessa piattaforma, quindi un evento Cantiere può triggerare un'azione Fatturazione, che a sua volta lancia una sequenza Email Marketing, che notifica il CRM. Tutto nativo, tutto stabile, tutto loggato.",

  painKicker: "Il problema vero",
  painH2:
    "12 ore a settimana di segreteria in attività che il sistema potrebbe fare in 2 secondi.",
  painSubheadline:
    "L'impresa edile media ha una segreteria che brucia 60% del tempo in attività ripetitive: reminder fatture insolute, mail follow-up preventivi, notifiche cliente sui SAL, alert al capocantiere su visite mediche scadute. Tutto fatto a mano, tutto soggetto a dimenticanze, tutto al costo di 30 €/h.",
  painPoints: [
    {
      icon: Hourglass,
      title: "Reminder fatture fatti a mano (e dimenticati)",
      text: "La segreteria controlla ogni mattina lo scadenzario, manda email di sollecito una a una, scrive WhatsApp, fa chiamate. Quando il volume cresce, alcune fatture restano insolute settimane perché nessuno se n'è ricorda. Migliaia di euro in cassa persi.",
    },
    {
      icon: AlertTriangle,
      title: "Follow-up preventivi che non parte mai",
      text: "Mandato il preventivo, la palla è in mano al cliente. Se non risponde entro 5 giorni, dovresti richiamare. In pratica nessuno richiama: tutti hanno cose più urgenti da fare. Tasso di accettazione si dimezza solo per mancato follow-up.",
    },
    {
      icon: Settings,
      title: "Zapier/Make complessi e che si rompono",
      text: "Provi a fare automazioni con Zapier, configurare webhook, mappare campi tra Mailchimp, Google Sheets, fatturazione, CRM. Funziona 3 mesi poi un'integrazione cambia API e tutto si rompe. Tornare a fare a mano sembra meno doloroso.",
    },
    {
      icon: Bell,
      title: "Scadenze obbligatorie dimenticate",
      text: "Visita medica operaio scaduta, DPI da rinnovare, formazione lavoratori da ripetere, certificato CCIAA da rinnovare. Senza alert automatici, le scadenze critiche arrivano a sorpresa. In caso di ispezione, multe immediate.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stessi processi, stesse persone. Cambia chi fa il lavoro: il sistema, non più la segreteria.",
  baSubheadline:
    "Le Automazioni non aggiungono lavoro: tolgono. Trasformano processi ripetitivi in workflow stabili che girano 24/7 senza intervento umano. La persona resta libera per gestire le eccezioni, dove serve davvero giudizio.",
  baAreas: [
    {
      title: "Reminder fatture insolute",
      before:
        "Segreteria controlla scadenzario ogni mattina, manda email di sollecito a mano, alcune fatture restano insolute settimane perché ci si dimentica. DSO medio 87 giorni, cassa sempre tirata.",
      after:
        "Automazione triggera su scadenza fattura: a +1 giorno reminder gentile, a +7 sollecito formale, a +14 alert WhatsApp al titolare. DSO scende a 52 giorni, +18% di liquidità in cassa.",
    },
    {
      title: "Follow-up preventivi pendenti",
      before:
        "Preventivo mandato, nessun ricontatto. Cliente dimentica, va da concorrente, perdi il lavoro. Tasso accettazione 22%, niente sistema strutturato.",
      after:
        "Automazione: preventivo inviato → reminder email a 5gg, WhatsApp a 12gg, task per il commerciale a 20gg. Tasso accettazione sale al 36%, +14 punti senza assumere nessuno.",
    },
    {
      title: "Notifiche cliente sui SAL",
      before:
        "SAL emesso, segreteria deve avvisare il cliente, mandare email, chiamare per dire che è da firmare. Spesso si dimentica, cliente non firma, cantiere si blocca per pagamento fornitori.",
      after:
        "Automazione: SAL emesso → email cliente con link firma + WhatsApp reminder a 24h se non firma. Cliente firma in 1 giorno, fornitori pagati puntuale.",
    },
    {
      title: "Scadenze sicurezza e formazione",
      before:
        "Visite mediche operai, formazione lavoratori, DPI scadenze tracciate su Excel. Si dimenticano, scoperte solo durante ispezione INL. Sanzioni immediate, blocco cantiere.",
      after:
        "Automazione: visita medica a -30 giorni → alert RSPP, a -7 giorni → email operaio, a +1 giorno scaduta → blocco accesso cantiere. Conformità D.Lgs 81/2008 garantita.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: scegli trigger, scegli azioni, attivi. Niente codice.",
  mechanismSubheadline:
    "Ogni automazione è un workflow visuale: scegli un evento (trigger), aggiungi azioni a cascata, definisci condizioni e ritardi. L'editor è drag&drop, niente conoscenze tecniche, niente webhook da configurare a mano.",
  mechanismSteps: [
    {
      icon: PlayCircle,
      title: "Scegli un trigger dalla libreria",
      text: "30+ eventi nativi: cantiere creato, SAL emesso, fattura scaduta, preventivo inviato, lead aggiunto al CRM, scadenza visita medica, milestone cantiere completata. Click, scegli, vai.",
    },
    {
      icon: GitBranch,
      title: "Aggiungi azioni e condizioni a cascata",
      text: "Manda email, manda WhatsApp, crea task, notifica utente, aggiorna campo CRM, emetti documento. Combina con condizioni 'se' e ritardi 'attendi N giorni'. Workflow multi-step in 5 minuti.",
    },
    {
      icon: Zap,
      title: "Attivi e monitori in tempo reale",
      text: "L'automazione gira 24/7. Reportistica live: quante volte è partita, quante azioni eseguite, quante andate in errore. Logging completo per audit. Disabili con un click se serve.",
    },
  ],
  mechanismCta: "Apri la libreria automazioni",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Ogni automazione attiva risparmia 1,5h/sett. 10 automazioni = 600 ore l'anno recuperate.",
  commercialBody:
    "Le Automazioni non sono un nice-to-have: sono il moltiplicatore di efficienza più potente in una piccola/media impresa edile. Una segreteria con automazioni gestisce il doppio del volume senza assumere nessuno, mentre la qualità dei processi sale (zero dimenticanze).",
  commercialLevers: [
    {
      icon: TimerReset,
      title: "1,5 ore a settimana per automazione",
      text: "Un reminder fatture risparmia 1,5h. Un follow-up preventivi 2h. Un workflow scadenze sicurezza 3h. La media osservata sui clienti è 1,5h per automazione attiva, ricorrente.",
    },
    {
      icon: TrendingUp,
      title: "Zero dimenticanze, processi affidabili",
      text: "Il sistema non dimentica mai: né la fattura scaduta, né il preventivo da richiamare, né la visita medica scaduta. Per un'impresa edile la cui qualità di processo dipende dalla memoria della segreteria, è una rivoluzione.",
    },
    {
      icon: Code,
      title: "No-code, niente Zapier, niente bug",
      text: "Tutto nativo dentro Edilizia in Cloud, nessuna integrazione esterna che si rompe quando un'API cambia. Editor drag&drop, attivi un'automazione in 5 minuti senza chiamare l'IT.",
    },
    {
      icon: ShieldCheck,
      title: "Audit trail completo",
      text: "Ogni automazione logga ogni esecuzione: quando, su quale record, con quale risultato. In caso di contestazione cliente, puoi dimostrare di aver mandato il reminder X il giorno Y.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "La segreteria smette di rincorrere. Il titolare non controlla più tutto a mano.",
  resultsBody:
    "Le imprese che attivano almeno 5 automazioni nei primi 60 giorni vedono cambiare 4 metriche: DSO scende del 30-40%, tasso accettazione preventivi sale del 12-15%, ore segreteria recuperate sopra le 8/settimana, scadenze critiche dimenticate vanno a zero.",
  integrationPillars: [
    {
      icon: Layers,
      title: "Libreria 50+ template pronti",
      text: "Reminder fatture, follow-up preventivi, notifiche SAL, alert sicurezza, sequenze post-cantiere, onboarding cliente. Pronti all'uso, personalizzabili in 5 minuti.",
    },
    {
      icon: GitBranch,
      title: "Workflow multi-step con condizioni",
      text: "If-then-else, attesa N giorni, branch per segmento. Logica complessa con UI semplice, niente codice.",
    },
    {
      icon: BookOpen,
      title: "Onboarding e best practice incluse",
      text: "Durante il setup mappiamo i tuoi processi attuali e attiviamo le 8 automazioni più impattanti. Niente partire dal foglio bianco: parti dai processi standard del settore.",
    },
    {
      icon: ShieldCheck,
      title: "Logging e audit trail",
      text: "Ogni esecuzione loggata: data, ora, record coinvolto, risultato. Esportabile in CSV per analisi e per audit interni o ispezioni.",
    },
  ],
  resultStats: [
    { value: 12, prefix: "+", suffix: " h/sett", label: "tempo segreteria recuperato in media" },
    { value: 36, prefix: "-", suffix: "%", label: "DSO medio dopo 90 giorni" },
    { value: 14, prefix: "+", suffix: "%", label: "tasso accettazione preventivi" },
  ],
  resultsCta: "Apri la dashboard Automazioni",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto recuperi se metti in pilota automatico il lavoro ripetitivo?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di automazioni che pensi di attivare e costo orario interno (segreteria/back-office). La stima parte da 1,5h/sett risparmiate per automazione, ricorrente per 52 settimane l'anno.",
  roi: {
    input1Label: "Automazioni attive",
    input1Default: 10,
    input1Min: 5,
    input1Max: 100,
    input1Step: 1,
    input2Label: "Costo orario interno (€)",
    input2Default: 30,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * 1.5 * b),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 52 * 1.5)} h` },
      { label: "Ore recuperate/settimana", value: `${Math.round(a * 1.5)} h` },
      { label: "Riduzione DSO stimata", value: "30-40%" },
    ],
    closingPitch:
      "Stima conservativa: 1,5h/sett risparmiate per automazione × 52 settimane × costo orario. Aggiungi DSO ridotto e tasso accettazione preventivi più alto: il ROI è doppio.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Niente più 'mi sono dimenticato'. Niente più 'ci penso io'. Il sistema lo fa.",
  salesBody:
    "Le Automazioni cambiano 4 dimensioni operative: come gestisci scadenze, come segui il commerciale, come gestisci la cassa, come tieni sotto controllo la sicurezza obbligatoria.",
  salesImpact: [
    {
      title: "Cassa più sana grazie al dunning automatico",
      text: "Ogni fattura ha sequenza di reminder automatica: a +1, +7, +14 giorni dalla scadenza. DSO scende del 30-40%, cassa più stabile, nessuna fattura insoluta dimenticata.",
    },
    {
      title: "Pipeline commerciale che non perde lead",
      text: "Preventivo inviato triggera follow-up automatici a 5, 12, 20 giorni. Lead caldo non si raffredda perché ti dimentichi di richiamare. +14 punti tasso accettazione.",
    },
    {
      title: "Conformità sicurezza garantita",
      text: "Visite mediche, formazione, DPI: tutte le scadenze obbligatorie sono monitorate. Alert a -30 e -7 giorni. In caso di ispezione INL hai tutto documentato.",
    },
    {
      title: "Cliente sempre informato",
      text: "Eventi cantiere triggerano notifiche automatiche al cliente: SAL pronto, milestone completata, fattura emessa. Il cliente vive il cantiere in trasparenza, smette di chiamare.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non promesse generiche. Un elenco concreto di quello che attivi in 48 ore.",
  featureRows: [
    {
      label: "30+ trigger nativi sui moduli edili",
      value:
        "Eventi cantiere, SAL, fatture, preventivi, lead CRM, scadenze sicurezza, milestone, fornitori. Tutti nativi, niente webhook esterni.",
    },
    {
      label: "Libreria 50+ template settoriali pronti",
      value:
        "Reminder fatture, follow-up preventivi, notifiche SAL, alert sicurezza, sequenze post-cantiere, onboarding cliente, dunning, scadenze CCIAA.",
    },
    {
      label: "Editor visuale drag&drop",
      value:
        "UI no-code per creare workflow multi-step. Trigger → condizione → azione → attesa → azione. Configuri un'automazione in 5 minuti senza codice.",
    },
    {
      label: "Azioni: email, WhatsApp, task, notifiche, aggiornamenti",
      value:
        "Manda email/WhatsApp, crea task, notifica utenti, aggiorna campi record, emetti documenti. Combinabili in workflow complessi.",
    },
    {
      label: "Condizioni e branch logici",
      value:
        "If-then-else basati su valore record, segmento cliente, importo. Branch diversi per scenari diversi, tutto nello stesso workflow visuale.",
    },
    {
      label: "Logging e audit trail completo",
      value:
        "Ogni esecuzione loggata con timestamp, record coinvolto, risultato. Esportabile in CSV. Perfetto per audit interni e ispezioni.",
    },
    {
      label: "Onboarding 1-a-1 e setup template",
      value:
        "Durante l'onboarding mappiamo i tuoi processi e attiviamo le 8 automazioni più impattanti. Parti già con il sistema che lavora, non da un foglio bianco.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui le Automazioni cambiano la giornata della segreteria.",
  scenarios: [
    {
      title: "Dunning automatico fattura insoluta",
      text: "Fattura da 18.000 € scaduta da 3 giorni. Automazione manda email gentile al cliente con copia fattura. Niente risposta a +7 giorni: parte sollecito formale firmato dal titolare. A +14 giorni alert WhatsApp al titolare per chiamare. Cassa rientra in 12 giorni invece di 45.",
    },
    {
      title: "Follow-up preventivo a cliente indeciso",
      text: "Preventivo da 42.000 € inviato 5 giorni fa, nessuna risposta. Automazione manda email con caso studio simile + recensione cliente. A 12 giorni invia WhatsApp 'posso passare in cantiere venerdì?'. Cliente risponde, sopralluogo confermato, cantiere firmato.",
    },
    {
      title: "Alert visita medica scaduta",
      text: "Visita medica operaio in scadenza tra 30 giorni. Automazione notifica RSPP. A -7 giorni email all'operaio con appuntamento già prenotato. Se a +1 giorno non è stata fatta, blocca accesso cantiere fino a regolarizzazione. Conformità D.Lgs 81/2008 senza pensieri.",
    },
  ],

  testimonialQuote:
    "Avevo una segreteria che bruciava il 70% del tempo a mandare reminder fatture e follow-up preventivi. Con le Automazioni il sistema fa tutto da solo. Lei ora si occupa del lavoro vero, e io non controllo più tutto a mano. Recuperate 15 ore a settimana, DSO sceso del 35%.",
  testimonialAuthor: "Roberto C.",
  testimonialRole: "Costruzioni Veneto Srl, Padova",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di attivare le Automazioni.",
  faqs: [
    {
      q: "Devo saper programmare per usarle?",
      a: "No. L'editor è completamente drag&drop, no-code. Scegli trigger dalla libreria, aggiungi azioni a cascata, definisci condizioni. Il setup di un'automazione richiede 5 minuti, niente conoscenze tecniche.",
    },
    {
      q: "Si integra con Zapier o Make?",
      a: "Non serve. Tutti i moduli (Cantieri, Fatturazione, CRM, WhatsApp, Email) vivono nella stessa piattaforma, quindi le automazioni sono native. Per integrazioni con sistemi esterni (es. banca, gestionale di terze parti) abbiamo connettori dedicati.",
    },
    {
      q: "Cosa succede se un'automazione va in errore?",
      a: "Il sistema logga l'errore, riprova automaticamente fino a 3 volte, poi notifica l'amministratore. Non c'è rischio di perdere eventi: tutto è tracciato e può essere rieseguito manualmente. Audit trail completo.",
    },
    {
      q: "Posso modificare un'automazione attiva senza fermarla?",
      a: "Sì. Puoi modificare in qualsiasi momento un'automazione attiva: le esecuzioni in corso completano con la versione vecchia, le nuove esecuzioni partono con la versione aggiornata. Niente downtime.",
    },
    {
      q: "Quanti workflow posso creare?",
      a: "Illimitati. Nei piani Professionista e Impresa AI non ci sono limiti al numero di automazioni attive né al numero di esecuzioni. Le imprese più strutturate arrivano a 40-60 automazioni attive.",
    },
    {
      q: "C'è un onboarding per partire bene?",
      a: "Sì. Durante l'onboarding mappiamo i tuoi processi attuali e configuriamo insieme le 8 automazioni più impattanti per la tua impresa. Parti già con il sistema che lavora, non con un foglio bianco.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Le Automazioni sono il sistema nervoso che collega tutti i moduli.",
  internalLinksBody:
    "Le Automazioni vivono dentro Cantieri, Fatturazione, CRM, Marketing. Ecco gli altri pezzi della piattaforma che le rendono potenti.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Eventi cantiere come trigger di automazioni multi-step." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica SDI", text: "Trigger su scadenze e insoluti per dunning automatico." },
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Trigger su pipeline preventivi e nuovi lead." },
    { to: "/funzionalita/email-marketing", title: "Email Marketing", text: "Sequenze email triggerate dalle automazioni." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Notifiche WhatsApp automatiche su eventi cantiere." },
    { to: "/funzionalita/sicurezza-cantiere", title: "Sicurezza Cantiere", text: "Alert automatici su visite mediche e scadenze sicurezza." },
    { to: "/funzionalita/agenti-ai", title: "Agenti AI", text: "AI agents che eseguono task complessi nelle automazioni." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI delle automazioni nel dashboard executive." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di pagare la segreteria per fare cose che il sistema può fare in 2 secondi.",
  finalCtaBody:
    "31 giorni gratuiti per mettere le tue Automazioni in pilota automatico. 50+ template settoriali, editor no-code, onboarding 1-a-1 con configurazione delle 8 automazioni più impattanti. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · No-code · 50+ template pronti",

  stickyCtaLabel: "Prova gratis Automazioni",
  stickyCtaMicrocopy: "Setup 48h · 1,5h risparmiate/sett",

  applicationSubCategory: "Construction Workflow Automation Software",

  relatedBlogSlugs: [
    "delegare-impresa-edile-senza-perdere-controllo",
    "digitalizzare-impresa-edile",
    "excel-whatsapp-carta-gestione-impresa-edile",
  ],
};

export default function Automazioni() {
  return <FunzionalitaPageTemplate config={config} />;
}
