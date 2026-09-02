import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Eye,
  FileSignature,
  FileText,
  Globe,
  HardHat,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Phone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "portale-clienti",
  definizione:
    "Il Portale Clienti di Edilizia in Cloud è l'area riservata, con il marchio dell'impresa, da cui ogni cliente vede da web e telefono l'avanzamento del cantiere, le foto del giorno, i documenti tecnici, i SAL da firmare online, le fatture e le scadenze, senza dover chiamare l'impresa.",
  vertical: "Portale Clienti",
  productName: "Portale Clienti Edilizia in Cloud",
  audience: "Imprese edili, ristrutturatori, general contractor, serramentisti che vogliono trasparenza con il cliente finale e ridurre del 60% telefonate di update",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Portale Clienti Edilizia",
    description:
      "Area cliente brandizzata dove ogni cliente vede in tempo reale: avanzamento del cantiere, foto, documenti, fatture, SAL firmabili online.",
    keywords:
      "portale clienti edilizia, area cliente impresa edile, portale cantiere cliente, app cliente edilizia, software trasparenza cantiere, portale ristrutturazione cliente, dashboard cliente edilizia, area riservata clienti edili",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Portale Clienti",
  heroH1Lead: "Il tuo cliente vede il cantiere",
  heroH1Highlight: "senza chiamarti",
  heroH1Tail: "ogni 3 giorni",
  heroSubheadline:
    "Area cliente brandizzata dove ogni cliente accede da web e mobile per vedere avanzamento cantiere in tempo reale, foto del giorno, documenti tecnici, SAL firmabili online, fatture e scadenze. Trasparenza totale senza WhatsApp, senza chiamate di aggiornamento, senza ansia di entrambi.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Brand del cliente personalizzato", "Accesso sicuro per cantiere"],
  proofPoints: [
    "Avanzamento lavori in real time",
    "Foto cantiere geolocalizzate",
    "SAL e documenti firmabili online",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare le telefonate 'come va il cantiere?' del cliente"],
    ["Momento chiave", "Ogni mattina, ogni sera, ogni dubbio del cliente"],
    ["Risultato", "Cliente più tranquillo, impresa più professionale"],
  ],

  betaH2: "Più di 320 imprese italiane usano il Portale Clienti per migliorare la trasparenza con i loro clienti finali.",
  betaBody:
    "Il Portale Clienti è il volto digitale della tua impresa: lo attiviamo in 48 ore, lo personalizziamo con logo e colori della tua azienda, importiamo i clienti attivi, configuriamo accessi sicuri per cantiere e ti accompagniamo in 4 sessioni 1-a-1 fino a quando i clienti ricevono il primo invito al portale.",

  speedH2: "Il cliente ti chiama 'come va il cantiere' perché non sa. Smetti di farlo aspettare al telefono.",
  speedSubheadline:
    "L'impresa edile media riceve 20-40 chiamate al giorno di clienti che chiedono update. Per ognuna serve un capocantiere, una segreteria, un titolare. Il portale clienti elimina queste chiamate alla radice: il cliente vede da solo ciò che gli interessa, in tempo reale.",
  speedStats: [
    { value: 60, prefix: "-", suffix: "%", label: "telefonate cliente di update cantiere" },
    { value: 95, prefix: "+", suffix: "%", label: "soddisfazione cliente sui cantieri attivi" },
    { value: 24, suffix: "/7", label: "accesso al portale cliente" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata al cliente finale.",
  familySubheadline:
    "Il Portale Clienti non è un add-on: è il punto di contatto digitale tra l'impresa e il cliente finale. Mostra in tempo reale ciò che succede in cantiere, fattura, scadenze, foto. Tutto senza che tu debba inserire dati doppi: i dati esistono già in altri moduli.",
  familyItems: [
    {
      icon: Globe,
      title: "Portale Clienti",
      text: "Area cliente brandizzata con avanzamento cantiere, foto, documenti, SAL firmabili online.",
      to: "/funzionalita/portale-clienti",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori e foto cantiere alimentano direttamente la vista del cliente.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Preventivi firmabili online direttamente dal portale cliente, accettazione tracciata.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture emesse via SDI visibili sul portale cliente con stato pagamento e scadenza.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "SAL, varianti, contratti firmabili dal portale con valore legale eIDAS.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: ImageIcon,
      title: "Foto Cantiere",
      text: "Galleria foto cantiere geolocalizzate condivise con il cliente in tempo reale.",
      to: "/funzionalita/foto-cantiere",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Trasparenza totale al cliente.",
  familyBonusText:
    "Quando un capocantiere registra l'avanzamento giornaliero, il portale del cliente si aggiorna. Quando emetti una fattura via SDI, compare nel portale. Quando il cliente firma un SAL online, il sistema lo riconosce. Trasparenza che non costa lavoro extra: vive grazie ai dati che già produci ogni giorno.",

  painKicker: "Il problema vero",
  painH2: "Il cliente chiama 3 volte a settimana 'per sapere come va'. Non perché è ansioso: perché non sa.",
  painSubheadline:
    "Il cliente medio di un'impresa edile vive il cantiere come una scatola nera. Senza visibilità, l'unico modo per ridurre l'ansia è chiamare. Più chiama, più tu perdi tempo. Più passa il tempo senza update, più il cliente diventa diffidente. Il portale cliente rompe questo ciclo.",
  painPoints: [
    {
      icon: Phone,
      title: "Telefonate di update che bruciano la giornata",
      text: "20-40 chiamate al giorno di clienti diversi che chiedono lo stesso: 'come va? quando finite?'. Capocantiere fermo a rispondere, segreteria sommersa, titolare disturbato 5 volte al giorno.",
    },
    {
      icon: AlertTriangle,
      title: "Cliente diffidente perché non sa nulla",
      text: "Senza visibilità, il cliente immagina il peggio: 'non stanno lavorando', 'sono in ritardo', 'mi stanno fregando'. La fiducia si erode anche quando il cantiere va benissimo. Cause: zero comunicazione strutturata.",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp del titolare diventato un servizio assistenza",
      text: "Il titolare riceve 50 messaggi WhatsApp al giorno tra clienti, capocantieri, fornitori. Niente è separato, tutto si mescola. La vita personale del titolare sparisce.",
    },
    {
      icon: FileText,
      title: "Documenti chiesti più volte (e mai trovati subito)",
      text: "Cliente chiede 'mi mandi la fattura?', 'mi mandi il SAL del 12 marzo?', 'avete il computo metrico?'. Ogni richiesta è 5 minuti di ricerca. Moltiplicato per 20 clienti × 30 giorni: 50 ore al mese.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi clienti, stesso cantiere, stessa qualità. Cambia la trasparenza percepita.",
  baSubheadline:
    "Il portale cliente non cambia la qualità del lavoro che fai: cambia come il cliente lo percepisce. Il cantiere bello che era 'invisibile' diventa visibile. La fiducia cresce. Le chiamate scompaiono.",
  baAreas: [
    {
      title: "Update sullo stato del cantiere",
      before:
        "Cliente chiama o scrive WhatsApp 2-3 volte a settimana per sapere come va. Capocantiere e segreteria fermi a rispondere. Tempo perso e cliente comunque non sereno.",
      after:
        "Cliente entra nel portale dal browser o telefono, vede percentuale avanzamento, foto del giorno, prossimi step. Chiama solo se ha vere domande, non per ansia.",
    },
    {
      title: "Condivisione documenti tecnici",
      before:
        "Cliente chiede SAL, computo metrico, fattura, contratto. Segreteria cerca, scansiona, manda email. 5-15 minuti per documento. Moltiplicato per N clienti.",
      after:
        "Cliente entra nel portale e scarica direttamente: SAL, fatture, computo, contratti, certificazioni. Self-service totale, zero richieste alla segreteria.",
    },
    {
      title: "Firma SAL e varianti",
      before:
        "SAL stampato, consegnato al cliente, firmato a penna, ritirato, scansionato, archiviato. 3-5 giorni di lentezza. Per le varianti il giro si ripete.",
      after:
        "SAL pubblicato sul portale con notifica push al cliente. Cliente firma elettronicamente dal telefono in 30 secondi. Validità legale eIDAS. Tu hai notifica immediata.",
    },
    {
      title: "Reputazione e trust con il cliente",
      before:
        "Cliente racconta agli amici 'ho preso un'impresa, sembrano professionali ma non so cosa fanno'. Recensioni Google tiepide, passaparola lento.",
      after:
        "Cliente vede ogni giorno i progressi sul portale, mostra agli amici come funziona. Recensioni 5 stelle, passaparola caldo. Lead nuovi che arrivano già impressionati dalla trasparenza.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, niente formazione cliente, niente app da installare.",
  mechanismSubheadline:
    "Il portale cliente è progettato per non richiedere training: ogni cliente riceve un link via email/SMS, accede da browser, vede solo i suoi cantieri. Funziona da telefono, tablet, desktop.",
  mechanismSteps: [
    {
      icon: Lock,
      title: "Cliente riceve invito sicuro al portale",
      text: "Email/SMS con link di attivazione, password autoselezionata o magic link. Accesso solo ai propri cantieri, niente vista su altri clienti, log di accesso tracciato.",
    },
    {
      icon: Eye,
      title: "Vede in tempo reale tutto ciò che lo riguarda",
      text: "Avanzamento %, foto cantiere geolocalizzate, prossimi step, SAL firmabili, fatture emesse, scadenze pagamento, documenti tecnici, contatto diretto al capocantiere.",
    },
    {
      icon: Bell,
      title: "Riceve notifiche solo quando serve",
      text: "Notifica push o email quando: nuovo SAL da firmare, milestone cantiere completata, nuova fattura emessa, foto importanti caricate, varianti proposte. Mai spam, solo update utili.",
    },
  ],
  mechanismCta: "Apri il portale di prova come cliente",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Trasparenza totale = recensioni 5 stelle = passaparola caldo.",
  commercialBody:
    "Il portale clienti non è un costo IT: è uno strumento di marketing diretto. Le imprese che hanno attivato il portale cliente registrano un aumento medio del 35% di recensioni Google a 5 stelle e un 28% di lead nuovi da passaparola caldo.",
  commercialLevers: [
    {
      icon: Star,
      title: "Recensioni 5 stelle 'organiche'",
      text: "Quando il cliente vive il cantiere con trasparenza, lascia recensioni positive senza che tu debba chiederle. La trasparenza è il primo driver di soddisfazione.",
    },
    {
      icon: TrendingUp,
      title: "Lead nuovi da passaparola caldo",
      text: "Il cliente mostra agli amici 'guarda come funziona la mia impresa, ho il portale dove vedo tutto'. È la migliore demo di vendita possibile, fatta dal cliente stesso.",
    },
    {
      icon: ShieldCheck,
      title: "Difesa legale in caso di contestazione",
      text: "Foto datate e geolocalizzate, SAL firmati elettronicamente con marca temporale, archivio cloud. In caso di contestazioni, hai tutto pronto in 5 minuti.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come impresa moderna",
      text: "Il cliente percepisce subito 'questa è un'impresa strutturata, non un artigiano'. Posizionamento commerciale superiore, ticket medio più alto, sconti chiesti meno.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il cliente smette di chiamare. Tu torni a lavorare.",
  resultsBody:
    "Quando il cliente ha visibilità autonoma sul cantiere, le chiamate calano del 60%, le recensioni positive salgono del 35%, e il tempo del titolare/segreteria torna disponibile per il lavoro vero. Non è un piccolo cambiamento: è una trasformazione operativa.",
  integrationPillars: [
    {
      icon: Smartphone,
      title: "Avanzamento cantiere live",
      text: "Percentuale di avanzamento globale, milestone settimanali, prossimi step pianificati. Aggiornato in tempo reale dai dati che il capocantiere registra.",
    },
    {
      icon: ImageIcon,
      title: "Galleria foto cantiere geolocalizzate",
      text: "Tutte le foto scattate dal capocantiere, organizzate per giorno, geolocalizzate sul cantiere. Il cliente vede progressi visivi senza chiedere.",
    },
    {
      icon: FileSignature,
      title: "SAL e varianti firmabili online",
      text: "SAL pubblicati sul portale, firma elettronica eIDAS dal telefono in 30 secondi. Notifica immediata al titolare quando il cliente firma.",
    },
    {
      icon: Receipt,
      title: "Fatture e scadenze trasparenti",
      text: "Fatture emesse via SDI visibili sul portale, stato pagamento (pagata/in scadenza/scaduta), download diretto, integrazione con piattaforme di pagamento online.",
    },
  ],
  resultStats: [
    { value: 60, prefix: "-", suffix: "%", label: "telefonate cliente di update cantiere" },
    { value: 35, prefix: "+", suffix: "%", label: "recensioni Google 5 stelle nei primi 6 mesi" },
    { value: 95, prefix: "+", suffix: "%", label: "soddisfazione cliente sui cantieri attivi" },
  ],
  resultsCta: "Apri la dashboard portale clienti",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto tempo recuperi se il cliente smette di chiamarti per gli update?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di clienti attivi e tempo medio bruciato in update telefonici/WhatsApp. La stima parte dal -60% di chiamate osservato nei nostri clienti dopo 90 giorni.",
  roi: {
    input1Label: "Clienti attivi gestiti",
    input1Default: 12,
    input1Min: 2,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Costo orario interno (€)",
    input2Default: 30,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 1.5 * 0.6 * 50 * b),
    computeSecondary: (a, b) => [
      { label: "Ore di update recuperate/anno", value: `${Math.round(a * 1.5 * 0.6 * 50)} h` },
      { label: "Riduzione chiamate cliente", value: "60%" },
      { label: "Stima recensioni 5★ extra/anno", value: `${Math.round(a * 0.4)}` },
    ],
    closingPitch:
      "Stima prudenziale basata su 1,5h update/cliente/settimana ridotte del 60%. Aggiungi le recensioni 5 stelle che ne derivano e l'effetto su lead e ticket medio.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un portale tecnico. Uno strumento di marketing che rende il cliente tuo testimonial.",
  salesBody:
    "Il portale cliente è il punto di contatto continuo che trasforma il cliente da 'compratore' a 'testimonial'. Le imprese che lo usano in modo strutturato vedono cambiare 4 dimensioni operative.",
  salesImpact: [
    {
      title: "Telefonate di update azzerate",
      text: "Capocantiere e segreteria smettono di rispondere a 'come va?'. Il cliente vede da solo. Il tempo torna disponibile per il lavoro produttivo.",
    },
    {
      title: "Recensioni Google a 5 stelle",
      text: "Il cliente recensisce positivamente perché ha vissuto il cantiere con trasparenza. Le recensioni alimentano il SEO locale e i lead organici.",
    },
    {
      title: "Trattative future con clienti referenziati",
      text: "Il passaparola del cliente soddisfatto diventa il primo canale lead. 'Mi è arrivato un altro cliente che voleva lo stesso portale che hai fatto vedere'.",
    },
    {
      title: "Difesa legale in caso di contestazione",
      text: "Foto datate, SAL firmati, scambi documentati. In caso di contestazione, esporti il dossier completo in 2 minuti. Vinci più cause perché hai prova continua.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    { label: "Brand personalizzato della tua impresa", value: "Logo, colori, dominio personalizzato (es. portale.tuaimpresa.it). Il cliente percepisce un servizio premium della tua azienda, non di Edilizia in Cloud." },
    { label: "Avanzamento cantiere in tempo reale", value: "Percentuale completamento, milestone, prossimi step. Aggiornato dai dati del capocantiere senza data entry duplicato." },
    { label: "Galleria foto geolocalizzate", value: "Foto scattate dal capocantiere via app mobile, organizzate per giorno e geolocalizzate. Cliente vede progressi visivi continui." },
    { label: "SAL e varianti firmabili online", value: "Cliente firma SAL elettronicamente dal telefono in 30 secondi, validità legale eIDAS, notifica immediata al titolare." },
    { label: "Fatture e scadenze trasparenti", value: "Fatture SDI visibili sul portale con stato (in scadenza/pagata/scaduta), download PDF, integrazione pagamento online." },
    { label: "Documenti tecnici e contratti", value: "Computo metrico, contratti, capitolati, certificazioni materiali, schede tecniche, autorizzazioni. Tutto archiviato a cloud, sempre disponibile." },
    { label: "Messaggistica diretta tracciata", value: "Cliente può scrivere al capocantiere o titolare dal portale. Tutti i messaggi tracciati, cercabili, archiviati. Niente WhatsApp privato disperso." },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il Portale Clienti cambia la giornata.",
  scenarios: [
    {
      title: "Cliente curioso a sera tarda",
      text: "Cliente alle 22:30 vuole sapere come va il cantiere. Apre il portale dal telefono: vede 67% di avanzamento, 8 foto del giorno, prossima milestone tra 4 giorni. Chiude soddisfatto, niente WhatsApp al titolare." },
    {
      title: "SAL urgente da firmare prima del weekend",
      text: "Venerdì pomeriggio devi far firmare un SAL prima del weekend per pagare i fornitori lunedì. Pubblichi sul portale, cliente riceve push notification, firma elettronica in 30 secondi, lunedì paghi i fornitori puntuale." },
    {
      title: "Contestazione di una variante",
      text: "Cliente dice 'questa variante non l'avevo approvata'. Apri il portale: variante pubblicata il 12 marzo, firmata elettronicamente dal cliente il 13 marzo alle 18:42. La discussione si chiude in 2 minuti." },
  ],

  testimonialQuote:
    "Da quando ho attivato il portale, i clienti mi chiamano molto meno. E quando mi chiamano, è per parlare di cose vere, non per chiedere come va. Le recensioni Google sono passate da 4.2 a 4.8 in 6 mesi, e mi arrivano lead nuovi che hanno visto il portale del vicino di casa.",
  testimonialAuthor: "Davide T.",
  testimonialRole: "Tre Costruzioni Srl, Milano",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    { q: "Il cliente deve installare un'app?", a: "No. Il portale funziona da browser su telefono, tablet, desktop. Niente app da scaricare, niente formazione. Il cliente riceve un link via email/SMS, accede e usa il portale come una qualsiasi area cliente bancaria." },
    { q: "Posso personalizzarlo con il mio brand?", a: "Sì. Logo, colori, dominio personalizzato (es. portale.tuaimpresa.it). Il cliente percepisce un servizio della tua impresa, non di Edilizia in Cloud. Personalizzazione inclusa nel piano Professional e Business." },
    { q: "Il cliente vede tutto o solo il suo cantiere?", a: "Solo il suo. Ogni cliente vede esclusivamente i propri cantieri, fatture, documenti. Sicurezza per cantiere, log di accesso tracciato, conformità GDPR. Niente accesso incrociato tra clienti diversi." },
    { q: "Il cliente può firmare i SAL legalmente sul portale?", a: "Sì. Firma elettronica avanzata conforme eIDAS, marca temporale, archivio cloud immutabile. In caso di contestazione, ha valore probatorio equivalente alla firma autografa." },
    { q: "Si integra con le mie fatture elettroniche?", a: "Sì. Le fatture emesse via SDI vengono automaticamente pubblicate nel portale del cliente con stato pagamento aggiornato (in scadenza/pagata/scaduta). Niente data entry duplicato." },
    { q: "Quanto costa? Ci sono vincoli contrattuali?", a: "Il modulo Portale Clienti è incluso nei piani Professional e Business di Edilizia in Cloud. Numero di clienti illimitato, nessun costo per cliente attivo. Cancelli quando vuoi." },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il portale vive collegato a tutto il resto. Ecco come.",
  internalLinksBody: "Il Portale Clienti è il volto del tuo sistema, alimentato da Gestione Cantieri, Fatturazione, Foto Cantiere e Firma Elettronica.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Avanzamento lavori e foto cantiere alimentano la vista del cliente." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Galleria foto cantiere geolocalizzate condivise sul portale cliente." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "SAL, varianti, contratti firmabili dal portale con valore eIDAS." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica SDI", text: "Fatture pubblicate sul portale cliente con stato pagamento." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Preventivi firmabili online direttamente dal portale cliente." },
    { to: "/funzionalita/ticket-assistenza", title: "Ticket Assistenza", text: "Sistema ticket per richieste post-vendita dal portale cliente." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Notifiche cliente del portale via WhatsApp Business." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Portale Clienti incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di rispondere alle stesse domande 20 volte. Inizia a far vedere il cantiere al cliente.",
  finalCtaBody:
    "31 giorni gratuiti per portare il Portale Clienti dentro la tua impresa edile. Setup in 48 ore, brand personalizzato, accesso sicuro per cantiere e firma elettronica eIDAS inclusi. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Brand personalizzato · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Portale Clienti",
  stickyCtaMicrocopy: "Setup 48h · Cliente illimitati",

  applicationSubCategory: "Construction Customer Portal Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function PortaleClienti() {
  return <FunzionalitaPageTemplate config={config} />;
}
