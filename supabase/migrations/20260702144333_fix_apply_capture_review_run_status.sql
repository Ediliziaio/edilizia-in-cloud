-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Il check di preventivo_da_foto_runs non ammette 'completed': lo stato
-- corretto post-review è 'reviewed'.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'silvio_tool_apply_capture_review';
  d := replace(d, $q$status = 'completed'$q$, $q$status = 'reviewed'$q$);
  IF d LIKE $q$%status = 'completed'%$q$ THEN
    RAISE EXCEPTION 'replace non applicato';
  END IF;
  EXECUTE d;
END $$;
