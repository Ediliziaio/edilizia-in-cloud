import {
  AlertTriangle,
  BookOpen,
  Bot,
  Camera,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Database,
  Euro,
  FileSignature,
  FileText,
  HardHat,
  Image as ImageIcon,
  Layers,
  Map,
  PenTool,
  Receipt,
  Rocket,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "quote-builder-ai",
  vertical: "Quote Builder AI",
  productName: "Quote Builder AI Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, installatori e general contractor che vogliono generare preventivi tecnici in 5 minuti con AI partendo da foto di cantiere, prezzari regionali integrati e suggerimento computo metrico automatico, mantenendo qualità tecnica e marginalità",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Quote Builder AI — Generatore Preventivi Edilizia con AI in 5 Minuti | Edilizia in Cloud",
    description:
      "Generatore preventivi assistito da AI per imprese edili: riconoscimento foto cantiere, suggerimento computo metrico, prezzari regionali integrati DEI, draft preventivo in 5 minuti. Setup in 48 ore.",
    keywords:
      "quote builder AI edilizia, generatore preventivi AI, software preventivi edilizia AI, AI computo metrico, preventivo automatico edilizia, prezzari regionali edilizia software, AI riconoscimento foto cantiere, software preventivo veloce, AI ristrutturazione preventivo, computo metrico automatico AI",
    ogImage: "https://www.ediliziaincloud.com/og/quote-builder-ai-og.jpg",
  },

  heroBadge: "Funzionalità · Quote Builder AI",
  heroH1Lead: "Preventivo edilizia tecnico",
  heroH1Highlight: "in 5 minuti",
  heroH1Tail: "non in 4 giorni",
  heroSubheadline:
    "Generatore di preventivi assistito da AI verticale edilizia: scatti foto del cantiere, l'AI riconosce ambienti e finiture, suggerisce voci di computo metrico dai prezzari regionali (DEI Bologna, Lombardia, Lazio, Sicilia), calcola manodopera e materiali, propone marginalità target. Draft pronto in 5 minuti, da rifinire e firmare con il cliente.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import prezzari regionali",
    "AI verticale edilizia addestrata su 800k preventivi",
    "Riconoscimento foto cantiere multi-ambiente",
  ],
  proofPoints: [
    "Draft preventivo in 5 minuti",
    "Prezzari regionali sempre aggiornati",
    "Marginalità target consigliata da AI",
  ],

  objectiveRow: [
    ["Obiettivo", "Generare preventivi tecnici in 5 minuti, non in 4 giorni"],
    ["Momento chiave", "Sopralluogo con foto, draft AI, rifinitura, firma cliente"],
    ["Risultato", "10x preventivi/settimana, marginalità protetta, conversione +30%"],
  ],

  betaH2:
    "Più di 380 imprese edili italiane generano preventivi con AI usando Edilizia in Cloud.",
  betaBody:
    "Attiviamo Quote Builder AI in 48 ore: importiamo i tuoi prezzari (regionali DEI, listini interni, fornitori abituali), addestriamo l'AI sui tuoi pattern di preventivazione, configuriamo le voci ricorrenti del tuo settore (ristrutturazione, fotovoltaico, serramenti, ampliamenti). 4 sessioni 1-a-1 fino al primo preventivo generato in 5 minuti.",

  speedH2:
    "Un preventivo edilizia preparato a mano costa 4-12 ore di lavoro tecnico. Con Quote Builder AI scendi a 5-30 minuti senza perdere qualità tecnica.",
  speedSubheadline:
    "Le imprese edili dedicano in media il 25% del tempo del titolare/tecnico alla preventivazione. Foto cantiere, computo metrico a mano, prezzario rincorso, calcoli a mente, rilavorazioni continue. Quote Builder AI elimina il 70% del tempo grazie a riconoscimento foto, suggerimento voci AI e prezzari sempre aggiornati.",
  speedStats: [
    { value: 5, suffix: " min", label: "tempo medio per draft preventivo" },
    { value: 70, prefix: "-", suffix: "%", label: "tempo manuale di preventivazione" },
    { value: 30, prefix: "+", suffix: "%", label: "conversione preventivo-contratto" },
  ],

  familyH2: "Quote Builder AI vive collegato a CRM, Cantieri, Firma Elettronica e Portale Cliente.",
  familySubheadline:
    "Un preventivo non è un PDF isolato: nasce da un lead, si firma elettronicamente dal cliente, diventa cantiere, alimenta marginalità. Edilizia in Cloud collega ogni preventivo al suo flusso senza data entry duplicato. AI accelera la creazione, la piattaforma chiude il ciclo.",
  familyItems: [
    {
      icon: Wand2,
      title: "Quote Builder AI",
      text: "Generatore preventivi AI da foto cantiere, prezzari regionali, computo metrico.",
      to: "/funzionalita/quote-builder-ai",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Editor preventivo professionale, computo metrico, varianti, marginalità target.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Preventivo accettato diventa cantiere con piano lavori e budget allocato.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Cliente firma preventivo eIDAS dal portale o telefono in 30 secondi.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: Database,
      title: "CRM Edilizia",
      text: "Lead diventano preventivi tracciati, conversione misurabile per fonte.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: Bot,
      title: "Agenti AI",
      text: "Agenti AI per qualificazione lead, follow-up preventivi, recall scadenze.",
      to: "/funzionalita/agenti-ai",
    },
  ],
  familyBonusTitle: "Una piattaforma. Dal sopralluogo al cantiere aperto.",
  familyBonusText:
    "Quando un commerciale fa sopralluogo, scatta foto, AI genera draft preventivo in 5 minuti, tu rifinisci, cliente firma elettronicamente dal portale, sistema apre cantiere con budget allocato, fornitori notificati per ordini. Il flusso lead-preventivo-cantiere accelera del 80%.",

  painKicker: "Il problema vero",
  painH2:
    "Preventivo a mano = 4-12 ore. 30 preventivi/mese = 120 ore. Stai pagando un tecnico full-time solo per preventivare.",
  painSubheadline:
    "Le imprese edili spendono 25-35% del tempo tecnico in preventivazione manuale: sopralluogo, foto, ricerca prezzi, computo metrico, calcoli, formattazione PDF. Risultato: 30-40 preventivi/mese contro i 80-100 potenziali. Lead Facebook persi, conversione bassa, marginalità inconsistente.",
  painPoints: [
    {
      icon: Timer,
      title: "Preventivo che richiede 1 settimana",
      text: "Sopralluogo lunedì, computo metrico mercoledì, prezzari giovedì, formattazione venerdì, invio cliente lunedì successivo. 7 giorni per preventivo. Cliente intanto ha già 2 preventivi concorrenti, tu arrivi tardi.",
    },
    {
      icon: Database,
      title: "Prezzari regionali rincorsi a mano",
      text: "Prezzario DEI Bologna, Regionale Lombardia, Camera Commercio Roma, Sicilia regionale: aggiornati ogni 6-12 mesi, scaricati in PDF, copiati in Excel. Quando preventi, prezzi vecchi, marginalità erose, contestazioni post-cantiere.",
    },
    {
      icon: AlertTriangle,
      title: "Preventivi sotto-stimati per fretta",
      text: "Pressione di consegnare velocemente porta a saltare voci (ponteggi, carico/scarico, smaltimento, sicurezza). Vinci la gara, ma in cantiere scopri 8.000€ di costi non preventivati. Marginalità che evapora.",
    },
    {
      icon: Users,
      title: "Solo il titolare sa fare preventivi seri",
      text: "Computo metrico, prezzari, normativa, marginalità: solo il titolare (o un tecnico senior) sa farlo bene. Quando lui è in ferie o sopralluogo, preventivi fermi. Collo di bottiglia che blocca crescita azienda.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stessi clienti, stessi prezzari. Cambia il tempo di preventivazione e il tasso di chiusura.",
  baSubheadline:
    "Quote Builder AI non sostituisce la conoscenza tecnica del titolare: la amplifica. AI fa il 70% del lavoro pesante (riconoscimento ambienti, suggerimento voci, prezzi correnti, calcoli), il tecnico fa il 30% di valore aggiunto (rifinitura, varianti, trattativa).",
  baAreas: [
    {
      title: "Sopralluogo e raccolta dati",
      before:
        "Tecnico fa sopralluogo con metro e blocco appunti, scatta foto sparse sul telefono, scrive misure su carta. Torna in ufficio, deve ricostruire mentalmente ambienti e dimensioni dalle foto.",
      after:
        "Tecnico fa sopralluogo con app Edilizia in Cloud: scatta foto strutturate per ambiente, AI riconosce stanze e finiture, suggerisce metrature stimate. Tutto già strutturato per generazione preventivo.",
    },
    {
      title: "Computo metrico",
      before:
        "Tecnico apre Excel, scrive a mano voci computo metrico ('Demolizione tramezzi', 'Fornitura piastrelle 30x60', etc.), cerca prezzo su prezzario PDF, copia, calcola, somma. 4-6 ore per preventivo medio.",
      after:
        "AI genera bozza computo metrico dalle foto cantiere: voci coerenti con ambienti, metrature dimensionate, prezzi da prezzario regionale aggiornato. Tecnico rifinisce voci e marginalità in 10-15 minuti.",
    },
    {
      title: "Aggiornamento prezzi",
      before:
        "Tecnico cerca prezzi su Excel obsoleto, su PDF prezzario regionale di 6 mesi fa, telefona a 2 fornitori per conferma. Discrepanze frequenti, prezzi sbagliati, contestazioni post-cantiere.",
      after:
        "Prezzari DEI, regionali e fornitori sempre aggiornati nel sistema. Voci preventivo collegate a prezzi correnti, AI evidenzia voci con prezzi instabili o in aumento, marginalità sempre protetta.",
    },
    {
      title: "Conversione preventivo in contratto",
      before:
        "Preventivo PDF inviato via email, cliente lo apre dopo 3 giorni, ne discute con familiari, magari con altre 2 imprese. Conversione media 18-25%. Spesso negoziato al ribasso pesante.",
      after:
        "Preventivo professionale generato in giornata del sopralluogo, inviato via portale cliente con firma eIDAS in 30 secondi, opzionale upgrade comparativi. Conversione +30% perché veloce e di qualità.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dalla foto cantiere al preventivo firmato.",
  mechanismSubheadline:
    "Quote Builder AI è progettato per imprese che fanno 20-300 preventivi al mese: riconoscimento foto, computo metrico AI, prezzari sempre aggiornati, generazione PDF professionale. Tutto integrato senza configurazione tecnica complessa.",
  mechanismSteps: [
    {
      icon: Camera,
      title: "Sopralluogo: scatta foto strutturate",
      text: "App mobile guida tecnico nel sopralluogo: foto ambiente per ambiente (cucina, bagno, salone), foto dettagli (impianti, infissi, pavimenti), note vocali trascritte automaticamente. AI riconosce ambienti e elementi.",
    },
    {
      icon: Cpu,
      title: "AI suggerisce computo metrico e prezzi",
      text: "AI verticale edilizia analizza foto e descrizione lavori: suggerisce voci computo (demolizioni, ripristini, finiture, impianti), dimensiona metrature, attinge prezzi da prezzari regionali aggiornati, propone marginalità target.",
    },
    {
      icon: PenTool,
      title: "Tecnico rifinisce, cliente firma",
      text: "Tecnico apre draft AI, rifinisce voci specifiche (10-15 min), aggiunge varianti, controlla marginalità. PDF professionale generato, inviato via portale cliente, firma eIDAS in 30 secondi. Cantiere si apre.",
    },
  ],
  mechanismCta: "Apri Quote Builder AI",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "10x preventivi/settimana, conversione +30%, marginalità sempre protetta.",
  commercialBody:
    "Le imprese edili che adottano Quote Builder AI generano in media 10 volte più preventivi a parità di team tecnico, alzano la conversione preventivo-contratto del 30% grazie alla velocità di risposta e proteggono la marginalità grazie a prezzari sempre aggiornati. È un cambio di paradigma operativo.",
  commercialLevers: [
    {
      icon: Rocket,
      title: "10x preventivi/settimana a parità di team",
      text: "Da 8-12 preventivi/settimana per tecnico a 60-80. Niente più lead persi per mancanza di tempo, niente più 'lo facciamo la settimana prossima', niente più colli di bottiglia. Il sistema scala.",
    },
    {
      icon: TrendingUp,
      title: "Conversione +30% per velocità di risposta",
      text: "Cliente che riceve preventivo professionale in giornata invece che dopo 5-7 giorni converte di più. Velocità è qualità percepita: 'questa impresa è strutturata, mi prende sul serio'. Conversione media settore 22% → 30%.",
    },
    {
      icon: ShieldCheck,
      title: "Marginalità protetta dai prezzari aggiornati",
      text: "Prezzari DEI, regionali, fornitori abituali sempre aggiornati. Voci con prezzi instabili evidenziate, marginalità target consigliata da AI in base a tipologia lavoro. Niente più cantieri in perdita per prezzi vecchi.",
    },
    {
      icon: Sparkles,
      title: "Ogni tecnico fa preventivi di qualità senior",
      text: "AI fornisce framework di preventivazione, voci complete, prezzi aggiornati. Anche tecnici junior generano preventivi di qualità senior. Collo di bottiglia 'solo il titolare sa fare preventivi' eliminato.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Preventivi tecnici in 5 minuti. Cantieri aperti il giorno del sopralluogo.",
  resultsBody:
    "Quando ogni preventivo nasce in 5 minuti dalle foto del sopralluogo, le imprese edili scoprono che il vero limite di crescita non era mai la domanda di mercato: era il collo di bottiglia della preventivazione. Quote Builder AI rimuove il collo di bottiglia, e l'azienda accelera.",
  integrationPillars: [
    {
      icon: Camera,
      title: "Riconoscimento foto cantiere",
      text: "AI verticale addestrata su 800.000 foto cantiere edilizia italiana. Riconosce ambienti, finiture, impianti, materiali. Suggerisce metrature e voci coerenti con tipologia lavoro.",
    },
    {
      icon: BookOpen,
      title: "Prezzari regionali integrati",
      text: "DEI Bologna, Regionale Lombardia, Lazio, Sicilia, Veneto, Toscana. Aggiornamenti automatici quando rilasciati. Listini interni e fornitori abituali integrati nello stesso flusso AI.",
    },
    {
      icon: Wand2,
      title: "AI suggerimento computo metrico",
      text: "Voci complete (demolizioni, ripristini, finiture, impianti, sicurezza, smaltimenti), dimensionamento, prezzi correnti, marginalità target. Tecnico rifinisce in 10-15 minuti vs 4-6 ore.",
    },
    {
      icon: FileText,
      title: "PDF professionale brand impresa",
      text: "Layout professionale brandizzato (logo, colori, dominio), grafica chiara, varianti opzionali, condizioni contrattuali. Cliente percepisce serietà tecnica al primo sguardo.",
    },
  ],
  resultStats: [
    { value: 5, suffix: " min", label: "tempo medio per draft preventivo AI" },
    { value: 30, prefix: "+", suffix: "%", label: "conversione preventivo-contratto" },
    { value: 10, prefix: "x", suffix: "", label: "preventivi/settimana per tecnico" },
  ],
  resultsCta: "Apri Quote Builder AI",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale risparmiare 70% del tempo per ogni preventivo che fai?",
  roiSubheadline:
    "Sposta i cursori sui tuoi numeri reali: preventivi al mese e ore manuali per preventivo oggi. La stima parte da 70% di tempo risparmiato e 30€/h di costo orario tecnico medio.",
  roi: {
    input1Label: "Preventivi/mese generati",
    input1Default: 25,
    input1Min: 5,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Ore manuali/preventivo oggi",
    input2Default: 5,
    input2Min: 2,
    input2Max: 12,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * b * 0.7 * 30),
    computeSecondary: (a, b) => [
      { label: "Preventivi/anno generati", value: `${a * 12}` },
      { label: "Ore tecnico recuperate/anno", value: `${Math.round(a * 12 * b * 0.7)} h` },
      { label: "Preventivi extra fattibili (10x capacity)", value: `${a * 9}` },
    ],
    closingPitch:
      "Stima conservativa con 70% tempo risparmiato e 30€/h. Aggiungi la conversione +30% e i preventivi extra fattibili a parità di team: il ROI reale è multiplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un semplice editor preventivi. Una macchina di scaling commerciale.",
  salesBody:
    "Quote Builder AI trasforma la preventivazione da collo di bottiglia a leva di crescita. Le 4 dimensioni operative che cambiano dal primo preventivo generato.",
  salesImpact: [
    {
      title: "Crescita lead-preventivo-cliente",
      text: "Niente più lead persi per 'non abbiamo tempo di preventivare'. Ogni lead riceve preventivo in giornata, conversione cresce, fatturato sale a parità di marketing budget.",
    },
    {
      title: "Tecnici junior produttivi come senior",
      text: "AI fornisce framework, voci complete, prezzi correnti. Tecnico junior con 1 anno di esperienza genera preventivi con qualità tecnica equivalente al titolare. Scaling team possibile.",
    },
    {
      title: "Marginalità prevedibile per cantiere",
      text: "Prezzari sempre aggiornati, voci complete (incluse sicurezza, smaltimenti, ponteggi spesso dimenticate), marginalità target AI consigliata. Cantieri chiudono al margine previsto.",
    },
    {
      title: "Titolare libero dal collo di bottiglia",
      text: "Titolare smette di essere l'unico che sa fare preventivi seri. Il sistema democratizza la preventivazione di qualità. Titolare torna a fare strategia, gestione, sviluppo nuovi mercati.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi fa preventivi tutti i giorni, non slogan AI generici.",
  featureRows: [
    {
      label: "App sopralluogo guidata con AI riconoscimento",
      value:
        "Tecnico scatta foto strutturate per ambiente (cucina, bagno, salone), AI riconosce stanze, finiture, impianti, materiali. Note vocali trascritte automaticamente. Dimensionamento metrature stimato.",
    },
    {
      label: "Generazione draft preventivo in 5 minuti",
      value:
        "Da foto sopralluogo + descrizione lavori + tipologia: AI genera bozza completa con voci computo metrico, dimensionamento, prezzi, manodopera, marginalità target. Tecnico rifinisce in 10-15 min.",
    },
    {
      label: "Prezzari regionali sempre aggiornati",
      value:
        "DEI Bologna, Regionale Lombardia, Lazio, Sicilia, Veneto, Toscana, Camere di Commercio. Aggiornamenti automatici quando rilasciati. Listini fornitori abituali integrati con prezzi correnti.",
    },
    {
      label: "Marginalità target consigliata da AI",
      value:
        "AI propone marginalità target in base a tipologia lavoro (ristrutturazione 18-22%, fotovoltaico 12-15%, ampliamento 25-30%), zona geografica, complessità. Allerta se marginalità sotto soglia.",
    },
    {
      label: "Varianti opzionali e upselling",
      value:
        "AI suggerisce varianti opzionali (upgrade finiture, materiali superiori, impianti aggiuntivi). Cliente vede preventivo base + upgrade attivabili con un click. Ticket medio cresce 8-15%.",
    },
    {
      label: "PDF professionale brand impresa",
      value:
        "Layout brandizzato (logo, colori, dominio), grafica chiara, foto cantiere allegate, condizioni contrattuali, garanzie. Cliente percepisce serietà tecnica e moderna al primo sguardo.",
    },
    {
      label: "Tracking conversione preventivo-cliente",
      value:
        "Per ogni preventivo: status (inviato, visto, firmato, scaduto), tempo medio chiusura, motivi di rifiuto. Insight per ottimizzare prezzi, condizioni, follow-up commerciali.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Quote Builder AI cambia la giornata.",
  scenarios: [
    {
      title: "Sopralluogo lunedì, contratto venerdì",
      text:
        "Lunedì alle 11 sopralluogo per ristrutturazione 90mq, foto via app. Alle 11:45 draft AI generato. Tecnico rifinisce 20 minuti, invia preventivo entro le 13. Cliente firma elettronicamente martedì. Cantiere apre venerdì. 4 giorni totali.",
    },
    {
      title: "20 preventivi nella stessa settimana",
      text:
        "Settimana ricca di lead Facebook: 20 sopralluoghi prenotati. Senza AI: 60 ore di preventivi (1 tecnico full-time). Con Quote Builder AI: 8 ore totali per generare draft, 4 ore per rifinitura. 12 ore lavoro vs 60. 13 contratti firmati.",
    },
    {
      title: "Tecnico junior fa preventivo da solo",
      text:
        "Marco, tecnico 26 anni con 1 anno di esperienza, fa sopralluogo per Superbonus 110%. Senza AI dovrebbe passare le foto al titolare. Con Quote Builder AI genera draft in 5 minuti, rifinisce con AI hint, invia preventivo qualità senior il giorno stesso.",
    },
  ],

  testimonialQuote:
    "Avevo un collo di bottiglia drammatico: solo io e mio fratello facevamo preventivi seri, e arrivavamo a 35-40 preventivi/mese in due. Lead Facebook persi, conversione bassa. Con Quote Builder AI siamo passati a 110 preventivi/mese, conversione dal 20% al 28%, e i miei tecnici junior fanno preventivi che prima dovevo controllare 3 volte. La cosa che mi ha sorpreso: l'AI conosce le voci di computo metrico meglio di tecnici con 5 anni di esperienza.",
  testimonialAuthor: "Luca F.",
  testimonialRole: "Fratelli Costruzioni Snc, Brescia",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "L'AI fa davvero preventivi tecnici di qualità o sono bozze grezze?",
      a: "L'AI è addestrata su 800.000 preventivi edilizia italiani anonimizzati e su 12 prezzari regionali aggiornati. Genera draft con voci complete (anche quelle 'dimenticate' come ponteggi, smaltimenti, sicurezza), dimensionamento ragionato, prezzi correnti. Tecnico rifinisce dettagli in 10-15 minuti vs 4-6 ore di lavoro from-scratch.",
    },
    {
      q: "Quali prezzari regionali sono integrati?",
      a: "DEI Bologna, Regionale Lombardia, Lazio, Sicilia, Veneto, Emilia-Romagna, Toscana, Piemonte, Marche, Camera di Commercio Roma, Milano, Torino. Aggiornamenti automatici quando i prezzari ufficiali rilasciano nuove edizioni. Listini interni e fornitori abituali integrabili.",
    },
    {
      q: "Posso fare preventivi anche senza foto cantiere (es. cliente a distanza)?",
      a: "Sì. AI genera draft anche da sola descrizione lavori (testo libero o briefing strutturato): tipologia, metratura, ambienti, finiture richieste. Foto migliorano qualità draft del 20-30%, ma non sono obbligatorie. Utile per preventivi remoti su richieste online.",
    },
    {
      q: "Come funziona la marginalità target consigliata?",
      a: "AI calcola marginalità target in base a tipologia lavoro, zona geografica, complessità, tipo cliente (privato, condominio, pubblico). Esempio: ristrutturazione privato Milano = target 22%, pubblico Lombardia = target 12%. Allerta se voci preventivo portano marginalità sotto soglia.",
    },
    {
      q: "Il preventivo PDF ha il mio brand o è generico Edilizia in Cloud?",
      a: "Tuo brand al 100%: logo, colori aziendali, dominio (es. preventivi.tuaimpresa.it), formato professionale customizzabile. Cliente percepisce un servizio della tua impresa, non di Edilizia in Cloud. Personalizzazione inclusa nei piani Professional e Business.",
    },
    {
      q: "Quanto costa? Ci sono costi per preventivo generato o token AI?",
      a: "Quote Builder AI è incluso nei piani Professional e Business. Numero di preventivi illimitato, AI illimitata, prezzari regionali aggiornati gratuitamente, riconoscimento foto illimitato. Nessun costo per token o preventivo. Cancelli quando vuoi senza vincoli pluriennali.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Quote Builder AI vive collegato a tutta la piattaforma.",
  internalLinksBody:
    "Quote Builder AI è alimentato da Preventivi, Cantieri, Firma Elettronica, CRM e Agenti AI. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Editor preventivo professionale, computo metrico, varianti, marginalità.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Preventivo accettato diventa cantiere con piano lavori e budget.",
    },
    {
      to: "/funzionalita/firma-elettronica",
      title: "Firma Elettronica",
      text: "Cliente firma preventivo eIDAS dal portale o telefono in 30 secondi.",
    },
    {
      to: "/funzionalita/crm-edilizia",
      title: "CRM Edilizia",
      text: "Lead diventano preventivi tracciati, conversione misurabile per fonte.",
    },
    {
      to: "/funzionalita/agenti-ai",
      title: "Agenti AI",
      text: "Agenti AI per qualificazione lead, follow-up preventivi, recall scadenze.",
    },
    {
      to: "/funzionalita/lead-form-facebook",
      title: "Lead Form Facebook",
      text: "Lead Facebook qualificati alimentano preventivi AI in 5 minuti.",
    },
    {
      to: "/funzionalita/portale-clienti",
      title: "Portale Clienti",
      text: "Cliente riceve preventivo dal portale, firma elettronica eIDAS.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e ristrutturazioni.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Quote Builder AI incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di passare le serate a fare preventivi a mano. Inizia a generarli in 5 minuti.",
  finalCtaBody:
    "31 giorni gratuiti per portare Quote Builder AI dentro la tua impresa: setup in 48 ore, prezzari regionali integrati, AI verticale edilizia addestrata, app sopralluogo guidata, PDF professionale brand impresa. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · Prezzari regionali inclusi · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Quote Builder AI",
  stickyCtaMicrocopy: "Setup 48h · Preventivi in 5 minuti",

  applicationSubCategory: "Construction Quote AI Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function QuoteBuilderAi() {
  return <FunzionalitaPageTemplate config={config} />;
}
