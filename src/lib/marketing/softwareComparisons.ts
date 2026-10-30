export const comparisonSources = {
  teamsystem: { name: "TeamSystem Construction: la famiglia di prodotti", url: "https://www.teamsystem.com/construction/" },
  cpm: { name: "TeamSystem CPM AI: commessa, costi, Gantt, BIM e SAL", url: "https://www.teamsystem.com/construction/project-management/" },
  cpmAgents: { name: "TeamSystem CPM AI: agenti AI per gare, computi e documenti", url: "https://www.teamsystem.com/construction/project-management/funzionalita/agenti-ai/" },
  cpmMobile: { name: "TeamSystem Cantieri App: rapportini da smartphone e tablet", url: "https://www.teamsystem.com/construction/project-management/funzionalita/mobile/" },
  tseCostruzioni: { name: "TeamSystem TSE Costruzioni AI: contabilità, SAL e magazzino", url: "https://www.teamsystem.com/construction/gestione-imprese/" },
  tsCantieri: { name: "TeamSystem TS Cantieri: piccole imprese edili e artigiane", url: "https://www.teamsystem.com/construction/teamsystem-cantieri/" },
  tsSicurezza: { name: "TeamSystem TS Sicurezza Cantieri: POS e PSC", url: "https://www.teamsystem.com/construction/sicurezza-cantieri/" },
  primus: { name: "ACCA PriMus: computo e contabilità lavori", url: "https://www.acca.it/software-contabilita-lavori" },
  primusRevisione: { name: "ACCA PriMus: revisione prezzi con le TOL", url: "https://www.acca.it/come-fare-la-revisione-prezzi-con-primus" },
  primusOnline: { name: "ACCA PriMus online: computo nel browser", url: "https://www.acca.it/computo-metrico-online" },
  accaSibilla: { name: "BibLus, il magazine di ACCA: l'assistente AI SIBILLA", url: "https://biblus.acca.it/notizie/arriva-sibilla-lai-esperta-delle-costruzioni/" },
  planradar: { name: "PlanRadar: documenti, report, BIM e pianificazione", url: "https://www.planradar.com/it/" },
  pillar: { name: "Pillar: preventivi, DDT, acquisti e commesse", url: "https://www.pillar.it/" },
  pillarSal: { name: "Pillar: SAL e avanzamento lavori", url: "https://www.pillar.it/gestione-sal-stato-avanzamento-lavori" },
  pillarInvoices: { name: "Pillar: fatturazione elettronica e SDI", url: "https://www.pillar.it/fatturazione" },
  pillarReports: { name: "Pillar: bolle e rapportini", url: "https://www.pillar.it/gestione-ddt-e-rapportini" },
  pillarJobs: { name: "Pillar: costi, ore e margini di commessa", url: "https://www.pillar.it/gestione-commessa" },
  dylog: { name: "Dylog: soluzioni per imprese edili", url: "https://www.dylog.it/software-gestionali/aziende/edilizia/" },
};

export const softwareComparisons = [
  { name: "Pillar", path: "/blog/edilizia-in-cloud-vs-pillar/", summary: "Confronta preventivi, SAL, SDI e costi di commessa. Scopri anche il flusso commerciale e operativo di Edilizia in Cloud.", updated: true },
  { name: "TeamSystem Construction", path: "/confronto/vs-teamsystem/", summary: "Una famiglia di prodotti (CPM AI, TS Cantieri, TS Sicurezza Cantieri, BIM) contro una sola piattaforma dal contatto all'incasso per la PMI edile.", updated: true },
  { name: "PriMus ACCA", path: "/confronto/vs-primus/", summary: "Computo e contabilità lavori: importa i computi PriMus, stampali nello stesso formato e porta il computo dentro preventivo, commessa e cantiere.", updated: true },
  { name: "PlanRadar", path: "/blog/edilizia-in-cloud-vs-planradar/", summary: "Documentazione, ispezioni e pianificazione di cantiere: confronta questi flussi con il controllo economico.", updated: true },
  { name: "Dylog Edilizia", path: "/blog/edilizia-in-cloud-vs-dylog-edilizia/", summary: "Amministrazione e operatività di cantiere: due esigenze da collegare nella gestione dell’impresa.", updated: true },
  { name: "Excel", path: "/confronto/vs-excel/", summary: "Quando i fogli bastano e quando ore, bolle e costi richiedono un flusso condiviso.", updated: true },
  { name: "Edilnet", path: "/confronto/vs-edilnet/", summary: "Confronta le procedure che usi oggi con il flusso preventivo, commessa e controllo dei costi.", updated: true },
  { name: "Buildertrend", path: "/confronto/vs-buildertrend/", summary: "Processi di cantiere e collaborazione: il confronto per un’impresa che lavora in Italia.", updated: true },
];

export const demoChecklist = [
  "Porta un tuo computo o preventivo, anche fatto in PriMus: guarda se le voci entrano senza ricopiarle.",
  "Mandalo in firma al cliente e trasformalo in commessa: controlla fasi, date, squadre e costo previsto.",
  "Fai timbrare e compilare un rapportino dal telefono a un tuo operaio: ore, persona, cantiere e fase.",
  "Fotografa una bolla del fornitore: verifica che finisca sull'ordine giusto e in magazzino, senza costi doppi.",
  "Prepara un SAL: guarda la rata che matura alla firma del cliente e la fattura che parte.",
  "A fine prova leggi il margine della commessa: previsto, reale e dati ancora da completare.",
];

export interface ComparisonRow {
  topic: string;
  eic: string;
  other: string;
  impact: string;
  /** Pagina ufficiale del concorrente da cui viene la colonna «other». */
  source?: string;
  /** Pagina di Edilizia in Cloud che spiega la funzione (rotta /funzionalita/... esistente). */
  eicPath?: string;
}

export interface ComparisonGuide {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  answer: string;
  eicFit: string;
  otherFit: string;
  /** Dove il concorrente è più forte, come dichiarato sulle sue pagine ufficiali. */
  otherStrengths?: string[];
  eicLink?: { to: string; label: string };
  /** Novità recenti di Edilizia in Cloud pertinenti a questo confronto. */
  news?: Array<{ title: string; text: string; path?: string }>;
  rows: ComparisonRow[];
  sources: Array<{ name: string; url: string }>;
  faqs: Array<{ q: string; a: string }>;
}

const ts = comparisonSources;

export const teamsystemGuide: ComparisonGuide = {
  slug: "vs-teamsystem", competitor: "TeamSystem Construction",
  title: "Edilizia in Cloud vs TeamSystem Construction: il confronto",
  description: "TeamSystem Construction è una famiglia di prodotti; Edilizia in Cloud una sola piattaforma dal contatto all'incasso per la PMI edile. Fonti ufficiali.",
  answer: "TeamSystem Construction è una famiglia di prodotti: CPM AI per la commessa, TSE Costruzioni AI per l'amministrazione, TS Cantieri per le piccole imprese, TS Sicurezza Cantieri, software BIM e altri. Edilizia in Cloud è una sola piattaforma per la PMI edile: il cliente entra come contatto, firma il preventivo dal telefono, la commessa nasce da sola, la squadra timbra e scrive il rapportino, il SAL diventa una rata e la fattura parte allo SDI. Qui trovi cosa dichiara TeamSystem sul suo sito e cosa fa oggi Edilizia in Cloud.",
  eicFit: "Valuta Edilizia in Cloud se sei una PMI che vende al privato o lavora in subappalto e vuoi un solo posto per tutto: trattative, preventivi di mestiere, firma con codice OTP, commessa con economia per fase, app per gli operai, SAL e rate, fatture e controllo di gestione. Ufficio e cantiere lavorano sullo stesso dato, senza passaggi da un programma all'altro.",
  otherFit: "Valuta TeamSystem Construction se ti servono strumenti che vanno oltre la commessa della PMI: progettazione e BIM, PSC, gestione delle gare con l'AI, un ERP con contabilità e adempimenti fiscali, prezzari DEI, o se il tuo commercialista e la tua amministrazione lavorano già con altri prodotti TeamSystem.",
  otherStrengths: [
    "BIM: software BIM, BIM Audit, ambiente di condivisione (CDE) e BIM 4D/5D dentro CPM AI.",
    "Sicurezza: oltre al POS, il PSC con la gestione delle interferenze (TS Sicurezza Cantieri).",
    "Gare: un agente AI che legge i bandi in PDF, estrae i KPI e controlla la coerenza dei documenti.",
    "Amministrazione: contabilità dell'impresa edile e adempimenti contabili e fiscali in TSE Costruzioni AI.",
    "Badge di cantiere digitale secondo il DL 159/2025, dichiarato in TS Cantieri.",
  ],
  eicLink: { to: "/funzionalita/gestione-commesse/", label: "Vedi come funziona la commessa" },
  news: [
    { title: "Preventivo con computo per ogni azienda", text: "Dal 29 ottobre ogni impresa può fare il preventivo a computo: capitoli, voci con misure, ore e marca, voci opzionali. Si firma online e diventa la commessa.", path: "/funzionalita/computo-metrico/" },
    { title: "Timbratura a un tocco", text: "L'operaio apre l'app e timbra: una giornata sola, e se cambia cantiere tocca il nuovo luogo. Ogni azienda decide le sue regole su rapportini e presenze.", path: "/funzionalita/timbrature-gps/" },
    { title: "SAL uguale a rata", text: "Il SAL nasce dalle fasi, il cliente lo firma dal link e la rata matura in quel momento. L'ufficio sa cosa fatturare senza rifare i conti." },
    { title: "Controllo di gestione rivisto", text: "Conto economico riclassificato, cash flow, posizione finanziaria, indici e un pacchetto per la banca che dice «bozza» se i dati non quadrano.", path: "/funzionalita/cruscotto-aziendale/" },
    { title: "Costi senza fattura", text: "Il gasolio, il ferramenta sotto casa, lo scontrino: si fotografa la ricevuta, si sceglie la fase e il costo entra nella commessa una volta sola." },
  ],
  rows: [
    { topic: "Com'è fatta l'offerta", eic: "Una sola piattaforma: contatto, preventivo, firma, commessa, cantiere, SAL, fattura, incasso e controllo di gestione. I moduli si accendono in base al piano e ogni persona vede solo quello che le serve.", other: "Dichiarato sul sito ufficiale: una famiglia di prodotti per tutto il ciclo dell'opera, tra cui CPM AI, Cantieri App, TSE Costruzioni AI, TS Cantieri, software BIM, TS Sicurezza Cantieri, CRM, Prezzari DEI e Oracle Primavera.", impact: "Con una piattaforma unica il dato scritto una volta passa dalla trattativa alla fattura. Con una famiglia di prodotti chiedi quali ti servono davvero e come si passano i dati.", source: ts.teamsystem.url },
    { topic: "Clienti e trattative", eic: "Contatti e opportunità a fasi, motivo di perdita obbligatorio, calendario con km dalla sede e prenotazione online. I lead arrivano dai moduli Facebook e Instagram che l'azienda attiva; con WhatsApp Business un agente risponde e fissa l'appuntamento sul calendario vero.", other: "Dichiarato sul sito ufficiale: un prodotto CRM è elencato nella famiglia Construction.", impact: "Il commerciale apre il telefono e vede chi richiamare oggi. Il preventivo parte dalla trattativa, senza ricopiare nome, indirizzo e lavoro.", source: ts.teamsystem.url, eicPath: "/funzionalita/crm-edilizia/" },
    { topic: "Preventivo e computo", eic: "Preventivatori di mestiere (serramenti con disegno automatico degli infissi nel PDF, fotovoltaico con piano di posa e simulazione di produzione, bagni, tetti, clima, ristrutturazioni e altri) e preventivo a computo per ogni azienda, con import dei computi PriMus e 19 prezzari regionali.", other: "Dichiarato sul sito ufficiale: TS Cantieri gestisce preventivi e computi; in CPM AI il computo è collegato al Gantt e un agente AI trasforma un computo in PDF in dati modificabili, esportabili in XLS o CSV.", impact: "Il serramentista e l'impiantista fanno il preventivo con le voci del loro mestiere; chi lavora a computo riparte dal file che ha già, senza ribattere le voci.", source: ts.cpmAgents.url, eicPath: "/funzionalita/preventivi-edilizia/" },
    { topic: "Firma del cliente", eic: "Firma elettronica con codice OTP via SMS o email su una copia del PDF bloccata, doppia firma delle clausole (art. 1341), cointestatario, verifica pubblica del documento firmato. Varianti e SAL si firmano dallo stesso tipo di link.", other: "La firma del cliente sul preventivo non è indicata nelle pagine ufficiali lette.", impact: "Il cliente firma dal divano, l'ufficio vede subito il contratto firmato e la commessa può partire. Nessuna carta da scansionare.", eicPath: "/funzionalita/firma-elettronica/" },
    { topic: "Commessa ed economia per fase", eic: "Fasi e sottofasi con date, squadre e cronoprogramma che prende le date reali dai rapportini. Per ogni lavorazione: venduto, costo previsto (da preventivo e listino manodopera), costo reale e margine. Allarme se i costi corrono più dell'avanzamento.", other: "Dichiarato sul sito ufficiale: CPM AI segue tutto il ciclo della commessa dalla gara agli acquisti, con costi preventivati ed effettivi, scostamenti, confronto dei margini fra commesse, Gantt, subappalti, SAL e giornale dei lavori.", impact: "A metà lavoro sai quale fase sta mangiando il margine, non a fine anno quando il commercialista chiude i conti.", source: ts.cpm.url, eicPath: "/funzionalita/gestione-commesse/" },
    { topic: "Cantiere dal telefono", eic: "App per gli operai: timbratura a un tocco con GPS e cambio di luogo, rapportino diverso per operaio e caposquadra (anche a voce), foto, merce presa in negozio con la foto dello scontrino, mezzi e attrezzi con etichetta QR, documenti e buste paga.", other: "Dichiarato sul sito ufficiale: Cantieri App per smartphone e tablet, collegata a CPM, per i rapportini; TS Cantieri dichiara timbratura da app con geolocalizzazione, turni, presenze e badge di cantiere digitale (DL 159/2025).", impact: "La sera l'ufficio ha ore, foto e spese della giornata senza telefonate. Chi sta in cantiere usa due tasti, non un gestionale.", source: ts.tsCantieri.url, eicPath: "/funzionalita/app-cantiere-mobile/" },
    { topic: "Acquisti, bolle e magazzino", eic: "Ordini ai fornitori e richieste d'offerta; la bolla fotografata viene letta con l'AI, abbinata all'ordine e, alla conferma, carica il magazzino. Prelievo dal cantiere libero o con conferma dell'ufficio.", other: "Dichiarato sul sito ufficiale: in CPM AI un agente importa DDT, richieste d'acquisto, rapportini, fatture e offerte da PDF o foto, da validare prima dell'import; TSE Costruzioni AI dichiara magazzino e logistica.", impact: "La bolla non resta nel furgone: il costo finisce sulla commessa giusta e la giacenza è vera.", source: ts.cpmAgents.url, eicPath: "/funzionalita/ddt-digitali/" },
    { topic: "Sicurezza in cantiere", eic: "POS sul modello ufficiale (DI 9/9/2014) con controllo dell'Allegato XV, DUVRI, verifica di idoneità tecnico-professionale con requisiti e scadenze, avvisi sulle scadenze del DURC.", other: "Dichiarato sul sito ufficiale: TS Sicurezza Cantieri redige il POS da un archivio precompilato e personalizzabile, il PSC con la gestione delle interferenze e usa l'AI per suggerire misure e controllare la completezza.", impact: "Se fai solo il POS della tua impresa, lo prepari dove stanno già operai e mezzi. Se redigi anche il PSC da coordinatore, TeamSystem dichiara uno strumento dedicato.", source: ts.tsSicurezza.url, eicPath: "/funzionalita/sicurezza-cantiere/" },
    { topic: "SAL, fatture e incassi", eic: "Il SAL nasce dalle fasi e coincide con la rata del piano di pagamento; il cliente lo firma dal link e la rata matura. Fattura elettronica allo SDI, fatture dei fornitori ricevute in automatico, scadenzario e incassi.", other: "Dichiarato sul sito ufficiale: CPM AI, TS Cantieri e TSE Costruzioni AI gestiscono i SAL; TS Cantieri dichiara fatture elettroniche attive e passive sull'esperienza di Fatture in Cloud; TSE Costruzioni AI copre contabilità e adempimenti fiscali.", impact: "Dal SAL firmato alla fattura passano minuti, non giorni. La contabilità generale e il bilancio restano al commercialista, che in Edilizia in Cloud ha il suo accesso.", source: ts.tseCostruzioni.url, eicPath: "/funzionalita/fatturazione-elettronica/" },
    { topic: "Controllo di gestione", eic: "Margini per commessa, conto economico riclassificato, budget, cash flow, posizione finanziaria netta, indici e rating, previsionale di cassa con scenari e pacchetto per la banca.", other: "Dichiarato sul sito ufficiale: nella pagina di CPM AI sono citati agenti contabili che suggeriscono registrazioni e codici IVA, riconciliano la banca e avvisano sulle scadenze fiscali.", impact: "Prima di chiedere un fido sai cosa vedrà la banca, e lo vedi con i numeri dei cantieri, non con quelli dell'anno scorso.", source: ts.cpm.url, eicPath: "/funzionalita/cruscotto-aziendale/" },
    { topic: "BIM e progettazione", eic: "Niente BIM e niente file IFC. Si lavora su computo, fasi e disegni DXF, da cui l'app conta blocchi e lunghezze per i materiali.", other: "Dichiarato sul sito ufficiale: software BIM, BIM Audit, ambiente di condivisione TS CDE, TS Engineering AI e BIM 4D/5D in CPM AI.", impact: "Se progetti o consegni in BIM, TeamSystem copre un lavoro che Edilizia in Cloud non fa. Se il tuo disegno è una pianta in DXF, ti basta per contare i materiali.", source: ts.teamsystem.url },
    { topic: "Clienti, subappaltatori e commercialista", eic: "Portale del cliente (avanzamento, documenti, firme, rate, assistenza), app del subappaltatore con i suoi documenti, accesso del commercialista a più aziende. Assistenza post-vendita con ticket a 9 stati e interventi a squadre.", other: "Dichiarato sul sito ufficiale: CPM AI offre collaborazione in cloud con i subappaltatori; la famiglia comprende TS Asset Management per la gestione degli immobili.", impact: "Il cliente non telefona per sapere a che punto sei, il subappaltatore carica da solo il DURC, il commercialista prende i documenti senza email.", source: ts.cpm.url, eicPath: "/funzionalita/portale-clienti/" },
  ],
  sources: [ts.teamsystem, ts.cpm, ts.cpmAgents, ts.cpmMobile, ts.tseCostruzioni, ts.tsCantieri, ts.tsSicurezza],
  faqs: [
    { q: "TeamSystem Construction è un solo programma?", a: "No. Sul sito ufficiale è una famiglia di prodotti: CPM AI per la commessa, Cantieri App per i rapportini, TSE Costruzioni AI per l'amministrazione, TS Cantieri per le piccole imprese, TS Sicurezza Cantieri, software BIM e altri. Prima di confrontare, chiedi quali prodotti ti vengono proposti." },
    { q: "Qual è la differenza principale con Edilizia in Cloud?", a: "Edilizia in Cloud è una piattaforma unica pensata per la PMI edile, dal contatto all'incasso: CRM, preventivi di mestiere, firma con codice OTP, commessa con economia per fase, app per gli operai, SAL come rata, fatture allo SDI e controllo di gestione. TeamSystem copre un perimetro più ampio con più prodotti, compresi BIM, PSC e un ERP con contabilità." },
    { q: "Edilizia in Cloud fa anche BIM e contabilità generale?", a: "No. Non lavora su modelli BIM o IFC: legge i disegni DXF per contare i materiali. Non tiene la contabilità ordinaria né il bilancio: gestisce fatture, registro IVA, scadenzario, tesoreria e controllo di gestione, e dà un accesso al commercialista. Se ti servono BIM o un ERP contabile, TeamSystem li dichiara." },
    { q: "Quale scegliere per una piccola impresa edile?", a: "Parti dai processi di tutti i giorni: trattative, preventivo, ore, bolle, SAL e margine. Fai fare lo stesso caso reale a entrambi i fornitori e fai provare il telefono a un tuo operaio. La dimensione dell'impresa, da sola, non decide quale software sia adatto." },
    { q: "Posso portare i dati da TeamSystem?", a: "Il trasferimento parte da un campione dei dati esportati: anagrafiche, commesse aperte e documenti. Con l'avvio assistito decidi cosa portare e da dove ripartire con importi e avanzamento. Se usi Fatture in Cloud, Edilizia in Cloud ne importa fatture e clienti." },
  ],
};

const pm = comparisonSources;

export const primusGuide: ComparisonGuide = {
  slug: "vs-primus", competitor: "PriMus ACCA",
  title: "PriMus ACCA o Edilizia in Cloud? Computo e commessa",
  description: "PriMus fa computo e contabilità lavori. Edilizia in Cloud importa i computi PriMus e li porta in preventivo, commessa, SAL e cantiere. Fonti ufficiali.",
  answer: "PriMus di ACCA è il programma di computo metrico e contabilità lavori che usano tecnici, imprese e PA. Edilizia in Cloud è il gestionale dell'impresa: da ottobre 2026 ogni azienda fa il preventivo a computo, importa i computi PriMus in XPWE o PDF senza ricopiarli, li ristampa con la stessa impaginazione e, sui lavori pubblici, tiene libretto, registro, SAL e certificato di pagamento dentro la commessa. Poi lo stesso computo diventa fasi, squadre, ore, materiali, rate e fatture. PriMus resta più forte sugli elaborati tecnici: qui sotto vedi dove.",
  eicFit: "Valuta Edilizia in Cloud se il computo per te è l'inizio del lavoro e non la fine: devi farlo firmare al cliente, trasformarlo in commessa, mandare le squadre, comprare i materiali, fatturare i SAL e capire a fine lavoro quanto hai guadagnato. Il tecnico può continuare con PriMus: tu riprendi il suo file.",
  otherFit: "Valuta PriMus se il tuo lavoro è produrre elaborati tecnici: computi, analisi prezzi, contabilità dei lavori pubblici per la direzione lavori o la stazione appaltante, revisione prezzi, computo da CAD o da modello BIM. ACCA dichiara la conformità al Codice Appalti (D.Lgs. 36/2023) e ai CAM.",
  otherStrengths: [
    "Elaborati di contabilità più completi: anche sommario, liste in economia e libretto dei ferri.",
    "Revisione prezzi con le 20 TOL e gli indici ISTAT, calcolata nel SAL; ACCA cita il decreto MIT n. 743 del 30/03/2026.",
    "Conformità dichiarata al Codice Appalti (D.Lgs. 36/2023) e ai CAM (DM 256/2022).",
    "Moduli collegati: analisi prezzi (PriMus-A), cronoprogramma (PriMus-K), computo da DWG/DXF (PriMus-CAD), BIM 5D (PriMus-IFC), capitolati (PriMus-C).",
    "Ecosistema usBIM con PriMus online e il giornale dei lavori usBIM.gdl.",
  ],
  eicLink: { to: "/funzionalita/computo-metrico/", label: "Vedi il computo in Edilizia in Cloud" },
  news: [
    { title: "Computo nel preventivo per tutte le aziende", text: "Dal 29 ottobre il preventivo a computo è aperto a ogni impresa: capitoli, voci con misure, ore e marca, voci opzionali, documento per il cliente, firma online e commessa che nasce da sola.", path: "/funzionalita/computo-metrico/" },
    { title: "Import e stampa PriMus", text: "Carichi il file XPWE o il PDF di PriMus e le voci entrano con misure e prezzi. Puoi ristamparlo con la stessa grammatica: Tariffa, Designazione, righe di misura, SOMMANO, riporto a ogni pagina." },
    { title: "Contabilità dei lavori pubblici sulla commessa", text: "Con l'interruttore «Lavoro pubblico»: elenco prezzi, libretto delle misure, registro di contabilità, SAL, certificato di pagamento, varianti e stampe in PDF.", path: "/funzionalita/contabilita-lavori/" },
    { title: "Quadro economico e perizie di variante", text: "Quadro economico con lavori e somme a disposizione, contrattuale bloccato che si sblocca solo con un motivo scritto, perizie di variante tracciate." },
    { title: "Misure dai disegni DXF", text: "Carichi una pianta in DXF e l'app conta blocchi e lunghezze: infissi, punti luce, metri di battiscopa. Il DWG va salvato prima in DXF." },
  ],
  rows: [
    { topic: "A chi serve", eic: "All'impresa che vende, esegue e incassa: dal contatto alla fattura, con ufficio e cantiere sullo stesso dato.", other: "Dichiarato sul sito ufficiale: software di computo e contabilità lavori per tecnici, imprese e PA, per lavori pubblici e privati, anche nelle edizioni PriMus-P e PriMus-DCF.", impact: "PriMus parla al tecnico che firma gli elaborati; Edilizia in Cloud parla al titolare che deve far quadrare cantiere e conti.", source: pm.primus.url },
    { topic: "Computo metrico", eic: "Preventivo a computo per ogni azienda: capitoli, voci con misure, ore, marca e modello, voci opzionali. Diventa il documento per il cliente, si firma online e fa nascere la commessa con le sue fasi.", other: "Dichiarato sul sito ufficiale: elenco prezzi, computo metrico, stima lavori, quadro economico, stima della manodopera e della sicurezza.", impact: "In PriMus il computo è l'elaborato finito. In Edilizia in Cloud è il primo passo: dalle stesse voci partono squadre, acquisti e SAL.", source: pm.primus.url, eicPath: "/funzionalita/computo-metrico/" },
    { topic: "Computi già fatti in PriMus", eic: "Import dei file XPWE e dei PDF di PriMus senza ricopiare le voci; ristampa con la stessa impaginazione (Tariffa, Designazione, misure, SOMMANO, riporto) e i colori della tua azienda.", other: "Il formato XPWE è quello di PriMus: il computo nasce e si salva lì.", impact: "Il geometra continua a lavorare in PriMus. L'impresa riprende lo stesso computo, lo manda al cliente e lo trasforma in commessa senza ribattere una riga.", source: pm.primus.url },
    { topic: "Prezzari e prezzi", eic: "Prezzari regionali di 19 regioni e province da adottare nel listino aziendale, accanto ai tuoi prezzi di acquisto e alla manodopera con costo orario.", other: "Dichiarato sul sito ufficiale: elenco prezzi e analisi prezzi con PriMus-A. Sul magazine di ACCA è annunciato SIBILLA, l'assistente AI che in PriMus suggerisce la voce di prezzario più adatta.", impact: "Il prezzario serve per il computo ufficiale; il tuo listino serve per sapere quanto ti costa davvero quella voce.", source: pm.accaSibilla.url },
    { topic: "Contabilità dei lavori pubblici", eic: "Interruttore «Lavoro pubblico» sulla commessa: elenco prezzi, libretto delle misure, registro di contabilità, SAL, certificato di pagamento, varianti e stampe in PDF.", other: "Dichiarato sul sito ufficiale: libretto delle misure, registro di contabilità, sommario, SAL, certificato di pagamento, liste in economia e libretto dei ferri, con conformità al D.Lgs. 36/2023 e ai CAM.", impact: "L'impresa tiene la sua contabilità dell'appalto dove ha già costi e squadre. Per gli elaborati della direzione lavori, PriMus dichiara un perimetro più ampio.", source: pm.primus.url, eicPath: "/funzionalita/contabilita-lavori/" },
    { topic: "Revisione prezzi", eic: "Non c'è un calcolo della revisione prezzi con le TOL e gli indici ISTAT.", other: "Dichiarato sul sito ufficiale: tabella delle 20 TOL, indici ISTAT, indice sintetico e calcolo nel SAL, in modalità manuale senza costi aggiuntivi; l'abbinamento automatico voce-TOL con l'AI fa parte del servizio POWER PACK.", impact: "Se lavori su appalti pubblici con revisione prezzi, questo calcolo oggi va fatto con PriMus o con uno strumento dedicato.", source: pm.primusRevisione.url },
    { topic: "Quadro economico e varianti", eic: "Quadro economico con lavori e somme a disposizione, importo contrattuale bloccato che si sblocca solo con un motivo, perizie di variante. Sui lavori privati la variante parte in PDF e il cliente la firma dal link.", other: "Dichiarato sul sito ufficiale: quadro economico e stima lavori fanno parte del computo.", impact: "La variante non resta una telefonata: è scritta, firmata e cambia subito l'importo della commessa e delle rate.", source: pm.primus.url, eicPath: "/funzionalita/direzione-lavori/" },
    { topic: "Disegni e BIM", eic: "Lettura dei disegni DXF con conteggio di blocchi e lunghezze per i materiali. Niente DWG nativo (va salvato in DXF), niente BIM e niente file IFC.", other: "Dichiarato sul sito ufficiale: PriMus-CAD fa il computo da DWG e DXF, PriMus-IFC il BIM 5D.", impact: "Per contare infissi e metri da una pianta basta il DXF. Per computare da un modello BIM serve PriMus-IFC.", source: pm.primus.url },
    { topic: "Dopo il computo: squadre, ore e materiali", eic: "Fasi e sottofasi con squadre e date, timbratura e rapportini dal telefono, materiali per fase validati dal tecnico, bolle lette con l'AI che caricano il magazzino, economia per lavorazione: venduto, previsto, reale e margine.", other: "Dichiarato sul sito ufficiale: cronoprogramma con PriMus-K e giornale dei lavori con usBIM.gdl; il servizio POWER PACK collega l'app mobile.", impact: "Il computo dice quanto vale il lavoro. La commessa dice quanto ti sta costando, fase per fase, mentre il cantiere è aperto.", source: pm.primus.url, eicPath: "/funzionalita/gestione-commesse/" },
    { topic: "Cliente privato: firma e pagamenti", eic: "Firma con codice OTP su una copia bloccata del PDF, piano di pagamento con acconto, SAL e rate, SAL firmato dal cliente che fa maturare la rata, portale cliente con avanzamento e documenti.", other: "Firma del cliente e incassi non sono indicati nelle pagine PriMus lette.", impact: "Con il privato il problema non è il computo: è farlo firmare e farsi pagare alle scadenze giuste.", eicPath: "/funzionalita/firma-elettronica/" },
    { topic: "Fatture e controllo di gestione", eic: "Fattura elettronica allo SDI, fatture dei fornitori ricevute in automatico, scadenzario, tesoreria, margini per commessa e controllo di gestione con pacchetto per la banca.", other: "Fatturazione SDI, incassi, CRM e magazzino non sono indicati nelle pagine PriMus lette.", impact: "Se oggi passi il totale del SAL da PriMus a un altro programma per fatturare, qui il SAL e la fattura stanno nello stesso posto.", eicPath: "/funzionalita/fatturazione-elettronica/" },
    { topic: "Dove si usa e AI", eic: "Da browser in ufficio e dal telefono in cantiere, con permessi per ruolo: il tecnico vede il computo, l'operaio solo il suo lavoro.", other: "Dichiarato sul sito ufficiale: desktop come prodotto principale, PriMus online e PriMus Classic nel browser su usBIM; PriMus-AI è un chatbot per redigere a voce computi, libretti e SAL.", impact: "PriMus resta lo strumento del tecnico alla scrivania. Edilizia in Cloud mette lo stesso computo in mano a ufficio, squadre e cliente.", source: pm.primusOnline.url },
  ],
  sources: [pm.primus, pm.primusRevisione, pm.primusOnline, pm.accaSibilla],
  faqs: [
    { q: "Edilizia in Cloud sostituisce PriMus?", a: "Dipende da chi sei. Se usi PriMus solo per fare il computo del preventivo, Edilizia in Cloud lo fa dentro il preventivo e lo porta in commessa. Se sei direttore lavori, lavori per la stazione appaltante, ti serve la revisione prezzi con le TOL o computi da modelli BIM, PriMus resta lo strumento di riferimento." },
    { q: "Posso importare i computi fatti in PriMus?", a: "Sì. Edilizia in Cloud legge i file XPWE e i PDF di PriMus e carica voci, misure e prezzi senza ricopiarli. Puoi anche ristampare il computo con la stessa impaginazione di PriMus. In demo prova con un tuo file vero." },
    { q: "Edilizia in Cloud fa la contabilità dei lavori pubblici?", a: "Sì, sulla commessa con l'interruttore «Lavoro pubblico»: elenco prezzi, libretto delle misure, registro di contabilità, SAL, certificato di pagamento e varianti, con stampe in PDF. Non calcola la revisione prezzi con le TOL; PriMus dichiara anche sommario, liste in economia e libretto dei ferri. Verifica i modelli richiesti dalla tua stazione appaltante." },
    { q: "Posso usare PriMus ed Edilizia in Cloud insieme?", a: "Sì, ed è il caso più comune: il tecnico fa il computo in PriMus, l'impresa lo importa, lo manda in firma e lo trasforma in commessa con squadre, acquisti, SAL e fatture. Così nessuno ricopia le stesse voci in due programmi." },
    { q: "Quali prezzari regionali ci sono?", a: "Edilizia in Cloud offre i prezzari di 19 regioni e province da adottare nel listino aziendale, accanto ai tuoi prezzi di acquisto e al costo orario della manodopera." },
    { q: "PriMus funziona online?", a: "Sì. Il sito ufficiale ACCA presenta PriMus come software desktop e anche come PriMus online nel browser, sulla piattaforma usBIM. Le funzioni dipendono dalla versione e dai servizi scelti." },
  ],
};


/** Punti di forza del nostro prodotto: non implicano assenza nel concorrente. */
export const pillarComparisonFocus = {
  path: "/blog/edilizia-in-cloud-vs-pillar/",
  title: "Stai valutando Pillar? Guarda anche tutto il flusso di Edilizia in Cloud.",
  description: "Dalla prima trattativa al cantiere: CRM, preventivi, fasi e costi della commessa accompagnano il lavoro di ufficio e squadra.",
  strengths: [
    { title: "Segui anche la vendita", text: "Opportunità a fasi, richiami, appuntamenti e lead dai moduli Facebook e Instagram: il preventivo parte quando il cliente è pronto.", path: "/funzionalita/pipeline-vendite/" },
    { title: "Organizza chi esegue il lavoro", text: "Fasi, sottofasi, squadre e cronoprogramma con le date vere dei rapportini: controlli l'esecuzione insieme ai costi previsti e reali.", path: "/funzionalita/gestione-commesse/" },
    { title: "Adatta il preventivo al tuo lavoro", text: "Preventivatori di mestiere o preventivo a computo, anche da un file PriMus, con firma del cliente tramite codice OTP.", path: "/funzionalita/preventivi-edilizia/" },
  ],
};
