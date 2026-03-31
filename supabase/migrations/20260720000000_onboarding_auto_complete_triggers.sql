-- Migration: Auto-completion triggers for onboarding_guide_steps
-- These triggers automatically mark onboarding steps as complete
-- when the relevant action occurs in the database.

-- Helper function: mark a single onboarding step as completed for a company
CREATE OR REPLACE FUNCTION public.complete_onboarding_step(
  p_company_id uuid,
  p_step_key   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.company_onboarding_progress
    (company_id, step_key, completed_at)
  VALUES
    (p_company_id, p_step_key, now())
  ON CONFLICT (company_id, step_key)
  DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    skipped_at   = NULL
  WHERE company_onboarding_progress.completed_at IS NULL;
END;
$$;

-- ── Trigger 1: create_first_order ─────────────────────────────────────────────
-- Fires after the first order is inserted for a company.

CREATE OR REPLACE FUNCTION public._trg_onboarding_first_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only on INSERT and only if company_id is present
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing orders for this company (excluding the current one)
  SELECT COUNT(*) INTO v_count
  FROM public.orders
  WHERE company_id = NEW.company_id
    AND id <> NEW.id;

  -- This is the first order
  IF v_count = 0 THEN
    PERFORM public.complete_onboarding_step(NEW.company_id, 'create_first_order');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_first_order ON public.orders;
CREATE TRIGGER trg_onboarding_first_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_onboarding_first_order();

-- ── Trigger 2: add_team_member ────────────────────────────────────────────────
-- Fires when a second user_role is added for a company (first non-owner member).

CREATE OR REPLACE FUNCTION public._trg_onboarding_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing members (other than the newly inserted one)
  SELECT COUNT(*) INTO v_count
  FROM public.user_roles
  WHERE company_id = NEW.company_id
    AND id <> NEW.id;

  -- At least one other member already exists → this is a new team member
  IF v_count >= 1 THEN
    PERFORM public.complete_onboarding_step(NEW.company_id, 'add_team_member');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_team_member ON public.user_roles;
CREATE TRIGGER trg_onboarding_team_member
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_onboarding_team_member();

-- ── Trigger 3: create_first_invoice ──────────────────────────────────────────
-- Fires when the first invoice is emitted by a company.

CREATE OR REPLACE FUNCTION public._trg_onboarding_first_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.invoices
  WHERE company_id = NEW.company_id
    AND id <> NEW.id;

  IF v_count = 0 THEN
    PERFORM public.complete_onboarding_step(NEW.company_id, 'create_first_invoice');
  END IF;

  RETURN NEW;
END;
$$;

-- Only apply if invoices table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    DROP TRIGGER IF EXISTS trg_onboarding_first_invoice ON public.invoices;
    CREATE TRIGGER trg_onboarding_first_invoice
      AFTER INSERT ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public._trg_onboarding_first_invoice();
  END IF;
END
$$;

-- ── Trigger 4: connect_banking ────────────────────────────────────────────────
-- Fires when a GoCardless bank connection is created for a company.

CREATE OR REPLACE FUNCTION public._trg_onboarding_connect_banking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.complete_onboarding_step(NEW.company_id, 'connect_banking');
  RETURN NEW;
END;
$$;

-- Only apply if bank_connections table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bank_connections') THEN
    DROP TRIGGER IF EXISTS trg_onboarding_connect_banking ON public.bank_connections;
    CREATE TRIGGER trg_onboarding_connect_banking
      AFTER INSERT ON public.bank_connections
      FOR EACH ROW
      EXECUTE FUNCTION public._trg_onboarding_connect_banking();
  END IF;
END
$$;

-- ── Grant: service_role can execute the helper ────────────────────────────────
GRANT EXECUTE ON FUNCTION public.complete_onboarding_step(uuid, text) TO service_role;
