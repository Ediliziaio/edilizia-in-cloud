-- Fase 4: il rilievo può cambiare la quantità di una riga venduta a mq, ml o pezzi,
-- ma non quello che paga il cliente. Venduto e fattura per voci calcolano
-- quantità × prezzo unitario: quando la quantità cambia (rilievo o sfrido), il prezzo
-- unitario si adegua e l'importo della riga resta identico. Il costo unitario no:
-- più materiale costa di più, ed è giusto che il margine lo veda.

create or replace function public.misure_conferma(p_order uuid, p_righe uuid[] default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_azienda uuid;
  v_gioco numeric;
  v_soglia numeric;
  r public.order_items;
  v_forma text;
  v_gioco_riga numeric;
  v_da_ordinare jsonb;
  v_quantita numeric;
  v_con_ordine boolean;
  v_scarto numeric;
  v_oltre boolean;
  v_base numeric;
  v_sup_prima numeric;
  v_sup_dopo numeric;
  v_costo numeric;
  v_iniziale numeric;
  v_rapporto numeric;
  v_confermate int := 0;
  v_gia int := 0;
  v_saltate int := 0;
  v_scarti jsonb := '[]'::jsonb;
begin
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null
     or public.utente_sola_lettura(v_azienda)
     or not public.materiali_puo('can_validate_bom', v_azienda) then
    raise exception 'Per confermare le misure serve il permesso di validare i materiali' using errcode = '42501';
  end if;

  select coalesce(f.misure_gioco_posa_mm, 0), coalesce(f.misure_soglia_scarto_mm, 5) into v_gioco, v_soglia
    from public.company_fasi_settings f where f.company_id = v_azienda;
  v_gioco := coalesce(v_gioco, 0);
  v_soglia := coalesce(v_soglia, 5);

  perform set_config('app.materiali_sistema', 'on', true);

  for r in
    select * from public.order_items oi
     where oi.order_id = p_order
       and oi.measure_status is not null
       and oi.diviso_da is null
       and (p_righe is null or oi.id = any (p_righe))
     order by oi.id
     for update
  loop
    if r.measure_status = 'confermato' then
      v_gia := v_gia + 1;
      continue;
    end if;
    if r.measure_status <> 'rilevato' or r.misure_rilevate is null then
      v_saltate := v_saltate + 1;
      continue;
    end if;

    v_forma := coalesce(r.misura_forma,
      case when r.misure_rilevate ? 'quantita' then 'pz'
           when r.misure_rilevate ? 'profondita_mm' then 'LxPxH'
           else 'LxH' end);
    v_con_ordine := exists (select 1 from public.purchase_order_items p
                              join public.purchase_orders po on po.id = p.purchase_order_id
                             where p.order_item_id = r.id and po.status <> 'annullato');

    -- La misura che legge il fornitore. Il gioco vale solo se è stato misurato il foro.
    v_gioco_riga := case when r.misura_tipo = 'foro' and v_forma in ('LxH', 'LxPxH') then v_gioco else 0 end;
    v_da_ordinare := r.misure_rilevate;
    if v_gioco_riga > 0 then
      if v_da_ordinare ? 'larghezza_mm' then
        v_da_ordinare := v_da_ordinare || jsonb_build_object('larghezza_mm', greatest((v_da_ordinare->>'larghezza_mm')::numeric - v_gioco_riga, 1));
      end if;
      if v_da_ordinare ? 'altezza_mm' then
        v_da_ordinare := v_da_ordinare || jsonb_build_object('altezza_mm', greatest((v_da_ordinare->>'altezza_mm')::numeric - v_gioco_riga, 1));
      end if;
    end if;

    v_quantita := null;
    if r.misure_rilevate ? 'quantita' then
      v_quantita := round((r.misure_rilevate->>'quantita')::numeric * (1 + coalesce(r.sfrido, 0) / 100), 4);
      v_da_ordinare := v_da_ordinare || jsonb_build_object('quantita', trim_scale(v_quantita));
    end if;

    select coalesce(max(abs((x.value->>'delta')::numeric)) filter (where x.key like '%\_mm'), 0)
      into v_scarto
      from jsonb_each(coalesce(r.measure_variance, '{}'::jsonb)) x
     where x.value->>'delta' is not null;
    v_oltre := v_scarto > v_soglia
      or coalesce(abs((r.measure_variance->'quantita'->>'delta')::numeric), 0) >= 0.01;

    -- Costo stimato: solo prima dell'ordine, mai se l'ha scritto una persona o viene da un documento.
    v_costo := r.purchase_price;
    v_iniziale := r.costo_stimato_iniziale;
    if not v_con_ordine
       and v_forma in ('LxH', 'LxPxH')
       and coalesce(r.prezzo_fonte, 'listino') = 'listino'
       and r.origine_materiale is distinct from 'manuale' then
      v_base := coalesce(r.costo_stimato_iniziale, r.purchase_price);
      v_sup_prima := public.misure_superficie(r.misure_preventivo);
      v_sup_dopo := public.misure_superficie(r.misure_rilevate);
      if v_oltre and coalesce(v_base, 0) > 0 and coalesce(v_sup_prima, 0) > 0 and coalesce(v_sup_dopo, 0) > 0 then
        v_rapporto := v_sup_dopo / v_sup_prima;
        v_costo := round(v_base * v_rapporto, 4);
        v_iniziale := v_base;
      elsif not v_oltre and r.costo_stimato_iniziale is not null then
        v_costo := r.costo_stimato_iniziale;
        v_iniziale := null;
      end if;
    end if;

    update public.order_items oi
       set measure_status = 'confermato',
           misure_da_ordinare = v_da_ordinare,
           misura_forma = coalesce(oi.misura_forma, v_forma),
           gioco_posa_mm = v_gioco_riga,
           purchase_price = case when oi.id = r.id then v_costo else oi.purchase_price end,
           costo_stimato_iniziale = case when oi.id = r.id then v_iniziale else oi.costo_stimato_iniziale end,
           prezzo_aggiornato_il = case when oi.id = r.id and v_costo is distinct from r.purchase_price then now() else oi.prezzo_aggiornato_il end,
           quantita_netta = case when v_quantita is not null and not v_con_ordine then (r.misure_rilevate->>'quantita')::numeric else oi.quantita_netta end
     where oi.id = r.id or oi.diviso_da = r.id;

    -- Una riga divisa fra le fasi mantiene la proporzione: la testa prende il resto.
    if v_quantita is not null and not v_con_ordine and v_quantita is distinct from r.quantity then
      with parti as (
        select p.id, p.quantity from public.order_items p where p.diviso_da = r.id
      ), totale as (
        select r.quantity + coalesce(sum(quantity), 0) as q from parti
      ), scalate as (
        select p.id, round(p.quantity * v_quantita / nullif(t.q, 0), 4) as nuova
          from parti p cross join totale t
      ), aggiornate as (
        update public.order_items oi
           set quantity = s.nuova,
               unit_price = case when coalesce(oi.unit_price, 0) <> 0 and s.nuova > 0 and s.nuova is distinct from oi.quantity then round(oi.unit_price * oi.quantity / s.nuova, 6) else oi.unit_price end
          from scalate s where oi.id = s.id
        returning s.nuova
      )
      update public.order_items oi
         set quantity = t.nuova,
             unit_price = case when coalesce(oi.unit_price, 0) <> 0 and t.nuova > 0 and t.nuova is distinct from oi.quantity then round(oi.unit_price * oi.quantity / t.nuova, 6) else oi.unit_price end
        from (select v_quantita - coalesce((select sum(nuova) from aggiornate), 0) as nuova) t
       where oi.id = r.id;
    end if;

    insert into public.order_item_misure_storico
      (company_id, order_id, order_item_id, evento, survey_id, survey_element_id,
       misure_prima, misure_dopo, stato_prima, stato_dopo, dati)
    values
      (v_azienda, r.order_id, r.id, 'confermato', r.survey_id, r.survey_element_id,
       r.misure_rilevate, v_da_ordinare, r.measure_status, 'confermato',
       jsonb_build_object('gioco_posa_mm', v_gioco_riga, 'scarto_mm', v_scarto, 'oltre_soglia', v_oltre,
                          'costo_prima', r.purchase_price, 'costo_dopo', v_costo, 'con_ordine', v_con_ordine));

    v_confermate := v_confermate + 1;
    if v_oltre then
      v_scarti := v_scarti || jsonb_build_object('id', r.id, 'name', r.name, 'scarto_mm', v_scarto,
                                                 'costo_prima', r.purchase_price, 'costo_dopo', v_costo,
                                                 'con_ordine', v_con_ordine);
    end if;
  end loop;

  perform set_config('app.materiali_sistema', '', true);

  return jsonb_build_object('confermate', v_confermate, 'gia_confermate', v_gia, 'saltate', v_saltate, 'scarti', v_scarti);
end;
$function$;

create or replace function public.riga_imposta_sfrido(p_item uuid, p_sfrido numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.order_items;
  v_azienda uuid;
  v_quantita numeric;
  v_con_ordine boolean;
begin
  if p_sfrido is null or p_sfrido < 0 or p_sfrido > 100 then
    raise exception 'Lo sfrido va da 0 a 100 per cento' using errcode = '22023';
  end if;
  select * into r from public.order_items where id = p_item for update;
  select o.company_id into v_azienda from public.orders o where o.id = r.order_id;
  if v_azienda is null
     or public.utente_sola_lettura(v_azienda)
     or not (public.materiali_puo('can_edit_orders', v_azienda) or public.materiali_puo('can_validate_bom', v_azienda)) then
    raise exception 'Non puoi modificare questa riga' using errcode = '42501';
  end if;
  if r.sfrido is not distinct from p_sfrido then
    return;
  end if;

  v_con_ordine := exists (select 1 from public.purchase_order_items p
                            join public.purchase_orders po on po.id = p.purchase_order_id
                           where p.order_item_id = r.id and po.status <> 'annullato');
  perform set_config('app.materiali_sistema', 'on', true);
  update public.order_items oi set sfrido = p_sfrido where oi.id = r.id or oi.diviso_da = r.id;
  if r.measure_status = 'confermato' and r.misure_rilevate ? 'quantita' then
    v_quantita := round((r.misure_rilevate->>'quantita')::numeric * (1 + p_sfrido / 100), 4);
    update public.order_items oi
       set misure_da_ordinare = oi.misure_da_ordinare || jsonb_build_object('quantita', trim_scale(v_quantita))
     where oi.id = r.id or oi.diviso_da = r.id;
    if not v_con_ordine and not exists (select 1 from public.order_items p where p.diviso_da = r.id) then
      update public.order_items oi
         set quantity = v_quantita,
             unit_price = case when coalesce(oi.unit_price, 0) <> 0 and v_quantita > 0 and v_quantita is distinct from oi.quantity then round(oi.unit_price * oi.quantity / v_quantita, 6) else oi.unit_price end
       where oi.id = r.id;
    end if;
  end if;
  perform set_config('app.materiali_sistema', '', true);

  insert into public.order_item_misure_storico
    (company_id, order_id, order_item_id, evento, survey_id, survey_element_id, stato_prima, stato_dopo, dati)
  values
    (v_azienda, r.order_id, r.id, 'sfrido', r.survey_id, r.survey_element_id, r.measure_status, r.measure_status,
     jsonb_build_object('sfrido_prima', r.sfrido, 'sfrido_dopo', p_sfrido));
end;
$function$;
