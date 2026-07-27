-- Notifiche lead dei form dei brand: evento via trigger DB + flussi per brand.
--
-- Problema: i 10 form dell'area super-admin (Form Builder, tabella lead_forms)
-- creavano il contatto e tacevano. Nessuna notifica e nessun evento, quindi
-- nemmeno le automazioni potevano reagire — mentre il modulo del sito EiC
-- (public-lead-submit) faceva gia' entrambe le cose.
--
-- Perche' un trigger DB e non codice nella edge function form-submit:
--  1. e' lo stesso schema delle altre 16 fire_*_automation gia' esistenti;
--  2. NON dipende dal deploy delle edge function, oggi bloccato da un 401
--     sul token Supabase nella CI. Cosi' la notifica funziona subito.
-- Per lo stesso motivo il blocco equivalente e' stato RIMOSSO da form-submit:
-- averlo in tutti e due i posti manderebbe due email per ogni richiesta.

CREATE OR REPLACE FUNCTION public.fire_form_submission_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _form_name text;
BEGIN
  IF NEW.company_id IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _form_name FROM lead_forms WHERE id = NEW.form_id;

  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (
    NEW.company_id, 'form_submitted', NEW.contact_id::text, 'contact',
    jsonb_build_object(
      'form_id', NEW.form_id,
      'form_name', coalesce(_form_name, ''),
      'submission_id', NEW.id,
      'contact_id', NEW.contact_id,
      'data', NEW.data
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Best-effort come le altre fire_*: un problema di notifica non deve far
  -- fallire il salvataggio di un lead.
  RAISE LOG 'fire_form_submission_automation error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_form_submission_automation ON public.form_submissions;
CREATE TRIGGER trg_form_submission_automation
AFTER INSERT ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.fire_form_submission_automation();

-- I 10 flussi "Notifica lead — <brand>", le 10 pipeline per brand e il
-- collegamento form→pipeline sono stati creati come DATI in produzione
-- (execute_sql, 2026-07-27), non come schema: restano nel database, non qui.
