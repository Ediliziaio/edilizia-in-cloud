# Revisione 8 · Revoche, calendario e integrazioni

Lotto locale allineato a `33f797792` di `origin/main`. Le tre migrazioni del lotto e le tre arrivate su main sono state applicate allo stack PostgreSQL, Auth e PostgREST già ricostruito con le 6.177 migrazioni del lotto precedente. Il database di prova comprende ora 6.183 migrazioni. I dati sono sintetici e gli invii esterni restano disattivati.

## EIC074 · Revoca dei rapportini

Due rapportini approvati attribuiscono 20 m² e 30 m² alla stessa sottofase. Valori rilevati prima e dopo ogni revoca, sia da Chrome con l’account aziendale sintetico sia attraverso la RPC autenticata sul database completo.

| Ordine delle revoche | Prima | Dopo |
| --- | --- | --- |
| 20 m², poi 30 m² | 50 → 50 → 20 m² | 50 → 30 → 0 m² |
| 30 m², poi 20 m² | 50 → 20 → 0 m² | 50 → 20 → 0 m² |

Nel browser sono stati verificati il comando **Annulla rapportino**, il motivo salvato, lo stato dopo la ricarica e la quantità mostrata nelle **Lavorazioni**. Sono passate anche le revoche concorrenti, il reinvio della stessa revoca, tre rapportini consecutivi, una percentuale di partenza inserita a mano e la riapertura di una voce completata a quantità.

La funzione ricalcola solo una sequenza continua e univoca. Se le misure divergono per una rettifica manuale, la quantità corrente viene conservata. È coperto anche il caso in cui la misura manuale coincide con una fotografia precedente. [Migrazione](../../../supabase/migrations/20290430150700_rapportino_revoca_quantita_consecutive.sql) · [Regressioni](../../../src/test/security/rapportinoRevocaQuantita.test.ts)

## EIC056 · Calendario ferie

La ricostruzione installava una versione della funzione che usava tutti i giorni di calendario. Per la richiesta del 24–28 dicembre 2026 deduceva cinque giorni da un saldo di venti e registrava ferie anche durante festività e fine settimana.

La migrazione ripristina l’implementazione con calendario lavorativo e memorizza consumi e giornate all’approvazione. La prova SQL con ruolo autenticato registra soltanto il 24 e il 28 dicembre, lascia 18 giorni e conserva il consumo di 2. La ripetizione dell’approvazione lascia invariato il saldo. Dopo aver cambiato la settimana lavorativa e rimosso le festività di prova, due revoche riportano il saldo a 20 e rimuovono le due giornate una sola volta. [Migrazione](../../../supabase/migrations/20290430150800_ripristina_calendario_ferie_nel_replay.sql)

## EIC026 e EIC030 · Diagnostica delle integrazioni

Il pannello comunica **Formato valido** per Calendar e Meta e **Configurata** per Maps. Stripe riporta **Connesso** dopo una risposta riuscita dal provider. Il gestore usa lo stesso lettore delle impostazioni del prodotto e restituisce un errore sintetico se Stripe rifiuta il controllo.

I test hanno eseguito il gestore Edge con un provider simulato, inclusi un ID Google malformato, la mancanza di configurazione e un utente con ruolo insufficiente. Nel database completo una configurazione Stripe sintetica è stata letta dal Vault con il ruolo di servizio. Il segreto non compariva nella tabella e la funzione di lettura non era eseguibile dal ruolo autenticato. La transazione di prova è stata annullata. [Regressioni](../../../src/test/logic/testIntegrazioniAdmin.test.ts)

## EIC028 · Disponibilità dei numeri telefonici

Con una risposta Telnyx vuota, un errore HTTP o una chiave assente, il gestore precedente restituiva otto numeri generati. Ora una risposta vuota restituisce zero risultati. Un guasto del provider o una configurazione incompleta mostrano il messaggio corrispondente e tengono chiuso il passaggio d’acquisto. Il test restituisce il solo numero della risposta simulata quando il provider risponde. [Regressioni](../../../src/test/logic/telnyxNumeriReali.test.ts)

## EIC079 · Firma delle riduzioni di contratto

Nello stack ricostruito il ruolo effettivo della vecchia funzione era respinto dal trigger che protegge gli stati della variante. Ripetendo la prova con il ruolo di scrittura previsto, in una transazione poi annullata, il contratto da 100 € ha accettato entrambe le riduzioni da 60 € e 50 € ed è sceso a −10 €.

La firma OTP e l’approvazione della variante ora si registrano nella stessa transazione. La commessa è bloccata prima della scrittura della firma, come nel flusso di approvazione su carta. A capienza esaurita si conserva la sessione OTP e l’utente riceve un messaggio che chiede una proposta aggiornata.

Sul database completo sono passate due firme OTP in sequenza e concorrenti, la firma su carta seguita da OTP e il caso con carta e OTP concorrenti. Quando le richieste eccedono il contratto se ne approva una sola. La prova sulla stessa variante già approvata su carta non registra una seconda firma. Il test del gestore Edge verifica che il rifiuto restituisca HTTP 409 senza scritture separate, PDF o audit di firma completata. [Migrazione](../../../supabase/migrations/20290430150900_variante_fea_capienza_atomica.sql) · [Test del gestore](../../../src/test/logic/firmaCongiuntaBackupRetry.test.ts)

## Controlli dopo l’allineamento

La suite mirata ha superato 302 test in 17 file. Dopo l’ultimo aggiornamento di main sono passati altri 71 test mirati, con casi ripetuti, e i nuovi giri su Chrome e PostgreSQL. La migrazione locale dei listini è stata rinumerata a `20290430150001` per liberare la versione già assegnata su main. Il censimento delle 6.183 versioni del repository non presenta duplicati.

Passano TypeScript mirato, Deno sulle tre funzioni Edge e `git diff --check`. Deno ha usato una copia temporanea del lockfile perché quello del repository è desincronizzato dalle dipendenze. Nel pannello delle integrazioni restano due errori ESLint già presenti sulla baseline. Il controllo TypeScript globale è rimasto in coda dietro un’altra sessione.
