import {
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardList,
  Filter,
  Globe,
  HardHat,
  Inbox,
  Kanban,
  Layers,
  Mail,
  MessageCircle,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "crm-edilizia",
  vertical: "CRM Edilizia",
  productName: "CRM Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, serramentisti e general contractor che vogliono un CRM verticale: pipeline preventivi, lead da Google/Facebook/passaparola, tagging cantieri (residenziale/commerciale), follow-up automatici",
  audienceShort: "imprese edili che vogliono un CRM verticale",

  seo: {
    title:
      "CRM Edilizia — Pipeline Preventivi, Gestione Lead e…",
    description:
      "CRM verticale per imprese edili: pipeline preventivi visuale, lead da Google/Facebook/passaparola, tagging cantieri…",
    keywords:
      "crm edilizia, software gestione clienti edile, pipeline preventivi edilizia, lead management impresa edile, crm verticale edile, gestione lead google ads edilizia, follow-up preventivi automatico",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · CRM Edilizia",
  heroH1Lead: "Il CRM pensato",
  heroH1Highlight: "per le imprese edili",
  heroH1Tail: "non riadattato",
  heroSubheadline:
    "CRM verticale per il settore edilizia: pipeline preventivi visuale tipo Kanban, raccolta lead da Google/Facebook/Instagram/passaparola, tagging cantieri (residenziale/commerciale/industriale), follow-up automatici a 5/12/20 giorni. Niente Salesforce sovradimensionato, niente Excel: pronto in 48 ore con i tuoi processi.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import lead",
    "Pipeline tipo Kanban edilizia",
    "+5% conversione preventivi media",
  ],
  proofPoints: [
    "Lead aggregati da 5 canali",
    "Tagging cantieri verticale",
    "Follow-up automatici nativi",
  ],

  objectiveRow: [
    ["Obiettivo", "Trasformare ogni lead in preventivo, ogni preventivo in cantiere"],
    ["Momento chiave", "Dal primo contatto alla firma del contratto"],
    ["Risultato", "Più cantieri firmati senza assumere commerciali"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano il CRM Edilizia per gestire pipeline preventivi e lead da Google Ads.",
  betaBody:
    "Il CRM Edilizia è già pronto: lo attiviamo in 48 ore importando i lead esistenti dai vari canali (Google Ads, Facebook, contatti sito, passaparola), configuriamo la pipeline preventivi sui tuoi step reali, attiviamo i primi 5 follow-up automatici e ti accompagniamo in 3 sessioni 1-a-1 fino al primo cantiere chiuso dal CRM.",

  speedH2:
    "Hai 50 preventivi pendenti in Excel. Non sai quale chiudere. Il CRM ti dice da dove partire.",
  speedSubheadline:
    "L'impresa edile media ha 30-80 preventivi attivi in qualunque momento, sparsi tra Excel, email, WhatsApp, blocco appunti. Senza una pipeline strutturata, il commerciale insegue chi gli viene in mente, non chi è davvero pronto a firmare. Il CRM mette ordine: vede chi è caldo, chi tiepido, chi morto.",
  speedStats: [
    { value: 5, prefix: "+", suffix: "%", label: "tasso conversione preventivi extra" },
    { value: 32, prefix: "-", suffix: "%", label: "tempo perso a cercare contatti dispersi" },
    { value: 60, suffix: " sec", label: "per registrare un nuovo lead in CRM" },
  ],

  familyH2: "CRM Edilizia collegato a tutta la piattaforma Edilizia in Cloud.",
  familySubheadline:
    "Il CRM non è isolato dal resto: è il punto di partenza che alimenta Preventivi, Marketing, Cantieri. Quando un lead diventa cliente, i suoi dati passano automaticamente a Cantieri e Fatturazione. Niente data entry duplicato.",
  familyItems: [
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Pipeline preventivi, lead multi-canale, tagging cantieri, follow-up automatici.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Genera preventivi direttamente dalla scheda lead del CRM, niente data entry.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Mail,
      title: "Email Marketing",
      text: "Liste create automaticamente dalla segmentazione CRM. Niente esportazioni.",
      to: "/funzionalita/email-marketing",
    },
    {
      icon: MessageCircle,
      title: "WhatsApp Marketing",
      text: "Broadcast e follow-up WhatsApp triggerati dagli eventi pipeline CRM.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Workflow,
      title: "Automazioni",
      text: "Trigger su pipeline: lead nuovo → notifica titolare, preventivo inviato → reminder.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Lead vinto → cantiere creato automaticamente con dati precompilati dal CRM.",
      to: "/funzionalita/gestione-cantieri",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Stessi dati cliente da prospect a fattura. Nessun data entry doppio.",
  familyBonusText:
    "Il lead entra dal CRM, diventa preventivo, si trasforma in cantiere, finisce in fatturazione. I dati cliente sono inseriti una sola volta e seguono tutto il ciclo. Niente più 'come si chiamava il cliente?' a metà del cantiere, niente più import-export tra strumenti diversi.",

  painKicker: "Il problema vero",
  painH2:
    "Hai 60 preventivi 'in attesa'. Non sai quali sono caldi, quali morti. Perdi i migliori per disorganizzazione.",
  painSubheadline:
    "L'impresa edile media perde tra il 25% e il 40% dei lead non per qualità del preventivo, ma per cattiva gestione del processo: nessuno richiama, nessuno segmenta, nessuno tagga. Il commerciale insegue chi si ricorda, dimentica chi vale di più. Il CRM rompe questo schema.",
  painPoints: [
    {
      icon: Inbox,
      title: "Lead sparsi tra Google Ads, Facebook, WhatsApp e biglietti",
      text: "Lead arrivano da 5 canali diversi: form Google Ads, Messenger Facebook, WhatsApp del titolare, biglietti da fiera, telefonate al numero fisso. Tutto si mescola, niente raccolto in un posto, statistiche per canale impossibili da fare.",
    },
    {
      icon: AlertTriangle,
      title: "Preventivi 'pendenti' senza follow-up",
      text: "Mandato il preventivo, fine. Nessuno richiama dopo 5 giorni, nessuno manda reminder. Cliente sparisce, va dal concorrente che fa follow-up serio. Tasso accettazione fermo al 22%, sotto la media settoriale del 35%.",
    },
    {
      icon: Filter,
      title: "Nessuna segmentazione su tipologia cantiere",
      text: "Cliente che ti ha fatto fare una ristrutturazione bagno è uguale a chi ti ha fatto un capannone industriale. Senza tagging non puoi mandare campagne mirate, fare offerte stagionali differenziate, identificare i clienti ad alto valore.",
    },
    {
      icon: Search,
      title: "Salesforce/HubSpot sovradimensionati e scollegati",
      text: "Provi un CRM generalista, ma è pensato per software house o agenzie. I campi non parlano di cantieri, le pipeline non hanno step edilizia, l'integrazione con fatturazione è inesistente. Costo alto, valore basso, lo abbandoni.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stessi lead. Stesse offerte. Cambia il processo, esplodono i preventivi firmati.",
  baSubheadline:
    "Il CRM Edilizia non aumenta i lead in entrata: trasforma i lead esistenti in cantieri firmati. Le imprese che lo attivano vedono salire il tasso di conversione preventivi del 5-12% nei primi 90 giorni, senza investire in più Google Ads.",
  baAreas: [
    {
      title: "Raccolta lead da canali diversi",
      before:
        "Lead Facebook in Messenger, lead Google Ads in Gmail, telefonate sul cellulare, biglietti da fiera in tasca. Niente posto unico, niente report per canale, l'80% dei lead persi nel rumore.",
      after:
        "Tutti i lead aggregati nel CRM con tag canale di origine. Statistiche per canale: quanti lead da Google, quanti firmati, costo per cantiere acquisito. Decisioni basate su dati.",
    },
    {
      title: "Pipeline preventivi e follow-up",
      before:
        "60 preventivi in stato 'pendente' su Excel. Niente sai quale è caldo, nessun follow-up programmato. Tasso accettazione 22%, perdi i clienti che voleva firmare ma erano indecisi.",
      after:
        "Pipeline Kanban con step (lead → contattato → sopralluogo → preventivo → trattativa → firmato). Follow-up automatici a 5/12/20 giorni. Tasso accettazione sale al 34%.",
    },
    {
      title: "Tagging e segmentazione",
      before:
        "Tutti i clienti uguali in un Excel piatto. Niente segmentazione per tipologia cantiere, ticket, area geografica. Campagne marketing 'una per tutti' che convertono pochissimo.",
      after:
        "Tag automatici: residenziale/commerciale/industriale, ticket basso/medio/alto, ultimo cantiere. Campagne email/WhatsApp segmentate, tassi di conversione 3x superiori.",
    },
    {
      title: "Continuità lead → cantiere",
      before:
        "Lead vinto → si crea cantiere a mano riscrivendo i dati. Errori di trascrizione, tempo perso, dati di origine perdita di contesto.",
      after:
        "Lead vinto → 1 click trasforma in cantiere con tutti i dati cliente, indirizzo, scope of work già compilati. Cantiere parte in 2 minuti, niente errori.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: lead in entrata, pipeline visuale, conversione tracciata.",
  mechanismSubheadline:
    "Il CRM Edilizia è progettato per la realtà operativa di un'impresa edile italiana: aggregazione automatica di lead da tutti i canali, pipeline visuale Kanban con step edilizia, follow-up nativi, conversione del lead in cantiere con un click.",
  mechanismSteps: [
    {
      icon: UserPlus,
      title: "Aggregazione lead da tutti i canali",
      text: "Connettori nativi: Google Ads, Facebook/Instagram, form sito web, WhatsApp Business, telefonate IVR, biglietti fiera (foto + OCR). Tutti i lead nel CRM con tag canale di origine, in tempo reale.",
    },
    {
      icon: Kanban,
      title: "Pipeline visuale Kanban edilizia",
      text: "Step pre-configurati: lead → contattato → sopralluogo → preventivo inviato → trattativa → firmato → perso. Drag&drop per spostare lead, vista per commerciale, statistiche per step.",
    },
    {
      icon: Bell,
      title: "Follow-up automatici e conversione",
      text: "Reminder automatici a 5/12/20 giorni post-preventivo. Notifiche al commerciale quando un lead resta troppo in uno step. Conversione lead → cantiere in 1 click, dati precompilati.",
    },
  ],
  mechanismCta: "Apri la pipeline CRM di prova",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Più cantieri firmati dai lead che già hai. Senza un euro extra in marketing.",
  commercialBody:
    "Il CRM Edilizia non porta lead nuovi: trasforma quelli esistenti in cantieri. Il +5% di conversione media osservato sui clienti su un volume di 200 lead/anno e ticket medio 12.000 € significa 12.000 € extra di fatturato senza spendere un euro extra in marketing.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "+5% conversione preventivi",
      text: "Pipeline strutturata + follow-up automatici = più preventivi firmati. La media osservata sulle imprese che attivano il CRM è +5 punti, alcune arrivano a +12. Crescita pura senza investimenti in pubblicità.",
    },
    {
      icon: BarChart3,
      title: "ROI per canale lead misurabile",
      text: "Capisci quanto vale ogni euro speso in Google Ads, Facebook, fiere. Per ogni canale: lead in ingresso, tasso conversione, fatturato attribuibile, costo per cantiere. Decisioni di marketing basate su dati.",
    },
    {
      icon: Layers,
      title: "Segmentazione per cross-sell",
      text: "Cliente che ha fatto ristrutturazione bagno è target per manutenzione tra 6 mesi. Cliente residenziale è target per bonus stagionali. Tagging automatico → cross-sell strutturato → fatturato ricorrente.",
    },
    {
      icon: Sparkles,
      title: "Verticale, non sovradimensionato",
      text: "Niente Salesforce con 80 campi che non usi. CRM ottimizzato per imprese edili: campi cantiere, step pipeline edilizia, integrazione preventivi/fatturazione/cantieri nativa.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Il commerciale smette di rincorrere i lead a memoria. Il sistema dice da dove partire.",
  resultsBody:
    "Quando ogni lead è in pipeline, ogni preventivo ha follow-up automatici, ogni canale ha statistiche misurabili, il commerciale lavora in modo strutturato. Le imprese che attivano il CRM vedono crescere la conversione del 5-12% e ridurre il tempo di ricerca contatti del 30%.",
  integrationPillars: [
    {
      icon: Globe,
      title: "Aggregazione multi-canale",
      text: "Google Ads, Facebook, Instagram, sito, WhatsApp, telefonate IVR, biglietti fiera. Tutti i lead in un posto solo, con tag canale di origine.",
    },
    {
      icon: Kanban,
      title: "Pipeline Kanban edilizia",
      text: "Step pre-configurati per il settore: contattato → sopralluogo → preventivo → trattativa → firmato. Drag&drop, statistiche per step, vista per commerciale.",
    },
    {
      icon: Tag,
      title: "Tagging cantieri verticale",
      text: "Residenziale/commerciale/industriale, ticket basso/medio/alto, area geografica, tipologia lavoro. Per cross-sell e campagne mirate.",
    },
    {
      icon: Workflow,
      title: "Follow-up e automazioni native",
      text: "Reminder automatici, notifiche al commerciale, conversione lead → cantiere in 1 click. Tutto integrato con email, WhatsApp, preventivi.",
    },
  ],
  resultStats: [
    { value: 5, prefix: "+", suffix: "%", label: "tasso conversione preventivi medio" },
    { value: 30, prefix: "-", suffix: "%", label: "tempo perso a cercare contatti" },
    { value: 100, prefix: "%", suffix: "", label: "lead tracciati con canale di origine" },
  ],
  resultsCta: "Apri la dashboard CRM Edilizia",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto vali in più se chiudi il 5% in più dei preventivi che già fai?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di lead al mese e ticket medio dei tuoi cantieri. La stima parte dal +5% di conversione osservato e dal 12% di margine medio dei lavori edili.",
  roi: {
    input1Label: "Lead nuovi al mese",
    input1Default: 30,
    input1Min: 5,
    input1Max: 500,
    input1Step: 1,
    input2Label: "Ticket medio cantiere (€)",
    input2Default: 12000,
    input2Min: 1000,
    input2Max: 100000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Margine extra annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.05 * b * 0.12),
    computeSecondary: (a, b) => [
      { label: "Cantieri extra/anno", value: `${Math.round(a * 12 * 0.05)}` },
      { label: "Fatturato extra/anno", value: `${Math.round(a * 12 * 0.05 * b).toLocaleString("it-IT")} €` },
      { label: "Conversione attuale stimata", value: "22-28%" },
    ],
    closingPitch:
      "Stima conservativa: +5 punti di conversione su lead annuali × ticket medio × 12% margine. Le imprese che usano CRM strutturato + follow-up automatici vedono spesso +10-12 punti, raddoppiando questa stima.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Niente più lead persi. Niente più preventivi dimenticati. Solo opportunità seguite con metodo.",
  salesBody:
    "Il CRM Edilizia cambia 4 dimensioni operative: come raccogli lead, come segui la pipeline, come decidi dove spendere in marketing, come trasformi un cliente in cliente ricorrente.",
  salesImpact: [
    {
      title: "Lead aggregati e mai persi",
      text: "Ogni lead da ogni canale viene aggregato nel CRM in tempo reale. Il commerciale apre la sua dashboard la mattina e vede tutti i lead nuovi della notte, già taggati per canale.",
    },
    {
      title: "Pipeline visiva, da dove partire chiaro",
      text: "La vista Kanban mostra subito chi è caldo, chi tiepido, chi morto. Il commerciale lavora dove serve, non dove gli viene in mente. +5-12% conversione media.",
    },
    {
      title: "Marketing scientifico per canale",
      text: "Per ogni euro speso in Google Ads, Facebook, fiere, sai quanto fatturato genera. Sposti budget dai canali deboli ai forti, ROI marketing cresce del 30-40%.",
    },
    {
      title: "Cross-sell e fidelizzazione strutturati",
      text: "Tagging automatico → campagne mirate → cantieri ricorrenti. Cliente residenziale che ha fatto bagno diventa target per cucina, manutenzione, cappotto. Più revenue per cliente.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Aggregazione lead multi-canale",
      value:
        "Connettori nativi Google Ads, Facebook/Instagram Lead Ads, form sito web, WhatsApp Business, IVR telefonate, OCR biglietti fiera. Tutti i lead nel CRM in tempo reale.",
    },
    {
      label: "Pipeline Kanban edilizia",
      value:
        "Step pre-configurati: lead → contattato → sopralluogo → preventivo → trattativa → firmato → perso. Drag&drop, vista per commerciale, statistiche per step.",
    },
    {
      label: "Tagging cantieri verticale",
      value:
        "Residenziale/commerciale/industriale, ticket basso/medio/alto, area geografica, tipologia lavoro (ristrutturazione, nuovo, manutenzione). Per segmentazione e cross-sell.",
    },
    {
      label: "Follow-up automatici post-preventivo",
      value:
        "Reminder automatici via email/WhatsApp a 5, 12, 20 giorni dall'invio del preventivo. Notifiche al commerciale se il lead resta troppo in uno step.",
    },
    {
      label: "Statistiche per canale e per commerciale",
      value:
        "Lead in ingresso, tasso conversione, fatturato attribuibile, costo per cantiere acquisito. Per canale (Google, FB, fiera) e per commerciale. ROI marketing scientifico.",
    },
    {
      label: "Conversione lead → cantiere in 1 click",
      value:
        "Lead vinto → cantiere creato con dati precompilati dal CRM (cliente, indirizzo, scope, ticket). Niente data entry doppio, parte tutto in 2 minuti.",
    },
    {
      label: "Integrazione con preventivi, marketing, fatturazione",
      value:
        "Genera preventivi dalla scheda lead, segmenti per email/WhatsApp marketing, dati cliente che seguono fino alla fattura SDI. Tutto nativo.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui il CRM Edilizia cambia il fatturato del trimestre.",
  scenarios: [
    {
      title: "Lead Facebook che si scalda con follow-up automatici",
      text: "Lead arriva da Facebook Lead Ads alle 23:30. Il giorno dopo riceve email automatica con presentazione impresa e portfolio. A 3 giorni WhatsApp 'vuoi un sopralluogo?'. Cliente conferma sopralluogo, sopralluogo fatto venerdì, preventivo inviato lunedì, firmato giovedì. 22.000 € chiusi senza chiamare il commerciale.",
    },
    {
      title: "Pipeline che identifica i preventivi caldi",
      text: "Commerciale apre il CRM lunedì mattina. Vista 'preventivi inviati 7-14 giorni fa' mostra 8 lead caldi. Li chiama tutti tra le 9 e le 11. 3 confermano sopralluogo, 1 firma direttamente. Lavoro mirato, niente tempo perso a chiamare lead morti.",
    },
    {
      title: "ROI Google Ads misurato e ottimizzato",
      text: "Dopo 6 mesi di tracciamento, il dashboard CRM mostra: campagna Google 'cappotto termico' costa 1.200 €/mese e porta 8 cantieri a 18.000 € medi. Campagna 'ristrutturazione bagno' costa 800 €/mese e porta 12 cantieri a 6.500 € medi. Sposti budget verso la prima, +35% margine totale Google Ads.",
    },
  ],

  testimonialQuote:
    "Avevamo lead sparsi tra Gmail, Messenger, biglietti da fiera in tasca. Niente sapevamo quale Google Ads funzionava, niente sapevamo quali preventivi richiamare. Da quando usiamo il CRM Edilizia, tutti i lead in un posto, pipeline chiara, follow-up automatici. Conversione preventivi salita dal 24% al 36% in 8 mesi.",
  testimonialAuthor: "Andrea M.",
  testimonialRole: "Studio Edile Marche, Pesaro",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di adottare il CRM.",
  faqs: [
    {
      q: "Si integra con Google Ads e Facebook Lead Ads?",
      a: "Sì, integrazione nativa. Configurati durante l'onboarding, i lead arrivano nel CRM in tempo reale con tag canale di origine. Statistiche per canale, ROI per campagna, ottimizzazione del budget marketing su dati reali.",
    },
    {
      q: "Posso importare i miei lead da Excel/HubSpot/Salesforce?",
      a: "Sì. Durante l'onboarding importiamo tutti i tuoi lead esistenti da CSV, Excel, o connettori HubSpot/Salesforce. Mappatura automatica dei campi su quelli del CRM Edilizia. Niente lavoro manuale di copia-incolla.",
    },
    {
      q: "La pipeline è personalizzabile?",
      a: "Sì. Gli step di default sono già ottimizzati per il settore edilizia (lead → contattato → sopralluogo → preventivo → trattativa → firmato), ma puoi aggiungere/rinominare step in base ai tuoi processi reali. Drag&drop, niente codice.",
    },
    {
      q: "Posso vedere statistiche per commerciale?",
      a: "Sì. Dashboard per commerciale: lead assegnati, tasso conversione, ticket medio, fatturato firmato. Utile per gestire il team, identificare top performer, capire dove serve formazione.",
    },
    {
      q: "Il CRM è incluso nel piano base?",
      a: "Sì. Il CRM Edilizia è incluso in tutti i piani Edilizia in Cloud (Starter, Professional, Business). Differenze tra piani: numero utenti, automazioni, integrazioni avanzate. Niente costi extra per CRM.",
    },
    {
      q: "Funziona da mobile?",
      a: "Sì. App mobile nativa iOS e Android. Il commerciale aggiorna la pipeline da cantiere, vede lead nuovi, fa follow-up via WhatsApp dal telefono. Sincronizzazione real-time con il desktop.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il CRM è il punto di partenza che alimenta tutta la piattaforma.",
  internalLinksBody:
    "Il CRM Edilizia vive collegato a Preventivi, Marketing, Cantieri, Fatturazione. Ecco gli altri moduli che lo rendono potente.",
  internalLinks: [
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Genera preventivi direttamente dalla scheda lead CRM." },
    { to: "/funzionalita/email-marketing", title: "Email Marketing", text: "Segmentazione automatica dal CRM per campagne mirate." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Follow-up WhatsApp triggerati dagli eventi pipeline." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Trigger su pipeline: lead nuovo → notifica titolare." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Lead vinto → cantiere creato con dati precompilati." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Cliente diventato attivo accede al portale dal CRM." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI commerciali e pipeline nel dashboard executive." },
    { to: "/funzionalita/agenti-ai", title: "Agenti AI", text: "AI per qualificare lead, suggerire follow-up, scrivere risposte." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di perdere preventivi per disorganizzazione. Trasforma i lead in cantieri firmati con metodo.",
  finalCtaBody:
    "31 giorni gratuiti per attivare il CRM Edilizia. Pipeline Kanban, integrazione Google/Facebook, follow-up automatici, segmentazione cantieri e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Pipeline Kanban · Integrazione Google/FB",

  stickyCtaLabel: "Prova gratis CRM Edilizia",
  stickyCtaMicrocopy: "Setup 48h · +5% conversione",

  applicationSubCategory: "Construction CRM Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function CrmEdilizia() {
  return <FunzionalitaPageTemplate config={config} />;
}
