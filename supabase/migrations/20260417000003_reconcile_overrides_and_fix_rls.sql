-- ============================================================================
-- P0 · Riconciliazione schemi duplicati + fix RLS super_admin rotte
-- ============================================================================
-- Due migrazioni diverse hanno creato lo stesso nome tabella con colonne
-- diverse: dato che entrambe usano `CREATE TABLE IF NOT EXISTS`, la seconda
-- non aggiunge le colonne mancanti. Questa migration garantisce che entrambe
-- le tabelle abbiano l'UNION delle colonne previste da qualunque migration
-- precedente (idempotente via ADD COLUMN IF NOT EXISTS).
--
-- Inoltre diverse policy RLS usano `auth.jwt() ->> 'role'` che NON
-- contiene il ruolo applicativo (il jwt espone solo `role: authenticated`).
-- Le sostituiamo con `public.has_role(auth.uid(), 'super_admin'::app_role)`
-- che legge dalla tabella `user_roles`, unica fonte di verità.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1) RICONCILIAZIONE company_feature_overrides
-- ──────────────────────────────────────────────────────────────────────────
-- v1 (marzo): is_enabled NOT NULL, override_reason, override_by, expires_at
-- v2 (aprile): is_enabled NULLABLE, limit_value, price_override, notes,
--              set_by, set_by_email, updated_at
-- UNION: tutte le colonne, is_enabled NULLABLE per supportare ternary
--        (NULL = eredita dal piano, TRUE = forza on, FALSE = forza off)

ALTER TABLE public.company_feature_overrides
  ADD COLUMN IF NOT EXISTS limit_value     INTEGER        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_override  NUMERIC(10,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes           TEXT,
  ADD COLUMN IF NOT EXISTS set_by          UUID,
  ADD COLUMN IF NOT EXISTS set_by_email    TEXT,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS override_by     UUID,
  ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ    DEFAULT now();

-- Rilassa is_enabled a NULLABLE (v2 semantics). DROP NOT NULL è idempotente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'company_feature_overrides'
      AND column_name  = 'is_enabled'
      AND is_nullable  = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.company_feature_overrides ALTER COLUMN is_enabled DROP NOT NULL';
  END IF;
END $$;

-- FK a platform_feature_flags può essere bloccante se il catalogo non
-- contiene tutte le feature_key storiche. La rimuoviamo qui (soft) perché la
-- validazione avverrà a livello applicativo tramite RPC resolve_company_feature.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.company_feature_overrides'::regclass
     AND contype  = 'f'
     AND pg_get_constraintdef(oid) ILIKE '%feature_key%REFERENCES%platform_feature_flags%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.company_feature_overrides DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cfo_company_feature
  ON public.company_feature_overrides(company_id, feature_key);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) RICONCILIAZIONE company_billing_overrides
-- ──────────────────────────────────────────────────────────────────────────
-- v1 (marzo): service CHECK IN (...), is_free, price_per_unit_eur,
--             markup_multiplier, monthly_fee_eur, custom_notes, updated_by
-- v2 (aprile): service TEXT DEFAULT 'plan', custom_plan_price_eur,
--              override_notes, override_expires_at, created_by
-- UNION: tutte le colonne; allentiamo il CHECK per ammettere 'plan'.

ALTER TABLE public.company_billing_overrides
  ADD COLUMN IF NOT EXISTS custom_plan_price_eur NUMERIC,
  ADD COLUMN IF NOT EXISTS override_notes        TEXT,
  ADD COLUMN IF NOT EXISTS override_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by            UUID,
  ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_free               BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_per_unit_eur    NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS markup_multiplier     NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS monthly_fee_eur       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custom_notes          TEXT,
  ADD COLUMN IF NOT EXISTS updated_by            UUID;

-- Rilassa il CHECK originale su `service` per ammettere anche 'plan'
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.company_billing_overrides'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%service%IN%email%ai_agents%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.company_billing_overrides DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.company_billing_overrides
  DROP CONSTRAINT IF EXISTS company_billing_overrides_service_check;

ALTER TABLE public.company_billing_overrides
  ADD CONSTRAINT company_billing_overrides_service_check
  CHECK (service IN ('plan','email','ai_agents','whatsapp','sms','phone_numbers'));

CREATE INDEX IF NOT EXISTS idx_cbo_company_service
  ON public.company_billing_overrides(company_id, service);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) FIX RLS SUPER_ADMIN ROTTE
-- ──────────────────────────────────────────────────────────────────────────
-- Queste policy usano `auth.jwt() ->> 'role'` che espone solo il ruolo
-- Supabase (authenticated/anon/service_role), non il ruolo applicativo.
-- Risultato: la policy **blocca ogni accesso, anche per super_admin**.
-- Le ricreiamo con `public.has_role(auth.uid(), 'super_admin'::app_role)`.

-- Helper idempotente: drop + recreate policy
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('company_billing_overrides',  'sa_only'),
      ('platform_webhooks',          'sa_only'),
      ('promo_codes',                'super_admin_only'),
      ('dunning_email_templates',    'superadmin_dunning_all'),
      ('csv_import_jobs',            'superadmin_csv_all'),
      ('crm_campaigns',              'super_admin_crm_campaigns_gap'),
      ('campaign_variants',          'superadmin_cv_all'),
      ('campaign_events',            'superadmin_ce_all'),
      ('lifecycle_playbooks',        'superadmin_playbooks_all'),
      ('playbook_executions',        'superadmin_pe_all'),
      ('company_flag_audit_log',     'superadmin_audit_all'),
      ('failure_alerts',             'superadmin_fa_all')
    ) AS t(tbl, pol)
  LOOP
    -- drop se la tabella esiste
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = target.tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target.pol, target.tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL '
        'USING (public.has_role(auth.uid(), ''super_admin''::app_role)) '
        'WITH CHECK (public.has_role(auth.uid(), ''super_admin''::app_role))',
        target.pol, target.tbl
      );
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Consolidamento: company_admin read-only sugli override della sua azienda
-- ──────────────────────────────────────────────────────────────────────────
-- Oltre al super_admin, diamo al company_admin la possibilità di *leggere*
-- (SELECT) gli override della propria azienda (serve al FE per gating).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname='public' AND c.relname='company_feature_overrides') THEN
    DROP POLICY IF EXISTS "company_read_own_feature_overrides" ON public.company_feature_overrides;
    EXECUTE 'CREATE POLICY "company_read_own_feature_overrides" ON public.company_feature_overrides '
         || 'FOR SELECT USING ('
         || '  public.has_role(auth.uid(), ''super_admin''::app_role) '
         || '  OR company_id = public.get_my_company_id()'
         || ')';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname='public' AND c.relname='company_billing_overrides') THEN
    DROP POLICY IF EXISTS "company_read_own_billing_overrides" ON public.company_billing_overrides;
    EXECUTE 'CREATE POLICY "company_read_own_billing_overrides" ON public.company_billing_overrides '
         || 'FOR SELECT USING ('
         || '  public.has_role(auth.uid(), ''super_admin''::app_role) '
         || '  OR company_id = public.get_my_company_id()'
         || ')';
  END IF;
END $$;

COMMENT ON TABLE public.company_feature_overrides IS
  'Override per-azienda sulle feature. is_enabled NULL = eredita dal piano, TRUE/FALSE = forza. limit_value e price_override facoltativi.';

COMMENT ON TABLE public.company_billing_overrides IS
  'Override prezzi per-azienda per servizio (plan/email/ai_agents/...). NULL sui campi override = usa default del piano.';
