-- Local rollout artifact. Apply BEFORE deploying the updated automation workers.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.automation_enrollments drop constraint if exists automation_enrollments_entity_type_check;
alter table public.automation_enrollments add constraint automation_enrollments_entity_type_check
  check (entity_type = any(array['contact','opportunity','appointment','order','invoice','payment','cost','quote','ticket','stock','task','employee','leave_request','company','cron','manual','candidato','colloquio','stock_movement','manutenzione','contratto_manutenzione']));

alter table public.automation_trigger_events add column if not exists dedup_key text;
create unique index if not exists automation_event_occurrence_unique
  on public.automation_trigger_events(dedup_key) where dedup_key is not null;

-- Version history had own-company-only policies while flows allow superadmin
-- and delegated multi-company editors. Mandatory snapshots must use the same
-- access scope; otherwise an authorized graph save rolls back at the snapshot.
alter table public.automation_flow_versions enable row level security;
drop policy if exists automation_versions_parent_read on public.automation_flow_versions;
create policy automation_versions_parent_read on public.automation_flow_versions
  for select to authenticated using (
    exists (select 1 from public.automation_flows f
      where f.id=automation_flow_versions.flow_id and f.company_id=automation_flow_versions.company_id)
  );
drop policy if exists automation_versions_authorized_insert on public.automation_flow_versions;
create policy automation_versions_authorized_insert on public.automation_flow_versions
  for insert to authenticated with check (
    exists (select 1 from public.automation_flows f
      where f.id=automation_flow_versions.flow_id and f.company_id=automation_flow_versions.company_id)
    and (public.has_permission_for_company((select auth.uid()),'can_view_automazioni',company_id)
      or public.has_permission_for_company((select auth.uid()),'can_view_marketing_automations',company_id))
    and not public.utente_sola_lettura(company_id)
  );

-- Serialize enrollment with graph saves and concurrent enrollment attempts.
-- Existing duplicates are preserved; no historical rows are deleted.
create or replace function public.guard_automation_enrollment() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare allowed boolean; current_version integer;
begin
  select coalesce(f.allow_reentry, false) or coalesce((f.config_json #>> '{settings,enable_reenrollment}')::boolean, false)
    , f.version into allowed, current_version from public.automation_flows f where f.id = new.flow_id and f.company_id = new.company_id for update;
  if not found then raise exception 'Automazione non trovata per questa azienda'; end if;
  if new.flow_version <> current_version then raise exception 'Versione cambiata: ripetere l’iscrizione' using errcode = '40001'; end if;
  allowed := allowed or exists (select 1 from public.automation_nodes where flow_id=new.flow_id and node_type='trigger' and config_json->>'allow_re_enrollment'='true');
  if exists (select 1 from public.automation_enrollments e where e.flow_id = new.flow_id
      and e.entity_id = new.entity_id and e.entity_type = new.entity_type
      and (e.status in ('active','waiting','paused') or (not allowed and e.status = 'completed'))) then
    raise exception 'Entità già iscritta' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.guard_automation_enrollment() from public, anon, authenticated;
drop trigger if exists guard_automation_enrollment on public.automation_enrollments;
create trigger guard_automation_enrollment before insert on public.automation_enrollments
  for each row execute function public.guard_automation_enrollment();

-- Fail safely rather than changing a graph being executed. This guard also
-- protects older browser tabs using the former multi-request save path.
create or replace function public.guard_automation_graph_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare fid uuid;
begin
  fid := case when tg_op = 'DELETE' then old.flow_id else new.flow_id end;
  perform 1 from public.automation_flows where id = fid for update;
  if exists (select 1 from public.automation_enrollments where flow_id = fid and status in ('active','waiting','paused')) then
    raise exception 'Il flusso ha esecuzioni in corso: attendi la conclusione o lavora su una copia, senza modificare i passaggi già avviati.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.guard_automation_graph_write() from public, anon, authenticated;
drop trigger if exists guard_automation_graph_write on public.automation_nodes;
create trigger guard_automation_graph_write before insert or update or delete on public.automation_nodes
  for each row execute function public.guard_automation_graph_write();
drop trigger if exists guard_automation_graph_write on public.automation_connections;
create trigger guard_automation_graph_write before insert or update or delete on public.automation_connections
  for each row execute function public.guard_automation_graph_write();

-- Invoker rights keep the existing company/role RLS policies authoritative.
-- The graph and its revision commit together, or are completely rolled back.
create or replace function public.save_automation_graph(
  p_flow_id uuid, p_company_id uuid, p_expected_updated_at timestamptz,
  p_nodes jsonb, p_connections jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare f public.automation_flows; n jsonb; c jsonb; stamp timestamptz;
begin
  if auth.uid() is null then raise exception 'Autenticazione richiesta' using errcode = '42501'; end if;
  select * into f from public.automation_flows where id = p_flow_id and company_id = p_company_id for update;
  if not found then raise exception 'Automazione non accessibile' using errcode = '42501'; end if;
  if f.updated_at is distinct from p_expected_updated_at then raise exception 'Il flusso è stato modificato altrove. Ricarica prima di salvare.' using errcode = '40001'; end if;
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_typeof(p_connections) <> 'array' or p_nodes is null or p_connections is null then raise exception 'Grafo non valido'; end if;
  -- Verify UPDATE permission before touching nodes (SELECT access is not enough).
  update public.automation_flows set updated_at = updated_at where id = f.id and company_id = p_company_id;
  if not found then raise exception 'Permesso di modifica richiesto' using errcode = '42501'; end if;
  if exists (select 1 from public.automation_enrollments where flow_id = f.id and status in ('active','waiting','paused')) then
    raise exception 'Il flusso ha esecuzioni in corso: attendi la conclusione o lavora su una copia.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_nodes) j join public.automation_nodes x on x.id = (j->>'id')::uuid where x.flow_id <> f.id or x.company_id <> p_company_id)
    or exists (select 1 from jsonb_array_elements(p_connections) j join public.automation_connections x on x.id = (j->>'id')::uuid where x.flow_id <> f.id or x.company_id <> p_company_id) then
    raise exception 'Il grafo contiene elementi di un altro flusso' using errcode = '42501';
  end if;
  for c in select * from jsonb_array_elements(p_connections) loop
    if not exists (select 1 from jsonb_array_elements(p_nodes) j where j->>'id' = c->>'from_node_id')
      or not exists (select 1 from jsonb_array_elements(p_nodes) j where j->>'id' = c->>'to_node_id') then
      raise exception 'Un collegamento punta a un passaggio mancante';
    end if;
  end loop;
  insert into public.automation_flow_versions(flow_id,company_id,version,status,nodes_snapshot,connections_snapshot,created_by)
    select f.id,f.company_id,f.version,f.status,
      coalesce((select jsonb_agg(to_jsonb(x)) from public.automation_nodes x where flow_id=f.id),'[]'),
      coalesce((select jsonb_agg(to_jsonb(x)) from public.automation_connections x where flow_id=f.id),'[]'),auth.uid()
    where not exists (select 1 from public.automation_flow_versions where flow_id=f.id and version=f.version);
  delete from public.automation_connections where flow_id=f.id and company_id=p_company_id;
  delete from public.automation_nodes where flow_id=f.id and company_id=p_company_id
    and id not in (select (j->>'id')::uuid from jsonb_array_elements(p_nodes) j);
  for n in select * from jsonb_array_elements(p_nodes) loop
    insert into public.automation_nodes(id,flow_id,company_id,node_type,position_x,position_y,config_json,label)
    values ((n->>'id')::uuid,f.id,p_company_id,n->>'node_type',coalesce((n->>'position_x')::float,0),coalesce((n->>'position_y')::float,0),coalesce(n->'config_json','{}'),n->>'label')
    on conflict(id) do update set node_type=excluded.node_type,position_x=excluded.position_x,position_y=excluded.position_y,config_json=excluded.config_json,label=excluded.label;
  end loop;
  for c in select * from jsonb_array_elements(p_connections) loop
    insert into public.automation_connections(id,flow_id,company_id,from_node_id,to_node_id,label)
    values ((c->>'id')::uuid,f.id,p_company_id,(c->>'from_node_id')::uuid,(c->>'to_node_id')::uuid,c->>'label');
  end loop;
  update public.automation_flows set version=version+1,updated_at=clock_timestamp() where id=f.id returning updated_at into stamp;
  insert into public.automation_flow_versions(flow_id,company_id,version,status,nodes_snapshot,connections_snapshot,created_by)
    select f.id,p_company_id,f.version+1,f.status,p_nodes,p_connections,auth.uid()
    where not exists (select 1 from public.automation_flow_versions where flow_id=f.id and version=f.version+1);
  return jsonb_build_object('updated_at',stamp,'version',f.version+1);
end $$;
revoke all on function public.save_automation_graph(uuid,uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.save_automation_graph(uuid,uuid,timestamptz,jsonb,jsonb) to authenticated;

-- Publishing from any client records the exact graph being published.
create or replace function public.snapshot_automation_publication() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'published' and (new.version is distinct from old.version or new.status is distinct from old.status) then
    insert into public.automation_flow_versions(flow_id,company_id,version,status,nodes_snapshot,connections_snapshot,created_by)
    select new.id,new.company_id,new.version,new.status,
      coalesce((select jsonb_agg(to_jsonb(n)) from public.automation_nodes n where flow_id=new.id),'[]'),
      coalesce((select jsonb_agg(to_jsonb(c)) from public.automation_connections c where flow_id=new.id),'[]'),auth.uid()
    where not exists (select 1 from public.automation_flow_versions where flow_id=new.id and version=new.version);
  end if;
  return new;
end $$;
revoke all on function public.snapshot_automation_publication() from public, anon, authenticated;
drop trigger if exists snapshot_automation_publication on public.automation_flows;
create trigger snapshot_automation_publication after update of status,version on public.automation_flows
  for each row execute function public.snapshot_automation_publication();

-- Patch only the known tag/assignment dispatch block; do not replace unrelated
-- improvements made to the shared CRM emitter by other migrations.
do $patch_tags$
declare definition text; previous text; replacement text;
begin
  definition := pg_get_functiondef('public.fire_marketing_automation()'::regprocedure);
  previous := $old$        IF OLD.tags IS DISTINCT FROM NEW.tags THEN
          IF array_length(NEW.tags, 1) > COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_added';
          ELSIF array_length(NEW.tags, 1) < COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_removed';
          END IF;
        ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
          _trigger_event := 'contact_assigned';
        END IF;$old$;
  replacement := $new$        -- automation_tag_deltas_v1: replacement/removal of the last tag also counts.
        _payload := _payload || jsonb_build_object(
          'added_tags', to_jsonb(array(select unnest(coalesce(NEW.tags, '{}'::text[])) except select unnest(coalesce(OLD.tags, '{}'::text[])))),
          'removed_tags', to_jsonb(array(select unnest(coalesce(OLD.tags, '{}'::text[])) except select unnest(coalesce(NEW.tags, '{}'::text[]))))
        );
        IF jsonb_array_length(_payload->'added_tags') > 0 THEN
          INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
          VALUES(_company_id,'tag_added',_entity_id,_entity_type,_payload);
        END IF;
        IF jsonb_array_length(_payload->'removed_tags') > 0 THEN
          INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
          VALUES(_company_id,'tag_removed',_entity_id,_entity_type,_payload);
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
          INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
          VALUES(_company_id,'contact_assigned',_entity_id,_entity_type,_payload);
        END IF;
        -- The ordinary contact_updated event is emitted by the unchanged tail.$new$;
  if position('automation_tag_deltas_v1' in definition) > 0 then return; end if;
  if position(previous in definition) = 0 then
    raise exception 'CRM emitter changed: review the tag dispatch block before applying this migration';
  end if;
  execute replace(definition,previous,replacement);
end $patch_tags$;
