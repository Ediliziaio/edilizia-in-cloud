-- Additive only: no activities or existing templates are changed by this migration.
alter table public.tasks add column if not exists office_stage text check (office_stage in ('avvio','acquisti','preparazione','amministrazione','chiusura','altro'));
alter table public.order_task_template add column if not exists office_stage text check (office_stage in ('avvio','acquisti','preparazione','amministrazione','chiusura','altro'));

create or replace function public.salva_flusso_lavoro_atomico(p_company_id uuid,p_ambito text,p_vertical text,p_rows jsonb,p_expected jsonb,p_auto_apply boolean)
returns integer language plpgsql security invoker set search_path=public as $$
declare r jsonb; idx integer; ids uuid[] := '{}'; row_id uuid; pred uuid; n integer;
begin
  if auth.uid() is null or p_company_id is distinct from public.get_effective_company_id()
     or not (public.has_role(auth.uid(),'company_admin') or public.is_super_admin(auth.uid()) or public.has_permission(auth.uid(),'can_edit_settings_orders')) then
    raise exception 'Non puoi modificare il modello aziendale.' using errcode='42501';
  end if;
  if p_ambito not in ('commessa','ticket') or p_ambito is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100
    or jsonb_typeof(p_expected) is distinct from 'array' or p_auto_apply is null then
    raise exception 'Flusso non valido.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_ambito||':'||coalesce(p_vertical,'<generale>'),0));
  if (select count(*) from public.order_task_template where company_id=p_company_id and ambito=p_ambito and vertical is not distinct from p_vertical) <> jsonb_array_length(p_expected)
    or exists(select 1 from jsonb_array_elements(p_expected) e where not exists(
      select 1 from public.order_task_template t where t.id=(e->>'id')::uuid and t.company_id=p_company_id and t.ambito=p_ambito
        and t.vertical is not distinct from p_vertical and t.updated_at=(e->>'updated_at')::timestamptz)) then
    raise exception 'Il modello è stato modificato da un altro utente. Ricarica prima di salvare.' using errcode='40001';
  end if;
  for r,idx in select value,ordinality::integer-1 from jsonb_array_elements(p_rows) with ordinality loop
    if nullif(btrim(r->>'titolo'),'') is null or length(r->>'titolo')>250
      or coalesce((r->>'giorni_offset')::integer,0) not between 0 and 3650 or coalesce((r->>'giorni_dopo_sblocco')::integer,0) not between 0 and 3650
      or (r->>'dipende_da_posizione' is not null and ((r->>'dipende_da_posizione')::integer<0 or (r->>'dipende_da_posizione')::integer>=idx)) then
      raise exception 'Titolo, scadenza o dipendenza non validi.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_rows) with ordinality x(v,i) where i<=idx and lower(btrim(v->>'titolo'))=lower(btrim(r->>'titolo'))) then
      raise exception 'Ogni passo deve avere un titolo distinto.' using errcode='22023';
    end if;
    row_id:=coalesce((r->>'id')::uuid,gen_random_uuid());
    if row_id=any(ids) or exists(select 1 from public.order_task_template t where t.id=row_id and (t.company_id<>p_company_id or t.ambito<>p_ambito or t.vertical is distinct from p_vertical)) then
      raise exception 'Passo non disponibile in questo modello.' using errcode='42501';
    end if;
    if r->>'assegna_a_utente' is not null and not public.e_persona_ufficio((r->>'assegna_a_utente')::uuid,p_company_id) then
      raise exception 'Responsabile non disponibile.' using errcode='22023'; end if;
    if r->>'assegna_a_ufficio_id' is not null and not exists(select 1 from public.company_uffici where id=(r->>'assegna_a_ufficio_id')::uuid and company_id=p_company_id and attivo) then
      raise exception 'Ufficio non disponibile.' using errcode='22023'; end if;
    if r->>'fase_raggiunta_id' is not null and not exists(select 1 from public.order_statuses where id=(r->>'fase_raggiunta_id')::uuid and company_id=p_company_id) then
      raise exception 'Stato commessa non disponibile.' using errcode='22023'; end if;
    pred:=case when r->>'dipende_da_posizione' is not null then ids[(r->>'dipende_da_posizione')::integer+1] end;
    insert into public.order_task_template(id,company_id,ambito,vertical,sort_order,titolo,giorni_offset,giorni_dopo_sblocco,priorita,attivo,assegna_a_utente,assegna_a_ufficio_id,chiudi_su_evento,fase_raggiunta_id,activity_scope,dopo_fase_lavorazione,dipende_da_id,office_stage)
    values(row_id,p_company_id,p_ambito,p_vertical,idx,btrim(r->>'titolo'),coalesce((r->>'giorni_offset')::integer,0),coalesce((r->>'giorni_dopo_sblocco')::integer,0),coalesce(r->>'priorita','normale'),coalesce((r->>'attivo')::boolean,true),
      case when r->>'assegna_a_ufficio_id' is null then (r->>'assegna_a_utente')::uuid end,(r->>'assegna_a_ufficio_id')::uuid,r->>'chiudi_su_evento',(r->>'fase_raggiunta_id')::uuid,coalesce(r->>'activity_scope','generale'),nullif(btrim(r->>'dopo_fase_lavorazione'),''),pred,r->>'office_stage')
    on conflict(id) do update set sort_order=excluded.sort_order,titolo=excluded.titolo,giorni_offset=excluded.giorni_offset,giorni_dopo_sblocco=excluded.giorni_dopo_sblocco,priorita=excluded.priorita,attivo=excluded.attivo,
      assegna_a_utente=excluded.assegna_a_utente,assegna_a_ufficio_id=excluded.assegna_a_ufficio_id,chiudi_su_evento=excluded.chiudi_su_evento,fase_raggiunta_id=excluded.fase_raggiunta_id,activity_scope=excluded.activity_scope,dopo_fase_lavorazione=excluded.dopo_fase_lavorazione,dipende_da_id=excluded.dipende_da_id,office_stage=excluded.office_stage,updated_at=now();
    ids:=array_append(ids,row_id);
  end loop;
  delete from public.order_task_template where company_id=p_company_id and ambito=p_ambito and vertical is not distinct from p_vertical and not(id=any(ids));
  if p_ambito='commessa' then update public.companies set playbook_auto_apply=p_auto_apply where id=p_company_id;
  else update public.companies set ticket_playbook_auto_apply=p_auto_apply where id=p_company_id; end if;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Impostazioni non aggiornate: nessuna modifica salvata.' using errcode='42501'; end if;
  return cardinality(ids);
end $$;
revoke all on function public.salva_flusso_lavoro_atomico(uuid,text,text,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.salva_flusso_lavoro_atomico(uuid,text,text,jsonb,jsonb,boolean) to authenticated;

-- Older server-side playbook callers inherit a group only from an unambiguous template.
create or replace function public.office_task_inherit_stage() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.activity_scope='ufficio' and new.office_stage is null then
    select min(t.office_stage) into new.office_stage from public.order_task_template t
      where t.company_id=new.company_id and t.ambito='commessa' and t.attivo and lower(btrim(t.titolo))=lower(btrim(new.title))
      having count(distinct t.office_stage)=1;
  end if;
  return new;
end $$;
revoke all on function public.office_task_inherit_stage() from public,anon,authenticated;
create trigger office_task_inherit_stage before insert on public.tasks for each row execute function public.office_task_inherit_stage();

create or replace function public.office_task_blocked_guard() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.activity_scope='ufficio' and new.status<>'in_attesa' and new.status is distinct from old.status then
    if (new.bloccata_da_task_id is not null and not exists(select 1 from public.tasks t where t.id=new.bloccata_da_task_id and t.company_id=new.company_id and t.status='completata'))
      or (new.attende_fase_id is not null and not exists(select 1 from public.order_work_phases f where f.id=new.attende_fase_id and f.status='completata' and f.order_id=new.order_id)) then
      raise exception 'Questa attività attende una dipendenza non completata.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.office_task_blocked_guard() from public,anon,authenticated;
create trigger office_task_blocked_guard before update of status on public.tasks for each row execute function public.office_task_blocked_guard();
