-- Keep the editor authorization fail-closed even if a permission helper returns NULL.
create or replace function public.salva_flusso_lavoro_atomico(p_company_id uuid,p_ambito text,p_vertical text,p_rows jsonb,p_expected jsonb,p_auto_apply boolean)
returns integer language plpgsql security invoker set search_path=public as $$
declare r jsonb; idx integer; ids uuid[] := '{}'; row_id uuid; pred uuid; n integer;
begin
  if auth.uid() is null or p_company_id is distinct from public.get_effective_company_id()
     or not coalesce(public.has_role(auth.uid(),'company_admin') or public.is_super_admin(auth.uid()) or public.has_permission(auth.uid(),'can_edit_settings_orders'),false) then
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

-- Atomic creation only on explicit confirmation; no backfills or real tasks here.
create or replace function public.applica_attivita_commessa_atomico(p_company_id uuid,p_order_id uuid,p_rows jsonb,p_base_date date)
returns integer language plpgsql security invoker set search_path=public as $$
declare r jsonb; m jsonb:='{}'; row_id uuid; predecessor uuid; phase_id uuid; assignee uuid; waiting boolean; n integer:=0; k text; pred_title text; existing_count integer;
begin
  if auth.uid() is null or p_company_id is distinct from public.get_effective_company_id()
    or not coalesce(public.has_role(auth.uid(),'company_admin') or public.is_super_admin(auth.uid()) or public.has_permission(auth.uid(),'can_edit_orders'),false)
    or not exists(select 1 from public.orders where id=p_order_id and company_id=p_company_id and deleted_at is null) then
    raise exception 'Non puoi applicare un modello a questa commessa.' using errcode='42501'; end if;
  if p_base_date is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then
    raise exception 'Modello o data di partenza non validi.' using errcode='22023'; end if;
  if (select count(distinct lower(btrim(x->>'title'))) from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then
    raise exception 'Il modello contiene titoli duplicati.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':office-apply:'||p_order_id::text,0));
  -- Verify all missing phases before any write; a missing prerequisite is not completed.
  for r in select value from jsonb_array_elements(p_rows) loop
    k:=lower(btrim(r->>'title'));
    if nullif(k,'') is null or length(r->>'title')>250 or coalesce((r->>'days')::integer,0) not between 0 and 3650 or coalesce((r->>'release_days')::integer,0) not between 0 and 3650 then
      raise exception 'Titolo o scadenza non validi.' using errcode='22023'; end if;
    select count(*),(array_agg(id))[1] into existing_count,row_id from public.tasks where company_id=p_company_id and order_id=p_order_id and lower(btrim(title))=k;
    if existing_count>1 then raise exception 'Esistono attività omonime: verifica prima di applicare il modello.' using errcode='22023'; end if;
    if row_id is not null then m:=m||jsonb_build_object(k,row_id); end if;
    if nullif(btrim(r->>'phase_name'),'') is not null and not exists(select 1 from public.order_work_phases where order_id=p_order_id and lower(btrim(name))=lower(btrim(r->>'phase_name'))) then
      raise exception 'Manca la lavorazione «%»: aggiungila prima di applicare il modello.',r->>'phase_name' using errcode='22023'; end if;
  end loop;
  for r in select value from jsonb_array_elements(p_rows) loop
    k:=lower(btrim(r->>'title')); if m?k then continue; end if;
    pred_title:=nullif(lower(btrim(r->>'predecessor_title')),''); predecessor:=null;phase_id:=null;
    if pred_title is not null then
      if not(m?pred_title) then raise exception 'Dipendenza non disponibile o non ordinata.' using errcode='22023'; end if;
      predecessor:=(m->>pred_title)::uuid;
      if exists(select 1 from public.tasks where id=predecessor and status='completata') then predecessor:=null; end if;
    end if;
    if nullif(btrim(r->>'phase_name'),'') is not null then
      select id into phase_id from public.order_work_phases where order_id=p_order_id and lower(btrim(name))=lower(btrim(r->>'phase_name')) and status<>'completata' order by position limit 1;
    end if;
    waiting:=predecessor is not null or phase_id is not null;
    assignee:=(r->>'assigned_to')::uuid;
    if assignee is not null and not public.e_persona_ufficio(assignee,p_company_id) then raise exception 'Responsabile non disponibile per questa azienda.' using errcode='22023'; end if;
    if r->>'ufficio_id' is not null and not exists(select 1 from public.company_uffici where id=(r->>'ufficio_id')::uuid and company_id=p_company_id and attivo) then raise exception 'Ufficio non disponibile.' using errcode='22023'; end if;
    if r->>'reached_status_id' is not null and not exists(select 1 from public.order_statuses where id=(r->>'reached_status_id')::uuid and company_id=p_company_id) then raise exception 'Stato commessa non disponibile.' using errcode='22023'; end if;
    insert into public.tasks(company_id,order_id,title,notes,status,due_date,assigned_to,created_by,ufficio_id,activity_scope,office_stage,sort_order,priority,category,bloccata_da_task_id,attende_fase_id,sblocco_giorni,chiudi_su_evento,fase_al_completamento_id)
    values(p_company_id,p_order_id,btrim(r->>'title'),r->>'notes',case when waiting then 'in_attesa' else 'da_fare' end,
      case when not waiting then p_base_date+coalesce((r->>'days')::integer,0) end,assignee,auth.uid(),(r->>'ufficio_id')::uuid,coalesce(r->>'activity_scope','generale'),r->>'office_stage',(r->>'sort_order')::integer,coalesce(r->>'priority','normale'),'ordini',predecessor,phase_id,case when waiting then coalesce((r->>'release_days')::integer,0) end,r->>'close_event',(r->>'reached_status_id')::uuid)
    returning id into row_id;
    m:=m||jsonb_build_object(k,row_id);n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.applica_attivita_commessa_atomico(uuid,uuid,jsonb,date) from public,anon;
grant execute on function public.applica_attivita_commessa_atomico(uuid,uuid,jsonb,date) to authenticated;
