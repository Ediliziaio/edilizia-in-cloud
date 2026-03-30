-- Fix recursive trigger on quote_items:
-- The original recalculate_quote_totals() does UPDATE quote_items inside the trigger body,
-- which re-fires the same trigger causing infinite recursion (PostgreSQL error 54001).
-- Fix: add pg_trigger_depth() guard to stop recursion after first level.

CREATE OR REPLACE FUNCTION public.recalculate_quote_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quote_id UUID;
  v_subtotal NUMERIC(12,2);
  v_vat_amount NUMERIC(12,2);
  v_discount_pct NUMERIC(5,2);
  v_discount_amt NUMERIC(12,2);
BEGIN
  -- Prevent recursive trigger calls (UPDATE quote_items below re-fires this trigger)
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);

  -- Update line_total for all rows in this quote
  UPDATE public.quote_items
  SET line_total = ROUND(quantity * unit_price * (1 - COALESCE(discount_percent, 0) / 100), 2)
  WHERE quote_id = v_quote_id;

  -- Sum up subtotal
  SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
  FROM public.quote_items WHERE quote_id = v_quote_id;

  SELECT COALESCE(discount_percent, 0) INTO v_discount_pct
  FROM public.quotes WHERE id = v_quote_id;

  v_discount_amt := ROUND(v_subtotal * v_discount_pct / 100, 2);

  SELECT COALESCE(SUM(ROUND(line_total * vat_rate / 100, 2)), 0) INTO v_vat_amount
  FROM public.quote_items WHERE quote_id = v_quote_id;

  -- Apply global discount proportionally to VAT as well
  v_vat_amount := ROUND(v_vat_amount * (1 - v_discount_pct / 100), 2);

  UPDATE public.quotes
  SET subtotal = v_subtotal,
      discount_amount = v_discount_amt,
      vat_amount = v_vat_amount,
      total = v_subtotal - v_discount_amt + v_vat_amount,
      updated_at = now()
  WHERE id = v_quote_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
