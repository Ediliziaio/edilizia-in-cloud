-- Secondo controllo di materiali e cantiere (19/10/2026).
--
-- Magazzino e articoli
--  1. Nuova commessa: lo scarico di un articolo da giacenza porta commessa, azienda e riga,
--     e la giacenza dev'essere dell'azienda. Prima all'installazione si scaricava di nuovo.
--  2. Modifica commessa: lo scarico aggiuntivo porta la riga dell'articolo. Prima l'articolo
--     non si poteva più segnare «Installato» («Materiale già movimentato…»).
--  3. Nuova e modifica commessa salvano aggancio al listino, categoria, data di arrivo e distinta.
--  4. Costo dalla ricezione di un ordine d'acquisto: IVA esatta anche con aliquote miste
--     (1.000 € al 22% + 300 € al 10% = 1.550 €, non 1.547 €).
-- Cantiere
--  5. «Chi spunta le fasi» vale anche sullo stato della fase, non solo sulle sottofasi.
--  6. Merce dal cantiere: la può segnare chiunque lavori sul cantiere (anche da subappalto o squadra).
-- Ufficio
--  7. «Cantieri oggi», «Da approvare», le fasi dell'ufficio e l'approvazione delle correzioni
--     rispettano «solo le commesse assegnate».
--  8. Una fase dell'ufficio che aspetta una fase del cantiere la aspetta anche quando la fase
--     nasce dopo la commessa (come succede creando la commessa).
--  9. Approvare una correzione per un'ora già timbrata non crea una timbratura doppia.
--
-- Le funzioni lunghe si correggono riga per riga sul testo in produzione; ogni correzione
-- controlla di essere andata a segno.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)',
  $re$UPDATE public\.warehouse_stock\s*SET quantity = GREATEST\(0, quantity - v_qty\)\s*WHERE id = v_stock_item_id;$re$,
  $to$UPDATE public.warehouse_stock
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_stock_item_id AND company_id = v_company_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Articolo di magazzino non valido per questa azienda.' USING ERRCODE = '42501';
      END IF;$to$,
  'WHERE id = v_stock_item_id AND company_id = v_company_id;');
select pg_temp.correggi('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)',
  $re$INSERT INTO public\.warehouse_movements \(\s*stock_item_id, order_item_id, movement_type, quantity, notes, performed_by\s*\) VALUES \(\s*v_stock_item_id, v_item_id, 'scarico', v_qty,\s*('Prelievo automatico per ordine ' \|\|\s*COALESCE\(NULLIF\(TRIM\(p_order_data->>'order_code'\), ''\), LEFT\(v_order_id::text, 8\)\)),\s*v_caller_id\s*\);$re$,
  $to$INSERT INTO public.warehouse_movements (
        stock_item_id, order_item_id, movement_type, quantity, notes, performed_by,
        order_id, company_id, warehouse_id, unit_cost
      ) SELECT
        v_stock_item_id, v_item_id, 'scarico', v_qty,
        \1,
        v_caller_id, v_order_id, v_company_id, ws.warehouse_id, ws.unit_cost
        FROM public.warehouse_stock ws WHERE ws.id = v_stock_item_id;$to$,
  'v_caller_id, v_order_id, v_company_id, ws.warehouse_id, ws.unit_cost');

-- 3 (nuova commessa) ───────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)',
  $re$product_code, family_id, axis_selections, misure_preventivo, measure_status\s*\) VALUES \($re$,
  $to$product_code, family_id, axis_selections, misure_preventivo, measure_status,
      article_template_id, categoria, delivery_date, posizioni
    ) VALUES ($to$,
  'article_template_id, categoria, delivery_date, posizioni');
select pg_temp.correggi('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)',
  $re$NULLIF\(v_item->>'measure_status', ''\)\s*\)\s*RETURNING id INTO v_item_id;$re$,
  $to$NULLIF(v_item->>'measure_status', ''),
      NULLIF(v_item->>'article_template_id', '')::uuid,
      NULLIF(v_item->>'categoria', ''),
      NULLIF(v_item->>'delivery_date', '')::date,
      NULLIF(v_item->'posizioni', 'null'::jsonb)
    )
    RETURNING id INTO v_item_id;$to$,
  'NULLIF(v_item->''posizioni'', ''null''::jsonb)');

-- 3 (modifica commessa) e 2 ────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$categoria = nullif\(v\.dati->>'categoria',''\),\s*is_paid = $re$,
  $to$categoria = nullif(v.dati->>'categoria',''),
      -- data di arrivo e distinta: solo se il modulo le manda
      delivery_date = case when v.dati ? 'delivery_date' then nullif(v.dati->>'delivery_date','')::date else oi.delivery_date end,
      posizioni = case when v.dati ? 'posizioni' then nullif(v.dati->'posizioni','null'::jsonb) else oi.posizioni end,
      is_paid = $to$,
  'delivery_date = case when v.dati ? ''delivery_date''');
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$deposit_expected_date, balance_amount, balance_paid, balance_paid_date,\s*balance_expected_date\s*\)\s*select p_commessa,$re$,
  $to$deposit_expected_date, balance_amount, balance_paid, balance_paid_date,
      balance_expected_date, delivery_date, posizioni
    )
    select p_commessa,$to$,
  'balance_expected_date, delivery_date, posizioni');
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$(nullif\(v\.dati->>'balance_expected_date',''\)::date)\s*from _voci v where v\.id is null;$re$,
  $to$\1,
      nullif(v.dati->>'delivery_date','')::date,
      nullif(v.dati->'posizioni','null'::jsonb)
      from _voci v where v.id is null;$to$,
  'nullif(v.dati->''posizioni'',''null''::jsonb)
      from _voci v where v.id is null;');
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$\(stock_item_id, movement_type, quantity, notes, performed_by, order_id, company_id\)\s*values \(\s*r\.stock_item_id,$re$,
  $to$(stock_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
           order_item_id, warehouse_id, unit_cost)
        values (
          r.stock_item_id,$to$,
  'order_item_id, warehouse_id, unit_cost)');
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$v_attore,\s*p_commessa, v_company\s*\);$re$,
  $to$v_attore,
          p_commessa, v_company,
          -- la riga dell'articolo: così all'installazione il trigger sa cosa è già scaricato
          (select oi.id from public.order_items oi
            where oi.order_id = p_commessa and oi.stock_item_id = r.stock_item_id
            order by oi.position, oi.id limit 1),
          (select ws2.warehouse_id from public.warehouse_stock ws2 where ws2.id = r.stock_item_id),
          (select ws2.unit_cost from public.warehouse_stock ws2 where ws2.id = r.stock_item_id)
        );$to$,
  'la riga dell''articolo: così all''installazione');

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.crea_costo_da_ricezione_oda()',
  $re$then round\(new\.vat_total / new\.subtotal \* 100\)$re$,
  $to$then round(new.vat_total / new.subtotal * 100, 4)$to$,
  'round(new.vat_total / new.subtotal * 100, 4)');

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.fase_campi_protetti()',
  $re$(  -- Cambiano solo colonne del cantiere: va bene per chiunque passi la RLS\.)$re$,
  $to$  -- Lo stato della fase segue «chi spunta le fasi» dell'azienda, come le sottofasi.
  if new.status is distinct from old.status
     and not coalesce(public.has_permission_for_company(v_utente, 'can_edit_orders', old.company_id), false)
     and public.fasi_regola_chi_spunta(old.company_id) <> 'tutti' then
    declare
      v_ruolo jsonb := public.campo_mio_ruolo(old.order_id);
      v_regola text := public.fasi_regola_chi_spunta(old.company_id);
      v_puo boolean;
    begin
      v_puo := coalesce((v_ruolo->>'capocantiere')::boolean, false)
               or not coalesce((v_ruolo->>'esiste_capo')::boolean, false);
      if not v_puo and v_regola = 'chi_la_fa' then
        v_puo := exists (select 1 from jsonb_array_elements(public.campo_mie_fasi(old.order_id)) e
                          where (e->>'id')::uuid = old.id
                            and (coalesce((e->>'tu')::boolean, false) or nullif(e->>'squadra', '') is not null));
      end if;
      if not v_puo then
        raise exception '%', case v_regola
            when 'capi' then 'Le fasi le chiude o le riapre il capocantiere.'
            else 'Le fasi le chiude o le riapre chi fa quella fase, o il capocantiere.' end
          using errcode = '42501';
      end if;
    end;
  end if;

\1$to$,
  'Lo stato della fase segue «chi spunta le fasi»');

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_acquisto_registra(uuid,text,text,text,text,date,numeric,jsonb,text,jsonb,text)',
  $re$or exists \(select 1 from public\.order_campo_assignments a where a\.order_id = p_order_id and a\.user_id = v_uid\)\s*or exists \(select 1 from public\.order_employees oe join public\.employees e on e\.id = oe\.employee_id\s*where oe\.order_id = p_order_id and e\.user_id = v_uid\)\)$re$,
  $to$or public.campo_lavoro_su_commessa(p_order_id))$to$,
  'or public.campo_lavoro_su_commessa(p_order_id))');

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$(where o\.company_id = v_company and o\.deleted_at is null)$re$,
  $to$\1
         and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)$to$,
  'and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)');
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$where r\.company_id = v_company and r\.stato = 'inviato'\)$re$,
  $to$where r.company_id = v_company and r.stato = 'inviato'
        and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))$to$,
  'r.stato = ''inviato''
        and public.can_see_order');
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$where c\.company_id = v_company and c\.stato = 'in_attesa'\)$re$,
  $to$where c.company_id = v_company and c.stato = 'in_attesa'
        and (c.order_id is null or public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))$to$,
  'c.stato = ''in_attesa''
        and (c.order_id is null');
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$where ca\.company_id = v_company and ca\.stato = 'da_verificare'\)$re$,
  $to$where ca.company_id = v_company and ca.stato = 'da_verificare'
        and (ca.order_id is null or public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))$to$,
  'ca.stato = ''da_verificare''
        and (ca.order_id is null');

drop policy if exists fasi_ufficio_visibili_in_commessa on public.tasks;
create policy fasi_ufficio_visibili_in_commessa on public.tasks for select to authenticated
  using (activity_scope = 'ufficio' and order_id is not null
         and company_id = (select public.get_my_company_id())
         and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false)
         and exists (select 1 from public.orders o
                      where o.id = tasks.order_id
                        and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)));

-- 7 e 9 ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_timbratura_correzione_decidi(uuid,boolean,text)',
  $re$(if c\.stato <> 'in_attesa' then raise exception 'Questa richiesta ha già una risposta' using errcode = '22023'; end if;)$re$,
  $to$\1
  if c.order_id is not null and not exists (
    select 1 from public.orders o
     where o.id = c.order_id and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
  ) then
    raise exception 'Questa correzione è di un cantiere che non segui' using errcode = '42501';
  end if;$to$,
  'Questa correzione è di un cantiere che non segui');
select pg_temp.correggi('public.campo_timbratura_correzione_decidi(uuid,boolean,text)',
  $re$(  if p_approva then\s*)(insert into public\.campo_timbrature \(company_id, user_id, order_id, tipo, timestamp_evento, fonte, note\)\s*values \(c\.company_id, c\.user_id, c\.order_id, c\.tipo, c\.ora_richiesta, 'manuale',\s*'Correzione approvata: ' \|\| left\(c\.motivo, 300\)\)\s*returning id into v_timbratura;)$re$,
  $to$\1-- Già timbrata a quell'ora (± 2 minuti): si collega quella, senza un doppione.
    select t.id into v_timbratura from public.campo_timbrature t
     where t.user_id = c.user_id and t.company_id = c.company_id and t.tipo = c.tipo
       and t.timestamp_evento between c.ora_richiesta - interval '2 minutes' and c.ora_richiesta + interval '2 minutes'
     order by abs(extract(epoch from t.timestamp_evento - c.ora_richiesta)) limit 1;
    if v_timbratura is null then
      \2
    end if;$to$,
  'Già timbrata a quell''ora (± 2 minuti)');

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
-- Il flusso parte appena nasce la commessa, prima delle sue fasi: la fase dell'ufficio che
-- aspetta «dopo la fase X» nasceva «da fare». Quando la fase X arriva, la prende in attesa.
create or replace function public.fasi_ufficio_aggancia_fase_nuova()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'completata' then return new; end if;
  update public.tasks k
     set attende_fase_id = new.id, status = 'in_attesa', due_date = null,
         sblocco_giorni = coalesce(t.giorni_dopo_sblocco, 0)
    from public.order_task_template t
   where k.order_id = new.order_id and k.company_id = new.company_id
     and k.activity_scope = 'ufficio' and k.status = 'da_fare' and k.completed_at is null
     and k.attende_fase_id is null and k.bloccata_da_task_id is null
     and k.created_at > now() - interval '1 day'
     and t.company_id = new.company_id and t.attivo
     and lower(trim(t.titolo)) = lower(trim(k.title))
     and lower(trim(coalesce(t.dopo_fase_lavorazione, ''))) = lower(trim(new.name));
  return new;
end $$;
revoke all on function public.fasi_ufficio_aggancia_fase_nuova() from public, anon, authenticated;
drop trigger if exists trg_fasi_ufficio_aggancia_fase_nuova on public.order_work_phases;
create trigger trg_fasi_ufficio_aggancia_fase_nuova
  after insert on public.order_work_phases
  for each row execute function public.fasi_ufficio_aggancia_fase_nuova();
