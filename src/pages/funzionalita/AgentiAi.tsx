import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  ClipboardList,
  Database,
  FileText,
  HardHat,
  HeadphonesIcon,
  LineChart,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "agenti-ai",
  vertical: "Agenti AI per Edilizia",
  productName: "Agenti AI Edilizia in Cloud",
  audience: "Imprese edili strutturate, general contractor, ristrutturatori che vogliono delegare risposta clienti, segreteria, follow-up e analisi dati a un'intelligenza artificiale dedicata",
  audienceShort: "imprese edili moderne",

  seo: {
    title:
      "Agenti AI per Imprese Edili",
    description:
      "Agenti AI custom addestrati sui dati della tua impresa edile: rispondono a clienti su WhatsApp, qualificano lead, fanno follow-up preventivi, riassumono…",
    keywords:
      "agente AI edilizia, intelligenza artificiale impresa edile, AI per cantieri, chatbot AI edilizia, AI assistente CRM edilizia, automazione AI edile, AI generativa imprese edili, AI follow-up preventivi, AI WhatsApp edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/agenti-ai-og.jpg",
  },

  heroBadge: "Funzionalità · Agenti AI",
  heroH1Lead: "Un'intelligenza artificiale che lavora con te,",
  heroH1Highlight: "non al posto tuo",
  heroH1Tail: "su clienti, preventivi e cantieri",
  heroSubheadline:
    "Agenti AI addestrati sui dati della tua impresa edile: rispondono a clienti su WhatsApp 24/7, qualificano lead, fanno follow-up preventivi, riassumono lo stato dei cantieri, generano report tecnici e commerciali. Privacy totale: i tuoi dati non vengono mai usati per addestrare modelli di terzi.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Privacy GDPR-first", "Addestrato sui tuoi dati"],
  proofPoints: [
    "Agenti AI custom per impresa",
    "Privacy AI: dati mai condivisi",
    "Risponde su WhatsApp 24/7",
  ],

  objectiveRow: [
    ["Obiettivo", "Delegare lavoro ripetitivo a un'AI dedicata sui tuoi dati"],
    ["Momento chiave", "Risposta a cliente fuori orario, follow-up preventivi, briefing"],
    ["Risultato", "Tecnico/segretaria/commerciale liberi per il lavoro vero"],
  ],

  betaH2: "Più di 320 imprese italiane stanno integrando Agenti AI nei loro flussi commerciali e di cantiere.",
  betaBody:
    "Gli Agenti AI di Edilizia in Cloud non sono ChatGPT generici: sono agenti custom addestrati sui dati specifici della tua impresa (anagrafica clienti, listini, preventivi storici, FAQ, manuali interni). Lo attiviamo in 48 ore, integriamo i canali (WhatsApp Business, email, chat sito web), configuriamo il primo agente (es. Risposta Lead) e ti accompagniamo in 4 sessioni 1-a-1 fino al rilascio in produzione.",

  speedH2: "L'AI non sostituisce le persone. Le libera dal lavoro che non vogliono fare.",
  speedSubheadline:
    "Il 60% del tempo della segreteria di un'impresa edile è speso a ripetere le stesse 20 risposte: 'quando passate per il sopralluogo?', 'è arrivata la fattura?', 'quanto manca al cantiere?'. Un agente AI custom risponde meglio, più in fretta, 24/7. Le persone tornano a fare il lavoro per cui sono pagate.",
  speedStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo segreteria su risposte ripetitive" },
    { value: 24, suffix: "/7", label: "disponibilità degli agenti AI custom" },
    { value: 95, prefix: "+", suffix: "%", label: "soddisfazione clienti misurata sui dialoghi AI" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata agli Agenti AI.",
  familySubheadline:
    "Gli Agenti AI non sono un chatbot generico: sono integrati nativamente con CRM, preventivi, cantieri, fatturazione, WhatsApp e email. Quando un cliente chiede 'a che punto è il mio cantiere?', l'agente sa rispondere con dati reali aggiornati, non con frasi standard.",
  familyItems: [
    {
      icon: BrainCircuit,
      title: "Agenti AI",
      text: "Agenti custom addestrati sui dati della tua impresa: clienti, preventivi, cantieri, FAQ.",
      to: "/funzionalita/agenti-ai",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp Marketing",
      text: "Agenti AI che rispondono direttamente su WhatsApp Business 24/7 con brand voice tua.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Workflow,
      title: "Automazioni",
      text: "Flow builder visuale che integra agenti AI come step nelle automazioni CRM e cantiere.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Follow-up preventivi automatico con agente AI che chiede update al cliente.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Briefing AI sullo stato cantieri, riassunti del giornale lavori, alert intelligenti.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "L'agente AI qualifica lead, sintetizza interazioni, suggerisce azioni commerciali.",
      to: "/funzionalita/crm-edilizia",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Agenti AI integrati nativamente.",
  familyBonusText:
    "Gli Agenti AI non sono un add-on a parte: sono parte di Edilizia in Cloud. Quando un agente risponde a un cliente, può consultare in tempo reale lo stato cantiere, l'anagrafica, lo storico preventivi, le fatture emesse. È un assistente che conosce la tua azienda, non un ChatGPT con accesso limitato.",

  painKicker: "Il problema vero",
  painH2: "La tua segretaria spende metà del tempo a ripetere le stesse 20 risposte.",
  painSubheadline:
    "L'impresa edile media riceve 60-80 messaggi cliente al giorno tra WhatsApp, email, telefono. Il 70% sono richieste ripetitive: stato avanzamento, scadenze, contatti. Senza un agente AI dedicato, finisce tutto sulla segretaria o peggio sul titolare. Tempo bruciato, attenzione tolta al lavoro vero.",
  painPoints: [
    {
      icon: Phone,
      title: "Risposte fuori orario perse",
      text: "Cliente scrive su WhatsApp alle 21:30 'a che ora passate domani?'. Risposta arriva il giorno dopo alle 9. Cliente nel frattempo ha chiesto al concorrente. Senza presenza fuori orario, perdi anche la trattativa più calda.",
    },
    {
      icon: Timer,
      title: "Segretaria sommersa di richieste ripetitive",
      text: "60-80 messaggi al giorno, di cui il 70% richieste ripetitive: 'quanto manca?', 'ricevuta fattura?', 'sopralluogo confermato?'. La segretaria non riesce più a fare il lavoro vero (preventivi, ordini, archivio).",
    },
    {
      icon: AlertTriangle,
      title: "Lead non qualificati che rubano tempo al commerciale",
      text: "Il commerciale richiama 30 lead a settimana, scopre che 20 sono curiosi, 5 fuori target, 5 davvero interessati. 25 ore perse a qualificare al telefono ciò che un agente AI farebbe in 5 minuti via chat.",
    },
    {
      icon: FileText,
      title: "Briefing cantieri scritti a mano dal capocantiere",
      text: "Il capocantiere passa 30 min al giorno a scrivere il riassunto giornaliero per il titolare. Spesso lo dimentica, spesso lo fa male. Senza riassunto, il titolare deve chiamare per capire dove sta andando il cantiere.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesso volume di messaggi, stessi clienti, stessi cantieri. Cambia chi risponde.",
  baSubheadline:
    "Gli Agenti AI non sono un'idea futurista: sono operativi oggi, in produzione su decine di nostre imprese clienti. Ecco cosa cambia concretamente nelle 4 dimensioni che pesano di più sulla giornata di un titolare.",
  baAreas: [
    {
      title: "Risposta clienti su WhatsApp",
      before:
        "Segretaria risponde tra una telefonata e l'altra, fuori orario nessuno risponde, cliente passa al concorrente. Tempo medio di risposta 4-12 ore.",
      after:
        "Agente AI risponde in 5 secondi 24/7 con brand voice della tua impresa. Sa rispondere a 'a che punto è il cantiere?', 'quando arriva la fattura?', 'sopralluogo confermato?'. Escalation umana solo quando serve.",
    },
    {
      title: "Qualifica lead nuovi",
      before:
        "Commerciale richiama tutti, perde tempo su 70% di lead non qualificati, chiude i 30% qualificati con ritardo. Cassa commerciale dispersa.",
      after:
        "Agente AI ingaggia il lead in chat, fa 5 domande di qualifica (zona, budget, tempistica, tipo intervento), passa al commerciale solo i lead caldi e già qualificati. Tempo commerciale 3x più produttivo.",
    },
    {
      title: "Follow-up preventivi tiepidi",
      before:
        "Mandi 30 preventivi al mese, ricordi di richiamare 8, chiudi 6. 22 preventivi muoiono di silenzio. Tasso di chiusura 20%.",
      after:
        "Agente AI fa follow-up automatico a 3, 7, 14 giorni con messaggi personalizzati basati sul contenuto del preventivo e sulla storia del cliente. Tasso di chiusura sale al 32-38%.",
    },
    {
      title: "Briefing operativo cantieri",
      before:
        "Capocantiere scrive briefing testuale a fine giornata (quando lo fa). Titolare deve leggerli o chiamare per capire stato. 30 min/giorno persi a entrambi i lati.",
      after:
        "Agente AI legge automaticamente giornale lavori, foto, timbrature, costi e produce un briefing strutturato per il titolare ogni mattina alle 8: stato cantieri, alert, priorità del giorno. 30 min × 2 = 1 ora recuperata al giorno.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, un agente AI custom in produzione in 48 ore.",
  mechanismSubheadline:
    "Gli Agenti AI di Edilizia in Cloud non sono ChatGPT generici: sono agenti specializzati addestrati sui dati della tua impresa. Setup guidato 1-a-1 fino al go-live.",
  mechanismSteps: [
    {
      icon: Database,
      title: "Addestriamo l'AI sui tuoi dati specifici",
      text: "L'agente conosce la tua anagrafica clienti, listini, preventivi storici, FAQ interne, manuali tecnici, scadenze contrattuali, calendario sopralluoghi. Niente risposte generiche: l'AI parla del tuo business.",
    },
    {
      icon: Workflow,
      title: "Configuri il ruolo e i canali",
      text: "Scegli che ruolo deve avere (Risposta Lead WhatsApp, Follow-up Preventivi, Briefing Operativo, Assistente Tecnico, Customer Care). Decidi i canali (WhatsApp, email, chat sito) e i limiti di autonomia.",
    },
    {
      icon: ShieldCheck,
      title: "Vai in produzione con audit umano",
      text: "L'agente lavora in produzione, ogni dialogo è auditabile, l'escalation a umano è sempre possibile. Tu sei sempre l'autorità finale: l'AI propone, l'umano approva quando serve.",
    },
  ],
  mechanismCta: "Prova un agente AI gratis sul tuo CRM",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Un agente AI sostituisce 0,5 FTE di segreteria al costo di un caffè al giorno.",
  commercialBody:
    "Una segreteria part-time a tempo determinato costa 18.000-22.000€/anno. Un agente AI custom Edilizia in Cloud è incluso nei piani Business. Il calcolo non è solo economico: è operativo. L'AI non si ammala, non va in ferie, non fa errori di battitura, non dimentica risposte.",
  commercialLevers: [
    {
      icon: Bot,
      title: "Disponibilità 24/7",
      text: "L'agente AI risponde a clienti alle 23 di sera, alle 7 di mattina, il sabato. Le imprese con presenza 24/7 acquisiscono il 28% in più di lead caldi rispetto alle 'orario d'ufficio'.",
    },
    {
      icon: ShieldCheck,
      title: "Privacy AI: i dati restano tuoi",
      text: "I dialoghi e i dati della tua impresa NON vengono usati per addestrare modelli di terzi (OpenAI, Google, Anthropic). Architettura privacy-first GDPR conforme, server EU certificati ISO 27001.",
    },
    {
      icon: TrendingUp,
      title: "Tasso di chiusura preventivi più alto",
      text: "Follow-up automatico personalizzato fa salire la chiusura dal 20% al 32-38%. Su 30 preventivi/mese a ticket medio 35.000€, sono 100.000-180.000€ di fatturato aggiuntivo all'anno.",
    },
    {
      icon: Sparkles,
      title: "Liberi tempo per il lavoro che conta",
      text: "Segretaria torna a fare archivio, ordini, preventivi. Commerciale chiama solo lead caldi qualificati. Titolare riceve briefing ogni mattina invece di ricostruire telefonando 5 capocantieri.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "L'AI non è il futuro. È quello che ti permette di crescere senza assumere.",
  resultsBody:
    "Quando ti serve la segretaria numero 2, il commerciale numero 3, l'assistente del titolare, il primo pensiero non deve essere 'apriamo la posizione'. Deve essere 'l'agente AI può coprire questa funzione?'. Spesso la risposta è sì, e allora cresci a costi marginali zero.",
  integrationPillars: [
    {
      icon: HeadphonesIcon,
      title: "Agente Risposta Clienti 24/7",
      text: "Risponde su WhatsApp Business, email, chat sito web. Conosce listini, anagrafica, stato cantieri, scadenze fatture. Escalation a umano quando il caso esce dal training.",
    },
    {
      icon: UserCog,
      title: "Agente Qualifica Lead",
      text: "Ingaggia lead nuovi, fa 5 domande di qualifica, assegna lead score, passa al commerciale solo i caldi. Riduzione tempo perso del commerciale del 60%.",
    },
    {
      icon: Mail,
      title: "Agente Follow-up Preventivi",
      text: "Manda follow-up automatici a 3, 7, 14 giorni con messaggi personalizzati basati sul preventivo. Aumenta tasso di chiusura del 12-18%.",
    },
    {
      icon: LineChart,
      title: "Agente Briefing Operativo",
      text: "Ogni mattina alle 8 produce un briefing strutturato sullo stato cantieri, alert critici, priorità del giorno. Sintesi automatica dal giornale lavori e timbrature.",
    },
  ],
  resultStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo segreteria su risposte ripetitive" },
    { value: 18, prefix: "+", suffix: "%", label: "tasso chiusura preventivi con follow-up AI" },
    { value: 24, suffix: "/7", label: "disponibilità degli agenti AI custom" },
  ],
  resultsCta: "Apri la tua dashboard agenti AI",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale un agente AI che lavora 24/7 sui tuoi dati?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: ore amministrative settimanali bruciate su risposte ripetitive e costo orario interno. La stima parte dal recupero del 70% di tempo amministrativo osservato nei nostri clienti dopo 90 giorni.",
  roi: {
    input1Label: "Ore segreteria/settimana su task ripetitivi",
    input1Default: 18,
    input1Min: 2,
    input1Max: 80,
    input1Step: 1,
    input1Suffix: " h",
    input2Label: "Costo orario aziendale interno (€)",
    input2Default: 28,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio operativo stimato/anno",
    computeOutput: (a, b) => Math.round(a * 0.7 * 50 * b),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 0.7 * 50)} h` },
      { label: "Costo attuale stimato/anno", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(a * 50 * b) },
      { label: "Equivale a FTE risparmiato", value: `${(a * 0.7 / 40).toFixed(2)} FTE` },
    ],
    closingPitch:
      "Stima prudenziale basata su 70% di task ripetitivi automatizzati. Aggiungi l'aumento del tasso di chiusura preventivi (+18%) e il ROI raddoppia entro i primi 6 mesi.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un chatbot generico. Un assistente che conosce la tua azienda meglio di te.",
  salesBody:
    "Gli Agenti AI di Edilizia in Cloud sono progettati per imprese edili italiane: parlano italiano nativo, conoscono terminologia tecnica edile, capiscono SAL, DDT, computi metrici, ritenute. Ecco le 4 dimensioni che cambiano subito.",
  salesImpact: [
    {
      title: "Lead qualificati che arrivano al commerciale",
      text: "Il commerciale non perde più tempo con curiosi: l'agente AI ha già qualificato budget, zona, tempistica, tipologia. Si parte dalla trattativa, non dalla qualifica.",
    },
    {
      title: "Follow-up preventivi sistematico",
      text: "Niente più 'mi ero dimenticato di richiamare'. L'agente fa follow-up con messaggi personalizzati. I clienti tiepidi tornano caldi senza intervento umano.",
    },
    {
      title: "Briefing operativi senza chiamate",
      text: "Il titolare apre l'app alle 8 di mattina e vede il briefing AI: stato 6 cantieri, 2 alert critici, priorità del giorno. Niente più 5 telefonate ai capocantieri.",
    },
    {
      title: "Customer care 24/7 senza assumere",
      text: "L'agente risponde a domande di clienti già attivi (stato cantiere, scadenze, sopralluoghi confermati) 24/7. Liberi la segretaria per il lavoro vero.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Agente AI Risposta Clienti",
      value:
        "Risponde su WhatsApp Business, email, chat sito web. Conosce anagrafica, listini, stato cantieri, scadenze fatture. Escalation a umano configurabile per casi fuori scope.",
    },
    {
      label: "Agente AI Qualifica Lead",
      value:
        "Ingaggia lead nuovi con 5-7 domande di qualifica (zona, budget, tempistica, tipo intervento, urgenza). Lead score automatico, passaggio al commerciale solo per lead caldi.",
    },
    {
      label: "Agente AI Follow-up Preventivi",
      value:
        "Sequenza follow-up automatico a 3/7/14 giorni con messaggi personalizzati sul contenuto del preventivo. Detection del ricontatto cliente per fermare la sequenza.",
    },
    {
      label: "Agente AI Briefing Operativo",
      value:
        "Sintesi automatica giornaliera dello stato cantieri (avanzamento, alert, costi, ore lavorate). Inviata via email, push o Slack al titolare ogni mattina.",
    },
    {
      label: "Privacy AI GDPR-first",
      value:
        "I dati della tua impresa NON vengono usati per addestrare modelli di terzi. Server EU certificati ISO 27001 e SOC2. Conformità GDPR, AI Act EU 2024.",
    },
    {
      label: "Audit log dialoghi AI",
      value:
        "Ogni dialogo, ogni decisione dell'agente è loggata e auditabile. Vedi cosa l'agente ha risposto, su quali dati, e puoi intervenire o correggere il training.",
    },
    {
      label: "Brand voice e tono custom",
      value:
        "L'agente parla come la tua impresa: tono formale o informale, terminologia tecnica o divulgativa, lingua italiana nativa. Configurabile in fase di onboarding.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud ti restituisce ore di vita.",
  scenarios: [
    {
      title: "Lead che scrive su WhatsApp alle 22:30",
      text:
        "Un potenziale cliente trova il tuo numero WhatsApp alle 22:30 e scrive 'volevo info per ristrutturare la cucina, è possibile?'. L'agente AI risponde in 5 secondi, fa 5 domande di qualifica (zona, mq, budget, tempistica), conferma sopralluogo per martedì alle 18. Lunedì mattina trovi il lead caldo, già qualificato, già fissato.",
    },
    {
      title: "Cliente attivo che chiede stato cantiere",
      text:
        "Cliente con cantiere attivo scrive su WhatsApp 'come va? quando finite?'. L'agente AI consulta il modulo Gestione Cantieri, vede 78% di avanzamento, due milestone completate la settimana scorsa, fine prevista 12 maggio. Risponde con messaggio personalizzato e foto della settimana.",
    },
    {
      title: "Briefing del titolare lunedì mattina",
      text:
        "Lunedì alle 8:00 ricevi push notification: 'Briefing settimanale pronto'. Apri: 7 cantieri attivi, 5 in linea, 2 con alert (Rossi -8% margine, Bianchi DURC subappalto in scadenza). Top 3 priorità della settimana. Hai capito tutto in 90 secondi senza chiamare nessuno.",
    },
  ],

  testimonialQuote:
    "L'agente AI risponde su WhatsApp meglio di me. Conosce tutti i miei cantieri, tutti i preventivi aperti, tutte le scadenze. Mi sento come se avessi assunto un aiutante a tempo pieno, ma a costi che mi permettono di crescere senza svenarmi.",
  testimonialAuthor: "Federica V.",
  testimonialRole: "Vita Costruzioni Group, Roma",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "L'agente AI sostituisce la mia segretaria?",
      a: "No. Lo libera dalle 70% di richieste ripetitive (stato cantiere, scadenze, sopralluoghi confermati) per farle fare il lavoro vero (preventivi, ordini, archivio, gestione amministrativa). I nostri clienti non hanno licenziato nessuno: hanno semplicemente smesso di assumere il secondo.",
    },
    {
      q: "I miei dati vengono usati per addestrare ChatGPT o altre AI?",
      a: "No. Edilizia in Cloud usa modelli AI con architettura privacy-first: i dati della tua impresa, i dialoghi con i clienti, i preventivi e i cantieri NON vengono mai usati per addestrare modelli di terzi (OpenAI, Google, Anthropic). Server EU certificati, conformità GDPR e AI Act EU 2024 garantita.",
    },
    {
      q: "Quanto è accurato l'agente AI?",
      a: "Misuriamo l'accuratezza in produzione: tasso di risposta corretta 92-96% nei nostri clienti, soddisfazione cliente sulle interazioni AI 4.7/5. Quando l'agente non sa rispondere o il caso esce dal training, esegue escalation automatica a umano (segretaria/titolare) con notifica push.",
    },
    {
      q: "Posso decidere a quali domande l'agente AI può rispondere?",
      a: "Sì. Configuri i 'topic ammessi' (stato cantiere, scadenze, sopralluoghi, fatture) e i 'topic escalation' (sconti, modifiche contratto, reclami). Per ogni topic decidi se l'agente può rispondere autonomamente, deve solo abbozzare per approvazione, o deve sempre escalare a umano.",
    },
    {
      q: "Quanto tempo serve per addestrare un agente sui miei dati?",
      a: "48 ore per il primo agente. Importiamo automaticamente anagrafica clienti, listini, preventivi storici, FAQ. Tu rivedi le risposte di test, alleniamo l'agente con 20-30 dialoghi simulati, vai in produzione con audit umano attivo per la prima settimana.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo Agenti AI è incluso nel piano Business di Edilizia in Cloud (a partire da 199€/mese), con un agente AI configurato. Agenti aggiuntivi disponibili a 49€/mese ciascuno. Nessun vincolo di durata, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Gli Agenti AI vivono integrati con tutto il resto. Ecco come.",
  internalLinksBody:
    "Gli Agenti AI sono il tessuto connettivo: si collegano a CRM, preventivi, cantieri, fatturazione, WhatsApp e email. Ecco i moduli e le pagine collegate.",
  internalLinks: [
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Agenti AI che rispondono direttamente su WhatsApp Business 24/7." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Flow builder che integra agenti AI come step nelle automazioni." },
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "L'agente AI qualifica lead e sintetizza interazioni nel CRM." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Follow-up preventivi automatico con agente AI personalizzato." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Briefing AI sullo stato cantieri e alert intelligenti." },
    { to: "/funzionalita/email-marketing", title: "Email Marketing", text: "Generazione contenuti email con agenti AI dedicati." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "Dashboard con insight AI sulle performance dell'impresa." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Modulo Agenti AI incluso nel piano Business da 199€/mese." },
  ],

  finalCtaH2: "Smetti di perdere lead fuori orario. Inizia ad avere un'AI che lavora con te.",
  finalCtaBody:
    "31 giorni gratuiti per portare gli Agenti AI dentro la tua impresa edile. Setup in 48 ore, addestramento sui tuoi dati, integrazione con WhatsApp/email/chat e audit log inclusi. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Privacy GDPR · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Agenti AI",
  stickyCtaMicrocopy: "Setup 48h · 24/7 disponibili",

  applicationSubCategory: "Construction AI Agents Software",

  relatedBlogSlugs: ["alternativa-excel-cantieri", "come-fare-preventivo-edilizia"],
};

export default function AgentiAi() {
  return <FunzionalitaPageTemplate config={config} />;
}
