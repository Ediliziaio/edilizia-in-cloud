-- Registered remotely as 20261028140816 after isolated PostgreSQL tests.
-- No backfill, no new access grants to customer records. The bridge exists
-- only after an explicit assignment and rolls back if the assignment fails.
create or replace function public.commessa_assegna_subappaltatore(
  p_order_id uuid,
  p_subappaltatore_id uuid,
  p_phase_id uuid default null,
  p_cost_preventivo numeric default 0,
  p_cost_consuntivo numeric default 0,
  p_notes text default null
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp set lock_timeout = '5s'
as $$
declare
  v_company uuid;
  v_sub public.subappaltatori%rowtype;
  v_team public.external_teams%rowtype;
  v_assignment uuid;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Accesso non autorizzato.' using errcode = '42501';
  end if;
  select company_id into v_company from public.orders where id=p_order_id and deleted_at is null;
  if v_company is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false) then
    raise exception 'Commessa non disponibile o non modificabile.' using errcode = '42501';
  end if;
  if p_cost_preventivo is null or p_cost_consuntivo is null
    or not (p_cost_preventivo between 0 and 9999999999.99)
    or not (p_cost_consuntivo between 0 and 9999999999.99)
    or length(coalesce(p_notes,''))>6000 then
    raise exception 'Controlla importi e note: nessuna assegnazione salvata.';
  end if;
  -- Same firm/order lock serializes bridge creation and duplicate checks.
  perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || p_subappaltatore_id::text, 0));
  select * into v_sub from public.subappaltatori
    where id=p_subappaltatore_id and company_id=v_company and is_active is not false for share;
  if not found then
    raise exception 'Subappaltatore non disponibile o non attivo per questa azienda.' using errcode = '42501';
  end if;
  if p_phase_id is not null and not exists(select 1 from public.order_work_phases where id=p_phase_id and order_id=p_order_id and company_id=v_company) then
    raise exception 'La lavorazione non appartiene a questa commessa.' using errcode = '42501';
  end if;
  select * into v_team from public.external_teams
    where company_id=v_company and subappaltatore_id=p_subappaltatore_id and kind='esterna'
    order by is_active desc nulls last, created_at, id limit 1 for update;
  if found then
    if v_team.is_active is not true then
      raise exception 'La ditta collegata è disattivata: riattivala prima di assegnarla.';
    end if;
  else
    insert into public.external_teams(company_id,name,contact_name,phone,email,kind,is_active,subappaltatore_id)
      values(v_company,coalesce(nullif(btrim(v_sub.ragione_sociale),''),'Subappaltatore'),v_sub.responsabile,v_sub.telefono,v_sub.email,'esterna',true,v_sub.id)
      returning * into v_team;
  end if;
  if exists(select 1 from public.order_external_teams where order_id=p_order_id and external_team_id=v_team.id and phase_id is not distinct from p_phase_id) then
    raise exception 'Ditta già assegnata a questa lavorazione. Modifica l’assegnazione esistente.';
  end if;
  insert into public.order_external_teams(order_id,external_team_id,phase_id,cost_preventivo,total_cost,vat_rate,is_paid,notes)
    values(p_order_id,v_team.id,p_phase_id,round(p_cost_preventivo,2),round(p_cost_consuntivo,2),v_team.vat_rate,false,nullif(btrim(p_notes),''))
    returning id into v_assignment;
  return v_assignment;
end;
$$;
revoke all on function public.commessa_assegna_subappaltatore(uuid,uuid,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.commessa_assegna_subappaltatore(uuid,uuid,uuid,numeric,numeric,text) to authenticated;
comment on function public.commessa_assegna_subappaltatore(uuid,uuid,uuid,numeric,numeric,text) is
  'Assegna un subappaltatore dell’azienda creando solo alla conferma il ponte operativo. SECURITY INVOKER, RLS e transazione unica.';
