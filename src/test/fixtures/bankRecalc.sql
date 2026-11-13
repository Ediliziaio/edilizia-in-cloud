CREATE OR REPLACE FUNCTION private.movimento_ripartito_ricalcola()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_abbinato numeric;
BEGIN
  SELECT coalesce(sum(matched_amount), 0) INTO v_abbinato
    FROM public.bank_reconciliations
   WHERE transaction_id = NEW.transaction_id AND unmatched_at IS NULL AND ripartita;
  UPDATE public.bank_transactions t
     SET reconciliation_status = CASE
           WHEN v_abbinato <= 0 THEN 'pending'
           WHEN v_abbinato >= abs(t.amount) - 0.005 THEN 'reconciled'
           ELSE 'parziale' END,
         reconciled_at = CASE WHEN v_abbinato >= abs(t.amount) - 0.005 THEN now() END
   WHERE t.id = NEW.transaction_id;
  RETURN NULL;
END $function$
