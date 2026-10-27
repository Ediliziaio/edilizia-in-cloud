-- Le connessioni di PostgREST vivono giorni (il 27/10 la più vecchia aveva 10 giorni): ognuna tiene in memoria
-- lo schema che ha incontrato (1.315 tabelle, 3.868 regole, 1.771 funzioni plpgsql con i piani in cache) e la
-- memoria del server saliva col passare delle ore fino al 100% del tetto (la Sentinella database era rossa).
-- Chiuderne 22 ferme ha liberato circa mezzo GiB (100% -> 90%) senza nessun errore agli utenti: PostgREST le
-- riapre da solo. Questo job lo fa ogni 30 minuti, solo per le connessioni ferme da più di 10 secondi e aperte da
-- più di 2 ore: nessuna query in corso viene toccata, e l'età massima resta sotto le 2 ore e mezza.
select cron.schedule(
  'ricicla-connessioni-postgrest',
  '*/30 * * * *',
  $job$select count(*) filter (where pg_terminate_backend(pid))
         from pg_stat_activity
        where application_name = 'postgrest'
          and backend_type = 'client backend'
          and state = 'idle'
          and backend_start < now() - interval '2 hours'
          and state_change < now() - interval '10 seconds'$job$
);
