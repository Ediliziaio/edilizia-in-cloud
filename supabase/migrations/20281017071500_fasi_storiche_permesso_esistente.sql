begin;
set local lock_timeout = '3s';
-- Use the existing company permission check, including its established superadmin handling.
create or replace function public.fase_storica_protetta(p_phase_id uuid,p_company_id uuid,p_item_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.order_work_phases%rowtype; i public.order_items%rowtype;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company_id)
 or public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company_id) is not true then raise exception 'Fase non disponibile.' using errcode='42501';end if;
 select f.* into p from public.order_work_phases f join public.orders o on o.id=f.order_id
 where f.id=p_phase_id and f.company_id=p_company_id and o.company_id=p_company_id and f.legacy_order_item_id=p_item_id
 and public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id);
 if not found then return true;end if;
 select * into i from public.order_items where id=p_item_id and order_id=p.order_id;
 return p.status is distinct from 'da_iniziare' or coalesce(p.percentuale,0)>0
 or p.start_date is not null or p.end_date is not null
 or p.name is distinct from left(split_part(i.name,'  ',1),200)
 or p.notes is distinct from concat_ws(E'\n',i.name,i.description)
 or p.importo_venduto is distinct from (case when i.unit_price is null then null else round(i.quantity*i.unit_price*(1-coalesce(i.discount_percent,0)/100),2) end)
 or exists(select 1 from public.order_employees where phase_id=p.id)
 or exists(select 1 from public.order_external_teams where phase_id=p.id)
 or exists(select 1 from public.order_work_subphases where phase_id=p.id)
 or exists(select 1 from public.order_phase_assignments where phase_id=p.id)
 or exists(select 1 from public.squadre_commesse where phase_id=p.id)
 or exists(select 1 from public.note_cantiere where phase_id=p.id)
 or exists(select 1 from public.ordini_variazione where work_phase_id=p.id)
 or exists(select 1 from public.order_items where phase_id=p.id and id<>p_item_id);
end $$;
revoke all on function public.fase_storica_protetta(uuid,uuid,uuid) from public,anon;
grant execute on function public.fase_storica_protetta(uuid,uuid,uuid) to authenticated;
create or replace function public.riclassifica_righe_storiche(p_company_id uuid,p_order_id uuid,p_item_ids uuid[],p_natura text,p_expected jsonb default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype; i public.order_items%rowtype; pid uuid; totale integer:=0; expected jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company_id)
    or public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company_id) is not true then raise exception 'Non hai il permesso di modificare le commesse.' using errcode='42501'; end if;
  if p_natura not in('materiale','lavorazione','descrizione') or p_natura is null or coalesce(cardinality(p_item_ids),0)=0 then raise exception 'Seleziona le righe da classificare.'; end if;
  select * into o from public.orders where id=p_order_id and company_id=p_company_id and deleted_at is null for update;
  if not found or not public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id) then raise exception 'Commessa non disponibile.' using errcode='42501'; end if;
  for i in select * from public.order_items where order_id=o.id and id=any(p_item_ids) order by id for update loop
    if p_expected is not null then
      select v into expected from jsonb_array_elements(p_expected) v where v->>'id'=i.id::text;
      if expected is null or i.name is distinct from expected->>'name'
        or i.quantity is distinct from (expected->>'quantity')::numeric
        or i.unit_price is distinct from (expected->>'unit_price')::numeric
        or i.discount_percent is distinct from (expected->>'discount_percent')::numeric
        or i.natura_riga is distinct from coalesce(expected->>'natura_riga','materiale')
        or i.phase_id is distinct from (expected->>'phase_id')::uuid then
        raise exception 'Le righe sono cambiate: ricarica la commessa e ricontrolla la selezione.' using errcode='40001';
      end if;
    end if;
    if i.natura_riga=p_natura then continue; end if;
    if i.phase_id is not null and not exists(select 1 from public.order_work_phases where id=i.phase_id and legacy_order_item_id=i.id) then raise exception 'Riga già assegnata a una fase: verifica il collegamento prima di riclassificarla.'; end if;
    if i.supplier_id is not null or i.stock_item_id is not null or coalesce(i.purchase_price,0)<>0 or coalesce(i.standard_cost,0)<>0 or i.is_paid or i.deposit_paid or i.balance_paid
      or i.status is distinct from 'da_ordinare' or coalesce(i.quantity_received,0)>0 or coalesce(i.quantity_reserved,0)>0
      or i.receipt_id is not null or i.shipment_id is not null or i.installation_id is not null
      or exists(select 1 from public.purchase_order_items where order_item_id=i.id)
      or exists(select 1 from public.warehouse_movements where order_item_id=i.id)
      or exists(select 1 from public.stock_units where reserved_order_id=o.id or delivered_to_order_id=o.id)
      then raise exception 'Riga già collegata ad acquisti, budget, pagamenti o magazzino: revisione manuale necessaria.'; end if;
    if i.natura_riga<>'materiale' and i.phase_id is not null then
      perform id from public.order_work_phases where id=i.phase_id for update;
      if public.fase_storica_protetta(i.phase_id,p_company_id,i.id)
        then raise exception 'La fase è già utilizzata: conserva lo storico del cantiere.'; end if;
    end if;
    if p_natura='lavorazione' then
      insert into public.order_work_phases(company_id,order_id,name,position,notes,legacy_order_item_id,importo_venduto)
        values(p_company_id,o.id,left(split_part(i.name,'  ',1),200),i.position,concat_ws(E'\n',i.name,i.description),i.id,case when i.unit_price is null then null else round(i.quantity*i.unit_price*(1-coalesce(i.discount_percent,0)/100),2) end)
        on conflict(legacy_order_item_id) do update set legacy_order_item_id=excluded.legacy_order_item_id returning id into pid;
      update public.order_items set natura_riga=p_natura,phase_id=pid where id=i.id;
    else
      update public.order_items set natura_riga=p_natura,phase_id=null where id=i.id;
      delete from public.order_work_phases where legacy_order_item_id=i.id;
    end if;
    totale:=totale+1;
  end loop;
  if (select count(*) from public.order_items where order_id=o.id and id=any(p_item_ids))<>cardinality(p_item_ids) then raise exception 'Alcune righe non appartengono alla commessa o sono duplicate.'; end if;
  return totale;
end $$;
revoke all on function public.riclassifica_righe_storiche(uuid,uuid,uuid[],text,jsonb) from public,anon;
grant execute on function public.riclassifica_righe_storiche(uuid,uuid,uuid[],text,jsonb) to authenticated;



commit;
