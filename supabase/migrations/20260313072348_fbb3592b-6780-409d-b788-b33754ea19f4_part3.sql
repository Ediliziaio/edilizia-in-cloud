-- Recreate trigger to handle both INSERT and DELETE
DROP TRIGGER IF EXISTS trg_prima_nota_on_incasso ON public.movimenti_cassa_native;
