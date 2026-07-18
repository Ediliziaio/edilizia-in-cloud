-- Lead FB ripetuto: nessun contatto duplicato, ma "nuova richiesta" in timeline
-- + ri-scatena l'automazione FB (re-enrollment).
--
-- Contesto: meta-process-leads deduplica il CONTATTO (email/telefono) e, per un
-- lead da contatto già esistente, emette 'facebook_lead_updated' — evento che
-- NESSUN trigger automazione intercetta (i nodi FB matchano 'facebook_lead_received').
-- Risultato: il lead ripetuto non faceva ri-partire il flusso.
--
-- Fix (senza toccare le edge, tutto lato DB):
--  1) trigger su automation_trigger_events: su 'facebook_lead_updated' registra
--     un'attività sul contatto e ri-emette 'facebook_lead_received' (che il cron
--     process-automation-queue elabora → handleTrigger → enrollment).
--  2) re-enrollment abilitato sui trigger FB esistenti: un nuovo submit ri-arruola
--     SE la sequenza precedente è completata; il runtime blocca solo se c'è
--     un'iscrizione ATTIVA, quindi niente sequenze parallele doppie.
--
-- NB: automation_trigger_events.entity_id è TEXT; marketing_contact_activities.contact_id
-- è uuid → cast esplicito ::uuid. Entrambi gli insert sono best-effort (EXCEPTION)
-- così un problema non blocca mai l'inserimento dell'evento originale.

CREATE OR REPLACE FUNCTION public.fb_repeat_lead_reentry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entity_type = 'contact' AND NEW.entity_id IS NOT NULL THEN
    -- 1) Timeline contatto: "ha fatto di nuovo richiesta"
    BEGIN
      INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata)
      VALUES (
        NEW.entity_id::uuid, NEW.company_id, 'lead_form_submission',
        'Nuova richiesta dallo stesso contatto (Facebook/Instagram Lead Ads)',
        jsonb_build_object(
          'source', 'meta_lead_ads', 'repeat', true,
          'leadgen_id', NEW.payload->>'leadgen_id',
          'form_id', NEW.payload->>'form_id',
          'page_id', NEW.payload->>'page_id',
          'campaign_name', NEW.payload->>'campaign_name'
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 2) Ri-emette l'evento "nuovo lead" per far ri-partire l'automazione FB
    BEGIN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload, processed)
      VALUES (
        NEW.company_id, 'facebook_lead_received', NEW.entity_id, 'contact',
        COALESCE(NEW.payload, '{}'::jsonb) || jsonb_build_object('is_new_contact', false, 'repeat_submission', true),
        false
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fb_repeat_lead_reentry ON public.automation_trigger_events;
CREATE TRIGGER trg_fb_repeat_lead_reentry
AFTER INSERT ON public.automation_trigger_events
FOR EACH ROW
WHEN (NEW.trigger_event = 'facebook_lead_updated')
EXECUTE FUNCTION public.fb_repeat_lead_reentry();

-- Re-enrollment di default sui trigger "Lead da campagna Facebook" esistenti.
UPDATE public.automation_nodes
SET config_json = config_json || '{"allow_re_enrollment": true}'::jsonb
WHERE node_type = 'trigger'
  AND config_json->>'item_id' = 'campagna_facebook_lead'
  AND COALESCE((config_json->>'allow_re_enrollment')::boolean, false) = false;
