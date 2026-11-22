# Coda degli allegati email — rilascio del 22 novembre 2026

Le aziende senza carta o credito venivano richiamate dal dispatcher documento per documento, ogni ora. Il nuovo filtro verifica ogni azienda prima delle richieste HTTP. Un blocco mantiene i documenti in attesa e ha un motivo visibile; non consuma i tentativi tecnici dei PDF.

## Attivazione in due passi

1. La migrazione `20290506150000_email_ai_coda_per_azienda` prepara funzioni, permessi e tabelle con `private.email_ai_coda_config.filtro_attivo=false`. Il dispatcher conserva il comportamento precedente durante il passaggio.
2. Dopo il deploy verificato di `email-ai-estrai-allegato`, attivare il filtro con:

```sql
update private.email_ai_coda_config set filtro_attivo=true where id;
```

Il nuovo endpoint è compatibile anche con il dispatcher precedente. Usa una risposta rapida per pg_net, mantiene il lavoro in background e continua a rispondere normalmente alle richieste del browser. La verifica canonica della carta e del credito resta obbligatoria prima di chiamare il provider.

## Garanzie

- Una presa in carico per email, token casuale e scadenza di cinque minuti. Il salvataggio e la sostituzione della bozza avvengono nella stessa transazione con verifica del token.
- Un worker scaduto non salva, non rilascia il successore e non modifica i suoi tentativi. Un documento confermato non viene sostituito.
- Il retry riutilizza un documento già pronto. Il pulsante «Ri-estrai» continua a consentire una rilettura esplicita delle bozze.
- Carta/credito tornati disponibili invalidano l'attesa; il dispatcher rifà i controlli al giro successivo. Un allarme OpenRouter aperto sospende le letture fino al ripristino verificato dal sistema di allarmi.
- Il dispatcher sceglie l'indice del PDF, anche se l'allegato iniziale è XML. Gli errori tecnici mantengono attesa crescente e limite di sei tentativi.
- Download e policy Storage verificano l'appartenenza del file. Restano compatibili i percorsi storici del proprietario dell'email.
- Le RPC di lavoro sono eseguibili solo dal service role. La tabella visibile all'azienda contiene esclusivamente causa e date dell'attesa, senza saldi, segreti o contenuti dei documenti.

## Automazioni ritirate

Le 404 di `process-internal-automation` osservate nei log sono cessate il 21 novembre alle 11:13 UTC. Non risultano cron, flussi o coda attivi del vecchio motore. Lo storico SQL ricreava però il cron durante il ripristino da zero: la migrazione `20290506151000_cron_legacy_automazioni_ritirato` lo rimuove solo se non esistono flussi pubblicati o lavori da elaborare. Il motore attuale `process-automation` resta invariato.

La ricostruzione del database in CI verifica ora che ogni destinazione HTTP dei cron attivi sia presente nel repository. La diagnostica del setup espone soltanto fase, famiglia del comando e codice di uscita, senza SQL o credenziali.

## Validazione prima del rilascio

- 45 test mirati di endpoint, isolamento, stato UI, pagamento, attese e risposte troncate passati.
- PostgreSQL locale: cento documenti bloccati senza richieste HTTP, ripresa dopo sblocco, token concorrenti, scadenza, salvataggio atomico, permessi e file di un'altra azienda verificati.
- Migrazione cron: idempotenza, tutela del lavoro presente e conservazione degli altri job verificate.
- TypeScript e Deno passati; nessuna dipendenza aggiunta; lint dei file modificati senza errori.
- Prima dell'applicazione, 2.190 allegati usavano il prefisso azienda e uno quello del proprietario. I 390 documenti già estratti con PDF rispettavano il nuovo controllo.
- La build locale compila l'app, ma il prerender del sito ha raggiunto il limite di 15 minuti. La build completa in CI deve essere verde prima del merge. Il lint globale preesistente (837 errori e 3.022 avvisi) resta oggetto delle successive correzioni del rapporto.

Per fermare il nuovo filtro durante un problema operativo, riportare `filtro_attivo=false`. Non disattivare i controlli di spesa o le protezioni dei file. Per la funzione edge resta disponibile il bundle dell'ultimo deploy riuscito; le funzioni SQL preparatorie restano compatibili con quello precedente.
