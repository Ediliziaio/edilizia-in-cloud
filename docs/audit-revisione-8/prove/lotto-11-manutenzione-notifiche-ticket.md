# Revisione 8 · Manutenzioni, notifiche e assistenza

Allineamento locale a `4ec75546b` di `origin/main`. Prove con Chrome autenticato, PostgREST e PostgreSQL su localhost. Il database contiene dati e utenti sintetici.

## Manutenzioni senza contratto · EIC057

Prima il piano si registrava senza riferimento all’impianto e la scheda disabilitava «Registra esecuzione». Dopo la correzione il wizard ha creato un piano mensile senza contratto. La scheda lo mostrava e, dopo aver registrato l’esecuzione del 23 novembre, ricaricava lo storico con le note e la prossima scadenza al 23 dicembre.

Sul database completo il piano storico a contratto ha recuperato il collegamento all’impianto. I piani senza riferimenti ricostruibili sono rimasti da verificare. Il vincolo respinge un impianto di un’altra azienda. Due completamenti concorrenti sulla stessa versione hanno prodotto una sola esecuzione, confermata anche ripetendo il comando. Esecuzioni arretrate e rinviate conservano la scadenza corrente. [Migrazione](../../../supabase/migrations/20290502081800_piano_manutenzione_impianto.sql)

## Campanella · EIC063

La campanella partiva senza indicatore con 50 messaggi recenti letti e uno precedente non letto. La verifica dopo la correzione ha mostrato 1 da leggere. Il messaggio precedente era raggiungibile nella campanella e «Tutte lette» ha aggiornato la riga in PostgreSQL. [Conteggio](../../../src/hooks/useNotifications.ts)

## Ticket lunghi · EIC045

La chiamata PostgREST di partenza troncava il ticket ai primi 500 messaggi e lasciava fuori il 501º. Nel gestionale aggiornato il 501º compare all’apertura e la nuova risposta appare dopo l’invio. Cinque pagine recuperano i 501 messaggi precedenti senza duplicati, anche quando più righe hanno la stessa data. La seconda azienda ha ricevuto zero messaggi. Azienda e portale cliente condividono la lettura. Il collaudo da browser di questo lotto riguarda il gestionale aziendale. [Lettura della conversazione](../../../src/hooks/useTicketMessages.ts)

## Verifiche del codice

Passati 19 test mirati in sette file, TypeScript sui moduli coinvolti e `git diff --check`. ESLint segnala tre errori preesistenti nella gestione dello stato del dettaglio ticket, verificati anche sul file di `main`. [Test dei piani senza contratto](../../../src/test/logic/manutenzioneImpianto.test.ts)
