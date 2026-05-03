import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Cloud,
  CloudRain,
  Eye,
  FileText,
  GanttChart,
  Globe,
  HardHat,
  Layers,
  Map,
  Repeat,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "calendario-lavori",
  vertical: "Calendario Lavori",
  productName: "Modulo Calendario Lavori Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor con 1-50 cantieri attivi che vogliono pianificazione visuale gantt multi-cantiere, allocazione squadre, conflict detection automatica e sincronizzazione con Google Calendar e Outlook",
  audienceShort: "imprese edili e general contractor",

  seo: {
    title:
      "Calendario Lavori Edilizia",
    description:
      "Calendario condiviso per imprese edili: gantt visuale multi-cantiere, allocazione squadre, conflict detection automatica, integrazione meteo,…",
    keywords:
      "calendario lavori edilizia, gantt cantieri, pianificazione cantieri, software pianificazione edile, calendario squadre cantieri, gestione cantieri multipli, conflict detection edilizia, calendario condiviso impresa edile",
    ogImage: "https://www.ediliziaincloud.com/og/calendario-lavori-og.jpg",
  },

  heroBadge: "Funzionalità · Calendario Lavori",
  heroH1Lead: "I tuoi cantieri pianificati",
  heroH1Highlight: "su un gantt unico",
  heroH1Tail: "non su 5 fogli Excel",
  heroSubheadline:
    "Calendario condiviso multi-cantiere per imprese edili: gantt visuale con tutti i cantieri attivi, allocazione squadre per giorno, conflict detection automatica (no operai doppi sullo stesso slot), integrazione meteo per evitare giornate piovose, sincronizzazione con Google Calendar e Outlook. Stop alla pianificazione su Excel che diventa obsoleto in 24 ore.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Gantt multi-cantiere visuale",
    "Conflict detection automatica",
    "Sync Google e Outlook",
  ],
  proofPoints: [
    "Meteo integrato 7 giorni",
    "Allocazione squadre per slot",
    "App mobile per capocantieri",
  ],

  objectiveRow: [
    ["Obiettivo", "Pianificare 10 cantieri con 4 squadre senza creare doppi turni"],
    ["Momento chiave", "Lunedì mattina quando devi decidere chi va dove per i prossimi 10 giorni"],
    ["Risultato", "Pianificazione visiva, conflitti rilevati, meteo considerato, squadre felici"],
  ],

  betaH2:
    "Più di 300 imprese edili italiane pianificano i cantieri con il calendario condiviso Edilizia in Cloud.",
  betaBody:
    "Il modulo Calendario Lavori è attivo in 48 ore: importiamo i cantieri attivi con date di inizio/fine, configuriamo le squadre operative con competenze e disponibilità, agganciamo il meteo della tua provincia, sincronizziamo con Google Calendar/Outlook. Quattro sessioni 1-a-1 ti accompagnano fino alla prima settimana pianificata interamente sul gantt.",

  speedH2:
    "Excel della pianificazione cantieri si aggiorna lunedì e diventa obsoleto martedì pomeriggio.",
  speedSubheadline:
    "Le imprese edili italiane pianificano i cantieri su Excel condiviso o WhatsApp del titolare. Si aggiorna lunedì alle 8:00 e a martedì alle 16:00 è già obsoleto: un operaio è malato, un fornitore arriva in ritardo, piove sul cantiere esterno. Il calendario digitale vivente rispecchia la realtà in tempo reale.",
  speedStats: [
    { value: 50, prefix: "-", suffix: "%", label: "tempo perso in pianificazione settimanale" },
    { value: 0, suffix: "", label: "doppi turni operaio per conflict detection" },
    { value: 7, suffix: " gg", label: "previsioni meteo integrate per pianificazione" },
  ],

  familyH2: "Calendario collegato a cantieri, squadre, ferie e ordini.",
  familySubheadline:
    "Il calendario non è un'agenda esterna: vive collegato ai cantieri attivi, alle ferie approvate, agli ordini di acquisto in arrivo, alle scadenze SAL. Tutto si parla, ogni evento ha conseguenze pianificabili, niente più Excel separato che diventa obsoleto.",
  familyItems: [
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "I cantieri attivi popolano automaticamente il gantt con date inizio/fine e fasi.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Users,
      title: "HR Personale",
      text: "Squadre operative con competenze e disponibilità allocate sui cantieri nel calendario.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Calendar,
      title: "Ferie e Permessi",
      text: "Ferie approvate visibili sul gantt, sostituzioni programmate con anticipo.",
      to: "/funzionalita/ferie-permessi",
    },
    {
      icon: Wrench,
      title: "Ordini Acquisto",
      text: "Consegne fornitori pianificate sul calendario per evitare cantiere fermo.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: Smartphone,
      title: "App Cantiere Mobile",
      text: "Capocantiere vede pianificazione del giorno e segnala variazioni dal telefono.",
      to: "/funzionalita/app-cantiere-mobile",
    },
    {
      icon: Globe,
      title: "Portale Clienti",
      text: "Cliente vede milestone e date sul calendario condiviso del proprio cantiere.",
      to: "/funzionalita/portale-clienti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Cantieri, squadre, ferie, ordini, meteo allineati.",
  familyBonusText:
    "Quando un operaio chiede ferie giovedì, il calendario rileva che è allocato sul cantiere Villa Rossi quel giorno, propone sostituto disponibile, aggiorna il gantt, notifica il capocantiere. Quando il meteo prevede pioggia martedì sul cantiere esterno, sposta automaticamente i lavori in lavorazioni interne, senza fermo macchina.",

  painKicker: "Il problema vero",
  painH2: "Lunedì mattina ti svegli e già non sai chi va dove perché Mario ha la febbre.",
  painSubheadline:
    "La pianificazione cantieri nelle imprese edili medie italiane è ancora un esercizio di memoria del titolare e foglietti del capocantiere. Cambia tutto ogni giorno (malattie, piogge, ritardi fornitori, varianti) e l'unico strumento è una telefonata o un WhatsApp. Risultato: cantieri fermi mezza giornata, operai in attesa di sapere dove andare.",
  painPoints: [
    {
      icon: FileText,
      title: "Excel di pianificazione obsoleto in 24h",
      text: "Pianifichi lunedì alle 8:00, alle 16:00 Mario è malato, alle 18:00 piove, mercoledì il fornitore non arriva. L'Excel è fermo a lunedì 8:00 e nessuno lo aggiorna. Pianificazione fittizia.",
    },
    {
      icon: AlertTriangle,
      title: "Doppi turni e conflitti tra cantieri",
      text: "Mandi Luigi al cantiere Bianchi mercoledì, ma il capocantiere lo aveva già allocato al cantiere Rossi. Conflitto scoperto la mattina stessa, uno dei due cantieri perde mezza giornata. Cliente arrabbiato.",
    },
    {
      icon: CloudRain,
      title: "Meteo non considerato, cantiere fermo",
      text: "Pianifichi getto cemento martedì, martedì piove. Operai presenti, fornitori arrivati, getto annullato per pioggia. €800 di costo morto. Se avessi guardato il meteo a 7 giorni avresti spostato a giovedì sereno.",
    },
    {
      icon: Search,
      title: "Cliente che chiede 'quando finite?' e tu tiri a indovinare",
      text: "Cliente chiede data fine cantiere, capocantiere risponde 'tra 3 settimane', titolare risponde 'tra 5 settimane'. Niente fonte di verità, niente gantt aggiornato, niente fiducia da parte del cliente.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stesse squadre, stesso meteo. Cambia chi ha il pallino in mano.",
  baSubheadline:
    "Il calendario digitale non rallenta la flessibilità del cantiere edile: la rispetta. Se Mario è malato, sposti la sua riga sul gantt e il sistema verifica conflitti, propone sostituti, notifica chi serve. Cinque secondi al posto di trenta minuti di telefonate.",
  baAreas: [
    {
      title: "Pianificazione settimanale",
      before:
        "Lunedì mattina: titolare e capocantiere fanno riunione di 2 ore, decidono squadre cantiere per cantiere, scrivono Excel, mandano WhatsApp ai capisquadra. A martedì sera l'Excel è già obsoleto.",
      after:
        "Lunedì mattina: 30 minuti sul gantt, drag-and-drop squadre sui cantieri, sistema verifica conflitti e ferie, pianificazione condivisa in tempo reale con tutta la squadra. Modifiche visibili istantaneamente.",
    },
    {
      title: "Gestione imprevisto malattia",
      before:
        "Mario chiama alle 7:00 per malattia. Capocantiere chiama altri 3 operai per trovare sostituto disponibile. 30 minuti di telefonate, cantiere parte alle 8:30 invece che alle 8:00. €45 persi a operaio.",
      after:
        "Sistema rileva assenza, propone in 5 secondi i 2 operai disponibili con competenze adatte, capocantiere conferma con 1 tap. Notifica push al sostituto, cantiere parte alle 8:00.",
    },
    {
      title: "Pianificazione meteo-aware",
      before:
        "Pianifichi getto cemento martedì senza guardare meteo. Martedì piove, getto annullato, costo morto squadra e fornitore. Sposti getto a giovedì che però aveva altre lavorazioni: cascata di slittamenti.",
      after:
        "Sistema integra meteo 7 giorni, segnala 'pioggia martedì 80%', suggerisce spostamento getto a giovedì. Getto eseguito su giornata serena, niente costi morti, lavorazioni martedì spostate in interni.",
    },
    {
      title: "Comunicazione data fine cantiere al cliente",
      before:
        "Cliente chiede 'quando finite?'. Titolare risponde a memoria, capocantiere stima diversamente, scriverà '3-5 settimane'. Cliente diffidente, fissa appuntamento muratore con altra impresa per dopo.",
      after:
        "Cliente vede sul portale calendario aggiornato del proprio cantiere con milestone settimanali e data fine prevista in tempo reale. Fiducia totale, nessuna ambiguità, nessun appuntamento di sostituzione.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. Pianifichi sul gantt, il sistema valida, la squadra esegue.",
  mechanismSubheadline:
    "Il modulo Calendario Lavori è progettato per essere visivo: drag-and-drop di squadre sui cantieri, color coding per ruoli, gantt zoomabile da giornaliero a mensile, conflict detection in tempo reale.",
  mechanismSteps: [
    {
      icon: GanttChart,
      title: "Pianifichi cantieri sul gantt visuale",
      text: "Drag-and-drop di cantieri e fasi sul calendario, allocazione squadre per slot orario, dipendenze tra fasi (es. fondazioni → strutture), milestone visibili, scadenze SAL.",
    },
    {
      icon: ShieldCheck,
      title: "Sistema verifica conflitti e meteo",
      text: "Conflict detection per operai allocati su due cantieri, sovrapposizioni con ferie approvate, controllo meteo 7 giorni con alert su lavorazioni esterne, integrazione festività e CCNL Edilizia.",
    },
    {
      icon: Bell,
      title: "Squadra riceve pianificazione e variazioni",
      text: "Capocantieri e operai vedono la pianificazione del giorno dall'app mobile, ricevono notifiche su variazioni (malattia, meteo, ritardo fornitore), conferma presa visione tracciata.",
    },
  ],
  mechanismCta: "Apri il gantt di prova multi-cantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Pianificazione viva = -50% tempo + zero conflitti + cantieri puntuali.",
  commercialBody:
    "Le imprese edili che hanno attivato il calendario lavori riducono del 50% il tempo dedicato alla pianificazione settimanale, eliminano i conflitti di allocazione operai, rispettano le date di consegna ai clienti grazie all'integrazione meteo e alla visibilità multi-cantiere.",
  commercialLevers: [
    {
      icon: Clock,
      title: "-50% tempo pianificazione",
      text: "Da 2 ore di riunione lunedì a 30 minuti sul gantt. Aggiornamenti in tempo reale, niente più Excel obsoleto, niente più WhatsApp di chiarimento.",
    },
    {
      icon: Target,
      title: "Cantieri puntuali al 90%",
      text: "Visibilità multi-cantiere e conflict detection portano la puntualità di consegna dal 60% medio del settore al 90%. Clienti soddisfatti, recensioni 5★, ticket medio più alto.",
    },
    {
      icon: TrendingUp,
      title: "Squadre più produttive",
      text: "Niente più 'arrivo in cantiere e non so cosa fare', niente più 'aspettiamo il fornitore'. Pianificazione anticipata, materiali pronti, ordini pianificati. +25% ore produttive.",
    },
    {
      icon: Sparkles,
      title: "Cliente vede e si fida",
      text: "Cliente accede al calendario del proprio cantiere dal portale, vede milestone settimanali e data fine prevista. Fiducia totale, niente più 'quando finite?', recensioni positive.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente più Excel obsoleto. Solo pianificazione viva e condivisa.",
  resultsBody:
    "Quando i cantieri si pianificano su un gantt visuale con conflict detection, integrazione meteo e sincronizzazione con calendari personali, il caos della pianificazione settimanale scompare e i cantieri rispettano davvero le date promesse al cliente.",
  integrationPillars: [
    {
      icon: GanttChart,
      title: "Gantt multi-cantiere visuale",
      text: "Tutti i cantieri attivi in un'unica vista, color coding per cliente, fasi e dipendenze, zoom giornaliero/settimanale/mensile, esportazione PDF per riunioni.",
    },
    {
      icon: Users,
      title: "Allocazione squadre intelligente",
      text: "Drag-and-drop di squadre con competenze e disponibilità, conflict detection in tempo reale, suggerimento sostituti automatico in caso di assenza.",
    },
    {
      icon: Cloud,
      title: "Integrazione meteo 7 giorni",
      text: "Previsioni meteo della zona del cantiere a 7 giorni, alert per lavorazioni esterne (gettata, scavi, coperture) in caso di pioggia, suggerimento spostamento.",
    },
    {
      icon: Repeat,
      title: "Sync Google Calendar e Outlook",
      text: "Sincronizzazione bidirezionale: cantieri visibili nel calendario personale del titolare e capocantieri, eventi personali visibili sul gantt aziendale per evitare conflitti.",
    },
  ],
  resultStats: [
    { value: 50, prefix: "-", suffix: "%", label: "tempo perso in pianificazione settimanale" },
    { value: 90, prefix: "+", suffix: "%", label: "puntualità consegna cantiere al cliente" },
    { value: 25, prefix: "+", suffix: "%", label: "ore produttive squadre operative" },
  ],
  resultsCta: "Apri il calendario lavori",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se pianifichi 10 cantieri in metà tempo?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e ore settimanali dedicate alla pianificazione. La stima parte dal 50% di tempo recuperato grazie alla pianificazione visuale e alla conflict detection automatica.",
  roi: {
    input1Label: "Cantieri attivi",
    input1Default: 8,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Ore pianificazione/sett",
    input2Default: 6,
    input2Min: 1,
    input2Max: 20,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * b * 0.5 * 30),
    computeSecondary: (a, b) => [
      { label: "Ore pianificazione recuperate/anno", value: `${Math.round(a * 52 * b * 0.5)} h` },
      { label: "Riduzione tempo pianificazione", value: "50%" },
      { label: "Cantieri puntuali extra/anno", value: `${Math.round(a * 0.3)}` },
    ],
    closingPitch:
      "Stima prudenziale basata sul 50% di tempo pianificazione recuperato a €30/h. Aggiungi i cantieri puntuali in più, le sanzioni di ritardo evitate e le recensioni 5★ che ne derivano.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un calendario generico. Un gantt nato per il cantiere edile.",
  salesBody:
    "Google Calendar e Outlook non capiscono i cantieri edili: niente fasi, niente dipendenze, niente conflict detection per operai. Microsoft Project è troppo pesante. Il modulo Calendario Lavori è il sweet spot: visuale, leggero, edile, integrato.",
  salesImpact: [
    {
      title: "Pianificazione viva e condivisa",
      text: "Tutta la squadra vede la stessa pianificazione, sempre aggiornata. Niente più Excel inviato per email, niente più WhatsApp di chiarimento, niente più 'mi avevate detto'.",
    },
    {
      title: "Conflitti azzerati",
      text: "Conflict detection per operai allocati su due cantieri, sovrapposizioni con ferie, dipendenze tra fasi. Niente più cantiere fermo perché 'l'altro l'aveva preso lui'.",
    },
    {
      title: "Meteo come variabile pianificata",
      text: "Lavorazioni esterne pianificate considerando previsioni 7 giorni. Niente più gettate annullate per pioggia, niente più costi morti per squadra in attesa.",
    },
    {
      title: "Cliente coinvolto e sereno",
      text: "Cliente vede il proprio cantiere sul calendario condiviso del portale, sa esattamente quando finiscono lavori, può programmare il trasloco. Trasparenza che genera fiducia.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Gantt multi-cantiere zoomabile",
      value: "Vista da giornaliera a mensile, color coding per cliente/fase/squadra, dipendenze tra fasi, milestone, scadenze SAL, esportazione PDF per riunioni.",
    },
    {
      label: "Allocazione squadre per slot",
      value: "Drag-and-drop operai e squadre sui cantieri, competenze e disponibilità tracciate, conflict detection in tempo reale, suggerimento sostituti automatico.",
    },
    {
      label: "Conflict detection automatica",
      value: "Alert se operaio allocato su 2 cantieri, sovrapposizione con ferie approvate, doppia squadra sullo stesso slot, mancata copertura ruolo critico (RSPP, capocantiere).",
    },
    {
      label: "Integrazione meteo 7 giorni",
      value: "Previsioni meteo della zona cantiere, alert lavorazioni esterne per pioggia/vento/gelo, suggerimento spostamento giorno sereno per gettate/coperture/scavi.",
    },
    {
      label: "Sync Google Calendar e Outlook",
      value: "Sincronizzazione bidirezionale dei calendari personali del titolare/capocantieri con il gantt aziendale. Eventi personali visibili per evitare conflitti.",
    },
    {
      label: "App mobile per capocantieri",
      value: "Capocantiere vede pianificazione del giorno sul telefono, conferma presa visione, segnala variazioni in tempo reale, riceve notifiche su modifiche.",
    },
    {
      label: "Vista cantiere sul portale cliente",
      value: "Cliente accede dal portale al calendario del proprio cantiere con milestone settimanali, data fine prevista, fasi completate. Trasparenza totale.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il Calendario Lavori cambia la giornata.",
  scenarios: [
    {
      title: "Pioggia martedì sul getto cemento",
      text: "Lunedì sera sistema rileva 'pioggia martedì 80%' sul cantiere getto cemento. Suggerisce spostamento a giovedì sereno. Avvisa fornitore e squadra. Martedì lavorazioni interne, giovedì getto perfetto, niente €800 di costo morto.",
    },
    {
      title: "Mario malato al cantiere principale",
      text: "Martedì alle 7:00 Mario chiama malato. Sistema vede che era allocato al cantiere Villa Rossi come capocantiere, propone Luigi che è ferie ma rientra mercoledì, suggerisce Marco che ha competenza e disponibilità. Sostituzione confermata in 2 minuti.",
    },
    {
      title: "Cliente chiede data fine cantiere",
      text: "Cliente chiama 'quando finite?'. Tu apri il gantt: cantiere Bianchi finisce 18 ottobre con 87% di affidabilità. Cliente vede la stessa data sul portale. Programma il trasloco per il 25 ottobre. Niente più ambiguità, niente più sfiducia.",
    },
  ],

  testimonialQuote:
    "Avevo 9 cantieri attivi e pianificavo su un Excel che diventava obsoleto a metà settimana. Conflitti operai 2 volte alla settimana, getti annullati per pioggia 1 volta al mese. Ora il gantt vive, il meteo è integrato, i conflitti li vedo prima. La produttività delle squadre è salita del 25% e i clienti mi chiedono molto meno 'quando finite?'.",
  testimonialAuthor: "Paolo G.",
  testimonialRole: "Costruzioni G. Srl, Firenze",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare al gantt vivente.",
  faqs: [
    {
      q: "Funziona se ho solo 2-3 cantieri o serve per imprese grandi?",
      a: "Funziona da 1 cantiere a 50. Anche con 2-3 cantieri attivi il gantt visuale aiuta a vedere conflitti operai e meteo. Per imprese più grandi (10-50 cantieri) la conflict detection automatica diventa indispensabile e fa risparmiare ore di riunioni di pianificazione settimanali.",
    },
    {
      q: "Come funziona la sincronizzazione con Google Calendar e Outlook?",
      a: "Sincronizzazione bidirezionale via API ufficiali Google e Microsoft. I cantieri pianificati sul gantt aziendale appaiono nei calendari personali di titolare e capocantieri. Eventi personali (riunione cliente, visita medico) appaiono sul gantt come 'non disponibile' per evitare conflitti.",
    },
    {
      q: "Il meteo è davvero affidabile per pianificare?",
      a: "Integriamo previsioni a 7 giorni con accuratezza media 75% per giorno+1, 65% per giorno+3, 50% per giorno+7. Sufficiente per pianificare lavorazioni esterne (gettate, scavi, coperture) con preavviso e ridurre del 60% i costi morti per maltempo. Aggiornamento ogni 6 ore.",
    },
    {
      q: "Come si gestiscono le dipendenze tra fasi (es. fondazioni → strutture)?",
      a: "Sul gantt si tracciano dipendenze 'finish-to-start' tra fasi. Se la fase fondazioni slitta di 3 giorni, il sistema sposta automaticamente le fasi dipendenti (strutture, impianti, finiture) e ricalcola data fine cantiere. Notifica al cliente sul portale.",
    },
    {
      q: "I miei capocantieri non sono pratici di gantt, riusciranno a usarlo?",
      a: "Sì. L'interfaccia è drag-and-drop, simile a un calendario Google evoluto. La curva di apprendimento è di 30 minuti per il titolare e 10 minuti per i capocantieri (che usano principalmente l'app mobile per vedere il pianificato del giorno). Formazione 1-a-1 inclusa nell'onboarding.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di cantieri?",
      a: "Il modulo Calendario Lavori è incluso nei piani Professional e Business di Edilizia in Cloud con cantieri illimitati e utenti illimitati. Setup in 48 ore, app mobile inclusa, sincronizzazione Google/Outlook inclusa, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Calendario Lavori è il direttore d'orchestra dell'azienda edile.",
  internalLinksBody:
    "Il modulo collega cantieri, squadre, ferie, ordini fornitori e portale cliente in un'unica regia visuale e in tempo reale.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Cantieri attivi popolano automaticamente il gantt." },
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Squadre con competenze allocate sui cantieri." },
    { to: "/funzionalita/ferie-permessi", title: "Ferie e Permessi", text: "Ferie approvate visibili sul gantt." },
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "Consegne fornitori pianificate sul calendario." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere Mobile", text: "Capocantiere vede pianificato del giorno e segnala variazioni." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Cliente vede milestone e date sul calendario condiviso." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI di puntualità cantiere e produttività squadre." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Calendario Lavori incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di pianificare su Excel obsoleto. Inizia con un gantt che vive.",
  finalCtaBody:
    "31 giorni gratuiti per portare la pianificazione cantieri su un gantt visuale multi-cantiere. Conflict detection automatica, meteo integrato, sincronizzazione Google e Outlook, app mobile per capocantieri. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Gantt multi-cantiere · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Calendario Lavori",
  stickyCtaMicrocopy: "Setup 48h · Gantt multi-cantiere",

  applicationSubCategory: "Construction Scheduling Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function CalendarioLavori() {
  return <FunzionalitaPageTemplate config={config} />;
}
