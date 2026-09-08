-- Squadre uniche e calendari lavori (08/09/2026). Vedi
-- docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md
--
-- `external_teams` era «la squadra come etichetta colorata sulla commessa»;
-- `subappaltatori` era «la ditta che entra in /campo». Da qui in poi la squadra
-- è una cosa sola: ha un tipo, può avere un login e un calendario Google.
-- Applicata sul live via Management API (lock_timeout breve), poi
-- `supabase migration repair --status applied 20280912000000 --linked`.

ALTER TABLE public.external_teams
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'esterna',
  ADD COLUMN IF NOT EXISTS subappaltatore_id uuid REFERENCES public.subappaltatori(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leader_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_last_error text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_teams_kind_valido') THEN
    ALTER TABLE public.external_teams
      ADD CONSTRAINT external_teams_kind_valido CHECK (kind IN ('interna', 'esterna'));
  END IF;
END $$;

-- Un calendario Google appartiene a una sola squadra.
CREATE UNIQUE INDEX IF NOT EXISTS ux_external_teams_google_calendar
  ON public.external_teams (google_connection_id, google_calendar_id)
  WHERE google_connection_id IS NOT NULL AND google_calendar_id IS NOT NULL;

COMMENT ON COLUMN public.external_teams.kind IS 'interna (dipendenti) | esterna (ditta)';
COMMENT ON COLUMN public.external_teams.subappaltatore_id IS 'Il login della squadra in /campo, se ce l''ha';
COMMENT ON COLUMN public.external_teams.google_calendar_id IS 'Calendario Google (dell''account google_connection_id) dove finiscono le pose della squadra';

-- ── Calendari standard dell'azienda ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_calendar_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('posa')),
  google_connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE SET NULL,
  google_calendar_id text,
  enabled boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind)
);

COMMENT ON TABLE public.company_calendar_links IS
  'Calendari standard del calendario lavori collegati a un calendario Google: per ora solo «posa» (tutte le pose dell''azienda).';

ALTER TABLE public.company_calendar_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_calendar_links_lettura_azienda ON public.company_calendar_links;
CREATE POLICY company_calendar_links_lettura_azienda ON public.company_calendar_links
  FOR SELECT USING (company_id = public.get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS company_calendar_links_admin ON public.company_calendar_links;
CREATE POLICY company_calendar_links_admin ON public.company_calendar_links
  FOR ALL USING (
    public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  ) WITH CHECK (
    public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS company_calendar_links_super_admin ON public.company_calendar_links;
CREATE POLICY company_calendar_links_super_admin ON public.company_calendar_links
  FOR ALL USING (public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_calendar_links TO authenticated;
