-- Connessioni di PostgREST riciclate dopo 1 ora invece di 2 (1/11/2026).
--
-- Ogni connessione tiene in memoria la descrizione delle tabelle che ha usato, con regole di accesso e indici:
-- misurata l'1/11, fino a 65 MB con le 1.257 tabelle dello schema. Nelle ore di lavoro PostgREST ne apre ~40,
-- quindi fino a ~2,6 GB. Il job del 27/10 (20281027170000) chiude quelle ferme aperte da più di 2 ore: con 1 ora
-- la memoria accumulata si libera il doppio delle volte. Restano le stesse garanzie: solo connessioni ferme da più
-- di 10 secondi, nessuna query in corso toccata, PostgREST le riapre da solo.
select cron.schedule(
  'ricicla-connessioni-postgrest',
  '*/30 * * * *',
  $job$select count(*) filter (where pg_terminate_backend(pid))
         from pg_stat_activity
        where application_name = 'postgrest'
          and backend_type = 'client backend'
          and state = 'idle'
          and backend_start < now() - interval '1 hour'
          and state_change < now() - interval '10 seconds'$job$
);
