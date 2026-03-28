-- Bug #3: Drop the trigger that creates Prima Nota entry on invoice emission
-- (double-counts revenue: emission is a credit recognition, not a cash movement)
DROP TRIGGER IF EXISTS trg_prima_nota_on_fattura_emessa ON public.documenti_fiscali;
