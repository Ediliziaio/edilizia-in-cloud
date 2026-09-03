-- ════════════════════════════════════════════════════════════════════════════
-- notify_task_assigned: niente "Nuova attività assegnata" sui passi in attesa
-- ════════════════════════════════════════════════════════════════════════════
-- Col flusso di lavoro commessa le attività di TUTTO il percorso nascono
-- insieme, e quelle che aspettano il loro turno nascono `status='in_attesa'`.
-- `notify_task_assigned` però avvisava l'assegnatario alla creazione: chi ha in
-- carico l'ultimo passo riceveva "Nuova attività assegnata" il giorno in cui si
-- apre la commessa, per un lavoro che tocca fra settimane — e poi una seconda
-- volta allo sblocco vero (`sblocca_task_a_catena`). Due avvisi, il primo solo
-- rumore, per giunta senza scadenza perché i passi in attesa non ce l'hanno.
--
-- Qui si tace finché il passo non è davvero di qualcuno. L'avviso che conta è
-- quello dello sblocco: "Tocca a te: …".
--
-- Stesso trattamento in UPDATE: se una task torna in attesa (riapertura del
-- passo precedente) non è il momento di annunciarla a nessuno.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_body text;
  v_pref_enabled boolean;
BEGIN
  -- Only notify if assigned_to is set and not self-assigned
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Passo del flusso non ancora sbloccato: avvisarlo ora sarebbe rumore.
  -- Ci pensa sblocca_task_a_catena quando tocca davvero a lui.
  IF NEW.status = 'in_attesa' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if assigned_to actually changed
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- Skip if self-assigning
  IF NEW.assigned_to = COALESCE(NEW.created_by, NEW.assigned_to) AND TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Check user notification preferences
  SELECT task_assigned_in_app INTO v_pref_enabled
  FROM public.user_notification_preferences
  WHERE user_id = NEW.assigned_to;

  -- Default to true if no preferences row exists
  IF v_pref_enabled IS NOT NULL AND v_pref_enabled = false THEN
    RETURN NEW;
  END IF;

  v_body := NEW.title;
  IF NEW.due_date IS NOT NULL THEN
    v_body := v_body || ' — Scadenza: ' || to_char(NEW.due_date::date, 'DD/MM/YYYY');
  END IF;

  PERFORM create_notification(
    NEW.company_id,
    NEW.assigned_to,
    'task_assigned',
    CASE WHEN TG_OP = 'UPDATE' THEN 'Attività riassegnata a te' ELSE 'Nuova attività assegnata' END,
    v_body,
    'task',
    NEW.id,
    '/azienda/attivita'
  );

  RETURN NEW;
END;
$function$;
