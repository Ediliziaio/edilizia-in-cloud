-- Ottavo controllo (19/10/2026).
--
-- Magazzino
--  1. Un prelievo del cantiere collegato a una voce resta in cantiere quando la voce viene tolta,
--     ridotta o cambia articolo: si stacca dalla voce (torna «prelievo senza voce» della commessa)
--     invece di rientrare in giacenza. Il segno da_prelievo distingue i prelievi collegati.
--  2. DDT confermato su un ordine d'acquisto già ricevuto: le righe già registrate con l'arrivo
--     dell'ordine non entrano una seconda volta in magazzino, finiscono «da abbinare».
--  3. Prelievo dal cantiere: commessa e magazzino devono essere dell'azienda di chi preleva.
-- Economia
--  4. rate_incassi: una rata con fattura conta gli incassi della fattura alle loro date (segnare
--     pagato il saldo non sposta più un incasso parziale già avvenuto). Una rata pagata con la
--     fattura incassata a un centesimo di arrotondamento vale la rata, come la scheda commessa.
-- Cantiere
--  5. Carico di lavoro (Silvio): senza ore contrattuali la persona è «ore mancanti», non «overload».
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
alter table public.warehouse_movements add column if not exists da_prelievo boolean not null default false;

create or replace function public.magazzino_collega_prelievi(
  p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_quanto numeric)
returns numeric language plpgsql security definer set search_path = public
as $$
declare v_serve numeric := greatest(coalesce(p_quanto, 0), 0); v_preso numeric := 0; m record;
begin
  if p_riga is null or p_articolo is null or p_commessa is null or v_serve <= 0 then return 0; end if;
  for m in
    select id, quantity from public.warehouse_movements
     where stock_item_id = p_articolo and order_id = p_commessa and company_id = p_company
       and order_item_id is null and movement_type = 'scarico'
     order by created_at, id
     for update
  loop
    exit when v_serve <= 0;
    if m.quantity <= v_serve then
      update public.warehouse_movements set order_item_id = p_riga, da_prelievo = true where id = m.id;
      v_serve := v_serve - m.quantity;
      v_preso := v_preso + m.quantity;
    else
      insert into public.warehouse_movements
        (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, created_at, order_id,
         lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa, da_prelievo)
      select stock_item_id, null, movement_type, quantity - v_serve, notes, performed_by, created_at, order_id,
             lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa, false
        from public.warehouse_movements where id = m.id;
      update public.warehouse_movements set quantity = v_serve, order_item_id = p_riga, da_prelievo = true where id = m.id;
      v_preso := v_preso + v_serve;
      v_serve := 0;
    end if;
  end loop;
  return v_preso;
end $$;
revoke all on function public.magazzino_collega_prelievi(uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;

-- I prelievi collegati a una riga tornano «senza voce» fino a p_quanto, dai più recenti.
create or replace function public.magazzino_stacca_prelievi(p_riga uuid, p_articolo uuid, p_quanto numeric)
returns numeric language plpgsql security definer set search_path = public
as $$
declare v_serve numeric := greatest(coalesce(p_quanto, 0), 0); v_staccato numeric := 0; m record;
begin
  if p_riga is null or p_articolo is null or v_serve <= 0 then return 0; end if;
  for m in
    select id, quantity from public.warehouse_movements
     where order_item_id = p_riga and stock_item_id = p_articolo and movement_type = 'scarico' and da_prelievo
     order by created_at desc, id desc
     for update
  loop
    exit when v_serve <= 0;
    if m.quantity <= v_serve then
      update public.warehouse_movements set order_item_id = null, da_prelievo = false where id = m.id;
      v_serve := v_serve - m.quantity;
      v_staccato := v_staccato + m.quantity;
    else
      insert into public.warehouse_movements
        (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, created_at, order_id,
         lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa, da_prelievo)
      select stock_item_id, order_item_id, movement_type, quantity - v_serve, notes, performed_by, created_at, order_id,
             lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa, true
        from public.warehouse_movements where id = m.id;
      update public.warehouse_movements set quantity = v_serve, order_item_id = null, da_prelievo = false where id = m.id;
      v_staccato := v_staccato + v_serve;
      v_serve := 0;
    end if;
  end loop;
  return v_staccato;
end $$;
revoke all on function public.magazzino_stacca_prelievi(uuid, uuid, numeric) from public, anon, authenticated;

create or replace function public.magazzino_movimento_riga(
  p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_delta numeric, p_nota text, p_attore uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare ws public.warehouse_stock; v_delta numeric := coalesce(p_delta, 0); v_preso numeric := 0;
begin
  if p_articolo is null or v_delta = 0 then return false; end if;
  select * into ws from public.warehouse_stock where id = p_articolo and company_id = p_company for update;
  if not found then return false; end if;
  if v_delta > 0 then
    -- Merce già uscita per questa commessa (prelievi del cantiere, DDT): la riga la prende prima di
    -- scaricare altro dal magazzino.
    v_preso := public.magazzino_collega_prelievi(p_company, p_commessa, p_riga, p_articolo, v_delta);
    v_delta := v_delta - v_preso;
    if v_delta <= 0 then return v_preso > 0; end if;
  else
    -- La riga cala: i prelievi del cantiere che aveva preso restano in cantiere (tornano senza voce),
    -- in giacenza rientra solo quello che la riga aveva scaricato dal magazzino.
    v_preso := public.magazzino_stacca_prelievi(p_riga, p_articolo, -v_delta);
    v_delta := v_delta + v_preso;
    if v_delta >= 0 then return v_preso > 0; end if;
  end if;
  if v_delta > 0 and coalesce(ws.quantity, 0) < v_delta then
    raise exception 'Giacenza insufficiente per «%»: disponibili %, servono %.',
      coalesce(ws.name, 'articolo di magazzino'), coalesce(ws.quantity, 0), v_delta using errcode = '23514';
  end if;
  update public.warehouse_stock
     set quantity = quantity - v_delta, updated_at = now()
   where id = p_articolo and company_id = p_company;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
     warehouse_id, unit_cost, rientro_commessa)
  values (p_articolo, p_riga, case when v_delta > 0 then 'scarico' else 'carico' end, abs(v_delta),
          p_nota, p_attore, p_commessa, p_company, ws.warehouse_id, ws.unit_cost, v_delta < 0);
  return true;
end $$;
revoke all on function public.magazzino_movimento_riga(uuid, uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti);
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.conferma_carico_ddt(uuid,uuid)',
  $re$(\n    if v_poi is not null then\n      v_registrata := least\(v_qta, v_residuo\);)$re$,
  $to$
    -- Riga dell'ordine già ricevuta tutta (per esempio con la registrazione dell'arrivo): la
    -- merce è già in magazzino, non la si carica di nuovo.
    if v_c.purchase_order_id is not null and v_poi is null and exists (
         select 1 from public.purchase_order_items i
           left join public.order_items oi on oi.id = i.order_item_id
          where i.purchase_order_id = v_c.purchase_order_id
            and (oi.stock_item_id = v_art_id
                 or (v_codice is not null and lower(btrim(coalesce(i.sku, ''))) = lower(v_codice))
                 or lower(btrim(coalesce(i.description, ''))) in (lower(coalesce(v_descr, '')), lower(btrim(coalesce(v_art_nome, '')))))) then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'già registrata con l''arrivo dell''ordine');
      continue;
    end if;\1$to$,
  $at$già registrata con l''arrivo dell''ordine$at$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.prelievo_campo_registra(uuid,uuid,jsonb,text)',
  $re$(if v_company is null then raise exception 'Azienda non trovata'; end if;)$re$,
  $to$\1
  -- Commessa e magazzino dell'azienda di chi preleva.
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.company_id = v_company and o.deleted_at is null) then
    raise exception 'Commessa non trovata in questa azienda' using errcode = '42501';
  end if;
  if p_warehouse_id is not null and not exists (select 1 from public.warehouses w where w.id = p_warehouse_id and w.company_id = v_company) then
    raise exception 'Magazzino non trovato in questa azienda' using errcode = '42501';
  end if;$to$,
  'Commessa non trovata in questa azienda');

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_incassi(p_company uuid)
returns table (order_id uuid, installment_id uuid, data date, importo numeric)
language sql stable security definer set search_path = public
as $$
  with r as (select * from public.rate_importi(p_company)),
  mv as (
    select m.documento_id, m.data_movimento, m.importo
      from public.movimenti_cassa_native m
     where m.company_id = p_company and m.tipo = 'incasso' and m.documento_id is not null
  ),
  tot as (select mv.documento_id, sum(mv.importo) as t, max(mv.data_movimento) as ultima from mv group by mv.documento_id)
  -- rate pagate senza fattura, per l'importo che conta (il saldo è il residuo)
  select r.order_id, r.installment_id, r.paid_date, r.importo
    from r where r.is_paid and r.paid_date is not null and r.documento_fiscale_id is null
  union all
  -- rate con fattura: gli incassi della fattura, alle loro date
  select r.order_id, r.installment_id, mv.data_movimento, mv.importo
    from r join mv on mv.documento_id = r.documento_fiscale_id
  union all
  -- rata pagata con la fattura incassata a un centesimo di arrotondamento: vale la rata
  select r.order_id, r.installment_id, coalesce(r.paid_date, t.ultima), r.importo - t.t
    from r join tot t on t.documento_id = r.documento_fiscale_id
   where r.is_paid and r.importo <> t.t and abs(r.importo - t.t) <= 0.011
$$;
revoke all on function public.rate_incassi(uuid) from public, anon, authenticated;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.silvio_employees_workload(uuid)',
  $re$CASE\s+WHEN COALESCE\(SUM\(oe\.hours_worked\), 0\) >= COALESCE\(e\.monthly_hours, 160\) \* 1\.0 THEN 'overload'$re$,
  $to$CASE
        WHEN NULLIF(e.monthly_hours, 0) IS NULL THEN 'ore_mancanti'
        WHEN COALESCE(SUM(oe.hours_worked), 0) >= COALESCE(e.monthly_hours, 160) * 1.0 THEN 'overload'$to$,
  $at$WHEN NULLIF(e.monthly_hours, 0) IS NULL THEN 'ore_mancanti'$at$);
