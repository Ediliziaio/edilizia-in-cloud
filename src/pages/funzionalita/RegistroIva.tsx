import {
  AlertTriangle,
  Archive,
  BookOpen,
  Calculator,
  Calendar,
  Clock,
  Database,
  FileSearch,
  HardHat,
  Inbox,
  Landmark,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "registro-iva",
  vertical: "Registro IVA",
  productName: "Modulo Registro IVA Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor e artigiani edili che vogliono registri IVA acquisti, vendite e corrispettivi automatici dal flusso SDI, liquidazione periodica LIPE generata in automatico e conservazione decennale a norma CAD",
  audienceShort: "imprese edili e artigiani",

  seo: {
    title:
      "Registro IVA Edilizia",
    description:
      "Software registri IVA per imprese edili: acquisti, vendite e corrispettivi alimentati automaticamente dal cassetto SDI, liquidazione periodica IVA (LIPE),…",
    keywords:
      "registro IVA edilizia, registro acquisti vendite SDI, LIPE edilizia, liquidazione periodica IVA, conservazione decennale registro IVA, software IVA imprese edili, registro corrispettivi edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Registro IVA",
  heroH1Lead: "Registri IVA automatici",
  heroH1Highlight: "dal cassetto SDI",
  heroH1Tail: "senza tocco manuale",
  heroSubheadline:
    "Modulo Registro IVA con acquisti, vendite e corrispettivi alimentati automaticamente dalle fatture elettroniche SDI in entrata e uscita. Liquidazione periodica IVA (LIPE) generata in automatico, conservazione decennale a norma CAD D.Lgs 82/2005, esibizione GdF in 5 minuti, integrazione con commercialista. Stop alle 2,5 minuti per fattura registrata a mano.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Registri SDI automatici",
    "LIPE generata in 1 click",
    "Conservazione 10 anni CAD",
  ],
  proofPoints: [
    "Acquisti, vendite, corrispettivi",
    "Reverse charge edilizia",
    "Esibizione GdF rapida",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare la registrazione manuale fattura per fattura"],
    ["Momento chiave", "Quando il commercialista ti chiede 'mi mandi i registri IVA?'"],
    ["Risultato", "Registri pronti in tempo reale, LIPE automatica, GdF tranquilla"],
  ],

  betaH2:
    "Più di 290 imprese edili italiane gestiscono i registri IVA in automatico dal cassetto SDI con Edilizia in Cloud.",
  betaBody:
    "Il modulo Registro IVA è attivo in 48 ore: connettiamo il tuo cassetto SDI in modalità autorizzata, importiamo lo storico fatture degli ultimi 5 anni, configuriamo regole di registrazione (split payment, reverse charge edilizia, esenzioni). Quattro sessioni 1-a-1 ti accompagnano fino alla prima liquidazione periodica IVA generata automaticamente senza data entry.",

  speedH2: "Registri IVA fatti a mano = 2,5 minuti per fattura. Su 500 fatture/anno sono 21 ore.",
  speedSubheadline:
    "L'impresa edile media gestisce 200-2000 fatture/anno. Registrare manualmente in registro IVA acquisti, vendite, corrispettivi richiede in media 2,5 minuti per fattura tra apertura, lettura, classificazione, registrazione. Su 500 fatture sono 21 ore di commercialista a €40-120/h: €840-2.500/anno solo per la data entry.",
  speedStats: [
    { value: 95, prefix: "+", suffix: "%", label: "fatture registrate automaticamente da SDI" },
    { value: 2.5, suffix: " min", label: "minuti risparmiati per fattura" },
    { value: 100, suffix: "%", label: "conservazione decennale a norma CAD" },
  ],

  familyH2: "Registro IVA collegato a SDI, contabilità, scadenzario e conservazione.",
  familySubheadline:
    "Il registro IVA non è un'isola: parte dalle fatture SDI, alimenta la contabilità ordinaria/semplificata, agganciale scadenze IVA al calendario, finisce in conservazione decennale digitale. Una catena automatica, nessuna trascrizione manuale, nessun disallineamento commercialista.",
  familyItems: [
    {
      icon: Inbox,
      title: "Cassetto SDI",
      text: "Tutte le fatture elettroniche entrano e si registrano automaticamente nei registri IVA.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica",
      text: "Fatture emesse alimentano direttamente il registro IVA vendite con split payment edilizia.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Calculator,
      title: "Contabilità Fiscale",
      text: "Registrazioni IVA generano scritture contabili automatiche in prima nota e bilancio.",
      to: "/funzionalita/contabilita-fiscale",
    },
    {
      icon: Calendar,
      title: "Scadenzario",
      text: "Scadenze LIPE, liquidazioni mensili/trimestrali e versamenti F24 nel calendario fiscale.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: Archive,
      title: "Conservazione Digitale",
      text: "Registri IVA conservati 10 anni a norma CAD D.Lgs 82/2005, marca temporale eIDAS.",
      to: "/funzionalita/conserva-digitale",
    },
    {
      icon: BookOpen,
      title: "Prima Nota",
      text: "Movimenti IVA registrati in prima nota con causali edilizia preimpostate.",
      to: "/funzionalita/prima-nota",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Da SDI a registro IVA a LIPE in tempo reale.",
  familyBonusText:
    "Quando una fattura passiva arriva nel cassetto SDI, viene letta, classificata (acquisto materiali, servizi, beni strumentali), registrata nel registro IVA acquisti, alimenta la contabilità con scrittura prima nota, contribuisce alla LIPE del trimestre, viene archiviata in conservazione decennale. Un evento, sei effetti automatici.",

  painKicker: "Il problema vero",
  painH2: "Il commercialista ti registra le fatture a mano e ti fa la LIPE 5 giorni prima.",
  painSubheadline:
    "Anche con SDI obbligatorio, la maggior parte degli studi commerciali registra ancora a mano le fatture per assicurarsi 'di non sbagliare'. Risultato: tu paghi 2,5 minuti per fattura di data entry ripetuta, la LIPE arriva all'ultimo minuto, gli errori di reverse charge edilizia restano nascosti finché non arriva l'avviso bonario di Agenzia Entrate.",
  painPoints: [
    {
      icon: Clock,
      title: "2,5 minuti per fattura registrata a mano",
      text: "Su 500 fatture/anno sono 21 ore di lavoro manuale: aprire PDF, leggere, classificare, registrare in software contabile. A €40-120/h commercialista, €840-2.500/anno bruciati in pura data entry.",
    },
    {
      icon: AlertTriangle,
      title: "Reverse charge edilizia sbagliato",
      text: "L'edilizia ha regole IVA particolari: reverse charge per subappalti edili (art. 17 c. 6 DPR 633/72), split payment per PA. Errore di classificazione = avviso bonario AE, sanzioni 90% imposta non versata, anni di contenzioso.",
    },
    {
      icon: Calendar,
      title: "LIPE all'ultimo minuto ogni trimestre",
      text: "Ogni 16 maggio, 16 agosto, 16 novembre, 28 febbraio scadenza LIPE. Il commercialista chiama 'mancano alcune fatture, mandami i giustificativi entro stasera'. Stress trimestrale, errori, sanzioni 250-2.000€ per LIPE tardiva.",
    },
    {
      icon: FileSearch,
      title: "GdF chiede registri 5 anni fa, panico totale",
      text: "Verifica fiscale, GdF chiede registro IVA acquisti 2020. Se sono in software vecchio dismesso, tu avevi i PDF, e il commercialista ha solo riepiloghi, non originali, scatta sanzione per documentazione incompleta. Defaillance grave.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesso commercialista, stesse fatture, stessa IVA. Cambia chi fa la data entry.",
  baSubheadline:
    "Non escludi il commercialista: gli togli la fatica meccanica della registrazione e gli lasci la consulenza vera (riconciliazioni, ottimizzazioni, contenziosi). Tu paghi meno per la data entry, lui guadagna di più nel valore aggiunto.",
  baAreas: [
    {
      title: "Registrazione fattura passiva",
      before:
        "Fattura entra in SDI, commercialista la apre, la legge, la classifica, la registra a mano. 2,5 minuti per fattura. Su 200 fatture/mese sono 8 ore di lavoro per uno studio piccolo.",
      after:
        "Fattura SDI passa direttamente nel registro IVA acquisti, classificata automaticamente (materiali edili, servizi, beni strumentali), reverse charge applicato, scrittura contabile generata. Tempo: 0 minuti.",
    },
    {
      title: "Liquidazione IVA periodica (LIPE)",
      before:
        "Trimestre chiuso, commercialista impiega 4-8 ore per generare LIPE: estrae registri, controlla totali, calcola debito/credito, prepara F24, invia. Errori frequenti, scadenza all'ultimo minuto.",
      after:
        "16 del mese: clic 'genera LIPE', sistema calcola IVA a debito/credito, considera reverse charge e split payment edilizia, genera comunicazione telematica e F24. Inviato in 30 minuti senza ansia.",
    },
    {
      title: "Conservazione decennale",
      before:
        "Registri IVA stampati su carta, archiviati in faldoni in cantina, occupano 4mq, ammuffiscono. PDF su hard disk che si guasta. GdF chiede e tu hai metà documenti.",
      after:
        "Registri IVA conservati digitalmente 10 anni a norma CAD D.Lgs 82/2005 con marca temporale eIDAS. Esibizione GdF in 5 minuti, esportazione legale completa, niente faldoni, niente cantina.",
    },
    {
      title: "Verifica fiscale GdF",
      before:
        "GdF chiede registri IVA 2019-2023. Commercialista cerca in software vecchio, alcuni file sono in formato non più leggibile, faldoni in cantina sono incompleti. 3 settimane di sofferenza, multa per documentazione incompleta.",
      after:
        "Apri il modulo, esporti dossier IVA 5 anni con tutte le fatture, registri, LIPE, F24, prima nota. Pacchetto firmato digitalmente con marca temporale. GdF soddisfatta in 5 minuti.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. SDI legge, sistema classifica, LIPE si genera sola.",
  mechanismSubheadline:
    "Il modulo Registro IVA è progettato per il 95% di automazione: tu intervieni solo sulle eccezioni (es. classificazione ambigua, reverse charge da confermare), il resto vive in automatico.",
  mechanismSteps: [
    {
      icon: Inbox,
      title: "Fatture SDI lette automaticamente",
      text: "Cassetto SDI agganciato in autorizzazione, ogni fattura entrata/uscita letta in tempo reale. XML decodificato, dati strutturati estratti, allegato PDF associato per consultazione.",
    },
    {
      icon: Database,
      title: "Classificazione e registrazione automatica",
      text: "Regole IVA edilizia: reverse charge subappalti, split payment PA, IVA agevolata 10% ristrutturazioni, esenzioni. Sistema applica regola corretta, registra in registro acquisti/vendite/corrispettivi.",
    },
    {
      icon: Send,
      title: "LIPE generata e inviata in 1 click",
      text: "Trimestre chiuso, sistema calcola IVA a debito/credito, considera split payment e reverse charge, genera comunicazione LIPE telematica, prepara F24 IVA. Inviato all'AE con ricevuta archiviata.",
    },
  ],
  mechanismCta: "Apri il modulo registro IVA in demo",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Registri automatici = -80% tempo commercialista + zero errori reverse charge.",
  commercialBody:
    "Le imprese edili che attivano il modulo Registro IVA recuperano in media l'80% del tempo di commercialista dedicato alla data entry, eliminano gli errori di reverse charge edilizia e azzerano le sanzioni LIPE tardive. Il commercialista smette di essere registratore e torna a essere consulente.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "-80% data entry commercialista",
      text: "Da 2,5 minuti a 0 per fattura. Su 500 fatture/anno significa 21 ore recuperate, €840-2.500 di parcella in meno o riallocata su consulenza vera.",
    },
    {
      icon: ShieldCheck,
      title: "Reverse charge edilizia sempre giusto",
      text: "Regole subappalti edili (art. 17 c. 6 DPR 633/72) e split payment PA preconfigurati. Niente più avvisi bonari AE per IVA non versata, niente sanzioni 90% imposta.",
    },
    {
      icon: Calendar,
      title: "LIPE puntuale ogni trimestre",
      text: "Generata e inviata il giorno 5 invece che il 15. Niente più ansia 'mancano fatture', niente sanzioni 250-2.000€ per ritardi, niente correzioni successive.",
    },
    {
      icon: Sparkles,
      title: "GdF tranquilla per 10 anni",
      text: "Conservazione decennale a norma CAD con marca temporale eIDAS. Esibizione 5 anni in 5 minuti, dossier completo IVA esportabile, ispezione fiscale chiusa serenamente.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il commercialista smette di registrare. Tu smetti di pagare la data entry.",
  resultsBody:
    "Quando i registri IVA si alimentano dal cassetto SDI in automatico, la data entry sparisce, la LIPE è puntuale, gli errori di reverse charge edilizia diventano impossibili. Il commercialista resta come consulente strategico, non come registratore meccanico.",
  integrationPillars: [
    {
      icon: Inbox,
      title: "Cassetto SDI integrato",
      text: "Lettura automatica fatture passive e attive, decodifica XML, classificazione per natura operazione (TD01, TD24, TD20...), abbinamento PDF allegato.",
    },
    {
      icon: HardHat,
      title: "Regole IVA edilizia",
      text: "Reverse charge subappalti edili (art. 17 c. 6 DPR 633/72), split payment PA, IVA 10% ristrutturazioni, IVA 4% prima casa, esenzioni cessioni terreni, regimi agevolati.",
    },
    {
      icon: Landmark,
      title: "LIPE telematica e F24",
      text: "Calcolo automatico IVA a debito/credito, considera reverse charge, split payment, plafond esportatori abituali. Invio LIPE telematico, F24 IVA generato e trasmesso.",
    },
    {
      icon: ShieldCheck,
      title: "Conservazione 10 anni CAD",
      text: "Marca temporale eIDAS, archiviazione AgID-compliant, esibizione legale GdF, esportazione dossier completo per verifica fiscale, niente faldoni cartacei.",
    },
  ],
  resultStats: [
    { value: 95, prefix: "+", suffix: "%", label: "fatture registrate automaticamente da SDI" },
    { value: 80, prefix: "-", suffix: "%", label: "tempo commercialista data entry" },
    { value: 0, suffix: "", label: "sanzioni reverse charge dopo 6 mesi" },
  ],
  resultsCta: "Apri il modulo registro IVA",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto risparmi se 95 fatture su 100 si registrano da sole?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di fatture mensili tra acquisti e vendite e costo orario del commercialista. La stima parte da 2,5 minuti per fattura risparmiati grazie alla registrazione automatica SDI.",
  roi: {
    input1Label: "Fatture totali al mese",
    input1Default: 80,
    input1Min: 20,
    input1Max: 2000,
    input1Step: 10,
    input2Label: "Costo orario commercialista (€)",
    input2Default: 60,
    input2Min: 40,
    input2Max: 120,
    input2Step: 5,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.04 * b),
    computeSecondary: (a, b) => [
      { label: "Ore commercialista recuperate/anno", value: `${Math.round(a * 12 * 0.04)} h` },
      { label: "Fatture registrate automatiche/anno", value: `${a * 12}` },
      { label: "Sanzioni LIPE potenzialmente evitate", value: "fino a 2.000€" },
    ],
    closingPitch:
      "Stima prudenziale basata su 2,5 minuti per fattura risparmiati grazie a registrazione SDI automatica. Aggiungi le sanzioni reverse charge evitate, le LIPE puntuali e la verifica GdF chiusa in 5 minuti.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un registro IVA generico. Un modulo nato per la fiscalità edile.",
  salesBody:
    "I software contabili generalisti applicano regole IVA standard. Il modulo Registro IVA di Edilizia in Cloud nasce con le regole specifiche dell'edilizia italiana già configurate: reverse charge subappalti, split payment PA, IVA agevolata ristrutturazioni.",
  salesImpact: [
    {
      title: "Data entry azzerata",
      text: "Le fatture entrano da SDI e si registrano da sole. Il commercialista interviene solo su anomalie. Risparmi 21 ore all'anno per ogni 500 fatture.",
    },
    {
      title: "Compliance fiscale automatica",
      text: "Reverse charge e split payment edilizia preconfigurati, LIPE puntuale, F24 IVA generato. Niente più sanzioni AE per errori di registrazione o tardivi versamenti.",
    },
    {
      title: "Verifica GdF tranquilla",
      text: "Conservazione decennale CAD con marca temporale, dossier IVA esportabile in 5 minuti per qualsiasi anno. Verifica fiscale chiusa senza notti insonni.",
    },
    {
      title: "Commercialista più strategico",
      text: "Tempo del commercialista riallocato da data entry a consulenza: ottimizzazione fiscale, riconciliazioni, scelta regime, supporto contenziosi. Più valore per la stessa parcella.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Registri IVA automatici da SDI",
      value: "Acquisti, vendite, corrispettivi alimentati in tempo reale dal cassetto SDI. Decodifica XML, classificazione automatica, allegato PDF associato per consultazione.",
    },
    {
      label: "Reverse charge edilizia preconfigurato",
      value: "Art. 17 c. 6 DPR 633/72 per subappalti edili applicato automaticamente. Split payment PA, IVA agevolata 10% ristrutturazioni, IVA 4% prima casa, esenzioni cessioni terreni.",
    },
    {
      label: "LIPE telematica generata in 1 click",
      value: "Comunicazione LIPE trimestrale generata e inviata all'AE in 30 minuti il giorno 5 del mese. F24 IVA generato e trasmesso. Ricevute archiviate.",
    },
    {
      label: "Plafond esportatori abituali",
      value: "Gestione plafond annuale art. 8 DPR 633/72 per esportatori abituali, dichiarazioni di intento ricevute/inviate, monitoraggio utilizzi mensili automatico.",
    },
    {
      label: "Conservazione decennale CAD",
      value: "Marca temporale eIDAS, archiviazione AgID-compliant, manuale conservazione disponibile, esibizione GdF/AE in 5 minuti, dossier 5 anni esportabile.",
    },
    {
      label: "Esibizione GdF e AE rapida",
      value: "Pacchetto verifica fiscale completo (registri + fatture + LIPE + F24) firmato digitalmente con marca temporale. Pronto in 5 minuti per qualsiasi anno entro 10 anni.",
    },
    {
      label: "Integrazione commercialista",
      value: "Accesso commercialista come collaboratore (lettura/scrittura), esportazione XBRL e tracciato 770/IRPEF, supporto consulenza fiscale in tempo reale.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Registro IVA cambia il fine trimestre.",
  scenarios: [
    {
      title: "LIPE del 16 maggio in 30 minuti",
      text: "Il 5 maggio premi 'genera LIPE Q1'. Sistema calcola IVA debito/credito su 600 fatture, applica split payment cantiere PA, reverse charge subappalti, genera comunicazione e F24. Inviato all'AE entro le 13:00, scadenza tranquilla.",
    },
    {
      title: "Subappalto edile con reverse charge",
      text: "Ricevi fattura da subappaltatore impiantista per €15.000. Sistema riconosce reverse charge edilizia (art. 17 c. 6 lett. a-ter), registra senza IVA in acquisti, applica IVA in vendite, integra perfettamente in LIPE. Zero errori AE.",
    },
    {
      title: "Verifica GdF su anno 2021",
      text: "GdF chiede registri IVA 2021 completi. Esporti dossier in 5 minuti: 1.247 fatture acquisti, 856 vendite, 4 LIPE, F24 IVA, conservazione CAD. PDF firmato digitalmente con marca temporale. Verifica chiusa senza rilievi.",
    },
  ],

  testimonialQuote:
    "Avevo un commercialista che mi registrava 600 fatture/anno a mano e ogni LIPE era un dramma. Ora le fatture si registrano da sole dal cassetto SDI, la LIPE la genero io il giorno 5 e il commercialista la controlla in 10 minuti. Pago meno parcella, ho più tempo, e l'ultima verifica GdF si è chiusa in mezz'ora.",
  testimonialAuthor: "Andrea S.",
  testimonialRole: "Costruzioni S. Srl, Modena",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare al registro IVA automatico.",
  faqs: [
    {
      q: "Come si collega al mio cassetto SDI?",
      a: "Il modulo si collega al tuo cassetto SDI via delega ufficiale Agenzia delle Entrate (autorizzazione al servizio cassetto fiscale). In 24-48 ore tutte le fatture passive e attive degli ultimi 5 anni vengono importate, classificate e registrate. Aggiornamento giornaliero automatico per le nuove fatture.",
    },
    {
      q: "Gestisce il reverse charge edilizia (art. 17 c. 6 DPR 633/72)?",
      a: "Sì. Il reverse charge per subappalti edili è preconfigurato. Sistema riconosce dal codice ATECO del fornitore e dalla natura operazione XML se applicare reverse charge, lo registra in acquisti senza IVA, lo riporta in vendite con autoIVA, lo integra correttamente nella LIPE.",
    },
    {
      q: "Posso continuare ad avere il commercialista?",
      a: "Sì. Il commercialista accede al gestionale come collaboratore con permessi di lettura e scrittura sui registri IVA. Resta come consulente strategico (ottimizzazioni, riconciliazioni, contenziosi) ma viene liberato dalla data entry meccanica delle 500-2000 fatture/anno.",
    },
    {
      q: "Come viene generata la LIPE telematica?",
      a: "Il sistema calcola IVA a debito/credito sui registri del trimestre, considera reverse charge, split payment, plafond esportatori, genera la comunicazione LIPE in formato XML AdE, la firma digitalmente, la trasmette via Entratel/Fisconline. Ricevuta archiviata, F24 IVA preparato.",
    },
    {
      q: "E la conservazione decennale, è davvero a norma?",
      a: "Sì. Conservazione a norma CAD D.Lgs 82/2005 con marca temporale eIDAS qualificata, archiviazione su responsabile della conservazione AgID-accreditato, manuale di conservazione disponibile. Esibizione GdF/AE in 5 minuti per qualsiasi anno fino a 10 anni indietro.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di fatture?",
      a: "Il modulo Registro IVA è incluso nei piani Business di Edilizia in Cloud con fatture illimitate, conservazione decennale inclusa, accesso commercialista incluso. Setup in 48 ore, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Registro IVA è il cuore del ciclo fiscale edile.",
  internalLinksBody:
    "Il modulo collega cassetto SDI, fatturazione, contabilità, scadenzario e conservazione decennale in un unico flusso fiscale automatico.",
  internalLinks: [
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto SDI", text: "Fatture elettroniche entrano e si registrano automaticamente." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture emesse alimentano il registro IVA vendite." },
    { to: "/funzionalita/contabilita-fiscale", title: "Contabilità Fiscale", text: "Registrazioni IVA generano scritture contabili automatiche." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Scadenze LIPE e versamenti F24 IVA nel calendario fiscale." },
    { to: "/funzionalita/conserva-digitale", title: "Conservazione Digitale", text: "Registri IVA conservati 10 anni a norma CAD." },
    { to: "/funzionalita/prima-nota", title: "Prima Nota", text: "Movimenti IVA registrati con causali edilizia preimpostate." },
    { to: "/funzionalita/ritenute-garanzia", title: "Ritenute Garanzia", text: "Gestione ritenute d'acconto e ritenute di garanzia in subappalti." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Registro IVA incluso nel piano Business con fatture illimitate." },
  ],

  finalCtaH2: "Smetti di registrare 500 fatture all'anno a mano. Inizia con SDI che alimenta tutto.",
  finalCtaBody:
    "31 giorni gratuiti per portare il registro IVA edilizia in automatico dal cassetto SDI. Reverse charge edilizia preconfigurato, LIPE telematica, conservazione decennale CAD, accesso commercialista. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · SDI integrato · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Registro IVA",
  stickyCtaMicrocopy: "Setup 48h · SDI automatico",

  applicationSubCategory: "Construction VAT Register Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function RegistroIva() {
  return <FunzionalitaPageTemplate config={config} />;
}
