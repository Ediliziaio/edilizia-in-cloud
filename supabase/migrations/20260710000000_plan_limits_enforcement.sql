-- Migration: plan limits enforcement
-- Creates check_plan_limit() function for runtime enforcement of plan limits.
-- Also adds company_billing_overrides.custom_max_orders for per-company override.

-- ─── Function: check_plan_limit ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_company_id   uuid,
  p_resource_type text,   -- 'orders' | 'users' | 'storage_mb'
  p_increment    integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_name    text;
  v_max_value    integer;
  v_current      integer := 0;
  v_allowed      boolean;
  v_override     integer;
BEGIN
  -- Get active plan limits
  SELECT
    sp.name,
    CASE p_resource_type
      WHEN 'orders'     THEN sp.max_orders
      WHEN 'users'      THEN sp.max_users
      WHEN 'storage_mb' THEN sp.max_storage_mb
      ELSE -1
    END
  INTO v_plan_name, v_max_value
  FROM company_subscriptions cs
  JOIN subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = p_company_id
    AND cs.status = 'active'
  ORDER BY cs.created_at DESC
  LIMIT 1;

  -- If no active subscription found, use loose defaults
  IF v_plan_name IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current', 0,
      'limit', -1,
      'plan_name', 'trial'
    );
  END IF;

  -- Check for per-company override
  SELECT
    CASE p_resource_type
      WHEN 'orders' THEN custom_max_orders
      ELSE NULL
    END
  INTO v_override
  FROM company_billing_overrides
  WHERE company_id = p_company_id;

  IF v_override IS NOT NULL THEN
    v_max_value := v_override;
  END IF;

  -- If limit is -1 (unlimited), always allow
  IF v_max_value = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current', 0,
      'limit', -1,
      'plan_name', v_plan_name
    );
  END IF;

  -- Count current usage
  IF p_resource_type = 'orders' THEN
    SELECT COUNT(*)::integer INTO v_current
    FROM orders
    WHERE company_id = p_company_id;

  ELSIF p_resource_type = 'users' THEN
    SELECT COUNT(*)::integer INTO v_current
    FROM profiles
    WHERE company_id = p_company_id;

  ELSIF p_resource_type = 'storage_mb' THEN
    -- Approximate: count files / documents
    SELECT COALESCE(SUM(COALESCE(size_bytes, 0)) / 1048576, 0)::integer INTO v_current
    FROM company_documents
    WHERE company_id = p_company_id;
  END IF;

  v_allowed := (v_current + p_increment) <= v_max_value;

  RETURN jsonb_build_object(
    'allowed',    v_allowed,
    'current',    v_current,
    'limit',      v_max_value,
    'plan_name',  v_plan_name
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text, integer) TO authenticated;

-- ─── Add custom_max_orders to company_billing_overrides if not exists ─────────
ALTER TABLE public.company_billing_overrides
  ADD COLUMN IF NOT EXISTS custom_max_orders integer;
