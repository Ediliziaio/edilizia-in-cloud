import { FLO_AVATAR } from "./blogAuthor";
import type { BlogPost } from "./blogPosts";

/**
 * Cluster "Confronti diretti" — 4 articoli comparativi con i principali
 * gestionali/piattaforme che una PMI edile italiana valuta prima di scegliere.
 * Regole editoriali: trasparenza dichiarata (siamo parte interessata e lo
 * scriviamo), pro reali dei competitor in ogni area, zero denigrazione,
 * NESSUN prezzo (né nostro né dei competitor), ogni fatto sul competitor con
 * la sua fonte ufficiale e reso come «dichiarato sul sito ufficiale» (mai
 * «non ha X»: al massimo «non indicato sul sito ufficiale»), claim datati
 * "ottobre 2026", NESSUN "verdetto" o vincitore dichiarato — la chiusura è
 * sempre segmentazione + domande.
 * I link interni automatici NON vanno scritti a mano: il renderer del blog
 * (linkifyInternal) trasforma automaticamente le frasi note ("gestionale di
 * cantiere", "fatturazione elettronica", "stato avanzamento lavori",
 * "preventivo edile", "timbratura digitale"...) in link verso le landing.
 * Fanno eccezione i link espliciti in markdown: [testo](https://…) per le
 * fonti ufficiali del competitor e [testo](/…) per le pagine /confronto e
 * /funzionalita. Il markdown funziona in intro, section, list e table; NON nel
 * body delle "cta" (testo semplice) né nelle FAQ. Nei body "\n\n" separa i
 * paragrafi; le tabelle di confronto (type "table") riportano solo fatti già
 * scritti nell'articolo.
 */
export const blogPostsConfrontoDiretti: BlogPost[] = [
  {
    id: "d1",
    slug: "edilizia-in-cloud-vs-teamsystem-construction",
    title: "Passare da TeamSystem a Edilizia in Cloud: cosa verificare",
    excerpt:
      "Guida al passaggio da TeamSystem: anagrafiche, commesse aperte, computi PriMus, fatture e costi. I controlli da fare prima di decidere la migrazione.",
    category: "Digitalizzazione",
    tags: [
      "teamsystem construction",
      "alternativa teamsystem edilizia",
      "migrazione gestionale edile",
      "software gestione commesse",
    ],
    publishedAt: "2026-07-25",
    updatedAt: "2026-10-30",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/edilizia-in-cloud-vs-teamsystem-construction.jpg",
    content: [
      {
        type: "intro",
        body: "Stai valutando di passare da TeamSystem a Edilizia in Cloud? Prima di spostare un solo dato, scrivi quale lavoro vuoi far andare meglio: i preventivi, le ore della squadra, i costi della commessa, i SAL o il giro di carte fra cantiere e ufficio. Cambiare programma senza questa lista sposta il problema, non lo risolve.\n\nQuesta guida spiega come preparare il passaggio. Per confrontare i prodotti funzione per funzione usa il [confronto aggiornato fra Edilizia in Cloud e TeamSystem Construction](/confronto/vs-teamsystem/), con fonti ufficiali e domande da fare in demo. Siamo Edilizia in Cloud e siamo parte interessata: non presentiamo questa guida come una valutazione indipendente. Aggiornata a ottobre 2026.",
      },
      {
        type: "section",
        heading: "Prima di cambiare: quale prodotto TeamSystem usi davvero",
        body: "TeamSystem Construction non è un programma solo: è una famiglia. Il [sito ufficiale](https://www.teamsystem.com/construction/) elenca, fra gli altri, CPM AI per la gestione delle commesse, TSE Costruzioni AI per la gestione dell’impresa, TS Cantieri per le piccole imprese edili e artigiane e TS Sicurezza Cantieri per POS e PSC. Hanno perimetri diversi: annota prodotto, versione, moduli attivi e integrazioni che usa la tua impresa.\n\nPoi scrivi tre attività che oggi richiedono lavoro a mano o non danno il risultato che ti aspetti. Per ognuna indica chi la fa, da quale documento parte e chi usa il dato alla fine. Questa lista diventa il criterio di prova del nuovo flusso, non un elenco generico di funzioni.",
      },
      {
        type: "section",
        heading: "Cosa dichiara TeamSystem: mettilo nella lista delle cose da ritrovare",
        body: "Per non scoprire a metà strada che ti manca qualcosa, parti da quello che il produttore dichiara. Sulla [pagina di TS Cantieri](https://www.teamsystem.com/construction/teamsystem-cantieri/) TeamSystem indica fatture elettroniche attive e passive, preventivi e computi, giornale di cantiere, SAL, marginalità, timbratura da app con geolocalizzazione, turni e presenze e il badge di cantiere digitale previsto dal DL 159/2025. Per la sicurezza, [TS Sicurezza Cantieri](https://www.teamsystem.com/construction/sicurezza-cantieri/) dichiara la redazione del POS da un archivio precompilato e il PSC con la gestione delle interferenze.\n\nSe usi una di queste funzioni ogni giorno, scrivila. In demo chiedi di vederla fatta con un tuo caso, non raccontata. Una funzione che manca va saputa prima della firma, non il primo lunedì di cantiere.",
      },
      {
        type: "list",
        heading: "I dati da censire prima dell’importazione",
        items: [
          "Anagrafiche: clienti, fornitori, persone e riferimenti che servono per ritrovare i documenti.",
          "Commesse aperte: codice, cliente, contratto, preventivo, venduto e stato dei lavori.",
          "Fasi: lavorazioni, sottofasi, date e assegnazioni che la squadra deve continuare a capire.",
          "Costi: separa i costi previsti, quelli sostenuti, quelli ancora da attribuire e i valori solo stimati.",
          "Documenti: fatture, bolle, allegati e collegamenti alla commessa; controlla quali collegamenti si possono esportare.",
          "Integrazioni: chi legge o scrive dati nel sistema di oggi, e chi ne tiene la configurazione.",
        ],
      },
      {
        type: "list",
        heading: "Cosa entra in Edilizia in Cloud senza ricopiarlo",
        items: [
          "Computi PriMus: il file XPWE o il PDF entra nel preventivo con computo, con capitoli e voci, e si ristampa nel formato PriMus. [Vedi il computo metrico](/funzionalita/computo-metrico/).",
          "Fatture da Fatture in Cloud: si importano in sola lettura (Edilizia in Cloud non scrive su Fatture in Cloud) e dalle fatture importate si possono creare i clienti.",
          "Fatture ricevute: file XML o ZIP caricati in blocco; da lì in avanti arrivano da sole con il codice destinatario.",
          "Listino: da un PDF o da una foto letti con l’AI, oppure partendo dai prezzari regionali adottati nel listino.",
          "Lo storico che non trasferisci resta consultabile nel sistema di partenza. E i dati che metti in Edilizia in Cloud si esportano quando vuoi, dalle impostazioni dell’azienda.",
        ],
      },
      {
        type: "section",
        heading: "Fai una prova su un campione prima di promettere tutto lo storico",
        body: "Scegli una commessa che rappresenti bene il tuo lavoro, con un preventivo, qualche giornata di ore e un paio di documenti di acquisto. Verifica i formati che puoi esportare dalla versione di partenza e confronta i valori originali con quelli che ottieni nel nuovo sistema.\n\nControlla una cosa per volta: descrizioni, unità di misura, quantità e importi. Una lavorazione deve restare distinta da un materiale da comprare; un costo non deve essere contato due volte perché compare sia nella bolla sia nella fattura. Non dare per scontato che allegati e collegamenti seguano da soli i dati principali.\n\nSolo dopo questa prova decidi cosa importare, cosa lasciare consultabile nel sistema di prima e cosa completare a mano. Le tre liste devono essere scritte nel piano di avvio.",
      },
      {
        type: "section",
        heading: "Concorda il punto di partenza delle commesse aperte",
        body: "Per ogni lavoro ancora aperto fissa venduto, costi già registrati, documenti non ancora attribuiti e lavorazioni da finire. Se lo storico non è affidabile, non trasformarlo in numeri certi: scrivi quali valori mancano o sono stimati.\n\nIn Edilizia in Cloud ogni lavorazione della commessa mostra il venduto, il costo previsto (preso dal preventivo e dal listino della manodopera, con la fonte indicata), il costo consuntivo e il margine. I costi senza fattura entrano con la foto della ricevuta e la fase a cui appartengono. I SAL coincidono con le rate: la rata matura quando il cliente firma il verbale dal link. Prova il [flusso della commessa](/funzionalita/gestione-commesse/) proprio su queste differenze: un margine calcolato su costi incompleti sembra buono e non dice niente.",
      },
      {
        type: "section",
        heading: "Il primo mese in cantiere: cosa cambia per la squadra",
        body: "Il passaggio riesce o fallisce in cantiere, non in ufficio. In Edilizia in Cloud l’operaio timbra con un tocco dal telefono, con la posizione: la giornata è una sola e, se cambia cantiere, tocca il nuovo luogo. Il rapportino cambia con il ruolo: l’operaio che lavora con un caposquadra lo chiude in un passo, il capo parte dalla sua squadra, e un rapportino respinto dall’ufficio si corregge e si rimanda.\n\nSe l’operaio compra qualcosa in negozio, fotografa la bolla o lo scontrino; l’ufficio verifica e il costo si conta una volta sola. Mezzi e attrezzi hanno un’etichetta QR: dal cantiere si scansiona e si segnala anche «è rotto». In ufficio tutto arriva in «Dal cantiere, da approvare».\n\nScegli due persone della squadra e falle lavorare una settimana con il nuovo flusso prima di estenderlo a tutti. Le [timbrature con GPS](/funzionalita/timbrature-gps/) e i [rapportini di cantiere](/funzionalita/rapportini-cantiere/) si giudicano dopo quella settimana, non in demo.",
      },
      {
        type: "section",
        heading: "Avvio assistito: come lo impostiamo",
        body: "Porta una commessa campione e gli export che riesci a ottenere. Insieme decidiamo cosa importare, cosa completare a mano e cosa resta nello storico di prima; poi configuriamo fasi, modelli di pagamento, regole dei rapportini e permessi per ruolo. Ogni azienda sceglie il proprio flusso: se oggi lavorate in un certo modo, si parte da quello.\n\nAmbito e tempi si fissano dopo la prova sul campione, con nomi e responsabilità scritti. Non promettiamo una durata uguale per tutte le imprese: dipende da dati, persone e integrazioni.",
      },
      {
        type: "list",
        heading: "Quando considerare concluso il primo controllo",
        items: [
          "Una persona dell’ufficio trova documenti e importi e sa correggere un’attribuzione sbagliata.",
          "Una persona della squadra completa la timbratura e il rapportino della giornata senza aiuto.",
          "Il titolare risale dai numeri della commessa ai dati che li compongono.",
          "Le differenze rispetto al sistema precedente sono spiegate, scritte e affidate a un responsabile.",
          "Sono chiari il perimetro dell’avvio, le attività da completare e dove consultare lo storico non trasferito.",
        ],
      },
      {
        type: "section",
        heading: "Se stai confrontando anche altri software",
        body: "Per scegliere fra altri prodotti consulta il [centro confronti](/confronto/) e la [guida ai gestionali per imprese edili](/blog/migliori-software-gestionali-edilizia-confronto/). Se il tuo dubbio riguarda computi e contabilità lavori, c’è il [confronto con PriMus](/confronto/vs-primus/).",
      },
      {
        type: "list",
        heading: "Fonti ufficiali TeamSystem consultate il 30 ottobre 2026",
        items: [
          "[TeamSystem Construction: famiglia di prodotti](https://www.teamsystem.com/construction/)",
          "[TS Cantieri](https://www.teamsystem.com/construction/teamsystem-cantieri/)",
          "[TS Sicurezza Cantieri](https://www.teamsystem.com/construction/sicurezza-cantieri/)",
          "[TS Construction Project Management AI](https://www.teamsystem.com/construction/project-management/)",
        ],
      },
      {
        type: "cta",
        heading: "Verifica il passaggio con i dati della tua impresa",
        body: "Porta una commessa campione e i formati che puoi esportare: verifichiamo insieme il flusso e definiamo ambito e tempi dell’avvio assistito.",
      },
    ],
    faqs: [
      {
        q: "È sempre necessario sostituire TeamSystem Construction?",
        a: "No. Parti dai processi che non riesci a gestire con la configurazione attuale e verifica se dipendono dal prodotto, dai moduli, dai dati o dall’organizzazione. TeamSystem Construction comprende più soluzioni dedicate alle costruzioni: il passaggio a un altro gestionale deve risolvere un bisogno concreto.",
      },
      {
        q: "Tutto lo storico di TeamSystem è trasferibile?",
        a: "Non va dato per scontato. Prima vanno controllati versione di partenza, formati esportabili, qualità dei dati e documenti collegati. Il trasferimento completo si concorda soltanto dopo una prova su un campione.",
      },
      {
        q: "Posso portare in Edilizia in Cloud i computi fatti con PriMus?",
        a: "Sì. Edilizia in Cloud importa i computi PriMus in formato XPWE o PDF nel preventivo con computo, senza ricopiare le voci, e li ristampa nel formato PriMus. Conviene comunque controllare un computo campione voce per voce.",
      },
      {
        q: "Come verificare una commessa dopo il trasferimento?",
        a: "Confronta preventivo originale, venduto, importi già registrati, documenti, fasi e costi attribuiti. Separa i dati mancanti e i valori stimati dagli importi verificati. Un dato non trasferito non deve diventare uno zero presentato come reale.",
      },
      {
        q: "Quanto tempo serve per partire?",
        a: "Dipende da dati, processi, persone e integrazioni. Chiedi un piano con verifiche, responsabilità e tempi concordati dopo la prova sul campione; non usare una durata standard come garanzia per ogni impresa.",
      },
    ],
  },
  {
    id: "d2",
    slug: "edilizia-in-cloud-vs-planradar",
    title: "Edilizia in Cloud vs PlanRadar: differenze e fonti 2026",
    excerpt:
      "PlanRadar documenta difetti, ispezioni e planimetrie; Edilizia in Cloud segue l’impresa dal preventivo alla fattura. Confronto con fonti ufficiali.",
    category: "Digitalizzazione",
    tags: [
      "planradar alternativa italiana",
      "software ispezioni cantiere",
      "gestionale edilizia",
      "confronto software edilizia",
    ],
    publishedAt: "2026-07-25",
    updatedAt: "2026-10-30",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/edilizia-in-cloud-vs-planradar.jpg",
    content: [
      {
        type: "intro",
        body: "Chi cerca un’alternativa italiana a [PlanRadar](https://www.planradar.com/it/) spesso confronta due attrezzi diversi. PlanRadar, come dichiara il sito ufficiale, serve a documentare il cantiere, gestire difetti e report e coordinare team e subappaltatori. Edilizia in Cloud è un gestionale per la PMI edile italiana: segue il lavoro dal primo contatto al preventivo, dalla commessa alle ore della squadra, fino al SAL e alla fattura.\n\nIn questo confronto trovi cosa dichiara PlanRadar, dove è più forte, dove i due prodotti si sovrappongono e quando ha senso usarli insieme. Aggiornato a ottobre 2026.",
      },
      {
        type: "section",
        heading: "Siamo parte interessata, e lo diciamo subito",
        body: "Questo confronto lo firma Edilizia in Cloud: siamo parte interessata. Le informazioni su PlanRadar vengono dalle sue pagine ufficiali, consultate il 30 ottobre 2026 ed elencate in fondo. Quando una funzione non compare su quelle pagine scriviamo «non indicato sul sito ufficiale»: vuol dire solo che non l’abbiamo trovata lì, non che manchi.\n\nNon troverai un vincitore. Tra due attrezzi diversi non si proclama il migliore: si capisce quale serve al lavoro che hai davanti, e a volte servono tutti e due.",
      },
      {
        type: "table",
        heading: "Confronto rapido: PlanRadar ed Edilizia in Cloud",
        headers: ["Area", "PlanRadar (dichiarato sul sito ufficiale)", "Edilizia in Cloud"],
        rows: [
          [
            "Mestiere principale",
            "Documentazione di cantiere, difetti, report, coordinamento di team e subappaltatori",
            "Gestione dell’impresa edile: vendita, preventivo, commessa, squadra, SAL e fattura",
          ],
          [
            "Documentazione di cantiere",
            "Ticket su planimetria, modelli BIM, foto a 360° posizionate con SiteView",
            "Foto geolocalizzate, rapportini con foto, giornale lavori anche automatico",
          ],
          [
            "Checklist e sicurezza",
            "Ispezioni, checklist, audit di sicurezza",
            "Checklist di sicurezza dal cantiere, POS sul modello ufficiale, DUVRI",
          ],
          [
            "Pianificazione",
            "Gantt con aggiornamenti dal cantiere",
            "Fasi e sottofasi con date, cronoprogramma con le date reali dai rapportini",
          ],
          [
            "Manutenzione e assistenza",
            "Manutenzione ricorrente",
            "Ticket di assistenza a 9 stati, interventi a squadre, manutenzione impianti",
          ],
          [
            "AI",
            "Moduli generati dall’AI, ticket a voce, assistente sui dati di progetto; AI Agents (agosto 2026)",
            "Lettura di DDT e fatture, listini da PDF o foto, assistente Silvio",
          ],
          [
            "Preventivi e computi",
            "Non indicato sul sito ufficiale",
            "Preventivatori di mestiere e preventivo con computo, import PriMus",
          ],
          [
            "Fatturazione elettronica SDI",
            "Non indicato sul sito ufficiale",
            "Fatture, note di credito e invio allo SDI tramite intermediario",
          ],
          [
            "SAL e incassi",
            "SAL secondo la normativa italiana non indicato sul sito ufficiale",
            "SAL = rata firmata dal cliente via link, scadenzario e incassi",
          ],
          [
            "Integrazioni",
            "PlanRadar Connect, oltre 200 app senza codice",
            "Webhook, collegamenti a Zapier, Make e n8n, connettore per Claude e ChatGPT",
          ],
          [
            "Mercato",
            "Internazionale, web e app iOS e Android, sito in italiano",
            "Italia: norme, documenti e vocabolario delle imprese italiane",
          ],
        ],
      },
      {
        type: "section",
        heading: "Due categorie diverse: documentare il progetto o gestire l’impresa",
        body: "PlanRadar parte dalla planimetria. Apri un ticket nel punto esatto del disegno, lo assegni all’impresa responsabile, alleghi le foto e lo segui fino alla chiusura. Il sito ufficiale lo rivolge a imprese, committenti, architetti, ingegneri, direttori lavori, facility manager e imprese specializzate.\n\nEdilizia in Cloud parte dalla commessa. Il cliente firma il preventivo, nasce la commessa con fasi e squadre, gli operai timbrano e mandano il rapportino, i DDT entrano nel magazzino, il cliente firma il SAL e la rata matura, la fattura parte verso lo SDI.\n\nDetta con un’immagine da cantiere: PlanRadar è il collaudatore che fotografa e verbalizza ogni difetto; Edilizia in Cloud è il sistema con cui l’impresa segue il lavoro dal contratto all’incasso. Sono risposte a domande diverse.",
      },
      {
        type: "list",
        heading: "Dove PlanRadar è forte, secondo il sito ufficiale",
        items: [
          "Gestione di difetti e snag con ticket sulle planimetrie, assegnati e seguiti fino alla chiusura.",
          "Planimetrie e modelli BIM, gestione documentale, report e statistiche.",
          "SiteView: foto a 360° posizionate sulla planimetria con l’AI, per rivedere il cantiere com’era in un certo giorno.",
          "Ispezioni, checklist, audit di sicurezza, giornale di cantiere, consegne e manutenzione ricorrente.",
          "Programmazione con Gantt aggiornato dal cantiere.",
          "PlanRadar Connect: collegamento con oltre 200 app senza scrivere codice.",
          "Web app e app iOS e Android, con una presenza internazionale: la home parla di oltre 75 paesi.",
        ],
      },
      {
        type: "section",
        heading: "Le novità AI di PlanRadar nel 2026",
        body: "PlanRadar sta investendo molto sull’intelligenza artificiale. Sul [sito dedicato all’AI](https://www.planradar.ai/it/) dichiara moduli generati da una descrizione o da un documento, ticket creati a voce, un assistente che risponde sui dati di progetto, panoramiche automatiche e ricerca; dichiara anche di non usare i dati dei clienti per addestrare l’AI.\n\nLa [rassegna stampa ufficiale](https://www.planradar.com/press/) riporta l’arrivo graduale dell’AI Assistant (4 gennaio 2026) e gli AI Agents di agosto 2026, ripresi tra gli altri da un articolo de Il Sole 24 Ore del 19 agosto 2026. Il centro assistenza descrive anche il riepilogo di progetto scritto dall’AI e il costruttore di moduli con l’AI, disponibile nella web app.\n\nSe la tua squadra vive di ispezioni e verbali, queste funzioni vanno provate: sono il terreno su cui PlanRadar sta correndo di più.",
      },
      {
        type: "section",
        heading: "Cosa non è indicato sul sito ufficiale di PlanRadar",
        body: "Sulle pagine ufficiali che abbiamo letto non sono indicati: fatturazione elettronica verso lo SDI, contabilità, preventivi o computi, SAL secondo la normativa italiana, DURC, POS, magazzino e buste paga. Non è un’accusa: è il perimetro con cui il prodotto si presenta.\n\nPer una PMI edile italiana la conseguenza è pratica. Se usi solo uno strumento di documentazione, preventivi, ore, acquisti, SAL e fatture girano altrove: su Excel, su WhatsApp o nel programma del commercialista. Le domande della sera — quanto margine sto facendo su questa commessa, chi mi deve ancora pagare — restano fuori da quel perimetro.",
      },
      {
        type: "section",
        heading: "Dove i due prodotti si sovrappongono: la documentazione di cantiere",
        body: "La documentazione è l’unica area in cui i due prodotti si toccano davvero, e conviene essere precisi.\n\nIn Edilizia in Cloud le [foto di cantiere](/funzionalita/foto-cantiere/) sono geolocalizzate e agganciate alla commessa. Il [rapportino](/funzionalita/rapportini-cantiere/) cambia con il ruolo: l’operaio con il caposquadra lo chiude in un passo, il capo parte dalla squadra, e c’è anche il rapportino a voce. Il [giornale lavori](/funzionalita/giornale-lavori/) si compila dal telefono e può generarsi in automatico dai rapportini. Le checklist di sicurezza si compilano dal cantiere, con la verifica di idoneità tecnico-professionale e il POS sul modello ufficiale. A fine lavori il cliente firma sul telefono.\n\nCosì, quando un committente contesta un lavoro di tre mesi prima, trovi in due minuti foto con data e posizione, rapportino e ore di quel giorno, collegati alla commessa e alla fattura.\n\nSu progetti grandi, con decine di imprese e responsabilità incrociate, ticket su planimetria, modelli BIM e foto a 360° di PlanRadar hanno una profondità che noi non rincorriamo. Lo scriviamo senza problemi.",
      },
      {
        type: "section",
        heading: "Dopo la consegna: assistenza e interventi",
        body: "PlanRadar dichiara consegne e manutenzione ricorrente. Edilizia in Cloud segue il cliente anche dopo il cantiere: ogni richiesta diventa un [ticket di assistenza](/funzionalita/ticket-assistenza/) con 9 stati, tempi di risposta, pagamenti sul ticket e merce ordinata collegata. L’intervento si assegna a un operaio, a una squadra o a un subappaltatore, che dall’app vede dove andare e cosa fare, compila il rapportino e chiude. Per gli impianti c’è lo storico delle manutenzioni con le scadenze.",
      },
      {
        type: "section",
        heading: "Il flusso completo: dal preventivo alla fattura nello stesso posto",
        body: "Lunedì fai il sopralluogo con il modello del tuo mestiere (infissi, bagno, ristrutturazione, fotovoltaico, cappotto, tetto, climatizzazione). Prepari il [preventivo](/funzionalita/preventivi-edilizia/) con il preventivatore del tuo mestiere oppure con il computo, anche importando un file PriMus. Il cliente firma con un codice che riceve per SMS o email, sulla copia del PDF che non si può più cambiare. Nasce la commessa con fasi, squadre e costo previsto.\n\nDa martedì la squadra timbra e manda i rapportini dall’app. Il DDT del fornitore si fotografa: l’AI legge le righe, le abbina all’ordine e, alla conferma, carica il magazzino. In ufficio vedi l’avanzamento e il margine di ogni lavorazione.\n\nSi chiude dove si incassa: il SAL è la rata, il cliente lo firma dal link e la rata matura; la [fattura elettronica](/funzionalita/fatturazione-elettronica/) parte verso lo SDI e lo scadenzario dice chi deve ancora pagare. Ogni passaggio alimenta il successivo senza ricopiare niente.",
      },
      {
        type: "section",
        heading: "Possono stare insieme? In certe imprese sì",
        body: "PlanRadar ed Edilizia in Cloud non si escludono. Pensa a un’impresa che fa anche general contracting: i cantieri grandi, con molti subappaltatori e un committente esigente, usano la gestione difetti e la documentazione di progetto di PlanRadar; intanto l’impresa — preventivi, commesse, ore, magazzino, SAL, fatture, incassi — gira su Edilizia in Cloud. PlanRadar Connect e i webhook di Edilizia in Cloud permettono di studiare un collegamento, da verificare caso per caso.\n\nPer una PMI da 5–20 persone, invece, far adottare due piattaforme alla squadra è spesso più fatica che vantaggio: foto, rapportini e checklist del gestionale coprono la documentazione di tutti i giorni. La domanda da farti è una: il mio collo di bottiglia oggi è documentare i difetti o gestire l’impresa?",
      },
      {
        type: "section",
        heading: "Il software è metà del lavoro",
        body: "Nessun software, questo compreso, ti insegna a leggere i numeri, ti dà un metodo per vendere o ti porta richieste se il telefono suona poco. Attorno a Edilizia in Cloud ci sono consulenti, formazione e assistenza in italiano, e percorsi collegati: [Numeri in Edilizia](https://www.numerinedilizia.com/) per il controllo di gestione, [VENDITA EDILE®](https://venditaedile.it/) per il metodo commerciale, [Marketing Edile®](https://www.marketingedile.com/) per portare richieste. Anche PlanRadar ha assistenza e una rete commerciale in molti paesi: la differenza è su cosa ti affiancano.",
      },
      {
        type: "list",
        heading: "Come scegliere: le domande giuste da farti",
        items: [
          "Il mio collo di bottiglia oggi è documentare i difetti o gestire l’impresa?",
          "Preventivi, SAL, fatture e scadenzario in quale programma girano adesso, e chi li ricopia?",
          "Le ore degli operai diventano costi di commessa da sole, o le ricopia qualcuno la sera?",
          "Se il committente contesta un lavoro di tre mesi fa, in quanti minuti trovo foto, rapportino e ore di quel giorno?",
          "I subappaltatori da coordinare sui miei cantieri sono tre o trenta?",
          "Quante piattaforme può reggere davvero la mia squadra, tra installazione, formazione e abitudini?",
        ],
      },
      {
        type: "section",
        heading: "Se stai confrontando anche altri software",
        body: "Gli altri confronti — Pillar, TeamSystem Construction, PriMus ACCA, Dylog, Buildertrend, Edilnet ed Excel — sono raccolti nel [centro confronti](/confronto/). La [guida ai gestionali per imprese edili](/blog/migliori-software-gestionali-edilizia-confronto/) li mette uno accanto all’altro.",
      },
      {
        type: "list",
        heading: "Fonti ufficiali PlanRadar consultate il 30 ottobre 2026",
        items: [
          "[PlanRadar: home in italiano](https://www.planradar.com/it/)",
          "[SiteView](https://www.planradar.com/it/prodotto/siteview/)",
          "[Programmazione del progetto](https://www.planradar.com/it/programmazione-di-un-progetto/)",
          "[PlanRadar Connect](https://www.planradar.com/it/connect/)",
          "[Funzioni AI di PlanRadar](https://www.planradar.ai/it/)",
          "[Rassegna stampa: AI Assistant e AI Agents](https://www.planradar.com/press/)",
          "[Centro assistenza: moduli con l’AI](https://help.planradar.com/hc/en-gb/articles/34987637859613-Create-and-Edit-Forms-with-AI)",
          "[Centro assistenza: riepilogo di progetto con l’AI](https://help.planradar.com/hc/en-gb/articles/27675596204573-Generate-an-AI-Project-Summary)",
        ],
      },
      {
        type: "cta",
        heading: "Prova il flusso completo sul tuo prossimo lavoro",
        body: "Porta un lavoro vero: dal sopralluogo al preventivo firmato, dalla commessa ai rapportini della squadra, dal SAL firmato alla fattura. Se poi ti serve anche la gestione difetti di PlanRadar, saprai esattamente cosa ti manca e perché.",
      },
    ],
    faqs: [
      {
        q: "PlanRadar è un gestionale per imprese edili?",
        a: "Il sito ufficiale presenta PlanRadar come software per documentare il cantiere, gestire difetti e report e coordinare team e subappaltatori. Fatturazione elettronica SDI, preventivi, computi e SAL secondo la normativa italiana non sono indicati sulle pagine ufficiali che abbiamo letto. Edilizia in Cloud è un gestionale per la PMI edile italiana, dal preventivo alla fattura.",
      },
      {
        q: "Qual è la differenza tra PlanRadar ed Edilizia in Cloud?",
        a: "Il mestiere. PlanRadar documenta il progetto: difetti su planimetria, ispezioni, foto a 360° con SiteView, modelli BIM, Gantt. Edilizia in Cloud gestisce l’impresa: preventivi e computi, commesse con fasi e squadre, timbrature e rapportini, magazzino e DDT letti con l’AI, SAL firmati dal cliente e fatture verso lo SDI.",
      },
      {
        q: "PlanRadar ha funzioni di intelligenza artificiale?",
        a: "Sì. Il sito ufficiale dichiara moduli generati dall’AI, ticket a voce, un assistente sui dati di progetto e ricerca AI; la rassegna stampa ufficiale riporta l’AI Assistant da gennaio 2026 e gli AI Agents da agosto 2026.",
      },
      {
        q: "Edilizia in Cloud documenta il cantiere come PlanRadar?",
        a: "In parte. Edilizia in Cloud ha foto geolocalizzate, rapportini con foto e a voce, giornale lavori anche automatico, checklist di sicurezza dal cantiere e firma del cliente a fine lavori, tutto collegato a commessa e fattura. Ticket su planimetria, modelli BIM e foto a 360° sono il terreno specialistico di PlanRadar.",
      },
      {
        q: "PlanRadar ed Edilizia in Cloud possono essere usati insieme?",
        a: "Sì, nelle imprese che gestiscono cantieri grandi con molti subappaltatori: PlanRadar per difetti e documentazione di progetto, Edilizia in Cloud per preventivi, commesse, ore, magazzino, SAL e fatture. Per una piccola impresa spesso bastano foto, rapportini e checklist del gestionale.",
      },
    ],
  },
  {
    id: "d3",
    slug: "edilizia-in-cloud-vs-dylog-edilizia",
    title: "Edilizia in Cloud vs Dylog Edilizia: cosa cambia davvero",
    excerpt:
      "Dylog dichiara contabilità fino ai dichiarativi e conservazione sostitutiva; Edilizia in Cloud lavora su cantiere e commessa. Confronto con fonti.",
    category: "Digitalizzazione",
    tags: [
      "dylog edilizia alternativa",
      "gestionale edile cloud",
      "software gestione cantiere",
      "confronto gestionali edilizia",
    ],
    publishedAt: "2026-07-25",
    updatedAt: "2026-10-30",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/edilizia-in-cloud-vs-dylog-edilizia.jpg",
    content: [
      {
        type: "intro",
        body: "Chi confronta Dylog ed Edilizia in Cloud sta guardando due baricentri diversi. Il [software gestionale per imprese edili di Dylog](https://www.dylog.it/software-gestionali/aziende/edilizia/), come dichiara il sito ufficiale, parte dall’amministrazione: contabilità fino ai dichiarativi, fatturazione elettronica con Peppol e ordini NSO, conservazione sostitutiva, magazzino, in cloud oppure installato in azienda.\n\nEdilizia in Cloud parte dal cantiere e dalla commessa: preventivi di mestiere, fasi e squadre, timbrature e rapportini dal telefono, DDT letti con l’AI, SAL firmati dal cliente, fatture verso lo SDI e un portale per il commercialista. Questo confronto ti dice dove è forte l’uno e dove l’altro. Aggiornato a ottobre 2026.",
      },
      {
        type: "section",
        heading: "Siamo parte interessata, e lo diciamo subito",
        body: "Questo confronto lo scrive Edilizia in Cloud: siamo parte interessata. Le informazioni su Dylog vengono dalla sua pagina ufficiale per l’edilizia, consultata il 30 ottobre 2026. Quando qualcosa non compare su quella pagina scriviamo «non indicato sul sito ufficiale»: non vuol dire che manchi.\n\nSu contabilità e adempimenti Dylog dichiara cose che Edilizia in Cloud non fa, e lo scriviamo chiaro più sotto. Non c’è un vincitore: c’è una mappa per capire quale baricentro serve alla tua impresa.",
      },
      {
        type: "table",
        heading: "Confronto rapido: Dylog Edilizia ed Edilizia in Cloud",
        headers: ["Area", "Dylog (dichiarato sul sito ufficiale)", "Edilizia in Cloud"],
        rows: [
          [
            "Baricentro",
            "Amministrazione e gestione d’impresa, divisibile per filiale, cantiere o commessa",
            "Cantiere e commessa, dal preventivo alla fattura",
          ],
          [
            "Contabilità",
            "Area amministrativa completa fino ai dichiarativi, contabilità, cespiti",
            "Prima nota, registro e liquidazione IVA, scadenzario, tesoreria; niente contabilità ordinaria né bilancio",
          ],
          [
            "Fatturazione elettronica",
            "FEPA verso la PA, B2B, Peppol, ordini NSO",
            "Fatture, note di credito, fatture a privati, invio allo SDI tramite intermediario",
          ],
          [
            "Conservazione a norma",
            "Conservazione sostitutiva",
            "Non inclusa: va affidata a un servizio dedicato",
          ],
          [
            "Installazione",
            "Cloud oppure on premise",
            "Solo cloud: browser e telefono",
          ],
          [
            "Magazzino",
            "Giacenze per cantiere, 13 criteri di valorizzazione, distinta base, barcode",
            "Giacenze, prelievo dal cantiere, DDT fornitore letti con l’AI che caricano il magazzino",
          ],
          [
            "Cantiere e squadra",
            "Rapportini di attività e manutenzione, consuntivo ore, pianificazione del personale",
            "Timbratura a un tocco con GPS, rapportini per ruolo, merce presa in negozio, mezzi con QR",
          ],
          [
            "SAL",
            "SAL e cronoprogramma",
            "SAL = rata, firmato dal cliente via link; contabilità lavori pubblici",
          ],
          [
            "Sicurezza",
            "Archivio documenti, compresi POS e PSC",
            "POS sul modello ufficiale con controllo Allegato XV, DUVRI, scadenze DURC",
          ],
          [
            "CRM e vendita",
            "CRM cloud: lead, campagne, post-vendita, agenda tecnici",
            "Pipeline, preventivatori di mestiere, firma con OTP, agente WhatsApp dei lead",
          ],
          [
            "AI",
            "Non indicata sulla pagina edilizia",
            "Lettura di DDT, fatture ed estratti conto, listini da PDF o foto, assistente Silvio",
          ],
          [
            "Commercialista",
            "Assistenza telefonica e partner sul territorio",
            "Portale commercialista multi-azienda",
          ],
        ],
      },
      {
        type: "section",
        heading: "Dove Dylog è più forte: amministrazione e adempimenti",
        body: "Sull’amministrazione il terreno è di Dylog, e lo riconosciamo. La pagina ufficiale dichiara un’area amministrativa completa fino ai dichiarativi, divisibile per filiale, cantiere o commessa, la contabilità e l’analisi dei cespiti. Dichiara la fatturazione elettronica verso la PA e fra imprese, Peppol, gli ordini NSO e la conservazione sostitutiva. Il magazzino valorizza le giacenze con 13 criteri (LIFO, FIFO e altri), con distinta base e barcode. E si può avere in cloud oppure installato sul proprio server.\n\nEdilizia in Cloud non fa la contabilità ordinaria, non fa il bilancio e non fa la conservazione digitale a norma. Se la tua impresa tiene la contabilità in casa, magari con più filiali e una persona dedicata, quella profondità è un valore vero, e non ha senso rinunciarci per un programma che non la offre.",
      },
      {
        type: "list",
        heading: "Punti forti di Dylog, secondo il sito ufficiale",
        items: [
          "Area amministrativa completa fino ai dichiarativi, divisibile per filiale, cantiere o commessa.",
          "Contabilità e analisi dei cespiti.",
          "Fatturazione elettronica FEPA e B2B, Peppol, ordini NSO e conservazione sostitutiva.",
          "Magazzino con giacenze per cantiere, 13 criteri di valorizzazione, distinta base e barcode.",
          "Commessa con redditività, costi per filiale e cantiere e WBS; cronoprogramma e SAL.",
          "CRM in cloud, Business Intelligence in cloud e moduli web.",
          "Soluzioni in cloud e on premise, assistenza telefonica, partner sul territorio e recupero dati da altri gestionali.",
        ],
      },
      {
        type: "section",
        heading: "Dove lavora Edilizia in Cloud: il cantiere, mentre succede",
        body: "Il nostro baricentro è opposto: il dato nasce in cantiere, dal telefono di chi lavora. Una giornata tipo: alle 7 l’operaio timbra con un tocco, con la posizione; se a metà mattina cambia cantiere tocca il nuovo luogo e la giornata resta una. Il caposquadra fotografa il DDT del fornitore: l’AI legge le righe, le abbina all’ordine e, quando l’ufficio conferma, la merce entra in magazzino. Se un operaio compra viti in negozio fotografa lo scontrino, e il costo si conta una volta sola. Alle 17 il rapportino parte, diverso per ruolo, anche a voce.\n\nIn ufficio arriva tutto in «Dal cantiere, da approvare». Ogni lavorazione della commessa mostra venduto, costo previsto, costo consuntivo e margine. Mezzi e attrezzi hanno un’etichetta QR: si scansionano dal cantiere e si segnala se sono rotti.\n\nLa pagina edilizia di Dylog dichiara rapportini, consuntivo ore e pianificazione del personale, oltre all’archivio documenti «a portata di smartphone». La domanda pratica è: quante volte lo stesso dato viene toccato prima di diventare un numero utile? Provalo su una settimana vera con entrambi.",
      },
      {
        type: "section",
        heading: "SAL, sicurezza e lavori pubblici",
        body: "Dylog dichiara SAL e cronoprogramma, e l’archivio dei documenti di sicurezza come POS e PSC. In Edilizia in Cloud il SAL coincide con la rata: si genera dalle fasi, il cliente lo firma dal link e la rata matura alla firma. Per gli appalti pubblici c’è la [contabilità lavori](/funzionalita/contabilita-lavori/): elenco prezzi, libretto delle misure, registro, SAL, certificato di pagamento e varianti, con le stampe.\n\nSulla sicurezza il POS si compila sul modello ufficiale (DI 9/9/2014) con il controllo dell’Allegato XV, insieme al DUVRI; si verificano idoneità tecnico-professionale e scadenze, e il DURC dei subappaltatori ha il suo semaforo (mancante, scaduto, in scadenza). Trovi tutto nella pagina sulla [sicurezza di cantiere](/funzionalita/sicurezza-cantiere/).",
      },
      {
        type: "section",
        heading: "Il commercialista: chi fa cosa",
        body: "Molte PMI edili lasciano i dichiarativi allo studio. Edilizia in Cloud tiene i conti che servono al titolare — [prima nota](/funzionalita/prima-nota/), registro e liquidazione IVA con reverse charge, scadenzario, incassi, tesoreria con import degli estratti conto — e dà al commercialista un portale suo, da cui vede le aziende che segue. Le buste paga che carica il consulente si possono consultare dagli operai nell’app.\n\nIl controllo di gestione legge il conto economico riclassificato, il budget, il rendiconto di cassa e prepara un pacchetto per la banca, che dice «bozza» se i dati non quadrano. È uno strumento di lettura per il titolare: non sostituisce la contabilità ordinaria né il bilancio, che restano allo studio o a un gestionale contabile come quello di Dylog.",
      },
      {
        type: "section",
        heading: "Vendita e AI",
        body: "Dylog dichiara un CRM in cloud con lead, campagne, post-vendita, agenda dei tecnici e rapportini. In Edilizia in Cloud la vendita è l’inizio dello stesso flusso: il contatto entra dal sito o dai moduli Facebook attivati dall’azienda, passa in [pipeline](/funzionalita/pipeline-vendite/), riceve un sopralluogo e un preventivo dal preventivatore del suo mestiere (serramenti con disegno degli infissi, fotovoltaico con piano di posa, bagni, tetti e altri). Il cliente firma con un codice OTP e nasce la commessa. Con l’add-on WhatsApp, un agente risponde ai nuovi contatti e fissa l’appuntamento sul calendario vero.\n\nSull’AI, la pagina edilizia di Dylog non indica funzioni dedicate. In Edilizia in Cloud l’AI legge DDT, fatture ricevute, estratti conto e listini dei fornitori da PDF o foto: il risultato lo controlli e lo confermi tu.",
      },
      {
        type: "section",
        heading: "Cloud o installazione in azienda",
        body: "Dylog offre entrambe le strade: cloud oppure on premise, con assistenza telefonica e partner sul territorio. Per chi vuole i dati sul proprio server o un tecnico di zona, è un pro vero.\n\nEdilizia in Cloud è solo cloud: si lavora da browser e telefono, i dati stanno su server in Unione Europea, ci sono backup settimanali per azienda e l’esportazione dei tuoi dati quando vuoi. Gli aggiornamenti arrivano a tutti senza installare niente. Sono due modi di comprare prima ancora che due software.",
      },
      {
        type: "list",
        heading: "Come scegliere: le domande giuste da farti",
        items: [
          "La contabilità la faccio in casa fino ai dichiarativi o la lascio allo studio del commercialista?",
          "Mi serve la conservazione sostitutiva dentro il gestionale, o ce l’ho già con un altro servizio?",
          "Dove nasce il dato nella mia impresa: in ufficio dopo, o in cantiere mentre succede?",
          "Quante volte lo stesso dato viene toccato prima di diventare un numero utile?",
          "Lavoro con la PA e mi servono libretto delle misure e certificati di pagamento?",
          "Mi serve un partner di zona con installazione dedicata, o un prodotto in cloud che si aggiorna da solo?",
        ],
      },
      {
        type: "section",
        heading: "Possono stare insieme?",
        body: "Sì, se dividi bene i compiti. Un’impresa può tenere contabilità, dichiarativi e conservazione su un gestionale amministrativo e usare Edilizia in Cloud per vendita, cantiere, squadra, SAL e controllo delle commesse. In quel caso decidi prima chi emette le fatture, per non averle in due posti, e come passano i dati allo studio.\n\nIl criterio più onesto è guardare dove l’impresa perde soldi oggi: se li perde in amministrazione disordinata, pesa di più la profondità contabile; se li perde in ore non tracciate, preventivi lenti e margini scoperti a fine anno, il problema è in cantiere.",
      },
      {
        type: "section",
        heading: "Se stai confrontando anche altri software",
        body: "Nel [centro confronti](/confronto/) trovi lo stesso esame su Pillar, TeamSystem Construction, PriMus ACCA, PlanRadar, Buildertrend, Edilnet ed Excel. La [guida ai gestionali per imprese edili](/blog/migliori-software-gestionali-edilizia-confronto/) li mette uno accanto all’altro.",
      },
      {
        type: "list",
        heading: "Fonti ufficiali Dylog consultate il 30 ottobre 2026",
        items: [
          "[Dylog: software gestionale per imprese edili](https://www.dylog.it/software-gestionali/aziende/edilizia/)",
        ],
      },
      {
        type: "cta",
        heading: "Confronta sul tuo cantiere, non sulle brochure",
        body: "Porta una commessa vera: facciamo timbrare la squadra, leggiamo un DDT, prepariamo un SAL e ti mostriamo cosa vede il tuo commercialista. Poi confronta con quello che hai oggi.",
      },
    ],
    faqs: [
      {
        q: "Che cosa dichiara Dylog per le imprese edili?",
        a: "La pagina ufficiale dichiara un’area amministrativa completa fino ai dichiarativi, contabilità e cespiti, commessa con redditività e WBS, magazzino con 13 criteri di valorizzazione, rapportini e consuntivo ore, cronoprogramma e SAL, fatturazione elettronica con Peppol e ordini NSO, conservazione sostitutiva, CRM in cloud, in cloud oppure on premise.",
      },
      {
        q: "Edilizia in Cloud fa la contabilità ordinaria e la conservazione a norma?",
        a: "No. Edilizia in Cloud tiene prima nota, registro e liquidazione IVA, scadenzario, incassi e tesoreria, ma non fa contabilità ordinaria, bilancio né conservazione digitale a norma. Su questi punti Dylog dichiara funzioni che Edilizia in Cloud non ha.",
      },
      {
        q: "Qual è la differenza principale tra Dylog ed Edilizia in Cloud?",
        a: "Il baricentro. Dylog parte dall’amministrazione dell’impresa. Edilizia in Cloud parte dal cantiere e dalla commessa: timbrature e rapportini dal telefono, DDT letti con l’AI, SAL firmati dal cliente, contabilità lavori pubblici, POS sul modello ufficiale e un portale per il commercialista.",
      },
      {
        q: "Si possono usare Dylog ed Edilizia in Cloud insieme?",
        a: "Sì, dividendo i compiti: amministrazione, dichiarativi e conservazione sul gestionale contabile; vendita, cantiere, squadra, SAL e commesse su Edilizia in Cloud. Va deciso prima dove nascono le fatture, per non averle in due posti.",
      },
      {
        q: "Un’impresa che usa Dylog da anni dovrebbe cambiare?",
        a: "Non per moda. Se l’amministrazione gira bene, il cambio ha senso solo se l’impresa perde soldi in cantiere: ore non tracciate, preventivi lenti, margini scoperti a consuntivo, rapportini che non tornano. Conviene provarlo su una commessa vera.",
      },
    ],
  },
  {
    id: "d4",
    slug: "edilizia-in-cloud-vs-pillar",
    title: "Edilizia in Cloud vs Pillar: funzioni e differenze",
    excerpt:
      "Pillar ed Edilizia in Cloud a confronto su WhatsApp, AI, preventivi, DDT, SAL, SDI, DURC e sicurezza. Punti di forza e fonti ufficiali, ottobre 2026.",
    category: "Digitalizzazione",
    tags: [
      "edilizia in cloud vs pillar",
      "alternativa a Pillar",
      "confronto gestionali edilizia",
      "gestione commesse",
    ],
    publishedAt: "2026-07-25",
    updatedAt: "2026-10-30",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Fondatore di Edilizia in Cloud", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/edilizia-in-cloud-vs-pillar.jpg",
    content: [
      {
        type: "intro",
        body: "Pillar ed Edilizia in Cloud sono due gestionali per imprese edili che coprono molte cose simili: preventivi, bolle, rapportini, commessa, SAL e fatturazione elettronica con SDI. La differenza sta in come ci arrivano. Pillar, come dichiara il [sito ufficiale](https://www.pillar.it/), punta su WhatsApp e su un assistente AI: niente app per la squadra, basta un messaggio. Edilizia in Cloud punta su un flusso unico dalla vendita al cantiere, con un’app per chi lavora e un portale per cliente, subappaltatori e commercialista.\n\nQui trovi cosa dichiara Pillar, dove è più forte, cosa aggiunge Edilizia in Cloud e una prova pratica per scegliere. Aggiornato a ottobre 2026.",
      },
      {
        type: "section",
        heading: "Dove Pillar è forte: WhatsApp e AI",
        body: "Il punto di forza dichiarato da Pillar è semplice da capire in cantiere: «niente app, password o dispositivi: basta WhatsApp». Dalla [pagina Pillar AI](https://www.pillar.it/pillar-ai) risulta che la squadra manda foto, bolle e messaggi vocali in chat e Pillar ne ricava rapportini strutturati, anche quando l’operaio parla in un’altra lingua. Dalla foto della bolla escono articoli, prezzi e firma, e la bolla si aggancia alla commessa.\n\nPillar AI risponde in linguaggio naturale su commesse, incassi, ore, fornitori e conti, e propone l’abbinamento fra movimenti bancari e fatture da confermare. Sulla cassa dichiara saldo e previsione di liquidità a 30–90 giorni. Sulla sicurezza dichiara il controllo del DURC con avviso prima della scadenza e la classificazione con l’AI di oltre 65 tipi di documenti dei subappaltatori.\n\nSe la tua squadra non userà mai un’app, l’approccio via WhatsApp di Pillar è un vantaggio vero, e va provato.",
      },
      {
        type: "section",
        heading: "SDI e SAL: Pillar li dichiara entrambi",
        body: "Pillar documenta tutte e due le cose. La [pagina sulla fatturazione elettronica](https://www.pillar.it/fatturazione) descrive compilazione, controlli su IVA, anagrafica e numerazione, invio allo SDI in XML con ricezione dell’esito, fattura dal preventivo approvato o dalla commessa, fatture attive e passive, scadenzario e solleciti. La [pagina sul SAL](https://www.pillar.it/gestione-sal-stato-avanzamento-lavori) descrive voci dal programma di cantiere nato dal preventivo, avanzamento da vocale WhatsApp o dall’ufficio, acconto e sconto scalati in automatico, PDF e blocco dopo la firma.\n\nSulla stessa pagina SAL il produttore indica anche alcuni limiti: non produce i documenti dei lavori pubblici (certificato di pagamento, registro di contabilità, libretto delle misure), non mette righe IVA o ritenuta a garanzia sul SAL e la fattura non nasce ancora dal SAL, indicata come funzione futura. Li riportiamo perché li scrive Pillar, non come giudizio nostro.",
      },
      {
        type: "section",
        heading: "Segui anche la vendita",
        body: "Edilizia in Cloud comincia prima del cantiere. Nella [pipeline delle vendite](/funzionalita/pipeline-vendite/) segui opportunità, trattative e richiami, con il motivo obbligatorio quando perdi un lavoro. Gli appuntamenti hanno km e tragitto dalla sede, e il cliente può prenotare da solo dal tuo sito. I contatti arrivano dai moduli Facebook che attivi tu; con l’add-on WhatsApp un agente risponde ai nuovi contatti con le tue istruzioni, fissa l’appuntamento sul calendario e si ferma quando risponde una persona.\n\nIl sopralluogo ha il modello del tuo mestiere (infissi, bagno, ristrutturazione, fotovoltaico, cappotto, tetto, climatizzazione) e resta collegato al contatto.",
      },
      {
        type: "section",
        heading: "Adatta il preventivo al tuo lavoro",
        body: "Pillar dichiara preventivi da computo caricato o da zero con l’AI, margini e sconti, prezzari regionali e regole aziendali come il margine minimo. In Edilizia in Cloud hai i preventivatori di mestiere — serramenti con il disegno di infissi e persiane nel PDF, fotovoltaico con il piano di posa in scala e la simulazione di produzione, bagni, tetti, climatizzazione, ristrutturazione e altri — oppure il preventivo con computo: capitoli, voci con misure, ore e marca, voci opzionali, e l’import dei computi PriMus in XPWE o PDF.\n\nLavorazioni e materiali restano distinti, imposti un obiettivo di margine e il prezzo si calcola a ritroso, gli sconti oltre soglia chiedono l’approvazione. Il cliente firma con un codice OTP sulla copia del PDF che non si può più cambiare, con la doppia firma delle clausole e il cointestatario. [Esplora i preventivi per l’edilizia](/funzionalita/preventivi-edilizia/).",
      },
      {
        type: "section",
        heading: "Organizza chi esegue il lavoro",
        body: "La [commessa](/funzionalita/gestione-commesse/) organizza fasi e sottofasi con date, squadre, note per gli operai e materiali, con venduto, costo previsto, consuntivo e margine per ogni lavorazione. La squadra lavora dall’app di cantiere: timbratura a un tocco con la posizione, rapportino diverso per ruolo (anche a voce), foto, merce presa in negozio fotografando lo scontrino, mezzi e attrezzi con etichetta QR. L’operaio vede cantiere, date e con chi lavora.\n\nI DDT dei fornitori si leggono con l’AI da foto o PDF e, alla conferma, caricano il magazzino: le giacenze e il prelievo dal cantiere sono nello stesso programma. I subappaltatori hanno la loro app con i documenti della ditta e i lavori da contratto.",
      },
      {
        type: "table",
        heading: "Pillar ed Edilizia in Cloud: confronta i passaggi, non soltanto le etichette",
        headers: ["Area", "Pillar (dichiarato sul sito ufficiale)", "Edilizia in Cloud"],
        rows: [
          [
            "Canale dal cantiere",
            "WhatsApp: foto, bolle e vocali in chat, senza app",
            "App di cantiere dal telefono: timbratura, rapportino per ruolo anche a voce, foto",
          ],
          [
            "Vendita",
            "Pipeline commerciale non indicata sul sito ufficiale",
            "Pipeline, sopralluoghi per mestiere, agente WhatsApp dei lead (add-on)",
          ],
          [
            "Preventivo",
            "Da computo o con l’AI, prezzari regionali, regole aziendali",
            "Preventivatori di mestiere, computo con import PriMus, firma con OTP",
          ],
          [
            "Bolle e magazzino",
            "Foto della bolla → articoli, prezzi e firma, agganciata alla commessa",
            "DDT letti con l’AI che caricano il magazzino, merce presa in negozio",
          ],
          [
            "SAL",
            "Dal programma di cantiere, acconto e sconto scalati, PDF, blocco dopo la firma",
            "SAL = rata, firmato dal cliente via link; ritenute a garanzia",
          ],
          [
            "Lavori pubblici",
            "Documenti dei lavori pubblici non prodotti, come indica il produttore",
            "Libretto delle misure, registro, SAL e certificato di pagamento",
          ],
          [
            "Fatturazione elettronica",
            "XML, invio allo SDI ed esiti, fatture attive e passive",
            "Fatture, note di credito e invio allo SDI tramite intermediario",
          ],
          [
            "Sicurezza",
            "Controllo DURC, documenti dei subappaltatori classificati con l’AI",
            "POS sul modello ufficiale, DUVRI, idoneità tecnico-professionale, scadenze DURC",
          ],
          [
            "Cassa",
            "Previsione di liquidità a 30–90 giorni, abbinamento movimenti e fatture",
            "Tesoreria, previsionale di cassa con scenari, controllo di gestione",
          ],
          [
            "AI",
            "Pillar AI: chat sui dati, rapportini dai vocali, lettura delle bolle",
            "Lettura di DDT, fatture ed estratti conto, listini da PDF o foto, assistente Silvio",
          ],
          [
            "Portali",
            "Accesso web per ruolo",
            "Portali per cliente, operaio, subappaltatore e commercialista",
          ],
        ],
      },
      {
        type: "section",
        heading: "Cosa aggiunge Edilizia in Cloud dopo il cantiere",
        body: "Il SAL in Edilizia in Cloud coincide con la rata: si genera dalle fasi, il cliente lo firma dal link e la rata matura alla firma; le ritenute a garanzia hanno il loro registro. Per gli appalti pubblici c’è la [contabilità lavori](/funzionalita/contabilita-lavori/) con libretto delle misure, registro, SAL, certificato di pagamento e varianti.\n\nDopo la consegna, ogni richiesta del cliente diventa un ticket di assistenza a 9 stati, con l’intervento assegnato a un operaio, a una squadra o a un subappaltatore. Il cliente segue avanzamento, documenti, rate e assistenza dal suo portale; il commercialista ha un portale suo per le aziende che segue.",
      },
      {
        type: "section",
        heading: "Dove Pillar ha un vantaggio, detto onestamente",
        body: "Se la tua squadra non installerà mai un’app, il canale WhatsApp dichiarato da Pillar abbassa la barriera d’ingresso. Pillar dichiara anche la classificazione con l’AI dei documenti dei subappaltatori, una chat AI sui conti dell’impresa e un servizio di procurement con confronto dei prezzi e rinegoziazione affidata a consulenti.\n\nEdilizia in Cloud ha un’app di cantiere pensata per il telefono e un assistente AI interno, Silvio, ma per la squadra il canale principale è l’app, non WhatsApp. In demo fai la stessa prova con tutti e due: dai il telefono a un operaio e guarda quale dei due usa senza chiedere aiuto.",
      },
      {
        type: "list",
        heading: "La prova pratica che rende il confronto utile",
        items: [
          "Parti da una trattativa: registra attività, prossimo richiamo e preventivo.",
          "Inserisci descrizioni, unità di misura e quantità; separa le lavorazioni dagli articoli da acquistare.",
          "Trasforma il lavoro in commessa e controlla fasi, date, persone e costi previsti.",
          "Fai registrare a un operaio la giornata dal telefono e segui un materiale dalla bolla alla fattura.",
          "Prepara un SAL parziale con acconto e ritenuta, fallo firmare e guarda cosa succede alla rata e alla fattura.",
          "Fai risalire il titolare dal margine alle registrazioni di origine.",
        ],
      },
      {
        type: "section",
        heading: "Come scegliere fra Pillar ed Edilizia in Cloud",
        body: "Pillar mette al centro WhatsApp, l’assistente AI e la cassa. Edilizia in Cloud mette al centro il percorso dalla trattativa all’incasso: vendita, preventivi di mestiere, commessa con fasi e squadre, app di cantiere, magazzino, SAL firmati, lavori pubblici, sicurezza e portali.\n\nScegli Edilizia in Cloud se vuoi vendita ed esecuzione nello stesso posto e leggere costi previsti e reali mentre il cantiere è aperto. Valuta Pillar con attenzione se il tuo primo problema è far arrivare i dati dalla squadra senza app.\n\nNel [centro confronti](/confronto/) trovi le altre alternative; la [guida ai gestionali per imprese edili](/blog/migliori-software-gestionali-edilizia-confronto/) distingue le categorie di software.",
      },
      {
        type: "section",
        heading: "Fonti e metodo del confronto",
        body: "Confronto a cura di Edilizia in Cloud, parte interessata. Le informazioni su Pillar provengono dalle fonti ufficiali consultate il 30 ottobre 2026; non è un benchmark indipendente. Le funzioni disponibili dipendono dalle versioni e dai servizi scelti. Una funzione non citata non è considerata assente.",
      },
      {
        type: "list",
        heading: "Fonti ufficiali Pillar consultate il 30 ottobre 2026",
        items: [
          "[Presentazione di Pillar](https://www.pillar.it/)",
          "[Pillar AI e WhatsApp](https://www.pillar.it/pillar-ai)",
          "[DDT e rapportini](https://www.pillar.it/gestione-ddt-e-rapportini)",
          "[Gestione commessa: costi, ore e margini](https://www.pillar.it/gestione-commessa)",
          "[Preventivi](https://www.pillar.it/preventivi)",
          "[Fatturazione elettronica e SDI](https://www.pillar.it/fatturazione)",
          "[SAL e avanzamento lavori, con i limiti indicati dal produttore](https://www.pillar.it/gestione-sal-stato-avanzamento-lavori)",
          "[Flussi di cassa](https://www.pillar.it/flussi-di-cassa)",
          "[Sicurezza e DURC](https://www.pillar.it/pillar-sicurezza)",
          "[Procurement](https://www.pillar.it/procurement)",
        ],
      },
      {
        type: "cta",
        heading: "Scopri Edilizia in Cloud dalla vendita al cantiere",
        body: "Guarda come organizzare trattative, preventivi, fasi e squadre, come firmare un SAL e come leggere i costi della commessa in una demo dedicata alla tua impresa.",
      },
    ],
    faqs: [
      {
        q: "Qual è la differenza fra Pillar ed Edilizia in Cloud?",
        a: "Entrambi coprono preventivi, bolle, rapportini, commessa, SAL e fatturazione elettronica con SDI. Pillar dichiara WhatsApp come canale dal cantiere e un assistente AI. Edilizia in Cloud collega vendita, preventivi di mestiere, commessa con fasi e squadre, app di cantiere, magazzino, SAL firmati dal cliente, contabilità lavori pubblici e portali per cliente, subappaltatori e commercialista.",
      },
      {
        q: "Pillar gestisce la fatturazione elettronica con SDI?",
        a: "Sì. La pagina ufficiale sulla fatturazione descrive generazione XML, invio allo SDI, esiti, fatture attive e passive e collegamento alla commessa.",
      },
      {
        q: "Pillar gestisce lo stato avanzamento lavori?",
        a: "Sì. La pagina ufficiale SAL documenta voci dal programma di cantiere, avanzamento da WhatsApp o dall’ufficio, acconto e sconto scalati, PDF e blocco dopo la firma. Sulla stessa pagina il produttore indica che non produce i documenti dei lavori pubblici, non mette IVA o ritenuta a garanzia sul SAL e che la fattura dal SAL è una funzione futura.",
      },
      {
        q: "Pillar controlla il DURC?",
        a: "Sì. La pagina ufficiale sulla sicurezza dichiara il controllo di validità e scadenza del DURC con avviso prima della scadenza, e la classificazione con l’AI dei documenti dei subappaltatori. Edilizia in Cloud segnala DURC mancanti, scaduti o in scadenza e gestisce POS sul modello ufficiale e DUVRI.",
      },
      {
        q: "Quando valutare Edilizia in Cloud come alternativa a Pillar?",
        a: "Quando vuoi riunire trattative, preventivi di mestiere e organizzazione delle commesse — fasi, squadre, ore, materiali, magazzino, SAL firmati e costi — nella stessa piattaforma, o quando lavori anche con la PA e ti servono libretto delle misure e certificati di pagamento.",
      },
    ],
  },
];
