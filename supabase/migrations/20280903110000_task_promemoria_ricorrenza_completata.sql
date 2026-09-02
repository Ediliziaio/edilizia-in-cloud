-- Attività: promemoria che partono davvero, "completata" riconosciuta ovunque,
-- ricorrenza gestita dal DB.
--
-- Stato al 2026-09-02 in produzione: 54 attività aperte, 46 scadute, ZERO
-- notifiche di scadenza mai create. Tre cause:
-- 1) create_task_due_notifications() usava tasks.deleted_at, colonna che non
--    esiste (la funzione non poteva nemmeno girare) e nessun cron la chiamava.
-- 2) fire_task_automation riconosceva 'completato' mentre l'app scrive
--    'completata': il trigger di automazione "Attività completata" era morto.
-- 3) la prossima occorrenza di una task ricorrente nasceva solo dalla lista
--    Regia; Kanban, pannello dettaglio, azioni multiple, campo, Silvio e
--    automazioni chiudevano la serie in silenzio.
-- Idempotente.

-- ── 1) Promemoria: oggi in scadenza + scadute (una volta sola per attività) ──
CREATE OR REPLACE FUNCTION public.create_task_due_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row_count integer;
BEGIN
  -- In scadenza oggi: destinatario l'assegnatario o, se manca, chi l'ha creata.
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT
    t.company_id,
    coalesce(t.assigned_to, t.created_by),
    'task_due',
    'Attività in scadenza oggi',
    t.title,
    'task',
    t.id,
    '/azienda/attivita'
  FROM tasks t
  WHERE t.due_date = CURRENT_DATE
    AND lower(coalesce(t.status, '')) NOT IN ('completata', 'completato', 'completed', 'done', 'fatto', 'annullata')
    AND coalesce(t.assigned_to, t.created_by) IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = coalesce(t.assigned_to, t.created_by))
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.entity_id = t.id AND n.type = 'task_due' AND n.created_at::date = CURRENT_DATE
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_notification_preferences p
      WHERE p.user_id = coalesce(t.assigned_to, t.created_by) AND p.task_due_soon_in_app = false
    );
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_count := v_count + v_row_count;

  -- Scadute: una notifica sola per attività, non una al giorno (con 9 task
  -- scadute erano 9 avvisi ogni mattina).
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT
    t.company_id,
    coalesce(t.assigned_to, t.created_by),
    'task_overdue',
    'Attività scaduta',
    t.title || ' — scaduta il ' || to_char(t.due_date, 'DD/MM/YYYY'),
    'task',
    t.id,
    '/azienda/attivita'
  FROM tasks t
  WHERE t.due_date < CURRENT_DATE
    AND lower(coalesce(t.status, '')) NOT IN ('completata', 'completato', 'completed', 'done', 'fatto', 'annullata')
    AND coalesce(t.assigned_to, t.created_by) IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = coalesce(t.assigned_to, t.created_by))
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.entity_id = t.id AND n.type = 'task_overdue'
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_notification_preferences p
      WHERE p.user_id = coalesce(t.assigned_to, t.created_by) AND p.task_overdue_in_app = false
    );
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_count := v_count + v_row_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_task_due_notifications() FROM public, anon;

-- Ogni mattina alle 05:30 UTC (07:30 in Italia d'estate).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'task-due-notifications-daily';
SELECT cron.schedule('task-due-notifications-daily', '30 5 * * *', 'SELECT public.create_task_due_notifications();');

-- ── 2) Trigger automazioni: 'completata' è quello che scrive l'app ──
CREATE OR REPLACE FUNCTION public.fire_task_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_status text := lower(coalesce(NEW.status, ''));
  _old_status text := lower(coalesce(OLD.status, ''));
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'task_created', NEW.id::text, 'task',
      jsonb_build_object('task_id', NEW.id, 'title', NEW.title, 'priority', NEW.priority, 'assigned_to', NEW.assigned_to,
                         'due_date', NEW.due_date, 'status', NEW.status, 'category', NEW.category));
  ELSIF TG_OP = 'UPDATE' THEN
    IF _new_status IS DISTINCT FROM _old_status
       AND _new_status IN ('completata', 'completato', 'completed', 'done', 'fatto') THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'task_completed', NEW.id::text, 'task',
        jsonb_build_object('task_id', NEW.id, 'title', NEW.title, 'assigned_to', NEW.assigned_to,
                           'completed_at', NEW.completed_at, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_task_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 3) Ricorrenza: la prossima occorrenza la crea il DB, da qualsiasi punto ──
CREATE OR REPLACE FUNCTION public.tg_task_ricorrenza_prossima()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done_new boolean;
  v_done_old boolean;
  v_next date;
  v_row jsonb;
  v_new_id uuid;
BEGIN
  v_done_new := lower(coalesce(NEW.status, '')) IN ('completata', 'completato', 'completed', 'done', 'fatto')
    OR (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL);
  v_done_old := lower(coalesce(OLD.status, '')) IN ('completata', 'completato', 'completed', 'done', 'fatto');
  IF NOT v_done_new OR v_done_old THEN RETURN NEW; END IF;
  IF NOT coalesce(NEW.is_recurring, false) OR NEW.recurrence_rule IS NULL OR NEW.due_date IS NULL THEN RETURN NEW; END IF;

  v_next := CASE NEW.recurrence_rule
    WHEN 'daily'    THEN NEW.due_date + 1
    WHEN 'weekly'   THEN NEW.due_date + 7
    WHEN 'biweekly' THEN NEW.due_date + 14
    WHEN 'monthly'  THEN (NEW.due_date + interval '1 month')::date
    ELSE NEW.due_date + 7
  END;
  IF NEW.recurrence_end_date IS NOT NULL AND v_next > NEW.recurrence_end_date THEN RETURN NEW; END IF;
  -- Già creata (stato cambiato avanti e indietro): non duplicare.
  IF EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = NEW.id AND c.due_date = v_next) THEN RETURN NEW; END IF;

  v_new_id := gen_random_uuid();
  v_row := to_jsonb(NEW) || jsonb_build_object(
    'id', v_new_id,
    'status', 'da_fare',
    'due_date', v_next,
    'parent_task_id', NEW.id,
    'completed_at', NULL,
    'created_at', now(),
    'updated_at', now()
  );
  INSERT INTO public.tasks SELECT * FROM jsonb_populate_record(NULL::public.tasks, v_row);

  -- La checklist riparte da zero sulla nuova occorrenza.
  INSERT INTO public.task_checklist_items (task_id, title, is_completed, position)
  SELECT v_new_id, ci.title, false, ci.position
  FROM public.task_checklist_items ci
  WHERE ci.task_id = NEW.id
  ORDER BY ci.position;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'tg_task_ricorrenza_prossima: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_ricorrenza_prossima ON public.tasks;
CREATE TRIGGER trg_task_ricorrenza_prossima
  AFTER UPDATE OF status, completed_at ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_task_ricorrenza_prossima();
