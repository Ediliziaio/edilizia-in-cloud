-- Avviso email al cliente a ogni cambio di fase: interruttore per azienda.
--
-- trg_cliente_stato_commessa scrive al cliente del portale a OGNI cambio di
-- fase («la tua commessa è passata allo stato: …»). Con i passaggi del flusso
-- che spostano la fase da soli (20280919300000) un'azienda con dieci fasi
-- interne manderebbe dieci email, con nomi pensati per l'ufficio («Fattura
-- liquidazione»). Chi manda già le sue email di commessa dalle automazioni lo
-- spegne; per tutti gli altri resta com'era.

SET lock_timeout = '3s';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS avvisa_cliente_cambio_fase boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.avvisa_cliente_cambio_fase IS
  'Se true il cliente del portale riceve un''email a ogni cambio di fase della commessa (trg_cliente_stato_commessa).';

CREATE OR REPLACE FUNCTION public.trg_fn_cliente_stato_commessa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.current_status_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.current_status_id IS NOT DISTINCT FROM NEW.current_status_id THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT c.avvisa_cliente_cambio_fase FROM public.companies c WHERE c.id = NEW.company_id), true) THEN
    RETURN NEW;
  END IF;
  PERFORM public.cliente_notifica_invia('stato_commessa', NEW.customer_id, NEW.id, NEW.current_status_id::text, '{}'::jsonb);
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.trg_fn_cliente_stato_commessa() FROM PUBLIC, anon;

-- Funzioni di trigger del flusso commessa (20280919300000): chiuse anche ad
-- authenticated, come vuole la regola (ai trigger l'EXECUTE non serve).
REVOKE ALL ON FUNCTION public.avanza_fase_da_passo_chiuso() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_applica_flusso_su_commessa_nuova() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_fn_cliente_stato_commessa() FROM PUBLIC, anon, authenticated;
