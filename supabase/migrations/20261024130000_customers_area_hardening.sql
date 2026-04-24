-- Hardening area /azienda/clienti:
--   1. Toggle "Area privata clienti" a livello company (companies.customer_portal_enabled)
--   2. Flag profiles.portal_disabled per i clienti creati senza accesso al portale
--   3. RPC get_customer_stats per dashboard KPI (totale, mese corrente, mese scorso, trend)
--   4. Index supplementari su profiles per ricerca/paginazione

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. COMPANIES: toggle area privata clienti
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS customer_portal_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.companies.customer_portal_enabled IS
  'Se FALSE, la creazione di un cliente non produce un account di accesso al portale (solo anagrafica).';

-- ────────────────────────────────────────────────────────────────────
-- 2. PROFILES: flag portal_disabled per clienti creati senza accesso
-- ────────────────────────────────────────────────────────────────────
-- Aggiungiamo una colonna per tracciare i profili cliente che non hanno
-- credenziali di accesso (pur esistendo in auth.users come shell per FK).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_disabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.portal_disabled IS
  'TRUE = cliente creato solo come anagrafica, non può accedere al portale (password random, is_blocked=true).';

-- Indice per query clienti (profiles + filter customer)
CREATE INDEX IF NOT EXISTS idx_profiles_company_created
  ON public.profiles(company_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- 3. RPC get_customer_stats — KPI dashboard
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_stats(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
  v_total INT;
  v_month_current INT;
  v_month_previous INT;
  v_with_orders INT;
  v_without_orders INT;
  v_portal_disabled INT;
  v_current_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_previous_month_start TIMESTAMPTZ := date_trunc('month', now()) - INTERVAL '1 month';
BEGIN
  -- Totale clienti della company
  SELECT COUNT(*)
  INTO v_total
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id;

  -- Nuovi questo mese
  SELECT COUNT(*)
  INTO v_month_current
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND p.created_at >= v_current_month_start;

  -- Nuovi mese scorso (per trend)
  SELECT COUNT(*)
  INTO v_month_previous
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND p.created_at >= v_previous_month_start
    AND p.created_at < v_current_month_start;

  -- Con ordini
  SELECT COUNT(DISTINCT p.id)
  INTO v_with_orders
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  INNER JOIN public.orders o ON o.customer_id = p.id AND o.company_id = p_company_id
  WHERE p.company_id = p_company_id;

  v_without_orders := GREATEST(v_total - v_with_orders, 0);

  -- Solo anagrafica (portal_disabled)
  SELECT COUNT(*)
  INTO v_portal_disabled
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND COALESCE(p.portal_disabled, FALSE) = TRUE;

  SELECT json_build_object(
    'total', COALESCE(v_total, 0),
    'month_current', COALESCE(v_month_current, 0),
    'month_previous', COALESCE(v_month_previous, 0),
    'with_orders', COALESCE(v_with_orders, 0),
    'without_orders', COALESCE(v_without_orders, 0),
    'portal_disabled', COALESCE(v_portal_disabled, 0)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_stats(UUID) TO authenticated;

COMMIT;
