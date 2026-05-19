-- ============================================================================
-- v8.6.92 — Central Audit Log + Trigger automatici
--
-- Tabella unica `central_audit_log` immutabile (no UPDATE/DELETE da app) che
-- raccoglie eventi di sicurezza/compliance da tutte le tabelle critiche:
--   companies, profiles, user_roles, orders, customers,
--   company_subscriptions, company_feature_overrides, platform_settings.
--
-- Trigger generic via funzione `tg_audit_log_row` che cattura
-- (op, before, after, user_id, ip, ua) per ogni INSERT/UPDATE/DELETE.
--
-- Default 2FA policies inserite in platform_settings.
-- ============================================================================

-- ─── 1. Tabella centrale ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.central_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Origin
  actor_user_id   UUID,                            -- auth.uid() al momento
  actor_email     TEXT,
  actor_role      TEXT,
  company_id      UUID,                            -- contesto company se rilevante
  -- Cosa è successo
  table_name      TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE','RPC','LOGIN','LOGOUT','EXPORT','GDPR_REQUEST')),
  row_pk          TEXT,                            -- ID della riga toccata
  before_data     JSONB,                           -- snapshot pre-update (NULL per INSERT)
  after_data      JSONB,                           -- snapshot post-update (NULL per DELETE)
  changed_fields  TEXT[],                          -- nomi colonne diff
  -- Context
  ip_address      INET,
  user_agent      TEXT,
  request_id      TEXT,
  notes           TEXT
);

-- Index per query frequenti
CREATE INDEX IF NOT EXISTS idx_central_audit_actor ON public.central_audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_central_audit_company ON public.central_audit_log (company_id, occurred_at DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_central_audit_table ON public.central_audit_log (table_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_central_audit_op ON public.central_audit_log (operation, occurred_at DESC);

ALTER TABLE public.central_audit_log ENABLE ROW LEVEL SECURITY;

-- Read: super_admin tutto, company_admin solo la sua company
DROP POLICY IF EXISTS "audit_read_super_admin" ON public.central_audit_log;
CREATE POLICY "audit_read_super_admin"
  ON public.central_audit_log FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  );

-- IMMUTABILITY: nessun UPDATE/DELETE dall'app (solo via direct DB)
DROP POLICY IF EXISTS "audit_no_mutate" ON public.central_audit_log;
CREATE POLICY "audit_no_mutate"
  ON public.central_audit_log FOR UPDATE
  TO authenticated USING (false);

DROP POLICY IF EXISTS "audit_no_delete" ON public.central_audit_log;
CREATE POLICY "audit_no_delete"
  ON public.central_audit_log FOR DELETE
  TO authenticated USING (false);

-- ─── 2. Funzione trigger generic ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_audit_log_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before  JSONB;
  v_after   JSONB;
  v_pk      TEXT;
  v_company UUID;
  v_changed TEXT[];
  v_role    TEXT;
  v_email   TEXT;
BEGIN
  -- Compute snapshots
  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after  := to_jsonb(NEW);
    v_pk     := COALESCE(NEW::record::text, '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    -- Cambi: confronta chiavi e raccoglie nomi diff
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_after)
    WHERE v_after->>key IS DISTINCT FROM (v_before->>key);
  ELSIF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after  := NULL;
  END IF;

  -- Estrai PK (campo "id" se presente)
  v_pk := COALESCE((v_after->>'id'), (v_before->>'id'), v_pk);

  -- Estrai company_id (campo "company_id" se presente)
  v_company := NULLIF(COALESCE(
    (v_after->>'company_id'),
    (v_before->>'company_id')
  ), '')::uuid;

  -- Per la tabella companies, company_id = la riga stessa
  IF TG_TABLE_NAME = 'companies' THEN
    v_company := NULLIF(COALESCE(
      (v_after->>'id'),
      (v_before->>'id')
    ), '')::uuid;
  END IF;

  -- Lookup ruolo + email dell'attore (best-effort, non blocca)
  BEGIN
    SELECT (role::text) INTO v_role
    FROM public.user_roles
    WHERE user_id = auth.uid()
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;
  BEGIN
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  INSERT INTO public.central_audit_log (
    actor_user_id, actor_email, actor_role,
    company_id, table_name, operation, row_pk,
    before_data, after_data, changed_fields
  ) VALUES (
    auth.uid(), v_email, v_role,
    v_company, TG_TABLE_NAME, TG_OP, v_pk,
    v_before, v_after, v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── 3. Trigger su tabelle critiche ────────────────────────────────────────
-- Helper per applicare il trigger se la tabella esiste
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'companies',
    'profiles',
    'user_roles',
    'company_subscriptions',
    'company_feature_overrides',
    'platform_settings',
    'subscription_plans',
    'plan_feature_defaults'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I',
        v_table, v_table
      );
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I
           AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.tg_audit_log_row()',
        v_table, v_table
      );
    END IF;
  END LOOP;
END $$;

-- ─── 4. RPC log_audit_event per logging manuale ────────────────────────────
-- Edge functions / app possono loggare eventi non DB (LOGIN, EXPORT, GDPR_REQUEST).
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_operation  TEXT,
  p_table_name TEXT DEFAULT 'manual',
  p_company_id UUID DEFAULT NULL,
  p_row_pk     TEXT DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL,
  p_ip         INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    UUID;
  v_email TEXT;
  v_role  TEXT;
BEGIN
  IF p_operation NOT IN ('LOGIN','LOGOUT','EXPORT','GDPR_REQUEST','RPC') THEN
    RAISE EXCEPTION 'Operation % not allowed via manual log', p_operation;
  END IF;

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    SELECT (role::text) INTO v_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO public.central_audit_log (
    actor_user_id, actor_email, actor_role,
    company_id, table_name, operation, row_pk,
    notes, ip_address, user_agent
  ) VALUES (
    auth.uid(), v_email, v_role,
    p_company_id, p_table_name, p_operation, p_row_pk,
    p_notes, p_ip, p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, TEXT, TEXT, INET, TEXT)
  TO authenticated, service_role;

-- ─── 5. Default 2FA policies ────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value)
VALUES
  ('force_2fa_super_admin', 'true'),
  ('force_2fa_company_admin', 'false')
ON CONFLICT (key) DO NOTHING;
