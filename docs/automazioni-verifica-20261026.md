# Automazioni: verifica funzionale e integrazione dei campi personalizzati

26 ottobre 2026. Base locale `main` a `f910dbca2`, con le modifiche locali dei campi conservate. Verifica in sola lettura: nessun flusso creato, salvato, pubblicato, iscritto o eseguito realmente; nessun invio, deploy o modifica DB in questo turno.

## Esito

Non è corretto dichiarare l'integrazione completa. I filtri di ingresso leggono i campi custom per ID, ma nodi condizionali, azioni di aggiornamento e risoluzione delle variabili non condividono ancora lo stesso contratto. Le correzioni agli alias del turno precedente non sono ancora nel servizio pubblicato.

## Problemi riscontrati, per priorità

### 1. P1 — Autorizzazione del trigger manuale troppo ampia

`process-automation/index.ts:104`: la richiesta autenticata `action=trigger` verifica l'accesso all'azienda con `requireCompanyAccess`, senza controllare il permesso del modulo automazioni o la modalità sola lettura. Il motore esegue poi con service role. Il medesimo percorso è presente nel codice distribuito (versione 497).

L'appartenenza all'azienda non equivale all'autorizzazione ad avviare flussi pubblicati. Prima di ampliare l'uso servono controlli server su permesso, sola lettura, record/evento consentito e provenienza del payload. Riscontro da codice: non è stata effettuata una richiesta reale contraffatta né un test con effetti su utenti o clienti.

### 2. P1 — Variabili custom perse silenziosamente in alcune azioni

`process-automation/index.ts:1656` e `:1869`: `Aggiorna campo` passa il valore a `rv()`, che cerca nel payload piatto e sostituisce con stringa vuota le variabili non trovate. Non usa il resolver custom che invece viene usato nei percorsi email e in altri messaggi.

Prova isolata eseguendo la funzione reale estratta dal sorgente, con DB simulato e rete vietata:

- configurazione: `notes = "Valore: {{contact.custom_11111111111141118111111111111111}}"`;
- il valore custom nel contesto era `Ristrutturazione`;
- scrittura osservata: `notes = "Valore: "`, con risultato `success: true`.

Il picker generico propone ora ID stabili, ma questo non rende automaticamente compatibili tutti i consumatori. Occorre un resolver unico, contestuale all'oggetto, che fallisca esplicitamente sui valori richiesti non risolvibili. Verificare anche titoli/note dei task e le altre azioni che usano direttamente `rv()`.

### 3. P2 — “Aggiorna campo” non scrive i custom field

`src/lib/flow-node-catalog.ts:1837` espone un nome di colonna DB libero; `process-automation/index.ts:1846` aggiorna una delle sei tabelle native. Non interpreta destinazioni `cf:<UUID>` e non scrive negli archivi dei valori custom.

La prova isolata osserva il tentativo di aggiornare una colonna letterale `cf:...` su `marketing_contacts`: il mock permissivo lo accetta, ma non rappresenta un salvataggio custom riuscito su PostgreSQL. Serve un selettore di campi ammessi, con percorso distinto per standard/custom, validazione del tipo e conferma delle righe salvate. Non ampliare semplicemente l'elenco delle tabelle o permettere colonne arbitrarie, soprattutto su ordini e fatture.

### 4. P2 — I nodi “Se/Altrimenti” non supportano i custom

`ConditionConfigPanel.tsx:8` offre un elenco fisso di campi standard. `process-automation/index.ts:1273` interpreta il prefisso del campo come tipo di record.

Prova isolata della funzione reale: una condizione `custom_field.<UUID>` genera `Tipo di record non supportato: custom_field`. I filtri d'ingresso del trigger e le condizioni nel mezzo del flusso hanno dunque capacità diverse. La soluzione deve leggere la definizione per ID e il record corretto, anche dopo un'attesa, senza recuperare un altro record solo perché collegato allo stesso contatto.

### 5. P2 — Categorie e tipi dei filtri non coerenti

- `FlowBuilderConfigPanel.tsx:132`: gli eventi Magazzino sono associati a `order`.
- `FlowBuilderConfigPanel.tsx:136`: gli eventi HR sono associati a `contact`.
- `TriggerConditionBuilder.tsx:35`: `currency`, `percent` e multiselezioni ricadono nel tipo testo; non vengono proposti tutti gli editor/operatori appropriati.

In queste categorie il selettore può leggere le definizioni dell'oggetto sbagliato o offrire operatori inadeguati. Occorre un registro condiviso evento → entità effettiva → definizioni → tipo di valore. Non basta la macro-categoria commerciale.

### 6. P2 — Variazione di un custom non equivale a un evento di automazione

Verifica del DB condiviso: sulle tre tabelle valori risultano i trigger di validazione; sui valori contatto è presente anche il ricalcolo delle liste automatiche. Non risulta un emettitore diretto di eventi del flusso per la variazione di un valore custom.

Il ricalcolo delle liste non è un contratto generale “quando cambia questo campo”: eventuali eventi indiretti di appartenenza a liste sono un altro caso. Per il supporto completo servono confronto vecchio/nuovo, niente evento sui no-op, identificazione del campo per ID, deduplicazione e protezione dai cicli di aggiornamento.

### 7. Rilascio — Alias disponibili in locale ma non nel servizio online

Letto il pacchetto pubblicato di `process-automation`, versione 497: i file condivisi `automationContext.ts` e `contactCustomFields.ts` non contengono `key_aliases`. Questo conferma, non smentisce, il limite di rilascio descritto nel resoconto dei campi.

La rinomina che cambia chiave deve restare bloccata fino al rilascio coordinato di tutti i sender/resolver interessati. Il database aggiornato da solo non aggiorna il codice già distribuito delle funzioni.

### 8. Collaudo — Anteprima parziale e suite UI da ripristinare

L'anteprima attuale è intenzionalmente senza effetti e dichiara che non prova consegna o azioni esterne. `TestFlowDialog.tsx:80` non risolve i custom e non certifica i trigger operativi usando un semplice contatto. È un limite dichiarato, non un'esecuzione riuscita.

Suite automazioni eseguita: **24 file, 640 test: 619 superati, 21 falliti**. I 21 fallimenti sono tutti in `src/test/ui/automazioniAiPagina.test.tsx`: `apri()` alla riga 86 non fornisce il Router richiesto da un `Link` del componente figlio; errore `Cannot destructure property 'basename' ... as it is null`. Test e pagina non hanno differenze locali rispetto a HEAD. Questo non dimostra 21 difetti applicativi diversi, ma impedisce di dichiarare verde la suite. Ripristinare il wrapper e rieseguire anche le asserzioni oggi non raggiunte, senza assumere che passino tutte.

## Verifica reale di Demo Azienda 2

- Browser autenticato: elenco flussi, apertura di una bozza esistente e dialogo “Verifica il flusso”. Nessun pulsante Salva/Pubblica premuto.
- Due flussi in bozza, nessun flusso pubblicato.
- Cinque vecchie righe di coda completate; nessuna in corso.
- Zero log nelle ultime 24 ore, zero eventi pendenti, zero errori definitivi aperti.
- Zero definizioni custom attive in questa azienda: le prove custom qui descritte sono sintetiche/isolate, non round-trip su dati reali della demo.
- Il job di elaborazione coda è attivo; la sola configurazione del cron non dimostra la consegna delle azioni.
- Pagina “Cosa fa Silvio da solo” caricata correttamente nel browser reale: i tre interruttori automatici visibili sono spenti, le azioni preventivo/fattura sono su “Solo proposta”, solleciti e follow-up chiedono conferma e le due azioni ad alto rischio richiedono conferma forte. Nessuna selezione modificata.

Le politiche delle azioni di Silvio non sono l'interruttore generale dei flussi di lavoro pubblicati: i due sistemi hanno esecutori e controlli distinti. La verifica non copre un'esecuzione completa di ogni bot WhatsApp, automazione SMS o regola finanziaria: non attribuire loro automaticamente gli esiti del motore dei flussi.

## Ordine consigliato per la correzione

1. Chiudere il varco di autorizzazione dei trigger manuali e aggiungere test per permesso assente/sola lettura, senza effetti esterni.
2. Unificare identificazione del record e risoluzione delle variabili; niente sparizione silenziosa di valori richiesti.
3. Integrare custom nelle condizioni e nelle destinazioni dell'azione di aggiornamento, mantenendo tipi, permessi e separazione aziendale.
4. Correggere mappa categorie e tipi; introdurre l'evento di variazione custom con anti-loop e deduplica.
5. Migliorare l'anteprima con scenari per oggetto e custom sintetici; ripristinare i test UI.
6. Solo dopo il collaudo, coordinare il deploy dei servizi condivisi e della UI; eventuale prova reale limitata a bozze e dati fittizi autorizzati. Non attivare flussi che scrivono ai clienti per verificare il risultato.

Graphify è stato tentato per l'orientamento ma manca un grafo generale del repository: nessuna conclusione è basata su relazioni inventate o su grafi parziali di altre funzioni. La guida Supabase è stata usata per verificare la distinzione fra autenticazione, accesso tenant e autorizzazione delle operazioni server.
