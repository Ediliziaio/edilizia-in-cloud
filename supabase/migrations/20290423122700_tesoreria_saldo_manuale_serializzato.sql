-- Apertura e movimenti ricalcolano il saldo con lo stesso lock sul conto.
-- La somma è uno statement distinto, eseguito dopo l'attesa del lock.
CREATE OR REPLACE FUNCTION public.bank_account_recompute_manual_balance(p_account uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
    FROM public.bank_accounts
   WHERE id = p_account AND is_manual
   FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.bank_accounts AS conto
     SET current_balance = coalesce(conto.opening_balance, 0)
         + coalesce((
             SELECT sum(movimento.amount)
               FROM public.bank_transactions AS movimento
              WHERE movimento.account_id = conto.id
                AND movimento.company_id = conto.company_id
           ), 0),
         balance_updated_at = now()
   WHERE conto.id = p_account AND conto.is_manual;
END;
$$;

REVOKE ALL ON FUNCTION public.bank_account_recompute_manual_balance(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bank_account_opening_balance_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.bank_account_recompute_manual_balance(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bank_account_opening_balance_changed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_bank_account_opening_balance_changed ON public.bank_accounts;
CREATE TRIGGER trg_bank_account_opening_balance_changed
AFTER UPDATE OF opening_balance ON public.bank_accounts
FOR EACH ROW
WHEN (NEW.is_manual AND OLD.opening_balance IS DISTINCT FROM NEW.opening_balance)
EXECUTE FUNCTION public.bank_account_opening_balance_changed();
