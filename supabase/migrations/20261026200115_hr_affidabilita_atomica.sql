-- Atomic HR operations. Invoker functions retain all existing RLS policies.
-- No existing HR records are changed by this migration.
create or replace function public.hr_salva_ufficio(p_company uuid, p_id uuid, p_dati jsonb, p_membri uuid[])
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid; v_manager uuid; v_members uuid[];
begin
  if auth.uid() is null or p_company is null or public.utente_sola_lettura(p_company) or (public.e_amministratore_di(p_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) is distinct from true then
    raise exception 'Permessi insufficienti';
  end if;
  if nullif(btrim(p_dati->>'nome'), '') is null then raise exception 'Nome ufficio obbligatorio'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr-office:' || p_company::text, 0));
  v_manager := nullif(p_dati->>'responsabile_id', '')::uuid;
  select coalesce(array_agg(distinct m), '{}'::uuid[]) into v_members
    from unnest(coalesce(p_membri, '{}'::uuid[]) || case when v_manager is null then '{}'::uuid[] else array[v_manager] end) m;
  if exists (select 1 from unnest(v_members) m where m is null or not exists (select 1 from public.profiles p where p.id=m and p.company_id=p_company)) then
    raise exception 'Un membro non appartiene alla stessa azienda';
  end if;
  if p_id is not null then
    select id into v_id from public.company_uffici where id=p_id and company_id=p_company for update;
    if not found then raise exception 'Ufficio non accessibile'; end if;
    update public.company_uffici set nome=btrim(p_dati->>'nome'), descrizione=nullif(btrim(p_dati->>'descrizione'), ''),
      responsabile_id=v_manager, colore=nullif(p_dati->>'colore', ''), attivo=coalesce((p_dati->>'attivo')::boolean,true), updated_at=now()
      where id=v_id and company_id=p_company;
    if not found then raise exception 'Ufficio non modificabile'; end if;
  else
    insert into public.company_uffici(company_id,nome,descrizione,responsabile_id,colore,attivo)
      values(p_company,btrim(p_dati->>'nome'),nullif(btrim(p_dati->>'descrizione'),''),v_manager,nullif(p_dati->>'colore',''),coalesce((p_dati->>'attivo')::boolean,true)) returning id into v_id;
  end if;
  delete from public.ufficio_membri where ufficio_id=v_id and company_id=p_company;
  insert into public.ufficio_membri(ufficio_id,profile_id,company_id) select v_id,m,p_company from unnest(v_members) m;
  return v_id;
end $$;
revoke all on function public.hr_salva_ufficio(uuid,uuid,jsonb,uuid[]) from public, anon;
grant execute on function public.hr_salva_ufficio(uuid,uuid,jsonb,uuid[]) to authenticated;

create or replace function public.hr_importa_festivita(p_company uuid,p_anno integer,p_festivita jsonb)
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null or p_company is null or public.utente_sola_lettura(p_company) then raise exception 'Operazione non consentita'; end if;
  if p_anno not between 1900 and 2199 or jsonb_typeof(p_festivita) <> 'array' or jsonb_array_length(p_festivita) > 100 then
    raise exception 'Calendario non valido';
  end if;
  -- Serialize repeat/double-click imports in this company without changing other companies.
  perform pg_advisory_xact_lock(hashtextextended('hr-holiday:' || p_company::text,0));
  if exists (select 1 from jsonb_to_recordset(p_festivita) x(data date,descrizione text,ricorrente boolean)
    where x.data is null or extract(year from x.data) <> p_anno or nullif(btrim(x.descrizione),'') is null) then
    raise exception 'Festività non valida';
  end if;
  insert into public.hr_festivita(company_id,data,descrizione,ricorrente)
    select p_company,x.data,x.descrizione,coalesce(x.ricorrente,false)
    from (select distinct on(data) data,btrim(descrizione) descrizione,ricorrente from jsonb_to_recordset(p_festivita) x(data date,descrizione text,ricorrente boolean) order by data) x
    where not exists(select 1 from public.hr_festivita h where h.company_id=p_company and
      (h.data=x.data or (h.ricorrente and to_char(h.data,'MM-DD')=to_char(x.data,'MM-DD'))));
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function public.hr_importa_festivita(uuid,integer,jsonb) from public, anon;
grant execute on function public.hr_importa_festivita(uuid,integer,jsonb) to authenticated;

create or replace function public.hr_collega_candidato(p_company uuid,p_candidato uuid)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_c public.hr_candidati%rowtype; v_id uuid;
begin
  if auth.uid() is null or p_company is null or public.utente_sola_lettura(p_company) or (public.e_amministratore_di(p_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) is distinct from true then
    raise exception 'Permessi insufficienti';
  end if;
  select * into v_c from public.hr_candidati where id=p_candidato and company_id=p_company for update;
  if not found then raise exception 'Candidato non accessibile'; end if;
  if v_c.hr_profilo_id is not null then
    if not exists(select 1 from public.hr_profili where id=v_c.hr_profilo_id and company_id=p_company) then raise exception 'Collegamento HR non valido'; end if;
    return v_c.hr_profilo_id;
  end if;
  -- Contact data only. A selection outcome is NOT a signed employment contract.
  -- Do not invent nationality, contract, leave entitlements or working schedule.
  insert into public.hr_profili(company_id,nome,cognome,email,telefono,mansione,attivo,
    tipo_contratto,ccnl,nazionalita,ore_settimanali,ore_giornaliere,orario_tipo,giorni_lavorativi,
    ferie_anno_giorni,ferie_residue,permessi_anno_ore,permessi_residui_ore,rol_anno_ore,rol_residuo_ore,note_interne)
  values(p_company,v_c.nome,v_c.cognome,v_c.email,v_c.telefono,v_c.ruolo,true,
    null,null,null,null,null,null,'{}',null,null,null,null,null,null,
    concat_ws(E'\n',v_c.note,'Creato dalla selezione. Contratto, orario e saldi da verificare con HR.')) returning id into v_id;
  update public.hr_candidati set hr_profilo_id=v_id,stato='assunto',updated_at=now() where id=v_c.id and company_id=p_company;
  if not found then raise exception 'Collegamento non salvato'; end if;
  return v_id;
end $$;
revoke all on function public.hr_collega_candidato(uuid,uuid) from public, anon;
grant execute on function public.hr_collega_candidato(uuid,uuid) to authenticated;

-- Latest position per technician, not the latest 200 samples across the whole company.
create or replace function public.hr_gps_ultime_posizioni(p_company uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from (
    select distinct on (user_id) user_id,lat,lng,accuracy,speed,battery_level,recorded_at
    from public.gps_positions where company_id=p_company and auth.uid() is not null
      and recorded_at >= now()-interval '8 hours'
    order by user_id,recorded_at desc,id desc
  ) p;
$$;
revoke all on function public.hr_gps_ultime_posizioni(uuid) from public,anon;
grant execute on function public.hr_gps_ultime_posizioni(uuid) to authenticated;
