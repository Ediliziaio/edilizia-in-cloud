export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
  readTime: number;
  author: { name: string; role: string; avatar?: string };
  coverImage: string;
  content: Array<{
    type: "intro" | "section" | "quote" | "list" | "cta";
    heading?: string;
    body?: string;
    items?: string[];
    quote?: string;
    author?: string;
  }>;
}

export const blogPosts: BlogPost[] = [
  {
    id: "1",
    slug: "ridurre-costi-cantieri-edili",
    title: "Come Ridurre i Costi Nei Cantieri Edili del 20% con il Digitale",
    excerpt:
      "Scopri le 7 strategie pratiche che permettono alle imprese edili italiane di ridurre i costi operativi del 20-35% attraverso la digitalizzazione dei processi. Analisi reale con dati di settore.",
    category: "Gestione Cantieri",
    tags: ["costi cantiere", "digitalizzazione edilizia", "risparmio", "gestione cantieri"],
    publishedAt: "2026-03-10",
    updatedAt: "2026-03-10",
    readTime: 8,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "Ogni anno le imprese edili italiane perdono in media il 18% del fatturato in costi nascosti: ore non fatturate, sprechi di materiali, ritardi di cantiere e burocrazia interna. La buona notizia è che questi costi sono eliminabili — e le imprese che hanno avviato la digitalizzazione lo stanno dimostrando con numeri reali.",
      },
      {
        type: "section",
        heading: "Il Problema dei Costi Nascosti in Edilizia",
        body: "I costi nascosti in cantiere sono quei costi che non appaiono mai chiaramente in nessun report, ma che erodono silenziosamente i margini commessa dopo commessa. Parliamo di ore di straordinario non pianificato, materiali ordinati in eccesso e poi buttati, spostamenti inutili delle squadre, tempo perso dai capicontiere in telefonate e aggiornamenti manuali. Uno studio del Politecnico di Milano ha rilevato che il 23% del tempo lavorativo nei cantieri italiani viene sprecato in attività a zero valore aggiunto. Identificare e aggredire questi sprechi è la prima mossa per recuperare margine senza toccare i prezzi di vendita.",
      },
      {
        type: "list",
        heading: "Le 7 Strategie per Ridurre i Costi del 20-35%",
        items: [
          "Monitoraggio ore in tempo reale: timbratura digitale da smartphone elimina le ore fantasma e riduce il costo del lavoro del 12-15%",
          "Gestione fornitori digitale: comparare preventivi e tracciare consegne riduce i costi materiali del 8-12%",
          "Riduzione sprechi materiali: con ordini basati su computo effettivo, non su stime, si risparmia mediamente il 7% sul materiale",
          "Ottimizzazione squadre: pianificazione digitale delle risorse umane riduce i tempi morti del 30%",
          "Fatturazione rapida: emettere SAL entro 48 ore migliora il cash flow e riduce i costi finanziari",
          "Previsioni cashflow: anticipare tensioni di liquidità permette di evitare fidi bancari costosi",
          "Eliminazione della carta: la sola gestione documentale digitale fa risparmiare 4-6 ore/settimana per amministrativo",
        ],
      },
      {
        type: "section",
        heading: "Dati Reali del Settore Edile Italiano",
        body: "Secondo i dati ANCE 2025, il 67% delle imprese edili italiane con meno di 50 dipendenti non ha ancora alcuno strumento digitale per il monitoraggio dei costi di cantiere. Le imprese che invece hanno adottato software gestionali specifici per l'edilizia riportano in media una riduzione dei costi operativi del 22% nel primo anno di utilizzo. Il ritorno sull'investimento (ROI) di un gestionale per cantieri si raggiunge tipicamente in 4-6 mesi, rendendolo uno degli investimenti più rapidi che un'impresa edile possa fare.",
      },
      {
        type: "quote",
        quote:
          "Prima non sapevo quante ore stavo davvero spendendo su ogni cantiere. Con il monitoraggio digitale ho scoperto che il 30% delle ore extra non erano mai state fatturate al cliente. In sei mesi ho recuperato oltre 40.000€.",
        author: "Luca Bianchi, Titolare di impresa edile, Milano",
      },
      {
        type: "section",
        heading: "Caso Studio: Impresa Costruzioni Generali di Bergamo",
        body: "Un'impresa da 15 dipendenti con 3,2 milioni di fatturato annuo ha adottato un gestionale digitale per i cantieri a gennaio 2025. Nei primi sei mesi ha registrato una riduzione del 19% del costo del lavoro per cantiere grazie al monitoraggio presenze in tempo reale, un risparmio del 14% sui materiali grazie alla gestione digitale degli ordini, e un miglioramento del cash flow di 45 giorni grazie alla fatturazione automatica dei SAL. Il margine netto medio per commessa è passato dal 6,2% all'8,7% — un incremento che in termini assoluti vale oltre 80.000€ all'anno.",
      },
      {
        type: "section",
        heading: "Come Iniziare: I Primi 3 Passi",
        body: "Il primo passo è fare un audit onesto dei propri processi: dove si perde più tempo? Dove ci sono i maggiori sprechi? Il secondo passo è scegliere uno strumento digitale specifico per l'edilizia — non un gestionale generico — che includa timbratura cantiere, gestione commesse e fatturazione integrata. Il terzo passo è formare il team in modo graduale, iniziando dai capicontiere e poi estendendo agli operai. Le imprese che seguono questo approccio raggiungono il 90% di adozione in meno di 30 giorni.",
      },
      {
        type: "cta",
        heading: "Vuoi Ridurre i Tuoi Costi di Cantiere?",
        body: "Scopri come Edilizia in Cloud può aiutarti a implementare queste 7 strategie in modo semplice e immediato. Richiedi una demo gratuita e personalizzata per la tua impresa.",
      },
    ],
  },
  {
    id: "2",
    slug: "gestione-cantieri-digitale",
    title: "Gestione Cantieri 2026: Dalla Carta al Cloud — Guida Completa",
    excerpt:
      "La guida definitiva per trasformare la gestione dei cantieri edili dalla carta al cloud. Dall'avanzamento lavori alle commesse, tutto ciò che devi sapere per il 2026.",
    category: "Gestione Cantieri",
    tags: ["gestione cantieri", "cloud edilizia", "software cantiere", "avanzamento lavori"],
    publishedAt: "2026-03-05",
    updatedAt: "2026-03-05",
    readTime: 10,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "Nel 2026, gestire un cantiere con fogli Excel, blocchi carta e WhatsApp non è solo inefficiente: è un rischio competitivo. I tuoi concorrenti che hanno già digitalizzato i processi stanno vincendo appalti a margini migliori, consegnando nei tempi e costruendo una reputazione di professionalità che si traduce in passaparola e nuovi clienti.",
      },
      {
        type: "section",
        heading: "Il Problema della Gestione Cartacea del Cantiere",
        body: "La gestione cartacea del cantiere genera tre categorie di problemi: problemi di dati (informazioni non aggiornate, errori di trascrizione, dati persi), problemi di comunicazione (il cantiere non sa cosa ha deciso l'ufficio e viceversa) e problemi di controllo (impossibile sapere in tempo reale se si è in budget o in ritardo). Uno studio condotto su 400 imprese edili italiane ha rilevato che le aziende che gestiscono i cantieri in modalità cartacea impiegano in media 3,2 volte più tempo nelle attività amministrative rispetto a chi usa strumenti digitali. Questo tempo perso si traduce direttamente in costi e in minore capacità di acquisire nuovi lavori.",
      },
      {
        type: "section",
        heading: "Cos'è la Gestione Digitale del Cantiere",
        body: "La gestione digitale del cantiere è un sistema integrato che connette in tempo reale tutte le informazioni di un cantiere: risorse umane impiegate, materiali utilizzati, avanzamento lavori rispetto al programma, costi sostenuti rispetto al budget e comunicazioni tra cantiere e ufficio. Non si tratta di software complicati pensati per le grandi imprese: i migliori strumenti moderni sono progettati per essere usati direttamente in cantiere, via smartphone, anche da operai con scarsa dimestichezza informatica. La digitalizzazione del cantiere non sostituisce il lavoro delle persone — lo amplifica.",
      },
      {
        type: "section",
        heading: "Avanzamento Lavori in Tempo Reale",
        body: "L'avanzamento lavori digitale permette al titolare o al responsabile di cantiere di sapere in qualsiasi momento a che punto sono le lavorazioni, senza dover chiamare il capocantiere o recarsi fisicamente sul posto. Il capocantiere aggiorna l'avanzamento direttamente da smartphone, allegando foto e note. L'ufficio vede immediatamente l'aggiornamento, può rielaborare le previsioni di completamento e aggiornare il cliente. Questo flusso informativo riduce le sorprese a fine lavoro e permette di fatturare i SAL in modo puntuale e documentato.",
      },
      {
        type: "list",
        heading: "Cosa Gestire Digitalmente: La Checklist Completa",
        items: [
          "Presenze e ore lavorate per operaio, per cantiere, per fase",
          "Ordini materiali con comparazione fornitori e tracciamento consegne",
          "Avanzamento lavorazioni con foto e annotazioni georeferenziate",
          "Budget commessa vs. costi effettivi in tempo reale",
          "Comunicazioni ufficiali cantiere-ufficio con timestamp e firma",
          "Documenti di sicurezza, DPI e formazione del personale",
          "SAL automatici basati sull'avanzamento registrato",
        ],
      },
      {
        type: "section",
        heading: "Gestione delle Commesse: Dal Preventivo al Saldo",
        body: "Una commessa edile ben gestita digitalmente ha un ciclo di vita tracciato dall'inizio alla fine: dal preventivo iniziale, alla pianificazione delle risorse, al monitoraggio dell'esecuzione, fino alla fatturazione finale e al calcolo del margine consuntivo. La differenza tra preventivo e consuntivo — cioè tra quanto si pensava di guadagnare e quanto si è effettivamente guadagnato — è il KPI più importante per un'impresa edile. Con la gestione digitale, questo scarto viene rilevato in tempo reale e non a lavori ultimati, permettendo di intervenire tempestivamente.",
      },
      {
        type: "section",
        heading: "Integrazione con la Contabilità",
        body: "Il vero salto di qualità della gestione digitale avviene quando il gestionale di cantiere è integrato con la contabilità aziendale. In questo modo, ogni ora lavorata, ogni materiale acquistato e ogni SAL emesso confluisce automaticamente nel conto economico della commessa, senza dover fare doppio inserimento manuale. Le imprese con integrazione completa risparmiano in media 8 ore settimanali di lavoro amministrativo e hanno bilanci più precisi e aggiornati.",
      },
      {
        type: "section",
        heading: "Come Passare al Digitale in 30 Giorni",
        body: "Il passaggio alla gestione digitale del cantiere non richiede una rivoluzione overnight. La strategia più efficace è quella per fasi: nella prima settimana si configura il sistema e si inseriscono i dati base (cantieri attivi, operai, fornitori); nella seconda settimana si avvia la timbratura digitale delle presenze; nella terza si introduce l'aggiornamento dell'avanzamento lavori; nella quarta si attiva la gestione degli ordini e la fatturazione automatica. Seguendo questo piano, quasi tutte le imprese raggiungono la piena operatività entro il primo mese.",
      },
      {
        type: "cta",
        heading: "Inizia la Tua Trasformazione Digitale",
        body: "Edilizia in Cloud è il gestionale pensato specificamente per le imprese edili italiane. Richiedi una demo gratuita e scopri come passare dalla carta al cloud in 30 giorni.",
      },
    ],
  },
  {
    id: "3",
    slug: "preventivi-edilizia-guida",
    title: "Preventivi Vincenti in Edilizia: Come Strutturare un'Offerta che Converte",
    excerpt:
      "I preventivi perduti costano alle imprese edili italiane milioni di euro ogni anno. Scopri come strutturare preventivi professionali che convincono il cliente e proteggono i tuoi margini.",
    category: "Commerciale",
    tags: ["preventivi edilizia", "offerte commerciali", "conversione clienti", "margini"],
    publishedAt: "2026-02-20",
    updatedAt: "2026-02-20",
    readTime: 7,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "Il preventivo è il primo documento ufficiale che un potenziale cliente riceve dalla tua impresa. In quel momento, il preventivo non è solo un elenco di prezzi: è la tua presentazione aziendale, la dimostrazione della tua professionalità e il fondamento della futura relazione commerciale. Eppure il 74% delle imprese edili italiane usa ancora preventivi in formato Word o Excel, senza struttura né strategia.",
      },
      {
        type: "section",
        heading: "Gli Errori Comuni nei Preventivi Edili",
        body: "Gli errori più frequenti nei preventivi edili possono essere raggruppati in tre categorie: errori di contenuto (voci mancanti, descrizioni generiche, mancanza di esclusioni esplicite), errori di forma (layout poco professionale, mancanza di logo e dati aziendali, nessun numero di riferimento) ed errori strategici (prezzo esposto senza contesto, nessun senso di urgenza, nessun passaggio successivo proposto). Ogni categoria di errori contribuisce ad abbassare il tasso di conversione e a esporre l'impresa a contestazioni e varianti non preventivate. Correggere questi errori può aumentare il tasso di accettazione dal 35% tipico del settore fino al 55-60%.",
      },
      {
        type: "list",
        heading: "La Struttura del Preventivo Vincente",
        items: [
          "Copertina professionale con logo, dati cliente, numero preventivo e data",
          "Executive summary: 3-4 righe che descrivono il progetto e il valore che l'impresa porta",
          "Computo metrico dettagliato con descrizioni chiare e unità di misura esplicite",
          "Esclusioni e ipotesi: tutto ciò che NON è incluso nel prezzo",
          "Condizioni di pagamento e piano SAL proposto",
          "Validità dell'offerta (non superare i 30 giorni)",
          "Firma digitale e call to action chiara",
        ],
      },
      {
        type: "section",
        heading: "La Psicologia del Prezzo nei Preventivi",
        body: "Presentare il prezzo nel modo giusto può fare la differenza tra l'accettazione e il rifiuto, indipendentemente dall'importo. Le tecniche più efficaci includono il prezzo in contesto (mostrare il valore prima del costo), l'ancoraggio (proporre sempre tre opzioni: base, standard e premium), la suddivisione del costo (piani SAL chiari che rendono il progetto meno intimidatorio) e la garanzia esplicita (cosa succede se qualcosa va storto). Queste tecniche non servono a ingannare il cliente, ma a comunicare il valore reale della tua offerta in modo che sia percepito correttamente.",
      },
      {
        type: "section",
        heading: "Come Calcolare i Margini Corretti",
        body: "Un errore molto comune nelle imprese edili è calcolare il prezzo sommando solo i costi diretti (manodopera e materiali) e aggiungendo una percentuale fissa. Questo approccio ignora i costi indiretti (coordinamento, spostamenti, overhead aziendale) e il rischio specifico della commessa. Un metodo più robusto prevede di calcolare il costo totale diretto, aggiungere il 15-20% di costi indiretti, aggiungere un risk premium del 5-10% basato sulla complessità del progetto, e infine applicare il margine di profitto desiderato. Questo processo, se fatto con strumenti digitali, richiede meno di 15 minuti per commessa.",
      },
      {
        type: "section",
        heading: "Il Follow-Up Sistematico che Raddoppia le Conversioni",
        body: "La maggior parte delle imprese edili invia il preventivo e poi aspetta passivamente la risposta del cliente. I dati mostrano che il 60% delle decisioni di acquisto avviene dopo il terzo contatto. Un sistema di follow-up efficace prevede: una chiamata di conferma ricezione a 24 ore, una mail di approfondimento a 5 giorni, una proposta di sopralluogo a 10 giorni e una comunicazione di scadenza a 25 giorni. Le imprese che implementano questo sistema raddoppiano letteralmente il loro tasso di conversione senza acquisire nuovi lead.",
      },
      {
        type: "section",
        heading: "Strumenti Digitali per i Preventivi in Edilizia",
        body: "I migliori software gestionali per l'edilizia includono moduli di preventivazione integrati con il listino prezzi, il computo metrico e i dati storici delle commesse. Questo permette di creare preventivi accurati in tempi rapidissimi, mantenere coerenza tra i prezzi offerti e i costi effettivi, monitorare il tasso di conversione per tipologia di lavoro e area geografica, e inviare follow-up automatici. Il risultato è un processo commerciale professionale e scalabile, che non dipende dalla memoria e dalle abitudini del singolo commerciale.",
      },
      {
        type: "cta",
        heading: "Crea Preventivi Vincenti con Edilizia in Cloud",
        body: "Il modulo preventivi di Edilizia in Cloud ti permette di creare offerte professionali in pochi minuti, con firma digitale integrata e follow-up automatico. Scopri come con una demo gratuita.",
      },
    ],
  },
  {
    id: "4",
    slug: "hr-edilizia-presenze-buste-paga",
    title: "HR in Edilizia: Gestione Presenze, Buste Paga e Conformità CCNL",
    excerpt:
      "La gestione del personale nelle imprese edili è tra le più complesse d'Italia. Scopri come semplificare presenze, buste paga e rispettare il CCNL Edilizia con strumenti digitali.",
    category: "HR & Personale",
    tags: ["HR edilizia", "CCNL edilizia", "presenze cantiere", "buste paga"],
    publishedAt: "2026-02-10",
    updatedAt: "2026-02-10",
    readTime: 9,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "Il CCNL Edilizia è tra i contratti collettivi più complessi del panorama lavorativo italiano: indennità di cantiere, trasferte, APE, Cassa Edile, orari differenziati e 16 livelli contrattuali rendono la gestione HR un labirinto per la maggior parte delle piccole e medie imprese edili. Sbagliare significa incorrere in sanzioni, contenziosi con i dipendenti e irregolarità nelle ispezioni.",
      },
      {
        type: "section",
        heading: "La Complessità HR nelle Imprese Edili",
        body: "A differenza di altri settori, le imprese edili hanno dipendenti che lavorano su cantieri diversi ogni settimana, con orari variabili, trasferte frequenti e categorie contrattuali eterogenee. Questo rende la rilevazione delle presenze, il calcolo degli straordinari e la gestione delle ferie estremamente complesso. Aggiungete la Cassa Edile — con i suoi contributi specifici per cantiere e comune — e avrete un quadro che richiede competenze altamente specializzate. Molte piccole imprese delegano completamente questa funzione al commercialista, con costi elevati e scarsa visibilità sui dati di costo del personale.",
      },
      {
        type: "section",
        heading: "CCNL Edilizia 2024-2026: I Punti Chiave",
        body: "L'ultimo rinnovo del CCNL Edilizia ha introdotto importanti novità sulla flessibilità oraria, sulle indennità e sulla formazione obbligatoria. Le imprese devono ora tenere traccia di: ore ordinarie e straordinarie per singolo dipendente e cantiere, indennità di cantiere differenziate per tipologia di lavorazione, contributi Cassa Edile mensili distinti per cantiere e comune, formazione obbligatoria (16 ore/anno per ogni lavoratore) e versamenti INAIL con codici attività corretti. La corretta applicazione del CCNL richiede un sistema digitale che gestisca automaticamente queste regole.",
      },
      {
        type: "list",
        heading: "Rilevazione Presenze Digitale in Cantiere",
        items: [
          "Timbratura via smartphone con geolocalizzazione — verifica che il dipendente sia fisicamente in cantiere",
          "Rilevazione automatica delle pause obbligatorie secondo CCNL",
          "Distinzione automatica tra ore ordinarie, straordinarie e notturne",
          "Assegnazione delle ore al cantiere corretto per il calcolo dei costi commessa",
          "Dashboard in tempo reale per capicontiere e ufficio HR",
          "Esportazione automatica verso il software paghe del commercialista",
        ],
      },
      {
        type: "section",
        heading: "Gestione Malattie, Infortuni e Assenze",
        body: "Gli infortuni sul lavoro in edilizia sono statisticamente più frequenti che in altri settori, il che rende la gestione delle assenze per infortuni un tema critico. Un sistema digitale permette di tracciare ogni assenza con la relativa causale, calcolare automaticamente le integrazioni a carico dell'azienda previste dal CCNL, monitorare i periodi di comporto e gestire i rientri graduali. In caso di ispezione del lavoro, avere tutta la documentazione digitale, datata e firmata riduce drasticamente il rischio di sanzioni.",
      },
      {
        type: "section",
        heading: "Buste Paga e Cedolini: Semplificare il Processo",
        body: "La produzione delle buste paga in un'impresa edile tipicamente richiede un processo complesso tra l'impresa, il commercialista e la Cassa Edile. La digitalizzazione delle presenze permette di esportare automaticamente i dati elaborati al software paghe, riducendo il rischio di errori di trascrizione e il tempo di elaborazione. Le imprese che usano sistemi integrati riducono il tempo dedicato all'elaborazione paghe del 65% e gli errori del 90%, con un risparmio medio di 4-6 ore al mese per ogni 10 dipendenti.",
      },
      {
        type: "section",
        heading: "Controllo del Costo del Lavoro per Commessa",
        body: "Conoscere il costo del lavoro per ogni singola commessa è fondamentale per calcolare i margini reali. Con la timbratura digitale che assegna ogni ora al cantiere corretto, è possibile sapere in tempo reale quanto sta costando la manodopera su ogni progetto. Questa informazione, confrontata con il preventivo, permette di individuare in anticipo le commesse a rischio di perdita e di prendere decisioni correttive prima che sia troppo tardi. Le imprese che monitorano il costo del lavoro per commessa hanno margini mediamente più alti del 3,5% rispetto a quelle che non lo fanno.",
      },
      {
        type: "cta",
        heading: "Gestisci le Presenze e il CCNL senza Stress",
        body: "Il modulo HR di Edilizia in Cloud gestisce automaticamente il CCNL Edilizia, la Cassa Edile e la timbratura in cantiere. Richiedi una demo e scopri quanto tempo puoi risparmiare.",
      },
    ],
  },
  {
    id: "5",
    slug: "analisi-margini-imprese-edili",
    title: "Analisi dei Margini per Imprese Edili: La Guida Definitiva 2026",
    excerpt:
      "Il 68% delle imprese edili lavora senza conoscere i propri margini reali per commessa. Scopri come calcolare, monitorare e migliorare la redditività di ogni cantiere.",
    category: "Finanza",
    tags: ["margini edilizia", "redditività cantieri", "analisi costi", "contabilità edilizia"],
    publishedAt: "2026-01-25",
    updatedAt: "2026-01-25",
    readTime: 11,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1543286386-713bdd548da4?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "Una ricerca condotta su 1.200 imprese edili italiane ha rivelato un dato sconcertante: il 68% degli imprenditori edili non conosce il margine reale delle proprie commesse. Lavorano, fatturano, pagano i fornitori e i dipendenti — ma non sanno se alla fine di ogni cantiere stanno guadagnando o perdendo. Questo articolo ti dà gli strumenti per cambiarlo.",
      },
      {
        type: "section",
        heading: "Perché il 68% Non Conosce i Propri Margini",
        body: "Il problema principale è la frammentazione delle informazioni: i costi del personale sono nel software paghe, i costi dei materiali sono nelle fatture dei fornitori, i ricavi sono nelle fatture emesse. Mettere insieme queste tre fonti in modo coerente, commessa per commessa, richiede ore di lavoro manuale che quasi nessuna piccola impresa edile si può permettere. Il risultato è che la maggior parte degli imprenditori edili conosce il margine del cantiere solo a fine lavoro — quando è troppo tardi per intervenire su eventuali problemi.",
      },
      {
        type: "section",
        heading: "Margine Lordo vs Margine Netto in Edilizia",
        body: "In edilizia è fondamentale distinguere tra margine lordo e margine netto. Il margine lordo è la differenza tra ricavi e costi diretti (manodopera e materiali); è il KPI più immediato per valutare l'efficienza operativa di un cantiere. Il margine netto invece include anche la quota di costi indiretti e overhead aziendale attribuibili alla commessa; è il vero indicatore di redditività. Un margine lordo del 25% che diventa netto del 5% dopo l'attribuzione dei costi indiretti dovrebbe accendere un campanello d'allarme: i costi di struttura stanno erodendo tutto il valore creato in cantiere.",
      },
      {
        type: "list",
        heading: "Costi Diretti e Indiretti per Commessa",
        items: [
          "Costi diretti: manodopera propria (ore × costo orario effettivo), subappaltatori, materiali, noleggi e attrezzature specifiche",
          "Costi indiretti fissi: quota di affitto ufficio, ammortamenti mezzi, stipendi staff ufficio",
          "Costi indiretti variabili: coordinamento, spostamenti, costi di gara e preventivazione",
          "Costi finanziari: oneri bancari proporzionali ai giorni di esposizione finanziaria della commessa",
          "Costi di rischio: accantonamento per varianti, contenziosi e garanzie post-lavoro",
        ],
      },
      {
        type: "section",
        heading: "Come Costruire il Conto Economico per Cantiere",
        body: "Un conto economico per cantiere ben strutturato ha quattro livelli: ricavi (SAL emessi + varianti accettate), costi diretti (con dettaglio per voce), margine lordo (ricavi meno costi diretti) e margine netto (margine lordo meno quota di costi indiretti). Questo schema, aggiornato in tempo reale durante l'esecuzione dei lavori, è lo strumento più potente che un imprenditore edile abbia a disposizione. Non serve un commercialista per leggerlo: basta guardare il margine netto previsto a finire e confrontarlo con quello del preventivo.",
      },
      {
        type: "quote",
        quote:
          "Ho capito che stavo lavorando gratis su tre cantieri su cinque solo dopo aver iniziato a monitorare i margini in tempo reale. Nei sei mesi successivi ho rinegoziato i prezzi e aumentato il margine medio dal 4% al 9%.",
        author: "Riccardo Fermi, Titolare, Costruzioni Fermi Srl, Torino",
      },
      {
        type: "section",
        heading: "KPI Fondamentali per le Imprese Edili",
        body: "Oltre al margine per commessa, le imprese edili sane monitorano regolarmente cinque KPI chiave: il margine lordo percentuale (target: >25%), il fatturato per dipendente (target: >120.000€/anno), il Days Sales Outstanding (giorni medi di incasso: target: <60 giorni), il rapporto tra preventivi vinti e inviati (target: >40%) e l'indice di puntualità delle consegne (target: >85%). Questi cinque numeri, monitorati mensilmente, danno un quadro completo della salute finanziaria e operativa dell'impresa.",
      },
      {
        type: "section",
        heading: "Errori che Erodono i Margini Senza che Te ne Accorga",
        body: "I principali margine-killer nelle imprese edili sono: le varianti non formalizzate (lavori extra eseguiti senza ordine scritto che finiscono a carico dell'impresa), i ritardi di cantiere non imputabili al committente (che aumentano il costo del lavoro senza incremento del ricavo), i materiali sovraordinati (che rimangono a magazzino e generano perdite per obsolescenza), e la sottostima del tempo di coordinamento nei preventivi. Ogni uno di questi errori, se sistematico, può erodere 2-5 punti di margine netto.",
      },
      {
        type: "cta",
        heading: "Conosci i Tuoi Margini in Tempo Reale",
        body: "Con Edilizia in Cloud hai il conto economico per ogni cantiere aggiornato in tempo reale, senza inserimento manuale. Richiedi una demo e smetti di lavorare al buio.",
      },
    ],
  },
  {
    id: "6",
    slug: "marketing-digitale-imprese-edili",
    title: "Marketing Digitale per Imprese Edili: Trovare Nuovi Clienti Online nel 2026",
    excerpt:
      "Il passaparola non basta più. Scopri le strategie di marketing digitale specifiche per le imprese edili italiane: dal Google My Business alle campagne social, fino ai preventivi automatici.",
    category: "Marketing",
    tags: [
      "marketing edilizia",
      "clienti edilizia",
      "google my business edilizia",
      "lead generation costruzioni",
    ],
    publishedAt: "2026-01-15",
    updatedAt: "2026-01-15",
    readTime: 8,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "Il 78% dei proprietari di casa che cercano un'impresa edile inizia la ricerca online. Questo significa che se la tua impresa non è visibile su Google, stai cedendo quell'opportunità ai tuoi concorrenti — anche se hai 20 anni di esperienza e una reputazione eccellente. Il marketing digitale per l'edilizia non è complicato, ma richiede metodo e costanza.",
      },
      {
        type: "section",
        heading: "Il Cliente Moderno Cerca Online: I Dati",
        body: "Secondo i dati Google Italia 2025, le ricerche relative a 'impresa edile [città]', 'ristrutturazione casa', 'preventivo ristrutturazione' sono cresciute del 34% rispetto all'anno precedente. La maggior parte di queste ricerche avviene da mobile, con l'intenzione di contattare direttamente l'impresa entro 24 ore. Il 91% degli utenti che effettua una ricerca locale su Google clicca su uno dei tre risultati nella mappa — il cosiddetto 'Local Pack'. Essere in quella mappa è il primo obiettivo di marketing per qualsiasi impresa edile locale.",
      },
      {
        type: "section",
        heading: "Google My Business Ottimizzato per l'Edilizia",
        body: "Google My Business (ora Google Business Profile) è lo strumento più potente e gratuito per un'impresa edile locale. Un profilo ottimizzato include: nome, indirizzo e numero di telefono coerenti con il sito web, categoria principale 'Impresa di Costruzioni' con categorie secondarie specifiche, almeno 20 foto di lavori eseguiti caricate regolarmente, risposta sistematica a tutte le recensioni (positive e negative) entro 24 ore, e descrizione aziendale con keyword locali. Le imprese con un profilo ottimizzato ricevono il 520% in più di chiamate rispetto a quelle con profilo incompleto.",
      },
      {
        type: "list",
        heading: "Sito Web e Portfolio Lavori: Il Tuo Biglietto da Visita Digitale",
        items: [
          "Pagina portfolio con foto before/after di ogni cantiere completato",
          "Sezione 'Aree di intervento' con pagine dedicate per ogni comune in cui operi",
          "Modulo preventivo online con risposta garantita entro 48 ore",
          "Pagina 'Chi Siamo' con foto del team — le imprese con volti reali convertono il 40% in più",
          "Sezione recensioni con almeno 15 testimonianze verificate",
          "Schema markup per imprese locali (aumenta la visibilità nei risultati ricchi)",
        ],
      },
      {
        type: "section",
        heading: "Social Media per Imprese Edili: Instagram e LinkedIn",
        body: "Instagram è il social più efficace per mostrare il portfolio lavori di un'impresa edile. Le storie dei cantieri — dall'inizio alla fine — generano engagement altissimo e posizionano l'impresa come trasparente e professionale. LinkedIn è invece lo strumento per raggiungere clienti business: progettisti, studi di architettura, developer immobiliari. Una strategia social efficace non richiede più di 3 post a settimana: due post cantiere (foto + breve descrizione) e un post di expertise (consiglio tecnico, aggiornamento normativo, caso studio). La costanza batte la perfezione.",
      },
      {
        type: "section",
        heading: "Campagne Google Ads Locali per l'Edilizia",
        body: "Le campagne Google Ads locali permettono di apparire in cima ai risultati di ricerca quando qualcuno nella tua area cerca i tuoi servizi. Con un budget di 500-1.000€ al mese, un'impresa edile ben configurata può ricevere 15-30 richieste di preventivo mensili da clienti qualificati. La chiave è una configurazione precisa: targeting geografico ristretto all'area di operatività, keyword specifiche ('impresa edile Milano', 'ristrutturazione bagno Monza'), e landing page dedicate con modulo di contatto e numero di telefono ben visibili.",
      },
      {
        type: "section",
        heading: "CRM e Follow-Up Automatico: Trasformare i Lead in Clienti",
        body: "Acquisire un lead è solo il primo passo: trasformarlo in cliente richiede un processo di follow-up sistematico. Un CRM semplice, integrato con il processo di preventivazione, permette di non perdere nessun contatto, inviare follow-up automatici dopo l'invio del preventivo e analizzare quale fonte di acquisizione porta i clienti più redditizi. Le imprese edili con un CRM attivo hanno un tasso di conversione da lead a cliente del 28%, contro il 12% di chi gestisce i contatti in modo manuale.",
      },
      {
        type: "cta",
        heading: "Gestisci i Tuoi Lead con Edilizia in Cloud",
        body: "Il CRM integrato di Edilizia in Cloud ti permette di tracciare ogni opportunità, inviare preventivi in pochi minuti e seguire ogni lead fino alla firma del contratto. Scopri come con una demo gratuita.",
      },
    ],
  },
  {
    id: "7",
    slug: "software-gestionale-vs-excel",
    title: "Software Gestionale vs Excel: Il Vero Costo Nascosto per la Tua Impresa Edile",
    excerpt:
      "Molte imprese edili usano Excel convinte di risparmiare. Calcoliamo il vero costo nascosto di Excel: tempo perso, errori, opportunità mancate e rischio di conformità fiscale.",
    category: "Digitalizzazione",
    tags: ["excel edilizia", "software gestionale", "costi nascosti", "digitalizzazione"],
    publishedAt: "2025-12-20",
    updatedAt: "2025-12-20",
    readTime: 6,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "\"Excel ci costa zero\" — è la frase che sentiamo più spesso quando discutiamo di digitalizzazione con gli imprenditori edili. Ma è davvero così? Quando calcoliamo il costo reale di Excel per un'impresa edile — considerando il tempo perso, gli errori generati, le opportunità mancate e i rischi fiscali — il risultato è quasi sempre sorprendente.",
      },
      {
        type: "section",
        heading: "Quante Imprese Edili Usano Ancora Excel",
        body: "Un'indagine condotta nel 2025 da ANCE su 2.400 piccole e medie imprese edili italiane ha rilevato che il 71% usa fogli Excel come strumento principale per la gestione delle commesse, il 58% per le presenze e il 64% per la contabilità interna. Questo dato è in calo rispetto al 2022 (82%) ma rimane elevatissimo per un settore che gestisce commesse da centinaia di migliaia di euro. La resistenza al cambiamento è comprensibile: Excel è familiare, apparentemente gratuito e controllabile. Ma i costi nascosti sono reali.",
      },
      {
        type: "list",
        heading: "Il Costo Reale dell'Ora Persa con Excel",
        items: [
          "Inserimento manuale dati: mediamente 8-12 ore/settimana per un'impresa da 10 dipendenti",
          "Consolidamento report mensili: 4-6 ore/mese per ogni report manuale",
          "Correzione errori: 2-3 ore/settimana spese a trovare e correggere discrepanze tra fogli",
          "Versioning: ore perse a capire quale è la versione aggiornata del file",
          "Costo totale annuo: con un costo orario del responsabile amministrativo di 25€/ora, si superano facilmente 12.000-18.000€/anno",
        ],
      },
      {
        type: "section",
        heading: "Errori e Rischi Fiscali di Excel",
        body: "Gli errori in Excel non sono solo operativi: possono avere conseguenze fiscali gravi. Un errore nella formula del calcolo IVA, un SAL emesso con data sbagliata, una fattura non registrata correttamente: queste situazioni generano discrepanze che, in caso di accertamento fiscale, si traducono in sanzioni e interessi. La ricerca KPMG ha calcolato che l'88% dei fogli Excel con oltre 150 righe contiene almeno un errore significativo. Per un'impresa edile che gestisce 20-30 commesse contemporaneamente, il rischio è sistematico.",
      },
      {
        type: "section",
        heading: "Cosa Fa un Gestionale che Excel Non Può Fare",
        body: "Un gestionale specifico per l'edilizia fa cose che Excel strutturalmente non può fare: aggiorna i dati in tempo reale su tutti i dispositivi degli utenti, permette l'inserimento delle ore direttamente in cantiere via smartphone, integra automaticamente presenze, materiali e SAL nel conto economico della commessa, genera fatture conformi alla normativa italiana con un click, e mantiene un audit trail completo di tutte le modifiche. Questi non sono 'extra' opzionali: sono le fondamenta di una gestione aziendale moderna.",
      },
      {
        type: "section",
        heading: "Calcolo ROI Reale: Quando Conviene Passare",
        body: "Il calcolo del ritorno sull'investimento per un gestionale edile è semplice. Con un costo medio di 200-400€/mese per un gestionale completo, e un risparmio medio di 15-20 ore di lavoro amministrativo a settimana, il ROI si raggiunge quasi sempre entro i primi 2-3 mesi. A questo vanno aggiunti i benefici meno quantificabili ma ugualmente reali: meno stress, decisioni più informate, capacità di scalare l'azienda senza aumentare proporzionalmente il personale amministrativo. La domanda non è 'possiamo permetterci un gestionale?' — è 'possiamo permetterci di non averlo?'",
      },
      {
        type: "cta",
        heading: "Sostituisci Excel con un Gestionale Dedicato",
        body: "Edilizia in Cloud è stato progettato come sostituto diretto di Excel per le imprese edili. Importa i tuoi dati esistenti, forma il team in 2 ore e inizia a risparmiare dal primo giorno. Prova gratuita disponibile.",
      },
    ],
  },
  {
    id: "8",
    slug: "digitalizzare-impresa-edile",
    title: "Come Digitalizzare la Tua Impresa Edile in 30 Giorni: Piano d'Azione Pratico",
    excerpt:
      "Una roadmap concreta e testata per trasformare la tua impresa edile dal cartaceo al digitale in soli 30 giorni. Settimana per settimana, cosa fare e come farlo.",
    category: "Digitalizzazione",
    tags: [
      "digitalizzazione impresa edile",
      "trasformazione digitale edilizia",
      "piano digitale",
      "software edilizia",
    ],
    publishedAt: "2025-12-05",
    updatedAt: "2025-12-05",
    readTime: 9,
    author: { name: "Marco Rossi", role: "Founder & CEO" },
    coverImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
    content: [
      {
        type: "intro",
        body: "La trasformazione digitale di un'impresa edile non deve essere un progetto da anni con consulenti costosi e resistenze interne. Con il giusto piano e gli strumenti giusti, è possibile digitalizzare i processi chiave in 30 giorni. Questa roadmap è basata sull'esperienza reale di oltre 200 imprese edili italiane che hanno completato il percorso con successo.",
      },
      {
        type: "section",
        heading: "Perché la Maggior Parte Fallisce nel Digitale",
        body: "Il principale motivo per cui i progetti di digitalizzazione nelle imprese edili falliscono è l'approccio 'tutto e subito'. Si compra un software complesso, si cerca di implementare tutto contemporaneamente, il team non riesce a seguire, i risultati tardano ad arrivare e si torna alla vecchia abitudine. Il secondo motivo è la scelta di strumenti generici non pensati per l'edilizia: un imprenditore edile non ha tempo di configurare un CRM generico per far girare le sue commesse. Servono strumenti verticali, già pronti per il settore.",
      },
      {
        type: "list",
        heading: "Settimana 1: Audit dei Processi Attuali",
        items: [
          "Mappa i processi chiave: come gestisci oggi presenze, ordini, commesse e fatturazione?",
          "Identifica i 3 punti di maggiore inefficienza (dove si perde più tempo?)",
          "Calcola il costo attuale: ore spese × costo orario per ogni processo",
          "Definisci i KPI target: cosa vuoi migliorare e di quanto?",
          "Raccogli il consenso del team: presenta il progetto e spiega i benefici",
        ],
      },
      {
        type: "list",
        heading: "Settimana 2: Setup degli Strumenti",
        items: [
          "Configura il gestionale: inserisci cantieri attivi, operai e fornitori principali",
          "Importa i dati storici: almeno gli ultimi 3 mesi di commesse e fatture",
          "Configura i profili degli utenti con i permessi corretti",
          "Personalizza i template di preventivo e fattura con logo e dati aziendali",
          "Testa il sistema su un cantiere pilota prima del rollout generale",
        ],
      },
      {
        type: "list",
        heading: "Settimana 3: Formazione del Team",
        items: [
          "Sessione di 2 ore con i capicontiere: come timbrare e aggiornare l'avanzamento",
          "Sessione di 2 ore con l'ufficio: preventivi, commesse e fatturazione",
          "Crea un gruppo di supporto WhatsApp per le domande immediate",
          "Nomina un 'digital champion' interno che aiuta i colleghi",
          "Raccogli feedback dopo la prima settimana di utilizzo e fai aggiustamenti",
        ],
      },
      {
        type: "section",
        heading: "Settimana 4: Go-Live e Monitoraggio",
        body: "Nella quarta settimana si passa al go-live completo: tutte le presenze vengono registrate digitalmente, tutti gli ordini passano dal sistema, tutti i SAL vengono emessi dal gestionale. È normale che ci siano piccole resistenze o dimenticanze: l'importante è non tornare ai vecchi sistemi in parallelo. Monitora i KPI definiti nella settimana 1 e condividi i risultati con il team — niente motiva più di vedere i dati che migliorano. Pianifica una revisione a 30 giorni per valutare i progressi e pianificare i prossimi step.",
      },
      {
        type: "section",
        heading: "Errori da Evitare nel Processo di Digitalizzazione",
        body: "Gli errori più comuni nel processo di digitalizzazione sono: cercare di fare tutto contemporaneamente invece di procedere per fasi, scegliere il fornitore solo in base al prezzo invece che alla specializzazione settoriale, non coinvolgere il team nel processo decisionale, non definire KPI chiari da monitorare, e abbandonare al primo ostacolo invece di chiedere supporto al fornitore. Un buon fornitore di software gestionale per l'edilizia dovrebbe offrire onboarding guidato, formazione inclusa e supporto dedicato nei primi mesi.",
      },
      {
        type: "list",
        heading: "Checklist Finale: Il Tuo Piano in 30 Giorni",
        items: [
          "Settimana 1: Audit processi e calcolo costi attuali completato",
          "Settimana 2: Software configurato e testato su cantiere pilota",
          "Settimana 3: Team formato e digital champion nominato",
          "Settimana 4: Go-live completo su tutti i cantieri attivi",
          "Giorno 30: Prima revisione KPI e piano per i prossimi 60 giorni",
        ],
      },
      {
        type: "cta",
        heading: "Inizia la Tua Digitalizzazione Oggi",
        body: "Edilizia in Cloud include onboarding guidato, formazione inclusa e supporto dedicato per accompagnarti in ogni step del tuo piano di digitalizzazione. Richiedi una demo e inizia il tuo piano da 30 giorni.",
      },
    ],
  },
];

export const categories = [
  ...new Set(blogPosts.map((post) => post.category)),
] as string[];
