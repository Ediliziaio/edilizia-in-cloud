-- Filter eligible successors BEFORE their status update. A dual prerequisite
-- must not abort the loop and silently leave unrelated successors waiting.
-- Existing trigger identity, notification logic and reopening behavior are kept.
CREATE OR REPLACE FUNCTION public.sblocca_task_a_catena()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _passo    record;
  _dest     record;
  _oggi     date := (now() AT TIME ZONE 'Europe/Rome')::date;
  _scadenza date;
  _titolo   text;
  _link     text;
BEGIN
  IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    FOR _passo IN
      SELECT id, title, assigned_to, company_id, order_id, ticket_id, ufficio_id,
             chiudi_su_evento, evento_gia_avvenuto,
             COALESCE(sblocco_giorni, 0) AS giorni
        FROM public.tasks t
       WHERE t.bloccata_da_task_id = NEW.id
         AND t.company_id = NEW.company_id
         AND t.status = 'in_attesa'
         AND (t.attende_fase_id IS NULL OR EXISTS (
           SELECT 1 FROM public.order_work_phases f
           WHERE f.id = t.attende_fase_id AND f.order_id = t.order_id
             AND f.status = 'completata'
         ))
    LOOP
      -- L'incasso era gia' arrivato mentre questo passo aspettava: niente da
      -- far fare a nessuno, si chiude e la catena prosegue (l'UPDATE rifa'
      -- scattare questo stesso trigger sul passo successivo).
      IF _passo.chiudi_su_evento IS NOT NULL AND _passo.evento_gia_avvenuto THEN
        UPDATE public.tasks
           SET status = 'completata', due_date = _oggi,
               completed_at = now(), updated_at = now()
         WHERE id = _passo.id;
        CONTINUE;
      END IF;

      _scadenza := _oggi + _passo.giorni;

      UPDATE public.tasks
         SET status = 'da_fare', due_date = _scadenza, updated_at = now()
       WHERE id = _passo.id;

      _link := CASE
        WHEN _passo.order_id  IS NOT NULL THEN '/azienda/ordini/'     || _passo.order_id::text
        WHEN _passo.ticket_id IS NOT NULL THEN '/azienda/assistenza/' || _passo.ticket_id::text
        ELSE '/azienda/attivita'
      END;

      IF _passo.ufficio_id IS NOT NULL THEN
        _titolo := 'Tocca al tuo ufficio: ' || _passo.title;
        FOR _dest IN
          SELECT m.profile_id FROM public.ufficio_membri m WHERE m.ufficio_id = _passo.ufficio_id
        LOOP
          INSERT INTO public.notifications
            (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
          VALUES (
            _passo.company_id, _dest.profile_id, 'task_sbloccata', _titolo,
            'Si è chiusa "' || NEW.title || '". Da fare entro il ' || to_char(_scadenza, 'DD/MM/YYYY') || '.',
            'task', _passo.id, _link
          );
        END LOOP;
      ELSIF _passo.assigned_to IS NOT NULL THEN
        INSERT INTO public.notifications
          (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
        VALUES (
          _passo.company_id, _passo.assigned_to, 'task_sbloccata',
          'Tocca a te: ' || _passo.title,
          'Si è chiusa "' || NEW.title || '". Da fare entro il ' || to_char(_scadenza, 'DD/MM/YYYY') || '.',
          'task', _passo.id, _link
        );
      END IF;
    END LOOP;

  ELSIF OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL THEN
    UPDATE public.tasks
       SET status = 'in_attesa', due_date = NULL, updated_at = now()
     WHERE bloccata_da_task_id = NEW.id
       AND status = 'da_fare'
       AND completed_at IS NULL;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'sblocca_task_a_catena error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sblocca_fasi_ufficio_da_cantiere()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_oggi date := (now() at time zone 'Europe/Rome')::date; v_scad date; v_dest uuid;
begin
  if new.status is distinct from 'completata' or old.status = 'completata' then return new; end if;
  for p in
    select id, title, assigned_to, company_id, order_id, ufficio_id, coalesce(sblocco_giorni, 0) giorni
      from public.tasks t where t.attende_fase_id = new.id and t.order_id = new.order_id
        and t.status = 'in_attesa' and t.completed_at is null
        and (t.bloccata_da_task_id is null or exists (
          select 1 from public.tasks parent
          where parent.id = t.bloccata_da_task_id and parent.company_id = t.company_id
            and parent.status = 'completata'
        ))
  loop
    v_scad := v_oggi + p.giorni;
    update public.tasks set status = 'da_fare', due_date = v_scad, updated_at = now() where id = p.id;
    for v_dest in
      select m.profile_id from public.ufficio_membri m where p.ufficio_id is not null and m.ufficio_id = p.ufficio_id
      union select p.assigned_to where p.ufficio_id is null and p.assigned_to is not null
    loop
      insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
      values (p.company_id, v_dest, 'task_sbloccata', 'Tocca all’ufficio: ' || p.title,
              'In cantiere è finita «' || new.name || '». Da fare entro il ' || to_char(v_scad, 'DD/MM/YYYY') || '.',
              'task', p.id, '/azienda/ordini/' || p.order_id || '?tab=cantiere&vista_cantiere=ufficio');
    end loop;
  end loop;
  return new;
exception when others then
  raise log 'sblocca_fasi_ufficio_da_cantiere: %', sqlerrm;
  return new;
end $function$;

-- Trigger-only entry points; do not expose privileged code as RPC.
revoke all on function public.sblocca_task_a_catena() from public, anon, authenticated;
revoke all on function public.sblocca_fasi_ufficio_da_cantiere() from public, anon, authenticated;
