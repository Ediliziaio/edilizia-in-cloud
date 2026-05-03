import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Camera,
  ClipboardList,
  Clock,
  Cloud,
  FileText,
  HardHat,
  LineChart,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "gestione-cantieri",
  vertical: "Gestione Cantieri",
  productName: "Modulo Gestione Cantieri Edilizia in Cloud",
  audience: "Imprese edili, costruttori, ristrutturatori, general contractor, capi cantiere",
  audienceShort: "imprese edili",

  seo: {
    title:
      "Gestione Cantieri Edili",
    description:
      "Controlla l'avanzamento di ogni cantiere in tempo reale dal telefono. Margini per commessa aggiornati, timbrature GPS, giornale lavori digitale, chat…",
    keywords:
      "gestione cantieri software, avanzamento lavori real time, software cantieri edili, controllo cantiere smartphone, timbrature cantiere digitale, giornale lavori digitale, app cantiere offline, gestione commesse edili, dashboard cantieri",
    ogImage: "https://www.ediliziaincloud.com/og/gestione-cantieri-og.jpg",
  },

  heroBadge: "Funzionalità · Gestione Cantieri",
  heroH1Lead: "Gestisci ogni cantiere dal telefono,",
  heroH1Highlight: "in tempo reale",
  heroSubheadline:
    "Avanzamento lavori, timbrature GPS, giornale lavori digitale, chat squadra e costi per commessa — tutto aggiornato dal capocantiere via app mobile, tutto visibile al titolare in dashboard. Smetti di scoprire i ritardi solo in riunione.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Onboarding 1-a-1 incluso", "Cancelli quando vuoi"],
  proofPoints: [
    "Pensato per imprese e ristrutturatori",
    "App mobile con modalità offline",
    "Timbrature GPS conformi al CCNL",
  ],

  objectiveRow: [
    ["Obiettivo", "Sapere lo stato di ogni cantiere senza una telefonata"],
    ["Momento chiave", "Mattina, sera e ogni volta che cambia un costo"],
    ["Risultato", "Meno ritardi nascosti, più margine difeso"],
  ],

  betaH2: "Più di 320 imprese italiane usano Edilizia in Cloud per controllare i cantieri ogni giorno.",
  betaBody:
    "Il modulo Gestione Cantieri è la spina dorsale di Edilizia in Cloud: viene attivato in 48 ore, importa i tuoi cantieri aperti, configura squadre e turni e ti accompagna in 4 sessioni 1-a-1 fino a quando il capocantiere medio aggiorna in autonomia dal telefono. Niente call center: ti seguiamo personalmente.",

  speedH2: "In una settimana il capocantiere aggiorna da solo. In due settimane non fai più riunioni di status.",
  speedSubheadline:
    "Non serve formare l'azienda con corsi infiniti. La logica è la stessa di WhatsApp: foto, nota, timbra, fatto. Quello che cambia è dove finiscono i dati: in una dashboard dove tu vedi margini, ore e ritardi su ogni commessa.",
  speedStats: [
    { value: 68, prefix: "-", suffix: "%", label: "tempo dedicato ai report settimanali interni" },
    { value: 89, prefix: "+", suffix: "%", label: "capocantieri che aggiornano in autonomia entro 14 giorni" },
    { value: 3, prefix: "-", suffix: "h/sett", label: "di telefonate di aggiornamento al titolare" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud collegata al cantiere.",
  familySubheadline:
    "Il cantiere non è un'isola: è collegato a preventivi, fatture, margini, personale e subappalti. Edilizia in Cloud unisce tutto in una sola piattaforma, così i dati che entrano in cantiere alimentano automaticamente il resto dell'azienda.",
  familyItems: [
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento lavori, timbrature GPS, giornale lavori digitale, chat squadra e alert margini per ogni commessa.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Wallet,
      title: "Margini Cantiere",
      text: "Margine reale per commessa in tempo reale, scostamento preventivo/consuntivo, alert sui cantieri a rischio.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Preventivi in EUR, listini personalizzati, voci di computo metrico, conversione automatica in commessa.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Dalla commessa alla fattura elettronica senza copia-incolla. Conserva digitale 10 anni inclusa.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Users,
      title: "HR e Personale",
      text: "Operai, ferie, malattie, presenze e costo orario reale collegato alla commessa.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Wrench,
      title: "Gestione Subappalti",
      text: "Contratti, SAL, ritenute, DURC e fatture passive dei subappaltatori dentro al cantiere.",
      to: "/funzionalita/gestione-subappalti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Un solo abbonamento. Sei moduli connessi.",
  familyBonusText:
    "Ogni modulo si attiva quando ti serve, senza costi extra di integrazione. Niente importazioni notturne, niente file Excel intermedi: il dato del cantiere è già il dato del margine, della fattura e del busta paga.",

  painKicker: "Il problema vero",
  painH2: "Il titolare scopre i problemi sempre tardi. Quando la commessa è già in perdita.",
  painSubheadline:
    "Non è una questione di capocantieri pigri o di dipendenti distratti. È una questione di sistema: senza uno strumento dedicato, l'informazione del cantiere arriva al titolare attraverso telefonate, WhatsApp, Excel e riunioni. Tutto rumore, niente segnale.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Scopri i ritardi solo alla riunione settimanale",
      text: "Senza visibilità in tempo reale, lo scostamento si vede al venerdì. A quel punto la giornata persa non si recupera, le penali sono già maturate e il cantiere successivo rischia di slittare a sua volta.",
    },
    {
      icon: Phone,
      title: "I capocantieri ti chiamano invece di aggiornarti",
      text: "Ogni telefonata 'come va il cantiere?' è tempo che il capocantiere non spende a coordinare la squadra. E ogni ora di ritardo nel rispondere al titolare è un'ora di operai fermi a chiedere chiarimenti.",
    },
    {
      icon: FileText,
      title: "Excel diversi per ogni cantiere, dati sempre vecchi di…",
      text: "5 cantieri = 5 file Excel diversi aggiornati da 5 persone diverse. Una visione consolidata in tempo reale? Mai. E quando confronti i numeri, scopri che le formule non tornano e le date non sono allineate.",
    },
    {
      icon: Timer,
      title: "Le ore extra non vengono imputate alla commessa giusta",
      text: "Il capocantiere lavora 2 ore extra per recuperare un ritardo, ma non le registra sulla commessa giusta. Risultato: il margine reale scende, tu non lo sai, e a fine cantiere ti trovi un buco che non sai spiegare al commercialista.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesso titolare, stessi cantieri, stesso team. Cambia solo dove vivono i dati.",
  baSubheadline:
    "Non è una rivoluzione organizzativa: è la stessa impresa, semplicemente con un sistema operativo che la regge. Ecco cosa cambia concretamente nelle 4 dimensioni che pesano di più sul margine.",
  baAreas: [
    {
      title: "Comunicazione tra cantiere e ufficio",
      before:
        "WhatsApp, telefonate, foto disperse, capocantiere che ti chiama mentre sei dal commercialista. Tre fonti diverse per la stessa informazione, quasi mai allineate, quasi sempre incomplete.",
      after:
        "Un'unica timeline per cantiere: nota giornaliera, foto, ore, materiali, eventi meteo, firme. Capocantiere e ufficio leggono la stessa pagina. Tu apri l'app e sai tutto in 30 secondi.",
    },
    {
      title: "Controllo costi per commessa",
      before:
        "Excel ad hoc per ogni cantiere, formule che si rompono, manodopera caricata 'a forfait', materiali che arrivano in fattura un mese dopo. Il margine reale si scopre alla chiusura, quando non puoi più correggere.",
      after:
        "Costi imputati automaticamente alla commessa: ore reali via timbratura GPS, materiali da DDT importati, subappalti tracciati con SAL e ritenute. Lo scostamento sul preventivo lo vedi giorno per giorno.",
    },
    {
      title: "Avanzamento lavori",
      before:
        "Stato lavori dichiarato a voce in riunione del lunedì. Foto sparpagliate sul telefono del capocantiere. Niente confronto sistematico con il cronoprogramma. I ritardi si capiscono solo ai SAL.",
      after:
        "Ogni lavorazione ha uno stato: pianificato, in corso, completato. Le foto sono allegate alla lavorazione giusta. Il cronoprogramma confronta automaticamente avanzamento dichiarato e calendario previsto.",
    },
    {
      title: "Gestione operai e turni",
      before:
        "Ore registrate a fine settimana, magari su un foglio di carta. Ferie e malattie comunicate via WhatsApp e dimenticate. Costo orario reale per cantiere? Sconosciuto.",
      after:
        "Timbratura GPS al check-in, registrazione automatica delle ore sulla commessa, ferie e malattie gestite in app. Il costo orario reale per cantiere lo vedi in dashboard, conforme al CCNL.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi, niente formazione lunga, niente Excel da abbandonare di colpo.",
  mechanismSubheadline:
    "Edilizia in Cloud nasce per essere usato in cantiere, non in aula. Il capocantiere medio impara in 30 minuti, il titolare in 60. Tutti i dati che ti servono passano attraverso questi tre semplici passaggi.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "Il capocantiere apre l'app dal telefono",
      text: "Timbra l'arrivo via GPS, vede il piano del giorno, scatta foto, registra note, segnala materiali consegnati. Funziona offline: i dati si sincronizzano appena torna il segnale.",
    },
    {
      icon: Cloud,
      title: "I dati entrano nella commessa giusta automaticamente",
      text: "Ore sul cantiere giusto, materiali sulla voce di costo giusta, foto sulla lavorazione giusta. Niente data entry, niente Excel intermedio: l'informazione vive direttamente nel suo posto naturale.",
    },
    {
      icon: LineChart,
      title: "Il titolare vede la dashboard aggiornata in tempo reale",
      text: "Apri l'app o il browser e vedi: avanzamento, ore consumate, costi reali, scostamento sul preventivo, eventuali alert sui cantieri a rischio. Niente più riunioni 'come va?'.",
    },
  ],
  mechanismCta: "Provalo gratis sul tuo primo cantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Non è un costo IT. È margine recuperato che già stavi perdendo.",
  commercialBody:
    "I tre punti percentuali di margine che le imprese edili italiane perdono per ritardi non controllati, ore non imputate e materiali fuori budget valgono molto di più dell'abbonamento. Edilizia in Cloud restituisce visibilità prima che il danno sia fatto.",
  commercialLevers: [
    {
      icon: Target,
      title: "Difendi il margine prima del danno",
      text: "Lo scostamento sul preventivo lo vedi quando è ancora gestibile, non a fine cantiere. Una giornata di squadra recuperata vale più dell'abbonamento di un anno.",
    },
    {
      icon: Bell,
      title: "Alert prima che i costi superino il budget",
      text: "Soglie automatiche su ore, materiali e subappalti. Quando un cantiere supera l'80% del budget previsto, ricevi una notifica e puoi agire subito.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità CCNL e sicurezza tracciata",
      text: "Timbrature GPS conformi, giornale lavori digitale firmato dal DL, formazione sicurezza tracciata. In caso di ispezione INPS o INAIL hai tutto in cloud.",
    },
    {
      icon: TrendingUp,
      title: "Prezzi più giusti sui prossimi preventivi",
      text: "Lo storico dei costi reali per tipologia di lavorazione ti permette di prezzare meglio. Non più 'a sentimento': sui dati di cantieri simili appena chiusi.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "La gestione cantieri non è un modulo isolato. È il cuore del tuo gestionale edile.",
  resultsBody:
    "Quando il dato del cantiere è collegato a margini, fatture e busta paga, smetti di gestire l'impresa per silos. Vedi tutto da una dashboard, decidi più in fretta, presenti meglio al commercialista, alla banca e ai soci.",
  integrationPillars: [
    {
      icon: LineChart,
      title: "Dashboard titolare unificata",
      text: "Stato di ogni cantiere a colpo d'occhio: avanzamento %, ore residue, scostamento margini, alert. Personalizzabile per ruolo (titolare, geometra, capocantiere).",
    },
    {
      icon: Bell,
      title: "Alert automatici sugli scostamenti",
      text: "Notifiche push quando un cantiere supera il budget, salta una scadenza o accumula ore extra non previste. Tu decidi le soglie, il sistema ti avvisa.",
    },
    {
      icon: Camera,
      title: "Foto e documenti georeferenziati",
      text: "Ogni foto del cantiere è geolocalizzata e datata. Costituisce prova in caso di contestazioni col cliente o col DL. Niente più foto disperse sul telefono.",
    },
    {
      icon: MessageSquare,
      title: "Chat squadra integrata",
      text: "Sostituisce WhatsApp caotico: chat per cantiere, storico messaggi, file allegati alla commessa, lettura confermata. Resta nell'azienda, non sul telefono personale.",
    },
  ],
  resultStats: [
    { value: 18, prefix: "+", suffix: "%", label: "margine medio recuperato sui cantieri controllati" },
    { value: 4, prefix: "-", suffix: " gg", label: "di ritardo medio per cantiere rispetto al cronoprogramma" },
    { value: 92, prefix: "+", suffix: "%", label: "soddisfazione titolari dopo 90 giorni" },
  ],
  resultsCta: "Apri la tua dashboard di prova",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto margine puoi recuperare se vedi i cantieri in tempo reale?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e fatturato medio annuo per cantiere. La stima parte da 3 punti percentuali di margine recuperato, base media osservata nei nostri clienti dopo 90 giorni.",
  roi: {
    input1Label: "Cantieri attivi in media",
    input1Default: 6,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Fatturato medio annuo per cantiere",
    input2Default: 120000,
    input2Min: 20000,
    input2Max: 1500000,
    input2Step: 10000,
    input2Suffix: " €",
    outputLabel: "Margine recuperato stimato/anno",
    computeOutput: (a, b) => Math.round(a * b * 0.03),
    computeSecondary: (a, b) => [
      { label: "Fatturato totale gestito", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(a * b) },
      { label: "Ore titolare risparmiate/anno", value: `${Math.round(a * 12)} h` },
      { label: "Ore capocantiere/anno (report)", value: `${Math.round(a * 36)} h` },
    ],
    closingPitch:
      "Stima prudenziale basata su 3% di margine recuperato. La maggior parte dei nostri clienti recupera tra 4% e 7% nei primi 12 mesi.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un software in più. Un sistema operativo per l'impresa edile.",
  salesBody:
    "Non aggiungiamo un'app al caos esistente. Sostituiamo Excel, WhatsApp di lavoro e telefonate di aggiornamento con un unico flusso, dove ogni informazione vive nel posto giusto.",
  salesImpact: [
    {
      title: "Meno riunioni operative",
      text: "Le riunioni del lunedì calano del 60% perché ognuno parte dalla dashboard e si concentra solo sulle decisioni.",
    },
    {
      title: "Capocantieri più autonomi",
      text: "Sapere che il titolare 'vede' senza chiedere libera il capocantiere dall'ansia del report e gli ridà tempo per gestire la squadra.",
    },
    {
      title: "Trattative col cliente più solide",
      text: "Foto datate, giornale lavori firmato e cronoprogramma reale: contestazioni e revisioni di prezzo si risolvono con i dati alla mano.",
    },
    {
      title: "Crescita più sostenibile",
      text: "Quando aggiungi il cantiere numero 8, 10 o 15, la struttura non scoppia. Lo stesso sistema regge senza assumere altri impiegati di ufficio.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Avanzamento lavori in tempo reale",
      value:
        "Ogni lavorazione del cronoprogramma è tracciata con stato, % completata, ore impiegate, foto e note. Confronto automatico con il preventivo iniziale.",
    },
    {
      label: "Timbrature GPS",
      value:
        "Check-in e check-out via app con verifica geografica del cantiere. Ore registrate automaticamente sulla commessa, conformi al CCNL edilizia.",
    },
    {
      label: "Giornale lavori digitale",
      value:
        "Note giornaliere, eventi meteo, lavorazioni eseguite, presenze e firme digitali del DL. Esportabile in PDF firmato a norma.",
    },
    {
      label: "App offline per zone senza segnale",
      value:
        "Tutto funziona anche senza connessione: timbrature, foto, note. La sincronizzazione è automatica appena torna il segnale.",
    },
    {
      label: "Alert automatici su scostamenti",
      value:
        "Soglie configurabili su ore, materiali e subappalti. Quando un cantiere si avvicina al budget, ricevi notifica push e email.",
    },
    {
      label: "Chat squadra per cantiere",
      value:
        "Sostituisce WhatsApp di lavoro: chat dedicata per ogni cantiere, file allegati alla commessa, storico permanente nell'azienda.",
    },
    {
      label: "Dashboard multi-cantiere",
      value:
        "Vista titolare con tutti i cantieri attivi: avanzamento, margine, ritardi, alert. Filtri per cliente, capocantiere, area geografica.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Edilizia in Cloud cambia davvero la giornata.",
  scenarios: [
    {
      title: "Lunedì mattina, prima del caffè",
      text:
        "Apri l'app: 8 cantieri attivi, 6 in linea, 1 con ritardo di 2 giorni, 1 con alert su materiali. In 30 secondi sai dove serve il tuo intervento e dove no. Il giro telefonico del lunedì lo elimini.",
    },
    {
      title: "Cliente che contesta una variante",
      text:
        "Il cliente dice 'questo non l'avevamo deciso'. Apri il giornale lavori del 12 marzo, scarichi la pagina con foto datata, nota del DL e firma digitale. La discussione si chiude in due minuti.",
    },
    {
      title: "Preventivo per il cantiere successivo",
      text:
        "Devi prezzare un intervento simile a uno appena chiuso. Apri lo storico costi reali: ore impiegate, materiali consumati, subappalti. Prezzando sui dati reali, fai un'offerta competitiva e con margine.",
    },
  ],

  testimonialQuote:
    "Non faccio più riunioni 'come va il cantiere?'. Apro l'app e so tutto: avanzamento, ore, costi, note del giorno. Il capocantiere aggiorna dal telefono e io dormo meglio la notte.",
  testimonialAuthor: "Marco D.",
  testimonialRole: "Costruzioni Del Vecchio Srl, Torino",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Quanto tempo ci vuole per essere operativi davvero?",
      a: "Il setup base è completato in 48 ore. Il nostro team importa i tuoi cantieri aperti dai tuoi Excel, configura le squadre e ti accompagna in 4 sessioni 1-a-1 di 45 minuti. Molti clienti hanno il primo capocantiere che timbra dal telefono già il giorno 2.",
    },
    {
      q: "L'app funziona davvero senza connessione internet?",
      a: "Sì. Tutte le funzioni di campo (timbrature, foto, note, materiali, giornale lavori) lavorano in modalità offline. I dati si sincronizzano automaticamente appena torna il segnale, senza che il capocantiere debba fare nulla.",
    },
    {
      q: "Posso vedere i margini reali di ogni cantiere in tempo reale?",
      a: "Sì. Edilizia in Cloud aggrega automaticamente costi di manodopera (dalle timbrature), materiali (dai DDT importati) e subappalti (dai SAL). Lo scostamento preventivo/consuntivo si aggiorna in tempo reale, senza aspettare la chiusura del cantiere o la fattura del fornitore.",
    },
    {
      q: "Quanti cantieri posso gestire contemporaneamente?",
      a: "Non c'è limite tecnico. I nostri clienti gestiscono in media 5-20 cantieri in parallelo, con dashboard unificata e filtri per cliente, area, capocantiere. Le imprese più strutturate arrivano a 80+ cantieri attivi senza degrado di performance.",
    },
    {
      q: "I miei capocantieri non sono giovani: rischio che non lo usino?",
      a: "L'app è progettata sul modello WhatsApp: 4 pulsanti grandi, foto, nota, fine. Il capocantiere medio dei nostri clienti ha 52 anni e usa l'app dopo 30 minuti di onboarding. Nei primi 14 giorni offriamo affiancamento dedicato in cantiere se serve.",
    },
    {
      q: "Si integra con il mio commercialista e il mio sistema di fatturazione?",
      a: "Sì. Edilizia in Cloud include fatturazione elettronica SDI, conserva digitale 10 anni e esporta tracciati per i principali software di contabilità (TeamSystem, Zucchetti, Datev). Il commercialista riceve un export pronto, niente più copia-incolla.",
    },
    {
      q: "Quanto costa? Ci sono vincoli contrattuali?",
      a: "Il modulo Gestione Cantieri è incluso in tutti i piani Edilizia in Cloud, da 49€/mese per il piano Starter. Nessun costo di attivazione, nessun vincolo di durata, cancelli quando vuoi. Onboarding 1-a-1 e supporto italiano sempre inclusi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il cantiere è collegato. Ecco a cosa.",
  internalLinksBody:
    "Gestione Cantieri è il cuore di Edilizia in Cloud, ma vive insieme a margini, fatturazione, preventivi, HR, subappalti e ai moduli Render AI per la vendita. Ecco come si collegano i pezzi.",
  internalLinks: [
    {
      to: "/funzionalita/margini-cantiere",
      title: "Margini Cantiere",
      text: "Margine reale per commessa in tempo reale, scostamento preventivo/consuntivo, alert automatici sui cantieri a rischio.",
    },
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Preventivi professionali con voci di computo metrico, listini personalizzati, conversione in commessa con un click.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Dalla commessa al SAL, dall'ordine alla fattura elettronica con conserva digitale 10 anni inclusa.",
    },
    {
      to: "/funzionalita/hr-personale",
      title: "HR e Personale",
      text: "Gestione operai, ferie, malattie, presenze, busta paga e costo orario reale collegato alla commessa.",
    },
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Contratti, SAL subappalto, ritenute, DURC e fatture passive integrate nel cantiere.",
    },
    {
      to: "/funzionalita/render-infissi",
      title: "Render Infissi AI",
      text: "Per serramentisti: prima/dopo sulla foto reale del cliente, integrato al CRM e ai preventivi.",
    },
    {
      to: "/funzionalita/render-ristrutturazioni",
      title: "Render Ristrutturazioni AI",
      text: "Per imprese di ristrutturazione: prima/dopo sulla foto reale, dalla cucina al living, dal bagno alla zona notte.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma orientata alle imprese edili italiane: gestione, controllo, vendita, fatturazione.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Piani trasparenti da 49€/mese. Beta dedicata con prezzo bloccato. Cancelli quando vuoi.",
    },
  ],

  finalCtaH2: "Smetti di scoprire i ritardi in riunione. Inizia a vederli prima.",
  finalCtaBody:
    "31 giorni gratuiti per portare Edilizia in Cloud nei tuoi cantieri. Setup in 48 ore, onboarding 1-a-1 incluso, cancelli quando vuoi. Quello che cambia non è il software: è la tua serenità di titolare.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Onboarding 1-a-1 incluso · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Gestione Cantieri",
  stickyCtaMicrocopy: "Setup 48h · Cancelli quando vuoi",

  applicationSubCategory: "Construction Site Management Software",

  relatedBlogSlugs: [
    "sal-cantiere-come-funziona",
    "sicurezza-cantieri-dlgs-81",
    "giornale-dei-lavori-cantiere",
  ],
};

export default function GestioneCantieri() {
  return <FunzionalitaPageTemplate config={config} />;
}
