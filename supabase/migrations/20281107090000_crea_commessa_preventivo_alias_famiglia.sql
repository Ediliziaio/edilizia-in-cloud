-- crea_commessa_preventivo_atomic: l'alias «c» della famiglia del preventivo si scontrava con la variabile «c» (02/11/2026).
--
-- La 20281031170000 ha aggiunto `c record` per il ciclo sui capitoli del computo, ma la ricerca delle revisioni usa
-- da prima l'alias `public.quotes c`. Da allora (30/10/2026, 14:54 UTC) ogni conversione si ferma lì:
-- 55000 record "c" is not assigned yet. Cambia solo il nome dell'alias, il resto è il testo di produzione.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.crea_commessa_preventivo_atomic(p_quote_id uuid, p_order_data jsonb, p_items jsonb default '[]'::jsonb, p_installments jsonb default '[]'::jsonb, p_salesperson jsonb default null::jsonb, p_quote_version integer default null::integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q public.quotes%rowtype;
  v_result jsonb;
  v_order uuid;
  v_net numeric;
  v_vat numeric;
  v_position integer := 0;
  r record;
  c record;
  v_famiglia record;
  v_fase uuid;
  v_sotto uuid;
  v_pos_sotto integer;
  v_computo boolean;
  v_senza_sconto boolean;
  v_costo numeric;
  v_mano numeric;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Preventivo non trovato.'; end if;
  perform public.assert_company_access(q.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', q.company_id) is not true then
    raise exception 'Non hai il permesso di creare commesse.' using errcode='42501';
  end if;
  v_computo := coalesce(q.source,'') like 'modulo:computo:%';
  if q.deleted_at is not null or q.status <> 'accettata' or (coalesce(q.source,'') like 'modulo:%' and not v_computo) then
    raise exception 'Il preventivo deve essere accettato e appartenere al preventivatore.';
  end if;
  if p_quote_version is not null and q.version is distinct from p_quote_version then
    raise exception 'Il preventivo è cambiato. Riaprilo e controlla le voci prima di continuare.';
  end if;
  if exists(select 1 from public.orders where quote_id=q.id) then
    raise exception 'Esiste già una commessa associata a questo preventivo.' using errcode='23505';
  end if;
  with recursive su(id, parent_quote_id, livello, percorso) as (
    select id, parent_quote_id, 0, array[id] from public.quotes where id = q.id
    union all
    select p.id, p.parent_quote_id, su.livello + 1, su.percorso || p.id
      from public.quotes p join su on p.id = su.parent_quote_id
     where not p.id = any(su.percorso)
  ), radice as (
    select id from su order by livello desc limit 1
  ), giu(id, percorso) as (
    select id, array[id] from radice
    union all
    select figlia.id, giu.percorso || figlia.id from public.quotes figlia join giu on figlia.parent_quote_id = giu.id
     where not figlia.id = any(giu.percorso)
  )
  select o.order_code, oq.quote_number into v_famiglia
    from public.orders o join public.quotes oq on oq.id = o.quote_id
   where o.quote_id in (select id from giu) and o.quote_id <> q.id and o.deleted_at is null
   limit 1;
  if v_famiglia.order_code is not null or v_famiglia.quote_number is not null then
    raise exception 'Il preventivo % è già la commessa %: le modifiche di questa revisione vanno registrate come variante di quella commessa.',
      v_famiglia.quote_number, v_famiglia.order_code using errcode='23505';
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
  v_senza_sconto := coalesce(q.prezzo_manuale,0)=0 and coalesce(q.discount_amount,0)=0;

  if v_computo then
    -- Un capitolo = una fase; una voce = una sottofase con la sua voce prevista.
    for c in
      select coalesce(nullif(btrim(qi.custom_field_values #>> '{computo,capitolo}'), ''), 'Lavorazioni') as capitolo,
             min(qi.sort_order) as primo, sum(coalesce(qi.line_total, 0)) as venduto
        from public.quote_items qi
       where qi.quote_id = q.id and not coalesce(qi.is_optional, false)
         and coalesce(qi.quantity, 1) <> 0 and coalesce(qi.line_total, 0) >= 0
       group by 1
       order by 2
    loop
      insert into public.order_work_phases(company_id, order_id, name, position, notes, importo_venduto)
      values (q.company_id, v_order, left(c.capitolo, 160), v_position,
              'Dal computo ' || coalesce(q.quote_number, ''),
              case when v_senza_sconto then round(c.venduto, 2) end)
      returning id into v_fase;
      v_position := v_position + 1;
      v_pos_sotto := 0;
      for r in
        select qi.*, t.id as t_id, t.prezzo_costo as t_costo, t.costo_interno as t_interno, t.incidenza_manodopera_pct as t_incidenza
          from public.quote_items qi
          left join lateral (
            select t.* from public.tariffe_aziendali t
             where t.company_id = q.company_id
               and (t.id = qi.tariffa_id
                    or (qi.tariffa_id is null and nullif(btrim(qi.codice_prezzario), '') is not null
                        and t.codice = btrim(qi.codice_prezzario) and coalesce(t.attiva, true)))
             order by (t.id = qi.tariffa_id) desc, t.created_at
             limit 1
          ) t on true
         where qi.quote_id = q.id and not coalesce(qi.is_optional, false)
           and coalesce(qi.quantity, 1) <> 0 and coalesce(qi.line_total, 0) >= 0
           and coalesce(nullif(btrim(qi.custom_field_values #>> '{computo,capitolo}'), ''), 'Lavorazioni') = c.capitolo
         order by qi.sort_order, qi.id
      loop
        insert into public.order_work_subphases(phase_id, name, position, peso)
        values (v_fase, left(coalesce(nullif(btrim(split_part(r.name, E'\n', 1)), ''), 'Voce'), 160), v_pos_sotto, 1)
        returning id into v_sotto;
        v_costo := case when coalesce(r.prezzo_acquisto, 0) > 0 then r.prezzo_acquisto
                        else coalesce(nullif(r.t_costo, 0), nullif(r.t_interno, 0), 0) end;
        v_mano := case when r.t_incidenza between 0 and 100 then round(v_costo * r.t_incidenza / 100, 4) else v_costo end;
        insert into public.order_work_phase_voci(company_id, order_id, phase_id, position, descrizione, unita, quantita,
          costo_manodopera, costo_materiali, importo, tariffa_id, origine, origine_id, origine_codice, subphase_id)
        values (q.company_id, v_order, v_fase, v_pos_sotto, r.name, nullif(r.unit_of_measure, ''), abs(coalesce(r.quantity, 1)),
          greatest(v_mano, 0), greatest(v_costo - v_mano, 0), r.line_total, coalesce(r.tariffa_id, r.t_id),
          'computo', r.id, q.quote_number, v_sotto)
        on conflict do nothing;
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end loop;
  else
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
        case when v_senza_sconto and coalesce(r.line_total,0)>=0 then r.line_total else null end)
      returning id into v_fase;
      insert into public.order_work_phase_voci(company_id,order_id,phase_id,position,descrizione,unita,quantita,
        costo_manodopera,importo,tariffa_id,origine,origine_id,origine_codice)
      values(q.company_id,v_order,v_fase,0,r.name,nullif(r.unit_of_measure,''),abs(coalesce(r.quantity,1)),
        greatest(coalesce(r.prezzo_acquisto,0),0),r.line_total,r.tariffa_id,'preventivo',r.id,q.quote_number)
      on conflict do nothing;
      v_position := v_position+1;
    end loop;
  end if;
  update public.quotes set status='convertita',updated_at=now() where id=q.id;
  return v_result || jsonb_build_object('order_id',v_order,'lavorazioni',v_position);
end;
$function$;

revoke all on function public.crea_commessa_preventivo_atomic(uuid, jsonb, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.crea_commessa_preventivo_atomic(uuid, jsonb, jsonb, jsonb, jsonb, integer) to authenticated, service_role;
