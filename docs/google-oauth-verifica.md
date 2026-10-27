# Verifica OAuth Google — Edilizia in Cloud

Aggiornamento tecnico: 26 ottobre 2026. Progetto `edilizia-in-cloud` (232959366283).
Il branding è verificato; l'accesso ai dati non è approvato. La nuova richiesta
richiede motivazioni e video. Nessuna approvazione Google è implicita in queste modifiche.

## Permessi da presentare

| Integrazione | Ambiti | Funzioni da dimostrare |
| --- | --- | --- |
| Identità | openid, userinfo.email, userinfo.profile, secondo il client | Identificare l'account collegato; accesso Google se usato |
| Calendar | calendar.readonly, calendar.events | Calendari, disponibilità, importazione abilitata e sincronizzazione appuntamenti |
| Gmail CRM | gmail.readonly, gmail.send, userinfo.email | Leggere messaggi/allegati e inviare/rispondere |
| Ads | adwords | Selezione account, campagne, budget e report letti da Google |
| Business Profile | business.manage | Selezione sede, recensioni e risposte già pubblicate lette da Google |

Non dichiarare pubblicazione live Ads, invio conversioni o pubblicazione risposte
Business Profile sulla base del solo UI: nel codice controllato la pubblicazione
Ads è bloccata e gli altri percorsi di scrittura non sono stati verificati.

## Compatibilità dei collegamenti Gmail

- Non cambiare client ID, segreti o progetto; non revocare token o modificare righe
  di connessione per ridurre i nuovi consensi.
- `email-oauth-start` richiede solo lettura/invio e non aggrega intenzionalmente
  grant precedenti (`include_granted_scopes=false`). Google può comunque restituire
  autorizzazioni già presenti: questa modifica non è una revoca retroattiva.
- Le connessioni precedenti conservano i propri grant. Il warm-up cambia etichette
  solo se il token dichiara gmail.modify o l'accesso completo storico; con i nuovi
  grant l'engagement sulle etichette viene omesso senza richieste 403.
- Audit aggregato del 26 ottobre: tre Gmail active, due expired; nessuna casella
  Gmail in outreach_sender_accounts. Nessun grant memorizzato contiene mail.google.com.
- La riduzione è distribuita (email-oauth-start v60, outreach-warmup v94).
  Nella console sono stati rimossi gmail.modify e mail.google.com e salvate
  le motivazioni, senza revocare i vecchi grant.
  La rimozione riguarda i consensi del percorso corrente, non una migrazione.
- Non separare Gmail in un nuovo progetto senza una migrazione esplicita: i token
  sono legati al client che li ha emessi. La vecchia procedura di settembre che
  ipotizzava soltanto una casella demo è superata.

Gmail readonly è un ambito con restrizioni; gmail.send è sensibile. Anche riducendo
il consenso, per i dati Gmail trattati sui server resta applicabile la verifica
con restrizioni e la valutazione di sicurezza richiesta da Google. Non usare
l'aggiunta di tester o un nuovo progetto per eludere questi requisiti.

## Testo inglese: motivazione ambiti sensibili (campo da 1000 caratteri)

Edilizia in Cloud is a CRM for construction companies. calendar.readonly lists calendars and reads events to show availability, avoid scheduling conflicts and import appointments when enabled. calendar.events creates, updates and deletes events for appointment synchronization. Read-only access cannot perform these writes; free/busy alone lacks event details needed for import. gmail.send lets users send messages and replies from their connected mailbox inside the CRM. adwords lets users select their Google Ads account and view synchronized campaigns, budgets and performance reports; Google Ads API requires this scope for these calls. Identity scopes identify the connected account. Each integration is connected by the user. This submission does not claim live Google Ads campaign publishing.

## Testo inglese: motivazione ambiti Gmail con restrizioni

Edilizia in Cloud provides an email client inside its CRM. gmail.readonly retrieves messages, message bodies and attachments from the user's connected Gmail mailbox to display incoming conversations and associate them with CRM records. Metadata-only access is insufficient because users need the message body and attachments. Sending and replying use gmail.send. The current connection flow does not request full mailbox access, permanent deletion or label modification. Existing connections may retain permissions granted previously; their tokens are not revoked by this change.

Categoria: scegliere l'opzione della console corrispondente a un client di posta
che legge e invia messaggi per conto dell'utente. Non selezionare attestazioni
su certificazioni o valutazioni non ottenute.

## Testo inglese Google Business Profile / Google My Business

Users connect their Google Business Profile, choose a business location they manage and view its reviews and existing owner replies inside Edilizia in Cloud. The business.manage scope is required by the Business Profile APIs used to list the user's accounts, locations and reviews. The demonstrated integration reads business information and reviews; it does not claim automatic review-reply publication or edits to the business listing.

Nel progetto la console classifica business.manage tra gli ambiti non sensibili.
Usare questo testo nelle informazioni aggiuntive o nella descrizione del video,
non spostare arbitrariamente il permesso in un'altra categoria.

## Informazioni aggiuntive (bozza per il riepilogo, 1000 caratteri)

Edilizia in Cloud is a business CRM at https://app.ediliziaincloud.com. The demo covers Google Calendar, Gmail, Google Ads, Google Business Profile and Google Sign-In where used. Each integration is connected by the user and access is limited by the granted permissions and available settings. New Gmail connections request reading and sending only. Older connections are preserved without client changes or token revocation. Our Google data disclosure is at https://www.ediliziaincloud.com/privacy-policy/#dati-account-google and describes access, AI processing, sharing, retention and revocation. The demonstration shows the actual production functionality using test data. No claim of completed third-party security assessment is made in this submission.

Inserire il link del video nel campo YouTube dedicato. Non inviare prima che il
video mostri realmente tutti i percorsi elencati; non inserire credenziali reali
nel testo. Eventuali accessi di revisione vanno predisposti separatamente.

## Registrazione video

Durata consigliata 8-12 minuti, non un requisito Google. Schermo 1080p leggibile,
barra URL visibile, consenso Google completo in inglese. Voce non indispensabile:
aggiungere didascalie inglesi. Registrare dati di prova, mai password, OTP,
client_secret, token, codici di autorizzazione o dati dei clienti.

1. Home e privacy, poi accesso alla demo; mostrare anche Google Sign-In se usato.
2. Calendar: clic su Collega, consenso completo, ritorno e scelta calendario.
3. Google -> CRM: creare un sopralluogo nel calendario di prova e mostrarne
   l'importazione quando abilitata. CRM -> Google: creare un appuntamento,
   cambiarne l'orario e mostrare l'aggiornamento. Dimostrare disponibilità occupata.
   Se si dichiara cancellazione, eliminare solo l'evento di prova creato dall'app.
4. Gmail: consenso con lettura/invio, ricezione di un messaggio con allegato da
   una seconda casella, apertura nell'app, risposta e ricezione effettiva sull'altra
   casella. Se si mostrano funzioni AI, documentarne anche l'elaborazione dichiarata.
5. Ads: consenso, selezione account, report con periodo, campagne, clic e spesa;
   confrontare lo stesso account/periodo in Google Ads. Nessuna attivazione a pagamento.
6. Business Profile: consenso, selezione sede, recensioni e risposte già pubblicate;
   confrontare con Google. Non pubblicare risposte su recensioni reali per il video.
7. Disconnessione dei soli account di prova e stato aggiornato. Non dichiarare
   cancellazione automatica di copie CRM: la privacy distingue le due operazioni.

La schermata app non verificata può comparire durante la demo e deve essere
visibile. Il titolare completa manualmente eventuali passaggi di sicurezza e
concessione dei permessi. Non revocare connessioni operative solo per registrare.
Per mostrare il nuovo consenso usare preferibilmente un account di prova mai
collegato: un account già autorizzato può conservare il proprio grant precedente.
Caricare su YouTube come Non in elenco, accessibile senza richieste di accesso.
Titolo suggerito: Edilizia in Cloud - Google OAuth verification demo.
Aggiungere nella descrizione i timestamp reali dei capitoli.

## Verifiche completate

- Funzioni distribuite riletture e confrontate con i file previsti; autenticazione
  non modificata, chiamate prive di credenziali ancora rifiutate con 401.
- Flusso Gmail online osservato fino alla scelta account: stesso client
  232959366283-p5nl7pis2basl3p32mi3p3do26vrp6um.apps.googleusercontent.com,
  callback /azienda/impostazioni/integrazioni/email-callback e soltanto
  gmail.readonly, gmail.send, userinfo.email; include_granted_scopes=false.
- Nessun nuovo consenso concesso. Stato aggregato invariato: 3 active, 2 expired.
- Configurazione Google riletta dopo reload: permessi ridotti e motivazioni
  salvati. Nessuna richiesta di verifica inviata; video ancora da registrare.
- Privacy HTML e PDF v1.2 del 26 ottobre 2026 allineati. PDF di 12 pagine
  renderizzato e controllato, inclusa la sezione Google sulle pagine 11-12.

## Invio e prova finale

Confrontare sempre ambiti nel codice distribuito, console, video e privacy.
Accesso ai dati -> Save -> Centro di verifica -> Prepare for verification.
Controllare il riepilogo; solo dopo inviare e seguire le email di Google.
La verifica OAuth non sostituisce l'accesso API/Developer Token di Google Ads.
Dopo l'approvazione provare anche con un account esterno e verificare i rinnovi.

## Fonti ufficiali

- https://support.google.com/cloud/answer/13464321?hl=en
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/terms/api-services-user-data-policy
