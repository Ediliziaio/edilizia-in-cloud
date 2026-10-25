# Piano di rilascio del preventivatore AI per tutte le aziende

Data: 25 ottobre 2026. Stato: rilascio dei wizard conversazionali in corso; convertitore DWG remoto non attivato.

## Stato corrente del rilascio

**Come si accende e si spegne (verificato in produzione il 25/10/2026).** Due interruttori, con ruoli diversi. Il vero interruttore è quello del server, il segreto `QUOTE_CHAT_ENABLED`: oggi vale `true` (come `QUOTE_CHAT_DEMO_ENABLED`), quindi chat e audio sono attivi per tutte le aziende. L’interruttore del client, `VITE_QUOTE_CHAT_ENABLED`, è solo un freno d’emergenza: se non è impostato il client resta acceso, se vale `false` lo spegne; non autorizza niente, perché ogni richiesta passa comunque da JWT, appartenenza all’azienda, permesso preventivi e controllo economico. Spegnere il server (`QUOTE_CHAT_ENABLED` diverso da `true`) riporta tutto al vincolo Demo 2.

**Crediti e limiti.** L’AI spende i crediti dell’azienda (costo reale per il markup). Chat e audio controllano il saldo prima di spendere: se non basta rispondono 402 con la finestra di ricarica e non partono né chiamate né addebiti. Un controllo che non risponde non chiede mai di ricaricare: si ferma con un errore nostro (503). Ogni utente e ogni azienda hanno un limite di richieste al minuto (chat 20 e 60, audio 6 e 20; più un tetto sui 10 minuti): oltre, risposta 429 con l’attesa.

Gli ingressi del preventivo classico, degli otto computi edili, di Serramenti e di Fotovoltaico sono separati dal laboratorio: non richiedono più Demo Azienda 2 o un server di sviluppo. Il laboratorio conserva il proprio vincolo locale. Il backend conversazionale è stato distribuito; l’attivazione generale usa `QUOTE_CHAT_ENABLED=true`, mantenendo JWT, appartenenza aziendale, permesso preventivi e controllo economico. Il client può essere disattivato con `VITE_QUOTE_CHAT_ENABLED=false`.

Le funzioni atomiche Serramenti/Fotovoltaico sono installate nel database esistente come `SECURITY INVOKER`, senza esecuzione per `anon` e senza modifiche a preventivi cliente. Le versioni del registro migrazioni coincidono con i due file da pubblicare. I client usano il backend HTTPS configurato e non ripiegano su cancellazioni e inserimenti separati se una funzione manca.

Il caricamento web estrae nel browser il testo presente nei PDF; immagini e scansioni richiedono l’azione esplicita di analisi visiva della pagina. Non viene dichiarato un OCR eseguito quando il testo non è stato riconosciuto. L’audio usa il trasporto autenticato e la contabilizzazione della singola azienda; Whisper richiede la configurazione OpenAI server già esistente, distinta da OpenRouter. Il modello e le voci restano modificabili nel wizard dopo la conferma.

Verifiche locali sul pacchetto (ultima corsa, 25/10/2026 sera: 1.917 test del preventivatore in 113 file, tutti superati dopo i controlli su crediti e limiti; prima: 1.897 test del preventivatore, 1.181 dei wizard), suite critica di piattaforma superata, controllo Deno dell’endpoint, controllo stretto del servizio CAD, lint dei nuovi trasporti e build completa con 243 pagine prerenderizzate su 243. Il controllo tipi globale supera il ratchet con 655 diagnostiche residue e soglia storica 703, senza aumento della baseline. Il renderer PDF server è stato rigenerato insieme ai sorgenti condivisi.

Il convertitore DWG rimane spento in produzione: serve un server esistente con HTTPS e il collaudo del container Linux. Il workflow CI prepara tale collaudo senza attivare hosting. La lettura di testi e layer non certifica quantità geometriche. La memoria sincronizzata rimane un laboratorio Demo 2; i popup nativi conservano una bozza isolata fino alla conferma e non sono ancora un archivio conversazioni aziendale tra dispositivi. Le sezioni successive conservano il piano e la cronologia: non prevalgono su questo stato corrente.

## Obiettivo e flusso da conservare

Rendere disponibili le funzioni costruite nella demo nei preventivi reali di tutte le aziende abilitate, in locale e in produzione, con gli stessi dati, modelli e controlli. Un ambiente di collaudo separato verrà usato se già disponibile; non si considera la simulazione locale equivalente a un collaudo di produzione.

Il flusso resta quello richiesto: l'utente sceglie il preventivo classico oppure il modello di settore, entra nel relativo wizard e apre Silvio AI in un popup ampio. Chat, allegati, scelte e anteprima usano il modello selezionato. Solo la conferma finale trasferisce i dati nel preventivo nativo, dove tutto resta modificabile. Non nasce un secondo preventivatore o un secondo listino.

L'estensione a tutte le aziende non rende pubblici dati o servizi: permessi, abbonamenti e regole economiche continuano a valere. Non comprende invii automatici a clienti, emissioni di fatture, firme, creazione di commesse o ordini ai fornitori.

## Stato di partenza

La verifica registrata il 25/10/2026 mattina, prima del rilascio (il file di quel rapporto non è nel repository), riportava:

- Build Vite di produzione riuscita; non è una verifica del sito pubblicato o del prerender completo.
- Suite preventivi offline: 101 file e 1.748 test superati.
- Controllo TypeScript non superato: 754 errori totali, soglia esistente 703 e 21 file sopra la rispettiva soglia. Il confronto è per file: la differenza totale non è il numero di nuovi errori.
- Entry point e trasporti chat ancora vincolati a localhost e Demo Azienda 2.
- OCR basato sul servizio locale Apple Vision, assente nell'hosting web.
- Funzioni atomiche `fv_save_configuration_atomic` e `sr_apply_ai_bom_atomic` assenti dal database remoto al momento della verifica.
- Memoria remota costruita per la sola demo, non ancora archivio conversazioni multiazienda.

Il saldo OpenRouter è gestito dal titolare del servizio. Il 25 ottobre il titolare ha confermato che il servizio è nuovamente disponibile; una prova reale breve nella chat locale di Demo Azienda 2 ha poi ricevuto una risposta tecnica pertinente, senza modifiche alle voci. Questo verifica una richiesta sul servizio già pubblicato, non tutte le funzioni del nuovo backend. La ricarica non risolve endpoint mancanti, vincoli locali o migrazioni assenti.

Nella prima verifica del piano erano stati ripetuti 43 test offline di classificazione sicura degli errori e streaming, senza chiamate a pagamento. Le verifiche successive e la richiesta reale sono registrate separatamente qui sotto.

## Avanzamento del 25 ottobre

- Base locale allineata a `origin/main` all'inizio del lavoro; modifiche esistenti conservate. Nessun commit, push o deploy in questo aggiornamento.
- Corrette le regressioni di tipo dei test senza aumentare la baseline: il controllo globale è passato con 655 diagnostiche residue contro la soglia storica di 703. Non significa zero errori TypeScript nell'intero progetto.
- Implementato il trasporto autenticato verso il backend configurato: vincolo aziendale, HTTPS remoto, nessun URL fornito dalla chat, redirect vietati, lettura della risposta limitata, annullamento e nessun retry automatico.
- I popup di computo/Classico e Serramenti/Fotovoltaico scelgono ora esplicitamente fra il proxy della demo locale e il trasporto configurato. Fuori dalla demo richiedono il flag client esatto `VITE_QUOTE_CHAT_ENABLED=true`. Nota storica: all’epoca gli ingressi dei wizard erano ancora vincolati alla demo; le fasi seguenti sono state completate e il flag è attivo (vedi «Stato corrente»).
- Policy server (poi pubblicata e attiva) `QUOTE_CHAT_ENABLED=true`: consente la chat alle aziende reali solo dopo JWT, appartenenza, permesso preventivi e controllo economico. In assenza del flag resta valido il vincolo Demo 2; il flag client non dà alcuna autorizzazione server.
- Benchmark e memoria remota restano riservati alla demo. Anche la trascrizione audio resta riservata alla demo: usa un servizio separato con `OPENAI_API_KEY`, non il solo credito OpenRouter. La sua estensione richiede verifica dedicata di provider e contabilizzazione. Nei popup non demo non viene costruito un trasporto audio locale non valido.
- Bloccati anche cambio account nella stessa azienda e cambio simultaneo di azienda attiva/proprietà del popup: nessuna applicazione della vecchia bozza, nessun risultato tardivo importato. Il token recuperato deve appartenere all'utente che ha aperto la chat.
- Due prove reali dal browser sulla bozza fittizia Facciata: domanda sulla verifica del supporto e, dopo il collegamento dei trasporti, domanda sulla differenza tra superficie del ponteggio e del cappotto. Risposte ricevute, zero modifiche da applicare; entrambe chiuse senza conferma. Riletti gli stessi 140 mq di ponteggio, netto 974,40 euro e totale 1.071,84 euro. Sono verifiche di collegamento e comportamento della chat, non certificazioni tecniche delle risposte. Nessun invio ai clienti e nessun nuovo salvataggio del preventivo; i consumi delle due richieste seguono le regole del servizio, senza azzeramenti o rimborsi manuali.
- Preparato un [manifest candidato](preventivatore-ai-release-manifest.json) con impronte dei file di codice, test, configurazione, strumenti locali e font. Esclusi screenshot, output, log, backup e cache Graphify. Non è una lista già approvata per il deploy; serve ancora la revisione delle dipendenze condivise e della provenienza degli asset.

Le prove aggiornate di test, bundle e controllo tipi sono nell'audit incrementale del lavoro. La suite preventivatore successiva al collegamento dei trasporti contiene 103 file e 1.806 test superati; la suite wizard contiene 58 file e 1.177 test superati. Altri 61 test, in tre file, verificano router AI, contabilizzazione e limiti con provider simulato. I conteggi di corse sovrapposte non vanno sommati come test distinti.

Non ancora chiusi: OCR distribuibile sul web, migrazioni atomiche SR/FV e relativa verifica remota, memoria multiazienda, attivazione degli ingressi in tutti i wizard, collaudo completo con AI reale e verifica del commit/rilascio esatto. La prova OpenRouter riuscita non rimuove questi vincoli.

### Verifica dei disegni CAD derivati da PDF

Un caso locale ha evidenziato il rischio di sommare geometrie importate da PDF, piante e sezioni dello stesso edificio, oppure stato di fatto e stato di progetto. La lettura di una legenda consente di proporre famiglie di lavorazioni, non di certificare quantità, spessori, configurazioni impiantistiche o prezzi. Il file del cliente, le informazioni di progetto e le conversioni non fanno parte del pacchetto di rilascio.

Correzioni locali del lettore CAD: cerchi solo su scelta esplicita, scala positiva e finita senza ripiego silenzioso a 1, conferma della calibrazione per origini PDF o unità non dichiarate, invalidazione della conferma dopo una modifica di scala o unità, esclusione dei conteggi salvabili quando il disegno contiene entrambi gli stati. Il file resta ispezionabile; per il computo serve una selezione separata di tavola, stato e intervento. I test nuovi sono 24, con 19 regressioni CAD superate, senza scritture remote.

La suite preventivatore con le protezioni CAD contiene 105 file e 1.830 test superati. Il controllo tipi globale ha individuato un nuovo errore nel mock del test CAD, corretto con un tipo esplicito: la verifica successiva dei quattro file CAD modificati riporta zero diagnostiche. Va ripetuto il controllo globale sul pacchetto finale; non si presenta questa verifica mirata come una nuova corsa globale riuscita. Anche il bundle finale CAD resta da ripetere: la compilazione concorrente è stata interrotta per ridurre il carico del Mac, non conclusa come riuscita.

Questo intervento non introduce il caricamento DWG diretto nella chat. La conversione GNU usata per l'analisi rimane uno strumento locale, non una dipendenza inclusa nel browser. Prima dell'integrazione CAD conversazionale servono selezione geometrica del perimetro, calibrazione su quote note, confronto degli stati e registro della provenienza delle quantità. Relazione di analisi, dati mancanti e anteprima vettoriale restano negli elaborati locali privati, fuori dal manifest di rilascio.

## Stati delle verifiche

Ogni funzione avrà uno stato distinto: da implementare, verificata offline, verificata in integrazione, in attesa di credito, oppure verificata con AI reale. Un test simulato non porta direttamente allo stato verificato con AI reale.

Un errore dovuto a credito insufficiente non viene contato come prova fallita del ragionamento AI. La stessa prova resta sospesa finché può essere eseguita; errori di formato, autorizzazione, perdita dati o integrazione restano invece difetti da correggere anche con credito disponibile.

## Fasi di esecuzione

### Fase 1 Stabilizzare codice e pacchetto di rilascio

1. Riallineare la base con `origin/main` senza perdere le modifiche degli altri terminali.
2. Preparare un elenco dei file necessari: componenti, trasporti, modelli, font, test e migrazioni. Escludere download, screenshot, output temporanei, backup del codice pubblicato e altri lavori non pertinenti.
3. Correggere i nuovi errori di tipo nei 21 file senza alzare la baseline, escludere i test dal controllo o introdurre soppressioni generalizzate.
4. Verificare separatamente gli effetti di `aiRouter` e delle altre librerie condivise sulle funzioni non relative ai preventivi.

Completamento: controllo TypeScript con cricchetto superato, dipendenze e lockfile coerenti, test interessati superati, manifest del rilascio definito. Il debito preesistente tollerato dalla baseline non viene presentato come zero errori di tipo.

### Fase 2 Collegare la chat in tutti gli ambienti

1. Separare l'abilitazione dei preventivi reali dall'accesso alle pagine di simulazione. La demo può restare un laboratorio con casi sintetici; il wizard reale non deve dipendere da un ID azienda dimostrativo.
2. Aggiungere il trasporto di produzione verso il backend configurato. Non accettare URL arbitrari a cui inoltrare token di accesso; mantenere separata la configurazione del proxy locale.
3. Sostituire il vincolo Demo 2 dell'endpoint reale con autenticazione, appartenenza all'azienda, permesso di modifica preventivi e controlli economici esistenti. Non limitarsi a cancellare le condizioni di sicurezza.
4. Applicare gli stessi controlli a chat, visione e audio. Benchmark interni e casi sintetici non diventano strumenti liberamente accessibili a tutte le aziende.
5. Arrestare le richieste e impedire l'applicazione di risultati se cambiano account, azienda, progetto o revisione del wizard.

Completamento: stessa funzione nei wizard locali e nel bundle di produzione, prove con due identità aziendali sintetiche, richieste senza permesso respinte prima dei costi e nessuna chiave provider nel browser.

### Fase 3 Rendere utilizzabili allegati e planimetrie sul web

1. Conservare Apple Vision come opzione locale, non come dipendenza obbligatoria dell'app pubblicata.
2. Estrarre prima il testo già presente nei PDF; per scansioni e immagini usare un motore OCR distribuibile, caricato solo quando serve e in un worker separato dalla UI. La scelta del motore e delle licenze precede l'installazione.
3. Mantenere controlli su formato, peso, pagine e risoluzione; elaborare una pagina alla volta, con avanzamento, annullamento e rilascio della memoria.
4. Adattare lo schema OCR ai nuovi motori mantenendo la lettura delle bozze storiche. La stringa di provenienza non deve dichiarare Apple Vision se il testo arriva da un altro motore.
5. Consentire la revisione dell'estratto prima dell'AI. L'analisi visiva invia soltanto la copia della pagina selezionata, senza metadati, con indicazione comprensibile del trattamento.
6. Non ricavare automaticamente quote certe dai pixel o attribuire a un ambiente la superficie di un altro. Superfici, aperture, altezze e geometrie non rettangolari richiedono dati o ipotesi esplicite da confermare.

Completamento: PDF digitale, scansione, foto ruotata, immagine poco leggibile, pagina multipla e interruzione provati senza server di sviluppo; file originale non pubblicato e quantità incerte non incluse come fatti verificati.

### Fase 4 Completare i salvataggi nativi

Per gli otto motori di computo, conservare righe, capitoli, ordine, quantità, unità, prezzi, sconti, fonte, descrizioni, immagini e valori manuali. Righe incomplete o non confermate restano fuori dalla conferma; una modifica non confermata non può diventare una cancellazione implicita.

Per Serramenti e Fotovoltaico:

1. Revisionare le migrazioni atomiche contro lo schema effettivo e i permessi dei wizard esistenti.
2. Provare in database di test applicazione completa, errore a metà operazione, conflitto tra revisioni, invio duplicato, rimozione negata dalle policy e riferimenti appartenenti a un'altra azienda.
3. Applicare le migrazioni di produzione solo dopo questi controlli e verificare l'esistenza delle funzioni e i relativi permessi.
4. Attivare il percorso remoto atomico, senza ripiego su sequenze separate di cancellazioni e inserimenti.
5. Verificare salvataggio e riapertura dal browser. Non ricreare righe immutate perdendo ID, foto o legami degli accessori.

Completamento: il wizard riletto dal server coincide con la conferma; un conflitto o un fallimento conserva lo stato precedente. I test con scritture rimangono su bozze fittizie autorizzate, non su preventivi di clienti reali.

### Fase 5 Estendere memoria e pianificazione

1. Creare una memoria di produzione separata dal vincolo della demo. Identificare almeno azienda, proprietario, progetto, modulo e versione; definire esplicitamente l'accesso degli eventuali collaboratori.
2. Conservare esclusioni per ambiente e lavorazione, decisioni confermate, dati manuali e provenienza. Una bozza di un'azienda non viene proposta in un'altra azienda dello stesso utente.
3. Usare versioni e confronti prima del salvataggio: nessuna sovrascrittura o fusione automatica di modifiche concorrenti. Gestire recupero dopo rete interrotta senza ripetere chiamate AI a pagamento.
4. Non copiare le chat dimostrative negli archivi delle aziende reali. File originali e dati sensibili seguono permessi e conservazione espliciti.
5. Estendere il cronoprogramma e gli scenari senza legarli all'ID Demo 2, mantenendoli separati dagli impegni contrattuali. Seguire il [piano di pianificazione predittiva](piano-pianificazione-predittiva-cantieri.md).

Completamento: ripresa corretta tra dispositivi, conflitto riconoscibile e isolamento tra account, aziende e progetti. Trasferte, capacità delle squadre, forniture e date limite usano input verificabili; un confronto non assegna persone o invia ordini.

### Fase 6 Verificare contenuti economici e modelli

Mantenere distinti budget preliminare e computo verificato. Ogni stima deve conservare intervallo, ipotesi, esclusioni e indicazione della fonte; non diventa una voce di prezzario per il solo fatto di essere stata accettata. Prezzi manuali e fornitori restano riconoscibili.

La ricerca prezzario deve rispettare fonte, edizione, codice, metodo di lavorazione e unità. Preparazione, posa, fornitura e smaltimento non sono intercambiabili; riferimenti inclusivi non devono aggiungere doppioni. La mancanza di prezzo non equivale a prezzo zero.

L'IVA deve distinguere prezzo netto, imposta e totale, importi dichiarati IVA compresa e aliquote per riga quando previste dal modulo. Non assegnare automaticamente agevolazioni o detrazioni in base al solo tipo di lavoro. Il cronoprogramma usa quantità, produttività, risorse e attese, non il solo valore economico.

Completamento: stesso risultato tra chat, riepilogo di conferma, wizard, anteprima e PDF. Modello e immagini sono quelli selezionati; nessun contenuto Serramenti entra per errore in un preventivo Bagni. Ipotesi ed esclusioni non vengono tagliate dal documento.

### Fase 7 Collaudo reale dopo la ricarica

Quando il credito OpenRouter è disponibile, eseguire prima una sola richiesta breve e controllata. Proseguire solo dopo aver verificato modello effettivo, risposta, autorizzazioni e registrazione del consumo. Definire un tetto del collaudo e fermarsi se viene raggiunto; nessun cambio modello per aggirare credito esaurito.

Ripetere i casi rappresentativi della matrice seguente, usando planimetrie e clienti di prova. Separare errore tecnico, indisponibilità del servizio e risposta AI di qualità insufficiente. Conservare domanda, risultato, tempi e versione del codice necessari a riprodurre i problemi, senza segreti o documenti cliente nei log.

Completamento: conversazione reale con domande, scelte, revisione, conferma, salvataggio, riapertura e documento finale per ciascun motore. Nessun invio al cliente per dimostrare che il flusso funziona.

### Fase 8 Pubblicare su main e verificare il rilascio

1. Riallineare nuovamente main e ripetere i controlli finali sul commit esatto da pubblicare.
2. Eseguire test preventivi, regressioni critiche condivise, controllo tipi, build di produzione e verifiche del documento.
3. Pubblicare backend e migrazioni compatibili prima di attivare i nuovi client. Mantenere temporaneamente compatibilità con i client precedenti.
4. Fare commit e push dei soli file del rilascio; verificare l'esito della CI, la distribuzione effettiva delle funzioni e l'aggiornamento dell'app. Un push riuscito non equivale a produzione aggiornata.
5. Attivare per le aziende abilitate dopo il collaudo controllato. Verificare accesso e corretto instradamento senza creare bozze o chiamate a pagamento in ogni azienda reale.
6. Predisporre il ritorno al flusso precedente tramite un controllo di attivazione server verificato. Il rollback non cancella i preventivi salvati, non disabilita l'autenticazione e non annulla alla cieca migrazioni con dati.

Completamento: commit identificato, CI riuscita, backend e app alla versione prevista, prove di produzione riuscite e limitazioni residue comunicate.

## Matrice minima dei moduli

| Motore | Caso completo | Caso critico |
| --- | --- | --- |
| Classico | Appartamento con più capitoli e modello aziendale | Righe manuali, sconti e IVA conservati |
| Bagni | Bagno completo da 12 mq | Quote mancanti, superfici di rivestimento, esclusioni e budget da 12.000 euro distinti |
| Serramenti | Finestre, accessori e posa | Varianti, misure in mm, immagini e legami degli accessori |
| Fotovoltaico | Moduli, inverter, accumulo e posa | Compatibilità catalogo, ricalcolo potenza e rollback atomico |
| Tetti | Rimozione, isolamento e nuovo manto | Modello storico, smaltimento escluso e prezzi incompleti |
| Ristrutturazione | Bilocale completo e intervento parziale | Ambiente escluso, planimetria e conservazione delle note |
| Pavimenti | Sottofondo, fornitura e posa | Sovrapposizione senza rimozione e lavorazioni Giardino distinte |
| Elettrico | Rifacimento per ambienti | Punti e circuiti non inventati, costi mancanti distinti da zero |
| Termoidraulico | Impianto con forniture e manodopera | Dimensionamento da verificare e dati tecnici incompleti |
| Climatizzazione | Più unità con posa e servizi | Locali, potenze, accessori e produttività non dedotti dal prezzo |
| Piscine | Struttura, impianti e finiture | Scavi, terreno, accessibilità e sicurezza non assunti come verificati |

Tutti gli interventi registrati devono avere controlli automatici di instradamento, modello, campi e conversione. Non chiamare tutti gli interventi collaudati nel browser dopo aver provato un solo esempio per motore. Pergola, Giardino, Facciate, nuove costruzioni, campo da tennis e appalti pubblici richiedono ulteriori casi: il modulo commerciale non certifica la conformità tecnica o normativa del progetto.

## Gestione del credito e degli errori

| Situazione | Comportamento previsto | Ripresa |
| --- | --- | --- |
| Credito OpenRouter insufficiente | Bozza intatta; avviso distinto di indisponibilità AI. Il dettaglio provider è riservato all'amministrazione autorizzata | Dopo ricarica, nuova prova esplicita e limitata |
| Credito aziendale insufficiente o metodo di pagamento mancante | Applicare la regola economica della singola azienda; non attribuire il blocco al provider | Dopo regolarizzazione aziendale |
| Sessione scaduta o permesso mancante | Nessuna chiamata provider e nessuna applicazione di dati | Nuovo accesso o correzione autorizzata dei permessi |
| Limite temporaneo del servizio | Avviso di attesa, senza cicli automatici di invio | Tentativo esplicito successivo secondo i limiti |
| Timeout con esito incerto | Non applicare risultati parziali e non ripetere alla cieca | Recuperare o riconciliare il tentativo prima di autorizzarne uno nuovo |
| Risposta incompleta o schema non valido | Conservare la bozza precedente; mostrare un errore comprensibile | Correggere il difetto e riprovare in modo controllato |
| Salvataggio in conflitto | Nessuna sovrascrittura o cancellazione parziale | Ricaricare e confrontare le versioni |

Senza credito, l'utente deve comunque poter modificare manualmente il preventivo, leggere i prezzi disponibili, calcolare quantità e totali e salvare i dati già confermati. L'AI non deve simulare una risposta reale né confermare un prezzo inventato per nascondere l'indisponibilità.

Una risposta fallita non giustifica un addebito fittizio per un lavoro riuscito. Se il provider ha già consumato token prima di un'interruzione, il consumo effettivo va riconciliato secondo le regole economiche esistenti; non promettere un rimborso o ripetere la chiamata senza conoscerne l'esito.

## Prestazioni e accessibilità

Caricare chat, OCR, visione e renderer PDF solo quando richiesti. Usare ricerche di catalogo limitate e cancellabili, riutilizzare il worker OCR e rigenerare il PDF dopo una pausa di modifica senza produrre documenti in parallelo. Nessuna richiesta AI automatica all'apertura di un wizard o al cambio azienda.

Misurare prima e dopo, sullo stesso dispositivo e sugli stessi casi, apertura del wizard, apertura della chat, ricerca prezzario, digitazione durante OCR, generazione dell'anteprima e memoria dopo chiusura del popup. Definire i limiti di accettazione sui dati di partenza; i test di correttezza non dimostrano da soli l'assenza di rallentamenti.

Verificare desktop, telefono, tastiera, focus del popup e preferenza per movimento ridotto. Conservare chat leggibile, pulsanti per scelte concrete, animazioni brevi e stato di elaborazione reale; nascondere la diagnostica provider dalla conversazione ordinaria.

## Ordine pratico e dipendenza dalla ricarica

Si parte dalla fase 1 e si prosegue con integrazione, allegati, salvataggi, memoria e modelli usando servizi simulati o componenti deterministici. Le migrazioni e i test d'isolamento precedono l'attivazione generale. La ricarica sblocca la fase 7, non è un prerequisito per correggere i difetti del software.

Il rilascio completo richiede anche il collaudo AI reale dopo la ricarica. Non assegnare una data certa prima di chiudere la fase 1 e validare il percorso OCR e i salvataggi remoti. Aggiornare lo stato alla fine di ogni fase indicando risultati, limiti e prove ancora sospese, senza percentuali di completezza non misurate.

## Lettura DWG e servizio dedicato

La chat locale ora accetta DWG fino a 64 MB e conserva un riepilogo citabile, senza salvare il binario nella memoria della conversazione. Classico, computi edili e configuratori tecnici Serramenti/Fotovoltaico usano il medesimo contratto di lettura. Il percorso locale e il servizio dedicato condividono il convertitore; il parser nativo lavora in un processo separato dall’interfaccia.

Le prove dal browser hanno verificato il caricamento di un disegno grande, la scelta tra stato attuale e progetto, domande AI reali, tre proposte tecniche fotovoltaiche con quantità e prezzi mancanti lasciati vuoti e un confronto ipotetico sugli infissi che non modifica il computo. Gli estratti non costituiscono una selezione geometrica delle tavole né un rilievo metrico. I consumi AI di queste prove sono registrati sulla sola azienda demo; il caricamento locale non chiama il provider.

Il servizio server è preparato, non distribuito. L’autorizzazione deve passare dal nuovo ramo `cad-access`, che conserva JWT, appartenenza aziendale, permesso preventivi e regola di pagamento. Un controllo aggiuntivo `QUOTE_CAD_ENABLED` mantiene questo ramo spento finché il convertitore non è pronto. Anche il client richiede un’attivazione esplicita e un endpoint HTTPS configurato; non ripiega su un servizio esterno arbitrario.

La [procedura del servizio CAD](../services/cad/README.md) specifica container, configurazione, quote, limiti e verifiche. Il contesto Docker esclude documenti cliente ed esportazioni locali. Nessun hosting o abbonamento è stato attivato. La CLI Docker presente sul Mac non dispone di un daemon né del comando Compose utilizzabile: costruzione e collaudo dell’immagine Linux restano da eseguire su un ambiente idoneo.

Prima della pubblicazione generale rimangono il collaudo del container e del suo arresto, il collegamento HTTPS, le prove reali di autorizzazione del nuovo ramo, il controllo multi-azienda e le precedenti condizioni di rilascio. La memoria sincronizzata dei disegni e il calcolo geometrico automatico non sono inclusi nella sola lettura di testi e layer.

Il controllo Supabase ha inoltre segnalato sette viste preesistenti con proprietà Security Definer. Non sono state create o alterate da questo lavoro: vanno classificate e provate nel loro contesto prima di cambiarne permessi o comportamento. La [guida di verifica delle viste](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) descrive il controllo; non equivale alla prova che tutte queste viste espongano dati impropriamente.

### Esito del collaudo locale del 25 ottobre

Corsa precedente alla rifinitura finale (fanno fede i conteggi della sezione «Stato corrente»): la suite del preventivatore passa con 1.889 test su 110 file; quella dei wizard con 1.180 test su 58 file. Passano anche il controllo TypeScript stretto del servizio CAD, il lint dei sorgenti TypeScript/React modificati e la build di produzione `build:fast`. Il controllo tipi generale supera il ratchet con 655 errori preesistenti contro la soglia di 703: non è una compilazione priva di errori e la soglia non è stata modificata.

Il convertitore condiviso ha elaborato il DWG originale in circa 13 secondi sul Mac: 43 layer, 892 occorrenze testuali e 177 testi distinti conservati in un riepilogo di circa 19 KB. È una lettura parziale dichiarata, non un test prestazionale del container. Il server Node avviato localmente ha risposto al controllo di stato e rifiutato accessi anonimi e origini non consentite; è stato poi arrestato. Nessuna distribuzione remota, migrazione, pubblicazione dell’app o invio ai clienti è stato eseguito per questo collaudo.
