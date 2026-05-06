import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Clock,
  HardHat,
  Lock,
  MessageCircle,
  MessageSquare,
  Megaphone,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "whatsapp-marketing",
  vertical: "WhatsApp Marketing",
  productName: "WhatsApp Marketing Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, serramentisti e general contractor che vogliono parlare ai clienti sul canale dove sono davvero attivi (WhatsApp), con notifiche cantiere automatiche e broadcast commerciali conformi GDPR",
  audienceShort: "imprese edili che vendono e comunicano via WhatsApp",

  seo: {
    title:
      "WhatsApp Marketing Edilizia",
    description:
      "WhatsApp Business API integrato per imprese edili: broadcast a clienti, notifiche cantiere automatiche, template approvati Meta, consensi GDPR.",
    keywords:
      "whatsapp marketing edilizia, whatsapp business impresa edile, broadcast clienti edili, notifiche cantiere whatsapp, template whatsapp meta, whatsapp api edilizia, marketing imprese costruzioni, gdpr whatsapp impresa",
    ogImage: "https://www.ediliziaincloud.com/og/whatsapp-marketing-og.jpg",
  },

  heroBadge: "Funzionalità · WhatsApp Marketing",
  heroH1Lead: "Parla ai clienti dove sono davvero",
  heroH1Highlight: "su WhatsApp",
  heroH1Tail: "non nello spam delle email",
  heroSubheadline:
    "WhatsApp Business API integrato nativamente in Edilizia in Cloud: broadcast segmentati ai clienti, notifiche cantiere automatiche, template approvati Meta, raccolta consensi GDPR. L'unico canale dove le aperture superano il 90% e la conversione è 8 volte superiore all'email. Pensato per imprese edili italiane.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con API Meta",
    "Template approvati e GDPR",
    "Conversione 8x rispetto all'email",
  ],
  proofPoints: [
    "Aperture sopra il 90%",
    "Notifiche cantiere automatiche",
    "Consensi GDPR tracciati",
  ],

  objectiveRow: [
    ["Obiettivo", "Riattivare clienti dormienti e tenere vivi i cantieri attivi"],
    ["Momento chiave", "Fine cantiere, scadenze stagionali, follow-up post-preventivo"],
    ["Risultato", "Più ricavi extra dai clienti già acquisiti, niente spam"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano WhatsApp Marketing per riattivare clienti dormienti e velocizzare i follow-up.",
  betaBody:
    "WhatsApp Marketing è già pronto: lo attiviamo in 48 ore configurando il tuo numero WhatsApp Business API certificato Meta, importiamo la rubrica clienti con consensi GDPR, prepariamo i primi 8 template approvati per il settore edile e ti accompagniamo in 3 sessioni 1-a-1 fino alla prima campagna inviata.",

  speedH2:
    "L'email finisce nello spam. WhatsApp viene aperto in 4 minuti. È l'unico canale che funziona davvero.",
  speedSubheadline:
    "Per un'impresa edile, parlare al cliente significa decidere dove trovarlo. L'email ha aperture al 18%, le DEM finiscono in spam, le chiamate disturbano. WhatsApp Business API ha aperture sopra il 90%, lettura in 4 minuti e tassi di conversione 8 volte superiori a qualunque altro canale digitale.",
  speedStats: [
    { value: 90, prefix: "+", suffix: "%", label: "tasso di apertura messaggi WhatsApp" },
    { value: 8, prefix: "x", suffix: "", label: "conversione vs email tradizionale" },
    { value: 4, suffix: " min", label: "tempo medio di lettura del messaggio" },
  ],

  familyH2:
    "WhatsApp Marketing collegato a tutta la piattaforma Edilizia in Cloud.",
  familySubheadline:
    "Le campagne WhatsApp non vivono in un silos: sono alimentate dai dati del CRM, dei cantieri, delle fatture e dei preventivi. Ogni messaggio è personalizzato sul cliente reale, niente broadcast generici, niente data entry doppio.",
  familyItems: [
    {
      icon: MessageCircle,
      title: "WhatsApp Marketing",
      text: "Broadcast segmentati, notifiche cantiere automatiche, template Meta approvati, GDPR.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Segmentazione clienti per pipeline, tipologia cantiere, ultimo contatto. Liste pronte per WhatsApp.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: Send,
      title: "Email Marketing",
      text: "Campagne email per chi non ha dato consenso WhatsApp. Strategie complementari.",
      to: "/funzionalita/email-marketing",
    },
    {
      icon: Zap,
      title: "Automazioni",
      text: "Trigger automatici: cantiere chiuso → messaggio follow-up dopo 6 mesi. Workflow no-code.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Notifiche WhatsApp automatiche al cliente quando un cantiere cambia stato o milestone.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Reminder automatici via WhatsApp sui preventivi pendenti dopo 7 e 14 giorni.",
      to: "/funzionalita/preventivi-edilizia",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Un solo numero WhatsApp Business. Marketing che si autoaggiorna.",
  familyBonusText:
    "Quando chiudi un cantiere, parte automaticamente il messaggio WhatsApp di follow-up dopo 6 mesi. Quando un preventivo resta in stand-by, il sistema manda un reminder gentile. Niente liste Excel, niente import manuali: tutti i dati vivono già nel CRM e nel modulo cantieri, le campagne li usano in tempo reale.",

  painKicker: "Il problema vero",
  painH2:
    "Il cliente edile non apre più le email. Le chiamate disturbano. WhatsApp è l'unico canale rimasto.",
  painSubheadline:
    "L'impresa edile media spende 3.000-8.000 euro l'anno in marketing che non converte: DEM nel spam, post Facebook ignorati, biglietti da visita persi. Eppure ha in rubrica 200-2.000 clienti già acquisiti che potrebbero fare lavori ricorrenti. Il problema non è la lista: è il canale.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Email ignorate, DEM nello spam",
      text: "Aperture al 15-20% nei migliori scenari, 80% di rimbalzi inattivi, finiscono nelle promozioni di Gmail. Per un'impresa edile che vende ticket alti, l'email non è più un canale di acquisizione, è solo rumore.",
    },
    {
      icon: Phone,
      title: "Chiamate ai clienti percepite come invasive",
      text: "Chiamare 200 ex-clienti per proporre manutenzione è impossibile. Anche se trovi 4 ore al giorno, nessuno ama una chiamata commerciale fuori dal nulla. Senti spesso 'ti richiamo io' e non richiama mai.",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp del titolare gestito a mano",
      text: "Il titolare manda messaggi WhatsApp dal proprio numero personale, uno alla volta, senza tracciamento. Niente metriche di apertura, niente template, ban Meta in agguato perché non è uso commerciale conforme.",
    },
    {
      icon: ShieldCheck,
      title: "GDPR e consensi gestiti su carta",
      text: "Senza consensi tracciati, qualunque comunicazione di massa è una violazione GDPR. Sanzioni potenziali fino a 20 milioni o 4% del fatturato. Eppure quasi nessun'impresa edile gestisce consensi WhatsApp in modo strutturato.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stesso clienti in rubrica, stesse offerte. Cambia il canale, esplodono le conversioni.",
  baSubheadline:
    "WhatsApp Marketing non aggiunge clienti che non hai: trasforma quelli che già hai in un asset attivo. Le campagne mensili portano riattivazioni che prima non vedevi nemmeno, perché viaggiavano via mail e nessuno apriva.",
  baAreas: [
    {
      title: "Riattivazione clienti dormienti",
      before:
        "200 ex-clienti in un Excel. Spedisci una DEM una volta l'anno, 18% di apertura, zero risposte concrete. Nessuna riattivazione, nessuna manutenzione venduta.",
      after:
        "Campagna WhatsApp segmentata su 'clienti chiusi da +12 mesi' con messaggio specifico per tipologia di lavoro fatto. Aperture al 92%, risposte 14%, 8-12 nuovi cantieri ogni broadcast.",
    },
    {
      title: "Notifiche cantiere al cliente",
      before:
        "Capocantiere manda foto e update via WhatsApp dal numero personale. Niente template, niente storico, segreteria sommersa di messaggi misti tra clienti e fornitori.",
      after:
        "Notifiche cantiere automatiche dal numero aziendale: 'Buongiorno Sig. Rossi, oggi inizia la posa della pavimentazione, ecco la foto del cantiere'. Tutto tracciato, archiviato, professionale.",
    },
    {
      title: "Follow-up post-preventivo",
      before:
        "Mandi il preventivo via email, dopo 10 giorni non risponde nessuno. Telefonate ricontatto fastidiose, segreteria che dimentica chi richiamare. Tasso di accettazione 18%.",
      after:
        "Reminder automatici WhatsApp a 7 e 14 giorni dal preventivo: messaggio breve, tono amichevole, link diretto al portale per accettare. Tasso di accettazione 32%. Senza chiamate.",
    },
    {
      title: "GDPR e consensi",
      before:
        "Mandi messaggi senza consenso esplicito. Rischio sanzione a ogni invio. Nessun database consensi, nessuna prova in caso di contestazione. Esposizione legale alta.",
      after:
        "Doppio opt-in tracciato: il cliente conferma consenso al primo messaggio, scelta archiviata con timestamp. Disiscrizione gestita in automatico. Conformità GDPR documentabile.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi, un solo numero WhatsApp Business API certificato.",
  mechanismSubheadline:
    "Niente shortcut da pop-up, niente automazioni grigie con rischio ban. Configuriamo il tuo numero WhatsApp Business API ufficiale, ti aiutiamo ad ottenere l'approvazione dei template Meta e attiviamo le prime campagne in 48 ore.",
  mechanismSteps: [
    {
      icon: Lock,
      title: "Attivazione numero WhatsApp Business API",
      text: "Ti aiutiamo a registrare un numero (nuovo o esistente) come WhatsApp Business API certificato Meta. Verifica brand, profilo aziendale, foto cantiere come immagine. Tutto pronto in 48 ore.",
    },
    {
      icon: Tag,
      title: "Template approvati e segmentazione",
      text: "Prepariamo 8 template settoriali (riattivazione, follow-up cantiere, manutenzione stagionale, fine cantiere) e li mandiamo in approvazione Meta. Liste segmentate dal CRM in 1 click.",
    },
    {
      icon: Megaphone,
      title: "Broadcast e automazioni live",
      text: "Lanci broadcast a 200, 500 o 5.000 clienti contemporaneamente. Le automazioni triggerano messaggi su eventi cantiere, scadenza preventivi, milestone fatturazione. Reportistica live.",
    },
  ],
  mechanismCta: "Prenota la demo del modulo WhatsApp",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Conversione 8x dell'email, costi marginali bassi, ROI immediato sul primo broadcast.",
  commercialBody:
    "WhatsApp Marketing non è un add-on di marketing: è il canale con il miglior rapporto costo-conversione di tutto il settore edile. Le imprese che lo attivano registrano un ROI positivo già dal primo broadcast a clienti dormienti, con costi per messaggio sotto i 0,07 euro.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Conversione 8x rispetto all'email",
      text: "Lo stesso messaggio mandato via email converte 1-2 contatti su 100. Mandato via WhatsApp ne converte 8-15. È il miglior canale di marketing diretto disponibile per il B2C edile.",
    },
    {
      icon: Timer,
      title: "Tempo di lettura sotto i 4 minuti",
      text: "Il messaggio WhatsApp viene letto entro 4 minuti dall'invio. Per offerte stagionali (es. 'cappotto termico per il bonus') la rapidità è la differenza tra prenotare il sopralluogo o perderlo.",
    },
    {
      icon: ShieldCheck,
      title: "GDPR e Meta compliance integrati",
      text: "Doppio opt-in, disiscrizione automatica, log di consenso archiviato. Niente ban Meta perché usi solo template approvati. Niente sanzioni GDPR perché ogni invio è documentato.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come professionale",
      text: "Il cliente riceve messaggi dal numero aziendale verificato (con spunta verde) non dal cellulare personale del titolare. Posizionamento immediato: 'questa è un'impresa strutturata'.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Riattivi clienti che credevi persi. E generi cassa extra dal portafoglio già acquisito.",
  resultsBody:
    "I clienti edili dormienti sono il singolo asset più sottovalutato di un'impresa. Con WhatsApp Marketing tornano vivi: ogni broadcast ben fatto a una lista di 300 clienti chiusi nei 24 mesi precedenti porta in media 8-15 sopralluoghi nuovi, 4-6 cantieri firmati, 30.000-80.000 euro di fatturato extra.",
  integrationPillars: [
    {
      icon: Users,
      title: "Segmentazione su dati reali",
      text: "Liste create automaticamente dal CRM: clienti per tipologia di lavoro fatto, valore ticket, ultimo contatto, geolocalizzazione. Niente Excel manuali, niente esportazioni.",
    },
    {
      icon: Bell,
      title: "Notifiche cantiere automatiche",
      text: "Quando un cantiere cambia stato (avvio, milestone, chiusura) parte un messaggio al cliente. Trasparenza totale, niente capocantiere disturbato per update.",
    },
    {
      icon: Clock,
      title: "Reminder e follow-up programmati",
      text: "Preventivi pendenti, fatture in scadenza, manutenzione stagionale: tutti automatizzati. Non perdi più clienti perché ti dimentichi di richiamarli.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità GDPR documentata",
      text: "Ogni consenso è loggato con timestamp e fonte. Disiscrizione self-service in 1 click. Report GDPR esportabile in PDF in caso di ispezione.",
    },
  ],
  resultStats: [
    { value: 92, prefix: "+", suffix: "%", label: "tasso di apertura sui broadcast WhatsApp" },
    { value: 14, prefix: "+", suffix: "%", label: "tasso di risposta su clienti dormienti" },
    { value: 8, prefix: "x", suffix: "", label: "conversione media vs email" },
  ],
  resultsCta: "Apri la dashboard WhatsApp Marketing",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto fatturi extra mandando un messaggio ai clienti che già hai in rubrica?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di clienti in rubrica con consenso e ticket medio dei tuoi cantieri. La stima parte dal 4% di conversione effettiva osservata sui broadcast e dal 15% di margine medio dei lavori edili.",
  roi: {
    input1Label: "Clienti in rubrica con consenso",
    input1Default: 500,
    input1Min: 50,
    input1Max: 5000,
    input1Step: 50,
    input2Label: "Ticket medio cantiere (€)",
    input2Default: 12000,
    input2Min: 1000,
    input2Max: 100000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Margine extra annuo stimato",
    computeOutput: (a, b) => Math.round(a * 0.04 * b * 0.15),
    computeSecondary: (a, b) => [
      { label: "Cantieri extra/anno", value: `${Math.round(a * 0.04)}` },
      { label: "Fatturato extra/anno", value: `${Math.round(a * 0.04 * b).toLocaleString("it-IT")} €` },
      { label: "Costo annuo broadcast", value: `${Math.round(a * 12 * 0.07).toLocaleString("it-IT")} €` },
    ],
    closingPitch:
      "Stima prudenziale: 4% di conversione su clienti dormienti × 15% di margine medio. Considera che il costo per messaggio è sotto i 0,07 euro: il ROI è positivo già al primo broadcast.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Il canale che riempie l'agenda dei sopralluoghi senza chiamare nessuno.",
  salesBody:
    "WhatsApp Marketing cambia 4 dimensioni operative: come riattivi i clienti dormienti, come comunichi con i cantieri attivi, come segui i preventivi pendenti, come misuri l'efficacia delle campagne.",
  salesImpact: [
    {
      title: "Sopralluoghi che si riempiono da soli",
      text: "Dopo un broadcast a 500 clienti dormienti, l'agenda dei sopralluoghi della settimana successiva si riempie senza una telefonata. Il commerciale conferma, non insegue.",
    },
    {
      title: "Cantieri vissuti con trasparenza",
      text: "Il cliente riceve update via WhatsApp ad ogni milestone: 'Oggi inizia la posa', 'Pavimentazione completata, foto allegata'. Il cliente è sereno, smette di chiamare.",
    },
    {
      title: "Preventivi che non si perdono nel limbo",
      text: "Reminder automatici a 7 e 14 giorni sui preventivi pendenti. Il cliente che voleva firmare ma si era dimenticato, riceve il pungolo gentile e firma. +14% accettazione media.",
    },
    {
      title: "Reportistica live e ottimizzabile",
      text: "Vedi aperture, risposte, conversioni per template e per segmento. Capisci subito cosa funziona, ottimizzi il messaggio successivo, scarti i template deboli.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Numero WhatsApp Business API certificato Meta",
      value:
        "Numero verificato con spunta verde, profilo aziendale completo, configurato per uso commerciale. Niente rischio ban del numero personale del titolare.",
    },
    {
      label: "Libreria template settoriali approvati",
      value:
        "8 template iniziali pre-scritti per il settore edile (riattivazione, follow-up cantiere, manutenzione stagionale, fine lavori) già mandati in approvazione Meta.",
    },
    {
      label: "Segmentazione automatica dal CRM",
      value:
        "Liste create da filtri sul CRM: tipologia cantiere, valore ticket, ultimo contatto, geolocalizzazione. Niente esportazioni manuali in Excel.",
    },
    {
      label: "Broadcast a migliaia di clienti in 1 click",
      value:
        "Invio massivo simultaneo con throttling intelligente per non triggerare i filtri Meta. Personalizzazione automatica con nome cliente e dati cantiere.",
    },
    {
      label: "Notifiche cantiere automatiche",
      value:
        "Trigger automatici su eventi cantiere: avvio, milestone, chiusura. Messaggio precompilato dal modulo Gestione Cantieri, partenza in tempo reale.",
    },
    {
      label: "Doppio opt-in e gestione consensi GDPR",
      value:
        "Conferma consenso al primo messaggio, log con timestamp, disiscrizione self-service. Report GDPR esportabile in PDF in caso di ispezione del Garante.",
    },
    {
      label: "Reportistica live per template e segmento",
      value:
        "Aperture, risposte, click sui link, conversioni. Per ogni template e ogni segmento. Esportabile in CSV per analisi più approfondite.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui WhatsApp Marketing genera fatturato extra in pochi giorni.",
  scenarios: [
    {
      title: "Riattivazione clienti per il bonus stagionale",
      text: "Settembre, parte la stagione del cappotto termico. Selezioni dal CRM 320 clienti con immobile residenziale che hanno fatto lavori da te negli ultimi 5 anni. Broadcast 'Bonus 65% in scadenza, vuoi un sopralluogo gratuito?' Risultato: 47 risposte in 48 ore, 22 sopralluoghi prenotati, 9 cantieri firmati per un totale di 180.000 euro.",
    },
    {
      title: "Follow-up preventivo dimenticato",
      text: "Cliente ha ricevuto preventivo da 28.000 euro 12 giorni fa, nessun riscontro. Automazione manda messaggio gentile via WhatsApp: 'Sig. Bianchi, ti aiuto a riprenderlo? Posso passare in cantiere venerdì'. Risposta in 18 minuti, sopralluogo confermato, cantiere firmato il giorno dopo.",
    },
    {
      title: "Notifica chiusura cantiere e recensione",
      text: "Cantiere chiuso il 15 marzo. Automazione manda messaggio 'Sig. Verdi, lavori completati, foto in archivio nel portale. Se ti è piaciuto il lavoro, ci aiuti con una recensione Google?'. Cliente clicca il link, lascia 5 stelle in 30 secondi.",
    },
  ],

  testimonialQuote:
    "Mandiamo un broadcast WhatsApp ogni mese a circa 800 clienti già nostri: tipo riattivazione manutenzione, novità sui bonus, fine cantiere. Le aperture viaggiano sopra il 90%, ogni broadcast porta 5-8 cantieri nuovi. Per noi è diventato il primo canale di marketing, davanti a Google Ads.",
  testimonialAuthor: "Marco P.",
  testimonialRole: "Edil Marche Srl, Ancona",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di attivare WhatsApp Marketing.",
  faqs: [
    {
      q: "Posso usare il mio numero WhatsApp personale?",
      a: "No. WhatsApp Business API richiede un numero dedicato (può essere nuovo o un fisso aziendale). Configuriamo noi tutto: il numero ottiene la spunta verde di verifica Meta e diventa il canale ufficiale dell'impresa, senza rischio ban del cellulare personale del titolare.",
    },
    {
      q: "Quanto costa un messaggio WhatsApp Business?",
      a: "Il costo è regolato da Meta in base alla categoria di template (marketing, utility, service). In Italia siamo tra 0,05 e 0,07 euro per messaggio di marketing. Il ROI è positivo già a un tasso di conversione dello 0,5%, contro il 4-8% medio osservato nelle imprese edili.",
    },
    {
      q: "Devo avere il consenso del cliente per mandare WhatsApp?",
      a: "Sì, è obbligatorio per GDPR. Edilizia in Cloud raccoglie il doppio opt-in al primo contatto, archivia il consenso con timestamp e fonte, e gestisce in automatico le disiscrizioni. Hai sempre prova del consenso documentabile in caso di ispezione.",
    },
    {
      q: "I template devono essere approvati da Meta?",
      a: "Sì, ogni template di broadcast deve essere preapprovato. Noi prepariamo 8 template settoriali (riattivazione, follow-up cantiere, manutenzione, ecc.) e li mandiamo in approvazione Meta durante l'onboarding. Approvazione media in 24-72 ore.",
    },
    {
      q: "Si integra con il mio CRM o devo importare i clienti a mano?",
      a: "Nessun import manuale. WhatsApp Marketing legge direttamente dal CRM Edilizia in Cloud: segmenti per tipologia cantiere, valore ticket, ultimo contatto, geolocalizzazione. Le liste si autoaggiornano in tempo reale.",
    },
    {
      q: "Quanto costa il modulo WhatsApp Marketing?",
      a: "Il modulo è incluso nei piani Professional e Business di Edilizia in Cloud. Paghi a parte solo i messaggi inviati a Meta (0,05-0,07 euro l'uno). Niente vincoli, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "WhatsApp Marketing è collegato a CRM, Cantieri e Automazioni.",
  internalLinksBody:
    "Le campagne WhatsApp vivono insieme al CRM, alle Automazioni e al modulo Cantieri. Ecco gli altri pezzi della piattaforma che le rendono potenti.",
  internalLinks: [
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Pipeline preventivi e segmentazione clienti per broadcast mirati." },
    { to: "/funzionalita/email-marketing", title: "Email Marketing", text: "Strategia complementare a WhatsApp per segmenti senza consenso." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Trigger no-code che lanciano i messaggi WhatsApp automaticamente." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Notifiche WhatsApp per ogni update del portale cliente." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Notifiche cliente automatiche su milestone cantiere." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Reminder WhatsApp sui preventivi pendenti." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI campagne WhatsApp nel dashboard executive." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Link di firma SAL via WhatsApp con validità eIDAS." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "I clienti che hai già in rubrica valgono molto più di quelli che inseguì con Google Ads. Inizia a parlargli.",
  finalCtaBody:
    "31 giorni gratuiti per attivare WhatsApp Marketing nella tua impresa edile. Numero Business API certificato, 8 template approvati Meta, segmentazione CRM e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Template Meta inclusi · GDPR conforme",

  stickyCtaLabel: "Prova gratis WhatsApp Marketing",
  stickyCtaMicrocopy: "Setup 48h · API Business certificata",

  applicationSubCategory: "Construction WhatsApp Marketing Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function WhatsappMarketing() {
  return <FunzionalitaPageTemplate config={config} />;
}
