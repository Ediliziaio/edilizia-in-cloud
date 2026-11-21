begin;

-- La rimozione manuale e le variazioni di lavorazioni, squadre e
-- capocantiere si riallineano nello stesso ordine per commessa.
create or replace function public.commessa_allinea_accessi(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if p_order_id is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('accessi-commessa:' || p_order_id::text, 0));

  -- Via chi non lavora più qui.
  delete from public.order_campo_assignments a
   where a.order_id = p_order_id
     and (a.da_squadra_id is not null or a.da_lavori)
     and not exists (select 1 from public.commessa_accessi_voluti(p_order_id) v where v.user_id = a.user_id);

  -- Le date seguono le fasi e le squadre.
  update public.order_campo_assignments a
     set data_inizio = v.dal,
         data_fine_prevista = v.al,
         da_squadra_id = v.squadra_id,
         da_lavori = v.da_lavori
    from public.commessa_accessi_voluti(p_order_id) v
   where a.order_id = p_order_id
     and a.user_id = v.user_id
     and (a.da_squadra_id is not null or a.da_lavori)
     and (a.data_inizio is distinct from v.dal
          or a.data_fine_prevista is distinct from v.al
          or a.da_squadra_id is distinct from v.squadra_id
          or a.da_lavori is distinct from v.da_lavori);

  -- Dentro chi manca, se il suo lavoro non è già finito. Un accesso dato a
  -- mano alla stessa persona resta com'è. Un solo capocantiere per commessa.
  with voluti as (
    select * from public.commessa_accessi_voluti(p_order_id)
  ),
  capo as (
    select v.user_id from voluti v where v.capocantiere order by v.user_id limit 1
  )
  insert into public.order_campo_assignments
    (company_id, order_id, user_id, role_type, assigned_by, data_inizio, data_fine_prevista,
     is_capocantiere, note, da_squadra_id, da_lavori)
  select v.company_id, p_order_id, v.user_id, v.role_type, auth.uid(), v.dal, v.al,
         (v.user_id = (select c.user_id from capo c)
          and not exists (select 1 from public.order_campo_assignments x
                           where x.order_id = p_order_id and x.is_capocantiere)),
         case when v.squadra_id is not null then 'Con la squadra' else 'Dalle fasi di lavoro' end,
         v.squadra_id, v.da_lavori
    from voluti v
   where v.al is null or v.al >= v_oggi
  on conflict (order_id, user_id) do nothing;
end;
$$;

create or replace function public.commessa_capocantiere(p_order_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_edit_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi scegliere il capocantiere di questa commessa.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('accessi-commessa:' || p_order_id::text, 0));

  update public.order_campo_assignments
     set is_capocantiere = false
   where order_id = p_order_id and is_capocantiere and user_id is distinct from p_user_id;

  if p_user_id is null then
    return;
  end if;

  -- Chi lavora qui ma non ha ancora la riga (lavoro segnato prima di oggi).
  perform public.commessa_allinea_accessi(p_order_id);

  update public.order_campo_assignments
     set is_capocantiere = true
   where order_id = p_order_id and user_id = p_user_id and role_type = 'employee';
  if not found then
    raise exception using errcode = '22023', message = 'Questa persona non lavora su questa commessa, o non ha l''app.';
  end if;
end;
$$;

create or replace function public.commessa_togli_accesso_manuale(p_order_id uuid, p_accesso_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_accesso public.order_campo_assignments;
  v_fonte record;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select company_id into v_company
  from public.orders
  where id = p_order_id and deleted_at is null;

  -- Stesso perimetro della cancellazione da ufficio su order_campo_assignments.
  if v_uid is null or v_company is null or public.utente_bloccato()
     or not coalesce(
       public.has_role(v_uid, 'super_admin')
       or (v_company = public.get_user_company_id(v_uid)
           and (public.has_role(v_uid, 'company_admin') or public.has_role(v_uid, 'company_staff'))),
       false
     ) then
    raise exception 'Non puoi rimuovere gli accessi manuali di questa commessa.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('accessi-commessa:' || p_order_id::text, 0));

  select * into v_accesso
  from public.order_campo_assignments
  where id = p_accesso_id and order_id = p_order_id and company_id = v_company
  for update;
  if not found or v_accesso.da_lavori or v_accesso.da_squadra_id is not null then
    raise exception 'L’accesso manuale non è più presente. Aggiorna la commessa.' using errcode = '22023';
  end if;

  select * into v_fonte
  from public.commessa_accessi_voluti(p_order_id)
  where user_id = v_accesso.user_id and (al is null or al >= v_oggi);

  if not found then
    delete from public.order_campo_assignments where id = v_accesso.id;
    return 'rimosso';
  end if;

  -- La riga unica per persona e commessa passa alla fonte automatica. Il
  -- lavoratore conserva l’accesso anche prima del prossimo riallineamento.
  update public.order_campo_assignments
  set role_type = v_fonte.role_type,
      data_inizio = v_fonte.dal,
      data_fine_prevista = v_fonte.al,
      da_squadra_id = v_fonte.squadra_id,
      da_lavori = v_fonte.da_lavori,
      is_capocantiere = coalesce(v_fonte.capocantiere, false) and not exists (
        select 1 from public.order_campo_assignments
        where order_id = p_order_id and id <> v_accesso.id and is_capocantiere
      ),
      note = case when v_fonte.squadra_id is not null then 'Con la squadra' else 'Dalle fasi di lavoro' end
  where id = v_accesso.id;

  return case
    when v_fonte.squadra_id is not null and v_fonte.da_lavori then 'squadra_e_lavorazioni'
    when v_fonte.squadra_id is not null then 'squadra'
    else 'lavorazioni'
  end;
end;
$$;

revoke all on function public.commessa_togli_accesso_manuale(uuid, uuid) from public, anon;
grant execute on function public.commessa_togli_accesso_manuale(uuid, uuid) to authenticated;

commit;
