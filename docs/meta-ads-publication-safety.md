# Pubblicazione Ads: destinazione, approvazione e invii simultanei

La Pagina deve essere selezionata nelle Integrazioni dell'azienda. Con più Pagine,
la bozza deve indicarne una; un ID esterno o non più selezionato viene rifiutato.
Prima della pubblicazione il server confronta la richiesta con la bozza salvata.

L'approvazione viene invalidata dal database quando cambiano configurazione,
nome, obiettivo, budget o account già assegnato. Il controllo della spesa verifica
anche che configurazione e budget coincidano con quelli approvati.

Ogni invio reale richiede una bozza salvata. Il servizio acquisisce un claim
univoco in `meta_campaign_publication_locks`, prima di creare oggetti su Meta.
La tabella è riservata al servizio. Durante l'invio, modifiche e cancellazioni
provenienti dal browser vengono bloccate. Campagna, gruppi e annunci nascono
in pausa; lo stato finale locale viene confermato soltanto alla fine.

## Recupero di un invio interrotto

Il claim non scade automaticamente: dopo un timeout non si può presumere che
Meta non abbia creato oggetti. Se il rollback non riesce a rimuovere tutto, il
claim resta e il tentativo successivo non crea duplicati.

Per il recupero, controllare su Meta gli oggetti del tentativo, la riga della
campagna e il relativo errore. Soltanto dopo aver verificato che gli oggetti
siano correttamente registrati oppure rimossi, riconciliare lo stato locale e
rilasciare il claim specifico tramite il servizio. Non introdurre una pulizia
periodica indiscriminata dei claim.

I test `metaAdsPublicationHandler` usano l'handler reale con Graph e database
simulati; `metaAdsPublicationDatabase` verifica trigger, privilegi e vincoli su
PostgreSQL locale. Nessun test attiva o pubblica campagne reali.
