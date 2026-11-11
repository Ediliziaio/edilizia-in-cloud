# Pubblicazione e diagnosi della memoria — 11 novembre 2026

## Evidenze online prima della correzione

Il commit `43367d993` integra le modifiche concorrenti. Cloudflare Pages e Supabase Preview sono entrambi verdi, così come la CI completa e il deploy delle funzioni. Il branch Supabase principale è `FUNCTIONS_DEPLOYED` / `ACTIVE_HEALTHY`; gli advisor health sono vuoti.

Il precedente errore di bundling era un timeout di 10 secondi scaricando `iceberg-js` da esm.sh, dipendenza transitiva di storage-js. Le pubblicazioni successive sono riuscite senza alterare le funzioni aziendali o attivare servizi.

## Allarme memoria

Tre letture a 20 secondi di distanza: prenotazioni virtuali 120,9% di CommitLimit; RAM disponibile 43% (3,24 GiB su 7,54); swap occupato 61,6%. Una lettura successiva ha confermato circa il 42% di RAM disponibile e `node_vmstat_oom_kill=0`.

La foto database mostra 28 connessioni PostgREST inattive, nessuna query client attiva, nessuna transazione lasciata aperta, nessun cron in corso. Gli slot di replica attivi non trattengono WAL arretrato. Non emerge un processo da interrompere o un motivo per aumentare il piano.

La sentinella interpretava Committed_AS / CommitLimit come limite fisico vincolante a prescindere dalla configurazione Linux. Committed_AS misura prenotazioni virtuali. CommitLimit vincola l'allocazione nella modalità `vm.overcommit_memory=2`; le metriche disponibili non espongono tale modalità. Non si certifica qui la configurazione sysctl del servizio gestito.

Fonti primarie: [kernel Linux](https://docs.kernel.org/mm/overcommit-accounting.html), [metriche Supabase](https://supabase.com/docs/guides/observability/metrics).

## Correzione della sentinella

Le prenotazioni virtuali alte con oltre il 30% di RAM disponibile producono un avviso esplicito e conservano la foto diagnostica. Quando la RAM disponibile scende al 30% o meno, restano valide anche le soglie preventive precedenti del commit. Rimangono gli allarmi indipendenti sulla RAM disponibile (attenzione 20%, critico 10%) e sullo swap con RAM al 30% o meno. Tre letture confermano gli allarmi; la prova volontaria continua a fallire.

Non sono cambiati piano, memoria PostgreSQL, limiti di connessione, processi o automazioni. Il valore virtuale elevato resta visibile: il cambiamento evita di presentarlo da solo come RAM esaurita. Se il provider conferma modalità strict o un limite cgroup diverso dalla memoria esposta, il controllo andrà integrato con quel limite verificato.

## Verifica

22 test della sentinella memoria e del controllo database passati, compresi il caso reale, le soglie al 30% e al 10%, la RAM bassa con commit normale, lo swap con poco margine, le tre letture, la foto e la prova volontaria.

Squadd non modificato; nessun servizio a pagamento attivato. Le automazioni Solaria restano in bozza e non vengono inviati messaggi ai clienti.
