import {
  Archive,
  Award,
  Building2,
  ClipboardList,
  Clock,
  Edit3,
  FileSignature,
  FileText,
  Globe,
  HardHat,
  Lock,
  PenTool,
  Receipt,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Stamp,
  TrendingUp,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "firma-elettronica",
  definizione:
    "La Firma Elettronica di Edilizia in Cloud è una firma elettronica avanzata conforme al regolamento eIDAS integrata in tutto il gestionale: il cliente firma preventivi, SAL, varianti, contratti e autorizzazioni dal browser del telefono in trenta secondi, con marca temporale e prova d'identità.",
  vertical: "Firma Elettronica",
  productName: "Firma Elettronica Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor che firmano ogni giorno preventivi, SAL, varianti, contratti, DURC, autorizzazioni e vogliono eliminare carta, scansioni e ritardi di firma a penna",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Firma Elettronica per Edilizia",
    description:
      "Firma elettronica avanzata eIDAS per imprese edili: preventivi, SAL, varianti, contratti, DURC firmati online in 30 secondi dal cliente.",
    keywords:
      "firma elettronica edilizia, firma digitale impresa edile, firma SAL online, firma contratti edili, firma elettronica avanzata eIDAS, marca temporale edilizia, firma preventivi cliente, firma varianti cantiere, archivio firme cloud edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Firma Elettronica",
  heroH1Lead: "Preventivi, SAL e contratti firmati",
  heroH1Highlight: "in 30 secondi",
  heroH1Tail: "dal telefono del cliente",
  heroSubheadline:
    "Firma elettronica avanzata conforme eIDAS integrata in tutto il software. Il cliente firma preventivi, SAL, varianti, contratti, DURC e autorizzazioni dal browser del telefono in 30 secondi. Marca temporale, archivio cloud immutabile, validità legale equivalente alla firma autografa. Niente più stampe, scansioni, raccomandate.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: ["Setup in 48 ore", "Conforme eIDAS", "Marca temporale inclusa"],
  proofPoints: [
    "Firma cliente in 30 secondi",
    "Validità legale equivalente firma autografa",
    "Archivio cloud immutabile + marca temporale",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare carta e ritardi di firma su tutti i documenti"],
    ["Momento chiave", "Quando devi far firmare preventivi, SAL, varianti, contratti"],
    ["Risultato", "Documenti firmati in giornata, archivio digitale a prova di contestazione"],
  ],

  betaH2:
    "Più di 380 imprese italiane usano la Firma Elettronica integrata per chiudere preventivi e SAL in giornata.",
  betaBody:
    "La Firma Elettronica è integrata in ogni modulo: preventivi, SAL, contratti, varianti, ordini fornitori, DURC. La attiviamo in 48 ore, configuriamo i template legali della tua azienda, integriamo la marca temporale e ti accompagniamo in 3 sessioni 1-a-1 finché il primo cliente firma online.",

  speedH2: "Stampante, scansione, mail, raccomandata: il SAL impiega 5 giorni. Online: 30 secondi.",
  speedSubheadline:
    "L'impresa edile media perde 2-5 giorni tra invio del documento, attesa firma, ritorno scansione, archiviazione. Con la firma elettronica il processo è istantaneo: pubblichi → cliente firma da telefono → notifica push a te → archiviato con marca temporale. Tre giorni diventano tre minuti.",
  speedStats: [
    { value: 96, prefix: "-", suffix: "%", label: "tempo medio per chiudere una firma cliente" },
    { value: 100, suffix: "%", label: "documenti archiviati con marca temporale eIDAS" },
    { value: 30, suffix: "s", label: "tempo medio firma cliente da smartphone" },
  ],

  familyH2: "Tutta la piattaforma Edilizia in Cloud firma documenti senza data entry.",
  familySubheadline:
    "La firma elettronica non è un modulo isolato: è un'azione integrata dentro ogni documento generato dalla piattaforma. Preventivo pronto → un click → cliente firma. SAL completato → un click → cliente firma. Niente upload manuali, niente scansioni, niente carta.",
  familyItems: [
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Firma eIDAS avanzata su preventivi, SAL, varianti, contratti, DURC, ordini fornitori.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Preventivi firmabili online direttamente dal cliente, accettazione tracciata.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "SAL e varianti pubblicati al cliente con firma elettronica integrata.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Globe,
      title: "Portale Clienti",
      text: "Cliente firma documenti dal portale brandizzato della tua impresa.",
      to: "/funzionalita/portale-clienti",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Contratti e fatture proforma firmati online prima dell'emissione SDI.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Building2,
      title: "Gestione Subappalti",
      text: "Contratti subappalto e ritenute 4% INPS firmati elettronicamente con il subappaltatore.",
      to: "/funzionalita/gestione-subappalti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Una sola firma. Tutto archiviato a norma di legge.",
  familyBonusText:
    "Quando emetti un preventivo, il cliente lo firma online dal portale. Quando il SAL è pronto, il cliente firma dal telefono. Quando il subappaltatore deve accettare, firma dal suo dispositivo. Ogni firma viene timestampata, archiviata in cloud immutabile, esportabile in PDF/A per compliance.",

  painKicker: "Il problema vero",
  painH2:
    "Il cliente firma il SAL? Forse domani. Forse lunedì. Forse passa di persona. Intanto i fornitori aspettano.",
  painSubheadline:
    "Senza firma elettronica, ogni documento è una catena di passaggi fisici: stampa, consegna, attesa, ritiro, scansione, archiviazione. Ogni anello si rompe con ritardi e dimenticanze. La firma a penna è il collo di bottiglia silenzioso che frena la cassa, i pagamenti fornitori e la chiusura dei cantieri.",
  painPoints: [
    {
      icon: Clock,
      title: "Firme in ritardo bloccano la cassa",
      text: "Il SAL pronto ma non firmato significa fattura non emessa. La fattura non emessa significa cliente che non paga. Il cliente che non paga significa fornitori in ritardo. Tutto si ferma per una firma a penna che non arriva.",
    },
    {
      icon: FileText,
      title: "Documenti che si perdono nella catena di scansioni",
      text: "Stampi un contratto in 6 pagine, lo consegni, il cliente firma, ritiri, scansioni, archivi. Una pagina manca alla scansione. Sei mesi dopo, contestazione: 'non l'avevo firmato'. Tu non trovi il fisico originale.",
    },
    {
      icon: Scale,
      title: "Contestazioni legali senza prova della firma",
      text: "Il cliente dice 'la variante non l'avevo approvata'. La firma a penna scansionata ha valore probatorio limitato, contestabile. Sentenza: 30% sconto al cliente perché non si può dimostrare l'accettazione formale.",
    },
    {
      icon: Edit3,
      title: "Perdita di tempo del titolare per inseguire firme",
      text: "Telefonate, WhatsApp, mail: 'mi firmi il SAL?', 'sei passato dall'ufficio?'. Il titolare diventa un esattore di firme. 5-10 ore a settimana solo per chiudere documenti.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi documenti, stessa azienda, stesso valore legale. Cambia il tempo e la prova.",
  baSubheadline:
    "La firma elettronica avanzata eIDAS ha lo stesso valore legale della firma autografa, con un vantaggio probatorio superiore: marca temporale, log accessi, integrità del file garantita. In più: zero attesa.",
  baAreas: [
    {
      title: "Firma di un preventivo",
      before:
        "Stampi 8 pagine, consegni, cliente legge, firma, ritiri, scansioni, archivi. 3-7 giorni. Cliente che ci ripensa nel frattempo, lavoro perso.",
      after:
        "Pubblichi il preventivo dal software, cliente riceve link via email/SMS, firma dal telefono in 30 secondi. Tu ricevi notifica push, archivio automatico con marca temporale.",
    },
    {
      title: "Firma di un SAL e fattura collegata",
      before:
        "SAL pronto venerdì, cliente disponibile martedì. Tu fatturi giovedì. Pagamento a 60 giorni dal SAL: lunedì 15 del mese dopo. Cassa in ritardo di 12 giorni rispetto al possibile.",
      after:
        "SAL pubblicato venerdì alle 17, cliente firma alle 21:30 dal divano. Fatturi sabato mattina, pagamento a 60 gg parte da venerdì. Cassa accelerata di 7-12 giorni per ogni SAL.",
    },
    {
      title: "Firma di una variante in cantiere",
      before:
        "Variante necessaria mercoledì in cantiere. Devi tornare in ufficio, stampare, riportarla in cantiere giovedì, far firmare, scansionare. Lavori bloccati 24-48 ore.",
      after:
        "Apri il software dal tablet in cantiere, generi la variante, cliente la firma sul telefono lì sul posto in 1 minuto. Lavori ripartono subito, niente blocchi, niente trasferte.",
    },
    {
      title: "Difesa in caso di contestazione",
      before:
        "Cliente contesta 'non avevo approvato'. Cerchi la scansione, la trovi sfocata. Avvocato dice 'firma scansionata ha valore limitato'. Negozi sconto del 20-30%.",
      after:
        "Esporti dal software il dossier completo: documento originale, firma elettronica avanzata eIDAS, marca temporale, log IP/dispositivo del firmatario. Validità legale piena, giudice accetta in 5 minuti.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. Niente token USB, niente CIE, niente SPID obbligatorio per il cliente.",
  mechanismSubheadline:
    "La firma elettronica avanzata Edilizia in Cloud è progettata per il cliente medio dell'edilizia: niente strumenti speciali, basta un telefono. Per i contratti che richiedono firma qualificata supportiamo SPID/CIE come opzione aggiuntiva.",
  mechanismSteps: [
    {
      icon: Send,
      title: "Pubblichi il documento dal software",
      text: "Un click su 'Invia per firma'. Il documento viene generato in PDF/A, allegato a un link sicuro, inviato al cliente via email + SMS. Notifica anche al portale cliente se attivo.",
    },
    {
      icon: PenTool,
      title: "Cliente firma dal telefono in 30 secondi",
      text: "Cliente apre il link, vede il documento, scorre, conferma identità con OTP via SMS, firma con tracciamento del dispositivo (IP, data, ora, geolocalizzazione opzionale). Firma elettronica avanzata eIDAS valida.",
    },
    {
      icon: Stamp,
      title: "Marca temporale + archivio cloud immutabile",
      text: "Documento firmato riceve marca temporale qualificata, viene archiviato in cloud immutabile (write-once), notifica push al titolare. Esportabile in PDF/A con tutto il dossier probatorio.",
    },
  ],
  mechanismCta: "Prova un flusso di firma",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Firma in 30 secondi = chiusura più rapida = cassa più veloce.",
  commercialBody:
    "La firma elettronica non è solo un tema legale: è uno strumento di accelerazione commerciale. Le imprese che la usano in modo strutturato chiudono i preventivi 35% più velocemente, riducono il tempo di incasso medio di 7-12 giorni e dimezzano le contestazioni post-contratto.",
  commercialLevers: [
    {
      icon: Zap,
      title: "Chiusura preventivi 35% più rapida",
      text: "Cliente firma il preventivo subito mentre è ancora 'caldo', non aspetta la stampa o la riunione. Tasso di conversione preventivi più alto e meno tempo di trattativa.",
    },
    {
      icon: TrendingUp,
      title: "Cassa accelerata di 7-12 giorni per SAL",
      text: "SAL firmato in 30 secondi → fattura emessa subito → pagamento a 60 giorni parte 7-12 giorni prima. Effetto cumulato significativo sulla liquidità annua.",
    },
    {
      icon: ShieldCheck,
      title: "Contestazioni dimezzate, prova probatoria piena",
      text: "Marca temporale, log IP, hash documento immutabile. In caso di causa, dossier probatorio completo esportabile in 30 secondi. Avvocato vince causa in udienza preliminare.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come impresa moderna",
      text: "Cliente percepisce subito 'questa è un'impresa strutturata'. Posizionamento commerciale superiore, sconti chiesti meno, ticket medio più alto.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente carta. Niente attesa. Niente contestazioni.",
  resultsBody:
    "La firma elettronica avanzata trasforma documenti che richiedevano giorni in operazioni di pochi secondi, con prova probatoria superiore alla firma autografa scansionata. È il singolo cambiamento operativo con il ROI più rapido in qualsiasi software gestionale.",
  integrationPillars: [
    {
      icon: Award,
      title: "Conformità eIDAS Regolamento UE 910/2014",
      text: "Firma elettronica avanzata conforme allo standard europeo, validità legale equivalente alla firma autografa in tutta UE, accettata da tribunali italiani e stranieri.",
    },
    {
      icon: Stamp,
      title: "Marca temporale qualificata inclusa",
      text: "Ogni documento firmato riceve marca temporale qualificata da Certification Authority accreditata AgID. Prova legale di 'data certa' opponibile a terzi.",
    },
    {
      icon: Archive,
      title: "Archivio cloud immutabile write-once",
      text: "Documenti firmati archiviati in cloud immutabile (write-once-read-many): nessuno può modificarli o cancellarli. Conservazione decennale conforme al CAD italiano.",
    },
    {
      icon: Lock,
      title: "Hash documento + log accessi",
      text: "Ogni documento ha hash crittografico SHA-256 che certifica integrità. Log completo di chi ha aperto, firmato, scaricato. Dossier probatorio esportabile.",
    },
  ],
  resultStats: [
    { value: 96, prefix: "-", suffix: "%", label: "tempo medio per chiudere una firma cliente" },
    { value: 35, prefix: "+", suffix: "%", label: "velocità di chiusura preventivi firmati" },
    { value: 50, prefix: "-", suffix: "%", label: "contestazioni post-contratto sui SAL" },
  ],
  resultsCta: "Apri la console firma elettronica",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto incassi prima se i SAL si firmano in 30 secondi invece che in 5 giorni?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di SAL/preventivi al mese e ticket medio. La stima parte dall'accelerazione cassa di 7-12 giorni per SAL osservata nei nostri clienti.",
  roi: {
    input1Label: "Documenti firmati al mese (SAL, preventivi, contratti)",
    input1Default: 25,
    input1Min: 5,
    input1Max: 300,
    input1Step: 1,
    input2Label: "Ticket medio per documento (€)",
    input2Default: 18000,
    input2Min: 2000,
    input2Max: 200000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Cassa accelerata annua stimata",
    computeOutput: (a, b) => Math.round(a * 12 * b * 0.025),
    computeSecondary: (a, b) => [
      { label: "Documenti firmati/anno", value: `${a * 12}` },
      { label: "Giorni cassa risparmiati/anno", value: `${Math.round(a * 12 * 0.8)} gg` },
      { label: "Ore di follow-up firme risparmiate/anno", value: `${Math.round(a * 12 * 0.3)} h` },
    ],
    closingPitch:
      "Stima prudenziale basata su 9 giorni medi di accelerazione cassa per SAL e 0.25% costo finanziario annuo. A questo si aggiungono ore di follow-up risparmiate dal titolare.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un plugin di firma. Un acceleratore di chiusure e di cassa.",
  salesBody:
    "La firma elettronica integrata cambia 4 dimensioni operative dell'impresa edile, ognuna con un impatto economico diretto sul cash flow.",
  salesImpact: [
    {
      title: "Preventivi chiusi mentre il cliente è caldo",
      text: "Cliente firma il preventivo subito dopo la presentazione, non 'ci penso e ti faccio sapere'. Conversione preventivi più alta, meno trattative perse.",
    },
    {
      title: "SAL firmati lo stesso giorno della consegna",
      text: "Capocantiere chiude il SAL alle 17, cliente firma alle 19, fattura emessa il giorno dopo. Cassa che entra 7-12 giorni prima per ogni SAL.",
    },
    {
      title: "Varianti firmate in cantiere senza tornare in ufficio",
      text: "Variante necessaria? Generi sul tablet, cliente firma sul posto in 1 minuto, lavori riprendono subito. Niente trasferte, niente cantieri fermi.",
    },
    {
      title: "Dossier legale completo per ogni documento",
      text: "Marca temporale, log accessi, hash crittografico, identità verificata. In caso di causa, esporti tutto in 30 secondi. Avvocato vince in udienza preliminare.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Una firma elettronica che lavora dentro al gestionale, non a fianco.",
  featureRows: [
    {
      label: "Firma elettronica avanzata eIDAS",
      value:
        "Conforme al Regolamento UE 910/2014. Validità legale equivalente alla firma autografa, opponibile a terzi, accettata in tribunale.",
    },
    {
      label: "Marca temporale qualificata inclusa",
      value:
        "Marca temporale da Certification Authority accreditata AgID, prova di 'data certa' opponibile a terzi, conforme al CAD.",
    },
    {
      label: "Firma da telefono senza app",
      value:
        "Cliente firma dal browser del telefono in 30 secondi, OTP via SMS, niente app da scaricare, niente token USB, niente formazione.",
    },
    {
      label: "Integrazione completa con preventivi, SAL, contratti",
      value:
        "Un click 'Invia per firma' direttamente dal documento generato. Niente upload manuali, niente conversioni, archiviazione automatica con la marca temporale.",
    },
    {
      label: "Archivio cloud immutabile write-once",
      value:
        "Documenti firmati archiviati in cloud immutabile, nessuno può modificarli, conservazione decennale conforme CAD italiano.",
    },
    {
      label: "Notifiche multi-canale + remind automatici",
      value:
        "Email + SMS al cliente, remind automatici a 24/48/72 ore se non ha firmato, notifica push al titolare quando il cliente firma.",
    },
    {
      label: "Supporto SPID e CIE per firme qualificate",
      value:
        "Per contratti che richiedono firma qualificata, supportiamo SPID e CIE come opzione aggiuntiva. Configurabile per tipo documento.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Firma Elettronica salva la giornata.",
  scenarios: [
    {
      title: "SAL del venerdì pomeriggio prima del weekend",
      text: "Venerdì alle 16:30 il SAL è pronto, ma se non firma oggi devi aspettare lunedì per fatturare. Pubblichi il SAL alle 16:35, cliente firma alle 17:10 dal telefono mentre torna a casa, fatturi alle 17:15. Pagamento a 60 giorni parte da venerdì, non da lunedì.",
    },
    {
      title: "Variante decisa in cantiere durante un sopralluogo",
      text: "Sopralluogo con il cliente, scopri che serve una variante da 8.500€. Generi la variante dal tablet sul posto, cliente firma con il suo telefono in 1 minuto, lavori riprendono il giorno dopo. Niente tornare in ufficio, niente blocchi, niente discussioni successive.",
    },
    {
      title: "Contestazione di un cliente 6 mesi dopo la consegna",
      text: "Cliente afferma 'la variante luce extra non l'avevo approvata, non la pago'. Apri il sistema, esporti il dossier: variante firmata il 12 marzo alle 14:23, IP del firmatario, OTP confermato dal telefono del cliente. Avvocato lo manda all'avvocato del cliente, contestazione chiusa in 48 ore.",
    },
  ],

  testimonialQuote:
    "Prima della firma elettronica perdevo almeno 5 giorni a SAL solo per la firma a penna. Ora il cliente firma dal telefono mentre torna a casa dal lavoro. Ho accelerato la cassa di una decina di giorni per SAL, e in un anno significa 60-70mila euro di liquidità in più. Non un risparmio teorico, soldi veri.",
  testimonialAuthor: "Marco D.",
  testimonialRole: "DiCarlo Costruzioni Srl, Verona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "La firma elettronica ha valore legale come la firma autografa?",
      a: "Sì. La firma elettronica avanzata eIDAS conforme al Regolamento UE 910/2014 ha valore legale equivalente alla firma autografa, opponibile a terzi e accettata in tribunale italiano e UE. In più offre una prova probatoria superiore: marca temporale, log accessi, hash crittografico.",
    },
    {
      q: "Il cliente deve avere SPID o CIE?",
      a: "No. La firma elettronica avanzata Edilizia in Cloud usa OTP via SMS + tracciamento dispositivo, sufficiente per la maggior parte dei documenti edili (preventivi, SAL, varianti, contratti standard). Per contratti che richiedono firma qualificata supportiamo SPID/CIE come opzione aggiuntiva.",
    },
    {
      q: "Quanto è veloce per il cliente?",
      a: "30 secondi medi: apre link via email/SMS, riceve OTP, firma. Niente app da scaricare, niente token USB, niente formazione. Funziona da qualsiasi telefono, tablet o desktop con browser moderno.",
    },
    {
      q: "I documenti firmati sono al sicuro?",
      a: "Sì. Archivio cloud immutabile write-once-read-many: nessuno può modificarli o cancellarli, neanche noi. Conservazione decennale conforme CAD italiano, hash SHA-256 per garanzia integrità, esportabili in PDF/A in qualsiasi momento.",
    },
    {
      q: "Posso usarla anche per contratti subappaltatori e fornitori?",
      a: "Sì. Funziona per qualsiasi documento: contratti subappalto (con ritenuta 4% INPS art. 17 ter), ordini fornitori, capitolati, DURC, autocertificazioni, varianti, NDA. Tutti firmabili dal telefono del controparte in 30 secondi.",
    },
    {
      q: "Quanto costa? È inclusa nel piano?",
      a: "La firma elettronica avanzata + marca temporale è inclusa nei piani Professional e Business di Edilizia in Cloud, senza costo per firma. Numero firme illimitato. Piano Starter ha limite 50 firme/mese. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La firma elettronica vive collegata a tutto il resto. Ecco come.",
  internalLinksBody:
    "La Firma Elettronica è integrata in ogni documento del software: preventivi, SAL, contratti, varianti, ordini.",
  internalLinks: [
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Preventivi firmabili online direttamente dal cliente in 30 secondi.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "SAL e varianti firmati elettronicamente con marca temporale.",
    },
    {
      to: "/funzionalita/portale-clienti",
      title: "Portale Clienti",
      text: "Cliente firma documenti dal portale brandizzato della tua impresa.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Contratti e proforma firmati prima dell'emissione SDI.",
    },
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Contratti subappalto e ritenute firmate dal subappaltatore.",
    },
    {
      to: "/funzionalita/conserva-digitale",
      title: "Conservazione Digitale",
      text: "Archivio decennale conforme CAD per tutti i documenti firmati.",
    },
    {
      to: "/funzionalita/cassetto-sdi",
      title: "Cassetto Fiscale SDI",
      text: "Tutte le fatture SDI conservate digitalmente con marca temporale.",
    },
    {
      to: "/per/imprese-edili",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma orientata alle imprese edili italiane.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Firma elettronica inclusa nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di stampare, firmare, scansionare. Inizia a chiudere documenti in 30 secondi.",
  finalCtaBody:
    "31 giorni gratuiti per integrare la firma elettronica eIDAS dentro la tua impresa edile. Setup in 48 ore, marca temporale qualificata inclusa, archivio cloud immutabile. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · eIDAS conforme · Marca temporale inclusa",

  stickyCtaLabel: "Prova gratis Firma Elettronica",
  stickyCtaMicrocopy: "Setup 48h · eIDAS conforme",

  applicationSubCategory: "Construction Electronic Signature Software",

  relatedBlogSlugs: [
    "modello-preventivo-edile",
    "preventivi-edili-non-si-chiudono",
    "contratto-subappalto-edile-fac-simile",
  ],
};

export default function FirmaElettronica() {
  return <FunzionalitaPageTemplate config={config} />;
}
