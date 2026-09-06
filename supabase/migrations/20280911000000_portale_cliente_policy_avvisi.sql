-- Portale cliente (06/09/2026): due policy mancanti + avvisi email al cliente.
-- Applicata sul live via Management API a pezzi (istanza da 1 GB: lock_timeout breve),
-- poi `supabase migration repair --status applied 20280911000000 --linked`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Stati delle commesse: la policy "Customers can view their company order
--    statuses" finisce con NOT utente_e_cliente_esterno(), cioè esclude proprio
--    i clienti puri → KPI «Ordini attivi 0», «Nessuno stato configurato».
--    Il cliente legge gli stati dell'azienda delle SUE commesse.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cliente_legge_stati_proprie_commesse ON public.order_statuses;
CREATE POLICY cliente_legge_stati_proprie_commesse ON public.order_statuses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.customer_id = (SELECT auth.uid())
        AND o.company_id = order_statuses.company_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Appuntamenti: nessuna policy per il cliente (il codice citava
--    customer_view_own_appointments, mai esistita). Il cliente vede gli
--    appuntamenti del suo contatto (stessa email) o prenotati con la sua email.
--    Helper SECURITY DEFINER: dentro una policy la RLS di marketing_contacts
--    bloccherebbe il sotto-select per un cliente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cliente_contatto_ha_mia_email(p_contact_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_contact_id IS NOT NULL
     AND public.get_auth_email() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.marketing_contacts mc
       WHERE mc.id = p_contact_id
         AND lower(mc.email) = lower(public.get_auth_email())
     );
$$;

DROP POLICY IF EXISTS cliente_legge_propri_appuntamenti ON public.appointments;
CREATE POLICY cliente_legge_propri_appuntamenti ON public.appointments
  FOR SELECT TO authenticated
  USING (
    (public.get_auth_email() IS NOT NULL
      AND lower(coalesce(booking_email, '')) = lower(public.get_auth_email()))
    OR public.cliente_contatto_ha_mia_email(contact_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Avvisi al cliente: registro anti-doppione + relay DB → edge cliente-notifica
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_avvisi (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  customer_id uuid NOT NULL,
  tipo        text NOT NULL,          -- stato_commessa | documento | rata_in_scadenza | rata_scaduta
  ref_id      text NOT NULL,          -- id dell'oggetto (stato:commessa, allegato, rata)
  inviato_at  timestamptz NOT NULL DEFAULT now(),
  esito       text,
  UNIQUE (customer_id, tipo, ref_id)
);
ALTER TABLE public.cliente_avvisi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cliente_avvisi_azienda ON public.cliente_avvisi;
CREATE POLICY cliente_avvisi_azienda ON public.cliente_avvisi
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE OR REPLACE FUNCTION public.cliente_notifica_invia(
  p_tipo text, p_customer_id uuid, p_order_id uuid, p_ref_id text, p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_secret text;
BEGIN
  IF p_tipo <> 'rate' AND p_customer_id IS NULL THEN RETURN; END IF;
  -- Stesso segreto degli altri cron verso le edge (INTERNAL_CRON_SECRET).
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
   WHERE name = 'silvio_internal_cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/cliente-notifica',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object(
      'tipo', p_tipo, 'customer_id', p_customer_id, 'order_id', p_order_id,
      'ref_id', p_ref_id, 'extra', coalesce(p_extra, '{}'::jsonb)),
    timeout_milliseconds := 8000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cliente_notifica_invia: %', SQLERRM;
END
$$;

-- Cambio di stato della commessa → email al cliente (il trigger esistente
-- notify_order_status_change avvisa solo lo staff assegnato).
CREATE OR REPLACE FUNCTION public.trg_fn_cliente_stato_commessa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.current_status_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.current_status_id IS NOT DISTINCT FROM NEW.current_status_id THEN RETURN NEW; END IF;
  PERFORM public.cliente_notifica_invia('stato_commessa', NEW.customer_id, NEW.id, NEW.current_status_id::text, '{}'::jsonb);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_cliente_stato_commessa ON public.orders;
CREATE TRIGGER trg_cliente_stato_commessa
  AFTER UPDATE OF current_status_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cliente_stato_commessa();

-- Documento reso visibile al cliente → email.
CREATE OR REPLACE FUNCTION public.trg_fn_cliente_documento_condiviso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_customer uuid;
BEGIN
  IF NOT coalesce(NEW.visible_to_customer, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND coalesce(OLD.visible_to_customer, false) THEN RETURN NEW; END IF;
  SELECT customer_id INTO v_customer FROM public.orders WHERE id = NEW.order_id;
  IF v_customer IS NULL THEN RETURN NEW; END IF;
  PERFORM public.cliente_notifica_invia('documento', v_customer, NEW.order_id, NEW.id::text,
    jsonb_build_object('file_name', NEW.file_name));
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_cliente_documento_condiviso ON public.order_attachments;
CREATE TRIGGER trg_cliente_documento_condiviso
  AFTER INSERT OR UPDATE OF visible_to_customer ON public.order_attachments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cliente_documento_condiviso();

-- Rate: promemoria 7 giorni prima e avviso di scadenza (ultimi 3 giorni), una
-- volta per rata. 07:00 UTC = 9:00 Roma d'estate, 8:00 d'inverno.
SELECT cron.unschedule('cliente-rate-promemoria')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cliente-rate-promemoria');
SELECT cron.schedule(
  'cliente-rate-promemoria', '0 7 * * *',
  $$SELECT public.cliente_notifica_invia('rate', NULL, NULL, NULL, '{}'::jsonb)$$
);
