-- Magazzino della commessa, quinto controllo (19/10/2026).
--
--  1. Nuova commessa: lo scarico passa da magazzino_movimento_riga, come la modifica. Con poca
--     giacenza si ferma con «Giacenza insufficiente» invece di registrare più di quanto esce.
--  2. Installazione: un prelievo dal cantiere o un DDT per la commessa (movimenti senza riga) non
--     blocca più l'installazione. Quei movimenti si collegano alla riga che si installa e contano
--     come già scaricati, così non si scarica due volte.
--  3. Modifica commessa: prima i movimenti che rimettono in giacenza, poi quelli che scaricano.
--     Spostare quantità fra due righe dello stesso articolo non dipende più dall'ordine.
--  4. magazzino_allinea_riga: la scheda commessa, dopo aver cambiato la quantità di una riga già
--     scaricata o installata, la allinea al magazzino.
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
  $re$UPDATE public\.warehouse_stock\s*SET quantity = GREATEST\(0, quantity - v_qty\)[\s\S]*?FROM public\.warehouse_stock ws WHERE ws\.id = v_stock_item_id;$re$,
  $to$IF NOT EXISTS (SELECT 1 FROM public.warehouse_stock WHERE id = v_stock_item_id AND company_id = v_company_id) THEN
        RAISE EXCEPTION 'Articolo di magazzino non valido per questa azienda.' USING ERRCODE = '42501';
      END IF;
      -- Stesso scarico della modifica commessa: sulla riga, e mai oltre la giacenza.
      PERFORM public.magazzino_movimento_riga(v_company_id, v_order_id, v_item_id, v_stock_item_id, v_qty,
        'Prelievo automatico per ordine ' || COALESCE(NULLIF(TRIM(p_order_data->>'order_code'), ''), LEFT(v_order_id::text, 8)),
        v_caller_id);$to$,
  'PERFORM public.magazzino_movimento_riga(v_company_id, v_order_id, v_item_id, v_stock_item_id, v_qty,');

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_auto_deduct_stock()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
DECLARE
  v_stock public.warehouse_stock%ROWTYPE;
  v_company uuid;
  v_used numeric := 0;
  v_remaining numeric;
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
    -- Prelievi dal cantiere e DDT per la commessa sono già usciti dal magazzino: si collegano
    -- a questa riga e contano come scaricati (prima bloccavano l'installazione).
    UPDATE public.warehouse_movements
       SET order_item_id = NEW.id
     WHERE stock_item_id = NEW.stock_item_id AND order_id = NEW.order_id
       AND company_id = v_company AND order_item_id IS NULL
       AND movement_type IN ('scarico', 'carico');
    SELECT coalesce(sum(CASE movement_type WHEN 'scarico' THEN quantity
                     WHEN 'carico' THEN -quantity ELSE 0 END),0)
      INTO v_used FROM public.warehouse_movements
      WHERE stock_item_id=NEW.stock_item_id AND order_id=NEW.order_id
        AND company_id=v_company AND order_item_id=NEW.id;
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
-- I movimenti delle righe che restano e di quelle tolte si raccolgono e poi si fanno in ordine:
-- prima quelli che rimettono in giacenza (delta negativo), poi quelli che scaricano.
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$-- Righe che restano e cambiano: la differenza fra la nuova quantità e lo scaricato, prima di aggiornarle\.[\s\S]*?'Ripristino per voce tolta dalla commessa '[\s\S]*?end loop;$re$,
  $to$-- Movimenti delle righe che restano e cambiano (articolo o quantità) e di quelle tolte,
    -- confrontati con quanto ogni riga ha davvero scaricato. Si fanno prima i rientri, poi gli scarichi.
    create temp table if not exists _mov (riga uuid, articolo uuid, delta numeric, nota text) on commit drop;
    delete from _mov;
    insert into _mov
    select p.id, p.stock_item_id, -public.magazzino_scaricato_riga(p.id, p.stock_item_id),
           'Articolo cambiato nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8))
      from _prima p join _voci v on v.id = p.id
     where p.stock_item_id is not null
       and p.stock_item_id is distinct from nullif(v.dati->>'stock_item_id','')::uuid;
    insert into _mov
    select p.id, nullif(v.dati->>'stock_item_id','')::uuid,
           coalesce((v.dati->>'quantity')::int, 1)
             - public.magazzino_scaricato_riga(p.id, nullif(v.dati->>'stock_item_id','')::uuid),
           'Modifica della voce nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8))
      from _prima p join _voci v on v.id = p.id
     where nullif(v.dati->>'stock_item_id','') is not null
       and (p.stock_item_id is distinct from nullif(v.dati->>'stock_item_id','')::uuid
            or coalesce((v.dati->>'quantity')::int, 1) <> p.quantity);
    insert into _mov
    select p.id, p.stock_item_id, -public.magazzino_scaricato_riga(p.id, p.stock_item_id),
           'Ripristino per voce tolta dalla commessa ' || coalesce(v_codice, left(p_commessa::text, 8))
      from _prima p
     where p.stock_item_id is not null and p.id not in (select v.id from _voci v where v.id is not null);
    for r in select m.riga, m.articolo, m.delta, m.nota from _mov m order by m.delta loop
      if public.magazzino_movimento_riga(v_company, p_commessa, r.riga, r.articolo, r.delta, r.nota, v_attore) then
        v_mov := v_mov + 1;
      end if;
    end loop;$to$,
  'create temp table if not exists _mov (riga uuid, articolo uuid, delta numeric, nota text) on commit drop;');

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.magazzino_allinea_riga(p_riga uuid)
returns numeric language plpgsql security definer set search_path = public
as $$
declare
  oi public.order_items; v_company uuid; v_codice text; v_scaricato numeric; v_delta numeric;
begin
  select * into oi from public.order_items where id = p_riga for update;
  if oi.id is null then raise exception 'Voce non trovata.' using errcode = 'P0002'; end if;
  select o.company_id, o.order_code into v_company, v_codice from public.orders o where o.id = oi.order_id;
  if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
     or not public.ufficio_vede_commessa(oi.order_id) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  if oi.stock_item_id is null then return 0; end if;
  v_scaricato := public.magazzino_scaricato_riga(oi.id, oi.stock_item_id);
  -- Una riga mai scaricata e non installata si scarica all'installazione: qui non si tocca.
  if v_scaricato = 0 and not coalesce(oi.auto_deducted, false) then return 0; end if;
  v_delta := coalesce(oi.quantity, 0) - v_scaricato;
  perform public.magazzino_movimento_riga(v_company, oi.order_id, oi.id, oi.stock_item_id, v_delta,
    'Quantità cambiata dalla commessa ' || coalesce(v_codice, left(oi.order_id::text, 8)), auth.uid());
  return v_delta;
end $$;
revoke all on function public.magazzino_allinea_riga(uuid) from public, anon;
grant execute on function public.magazzino_allinea_riga(uuid) to authenticated;
