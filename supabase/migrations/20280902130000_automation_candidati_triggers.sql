-- Automazioni sui CANDIDATI: emettitori verso automation_trigger_events, sul
-- pattern di 20270616110000 (SECURITY DEFINER + EXCEPTION handler difensivo:
-- un errore dell'automazione non blocca MAI la scrittura di business).
-- Eventi canonici: candidate_created / candidate_stage_changed /
-- candidate_hired / interview_scheduled (mappa italiana in process-automation).

CREATE OR REPLACE FUNCTION public.fire_candidato_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _fase_nome text;
  _fase_precedente text;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT nome INTO _fase_nome FROM public.hr_selezione_fasi WHERE id = NEW.fase_id;
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (
      NEW.company_id, 'candidate_created', NEW.id::text, 'candidato',
      jsonb_build_object(
        'candidato_id', NEW.id,
        'nome', NEW.nome,
        'cognome', NEW.cognome,
        'email', NEW.email,
        'telefono', NEW.telefono,
        'citta', NEW.citta,
        'ruolo', NEW.ruolo,
        'fonte', NEW.fonte,
        'stato', NEW.stato,
        'fase_nome', _fase_nome,
        'created_at', NEW.created_at
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Cambio fase nella pipeline
    IF NEW.fase_id IS DISTINCT FROM OLD.fase_id AND NEW.fase_id IS NOT NULL THEN
      SELECT nome INTO _fase_nome FROM public.hr_selezione_fasi WHERE id = NEW.fase_id;
      SELECT nome INTO _fase_precedente FROM public.hr_selezione_fasi WHERE id = OLD.fase_id;
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (
        NEW.company_id, 'candidate_stage_changed', NEW.id::text, 'candidato',
        jsonb_build_object(
          'candidato_id', NEW.id,
          'nome', NEW.nome,
          'cognome', NEW.cognome,
          'ruolo', NEW.ruolo,
          'fase_nome', _fase_nome,
          'fase_precedente', _fase_precedente
        )
      );
    END IF;

    -- Esito: assunto (solo alla transizione, non a ogni update)
    IF NEW.stato = 'assunto' AND OLD.stato IS DISTINCT FROM 'assunto' THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (
        NEW.company_id, 'candidate_hired', NEW.id::text, 'candidato',
        jsonb_build_object(
          'candidato_id', NEW.id,
          'nome', NEW.nome,
          'cognome', NEW.cognome,
          'email', NEW.email,
          'telefono', NEW.telefono,
          'ruolo', NEW.ruolo
        )
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fire_candidato_automation: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_candidato_automation ON public.hr_candidati;
CREATE TRIGGER trg_fire_candidato_automation
  AFTER INSERT OR UPDATE ON public.hr_candidati
  FOR EACH ROW EXECUTE FUNCTION public.fire_candidato_automation();

CREATE OR REPLACE FUNCTION public.fire_colloquio_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cand record;
BEGIN
  SELECT company_id, nome, cognome, ruolo INTO _cand
  FROM public.hr_candidati WHERE id = NEW.candidato_id;
  IF _cand.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (
    _cand.company_id, 'interview_scheduled', NEW.id::text, 'colloquio',
    jsonb_build_object(
      'colloquio_id', NEW.id,
      'candidato_id', NEW.candidato_id,
      'nome', _cand.nome,
      'cognome', _cand.cognome,
      'ruolo', _cand.ruolo,
      'data_colloquio', NEW.data_colloquio,
      'ora_colloquio', NEW.ora_colloquio,
      'tipo', NEW.tipo
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fire_colloquio_automation: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_colloquio_automation ON public.hr_candidati_colloqui;
CREATE TRIGGER trg_fire_colloquio_automation
  AFTER INSERT ON public.hr_candidati_colloqui
  FOR EACH ROW EXECUTE FUNCTION public.fire_colloquio_automation();
