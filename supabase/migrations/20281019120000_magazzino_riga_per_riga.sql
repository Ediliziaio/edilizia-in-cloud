-- Magazzino della commessa: lo scarico si calcola riga per riga (19/10/2026).
--
-- Modifica commessa calcolava la differenza per articolo di magazzino, su tutte le righe insieme.
-- Con due righe sullo stesso articolo il movimento finiva sulla riga sbagliata, e all'installazione
-- si scaricava di nuovo. Togliere l'unica riga di un articolo lasciava un movimento senza riga che
-- bloccava ogni installazione futura di quell'articolo nella commessa. Aumentare la quantità e
-- segnare «Installato» nello stesso salvataggio scaricava due volte.
--
-- Adesso:
--   · le righe che restano: prima di aggiornarle si scarica (o si rimette) la differenza di
--     quella riga, sulla riga stessa. Così l'installazione nello stesso salvataggio trova lo
--     scarico già fatto e non lo ripete;
--   · le righe tolte: si rimette in giacenza la loro quantità e i loro movimenti escono dalla
--     commessa (restano nello storico del magazzino), così non bloccano niente;
--   · le righe nuove: si scaricano dopo l'inserimento, sulla riga nuova.
-- Più dividi_scarico_magazzino: quando un articolo si divide tra le fasi, la parte nuova porta
-- con sé la sua quota di scarico, e all'installazione non si scarica di nuovo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Un movimento su una riga: scarico se delta > 0, carico se delta < 0. Restituisce se l'ha fatto.
create or replace function public.magazzino_movimento_riga(
  p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_delta numeric, p_nota text, p_attore uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare ws public.warehouse_stock;
begin
  if p_articolo is null or coalesce(p_delta, 0) = 0 then return false; end if;
  update public.warehouse_stock
     set quantity = greatest(0, quantity - p_delta), updated_at = now()
   where id = p_articolo and company_id = p_company
  returning * into ws;
  if not found then return false; end if;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id, unit_cost)
  values (p_articolo, p_riga, case when p_delta > 0 then 'scarico' else 'carico' end, abs(p_delta),
          p_nota, p_attore, p_commessa, p_company, ws.warehouse_id, ws.unit_cost);
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

-- Prima di tutto: com'erano le righe, e i movimenti delle righe che restano o che si tolgono.
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$create temp table if not exists _delta[\s\S]*?where coalesce\(d\.q, 0\) <> coalesce\(p\.q, 0\);$re$,
  $to$-- Magazzino riga per riga (com'erano le righe prima di questo salvataggio).
    create temp table if not exists _prima (id uuid, stock_item_id uuid, quantity numeric) on commit drop;
    delete from _prima;
    insert into _prima
    select oi.id, oi.stock_item_id, coalesce(oi.quantity, 1)
      from public.order_items oi where oi.order_id = p_commessa;

    -- Righe che restano: la differenza di ciascuna, sulla riga stessa, prima di aggiornarla.
    for r in
      select p.id, p.stock_item_id as vecchio, p.quantity as q_prima,
             nullif(v.dati->>'stock_item_id','')::uuid as nuovo,
             coalesce((v.dati->>'quantity')::int, 1) as q_dopo
        from _prima p join _voci v on v.id = p.id
    loop
      if r.vecchio is not distinct from r.nuovo then
        if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.nuovo, r.q_dopo - r.q_prima,
             'Modifica quantità nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
          v_mov := v_mov + 1;
        end if;
      else
        if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.vecchio, -r.q_prima,
             'Articolo cambiato nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
          v_mov := v_mov + 1;
        end if;
        if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.nuovo, r.q_dopo,
             'Articolo cambiato nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
          v_mov := v_mov + 1;
        end if;
      end if;
    end loop;

    -- Righe tolte: la loro quantità torna in giacenza.
    for r in
      select p.id, p.stock_item_id, p.quantity from _prima p
       where p.stock_item_id is not null and p.id not in (select v.id from _voci v where v.id is not null)
    loop
      if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.stock_item_id, -r.quantity,
           'Ripristino per voce tolta dalla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
        v_mov := v_mov + 1;
      end if;
    end loop;$to$,
  'Magazzino riga per riga (com''erano le righe prima di questo salvataggio).');

-- I movimenti delle righe tolte escono dalla commessa ma restano nello storico del magazzino.
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$delete from public\.warehouse_movements\s*where order_item_id in \(select oi\.id from public\.order_items oi\s*where oi\.order_id = p_commessa\s*and oi\.id not in \(select v\.id from _voci v where v\.id is not null\)\);$re$,
  $to$update public.warehouse_movements
       set order_id = null,
           notes = coalesce(notes, '') || ' (voce tolta dalla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)) || ')'
     where order_item_id in (select oi.id from public.order_items oi
                              where oi.order_id = p_commessa
                                and oi.id not in (select v.id from _voci v where v.id is not null));$to$,
  'set order_id = null,');

-- Righe nuove: si scaricano dopo l'inserimento, sulla riga nuova.
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$for r in select d\.stock_item_id, d\.delta from _delta d loop[\s\S]*?end loop;$re$,
  $to$for r in
      select oi.id, oi.stock_item_id, coalesce(oi.quantity, 1) as quantity
        from public.order_items oi
       where oi.order_id = p_commessa and oi.stock_item_id is not null
         and oi.id not in (select p.id from _prima p)
    loop
      if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.stock_item_id, r.quantity,
           'Scarico per voce aggiunta alla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
        v_mov := v_mov + 1;
      end if;
    end loop;$to$,
  'Scarico per voce aggiunta alla commessa');

-- Divisione di un articolo tra le fasi: la parte nuova porta con sé la sua quota di scarico.
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
  select coalesce(sum(case movement_type when 'scarico' then quantity when 'carico' then -quantity else 0 end), 0)
    into v_netto from public.warehouse_movements
   where order_item_id = a.id and stock_item_id = a.stock_item_id and order_id = a.order_id;
  v_sposta := least(greatest(v_netto, 0), p_quantita);
  if v_sposta <= 0 then return 0; end if;
  select * into ws from public.warehouse_stock where id = a.stock_item_id;
  -- Due movimenti che si annullano in giacenza: la quota passa dalla riga originale alla nuova.
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id, unit_cost)
  values
    (a.stock_item_id, a.id, 'carico', v_sposta, 'Divisione tra le fasi: quota passata alla nuova riga', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost),
    (a.stock_item_id, b.id, 'scarico', v_sposta, 'Divisione tra le fasi: quota presa dalla riga originale', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost);
  return v_sposta;
end $$;
revoke all on function public.dividi_scarico_magazzino(uuid, uuid, numeric) from public, anon;
grant execute on function public.dividi_scarico_magazzino(uuid, uuid, numeric) to authenticated;
