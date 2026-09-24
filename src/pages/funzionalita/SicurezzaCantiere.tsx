import {
  Activity,
  AlertTriangle,
  Bell,
  FileCheck,
  FileSignature,
  FileText,
  HardHat,
  ListChecks,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Timer,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "sicurezza-cantiere",
  definizione:
    "Sicurezza Cantiere di Edilizia in Cloud gestisce la sicurezza ai sensi del D.Lgs 81/2008 in modo operativo, non solo archiviato: POS sul modello ministeriale, DUVRI, formazione e visite mediche con le scadenze, verbali di sopralluogo, subappaltatori con DURC e checklist di sicurezza dal telefono, collegati al cantiere.",
  vertical: "Sicurezza Cantiere",
  productName: "Sicurezza Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, RSPP e coordinatori sicurezza che devono gestire D.Lgs 81/2008 in modo pratico: POS, DUVRI, formazione, visite mediche, sopralluoghi, subappaltatori e scadenze",
  audienceShort: "imprese edili e RSPP che vogliono sicurezza gestita davvero",

  seo: {
    title:
      "Sicurezza Cantiere: D.Lgs 81/2008 e POS Digitali",
    description:
      "Software sicurezza cantiere per il D.Lgs 81/2008: POS sul modello ministeriale, DUVRI, formazione e visite mediche con scadenze, verbali, subappaltatori e DURC.",
    keywords:
      "sicurezza cantiere software, dlgs 81 2008 gestione, pos digitale cantiere, pos modello semplificato, duvri impresa edile, formazione lavoratori edilizia, visita medica operai scadenza, durc subappaltatori",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Sicurezza Cantiere",
  heroH1Lead: "Sicurezza D.Lgs 81/2008",
  heroH1Highlight: "gestita davvero",
  heroH1Tail: "non solo 'archiviata'",
  heroSubheadline:
    "Software per gestire la sicurezza del cantiere secondo il D.Lgs 81/2008: POS sul modello ministeriale, DUVRI, formazione e visite mediche con l'avviso prima della scadenza, verbali di sopralluogo, subappaltatori con DURC e checklist di sicurezza dal telefono. Quando arriva un'ispezione, i documenti sono in un posto solo.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Conforme D.Lgs 81/2008",
    "Alert automatici scadenze",
  ],
  proofPoints: [
    "POS sul modello ministeriale",
    "Checklist di sicurezza dal telefono",
    "Visite mediche con scadenziario",
  ],

  objectiveRow: [
    ["Obiettivo", "Conformità sicurezza vissuta, non solo archiviata"],
    ["Momento chiave", "Ogni nuovo cantiere, ogni ispezione, ogni visita medica"],
    ["Risultato", "Scadenze viste in tempo, POS aggiornato, controlli scritti"],
  ],

  betaH2:
    "Sicurezza Cantiere è già nel gestionale: parte dai dati di commesse e personale che hai già.",
  betaBody:
    "Non c'è niente da installare: POS sul modello ministeriale, DUVRI, verbali, subappaltatori con DURC e scadenzario sono già nel modulo. Il POS si compila con la commessa, le figure della sicurezza e i lavoratori con i loro attestati presi da Personale. E ti accompagniamo in 3 sessioni 1-a-1 fino al primo POS approvato.",

  speedH2:
    "Una visita medica dimenticata o una formazione scaduta sono una sanzione. L'app ti avvisa prima.",
  speedSubheadline:
    "L'impresa edile italiana ha decine di scadenze sicurezza per ogni operaio: visita medica, formazione generale, formazione specifica, formazione su attrezzature, DPI da rinnovare. Senza tracciamento automatico, qualcosa scade sempre. E all'ispezione ogni scadenza saltata diventa una sanzione per il datore di lavoro.",
  speedStats: [
    { value: 30, suffix: " giorni", label: "di preavviso su corsi e visite mediche, modificabile documento per documento" },
    { value: 15, suffix: " giorni", label: "per la verifica del POS da affidataria e CSE: l'app ti mostra la data limite" },
    { value: 4, suffix: " tipi", label: "di adempimento nello scadenzario: corsi, visite mediche, manutenzione DPI, rinnovo certificati" },
  ],

  familyH2: "Sicurezza Cantiere collegata a tutto il flusso operativo.",
  familySubheadline:
    "La sicurezza non è un modulo isolato: usa i lavoratori e gli attestati di Personale, le commesse, i mezzi assegnati al cantiere e la checklist dell'app operai. Niente file Excel duplicati.",
  familyItems: [
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "POS, DUVRI, figure della sicurezza, verbali, subappaltatori, scadenze.",
      to: "/funzionalita/sicurezza-cantiere",
    },
    {
      icon: Users,
      title: "HR Personale",
      text: "Schede dei lavoratori con attestati, visite mediche e scadenze.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "La commessa da cui il POS prende indirizzo, lavoratori, mezzi e subappaltatori.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Truck,
      title: "Mezzi e Attrezzature",
      text: "I mezzi assegnati alla commessa entrano nelle lavorazioni del POS.",
      to: "/funzionalita/mezzi-attrezzature",
    },
    {
      icon: Smartphone,
      title: "App Cantiere",
      text: "La checklist di sicurezza che l'operaio compila dal telefono prima di iniziare.",
      to: "/funzionalita/app-cantiere-mobile",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Preventivi, contratti e documenti da modello firmati online con codice OTP.",
      to: "/funzionalita/firma-elettronica",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Una sola sorgente verità sulla sicurezza. Niente Excel da rincorrere.",
  familyBonusText:
    "Gli attestati dei corsi caricati in Personale entrano nel POS della commessa. Quando un corso o una visita medica sta per scadere, gli amministratori ricevono l'avviso. Ogni sopralluogo diventa un verbale legato al cantiere. Tutto nello stesso gestionale, niente file separati su 5 server diversi.",

  painKicker: "Il problema vero",
  painH2:
    "La sicurezza in cantiere è gestita su Excel da una persona. Quando si dimentica qualcosa, è disastro.",
  painSubheadline:
    "In tante imprese la sicurezza la tengono un RSPP esterno e una persona in ufficio, su più file Excel: visite mediche, formazione, POS per cantiere, subappaltatori, sopralluoghi. Senza un sistema unico, qualcosa salta sempre. E all'ispezione ogni mancanza si paga: solo per un POS incompleto l'ammenda va da 2.847,69 a 5.695,36 €.",
  painPoints: [
    {
      icon: TriangleAlert,
      title: "Scadenze visite mediche dimenticate",
      text: "L'operaio Mario ha la visita medica scaduta da 2 mesi. Nessuno se n'è accorto perché il file Excel è gestito a mano. All'ispezione è una violazione dell'obbligo di sorveglianza sanitaria, con ammenda per il datore di lavoro, e senza giudizio di idoneità Mario non dovrebbe fare quel lavoro.",
    },
    {
      icon: FileText,
      title: "POS scritti una volta e mai aggiornati",
      text: "POS del cantiere scritto a inizio lavori, archiviato in cartella, dimenticato. Quando subentra una nuova fase di lavoro (es. lavori in quota), il POS non è aggiornato. All'ispezione è un POS senza uno degli elementi dell'Allegato XV: ammenda da 2.847,69 a 5.695,36 € (art. 159 D.Lgs 81/2008). Se il POS non c'è proprio, arresto da 3 a 6 mesi o ammenda da 3.559,60 a 9.112,57 €.",
    },
    {
      icon: Search,
      title: "Subappaltatori con il DURC scaduto",
      text: "Il subappaltatore lavora in cantiere da tre mesi e il suo DURC è scaduto il mese scorso. Nessuno l'ha ricontrollato, perché la data stava in una cartella. Lo scopri quando è l'ispettore a chiederlo.",
    },
    {
      icon: AlertTriangle,
      title: "Controlli di inizio turno fatti a voce",
      text: "Casco, imbracatura, parapetti, estintore: ogni mattina qualcuno dice «tutto a posto», ma non resta scritto da nessuna parte. Se poi succede qualcosa, non c'è modo di dimostrare cosa era stato controllato.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stessa norma. Stesse persone. Stesso cantiere. Cambia il sistema: le scadenze si vedono prima.",
  baSubheadline:
    "Il modulo Sicurezza Cantiere non aggiunge burocrazia: la mette in ordine. Porta in un posto solo quello che oggi dipende dalla memoria della segreteria: avvisi prima delle scadenze, POS aggiornato, verbali e checklist che restano scritti.",
  baAreas: [
    {
      title: "Scadenze visite mediche e formazione",
      before:
        "File Excel con scadenze gestite a mano. Si dimenticano e si scoprono all'ispezione. L'RSPP rincorre tutto a fine mese.",
      after:
        "Ogni attestato e ogni visita medica sta nella scheda del lavoratore con la sua scadenza. 30 giorni prima, o quando decidi tu documento per documento, gli amministratori ricevono l'avviso in campanella e via email.",
    },
    {
      title: "POS digitale e aggiornamenti per fase",
      before:
        "POS scritto a inizio cantiere, archiviato in cartella, mai aggiornato. Nuova fase di lavoro non riflessa nel POS. All'ispezione: contestazione e ammenda.",
      after:
        "POS sul modello ministeriale, con una revisione numerata per ogni nuova fase di lavoro: si apre, si aggiorna, si riapprova. Prima dell'approvazione l'app controlla i contenuti minimi dell'Allegato XV; date di firma e verifiche di affidataria e CSE restano segnate.",
    },
    {
      title: "Subappaltatori e DURC",
      before:
        "Elenco dei subappaltatori in un foglio, DURC in una cartella, scadenze controllate quando capita.",
      after:
        "Ogni subappaltatore è legato alla commessa con referente, lavori affidati e scadenza del DURC, che diventa rossa quando è passata. L'AI ne tiene conto quando propone le lavorazioni del POS.",
    },
    {
      title: "Sopralluoghi e controlli in cantiere",
      before:
        "Sopralluoghi su carta che si perde, controlli di inizio turno fatti a voce. Quando serve dimostrare cosa si è verificato e quando, non c'è niente in mano.",
      after:
        "Ogni sopralluogo, riunione o ispezione diventa un verbale legato al cantiere, con data, esito e note. Gli operai compilano dal telefono la checklist di sicurezza prima di iniziare i lavori (DPI, condizioni del cantiere, segnaletica, antincendio), con la posizione registrata.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: scadenze tracciate, sopralluoghi registrati, documenti in un posto solo.",
  mechanismSubheadline:
    "Il modulo Sicurezza Cantiere è pensato per la realtà di un'impresa edile italiana: avvisi prima delle scadenze, verbali e checklist dal cantiere, POS e DUVRI sempre a portata di mano.",
  mechanismSteps: [
    {
      icon: Bell,
      title: "Scadenze tracciate con avvisi automatici",
      text: "Attestati, visite mediche e documenti dei mezzi con la loro scadenza: gli amministratori ricevono l'avviso in campanella e via email, di norma 30 giorni prima. Lo scadenzario del modulo tiene gli altri adempimenti: corsi, manutenzione DPI, rinnovo certificati.",
    },
    {
      icon: Smartphone,
      title: "Sopralluoghi e checklist dal cantiere",
      text: "Ogni sopralluogo, riunione o ispezione si registra come verbale del cantiere, con esito e note. Gli operai compilano dal telefono la checklist di sicurezza prima di iniziare i lavori, con la posizione registrata.",
    },
    {
      icon: FileCheck,
      title: "Documenti del cantiere in un posto solo",
      text: "POS con lo storico delle revisioni, DUVRI, verbali, subappaltatori con la scadenza del DURC e scadenzario degli adempimenti: tutto legato alla commessa. Se arriva un'ispezione, POS e DUVRI si aprono e si stampano dall'app.",
    },
  ],
  mechanismCta: "Vedi il modulo Sicurezza in azione",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Scadenze viste prima, POS in regola, prove in mano al titolare.",
  commercialBody:
    "Il modulo Sicurezza Cantiere è anche una tutela per il titolare. Per lesioni gravissime causate dalla violazione delle norme di sicurezza, l'art. 590 c.p. prevede da 1 a 3 anni di reclusione. Poter dimostrare formazione, sopralluoghi e POS aggiornato è la prima difesa.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "POS sul modello ministeriale",
      text: "Il POS segue il modello semplificato del D.I. 9 settembre 2014: l'app lo compila con impresa, figure della sicurezza, lavoratori e formazione, e non lo fa approvare finché manca uno dei contenuti minimi dell'Allegato XV. DUVRI, formazione, verbali e scadenze nello stesso posto.",
    },
    {
      icon: ShieldAlert,
      title: "Difesa legale in caso di infortunio",
      text: "Infortunio grave → indagine penale al titolare. La prova di aver formato l'operaio, fatto i sopralluoghi e tenuto il POS aggiornato è la prima difesa. Nell'app ognuna di queste cose ha la sua data.",
    },
    {
      icon: Timer,
      title: "Meno tempo sui documenti",
      text: "Niente più Excel da aggiornare a mano: il POS si compila con i dati che sono già nel gestionale e gli avvisi sulle scadenze arrivano da soli. Tempo che torna disponibile per la prevenzione vera.",
    },
    {
      icon: Sparkles,
      title: "Posizionamento da impresa strutturata",
      text: "Su gare pubbliche e clienti B2B, dimostrare gestione strutturata della sicurezza è un differenziale. Più gare vinte, più clienti premium, ticket medio più alto. Gli investimenti in sicurezza ritornano commercialmente.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Quando arriva l'ispezione, il POS aggiornato è già nell'app.",
  resultsBody:
    "Tre cose cambiano subito: gli avvisi su corsi e visite mediche arrivano prima della scadenza, il POS di ogni commessa ha l'ultima revisione approvata con le date di firma e di verifica, e sopralluoghi e checklist restano scritti.",
  integrationPillars: [
    {
      icon: Stethoscope,
      title: "Scadenziario visite mediche e formazione",
      text: "Per ogni lavoratore: visita medica, formazione generale e specifica, aggiornamenti, abilitazioni per i mezzi, ognuno con la sua scadenza. Avviso agli amministratori 30 giorni prima, modificabile documento per documento.",
    },
    {
      icon: ListChecks,
      title: "POS e DUVRI per cantiere",
      text: "POS sul modello ministeriale, compilato dai dati della commessa, con una revisione numerata per ogni nuova fase. DUVRI preparato dall'AI sulla commessa. Si stampano quando servono; le firme si mettono sul documento.",
    },
    {
      icon: HardHat,
      title: "Subappaltatori e DURC",
      text: "Subappaltatori legati alla commessa con referente, lavori affidati e scadenza del DURC, in rosso quando è passata.",
    },
    {
      icon: Activity,
      title: "Verbali e checklist di cantiere",
      text: "Verbali di sopralluoghi, riunioni e ispezioni legati al cantiere. Dal telefono gli operai compilano la checklist di sicurezza prima di iniziare, con la posizione registrata.",
    },
  ],
  resultStats: [
    { value: 6, suffix: " schede", label: "nello stesso modulo: POS, figure, DUVRI, verbali, subappaltatori, scadenze" },
    { value: 11, suffix: " ruoli", label: "della sicurezza, dal datore di lavoro al primo soccorso, segnati una volta per tutti i POS" },
    { value: 0, suffix: "", label: "POS approvati con un contenuto minimo dell'Allegato XV mancante: l'approvazione si blocca" },
  ],
  resultsCta: "Apri il modulo Sicurezza Cantiere",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto recuperi gestendo la sicurezza in modo strutturato invece che su Excel?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di operai e costo orario interno della funzione sicurezza (RSPP/segreteria). La stima parte da un'ipotesi: 0,3 ore a operaio a settimana risparmiate sulla gestione documentale.",
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
    computeSecondary: (a) => [
      { label: "Ore recuperate/anno", value: `${Math.round(a * 52 * 0.3)} h` },
      { label: "Ipotesi di partenza", value: "0,3 h/operaio/sett." },
    ],
    closingPitch:
      "È una stima, non una misura: 0,3 ore a operaio a settimana × 52 settimane × costo orario. Il risparmio vero dipende da come gestisci oggi scadenze e documenti. Le sanzioni evitate non sono nel conto.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "La sicurezza smette di essere un peso. Diventa un asset commerciale e una protezione vera.",
  salesBody:
    "Il modulo Sicurezza Cantiere cambia 4 dimensioni operative: come gestisci scadenze, come prepari POS e DUVRI, come tieni formazione e visite mediche, come ti prepari alle ispezioni e ti proteggi in caso di infortunio.",
  salesImpact: [
    {
      title: "Scadenze sicurezza sotto controllo",
      text: "Visite mediche, formazione e documenti dei mezzi con la loro scadenza e l'avviso prima che scadano. L'RSPP smette di rincorrere, la segreteria recupera tempo.",
    },
    {
      title: "POS e DUVRI sempre aggiornati",
      text: "POS sul modello ministeriale con le revisioni numerate: a ogni nuova fase se ne apre una e si riapprova. Niente più POS scritti una volta e mai più aggiornati.",
    },
    {
      title: "Difesa legale in caso di infortunio",
      text: "Prova documentale di formazione, sopralluoghi e POS aggiornato, ognuna con la sua data. In caso di indagine per lesioni (art. 590 c.p.), la difesa parte da lì.",
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
      label: "Scadenziario visite mediche per lavoratore",
      value:
        "Visita medica nella scheda del lavoratore con la data di scadenza. Avviso agli amministratori in campanella e via email, di norma 30 giorni prima.",
    },
    {
      label: "Registro formazione lavoratori",
      value:
        "Formazione generale e specifica, aggiornamenti, abilitazioni per i mezzi (carrello elevatore, escavatore). Attestati caricati nella scheda del lavoratore, con la scadenza, e riportati nel POS della commessa.",
    },
    {
      label: "POS digitale per cantiere",
      value:
        "Modello semplificato del D.I. 9 settembre 2014, compilato con i dati dell'app: impresa, figure della sicurezza, lavoratori con la loro formazione. Mezzi e subappaltatori della commessa entrano nelle schede delle lavorazioni proposte dall'AI, che vanno confermate, e il POS non si approva finché manca uno dei contenuti minimi dell'Allegato XV. Il datore di lavoro lo firma sul documento stampato; l'app segna la data.",
    },
    {
      label: "DUVRI digitale e sopralluoghi",
      value:
        "Documento Unico Valutazione Rischi Interferenze preparato dall'AI sui dati della commessa, per cantieri con più imprese. Verbali di sopralluoghi, riunioni e ispezioni legati al cantiere, con esito e note.",
    },
    {
      label: "Checklist di sicurezza prima dei lavori",
      value:
        "Dal telefono, a ogni turno, l'operaio conferma DPI, condizioni del cantiere, segnaletica e antincendio. La checklist resta salvata con data e posizione, anche se in quel momento non c'è segnale.",
    },
    {
      label: "Subappaltatori e scadenzario adempimenti",
      value:
        "Subappaltatori per commessa con la scadenza del DURC. Scadenzario per corsi, visite mediche, manutenzione DPI e rinnovo certificati, con quello che è scaduto in rosso.",
    },
    {
      label: "POS trasmesso ad affidataria e coordinatore (CSE)",
      value:
        "Segni quando hai consegnato il POS all'impresa affidataria e al CSE e la data del loro esito; l'app ti mostra entro quando deve arrivare la verifica (15 giorni, art. 101 D.Lgs 81/08). Il coordinatore riceve il POS stampato o in PDF.",
    },
  ],

  scenarioKicker: "Tre casi sul campo",
  scenarioH2:
    "Tre situazioni in cui Sicurezza Cantiere protegge davvero impresa e operai.",
  scenarios: [
    {
      title: "Ispezione INL improvvisa",
      text: "Mercoledì arriva l'ispezione in cantiere e chiedono il POS. Lo apri dall'app: è l'ultima revisione approvata, con la data di firma del datore di lavoro e l'esito della verifica del CSE, e la formazione dei lavoratori è già scritta dentro. Lo stampi lì. Nella stessa pagina ci sono DUVRI, verbali dei sopralluoghi e DURC dei subappaltatori con le scadenze.",
    },
    {
      title: "Visita medica scaduta intercettata in tempo",
      text: "Lunedì mattina arriva l'avviso: la visita medica di Marco scade tra 30 giorni. La segreteria la prenota, Marco la fa venerdì e il nuovo giudizio di idoneità si carica nella sua scheda. Marco non resta in cantiere con la visita scaduta.",
    },
    {
      title: "Nuova fase: lavori in quota",
      text: "Sul cantiere partono i lavori sul tetto, che il POS non prevedeva. Apri una nuova revisione: l'AI propone la scheda della lavorazione, tu la controlli e la confermi, e il POS si riapprova solo se c'è tutto. Poi lo ritrasmetti al CSE e segni la data.",
    },
  ],

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di adottare Sicurezza Cantiere.",
  faqs: [
    {
      q: "Sostituisce il RSPP?",
      a: "No. Il modulo Sicurezza Cantiere è uno strumento di gestione documentale e operativa, non sostituisce le competenze del Responsabile del Servizio di Prevenzione e Protezione. Lo affianca: gli toglie il lavoro su Excel e cartelle e gli lascia più tempo per la prevenzione vera in cantiere.",
    },
    {
      q: "Funziona con il coordinatore sicurezza esterno (CSE/CSP)?",
      a: "In parte. Il coordinatore non ha un accesso suo all'app: il POS gli arriva stampato o in PDF. Nell'app segni quando l'hai trasmesso all'impresa affidataria e al CSE e la data del loro esito, e vedi entro quando deve arrivare la verifica (15 giorni, art. 101 D.Lgs 81/2008).",
    },
    {
      q: "I documenti generati hanno valore legale?",
      a: "Sì, una volta firmati. Il POS segue il modello semplificato del D.I. 9 settembre 2014 e l'app non lo fa approvare finché manca uno dei contenuti minimi dell'Allegato XV. Poi lo firma il datore di lavoro sul documento stampato; l'app segna la data della firma, della consultazione dell'RLS e delle verifiche di impresa affidataria e CSE. POS, DUVRI e attestati oggi non si firmano online dall'app.",
    },
    {
      q: "Si integra con HR e gestione operai?",
      a: "Sì. Visite mediche e attestati si caricano nella scheda di ogni lavoratore in Personale, con la scadenza e l'avviso prima che scada. Il POS prende da lì i lavoratori assegnati alla commessa e la loro formazione.",
    },
    {
      q: "Funziona da mobile in cantiere?",
      a: "Sì, app nativa iOS e Android. Gli operai compilano dal telefono la checklist di sicurezza prima di iniziare i lavori, anche senza segnale: i dati partono da soli quando la rete torna.",
    },
    {
      q: "Il modulo è incluso nei piani Edilizia in Cloud?",
      a: "Sì, Sicurezza Cantiere è compreso nei piani a pagamento e nei 31 giorni di prova. Non c'è nel piano gratuito Scopri.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2:
    "Sicurezza Cantiere e gli altri moduli di Edilizia in Cloud.",
  internalLinksBody:
    "La sicurezza usa i dati di Personale, commesse e mezzi. Ecco gli altri moduli da esplorare.",
  internalLinks: [
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Schede dei lavoratori con attestati, visite mediche e scadenze." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Le commesse da cui partono POS e DUVRI." },
    { to: "/funzionalita/mezzi-attrezzature", title: "Mezzi e Attrezzature", text: "Mezzi assegnati alla commessa, con i loro documenti e le scadenze." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere", text: "Checklist di sicurezza e rapportini dal telefono, anche senza segnale." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Preventivi e contratti firmati online con codice OTP." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Il diario del cantiere, giorno per giorno." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Le foto del cantiere raccolte per commessa." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Subappaltatori e i loro documenti." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di rincorrere scadenze su Excel. Inizia a gestire la sicurezza come una vera impresa strutturata.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Sicurezza Cantiere dentro la tua impresa edile. POS sul modello ministeriale, avvisi sulle scadenze e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Conforme D.Lgs 81/08 · Alert automatici",

  stickyCtaLabel: "Prova gratis Sicurezza Cantiere",
  stickyCtaMicrocopy: "Setup 48h · Conforme D.Lgs 81/08",

  applicationSubCategory: "Construction Site Safety Management Software",

  relatedBlogSlugs: [
    "sicurezza-cantieri-dlgs-81",
    "pos-piano-operativo-sicurezza-fac-simile",
    "patente-a-crediti-edilizia-guida",
  ],
};

export default function SicurezzaCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
