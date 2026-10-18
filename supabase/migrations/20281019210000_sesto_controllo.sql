-- Sesto controllo (19/10/2026).
--
-- Magazzino
--  1. Rientri della commessa segnati (rientro_commessa): lo scaricato di una riga conta gli scarichi
--     meno i rientri della commessa, non gli arrivi merce da ordine d'acquisto. Prima un arrivo da
--     ODA sulla riga valeva come rientro e la riga si scaricava due volte.
--  2. Installazione: i prelievi senza riga si collegano alla riga solo fino alla sua quantità (il
--     movimento si divide), il resto resta per le altre righe dello stesso articolo.
-- Cantiere
--  3. Contratto di subappalto chiuso: la ditta resta nel cantiere se ha un altro contratto attivo lì.
-- Economia
--  4. rate_importi: totale IVA inclusa arrotondato al centesimo prima di sottrarre; dalla finanziaria
--     si toglie al massimo il suo costo; il saldo già pagato conta con le varianti approvate fino al
--     giorno del pagamento.
--  5. rate_da_incassare: la parte del totale non coperta dalle rate (piano senza saldo, o variante
--     approvata dopo il saldo pagato) è una riga senza data.
--  6. Incassi: le fatture importate contano per chi non ha incassi dalle fatture dell'app (prima
--     sparivano se l'azienda aveva solo bozze nell'app).
--  7. «Rate scadute» (installments_overdue) con la regola della scheda commessa.
--  8. Grafico a 12 mesi del cruscotto: incassato con gli importi veri delle rate, commesse nel
--     cestino escluse, costi IVA inclusa come gli incassi. Lo vede chi vede gli incassi del mese
--     (stesso controllo di incassato_rate_periodo).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
alter table public.warehouse_movements add column if not exists rientro_commessa boolean not null default false;
-- Le entrate già registrate su una commessa sono resi dal cantiere e rientri delle modifiche;
-- l'unica eccezione è l'arrivo della merce di un ordine d'acquisto.
update public.warehouse_movements
   set rientro_commessa = true
 where movement_type = 'carico' and order_id is not null and not rientro_commessa
   and coalesce(notes, '') not like 'Arrivo merce ordine %';

create or replace function public.magazzino_movimento_riga(
  p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_delta numeric, p_nota text, p_attore uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare ws public.warehouse_stock;
begin
  if p_articolo is null or coalesce(p_delta, 0) = 0 then return false; end if;
  select * into ws from public.warehouse_stock where id = p_articolo and company_id = p_company for update;
  if not found then return false; end if;
  if p_delta > 0 and coalesce(ws.quantity, 0) < p_delta then
    raise exception 'Giacenza insufficiente per «%»: disponibili %, servono %.',
      coalesce(ws.name, 'articolo di magazzino'), coalesce(ws.quantity, 0), p_delta using errcode = '23514';
  end if;
  update public.warehouse_stock
     set quantity = quantity - p_delta, updated_at = now()
   where id = p_articolo and company_id = p_company;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
     warehouse_id, unit_cost, rientro_commessa)
  values (p_articolo, p_riga, case when p_delta > 0 then 'scarico' else 'carico' end, abs(p_delta),
          p_nota, p_attore, p_commessa, p_company, ws.warehouse_id, ws.unit_cost, p_delta < 0);
  return true;
end $$;
revoke all on function public.magazzino_movimento_riga(uuid, uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;

create or replace function public.magazzino_scaricato_riga(p_riga uuid, p_articolo uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce(sum(case when m.movement_type = 'scarico' then m.quantity
                           when m.movement_type = 'carico' and m.rientro_commessa then -m.quantity
                           else 0 end), 0)
    from public.warehouse_movements m
   where m.order_item_id = p_riga and m.stock_item_id = p_articolo and m.order_id is not null
$$;
revoke all on function public.magazzino_scaricato_riga(uuid, uuid) from public, anon, authenticated;

create or replace function public.dividi_scarico_magazzino(p_originale uuid, p_nuova uuid, p_quantita numeric)
returns numeric language plpgsql security definer set search_path = public
as $$
declare
  a public.order_items; b public.order_items;
  v_company uuid; v_netto numeric; v_sposta numeric;
  ws public.warehouse_stock;
begin
  select * into a from public.order_items where id = p_originale for update;
  select * into b from public.order_items where id = p_nuova for update;
  if a.id is null or b.id is null or a.order_id <> b.order_id then
    raise exception 'Le due righe non sono della stessa commessa.' using errcode = '22023';
  end if;
  select o.company_id into v_company from public.orders o where o.id = a.order_id;
  if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
     or not exists (select 1 from public.orders o where o.id = a.order_id
                     and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  if a.stock_item_id is null or b.stock_item_id is distinct from a.stock_item_id or coalesce(p_quantita, 0) <= 0 then
    return 0;
  end if;
  v_netto := public.magazzino_scaricato_riga(a.id, a.stock_item_id);
  v_sposta := least(greatest(v_netto, 0), p_quantita);
  if v_sposta <= 0 then return 0; end if;
  select * into ws from public.warehouse_stock where id = a.stock_item_id;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
     warehouse_id, unit_cost, rientro_commessa)
  values
    (a.stock_item_id, a.id, 'carico', v_sposta, 'Divisione tra le fasi: quota passata alla nuova riga', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost, true),
    (a.stock_item_id, b.id, 'scarico', v_sposta, 'Divisione tra le fasi: quota presa dalla riga originale', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost, false);
  return v_sposta;
end $$;
revoke all on function public.dividi_scarico_magazzino(uuid, uuid, numeric) from public, anon;
grant execute on function public.dividi_scarico_magazzino(uuid, uuid, numeric) to authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_auto_deduct_stock()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
DECLARE
  v_stock public.warehouse_stock%ROWTYPE;
  v_company uuid;
  v_used numeric := 0;
  v_remaining numeric;
  v_serve numeric;
  m record;
BEGIN
  IF NEW.status = 'installato' AND OLD.status IS DISTINCT FROM 'installato'
     AND NEW.auto_deducted IS NOT TRUE AND NEW.stock_item_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.orders WHERE id=NEW.order_id;
    SELECT * INTO v_stock FROM public.warehouse_stock
      WHERE id=NEW.stock_item_id AND company_id=v_company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Articolo di magazzino non valido per questa commessa'; END IF;
    IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.quantity<>trunc(NEW.quantity) THEN
      RAISE EXCEPTION 'Verifica la quantità: lo scarico automatico richiede unità intere positive';
    END IF;
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    -- Prelievi dal cantiere e DDT per la commessa (scarichi senza riga): questa riga ne prende solo
    -- quanto le serve; un movimento più grande si divide e il resto resta per le altre righe.
    v_serve := greatest(NEW.quantity - greatest(v_used, 0), 0);
    FOR m IN
      SELECT id, quantity FROM public.warehouse_movements
       WHERE stock_item_id = NEW.stock_item_id AND order_id = NEW.order_id AND company_id = v_company
         AND order_item_id IS NULL AND movement_type = 'scarico'
       ORDER BY created_at, id
       FOR UPDATE
    LOOP
      EXIT WHEN v_serve <= 0;
      IF m.quantity <= v_serve THEN
        UPDATE public.warehouse_movements SET order_item_id = NEW.id WHERE id = m.id;
        v_serve := v_serve - m.quantity;
      ELSE
        INSERT INTO public.warehouse_movements
          (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, created_at, order_id,
           lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa)
        SELECT stock_item_id, NULL, movement_type, quantity - v_serve, notes, performed_by, created_at, order_id,
               lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa
          FROM public.warehouse_movements WHERE id = m.id;
        UPDATE public.warehouse_movements SET quantity = v_serve, order_item_id = NEW.id WHERE id = m.id;
        v_serve := 0;
      END IF;
    END LOOP;
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    v_remaining := greatest(NEW.quantity-greatest(v_used,0),0);
    IF v_remaining>0 THEN
      IF v_stock.quantity<v_remaining THEN
        RAISE EXCEPTION 'Giacenza insufficiente: disponibili %, da scaricare %', v_stock.quantity,v_remaining;
      END IF;
      UPDATE public.warehouse_stock SET quantity=quantity-v_remaining,updated_at=now()
        WHERE id=NEW.stock_item_id AND company_id=v_company;
      INSERT INTO public.warehouse_movements
        (stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,order_id,company_id,warehouse_id,unit_cost)
      VALUES (NEW.stock_item_id,NEW.id,'scarico',v_remaining,'Scarico residuo automatico a installazione',
        auth.uid(),NEW.order_id,v_company,v_stock.warehouse_id,v_stock.unit_cost);
    END IF;
    NEW.auto_deducted := true;
  END IF;
  RETURN NEW;
END;
$$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.contratto_subappalto_accesso_cantiere()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.order_id is not null then
    select s.user_id into v_user from public.subappaltatori_sicurezza ss
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id where ss.id = old.subappaltatore_id;
    if v_user is not null and (tg_op = 'DELETE' or new.stato is distinct from 'attivo'
                               or new.order_id is distinct from old.order_id
                               or new.subappaltatore_id is distinct from old.subappaltatore_id)
       -- un altro contratto attivo della stessa ditta sullo stesso cantiere tiene l'accesso
       and not exists (select 1 from public.contratti_subappalto c2
                         join public.subappaltatori_sicurezza ss2 on ss2.id = c2.subappaltatore_id
                         join public.subappaltatori s2 on s2.id = ss2.campo_subappaltatore_id
                        where c2.id <> old.id and c2.order_id = old.order_id and c2.stato = 'attivo'
                          and s2.user_id = v_user) then
      delete from public.order_campo_assignments
       where order_id = old.order_id and user_id = v_user and note = 'Dal contratto di subappalto';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.stato = 'attivo' and new.order_id is not null then
    select s.user_id into v_user from public.subappaltatori_sicurezza ss
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id where ss.id = new.subappaltatore_id;
    if v_user is not null then
      insert into public.order_campo_assignments
        (company_id, order_id, user_id, role_type, data_inizio, data_fine_prevista, is_capocantiere, note)
      values (new.company_id, new.order_id, v_user, 'subcontractor', new.data_inizio, new.data_fine_prevista, false,
              'Dal contratto di subappalto')
      on conflict (order_id, user_id) do nothing;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.contratto_subappalto_accesso_cantiere() from public, anon, authenticated;

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_importi(p_company uuid)
returns table (installment_id uuid, order_id uuid, type text, importo numeric, is_paid boolean,
               paid_date date, expected_date date, documento_fiscale_id uuid, invoice_id uuid)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not coalesce(public.user_can_access_company(p_company), false) then
    raise exception 'Accesso non autorizzato a questa azienda.' using errcode = '42501';
  end if;
  return query
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end fc
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  var as (
    select v.order_id, coalesce(v.impatto_economico, 0) imp,
           coalesce(v.offline_signed_on::date, v.firmato_il::date, v.approval_recorded_at::date,
                    v.richiesto_il::date, v.created_at::date) as il
      from public.ordini_variazione v join o on o.id = v.order_id
     where v.status = 'approvato'
  ),
  r0 as (
    select i.*, row_number() over (partition by i.order_id
                                   order by (i.type = 'balance') desc, i.position desc nulls last, i.id desc) as rn
      from public.order_installments i join o on o.id = i.order_id
  ),
  r1 as (
    select r0.*, (r0.type = 'balance' and r0.rn = 1) as finale,
           sum(case when r0.type = 'balance' and r0.rn = 1 then 0 else coalesce(r0.amount, 0) end)
             over (partition by r0.order_id) as altre
      from r0
  ),
  r2 as (
    select r1.*, o.fc,
           -- saldo pagato: le varianti approvate fino al giorno del pagamento
           round(round((o.tot + coalesce((select sum(var.imp) from var
                                          where var.order_id = r1.order_id
                                            and (not (r1.finale and coalesce(r1.is_paid, false) and r1.paid_date is not null)
                                                 or var.il <= r1.paid_date)), 0)) * (1 + o.iva / 100), 2)
                 - r1.altre - o.fc, 2) as saldo_grezzo
      from r1 join o on o.id = r1.order_id
  ),
  r3 as (
    select r2.*,
           least(greatest(0, -max(case when r2.finale then r2.saldo_grezzo end) over (partition by r2.order_id)), r2.fc) as avanzo
      from r2
  )
  select r3.id, r3.order_id, r3.type::text,
         case when r3.finale then greatest(0, r3.saldo_grezzo)
              when r3.type = 'financing' then greatest(0, coalesce(r3.amount, 0) - r3.avanzo)
              else coalesce(r3.amount, 0) end,
         coalesce(r3.is_paid, false), r3.paid_date, r3.expected_date, r3.documento_fiscale_id, r3.invoice_id
    from r3;
end $$;
revoke all on function public.rate_importi(uuid) from public, anon, authenticated;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_da_incassare(p_company uuid)
returns table (order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id,
           round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company))
  select r.order_id, r.installment_id, r.expected_date,
         greatest(0, r.importo - coalesce(d.importo_pagato, 0)), r.type = 'financing'
    from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
   where not r.is_paid
  union all
  -- La parte del totale che nessuna rata copre (piano senza saldo, o variante dopo il saldo pagato).
  select s.order_id, null::uuid, null::date, s.scoperto, false
    from (select r.order_id, round(o.totale - sum(r.importo), 2) as scoperto
            from r join o on o.id = r.order_id
           group by r.order_id, o.totale) s
   where s.scoperto > 0
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$where not exists \(select 1 from public\.documenti_fiscali df where df\.company_id = ip\.company_id\)$re$,
  $to$where not exists (select 1 from public.movimenti_cassa_native mm
                                where mm.company_id = ip.company_id and mm.tipo = 'incasso' and mm.documento_id is not null)$to$,
  'where not exists (select 1 from public.movimenti_cassa_native mm');

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$ELSIF p_metric_id = 'installments_overdue' THEN[\s\S]*?(\s*ELSE\s*RAISE EXCEPTION 'Metric % not implemented yet')$re$,
  $to$ELSIF p_metric_id = 'installments_overdue' THEN
    -- Rate scadute con la regola della scheda commessa (senza la rata della finanziaria).
    IF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               COALESCE(SUM(x.residuo), 0) AS value
        FROM public.rate_da_incassare(v_company_id) x
        JOIN public.orders o ON o.id = x.order_id
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE x.expected_date < CURRENT_DATE AND x.residuo > 0 AND NOT x.finanziamento
        GROUP BY o.customer_id, p.first_name, p.last_name
        ORDER BY 3 DESC
        LIMIT 20
      ) r;
    ELSE
      SELECT COALESCE(SUM(x.residuo), 0) INTO v_value
        FROM public.rate_da_incassare(v_company_id) x
       WHERE x.expected_date < CURRENT_DATE AND NOT x.finanziamento;
    END IF;
\1$to$,
  'Rate scadute con la regola della scheda commessa (senza la rata della finanziaria).');

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.cruscotto_trend_12m(p_company_id uuid)
returns table(mese_key text, venduto numeric, incassato numeric, cassa numeric)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.utente_bloccato()
     or not coalesce(public.user_can_access_company(p_company_id), false)
     or not (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id), false)) then
    raise exception 'Non puoi vedere gli incassi di questa azienda.' using errcode = '42501';
  end if;
  return query
  with bounds as (
    select date_trunc('month', (now() at time zone 'Europe/Rome')) - interval '11 months' as from_local
  ),
  months as (
    select to_char(date_trunc('month', (now() at time zone 'Europe/Rome')) - make_interval(months => gs), 'YYYY-MM') as k
    from generate_series(0, 11) gs
  ),
  vend as (
    select to_char(date_trunc('month', o.created_at at time zone 'Europe/Rome'), 'YYYY-MM') as k,
           sum(coalesce(o.total_amount, 0)) as v
    from public.orders o, bounds b
    where o.company_id = p_company_id and o.deleted_at is null
      and (o.created_at at time zone 'Europe/Rome') >= b.from_local
    group by 1
  ),
  inc as (
    -- importi veri delle rate (il saldo pagato è il residuo), come nella scheda commessa
    select to_char(date_trunc('month', x.paid_date::timestamp), 'YYYY-MM') as k,
           sum(x.importo) as v
    from public.rate_importi(p_company_id) x cross join bounds b
    where x.is_paid and x.paid_date >= b.from_local::date
    group by 1
  ),
  costi as (
    select to_char(date_trunc('month', cc.paid_date::timestamp), 'YYYY-MM') as k,
           sum(coalesce(cc.amount, 0) * (1 + coalesce(cc.vat_rate, 0) / 100)) as v
    from public.company_costs cc, bounds b
    where cc.company_id = p_company_id
      and cc.is_paid = true
      and cc.paid_date >= b.from_local::date
    group by 1
  )
  select m.k,
         coalesce(v.v, 0)::numeric,
         round(coalesce(i.v, 0), 2)::numeric,
         round(coalesce(i.v, 0) - coalesce(c.v, 0), 2)::numeric
  from months m
  left join vend  v on v.k = m.k
  left join inc   i on i.k = m.k
  left join costi c on c.k = m.k
  order by m.k;
end $$;
revoke all on function public.cruscotto_trend_12m(uuid) from public, anon;
grant execute on function public.cruscotto_trend_12m(uuid) to authenticated;
