-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- SECURITY (advisor rls_disabled_in_public): 5 tabelle catalogo/cache fotovoltaico
-- erano PUBBLICHE senza RLS → chiunque con anon key poteva modificarle/cancellarle.
-- Sono dati di RIFERIMENTO sistema (incentivi, parametri solari, cache PVGIS),
-- non per-tenant. Fix: RLS ON + lettura pubblica (anon+authenticated) + scrittura
-- riservata a service_role (edge functions che popolano cache/cataloghi).
-- service_role BYPASSA RLS → le edge function continuano a scrivere normalmente.

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'fv_incentivi_catalogo','fv_solar_api_cache','fv_pvgis_cache',
    'fv_parametri_calcolo','fv_profili_autoconsumo'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- Policy SELECT pubblica (lettura per tutti — sono dati di riferimento)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);',
      t || '_public_read', t
    );
    -- NESSUNA policy INSERT/UPDATE/DELETE → default deny per anon/authenticated.
    -- service_role bypassa RLS e mantiene il controllo completo (cache/seed).
  END LOOP;
END $$;
