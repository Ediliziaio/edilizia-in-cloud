# Firme congiunte, backup e fatture da DDT

Verifiche locali del 20 novembre 2026. Baseline `45db324e3`, PostgreSQL temporaneo con dati fittizi, Edge Functions con servizi simulati.

| Caso | Prima della correzione | Dopo la correzione |
| --- | --- | --- |
| EIC009 · Firme congiunte | Con errore sul gruppo, HTTP 200 e richiesta già firmata. Il secondo invio dava HTTP 409. | La prima firma lascia il preventivo aperto a 1/2. Con errore forzato nell’aggiornamento del preventivo, la seconda firma torna allo stato `otp_verified` con lo stesso codice di sessione e il gestore risponde HTTP 503. Il nuovo invio chiude a 2/2. Due firme concorrenti su un altro preventivo hanno prodotto una sola chiusura. Verificati anche il passaggio del fotovoltaico a «Firmato», il rifiuto di una sessione errata e i permessi dell’RPC. |
| EIC031 · Backup a blocchi | Interruzione durante la scrittura dell’indice. L’indice precedente rimaneva identico ma la riga azienda e un blocco già referenziato contenevano i dati del secondo tentativo. | L’indice, la riga azienda e il blocco precedenti restano identici byte per byte. Il tentativo successivo si ferma su un checkpoint e due riprese simultanee ottengono lo stesso indice completo. La prova di ripristino in PostgreSQL ha riletto una riga azienda e una riga ordini sia dal percorso giornaliero sia da quello nuovo. La manutenzione conserva l’ultima copia anche in presenza di un tentativo parziale. |
| EIC088 · Fattura da DDT | Due sessioni leggono il DDT privo di collegamento e creano due bozze. Ogni sessione ottiene un ID diverso. | Le due sessioni ricevono lo stesso ID con una sola bozza. Su un DDT da dieci pezzi, un nuovo invio conserva la modifica del prezzo unitario e riapre la fattura. L’emissione locale attribuisce un solo numero fiscale e marca il DDT come fatturato. Una bozza pregressa con lo stesso numero e data del DDT viene riagganciata. Un errore forzato nel collegamento annulla la creazione. Verificato il rifiuto per un’altra azienda e per un utente privo del permesso di fatturazione. |

Le copie a blocchi del nuovo formato hanno una cartella per esecuzione e un indice immutabile. La compressione gestisce entrambi i formati e il controllo dei backup mancanti conta gli indici disponibili. Il database di prova ha usato le procedure del repository per aprire, versare e chiudere il ripristino. [Test locali del gestore](../../../src/test/logic/firmaCongiuntaBackupRetry.test.ts)

Il collaudo resta circoscritto a dati sintetici, servizi simulati e alle procedure SQL coinvolte. Le eventuali fatture doppie o firme incoerenti già registrate in produzione richiedono una verifica puntuale dei dati storici.

## Controlli tecnici

- 217 test di regressione passati in 19 suite. Una suite con 12 test è stata saltata dalla configurazione.
- Compilazione TypeScript mirata e controllo Deno per le tre Edge Functions interessate riusciti. ESLint senza errori, con sei avvisi in codice preesistente.
- Build Vite riuscito con credenziali fittizie. Rollup segnala annotazioni delle dipendenze e alcuni bundle oltre 1.500 kB.
- Tre migrazioni applicate nel database temporaneo. Il rilascio e il collaudo su un portale autenticato restano fuori da questo lotto locale.
