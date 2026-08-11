-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ERR Postgres: "cannot refresh materialized view mv_analytics_sede concurrently"
-- → manca UNIQUE INDEX (requisito PG). MV vuota, sicuro crearlo ora.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analytics_sede_unique
  ON public.mv_analytics_sede (sede_id, mese);

COMMENT ON INDEX public.idx_mv_analytics_sede_unique IS
  'Required for REFRESH MATERIALIZED VIEW CONCURRENTLY — sede_id+mese univoco per analytics mensili';
