import {
  AlertTriangle,
  Archive,
  Bell,
  BookCheck,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Database,
  Euro,
  FileSignature,
  FileText,
  Gavel,
  HardHat,
  Layers,
  PercentCircle,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "ritenute-garanzia",
  vertical: "Ritenute di Garanzia",
  productName: "Modulo Ritenute di Garanzia Edilizia in Cloud",
  audience:
    "Imprese edili appaltatrici e subappaltatrici di lavori pubblici e privati che gestiscono ritenute 0,5% Legge 296/2006, ritenuta 4% INPS subappalto art. 17 ter D.P.R. 633/72, scadenze svincolo, DURC e archivio documentale conforme",
  audienceShort: "imprese appalti pubblici e subappalti",

  seo: {
    title:
      "Software Ritenute di Garanzia Edilizia",
    description:
      "Gestisci ritenute di garanzia 0,5% Legge 296/2006 e 4% INPS subappalto art. 17 ter D.P.R. 633/72. Scadenze svincolo automatiche, controllo DURC, archivio…",
    keywords:
      "ritenute garanzia edilizia, software ritenute 0,5% L 296/2006, ritenuta 4% INPS subappalto, art 17 ter DPR 633/72, software appalti pubblici edilizia, gestione ritenute SAL, svincolo ritenute software, DURC software, gestione subappalti pubblici, archivio ritenute conforme",
    ogImage: "https://www.ediliziaincloud.com/og/ritenute-garanzia-og.jpg",
  },

  heroBadge: "Funzionalità · Ritenute di Garanzia",
  heroH1Lead: "Ritenute di garanzia gestite",
  heroH1Highlight: "senza svincoli persi",
  heroH1Tail: "e DURC sempre validi",
  heroSubheadline:
    "Modulo dedicato alle imprese edili che operano in appalti pubblici e subappalti: ritenuta 0,5% Legge 296/2006 su SAL, ritenuta 4% INPS art. 17 ter D.P.R. 633/72, scadenze di svincolo tracciate, controllo automatico DURC committenti e subappaltatori, archivio documentale conforme. Recuperi ritenute dimenticate e dormi tranquillo sui controlli.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import storico ritenute",
    "Calcolo automatico 0,5% e 4% su ogni SAL",
    "Notifiche scadenze svincolo automatiche",
  ],
  proofPoints: [
    "Conformità L. 296/2006 e art. 17 ter D.P.R. 633/72",
    "Controllo DURC integrato",
    "Archivio documentale 10 anni",
  ],

  objectiveRow: [
    ["Obiettivo", "Recuperare ritenute mai svincolate e azzerare rischi DURC"],
    ["Momento chiave", "Emissione SAL, scadenza svincolo, controllo DURC"],
    ["Risultato", "Liquidità recuperata, conformità appalti pubblici, zero contestazioni"],
  ],

  betaH2:
    "Più di 130 imprese edili italiane operano in appalti pubblici e subappalti gestendo ritenute con Edilizia in Cloud.",
  betaBody:
    "Attiviamo il modulo Ritenute in 48 ore: importiamo lo storico SAL e ritenute applicate, configuriamo aliquote 0,5% L. 296/2006 e 4% INPS subappalto, pianifichiamo le scadenze svincolo, integriamo controllo DURC committenti/subappaltatori, predisponiamo l'archivio documentale conforme. 4 sessioni 1-a-1 fino al primo svincolo recuperato.",

  speedH2:
    "Su 100 cantieri pubblici, l'impresa media non recupera 0,5-1,5% del valore appaltato per ritenute mai svincolate. Su un appalto da 500k€ sono 2.500-7.500€.",
  speedSubheadline:
    "La ritenuta 0,5% L. 296/2006 va trattenuta dal committente e svincolata al saldo finale dietro DURC valido. Senza un sistema di tracking, gli svincoli si perdono nei meandri amministrativi del committente pubblico. Edilizia in Cloud trasforma ogni ritenuta in un timer attivo che parte alla scadenza.",
  speedStats: [
    { value: 100, suffix: "%", label: "ritenute tracciate dal SAL allo svincolo" },
    { value: 1, prefix: "+", suffix: "%", label: "valore appaltato recuperato in svincoli" },
    { value: 0, suffix: "", label: "DURC scaduti su tuoi cantieri pubblici" },
  ],

  familyH2: "Le ritenute vivono dentro SAL, fatture, subappalti e tesoreria.",
  familySubheadline:
    "Una ritenuta non è un dato isolato: nasce da un SAL, riduce una fattura, blocca un pagamento, attende uno svincolo. Edilizia in Cloud collega ogni ritenuta al suo flusso senza data entry duplicato. L'amministrazione vede in un colpo d'occhio quanto è trattenuto, da chi, a che scadenza.",
  familyItems: [
    {
      icon: PercentCircle,
      title: "Ritenute di Garanzia",
      text: "Ritenute 0,5% L. 296/2006 e 4% INPS subappalto, scadenze svincolo, DURC.",
      to: "/funzionalita/ritenute-garanzia",
    },
    {
      icon: HardHat,
      title: "Gestione Subappalti",
      text: "Anagrafiche subappaltatori, ritenute INPS art. 17 ter, DURC mensili.",
      to: "/funzionalita/gestione-subappalti",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture SAL con ritenute correttamente applicate, codici natura conformi.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Posta a tesoreria ritenute attive e passive, previsione cassa svincoli.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: Calendar,
      title: "Scadenzario",
      text: "Scadenze svincolo, DURC, garanzie definitive, polizze fideiussorie.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: Archive,
      title: "Conservazione Digitale",
      text: "Archivio decennale fatture SAL, DURC, dichiarazioni svincolo a norma.",
      to: "/funzionalita/conserva-digitale",
    },
  ],
  familyBonusTitle: "Una piattaforma. Dal SAL alla ritenuta svincolata.",
  familyBonusText:
    "Quando emetti un SAL su appalto pubblico, il sistema applica automaticamente la ritenuta 0,5%, la registra nel cassetto ritenute, pianifica la scadenza svincolo al saldo finale, controlla il DURC del committente. Quando arriva il momento dello svincolo, ricevi alert con il dossier già pronto. Niente passaggi manuali.",

  painKicker: "Il problema vero",
  painH2:
    "0,5% trattenuto su ogni SAL. Anni di SAL. Un faldone Excel mai aggiornato. Quanti svincoli stai perdendo?",
  painSubheadline:
    "La ritenuta 0,5% L. 296/2006 si applica su ogni SAL di appalto pubblico, va svincolata al saldo finale con DURC valido. Su un appalto da 800k€ in 3 anni con 12 SAL, sono 4.000€ di ritenute. Senza un sistema, il 30-50% non viene mai svincolato perché nessuno tiene il conto.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Ritenute 0,5% non svincolate = soldi persi",
      text: "Su appalto pubblico medio 800k€ in 3 anni: 4.000€ di ritenute trattenute. Se il committente non procede d'ufficio allo svincolo (e succede spesso) e tu non sollechi alla scadenza, perdi tutto. Su 10 appalti gestiti = 30-40k€ di liquidità mai recuperata.",
    },
    {
      icon: Gavel,
      title: "Ritenuta 4% INPS subappalto sbagliata",
      text: "Art. 17 ter D.P.R. 633/72 impone reverse charge sui subappalti edili. Più ritenuta INPS 4% se il subappaltatore non presenta DURC. Errori frequenti: codici natura sbagliati, ritenute non versate, contestazioni Agenzia Entrate fino a 50% in più dell'imposta.",
    },
    {
      icon: FileText,
      title: "DURC scaduti scoperti dal committente",
      text: "Committente pubblico controlla DURC mensilmente. Se scade durante l'appalto, blocca SAL e pagamenti. Senza tracking automatico DURC subappaltatori e tuo, scopri il problema quando il SAL non viene pagato. Cantiere fermo, cassa in panne.",
    },
    {
      icon: Database,
      title: "Documentazione svincolo introvabile",
      text: "Per chiedere svincolo serve: DURC valido al momento dello svincolo, dichiarazione regolarità contributiva, copia fatture SAL, conformità art. 30 D.Lgs 50/2016. Senza archivio strutturato, ogni svincolo è 1-2 giorni di ricerca tra cartelle e PEC.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi appalti, stessi committenti, stessi subappaltatori. Cambia il numero di svincoli recuperati e la conformità.",
  baSubheadline:
    "Edilizia in Cloud non sostituisce il commercialista né l'ufficio gare: toglie il caos amministrativo che oggi divora liquidità in svincoli persi e contestazioni DURC. Risultato: 100% delle ritenute tracciate, scadenze svincolo automatiche, DURC sempre validi.",
  baAreas: [
    {
      title: "Applicazione ritenuta su SAL pubblico",
      before:
        "Segreteria emette SAL, si dimentica di applicare 0,5%, fattura passa al cliente intera. Cliente trattiene comunque 0,5% al pagamento, contabilità non riconcilia, contenzioso interno con commercialista.",
      after:
        "SAL emesso con calcolo automatico ritenuta 0,5% in base a tipologia appalto pubblico. Codice natura corretto, registrazione cassetto ritenute, scadenza svincolo già pianificata.",
    },
    {
      title: "Tracciamento ritenute attive",
      before:
        "Excel del titolare con ritenute trattenute dai committenti. Aggiornato saltuariamente, non collegato a SAL. A fine appalto si scopre che non tornano, si rinuncia alla rincorsa.",
      after:
        "Cassetto ritenute live: per ogni cantiere pubblico, ritenute trattenute SAL per SAL, scadenza svincolo, status (trattenuta/in svincolo/svincolata). Nessuna ritenuta sparisce dalla vista.",
    },
    {
      title: "Controllo DURC subappaltatori",
      before:
        "Subappaltatore manda DURC via email all'inizio del cantiere. Nessuno controlla scadenza mensile. DURC scade, SAL bloccato dal committente, cantiere fermo, scopri tutto in ritardo.",
      after:
        "Sistema controlla automaticamente DURC subappaltatori ogni mese, alert al titolare 30/15/7 giorni prima scadenza, blocco automatico pagamento subappalto se DURC non valido.",
    },
    {
      title: "Richiesta svincolo a fine appalto",
      before:
        "Ufficio gare deve preparare richiesta svincolo: cerca SAL, DURC valido, conformità contributiva, fatture. 1-2 giorni di lavoro per appalto. Spesso si rinuncia su appalti piccoli per costo amministrativo.",
      after:
        "Sistema notifica scadenza svincolo, predispone dossier completo con fatture SAL, DURC validi al momento, dichiarazione conformità. Richiesta inviata via PEC in 30 minuti.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dal SAL pubblico alla ritenuta svincolata.",
  mechanismSubheadline:
    "Il modulo Ritenute è progettato per imprese che operano su 5-50 cantieri pubblici/anno: applicazione automatica aliquote, tracking scadenze svincolo, controllo DURC integrato, archivio documentale conforme. Tutto senza data entry duplicato.",
  mechanismSteps: [
    {
      icon: PercentCircle,
      title: "SAL emesso = ritenuta calcolata e registrata",
      text: "Per ogni SAL su appalto pubblico, il sistema applica automaticamente ritenuta 0,5% L. 296/2006. Per subappalti edili applica art. 17 ter e ritenuta INPS 4% se DURC subappaltatore mancante. Codici natura corretti, registrazione cassetto.",
    },
    {
      icon: Bell,
      title: "Scadenze svincolo + controllo DURC mensile",
      text: "Sistema pianifica scadenza svincolo al saldo finale, controlla DURC committenti e subappaltatori ogni mese, alert prima delle scadenze, blocca pagamenti su subappalti con DURC scaduto.",
    },
    {
      icon: BookCheck,
      title: "Richiesta svincolo + archivio decennale",
      text: "Alla scadenza svincolo: dossier predisposto con fatture SAL, DURC validi, dichiarazione conformità contributiva. Invio PEC al committente, archivio cloud conforme 10 anni per controlli successivi.",
    },
  ],
  mechanismCta: "Apri il cassetto ritenute",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Liquidità recuperata, conformità garantita, zero blocchi DURC.",
  commercialBody:
    "Le imprese che gestiscono appalti pubblici con Edilizia in Cloud recuperano in media 0,5-1% del fatturato annuale in ritenute prima dimenticate, azzerano i blocchi cantiere per DURC scaduti e dimezzano i tempi amministrativi su gestione svincoli e subappalti. Non è marginale: è denaro liquido recuperato.",
  commercialLevers: [
    {
      icon: Euro,
      title: "Liquidità recuperata su svincoli",
      text: "Le ritenute 0,5% L. 296/2006 mai svincolate sono denaro tuo bloccato presso committenti pubblici. Sistema le tracking dal SAL allo svincolo, sollecita automaticamente alla scadenza, recupera in media 0,5-1% del fatturato pubblico annuo.",
    },
    {
      icon: ShieldCheck,
      title: "Conformità appalti pubblici garantita",
      text: "L. 296/2006, art. 17 ter D.P.R. 633/72, art. 30 D.Lgs 50/2016 (DURC), reverse charge edilizia. Tutto applicato correttamente al primo colpo. Niente contestazioni Agenzia Entrate, niente sanzioni 30-50% imposta.",
    },
    {
      icon: Timer,
      title: "Cantieri pubblici senza blocchi DURC",
      text: "DURC tuoi e di subappaltatori controllati mensilmente in automatico. Alert prima della scadenza, rinnovo programmato. Cantieri pubblici non si fermano mai per DURC scaduto, SAL pagati alle scadenze contrattuali.",
    },
    {
      icon: Sparkles,
      title: "Affidabilità su gare e subappalti",
      text: "Imprese committenti percepiscono la tua impresa come strutturata: documentazione sempre pronta, DURC validi, conformità contributiva. Più chiamate per gare invitate, ranking preferenziale su elenchi fornitori.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Ogni ritenuta vista, ogni scadenza tracciata, ogni svincolo recuperato.",
  resultsBody:
    "Quando le ritenute di garanzia smettono di essere un misterioso buco amministrativo e diventano un cassetto live, le imprese edili che operano in appalti pubblici recuperano liquidità che credevano persa. La conformità diventa un asset commerciale, non un costo.",
  integrationPillars: [
    {
      icon: PercentCircle,
      title: "Calcolo automatico aliquote ritenute",
      text: "0,5% L. 296/2006 su appalti pubblici, 4% INPS art. 17 ter su subappalti edili senza DURC, ritenuta acconto IRPEF su lavoratori autonomi. Aliquote aggiornate, codici natura corretti.",
    },
    {
      icon: Calendar,
      title: "Scadenze svincolo automatiche",
      text: "Per ogni ritenuta trattenuta, scadenza svincolo pianificata in base a saldo finale appalto. Notifiche 90/60/30 giorni prima. Dossier predisposto al momento dello svincolo.",
    },
    {
      icon: ShieldCheck,
      title: "Controllo DURC integrato",
      text: "Verifica mensile DURC tuoi e subappaltatori via cassetto previdenziale. Alert prima scadenza, blocco automatico pagamento subappalti con DURC non valido, prova conformità per committente.",
    },
    {
      icon: Archive,
      title: "Archivio documentale 10 anni",
      text: "Conservazione sostitutiva fatture SAL, DURC, dichiarazioni svincolo, contratti subappalto a norma DM 17/06/2014. Pronto per controllo Agenzia Entrate o committente pubblico.",
    },
  ],
  resultStats: [
    { value: 100, suffix: "%", label: "ritenute tracciate dal SAL allo svincolo" },
    { value: 1, prefix: "+", suffix: "%", label: "fatturato pubblico recuperato in svincoli" },
    { value: 100, suffix: "%", label: "DURC controllati senza blocchi cantiere" },
  ],
  resultsCta: "Apri il cassetto ritenute",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale recuperare 0,5% di valore ogni cantiere pubblico chiuso?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri pubblici aperti all'anno e valore medio cantiere. La stima parte dallo 0,5% di ritenute recuperate (L. 296/2006) che oggi non rivendichi al saldo finale.",
  roi: {
    input1Label: "Cantieri pubblici/anno aperti",
    input1Default: 8,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Valore medio cantiere (€)",
    input2Default: 600000,
    input2Min: 50000,
    input2Max: 10000000,
    input2Step: 10000,
    input2Suffix: " €",
    outputLabel: "Liquidità recuperata stimata/anno",
    computeOutput: (a, b) => Math.round(a * b * 0.005),
    computeSecondary: (a, b) => [
      { label: "Volume appalti pubblici/anno", value: `${(a * b).toLocaleString("it-IT")} €` },
      { label: "Ritenute trattenute totali/anno", value: `${Math.round(a * b * 0.005).toLocaleString("it-IT")} €` },
      { label: "Riduzione blocchi DURC cantiere", value: "100%" },
    ],
    closingPitch:
      "Stima conservativa al 0,5% di ritenute oggi non svincolate. Aggiungi i blocchi DURC evitati e la conformità garantita su contestazioni Agenzia Entrate: il ROI reale è multiplo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un tool fiscale generico. Un sistema costruito per chi vive di appalti pubblici.",
  salesBody:
    "Edilizia in Cloud parla la lingua dell'edilizia pubblica: L. 296/2006, art. 17 ter, DURC, art. 30 Codice Appalti. Le 4 dimensioni operative che cambiano dal primo cantiere pubblico aperto.",
  salesImpact: [
    {
      title: "Cassetto ritenute live, non Excel",
      text: "Vedi in dashboard quanto è trattenuto da chi, su quale cantiere, con quale scadenza svincolo. Stop alla rincorsa di ritenute mai svincolate perché 'non ce le ricordavamo'.",
    },
    {
      title: "Subappalti conformi al primo giro",
      text: "Reverse charge art. 17 ter applicato correttamente su ogni fattura subappaltatore, ritenuta INPS 4% se DURC mancante. Niente contestazioni Agenzia Entrate, niente sanzioni 30-50%.",
    },
    {
      title: "Cantieri pubblici sempre aperti",
      text: "DURC tuoi e dei subappaltatori sempre validi grazie al monitoraggio automatico. Cantieri non si fermano mai per blocco DURC, SAL pagati alle scadenze contrattuali.",
    },
    {
      title: "Documentazione audit-ready",
      text: "Quando arriva il commissario di gara o l'Agenzia Entrate, esporti dossier completo cantiere in 5 minuti. Conformità documentata, sanzioni evitate, gare future invitate.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi opera in appalti pubblici, non slogan fiscali generici.",
  featureRows: [
    {
      label: "Ritenuta 0,5% L. 296/2006 automatica su SAL pubblici",
      value:
        "Riconoscimento automatico appalti pubblici, applicazione aliquota 0,5% su SAL, codici natura corretti, registrazione cassetto ritenute, scadenza svincolo pianificata al saldo finale.",
    },
    {
      label: "Reverse charge art. 17 ter D.P.R. 633/72 subappalti",
      value:
        "Fatture subappalto edile con codice natura N6.7 reverse charge, ritenuta INPS 4% se DURC subappaltatore mancante. Conformità garantita contro contestazioni Agenzia Entrate.",
    },
    {
      label: "Controllo DURC mensile committenti e subappaltatori",
      value:
        "Verifica automatica via cassetto previdenziale INPS-INAIL-Cassa Edile. Alert 30/15/7 giorni prima scadenza, blocco automatico pagamento subappalti con DURC non valido.",
    },
    {
      label: "Cassetto ritenute live per cantiere",
      value:
        "Per ogni cantiere pubblico: ritenute trattenute SAL per SAL, scadenze svincolo, status (trattenuta/in svincolo/svincolata), ultimo DURC controllato, prossima scadenza svincolo.",
    },
    {
      label: "Dossier svincolo pronto in 30 minuti",
      value:
        "Alla scadenza svincolo: dossier con fatture SAL, DURC valido al momento, dichiarazione conformità contributiva ex art. 30 D.Lgs 50/2016. Invio PEC committente tracciato.",
    },
    {
      label: "Conformità art. 30 D.Lgs 50/2016 (Codice Appalti)",
      value:
        "Verifica regolarità contributiva con scadenze legali, archivio decennale fatture SAL, contratti subappalto, autorizzazioni. Pronto per audit committente o gara successiva.",
    },
    {
      label: "Reportistica fiscale per commercialista",
      value:
        "Export mensile ritenute attive e passive, fatture reverse charge, ritenute INPS subappalto. Formato Excel/CSV pronto per registri IVA, dichiarazione 770, modelli F24.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Ritenute cambia la cassa.",
  scenarios: [
    {
      title: "Saldo finale appalto Comune da 720k€",
      text:
        "Cantiere chiuso 18 mesi fa, mai sollecitato lo svincolo. Sistema ricorda alla scadenza: 3.600€ di ritenute 0,5% mai svincolate. Dossier pronto, PEC al Comune, svincolo accreditato in 90 giorni. Liquidità recuperata.",
    },
    {
      title: "DURC subappaltatore scade venerdì",
      text:
        "Mercoledì sistema notifica titolare e ufficio gare: DURC ditta subappalto X scade in 2 giorni. Pagamento SAL bloccato automatico, contattato subappaltatore per rinnovo. SAL pagato lunedì con DURC nuovo, cantiere mai fermo.",
    },
    {
      title: "Ispezione Agenzia Entrate su reverse charge",
      text:
        "Funzionario chiede prova applicazione art. 17 ter su 30 fatture subappalto 2023. Apri cassetto ritenute, esporti report con codici natura, importi, DURC subappaltatori al momento. Ispezione chiude senza rilievi.",
    },
  ],

  testimonialQuote:
    "Ho 11 cantieri pubblici aperti tra Comune, Regione, ASL. Prima tenevo un Excel del titolare per le ritenute 0,5%, ma in 8 anni avevamo recuperato forse 1/3 di quello che ci spettava. Con Edilizia in Cloud nei primi 6 mesi abbiamo recuperato 47.000€ di svincoli mai chiesti. E i blocchi DURC su subappalti sono passati da 4 all'anno a zero.",
  testimonialAuthor: "Andrea L.",
  testimonialRole: "ICEM Costruzioni Srl, Torino",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa che lavora su appalti pubblici vuole sapere prima di decidere.",
  faqs: [
    {
      q: "La ritenuta 0,5% L. 296/2006 si applica sempre? Posso essere esonerato?",
      a: "La ritenuta 0,5% si applica sui SAL di appalti pubblici di lavori. L'esonero è possibile presentando garanzia fideiussoria sostitutiva. Il sistema calcola automaticamente ritenuta o gestisce esonero garantendo aggiornamento garanzia. Conformità Codice Appalti D.Lgs 50/2016 garantita.",
    },
    {
      q: "Come funziona la ritenuta 4% INPS sui subappalti edili?",
      a: "Art. 17 ter D.P.R. 633/72 applica reverse charge edilizia. La ritenuta INPS 4% si applica solo se il subappaltatore non presenta DURC valido. Il sistema controlla DURC mensilmente: se valido, niente ritenuta INPS; se mancante, ritenuta automatica con versamento mensile programmato.",
    },
    {
      q: "Il sistema controlla davvero il DURC ogni mese in automatico?",
      a: "Sì. Integrazione con cassetto previdenziale INPS-INAIL-Cassa Edile via API ufficiali. Verifica mensile DURC tuoi e di tutti i subappaltatori attivi. Alert ai responsabili 30/15/7 giorni prima scadenza, log storico DURC per ogni cantiere.",
    },
    {
      q: "Posso recuperare ritenute di cantieri chiusi anni fa?",
      a: "Sì, fino al limite di prescrizione decennale. Importiamo lo storico SAL degli ultimi 10 anni, ricostruiamo le ritenute mai svincolate per ogni cantiere chiuso, predisponiamo i dossier di richiesta svincolo. Molti clienti recuperano 30-80k€ nei primi 3 mesi.",
    },
    {
      q: "Si integra con il mio gestionale fiscale per registri IVA e 770?",
      a: "Sì. Export mensile in formato Excel/CSV/XML compatibile con i principali gestionali fiscali italiani: TeamSystem, Zucchetti, Wolters Kluwer, Datev Koinos, Buffetti. Ritenute attive e passive, reverse charge subappalti, ritenute INPS pronte per dichiarazione 770 e modelli F24.",
    },
    {
      q: "Quanto costa il modulo? È compreso o è add-on?",
      a: "Il modulo Ritenute di Garanzia è incluso nei piani Professional e Business. Cantieri pubblici illimitati, subappaltatori illimitati, controllo DURC mensile illimitato. Cancelli quando vuoi senza vincoli pluriennali. ROI tipicamente al primo svincolo recuperato.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Le ritenute vivono collegate a tutta la piattaforma.",
  internalLinksBody:
    "Il modulo Ritenute è alimentato da Subappalti, Fatturazione, Tesoreria, Scadenzario e Conservazione Digitale. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/gestione-subappalti",
      title: "Gestione Subappalti",
      text: "Anagrafiche subappaltatori, DURC, contratti, ritenute INPS art. 17 ter.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Fatture SAL con ritenute applicate, codici natura conformi reverse charge.",
    },
    {
      to: "/funzionalita/tesoreria",
      title: "Tesoreria",
      text: "Posta a tesoreria ritenute attive e passive, previsione cassa svincoli.",
    },
    {
      to: "/funzionalita/scadenzario",
      title: "Scadenzario",
      text: "Scadenze svincolo, DURC, garanzie definitive, polizze fideiussorie.",
    },
    {
      to: "/funzionalita/conserva-digitale",
      title: "Conservazione Digitale",
      text: "Archivio decennale fatture SAL, DURC, dichiarazioni svincolo a norma.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "SAL cantieri pubblici alimentano automaticamente ritenute 0,5%.",
    },
    {
      to: "/funzionalita/finanziamenti-cantieri",
      title: "Finanziamenti Cantieri",
      text: "Anticipo SAL banche con cessione ritenute future come garanzia.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili appalti pubblici e privati.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Modulo Ritenute incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di lasciare denaro presso committenti pubblici. Inizia a recuperare ogni svincolo.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Ritenute di Garanzia dentro la tua impresa: setup in 48 ore, import storico SAL e ritenute, calcolo automatico 0,5% e 4% INPS, controllo DURC mensile, archivio decennale conforme. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · Import storico incluso · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Ritenute",
  stickyCtaMicrocopy: "Setup 48h · Recupero svincoli storici",

  applicationSubCategory: "Construction Retention Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function RitenuteGaranzia() {
  return <FunzionalitaPageTemplate config={config} />;
}
