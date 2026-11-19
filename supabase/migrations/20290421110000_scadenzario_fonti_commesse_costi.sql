-- PR 150: rilascio autorizzato. Versione riservata dopo verifica del registro.
-- Proiezione in lettura: nessuna scadenza/copertura/pagamento viene creato o modificato.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.scadenzario_fonti(p_company_id uuid)
returns setof public.scadenze
language plpgsql stable security invoker
set search_path = public, pg_temp
as $function$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role() and not public.puo_vedere_scadenze(p_company_id) then
    raise exception 'Non hai il permesso di vedere le scadenze.' using errcode = '42501';
  end if;

  -- Mantiene identità e azioni delle scadenze esistenti. La data convenzionale
  -- «ignota» non diventa una scadenza nell'anno 9999.
  return query select (jsonb_populate_record(null::public.scadenze,
    to_jsonb(s) || jsonb_build_object('due_date', nullif(s.due_date, date '9999-12-31')))).*
    from public.scadenze s where s.company_id = p_company_id;

  -- Costi senza una propria scadenza: totale lordo come nel pagamento delle spese,
  -- pagamenti al netto degli storni. Le rate fornitore sostituiscono il totale,
  -- con il pagato allocato una sola volta in ordine di scadenza.
  return query
  with costi as materialized (
    select c.*,
      round(coalesce((select sum(case when f.tipo_documento in ('TD04','TD08','passive_credit_note')
                       then -abs(f.totale_documento) else f.totale_documento end)
        from public.fatture_ricevute f where f.company_cost_id=c.id and f.company_id=c.company_id
          and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata')),
        c.amount * (1 + coalesce(c.vat_rate,0)/100)) - public.costo_stornato_da_note(c.id),2) as lordo,
      coalesce((select sum(case when p.direction='uscita' then p.amount else -p.amount end)
        from public.prima_nota_entries p where p.cost_id=c.id and p.company_id=c.company_id),0) as versato
    from public.company_costs c
    where c.company_id=p_company_id and c.annullato_il is null and c.amount>0
      and not exists(select 1 from public.scadenze s where s.company_id=c.company_id and s.cost_id=c.id)
  ), quote as (
    select c.id as costo, r.id::text as chiave, r.importo as importo,
      nullif(r.scadenza,date '9999-12-31') as data, r.metodo as metodo,
      r.stato='pagata' as pagata,
      coalesce(sum(r.importo) filter(where r.stato='pagata') over(partition by c.id),0) as chiuse,
      coalesce(sum(r.importo) filter(where r.stato<>'pagata') over(partition by c.id order by r.scadenza nulls last,r.numero,r.id
        rows between unbounded preceding and 1 preceding),0) as precedente
    from costi c join public.rate_fornitori r on r.company_cost_id=c.id and r.company_id=c.company_id
    where r.stato<>'stornata' and r.importo>0
    union all
    select c.id,'totale',c.lordo,nullif(c.due_date,date '9999-12-31'),c.payment_method,false,0,0
    from costi c where not exists(select 1 from public.rate_fornitori r
      where r.company_cost_id=c.id and r.company_id=c.company_id and r.stato<>'stornata')
  )
  select (jsonb_populate_record(null::public.scadenze,jsonb_build_object(
    'id',md5('scadenzario:costo:'||c.id::text||':'||q.chiave)::uuid,'company_id',c.company_id,
    'tipo',case when c.supplier_id is null then 'costo_aziendale' else 'pagamento_fornitore' end,
    'direction','uscita','description',c.name,'amount',q.importo,'due_date',q.data,
    'paid_amount',p.importo,
    'status',case when p.importo>=q.importo then 'pagata' when p.importo>0 then 'parziale' else 'da_pagare' end,
    'paid_date',c.paid_date,'payment_method',q.metodo,'cost_id',c.id,'order_id',c.order_id,
    'supplier_id',c.supplier_id,'is_auto_generated',true,'auto_source','fonte_costo',
    'created_at',c.created_at,'updated_at',c.updated_at))).*
  from costi c join quote q on q.costo=c.id
  cross join lateral (select case when c.is_paid or q.pagata then q.importo
    else least(q.importo,greatest(0,c.versato-q.chiuse-q.precedente)) end as importo) p
  where q.importo>0;

  -- Il residuo delle commesse viene dalla regola comune del cruscotto, comprese
  -- le commesse storiche senza piano. I diritti sulle commesse restano quelli
  -- della RPC esistente e delle policy di orders (invoker).
  if public.ai_is_service_role() or public.user_can_read_accountant_company(p_company_id)
     or coalesce(public.has_permission_for_company(auth.uid(),'can_view_orders',p_company_id),false)
     or coalesce(public.has_permission_for_company(auth.uid(),'can_view_cruscotto',p_company_id),false) then
    return query
    select (jsonb_populate_record(null::public.scadenze,jsonb_build_object(
      'id',md5('scadenzario:rata:'||r.id)::uuid,'company_id',o.company_id,
      'tipo','incasso_cliente','direction','entrata',
      'description',concat_ws(' — ',coalesce(i.label,'Importo da pianificare'),o.order_code,
        coalesce(o.client_company,o.client_name)),
      'amount',r.amount,'due_date',nullif(r.expected_date,date '9999-12-31'),
      'paid_amount',0,'status','da_pagare','order_id',o.id,'payment_method',o.payment_type,
      'is_auto_generated',true,'auto_source','fonte_commessa',
      'created_at',o.created_at,'updated_at',o.updated_at))).*
    from public.cruscotto_rate_da_incassare(p_company_id) r
    join public.orders o on o.id=r.order_id and o.company_id=p_company_id and o.deleted_at is null
    left join public.order_installments i on i.id::text=r.id and i.order_id=o.id
    where r.amount>0
      -- Le scadenze già esplicite della commessa hanno precedenza: non si
      -- aggiunge una seconda previsione dello stesso credito.
      and not exists(select 1 from public.scadenze s where s.company_id=o.company_id
        and s.order_id=o.id and s.direction='entrata' and s.status<>'annullata')
      and not exists(select 1 from public.scadenze s where s.company_id=o.company_id and (
        s.invoice_id=i.invoice_id or s.notes like '%[DOC:'||coalesce(i.documento_fiscale_id::text,r.id)||']%'));
  end if;
end;
$function$;

revoke all on function public.scadenzario_fonti(uuid) from public, anon;
grant execute on function public.scadenzario_fonti(uuid) to authenticated, service_role;

create or replace function public.scadenzario_riepilogo_fonti(
  p_company_id uuid, p_date_from date default null, p_date_to date default null,
  p_includi_senza_data boolean default true, p_solo_senza_data boolean default false)
returns jsonb language sql stable security invoker
set search_path = public, pg_temp
as $function$
  with tutte as materialized (select * from public.scadenzario_fonti(p_company_id) where status<>'annullata'),
  s as (select * from tutte where (not p_solo_senza_data or due_date is null) and (
    (due_date is null and p_includi_senza_data)
    or (due_date is not null and (p_date_from is null or due_date>=p_date_from)
        and (p_date_to is null or due_date<=p_date_to))))
  select jsonb_build_object(
    'senza_data_count',(select count(*) from tutte where due_date is null and status in ('da_pagare','parziale')),
    'tutte_count',count(*),'da_incassare_count',count(*) filter(where direction='entrata' and status in ('da_pagare','parziale')),
    'da_pagare_count',count(*) filter(where direction='uscita' and status in ('da_pagare','parziale')),
    'pagate_count',count(*) filter(where status='pagata'),
    'entrate_previste',coalesce(sum(amount-paid_amount) filter(where direction='entrata' and status in ('da_pagare','parziale')),0),
    'uscite_previste',coalesce(sum(amount-paid_amount) filter(where direction='uscita' and status in ('da_pagare','parziale')),0),
    'scadute_count',count(*) filter(where status in ('da_pagare','parziale') and due_date<current_date),
    'scadute_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date<current_date),0),
    'scadute_entrata_count',count(*) filter(where direction='entrata' and status in ('da_pagare','parziale') and due_date<current_date),
    'scadute_entrata_amount',coalesce(sum(amount-paid_amount) filter(where direction='entrata' and status in ('da_pagare','parziale') and due_date<current_date),0),
    'scadute_uscita_count',count(*) filter(where direction='uscita' and status in ('da_pagare','parziale') and due_date<current_date),
    'scadute_uscita_amount',coalesce(sum(amount-paid_amount) filter(where direction='uscita' and status in ('da_pagare','parziale') and due_date<current_date),0),
    'questa_settimana_count',count(*) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+7),
    'questa_settimana_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+7),0),
    'prossimi_30gg_count',count(*) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+30),
    'prossimi_30gg_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+30),0),
    'questo_mese_count',count(*) filter(where status in ('da_pagare','parziale') and date_trunc('month',due_date)=date_trunc('month',current_date)),
    'questo_mese_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and date_trunc('month',due_date)=date_trunc('month',current_date)),0)
  ) from s;
$function$;
revoke all on function public.scadenzario_riepilogo_fonti(uuid,date,date,boolean,boolean) from public, anon;
grant execute on function public.scadenzario_riepilogo_fonti(uuid,date,date,boolean,boolean) to authenticated, service_role;
