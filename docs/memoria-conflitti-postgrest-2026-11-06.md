# Memoria database: conflitti applicativi e retry PostgREST

## Causa verificata

PostgREST 14.4 ripete internamente le transazioni che restituiscono SQLSTATE `40001`. Il controllo di versione in `save_automation_graph` usava quel codice per un conflitto definitivo: ripetere gli stessi parametri non può risolverlo. Un backend aperto dal 4 novembre continuava a eseguire e annullare la stessa operazione, anche senza nuove richieste dell’utente.

Evidenze prima dell’intervento:

- 47.915 errori `40001` osservati nei log tra le 00:00 e le 13:20 UTC del 6 novembre, tutti dallo stesso backend e dallo stesso controllo di versione.
- 107.751.275 rollback cumulativi: il numero è rimasto stabile dopo la correzione, mentre prima la sessione contava oltre 105 milioni di righe di log.
- Memoria impegnata al 96% della soglia, con letture precedenti fino al 107%. Soglie della sentinella invariate.
- La sessione rimaneva continuamente impegnata e non veniva intercettata dal riciclo delle connessioni ferme.

Fonte ufficiale: [Supabase — SQLSTATE 40001 e retry infiniti](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).

## Correzione

La migrazione `20281216150000_conflitti_http_senza_retry.sql` trasforma esclusivamente `USING ERRCODE = '40001'` in `PT409` nelle 46 funzioni applicative revisionate. I controlli di versione, impronta, idempotenza e accesso restano intatti. PostgreSQL continua a generare normalmente i propri autentici errori serializzabili; i conflitti applicativi arrivano invece subito al client come HTTP 409.

La verifica con impronte delle definizioni prima/dopo ha confermato, su tutte le 46 funzioni, che sono cambiati soltanto i codici delle eccezioni: stesso OID, ACL, modalità di sicurezza e search_path. Nessuna riga dati riscritta. Migrazione applicata via MCP e registro allineato al file.

Client di commesse, duplicazione, planimetrie, serramenti, fotovoltaico e funzioni POS/verbali riconoscono `PT409` e mantengono compatibilità con il precedente codice. Nessuna sovrascrittura automatica e nessun retry automatico su dati obsoleti.

## 📊 BASELINE vs FINALE

| Metrica | Prima | Dopo |
|---|---|---|
| Guardie applicative con 40001 nel DB | 83 | 0 |
| Funzioni corrette | — | 46 |
| Codice restituito per conflitto | 40001, ritentabile | PT409, definitivo |
| Backend nel ciclo dal 4 novembre | presente | assente |
| TypeScript | 0 errori | 0 errori |
| Build | PASS | PASS |
| Lint nei file toccati | 6 errori hook e 1 warning già presenti | stessi 6 errori e 1 warning; nessun nuovo problema |
| Memoria e disponibilità esterna | sentinella rossa | misurazione finale nel controllo GitHub Sentinella database |

## 🗑️ RIMOSSO

Nessuna funzione o dato eliminato.

## 🔒 SECURITY FIX

Nessun ampliamento dei permessi. La verifica confronta ACL, SECURITY DEFINER/INVOKER e search_path prima e dopo. Non sono stati modificati costi, dimensione del piano, soglie o protezioni.

## 🐛 BUG CORRETTI

Conflitti applicativi deterministici classificati come errori transitori, con retry interni che potevano continuare indefinitamente.

## ♿ ACCESSIBILITÀ

Nessuna struttura visuale modificata. Restano i messaggi leggibili di conflitto e le azioni di ricaricamento già previste dai client.

## ✨ UX MIGLIORATA

L’utente riceve il conflitto senza restare in attesa indefinita. Le modifiche altrui restano protette e i dati locali non vengono sovrascritti automaticamente.

## ⚡ PERFORMANCE

Eliminato il ciclo di esecuzioni e rollback. La normale politica di riciclo delle connessioni e il monitoraggio restano attivi. Effettuato un riavvio rapido del solo database per liberare la memoria residua dopo la correzione, con nessuna transazione client in corso alla verifica precedente. Nuovo avvio confermato alle 13:38:04 UTC e risposta SQL verificata alle 13:40 UTC.

## ✅ CHECKLIST TEST FINALE

- PostgreSQL/PGlite: conflitti RPC e trigger PT409, nessuna sovrascrittura, scrittura valida una sola volta, idempotenza della migrazione e ACL invariati.
- Client: nuovo codice e compatibilità con vecchi server, senza fallback a scritture parziali.
- SQL sul database reale con rollback: conflitto definitivo PT409 e record invariato; nessun dato di prova persistito.
- Test applicativi mirati: 95 PASS in 9 file, incluso il controllo preventivo sulle migrazioni future.
- Test Deno POS: 53 PASS.
- TypeScript completo e build produzione: PASS.
- CI e sentinella esterna: esiti associati al commit e alle esecuzioni GitHub del rilascio.

## 🔴 LIMITI E VERIFICHE OPERATIVE

Il riavvio e la disponibilità vengono verificati dalla sentinella esterna; le letture di memoria devono essere valide e sotto soglia, non basta il solo esito del job. La lettura diretta delle metriche tramite estrazione di una chiave service_role è stata rifiutata dalla revisione automatica: non è stata riprovata né aggirata. Le misurazioni sono affidate alla sentinella già esistente e al pannello Supabase autenticato.

## Ripristino

Un rollback dell’interfaccia è possibile con revert del commit. Non ripristinare il codice applicativo `40001` nel database: riaprirebbe il ciclo di retry. Le modifiche alle funzioni non alterano dati o firme.
