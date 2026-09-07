import {
  AlertTriangle,
  BarChart3,
  Calculator,
  Euro,
  FileText,
  FolderOpen,
  HardHat,
  Layers,
  LineChart,
  PackageCheck,
  Receipt,
  Search,
  ShieldCheck,
  Tag,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "gestione-commesse",
  definizione:
    "Gestione Commesse di Edilizia in Cloud trasforma ogni cantiere in una commessa completa con preventivo, consuntivo e margine in tempo reale: ogni fattura, ora lavorata e materiale viene attribuito alla commessa giusta, così quali cantieri fanno perdere soldi si scopre subito, non a fine anno.",
  vertical: "Gestione Commesse",
  productName: "Gestione Commesse Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che gestiscono più cantieri in parallelo e vogliono ogni cantiere trattato come una commessa: preventivo, consuntivo, margine in tempo reale, ODA, DDT e SAL collegati",
  audienceShort: "imprese edili che vogliono il margine vero di ogni cantiere",

  seo: {
    title: "Software Gestione Commesse Edili",
    description:
      "Software gestione commesse edili: preventivo, consuntivo e margine in tempo reale per ogni cantiere. ODA, DDT e SAL collegati. Prova gratis 31 giorni.",
    keywords:
      "software gestione commesse edili, gestione commesse edilizia, commessa cantiere, preventivo consuntivo commessa, margine commessa tempo reale, software commesse impresa edile, controllo costi cantiere, gestionale commesse edilizia cloud",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Gestione Commesse",
  heroH1Lead: "Basta scoprire a fine anno",
  heroH1Highlight: "quali cantieri ti hanno fatto perdere soldi.",
  heroH1Tail: "Il margine di ogni commessa, in tempo reale",
  heroSubheadline:
    "La fattura del ferramenta di quale cantiere era? Le ore sul blocchetto, il consuntivo \"a sensazione\". Con Edilizia in Cloud ogni cantiere diventa una commessa completa: preventivo, consuntivo, margine aggiornato in tempo reale, ordini d'acquisto, DDT e SAL collegati nello stesso posto. Quattro tab — Panoramica, Finanza, Cantiere, Documenti — e la commessa si legge in 30 secondi. Sai quanto stai guadagnando o perdendo su ogni lavoro mentre il lavoro è ancora aperto, non sei mesi dopo dal commercialista.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Preventivo vs consuntivo automatico",
    "ODA, DDT e SAL collegati",
  ],
  proofPoints: [
    "Margine commessa in tempo reale",
    "4 tab: Panoramica, Finanza, Cantiere, Documenti",
    "Ogni costo imputato alla commessa giusta",
  ],

  objectiveRow: [
    ["Obiettivo", "Sapere quanto guadagni su ogni cantiere mentre è ancora aperto"],
    ["Momento chiave", "Ogni costo che entra: ODA, DDT, ore, subappalti"],
    ["Risultato", "Margine vero per commessa, deriva costi bloccata subito"],
  ],

  betaH2:
    "Più di 300 imprese italiane gestiscono i cantieri come commesse, con preventivo e consuntivo che si parlano.",
  betaBody:
    "La Gestione Commesse la attiviamo in 48 ore: importiamo i cantieri aperti, colleghiamo preventivi e ordini d'acquisto esistenti, configuriamo le voci di costo e ti accompagniamo in 3 sessioni 1-a-1 fino alla prima commessa letta con margine in tempo reale. Dal terzo giorno sai già quale cantiere sta guadagnando e quale sta perdendo.",

  speedH2:
    "Il problema non è lavorare tanto. È scoprire a fine lavori che un cantiere ha mangiato il guadagno degli altri.",
  speedSubheadline:
    "Senza commesse strutturate, il consuntivo si fa una volta l'anno dal commercialista: troppo tardi. Le fatture fornitori finiscono in un mucchio unico, le ore non si imputano, i subappalti si stimano. Risultato tipico: 2 cantieri su 10 lavorano in perdita e nessuno se ne accorge finché i soldi non mancano.",
  speedStats: [
    { value: 30, suffix: " sec", label: "per leggere lo stato completo di una commessa" },
    { value: 100, suffix: "%", label: "dei costi imputati alla commessa giusta" },
    { value: 3, prefix: "+", suffix: "%", label: "di margine recuperato bloccando la deriva costi" },
  ],

  familyH2: "La commessa è il punto dove tutta la piattaforma si incontra.",
  familySubheadline:
    "La commessa non vive da sola: il preventivo la apre, gli ordini d'acquisto e i DDT la alimentano, i SAL la fatturano, i rapportini raccontano cosa succede in cantiere. Ogni modulo scrive sulla commessa, tu leggi un numero solo: il margine.",
  familyItems: [
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Preventivo vs consuntivo voce per voce, margine aggiornato a ogni costo.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: FileText,
      title: "Preventivi Edilizia",
      text: "Il preventivo accettato diventa la baseline economica della commessa.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: Tag,
      title: "Ordini Acquisto",
      text: "ODA emessi dalla commessa, costi impegnati visibili prima della fattura.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: PackageCheck,
      title: "Magazzino Cantiere",
      text: "Prelievi e DDT imputano il costo materiali alla commessa giusta.",
      to: "/funzionalita/magazzino-cantiere",
    },
    {
      icon: Receipt,
      title: "Contabilità Lavori",
      text: "SAL emessi dalla commessa e collegati alle fatture di acconto.",
      to: "/funzionalita/contabilita-lavori",
    },
    {
      icon: HardHat,
      title: "Rapportini Cantiere",
      text: "Ore e materiali dei rapportini finiscono nel consuntivo della commessa.",
      to: "/funzionalita/rapportini-cantiere",
    },
  ],
  familyBonusTitle:
    "Una commessa, quattro tab, zero Excel: Panoramica, Finanza, Cantiere, Documenti.",
  familyBonusText:
    "Apri la commessa e in Panoramica vedi stato, avanzamento e margine. In Finanza trovi preventivo, consuntivo, SAL, fatture e scadenze. In Cantiere ci sono squadre, rapportini, foto e materiali. In Documenti stanno contratti, DDT e carte firmate. Tutto quello che riguarda quel cantiere sta lì dentro, niente cartelle sparse e niente 'chiedi a Marco'.",

  painKicker: "Il problema vero",
  painH2:
    "Cantieri che sembrano andare bene e a fine anno il conto in banca dice il contrario.",
  painSubheadline:
    "La maggior parte delle imprese edili scopre il margine dei cantieri una volta l'anno, quando il commercialista chiude il bilancio. In mezzo ci sono 12 mesi di costi non imputati, extra non fatturati e cantieri in perdita che nessuno ha visto per tempo.",
  painPoints: [
    {
      icon: Search,
      title: "Costi sparsi tra fatture, bolle e memoria",
      text: "Fattura del ferramenta: di quale cantiere era? Bolla del calcestruzzo: metà qui, metà là. Le ore degli operai si segnano sul blocchetto. A fine lavori il consuntivo si fa 'a sensazione', e la sensazione sbaglia sempre a tuo sfavore.",
    },
    {
      icon: TrendingDown,
      title: "Cantieri in perdita scoperti troppo tardi",
      text: "Il cantiere di Via Verdi perdeva soldi dal secondo mese: materiali sopra budget, un subappalto raddoppiato. Nessuno l'ha visto perché nessun numero era aggiornato. Scoperto a fine lavori: 14.000 € bruciati, ormai non recuperabili.",
    },
    {
      icon: FileText,
      title: "Extra lavorati e mai fatturati",
      text: "Il cliente chiede 'già che ci siete' una modifica, la squadra la fa, nessuno la registra sulla commessa. A fine cantiere gli extra non tracciati valgono il 5-10% del lavoro: regalati, perché senza traccia non li fatturi.",
    },
    {
      icon: AlertTriangle,
      title: "Ogni informazione va chiesta a qualcuno",
      text: "Quanto abbiamo speso su quel cantiere? Chiedi in ufficio. A che punto è il SAL? Chiedi al geometra. Dov'è il contratto firmato? Chiedi al titolare. L'impresa funziona a telefonate, e quando una persona manca, il cantiere si ferma.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stesse squadre. Cambia una cosa: sai sempre dove sono i soldi.",
  baSubheadline:
    "La Gestione Commesse non aggiunge lavoro d'ufficio: lo toglie. I costi si imputano da soli quando emetti un ODA, ricevi un DDT o approvi un rapportino. Tu apri la commessa e leggi il margine, invece di ricostruirlo.",
  baAreas: [
    {
      title: "Controllo economico del cantiere",
      before:
        "Preventivo su Excel, costi su fatture sparse, ore sul blocchetto. Il consuntivo si fa a fine lavori, quando ormai non puoi correggere niente. Margine vero: sconosciuto fino al bilancio.",
      after:
        "Preventivo caricato come baseline, ogni costo (ODA, DDT, ore, subappalti) imputato in automatico. Margine aggiornato in tempo reale, scostamenti evidenziati voce per voce mentre il cantiere è aperto.",
    },
    {
      title: "Acquisti e materiali",
      before:
        "Ordini fatti per telefono, bolle nel cruscotto del furgone, fatture fornitori riconciliate a memoria. Impossibile sapere quanto materiale ha assorbito ogni cantiere.",
      after:
        "ODA emesso dalla commessa, DDT registrato all'arrivo, costo materiali imputato al cantiere giusto. Vedi il costo impegnato prima ancora che arrivi la fattura del fornitore.",
    },
    {
      title: "Avanzamento e fatturazione",
      before:
        "SAL preparati su Excel copiando dal preventivo, acconti fatturati 'a occhio', extra dimenticati. Tra fine lavori e incasso passano mesi.",
      after:
        "SAL emessi in pochi clic dalle voci della commessa, collegati alle fatture di acconto. Extra registrati sulla commessa appena il cliente li chiede: niente più lavori regalati.",
    },
    {
      title: "Documenti e storia della commessa",
      before:
        "Contratto in una mail, DDT in uno scatolone, foto su WhatsApp, verbali chissà dove. Ricostruire la storia di un cantiere per una contestazione richiede giorni.",
      after:
        "Tab Documenti: contratti, DDT, verbali, carte firmate. Tab Cantiere: foto, rapportini, squadre. Tutta la storia della commessa in un posto solo, cercabile in 5 secondi.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi: apri la commessa, lascia che i costi si imputino, leggi il margine.",
  mechanismSubheadline:
    "La Gestione Commesse è costruita per come lavora davvero un'impresa edile: la commessa nasce dal preventivo accettato, si alimenta dai documenti che produci comunque ogni giorno, e ti restituisce il numero che conta.",
  mechanismSteps: [
    {
      icon: FolderOpen,
      title: "Apri la commessa dal preventivo accettato",
      text: "Il preventivo accettato diventa commessa con un clic: le voci diventano la baseline economica, il cliente è collegato, le date sono pianificate. Niente doppio inserimento, niente Excel di appoggio.",
    },
    {
      icon: Layers,
      title: "I costi si imputano mentre lavori",
      text: "Emetti un ODA dalla commessa, registri un DDT, approvi un rapportino con le ore, carichi una fattura di subappalto: ogni costo finisce sulla commessa giusta, nella voce giusta, senza data entry doppio.",
    },
    {
      icon: LineChart,
      title: "Leggi margine e scostamenti in tempo reale",
      text: "Apri la tab Finanza: preventivo vs consuntivo voce per voce, margine aggiornato, scostamenti evidenziati. Se i materiali stanno sforando il budget lo vedi alla seconda settimana, non a fine lavori.",
    },
  ],
  mechanismCta: "Vedi una commessa di esempio",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Margine protetto, extra fatturati, tempo d'ufficio recuperato, decisioni prese sui numeri.",
  commercialBody:
    "La Gestione Commesse non è un archivio: è il controllo economico dell'impresa, cantiere per cantiere. Le imprese che la attivano recuperano in media 3 punti di margine tra deriva costi bloccata per tempo ed extra finalmente fatturati.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Deriva costi bloccata mentre puoi ancora agire",
      text: "Lo scostamento sui materiali lo vedi alla seconda settimana, non a fine lavori. Cambi fornitore, rinegozi, correggi la posa: intervieni quando il cantiere è aperto e il margine si può ancora salvare.",
    },
    {
      icon: Euro,
      title: "Extra registrati e fatturati, non regalati",
      text: "Ogni variante e ogni 'già che ci siete' si registra sulla commessa in 30 secondi. A fine cantiere gli extra sono documentati e finiscono in fattura: sul lavoro medio valgono il 5-10% in più incassato.",
    },
    {
      icon: Timer,
      title: "Ore d'ufficio recuperate ogni settimana",
      text: "Niente più consuntivi ricostruiti a mano, fatture fornitori riconciliate a memoria, Excel paralleli da tenere allineati. La segreteria recupera 3-4 ore a settimana per commessa attiva.",
    },
    {
      icon: BarChart3,
      title: "Decidi quali lavori accettare sui numeri veri",
      text: "Dopo 6 mesi di commesse consuntivate sai quali tipi di lavoro rendono e quali no. I prossimi preventivi li fai sui tuoi numeri reali, non sulle impressioni: prezzi giusti, lavori giusti.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il cantiere smette di essere una scatola nera. Diventa un conto economico aperto.",
  resultsBody:
    "Quando ogni cantiere è una commessa con preventivo, consuntivo e margine in tempo reale, l'impresa cambia modo di decidere: i cantieri in perdita si vedono subito, gli extra si fatturano, i preventivi futuri si basano su consuntivi veri.",
  integrationPillars: [
    {
      icon: FolderOpen,
      title: "Commessa completa in 4 tab",
      text: "Panoramica, Finanza, Cantiere, Documenti. Stato, margine, squadre, SAL, DDT e carte firmate: tutta la commessa leggibile in 30 secondi, da ufficio o da telefono.",
    },
    {
      icon: Calculator,
      title: "Preventivo vs consuntivo voce per voce",
      text: "La baseline nasce dal preventivo accettato. Ogni costo imputato aggiorna il consuntivo della voce corrispondente: vedi esattamente dove stai sforando e di quanto.",
    },
    {
      icon: Tag,
      title: "ODA, DDT e SAL collegati alla commessa",
      text: "Ordini d'acquisto emessi dalla commessa, DDT registrati all'arrivo merce, SAL emessi dalle voci di preventivo e collegati alle fatture. Il flusso dei soldi segue il flusso del cantiere.",
    },
    {
      icon: ShieldCheck,
      title: "Storia completa e difendibile",
      text: "Ogni costo, documento, foto e firma resta sulla commessa con data e autore. In caso di contestazione cliente o verifica, ricostruisci tutto in minuti, non in giorni.",
    },
  ],
  resultStats: [
    { value: 3, prefix: "+", suffix: "%", label: "margine recuperato su commessa media" },
    { value: 4, suffix: " h/sett", label: "di ufficio recuperate per commessa attiva" },
    { value: 30, suffix: " sec", label: "per leggere lo stato completo di una commessa" },
  ],
  resultsCta: "Apri la demo Gestione Commesse",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale sapere il margine di ogni cantiere mentre è ancora aperto?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: commesse chiuse in un anno e valore medio per commessa. La stima parte da 3 punti di margine recuperati tra deriva costi bloccata per tempo ed extra fatturati invece che regalati.",
  roi: {
    input1Label: "Commesse chiuse all'anno",
    input1Default: 12,
    input1Min: 2,
    input1Max: 100,
    input1Step: 1,
    input2Label: "Valore medio commessa (€)",
    input2Default: 60000,
    input2Min: 5000,
    input2Max: 500000,
    input2Step: 5000,
    input2Suffix: " €",
    outputLabel: "Margine recuperato all'anno",
    computeOutput: (a, b) => Math.round(a * b * 0.03),
    computeSecondary: (a, b) => [
      { label: "Valore produzione gestito", value: `€ ${(a * b).toLocaleString("it-IT")}` },
      { label: "Punti margine recuperati", value: "3%" },
      { label: "Ore ufficio recuperate/anno", value: `${a * 16} h` },
    ],
    closingPitch:
      "Stima prudenziale: 3 punti di margine recuperati tra deriva costi vista per tempo ed extra fatturati. Non include il valore dei cantieri in perdita evitati e delle ore d'ufficio recuperate: per molte imprese valgono più del margine stesso.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un gestionale in più. Il modo in cui l'impresa sa dove sono i suoi soldi.",
  salesBody:
    "La Gestione Commesse cambia 4 abitudini concrete: come apri un cantiere, come controlli i costi, come fatturi gli avanzamenti, come decidi quali lavori accettare l'anno prossimo.",
  salesImpact: [
    {
      title: "Il lunedì mattina sai già dove guardare",
      text: "Apri l'elenco commesse: margini in verde e in rosso, scostamenti evidenziati. In 5 minuti sai quale cantiere ha bisogno di te questa settimana, senza fare un giro di telefonate.",
    },
    {
      title: "Il preventivo diventa un impegno misurabile",
      text: "Ogni voce di preventivo ha il suo consuntivo. La squadra sa che i numeri si vedono: gli sprechi calano da soli quando tutti sanno che il cantiere ha un budget visibile.",
    },
    {
      title: "La fatturazione segue l'avanzamento, non la memoria",
      text: "SAL emessi dalle voci della commessa, acconti collegati, extra documentati. Fatturi quello che hai fatto quando l'hai fatto: il circolante respira e le contestazioni calano.",
    },
    {
      title: "Fine anno senza sorprese",
      text: "Il bilancio conferma quello che già sapevi commessa per commessa. Il commercialista trova consuntivi veri, il fido bancario si negozia con numeri in mano, i preventivi nuovi partono dai consuntivi vecchi.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Cosa attiviamo in 48 ore sulla tua impresa.",
  featureRows: [
    {
      label: "Commessa in 4 tab",
      value:
        "Panoramica (stato, avanzamento, margine), Finanza (preventivo, consuntivo, SAL, fatture, scadenze), Cantiere (squadre, rapportini, foto, materiali), Documenti (contratti, DDT, firme).",
    },
    {
      label: "Preventivo vs consuntivo in tempo reale",
      value:
        "Il preventivo accettato è la baseline. Ogni costo imputato aggiorna il consuntivo della voce: margine e scostamenti sempre attuali, per voce e per commessa.",
    },
    {
      label: "ODA e DDT collegati",
      value:
        "Ordini d'acquisto emessi dalla commessa con costo impegnato visibile subito. DDT registrati all'arrivo merce e imputati alla commessa: il costo materiali è vero, non stimato.",
    },
    {
      label: "SAL e fatturazione avanzamenti",
      value:
        "Stati avanzamento lavori emessi in pochi clic dalle voci di commessa, collegati alle fatture di acconto. Extra e varianti registrati e portati in fattura.",
    },
    {
      label: "Ore e manodopera per commessa",
      value:
        "Ore degli operai e dei subappalti imputate alla commessa dai rapportini. Il costo manodopera entra nel consuntivo senza fogli presenze da ricopiare.",
    },
    {
      label: "Elenco commesse con semafori",
      value:
        "Tutte le commesse in una vista sola: margine, avanzamento, scadenze, scostamenti evidenziati. Ordini per rischio e sai subito dove intervenire.",
    },
    {
      label: "Storico e archivio commesse",
      value:
        "Ogni commessa chiusa resta consultabile con tutto: numeri, documenti, foto, firme. Base dati reale per i preventivi futuri e difesa documentale per le contestazioni.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Gestione Commesse cambia la giornata.",
  scenarios: [
    {
      title: "Il martedì lo scostamento salta fuori da solo",
      text: "Commessa ristrutturazione a Bergamo: la voce 'massetti e sottofondi' segna +18% sul preventivo dopo due settimane. Il titolare lo vede in elenco commesse, chiama il capocantiere, scopre un errore di posa che stava raddoppiando il materiale. Corretto subito: 4.200 € salvati su quella voce sola.",
    },
    {
      title: "Il cliente chiede l'extra, l'extra finisce in fattura",
      text: "Durante il cantiere il cliente chiede di spostare due tramezzi 'già che ci siete'. Il geometra registra la variante sulla commessa dal telefono in 40 secondi: descrizione, ore, materiali. A fine mese l'extra è nel SAL con il suo prezzo. Prima si sarebbe perso: 1.800 € fatturati invece che regalati.",
    },
    {
      title: "La banca chiede i numeri per il fido",
      text: "La banca chiede lo stato delle commesse in corso per rinnovare il fido. Esporti il riepilogo: 7 commesse attive, valore produzione, margini per commessa, SAL emessi e incassati. Documento pronto in 10 minuti invece che in due giorni di ricostruzioni: fido rinnovato senza discussioni.",
    },
  ],

  testimonialQuote:
    "Prima sapevo quanto avevo guadagnato sui cantieri una volta l'anno, dal commercialista. Adesso apro la commessa e lo so oggi. Il cantiere di Via Roma stava andando in perdita sui materiali: l'ho visto alla terza settimana e ho cambiato fornitore. Solo quella mossa ha pagato l'abbonamento per due anni.",
  testimonialAuthor: "Andrea M.",
  testimonialRole: "M. Costruzioni Srl, Brescia",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Cos'è una commessa in Edilizia in Cloud?",
      a: "In Edilizia in Cloud una commessa è un cantiere trattato come un conto economico: preventivo come baseline, consuntivo alimentato da ODA, DDT, ore e subappalti, margine calcolato in tempo reale. La commessa raccoglie anche documenti, foto, rapportini e SAL in quattro tab: Panoramica, Finanza, Cantiere, Documenti. Un posto solo per tutto quello che riguarda quel cantiere.",
    },
    {
      q: "Come si aggiorna il margine della commessa in tempo reale?",
      a: "Il margine si aggiorna da solo perché ogni documento operativo imputa il suo costo alla commessa: l'ordine d'acquisto registra il costo impegnato, il DDT conferma il materiale arrivato, il rapportino approvato imputa le ore, la fattura di subappalto si aggancia alla voce giusta. Non c'è data entry doppio: il consuntivo cresce mentre lavori.",
    },
    {
      q: "Devo rifare i preventivi dentro il software per usare le commesse?",
      a: "No. Puoi partire in due modi: creare il preventivo in Edilizia in Cloud e trasformarlo in commessa con un clic, oppure aprire la commessa direttamente e caricare la baseline economica dalle voci del tuo preventivo esistente. In onboarding importiamo i cantieri aperti con i loro numeri, così non riparti da zero.",
    },
    {
      q: "Funziona anche per un'impresa piccola con 2-3 cantieri?",
      a: "Sì, e spesso rende di più proprio lì: con 2-3 cantieri un solo lavoro in perdita pesa tantissimo sul risultato dell'anno. La Gestione Commesse ti dice subito se uno dei tre sta sforando, senza bisogno di un impiegato dedicato al controllo di gestione. Il setup è lo stesso: 48 ore e sei operativo.",
    },
    {
      q: "Gli extra e le varianti come vengono gestiti?",
      a: "Ogni extra si registra sulla commessa in pochi secondi, anche dal telefono in cantiere: descrizione, ore, materiali, prezzo. La variante resta documentata con data e autore, entra nel consuntivo e viene proposta in automatico quando emetti il SAL o la fattura. Così i 'già che ci siete' smettono di essere lavori regalati.",
    },
    {
      q: "La Gestione Commesse è inclusa nei piani o si paga a parte?",
      a: "La Gestione Commesse è il cuore del gestionale Edilizia in Cloud ed è inclusa nei piani, senza limiti sul numero di commesse attive o archiviate. Nella prova gratuita di 31 giorni la usi completa, con setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La commessa è il centro. Tutto il resto la alimenta.",
  internalLinksBody:
    "Preventivi, ordini, magazzino, SAL, rapportini e calendario scrivono tutti sulla stessa commessa. Una sola fonte di verità per ogni cantiere.",
  internalLinks: [
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Preventivo vs consuntivo e margine in tempo reale per commessa." },
    { to: "/funzionalita/preventivi-edilizia", title: "Preventivi Edilizia", text: "Il preventivo accettato diventa la baseline della commessa." },
    { to: "/funzionalita/contabilita-lavori", title: "Contabilità Lavori", text: "SAL emessi dalla commessa e collegati alle fatture." },
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "ODA emessi dalla commessa con costo impegnato subito visibile." },
    { to: "/funzionalita/magazzino-cantiere", title: "Magazzino Cantiere", text: "Prelievi e DDT imputano il costo materiali alla commessa." },
    { to: "/funzionalita/rapportini-cantiere", title: "Rapportini Cantiere", text: "Ore e materiali dai rapportini entrano nel consuntivo." },
    { to: "/funzionalita/calendario-lavori", title: "Calendario Lavori", text: "Pianificazione squadre e fasi collegata alle commesse." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Registrazione giornaliera conforme collegata al cantiere." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di scoprire i margini a fine anno. Inizia a leggerli ogni mattina, commessa per commessa.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Gestione Commesse dentro la tua impresa edile. Setup in 48 ore, import dei cantieri aperti, preventivo vs consuntivo automatico, onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Margine in tempo reale · ODA, DDT e SAL collegati",

  stickyCtaLabel: "Prova gratis Gestione Commesse",
  stickyCtaMicrocopy: "Setup 48h · Margine in tempo reale",

  applicationSubCategory: "Construction Job Costing Software",

  relatedBlogSlugs: [
    "gestire-piu-cantieri-contemporaneamente",
    "contabilita-di-cantiere-guida",
    "analisi-margini-imprese-edili",
  ],
};

export default function GestioneCommesse() {
  return <FunzionalitaPageTemplate config={config} />;
}
