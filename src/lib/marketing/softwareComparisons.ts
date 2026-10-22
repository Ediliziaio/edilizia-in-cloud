export const comparisonSources = {
  teamsystem: { name: "TeamSystem Construction", url: "https://www.teamsystem.com/construction/" },
  cpm: { name: "TeamSystem CPM AI: commesse, margini, cloud e AI", url: "https://www.teamsystem.com/construction/project-management/" },
  primus: { name: "ACCA PriMus: computo e contabilità lavori", url: "https://www.acca.it/software-contabilita-lavori" },
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
  { name: "TeamSystem Construction", path: "/confronto/vs-teamsystem/", summary: "Due soluzioni per l'edilizia: confronta il flusso della PMI con CPM AI, BIM e integrazioni della suite.", updated: true },
  { name: "PriMus ACCA", path: "/confronto/vs-primus/", summary: "Computo e contabilità lavori oppure gestione operativa della commessa: capisci quando affiancarli.", updated: true },
  { name: "PlanRadar", path: "/blog/edilizia-in-cloud-vs-planradar/", summary: "Documentazione, ispezioni e pianificazione di cantiere: confronta questi flussi con il controllo economico.", updated: false },
  { name: "Dylog Edilizia", path: "/blog/edilizia-in-cloud-vs-dylog-edilizia/", summary: "Amministrazione e operatività di cantiere: due esigenze da collegare nella gestione dell’impresa.", updated: false },
  { name: "Excel", path: "/confronto/vs-excel/", summary: "Quando i fogli bastano e quando ore, bolle e costi richiedono un flusso condiviso.", updated: false },
  { name: "Edilnet", path: "/confronto/vs-edilnet/", summary: "Confronta le procedure che usi oggi con il flusso preventivo, commessa e controllo dei costi.", updated: false },
  { name: "Buildertrend", path: "/confronto/vs-buildertrend/", summary: "Processi di cantiere e collaborazione: il confronto per un’impresa che lavora in Italia.", updated: false },
];

export const demoChecklist = [
  "Porta un tuo preventivo: distingui lavorazioni, fasi e materiali da acquistare.",
  "Trasformalo in commessa e controlla date, squadre, venduto e costi previsti.",
  "Ore giornaliere: persona, cantiere e fase rendono leggibile il costo della manodopera.",
  "Segui materiale, bolla e fattura: il costo deve essere attribuito senza duplicazioni.",
  "Costi e margine: distingui valori previsti, reali e dati ancora da completare.",
  "Ufficio e squadra: assegna a ogni persona le attività da svolgere e le informazioni da aggiornare.",
];

export interface ComparisonGuide {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  answer: string;
  eicFit: string;
  otherFit: string;
  rows: Array<{ topic: string; eic: string; other: string; impact: string }>;
  sources: Array<{ name: string; url: string }>;
  faqs: Array<{ q: string; a: string }>;
}

export const teamsystemGuide: ComparisonGuide = {
  slug: "vs-teamsystem", competitor: "TeamSystem Construction",
  title: "Edilizia in Cloud vs TeamSystem Construction: confronto",
  description: "Confronto per imprese edili: commesse, costi, BIM, AI e lavoro dal cantiere. Fonti ufficiali e una checklist per scegliere sulla tua operatività.",
  answer: "Edilizia in Cloud organizza il lavoro della PMI dal preventivo alle fasi, alle squadre e ai costi. TeamSystem Construction copre un perimetro articolato con prodotti come CPM AI, che comprende BIM, pianificazione e BI. Qui confrontiamo il lavoro quotidiano della commessa e gli strumenti tecnici di cui hai bisogno.",
  eicFit: "Edilizia in Cloud riunisce preventivo, fasi, ore, materiali e controllo dei costi. È adatto alla PMI che vuole organizzare il lavoro di ufficio e squadra attorno alla commessa.",
  otherFit: "TeamSystem Construction comprende prodotti dedicati a processi tecnici e amministrativi articolati. CPM AI offre BIM, pianificazione delle risorse e controllo di commessa con BI integrata.",
  rows: [
    { topic: "Settore e perimetro", eic: "Gestionale per imprese edili, con la commessa al centro.", other: "Famiglia di soluzioni dedicata alle costruzioni; CPM AI e TSE Costruzioni AI hanno perimetri specifici.", impact: "La commessa è il riferimento comune per organizzare il lavoro e leggere i risultati." },
    { topic: "Costi e margini", eic: "Costi previsti e reali distinti e collegati alla commessa.", other: "CPM AI dichiara controllo di budget, costi, avanzamento e marginalità con BI integrata.", impact: "Il confronto tra previsto e reale aiuta a individuare dove il lavoro sta assorbendo più risorse." },
    { topic: "Cloud e cantiere", eic: "Accesso da browser e flussi per ufficio e squadra.", other: "CPM AI è presentato come soluzione cloud; Cantieri App serve i rapportini in mobilità.", impact: "Le registrazioni dal cantiere alimentano il lavoro dell’ufficio e il controllo dei costi." },
    { topic: "BIM e pianificazione", eic: "Fasi e sottofasi con date, squadre, note e costi previsti.", other: "CPM AI dichiara BIM, Gantt collegato al computo e pianificazione delle risorse.", impact: "La pianificazione operativa coordina persone e date; il BIM aggiunge il collegamento al modello tecnico." },
    { topic: "Intelligenza artificiale", eic: "Assistenza AI nelle attività della piattaforma, secondo le funzioni abilitate.", other: "CPM AI dichiara agenti per computi, DDT, rapportini e altri processi.", impact: "I dati estratti dai documenti richiedono un controllo prima di alimentare costi e registrazioni." },
    { topic: "Attivazione e dati", eic: "Avvio assistito; ambito e tempi si concordano dopo la verifica dei dati.", other: "L’avvio si inserisce nel progetto di configurazione dei prodotti Construction e delle relative integrazioni.", impact: "Un avvio organizzato definisce dati iniziali, persone coinvolte e attività da gestire per prime." },
  ],
  sources: [comparisonSources.teamsystem, comparisonSources.cpm],
  faqs: [
    { q: "TeamSystem Construction è un ERP generico?", a: "No. TeamSystem Construction comprende soluzioni dedicate alle costruzioni. Il sito ufficiale presenta CPM AI, TSE Costruzioni AI e Cantieri App: il confronto va fatto con il prodotto e la configurazione corretti." },
    { q: "TeamSystem Construction funziona in cloud?", a: "Sì: la pagina ufficiale di CPM AI lo presenta come soluzione cloud, con collaborazione e mobilità. La famiglia Construction comprende più prodotti, ciascuno con il proprio perimetro." },
    { q: "Quale scegliere per una piccola impresa edile?", a: "Parti dai processi: preventivo, ore, acquisti e margine di commessa. Fai eseguire lo stesso caso a entrambi i fornitori e fai provare il telefono alla squadra. La dimensione dell'impresa, da sola, non decide quale software sia adatto." },
    { q: "Posso trasferire i dati da TeamSystem?", a: "Il trasferimento parte da un campione dei dati esportati: anagrafiche, commesse aperte e documenti. L’avvio assistito definisce quali informazioni portare e come mantenere coerenti importi e stato dei lavori; i dati trasferibili dipendono dal formato di origine." },
  ],
};

export const primusGuide: ComparisonGuide = {
  slug: "vs-primus", competitor: "PriMus ACCA",
  title: "PriMus o gestionale di commessa? Confronto con Edilizia in Cloud",
  description: "PriMus ACCA ed Edilizia in Cloud: differenze tra computo, contabilità lavori e gestione operativa. Quando scegliere, affiancare o valutare la migrazione.",
  answer: "PriMus serve a redigere computi metrici, analisi prezzi e contabilità lavori. Edilizia in Cloud organizza l’esecuzione: preventivi, fasi, squadre, ore e costi della commessa. Puoi affiancarli quando ti servono sia gli elaborati tecnici sia il controllo quotidiano del cantiere.",
  eicFit: "Valuta Edilizia in Cloud se il problema principale è collegare il preventivo a fasi, squadre, materiali, ore e costi effettivi della commessa, con un flusso condiviso fra ufficio e cantiere.",
  otherFit: "PriMus è dedicato a computi metrici, analisi prezzi ed elaborati di contabilità lavori, con disponibilità desktop e online.",
  rows: [
    { topic: "Preventivo e computo", eic: "Preventivi con lavorazioni e materiali collegabili alla commessa.", other: "Computo metrico, analisi prezzi ed elenchi prezzi sono il perimetro dichiarato di PriMus.", impact: "Il computo descrive e misura il lavoro; la commessa ne organizza l’esecuzione." },
    { topic: "Contabilità lavori", eic: "Controllo economico e operativo della commessa; gli elaborati tecnici di contabilità lavori restano un ambito distinto.", other: "PriMus è dedicato anche alla contabilità e alla direzione lavori.", impact: "Tenere distinti controllo economico ed elaborati tecnici evita di confondere due responsabilità diverse." },
    { topic: "Fasi e persone", eic: "Date, squadre e costi previsti delle fasi operative.", other: "Funzioni di cronoprogramma collegate alla pianificazione dei lavori.", impact: "Date e assegnazioni rendono chiaro chi deve eseguire ogni fase e quando." },
    { topic: "Materiali e costi effettivi", eic: "Articoli da acquistare separati dalle lavorazioni e controllo dei costi di commessa.", other: "Il computo quantifica lavorazioni, misure e importi; la gestione aziendale coinvolge anche altre soluzioni ACCA.", impact: "Il costo teorico del computo e la spesa effettiva rispondono a domande diverse e vanno letti separatamente." },
    { topic: "Accesso", eic: "Gestionale accessibile da browser, con flussi per ufficio e cantiere.", other: "La pagina ufficiale di PriMus dichiara disponibilità desktop e online.", impact: "Il lavoro dell’ufficio e quello in cantiere richiedono modalità di accesso adatte alle rispettive attività." },
    { topic: "Scambio dei dati", eic: "Avvio assistito con analisi dei dati da portare nella gestione operativa.", other: "Il computo e i suoi dati costituiscono la base tecnica da mantenere coerente nel passaggio alla gestione operativa.", impact: "Il passaggio deve conservare descrizioni, unità di misura, quantità e importi; l’importazione dipende dai formati disponibili." },
  ],
  sources: [comparisonSources.primus],
  faqs: [
    { q: "Edilizia in Cloud sostituisce PriMus?", a: "Dipende dal lavoro da svolgere. Gestire una commessa e produrre computi ed elaborati di contabilità lavori sono attività diverse. Verifica i documenti tecnici obbligatori prima di sostituire uno strumento specializzato." },
    { q: "PriMus esiste anche online?", a: "Sì. La pagina ufficiale ACCA presenta PriMus come software desktop e online. Le modalità operative dipendono dalla versione utilizzata." },
    { q: "Posso usare PriMus e un gestionale insieme?", a: "È un flusso da valutare quando vuoi mantenere gli elaborati tecnici e aggiungere il controllo operativo della commessa. Prima verifica scambio dei dati e responsabilità di aggiornamento, evitando di ricopiare gli stessi dati in due sistemi." },
    { q: "Che cosa provare prima di trasferire un computo?", a: "Usa un computo reale e controlla descrizioni, unità di misura, quantità, importi e distinzione fra lavorazioni e materiali. Verifica il formato esportabile dalla tua versione: non dare per scontata un'integrazione automatica." },
  ],
};


/** Punti di forza del nostro prodotto: non implicano assenza nel concorrente. */
export const pillarComparisonFocus = {
  path: "/blog/edilizia-in-cloud-vs-pillar/",
  title: "Stai valutando Pillar? Guarda anche tutto il flusso di Edilizia in Cloud.",
  description: "Dalla prima trattativa al cantiere: CRM, preventivi, fasi e costi della commessa accompagnano il lavoro di ufficio e squadra.",
  strengths: [
    { title: "Segui anche la vendita", text: "Segui opportunità, trattative e richiami nella pipeline commerciale e prepara il preventivo quando il cliente è pronto.", path: "/funzionalita/pipeline-vendite/" },
    { title: "Organizza chi esegue il lavoro", text: "Fasi, sottofasi, date, squadre, note e materiali: controlla l'esecuzione insieme ai costi previsti e reali.", path: "/funzionalita/gestione-commesse/" },
    { title: "Adatta il preventivo al tuo lavoro", text: "Descrivi ogni lavorazione, scegli unità di misura e quantità e tieni separati i materiali da acquistare.", path: "/funzionalita/preventivi-edilizia/" },
  ],
};
