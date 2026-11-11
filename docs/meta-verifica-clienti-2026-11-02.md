# Verifica Meta per le aziende clienti

Controllo del 2 novembre 2026 sull’app Edilizia in Cloud, ID `795702233553170`.
L’app è pubblicata e il portfolio aziendale è verificato. Questo non rende
automaticamente disponibili ai clienti tutti i permessi richiesti dal login.

## Stato rilevato nel pannello Meta

| Permesso o funzione | Stato attuale |
| --- | --- |
| `ads_management` | Pronto per la pubblicazione |
| `pages_manage_ads` | Pronto per la pubblicazione |
| `leads_retrieval` | Pronto per la pubblicazione |
| `business_management` | Pronta per il test; approvazione presente nell’invio storico di luglio |
| `pages_show_list` | Pronta per il test; approvazione presente nell’invio storico di giugno |
| `pages_read_engagement` | Pronta per il test; approvazione presente nell’invio storico di giugno |
| `pages_manage_metadata` | Pronta per il test; richiesta in bozza, non inviata |
| `ads_read` | Analisi dell’app rifiutata |
| Marketing API Access Tier | Accesso limitato |

Fonti: [permessi per i lead](https://developers.facebook.com/apps/795702233553170/use_cases/customize/?use_case_enum=MARKETING_API_LEADS_CAPTURE),
[feedback dell’invio](https://developers.facebook.com/apps/795702233553170/app-review/submissions/feedback/?submission_id=915120568278002).

Il feedback di `ads_read` richiede un nuovo video che mostri il percorso completo:
login Meta, consenso e utilizzo dei dati nella funzionalità descritta.
La revisione accetta il caso d’uso, ma il video precedente non lo dimostrava.
Le etichette attuali e le approvazioni storiche non coincidono per tre permessi:
prima della prova con un cliente esterno occorre chiarire il livello corrente
attraverso l’azione «Aumenta accesso» o l’assistenza Meta. Non considerare una
vecchia approvazione come prova dell’accesso attuale per tutti.

Questi elementi sono compatibili con il funzionamento per un amministratore
dell’app e il fallimento per un cliente esterno. Per attribuire uno specifico
tentativo fallito serve anche il relativo errore OAuth o API; non è stata ancora
eseguita una prova end-to-end con un account esterno senza ruoli sull’app Meta.

## Correzione del login

`metaPermessi.ts` separa `ads_read` e `pages_manage_metadata` dai permessi base.
I gruppi `reportPubblicitari` e `webhookPagine` hanno valore predefinito
`revisione`: sono richiesti solo al superadmin, come gli altri permessi in prova.
Le impostazioni esistenti restano leggibili e ogni gruppo può essere attivato
separatamente dopo la conferma del suo accesso per i clienti.

Questa correzione non concede approvazioni Meta. In particolare, un nuovo token
privo di `pages_manage_metadata` non abilita l’iscrizione ai webhook delle Pagine:
il recupero periodico dei lead non equivale alla ricezione in tempo reale.
Non attivare `webhookPagine` per tutti finché il permesso non è approvato.
I test coprono l’esclusione degli scope in revisione dai login dei clienti,
la disponibilità per il superadmin e l’attivazione indipendente dopo approvazione.
Non vengono modificati credenziali, token memorizzati, ruoli o collegamenti.

La sola funzione `meta-oauth-start` è stata aggiornata online dalla versione 120
alla 121. Riletti tutti i file pubblicati: corrispondono al bundle preparato,
con una sola modifica al selettore degli scope. Il controllo di autenticazione
resta invariato: una richiesta senza sessione riceve `401 Unauthorized`.
Verifiche locali: 49 test superati e controllo TypeScript mirato superato.

## Testo per pages manage metadata

Il testo seguente è già salvato nella bozza Meta, senza video e senza accettare
la dichiarazione finale sull’uso consentito.

> Edilizia in Cloud is a CRM used by independent construction companies. After a company administrator completes Facebook Login and explicitly selects a Page and lead forms in the integration wizard, our backend uses pages_manage_metadata to subscribe that selected Page to the leadgen webhook via /{page-id}/subscribed_apps. When a prospect submits a selected lead form, Meta sends a webhook notification to our backend. We retrieve the lead details using the separately approved leads_retrieval permission and create or update the lead in that company’s CRM. The permission is needed to enable Page webhook subscriptions so the company can receive new leads promptly without relying only on periodic recovery. We request access only to assets authorized by the administrator and route leads to the company that configured the integration. This request concerns Page webhook subscriptions; it does not claim that pages_manage_metadata provides access to private messages. The screencast will show login, consent, Page and form selection, activation, a test form submission, and the resulting lead in the company CRM.

## Testo per ads read

Testo preparato per una nuova richiesta; `ads_read` non risulta incluso nella
bozza corrente. Non inviare senza mostrare davvero le funzioni descritte.

> Edilizia in Cloud enables a construction company to view advertising performance for the ad account explicitly selected by its administrator. After Facebook Login and authorization, the administrator selects the ad account and opens the advertising reports in the CRM. The application reads campaign performance through the Ads Insights API and displays spend, impressions, clicks and the available lead results for the selected reporting period. ads_read is requested for this reporting workflow. We do not use this permission to publish ads or change budgets. The screencast demonstrates the complete login and consent flow, ad account selection, the reporting period selection, and the advertising metrics displayed inside the application. It uses a test company and an authorized ad account, without exposing unrelated customer data.

Verificare sullo schermo i nomi delle metriche disponibili nell’account usato.
Per la sola lettura valutare un collegamento distinto da quello di gestione
campagne: non chiedere permessi di scrittura per giustificare un report.

## Video da registrare

Usare un’azienda di prova, una Pagina e un account pubblicitario autorizzati.
Non scollegare un’integrazione cliente attiva per registrare il video. Il ruolo
superadmin nel gestionale e il ruolo di sviluppatore/tester nell’app Meta sono
due cose diverse: per provare permessi non approvati occorre anche il secondo.

1. Mostrare l’indirizzo `https://app.ediliziaincloud.com` e il nome dell’azienda
   di prova. Aprire Impostazioni, Integrazioni, Meta.
2. Avviare il collegamento o «Aggiorna permessi». Mostrare il vero dialogo Meta,
   il nome dell’app, il consenso e la selezione delle risorse. Non mostrare
   password, codici di accesso, token o URL contenenti codici OAuth.
3. Tornare nel gestionale; scegliere la Pagina, i moduli lead e l’account
   pubblicitario dell’azienda di prova. Mostrare l’attivazione.
4. Per i webhook, inviare un lead di prova con dati inventati e distinguibili;
   mostrare il suo arrivo nel CRM e la corrispondenza con Pagina e modulo.
   Verificare che arrivi tramite webhook, non solo tramite recupero periodico.
5. Per i report, aprire la reportistica pubblicitaria, cambiare periodo e mostrare
   le metriche dell’account selezionato. Questo passaggio mancava nella prova
   rifiutata: il solo consenso non dimostra l’utilizzo di `ads_read`.
6. Mostrare separatamente le altre funzioni soltanto se incluse nella richiesta:
   messaggistica, pubblicazione post e statistiche social richiedono dimostrazioni
   proprie. Non inserire permessi Instagram non usati dal flusso dimostrato.

Nel feedback Meta chiede interfaccia in inglese, sottotitoli e spiegazioni degli
elementi. Se l’interfaccia non è disponibile in inglese, aggiungere sottotitoli
inglesi completi e segnalare la lingua nelle istruzioni, senza dichiarare di aver
rispettato un requisito che non si è potuto soddisfare. La voce è utile, ma il
contenuto visibile e le spiegazioni devono bastare anche senza audio.
Non usare un limite di durata arbitrario che tagli i passaggi necessari.

## Passaggi finali e collaudo

1. Chiarire/richiedere il livello per aziende esterne dei permessi oggi in test.
   Controllare separatamente Marketing API Access Tier: il suo stato limitato
   non dimostra da solo che sia la causa del singolo errore di collegamento.
2. Completare la richiesta di `pages_manage_metadata`, reinserire `ads_read`
   nella revisione se necessario e includere le dipendenze richieste da Meta.
3. Allegare il video; fornire istruzioni riproducibili e un accesso di prova
   attraverso i campi sicuri della console. Le credenziali non vanno nel repo.
4. Rivedere le risposte sulla gestione dei dati e le dichiarazioni finali con il
   titolare. La bozza non può essere inviata finché i passaggi richiesti restano
   incompleti. Non accettare dichiarazioni sulla base di supposizioni.
5. Dopo l’approvazione, attivare soltanto i gruppi approvati preservando le altre
   chiavi di `meta_permessi_modalita`; poi usare «Aggiorna permessi» per i token
   che devono ricevere i nuovi scope, senza cancellare le integrazioni.
6. Provare con un utente aziendale esterno senza ruoli sull’app Meta: collegamento,
   elenco/selezione risorse, report, lead di prova via webhook, nuova connessione
   senza perdita dei moduli già attivati. Controllare gli errori effettivi e i
   permessi concessi; non dichiarare completata la soluzione con la sola prova
   dell’amministratore dell’app.

Privacy pubblica: [informativa](https://ediliziaincloud.com/privacy-policy/).
Controllare nella console Meta gli URL effettivamente configurati e la procedura
di cancellazione dati prima dell’invio. Gli URL `.it` nella guida di maggio sono
storici e non vanno copiati senza verifica.
