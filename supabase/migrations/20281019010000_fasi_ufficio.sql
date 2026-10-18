-- Fasi dell'ufficio nella commessa (richiesta del titolare, 18/10/2026).
-- Il cantiere ha Lavorazioni con fasi e persone; il lavoro d'ufficio della stessa commessa
-- (contratto, misure, ordini, pratiche, detrazioni, SAL e fatture, consegna) vive nel flusso di
-- lavoro aziendale (order_task_template → tasks), ma i suoi passi finivano mescolati con le
-- attività generiche. Qui:
--   · il passo del flusso dice se è d'ufficio (activity_scope) e può aspettare una fase del
--     cantiere per nome (dopo_fase_lavorazione: «ordine materiali dopo le misure»);
--   · l'attività tiene la fase che aspetta (attende_fase_id): quando la fase si chiude,
--     l'attività si sblocca e avvisa chi la deve fare, come lo sblocco a catena tra attività;
--   · le fasi d'ufficio di una commessa le vede chiunque possa vedere le commesse dell'azienda
--     (prima solo l'assegnatario, il suo ufficio o chi vede i colleghi);
--   · una fase d'ufficio chiusa può far avanzare lo stato della commessa, come gli altri passi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_task_template
  add column if not exists activity_scope text not null default 'generale',
  add column if not exists dopo_fase_lavorazione text;
do $$ begin
  alter table public.order_task_template add constraint order_task_template_activity_scope_valido
    check (activity_scope in ('generale', 'ufficio', 'cantiere'));
exception when duplicate_object then null; end $$;

alter table public.tasks
  add column if not exists attende_fase_id uuid references public.order_work_phases(id) on delete set null;
create index if not exists tasks_attende_fase on public.tasks (attende_fase_id) where attende_fase_id is not null;
create index if not exists tasks_commessa_ufficio on public.tasks (order_id, sort_order) where activity_scope = 'ufficio';

-- I passi d'ufficio già nel flusso (quelli assegnati a un ufficio) diventano fasi d'ufficio.
update public.order_task_template set activity_scope = 'ufficio'
 where assegna_a_ufficio_id is not null and activity_scope = 'generale';

create or replace function public.validate_office_task()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.activity_scope = 'ufficio' then
    if new.order_id is not null and not exists(select 1 from public.orders where id = new.order_id and company_id = new.company_id) then
      raise exception 'Commessa non disponibile per questa azienda.' using errcode = '23514'; end if;
    if new.assigned_to is not null and not exists (
      select 1 from public.get_internal_chat_profiles(new.company_id) p where p.id = new.assigned_to
    ) then raise exception 'Il responsabile deve appartenere allo staff dell’azienda.' using errcode = '23514'; end if;
    if new.status = 'completata' and new.assigned_to is null and new.ufficio_id is null then
      raise exception 'Assegna un responsabile o un ufficio prima di completare la fase d’ufficio.' using errcode = '23514'; end if;
    if new.attende_fase_id is not null and not exists (
      select 1 from public.order_work_phases f where f.id = new.attende_fase_id and f.order_id = new.order_id
    ) then raise exception 'La fase del cantiere attesa non è di questa commessa.' using errcode = '23514'; end if;
  end if;
  return new;
end; $function$;

drop policy if exists fasi_ufficio_visibili_in_commessa on public.tasks;
create policy fasi_ufficio_visibili_in_commessa on public.tasks for select to authenticated
  using (activity_scope = 'ufficio' and order_id is not null
         and company_id = (select public.get_my_company_id())
         and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false));

create or replace function public.sblocca_fasi_ufficio_da_cantiere()
returns trigger language plpgsql security definer set search_path = public
as $$
declare p record; v_oggi date := (now() at time zone 'Europe/Rome')::date; v_scad date; v_dest uuid;
begin
  if new.status is distinct from 'completata' or old.status = 'completata' then return new; end if;
  for p in
    select id, title, assigned_to, company_id, order_id, ufficio_id, coalesce(sblocco_giorni, 0) giorni
      from public.tasks where attende_fase_id = new.id and status = 'in_attesa' and completed_at is null
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
end $$;
revoke all on function public.sblocca_fasi_ufficio_da_cantiere() from public, anon, authenticated;
drop trigger if exists trg_sblocca_fasi_ufficio_da_cantiere on public.order_work_phases;
create trigger trg_sblocca_fasi_ufficio_da_cantiere after update of status on public.order_work_phases
for each row execute function public.sblocca_fasi_ufficio_da_cantiere();
