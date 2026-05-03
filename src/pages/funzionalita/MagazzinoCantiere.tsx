import {
  AlertTriangle,
  Archive,
  Barcode,
  Box,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  Filter,
  HardHat,
  Inbox,
  MapPin,
  Package,
  PackageCheck,
  PackageOpen,
  PackageX,
  RefreshCw,
  Scan,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
  Warehouse,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "magazzino-cantiere",
  vertical: "Magazzino Cantiere",
  productName: "Magazzino Cantiere Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che gestiscono multi-cantiere con magazzini distribuiti e vogliono stock controllato per cantiere, prelievi tracciati, scorte minime e codici a barre",
  audienceShort: "imprese edili e general contractor multi-cantiere",

  seo: {
    title:
      "Magazzino Cantiere Multi-Sito",
    description:
      "Gestione magazzino multi-cantiere con stock per cantiere, prelievi tracciati con codici a barre, scorte minime e ordini automatici, valorizzazione FIFO.",
    keywords:
      "magazzino cantiere edilizia, gestione magazzino multi-cantiere, stock cantiere, prelievi tracciati edilizia, codici a barre magazzino edilizia, scorte minime cantiere, valorizzazione FIFO edilizia, software magazzino edile",
    ogImage: "https://www.ediliziaincloud.com/og/magazzino-cantiere-og.jpg",
  },

  heroBadge: "Funzionalità · Magazzino Cantiere",
  heroH1Lead: "Stock per cantiere",
  heroH1Highlight: "tracciato e valorizzato",
  heroH1Tail: "FIFO",
  heroSubheadline:
    "Gestione magazzino multi-cantiere con stock dedicato per ogni cantiere, prelievi tracciati con codici a barre, scorte minime con riordino automatico, valorizzazione FIFO conforme principi contabili. Smetti di ricomprare ferro che hai già, di trovare scorte ammuffite, di stimare il valore di magazzino a fine anno.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Codici a barre inclusi",
    "Valorizzazione FIFO automatica",
  ],
  proofPoints: [
    "Stock per cantiere in tempo reale",
    "Riordino automatico scorte minime",
    "Inventario valorizzato real-time",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare doppi acquisti e materiali persi nei cantieri"],
    ["Momento chiave", "Prelievo materiale dal magazzino al cantiere"],
    ["Risultato", "8% di recupero su stock sprecato"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano il Magazzino Cantiere per controllare stock distribuiti e ridurre sprechi.",
  betaBody:
    "Il Magazzino Cantiere lo attiviamo in 48 ore: configuriamo i magazzini fisici (centrale + cantieri), importiamo l'anagrafica articoli, stampiamo etichette codici a barre, attiviamo le scorte minime con riordino automatico e ti accompagniamo in 4 sessioni 1-a-1 fino al primo inventario valorizzato.",

  speedH2:
    "Stima conservativa: un'impresa con 5 cantieri attivi spreca 8% di stock l'anno tra materiali persi e doppi acquisti.",
  speedSubheadline:
    "Senza tracking magazzino multi-sito, capita: ferro tondo già a cantiere Via Roma viene ricomprato perché 'non si trovava'; sacchi di cemento dimenticati in cantiere Milano si ammuffiscono; isolante per cantiere chiuso resta nel furgone per mesi. Stock sprecato silenzioso ma costante.",
  speedStats: [
    { value: 8, prefix: "+", suffix: "%", label: "recupero su stock sprecato annuo" },
    { value: 100, suffix: "%", label: "prelievi tracciati con codici a barre" },
    { value: 24, suffix: "/7", label: "stock per cantiere consultabile da app" },
  ],

  familyH2: "Il Magazzino Cantiere collegato a ordini, cantieri e margini.",
  familySubheadline:
    "Ogni DDT in arrivo aggiorna lo stock cantiere, ogni prelievo per posa lavori imputa il costo al cantiere giusto, ogni scorta minima genera un PO automatico al fornitore. Magazzino vivo, mai obsoleto.",
  familyItems: [
    {
      icon: Tag,
      title: "Ordini Acquisto",
      text: "DDT in arrivo aggiornano automaticamente lo stock di magazzino cantiere.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Prelievi imputati al cantiere giusto per costo materiali reale.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Valorizzazione FIFO alimenta analisi margine progetto in tempo reale.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Inbox,
      title: "Cassetto Fiscale SDI",
      text: "Fatture passive riconciliate con DDT e movimenti di magazzino.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: Wallet,
      title: "Cassa Cantiere",
      text: "Costo materiali reale alimenta valorizzazione SAL e fatturazione.",
      to: "/funzionalita/cassa-cantiere",
    },
    {
      icon: ClipboardCheck,
      title: "Giornale Lavori",
      text: "Materiali utilizzati al giorno tracciati nel giornale di cantiere.",
      to: "/funzionalita/giornale-lavori",
    },
  ],
  familyBonusTitle: "Una sola fonte di stock. Una sola valorizzazione. Niente più scorte fantasma.",
  familyBonusText:
    "Quando arriva un DDT, lo stock del cantiere si aggiorna. Quando l'operaio preleva materiale per posa, scansiona codice a barre e lo stock cala. Quando una scorta scende sotto soglia, il PO automatico parte al fornitore. Quando chiudi il cantiere, lo stock residuo si trasferisce al magazzino centrale. Tutto vivo, sempre vero.",

  painKicker: "Il problema vero",
  painH2:
    "Ferro tondo ricomprato perché 'non si trovava'. Cemento ammuffito in cantiere chiuso. Inventario di fine anno fatto a occhio.",
  painSubheadline:
    "Il magazzino cantiere è la zona grigia di moltissime imprese edili: stock fisico in 5-10 cantieri diversi, nessun tracking centrale, prelievi non registrati, materiali che si perdono. Stima media: 8% di costo materiali sprecato silenziosamente.",
  painPoints: [
    {
      icon: PackageX,
      title: "Doppi acquisti per materiali 'introvabili'",
      text: "Capocantiere ordina 50 sacchi di calce perché 'non si trovavano'. In realtà erano in cantiere Via Roma, dimenticati. Quando si scopre, alcuni sono già scaduti. Costo doppio + spreco.",
    },
    {
      icon: AlertTriangle,
      title: "Materiali rovinati in cantieri chiusi",
      text: "Cantiere chiuso da 3 mesi, ma 8.000€ di materiale (isolante, sigillanti, pannelli) sono ancora lì. Pioggia, sole, ratti. Quando ci si torna, è tutto da buttare. Soldi bruciati senza accorgersene.",
    },
    {
      icon: Search,
      title: "Capocantiere che cerca per 30 minuti",
      text: "Capocantiere chiede 'dov'è il sigillante poliuretanico?'. Non in magazzino centrale, non in furgone, forse in cantiere Milano. 30 minuti di telefonate, poi ricomprato. Tempo bruciato + acquisto doppio.",
    },
    {
      icon: Database,
      title: "Inventario di fine anno fatto a occhio",
      text: "Il commercialista chiede valorizzazione magazzino al 31/12. Risposta: 'circa 35.000€'. Stima approssimativa, valorizzazione FIFO impossibile, bilancio non auditabile, IVA su rimanenze sbagliata.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi cantieri, stessi materiali, stessi furgoni. Cambia il controllo e il valore reale.",
  baSubheadline:
    "Il Magazzino Cantiere non aumenta lo stock: lo rende visibile e tracciabile. Materiali che esistevano ma 'non si trovavano' tornano disponibili, materiali in cantieri chiusi tornano al centrale, scorte minime impediscono ordini emergenza.",
  baAreas: [
    {
      title: "Visibilità stock multi-cantiere",
      before:
        "Stock disperso in 5-10 cantieri diversi, nessuna visibilità centrale. Capocantiere chiede a colleghi 'avete X?', telefonate, perdita tempo, doppi acquisti.",
      after:
        "Apri app, cerchi articolo: vedi stock in tempo reale per cantiere, magazzino centrale, furgone capocantiere. Sai dove andare a prelevare, niente doppi acquisti.",
    },
    {
      title: "Tracking prelievi e movimenti",
      before:
        "Operaio preleva 30 mattoni dal magazzino cantiere, niente registrazione. A fine settimana, nessuno sa cosa è uscito, cosa è entrato, cosa serve riordinare.",
      after:
        "Operaio scansiona codice a barre articolo + cantiere su app, prelievo registrato, stock aggiornato in tempo reale. Imputazione automatica del costo al cantiere giusto.",
    },
    {
      title: "Riordino automatico scorte minime",
      before:
        "Scorte minime gestite a memoria capocantiere. Ferro tondo finisce, capocantiere se ne accorge il giorno della posa, ordine emergenza con prezzo +20%.",
      after:
        "Scorte minime per articolo configurate. Quando stock scende sotto soglia, PO automatico parte al fornitore preferito con prezzo listino. Niente più ordini emergenza.",
    },
    {
      title: "Inventario e valorizzazione",
      before:
        "Inventario fine anno fatto a occhio in 2 giorni di lavoro segreteria. Valorizzazione approssimativa, FIFO impossibile, bilancio non auditabile.",
      after:
        "Inventario sempre aggiornato, valorizzazione FIFO automatica per articolo, esportazione bilancio in 5 minuti. Stock real-time consultabile da titolare e commercialista.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare ordine nel magazzino multi-cantiere.",
  mechanismSubheadline:
    "Il Magazzino Cantiere funziona con codici a barre stampati su etichette resistenti: ogni movimento è una scansione di 3 secondi, nessuna formazione complicata richiesta agli operai.",
  mechanismSteps: [
    {
      icon: Barcode,
      title: "Codici a barre per articoli e cantieri",
      text: "Stampi etichette codici a barre per articoli (mattoni, ferro, sacchi cemento, ecc.) e identificativi cantiere. Operaio scansiona articolo + cantiere, prelievo registrato, niente compilazione manuale.",
    },
    {
      icon: PackageCheck,
      title: "Movimenti tracciati in tempo reale",
      text: "Ogni DDT in arrivo aggiorna stock cantiere, ogni prelievo lo riduce, ogni trasferimento tra cantieri è registrato. Stock per cantiere consultabile da app capocantiere e dashboard titolare 24/7.",
    },
    {
      icon: RefreshCw,
      title: "Scorte minime e riordino automatico",
      text: "Per ogni articolo configuri scorta minima per cantiere. Quando lo stock scende sotto soglia, sistema genera PO automatico al fornitore preferito, tu approvi in 5 secondi.",
    },
  ],
  mechanismCta: "Apri la demo Magazzino Cantiere",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "8% di recupero su stock sprecato. Inventario sempre vero. Niente più ordini emergenza.",
  commercialBody:
    "Il Magazzino Cantiere non aumenta lo stock: lo rende visibile e usabile. Le imprese che lo attivano recuperano in media l'8% sul costo materiali eliminando doppi acquisti, materiali rovinati e ordini emergenza con prezzo gonfiato.",
  commercialLevers: [
    {
      icon: TrendingDown,
      title: "8% recupero su costo materiali",
      text: "Doppi acquisti eliminati (visibilità stock multi-cantiere), materiali rovinati ridotti (alert scadenza, recupero da cantieri chiusi), ordini emergenza azzerati (riordino automatico scorte minime).",
    },
    {
      icon: Zap,
      title: "Niente più ordini emergenza",
      text: "Scorte minime con riordino automatico al fornitore preferito a prezzo listino. Niente più ordini last-minute con prezzi +20% perché 'serve domani'.",
    },
    {
      icon: ShieldCheck,
      title: "Inventario auditabile e FIFO",
      text: "Valorizzazione FIFO automatica conforme principi contabili. Bilancio auditabile dal revisore, IVA su rimanenze accurata, fido bancario più facile da ottenere.",
    },
    {
      icon: Sparkles,
      title: "Capocantiere che lavora più veloce",
      text: "Niente più 30 minuti di telefonate per cercare materiali. Apri app, vedi dove sono, prelevi. Tempo recuperato per il lavoro vero in cantiere.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Lo stock smette di essere un mistero. Diventa una risorsa controllata.",
  resultsBody:
    "Quando ogni movimento di magazzino è tracciato e ogni cantiere ha visibilità sui propri stock, l'impresa cambia paradigma: niente più sprechi, niente più doppi acquisti, niente più inventari a sentimento. Le imprese che attivano Magazzino Cantiere vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Warehouse,
      title: "Multi-magazzino multi-cantiere",
      text: "Magazzino centrale, magazzini cantiere, furgoni capocantiere. Stock per ogni location consultabile da app mobile e dashboard, sempre real-time.",
    },
    {
      icon: Barcode,
      title: "Codici a barre e scansione veloce",
      text: "Etichette resistenti per articoli e cantieri. App scanner mobile o pistola Bluetooth. Movimento registrato in 3 secondi, niente compilazione manuale.",
    },
    {
      icon: PackageOpen,
      title: "Scorte minime e riordino automatico",
      text: "Configurazione per articolo per cantiere. Quando stock scende sotto soglia, PO automatico al fornitore preferito a prezzo listino, tu approvi in 5 secondi.",
    },
    {
      icon: Database,
      title: "Valorizzazione FIFO automatica",
      text: "Conforme principi contabili italiani. Inventario sempre aggiornato, esportazione bilancio in 5 minuti, audit trail completo per revisore o GdF.",
    },
  ],
  resultStats: [
    { value: 8, prefix: "+", suffix: "%", label: "recupero su stock sprecato annuo" },
    { value: 100, suffix: "%", label: "prelievi tracciati con codici a barre" },
    { value: 5, suffix: " min", label: "tempo per inventario valorizzato (era 2 giorni)" },
  ],
  resultsCta: "Apri la demo Magazzino Cantiere",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se il magazzino smette di essere una zona grigia?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e valore stock medio per cantiere. La stima parte dall'8% di recupero su stock sprecato osservato sui clienti dopo 6 mesi.",
  roi: {
    input1Label: "Cantieri attivi",
    input1Default: 6,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Valore stock medio per cantiere (€)",
    input2Default: 12000,
    input2Min: 1000,
    input2Max: 200000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Recupero annuo stimato",
    computeOutput: (a, b) => Math.round(a * b * 0.08),
    computeSecondary: (a, b) => [
      { label: "Stock totale gestito", value: `€ ${(a * b).toLocaleString("it-IT")}` },
      { label: "Riduzione doppi acquisti attesa", value: "8%" },
      { label: "Tempo capocantiere recuperato/anno", value: `${a * 50} h` },
    ],
    closingPitch:
      "Stima prudenziale basata sull'8% di recupero medio su stock sprecato (doppi acquisti, materiali rovinati, ordini emergenza). Aggiungi il valore del controllo costi cantiere in tempo reale e l'inventario sempre auditabile.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un altro modulo software. Una disciplina che il magazzino non ha mai avuto.",
  salesBody:
    "Il Magazzino Cantiere Edilizia in Cloud non è solo un sistema di tracking: è una disciplina operativa applicata via app mobile e codici a barre. Le imprese che lo attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Capocantiere veloce e informato",
      text: "Capocantiere apre app, vede stock multi-cantiere in 5 secondi. Niente più 30 minuti di telefonate per cercare materiali, niente più doppi acquisti per dimenticanze.",
    },
    {
      title: "Materiali recuperati da cantieri chiusi",
      text: "Quando un cantiere chiude, lo stock residuo si trasferisce automaticamente al magazzino centrale. Materiali che prima si rovinavano in cantiere chiuso tornano disponibili.",
    },
    {
      title: "Bilancio auditabile dal revisore",
      text: "Valorizzazione FIFO automatica, audit trail completo, inventario aggiornato in tempo reale. Revisore o GdF possono auditare bilancio in 30 minuti.",
    },
    {
      title: "Negoziazione fornitori basata su consumi",
      text: "Storico consumi per articolo per cantiere. Negoziazione annuale fornitori basata su volumi reali, non stime. Sconti volume sistematici.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Multi-magazzino multi-cantiere",
      value:
        "Magazzino centrale, magazzini cantiere, furgoni capocantiere. Numero illimitato, stock real-time per ogni location, dashboard consolidata e per location.",
    },
    {
      label: "Codici a barre per articoli e cantieri",
      value:
        "Etichette resistenti incluse per primo setup. App scanner mobile (iOS/Android) o pistola Bluetooth. Movimento registrato in 3 secondi.",
    },
    {
      label: "Tracking prelievi e trasferimenti",
      value:
        "Ogni movimento (carico DDT, prelievo, trasferimento tra cantieri, reso fornitore) è tracciato con timestamp, operatore, cantiere. Audit trail completo.",
    },
    {
      label: "Scorte minime con riordino automatico",
      value:
        "Per ogni articolo per cantiere configuri scorta minima. Quando stock scende sotto soglia, PO automatico al fornitore preferito a prezzo listino.",
    },
    {
      label: "Valorizzazione FIFO automatica",
      value:
        "Conforme principi contabili italiani. Aggiornamento real-time, esportazione bilancio in 5 minuti, IVA su rimanenze accurata.",
    },
    {
      label: "Imputazione costo al cantiere",
      value:
        "Ogni prelievo imputa costo al cantiere giusto. Margine cantiere aggiornato in tempo reale, niente più stime a fine lavori.",
    },
    {
      label: "Inventario e analisi consumi",
      value:
        "Storico consumi per articolo per cantiere, trend temporale, alert anomalie consumo. Strumenti decisionali per negoziazioni fornitori e ottimizzazione acquisti.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il Magazzino Cantiere cambia la giornata.",
  scenarios: [
    {
      title: "Capocantiere cerca isolante alle 8 di mattina",
      text: "Capocantiere ha urgenza di 20 m² di isolante. Apre app: 32 m² disponibili in cantiere chiuso a Verona, ritirabili oggi. Anziché ordinare nuovo (3 giorni di attesa, costo +280€), recupera dal cantiere chiuso in 1 ora.",
    },
    {
      title: "Riordino ferro tondo automatico",
      text: "Stock ferro tondo D14 scende sotto soglia 200 metri. Sistema genera PO automatico al fornitore preferito con prezzo listino. Tu approvi in 5 secondi, fornitore consegna in 2 giorni. Niente ordine emergenza con prezzo gonfiato.",
    },
    {
      title: "Inventario per il commercialista al 31/12",
      text: "Commercialista chiede valorizzazione magazzino al 31 dicembre. Esporti report FIFO in 5 minuti: 47.230€ stock multi-cantiere dettagliato per articolo. Bilancio chiuso in tempo, IVA su rimanenze accurata, audit revisore agile.",
    },
  ],

  testimonialQuote:
    "Avevo 7 cantieri attivi e stock disperso ovunque. Quando un capocantiere chiedeva qualcosa, partivano 5 telefonate. Spesso ricomprava perché 'non si trovava'. Ho attivato Magazzino Cantiere: nei primi 4 mesi ho scoperto 18.000€ di materiali in cantieri chiusi che credevo persi. Riportati al centrale, riutilizzati nei nuovi cantieri. Pagamento del modulo recuperato in 2 mesi.",
  testimonialAuthor: "Giorgio B.",
  testimonialRole: "Bianchi Costruzioni Spa, Modena",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Devo etichettare ogni singolo articolo? Non è troppo lavoro?",
      a: "No. Etichetti i contenitori (pallet di mattoni, bobine ferro, sacchi cemento) o le ubicazioni di stoccaggio. Per articoli sfusi (calce, sabbia) tracciamento per peso/volume. Onboarding include stampa etichette e setup primo magazzino: 1 giorno di lavoro per impresa media.",
    },
    {
      q: "Funziona se i cantieri sono in zone senza copertura mobile?",
      a: "Sì. App funziona offline: registra prelievi, trasferimenti, codici a barre localmente. Quando rientra in copertura, sync automatico. Nessuna perdita dati anche su cantieri remoti.",
    },
    {
      q: "Si integra con il mio gestionale fornitori esistente?",
      a: "Sì se è il gestionale Edilizia in Cloud (Ordini Acquisto, Cassetto SDI, Margini Cantiere). Per gestionali esterni, API REST disponibili nel piano Business per integrazione bidirezionale (DDT in arrivo, riordini automatici).",
    },
    {
      q: "La valorizzazione FIFO è davvero auditabile?",
      a: "Sì. Conforme principi contabili italiani OIC 13. Audit trail completo per ogni movimento (carico, prelievo, trasferimento) con costo storicizzato. Esportazione bilancio in formato accettato dal revisore, GdF, fido bancario.",
    },
    {
      q: "Posso gestire scorte minime diverse per cantiere?",
      a: "Sì. Per ogni articolo configuri scorta minima diversa per ogni cantiere/magazzino. Es. cantiere principale: 500 mattoni minimi, cantiere piccolo: 100 minimi. Sistema gestisce riordini automatici cantiere per cantiere.",
    },
    {
      q: "Quanto costa? Ci sono limiti su numero cantieri o articoli?",
      a: "Magazzino Cantiere è incluso nei piani Professional e Business di Edilizia in Cloud. Cantieri illimitati, articoli illimitati, app scanner inclusa. Etichette codici a barre e formazione iniziale incluse nei primi 30 giorni.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il Magazzino Cantiere è il cuore operativo dei materiali.",
  internalLinksBody:
    "Stock, prelievi, riordini si parlano con ordini fornitore, cantieri, fatture passive e analisi margini. Una sola fonte di verità sui materiali.",
  internalLinks: [
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "DDT in arrivo aggiornano stock di magazzino cantiere automaticamente." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Prelievi imputati al cantiere giusto per costo materiali reale." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Valorizzazione FIFO alimenta analisi margine progetto." },
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto Fiscale SDI", text: "Fatture passive riconciliate con DDT e movimenti magazzino." },
    { to: "/funzionalita/cassa-cantiere", title: "Cassa Cantiere", text: "Costo materiali reale alimenta valorizzazione SAL e fatturazione." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Materiali utilizzati al giorno tracciati nel giornale di cantiere." },
    { to: "/funzionalita/gestione-subappalti", title: "Gestione Subappalti", text: "Materiali forniti a subappaltatori tracciati con prelievi." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Magazzino Cantiere incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di ricomprare materiali che hai già. Inizia a sapere dove sono e quanto valgono.",
  finalCtaBody:
    "31 giorni gratuiti per portare il Magazzino Cantiere dentro la tua impresa edile. Setup in 48 ore, codici a barre, scorte minime con riordino automatico, valorizzazione FIFO inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Codici a barre inclusi · FIFO automatico",

  stickyCtaLabel: "Prova gratis Magazzino Cantiere",
  stickyCtaMicrocopy: "Setup 48h · Codici a barre + FIFO",

  applicationSubCategory: "Construction Inventory Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function MagazzinoCantiere() {
  return <FunzionalitaPageTemplate config={config} />;
}
