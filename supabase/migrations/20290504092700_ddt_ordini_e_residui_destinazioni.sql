set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La registrazione della bolla, dei riferimenti e delle righe è atomica.
-- I permessi e i controlli sul fornitore sono quelli delle tabelle esistenti.
create or replace function public.ddt_registra_con_ordini(p_dati jsonb,p_righe jsonb,p_ordini uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  dati public.ddt_ricezione%rowtype;
  bolla public.ddt_ricezione%rowtype;
  ordini uuid[];
begin
  if auth.uid() is null or jsonb_typeof(p_dati) is distinct from 'object'
    or jsonb_typeof(p_righe) is distinct from 'array'
    or coalesce(cardinality(p_ordini),0)=0 then
    raise exception 'Servono la bolla e gli ordini scelti.' using errcode='22023';
  end if;
  dati:=jsonb_populate_record(null::public.ddt_ricezione,p_dati);
  ordini:=array(select distinct id from unnest(p_ordini||dati.purchase_order_id) id where id is not null);
  if dati.supplier_id is null or exists (
    select 1 from unnest(ordini) o(ordine_id)
    where not exists(select 1 from public.purchase_orders p where p.id=o.ordine_id
      and p.company_id=dati.company_id and p.supplier_id=dati.supplier_id and p.status not in ('bozza','annullato'))
  ) then
    raise exception 'Collega ordini emessi per lo stesso fornitore.' using errcode='23514';
  end if;
  insert into public.ddt_ricezione(company_id,purchase_order_id,order_id,supplier_id,destinazione,ricezione_esplicita,
    trasporto_a_cura_di,porto,warehouse_id,numero_ddt,data_ricezione,quantita_ricevuta,stato,note,created_by,
    corriere,targa_mezzo,autista_nome,autista_telefono,ora_arrivo,ora_partenza,ricevuto_da_nome,non_conformita,has_damages,
    ai_lettura,ai_confidenza,ai_avvisi)
  values(dati.company_id,dati.purchase_order_id,dati.order_id,dati.supplier_id,dati.destinazione,true,
    dati.trasporto_a_cura_di,dati.porto,dati.warehouse_id,dati.numero_ddt,dati.data_ricezione,0,dati.stato,dati.note,auth.uid(),
    dati.corriere,dati.targa_mezzo,dati.autista_nome,dati.autista_telefono,dati.ora_arrivo,dati.ora_partenza,
    dati.ricevuto_da_nome,dati.non_conformita,coalesce(dati.has_damages,false),dati.ai_lettura,dati.ai_confidenza,dati.ai_avvisi)
  returning * into bolla;

  insert into public.ddt_ordini_acquisto(ddt_id,purchase_order_id,company_id)
  select bolla.id,o,bolla.company_id from unnest(ordini) o where o is distinct from bolla.purchase_order_id;

  if exists (
    select 1 from jsonb_populate_recordset(null::public.ddt_righe,p_righe) x
    where x.purchase_order_item_id is not null
      and not exists(select 1 from public.purchase_order_items i
        where i.id=x.purchase_order_item_id and i.company_id=bolla.company_id and i.purchase_order_id=any(ordini))
  ) then
    raise exception 'Controlla le righe degli ordini collegati alla bolla.' using errcode='22023';
  end if;
  insert into public.ddt_righe(company_id,ddt_ricezione_id,posizione,codice_articolo,descrizione,unita_misura,
    quantita,prezzo_unitario,importo,iva_percentuale,order_item_id,purchase_order_item_id,abbinamento,
    origine,ai_originale,testo_grezzo,note)
  select bolla.company_id,bolla.id,coalesce(x.posizione,0),x.codice_articolo,x.descrizione,x.unita_misura,
    x.quantita,x.prezzo_unitario,x.importo,x.iva_percentuale,x.order_item_id,x.purchase_order_item_id,x.abbinamento,
    coalesce(x.origine,'manuale'),x.ai_originale,x.testo_grezzo,x.note
  from jsonb_populate_recordset(null::public.ddt_righe,p_righe) x;
  return to_jsonb(bolla);
end
$$;
revoke all on function public.ddt_registra_con_ordini(jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.ddt_registra_con_ordini(jsonb,jsonb,uuid[]) to authenticated;
notify pgrst,'reload schema';

-- Un reso riapre la destinazione della consegna da cui proviene. Le quantità
-- storiche prive di una consegna puntuale si espongono come da attribuire.
create or replace function public.oda_residui_destinazioni(p_company uuid,p_ordini uuid[])
returns table(riga_id uuid,destinazioni jsonb,non_attribuita numeric,fuori_piano numeric,da_verificare boolean)
language sql stable security invoker set search_path = '' as $$
  with righe as materialized (
    select i.id,i.quantity_received,i.destinazioni_previste
    from public.purchase_order_items i
    where i.company_id=p_company and i.purchase_order_id=any(p_ordini)
      and jsonb_array_length(i.destinazioni_previste)>0
  ), consegnate as materialized (
    select r.id,
      case when c.destinazione='cantiere' then 'commessa' else c.destinazione end as tipo,
      case when c.destinazione='cantiere' then c.order_id else c.warehouse_id end as destinazione_id,
      sum(greatest(0,c.quantita-coalesce(resi.quantita,0))) as quantita
    from righe r join public.ddt_consegne c on c.purchase_order_item_id=r.id and c.company_id=p_company and c.tipo='ingresso'
    left join lateral (
      select sum(s.quantita) quantita from public.ddt_consegne s
      where s.company_id=c.company_id and s.consegna_origine_id=c.id and s.tipo='reso'
    ) resi on true
    group by 1,2,3
  ), previste as materialized (
    select r.id,p.valore,p.posizione
    from righe r cross join lateral jsonb_array_elements(r.destinazioni_previste) with ordinality p(valore,posizione)
  )
  select r.id,d.lista,
    greatest(0,coalesce(r.quantity_received,0)-coalesce(t.totale,0)),
    coalesce(t.fuori_piano,0),
    abs(coalesce(r.quantity_received,0)-coalesce(t.totale,0))>0.000001
  from righe r
  cross join lateral (
    select jsonb_agg(p.valore||jsonb_build_object(
      'consegnata',coalesce(c.quantita,0),
      'residua',greatest(0,(p.valore->>'quantita')::numeric-coalesce(c.quantita,0)),
      'eccedenza',greatest(0,coalesce(c.quantita,0)-(p.valore->>'quantita')::numeric)
    ) order by p.posizione) lista
    from previste p left join consegnate c on c.id=p.id and c.tipo=p.valore->>'tipo' and c.destinazione_id::text=p.valore->>'id'
    where p.id=r.id
  ) d
  cross join lateral (
    select sum(c.quantita) totale,sum(c.quantita) filter(where not exists (
      select 1 from previste p where p.id=c.id and p.valore->>'tipo'=c.tipo and p.valore->>'id'=c.destinazione_id::text
    )) fuori_piano
    from consegnate c where c.id=r.id
  ) t
$$;
revoke all on function public.oda_residui_destinazioni(uuid,uuid[]) from public,anon;
grant execute on function public.oda_residui_destinazioni(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
