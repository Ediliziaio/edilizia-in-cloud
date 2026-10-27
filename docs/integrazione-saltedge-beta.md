# Salt Edge AIS: piano operativo e collaudo beta

## Ambito e stato

### Aggiornamento portale e preparazione rilascio

Application e Profile sono stati salvati e verificati dopo ricaricamento. Applicazione `Edilizia in Cloud - Beta`, Business services, Data Aggregation, fascia 0-500 utenti (pilot iniziale una sola azienda). Richiesta Test inviata dopo autorizzazione del titolare e verifica reCAPTCHA: il portale conferma l'invio e la risposta via email. L'account resta Pending fino all'approvazione. Richiesti anche conferma Partner Program e preventivo per 50/100/500 aziende con tre conti ciascuna; nessuna offerta accettata.

Il rilascio del codice su main non autorizza a trasferire chiavi o dati beta in produzione. Le credenziali e l'allowlist restano esclusivamente sul backend beta. In assenza di configurazione esplicita il nuovo connettore nega il collegamento. Prima di banche reali restano approvazione Test, conferma del modello Partner e origine HTTPS beta valida. Le sezioni successive conservano il registro cronologico del collaudo precedente.

La modifica collega il widget Salt Edge V6 alle pagine reali Integrazioni e Tesoreria, alle tabelle bancarie esistenti e alla Prima Nota. Non introduce pagamenti. Il connettore e le migrazioni sono stati applicati soltanto al progetto beta isolato `lfwndyoxxgomdcbdlytm`; nessun rilascio o migrazione in produzione e nessun push su main. E' attiva una sola connessione Fake Bank, non una banca reale.

Il portale inizialmente esaminato era in Pending, con applicazione denominata Domus Group Srl e callback non compilati. Durante il collaudo e' stata creata e autorizzata una Service key e configurati i callback beta. L'account resta Pending; nessuna richiesta Test/Live, contratto commerciale o servizio a pagamento Salt Edge attivato. Il test usa l'API Client con Customer identifier. Prima delle banche reali vanno confermati soggetto contraente e modello Client/Partner; per la lettura sotto licenza Salt Edge occorre concordare il Partner Programme.

## Esito Del Collaudo Fake Bank

- Percorso reale completato: login nell'app beta, Integrazioni > Conti bancari, consenso in sola lettura, Fake Bank OAuth, Grant access simulato, ritorno all'app, importazione e visualizzazione in Tesoreria.
- Solo **Demo Azienda** nel database beta, UUID `8f04f04a-4e25-47ba-bf55-e2b14eb0a24f`; Demo Azienda 2 esclusa. Nessun dato aziendale reale importato nella beta.
- Importati quattro conti e nove movimenti. Ripetute le sincronizzazioni: quattro conti e nove ID movimento unici, nessun duplicato.
- Confronto indipendente con le API Salt Edge riuscito per tutti i quattro saldi e tutti i nove importi originali, valute e date. Saldi: EUR 1999.10, USD 2016.27 e -2016.27, BTC 0.02016270. Nessuna conversione FX applicata.
- Verifica con token dell'utente beta: richiesta per altra azienda negata con 403 e conti estranei non visibili. Endpoint anonimo e callback senza firma rifiutati. Nei log del collaudo risultano quattro callback notify con risposta 200; non dichiarare verificati separatamente tutti gli altri tipi di callback reali.
- Corretto il bug preesistente delle valute visualizzate sempre come EUR e dei totali che mescolavano EUR/USD/BTC. Conti e riepiloghi separati per valuta; in presenza di piu' valute i grafici aggregati in euro non vengono mostrati come se esistesse un cambio. La vista delle aziende soltanto EUR e' mantenuta.
- Migrazione `20261027163625_saltedge_currency_precision.sql` applicata solo alla beta: saldi dei conti numeric(28,8). Per le transazioni la colonna contabile amount resta quella preesistente; il valore originale completo e' gia' conservato in metadata.amount e viene usato nelle viste Tesoreria ed esportazioni. Prima di Live occorre verificare i consumatori contabili esterni alla Tesoreria e gli scenari di riconciliazione/report in valute diverse, non coperti da questo collaudo.
- Corretto anche il ritorno alla Tesoreria quando il widget e' avviato dalla relativa scheda; verifica automatizzata dedicata. Il percorso browser di questo test e' partito da Integrazioni ed e' tornato li', con successiva navigazione alla Tesoreria reale.
- Test finali: 34 connettore/database/valute, 12 interfaccia e 374 controlli esistenti delle funzioni superati. Compilazione mirata Tesoreria e verifica tipi Deno superate. Non e' una certificazione della build completa, del mobile o di tutte le funzioni contabili.
- Tunnel HTTPS temporaneo autorizzato, utilizzato per il consenso e chiuso a fine prova. Origine beta ripristinata a `http://127.0.0.1:8082`. I dati restano visibili e sincronizzabili in locale; per un nuovo consenso o rinnovo serve riattivare un'origine HTTPS. La finestra di collegamento lo indica e non permette di avviare una richiesta destinata a fallire.
- Resta avviata l'app locale su porta 8082. Il progetto Supabase beta resta attivo e soggetto ai costi gia' autorizzati. Per sospenderlo occorre un'azione separata del titolare; nessuna sospensione automatica e' stata programmata.
- Controllo finale produzione in sola lettura: 8 vecchie connessioni, 16 conti, 1706 movimenti, zero connessioni Salt Edge; gli stessi conteggi del controllo iniziale. Nessuna cancellazione, migrazione, revoca o deploy su produzione.
- Prove visive in `output/saltedge-beta/`: `conti-fake-bank.png`, `movimenti-fake-bank.png`, `overview-fake-bank.png`, `beta-locale-collaudata.png`.

Riferimenti ufficiali:
- https://docs.saltedge.com/v6/ (autenticazione, firma, widget, callback, stati)
- https://docs.saltedge.com/v6/api_reference/ (AIS V6)

## 1. Connettore locale

### Avanzamento staging del 27 ottobre 2026

Aggiornamento successivo al rinnovo del login:

- Service key `Edilizia in Cloud beta` creata e attiva. App-id e Secret acquisiti dal portale e conservati soltanto nella directory privata locale e nei segreti del backend beta. Autenticazione e firma RSA verificate con una richiesta reale riuscita a Salt Edge.
- Cinque callback AIS salvati nel portale e verificati dopo riapertura: success, fail, destroy, notify, consent, tutti verso `lfwndyoxxgomdcbdlytm`.
- Allineati gli schemi `public` e `private` mediante dump della sola struttura attuale, senza record di produzione. I riferimenti al progetto di produzione contenuti nella struttura sono stati sostituiti con il riferimento beta. Il ripristino e' stato suddiviso con il parser PostgreSQL in gruppi ridotti per rispettare `max_locks_per_transaction` della Micro. Conservati i dati iniziali gia' generati nella beta: 37 tabelle, 760 righe di seed; colonne generate ricalcolate dal database. Backup privato conservato fuori da Git.
- Tutti i 21 cron preesistenti della beta sono stati messi in pausa con `cron.alter_job`. Nessun cron di produzione modificato.
- Azienda pilota beta `8f04f04a-4e25-47ba-bf55-e2b14eb0a24f`, rinominata **Demo Azienda** su richiesta del titolare. Non e' Demo Azienda 2 e non e' un collegamento al database di produzione. Allowlist Salt Edge contiene soltanto questo UUID.
- Utente tecnico dedicato al solo collaudo, ruolo company_admin sulla sola azienda pilota. Login reale nell'app riuscito; permessi Tesoreria e Modifica Integrazioni verificati. Nessun account reale copiato dalla produzione.
- Istanza frontend separata `http://127.0.0.1:8082`, avviata con URL e chiave pubblicabile del progetto beta. Porta 8080 invariata.
- Due problemi emersi nel collaudo reale e corretti: serializzazione della chiave PEM nel caricamento dei segreti (ora PEM multilinea, non doppiamente escapato); provider fake iniziale `fake_oauth_client_xf`, che richiede Provider keys, sostituito con `fakebank_oauth_xf`. Il server segnala esplicitamente una chiave non valida e i rifiuti HTML del provider, senza riportare dati sensibili.
- Richiesta reale di creazione widget con provider standard e ritorno HTTPS: riuscita. Non e' ancora stata completata alcuna connessione bancaria e nessun saldo/movimento e' stato importato.
- Il ritorno HTTP verso `127.0.0.1` e' stato rifiutato con HTTP 403 HTML; la stessa richiesta con ritorno HTTPS e' arrivata correttamente alle API. Per completare il percorso browser e' stata chiesta autorizzazione a un tunnel HTTPS temporaneo della sola porta beta 8082; conferma esplicita ancora attesa. Non e' stato aperto alcun tunnel.
- Verifica successiva alla richiesta sul nome azienda: pilota **Demo Azienda**, nessuna **Demo Azienda 2** presente nel database beta; cron attivi zero. Le due aziende eventualmente esistenti in produzione non sono state cambiate. Saldi e movimenti beta ancora assenti: non dichiarare concluso il test.
- Ultimo controllo: 30 test connettore/database, 10 test interfaccia e 374 controlli delle funzioni superati; verifica tipi Deno dei due endpoint superata. Restano avvisi Vite preesistenti sulle opzioni di compilazione deprecate, non una build completa certificata.

Le voci sotto documentano la prima predisposizione, precedente all'allineamento appena descritto.

- Creazione dell'ambiente dedicato autorizzata dal titolare dopo comunicazione dei costi Supabase.
- Branch `saltedge-beta`, progetto `lfwndyoxxgomdcbdlytm`, senza dati di produzione.
- Pubblicati esclusivamente sul branch `bank-saltedge` e `bank-saltedge-webhook`.
- Il branch iniziale non conteneva le tabelle bancarie. Bootstrap delle tre tabelle contabili con indici e policy dai file storici `5ae18bc0` parti 3-14, 23-25 e 30-37; aggiunta `expires_at`, default Salt Edge/created e migrazione Salt Edge attuale. Eseguito direttamente sullo staging, non registrato come nuova migrazione di produzione. Il resto dello schema applicativo del branch non e' ancora certificato allineato al main corrente: in particolare va completata la verifica dei permessi e delle RPC Tesoreria prima del collaudo completo nell'app.
- Verificato: sei tabelle bancarie con RLS attiva, tre tabelle private non leggibili da authenticated, zero connessioni/conti/movimenti nello staging.
- Advisor eseguito: tabelle private senza policy intenzionalmente non accessibili dal browser; presenti anche avvisi su funzioni preesistenti dello schema base da esaminare prima di dichiarare pronto l'intero ambiente.
- Segreti non sensibili configurati: `SALTEDGE_MODE=pending`, origine frontend prevista `http://127.0.0.1:8082`, callback base `https://lfwndyoxxgomdcbdlytm.supabase.co/functions/v1/bank-saltedge-webhook`. La porta 8080 e il relativo backend non sono stati modificati.
- Smoke remoto: endpoint utente senza token restituisce 401; callback senza firma restituisce 401. Nessuna chiamata finanziaria o connessione Fake Bank ancora eseguita.
- Coppia RSA generata in `~/.config/ediliziaincloud/saltedge-beta/`, privata PKCS8 con permessi 0600. Nessun segreto nel repository. File `credentials.env` predisposto per App-id e Secret.
- Modulo Service key compilato e invio tentato dopo conferma del titolare. Il portale ha mostrato un errore JavaScript durante l'invio; tornando all'elenco ha richiesto un nuovo login. La creazione della chiave NON e' confermata e non va ripetuta senza verificare prima l'elenco.
- Blocco attuale: rinnovo login Salt Edge da parte del titolare, poi verifica/creazione Service key, impostazione dei segreti e dei callback, account/azienda pilota staging e allineamento delle dipendenze applicative prima della prova Fake Bank fino alla Tesoreria.
- Produzione consultata solo in lettura: 8 connessioni precedenti (nessuna linked), 16 conti e 1.706 movimenti. Nessuna cancellazione, revoca o modifica di quei dati. Le vecchie funzioni e il cron di produzione non sono stati rimossi in questo passaggio.

- `bank-saltedge`: richiede token utente valido, profilo attivo, azienda accessibile, permesso Tesoreria. Creazione, rinnovo e revoca richiedono anche Modifica Integrazioni.
- `bank-saltedge-webhook`: firma RSA V6 verificata sul corpo originale e sull'URL canonico, versione e orario verificati. Chiave pubblica V6 dal riferimento ufficiale, non dal chiamante.
- Un Customer Salt Edge per utente; ogni connessione/sessione e' associata esplicitamente a un'azienda. Lo stesso accesso bancario non viene spostato fra aziende. La modellazione legale del rappresentante multi-azienda va confermata con Salt Edge.
- Sessioni con nonce hashato, scadenza e associazione a utente/azienda/customer. Il ritorno nel browser da solo non dimostra il consenso.
- Lease contro operazioni concorrenti. Paginazione completa e identificativi mantenuti come stringhe, anche oltre il limite numerico JavaScript.
- Import dei soli movimenti contabilizzati non duplicati. ID distinti con importi uguali rimangono distinti. Note, categorie manuali e abbinamenti non vengono riscritti.
- Il saldo viene salvato dopo i movimenti del conto. Un errore non aggiorna la data di sincronizzazione riuscita.
- Scadenza dal consenso del provider: nessuna durata di 90 giorni inventata.

## 2. Configurazione richiesta prima di abilitare la beta

Solo nei segreti del backend, mai in variabili VITE, repository, URL o chat:

| Variabile | Valore |
|---|---|
| SALTEDGE_APP_ID | Service API App-id dell'applicazione beta |
| SALTEDGE_SECRET | Secret associato |
| SALTEDGE_PRIVATE_KEY | Chiave RSA PKCS8 PEM; caricare la sola pubblica nel portale |
| SALTEDGE_ACCESS_TYPE | `client` oppure `partner`, confermato con Salt Edge |
| SALTEDGE_MODE | `pending` inizialmente; `test` solo dopo l'approvazione |
| SALTEDGE_BETA_COMPANY_IDS | UUID delle sole aziende pilota, separati da virgola |
| SALTEDGE_APP_ORIGIN | Origine app/staging senza slash finale; localhost consentito |
| SALTEDGE_WEBHOOK_BASE_URL | URL HTTPS canonico della funzione bank-saltedge-webhook |

La creazione di nuove credenziali richiede conferma del titolare. Per banche reali l'autenticazione e il consenso sono eseguiti personalmente dall'utente, non dall'assistente.

Nel portale configurare Home/Application URL e i domini di ritorno corretti. Sono ammessi i percorsi `/azienda/impostazioni/integrazioni` e `/azienda/tesoreria`.

Callback AIS, senza redirect intermedi:
- Success URL: `<SALTEDGE_WEBHOOK_BASE_URL>/success`
- Fail URL: `<SALTEDGE_WEBHOOK_BASE_URL>/fail`
- Notify URL: `<SALTEDGE_WEBHOOK_BASE_URL>/notify`
- Destroy URL: `<SALTEDGE_WEBHOOK_BASE_URL>/destroy`
- Consent changes URL: `<SALTEDGE_WEBHOOK_BASE_URL>/consent`

Usare un backend di staging isolato e HTTPS raggiungibile per le notifiche; localhost non e' raggiungibile da Salt Edge. Il frontend locale non va puntato casualmente a produzione per collaudare la migrazione.

## 3. Database e rilascio coordinato

Migrazione aggiuntiva: `20261027124745_saltedge_beta_connector.sql`. Aggiunge campi connessione, tabelle private per Customer/sessioni/lease e due funzioni `security invoker`, eseguibili soltanto da service_role. Nessuna cancellazione o aggiornamento massivo dello storico.

`20261027131446_retire_enable_banking_connector.sql` disattiva soltanto il job `bank-eb-nightly-sync`, se presente. Le due funzioni del vecchio provider sono state rimosse dal codice e dalla configurazione locale; cancellare un file non elimina la funzione eventualmente gia' pubblicata. Al rilascio occorre rimuovere esplicitamente dal backend le funzioni `bank-eb` e `bank-eb-cron` e i relativi segreti dopo la disattivazione del job. Nessuna di queste operazioni remote e' stata eseguita.

Prima del rilascio confrontare il registro migrazioni: il repository contiene anche migrazioni con timestamp successivi. Non applicare ciecamente tutte le migrazioni pendenti. Il ritiro del job deve avvenire dopo le vecchie migrazioni che lo creano: in una ricostruzione completa eseguire nuovamente il blocco idempotente di ritiro a fine ripristino e verificare che il job non esista. Eseguire il controllo degli advisor sullo staging e applicare solo dopo revisione del registro.

Ordine: backup staging, migrazione, funzioni, segreti, callback nel portale, test su Fake Bank, frontend, collaudo Test. Non distribuire il solo frontend: senza backend configurato il pulsante continua resta disabilitato con errore esplicito e Riprova.

## 4. Collaudo riproducibile senza chiavi esterne

```sh
npx vitest run --config vitest.saltedge.config.ts
npx vitest run src/test/ui/saltedgeBankConnections.test.tsx
npx vitest run src/test/logic/funzioniSenzaJwtConControllo.test.ts src/test/logic/funzioniChiamateSenzaJwt.test.ts
npx deno check --no-config supabase/functions/bank-saltedge/index.ts supabase/functions/bank-saltedge-webhook/index.ts
```

Questi test eseguono gestori e importatore reali, firma RSA e database Postgres locale PGlite; API Salt Edge e identita' sono simulate. Non sono una chiamata reale al servizio, una prova PSD2 o una certificazione del provider. I test UI montano il componente e il ritorno effettivamente usati nell'app.

### Riscontro locale del 27 ottobre 2026

- Connettore, persistenza e ritiro del cron: 28 test superati, compresa l'esecuzione ripetuta della pulizia senza perdita di dati.
- Interfaccia e ritorno dalla banca: 10 test superati, incluso backend non raggiungibile con messaggio italiano e continuazione disabilitata.
- Controlli esistenti delle funzioni senza JWT automatico: 374 test superati dopo la rimozione del vecchio cron dal censimento. Non sostituiscono una revisione completa della sicurezza.
- Verifica tipi Deno dei due nuovi endpoint: superata.
- Compilazione mirata di Tesoreria, scheda connessioni e hook di ritorno: superata. Non e' stata certificata la build completa del progetto.
- Browser locale: Overview, Conti e Connessioni caricati; dialogo Salt Edge verificato e blocco di configurazione confermato. Nessun collegamento reale avviato. La verifica responsive completa e il consenso sul servizio restano nel collaudo staging.
- Nessuna migrazione remota, pubblicazione, attivazione a pagamento o cancellazione dello storico eseguita.

## 5. Beta nel servizio Salt Edge

1. Pending: configurare chiavi/callback sullo staging, una sola azienda pilota e collegare Fake OAuth Client. Nessun conto reale. Verificare ritorno, saldi, movimenti, secondo import senza duplicati, rinnovo e revoca mantenendo lo storico.
2. Ripetere da mobile e desktop; tornare direttamente a Tesoreria senza aprire la scheda Connessioni. Il consenso deve completarsi anche in questo caso.
3. Simulare callback duplicate, firma falsa, sessione scaduta, annullamento, database non disponibile e rinnovo richiesto da altro utente. Nessun falso messaggio di successo.
4. Completare dati azienda/app e chiedere Test dopo conferma del titolare. Il portale indicava fino a 100 connessioni e 90 giorni: riconfermare le condizioni applicabili all'account e al Partner Programme.
5. Solo dopo approvazione, impostare `test`, limitare l'elenco aziende e far collegare al titolare un conto aziendale italiano. Confrontare saldo e movimenti con estratto conto, comprese date, segni e riconciliazioni.
6. Una seconda azienda e un secondo utente verificano che collegamenti e dati non siano intercambiabili. Il numero di Customer, connessioni e conti va confrontato con le unita' del preventivo commerciale.

Non dichiarare completata la beta reale finche' i punti precedenti non hanno riscontri dal servizio e dalla banca.

## 6. Limiti deliberati e criteri prima della produzione

- La modalita' Live e' rifiutata da questo connettore beta.
- Nessun aggiornamento automatico a pagamento viene abilitato: `automatic_refresh=false`, nessun nuovo cron, nessuna categorizzazione Salt Edge a pagamento. Sincronizza legge i dati gia' disponibili; Aggiorna banca apre il widget per una nuova acquisizione esplicita.
- Salt Edge e' l'unico connettore attivo nel codice. Rimossi gestori, cron, callback frontend e istruzioni amministrative Enable Banking. Le migrazioni storiche restano immutate per non alterare database gia' installati; nessun conto manuale, movimento o riconciliazione viene cancellato.
- Un IBAN gia' attivo sul precedente collegamento blocca l'importazione, anche con spazi o maiuscole diverse: non sommare due volte lo stesso saldo. La migrazione storica fra fornitori richiede confronto assistito dei movimenti; non associare automaticamente transazioni di provider diversi per solo importo e data.
- La revoca non elimina movimenti o riconciliazioni. Non e' stata eseguita nessuna revoca reale nel collaudo locale.
- Il webhook gestisce le notifiche direttamente con operazioni idempotenti. Prima della scala produttiva servono coda durevole, retry con backoff, monitoraggio dei callback e recupero degli eventi persi; non contare soltanto sui tentativi del fornitore.
- Prima di Live: offerta commerciale, accordi applicabili, copertura dei conti business, revisione tecnica Salt Edge, policy privacy/consensi, monitoraggio dei costi e allarmi operativi, collaudo completo della build del ramo aggiornato.

Ripristino: disabilitare l'allowlist beta e tornare al frontend precedente, senza cancellare tabelle o dati. La chiusura delle connessioni remote e la cancellazione dei dati si gestiscono separatamente, su richiesta e con conferma, non tramite un rollback distruttivo.
