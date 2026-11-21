set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Usa data del fabbisogno e lead time della pianificazione esistente. Conta
-- le promesse ancora credibili e le quantità destinate a quella commessa.
create or replace function private.operazioni_materiale_processa(p_item uuid)
returns date language plpgsql set search_path='' as $$
declare
  oggi date:=(now() at time zone 'Europe/Rome')::date;
  m record;
  eta record;
  responsabile uuid;
  residuo numeric;
  mancante numeric;
  proximo date;
begin
  select i.id,i.order_id,i.name,i.quantity,i.quantity_received,i.unita_misura,i.status,
    o.company_id,o.order_code,o.assigned_to,o.capomastro_user_id,w.name fase,
    coalesce(i.data_fabbisogno,w.start_date::date) serve,
    greatest(1,coalesce(nullif(s.lead_time_days,0),a.giorni_consegna_predefiniti,7)) lead
  into m
  from public.order_items i join public.orders o on o.id=i.order_id and o.deleted_at is null
  left join public.order_work_phases w on w.id=i.phase_id and w.order_id=o.id and w.company_id=o.company_id
  left join public.suppliers s on s.id=i.supplier_id and s.company_id=o.company_id
  left join public.company_acquisti_impostazioni a on a.company_id=o.company_id
  where i.id=p_item and i.natura_riga='materiale'
    and coalesce(w.status,'') not in ('completata','completato','annullata','annullato')
    and coalesce(o.status,'') not in ('completato','consegnato','chiuso','annullato','completed','delivered','closed','cancelled')
    and coalesce(i.status,'') not in ('installato','consegnato','disponibile','in_magazzino','annullato');
  if not found or m.serve is null or coalesce(m.quantity,0)<=0 then
    perform private.operazioni_eccezione_chiudi('cantiere',p_item);
    return null;
  end if;

  with righe as materialized (
    select i.id,i.purchase_order_id,i.quantity,i.quantity_received,i.destinazioni_previste,
      p.oda_number,p.expected_delivery_date,p.status,s.name fornitore
    from public.purchase_order_items i
    join public.purchase_orders p on p.id=i.purchase_order_id and p.company_id=m.company_id
    left join public.suppliers s on s.id=p.supplier_id and s.company_id=p.company_id
    where i.company_id=m.company_id and i.order_item_id=p_item and p.status in ('inviato','confermato','parziale','ricevuto')
      and public.fattura_unita(i.unit_of_measure)=public.fattura_unita(m.unita_misura)
  ), destinazioni as materialized (
    select x.* from public.oda_residui_destinazioni(m.company_id,
      array(select distinct r.purchase_order_id from righe r where jsonb_array_length(r.destinazioni_previste)>0)) x
  ), quanto as (
    select r.*,
      case when jsonb_array_length(r.destinazioni_previste)>0 then coalesce((q.dest->>'consegnata')::numeric,0)
        else coalesce(r.quantity_received,0) end ricevuto,
      case when jsonb_array_length(r.destinazioni_previste)>0 then
        case when coalesce(q.da_verificare,false) then 0 else coalesce((q.dest->>'residua')::numeric,0) end
        else greatest(0,r.quantity-coalesce(r.quantity_received,0)) end residuo
    from righe r
    left join lateral (
      select v as dest,d.da_verificare from destinazioni d cross join lateral jsonb_array_elements(d.destinazioni) v
      where d.riga_id=r.id and v->>'tipo'='commessa' and v->>'id'=m.order_id::text
    ) q on true
  )
  select coalesce(sum(q.ricevuto),0) ricevuto,
    coalesce(sum(q.residuo) filter(where q.expected_delivery_date between oggi and m.serve and q.status<>'ricevuto'),0) in_tempo,
    coalesce(bool_or(q.residuo>0 and (q.expected_delivery_date>m.serve or q.expected_delivery_date<oggi)),false) in_ritardo,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.consegna nulls first,r.numero,r.ordine_id),'[]')
      from (select x.purchase_order_id ordine_id,x.oda_number numero,x.fornitore,x.expected_delivery_date consegna,sum(x.residuo) residuo
        from quanto x where x.residuo>0 and x.status<>'ricevuto'
        group by 1,2,3,4) r) ordini
  into eta from quanto q;
  residuo:=greatest(0,m.quantity-greatest(coalesce(m.quantity_received,0),eta.ricevuto));
  mancante:=greatest(0,residuo-eta.in_tempo);
  if residuo<=0.000001 then
    perform private.operazioni_eccezione_chiudi('cantiere',p_item);
    return null;
  end if;
  if mancante>0.000001 and (oggi>=m.serve-m.lead or eta.in_ritardo) then
    responsabile:=private.operazioni_responsabile(m.company_id,coalesce(m.capomastro_user_id,m.assigned_to));
    perform private.operazioni_eccezione_salva(m.company_id,'cantiere',p_item,m.order_id,responsabile,
      greatest(oggi,least(m.serve,oggi+1)),
      'Materiale a rischio per '||coalesce(nullif(m.order_code,''),'la commessa'),
      jsonb_build_object('materiale',m.name,'fase',m.fase,'commessa',m.order_code,'serve',m.serve,'unita',m.unita_misura,
        'residuo',residuo,'mancante',mancante,'ordini',eta.ordini));
  else
    perform private.operazioni_eccezione_chiudi('cantiere',p_item);
  end if;

  -- Controlla alla soglia di riordino o al giorno dopo la consegna promessa,
  -- anche quando nel frattempo nessuno apre la commessa.
  proximo:=case when m.serve-m.lead>oggi and not eta.in_ritardo then m.serve-m.lead else oggi+1 end;
  return proximo;
end
$$;

create or replace function private.operazioni_fatture_ordine_accoda(p_company uuid,p_ordine uuid)
returns void language sql set search_path='' as $$
  insert into private.operazioni_coda(tipo,origine_id,quando)
  select 'fattura',f.id,now() from (
    select x.id from public.fatture_ricevute x where x.company_id=p_company and x.purchase_order_id=p_ordine
      and (x.created_at>=now()-interval '90 days' or exists(select 1 from private.operazioni_eccezioni e
        where e.company_id=x.company_id and e.origine_id=x.id and e.tipo='pagamento' and e.chiusa_il is null))
    union
    select l.fattura_ricevuta_id from public.purchase_order_items i
    join public.ddt_righe b on b.purchase_order_item_id=i.id and b.company_id=p_company
    join public.fattura_ddt l on l.ddt_ricezione_id=b.ddt_ricezione_id and l.company_id=p_company
    where i.company_id=p_company and i.purchase_order_id=p_ordine
  ) f order by f.id
  on conflict(tipo,origine_id) do update set quando=excluded.quando,tentativi=0,ultimo_errore=null
$$;

create or replace function private.operazioni_materiale_evento()
returns trigger language plpgsql security definer set search_path='' as $$
declare iid uuid; r record;
begin
  if tg_table_name='order_items' then
    if tg_op='DELETE' then iid:=old.id;
    elsif new.natura_riga='materiale' or (tg_op='UPDATE' and old.natura_riga='materiale') then iid:=new.id; end if;
    perform private.operazioni_accoda('materiale',iid);
  elsif tg_table_name='purchase_order_items' then
    if tg_op<>'DELETE' then perform private.operazioni_accoda('materiale',new.order_item_id); end if;
    if tg_op<>'INSERT' then perform private.operazioni_accoda('materiale',old.order_item_id); end if;
    if tg_op='UPDATE' and (new.unit_price,new.discount_percent,new.unit_of_measure,new.sku,new.price_pending,new.quantity_received)
      is distinct from (old.unit_price,old.discount_percent,old.unit_of_measure,old.sku,old.price_pending,old.quantity_received) then
      perform private.operazioni_fatture_ordine_accoda(new.company_id,new.purchase_order_id);
    end if;
  elsif tg_table_name='order_work_phases' then
    for r in select i.id from public.order_items i where i.phase_id=new.id and i.natura_riga='materiale' order by i.id
    loop perform private.operazioni_accoda('materiale',r.id); end loop;
  elsif tg_table_name='purchase_orders' then
    for r in select distinct i.order_item_id from public.purchase_order_items i
      where i.purchase_order_id=new.id and i.company_id=new.company_id and i.order_item_id is not null
      order by i.order_item_id
    loop perform private.operazioni_accoda('materiale',r.order_item_id); end loop;
    if new.status is distinct from old.status then
      perform private.operazioni_fatture_ordine_accoda(new.company_id,new.id);
    end if;
  end if;
  return null;
end
$$;
create or replace trigger operazioni_materiale_evento
  after insert or update of data_fabbisogno,phase_id,quantity,quantity_received,status,natura_riga or delete
  on public.order_items for each row execute function private.operazioni_materiale_evento();
create or replace trigger operazioni_materiale_ordine_evento
  after insert or update of order_item_id,quantity,quantity_received,destinazioni_previste,unit_price,
    discount_percent,unit_of_measure,sku,price_pending or delete
  on public.purchase_order_items for each row execute function private.operazioni_materiale_evento();
create or replace trigger operazioni_fase_evento
  after update of start_date,status on public.order_work_phases
  for each row execute function private.operazioni_materiale_evento();
create or replace trigger operazioni_ordine_evento
  after update of expected_delivery_date,status on public.purchase_orders
  for each row execute function private.operazioni_materiale_evento();

create or replace function private.operazioni_coda_lavora(p_limite integer default 25)
returns integer language plpgsql set search_path='' as $$
declare r record; numero integer:=0; prossimo date;
begin
  for r in select q.* from private.operazioni_coda q where q.quando<=now()
    order by q.quando,q.tipo,q.origine_id limit least(greatest(p_limite,1),50) for update skip locked
  loop
    begin
      prossimo:=null;
      if r.tipo='fattura' then perform private.operazioni_fattura_processa(r.origine_id);
      else prossimo:=private.operazioni_materiale_processa(r.origine_id); end if;
      if prossimo is null then
        delete from private.operazioni_coda where tipo=r.tipo and origine_id=r.origine_id;
      else
        update private.operazioni_coda set quando=((prossimo::timestamp+interval '7 hours') at time zone 'Europe/Rome'),
          tentativi=0,ultimo_errore=null where tipo=r.tipo and origine_id=r.origine_id;
      end if;
      numero:=numero+1;
    exception when others then
      update private.operazioni_coda set tentativi=r.tentativi+1,
        quando=now()+make_interval(mins=>least(60,1+r.tentativi*5)),ultimo_errore=left(sqlstate||' '||sqlerrm,300)
      where tipo=r.tipo and origine_id=r.origine_id;
    end;
  end loop;
  return numero;
end
$$;

revoke all on function private.operazioni_materiale_processa(uuid),private.operazioni_materiale_evento(),
  private.operazioni_fatture_ordine_accoda(uuid,uuid)
from public,anon,authenticated,service_role;

