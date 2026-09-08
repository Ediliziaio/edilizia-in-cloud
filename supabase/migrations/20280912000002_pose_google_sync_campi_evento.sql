-- L'evento Google della posa dice chi, dove, cosa e come chiamare il cliente
-- (richiesta del founder, 08/09/2026): titolo «Posa · cliente · codice»,
-- descrizione con cliente, indirizzo, lavoro, telefono. Quindi il trigger che
-- riaccoda la commessa deve scattare anche quando cambiano QUEI campi, non solo
-- le date. Applicata sul live via Management API, poi migration repair.

CREATE OR REPLACE FUNCTION public.trg_fn_orders_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.work_start_date  IS DISTINCT FROM NEW.work_start_date  OR
    OLD.work_end_date    IS DISTINCT FROM NEW.work_end_date    OR
    OLD.work_start_time  IS DISTINCT FROM NEW.work_start_time  OR
    OLD.work_end_time    IS DISTINCT FROM NEW.work_end_time    OR
    OLD.description      IS DISTINCT FROM NEW.description      OR
    OLD.work_description IS DISTINCT FROM NEW.work_description OR
    OLD.tipo_lavoro      IS DISTINCT FROM NEW.tipo_lavoro      OR
    OLD.indirizzo_lavori IS DISTINCT FROM NEW.indirizzo_lavori OR
    OLD.work_address     IS DISTINCT FROM NEW.work_address     OR
    OLD.client_address   IS DISTINCT FROM NEW.client_address   OR
    OLD.client_name      IS DISTINCT FROM NEW.client_name      OR
    OLD.client_phone     IS DISTINCT FROM NEW.client_phone
  ) THEN
    PERFORM public.google_calendar_accoda_commessa(NEW.company_id, NEW.id, 'date');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_orders_google_sync ON public.orders;
CREATE TRIGGER trg_orders_google_sync
  AFTER UPDATE OF work_start_date, work_end_date, work_start_time, work_end_time,
                  description, work_description, tipo_lavoro,
                  indirizzo_lavori, work_address, client_address, client_name, client_phone
  ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_fn_orders_google_sync();
