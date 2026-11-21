# Revisione 8 · Chiusura del collaudo locale

Il lotto è partito da `c3d079078` ed è stato allineato a `eec29c2f3` di `origin/main` con il lavoro dell’audit conservato. Le prove hanno usato aziende e documenti sintetici, Chrome, Supabase Auth e PostgreSQL locali. Le risposte del servizio email, di Microsoft Graph e del modello AI sono state simulate. Il worktree contiene tre nuove migrazioni applicate alla base locale completa.

## EIC005 · Silvio e gli errori degli strumenti

Prima, un rifiuto di autorizzazione faceva invocare il modello una seconda volta. Dopo, il ciclo si ferma dopo la prima chiamata e riporta il motivo. In un turno misto conserva il risultato dell’altro strumento riuscito. Un errore temporaneo può ancora recuperare e, se la stessa operazione riesce, sparisce dagli errori finali. La prova esegue il ciclo reale con risposte simulate. Il conteggio delle chiamate è misurato sul ciclo, mentre tempi, token e costi del modello in servizio restano da misurare al rilascio. [Ciclo di Silvio](../../../supabase/functions/silvio-chat/index.ts)

## EIC016 · Logout tra pannello e app

Chrome ha caricato il modulo applicativo di gestione della sessione su due sottodomini simulati, usando token emessi da Supabase Auth locale. Prima, pur con il rinnovo rifiutato dal server, il secondo sottodominio ripristinava la sessione da una copia locale. Dopo, la sessione revocata resta esclusa anche in presenza di una scrittura tardiva e un nuovo login si propaga. Per le schede già aperte, il gestore dell’app controlla la revoca al ritorno in primo piano e mentre la pagina è visibile. [Storage della sessione](../../../src/integrations/supabase/authStorage.ts) · [Gestore dell’autenticazione](../../../src/contexts/AuthContext.tsx)

## EIC023 · Riconciliazione Outlook

Prima, l’evento scomparso da Outlook restava nella copia locale. Dopo, «Sincronizza ora» in Chrome lascia gli eventi inalterati se fallisce la seconda pagina e rimuove quelli mancanti al completamento della lettura. PostgreSQL ha verificato anche una risposta vuota, che rimuove i soli eventi del calendario nella finestra, e uno snapshot precedente, che non può sovrascriverne uno più recente. Gli eventi di altri calendari e fuori finestra restano presenti. [Sincronizzazione](../../../supabase/functions/outlook-calendar-sync/index.ts) · [Migrazione](../../../supabase/migrations/20290504100400_outlook_riconcilia_calendario.sql)

## EIC043 · Spostamento di un appuntamento

Prima, Chrome in fuso New York offriva le 09:45 per un calendario di Roma con durata di 45 minuti e passo di 60. Dopo, la pagina usa la stessa disponibilità della prenotazione, esclude il solo appuntamento che si sta spostando dai conflitti e ha registrato correttamente le 11:00–11:45. Un altro impegno alle 10:00 resta bloccato. PostgreSQL ha verificato la fascia libera 09:00–12:00 sia con durata 45 e passo 60, sia con durata e passo di 30 minuti. Il gestore ha respinto un token senza appuntamento associato. [Pagina di gestione](../../../src/pages/public/PublicAppointmentManage.tsx) · [Gestore delle disponibilità](../../../supabase/functions/public-booking-gestisci/index.ts)

## EIC047 · Invio email dei documenti

Il simulatore Resend ha contato due accettazioni prima della correzione, dopo un'accettazione con risposta persa. Dopo la correzione ha contato una sola accettazione, grazie alla stessa chiave nei due tentativi tecnici. Con SendGrid la prova interrompe l’invio dopo una risposta incerta. Nel gestionale, Chrome ha perso la risposta dopo l’accettazione simulata. Il secondo clic ha recuperato la ricevuta usando lo stesso identificativo. È rimasta una sola voce nel registro di fatturazione.

Su PostgreSQL due richieste concorrenti hanno prodotto un solo inoltro. Il registro consegne permette di recuperare la conferma quando la ricevuta è incompleta. Un rifiuto certo consente un nuovo tentativo controllato. Se manca la prova di accettazione e il provider può avere ricevuto la richiesta, l’interfaccia mostra l’esito incerto e il comando verifica la stessa richiesta. La prova ha anche fatto emergere un collegamento del registro tecnico alla tabella delle vecchie fatture. Ora il log punta al documento fiscale corretto. Il database ha consentito di correggere una fattura emessa prima dell’invio simulato e ha protetto il contenuto dopo la registrazione della consegna. [Invio del documento](../../../supabase/functions/send-documento-email/index.ts) · [Migrazione](../../../supabase/migrations/20290504100500_documento_email_richiesta_riprendibile.sql) · [Chiavi di idempotenza di Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)

## EIC087 · Riclassificazione di un cespite

Il test PostgreSQL parte da un acquisto già registrato di 1.000 €. Prima, la cessione lasciava +1.000 € sul vecchio conto e −1.000 € sul nuovo. Dopo il cambio, fattura di acquisto, cespite e giornale indicano il nuovo conto. Dopo la cessione i due saldi sono a zero. Con due connessioni, la cessione in attesa della riclassificazione ha usato il conto appena salvato. Chrome ha salvato la scelta da «Conti e fondo» nel Registro cespiti e il database l’ha riletta sulla fattura e sul bene. Per un acquisto in esercizio chiuso la procedura rifiuta il cambio e conserva il conto. Le riclassificazioni di esercizi definitivi e dei fondi già registrati richiedono il percorso contabile previsto. [Riclassificazione](../../../supabase/migrations/20290504100600_cespite_riclassificazione_contabile.sql)


## Verifiche dopo l’allineamento

163 test mirati superati in 14 file. Superati il controllo TypeScript sui file interessati, `deno check` sulle funzioni modificate, la build Vite locale e `git diff --check`. ESLint sui file interessati riporta zero errori e 14 avvisi nei file di autenticazione e invio email. Il merge locale conserva la protezione del PDF firmato e aggiunge la registrazione delle attività AI di `main` anche nel caso di errore definitivo di Silvio.
