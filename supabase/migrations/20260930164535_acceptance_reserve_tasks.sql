-- Reuse ordinary commessa tasks. The immutable report remains the source document.
alter table public.tasks
  add column acceptance_report_id uuid references public.order_acceptance_reports(id),
  add column acceptance_action_index integer,
  add constraint tasks_acceptance_source_pair check (
    (acceptance_report_id is null and acceptance_action_index is null) or
    (acceptance_report_id is not null and acceptance_action_index is not null and acceptance_action_index between 0 and 29)
  ),
  add constraint tasks_acceptance_source_unique unique (acceptance_report_id, acceptance_action_index);

create function public.guard_acceptance_task_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r public.order_acceptance_reports%rowtype; action jsonb;
begin
  if tg_op = 'UPDATE' then
    if (new.acceptance_report_id,new.acceptance_action_index) is distinct from
       (old.acceptance_report_id,old.acceptance_action_index) then
      raise exception 'Il collegamento al verbale non è modificabile';
    end if;
    if old.acceptance_report_id is not null and
       (new.company_id,new.order_id,new.created_by) is distinct from
       (old.company_id,old.order_id,old.created_by) then
      raise exception 'L’attività di collaudo deve restare nella commessa originaria';
    end if;
    return new;
  end if;
  if new.acceptance_report_id is null then return new; end if;
  if (select auth.uid()) is null then raise exception 'Accesso richiesto'; end if;
  select * into r from public.order_acceptance_reports where id=new.acceptance_report_id;
  if not found or r.status <> 'finalized' or
     not public.has_permission_for_company((select auth.uid()),'can_edit_orders',r.company_id) then
    raise exception 'Verbale congelato non disponibile o non autorizzato';
  end if;
  action := r.content->'actions'->new.acceptance_action_index;
  if action is null or coalesce(trim(action->>'work'),'')='' or
     coalesce(trim(action->>'owner'),'')='' or coalesce(action->>'due','')='' then
    raise exception 'Intervento del verbale non valido';
  end if;
  if new.company_id is distinct from r.company_id or new.order_id is distinct from r.order_id or
     new.created_by is distinct from (select auth.uid()) or new.assigned_to is distinct from (select auth.uid()) or
     new.due_date is distinct from (action->>'due')::date or
     new.title is distinct from 'Collaudo · ' || left(action->>'work',180) or
     new.status <> 'da_fare' or new.completed_at is not null or new.is_recurring or
     new.chiudi_su_evento is not null or new.fase_al_completamento_id is not null then
    raise exception 'L’attività deve conservare commessa, intervento e scadenza del verbale ed essere assegnata al richiedente';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_acceptance_task_source() from public;
create trigger guard_acceptance_task_source before insert or update on public.tasks
for each row execute function public.guard_acceptance_task_source();

create function public.create_acceptance_tasks(p_report_id uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
declare r public.order_acceptance_reports%rowtype; created_count integer;
begin
  if (select auth.uid()) is null or public.utente_bloccato() then raise exception 'Accesso non autorizzato'; end if;
  select * into r from public.order_acceptance_reports where id=p_report_id;
  if not found or r.status <> 'finalized' or
     not public.has_permission_for_company((select auth.uid()),'can_edit_orders',r.company_id) then
    raise exception 'Congela un verbale autorizzato prima di creare le attività';
  end if;
  if jsonb_typeof(r.content->'actions') is distinct from 'array' or jsonb_array_length(r.content->'actions') > 30 then
    raise exception 'Elenco interventi non valido';
  end if;
  -- One statement, one transaction. Unique source coordinates stop double clicks
  -- and competing sessions; existing tasks and assignees are NEVER overwritten.
  insert into public.tasks (
    company_id,order_id,title,notes,status,priority,due_date,assigned_to,created_by,
    category,acceptance_report_id,acceptance_action_index
  )
  select r.company_id,r.order_id,'Collaudo · ' || left(a.value->>'work',180),
    'Dal verbale: ' || (r.content->>'title') || E'\nRiferimento: ' || r.id::text ||
    E'\nIntervento: ' || (a.value->>'work') ||
    E'\nResponsabile indicato nel verbale: ' || (a.value->>'owner') ||
    E'\nScadenza originaria: ' || (a.value->>'due') ||
    E'\nCoordinamento assegnato a chi crea l’attività. La chiusura non modifica il verbale e non costituisce accettazione del cliente.',
    'da_fare','normale',(a.value->>'due')::date,(select auth.uid()),(select auth.uid()),
    'ordini',r.id,(a.ordinality-1)::integer
  from jsonb_array_elements(r.content->'actions') with ordinality as a(value,ordinality)
  on conflict on constraint tasks_acceptance_source_unique do nothing;
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;
revoke all on function public.create_acceptance_tasks(uuid) from public,anon;
grant execute on function public.create_acceptance_tasks(uuid) to authenticated;
