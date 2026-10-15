-- Conversione locale: una transazione per commessa, materiali, fasi e collegamento.
-- Non modifica prezzi dei preventivi, RLS esistenti o permessi dei piani.
create or replace function public.crea_commessa_preventivo_atomic(
  p_quote_id uuid,
  p_order_data jsonb,
  p_items jsonb default '[]'::jsonb,
  p_installments jsonb default '[]'::jsonb,
  p_salesperson jsonb default null,
  p_quote_version integer default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  q public.quotes%rowtype;
  v_result jsonb;
  v_order uuid;
  v_net numeric;
  v_vat numeric;
  v_position integer := 0;
  r record;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  -- Serializza le due strade e i doppi clic sullo stesso preventivo.
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Preventivo non trovato.'; end if;
  perform public.assert_company_access(q.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', q.company_id) is not true then
    raise exception 'Non hai il permesso di creare commesse.' using errcode='42501';
  end if;
  if q.deleted_at is not null or q.status <> 'accettata' or coalesce(q.source,'') like 'modulo:%' then
    raise exception 'Il preventivo deve essere accettato e appartenere al preventivatore.';
  end if;
  if p_quote_version is not null and q.version is distinct from p_quote_version then
    raise exception 'Il preventivo è cambiato. Riaprilo e controlla le voci prima di continuare.';
  end if;
  if exists(select 1 from public.orders where quote_id=q.id) then
    raise exception 'Esiste già una commessa associata a questo preventivo.' using errcode='23505';
  end if;
  if (p_order_data->>'company_id')::uuid is distinct from q.company_id then
    raise exception 'Azienda non valida.' using errcode='42501';
  end if;
  if exists(select 1 from public.quote_items where quote_id=q.id
    and not coalesce(is_optional,false) and coalesce(quantity,1) <> 0
    and case when nullif(item_category,'') is null then coalesce(item_type,'') not in ('product','service')
      else item_category not in ('prodotto','posa','trasporto','smaltimento','nolo','tiro_piano','pratica','nota','sconto','subtotale') end) then
    raise exception 'Ci sono voci da classificare: rivedi il preventivo.';
  end if;
  v_net := case when q.subtotal > 0 then round(q.subtotal-coalesce(q.discount_amount,0),2) else round(coalesce(q.total,0),2) end;
  v_vat := case when q.subtotal > 0 and v_net > 0 then round(coalesce(q.vat_amount,0)/v_net*100,2) else 0 end;
  -- Importo contrattuale e aliquota provengono dal preventivo, mai dalla somma dei soli materiali.
  v_result := public.create_order_atomic(
    p_order_data || jsonb_build_object('total_amount',v_net,'vat_rate',v_vat),
    p_items, p_salesperson, auth.uid(), p_installments);
  v_order := (v_result->>'id')::uuid;
  update public.orders set quote_id=q.id, quote_number=q.quote_number,
    client_name=q.client_name,client_email=q.client_email,client_phone=q.client_phone,
    client_company=q.client_company,client_address=q.client_address,
    indirizzo_lavori=q.indirizzo_lavori,tipo_lavoro=q.tipo_lavoro,opportunity_id=q.opportunity_id,
    created_by=auth.uid()
    where id=v_order and company_id=q.company_id;
  -- Le lavorazioni non entrano in order_items: nessun acquisto o costo automatico.
  for r in select * from public.quote_items where quote_id=q.id
    and not coalesce(is_optional,false) and coalesce(quantity,1) <> 0
    and (item_category in ('posa','trasporto','smaltimento','nolo','tiro_piano','pratica')
      or (nullif(item_category,'') is null and item_type='service'))
    order by sort_order,id
  loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes,importo_venduto)
    values(q.company_id,v_order,r.name,v_position,
      concat_ws(E'\n',nullif(r.description,''),'Dal preventivo '||coalesce(q.quote_number,''),
        coalesce(r.quantity,1)::text||' '||coalesce(r.unit_of_measure,'')),
      case when coalesce(q.prezzo_manuale,0)=0 and coalesce(q.discount_amount,0)=0
        and coalesce(r.line_total,0)>=0 then r.line_total else null end);
    v_position := v_position+1;
  end loop;
  update public.quotes set status='convertita',updated_at=now() where id=q.id;
  return v_result || jsonb_build_object('order_id',v_order,'lavorazioni',v_position);
end;
$$;
revoke all on function public.crea_commessa_preventivo_atomic(uuid,jsonb,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function public.crea_commessa_preventivo_atomic(uuid,jsonb,jsonb,jsonb,jsonb,integer) to authenticated;
