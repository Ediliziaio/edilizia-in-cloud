-- Scadenzario: aggrega le fonti una volta per azienda e costruisce ogni riga una sola volta.
-- Stesse identità, importi e regole di allocazione. Le policy delle fonti restano attive.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.scadenzario_fonti(p_company_id uuid)
 RETURNS SETOF public.scadenze
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role() and not public.puo_vedere_scadenze(p_company_id) then
    raise exception 'Non hai il permesso di vedere le scadenze.' using errcode = '42501';
  end if;

  -- Mantiene identità e azioni delle scadenze esistenti. La data convenzionale
  -- «ignota» non diventa una scadenza nell'anno 9999.
  return query select r.*
    from public.scadenze s
    cross join lateral jsonb_populate_record(null::public.scadenze,
      to_jsonb(s) || jsonb_build_object('due_date', nullif(s.due_date, date '9999-12-31'))) r
    where s.company_id = p_company_id;

  -- Costi senza una propria scadenza: totale lordo come nel pagamento delle spese,
  -- pagamenti al netto degli storni. Le rate fornitore sostituiscono il totale,
  -- con il pagato allocato una sola volta in ordine di scadenza.
  return query
  with costi_base as materialized (
    select c.*
    from public.company_costs c
    where c.company_id=p_company_id and c.annullato_il is null and c.amount>0
      and not exists(select 1 from public.scadenze s
        where s.company_id=p_company_id and s.cost_id=c.id)
  ), fatture as (
    select f.company_cost_id, sum(case
      when f.tipo_documento in ('TD04','TD08','passive_credit_note')
        then -abs(f.totale_documento) else f.totale_documento end) as totale
    from public.fatture_ricevute f
    join costi_base c on c.id=f.company_cost_id
    where f.company_id=p_company_id
      and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata')
    group by f.company_cost_id
  ), pagamenti as (
    select p.cost_id, sum(case when p.direction='uscita' then p.amount else -p.amount end) as totale
    from public.prima_nota_entries p
    join costi_base c on c.id=p.cost_id
    where p.company_id=p_company_id
    group by p.cost_id
  ), storni as (
    select s.company_cost_id, sum(s.importo) as totale
    from public.note_credito_storni s
    join costi_base c on c.id=s.company_cost_id
    join public.fatture_ricevute n on n.id=s.nota_id
    where n.company_cost_id is null
    group by s.company_cost_id
  ), compensazioni as materialized (
    -- La stessa fonte degli anticipi, letta una volta per azienda.
    select a.cost_id, sum(a.amount) as totale
    from public.previsionale_compensazioni_anticipi(p_company_id,current_date) a
    group by a.cost_id
  ), costi as materialized (
    select c.*,
      round(coalesce(f.totale,c.amount*(1+coalesce(c.vat_rate,0)/100))
        -coalesce(s.totale,0),2) as lordo,
      coalesce(p.totale,0)+coalesce(a.totale,0) as versato
    from costi_base c
    left join fatture f on f.company_cost_id=c.id
    left join pagamenti p on p.cost_id=c.id
    left join storni s on s.company_cost_id=c.id
    left join compensazioni a on a.cost_id=c.id
  ), rate as materialized (
    select r.*
    from public.rate_fornitori r
    join costi_base c on c.id=r.company_cost_id
    where r.company_id=p_company_id and r.stato<>'stornata'
  ), quote as (
    select c.id as costo, r.id::text as chiave, r.importo as importo,
      nullif(r.scadenza,date '9999-12-31') as data, r.metodo as metodo,
      r.stato='pagata' as pagata,
      coalesce(sum(r.importo) filter(where r.stato='pagata') over(partition by c.id),0) as chiuse,
      coalesce(sum(r.importo) filter(where r.stato<>'pagata') over(partition by c.id order by r.scadenza nulls last,r.numero,r.id
        rows between unbounded preceding and 1 preceding),0) as precedente
    from costi c join rate r on r.company_cost_id=c.id
    where r.importo>0
    union all
    select c.id,'totale',c.lordo,nullif(c.due_date,date '9999-12-31'),c.payment_method,false,0,0
    from costi c where not exists(select 1 from rate r where r.company_cost_id=c.id)
  )
  select costruita.*
  from costi c join quote q on q.costo=c.id
  cross join lateral (select case when c.is_paid or q.pagata then q.importo
    else least(q.importo,greatest(0,c.versato-q.chiuse-q.precedente)) end as importo) p
  cross join lateral jsonb_populate_record(null::public.scadenze,jsonb_build_object(
    'id',md5('scadenzario:costo:'||c.id::text||':'||q.chiave)::uuid,'company_id',c.company_id,
    'tipo',case when c.supplier_id is null then 'costo_aziendale' else 'pagamento_fornitore' end,
    'direction','uscita','description',c.name,'amount',q.importo,'due_date',q.data,
    'paid_amount',p.importo,
    'status',case when p.importo>=q.importo then 'pagata' when p.importo>0 then 'parziale' else 'da_pagare' end,
    'paid_date',c.paid_date,'payment_method',q.metodo,'cost_id',c.id,'order_id',c.order_id,
    'supplier_id',c.supplier_id,'is_auto_generated',true,'auto_source','fonte_costo',
    'created_at',c.created_at,'updated_at',c.updated_at)) costruita
  where q.importo>0;

  -- Il residuo delle commesse viene dalla regola comune del cruscotto, comprese
  -- le commesse storiche senza piano. I diritti sulle commesse restano quelli
  -- della RPC esistente e delle policy di orders (invoker).
  if public.ai_is_service_role() or public.user_can_read_accountant_company(p_company_id)
     or coalesce(public.has_permission_for_company(auth.uid(),'can_view_orders',p_company_id),false)
     or coalesce(public.has_permission_for_company(auth.uid(),'can_view_cruscotto',p_company_id),false) then
    return query
    select costruita.*
    from public.cruscotto_rate_da_incassare(p_company_id) r
    join public.orders o on o.id=r.order_id and o.company_id=p_company_id and o.deleted_at is null
    left join public.order_installments i on i.id::text=r.id and i.order_id=o.id
    cross join lateral jsonb_populate_record(null::public.scadenze,jsonb_build_object(
      'id',md5('scadenzario:rata:'||r.id)::uuid,'company_id',o.company_id,
      'tipo','incasso_cliente','direction','entrata',
      'description',concat_ws(' — ',coalesce(i.label,'Importo da pianificare'),o.order_code,
        coalesce(o.client_company,o.client_name)),
      'amount',r.amount,'due_date',nullif(r.expected_date,date '9999-12-31'),
      'paid_amount',0,'status','da_pagare','order_id',o.id,'payment_method',o.payment_type,
      'is_auto_generated',true,'auto_source','fonte_commessa',
      'created_at',o.created_at,'updated_at',o.updated_at)) costruita
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
