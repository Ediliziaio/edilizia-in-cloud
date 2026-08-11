-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-EMAIL-AI-05 · Motore di Regole di Instradamento Email
CREATE TABLE IF NOT EXISTS public.email_regole (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  origine         text NOT NULL DEFAULT 'manuale',
  stato           text NOT NULL DEFAULT 'attiva',
  priorita        int  NOT NULL DEFAULT 100,
  combinatore     text NOT NULL DEFAULT 'AND',
  condizioni      jsonb NOT NULL DEFAULT '[]'::jsonb,
  azioni          jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporto        int DEFAULT 0,
  creata_da       uuid,
  approvata_da    uuid,
  match_count     int NOT NULL DEFAULT 0,
  ultimo_match_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_regole_origine_check CHECK (origine IN ('manuale', 'auto')),
  CONSTRAINT email_regole_stato_check CHECK (stato IN ('attiva', 'in_approvazione', 'disattivata', 'rifiutata')),
  CONSTRAINT email_regole_combinatore_check CHECK (combinatore IN ('AND', 'OR'))
);
CREATE INDEX IF NOT EXISTS idx_email_regole_eval ON public.email_regole (company_id, stato, priorita) WHERE stato = 'attiva';
CREATE INDEX IF NOT EXISTS idx_email_regole_company ON public.email_regole (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_email_regole_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_email_regole_updated_at ON public.email_regole;
CREATE TRIGGER trg_email_regole_updated_at BEFORE UPDATE ON public.email_regole FOR EACH ROW EXECUTE FUNCTION public.tg_email_regole_updated_at();

ALTER TABLE public.email_regole ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_regole_company_read ON public.email_regole;
CREATE POLICY email_regole_company_read ON public.email_regole FOR SELECT TO authenticated USING (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_regole_company_write ON public.email_regole;
CREATE POLICY email_regole_company_write ON public.email_regole FOR INSERT TO authenticated WITH CHECK (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_regole_company_update ON public.email_regole;
CREATE POLICY email_regole_company_update ON public.email_regole FOR UPDATE TO authenticated USING (company_id = public.get_effective_company_id()) WITH CHECK (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_regole_company_delete ON public.email_regole;
CREATE POLICY email_regole_company_delete ON public.email_regole FOR DELETE TO authenticated USING (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_regole_service_all ON public.email_regole;
CREATE POLICY email_regole_service_all ON public.email_regole FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS email_regole_super_admin ON public.email_regole;
CREATE POLICY email_regole_super_admin ON public.email_regole FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.bump_email_regola_match(p_regola_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.email_regole SET match_count = match_count + 1, ultimo_match_at = now() WHERE id = p_regola_id;
END $$;
GRANT EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) TO service_role, authenticated;
