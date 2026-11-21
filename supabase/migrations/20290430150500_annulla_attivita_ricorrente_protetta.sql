create or replace function public.annulla_stato_attivita(
  p_id uuid, p_versione timestamptz, p_stato text, p_completata_il timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  madre public.tasks;
  figlia public.tasks;
  eliminata uuid;
begin
  select * into madre from public.tasks
  where id = p_id and updated_at = p_versione for no key update;
  if not found then
    raise exception 'L’attività è cambiata. Ricarica l’elenco prima di annullare.' using errcode = 'PT409';
  end if;

  update public.tasks set status = p_stato, completed_at = p_completata_il
  where id = madre.id and company_id = madre.company_id;
  if not found then
    raise exception 'L’attività non può essere modificata.' using errcode = '42501';
  end if;

  if madre.is_recurring and madre.completed_at is not null and p_completata_il is null then
    -- Il trigger crea l’occorrenza nello stesso aggiornamento, con lo stesso timestamp.
    select * into figlia from public.tasks
    where company_id = madre.company_id and parent_task_id = madre.id
      and created_at = p_versione
    order by id limit 1 for update;

    if found and figlia.status = 'da_fare' and figlia.updated_at = figlia.created_at then
      perform 1 from public.task_checklist_items
      where task_id in (madre.id, figlia.id) order by id for update;

      delete from public.tasks as t where t.id = figlia.id
        and not exists (
          select 1 from public.task_checklist_items c
          where c.task_id = t.id and (c.created_at is distinct from t.created_at
            or c.is_completed or c.assigned_to is not null or c.due_date is not null)
        )
        and not exists (
          (select c.title, c.position from public.task_checklist_items c where c.task_id = madre.id
           except all
           select c.title, c.position from public.task_checklist_items c where c.task_id = t.id)
          union all
          (select c.title, c.position from public.task_checklist_items c where c.task_id = t.id
           except all
           select c.title, c.position from public.task_checklist_items c where c.task_id = madre.id)
        )
        and not exists (select 1 from public.task_comments c where c.task_id = t.id)
        and not exists (select 1 from public.task_attachments c where c.task_id = t.id)
        and not exists (select 1 from public.task_tag_assignments c where c.task_id = t.id)
        and not exists (select 1 from public.task_dependencies c where c.task_id = t.id or c.depends_on_id = t.id)
        and not exists (select 1 from public.tasks a where a.bloccata_da_task_id = t.id or a.parent_task_id = t.id)
      returning t.id into eliminata;
    end if;
  end if;

  return jsonb_build_object(
    'occorrenza_eliminata', eliminata is not null,
    'occorrenza_conservata', figlia.id is not null and eliminata is null
  );
end;
$$;

revoke all on function public.annulla_stato_attivita(uuid, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.annulla_stato_attivita(uuid, timestamptz, text, timestamptz) to authenticated;
notify pgrst, 'reload schema';
