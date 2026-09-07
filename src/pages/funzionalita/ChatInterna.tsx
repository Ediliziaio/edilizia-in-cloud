import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Clock,
  Hash,
  HardHat,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Paperclip,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "chat-interna",
  definizione:
    "Chat Interna di Edilizia in Cloud è la chat aziendale che sostituisce i gruppi WhatsApp privati: canali dedicati per cantiere, foto, file e messaggi vocali condivisi direttamente dal campo, notifiche urgenti smistate per ruolo e archivio tracciato nel rispetto del GDPR.",
  vertical: "Chat Interna",
  productName: "Modulo Chat Interna Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor con team operativo distribuito tra cantieri, ufficio e fornitori che vogliono sostituire WhatsApp privato con una chat aziendale GDPR compliant, canali per cantiere e archivio aziendale tracciato",
  audienceShort: "imprese edili con team su più cantieri",

  seo: {
    title:
      "Chat Aziendale Edilizia",
    description:
      "Chat aziendale per imprese edili: canali per cantiere, condivisione foto/file/audio, conformità GDPR, archivio decennale, notifiche urgenti.",
    keywords:
      "chat aziendale edilizia, chat impresa edile, alternativa WhatsApp lavoro, chat cantiere, comunicazione operai capocantiere, GDPR chat aziendale, software comunicazione edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Chat Interna",
  heroH1Lead: "La chat aziendale che sostituisce",
  heroH1Highlight: "WhatsApp privato del titolare",
  heroH1Tail: "ogni 2 minuti",
  heroSubheadline:
    "Chat di squadra per imprese edili: canali dedicati per cantiere, condivisione foto/file/audio direttamente dal cantiere, notifiche urgenti smistate per ruolo, archivio aziendale tracciato a norma GDPR. Stop al WhatsApp del titolare che mescola figli, fornitori e capocantieri. Comunicazione professionale, lavoro reale separato dalla vita privata.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Canali per cantiere e per ruolo",
    "GDPR compliant e archiviata",
    "Foto, audio, file, posizione GPS",
  ],
  proofPoints: [
    "Notifiche urgenti smistate",
    "Cerca in 5 anni di chat",
    "App mobile + desktop",
  ],

  objectiveRow: [
    ["Obiettivo", "Sostituire WhatsApp privato del titolare con una chat aziendale strutturata"],
    ["Momento chiave", "Quando il titolare riceve 200 messaggi WhatsApp/giorno tra figli e fornitori"],
    ["Risultato", "Vita personale recuperata, comunicazione tracciata, GDPR compliant"],
  ],

  betaH2:
    "Più di 350 imprese edili italiane hanno sostituito WhatsApp privato con la chat aziendale Edilizia in Cloud.",
  betaBody:
    "Il modulo Chat Interna è attivo in 48 ore: importiamo i numeri della tua squadra, configuriamo canali per cantiere e per funzione (ufficio, capicantiere, sicurezza), settiamo notifiche urgenti, attiviamo archiviazione decennale GDPR. Quattro sessioni 1-a-1 ti accompagnano fino al primo cantiere che migra completamente da WhatsApp privato.",

  speedH2:
    "Il titolare riceve 200 messaggi WhatsApp al giorno tra clienti, capocantieri, fornitori, figli.",
  speedSubheadline:
    "WhatsApp è diventato il sistema operativo di fatto delle imprese edili italiane. Mescola tutto: lavoro, vita privata, foto fornitori, video figli, urgenze cantiere. Il titolare medio non distingue più 'cosa è urgente' da 'cosa può aspettare'. La chat aziendale separa, struttura, archivia, libera la vita privata.",
  speedStats: [
    { value: 50, prefix: "-", suffix: "%", label: "tempo perso in coordinamento WhatsApp" },
    { value: 200, suffix: "+", label: "messaggi/giorno organizzati per cantiere" },
    { value: 100, suffix: "%", label: "conformità GDPR archiviazione decennale" },
  ],

  familyH2: "Chat collegata a cantieri, ticket, ferie e operazioni quotidiane.",
  familySubheadline:
    "La chat non è un'isola: ogni canale è agganciato a un cantiere o un'area aziendale. Le foto del cantiere alimentano la galleria del portale cliente. I messaggi su un ticket diventano cronologia ticket. Le richieste ferie nei canali HR diventano richieste tracciate.",
  familyItems: [
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Ogni cantiere ha il suo canale chat dedicato, foto e file alimentano il fascicolo cantiere.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Smartphone,
      title: "App Cantiere Mobile",
      text: "Capocantiere chatta dal telefono, scatta foto, registra audio, condivide posizione GPS.",
      to: "/funzionalita/app-cantiere-mobile",
    },
    {
      icon: ImageIcon,
      title: "Foto Cantiere",
      text: "Foto condivise in chat entrano automaticamente nella galleria geolocalizzata del cantiere.",
      to: "/funzionalita/foto-cantiere",
    },
    {
      icon: MessageCircle,
      title: "Ticket Assistenza",
      text: "Discussione interna su ticket post-cantiere tra tecnici, capocantiere, ufficio.",
      to: "/funzionalita/ticket-assistenza",
    },
    {
      icon: Users,
      title: "HR Personale",
      text: "Canali HR per ferie, sicurezza, formazione, comunicazioni aziendali tracciate.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "Canale sicurezza per RSPP, comunicazione DPI, near miss, alert immediati.",
      to: "/funzionalita/sicurezza-cantiere",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Chat, foto, cantiere, ticket, sicurezza in un flusso.",
  familyBonusText:
    "Quando un capocantiere posta nel canale del cantiere una foto di una crepa imprevista, la foto entra nella galleria del cantiere, l'alert va al titolare, viene aperto un task di verifica, il cliente sul portale vede solo le foto autorizzate. Un messaggio, cinque effetti coordinati, archivio aziendale automatico.",

  painKicker: "Il problema vero",
  painH2: "Il WhatsApp del titolare è la cosa più fragile di tutta l'azienda edile.",
  painSubheadline:
    "WhatsApp privato è gratis, immediato, già installato. Per questo è diventato il backbone informativo delle imprese edili italiane. Ma è anche illegale per uso aziendale (GDPR), invade la vita privata, perde la cronologia quando si cambia telefono, mescola figli e fornitori, e non si può cercare nulla a 2 anni di distanza.",
  painPoints: [
    {
      icon: Phone,
      title: "Vita personale del titolare distrutta",
      text: "Il titolare riceve 200 messaggi/giorno mescolati: figlio che chiede pranzo, fornitore con il prezzo cemento, capocantiere con foto crepa, cliente arrabbiato. Non distingue più 'urgente' da 'banale'. Burnout in 2-3 anni.",
    },
    {
      icon: Search,
      title: "Cronologia persa al cambio telefono",
      text: "Titolare cambia telefono, fa backup male, perde 3 anni di chat con foto cantieri, accordi fornitori, comunicazioni clienti. Tribunale chiede prova di un accordo e tu hai solo 'mi ricordo che l'avevamo concordato'.",
    },
    {
      icon: AlertTriangle,
      title: "GDPR violato per 12 dipendenti su 12",
      text: "Usare WhatsApp privato per dare ordini di lavoro, condividere foto cantiere con dipendenti, gestire ferie è violazione GDPR (no DPA con Meta, dati personali su account privato). Sanzioni Garante fino a 20M€ o 4% fatturato.",
    },
    {
      icon: ClipboardList,
      title: "Conoscenza aziendale che non si trasferisce",
      text: "Quando il capocantiere senior va in pensione, 10 anni di conversazioni WhatsApp con fornitori, soluzioni tecniche, contatti chiave se ne vanno con lui. Niente cronologia aziendale, niente knowledge transfer.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa squadra, stessi cantieri, stessa rapidità di comunicazione. Cambia il contenitore.",
  baSubheadline:
    "Non rallenti la comunicazione: la strutturi. Il messaggio veloce resta veloce, la foto dal cantiere arriva subito, la posizione GPS si condivide in un tap. Cambia che ora vive in canali per cantiere, archiviata in cloud aziendale, GDPR compliant, cercabile a 5 anni di distanza.",
  baAreas: [
    {
      title: "Comunicazione di squadra",
      before:
        "Gruppo WhatsApp 'Lavori Cantiere Bologna 2024' creato dal capocantiere con il suo numero personale. Quando va in ferie, qualcuno lascia il gruppo, qualcuno è muto. Caos totale.",
      after:
        "Canale aziendale '#cantiere-bologna-2024' con tutti i ruoli giusti, persiste anche se cambia il capocantiere. Messaggi archiviati, ricerca full-text, aggiunta/rimozione persone in 1 click.",
    },
    {
      title: "Foto cantiere dal capocantiere",
      before:
        "Capocantiere posta foto in WhatsApp del titolare, la foto si comprime, sparisce nello scroll, dopo 3 mesi non si trova più. Per il dossier cantiere serve riscaricarla, scoprire che è perduta.",
      after:
        "Foto postata nel canale cantiere con qualità originale, geolocalizzata automaticamente, taggata data, archiviata nella galleria cantiere. Cercabile per data, GPS, tag in 10 secondi a 5 anni di distanza.",
    },
    {
      title: "Comunicazione urgente vera",
      before:
        "Crepa strutturale grave alle 14:00. Capocantiere scrive WhatsApp al titolare. Titolare in riunione vede dopo 2 ore. Pure urgenze affogano nel rumore di 200 messaggi/giorno.",
      after:
        "Canale dedicato '#urgenze' con notifica push prioritaria, suono diverso, override di silenzioso. Titolare vede subito che è urgenza vera, non rumore di fondo. Risposta in 5 minuti.",
    },
    {
      title: "Vita personale del titolare",
      before:
        "Titolare a cena con la moglie riceve 30 messaggi WhatsApp in 1 ora, mescolati lavoro/famiglia/fornitori. Non guarda il telefono per 30 minuti, perde 3 cose 'urgenti'. La moglie si arrabbia.",
      after:
        "Chat aziendale silenziabile fuori orario, notifiche solo per canali #urgenze veri. WhatsApp privato torna privato. Cena in pace, lavoro la mattina dopo, urgenze vere intercettate sempre.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. Canali, ruoli, archivio. Stop a WhatsApp del titolare.",
  mechanismSubheadline:
    "Il modulo Chat Interna è progettato per sembrare WhatsApp ma essere un sistema aziendale: la curva di apprendimento è di 5 minuti, l'effetto sulla qualità della vita del titolare è permanente.",
  mechanismSteps: [
    {
      icon: Hash,
      title: "Crei canali per cantiere e per funzione",
      text: "Per ogni cantiere attivo un canale dedicato (es. '#villa-rossi-2024'). Canali trasversali per funzione: '#ufficio', '#capicantieri', '#sicurezza', '#urgenze'. Aggiungi/rimuovi persone in base al ruolo.",
    },
    {
      icon: Smartphone,
      title: "La squadra usa l'app come WhatsApp",
      text: "App mobile e desktop in italiano, interfaccia familiare. Foto, audio, file, posizione GPS, menzioni @nome, risposte threaded, reazioni emoji. Curva di apprendimento: 5 minuti.",
    },
    {
      icon: ShieldCheck,
      title: "Archivio GDPR e ricerca decennale",
      text: "Tutti i messaggi archiviati 10 anni in cloud aziendale, GDPR compliant, DPA firmata, ricerca full-text per parole, periodo, persona, canale, allegato. Cronologia persiste anche se cambiano telefoni.",
    },
  ],
  mechanismCta: "Apri la chat di prova",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Comunicazione strutturata = -50% tempo coordinamento + GDPR + vita privata salva.",
  commercialBody:
    "Le imprese edili che hanno migrato da WhatsApp privato a chat aziendale recuperano in media il 50% del tempo di coordinamento, mettono in regola la conformità GDPR, e i titolari riportano un drastico miglioramento del work-life balance dopo 90 giorni di utilizzo.",
  commercialLevers: [
    {
      icon: Clock,
      title: "Tempo di coordinamento dimezzato",
      text: "Comunicazioni strutturate per cantiere e per funzione eliminano la dispersione del 'gruppone'. Ognuno vede solo i canali pertinenti, niente rumore di fondo, decisioni più rapide.",
    },
    {
      icon: ShieldCheck,
      title: "GDPR compliant per legge",
      text: "DPA firmata, dati cifrati, ruoli aziendali tracciati, archiviazione decennale, diritto all'oblio gestito. Niente più sanzioni Garante per uso aziendale di WhatsApp privato.",
    },
    {
      icon: Sparkles,
      title: "Vita privata del titolare recuperata",
      text: "Notifiche separate da WhatsApp privato, silenzio fuori orario tranne canali urgenze veri. Cene in pace, weekend liberi, burnout evitato, decisioni di business più lucide.",
    },
    {
      icon: TrendingUp,
      title: "Knowledge transfer aziendale solido",
      text: "Quando un capocantiere senior va via, la sua conoscenza resta nei canali aziendali: contatti fornitori, soluzioni tecniche, problemi passati. Il subentrante non riparte da zero.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Stop al WhatsApp del titolare come backbone aziendale.",
  resultsBody:
    "Quando la chat aziendale è strutturata per cantiere, ruoli e urgenze, il coordinamento operativo si fa in metà tempo, la conformità GDPR è automatica, la vita privata del titolare è preservata e la conoscenza aziendale diventa patrimonio dell'impresa, non del singolo.",
  integrationPillars: [
    {
      icon: Hash,
      title: "Canali per cantiere e per funzione",
      text: "Un canale per cantiere, canali trasversali per ufficio/capicantieri/sicurezza/urgenze. Aggiunta automatica della squadra del cantiere, rimozione automatica a fine lavori.",
    },
    {
      icon: Bell,
      title: "Notifiche urgenti smistate",
      text: "Canale '#urgenze' con notifica prioritaria, override silenzioso, suono dedicato. Altri canali silenziabili fuori orario. Niente più rumore notturno, niente più urgenze perse.",
    },
    {
      icon: Paperclip,
      title: "Foto, audio, file, posizione GPS",
      text: "Tutto ciò che WhatsApp fa, in qualità originale (no compressione foto), con metadati conservati. Posizione GPS condivisibile, registrazione vocale fino a 10 minuti, file fino a 100MB.",
    },
    {
      icon: Lock,
      title: "GDPR e archivio decennale",
      text: "Dati cifrati, DPA firmata, archiviazione 10 anni a norma CAD D.Lgs 82/2005, ricerca full-text, esportazione legale per ispezioni o cause civili.",
    },
  ],
  resultStats: [
    { value: 50, prefix: "-", suffix: "%", label: "tempo perso in coordinamento WhatsApp" },
    { value: 100, suffix: "%", label: "conformità GDPR archiviazione decennale" },
    { value: 30, prefix: "+", suffix: "%", label: "rapidità decisioni operative quotidiane" },
  ],
  resultsCta: "Apri la chat aziendale di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se la squadra perde 50% in meno di tempo in WhatsApp di coordinamento?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: persone nel team operativo e ore settimanali perse in coordinamento WhatsApp. La stima parte dal 50% di tempo recuperato grazie a canali strutturati, ruoli definiti, ricerca full-text.",
  roi: {
    input1Label: "Persone nel team operativo",
    input1Default: 15,
    input1Min: 5,
    input1Max: 100,
    input1Step: 1,
    input2Label: "Ore perse/sett in coordinamento",
    input2Default: 5,
    input2Min: 1,
    input2Max: 10,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * b * 0.5 * 30),
    computeSecondary: (a, b) => [
      { label: "Ore di coordinamento recuperate/anno", value: `${Math.round(a * 52 * b * 0.5)} h` },
      { label: "Riduzione tempo coordinamento", value: "50%" },
      { label: "Sanzioni GDPR potenzialmente evitate", value: "fino a 20M€" },
    ],
    closingPitch:
      "Stima prudenziale basata sul 50% di tempo coordinamento recuperato a €30/h. Aggiungi la conformità GDPR, la vita privata recuperata del titolare e la knowledge base aziendale che resta in azienda.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un clone di WhatsApp. Una chat aziendale pensata per il cantiere edile.",
  salesBody:
    "Slack, Teams o WhatsApp Business non capiscono il cantiere edile: notifiche generiche, niente integrazione con foto cantiere, nessuna logica di canali per cantiere. La Chat Interna è progettata sul flusso operativo dell'impresa edile italiana.",
  salesImpact: [
    {
      title: "Comunicazione professionale tracciata",
      text: "Cliente, fornitori, dipendenti percepiscono un'azienda strutturata. Niente più 'l'ho scritto al cellulare di Mario', ma 'il messaggio è nel canale ufficiale del cantiere'.",
    },
    {
      title: "Conformità GDPR senza pensieri",
      text: "DPA firmata, dati cifrati, archiviazione decennale, diritto all'oblio. La compliance è automatica, niente più sanzioni potenziali Garante per uso aziendale di WhatsApp privato.",
    },
    {
      title: "Knowledge transfer naturale",
      text: "Tutta la conoscenza tecnica e i contatti fornitori restano nei canali aziendali. Quando un dipendente cambia ruolo o esce, il subentrante eredita la cronologia completa.",
    },
    {
      title: "Lavoro e vita privata separati",
      text: "Titolare e capicantieri non sono più 'sempre reperibili' su WhatsApp privato. Notifiche urgenti smistate sui canali giusti, riposo vero il weekend, decisioni più lucide il lunedì.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Canali per cantiere e per funzione",
      value: "Un canale automatico per ogni cantiere attivo, canali trasversali per ufficio, capicantieri, sicurezza, urgenze. Aggiunta/rimozione persone in base ai ruoli del gestionale.",
    },
    {
      label: "Foto, audio, file e posizione GPS",
      value: "Foto in qualità originale con metadati, audio fino a 10 minuti, file fino a 100MB, posizione GPS condivisibile, video fino a 500MB. Tutto archiviato a norma.",
    },
    {
      label: "Notifiche urgenti separate",
      value: "Canale '#urgenze' con suono dedicato e override del silenzioso. Altri canali silenziabili fuori orario. Differenzia urgenze vere da rumore di fondo.",
    },
    {
      label: "Ricerca full-text decennale",
      value: "Cerca per parole, persona, canale, periodo, tipo allegato. Trova un accordo fornitore di 4 anni fa in 10 secondi, niente più 'mi ricordo che ne avevamo parlato'.",
    },
    {
      label: "App mobile e desktop sincronizzate",
      value: "Stesso account, stessi messaggi, stessa cronologia su telefono e PC. Lavora dal cantiere o dall'ufficio, vedi sempre tutto, niente più 'ti rispondo da casa'.",
    },
    {
      label: "Conformità GDPR e archivio decennale",
      value: "Dati cifrati, DPA firmata, archiviazione 10 anni CAD D.Lgs 82/2005, esportazione legale, diritto all'oblio gestito secondo Regolamento 2016/679.",
    },
    {
      label: "Integrazione con cantieri e ticket",
      value: "Foto e file dal canale cantiere alimentano la galleria cantiere. Discussioni su ticket assistenza diventano cronologia ticket. Niente data entry duplicato.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Chat Interna salva la giornata.",
  scenarios: [
    {
      title: "Crepa strutturale alle 14:00",
      text: "Capocantiere vede crepa imprevista, scatta foto, posta nel canale '#urgenze'. Notifica prioritaria al titolare e all'ingegnere. Decisione presa in 15 minuti, sopralluogo programmato, cantiere protetto. Tutto archiviato.",
    },
    {
      title: "Ricerca un accordo fornitore di 3 anni fa",
      text: "Cliente contesta materiale fornito 3 anni fa. Titolare cerca nella chat 'piastrelle bagno villa Rossi', trova in 8 secondi conversazione del 12 marzo 2022 con fornitore, prezzo concordato, certificazione allegata. Discussione chiusa.",
    },
    {
      title: "Onboarding nuovo capocantiere",
      text: "Capocantiere senior va in pensione. Il sostituto entra nei canali aziendali, vede 5 anni di conversazioni con fornitori, soluzioni tecniche passate, contatti chiave. Riparte dal punto giusto, non da zero.",
    },
  ],

  testimonialQuote:
    "Avevo 7 gruppi WhatsApp diversi, 200 messaggi al giorno, e il telefono mi suonava a cena. Mia moglie mi minacciava il divorzio. Da quando abbiamo migrato sulla chat aziendale di Edilizia in Cloud, il WhatsApp privato è tornato per famiglia e amici. La sera a cena non guardo più il telefono, le urgenze vere mi arrivano comunque dal canale dedicato.",
  testimonialAuthor: "Luigi B.",
  testimonialRole: "Costruzioni B. Srl, Torino",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare alla chat aziendale.",
  faqs: [
    {
      q: "I miei capocantieri sono abituati a WhatsApp, useranno un'altra chat?",
      a: "Sì. L'interfaccia è volutamente simile a WhatsApp: gruppi, foto, audio, menzioni, risposte. La curva di apprendimento è di 5 minuti. I nostri clienti riportano adozione del 90% dopo 2 settimane, anche con squadre poco digitali e età media oltre 45 anni.",
    },
    {
      q: "È davvero meglio di WhatsApp Business?",
      a: "Sì, per uso aziendale interno. WhatsApp Business è pensato per comunicare con clienti finali, non per coordinare team interno. Manca canali tematici, ruoli, archivio aziendale, integrazione con cantieri, ricerca full-text decennale. Tu vuoi tutte queste cose.",
    },
    {
      q: "Come gestite il GDPR per i dipendenti?",
      a: "DPA firmata tra azienda e Edilizia in Cloud, dati cifrati a riposo e in transito, informativa privacy fornita ai dipendenti in fase onboarding, diritto all'oblio gestito su richiesta, log accessi per audit. Tutto secondo Regolamento UE 2016/679.",
    },
    {
      q: "Cosa succede ai messaggi quando un dipendente esce dall'azienda?",
      a: "I messaggi nei canali aziendali restano (sono comunicazione di lavoro, proprietà aziendale). L'account dell'ex dipendente viene disattivato, niente più accesso, ma la cronologia per knowledge transfer al successore resta. Diritto all'oblio applicato a dati personali extra-lavoro.",
    },
    {
      q: "Si integra con WhatsApp dei clienti per il marketing?",
      a: "Sì. Il modulo Chat Interna è per comunicazione interna; per i clienti c'è il modulo WhatsApp Marketing che gestisce notifiche cliente, campagne, conferme appuntamento. I due moduli sono separati ma comunicanti, ognuno con la sua compliance specifica.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di utenti?",
      a: "Il modulo Chat Interna è incluso nei piani Professional e Business di Edilizia in Cloud con utenti illimitati e archiviazione decennale inclusa. Setup in 48 ore, app mobile e desktop incluse, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La chat è il tessuto connettivo della tua impresa edile.",
  internalLinksBody:
    "Il modulo collega cantiere, foto, ticket, sicurezza, HR e urgenze in un unico flusso conversazionale tracciato e GDPR compliant.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Ogni cantiere ha il suo canale chat con foto e file." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere Mobile", text: "Capocantiere chatta dal telefono e condivide GPS." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Foto in chat alimentano la galleria geolocalizzata." },
    { to: "/funzionalita/ticket-assistenza", title: "Ticket Assistenza", text: "Discussione interna su ticket post-cantiere tracciata." },
    { to: "/funzionalita/sicurezza-cantiere", title: "Sicurezza Cantiere", text: "Canale dedicato RSPP, near miss, alert immediati." },
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Canali ferie, formazione, comunicazioni aziendali tracciate." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Comunicazione clienti finali separata e con DPA." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Chat Interna inclusa nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di mescolare lavoro e vita privata su WhatsApp. Inizia con una chat aziendale.",
  finalCtaBody:
    "31 giorni gratuiti per migrare il coordinamento del team da WhatsApp a una chat aziendale GDPR compliant. Canali per cantiere, archivio decennale, ricerca full-text, app mobile e desktop. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · GDPR compliant · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Chat Interna",
  stickyCtaMicrocopy: "Setup 48h · GDPR compliant",

  applicationSubCategory: "Construction Team Communication Software",

  relatedBlogSlugs: [
    "gestione-squadre-cantiere",
    "delegare-impresa-edile-senza-perdere-controllo",
    "excel-whatsapp-carta-gestione-impresa-edile",
  ],
};

export default function ChatInterna() {
  return <FunzionalitaPageTemplate config={config} />;
}
