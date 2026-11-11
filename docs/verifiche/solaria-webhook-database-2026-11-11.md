# Chiusura webhook globali e ricostruzione database

## Scopo e limiti

Il sorgente delle migrazioni viene verificato da zero su PostgreSQL 17.11 con le basi ufficiali Auth e Storage. Il container non ha rete e non esegue cron. Il controllo non crea progetti o branch Supabase ospitati, non copia dati clienti e non abilita servizi a pagamento. Le vecchie migrazioni già registrate non vengono rieseguite sul progetto online.

Le patch recuperate che precedevano le proprie dipendenze registrano un marcatore privato e vengono completate alla barriera 20290311175000 (la patch ricevimenti viene completata già al confine delle dipendenze di novembre, prima delle modifiche agli ordini parziali). Senza marcatori, quella barriera non sostituisce funzioni di produzione. I controlli sulle impronte ammettono esclusivamente le versioni ricostruite esplicite; una versione sconosciuta continua a interrompere il replay. I test controllano anche questo comportamento.

## Webhook delle impostazioni aziendali

Gli eventi scelti nelle impostazioni vengono inseriti in coda nella stessa transazione del cambiamento aziendale. Sono coperti contatti, opportunità, fasi/stati, commesse, appuntamenti CRM, attività e pagamenti. Il payload usa una lista di campi consentiti: non esporta note o metadati arbitrari. Le normali modifiche ai soli timestamp tecnici non generano eventi.

Il worker prende una lease, invia con concorrenza massima quattro e registra l'esito soltanto con la lease corretta. Sono previsti quattro tentativi per ciclo, con attese di 5, 15 e 60 minuti. Il registro conserva il numero totale dei tentativi anche dopo una ripetizione manuale. La soglia di errori consecutivi mette in pausa la destinazione; la ripresa è esplicita. I test non inseriscono eventi aziendali né ricevute.

La consegna è **almeno una volta**: un crash dopo la risposta del destinatario può richiedere una ripetizione. Il destinatario deve deduplicare `X-Webhook-ID`. ID, timestamp dell'evento e corpo rimangono stabili tra tentativi. `X-Webhook-Timestamp` indica invece il singolo invio.

Firma compatibile: `X-Webhook-Signature = sha256=HMAC_SHA256(secret, body)`.
Firma con controllo di freschezza: `X-Webhook-Signature-V2 = sha256=HMAC_SHA256(secret, X-Webhook-Timestamp + "." + body)`.
Il destinatario deve confrontare la firma in tempo costante e, per V2, verificare l'età dell'invio.

Il worker accetta solo il segreto cron; il browser non può richiedere una consegna arbitraria. Prove e ripetizioni richiedono Integrazioni in modifica e rispettano la sola lettura. La chiave di firma non è leggibile dal client. Sono richiesti HTTPS, DNS pubblico, niente redirect e rispetto dell'eventuale lista IP. La risposta del destinatario non viene conservata, per evitare che una risposta rifletta credenziali o dati personali.

Il cron non chiama il worker quando non c'è lavoro. `task.overdue` rappresenta lo stato attuale: dopo l'iscrizione può rilevare anche attività già scadute, una sola volta per attività e scadenza. Una data di scadenza uguale a oggi in Italia non è ancora scaduta. Gli altri eventi non vengono ricostruiti retroattivamente.

## Pubblicazione e account

Le verifiche Git usano tag `verify-automation-completion-*`, non nuovi branch ospitati. Il deploy resta limitato a main. Prima del cron va pubblicato il worker. Le tre nuove versioni SQL devono coincidere con il registro remoto.

Restano al titolare: collegare la casella email e autorizzare il provider; collegare WhatsApp Business con numero e modelli approvati; autorizzare i calendari personali; collegare Meta Lead Ads e fornire destinazioni/credenziali Consolidata. Nessuna automazione Solaria viene pubblicata automaticamente per effetto di queste modifiche.
