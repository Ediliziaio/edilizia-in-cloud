import {
  AlertTriangle,
  Archive,
  Banknote,
  Clock,
  Database,
  FileSearch,
  Filter,
  Inbox,
  Link2,
  Mail,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "cassetto-sdi",
  vertical: "Cassetto Fiscale SDI",
  productName: "Cassetto Fiscale SDI Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor e amministrazioni che vogliono il cassetto fiscale dell'Agenzia delle Entrate sincronizzato in tempo reale con il gestionale, senza scaricare XML manualmente",
  audienceShort: "imprese edili e amministrazioni",

  seo: {
    title:
      "Cassetto Fiscale SDI per Edilizia",
    description:
      "Il cassetto fiscale dell'Agenzia delle Entrate dentro il tuo gestionale: tutte le fatture B2B e B2C ricevute via SDI sincronizzate in automatico e ricercabili a parole chiave.",
    keywords:
      "cassetto fiscale edilizia, cassetto SDI, fatture passive SDI edilizia, sincronizzazione agenzia entrate, fatture ricevute B2B edilizia, archivio fiscale impresa edile, cassetto fiscale impresa costruzioni, software cassetto fiscale",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Cassetto Fiscale SDI",
  heroH1Lead: "Tutte le fatture passive",
  heroH1Highlight: "dentro il gestionale",
  heroH1Tail: "senza scaricare XML",
  heroSubheadline:
    "Il Cassetto Fiscale dell'Agenzia delle Entrate sincronizzato 24/7 con il tuo gestionale: fatture B2B e B2C ricevute via SDI importate in automatico, riconciliate con DDT e ordini, categorizzate per cantiere, ricercabili a parole chiave e pronte per il commercialista. Zero login al portale AdE, zero export manuali.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Sincronizzazione 24/7 con AdE", "Conformità GDPR e CAD"],
  proofPoints: [
    "Sync continuo cassetto fiscale",
    "Ricerca semantica su tutte le fatture",
    "Export commercialista in 1 click",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare il login manuale al portale Agenzia Entrate"],
    ["Momento chiave", "Chiusura mensile contabile e controllo IVA"],
    ["Risultato", "8 minuti risparmiati per fattura, zero fatture perse"],
  ],

  betaH2:
    "Più di 300 imprese italiane sincronizzano il Cassetto Fiscale con il gestionale, eliminando il portale AdE come collo di bottiglia.",
  betaBody:
    "Il Cassetto SDI lo attiviamo in 48 ore: configuriamo le credenziali Entratel/SPID/CIE, attiviamo la delega del commercialista, importiamo le fatture passive degli ultimi 5 anni, configuriamo le categorie cantiere e ti accompagniamo in 4 sessioni 1-a-1 con la nostra squadra fiscale.",

  speedH2:
    "Scaricare le fatture dal portale Agenzia Entrate brucia 8 minuti per fattura. Su 200 fatture al mese fa 26 ore.",
  speedSubheadline:
    "Login Entratel, ricerca per data, download XML, apertura, classificazione, salvataggio in cartella, comunicazione al commercialista. Otto step ripetuti 200 volte al mese: il Cassetto SDI Edilizia in Cloud li elimina tutti, automaticamente.",
  speedStats: [
    { value: 8, suffix: " min", label: "tempo medio risparmiato per fattura ricevuta" },
    { value: 100, suffix: "%", label: "fatture passive importate dal cassetto AdE" },
    { value: 24, suffix: "/7", label: "sincronizzazione automatica con SDI" },
  ],

  familyH2: "Il Cassetto Fiscale collegato a tutti i moduli operativi.",
  familySubheadline:
    "Le fatture passive sincronizzate dal Cassetto SDI alimentano automaticamente prima nota, scadenzario fornitori, riconciliazione DDT/ordini e analisi margini cantiere. Un dato unico, una sola fonte di verità.",
  familyItems: [
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture attive verso clienti integrate con il cassetto delle fatture ricevute.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Archive,
      title: "Conservazione Digitale",
      text: "Fatture sincronizzate dal cassetto conservate a norma per 10 anni.",
      to: "/funzionalita/conserva-digitale",
    },
    {
      icon: Banknote,
      title: "Prima Nota",
      text: "Movimenti contabili generati in automatico dalle fatture passive del cassetto.",
      to: "/funzionalita/prima-nota",
    },
    {
      icon: Clock,
      title: "Scadenzario",
      text: "Scadenze fornitori popolate automaticamente dalle fatture ricevute via SDI.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: Tag,
      title: "Ordini Acquisto",
      text: "Riconciliazione automatica fatture passive con ordini fornitore e DDT cantiere.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Costi reali da fatture passive imputati al cantiere per analisi margine.",
      to: "/funzionalita/margini-cantiere",
    },
  ],
  familyBonusTitle: "Una sola fonte fiscale. Zero data entry. Commercialista contento.",
  familyBonusText:
    "Quando una fattura passiva arriva via SDI, il sistema la importa, riconcilia con l'ordine, alimenta la prima nota, popola lo scadenzario, conserva a norma e categorizza per cantiere. Il commercialista trova tutto pronto, tu non tocchi un XML.",

  painKicker: "Il problema vero",
  painH2:
    "Login al portale AdE 3 volte a settimana. Decine di XML salvati in cartelle disordinate. Fatture perse e IVA ricalcolata.",
  painSubheadline:
    "Il portale Agenzia Entrate non è progettato per chi gestisce 100-500 fatture passive al mese. Tempi di download lenti, ricerca per data limitata, nessun collegamento al gestionale, nessuna ricerca semantica. Il risultato: fatture perse, IVA non scaricata, sanzioni.",
  painPoints: [
    {
      icon: Inbox,
      title: "Fatture passive perse nel rumore",
      text: "Una fattura del fornitore di calce arriva via SDI tra 73 altre fatture quel mese. Senza categorizzazione automatica per cantiere, si perde. Risultato: IVA non scaricata, costo non imputato, margine cantiere falsato.",
    },
    {
      icon: Clock,
      title: "Login Entratel ogni 2 giorni",
      text: "Il commercialista chiede 'mi mandi la fattura del 12 marzo del fornitore X?'. Login al portale, ricerca per data, download XML, apertura, invio email. 12 minuti per ogni richiesta. Su 30 richieste/mese = 6 ore.",
    },
    {
      icon: AlertTriangle,
      title: "Riconciliazione DDT/ordini impossibile",
      text: "Fattura arriva, ma corrisponde a quale ordine? Quale DDT? Quale cantiere? Senza integrazione, segreteria fa caccia al tesoro 5 minuti per fattura. Su 200 fatture/mese fa 16 ore di lavoro inutile.",
    },
    {
      icon: Search,
      title: "Ricerca per parola chiave inesistente",
      text: "Il portale AdE permette ricerca solo per data, partita IVA o numero fattura. Se devi cercare 'tutte le fatture con voce ferro tondo Cantiere Via Roma' ti tocca aprire una per una. Inutilizzabile.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesso cassetto fiscale, stesse fatture SDI. Cambia tutto il flusso operativo.",
  baSubheadline:
    "Il cassetto fiscale rimane quello dell'Agenzia delle Entrate (è la fonte ufficiale). Cambia come ci accedi, come lo categorizzi, come lo riconcilii. Da archivio passivo a strumento operativo vivo.",
  baAreas: [
    {
      title: "Importazione fatture ricevute",
      before:
        "Login al portale Entratel ogni 2-3 giorni, ricerca, download XML uno per uno, salvataggio in cartelle. 8-12 minuti per fattura, fatture perse, archivio disordinato.",
      after:
        "Sincronizzazione automatica 24/7: appena lo SDI riceve una fattura per la tua P.IVA, è già nel gestionale, categorizzata, riconciliata, pronta per la prima nota.",
    },
    {
      title: "Riconciliazione ordini/DDT/fattura",
      before:
        "Segreteria apre fattura, cerca a mano l'ordine corrispondente, cerca il DDT, controlla quantità e prezzi. 5-10 minuti per fattura, errori frequenti, contestazioni mancate.",
      after:
        "Match automatico per partita IVA fornitore, importo e numero ordine. Discrepanze (prezzo diverso, quantità extra, prodotto non ordinato) evidenziate con alert. Tu approvi o contesti in 30 secondi.",
    },
    {
      title: "Comunicazione al commercialista",
      before:
        "Fine mese: export ZIP da Entratel, email al commercialista, riunione di chiarimento, richieste documenti aggiuntivi. 4-6 ore di lavoro segreteria nei primi 5 giorni del mese.",
      after:
        "Commercialista ha accesso diretto al cassetto sincronizzato, vede tutte le fatture categorizzate per cantiere e capitolo. Export liquidazione IVA in 1 click in formato XBRL/CSV.",
    },
    {
      title: "Ricerca su archivio storico",
      before:
        "Cliente chiede fattura di 18 mesi fa. Caccia nel portale Entratel (limite ricerca 12 mesi), poi negli archivi locali, poi tra le email. 20-40 minuti, talvolta non si trova.",
      after:
        "Ricerca semantica su tutto lo storico (anche 5+ anni): cerchi 'fornitore X marzo 2023 ferro tondo' e trovi in 5 secondi. Download PDF/XML, archivio sempre disponibile.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per collegare il Cassetto Fiscale AdE al tuo gestionale.",
  mechanismSubheadline:
    "Il sistema usa la delega ufficiale del commercialista o le credenziali Entratel/SPID/CIE per dialogare con l'Agenzia delle Entrate. Sincronizzazione cifrata, log accessi tracciato, conformità GDPR.",
  mechanismSteps: [
    {
      icon: Link2,
      title: "Connessione delega cassetto fiscale",
      text: "Configuri la delega del commercialista o accedi con SPID/CIE/Entratel. La connessione è cifrata end-to-end, le credenziali non sono mai memorizzate in chiaro, log di accesso conforme GDPR.",
    },
    {
      icon: RefreshCw,
      title: "Sincronizzazione automatica 24/7",
      text: "Il sistema interroga il cassetto AdE ogni 2 ore: ogni nuova fattura ricevuta via SDI viene importata, classificata per cantiere, riconciliata con ordini/DDT, salvata in conservazione decennale.",
    },
    {
      icon: FileSearch,
      title: "Ricerca, riconcilia, esporta",
      text: "Ricerca semantica su tutto lo storico (data, fornitore, cantiere, voce, importo, parola chiave). Riconciliazione automatica con ordini/DDT. Export XBRL/CSV per il commercialista in 1 click.",
    },
  ],
  mechanismCta: "Apri la demo Cassetto SDI",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Recupero IVA garantito. Sanzioni evitate. Commercialista che ti chiama meno.",
  commercialBody:
    "Le imprese edili che attivano il Cassetto SDI Edilizia in Cloud recuperano in media il 4-7% di IVA che prima si perdeva (fatture sfuggite, classificazioni sbagliate, deduzioni mancate) e riducono dell'80% il tempo di interazione con il commercialista.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "IVA recuperata su fatture sfuggite",
      text: "In media il 4-7% di IVA detraibile si perde per fatture passive non classificate o non comunicate al commercialista. Con il sync automatico recuperi tutto.",
    },
    {
      icon: Scale,
      title: "Sanzioni AdE evitate",
      text: "Conservazione decennale a norma CAD, log accessi tracciato, archivio immutabile. In caso di verifica GdF o controllo AdE esibisci il dossier completo in 5 minuti.",
    },
    {
      icon: Users,
      title: "Commercialista che ti chiama meno",
      text: "Il commercialista vede in autonomia tutto ciò che gli serve, esporta liquidazione IVA da solo. Riduzione drastica delle email 'mi mandi la fattura X?'.",
    },
    {
      icon: Sparkles,
      title: "Margini cantiere finalmente reali",
      text: "I costi delle fatture passive vengono imputati automaticamente al cantiere giusto. Il margine di cantiere è finalmente affidabile, non basato su ipotesi.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il portale AdE smette di essere il tuo problema. Diventa una sorgente dati.",
  resultsBody:
    "Quando il Cassetto Fiscale è sincronizzato in tempo reale con il gestionale, il flusso fiscale dell'impresa cambia natura: da operazione manuale ripetitiva a flusso automatico controllato. Le imprese che attivano il Cassetto SDI vedono cambiare 4 dimensioni operative.",
  integrationPillars: [
    {
      icon: Database,
      title: "Sincronizzazione SDI continua",
      text: "Polling automatico ogni 2 ore sul cassetto AdE. Ogni nuova fattura passiva ricevuta è nel gestionale entro 2 ore dall'arrivo nello SDI.",
    },
    {
      icon: Filter,
      title: "Categorizzazione automatica per cantiere",
      text: "Algoritmo AI che analizza descrizione fattura, fornitore abituale e ordine collegato per imputare costo al cantiere giusto. Tu confermi o correggi.",
    },
    {
      icon: Search,
      title: "Ricerca semantica full-text",
      text: "Ricerca in linguaggio naturale su 5+ anni di storico: data, fornitore, cantiere, voce capitolato, importo, parola chiave nel corpo XML.",
    },
    {
      icon: Mail,
      title: "Export commercialista 1-click",
      text: "Liquidazione IVA mensile/trimestrale, registro acquisti, esterometro, prospetto comunicazioni. Formato XBRL/CSV/PDF, pronto per il commercialista.",
    },
  ],
  resultStats: [
    { value: 8, suffix: " min", label: "tempo risparmiato per fattura passiva" },
    { value: 5, prefix: "+", suffix: "%", label: "IVA detraibile recuperata su fatture sfuggite" },
    { value: 80, prefix: "-", suffix: "%", label: "email al commercialista per chiarimenti" },
  ],
  resultsCta: "Apri la demo Cassetto SDI",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se elimini 8 minuti per ogni fattura passiva ricevuta?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di fatture passive ricevute al mese e costo orario interno di amministrazione. La stima parte da 8 minuti risparmiati per fattura — il dato medio osservato sui nostri clienti.",
  roi: {
    input1Label: "Fatture passive ricevute al mese",
    input1Default: 150,
    input1Min: 10,
    input1Max: 2000,
    input1Step: 5,
    input2Label: "Costo orario amministrazione (€)",
    input2Default: 30,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.08 * b),
    computeSecondary: (a, b) => [
      { label: "Ore di amministrazione recuperate/anno", value: `${Math.round(a * 12 * 0.08)} h` },
      { label: "Tempo medio per fattura risparmiato", value: "8 minuti" },
      {
        label: "IVA recuperata stima 5% (€)",
        value: `€ ${(a * 12 * 200 * 0.22 * 0.05).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`,
      },
    ],
    closingPitch:
      "Stima prudenziale basata su 8 minuti risparmiati per fattura passiva (login Entratel, download, classificazione, archiviazione). Aggiungi l'IVA recuperata da fatture sfuggite e le sanzioni evitate.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un'integrazione contabile. Un cassetto fiscale finalmente operativo.",
  salesBody:
    "Il Cassetto SDI Edilizia in Cloud non sostituisce il cassetto AdE: lo collega al tuo gestionale e lo trasforma in uno strumento operativo. Le imprese che lo usano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Amministrazione che ricomincia a respirare",
      text: "La segreteria smette di passare ore al portale Entratel. Tornano disponibili 20-30 ore al mese da dedicare a controllo crediti, scadenze fornitori, gestione clienti.",
    },
    {
      title: "Commercialista come consulente, non come archivista",
      text: "Il commercialista vede tutto in autonomia, esporta da solo. Smette di fare il dattilografo e torna a fare il consulente fiscale. Tu paghi meno per il lavoro a ore.",
    },
    {
      title: "Margini cantiere reali e tempestivi",
      text: "I costi imputati automaticamente al cantiere rendono il margine affidabile in tempo reale. Non aspetti la chiusura mensile per scoprire se hai perso soldi.",
    },
    {
      title: "Pronto controllo GdF in 5 minuti",
      text: "In caso di verifica GdF o controllo AdE, esporti il dossier completo (fatture XML originali, marca temporale, log accessi) in 5 minuti. Conformità immediata.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Sincronizzazione cassetto AdE 24/7",
      value:
        "Polling automatico ogni 2 ore sul cassetto fiscale tramite delega commercialista o credenziali SPID/CIE/Entratel. Ogni fattura nuova è nel gestionale entro 2 ore.",
    },
    {
      label: "Importazione XML fatture B2B/B2C",
      value:
        "Tutte le fatture passive ricevute via SDI vengono scaricate, validate, archiviate. Supporto fatture ordinarie, semplificate, autofatture, reverse charge edilizia.",
    },
    {
      label: "Categorizzazione automatica per cantiere",
      value:
        "Algoritmo AI che usa fornitore, ordine collegato, descrizione e parole chiave per imputare costo al cantiere giusto. Tu confermi in 5 secondi.",
    },
    {
      label: "Riconciliazione DDT/ordini/fatture",
      value:
        "Match automatico fra ordine fornitore, DDT cantiere e fattura passiva. Discrepanze (prezzo, quantità, articolo non ordinato) segnalate con alert.",
    },
    {
      label: "Ricerca semantica full-text storico",
      value:
        "Ricerca in linguaggio naturale su 5+ anni: data, fornitore, cantiere, voce, importo, parola chiave nel corpo. Trovi una fattura del 2022 in 5 secondi.",
    },
    {
      label: "Export commercialista 1-click",
      value:
        "Liquidazione IVA, registro acquisti, esterometro, prospetto reverse charge edilizia. Formato XBRL/CSV/PDF firmato, pronto da inviare.",
    },
    {
      label: "Conservazione decennale CAD inclusa",
      value:
        "Tutte le fatture sincronizzate vanno automaticamente in conservazione digitale a norma D.Lgs 82/2005, con marca temporale qualificata AgID.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il Cassetto SDI cambia la giornata.",
  scenarios: [
    {
      title: "Verifica GdF improvvisa al lunedì mattina",
      text: "Lunedì 9:00 arriva la GdF: vogliono fatture passive 2022-2024 fornitore X. Apri il cassetto, filtri, esporti dossier completo con XML originali e marca temporale. Tempo totale: 7 minuti, GdF soddisfatta, niente sanzioni.",
    },
    {
      title: "Chiusura IVA del 16 senza panico",
      text: "Il 13 del mese il commercialista chiede liquidazione IVA. Anziché 4 ore di export e classificazione, esporti XBRL liquidazione in 1 click. Il commercialista la riceve già pronta: chiusura IVA conclusa il 14, niente straordinari.",
    },
    {
      title: "Margine cantiere svelato a metà lavori",
      text: "Cantiere a 60% di avanzamento, vuoi sapere se stai perdendo soldi. Apri analisi margini: tutte le fatture passive automaticamente imputate al cantiere mostrano costo reale aggiornato. Margine 8% sotto preventivo: agisci subito.",
    },
  ],

  testimonialQuote:
    "Avevo una segreteria che passava 4 mattine a settimana sul portale Entratel a scaricare fatture passive. Ho attivato il Cassetto SDI: ora le fatture arrivano da sole, già categorizzate per cantiere, e il mio commercialista mi ha detto 'finalmente lavoro come si deve'. In 8 mesi ho recuperato circa 4.200€ di IVA che si perdeva.",
  testimonialAuthor: "Marco P.",
  testimonialRole: "Edilcostruzioni 2000 Srl, Brescia",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Devo dare le mie credenziali Entratel a Edilizia in Cloud?",
      a: "No. Usiamo la delega ufficiale del commercialista o l'accesso SPID/CIE che resta nelle tue mani. Le credenziali non vengono mai memorizzate in chiaro nel sistema, la connessione è cifrata end-to-end, log accessi conforme GDPR e tracciato.",
    },
    {
      q: "Funziona anche con il reverse charge edilizia art. 17 ter?",
      a: "Sì. Il sistema riconosce automaticamente le fatture in reverse charge edilizia (split payment, autofattura), le classifica nel registro corretto e genera il prospetto IVA dovuto/detraibile coerente con la normativa.",
    },
    {
      q: "Il commercialista può accedere direttamente al cassetto sincronizzato?",
      a: "Sì. Crei un accesso dedicato per il commercialista con permessi di sola consultazione/export. Lui vede tutte le fatture categorizzate, esporta la liquidazione IVA e le ritenute autonomamente. Niente più 'mi mandi la fattura X?'.",
    },
    {
      q: "Posso recuperare anche le fatture passive degli anni precedenti?",
      a: "Sì. In fase di setup importiamo l'archivio storico degli ultimi 5 anni dal cassetto AdE (limite massimo del portale ufficiale), categorizziamo per cantiere quando possibile e mettiamo tutto in conservazione decennale.",
    },
    {
      q: "Cosa succede se l'Agenzia delle Entrate è giù?",
      a: "Il sistema riprova automaticamente ogni 30 minuti finché il portale AdE torna disponibile. Le fatture già sincronizzate restano consultabili offline dal gestionale anche se il portale ufficiale è in manutenzione.",
    },
    {
      q: "Quanto costa? Ci sono limiti sul numero di fatture?",
      a: "Il modulo Cassetto SDI è incluso nei piani Professional e Business di Edilizia in Cloud. Numero di fatture passive illimitato, conservazione decennale inclusa, nessun costo extra per export commercialista.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il Cassetto SDI è il cuore fiscale di un sistema più ampio.",
  internalLinksBody:
    "Le fatture sincronizzate dal cassetto AdE alimentano automaticamente fatturazione, prima nota, scadenzario, ordini e analisi margini cantiere.",
  internalLinks: [
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Ciclo attivo SDI integrato con il cassetto fatture ricevute." },
    { to: "/funzionalita/conserva-digitale", title: "Conservazione Digitale", text: "Conservazione decennale a norma CAD per fatture sincronizzate." },
    { to: "/funzionalita/prima-nota", title: "Prima Nota", text: "Movimenti contabili generati dalle fatture passive del cassetto." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Scadenze fornitori popolate dalle fatture ricevute via SDI." },
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "Riconciliazione automatica ordini con fatture passive del cassetto." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costi reali imputati al cantiere dal cassetto fiscale." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Pagamenti fornitori da fatture passive sincronizzate dal cassetto." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Cassetto SDI incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di entrare nel portale Entratel ogni 2 giorni. Inizia a ricevere le fatture nel gestionale.",
  finalCtaBody:
    "31 giorni gratuiti per portare il Cassetto Fiscale SDI dentro la tua impresa edile. Setup in 48 ore, sincronizzazione 24/7, conservazione decennale e onboarding 1-a-1 con la nostra squadra fiscale incluso. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Sync continuo AdE · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Cassetto SDI",
  stickyCtaMicrocopy: "Setup 48h · Sync AdE 24/7",

  applicationSubCategory: "Construction Tax Drawer Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function CassettoSdi() {
  return <FunzionalitaPageTemplate config={config} />;
}
