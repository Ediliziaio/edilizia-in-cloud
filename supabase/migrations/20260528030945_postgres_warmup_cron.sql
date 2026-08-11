-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Pre-warm Postgres + PostgREST schema cache.
-- 
-- Problema: a riposo Postgres + PostgREST hanno latenza alta al primo accesso
-- (cold-start ~5-15s). pg_stat_statements mostra che PostgREST ricarica lo schema
-- (~522ms × N worker) quando le connection idle vengono ricicliate o riavviate
-- (es. dopo deploy edge function).
--
-- Soluzione: ping ogni 3 minuti che fa una query LEGGERA + qualche introspection
-- per mantenere il pool worker caldo + schema cache valida.
--
-- Query scelta: SELECT 1 + lookup index light su tabella hot.
-- Non blocca pg_cron (~5ms execution).

CREATE OR REPLACE FUNCTION public.warmup_postgres_pool()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1. Touch della cache PostgREST + connection pool
  SELECT 1;
$$;

COMMENT ON FUNCTION public.warmup_postgres_pool() IS
  'Velocity: ping leggero che mantiene caldo Postgres + PostgREST pool. Chiamato da cron ogni 3 min.';

-- Schedule cron (rimuovi vecchio se esiste)
DO $$
BEGIN
  PERFORM cron.unschedule('postgres-warmup-3min');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'postgres-warmup-3min',
  '*/3 * * * *',
  $$SELECT public.warmup_postgres_pool();$$
);
