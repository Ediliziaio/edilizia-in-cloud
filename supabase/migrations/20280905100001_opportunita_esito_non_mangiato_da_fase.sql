-- "Opportunità vinta" e "opportunità persa" non scattavano quasi mai.
--
-- Nel kanban trascinare una scheda su Vinto/Perso cambia INSIEME la fase e lo
-- stato. Il trigger era una catena IF che guardava la fase per PRIMA: trovato
-- il cambio di fase emetteva `pipeline_stage_change` e usciva, senza mai
-- arrivare ai rami won/lost.
--
-- I numeri trovati in produzione: 18 opportunità perse -> 1 evento emesso.
-- 14 vinte -> 0 eventi. Qualunque automazione agganciata a "vinta" o "persa"
-- non è mai partita.
--
-- Non sono alternativi: se cambiano tutti e due, si emettono TUTTI E DUE gli
-- eventi. Chi ascolta il cambio di fase continua a ricevere quello che riceveva.
DO $migr$
DECLARE
  def text;
  vecchio text;
  nuovo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fire_marketing_automation';

  vecchio := '      ELSIF TG_OP = ''UPDATE'' THEN
        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
          _trigger_event := ''pipeline_stage_change'';
        ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = ''won'' THEN
          _trigger_event := ''opportunity_won'';
        ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = ''lost'' THEN
          _trigger_event := ''opportunity_lost'';
        ELSE
          IF TG_OP = ''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        _payload := jsonb_build_object(''opportunity_id'', NEW.id, ''name'', NEW.name, ''value'', NEW.value,
          ''status'', NEW.status, ''old_status'', OLD.status, ''stage_id'', NEW.stage_id, ''old_stage_id'', OLD.stage_id,
          ''pipeline_id'', NEW.pipeline_id, ''old_pipeline_id'', OLD.pipeline_id);
      END IF;';

  IF position(vecchio in def) = 0 THEN
    RAISE EXCEPTION 'ancoraggio non trovato: la funzione e'' cambiata, rivedere la migration';
  END IF;

  nuovo := '      ELSIF TG_OP = ''UPDATE'' THEN
        -- Il payload si costruisce PRIMA, perche'' serve a entrambi gli eventi.
        _payload := jsonb_build_object(''opportunity_id'', NEW.id, ''name'', NEW.name, ''value'', NEW.value,
          ''status'', NEW.status, ''old_status'', OLD.status, ''stage_id'', NEW.stage_id, ''old_stage_id'', OLD.stage_id,
          ''pipeline_id'', NEW.pipeline_id, ''old_pipeline_id'', OLD.pipeline_id);

        -- Esito: si emette SEMPRE quando lo stato cambia, anche se nello stesso
        -- momento e'' cambiata la fase. Prima veniva perso.
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN (''won'', ''lost'') THEN
          INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
          VALUES (_company_id,
                  CASE WHEN NEW.status = ''won'' THEN ''opportunity_won'' ELSE ''opportunity_lost'' END,
                  _entity_id, _entity_type, _payload);
        END IF;

        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
          _trigger_event := ''pipeline_stage_change'';
        ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN (''won'', ''lost'') THEN
          -- Gia'' emesso sopra: qui si esce senza duplicarlo.
          RETURN NEW;
        ELSE
          IF TG_OP = ''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
      END IF;';

  EXECUTE replace(def, vecchio, nuovo);
END
$migr$;
