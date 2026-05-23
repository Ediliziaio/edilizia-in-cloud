-- Allow multiple bonuses, maluses and manual adjustments for the same
-- beneficiary/order. Legacy mirrors remain idempotent through
-- legacy_order_salesperson_id.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname
  INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'order_variable_compensations'
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname ORDER BY u.ordinality)
      FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
    ) = ARRAY['order_id', 'beneficiary_id', 'compensation_type', 'basis'];

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.order_variable_compensations DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_variable_compensations_order_beneficiary
  ON public.order_variable_compensations(order_id, beneficiary_id, compensation_type, basis, created_at);
