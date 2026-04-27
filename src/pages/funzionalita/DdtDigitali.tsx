import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  Bell,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Database,
  FileSignature,
  FileText,
  HardHat,
  Layers,
  Link2,
  MapPin,
  Package,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "ddt-digitali",
  vertical: "DDT Digitali",
  productName: "Modulo DDT Digitali Edilizia in Cloud",
  audience:
    "Imprese edili, distributori di materiali edili, prefabbricati, calcestruzzo e magazzini di cantiere che devono emettere documenti di trasporto digitali, integrare con SDI, far firmare l'autista in mobilità e riconciliare in automatico DDT, ordini e fatture",
  audienceShort: "imprese edili e fornitori",

  seo: {
    title:
      "DDT Digitali — Documenti di Trasporto Elettronici, Firma Autista, Integrazione SDI | Edilizia in Cloud",
    description:
      "Documenti di trasporto digitali con firma autista in mobilità, integrazione fatturazione elettronica SDI, archivio cloud a norma e riconciliazione automatica con ordini e fatture. Setup in 48 ore.",
    keywords:
      "DDT digitali edilizia, documenti di trasporto elettronici, software DDT cantiere, firma autista DDT mobile, integrazione DDT SDI, archivio DDT cloud, gestione DDT calcestruzzo, DDT prefabbricati, riconciliazione DDT fatture, DDT digitali a norma",
    ogImage: "https://www.ediliziaincloud.com/og/ddt-digitali-og.jpg",
  },

  heroBadge: "Funzionalità · DDT Digitali",
  heroH1Lead: "DDT digitali con firma autista",
  heroH1Highlight: "in cantiere",
  heroH1Tail: "non più carta carbone",
  heroSubheadline:
    "Documenti di trasporto digitali emessi da gestionale, app autista per consegna in mobilità con firma cliente in cantiere, archivio cloud conforme alla normativa, integrazione fatturazione elettronica SDI e riconciliazione automatica DDT/ordini/fatture. La fine della carta carbone, della scansione e dei DDT smarriti.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import anagrafiche",
    "App autista iOS/Android con firma cliente",
    "Archivio cloud 10 anni a norma",
  ],
  proofPoints: [
    "Firma autista geolocalizzata in cantiere",
    "Riconciliazione automatica con SDI",
    "Archivio digitale conforme",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare carta carbone, scansione, DDT smarriti"],
    ["Momento chiave", "Consegna in cantiere e ricezione fattura via SDI"],
    ["Risultato", "Riconciliazione automatica, fatturazione veloce, contestazioni -90%"],
  ],

  betaH2: "Più di 210 imprese edili e fornitori italiani usano i DDT Digitali per consegne in cantiere.",
  betaBody:
    "Attiviamo i DDT Digitali in 48 ore: importiamo anagrafiche clienti/fornitori, configuriamo numeratori DDT, articoli e listini, app autista con firma cliente in cantiere, integrazione SDI per fatture differite, archivio cloud a norma. 4 sessioni 1-a-1 fino al primo DDT consegnato e firmato.",

  speedH2:
    "Un DDT compilato a mano costa 6-12 minuti. Moltiplicato per 50 DDT al mese, è una settimana lavorativa di amministrazione bruciata.",
  speedSubheadline:
    "I DDT cartacei richiedono compilazione a mano, scansione, archiviazione, riconciliazione manuale con ordini e fatture. Con i DDT digitali tutto avviene in tempo reale: il gestionale crea il DDT in 30 secondi, l'autista lo firma in cantiere, la fattura SDI parte già riconciliata. Il tempo amministrazione crolla del 75%.",
  speedStats: [
    { value: 6, suffix: " min", label: "tempo medio per DDT digitale" },
    { value: 75, prefix: "-", suffix: "%", label: "tempo amministrazione su DDT" },
    { value: 100, suffix: "%", label: "DDT archiviati a norma 10 anni" },
  ],

  familyH2: "DDT vivono collegati a ordini, fatture, magazzino e cantieri.",
  familySubheadline:
    "Un DDT non è un foglio isolato: nasce da un ordine, scarica il magazzino, alimenta una fattura SDI, costruisce il consuntivo cantiere. Edilizia in Cloud collega ogni DDT al suo flusso senza data entry duplicato.",
  familyItems: [
    {
      icon: Truck,
      title: "DDT Digitali",
      text: "DDT elettronici con firma autista mobile, archivio cloud, integrazione SDI.",
      to: "/funzionalita/ddt-digitali",
    },
    {
      icon: Package,
      title: "Ordini di Acquisto",
      text: "Ordini fornitore generano DDT in ingresso, riconciliazione automatica per articolo.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: Layers,
      title: "Magazzino Cantiere",
      text: "DDT di carico/scarico aggiornano giacenze magazzino e cantiere in tempo reale.",
      to: "/funzionalita/magazzino-cantiere",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture differite generate da DDT consegnati, codici TD24, riepilogo mensile.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "DDT di consegna in cantiere alimentano consuntivo materiali e marginalità.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Smartphone,
      title: "App Cantiere Mobile",
      text: "App autista per consegne con firma cliente, foto materiali, geolocalizzazione.",
      to: "/funzionalita/app-cantiere-mobile",
    },
  ],
  familyBonusTitle: "Una piattaforma. Dall'ordine fornitore alla fattura riconciliata.",
  familyBonusText:
    "Quando un capocantiere ordina materiale, l'ordine va al fornitore. Quando il fornitore consegna, il DDT entra in magazzino. Quando si emette la fattura differita di fine mese, gli articoli sono già riconciliati. Quando passa lo SDI, il flusso è chiuso. Zero passaggi manuali tra documenti.",

  painKicker: "Il problema vero",
  painH2:
    "DDT cartaceo, scansione, email, riconciliazione a mano. È così che si perde il 5% dei DDT e nascono le contestazioni.",
  painSubheadline:
    "Il DDT cartaceo è un fossile burocratico: si scrive a mano in cantiere, si stampa in copia carbone, si scansiona in ufficio, si archivia in faldoni che nessuno trova. Quando arriva la fattura, la riconciliazione costa ore. Quando il cliente contesta, il DDT è introvabile.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "DDT smarriti = fatture contestate",
      text: "Su 100 DDT cartacei, 5-7 si perdono tra cantiere, autista, ufficio, archivio. Quando arriva la contestazione fattura, non hai prova di consegna. Cliente non paga, recupero crediti caotico, rapporto commerciale incrinato.",
    },
    {
      icon: Timer,
      title: "Scansione DDT = ore amministrazione bruciate",
      text: "Segretaria riceve faldone DDT, scansiona uno per uno, archivia su Drive, allega a email/email per fattura. 6-12 minuti per DDT, moltiplicato per 200 DDT/mese: 30-40 ore di lavoro sterile.",
    },
    {
      icon: FileText,
      title: "Riconciliazione DDT/ordini/fatture a mano",
      text: "A fine mese commercialista chiede riconciliazione: 'Questa fattura riguarda quali DDT? Sono tutti stati consegnati?'. Stampi DDT cartacei, controlli a mano, segni con matita. Errori inevitabili, ricontrolli infiniti.",
    },
    {
      icon: ArrowRightLeft,
      title: "Conservazione 10 anni a norma quasi impossibile",
      text: "Normativa fiscale chiede conservazione DDT 10 anni in formato leggibile. Faldoni cartacei in cantina, scansioni su server che si rompe, backup mai fatti. Quando arriva l'Agenzia Entrate per controllo, panico totale.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi materiali, stesse consegne, stesso cliente. Cambia il tempo amministrativo e la tracciabilità.",
  baSubheadline:
    "I DDT Digitali non cambiano il lavoro del cantiere: trasformano il flusso burocratico che oggi divora 30-40 ore al mese di amministrazione. La consegna è digitale, la firma è geolocalizzata, l'archivio è cloud a norma.",
  baAreas: [
    {
      title: "Emissione DDT",
      before:
        "Segretaria compila DDT cartaceo, lo stampa in 3 copie carbone, lo dà all'autista, l'autista lo trasporta. Tempo emissione: 8-12 minuti per DDT. Errori frequenti su articoli, quantità, indirizzo.",
      after:
        "Sistema genera DDT digitale in 30 secondi a partire da ordine o cantiere. PDF inviato all'autista sull'app. Articoli, quantità, indirizzo precaricati senza errori.",
    },
    {
      title: "Consegna in cantiere",
      before:
        "Autista arriva in cantiere, fa firmare cliente su carta carbone, riporta in ufficio i fogli, segretaria archivia in faldone. Spesso firma illeggibile o data sbagliata.",
      after:
        "Autista apre DDT su app, mostra al cliente, fa firmare elettronicamente sul telefono. Firma geolocalizzata, datata, foto materiali allegata. PDF firmato inviato a cliente in tempo reale.",
    },
    {
      title: "Riconciliazione DDT-fattura",
      before:
        "Fine mese: commercialista chiede 'fattura X riguarda quali DDT?'. Stampi DDT cartacei, segni a mano, errori, fatture rispedite. 4-8 ore di riconciliazione mensile.",
      after:
        "Fattura SDI generata automatica dai DDT consegnati nel periodo. Riepilogo riga per riga con riferimento DDT. Riconciliazione istantanea, zero errori.",
    },
    {
      title: "Conservazione decennale",
      before:
        "Faldoni cartacei in cantina o scansioni disordinate su server. Quando l'Agenzia Entrate chiede DDT 2018, ricerca di giorni interi. Rischio sanzione per documenti illeggibili o mancanti.",
      after:
        "Tutti i DDT firmati archiviati su cloud certificato AgID, conservazione sostitutiva 10 anni inclusa, ricerca per cliente/data/articolo in 3 secondi. Audit-ready sempre.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dall'ordine al DDT firmato e archiviato.",
  mechanismSubheadline:
    "I DDT Digitali sono progettati per imprese che emettono 50-2.000 DDT al mese: emissione automatica, firma autista mobile, conservazione cloud a norma. Tutto integrato senza sviluppi custom.",
  mechanismSteps: [
    {
      icon: ClipboardList,
      title: "Sistema genera DDT da ordine o cantiere",
      text: "Da un ordine fornitore o richiesta cantiere, il sistema genera DDT digitale in 30 secondi: articoli, quantità, indirizzo, autista assegnato. PDF caricato su app autista.",
    },
    {
      icon: Smartphone,
      title: "Autista consegna e fa firmare in cantiere",
      text: "Autista apre app in cantiere, mostra DDT al ricevente, firma elettronica eIDAS sul telefono, geolocalizzazione GPS, foto materiali. Cliente riceve PDF firmato via email/SMS.",
    },
    {
      icon: Archive,
      title: "Archivio cloud + integrazione SDI",
      text: "DDT firmato archiviato su cloud certificato, conservazione sostitutiva 10 anni a norma. Fatturazione differita SDI alla fine del mese genera automaticamente la fattura riepilogativa.",
    },
  ],
  mechanismCta: "Apri la dashboard DDT Digitali",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Tempo amministrazione -75%, contestazioni -90%, conservazione a norma garantita.",
  commercialBody:
    "Le imprese che hanno adottato i DDT Digitali registrano una riduzione del 75% del tempo amministrazione su DDT, un calo del 90% delle contestazioni cliente per DDT smarriti e una conservazione decennale automaticamente conforme. Il ROI si vede già nel secondo mese.",
  commercialLevers: [
    {
      icon: Timer,
      title: "Tempo amministrazione -75%",
      text: "Da 6-12 minuti per DDT cartaceo a 1-2 minuti per DDT digitale. Su 200 DDT/mese, recuperi 30-40 ore di lavoro amministrativo, equivalente a un quarto FTE liberato per attività a valore.",
    },
    {
      icon: ShieldCheck,
      title: "Contestazioni cliente -90%",
      text: "Firma elettronica geolocalizzata, datata, con foto materiali. Quando il cliente contesta 'non l'ho ricevuto', mostri il DDT firmato dal suo capocantiere alle 14:32 con foto del materiale scaricato. Discussione chiusa.",
    },
    {
      icon: Receipt,
      title: "Fatturazione differita più veloce",
      text: "A fine mese il sistema genera automatico la fattura SDI riepilogativa dai DDT consegnati. Codici TD24 corretti, riepilogo riga per riga, niente compilazione manuale. Cassa più veloce.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come fornitore moderno",
      text: "Cliente edile percepisce subito 'questo fornitore è strutturato'. Riceve DDT digitale firmato in tempo reale via email, niente caos di carta. Posizionamento commerciale superiore, ticket medio +5-8%.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "DDT firmato in cantiere, archivio a norma, fattura SDI senza errori.",
  resultsBody:
    "Quando ogni consegna lascia un DDT digitale firmato, geolocalizzato, archiviato cloud, l'amministrazione torna ad essere strategica e non documentale. Le contestazioni cliente crollano, la fatturazione differita parte al millisecondo, la conservazione decennale è garantita per legge.",
  integrationPillars: [
    {
      icon: Smartphone,
      title: "App autista offline-first",
      text: "Autista consegna anche in cantiere senza segnale: app salva DDT firmato in locale, sync automatica al rientro online. Zero consegne perse per problemi connettività.",
    },
    {
      icon: Link2,
      title: "Integrazione SDI fattura differita",
      text: "Codici TD24 corretti, riepilogo articoli da DDT, codici natura IVA. Fattura SDI generata automatica a fine mese dai DDT consegnati, niente compilazione manuale.",
    },
    {
      icon: Cloud,
      title: "Archivio cloud certificato AgID",
      text: "Conservazione sostitutiva 10 anni a norma, certificato AgID, ricerca per cliente/data/articolo. Pronto per controllo Agenzia Entrate in qualsiasi momento.",
    },
    {
      icon: Database,
      title: "Riconciliazione automatica ordini",
      text: "DDT in ingresso da fornitore riconciliato per articolo con ordine emesso. Discrepanze evidenziate (quantità mancante, articolo errato, prezzo difforme). Pagamento fornitore solo su DDT validati.",
    },
  ],
  resultStats: [
    { value: 75, prefix: "-", suffix: "%", label: "tempo amministrazione DDT" },
    { value: 90, prefix: "-", suffix: "%", label: "contestazioni cliente per DDT" },
    { value: 100, suffix: "%", label: "DDT a norma decennale conservazione" },
  ],
  resultsCta: "Apri la dashboard DDT Digitali",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale recuperare 6 minuti per ogni DDT × tutti i DDT che emetti?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero DDT al mese e costo orario amministrazione. La stima parte da 6 minuti risparmiati per DDT (compilazione, scansione, archivio, riconciliazione).",
  roi: {
    input1Label: "DDT/mese emessi",
    input1Default: 200,
    input1Min: 20,
    input1Max: 1000,
    input1Step: 10,
    input2Label: "Costo orario amministrazione (€)",
    input2Default: 28,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.1 * b),
    computeSecondary: (a, b) => [
      { label: "DDT/anno gestiti", value: `${a * 12}` },
      { label: "Ore amministrazione recuperate/anno", value: `${Math.round(a * 12 * 0.1)} h` },
      { label: "Riduzione contestazioni cliente", value: "-90%" },
    ],
    closingPitch:
      "Stima conservativa basata su 6 minuti risparmiati per DDT. Aggiungi le contestazioni evitate (-90%) e la fatturazione differita più veloce: il ROI reale è triplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un tool isolato. Un flusso continuo dall'ordine alla fattura SDI.",
  salesBody:
    "I DDT Digitali sono il tassello mancante tra ordini e fatture. Le 4 dimensioni operative che cambiano dal primo mese.",
  salesImpact: [
    {
      title: "Autisti in cantiere, non in ufficio",
      text: "Autisti partono al mattino con DDT già caricati su app, consegnano, fanno firmare, ripartono. Niente più ritorno in ufficio per consegnare carta. +1-2 consegne/giorno.",
    },
    {
      title: "Amministrazione torna strategica",
      text: "30-40 ore/mese di scansione e archiviazione si trasformano in tempo per recupero crediti, analisi marginalità, gestione contratti. Stesso team, lavoro più importante.",
    },
    {
      title: "Recupero crediti più veloce",
      text: "Quando il cliente non paga 'perché manca DDT', mandi PDF firmato in 30 secondi. La discussione chiude e la fattura va a pagamento. Tempo medio recupero -40%.",
    },
    {
      title: "Audit fiscale senza panico",
      text: "Agenzia Entrate chiede DDT del 2018? Apri la piattaforma, filtri per data, esporti tutto in PDF. Zero faldoni, zero panico, zero rischi sanzione per documenti mancanti.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi consegna materiali, non slogan da brochure.",
  featureRows: [
    {
      label: "Emissione DDT da gestionale o app",
      value:
        "Genera DDT in 30 secondi da ordine fornitore, richiesta cantiere o creazione manuale. Articoli e listini precaricati, numerazione automatica, indirizzi consegna multipli per cliente.",
    },
    {
      label: "App autista iOS/Android offline",
      value:
        "Calendario consegne, indirizzi GPS, navigazione integrata, DDT precaricati. Funziona senza connessione: firma cliente salvata in locale, sync automatica al rientro online.",
    },
    {
      label: "Firma cliente eIDAS geolocalizzata",
      value:
        "Cliente firma elettronicamente sul telefono dell'autista. Firma con marca temporale, GPS punto consegna, foto materiali allegata. Validità legale eIDAS, prova robusta in caso di contestazione.",
    },
    {
      label: "Integrazione SDI fattura differita",
      value:
        "Fine mese: sistema genera fattura SDI riepilogativa da tutti i DDT consegnati. Codice TD24 corretto, riepilogo riga per riga con riferimento DDT, codici IVA precaricati.",
    },
    {
      label: "Archivio cloud certificato AgID",
      value:
        "Conservazione sostitutiva 10 anni a norma DM 17/06/2014, certificato AgID. Ricerca per cliente/data/articolo/cantiere in 3 secondi. Audit-ready sempre.",
    },
    {
      label: "Riconciliazione DDT-ordini-fatture",
      value:
        "DDT in ingresso da fornitore riconciliato per articolo con ordine emesso. Discrepanze evidenziate (quantità, prezzo, articolo). Pagamento fornitore bloccato fino a validazione.",
    },
    {
      label: "Reportistica consegne real-time",
      value:
        "Dashboard live: DDT in transito, consegnati oggi, firmati, in ritardo. Filtro per autista, cliente, cantiere. Insight per ottimizzare logistica e tempi consegna.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui i DDT Digitali cambiano la giornata.",
  scenarios: [
    {
      title: "Cliente contesta consegna materiali",
      text:
        "Cliente dice 'non ho mai ricevuto questi 80 sacchi di cemento'. Apri DDT digitale: firma del suo capocantiere il 14 marzo alle 9:42, GPS sul cantiere, foto del bancale scaricato. Contestazione chiusa in 2 minuti, fattura va a pagamento.",
    },
    {
      title: "Fattura differita di fine mese",
      text:
        "30 marzo, 280 DDT consegnati nel mese a 24 clienti. Sistema genera 24 fatture SDI riepilogative con codice TD24 in 5 minuti, riepilogo articoli per DDT, invio SDI automatico. Tempo precedente: 3 giorni.",
    },
    {
      title: "Audit Agenzia Entrate su DDT 2019",
      text:
        "Funzionario chiede DDT cliente X dell'anno 2019. Apri filtro su piattaforma, esporti in PDF tutti e 47 i DDT firmati con prove di consegna geolocalizzate. Audit chiuso senza rilievi in mezza giornata.",
    },
  ],

  testimonialQuote:
    "Distribuiamo materiali edili a 180 cantieri attivi. Prima avevamo una segretaria full-time solo per scansionare DDT cartacei e cercare quelli persi. Con i DDT Digitali ha tempo per recupero crediti vero: incassi +12% in 6 mesi. E le contestazioni 'non ho ricevuto' sono praticamente sparite, perché ogni DDT ha firma geolocalizzata in cantiere.",
  testimonialAuthor: "Roberta C.",
  testimonialRole: "Edilforniture Centro Srl, Roma",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa che emette DDT vuole sapere prima di decidere.",
  faqs: [
    {
      q: "I DDT digitali sono validi legalmente come quelli cartacei?",
      a: "Sì. Il DPR 472/1996 ammette la forma elettronica del DDT con identico valore probatorio. La firma cliente in cantiere via app è elettronica avanzata eIDAS, equivalente a firma autografa. La conservazione cloud certificata AgID rispetta il DM 17/06/2014.",
    },
    {
      q: "L'app autista funziona senza connessione in cantieri isolati?",
      a: "Sì. L'app è offline-first: autista parte al mattino con DDT precaricati, consegna, fa firmare cliente e archivia tutto in locale anche senza segnale. Sync automatica e silente al rientro online. Testato in cantieri rurali, gallerie, zone industriali isolate.",
    },
    {
      q: "Si integra con la mia fatturazione elettronica SDI esistente?",
      a: "Sì. Il modulo nativo Edilizia in Cloud genera fattura differita SDI con codice TD24 dai DDT consegnati. Se hai un altro gestionale fiscale, esportiamo i DDT in formato XML/CSV per import automatico nel tuo sistema. Compatibilità con i principali gestionali fiscali italiani.",
    },
    {
      q: "Posso consegnare a clienti che non hanno smartphone?",
      a: "Sì. Tre opzioni: 1) cliente firma su tablet dell'autista; 2) autista stampa DDT in cantiere con stampante mobile bluetooth e fa firmare su carta (foto firma allegata digitale); 3) firma del solo autista con prova di consegna GPS+foto materiali. Tutte legalmente robuste.",
    },
    {
      q: "Quanto è veloce la riconciliazione DDT/fattura/ordine?",
      a: "Riconciliazione automatica per articolo: il sistema confronta quantità ordinata, consegnata e fatturata. Discrepanze evidenziate in dashboard. A fine mese fattura SDI riepilogativa generata in 5 minuti dai DDT del periodo. Tempo precedente con scansione manuale: 2-3 giorni.",
    },
    {
      q: "Quanto costa il modulo? Ci sono costi extra per DDT emessi?",
      a: "Il modulo DDT Digitali è incluso nei piani Professional e Business. Numero di DDT illimitato, app autista illimitata, conservazione cloud 10 anni inclusa. Nessun costo per DDT emesso, nessun vincolo pluriennale. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "I DDT vivono collegati a tutta la piattaforma.",
  internalLinksBody:
    "Il modulo DDT Digitali è alimentato da Ordini, Magazzino, Fatturazione SDI e App Mobile. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/ordini-acquisto",
      title: "Ordini di Acquisto",
      text: "Ordini fornitore generano DDT in ingresso, riconciliazione automatica.",
    },
    {
      to: "/funzionalita/magazzino-cantiere",
      title: "Magazzino Cantiere",
      text: "DDT di carico/scarico aggiornano giacenze in tempo reale.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Fattura differita SDI generata automatica dai DDT consegnati.",
    },
    {
      to: "/funzionalita/app-cantiere-mobile",
      title: "App Cantiere Mobile",
      text: "App autista per consegne con firma cliente in mobilità.",
    },
    {
      to: "/funzionalita/firma-elettronica",
      title: "Firma Elettronica",
      text: "Firma cliente eIDAS geolocalizzata con marca temporale.",
    },
    {
      to: "/funzionalita/conserva-digitale",
      title: "Conservazione Digitale",
      text: "Conservazione sostitutiva DDT 10 anni a norma AgID.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "DDT consegnati alimentano consuntivo materiali e marginalità cantiere.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e fornitori materiali.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Modulo DDT Digitali incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di scansionare DDT cartacei. Inizia a far firmare in cantiere con il telefono.",
  finalCtaBody:
    "31 giorni gratuiti per portare i DDT Digitali dentro la tua impresa: setup in 48 ore, app autista iOS/Android, firma cliente eIDAS geolocalizzata, integrazione SDI fattura differita, conservazione cloud 10 anni inclusa. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · App autista inclusa · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis DDT Digitali",
  stickyCtaMicrocopy: "Setup 48h · App autista inclusa",

  applicationSubCategory: "Construction Delivery Note Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function DdtDigitali() {
  return <FunzionalitaPageTemplate config={config} />;
}
