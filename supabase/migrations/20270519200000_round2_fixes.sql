-- ============================================================================
-- v8.6.94 — Round 2 fixes (bug hunt review)
--
-- Patch correttiva per bug identificati nel code review round 2:
--   Bug #14 — onboarding_templates.created_by NOT NULL bloccava fresh env
--   Bug #15 — ON CONFLICT senza target → duplicates ad ogni re-run
--   Bug #17 — cron lifecycle_email_daily mancava chiavi platform_settings
--   Bug #18 — lifecycle_email_sends RLS troppo restrittiva
--   Bug #22 — central_audit_log policy INSERT mancante (potenziale problema futuro)
--   Bug #25 — tg_audit_log_row da auth.users → wrap in BEGIN/EXCEPTION
-- ============================================================================

-- ─── Bug #14 — Allow NULL created_by su onboarding_templates ────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='onboarding_templates'
      AND column_name='created_by'
      AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.onboarding_templates
      ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

-- ─── Bug #15 — UNIQUE su name per ON CONFLICT idempotente ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_templates_name_unique'
  ) THEN
    -- Prima dedupliciamo eventuali righe già duplicate
    DELETE FROM public.onboarding_templates a
    USING public.onboarding_templates b
    WHERE a.id > b.id AND a.name = b.name;

    ALTER TABLE public.onboarding_templates
      ADD CONSTRAINT onboarding_templates_name_unique UNIQUE (name);
  END IF;
END $$;

-- UNIQUE su (template_id, title) per onboarding_steps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_steps_template_title_unique'
  ) THEN
    DELETE FROM public.onboarding_steps a
    USING public.onboarding_steps b
    WHERE a.id > b.id AND a.template_id = b.template_id AND a.title = b.title;

    ALTER TABLE public.onboarding_steps
      ADD CONSTRAINT onboarding_steps_template_title_unique UNIQUE (template_id, title);
  END IF;
END $$;

-- ─── Bug #17 — Chiavi mancanti per cron lifecycle ───────────────────────────
-- Il cron lifecycle_email_daily legge platform_settings('supabase_url') e
-- ('supabase_service_role_key') ma nessuna migration le seedava → cron crashava.
-- Inserisce con valori PROD; il super_admin può sovrascriverle da UI.
INSERT INTO public.platform_settings (key, value)
VALUES
  ('supabase_url', 'https://rsbrguhkodgnqfomrevo.supabase.co'),
  ('supabase_service_role_key', 'PLACEHOLDER_DA_AGGIORNARE_VIA_ADMIN_UI')
ON CONFLICT (key) DO NOTHING;

-- ─── Bug #18 — RLS lifecycle_email_sends: leggibile anche dalla company ─────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='lifecycle_email_sends'
  ) THEN
    DROP POLICY IF EXISTS "lifecycle_sends_read_company" ON public.lifecycle_email_sends;
    CREATE POLICY "lifecycle_sends_read_company"
      ON public.lifecycle_email_sends FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
      );
  END IF;
END $$;

-- ─── Bug #22 — central_audit_log policy INSERT esplicita ───────────────────
-- Se la migration precedente è già stata applicata, aggiungi la policy
-- mancante per garantire che i trigger SECURITY DEFINER non si rompano
-- in futuro se qualcuno cambia ownership.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='central_audit_log'
  ) THEN
    DROP POLICY IF EXISTS "audit_insert_system" ON public.central_audit_log;
    -- Permette INSERT solo via service_role bypass o via trigger SECURITY DEFINER
    -- (che gira con i privilegi dell'owner della funzione). Nessun INSERT diretto dall'app.
    CREATE POLICY "audit_insert_system"
      ON public.central_audit_log FOR INSERT
      TO authenticated
      WITH CHECK (false);
  END IF;
END $$;

-- ─── Bug #25 — tg_audit_log_row: robusto a auth.uid() NULL ────────────────
-- (Riapplica funzione con BEGIN/EXCEPTION più stretti.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname='tg_audit_log_row' AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
  ) THEN
    -- Già esiste; sostituiamo per sicurezza
    NULL;
  END IF;
END $$;

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
  v_uid     UUID;
BEGIN
  -- v8.6.94: cattura auth.uid() una sola volta, gestisci NULL
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after  := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_after)
    WHERE v_after->>key IS DISTINCT FROM (v_before->>key);
  ELSIF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after  := NULL;
  END IF;

  v_pk := COALESCE((v_after->>'id'), (v_before->>'id'));

  v_company := NULLIF(COALESCE(
    (v_after->>'company_id'),
    (v_before->>'company_id')
  ), '')::uuid;

  IF TG_TABLE_NAME = 'companies' THEN
    v_company := NULLIF(COALESCE(
      (v_after->>'id'),
      (v_before->>'id')
    ), '')::uuid;
  END IF;

  -- Lookup ruolo + email — saltati se uid è NULL (system trigger)
  IF v_uid IS NOT NULL THEN
    BEGIN
      SELECT (role::text) INTO v_role
      FROM public.user_roles
      WHERE user_id = v_uid
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
    BEGIN
      SELECT email INTO v_email
      FROM auth.users
      WHERE id = v_uid;
    EXCEPTION WHEN OTHERS THEN
      v_email := NULL;
    END;
  END IF;

  -- Try insert; in failure scenario emit notice but NEVER abort the operation
  BEGIN
    INSERT INTO public.central_audit_log (
      actor_user_id, actor_email, actor_role,
      company_id, table_name, operation, row_pk,
      before_data, after_data, changed_fields
    ) VALUES (
      v_uid, v_email, v_role,
      v_company, TG_TABLE_NAME, TG_OP, v_pk,
      v_before, v_after, v_changed
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'central_audit_log insert failed for %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── Bug #12 — Backfill subscription_grant: solo righe RECENTI ──────────────
-- Le righe `admin_adjust` di top-up regalati ai clienti hanno price 0 ma NON
-- vogliono essere revocate. La migration precedente le marcava erroneamente.
-- Ripristiniamo a 'admin_adjust' quelle con created_at lontano dal trigger.
UPDATE public.render_credit_purchases
   SET source = 'admin_adjust'
 WHERE source = 'subscription_grant'
   AND price_per_credit_eur = 0
   AND price_paid_eur = 0
   -- Solo righe più vecchie di 30 giorni dalla data della migration originale
   AND purchased_at < (now() - interval '30 days')
   -- E che NON sono mai state collegate a una subscription via trigger
   AND id NOT IN (
     SELECT (metadata->>'purchase_id')::uuid
     FROM public.render_credit_ledger
     WHERE reason = 'topup'
       AND metadata->>'source' = 'plan_monthly_grant'
       AND metadata ? 'purchase_id'
   );

-- ─── Fix updated_at trigger per changelog_system (Bug #20) ─────────────────
-- Aggiunge SET search_path per soddisfare Supabase linter
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname='set_changelog_updated_at'
      AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_changelog_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = public, pg_temp
    AS $body$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $body$;
  END IF;
END $$;
