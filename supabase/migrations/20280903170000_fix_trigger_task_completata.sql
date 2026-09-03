-- ════════════════════════════════════════════════════════════════════════════
-- fire_task_automation: l'evento "Attività completata" non è MAI scattato
-- ════════════════════════════════════════════════════════════════════════════
-- `fire_task_automation` (migration 20270616110000) emette `task_completed` in
-- `automation_trigger_events` solo quando lo stato finisce in
-- ('completato','completed','done','fatto').
--
-- Lo stato reale dell'app è 'completata' — femminile. Nessuno di quei quattro
-- valori viene mai scritto. Risultato: chiunque in produzione abbia costruito
-- un'automazione col trigger "Attività completata" (catalogo: `task_completato`,
-- mappato a `task_completed` in process-automation) ha un flusso che non è mai
-- partito, senza nessun errore da nessuna parte.
--
-- Qui si passa al criterio indipendente dal vocabolario: `completed_at` che va
-- da vuoto a valorizzato. È quello che scrivono TUTTI i percorsi di chiusura
-- (dialog, riga, kanban, azioni multiple, area campo), ed è lo stesso gancio del
-- flusso di lavoro commessa (`sblocca_task_a_catena`). Gli stati sono
-- personalizzabili per azienda e vivono lato client (src/lib/taskStatuses.ts):
-- il DB non può conoscerne l'elenco, quindi non deve provarci.
--
-- Resta una seconda via per i percorsi che cambiano lo stato SENZA scrivere
-- `completed_at` (script, import, SQL a mano): in quel caso si guarda comunque
-- lo stato, con 'completata' finalmente incluso. Le due vie non possono emettere
-- due volte per la stessa chiusura: la seconda vale solo se `completed_at` è
-- rimasto vuoto.
--
-- Aggiunto anche `task_reopened`, che prima non esisteva: una task riaperta era
-- indistinguibile da una mai chiusa.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fire_task_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_status  text := lower(coalesce(NEW.status, ''));
  _old_status  text := lower(coalesce(OLD.status, ''));
  -- Elenco difensivo: 'completata' è il valore reale, gli altri coprono dati
  -- storici e import. Serve SOLO alla via di riserva qui sotto.
  _stati_done  text[] := ARRAY['completata','completato','completed','done','fatto'];
  _chiusa_ora  boolean;
  _riaperta    boolean;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (
      NEW.company_id, 'task_created', NEW.id::text, 'task',
      jsonb_build_object(
        'task_id', NEW.id,
        'title', NEW.title,
        'priority', NEW.priority,
        'assigned_to', NEW.assigned_to,
        'due_date', NEW.due_date,
        'status', NEW.status,
        'category', NEW.category
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    _chiusa_ora :=
      -- Via principale: indipendente dal vocabolario degli stati.
      (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
      -- Via di riserva: stato passato a "chiuso" senza toccare completed_at.
      OR (NEW.completed_at IS NULL
          AND _new_status IS DISTINCT FROM _old_status
          AND _new_status = ANY(_stati_done));

    _riaperta :=
      (OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL)
      OR (NEW.completed_at IS NULL
          AND _new_status IS DISTINCT FROM _old_status
          AND _old_status = ANY(_stati_done)
          AND NOT (_new_status = ANY(_stati_done)));

    IF _chiusa_ora THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (
        NEW.company_id, 'task_completed', NEW.id::text, 'task',
        jsonb_build_object(
          'task_id', NEW.id,
          'title', NEW.title,
          'assigned_to', NEW.assigned_to,
          'completed_at', NEW.completed_at,
          'status', NEW.status,
          'order_id', NEW.order_id,
          'ticket_id', NEW.ticket_id
        )
      );
    ELSIF _riaperta THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (
        NEW.company_id, 'task_reopened', NEW.id::text, 'task',
        jsonb_build_object(
          'task_id', NEW.id,
          'title', NEW.title,
          'assigned_to', NEW.assigned_to,
          'status', NEW.status,
          'order_id', NEW.order_id,
          'ticket_id', NEW.ticket_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un intoppo dell'automazione non deve MAI impedire di salvare un'attività.
  RAISE LOG 'fire_task_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_task_automation ON public.tasks;
CREATE TRIGGER trg_fire_task_automation
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.fire_task_automation();
