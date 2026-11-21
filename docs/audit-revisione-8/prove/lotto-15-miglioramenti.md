# Revisione 8 · Cinque miglioramenti verificati in locale

Il lotto ha integrato `429b1d32e` e allineato il worktree a `9d34d2455` di `origin/main`. Il collaudo ha usato Chrome autenticato, PostgreSQL e Storage locali e dati sintetici.

## MIG001 · Ripresa del salvataggio dei preventivi

Un errore temporaneo bloccava il successivo salvataggio automatico. Ora la bozza di un preventivo già esistente può riprendere il salvataggio con tre tentativi distanziati. Al ritorno della rete, il tentativo parte subito con gli ultimi dati a schermo. Conflitti e rifiuti permanenti fermano la ripresa con uno stato visibile nell’editor. La versione del preventivo continua a essere controllata. Un esito ambiguo che ha già cambiato la versione può richiedere il recupero manuale della bozza.

In Chrome, la scrittura del primo titolo ha ricevuto un errore temporaneo simulato. Un secondo titolo, digitato mentre la prima versione era in attesa, è arrivato nel database al ritorno della rete. Un test con timer controllato verifica che il tentativo parta una sola volta e legga l’ultimo input.

## MIG002 · Cestino nella ricerca globale

La ricerca esclude commesse e preventivi cestinati per impostazione predefinita. «Includi il cestino di commesse e preventivi» aggiunge risultati etichettati «Nel cestino». I risultati AI sulle commesse passano dal controllo di visibilità della commessa attiva. I dettagli cestinati mostrano come ripristinare dalla lista.

Chrome ha trovato la commessa attiva e, dopo aver attivato il filtro, la commessa cestinata con lo stesso testo. Aprendo quest’ultima ha mostrato il dettaglio protetto.

## MIG003 · Ripresa dei file mancanti

Allegati del ticket, apertura del ticket e foto di cantiere distinguono i file completati da quelli da riprovare. Un identificativo per singolo allegato conserva il percorso originale al nuovo tentativo, anche per file omonimi. Le foto già in coda offline sono conservate. I file da riprovare manualmente restano disponibili mentre il modulo è aperto e vengono segnalati prima di uscire.

Chrome ha caricato due PDF con lo stesso nome e contenuto diverso nello Storage locale. Il secondo file ha ricevuto un errore simulato. «Riprova mancanti» ha riusato il suo percorso. Il database conteneva due soli allegati. Un test della scheda foto ripete lo stesso caso e verifica che la seconda selezione contenga solo il file mancante.

## MIG004 · Budget a zero e budget da definire

Una riga di budget esistente con valore 0 € è un budget esplicito, compresi gli zeri già registrati. Voce assente significa «Da definire». L’editor permette di rimuovere una voce e la nota associata. Lo scostamento da zero è mostrato in euro. I totali indicano un confronto incompleto quando manca il budget di una voce con consuntivo.

Chrome ha salvato 0 € e ha mostrato «Da definire» dopo la rimozione. La suite di calcolo verifica un costo di 100 € con budget 0 €, lo scostamento di 100 €, l’assenza di percentuale e i segni di costi e margini.

## MIG005 · Revisione delle note spese

L’amministratore dell’azienda può approvare o rifiutare una nota inviata. Il rifiuto richiede una motivazione e consente di riaprire la nota. La registrazione del rimborso associa un’uscita bancaria già contabilizzata con importo e valuta corrispondenti. Il database ne impedisce l’utilizzo per una seconda nota e tutela gli aggiornamenti concorrenti. Per revisione e rimborso vengono registrati autore e data. Le note sono accessibili anche prima di collegare una banca.

PostgreSQL ha verificato rifiuto, riapertura, guardia di versione, voci bloccate dopo l’invio, importo bancario errato, riuso del movimento e accesso da un’altra azienda. Un utente della stessa azienda con accesso alla nota e privo del ruolo di amministratore ha ricevuto un rifiuto all’approvazione. Chrome ha approvato una nota sintetica e ha associato al rimborso l’uscita già presente nel registro. Su una seconda nota ha mostrato la motivazione obbligatoria e l’ha conservata dopo la riapertura. [Migrazione locale](../../../supabase/migrations/20290504100700_revisione_note_spese.sql)

## Manutenzione del codice

Risolti i 14 avvisi ESLint segnalati dal lotto 14. Le eccezioni di Fast Refresh elencano le esportazioni di autenticazione gestite dal modulo che ha già il proprio HMR.

Passati 149 test in 13 file del lotto e il controllo TypeScript mirato. ESLint sui moduli verificati riporta zero errori e zero avvisi.

Prima della pubblicazione sono passati 519 test in tutti i 60 file di test modificati dall’audit. Vite ha terminato con codice di uscita 0 e ha generato la pagina iniziale, i bundle e il service worker. Rollup ha segnalato annotazioni nelle dipendenze e bundle sopra la soglia di avviso. Il controllo Magazzino ha verificato tutte e quattro le copie di picomatch con un’installazione Bun isolata dal lockfile.

Un nuovo database Supabase locale ha applicato tutte le 6.205 migrazioni in ordine con cron e richieste HTTP disattivati. Il registro è completo e non ci sono patch differite. Sono passate anche le quattro prove SQL previste dalla CI, su permessi e retribuzioni, attività d’ufficio, TFR e patrimonio, crediti e debiti.

Deno ha verificato tutti i 33 file TypeScript modificati nelle Edge Functions. Nel webhook Stripe i gestori usano il tipo cliente Supabase effettivo e leggono i dati secondo il tipo dell’evento. La prova del referral ha riprodotto il fallimento con il vecchio uso di `.catch()` sulla RPC. Dopo la correzione, la RPC riuscita aggiorna le statistiche e richiama la notifica simulata. Con un errore simulato la notifica viene saltata.

La suite finale, estesa alle regressioni del webhook Stripe, ha superato 706 test in 66 file.
