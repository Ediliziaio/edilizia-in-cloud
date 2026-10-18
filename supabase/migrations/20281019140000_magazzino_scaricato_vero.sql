-- Magazzino della commessa: si confronta con quanto è stato davvero scaricato (19/10/2026).
--
-- Modifica commessa calcolava la differenza dalla quantità della riga. Ma dalla scheda commessa
-- una riga può cambiare quantità senza movimenti (lo scarico avviene all'installazione): togliendo
-- la riga tornavano in giacenza pezzi mai scaricati, o ne restavano fuori di scaricati.
-- Adesso ogni riga si confronta con il suo scaricato netto (scarichi meno carichi della riga):
--   · riga che resta: si scarica o si rimette la differenza fra la nuova quantità e lo scaricato;
--   · articolo cambiato: torna in giacenza lo scaricato del vecchio, si scarica il nuovo;
--   · riga tolta: torna in giacenza il suo scaricato.
-- In più: giacenza insufficiente = errore chiaro (prima si scaricava sotto zero tagliando a 0),
-- articolo di magazzino di un'altra azienda rifiutato, quantità di un articolo di magazzino > 0.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id, unit_cost)
  values (p_articolo, p_riga, case when p_delta > 0 then 'scarico' else 'carico' end, abs(p_delta),
          p_nota, p_attore, p_commessa, p_company, ws.warehouse_id, ws.unit_cost);
  return true;
end $$;
revoke all on function public.magazzino_movimento_riga(uuid, uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;

-- Scaricato netto di una riga su un articolo (scarichi meno carichi), nella commessa.
create or replace function public.magazzino_scaricato_riga(p_riga uuid, p_articolo uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce(sum(case m.movement_type when 'scarico' then m.quantity when 'carico' then -m.quantity else 0 end), 0)
    from public.warehouse_movements m
   where m.order_item_id = p_riga and m.stock_item_id = p_articolo and m.order_id is not null
$$;
revoke all on function public.magazzino_scaricato_riga(uuid, uuid) from public, anon, authenticated;

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

select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$-- Magazzino riga per riga \(com'erano le righe prima di questo salvataggio\)\.[\s\S]*?'Ripristino per voce tolta dalla commessa '[\s\S]*?end loop;$re$,
  $to$-- Magazzino riga per riga, confrontato con quanto ogni riga ha davvero scaricato.
    if exists (select 1 from _voci v
                where nullif(v.dati->>'stock_item_id','') is not null
                  and not exists (select 1 from public.warehouse_stock ws
                                   where ws.id = (v.dati->>'stock_item_id')::uuid and ws.company_id = v_company)) then
      raise exception 'Un articolo di magazzino non è di questa azienda.' using errcode = '42501';
    end if;
    if exists (select 1 from _voci v
                where nullif(v.dati->>'stock_item_id','') is not null
                  and coalesce((v.dati->>'quantity')::numeric, 1) <= 0) then
      raise exception 'La quantità di un articolo di magazzino deve essere maggiore di zero.' using errcode = '22023';
    end if;

    create temp table if not exists _prima (id uuid, stock_item_id uuid, quantity numeric) on commit drop;
    delete from _prima;
    insert into _prima
    select oi.id, oi.stock_item_id, coalesce(oi.quantity, 1)
      from public.order_items oi where oi.order_id = p_commessa;

    -- Righe che restano e cambiano: la differenza fra la nuova quantità e lo scaricato, prima di aggiornarle.
    for r in
      select p.id, p.stock_item_id as vecchio, p.quantity as q_prima,
             nullif(v.dati->>'stock_item_id','')::uuid as nuovo,
             coalesce((v.dati->>'quantity')::int, 1) as q_dopo
        from _prima p join _voci v on v.id = p.id
    loop
      if r.vecchio is not null and r.vecchio is distinct from r.nuovo then
        if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.vecchio,
             -public.magazzino_scaricato_riga(r.id, r.vecchio),
             'Articolo cambiato nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
          v_mov := v_mov + 1;
        end if;
      end if;
      -- Solo se la voce cambia (quantità o articolo): salvare altri campi non sposta merce.
      if r.nuovo is not null and (r.vecchio is distinct from r.nuovo or r.q_dopo <> r.q_prima) then
        if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.nuovo,
             r.q_dopo - public.magazzino_scaricato_riga(r.id, r.nuovo),
             'Modifica della voce nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
          v_mov := v_mov + 1;
        end if;
      end if;
    end loop;

    -- Righe tolte: torna in giacenza quello che avevano scaricato.
    for r in
      select p.id, p.stock_item_id from _prima p
       where p.stock_item_id is not null and p.id not in (select v.id from _voci v where v.id is not null)
    loop
      if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.stock_item_id,
           -public.magazzino_scaricato_riga(r.id, r.stock_item_id),
           'Ripristino per voce tolta dalla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
        v_mov := v_mov + 1;
      end if;
    end loop;$to$,
  'Magazzino riga per riga, confrontato con quanto ogni riga ha davvero scaricato.');

-- Nuova commessa: quantità di un articolo di magazzino maggiore di zero.
select pg_temp.correggi('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)',
  $re$(IF v_stock_item_id IS NOT NULL THEN\s*UPDATE public\.warehouse_stock)$re$,
  $to$IF v_stock_item_id IS NOT NULL AND v_qty <= 0 THEN
      RAISE EXCEPTION 'La quantità di un articolo di magazzino deve essere maggiore di zero.' USING ERRCODE = '22023';
    END IF;
    \1$to$,
  'La quantità di un articolo di magazzino deve essere maggiore di zero.');
