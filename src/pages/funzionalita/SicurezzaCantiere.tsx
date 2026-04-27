import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck,
  FileSignature,
  FileText,
  Gavel,
  HardHat,
  HeartPulse,
  Layers,
  ListChecks,
  Lock,
  Megaphone,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Target,
  Timer,
  TriangleAlert,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "sicurezza-cantiere",
  vertical: "Sicurezza Cantiere",
  productName: "Sicurezza Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, RSPP e coordinatori sicurezza che devono gestire D.Lgs 81/2008 in modo pratico: POS digitali, DUVRI, formazione tracciata, DPI, sopralluoghi, near-miss, scadenze visite mediche",
  audienceShort: "imprese edili e RSPP che vogliono sicurezza gestita davvero",

  seo: {
    title:
      "Sicurezza Cantiere — D.Lgs 81/2008, POS Digitali, DPI e Formazione Tracciata | Edilizia in Cloud",
    description:
      "Software sicurezza cantiere conforme D.Lgs 81/2008: POS digitali, DUVRI, formazione tracciata, DPI, sopralluoghi, near-miss, scadenze visite mediche. Risparmia 0,3h/operaio/sett su gestione documentale.",
    keywords:
      "sicurezza cantiere software, dlgs 81 2008 gestione, pos digitale cantiere, duvri impresa edile, formazione lavoratori edilizia, dpi tracciato cantiere, near miss edilizia, visita medica operai scadenza",
    ogImage: "https://www.ediliziaincloud.com/og/sicurezza-cantiere-og.jpg",
  },

  heroBadge: "Funzionalità · Sicurezza Cantiere",
  heroH1Lead: "Sicurezza D.Lgs 81/2008",
  heroH1Highlight: "gestita davvero",
  heroH1Tail: "non solo 'archiviata'",
  heroSubheadline:
    "Software per gestire la sicurezza del cantiere in modo conforme al D.Lgs 81/2008: POS digitali, DUVRI, formazione tracciata, DPI assegnati a operai e mezzi, sopralluoghi, near-miss, integrazione con coordinatore sicurezza, alert automatici su scadenze visite mediche e formazione. Pronto per ispezioni INL e ASL.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Conforme D.Lgs 81/2008",
    "Alert automatici scadenze",
  ],
  proofPoints: [
    "POS digitale firmabile",
    "DPI tracciati per operaio",
    "Visite mediche con scadenziario",
  ],

  objectiveRow: [
    ["Obiettivo", "Conformità sicurezza vissuta, non solo archiviata"],
    ["Momento chiave", "Ogni nuovo cantiere, ogni ispezione, ogni visita medica"],
    ["Risultato", "Zero sanzioni, zero blocchi cantiere, operai protetti davvero"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano Sicurezza Cantiere per essere pronte alle ispezioni INL e ASL.",
  betaBody:
    "Sicurezza Cantiere è già pronto: lo attiviamo in 48 ore importando la rubrica operai con scadenze visite mediche e formazione, configurando i template POS conformi, abilitando l'app per il sopralluogo del coordinatore, e ti accompagniamo in 3 sessioni 1-a-1 fino al primo cantiere completamente in regola.",

  speedH2:
    "Una visita medica dimenticata blocca il cantiere. Una formazione scaduta è multa. Il sistema previene.",
  speedSubheadline:
    "L'impresa edile italiana ha decine di scadenze sicurezza per ogni operaio: visita medica annuale, formazione generale, formazione specifica, formazione su attrezzature, DPI da rinnovare. Senza tracciamento automatico, qualcosa scade sempre. Ispezione INL: blocco cantiere e multe da 3.000 a 12.000 € per dipendente.",
  speedStats: [
    { value: 100, prefix: "%", suffix: "", label: "conformità D.Lgs 81/2008 documentabile" },
    { value: 0.3, suffix: " h/operaio/sett", label: "tempo recuperato su gestione sicurezza" },
    { value: 0, suffix: "", label: "scadenze visite mediche dimenticate" },
  ],

  familyH2: "Sicurezza Cantiere collegata a tutto il flusso operativo.",
  familySubheadline:
    "La sicurezza non è un modulo isolato: è integrata con HR (operai), Cantieri (presenze giornaliere), Giornale Lavori (eventi rilevanti), Automazioni (alert scadenze). Tutto si autoaggiorna, niente file Excel duplicati.",
  familyItems: [
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "POS digitali, DUVRI, formazione, DPI, sopralluoghi, near-miss, scadenze.",
      to: "/funzionalita/sicurezza-cantiere",
    },
    {
      icon: Users,
      title: "HR Personale",
      text: "Operai con scadenze visite mediche, formazione, DPI tracciati.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Presenze giornaliere collegate a operai conformi sicurezza.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: BookOpen,
      title: "Giornale Lavori",
      text: "Sopralluoghi sicurezza ed eventi rilevanti integrati nel giornale.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: Workflow,
      title: "Automazioni",
      text: "Alert automatici a -30 e -7 giorni su visite mediche e formazione.",
      to: "/funzionalita/automazioni",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "POS, DUVRI, attestati formazione firmabili online con valore eIDAS.",
      to: "/funzionalita/firma-elettronica",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Una sola sorgente verità sulla sicurezza. Niente Excel da rincorrere.",
  familyBonusText:
    "Quando un operaio cambia formazione, la presenza in cantiere si aggiorna. Quando una visita medica scade, l'alert parte automatico. Quando il coordinatore fa sopralluogo, finisce nel giornale lavori. Tutto integrato, niente file separati su 5 server diversi.",

  painKicker: "Il problema vero",
  painH2:
    "La sicurezza in cantiere è gestita su Excel da una persona. Quando si dimentica qualcosa, è disastro.",
  painSubheadline:
    "L'impresa edile media ha 1 RSPP esterno + 1 segretaria che gestiscono sicurezza su 6 cartelle Excel diverse: scadenze visite mediche, formazione, DPI, POS per cantiere, sopralluoghi. Senza un sistema integrato, qualcosa salta sempre. Ispezione INL: 3.000-12.000 € di multa per ogni non conformità.",
  painPoints: [
    {
      icon: TriangleAlert,
      title: "Scadenze visite mediche dimenticate",
      text: "Operaio Mario ha visita medica annuale scaduta da 2 mesi. Nessuno se n'è accorto perché il file Excel è gestito a mano. Ispezione ASL improvvisa, 4.000 € di multa per dipendente, blocco accesso cantiere fino a regolarizzazione.",
    },
    {
      icon: FileText,
      title: "POS scritti una volta e mai aggiornati",
      text: "POS del cantiere scritto a inizio lavori, archiviato in cartella, dimenticato. Quando subentra una nuova fase di lavoro (es. lavori in quota), il POS non è aggiornato. Ispezione INL: contestazione per POS non adeguato, multa fino a 12.000 €.",
    },
    {
      icon: Search,
      title: "DPI assegnati senza traccia di consegna",
      text: "Caschi, scarpe, imbracature consegnate agli operai senza firma di consegna. In caso di infortunio, il datore di lavoro non può dimostrare di aver fornito i DPI. Responsabilità penale e civile altissima.",
    },
    {
      icon: AlertTriangle,
      title: "Near-miss non registrati né analizzati",
      text: "Operaio quasi cade dal ponteggio, nessuno scrive nulla. Settimana dopo cade davvero. Senza registrazione e analisi dei near-miss, gli infortuni evitabili diventano infortuni reali. Costi umani ed economici devastanti.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stessa norma. Stesse persone. Stesso cantiere. Cambia il sistema, sparisce il rischio.",
  baSubheadline:
    "Il modulo Sicurezza Cantiere non aggiunge burocrazia: la struttura. Trasforma processi che dipendono dalla memoria della segreteria in workflow automatici che generano alert prima delle scadenze e producono prove documentali in caso di ispezione.",
  baAreas: [
    {
      title: "Scadenze visite mediche e formazione",
      before:
        "File Excel con scadenze gestite a mano. Si dimenticano, scoperte solo in ispezione ASL. Multe 3.000-4.000 € per operaio, blocco accesso cantiere. RSPP rincorre tutto a fine mese.",
      after:
        "Alert automatici a -30 e -7 giorni su ogni scadenza. Notifica RSPP, operaio, capocantiere. Visite mediche prenotate in tempo, formazione rinnovata prima della scadenza. Conformità documentabile.",
    },
    {
      title: "POS digitale e aggiornamenti per fase",
      before:
        "POS scritto a inizio cantiere, archiviato in cartella, mai aggiornato. Nuova fase di lavoro non riflessa nel POS. Ispezione INL: contestazione, multa, blocco lavori.",
      after:
        "POS digitale con template per fasi di lavoro. Ad ogni nuova fase, prompt al coordinatore per aggiornarlo. Firma elettronica eIDAS, archivio cloud, sempre disponibile per ispezione.",
    },
    {
      title: "Gestione DPI con consegna firmata",
      before:
        "Caschi e scarpe consegnati senza firma. In caso di infortunio, datore non può dimostrare la consegna. Responsabilità penale del titolare/RSPP ai sensi art. 18 D.Lgs 81/08.",
      after:
        "DPI assegnati a operaio con firma elettronica della consegna, registro digitale, foto del DPI consegnato. In caso di infortunio o ispezione, prova documentale immediata.",
    },
    {
      title: "Near-miss e sopralluoghi sicurezza",
      before:
        "Near-miss non registrati, sopralluoghi del coordinatore su carta che si perde. Nessuna analisi statistica, nessuna prevenzione strutturata. Infortuni reali che potevano essere evitati.",
      after:
        "App mobile per registrare near-miss in 30 secondi con foto, location, descrizione. Sopralluoghi del coordinatore digitali con checklist. Analisi statistica per identificare pattern e prevenire infortuni.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: scadenze tracciate, sopralluoghi mobile, archivio conforme.",
  mechanismSubheadline:
    "Il modulo Sicurezza Cantiere è progettato per la realtà operativa di un'impresa edile italiana: alert automatici prima delle scadenze, app mobile per il coordinatore in cantiere, archivio digitale conforme pronto per le ispezioni.",
  mechanismSteps: [
    {
      icon: Bell,
      title: "Scadenze tracciate con alert automatici",
      text: "Visite mediche, formazione, DPI, certificazioni: tutte tracciate per operaio, cantiere, mezzo. Alert automatici a -30 e -7 giorni via email/WhatsApp a RSPP, operaio, capocantiere. Niente più dimenticanze.",
    },
    {
      icon: Smartphone,
      title: "Sopralluoghi e near-miss mobile",
      text: "Coordinatore o RSPP fa sopralluogo dal cantiere via app mobile: checklist conforme D.Lgs 81/08, foto allegate, geolocalizzazione automatica. Near-miss registrati in 30 secondi. Tutto archiviato e firmato.",
    },
    {
      icon: FileCheck,
      title: "Archivio conforme pronto per ispezioni",
      text: "POS, DUVRI, attestati formazione, registri DPI, sopralluoghi, near-miss: tutto archiviato in PDF/A immutabile con hash SHA-256. In caso di ispezione INL/ASL, esporti tutto il dossier in 30 secondi.",
    },
  ],
  mechanismCta: "Vedi il modulo Sicurezza in azione",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Niente sanzioni, niente blocchi cantiere, niente responsabilità penale del titolare.",
  commercialBody:
    "Il modulo Sicurezza Cantiere non è solo conformità: è protezione legale per il titolare. In caso di infortunio grave, l'art. 590 c.p. prevede pene fino a 5 anni per il datore di lavoro. Avere prova documentale di formazione, DPI, sopralluoghi, near-miss è la prima difesa.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "Conformità D.Lgs 81/2008 garantita",
      text: "POS digitali, DUVRI, registro formazione, DPI tracciati, sopralluoghi, near-miss. Tutto conforme, tutto archiviato in PDF/A immutabile. In caso di ispezione INL/ASL, hai tutto pronto in 30 secondi.",
    },
    {
      icon: ShieldAlert,
      title: "Difesa legale in caso di infortunio",
      text: "Infortunio grave → indagine penale al titolare. La prova di aver formato l'operaio, consegnato DPI, fatto sopralluoghi, registrato near-miss è la prima difesa. Senza prove documentali strutturate, condanna probabile.",
    },
    {
      icon: Timer,
      title: "Tempo recuperato su gestione documentale",
      text: "RSPP risparmia 4-6 ore/settimana, segreteria 3-4 ore/settimana. Niente più Excel da aggiornare a mano, niente più rincorsa scadenze. Tempo che torna disponibile per la prevenzione vera.",
    },
    {
      icon: Sparkles,
      title: "Posizionamento da impresa strutturata",
      text: "Su gare pubbliche e clienti B2B, dimostrare gestione strutturata della sicurezza è un differenziale. Più gare vinte, più clienti premium, ticket medio più alto. Gli investimenti in sicurezza ritornano commercialmente.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Ispezioni INL/ASL gestite in 30 secondi. Operai protetti davvero. Titolare al riparo.",
  resultsBody:
    "Le imprese che attivano il modulo Sicurezza Cantiere vedono cambiare 4 metriche: zero sanzioni in ispezione, -65% tempo gestione documentale, near-miss registrati 10x in più (e quindi prevenibili), copertura legale del titolare in caso di infortunio.",
  integrationPillars: [
    {
      icon: Stethoscope,
      title: "Scadenziario visite mediche e formazione",
      text: "Per ogni operaio: visita medica, formazione generale (4h), specifica (8/12h), aggiornamenti, abilitazioni mezzi. Alert automatici a -30 e -7 giorni. Niente dimenticanze.",
    },
    {
      icon: ListChecks,
      title: "POS e DUVRI digitali per cantiere",
      text: "Template conformi D.Lgs 81/08, sezioni precompilate, aggiornabili per fasi di lavoro. Firma elettronica eIDAS, archivio cloud, sempre disponibili.",
    },
    {
      icon: HardHat,
      title: "DPI tracciati con consegna firmata",
      text: "Caschi, scarpe, imbracature, occhiali, guanti: assegnati per operaio con firma elettronica della consegna, foto del DPI, scadenza per sostituzione. Prova documentale immediata.",
    },
    {
      icon: Activity,
      title: "Sopralluoghi e near-miss mobile",
      text: "App per coordinatore/RSPP. Checklist conforme normativa, foto e geolocalizzazione automatiche. Analisi statistica near-miss per prevenire infortuni reali.",
    },
  ],
  resultStats: [
    { value: 100, prefix: "%", suffix: "", label: "conformità D.Lgs 81/2008 documentabile" },
    { value: 65, prefix: "-", suffix: "%", label: "tempo gestione documentale RSPP" },
    { value: 10, prefix: "x", suffix: "", label: "near-miss registrati e prevenuti" },
  ],
  resultsCta: "Apri il modulo Sicurezza Cantiere",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto recuperi gestendo la sicurezza in modo strutturato invece che su Excel?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di operai e costo orario interno della funzione sicurezza (RSPP/segreteria). La stima parte da 0,3 ore/operaio/settimana risparmiate sulla gestione documentale.",
  roi: {
    input1Label: "Operai gestiti",
    input1Default: 25,
    input1Min: 5,
    input1Max: 300,
    input1Step: 1,
    input2Label: "Costo orario sicurezza (€)",
    input2Default: 35,
    input2Min: 20,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * 0.3 * b),
    computeSecondary: (a, b) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 52 * 0.3)} h` },
      { label: "Sanzioni evitate stima", value: `${Math.round(a * 0.05 * 4000).toLocaleString("it-IT")} €` },
      { label: "Conformità documentabile", value: "100%" },
    ],
    closingPitch:
      "Stima conservativa: 0,3 ore/operaio/settimana risparmiate × 52 settimane × costo orario. Aggiungi le sanzioni evitate (3.000-12.000 € per non conformità) e la copertura legale del titolare in caso di infortunio.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "La sicurezza smette di essere un peso. Diventa un asset commerciale e una protezione vera.",
  salesBody:
    "Il modulo Sicurezza Cantiere cambia 4 dimensioni operative: come gestisci scadenze, come prepari POS e DUVRI, come tracci DPI e formazione, come ti prepari alle ispezioni e ti proteggi in caso di infortunio.",
  salesImpact: [
    {
      title: "Scadenze sicurezza sotto controllo",
      text: "Visite mediche, formazione, DPI, abilitazioni mezzi: tutto tracciato con alert automatici. RSPP smette di rincorrere, segreteria recupera tempo. Operai sempre conformi.",
    },
    {
      title: "POS e DUVRI sempre aggiornati",
      text: "Template digitali conformi, aggiornati per fasi di lavoro. Firma elettronica eIDAS. Niente più POS scritti una volta e mai più aggiornati.",
    },
    {
      title: "Difesa legale in caso di infortunio",
      text: "Prova documentale di formazione, DPI consegnati, sopralluoghi fatti, near-miss analizzati. In caso di indagine penale per art. 590 c.p., difesa solida.",
    },
    {
      title: "Posizionamento commerciale superiore",
      text: "Su gare pubbliche e clienti B2B, sicurezza strutturata = punteggi qualitativi più alti. Più gare vinte, ticket medio più alto, posizionamento da impresa premium.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non un PDF di 200 pagine generico. Un sistema di gestione sicurezza vissuto ogni giorno.",
  featureRows: [
    {
      label: "Scadenziario visite mediche per operaio",
      value:
        "Visita medica annuale tracciata per operaio con alert -30 e -7 giorni. Notifica automatica a RSPP, operaio, capocantiere. Conformità art. 41 D.Lgs 81/08.",
    },
    {
      label: "Registro formazione lavoratori",
      value:
        "Formazione generale (4h), specifica (8/12h), aggiornamenti, abilitazioni mezzi (carrello elevatore, escavatore). Attestati digitali firmati, scadenze tracciate.",
    },
    {
      label: "POS digitale per cantiere",
      value:
        "Template conforme D.Lgs 81/08, sezioni precompilate per tipologia lavoro, aggiornabili per fasi. Firma elettronica eIDAS del datore di lavoro, archivio cloud.",
    },
    {
      label: "DUVRI digitale e sopralluoghi",
      value:
        "Documento Unico Valutazione Rischi Interferenze digitale per cantieri con più imprese. Sopralluoghi mobile con checklist conforme, foto allegate, firme elettroniche.",
    },
    {
      label: "Registro DPI con consegna firmata",
      value:
        "Caschi, scarpe, imbracature, occhiali, guanti assegnati per operaio. Firma elettronica della consegna, foto del DPI, scadenza per sostituzione. Prova ex art. 18.",
    },
    {
      label: "Near-miss e analisi statistica",
      value:
        "App mobile per registrare near-miss in 30 secondi: foto, location, descrizione. Analisi statistica per identificare pattern (cantieri, mansioni, orari) e prevenire infortuni.",
    },
    {
      label: "Integrazione con coordinatore sicurezza",
      value:
        "Accesso dedicato per il coordinatore esterno (CSE/CSP) per fare sopralluoghi, vedere POS, registrare segnalazioni. Tutto integrato, niente email di scambio documenti.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui Sicurezza Cantiere protegge davvero impresa e operai.",
  scenarios: [
    {
      title: "Ispezione INL improvvisa",
      text: "Mercoledì arriva ispezione INL sul cantiere. Chiede POS aggiornato, registro DPI, attestati formazione, registro near-miss. Apri il dashboard: esporti dossier completo in PDF/A in 30 secondi. POS firmato, DPI tracciati con consegna, formazione operai aggiornata. Ispezione si chiude senza sanzioni.",
    },
    {
      title: "Visita medica scaduta intercettata in tempo",
      text: "Lunedì mattina alert automatico: visita medica operaio Marco scade tra 30 giorni. Sistema notifica RSPP, segreteria, operaio. Visita prenotata mercoledì, fatta venerdì, registrato attestato. Niente operaio non conforme in cantiere, niente multa potenziale di 4.000 €.",
    },
    {
      title: "Near-miss su ponteggio analizzato",
      text: "Operaio quasi cade da ponteggio mobile, registra near-miss via app: foto, location, descrizione. Coordinatore vede il dato, fa sopralluogo, scopre ponteggio mal montato in 3 cantieri diversi. Risolve struttura, evita 3 infortuni reali probabili. Costo umano evitato incalcolabile.",
    },
  ],

  testimonialQuote:
    "Avevamo la sicurezza gestita su 6 file Excel diversi tra RSPP, segreteria e coordinatore esterno. Era un disastro: visite mediche scadute, POS dimenticati, DPI senza firma di consegna. Da quando usiamo Sicurezza Cantiere, conformità totale, ultime 2 ispezioni INL chiuse in 15 minuti senza sanzioni. E il RSPP ha recuperato 5 ore a settimana.",
  testimonialAuthor: "Paolo G.",
  testimonialRole: "Costruzioni Toscana Srl, Firenze",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di adottare Sicurezza Cantiere.",
  faqs: [
    {
      q: "Sostituisce il RSPP?",
      a: "No. Il modulo Sicurezza Cantiere è uno strumento di gestione documentale e operativa, non sostituisce le competenze del Responsabile del Servizio di Prevenzione e Protezione. Lo affianca, riducendo del 60-70% il tempo che il RSPP spende su Excel e cartelle, lasciandogli più tempo per la prevenzione vera in cantiere.",
    },
    {
      q: "Funziona con il coordinatore sicurezza esterno (CSE/CSP)?",
      a: "Sì. Il coordinatore esterno ha accesso dedicato per fare sopralluoghi, vedere POS, registrare segnalazioni. Tutto integrato nel cantiere, niente più scambio email di documenti, niente più dispersione di informazioni tra figure diverse.",
    },
    {
      q: "I documenti generati hanno valore legale?",
      a: "Sì. POS, DUVRI, attestati formazione, registri DPI sono firmabili con firma elettronica avanzata conforme eIDAS, archiviati in PDF/A immutabile con hash SHA-256. Valore legale equivalente a documenti cartacei firmati a mano. Pronti per ispezioni e contenziosi.",
    },
    {
      q: "Si integra con HR e gestione operai?",
      a: "Sì, integrazione nativa con HR Personale. Scadenze visite mediche, formazione, DPI sono tracciate per ogni operaio. Quando l'operaio cambia mansione, le scadenze si aggiornano automaticamente.",
    },
    {
      q: "Funziona da mobile in cantiere?",
      a: "Sì, app nativa iOS e Android. Sopralluoghi del coordinatore, registrazione near-miss, consegna DPI con firma operaio: tutto da telefono, anche offline. Sincronizza automaticamente quando torna segnale.",
    },
    {
      q: "Il modulo è incluso nei piani Edilizia in Cloud?",
      a: "Sì, Sicurezza Cantiere è incluso nei piani Professional e Business. Numero operai e cantieri illimitato, archivio decennale incluso, firme elettroniche incluse. Niente costi extra per scadenza o documento gestito.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2:
    "Sicurezza Cantiere collegata a HR, Cantieri, Giornale Lavori, Automazioni.",
  internalLinksBody:
    "La sicurezza vive integrata con HR (operai), Cantieri (presenze), Giornale Lavori (eventi), Automazioni (alert). Ecco gli altri moduli che la rendono potente.",
  internalLinks: [
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Operai con scadenze visite mediche e formazione tracciate." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Presenze giornaliere collegate a operai conformi sicurezza." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Sopralluoghi sicurezza ed eventi rilevanti nel giornale." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Alert automatici a -30 e -7 giorni su scadenze sicurezza." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "POS, DUVRI, attestati firmabili con valore eIDAS." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Foto allegate ai sopralluoghi e ai near-miss." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Verifica idoneità tecnico-professionale subappaltatori." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "KPI sicurezza nel dashboard executive." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di rincorrere scadenze su Excel. Inizia a gestire la sicurezza come una vera impresa strutturata.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Sicurezza Cantiere dentro la tua impresa edile. Conforme D.Lgs 81/2008, alert automatici, POS digitali, DPI tracciati, integrazione coordinatore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Conforme D.Lgs 81/08 · Alert automatici",

  stickyCtaLabel: "Prova gratis Sicurezza Cantiere",
  stickyCtaMicrocopy: "Setup 48h · Conforme D.Lgs 81/08",

  applicationSubCategory: "Construction Site Safety Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function SicurezzaCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
