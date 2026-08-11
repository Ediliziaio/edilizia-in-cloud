-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.notifiche_preferenze (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  utente_id uuid NOT NULL,
  digest_mattino time, digest_sera time,
  canali text[] NOT NULL DEFAULT '{in_app}',
  soglia_urgenza text NOT NULL DEFAULT 'media',
  vip_mittenti text[] NOT NULL DEFAULT '{}',
  giorni_scadenza int NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, utente_id)
);
CREATE TABLE IF NOT EXISTS public.digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  utente_id uuid NOT NULL,
  generato_at timestamptz NOT NULL DEFAULT now(),
  contenuto jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_digest_log_user ON public.digest_log (company_id, utente_id, generato_at DESC);
ALTER TABLE public.notifiche_preferenze ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifiche_pref_self ON public.notifiche_preferenze;
CREATE POLICY notifiche_pref_self ON public.notifiche_preferenze FOR ALL TO authenticated
  USING (utente_id = auth.uid() AND company_id = public.get_effective_company_id())
  WITH CHECK (utente_id = auth.uid() AND company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS notifiche_pref_service ON public.notifiche_preferenze;
CREATE POLICY notifiche_pref_service ON public.notifiche_preferenze FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.digest_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS digest_log_self ON public.digest_log;
CREATE POLICY digest_log_self ON public.digest_log FOR SELECT TO authenticated
  USING (utente_id = auth.uid() AND company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS digest_log_service ON public.digest_log;
CREATE POLICY digest_log_service ON public.digest_log FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.notifiche_preferenze IS 'MP-EMAIL-AI-14: preferenze digest/alert per utente.';
COMMENT ON TABLE public.digest_log IS 'MP-EMAIL-AI-14: digest generati (cache + storico).';
