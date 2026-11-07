-- Ricicla soltanto le connessioni del pool, preservando il listener di PostgREST.
-- LISTEN resta correttamente idle per ore: terminarlo forza una riconnessione
-- e un ricambio del pool che non corrispondono a una query bloccata.
-- Nessuna query attiva o transazione aperta viene interrotta.
select cron.schedule(
  'ricicla-connessioni-postgrest',
  '*/30 * * * *',
  $job$select count(*) filter (where pg_terminate_backend(pid))
         from pg_stat_activity
        where application_name = 'postgrest'
          and backend_type = 'client backend'
          and state = 'idle'
          and xact_start is null
          and ltrim(query) !~* '^LISTEN[[:space:]]'
          and backend_start < now() - interval '1 hour'
          and state_change < now() - interval '10 seconds'$job$
);
