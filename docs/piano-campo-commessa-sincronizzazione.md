# Piano di sviluppo app Campo e sincronizzazione della commessa

Data di riferimento: 13 ottobre 2026. Stato: implementazione locale avviata per incrementi; avanzamento nella sezione 18, non attestazione di sincronizzazione completa. Destinatari: prodotto, sviluppo e responsabili operativi dell’impresa.

La commessa deve raccogliere il lavoro delle persone, delle squadre e delle ditte esterne in un quadro unico e verificabile. Chi lavora in campo inserisce soltanto i dati che conosce; il responsabile conferma il lavoro; l’ufficio valida il consuntivo economico. Ore, foto, bolle, materiali, attrezzature e avanzamento mantengono un collegamento esplicito alla commessa e non vengono ricopiati o conteggiati più volte.

La priorità è rendere affidabili i collegamenti e il recupero degli aggiornamenti incompleti. La semplificazione mobile segue queste regole, senza eliminare controlli o dati storici. Il piano non autorizza correzioni massive dei dati, migrazioni, caricamenti di prova online o pubblicazioni: tali operazioni richiedono un passaggio di rilascio separato.

## 1 Obiettivi e criteri di completamento

- Ogni dato operativo ricevuto ha azienda, commessa, autore, giornata o intervallo pertinente e origine verificabili.
- Una lavorazione, persona, riga materiale o attrezzatura collegata deve appartenere all’ambito autorizzato. Un nome simile non basta per effettuare l’associazione.
- Un invio ripetuto produce lo stesso esito, non un secondo rapporto, movimento, costo o notifica.
- Ore proposte, dichiarate, confermate e valorizzate non vengono sommate come se fossero prestazioni differenti.
- La schermata aziendale e l’app Campo leggono le stesse fonti, con proiezioni diverse secondo i permessi.
- Una registrazione ricevuta rimane distinta dagli effetti ancora da completare, come PDF e notifiche.
- Un errore di rete o di permessi non viene mostrato come elenco vuoto o come operazione riuscita.
- La conferma cliente non produce nuove ore, consumi, approvazioni di extra o movimenti di magazzino.
- Costi e margini non diventano accessibili a operai o ditte soltanto perché sono nascosti nell’interfaccia.
- Storico, assegnazioni, firme, PDF e funzioni esistenti restano consultabili durante l’introduzione del nuovo flusso.

La sincronizzazione sarà considerata collaudata soltanto dopo prove incrociate tra app Campo, database, seconda sessione aziendale, viste della commessa e PDF. Un test unitario o un messaggio di successo non sostituisce questo controllo.

## 2 Base verificata e punti da preservare

### Collegamenti presenti nel codice locale

| Dato | Fonte o collegamento presente | Destinazione da preservare |
| --- | --- | --- |
| Giornaliero e rapporto cliente | `campo_rapportini.company_id`, `order_id`, `user_id`, `data_lavoro` | Rapportini della commessa e storico Campo |
| Ore di squadra | `campo_rapportini.presenze` e controlli di revisione manodopera | Squadra, verifica ore e consuntivi |
| Lavorazioni dichiarate | `campo_rapportini.fasi_lavorate[].phase_id` | Fasi e avanzamento della stessa commessa |
| Materiali usati | Riferimenti `order_item_id`, `stock_item_id`, `fase_id` quando disponibili | Lettura dei consumi approvati |
| Foto del cantiere | `foto_cantiere.order_id` | Galleria e diario della commessa |
| Foto del rapporto | `campo_rapportini.foto_urls` | Rapporto e PDF, senza presumere una riga equivalente in `foto_cantiere` |
| Bolle e acquisti da campo | `campo_acquisti.order_id`, `purchase_order_id`, `company_cost_id` | Verifica in magazzino e collegamenti economici |
| Timbrature | `campo_timbrature.order_id` quando attribuite | Ore rilevate per cantiere; una sessione non attribuita non va assegnata arbitrariamente |
| Mezzi di fine giornata | `campo_mezzi_fine_giornata` riceve commessa, giorno e rapportino | Utilizzo e posizione da verificare con le relative fonti server |
| Diario | `order_events` e voci ricavate dai dati originali | Timeline della commessa |
| PDF | Generazione su `rapportino_id`, apertura tramite link riservato | Documento collegato al rapporto originale |

La lettura materiali già distingue quantità consegnate, usate e restituite. I consumi dei giornalieri entrano nella lettura solo se approvati. Questa separazione va mantenuta: una bolla non è una dichiarazione di consumo.

### Riscontri del controllo del 13 ottobre

- L’invio locale salva il rapporto e poi esegue separatamente diario, PDF, registrazione mezzi e notifica. Alcuni errori successivi sono segnalati, ma non esiste in quel percorso un completamento unico di tutti gli effetti.
- L’approvazione locale può riuscire prima dell’aggiornamento delle fasi: il codice mostra un errore separato se le fasi non si aggiornano. Il recupero deve diventare persistente e verificabile.
- Il componente di verifica degli acquisti Campo è integrato nel magazzino aziendale. Serve una vista della stessa fonte, filtrata per commessa, anche nella commessa; non un secondo archivio degli acquisti.
- `useOrderDiary` ascolta messaggi ed eventi, ma la rilettura dei dati ricavati da rapporti, foto e documenti non segue automaticamente tutti gli stessi aggiornamenti.
- `refreshWorkQueries` non include tutti i consumatori derivati, fra cui le chiavi dei rapportini del cronoprogramma e dei costi materiali per fase. Va censito ogni consumatore, non aggiunta una lista casuale di invalidazioni.
- Tra le otto tabelle controllate nella pubblicazione `supabase_realtime`, risulta pubblicata soltanto `order_events`. Non basta aggiungere una subscription frontend a una tabella per riceverne gli aggiornamenti.
- La RPC `campo_rapportini_protocollo()` non risulta presente nel database controllato. La proposta locale della separazione giornaliero e rapporto cliente non va considerata distribuita.
- Nella commessa Demo ORD-DEM-RIS01 il controllo ha contato due rapportini, un acquisto e quattro timbrature. Le aziende dei rapporti e dell’acquisto sono coerenti, ma un riferimento a fase dentro un rapporto appartiene a un’altra commessa. È un caso del campione, non una misura di tutte le aziende né una prova che lo abbia prodotto l’attuale modulo.
- I due rapporti del campione non hanno un evento esplicito con `payload.rapportino_id`. Non significa che siano invisibili nel diario: il diario ricava anche voci direttamente dai rapportini. Va riconciliata la provenienza, evitando di creare duplicati nella timeline.

Le sette suite mirate rieseguite durante la preparazione del piano hanno superato 68 test su materiali, fasi, PDF, acquisti, offline e mezzi. Non sono prove end-to-end su più dispositivi. Nell’audit precedente, dodici nuove prove isolate hanno riprodotto quattro difetti: tre nel registratore audio e uno nel timeout della conversione foto. Le correzioni locali e le successive regressioni sono riportate nella sezione 18.

## 3 La commessa come punto comune

Associare non significa duplicare: il dato originale rimane nella propria fonte e le sezioni della commessa ne mostrano una vista autorizzata.

| Contenuto ricevuto | Dove deve apparire nella commessa | Effetto operativo ed economico |
| --- | --- | --- |
| Contributo operaio o ditta | Cantiere, giornalieri e diario | Lavoro dichiarato; non avanzamento o costo già approvato |
| Ore di persone e squadre | Cantiere, squadra e verifica presenze | Una registrazione economica per prestazione verificata |
| Lavorazione confermata | Cantiere, lavorazioni e cronoprogramma | Avanzamento autorizzato; date reali con origine dichiarata |
| Foto lavoro | Galleria, contributo e fase se selezionata | Evidenza riutilizzabile, non più copie del file |
| Bolla o ricevuta | Materiali e acquisti, documenti e diario | Documento ricevuto e verifica; non consumo automatico |
| Consegna o reso | Materiali e logistica | Quantità e residui coerenti con ordini e magazzino |
| Materiale usato | Cantiere e riepilogo materiali | Consumo distinto da consegna e acquisto |
| Utilizzo di mezzo o attrezzo | Cantiere, squadra e mezzi | Utilizzo storico e costi secondo le regole configurate |
| Cambio custodia o posizione | Mezzi e logistica | Evento tracciato; non nuova imputazione economica implicita |
| Problema o impedimento | Cantiere, attività e diario | Responsabile, stato e conseguenze sul programma |
| Richiesta extra | Varianti o attività da verificare | Nessuna valorizzazione o accettazione automatica |
| Rapporto cliente | Documenti, rapporti cliente e diario | Documento distinto; nessun secondo conteggio del giornaliero |
| Costo verificato | Economia e consuntivi | Una fonte economica riconoscibile, senza raddoppiare ordini, bolle e fatture |

Le sezioni sono destinazioni concettuali: l’implementazione deve rispettare la navigazione esistente e può usare sottosezioni compatte, senza aggiungere una tab per ogni contenuto.

## 4 Contratto dei collegamenti e regole server

Ogni comando deve portare un identificativo stabile dell’operazione, il tipo di dato, la commessa scelta, la giornata o l’intervallo, i riferimenti collegati e la revisione su cui l’utente sta lavorando. Identità e autorizzazioni vengono verificate dal server; una `company_id` ricevuta dal client non costituisce autorizzazione.

- La commessa deve appartenere all’azienda autorizzata ed essere utilizzabile per l’operazione richiesta.
- Fasi e righe del contratto devono appartenere alla commessa. Riferimenti estranei devono essere rifiutati, non ignorati silenziosamente dopo l’approvazione.
- Persone e squadre devono essere nell’ambito consentito per il responsabile e per la giornata interessata.
- Un articolo di magazzino deve appartenere all’azienda; la sua consegna o assegnazione al cantiere deve essere verificata dove richiesta.
- Un ordine d’acquisto deve essere compatibile con azienda, commessa e fornitore. Con più candidati serve una scelta esplicita.
- File e percorsi Storage devono essere autorizzati prima dell’upload e della lettura tramite servizi privilegiati. Non fidarsi di un percorso arbitrario o del nome file.
- Quantità, unità, ore e importi non validi producono un errore verificabile. Nessun valore predefinito “1” per sostituire una quantità illeggibile.
- I dati accettati mantengono gli identificativi reali delle risorse. Materiali liberi e riferimenti storici incompleti restano visibili come “Da collegare”, senza corrispondenze inventate.
- Un trasferimento tra cantieri è un’operazione esplicita con origine e destinazione, non una modifica silenziosa di `order_id`.
- Accesso, lettura dei file e scritture si ricontrollano anche se l’assegnazione è stata revocata dopo la compilazione della bozza.

Prevedere controlli database sulle relazioni che oggi si trovano dentro JSON; valutare tabelle figlie normalizzate mantenendo adapter per i rapportini storici. Il disegno dello schema definitivo è un deliverable della prima fase, non un motivo per sostituire subito tutte le tabelle.

## 5 Responsabilità configurabili

Le impostazioni aziendali propongono quattro modelli, con eventuali eccezioni per cantiere o incarico. Le regole applicate a una giornata vengono versionate per rendere comprensibile lo storico.

| Modello | Persona che lavora | Responsabile |
| --- | --- | --- |
| Individuale | Registra il proprio giornaliero | Controlla i contributi |
| Responsabile | Timbra e aggiunge eventuali foto o problemi | Registra presenze e diario della squadra |
| Misto | Racconta il proprio lavoro | Registra o conferma ore e compone il diario |
| Ore individuali | Conferma le proprie ore | Racconta il lavoro della squadra |

La sorgente delle ore, la conferma operativa e la verifica amministrativa sono scelte separate. Il capo può confermare il lavoro senza vedere costi e margini. L’ufficio può validare il costo senza sostituire la descrizione originale dell’operaio.

Il caposquadra gestisce la propria squadra; il capocantiere compone il quadro del cantiere; il sostituto ha una delega circoscritta. Un referente organizzativo non diventa automaticamente capocantiere. In assenza del responsabile, i contributi restano inviabili secondo il modello autorizzato e attendono la conferma prevista.

Le ditte esterne rendicontano il proprio incarico. Distinguere forfait, ore, quantità e misto: le ore eventualmente raccolte su un forfait non generano da sole un costo aggiuntivo. Il referente della ditta può gestire il proprio personale senza leggere dati HR dei dipendenti dell’impresa.

Non riutilizzare il solo stato legacy `approvato` per indicare contemporaneamente conferma del capo e validazione amministrativa: alcuni consumatori esistenti lo usano già per costi e consumi. Servono stati separati e una compatibilità esplicita con questi consumatori.

## 6 Diario condiviso e ore senza doppioni

Il riepilogo giornaliero della commessa raccoglie contributi individuali e di squadra, senza eliminarli. Un unico riepilogo non implica un unico autore né vieta più contributi pertinenti.

Per ogni prestazione mantenere persona, commessa, intervallo o giornata, sorgente, ore ordinarie, eventuali altre componenti, stato e revisione. La timbratura propone un dato; l’inserimento del capo e la dichiarazione dell’operaio possono riferirsi alla stessa prestazione e devono essere riconciliati, non sommati.

### Flusso del capo che registra per tutti

1. Legge la squadra prevista per la giornata, con lo storico delle assegnazioni.
2. Segna presenti, assenti, sostituzioni e persone impegnate altrove.
3. Controlla le ore rilevate e inserisce quelle mancanti senza inventare timbrature.
4. Vede soltanto le discrepanze reali con altri contributi o intervalli.
5. Invia la propria versione; i lavoratori possono consultare e segnalare una discrepanza.

### Flusso del lavoratore che racconta e del capo che conferma

1. Il lavoratore invia testo o proposta vocale controllata, foto e materiali pertinenti.
2. Il capo legge i contributi già collegati alla commessa.
3. Conferma, chiede integrazione oppure modifica con motivo e versione conservata.
4. Conferma il diario operativo e l’avanzamento nell’ambito autorizzato.
5. L’ufficio valida le registrazioni economiche secondo le impostazioni aziendali.

Controllare due cantieri nello stesso giorno, sovrapposizioni, turno notturno, pause, trasferimenti, ritiri in negozio e ore aggiuntive reali. Non eliminare un secondo intervallo valido solo perché persona, giorno e cantiere sono uguali.

La finestra del giornaliero resta oggi o entro la fine del giorno successivo in Europe/Rome. Una correzione richiesta dall’ufficio segue un percorso distinto. Un dato offline scaduto non cambia automaticamente data: resta recuperabile per una verifica autorizzata. La finestra del rapporto cliente va definita separatamente dal giornaliero.

## 7 Avanzamento e consuntivi coerenti

Lavoro dichiarato, lavoro confermato e costo validato sono stati distinti. L’avanzamento della fase deve dipendere da una quantità verificata o da una percentuale autorizzata della stessa fase, mai dalla somma delle percentuali degli autori.

- Centralizzare la modifica delle fasi oggi possibile sia dalla pagina Avanzamento sia dall’approvazione del rapporto.
- Rendere atomici gli effetti operativi essenziali dell’approvazione, oppure lasciare uno stato esplicito di verifica incompleta che impedisca di presentare il risultato come completo.
- Verificare tutte le fasi prima della conferma. Un riferimento estraneo non deve scomparire senza spiegazione.
- Una riapertura o una riduzione dell’avanzamento richiede motivo e revisione, non un aggiornamento automatico da una vecchia bozza.
- Conservare distinte date pianificate, date dichiarate e date confermate. Il cronoprogramma deve dire quali usa.
- Condividere il metodo di calcolo dell’avanzamento complessivo fra testata, lavorazioni e cronoprogramma.
- Conservare le regole economiche pubblicate finché una revisione non è approvata: distinguere preventivo, impegni e consuntivo senza reinterpretare retroattivamente tutte le commesse.
- Tariffe e costi hanno una validità temporale o uno snapshot verificabile; una tariffa cambiata oggi non deve alterare silenziosamente un costo storico.
- Spostare una prestazione già valorizzata a un’altra commessa richiede una rettifica tracciata, non una modifica del totale a mano.
- Le letture economiche e dei consumi usano una sola versione efficace della prestazione. Una correzione di un rapporto già validato richiede nuova verifica e rettifica dei valori precedenti; non si contano insieme originale e correzione e non si cancellano gli eventi fisici già avvenuti.

Materiali, subappalti, viaggio e mezzi devono avere fonti economiche riconoscibili. Il costo può essere previsto, impegnato o verificato; pagamento e incasso sono ulteriori stati, non sinonimi del costo. Definire una sola regola per evitare di contare la medesima fornitura da ordine, scarico, acquisto Campo e fattura.

## 8 Bolle ordini materiali e resi

Il documento originale e le sue pagine vengono conservati una volta, con estrazione AI versionata e campi confermati dall’utente. Numero, data, fornitore, quantità e unità hanno una provenienza riconoscibile. Warning o dati mancanti restano da verificare.

Prevedere acquisto personale, conto azienda e ritiro ordine; consegne parziali; documenti multipagina; merce per più cantieri; materiale libero; resi, danni e trasferimenti. La ripartizione per cantieri conserva la quantità originale e il residuo non assegnato; impedisce ripartizioni eccessive.

La verifica dell’ufficio collega l’acquisto al costo diretto oppure all’ordine d’acquisto, secondo il flusso già presente. Non crea entrambi per lo stesso fatto economico. Il rimborso personale e il pagamento al fornitore restano separati.

La commessa deve poter consultare sia documenti in attesa sia documenti registrati o rifiutati. La sola coda del magazzino, che filtra elementi da verificare o rimborsare, non è uno storico completo della commessa.

La deduplicazione usa identificativi e contenuto pertinenti. Non basta il nome file, l’intestazione comune di un JPEG o un importo uguale: due acquisti legittimi possono avere lo stesso totale. Prevedere una barriera atomica per invii simultanei e un percorso per documenti realmente ripetuti o corretti.

La consegna alimenta la logistica; il consumo verificato alimenta l’utilizzo; l’imputazione economica segue la fonte scelta. Non scaricare automaticamente il magazzino soltanto perché una foto contiene il nome di un prodotto.

## 9 Mezzi attrezzature e trasferimenti

Custodia, posizione, utilizzo e costo sono informazioni distinte. Una scansione di consultazione non è un trasferimento né una prestazione economica.

- Presa in carico, passaggio di custodia, deposito in cantiere, carico su un veicolo e rientro mantengono origine, destinazione, autore e orario.
- Montaggi e rientri parziali verificano quantità e disponibilità in una transazione, anche con due operatori contemporanei.
- Bloccare utilizzo o nuovo montaggio non consentito di un bene fuori servizio anche sul server; permettere rientro e segnalazione appropriati.
- La posizione attuale non va sovrascritta da un rapporto di ieri sincronizzato dopo un movimento più recente. Conservare l’utilizzo storico e richiedere riconciliazione se necessario.
- Il contatore di un mezzo non viene sostituito da un dato vecchio o incoerente senza motivo autorizzato.
- Accessi delle ditte esterne circoscritti a beni affidati o disponibili per il proprio incarico; non a tutto il parco aziendale.
- Un guasto apre una segnalazione collegata al bene e, quando pertinente, alla commessa; non due ticket indipendenti per lo stesso invio.
- Correggere un movimento produce una rettifica riconoscibile e mantiene il movimento originale.

## 10 Sincronizzazione affidabile tra app e commessa

### Salvataggio ed effetti derivati

Il server riceve un comando con identificativo stabile e verifica autorizzazioni, riferimenti e revisione. La transazione salva il dato principale e registra gli effetti da completare. Il risultato contiene gli identificativi reali e lo stato dei passaggi; il client non presume che ogni effetto sia riuscito.

Le modifiche essenziali che determinano validità e consuntivo devono essere atomiche. PDF, notifiche e altre elaborazioni possono essere asincroni: una coda persistente di effetti da completare, detta outbox, registra tentativi, esito ed errore. La struttura è da progettare; non risulta già implementata da questo piano.

Ogni effetto usa una chiave composta da sorgente, revisione e tipo. Ritentare un PDF non reinvia il rapporto; ritentare una notifica non ripete un movimento. Gli effetti non ancora eseguiti sopravvivono alla chiusura dell’app e a un’interruzione del servizio.

Gli effetti con conflitti operativi, come la posizione di un attrezzo cambiata nel frattempo, non si ripetono alla cieca: passano a verifica. Le elaborazioni in errore hanno tentativi limitati e una coda di recupero visibile all’ufficio, senza loop infiniti.

### Aggiornamento delle schermate

Progettare un evento server affidabile della commessa per ogni revisione rilevante. Valutare il riuso di `order_events`, già pubblicata per realtime, con tipi e payload minimi autorizzati. Gli eventi tecnici non devono generare doppie righe umane nel diario o esporre costi e testi riservati.

Un registro condiviso associa tipo di evento e commessa alle sole letture da aggiornare: rapportini, diario, ore, materiali, acquisti, mezzi, costi, fasi e cronoprogramma. Le chiavi includono azienda, identità o livello di accesso dove necessario; non riutilizzano dati dell’utente precedente al cambio account.

- Aggiornamento immediato della sessione che scrive usando gli identificativi ricevuti dal server.
- Aggiornamento delle altre sessioni tramite eventi e riletture mirate.
- Recupero al ritorno nell’app, alla riconnessione e quando il realtime risulta degradato.
- Confronto della revisione dopo una disconnessione: ricevere eventi successivi non garantisce di aver ricevuto quelli persi.
- Nessun affidamento alla sola `invalidateQueries` della sessione che ha scritto.
- Errori distinguibili da dati assenti, con stato di aggiornamento leggibile.

Non è necessario pubblicare ogni tabella né aprire un canale per ogni riga. Il modello preferito è un segnale limitato e autorizzato della commessa e letture aggregate delle risorse necessarie. La scelta definitiva dipende dal collaudo delle policy e delle prestazioni.

### Offline e allegati

La coda conserva testo e file non caricati, ambito originale, versione e identificativo del comando. Cambiare cantiere durante un upload non sposta il file al nuovo cantiere. Due schede del browser non possono prendere in carico contemporaneamente la stessa operazione.

Non cancellare la copia locale prima di avere ricevuta verificabile, percorso Storage e collegamento al dato principale. I caricamenti completati senza collegamento rimangono identificabili; recupero e pulizia dei file orfani devono avere una politica di conservazione e autorizzazione esplicita.

Alla revoca di un incarico o al cambio account, sospendere le operazioni non più autorizzate e conservarle nell’ambito originale per assistenza. Non inviarle usando l’identità successiva. Per le bozze vocali legacy, prevedere una revisione guidata verso il giornaliero canonico, senza trasformazioni automatiche che promettano ore o costi già registrati.

### Riconciliazione della commessa

Ogni ricevuta server deve permettere di risalire al comando, al dato originale e alla commessa. Il controllo di completezza confronta queste fonti e segnala differenze senza correggerle automaticamente:

- Rapporto presente nella commessa corretta, con tutte le fasi e le persone autorizzate.
- Foto e documenti leggibili, collegamenti presenti e nessun allegato caricato ma privo di una destinazione verificabile.
- Ore effettive uniche per prestazione, con distinzione da proposte e intervalli sovrapposti.
- Materiali ricevuti, consumati, restituiti e trasferiti coerenti per quantità e unità; residui negativi da verificare.
- Costo della commessa e delle fasi riconciliato con le fonti economiche e la parte ancora senza fase, senza doppio conteggio.
- Utilizzi e movimenti dei beni coerenti con le revisioni, senza sovrascritture retroattive della posizione.
- Documento PDF della revisione corrente riconoscibile e firme legate alla versione corretta.
- Eventi e notifiche con sorgente univoca; effetti ancora in attesa riconoscibili.

La verifica si esegue in modo mirato sulla commessa modificata e su lotti controllati dello storico. Non è una scansione continua di tutto il database. Una commessa non viene etichettata come completamente aggiornata se un effetto essenziale o un collegamento rimane da verificare.

## 11 Disegno delle schermate

### App Campo

La home mostra lavoro di oggi, eventuali azioni mancanti e accesso ai cantieri. Non ripete lo stesso lavoro in più card equivalenti.

La scheda cantiere propone Giornaliero, Foto, Materiali e Segnala problema. Squadra, ore e conferme compaiono secondo ruolo e impostazioni. Il QR rimane un ingresso immediato ai beni autorizzati, senza richiedere di compilare prima il giornaliero.

Il modulo normale mostra cantiere, Oggi o Ieri, scadenza breve, descrizione o voce e foto. Dettagli aggiuntivi si aprono su richiesta. Per il responsabile, la lista della squadra è precompilata e segnala soltanto le discrepanze. Per il subappalto a forfait non mostra le ore come dato economico obbligatorio.

Stati semplici: Sul telefono, In attesa di invio, Ricevuto, Da correggere, Confermato. L’interfaccia può aggiungere “PDF in preparazione” o “Materiali da verificare”, senza sostituire lo stato del rapporto.

### Commessa aziendale

Una sintesi sopra le sezioni mostra giorno o intervallo selezionato, contributi ricevuti, persone rendicontate, verifiche mancanti e problemi operativi. Non deve diventare una seconda dashboard economica.

Ogni contenuto mantiene un collegamento apribile al dato originale: contributo, bolla, foto, movimento, ordine, costo o PDF. Le sezioni Cantiere, Materiali e acquisti, Economia e documenti usano le stesse fonti, con conteggi coerenti e filtri espliciti.

Prevedere una vista “Da verificare” per associazioni incomplete, conflitti, allegati mancanti ed effetti non completati. Non mostrare errori tecnici agli operai quando basta una frase breve e un’azione di recupero.

## 12 PDF firme e documenti

Il PDF viene generato da una versione precisa del rapporto e conserva il collegamento alla commessa. Quando cambia il contenuto, il documento precedente rimane nello storico e quello nuovo è distinguibile; una firma non viene riutilizzata su contenuto modificato.

Prevedere giornaliero individuale, riepilogo di squadra o cantiere e rapporto cliente distinti. Il cliente riceve soltanto la versione autorizzata, senza costi interni, margini o note riservate. Consegna e collaudo restano processi specifici, non una casella del giornaliero.

File riservati, collegamenti a scadenza preparati al momento dell’apertura e controlli dei permessi su ogni lettura. Il percorso del file o il suo identificativo stabile è conservato; un URL firmato scaduto non diventa il riferimento definitivo.

## 13 Prestazioni e osservabilità

L’intervento non deve aumentare il carico ordinario del gestionale. Misurare prima il numero di richieste, latenza e quantità di dati di una giornata campione.

- Query indicizzate per azienda, commessa, giorno e stato; paginazione dello storico.
- Niente query per ogni membro della squadra quando è possibile una lettura aggregata autorizzata.
- Raggruppare le invalidazioni ravvicinate; niente riletture simultanee di tutte le commesse.
- Caching e aggiornamento soltanto delle viste interessate; fermare canali e richieste al cambio ambito.
- Thumbnails per le gallerie; risoluzione adeguata al testo per le bolle; elaborazione pagine e allegati con limiti espliciti.
- Elaborazioni AI ripetute con identità stabile e gestione dei fallimenti; un credito o provider non disponibile non deve bloccare il salvataggio manuale.
- Nessun nuovo cron rapido per compensare un collegamento applicativo errato. Worker con lotti limitati, presa in carico atomica e monitoraggio degli errori.
- Metriche per operazioni ricevute, effetti in attesa, tentativi, ritardi di aggiornamento, conflitti e associazioni incomplete, senza riportare inutilmente contenuti personali nei log.

Obiettivi di accettazione da misurare su un ambiente di prova rappresentativo: niente incremento delle richieste in stato inattivo; nessuna rilettura totale per una singola modifica; aggiornamenti fra sessioni entro pochi secondi con realtime funzionante, e recupero entro un intervallo concordato quando degradato. Per le viste principali, definire una soglia di regressione sulla latenza rispetto alla baseline prima del rilascio; non presentare questi obiettivi come prestazioni già ottenute.

## 14 Catalogo del collaudo

Ogni scenario deve controllare app, fonte server, seconda sessione della commessa e letture derivate. I file di prova devono essere fittizi; invii, firme, acquisti e movimenti online richiedono un ambito di test autorizzato.

| Caso | Risultato richiesto |
| --- | --- |
| Operaio solo | Un contributo nel cantiere corretto, senza dipendenza da un capo assente |
| Capo registra per tutti | Ore per persona; nessuna duplicazione con i contributi individuali |
| Operaio racconta e capo conferma | Originale conservato, conferma tracciata, consuntivo secondo le regole |
| Due capisquadra | Ambiti separati, nessuna modifica della squadra altrui |
| Capocantiere aggrega | Riepilogo completo senza ricopiare prestazioni |
| Sostituto autorizzato | Delega circoscritta, storico del responsabile originale |
| Persona senza account | Registrazione del responsabile con identità operativa verificabile |
| Tre cantieri nello stesso giorno | Ore, foto e materiali attribuiti a ciascuno senza sovrapposizioni |
| Cambio squadra dopo la giornata | Il rapporto usa l’assegnazione storica, non soltanto quella attuale |
| Timbratura dimenticata | Dichiarazione e verifica, nessuna entrata inventata |
| Sessione aperta o uscita tardiva | Stato provvisorio e ripartizione temporale espliciti |
| Notte e cambio ora | Intervalli coerenti e giornata determinata dalle regole del server |
| Trasferimento e ritiro materiali | Tempi e destinazioni distinti dalla lavorazione |
| Subappalto a forfait | Avanzamento e contratto senza costo orario implicito |
| Subappalto a ore o quantità | Unità e persone della ditta verificate, non dipendenti interni |
| Lavoro fermo | Impedimento e attività residue, nessun progresso inventato |
| Lavoro extra | Richiesta separata, nessuna accettazione economica automatica |
| Fase di altra commessa | Rifiuto sul server prima di approvare o valorizzare |
| Fase rimossa o storica | Dato originale conservato e percorso di collegamento verificato |
| Materiale libero | Visibile “Da collegare”, non abbinato per nome senza conferma |
| Quantità zero o illeggibile | Errore o revisione, mai sostituzione con un pezzo |
| Consegna parziale | Ricevuto e residuo coerenti con l’ordine |
| Bolla multipagina | Documento unico, righe senza doppioni tra pagine |
| Una bolla per due cantieri | Ripartizione con quantità totale conservata |
| Due acquisti dello stesso importo | Nessun falso doppione basato sul solo totale |
| Stessa bolla inviata da due persone | Una ricezione canonica e contributi riconoscibili |
| Ordine e successiva fattura | Nessun secondo costo per lo stesso fatto economico |
| Reso o trasferimento materiale | Quantità, residui e riferimenti di origine coerenti |
| Foto lavoro e foto bolla | Destinazioni distinte; file leggibile dai soli autorizzati |
| Documento di altra azienda | Lettura e associazione rifiutate anche dal servizio privilegiato |
| Attrezzo fuori servizio | Nuovo utilizzo non consentito rifiutato sul server |
| Passaggio di custodia | Posizione, responsabile e storico coerenti |
| Montaggio e rientro parziale | Quantità non eccedenti e concorrenza controllata |
| Movimento più recente del giornaliero | Il rapporto tardivo non sovrascrive la posizione attuale |
| Guasto o smarrimento | Una segnalazione pertinente e stato aggiornato |
| Modifica del rapporto durante la verifica | Conflitto esplicito; nessuna approvazione di una versione non letta |
| Rapportino rifiutato e rimandato | Stesso percorso storico, nuova revisione e PDF coerente |
| Correzione dopo la validazione | Nuova verifica e rettifica; una sola versione economica efficace |
| Giornaliero e firma cliente nello stesso giorno | Due documenti distinti, nessuna duplicazione di ore o consumi |
| Modifica dopo la firma | Firma non riusata; versione precedente conservata |
| Doppio tocco e risposta persa | Stessi identificativi server, un solo effetto economico |
| Audio con permesso tardivo | Nessuna registrazione dopo l’uscita dalla pagina |
| Errore del registratore | Microfono e timer fermati, ripresa possibile |
| Anteprima audio chiusa | Risorse temporanee liberate |
| Conversione foto bloccata | Timeout e fallback, nessun caricamento infinito |
| AI non disponibile | Modulo manuale utilizzabile e dati già inseriti conservati |
| Nome persona ambiguo nella voce | Scelta esplicita, nessuna identità inventata |
| Upload completato e collegamento fallito | File recuperabile, nessun falso stato di invio completo |
| Offline su due schede | Una sola presa in carico per comando |
| Offline oltre la scadenza | Giorno originale conservato, verifica autorizzata |
| Cambio account o revoca incarico | Nessuna operazione inviata con un’altra identità |
| PDF o notifica falliti | Rapporto conservato; recupero del solo effetto fallito |
| Realtime assente o evento perso | Rilettura mirata e recupero della revisione |
| Due sessioni aziendali aperte | Rapporti, ore, fasi, materiali e costi si aggiornano senza reload generale |
| Storico con molte righe | Paginazione completa; nessun totale basato su dati troncati |
| Ristrutturazione | Squadre, ditte e più lavorazioni con lo stesso protocollo |
| Serramenti o fotovoltaico | Flusso ridotto e campi pertinenti, senza un secondo motore di sincronizzazione |

Aggiungere casi emersi dal pilota. Un elenco ampio non può garantire l’assenza di ogni situazione futura; deve diventare una suite ripetibile e ampliabile.

## 15 Fasi operative di sviluppo

### Fase A Contratti e associazioni

- [ ] Censire fonti, scritture, trigger, letture e permessi per ogni contenuto della commessa.
- [ ] Definire identificativi del comando, revisioni, stati e regole di autorizzazione.
- [ ] Aggiungere test negativi per fasi, persone, materiali e file di altro ambito.
- [ ] Produrre controllo dello storico in sola lettura e classificazione delle associazioni incomplete.
- [ ] Definire una procedura di correzione con anteprima, approvazione, lotti e reversibilità; nessuna bonifica automatica per somiglianza dei nomi.
- [ ] Verificare e completare la proposta del protocollo rapportini, incluse tutte le vie di ingresso server.

Completamento: riferimenti estranei rifiutati e fonti attuali documentate; il caso Demo diventa un test di regressione senza modificarlo automaticamente.

### Fase B Affidabilità dei comandi

- [x] Correggere in locale i quattro difetti riprodotti su audio e conversione foto, con regressioni automatiche.
- [ ] Introdurre invii idempotenti e protezioni atomiche contro duplicati.
- [ ] Salvare in modo coerente dato principale ed effetti da completare.
- [ ] Centralizzare approvazioni e aggiornamenti delle fasi.
- [ ] Gestire conflitti di revisione, effetti falliti e stato ricevuto distinto dal completamento.
- [ ] Completare collegamenti e recupero degli allegati, mantenendo file privati.

Completamento: risposta persa, doppio invio e fallimento di un effetto non provocano perdita dati o doppio conteggio.

### Fase C Flussi per ruoli e squadre

- [ ] Implementare modelli aziendali, eccezioni per cantiere, deleghe e regole versionate.
- [ ] Collegare contributi personali, diario del responsabile e presenze riconciliate.
- [ ] Separare conferma operativa da validazione amministrativa preservando gli stati legacy.
- [ ] Distinguere incarichi delle ditte a forfait, ore e quantità.
- [ ] Conservare la squadra storica e gestire assenze, sostituzioni e persone su più cantieri.

Completamento: ogni modello passa il medesimo controllo di collegamento alla commessa e produce un consuntivo non duplicato.

### Fase D Commessa e aggiornamenti tra sessioni

- [ ] Definire il registro di eventi e delle viste da aggiornare.
- [ ] Uniformare chiavi query, invalidazioni, recupero al focus e riconnessione.
- [ ] Integrare lo storico acquisti Campo nella commessa, preservando la coda del magazzino.
- [ ] Allineare rapportini, diario, ore, consumi, mezzi, cronoprogramma ed economia.
- [ ] Aggiungere stato “Da verificare” per conflitti e passaggi incompleti.
- [ ] Provare pubblicazione realtime e policy con utenti reali di test, non con il solo ruolo amministrativo.

Completamento: una seconda sessione della commessa vede aggiornamenti coerenti e recupera gli eventi persi senza refresh totale.

### Fase E Logistica documenti e mobile

- [ ] Completare bolle multipagina, ripartizioni, ritiri parziali, resi e trasferimenti.
- [ ] Integrare mezzi e attrezzature distinguendo utilizzo storico da posizione attuale.
- [ ] Implementare conservazione offline dei file e recupero guidato delle bozze legacy.
- [ ] Semplificare home, giornaliero e schermata del responsabile senza rimuovere i controlli.
- [ ] Collegare PDF, firme e versioni alle fonti della commessa.

Completamento: un percorso ordinario richiede un ingresso chiaro e un invio, senza passare fra pagine equivalenti; le eccezioni hanno recuperi espliciti.

### Fase F Collaudo e rilascio

- [ ] Eseguire il catalogo su database di prova, due sessioni separate e dispositivi mobili.
- [ ] Verificare somme economiche, quantità e provenienza con una riconciliazione ripetibile.
- [ ] Misurare traffico, latenza, query e aggiornamenti rispetto alla baseline.
- [ ] Controllare migrazioni, tipi generati, file Storage e versioni delle funzioni distribuite.
- [ ] Attivare su un pilota, poi per aziende selezionate, mantenendo i flussi esistenti.
- [ ] Verificare funzionalità e metriche dopo il deploy prima di dichiarare il rilascio completato.

Dipendenze: A precede B e C per i nuovi contratti server; correzioni locali riprodotte possono procedere senza attendere il nuovo schema. B e C precedono il completamento di D; E usa i contratti di A e B; F non può essere sostituita dai soli test unitari. Lo sviluppo locale è autorizzato; commit e rilascio restano passaggi separati.

## 16 Migrazioni storico e protezione del lavoro esistente

Non resettare il worktree condiviso, non includere automaticamente modifiche di altri terminali e non eseguire pull, merge o push come conseguenza della sola redazione di questo piano. Prima dell’implementazione registrare branch, base e file interessati, poi confrontare nuovamente lo stato prima di ogni commit.

Le modifiche di schema devono essere additive, con adapter per i formati storici e backfill separato dal percorso di scrittura ordinario. SQL non pronto resta fuori da `supabase/migrations/`, secondo `CLAUDE.md`. Una migrazione futura pronta deve seguire la procedura di applicazione e riallineamento del registro, con timeout e lotti per le operazioni sui dati.

Prima di correggere lo storico, produrre un’anteprima per azienda e commessa: riferimenti estranei, allegati mancanti, operazioni duplicate, effetti incompleti e differenze dei totali. Non cambiare automaticamente fasi o costi di rapporti firmati o già valorizzati. Le rettifiche devono essere autorizzate e tracciate.

Il ritorno al flusso precedente interrompe l’attivazione del nuovo percorso ma non cancella operazioni già ricevute, outbox, firme o documenti. Preservare accessi e letture delle aziende non ancora migrate.

## 17 Punti del codice da utilizzare durante lo sviluppo

| Ambito | Punti attuali da preservare o integrare |
| --- | --- |
| Modulo e ingressi | `src/pages/campo/CampoRapportino.tsx`, `CampoRapportinoVoce.tsx`, `src/hooks/campo/useRapportinoProtocollo.ts` |
| Regole e ruoli | `src/lib/campo/regoleCampo.ts`, `src/hooks/useRegoleCampo.ts`, `src/hooks/useIsCampo.ts` |
| Revisione e approvazione | `src/components/orders/OrdineRapportiniCampo.tsx`, `src/lib/campo/loadLaborReview.ts` |
| Diario e aggiornamenti | `src/hooks/useOrderDiary.ts`, `src/lib/orders/refreshWorkQueries.ts` |
| Materiali ed economia | `src/hooks/useOrderMaterialUsage.ts`, `src/lib/orders/materialUsage.ts`, `src/hooks/useCostiMaterialiFasi.ts` |
| Programma lavori | `src/hooks/useCronoprogramma.ts`, `src/lib/orders/cronoprogramma.ts` |
| Bolle e acquisti | `src/pages/campo/CampoMerce.tsx`, `src/hooks/campo/useCampoAcquisti.ts`, `src/components/warehouse/AcquistiCampoCard.tsx` |
| Lettura documenti | `src/lib/campo/leggiDocumentoAcquisto.ts`, `src/lib/campo/acquisti.ts`, `supabase/functions/ddt-ai-extract/index.ts` |
| Audio | `src/components/campo/CampoAudioRecorder.tsx`, `RapportinoVoceInput.tsx`, `src/hooks/campo/useRapportinoVocale.ts`, `supabase/functions/parse-rapportino-ai/index.ts` |
| Mezzi e attrezzature | `src/pages/campo/CampoMezzi.tsx`, `CampoAttrezzo.tsx`, `src/hooks/useMezzi.ts`, `src/components/campo/MezziFineGiornata.tsx` |
| Offline | `src/lib/campo/sync-queue.ts`, `offlineProcessor.ts`, `src/hooks/campo/useOfflineSync.ts`, `useFormDraft.ts` |
| PDF e documenti riservati | `src/lib/campo/rapportinoPdf.ts`, `src/lib/storage/fileRiservati.ts`, `supabase/functions/genera-pdf-rapportino` |

Riferimenti di progetto: [giornata mobile](campo-mobile-giornata.md), [agenda delle squadre](campo-crew-agenda-local.md), [PDF rapportini](rapportino-pdf-local.md), [economia delle fasi e cronoprogramma](superpowers/plans/2026-10-06-commessa-fasi-economia-cronoprogramma.md). Gli stati e le prove descritti in quei documenti si riferiscono ai rispettivi incrementi; non sostituiscono il collaudo integrato previsto qui.

## 18 Incremento locale del 13 ottobre

### Correzioni implementate

| Ambito | Comportamento locale verificato |
| --- | --- |
| Registratore vocale | Microfono e timer fermati all’uscita e all’errore; permesso tardivo annullato; anteprime liberate; durata monotona e arresto a due minuti |
| Conferma e riascolto | Invio asincrono singolo; controlli bloccati durante l’elaborazione; audio vuoto o inferiore a tre secondi non inviabile; errori di riproduzione recuperabili; formato nativo del browser come fallback |
| Conversione foto | Timeout anche per `canvas.toBlob`, gestione errori sincroni e callback tardivi; risorse temporanee liberate per consentire il fallback del chiamante |
| Associazioni prima dell’approvazione | L’ufficio controlla appartenenza delle fasi ad azienda e commessa, fasi dei materiali e sottofasi; un riferimento estraneo impedisce l’approvazione tramite questa interfaccia |
| Avanzamento concorrente | Aggiornamento condizionato alla revisione letta, azienda e commessa; nessuna riscrittura se l’avanzamento attuale è già sufficiente; conflitto segnalato senza sovrascrivere la revisione concorrente |
| Viste derivate | Invio, approvazione e rifiuto aggiornano le cache pertinenti di rapportini, diario, cronoprogramma, materiali e indicatori giornalieri; chiavi del cronoprogramma separate per azienda |
| Recupero degli aggiornamenti | Il canale esistente del diario riconosce l’evento `reportino_cantiere` della stessa azienda e commessa; rapportini, cronoprogramma e diario possono rileggere al ritorno sulla pagina quando i dati sono scaduti |

Le riletture aggiunte non usano polling o nuovi canali. Le query chiuse vengono soltanto marcate da aggiornare; la verifica di cache controlla che una commessa diversa non venga invalidata dal registro mirato. La conferma delle fasi usa letture aggregate a lotti, non una query per ogni fase. L’intervento usa la mappa Graphify esistente per seguire i consumatori della commessa e mantiene i vincoli Supabase di ambito aziendale; non cambia policy o pubblicazioni online.

### Limiti ancora aperti

Il controllo dei collegamenti del primo incremento è un preflight frontend, non una protezione server contro altre vie di ingresso. Il server ha già un trigger per applicare le fasi, ma può saltare riferimenti non validi e sopprimere errori; il browser esegue anche un passaggio successivo. La verifica e la sostituzione preparata in locale sono nella sezione 19. Il protocollo atomico completo e il recupero persistente della fase B restano da completare. Non sono stati modificati i riferimenti errati dello storico Demo.

Il recupero tramite evento dipende dalla ricezione dell’evento server esistente. Un evento mancante non è stato reso atomico da questo incremento. Il test di ricezione simula una seconda cache: non certifica due dispositivi reali, tutte le policy o una rete interrotta. Offline con allegati, outbox, contributi aggregati del capo, ruoli e modelli completi, bolle multipagina e storico acquisti nella commessa restano attività del piano.

La verifica browser del profilo operaio di prova ha aperto il percorso vocale e il modulo giornaliero a 320 e 390 pixel senza overflow orizzontale. Non ha acceso microfono o fotocamera né trasmesso rapportini, firme, foto o audio di prova. Le prove automatiche simulano i dispositivi; trascrizione AI e hardware reale richiedono il collaudo autorizzato della fase F.

### Risultati del collaudo locale

- Suite estesa Campo e commessa: 98 file, 1.160 test superati, inclusi casi negativi di associazione e concorrenza. Sono regressioni automatiche, non l’intero catalogo end-to-end della fase F.
- Build Vite e service worker: riusciti sull’ultimo codice locale. Una build intermedia si è fermata per `ENOSPC`; le sole copie temporanee generate in questo incremento sono state eliminate e la build è stata ripetuta.
- TypeScript mirato: 15 file di sorgente e test toccati, zero errori dopo i ritocchi. Il `typecheck` generale del repository segnala ancora errori fuori da questo controllo mirato: non è dichiarato verde.
- Controlli ESLint mirati e `git diff --check` senza errori; rimangono avvisi di configurazione/toolchain e avvisi React/accessibilità nei test esistenti, non classificati come collaudo completo del prodotto.

Log locali: `/tmp/campo-loop-suite-final-20261013.log`, `/tmp/campo-loop-build-verified-final-20261013.log`, `/tmp/campo-loop-typecheck-toccati-final-20261013.log`. Il log del controllo generale è `/tmp/campo-loop-typecheck-20261013.log`. La scarsità di spazio disco locale va risolta prima di ulteriori build estese; non dimostra un problema del database remoto.

Nessun push, deploy, migrazione o modifica dei dati operativi online fa parte di questo incremento. Le modifiche preesistenti degli altri terminali rimangono nel worktree condiviso.

## 19 Controlli server e approvazione atomica delle lavorazioni

### Situazione distribuita e correzioni locali

La lettura del catalogo remoto del 13 ottobre conferma che `fn_rapportino_applica_avanzamento()` è presente. La funzione ignora fasi di un’altra commessa e intercetta gli errori per voce con un warning: il cambio di stato può quindi riuscire con un avanzamento incompleto. La RPC `campo_rapportini_protocollo()` non è presente nel catalogo letto. Nessuna delle bozze di questo incremento è stata applicata al database remoto.

La bozza [controlli e avanzamento atomico](../supabase/migrations-pending/campo_rapportini_collegamenti_atomici.sql) riusa il punto di ingresso esistente, senza affiancare un secondo motore. Il controllo prima della scrittura rifiuta lavorazioni estranee ad azienda o commessa, sottofasi di un’altra lavorazione, righe materiali di un altro ordine, articoli di magazzino di un’altra azienda, duplicati di fase e quantità o percentuali non valide. Mantiene materiali liberi e vecchie voci contenenti solo ore; non inventa riferimenti, unità o movimenti.

Il passaggio ad approvato applica le lavorazioni nella stessa transazione. Un errore non diventa più un semplice warning: vengono annullati stato, aggiornamenti delle altre fasi e gli altri effetti database di quella transazione. Il calcolo dalle sottofasi resta prioritario rispetto alla percentuale dichiarata; gli avanzamenti validi non scendono. I soli aggiornamenti tecnici dei PDF non riapplicano il lavoro e non impediscono la consultazione dello storico incompleto.

La bozza [protocollo rapportini](../supabase/migrations-pending/campo_rapportini_protocollo.sql) ora distingue le modifiche operative dagli aggiornamenti tecnici anche per foto, fasi, straordinario, avanzamento e dati cliente. Un cambio limitato a queste colonne non salta più la scadenza. Un rapporto cliente nuovo non può acquisire ore, presenze o materiali mediante un UPDATE successivo; i contenuti economici dei vecchi rapporti firmati non vengono azzerati automaticamente.

Il catalogo remoto conferma `ore_lavorate numeric(4,1)`. La bozza passa a `numeric(5,2)`, aggiungendo il secondo decimale senza ridurre le tre cifre intere disponibili. Il precedente `numeric(4,2)` falliva sul dato sintetico storico 900,9; il test di conversione ne controlla la conservazione. Il valore elevato è solo una prova di capacità del tipo, non una giornata lavorativa ritenuta valida. La conversione può comunque richiedere una riscrittura e resta soggetta al collaudo di migrazione fuori picco.

### Lock e permessi

La proposta segue le guide Supabase e Postgres: funzioni interne non eseguibili da `anon` o `authenticated`, riferimenti aziendali espliciti, nessun ampliamento delle policy RLS. Il motore di approvazione prende i lock sulle sole risorse dichiarate, con ordine stabile: sottofasi prima delle fasi, coerentemente con il ricalcolo esistente dal figlio al genitore. L’attesa dei lock dentro la funzione è limitata a tre secondi. Nessuna chiamata AI, PDF o HTTP avviene sotto lock; non sono aggiunti cron o canali realtime.

L’ordine e i timeout sono verificati nel codice e nel catalogo della fixture. Le contese fra connessioni vere, il costo delle verifiche e l’interazione con tutte le policy/trigger distribuiti richiedono ancora PostgreSQL di staging. PGlite in memoria non costituisce una prova di concorrenza multi-connessione né una misura delle prestazioni online.

### Collaudo e limiti

La fixture carica il trigger precedente, poi la bozza protocollo e quella atomica; applica la bozza atomica due volte per verificare la riesecuzione. Le prove controllano anche fallimento della seconda fase, rollback degli effetti transazionali e ritentativo sullo stesso rapporto senza doppio conteggio. Il costo della fixture è un effetto simulato da un trigger: dimostra il rollback, non certifica le formule economiche reali del gestionale.

Le due suite PostgreSQL isolate superano 54 test; la suite estesa Campo e commessa supera 1.199 test su 99 file dopo l’ultimo ritocco. I due file di test passano il controllo TypeScript mirato e ESLint; il controllo TypeScript generale resta quello non pulito riportato nella sezione 18. Log: `/tmp/campo-server-final-20261013.log`, `/tmp/campo-server-types-20261013.log`, `/tmp/campo-server-suite-final-20261013.log`.

La bozza resta fuori da `supabase/migrations/`. Non attiva nel frontend una capacità che il server non ha e non modifica dati storici. Sono ancora esclusi: presenze e autorizzazioni complete per persona/incarico, proprietà dei file Storage, idempotenza dei comandi, evento del diario atomico, outbox PDF/notifiche, rettifiche economiche e validazione integrata con tutti i canali AI/WhatsApp. La pubblicazione richiede inventario dei trigger reali, verifica dei duplicati e dei tipi legacy, collaudo concorrente e applicazione/riallineamento secondo `CLAUDE.md`.

## 20 Simulazioni operative estese

Il collaudo locale del 13 ottobre supera **2.302 test su 101 file**, con 1.103 casi aggiunti rispetto ai 1.199 della sezione 19. I dati sono fittizi e le simulazioni delle giornate sono riproducibili con seme `20261013`. Le prove non inviano rapportini, documenti, audio, messaggi o acquisti online.

### Variabili incrociate

| Area | Simulazioni aggiunte | Comportamento verificato |
| --- | --- | --- |
| Ruoli e regole aziendali | 384 combinazioni | Operaio, caposquadra, capocantiere e subappaltatore; tre modalità aziendali; capo presente o assente; assegnazione valida o revocata; quattro date; giornaliero o cliente. |
| Ore nel modulo | 360 combinazioni | Ore ordinarie, straordinario e presenza selezionata; valori vuoti, negativi, non finiti e limiti di 24 ore. |
| Giornate su più luoghi | 64 giornate | Due cantieri, pausa, tragitto da attribuire e ritiro in sede; eventi riordinati e ritrasmessi non aumentano le ore. Il tragitto non viene convertito automaticamente in costo di commessa. |
| Materiali | 108 combinazioni e 21 casi di formato | Consegna, consumo approvato, reso, prezzo mancante e saldo negativo; nessun doppio conteggio di righe ritrasmesse; quantità e prezzi corrotti distinti dalle stringhe numeriche valide. |
| Importi | 80 combinazioni e 4 formule da stipendio | Costo frontend confrontato con `round(numeric,2)` PostgreSQL; formula da lordo, ore mensili e aliquota INPS. |
| Date e turni | 20 casi | Cambio ora di marzo e ottobre, anno bisestile, fine anno, date invalide e turni notturni; scadenza entro la fine del giorno successivo italiano. |
| Guasti bolla e offline | 8 combinazioni e 12 codici errore | Compressione, upload e lettura AI indipendenti; dati invalidi/permessi negati distinti da errori transitori; un invio fallito non viene dichiarato riuscito. |

Questi numeri descrivono le matrici, non una copertura di ogni variabile del prodotto. Si aggiungono regressioni su sessione scaduta, autore diverso, revoca dell’assegnazione, campi decisionali AI, approvazione e storno.

### Motore della manodopera e correzioni

La nuova suite `campoSimulazioniCosti.test.ts` carica dal repository la funzione del costo orario e le funzioni SQL di registrazione, conflitto ore e revoca. Le applica alla stessa fixture delle due bozze server. A differenza del costo fittizio della sezione 19, verifica le righe di `order_employees` e gli snapshot effettivamente prodotti dal codice SQL delle migrazioni. Auth, permessi, assegnazioni e lettura delle timbrature sono simulati: non certifica l’intero schema distribuito.

Le prove confermano: presenze che sostituiscono le ore dell’autore; ditte senza tariffa dipendente inventata; lavori validi su più cantieri; blocco oltre 24 ore; doppio rapporto capo/operaio senza timbrature; tolleranza di 30 minuti sul totale timbrato; cambio tariffa, revoca e riapprovazione; ore mantenute quando la tariffa manca. Un guasto di fase annulla anche le vere scritture SQL di manodopera della fixture.

Le correzioni di questo ciclo sono:

1. **Bozza protocollo:** anche un UPDATE da zero a ore positive viene confrontato con il rapporto cliente storico che contiene già quelle ore. La creazione a zero non aggira più la protezione dal doppio conteggio.
2. **Bozza collegamenti:** persona ripetuta nelle presenze, ore fuori intervallo, struttura non valida, identità ambigua e dipendente di un’altra azienda vengono rifiutati. I nomi storici senza ID non vengono trasformati in identità. Appartenenza del subappaltatore all’incarico e deleghe complete restano da implementare.
3. **Bozza collegamenti:** durante la revoca non si cambia azienda, commessa, autore o giorno di un rapporto approvato. Lo storno deve avvenire sulla registrazione originale prima di un eventuale riallineamento.
4. **Riepilogo materiali frontend:** booleani, array, esadecimali e valori vuoti non diventano quantità o prezzi. I dati corrotti richiedono verifica e sospendono la stima economica; le stringhe numeriche valide restano compatibili. Non vengono modificati movimenti o dati storici.

Le prime due regressioni sono state riprodotte prima delle relative correzioni. Sui materiali, sette casi negativi fallivano prima della correzione e ora passano. I fallimenti iniziali del parametro data senza cast e della normalizzazione `null` nella fixture erano errori del test, non ulteriori bug dell’applicazione.

### Verifiche e prossimo collaudo

Suite estesa: 2.302 test, 101 file, 32,72 secondi nell’ultima esecuzione. TypeScript mirato su sette file: zero errori; ESLint mirato e `git diff --check`: senza errori. Restano gli avvisi React/toolchain della suite esistente e il controllo TypeScript generale non pulito già riportato. Nessuna nuova build estesa: spazio locale disponibile circa 497 MiB. Le prove in memoria non misurano le prestazioni online e non aggiungono richieste, polling o cron all’applicazione.

Log riproducibili: `/tmp/campo-simulazioni-suite-final-20261013.log`, `/tmp/campo-simulazioni-types-20261013.log`, `/tmp/campo-simulazioni-lint-20261013.log`. Le nuove suite permanenti sono `src/test/logic/campoSimulazioniCosti.test.ts` e `src/test/logic/campoSimulazioniOperative.test.ts`; le matrici server sono in `src/test/logic/campoRapportiniProtocollo.test.ts`.

Prima del rilascio servono ancora PostgreSQL di staging con due connessioni concorrenti, policy RLS reali e relativi ruoli, verifica Storage, telefoni reali per microfono/fotocamera e lettura AI su bolle di prova autorizzate. PGlite serializza le operazioni: riordinare o ritentare eventi non dimostra la sicurezza di due approvazioni simultanee. Le fixture eseguite come proprietario non dimostrano l’isolamento RLS; il controllo con ruoli reali resta separato, come indicato nelle [guide Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Le tre correzioni server restano bozze locali fuori da `supabase/migrations/`; il riepilogo materiali è corretto nel codice locale. Nessun commit, push, deploy o modifica operativa online. Le modifiche degli altri terminali rimangono conservate nel worktree condiviso.

## 21 Allineamento delle viste Campo con la commessa

Il dettaglio della commessa e il dettaglio lavoro sul telefono ora condividono il recupero dei dati operativi anche quando il diario non è aperto. Il diario usa la stessa sottoscrizione: header e diario della medesima azienda/commessa non aprono due canali o due timer. Il riallineamento rilegge i dati canonici; non registra ore, applica avanzamenti, genera costi o crea movimenti di magazzino.

### Difetti riscontrati e interventi locali

La lettura del catalogo remoto del 13 ottobre conferma che, fra le tabelle operative controllate, soltanto `order_events` è pubblicata in `supabase_realtime`: rapportini, timbrature, foto, acquisti, lavorazioni e righe manodopera non lo sono. Non è stata modificata la pubblicazione. Il precedente ascolto era nel diario, non nel dettaglio generale della commessa; inoltre un evento rapportino non aggiornava diversi riepiloghi economici, contatori e gallerie. Le [guide Supabase](https://supabase.com/docs/guides/realtime/postgres-changes) richiedono la pubblicazione delle tabelle per ricevere i relativi Postgres Changes.

- **Dettaglio commessa e lavoro:** eventi della commessa filtrati per azienda e ordine; recupero al ritorno in primo piano, al ripristino della rete e alla risottoscrizione. Gli eventi ravvicinati vengono accorpati e i refresh del controller non si sovrappongono.
- **Viste correlate:** riallineamento di rapportini, diario, lavorazioni e sottofasi, squadra, cronoprogramma, costi canonici, mezzi della commessa, foto, materiali, contatori e ordini d’acquisto collegati. Le viste chiuse vengono marcate da aggiornare, senza caricarle immediatamente.
- **Invio giornaliero:** un unico refresh mirato sostituisce le invalidazioni operative ripetute. I riepiloghi vengono riletti senza applicare la proposta prima dell’approvazione.
- **Bolle e acquisti:** registrazione, annullamento e verifica dell’ufficio aggiornano la relativa commessa e le code della sola azienda catturata prima dell’invio. Un cambio di azienda mentre la risposta è in corso non sposta il refresh sul nuovo contesto. Una risposta senza ricevuta valida non viene presentata come registrazione riuscita.
- **Foto:** caricamento ed eliminazione riallineano anche il diario della commessa, non solo la galleria locale.
- **Diario:** distingue giornaliero e rapporto cliente, mostra lo stato attuale e non presenta il rapporto firmato come nuove ore o nuovo avanzamento. Il rapporto del capo mostra le presenze di squadra senza sommarvi nuovamente le ore dell’autore. Le percentuali inviate sono dichiarazioni del rapporto, non una sostituzione dell’avanzamento attuale della commessa.

### Tempi di recupero e confini

Un evento verificabile attiva il controller dopo un accorpamento iniziale di 350 ms, con intervallo minimo di due secondi fra i suoi refresh. Se l’evento manca, il controllo periodico avvia una rilettura ogni due minuti soltanto quando la pagina è visibile e la rete è disponibile; il ritorno alla pagina o la riconnessione possono anticiparla. Tempi di risposta del server ed errori di rete possono allungare il recupero: non è una garanzia di sincronizzazione istantanea o di consegna degli eventi.

La chiusura della pagina rilascia timer, listener e canale quando si smonta l’ultimo utilizzatore. Non sono aggiunti ascolti inutili alle tabelle non pubblicate, cron o refresh indiscriminati delle liste di tutte le aziende. Il recupero periodico aggiunge letture delle sole viste operative attive della commessa: il relativo costo va misurato su staging prima del rilascio. Gli elenchi generali delle assegnazioni sul telefono mantengono il loro recupero esistente; non è stato introdotto un canale globale per tutte le commesse.

Per rendere immediata e affidabile la propagazione di **ogni** modifica, anche da canali server, resta da completare il ponte transazionale fra scrittura operativa ed evento della commessa. Oggi l’evento dell’invio manuale del rapportino è una scrittura separata dal rapportino: un suo fallimento non annulla il documento già ricevuto. Questo incremento ne recupera le viste, ma non rende atomici invio/evento/PDF e non sostituisce le bozze server delle sezioni precedenti.

### Collaudo

Sono stati aggiunti 71 test permanenti: chiavi di cache con posizioni diverse, esclusione di altre aziende e commesse, rilettura della vista attiva in una seconda cache simulata, raffica di cento eventi, evento durante un refresh, offline/background, ripristino della rete, riapertura, smontaggio, sottoscrizione condivisa, ricevuta dell’acquisto, cambio azienda durante la risposta e descrizione corretta dei rapporti nel diario.

Suite Campo/commessa: **2.373 test su 105 file**, tutti superati nell’ultima esecuzione, durata 30,47 secondi. TypeScript mirato su 17 file: zero errori. `OrderDetail.tsx` conserva dieci errori già presenti in `HEAD`, verificati con un confronto del compilatore in memoria: nessun nuovo errore introdotto dalle due righe di integrazione. Il controllo generale del progetto resta non pulito. ESLint mirato non segnala errori; rimane un avviso preesistente su `any` in `OrderDetail.tsx`. `git diff --check` passa.

Nel browser locale sono state aperte Panoramica, Cantiere e Diario della commessa DEMO-2026-N047. La commessa non aveva rapportini o foto: la verifica accerta l’apertura delle viste, non una trasmissione operativa fra telefoni reali. Non sono state salvate o approvate registrazioni di prova online. Nessuna build estesa per la scarsità di spazio disco locale.

Log: `/tmp/campo-allineamento-suite-final-20261013.log`, `/tmp/campo-allineamento-types-final-20261013.log`, `/tmp/campo-allineamento-order-types-baseline-20261013.log`, `/tmp/campo-allineamento-lint-final-20261013.log`. Nessuna migrazione applicata, modifica dati operativi online, commit, push o deploy. Le modifiche degli altri terminali sono preservate.

## 22 Ore e costi in Economia e pagamenti

La vista **Manodopera e subappalti** separa la manodopera interna dagli affidamenti esterni. Mostra ore e costo registrati, budget e scostamento; per ciascun dipendente distingue la tariffa attuale dal costo medio storico. Il registro comprende i rapportini approvati e le rettifiche manuali già salvate. Non somma nuovamente le dichiarazioni in attesa, non modifica lo storico e non esegue pagamenti.

### Calcolo del costo orario

Il controllo in sola lettura della funzione remota `costo_orario_dipendente` conferma che la tariffa manuale positiva prevale; in sua assenza il calcolo richiede lordo e ore mensili effettivamente compilati. L'INPS usa il 28% soltanto quando l'aliquota è assente. Il precedente helper client usava invece ore settimanali o 173 ore presunte e trattava INPS zero come 28%: alcune schermate potevano mostrare una tariffa diversa da quella applicata all'approvazione.

L'helper ora usa la stessa revisione monetaria dei rapportini: INPS zero rimane zero, le ore mancanti non vengono inventate e l'arrotondamento monetario segue `numeric` PostgreSQL. L'API delle ore contrattuali presunte resta disponibile per la pianificazione, separata dal costo. Se la tariffa non è determinabile, il contratto numerico storico restituisce zero; la nuova vista e la revisione dei rapportini distinguono questo caso con un avviso, senza presentarlo come manodopera gratuita.

Il costo storico è la somma dei valori salvati in `order_employees`, non ore totali moltiplicate per la tariffa odierna. Due fasi di uno stesso dipendente vengono raggruppate senza duplicare la persona. Una tariffa media arrotondata è informativa: non viene moltiplicata nuovamente per ricostruire i centesimi del costo. Ore positive già registrate a costo zero richiedono verifica anche dopo aver completato l'anagrafica.

### Separazione dei subappalti e dei dati mancanti

Gli affidamenti leggono `order_external_teams`: budget e costo memorizzati sono mostrati IVA inclusa, mentre il netto è calcolato come nel conto economico esistente. La manodopera interna non riceve questa conversione IVA. Un'aliquota esterna assente mantiene il fallback storico del 22%, segnalato nella vista; uno zero esplicito rimane zero. Le ore dichiarate dal subappaltatore non ricevono la tariffa dei dipendenti. Eventuali vecchie squadre interne registrate fra le ditte vengono segnalate, non riclassificate o duplicate automaticamente.

Budget assenti, valori negativi o non numerici non diventano zero. Un budget incompleto non produce uno scostamento parziale. Un errore su una fonte blocca il riepilogo della vista anziché mostrare un totale favorevole ma incompleto. I collegamenti portano ai rapportini, alle lavorazioni per il budget e alla manodopera per le tariffe.

### Accesso e aggiornamento

La vista è consultabile solo con il permesso costi. I dati per la tariffa corrente vengono richiesti solo con anche il permesso dipendenti; senza quest'ultimo la tariffa attuale è riservata. Le due query filtrano commessa e azienda sul server, oltre all'azienda delle anagrafiche collegate; usano cache dedicate, distinte dalle selezioni operative e dai soli totali economici. Un cambio azienda o permesso non riusa una forma di cache più permissiva. Le policy RLS restano applicate dal server, come previsto dalle [guide Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

La vista monta due letture relazionali e non aggiunge timer propri. Gli eventi e il recupero della commessa descritti nella sezione 21 aggiornano anche queste query; le modifiche alle lavorazioni ne invalidano i dati. **Aggiorna costi** rilegge le due fonti senza scritture contabili. Non è stato misurato un benchmark di latenza del database in produzione.

### Collaudo e lavoro successivo

Sono aggiunte 69 prove: 57 su modello, interfaccia e query della nuova vista, sette confronti dell'helper con la funzione SQL in memoria e cinque controlli di navigazione e invalidazione. La suite ampliata Campo/commessa/costi supera **2.546 test in 117 file**. Il sottoinsieme mirato supera 267 test in sei file. TypeScript mirato su 11 file non segnala errori; il controllo globale non è dichiarato pulito. ESLint mirato e `git diff --check` passano.

La verifica in sola lettura della commessa DEMO-2026-N047 mostra la ditta e il suo budget; non risultano righe interne in quella commessa. Il dettaglio per dipendente è verificato con fixture e simulazioni SQL, non con nuove registrazioni online. A 390 × 844 la sezione economica non presenta debordamenti orizzontali e mantiene leggibili costi e navigazione; il viewport è stato ripristinato. Il browser non registra errori nell'ultimo controllo. La build estesa resta esclusa per lo spazio disco insufficiente.

Restano tre sviluppi distinti: una base persistita per ore e tariffa del preventivato; maggiorazioni degli straordinari e regole di viaggio/trasferta con tariffa storicizzata; protezione server delle rettifiche dirette del registro quando esistono snapshot di rapportini approvati. Il motore attuale usa la tariffa base anche per gli straordinari, mentre rimborsi km e stime mezzi restano voci separate del conto economico. Queste variabili non vengono inventate nel nuovo riepilogo. Resta inoltre il ponte transazionale degli eventi descritto nella sezione 21.

Log: `/tmp/campo-economia-suite-20261013.log`, `/tmp/campo-economia-types-20261013.log`. Modifiche locali; nessuna migrazione applicata, modifica di costi o rapportini online, commit, push o deploy.
