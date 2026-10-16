-- Locale, da verificare prima della pubblicazione. Nessuna cancellazione fisica.
create or replace function public.set_order_trashed(p_order_id uuid, p_company_id uuid, p_trashed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  superadmin boolean := coalesce(public.has_role(auth.uid(),'super_admin'::public.app_role),false);
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  if p_company_id is null or p_trashed is null then raise exception 'Azienda e operazione obbligatorie.' using errcode='22023'; end if;
  if p_company_id is distinct from public.get_my_company_id()
     and not superadmin then
    raise exception 'Azienda non valida per l''operazione.' using errcode='42501';
  end if;
  if not superadmin
    and (public.utente_bloccato() or public.utente_e_cliente_esterno()
      or not coalesce(p_company_id = any(public.aziende_con_permesso('can_delete_orders')),false)) then
    raise exception 'Non hai il permesso di eliminare le commesse (chiedi all''amministratore).' using errcode='42501';
  end if;
  select * into o from public.orders where id=p_order_id and company_id=p_company_id for update;
  if not found or public.can_see_order(p_order_id,o.assigned_to,o.destination_warehouse_id) is not true then
    raise exception 'Commessa non trovata o non accessibile.' using errcode='42501';
  end if;
  if (o.deleted_at is not null)=p_trashed then return; end if;
  if p_trashed then
    -- Le scadenze non pagate sono previsioni: restano conservate nel cestino.
    -- Movimenti effettivi e documenti fiscali richiedono invece mantenere lo storico attivo.
    if coalesce((to_jsonb(o)->>'deposit_paid')::boolean,false)
      or coalesce((to_jsonb(o)->>'deposit_2_paid')::boolean,false)
      or coalesce((to_jsonb(o)->>'balance_paid')::boolean,false)
      or coalesce((to_jsonb(o)->>'financing_paid')::boolean,false)
      or exists(select 1 from public.invoices where order_id=o.id)
      or exists(select 1 from public.documenti_fiscali where ordine_id=o.id and deleted_at is null)
      or exists(select 1 from public.fattura_ordine where ordine_id=o.id)
      or exists(select 1 from public.company_costs where order_id=o.id)
      or exists(select 1 from public.order_employees where order_id=o.id and (hours_worked>0 or total_cost>0))
      or exists(select 1 from public.order_external_teams t where order_id=o.id and (total_cost>0 or coalesce((to_jsonb(t)->>'is_paid')::boolean,false)))
      or exists(select 1 from public.order_salespeople where order_id=o.id and is_paid)
      or exists(select 1 from public.order_items i where order_id=o.id and (
        coalesce((to_jsonb(i)->>'is_paid')::boolean,false)
        or coalesce((to_jsonb(i)->>'deposit_paid')::boolean,false)
        or coalesce((to_jsonb(i)->>'balance_paid')::boolean,false)))
      or exists(select 1 from public.purchase_orders where order_id=o.id)
      or exists(select 1 from public.contratti_subappalto where order_id=o.id)
      or exists(select 1 from public.stock_units where reserved_order_id=o.id or delivered_to_order_id=o.id)
      or exists(select 1 from public.order_installments where order_id=o.id and (is_paid or invoice_id is not null or documento_fiscale_id is not null))
      or exists(select 1 from public.campo_rapportini where order_id=o.id and stato in ('inviato','approvato')) then
      raise exception 'Questa commessa ha fatture, costi, acquisti, materiali impegnati, pagamenti o rapportini registrati. Mantienila nello storico: non è una commessa vuota creata per errore.';
    end if;
    if exists(select 1 from public.orders where parent_contract_id=o.id and deleted_at is null) then
      raise exception 'Il contratto ha interventi attivi: gestisci prima gli interventi collegati.';
    end if;
  elsif o.parent_contract_id is not null and exists(select 1 from public.orders where id=o.parent_contract_id and deleted_at is not null) then
    raise exception 'Ripristina prima il contratto principale.';
  end if;
  update public.orders set deleted_at=case when p_trashed then now() else null end,
    deleted_by=case when p_trashed then auth.uid() else null end where id=o.id and company_id=p_company_id;
end;
$$;
revoke all on function public.set_order_trashed(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_order_trashed(uuid,uuid,boolean) to authenticated;
