# Automazioni: correzioni implementate e stato di attivazione

26 ottobre 2026. Aggiorna `automazioni-verifica-20261026.md`, che resta la fotografia dei problemi precedenti. Base Git `f910dbca2`; conservate le modifiche presenti, comprese quelle concorrenti del cruscotto, non appartenenti a questo intervento.

## Implementato nel codice locale

- **Avvio manuale protetto:** dopo autenticazione e controllo azienda, verifica del permesso automazioni, utente non bloccato e modalità non sola lettura. Flusso pubblicato specifico e contatto sono riletti con la RLS dell'utente. Il payload del browser viene sostituito con dati del record, senza accettare alias di eventi o flag speciali. Gli eventi operativi non sono simulabili iscrivendo un contatto a mano. L'iscrizione non dichiara successo se non è stato creato alcun enrollment.
- **Condizioni custom:** selezione dell'oggetto, campo identificato per UUID ed editor coerente con numero, percentuale, data, booleano e opzioni. I valori vengono letti dal record pertinente al momento della condizione, non dalla vecchia fotografia del trigger. Un campo archiviato, non disponibile o associato a un record assente produce un errore esplicito.
- **Aggiornamenti standard/custom distinti:** lista di colonne native consentite e scelta delle definizioni attive. Stati, assegnazioni e importi protetti richiedono le azioni dedicate. Le fatture non in bozza non sono modificabili con l'azione generica. I custom sono supportati sugli oggetti già collegati all'archivio valori centrale; Ticket e Fattura mantengono qui soltanto i campi standard ammessi.
- **Configurazione coerente:** il cambio entità ripulisce campo e vecchi override in un'unica patch, senza perdere aggiornamenti React consecutivi. La scelta iniziale Contatto è anche un default salvato nel nodo. Etichette dei campi standard tradotte.
- **Variabili custom:** risoluzione corrente prima delle azioni che usano il resolver sincrono; caching limitato alla singola azione. Zero, false e caratteri di sostituzione letterali sono preservati. Un custom necessario ma privo di valore ferma il passo, non diventa stringa vuota con esito riuscito. I sender che hanno già il proprio resolver, soprattutto l'email con escaping HTML, restano nel loro percorso dedicato.
- **Filtri:** Magazzino non legge più le definizioni Ordine, HR non quelle Contatto; i movimenti e le richieste ferie non mostrano custom di un altro oggetto. Numeri monetari/percentuali e multiselezioni hanno i tipi corretti. Le opzioni di un custom multiplo non vengono confuse con i tag del CRM.
- **Catalogo condiviso:** caricamento delle definizioni paginato, per azienda/oggetto e annullabile. Le modifiche alle definizioni invalidano anche la cache delle automazioni. I tag CRM si leggono aprendo il selettore, senza effetto/setState sincrono e senza polling.
- **Test UI ripristinati:** aggiunto il Router mancante; corretta l'asserzione che assumeva un solo pulsante Riprova, pur essendoci più sezioni indipendenti.

Non sono stati riscritti o migrati automaticamente i flussi delle aziende. La ricognizione read-only degli aggiornamenti configurati non ha trovato nodi `aggiorna_campo`/`update_field` nei flussi non eliminati; questo non è una certificazione di tutti i template o sistemi di automazione esterni al builder.

## Evento di modifica e salvataggio atomico: SQL preparato, non installato

`docs/automazioni-campi-eventi-20261026.sql` è intenzionalmente **fuori** da `supabase/migrations/`. È stato creato inizialmente con la CLI e poi spostato in staging: un push non deve attivarlo accidentalmente prima del worker.

Contiene:

- evento `custom_field_updated` per gli archivi valori contatto, opportunità e generici;
- nessun evento sui no-op, compreso il solo cambio di formattazione numerica;
- deduplicazione nella stessa transazione con primo valore precedente e ultimo valore nuovo;
- funzione di salvataggio riservata al service role, che aggiorna valore ed evento nella stessa transazione, con validazione già presente e conferma dell'ID salvato;
- propagazione della catena dei flussi custom attraversati, blocco della reintroduzione dello stesso flusso e limite di profondità; non è una soluzione universale a tutti i possibili cicli fra eventi di natura diversa;
- funzione trigger privilegiata solo nello schema privato, con accesso diretto revocato; nessuna nuova funzione eseguibile da anon o authenticated;
- estensione esplicita degli identificatori ammessi per gli oggetti collegati e per i dieci moduli preventivo.

Nel catalogo locale è presente “Campo personalizzato modificato”, con oggetto e campo selezionabili. Il worker sa filtrare il campo specifico, l'oggetto e la catena già attraversata.

## Blocco del rilascio incoerente

La pubblicazione di un flusso con nuove destinazioni/variabili/condizioni custom o con il nuovo trigger richiede che il servizio remoto dichiari la capacità, a sua volta subordinata alla versione SQL. Con il server attuale resta preparabile la bozza, ma non viene pubblicata una configurazione che il vecchio worker ignorerebbe. Le automazioni senza queste caratteristiche non richiedono il nuovo SQL.

Per attivare realmente tutto:

1. Ripetere inventario e verifica dei permessi reali prima del rollout.
2. Applicare il SQL verificato come migrazione idempotente, con versione coerente con il registro del progetto e i timeout previsti.
3. Distribuire `process-automation` e tutti i sender che incorporano le modifiche ai resolver condivisi. Una sola funzione aggiornata non rende disponibili gli alias ovunque.
4. Rilasciare la UI e verificare la capacità riportata dall'endpoint. Mantenere il blocco prudenziale delle rinomine fino al completamento dei sender.
5. Eventuale collaudo online soltanto con dati fittizi e flussi esplicitamente autorizzati, senza clienti reali.

## Verifiche effettuate

- **970 test applicativi su 40 file superati**: automazioni, runtime, filtri, UI, contatti/form, catalogo e regressioni dei campi, compresa la protezione delle fatture emesse.
- **30 verifiche PostgreSQL nuove** su motore isolato: idempotenza dello SQL, scrittura/evento atomici e rollback, deduplica, catena ciclica, tenant errato, tipi non validi, zero/false, privilegi, opportunità e dieci moduli preventivo, documento consolidato.
- **32 verifiche PostgreSQL precedenti riconfermate**, per validazione e protezioni dei campi.
- Deno check del worker e degli script; lint mirato senza errori (restano avvisi `any`); `git diff --check`.
- Build di produzione finale riuscita. TypeScript superato rispetto alla baseline esistente: 655 errori già tollerati dal progetto, soglia 703, nessun nuovo errore sui file modificati e nessun aumento della baseline.
- Browser Demo Azienda 2: apertura del nuovo pannello con etichette aggiornate, senza premere Salva o Pubblica. Tornati all'elenco; verifica DB finale: zero nodi salvati nella bozza, stato `draft`, RPC atomica nuova non installata.
- Prova visiva: `output/automazioni-20261026/pannello-campi.jpg`.

## Confini della consegna

In questo intervento **nessun deploy, push, invio, attivazione di flussi o modifica al database condiviso**. Le due migrazioni dei campi applicate nel turno precedente restano applicate: non vanno confuse con il nuovo SQL qui ancora in staging.

Non è stato eseguito un invio email/SMS/WhatsApp reale, né un collaudo browser di tutti i ruoli di tutte le aziende. Le politiche delle azioni di Silvio, i bot WhatsApp e le regole finanziarie restano sistemi distinti: non sono dichiarati integralmente collaudati da questi test del builder.
