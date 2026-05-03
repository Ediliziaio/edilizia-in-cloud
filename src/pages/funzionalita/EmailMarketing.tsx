import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  HardHat,
  Inbox,
  Layers,
  Mail,
  MailCheck,
  MessageCircle,
  PenTool,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Target,
  Timer,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "email-marketing",
  vertical: "Email Marketing",
  productName: "Email Marketing Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, serramentisti e general contractor che vogliono fare email marketing serio: segmentazione, automazioni post-cantiere, template settoriali, GDPR e deliverability garantita",
  audienceShort: "imprese edili che fanno email marketing strutturato",

  seo: {
    title:
      "Email Marketing Edilizia",
    description:
      "Email marketing pensato per imprese edili: segmentazione clienti attivi/dormienti/lead, template settoriali pronti, automazioni post-cantiere, GDPR…",
    keywords:
      "email marketing edilizia, dem impresa edile, segmentazione clienti edili, automazioni email cantiere, template email edilizia, gdpr email impresa, deliverability email b2c, riattivazione clienti edili",
    ogImage: "https://www.ediliziaincloud.com/og/email-marketing-og.jpg",
  },

  heroBadge: "Funzionalità · Email Marketing",
  heroH1Lead: "Email che arrivano davvero",
  heroH1Highlight: "in inbox",
  heroH1Tail: "non nello spam",
  heroSubheadline:
    "Email marketing pensato per imprese edili italiane: segmentazione clienti attivi/dormienti/lead, template settoriali già pronti, automazioni post-cantiere ('come va dopo 6 mesi?'), GDPR e deliverability garantita sopra il 98%. Tutto integrato con CRM e gestione cantieri, niente Mailchimp da configurare a parte.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con dominio verificato",
    "Template settoriali pronti",
    "Deliverability 98%+",
  ],
  proofPoints: [
    "Segmentazione su dati cantiere",
    "Automazioni post-cantiere",
    "GDPR conforme con doppio opt-in",
  ],

  objectiveRow: [
    ["Obiettivo", "Riattivare clienti dormienti e nutrire i lead nel tempo"],
    ["Momento chiave", "Post-cantiere a 6 mesi, lancio bonus, stagionalità"],
    ["Risultato", "Più cantieri ricorrenti dai clienti già acquisiti"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano Email Marketing per nutrire lead e riattivare clienti chiusi.",
  betaBody:
    "Email Marketing è già pronto: lo attiviamo in 48 ore configurando il tuo dominio (SPF, DKIM, DMARC), importiamo la rubrica clienti dal CRM, prepariamo 10 template settoriali per il settore edile e ti accompagniamo in 3 sessioni 1-a-1 fino alla prima campagna inviata.",

  speedH2:
    "Email mandate da Gmail finiscono nello spam. Email da dominio verificato arrivano. Differenza enorme.",
  speedSubheadline:
    "L'impresa edile che manda DEM dal proprio Gmail vede 12-18% di apertura nei migliori scenari, perché il 60% delle email finisce nello spam. Con dominio verificato (SPF, DKIM, DMARC) e infrastruttura SMTP dedicata, le aperture salgono al 32-45% e la conversione triplica.",
  speedStats: [
    { value: 98, prefix: "+", suffix: "%", label: "deliverability media in inbox primaria" },
    { value: 32, prefix: "+", suffix: "%", label: "apertura media campagne settoriali" },
    { value: 3, prefix: "x", suffix: "", label: "conversione vs DEM da Gmail" },
  ],

  familyH2: "Email Marketing collegato a tutta la piattaforma Edilizia in Cloud.",
  familySubheadline:
    "Le campagne email non sono un silos: vivono dentro il CRM, sono triggerate dalle Automazioni, alimentate dai dati di Cantieri e Fatturazione. Ogni email è personalizzata sul cliente reale, niente data entry doppio.",
  familyItems: [
    {
      icon: Mail,
      title: "Email Marketing",
      text: "Campagne segmentate, template settoriali, automazioni post-cantiere, GDPR.",
      to: "/funzionalita/email-marketing",
    },
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Segmentazione clienti per pipeline, tipologia cantiere, ultimo contatto. Liste pronte all'uso.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: MessageCircle,
      title: "WhatsApp Marketing",
      text: "Strategia complementare per chi ha dato consenso WhatsApp. Tassi di apertura diversi, target diversi.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Workflow,
      title: "Automazioni",
      text: "Trigger automatici: cantiere chiuso → email follow-up dopo 6 mesi. Workflow no-code.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Eventi cantiere triggerano email al cliente: avvio, milestone, chiusura.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Email automatiche di reminder sui preventivi pendenti.",
      to: "/funzionalita/preventivi-edilizia",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Un solo database clienti. Email che si autoaggiornano.",
  familyBonusText:
    "Quando chiudi un cantiere, parte automaticamente la sequenza email post-cantiere a 1, 6 e 12 mesi. Quando un preventivo va in stand-by, parte il reminder. Niente esportazioni in Excel, niente Mailchimp da sincronizzare: i dati vivono nel CRM e le campagne li usano in tempo reale.",

  painKicker: "Il problema vero",
  painH2:
    "Hai 1.500 ex-clienti in rubrica. Ne usi zero. Il fatturato extra è lì, ma non lo prendi.",
  painSubheadline:
    "L'impresa edile media accumula 800-3.000 contatti email tra clienti chiusi, lead non firmati, fornitori, contatti fiera. Ma li usa una volta l'anno con una DEM scarsa. È un asset gigantesco che resta inattivo perché manca un sistema strutturato per parlargli.",
  painPoints: [
    {
      icon: Inbox,
      title: "Email mandate da Gmail finiscono in spam",
      text: "Senza dominio verificato (SPF, DKIM, DMARC) il 60% delle DEM finisce nelle promozioni o spam di Gmail. Aperture sotto il 18%, conversione zero. Investi tempo per niente, dai la colpa al canale che invece funziona benissimo se usato bene.",
    },
    {
      icon: Layers,
      title: "Liste piatte senza segmentazione",
      text: "Mandi la stessa email a tutti: clienti chiusi, lead non firmati, fornitori. Il messaggio non parla a nessuno in particolare. Aperture basse, disiscrizioni alte, lista che si distrugge nel tempo.",
    },
    {
      icon: AlertTriangle,
      title: "Mailchimp slegato dal CRM",
      text: "Hai Mailchimp configurato a parte, esporti CSV ogni volta, importi in Mailchimp, mandi la campagna, riporti i risultati a mano. 4 ore per ogni invio, dati sempre vecchi, niente trigger automatici sugli eventi cantiere.",
    },
    {
      icon: Clock,
      title: "Niente follow-up post-cantiere",
      text: "Cantiere chiuso, cliente sparisce, dimentichi di richiamarlo. Dopo 6 mesi avrebbe bisogno di una manutenzione, dopo 12 di un altro lavoro. Senza sequenze automatiche, perdi il 60% del fatturato ricorrente potenziale.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stesso database. Stesse offerte. Cambia segmentazione e deliverability, esplodono i risultati.",
  baSubheadline:
    "Email Marketing non aggiunge contatti che non hai: trasforma i contatti dormienti in revenue. Le imprese che attivano segmentazione e dominio verificato vedono triplicare aperture e conversione nelle prime 2 campagne.",
  baAreas: [
    {
      title: "Riattivazione clienti chiusi",
      before:
        "DEM annuale a 1.500 contatti dal Gmail aziendale, 14% di apertura, 0,3% click rate. Risultato: 4-5 risposte su 1.500. Nessun cantiere ricorrente dal database.",
      after:
        "Sequenza segmentata a clienti chiusi negli ultimi 24 mesi con offerta specifica per tipologia di lavoro. Deliverability 98%, apertura 38%, click 6,2%. 22-30 sopralluoghi per campagna.",
    },
    {
      title: "Nutrimento lead non firmati",
      before:
        "Lead riceve preventivo, non firma, non senti più nulla. Dopo 60 giorni il lead è morto, va dal concorrente che ha fatto follow-up serio.",
      after:
        "Sequenza nurturing automatica: dopo 7 giorni casi studio, dopo 14 giorni testimonial cliente simile, dopo 30 giorni offerta limitata. 22% di lead firmano in più rispetto a chi non riceve la sequenza.",
    },
    {
      title: "Follow-up post-cantiere",
      before:
        "Cantiere chiuso, cliente saluta, sparisce. Dopo 12 mesi ti scrive per un altro lavoro... oppure non ti scrive mai più, va da un altro.",
      after:
        "Sequenza automatica: a 1 mese 'come va il pavimento?', a 6 mesi 'manutenzione consigliata?', a 12 mesi 'altri lavori in vista?'. 18% dei clienti chiusi torna entro 18 mesi.",
    },
    {
      title: "Compliance GDPR",
      before:
        "Mandi email senza consenso esplicito o con consenso non tracciato. Esposizione a sanzioni GDPR (fino a 20M o 4% fatturato). Niente prova in caso di ispezione del Garante.",
      after:
        "Doppio opt-in obbligatorio, log di consenso con timestamp, disiscrizione self-service in ogni email. Report GDPR esportabile in PDF. Conformità totale documentabile.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: dominio verificato, segmentazione automatica, campagne live.",
  mechanismSubheadline:
    "Niente configurazioni tecniche da fare a mano. Configuriamo SPF, DKIM, DMARC sul tuo dominio per la deliverability, importiamo i contatti dal CRM con consensi GDPR e attiviamo le prime campagne in 48 ore.",
  mechanismSteps: [
    {
      icon: ShieldCheck,
      title: "Configurazione dominio per deliverability massima",
      text: "Configuriamo SPF, DKIM e DMARC sul tuo dominio, IP dedicato per invio massivo, warmup automatico per evitare il spam folder. Risultato: deliverability sopra il 98% in inbox primaria Gmail/Outlook.",
    },
    {
      icon: Tag,
      title: "Segmentazione automatica dal CRM",
      text: "Liste create dinamicamente con filtri sul CRM: clienti chiusi nei 24 mesi, lead in pipeline da +14 giorni, contatti con cantieri sopra 50.000 €. Aggiornate in tempo reale, niente esportazioni.",
    },
    {
      icon: Send,
      title: "Campagne, automazioni e A/B test",
      text: "Editor drag&drop con 10 template settoriali pronti, automazioni multi-step, A/B test su soggetto e contenuto, reportistica live aperture/click/conversioni. Tutto integrato con CRM e cantieri.",
    },
  ],
  mechanismCta: "Prenota la demo del modulo Email Marketing",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Costo per email vicino a zero. ROI tra i più alti del marketing digitale.",
  commercialBody:
    "Email Marketing resta il canale con il miglior costo per conversione del marketing digitale: per ogni euro investito, le imprese ben configurate vedono ritorni medi tra 36 e 42 euro. Il segreto è deliverability e segmentazione, non volume.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "ROI 36:1 medio sul settore",
      text: "Per ogni euro speso in email marketing ben fatto, il ROI medio nel B2C edile italiano è 36 euro. Nessun altro canale digitale ha un rapporto comparabile, nemmeno Google Ads.",
    },
    {
      icon: MailCheck,
      title: "Deliverability garantita 98%+",
      text: "Configurazione SPF/DKIM/DMARC + IP dedicato + warmup automatico = email che arrivano in inbox primaria, non nello spam. La differenza tra un canale che funziona e uno che butta soldi.",
    },
    {
      icon: Workflow,
      title: "Automazioni che lavorano da sole",
      text: "Sequenze post-cantiere, nurturing lead, riattivazione clienti dormienti: una volta configurate, lavorano in background 24/7 senza intervento umano. Generano cassa mentre dormi.",
    },
    {
      icon: ShieldCheck,
      title: "GDPR e disiscrizione conformi",
      text: "Doppio opt-in, log consensi, disiscrizione self-service in ogni email. Conformità documentabile, niente sanzioni Garante, niente liste 'sporche' che danneggiano la reputazione del dominio.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Il database dormiente diventa la prima fonte di nuovi cantieri. Senza chiamare nessuno.",
  resultsBody:
    "I contatti email accumulati negli anni sono il primo asset commerciale di un'impresa edile, ma quasi sempre inattivo. Con Email Marketing strutturato tornano vivi: ogni campagna mensile ben fatta a una lista di 1.500 contatti porta in media 18-25 sopralluoghi nuovi.",
  integrationPillars: [
    {
      icon: Users,
      title: "Segmentazione su dati reali",
      text: "Liste create automaticamente: clienti per tipologia di lavoro, valore ticket, ultimo contatto, area geografica. Niente Excel, niente esportazioni, dati sempre aggiornati.",
    },
    {
      icon: Workflow,
      title: "Sequenze automatiche multi-step",
      text: "Post-cantiere a 1/6/12 mesi, nurturing lead a 7/14/30 giorni, manutenzione stagionale annuale. Una volta configurate lavorano da sole.",
    },
    {
      icon: BarChart3,
      title: "Reportistica granulare",
      text: "Aperture, click, conversioni per template, segmento, orario di invio. Capisci cosa funziona, ottimizzi le campagne successive.",
    },
    {
      icon: ShieldCheck,
      title: "GDPR e deliverability",
      text: "Dominio verificato, IP dedicato, doppio opt-in, log consensi. Conformità e arrivo in inbox primaria garantiti.",
    },
  ],
  resultStats: [
    { value: 98, prefix: "+", suffix: "%", label: "deliverability in inbox primaria" },
    { value: 32, prefix: "+", suffix: "%", label: "apertura media campagne settoriali" },
    { value: 36, prefix: "x", suffix: "", label: "ROI medio per euro investito" },
  ],
  resultsCta: "Apri la dashboard Email Marketing",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto vale il tuo database email se inizi a usarlo davvero?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di contatti email validi e ticket medio dei tuoi cantieri. La stima parte dal 2,5% di conversione effettiva osservata sulle campagne ben segmentate e dal 12% di margine medio dei lavori edili.",
  roi: {
    input1Label: "Contatti email validi in rubrica",
    input1Default: 1500,
    input1Min: 100,
    input1Max: 20000,
    input1Step: 100,
    input2Label: "Ticket medio cantiere (€)",
    input2Default: 12000,
    input2Min: 1000,
    input2Max: 100000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Margine extra annuo stimato",
    computeOutput: (a, b) => Math.round(a * 0.025 * b * 0.12),
    computeSecondary: (a, b) => [
      { label: "Cantieri extra/anno", value: `${Math.round(a * 0.025)}` },
      { label: "Fatturato extra/anno", value: `${Math.round(a * 0.025 * b).toLocaleString("it-IT")} €` },
      { label: "Costo annuo invio", value: `${Math.round(a * 12 * 0.005).toLocaleString("it-IT")} €` },
    ],
    closingPitch:
      "Stima prudenziale: 2,5% di conversione su database segmentato × 12% di margine medio. Le imprese che attivano automazioni post-cantiere vedono cifre 1,5-2x superiori.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Il canale che lavora 24/7 mentre tu sei in cantiere o a casa.",
  salesBody:
    "Email Marketing cambia 4 dimensioni operative: come riattivi clienti dormienti, come nutri i lead, come fai follow-up post-cantiere, come misuri quanto vale ogni segmento del tuo database.",
  salesImpact: [
    {
      title: "Sopralluoghi ricorrenti dal database",
      text: "Ogni campagna mensile a 1.500 contatti porta 15-25 sopralluoghi nuovi. L'agenda si riempie senza chiamare, senza investire in Google Ads aggiuntivo.",
    },
    {
      title: "Lead che si scaldano da soli",
      text: "Il lead che ha ricevuto un preventivo ma non ha firmato continua a ricevere casi studio, testimonial, novità. Quando torna pronto, sceglie te perché sei rimasto presente.",
    },
    {
      title: "Cliente chiuso che torna dopo 12 mesi",
      text: "Sequenza automatica post-cantiere fa sentire la tua impresa presente. Quando il cliente ha bisogno di altro, ti scrive direttamente. 18% di clienti che tornano entro 18 mesi.",
    },
    {
      title: "ROI marketing misurabile",
      text: "Ogni campagna ha report dettagliato: aperture, click, conversioni, fatturato attribuibile. Capisci cosa funziona, ottimizzi, scarti i template deboli. Marketing scientifico, non a sentimento.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Dominio verificato per deliverability massima",
      value:
        "Configurazione SPF, DKIM e DMARC sul tuo dominio. IP dedicato per invii massivi. Warmup automatico. Risultato: deliverability sopra il 98% in inbox primaria.",
    },
    {
      label: "Editor drag&drop con template settoriali",
      value:
        "10 template pre-disegnati per il settore edile (riattivazione, post-cantiere, nurturing, bonus stagionali, fine cantiere). Personalizzabili in 5 minuti, responsive, brand-consistent.",
    },
    {
      label: "Segmentazione dinamica dal CRM",
      value:
        "Liste create con filtri sul CRM in tempo reale: clienti chiusi negli ultimi 24 mesi, lead in pipeline, ticket sopra 50.000 €, area geografica. Niente esportazioni manuali.",
    },
    {
      label: "Automazioni multi-step",
      value:
        "Sequenze: post-cantiere a 1/6/12 mesi, nurturing lead a 7/14/30 giorni, manutenzione stagionale annuale. Una volta configurate, lavorano da sole.",
    },
    {
      label: "A/B test su soggetto e contenuto",
      value:
        "Test split automatici su oggetto, preheader, CTA. Sistema sceglie da solo la versione vincente per il 90% del database. Ottimizzazione continua senza intervento manuale.",
    },
    {
      label: "GDPR e doppio opt-in",
      value:
        "Form di iscrizione con doppio opt-in, log consensi con timestamp, disiscrizione self-service in ogni email. Report GDPR esportabile in caso di ispezione Garante.",
    },
    {
      label: "Reportistica live integrata nel CRM",
      value:
        "Aperture, click, conversioni, disiscrizioni, fatturato attribuibile. Per template, segmento, orario invio. Esportabile in CSV.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui Email Marketing ben fatto cambia il fatturato del trimestre.",
  scenarios: [
    {
      title: "Riattivazione database per il bonus 50%",
      text: "Marzo, parte la stagione del bonus ristrutturazione. Selezioni 1.200 clienti chiusi negli ultimi 5 anni, mandi sequenza di 3 email a distanza di 7 giorni con casi studio simili, calcolatore di risparmio, prenotazione sopralluogo. Risultato: 47 sopralluoghi prenotati, 19 cantieri firmati, 280.000 euro di fatturato.",
    },
    {
      title: "Nurturing lead non firmato",
      text: "Lead riceve preventivo da 35.000 euro, non firma, sparisce. Sequenza automatica parte a 7 giorni con caso studio simile, a 14 giorni con testimonial video, a 30 giorni con offerta su garanzia estesa. Lead riapre il preventivo a giorno 33, firma a giorno 38.",
    },
    {
      title: "Manutenzione 6 mesi post-cantiere",
      text: "Cantiere chiuso il 10 settembre. A marzo (6 mesi dopo) parte automatica email 'Sig. Rossi, dopo 6 mesi è il momento giusto per controllare giunti e silicone bagno. Vuoi un sopralluogo gratuito?'. Cliente clicca, prenota sopralluogo, firma intervento da 1.800 euro.",
    },
  ],

  testimonialQuote:
    "Avevamo 2.300 contatti email accumulati in 8 anni di lavoro, ma li usavamo zero. Da quando abbiamo attivato Email Marketing con segmentazione e sequenze post-cantiere, generiamo 12-18 sopralluoghi nuovi al mese senza chiamare nessuno. Il database era una miniera, lo abbiamo semplicemente acceso.",
  testimonialAuthor: "Stefano R.",
  testimonialRole: "Costruzioni Lombarde Srl, Brescia",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di attivare Email Marketing.",
  faqs: [
    {
      q: "Devo cambiare il mio dominio email aziendale?",
      a: "No. Configuriamo SPF, DKIM e DMARC sul dominio che già usi (es. tuaimpresa.it). Le email partono dal tuo dominio, non da un sottodominio strano. Il cliente vede 'mario@tuaimpresa.it' come sempre, solo arrivano in inbox.",
    },
    {
      q: "I miei contatti email da 5 anni fa sono utilizzabili?",
      a: "Dipende dal consenso originale. Edilizia in Cloud importa la rubrica e fa pulizia automatica: rimuove email invalide, identifica contatti senza consenso documentato, propone una campagna di doppio opt-in per riattivarli legalmente. Recuperi una percentuale alta della lista in modo conforme.",
    },
    {
      q: "Come si integra con Mailchimp / Brevo / altre soluzioni?",
      a: "Non serve. Email Marketing è nativo dentro Edilizia in Cloud, alimentato direttamente dal CRM e dai cantieri. Sostituisce Mailchimp e elimina la doppia gestione. Se hai liste su Mailchimp, le importiamo durante l'onboarding.",
    },
    {
      q: "Quanto costano gli invii?",
      a: "Il costo è proporzionale al volume. I piani Professional e Business includono fino a 25.000 invii/mese senza costo aggiuntivo. Sopra quella soglia il costo aggiuntivo è di pochi euro per migliaio di invii. Per un'impresa edile media non si superano mai i piani inclusi.",
    },
    {
      q: "Posso fare A/B test sulle campagne?",
      a: "Sì. Test split automatici su oggetto, preheader, CTA. Il sistema invia il test al 10% del database, identifica la versione vincente in poche ore e poi invia automaticamente la versione migliore al 90% restante.",
    },
    {
      q: "Come vengono gestite le disiscrizioni e il GDPR?",
      a: "Ogni email contiene link di disiscrizione self-service. Il consenso iniziale è doppio opt-in (conferma via email). Tutti i consensi e disiscrizioni sono loggati con timestamp e fonte. Report GDPR esportabile in PDF per ispezioni del Garante.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Email Marketing è integrato con CRM, Cantieri e Automazioni.",
  internalLinksBody:
    "Le campagne email vivono insieme al CRM, alle Automazioni e al modulo Cantieri. Ecco gli altri pezzi della piattaforma che le rendono potenti.",
  internalLinks: [
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Pipeline preventivi e segmentazione clienti per campagne email." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Strategia complementare per chi ha consenso WhatsApp." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Trigger no-code che lanciano sequenze email automatiche." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Email automatiche sugli eventi del portale cliente." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Email cliente automatiche su milestone cantiere." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Sequenze nurturing sui preventivi pendenti." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI campagne email nel dashboard executive." },
    { to: "/funzionalita/agenti-ai", title: "Agenti AI", text: "AI per scrivere oggetti email e personalizzare contenuti." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Il tuo database vale molto più di quanto credi. Smetti di lasciarlo dormire.",
  finalCtaBody:
    "31 giorni gratuiti per attivare Email Marketing nella tua impresa edile. Dominio verificato, 10 template settoriali, segmentazione CRM, automazioni post-cantiere e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Dominio verificato · GDPR conforme",

  stickyCtaLabel: "Prova gratis Email Marketing",
  stickyCtaMicrocopy: "Setup 48h · Deliverability 98%+",

  applicationSubCategory: "Construction Email Marketing Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function EmailMarketing() {
  return <FunzionalitaPageTemplate config={config} />;
}
