-- Distribuita in produzione il 2026-11-06: migrazione 20261106075753.
-- Baseline per replay/test: non riapplicare su funzioni già aggiornate.
-- RPC server distribuita prima del collegamento del client.
-- SECURITY INVOKER: tutte le letture/scritture restano soggette alle RLS esistenti.
create or replace function public.crea_oda_materiali_atomica(
  p_company_id uuid, p_order_id uuid, p_supplier_id uuid, p_righe jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_item record; v_group record; v_line jsonb; v_po uuid; v_code text;
  v_covered numeric; v_requested numeric; v_pos integer := 0;
begin
  if auth.uid() is null then raise exception 'Accesso negato' using errcode='42501'; end if;
  if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe)=0 then
    raise exception 'Nessun articolo da ordinare' using errcode='22023';
  end if;
  if not exists(select 1 from public.orders where id=p_order_id and company_id=p_company_id)
    or not exists(select 1 from public.suppliers where id=p_supplier_id and company_id=p_company_id) then
    raise exception 'Commessa o fornitore non accessibili' using errcode='42501';
  end if;
  -- Serializza questo percorso fra dispositivi; non sostituisce le RLS.
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_order_id::text,0));
  if exists(
    select 1 from public.purchase_orders po where po.company_id=p_company_id and po.order_id=p_order_id
      and po.supplier_id=p_supplier_id and po.status <> 'annullato'
      and (not exists(select 1 from public.purchase_order_items i where i.purchase_order_id=po.id)
        or exists(select 1 from public.purchase_order_items i where i.purchase_order_id=po.id and i.order_item_id is null))
  ) then raise exception 'Verifica gli ordini esistenti senza righe collegate prima di riprovare'; end if;

  for v_group in select (r->>'order_item_id')::uuid as item_id, sum((r->>'quantity')::numeric) as quantity
    from jsonb_array_elements(p_righe) r group by (r->>'order_item_id')::uuid
  loop
    select i.* into v_item from public.order_items i where i.id=v_group.item_id and i.order_id=p_order_id;
    if not found or v_item.supplier_id is distinct from p_supplier_id or v_item.stock_item_id is not null then
      raise exception 'Articolo non disponibile per questo ordine';
    end if;
    select coalesce(sum(i.quantity),0) into v_covered from public.purchase_order_items i
      join public.purchase_orders po on po.id=i.purchase_order_id
      where i.company_id=p_company_id and po.company_id=p_company_id and i.order_item_id=v_item.id and po.status <> 'annullato';
    if coalesce(jsonb_array_length(v_item.posizioni),0)>0 and v_covered>0 and v_item.quantity>v_covered then
      raise exception 'Distinta parzialmente coperta: verifica le posizioni';
    end if;
    v_requested := v_group.quantity;
    if v_requested is null or v_requested<=0 or round(v_requested,6) <> round(v_item.quantity-v_covered,6)
      or (v_covered=0 and coalesce(v_item.status,'da_ordinare') <> 'da_ordinare') then
      raise exception 'Quantità o coperture cambiate: aggiorna la selezione';
    end if;
    if exists(select 1 from public.purchase_order_items i join public.purchase_orders po on po.id=i.purchase_order_id
      where i.company_id=p_company_id and po.company_id=p_company_id and i.order_item_id=v_item.id and po.status<>'annullato'
      and nullif(lower(trim(i.unit_of_measure)),'') is not null
      and lower(trim(i.unit_of_measure))<>coalesce(nullif(lower(trim(v_item.unita_misura)),''),'pz')) then
      raise exception 'Unità di misura degli ordini esistenti da verificare';
    end if;
    for v_line in select r from jsonb_array_elements(p_righe) r where (r->>'order_item_id')::uuid=v_item.id loop
      if coalesce((v_line->>'quantity')::numeric,0)<=0
        or (v_line->>'unit_price')::numeric is distinct from coalesce(v_item.purchase_price,0)
        or coalesce(v_item.purchase_price,0)<0
        or (v_line->>'vat_rate')::numeric is distinct from coalesce(v_item.vat_rate,22)
        or coalesce(v_item.vat_rate,22) not between 0 and 100
        or coalesce((v_line->>'discount_percent')::numeric,0)<>0
        or v_line->>'unit_of_measure' is distinct from coalesce(nullif(lower(trim(v_item.unita_misura)),''),'pz')
        or nullif(trim(v_line->>'description'),'') is null then
        raise exception 'Dati articolo cambiati o incompleti: aggiorna la selezione';
      end if;
    end loop;
  end loop;

  insert into public.purchase_orders(company_id,supplier_id,order_id,created_by,status,oda_number,notes)
    values(p_company_id,p_supplier_id,p_order_id,auth.uid(),'bozza','','Generato da commessa '||p_order_id::text)
    returning id,oda_number into v_po,v_code;
  for v_line in select r from jsonb_array_elements(p_righe) r loop
    insert into public.purchase_order_items(company_id,purchase_order_id,order_item_id,description,quantity,unit_price,vat_rate,discount_percent,unit_of_measure,sort_order)
      values(p_company_id,v_po,(v_line->>'order_item_id')::uuid,v_line->>'description',(v_line->>'quantity')::numeric,
        (v_line->>'unit_price')::numeric,(v_line->>'vat_rate')::numeric,0,v_line->>'unit_of_measure',v_pos);
    v_pos:=v_pos+1;
  end loop;
  return jsonb_build_object('poId',v_po,'oda_number',v_code,'n',v_pos);
end;
$$;
revoke all on function public.crea_oda_materiali_atomica(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.crea_oda_materiali_atomica(uuid,uuid,uuid,jsonb) to authenticated;
