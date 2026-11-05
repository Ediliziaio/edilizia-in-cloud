-- Magazzino: il valore di un articolo è il costo medio ponderato di quanto è
-- stato speso davvero, non l'ultimo prezzo che qualcuno ha scritto a mano.
--
-- Com'era. `warehouse_stock.unit_cost` si scriveva solo alla nascita della
-- scheda (o a mano dalla pagina Magazzino): NESSUNA funzione del database lo
-- aggiornava mai. Quindi comprare lo stesso articolo a 10 € e poi a 14 €
-- lasciava la giacenza a 10 €, e chi prelevava portava in commessa un costo che
-- non c'entrava con la spesa. Peggio: quasi tutti i percorsi di carico scrivono
-- il movimento SENZA prezzo, e il congelamento lo riempiva copiando il valore
-- (vecchio) della scheda: il prezzo pagato non entrava da nessuna parte.
--
-- Com'è adesso.
--   • `unit_cost` della scheda È il medio ponderato. Non si aggiunge una
--     colonna accanto: ogni lettore di `unit_cost` (il prelievo da giacenza in
--     OrderItemsList, il ripiego di `wh_get_valorizzazione`, il prezzo delle
--     righe di DDT in `register_warehouse_uscita` e `create_shipment_atomic`,
--     `trg_auto_deduct_stock`, la lista della spesa, la valorizzazione a
--     schermo) già lo legge come «quanto vale un pezzo in giacenza». Due colonne
--     vorrebbero dire toccarli tutti e lasciare accanto al numero giusto un
--     numero sbagliato che qualcuno prima o poi leggerebbe.
--   • Il medio si muove SOLO al carico, con la formula classica:
--       nuovo = (giacenza × medio + entrata × prezzo pagato) / (giacenza + entrata)
--   • Lo scarico congela il medio del momento sul movimento (lo faceva già) e
--     da lì non si muove più: un prelievo passato non cambia valore quando si
--     ricompra, e le commesse chiuse restano ferme.
--   • Il rientro dalla commessa rientra al costo con cui la merce era uscita.
--   • La giacenza di partenza del calcolo si ricava dai MOVIMENTI, non da
--     `warehouse_stock.quantity`: i percorsi di carico aggiornano la scheda a
--     volte prima e a volte dopo aver scritto il movimento, e il medio non può
--     dipendere da quell'ordine.
--
-- Sui dati esistenti NON si ricalcola nulla. I carichi passati non portano il
-- prezzo pagato (portano il valore della scheda di allora): ricalcolare il medio
-- dalla storia restituirebbe gli stessi numeri o li muoverebbe a caso. Il medio
-- parte dal valore di oggi e si forma con i carichi nuovi.

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. I movimenti che non sono entrate vere di merce
-- ───────────────────────────────────────────────────────────────────────────────
-- La divisione di una riga di commessa tra due fasi scrive una coppia
-- carico+scarico per spostare il costo da una riga all'altra: la merce non è
-- mai tornata in magazzino, e quel carico non deve muovere il medio.
alter table public.warehouse_movements
  add column if not exists valorizza_medio boolean not null default true;

comment on column public.warehouse_movements.valorizza_medio is
  'false per i carichi che non sono entrate vere di merce (la coppia della divisione tra le fasi): non muovono il costo medio della scheda.';

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. La formula, da sola e verificabile
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.magazzino_medio_ponderato(
  p_giacenza numeric,
  p_medio numeric,
  p_entrata numeric,
  p_prezzo numeric
) returns numeric
language sql immutable
set search_path = public
as $$
  select case
    -- Niente entrata: il medio non si muove.
    when coalesce(p_entrata, 0) <= 0 then coalesce(p_medio, 0)
    -- Prezzo mancante (o zero: le rettifiche e i carichi senza bolla arrivano
    -- così): non si inventa un valore, resta il medio di prima. Meglio un medio
    -- vecchio che un magazzino svalutato per una casella vuota.
    when coalesce(p_prezzo, 0) <= 0 then coalesce(p_medio, 0)
    -- Giacenza a zero o negativa (scarichi oltre i carichi): non c'è nulla con
    -- cui fare la media, vale il prezzo appena pagato.
    when coalesce(p_giacenza, 0) <= 0 then round(p_prezzo, 4)
    -- Scheda senza valore: la media partirebbe da zero e abbasserebbe tutto.
    when coalesce(p_medio, 0) <= 0 then round(p_prezzo, 4)
    else round(
      (p_giacenza * p_medio + p_entrata * p_prezzo)
      / nullif(p_giacenza + p_entrata, 0), 4)
  end
$$;

comment on function public.magazzino_medio_ponderato(numeric, numeric, numeric, numeric) is
  'Costo medio ponderato dopo un carico. Giacenza <= 0, medio <= 0 o prezzo mancante hanno una risposta scritta, non una divisione per zero.';

revoke all on function public.magazzino_medio_ponderato(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.magazzino_medio_ponderato(numeric, numeric, numeric, numeric) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. Quanto è stato pagato davvero, per un carico che non lo dice
-- ───────────────────────────────────────────────────────────────────────────────
-- Prima l'ordine d'acquisto che copre la riga di commessa (è lì che sta il
-- prezzo contrattato, al netto dello sconto: la stessa formula di
-- `oda_copertura_righe`), poi il prezzo d'acquisto della riga stessa.
create or replace function public.magazzino_prezzo_acquisto_riga(p_order_item uuid)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select sum(coalesce(poi.line_total,
                         poi.quantity * poi.unit_price * (1 - coalesce(poi.discount_percent, 0) / 100)))
              / nullif(sum(poi.quantity), 0)
       from public.purchase_order_items poi
       join public.purchase_orders po on po.id = poi.purchase_order_id
      where poi.order_item_id = p_order_item
        and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')),
    (select nullif(oi.purchase_price, 0) from public.order_items oi where oi.id = p_order_item)
  )
$$;

comment on function public.magazzino_prezzo_acquisto_riga(uuid) is
  'Prezzo unitario pagato per una riga di commessa: dall''ordine d''acquisto che la copre (sconto incluso), altrimenti dal prezzo d''acquisto della riga.';

revoke all on function public.magazzino_prezzo_acquisto_riga(uuid) from public, anon;
grant execute on function public.magazzino_prezzo_acquisto_riga(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. Congelamento del costo sul movimento (tutte le strade)
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.warehouse_movement_snapshot_unit_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prezzo numeric;
begin
  if new.unit_cost is not null then
    return new;
  end if;

  -- Un carico che non dice quanto è stato pagato: si guarda l'ordine d'acquisto
  -- della riga di commessa. Senza questo il prezzo pagato non entrerebbe mai nel
  -- magazzino e il medio non si muoverebbe. I rientri dalla commessa no: quelli
  -- il costo lo portano già, ed è quello con cui la merce era uscita.
  if new.movement_type = 'carico'
     and new.order_item_id is not null
     and not coalesce(new.rientro_commessa, false) then
    v_prezzo := public.magazzino_prezzo_acquisto_riga(new.order_item_id);
    if coalesce(v_prezzo, 0) > 0 then
      new.unit_cost := round(v_prezzo, 4);
      return new;
    end if;
  end if;

  select ws.unit_cost
   into new.unit_cost
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     -- Alcuni percorsi legacy valorizzano company_id con un secondo trigger
     -- BEFORE INSERT. Lo stock_item_id resta comunque univoco: non perdiamo
     -- il costo se questo trigger viene eseguito per primo.
     and (new.company_id is null or ws.company_id = new.company_id);
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. Il medio si ricalcola al carico
-- ───────────────────────────────────────────────────────────────────────────────
-- BEFORE INSERT, non AFTER: un AFTER ROW scatta a statement finito, e in un
-- INSERT a più righe vedrebbe già dentro anche le righe successive, contandole
-- nella giacenza di partenza. Il nome viene dopo
-- `trg_warehouse_movement_snapshot_unit_cost` in ordine alfabetico, così il
-- costo del movimento è già risolto quando questo trigger lo legge.
create or replace function public.magazzino_valorizza_medio()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_giacenza numeric;
  v_medio numeric;
  v_nuovo numeric;
begin
  if new.movement_type <> 'carico'
     or not coalesce(new.valorizza_medio, true)
     or coalesce(new.quantity, 0) <= 0
     or coalesce(new.unit_cost, 0) <= 0
     or new.stock_item_id is null then
    return new;
  end if;

  select ws.unit_cost into v_medio
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     for update;
  if not found then
    return new;
  end if;

  select coalesce(sum(case when m.movement_type = 'carico' then m.quantity else -m.quantity end), 0)
    into v_giacenza
    from public.warehouse_movements m
   where m.stock_item_id = new.stock_item_id;

  v_nuovo := public.magazzino_medio_ponderato(v_giacenza, v_medio, new.quantity, new.unit_cost);

  if v_nuovo is not null and abs(v_nuovo - coalesce(v_medio, 0)) > 0.00005 then
    update public.warehouse_stock
       set unit_cost = v_nuovo, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$$;

comment on function public.magazzino_valorizza_medio() is
  'Al carico ricalcola il costo medio ponderato della scheda. La giacenza di partenza viene dai movimenti, non da warehouse_stock.quantity, perché i percorsi di carico aggiornano la scheda a volte prima e a volte dopo.';

drop trigger if exists trg_warehouse_movimento_valorizza_medio on public.warehouse_movements;
create trigger trg_warehouse_movimento_valorizza_medio
  before insert on public.warehouse_movements
  for each row execute function public.magazzino_valorizza_medio();

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. Il rientro dalla commessa vale quanto è costato uscire
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.materiale_rientro_magazzino(
  p_riga uuid,
  p_quantita numeric,
  p_magazzino uuid default null,
  p_gia_rientrati numeric default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r public.order_items;
  o public.orders;
  ws public.warehouse_stock;
  v_magazzino uuid;
  v_scheda uuid;
  v_coperta numeric;
  v_valore numeric;
  v_rientrati numeric;
  v_posati numeric;
  v_comprato numeric;
  v_avanzano numeric;
  v_unita text;
  v_costo_uscita numeric;
begin
  select * into r from public.order_items where id = p_riga for update;
  if r.id is null then raise exception 'Articolo non trovato.' using errcode = 'P0002'; end if;
  select * into o from public.orders where id = r.order_id;
  if auth.uid() is null
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id), false)
     or not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  v_unita := public.unita_confrontabile(r.unita_misura);
  if v_unita = 'a corpo' then
    raise exception '«%» è a corpo: non ha pezzi da far rientrare. Carica in magazzino quello che avanza come articolo a sé.', r.name
      using errcode = '22023';
  end if;
  if coalesce(p_quantita, 0) <= 0 or p_quantita <> trunc(p_quantita) then
    raise exception 'Il magazzino conta pezzi interi: indica quanti ne rientrano.' using errcode = '22023';
  end if;

  select c.coperta, c.valore_oda into v_coperta, v_valore
    from public.oda_copertura_righe(o.id) c where c.order_item_id = r.id;
  if r.stock_item_id is null and coalesce(v_coperta, 0) <= 0 then
    raise exception '«%» non passa da un ordine d''acquisto né dal magazzino: il suo costo sta nelle fatture della commessa, correggilo lì.', r.name
      using errcode = '22023';
  end if;

  select coalesce(sum(m.quantity), 0) into v_rientrati
    from public.warehouse_movements m
   where m.order_item_id = r.id and m.order_id = o.id and m.movement_type = 'carico' and m.rientro_commessa
     and coalesce(m.notes, '') not like 'Divisione tra le fasi:%';
  if p_gia_rientrati is not null and p_gia_rientrati <> v_rientrati then
    raise exception 'Nel frattempo di «%» ne sono già rientrati %: ricarica la pagina e ricontrolla.', r.name, v_rientrati
      using errcode = '40001';
  end if;

  select coalesce(sum((e->>'quantita')::numeric), 0) into v_posati
    from public.campo_rapportini cr
    cross join lateral jsonb_array_elements(case when jsonb_typeof(cr.materiali_usati) = 'array' then cr.materiali_usati else '[]'::jsonb end) e
   where cr.order_id = o.id and cr.stato = 'approvato'
     and e->>'order_item_id' = r.id::text
     and coalesce(e->>'quantita', '') ~ '^[0-9]+([.][0-9]+)?$'
     and (coalesce(e->>'stock_item_id', '') = '' or e->>'stock_item_id' = coalesce(r.stock_item_id::text, ''))
     and (coalesce(btrim(e->>'unita'), '') = '' or public.unita_confrontabile(e->>'unita') = v_unita);

  v_comprato := greatest(coalesce(v_coperta, 0), coalesce(r.quantity, 0));
  v_avanzano := v_comprato - v_posati - v_rientrati;
  if p_quantita > v_avanzano then
    raise exception 'Di «%» ne avanzano %: comprati %, posati % (rapportini approvati), già rientrati %.',
      r.name, greatest(v_avanzano, 0), v_comprato, v_posati, v_rientrati using errcode = '22023';
  end if;

  if r.stock_item_id is not null then
    v_scheda := r.stock_item_id;
  else
    select w.id into v_magazzino from public.warehouses w
     where w.company_id = o.company_id and coalesce(w.is_active, true)
       and (w.id = p_magazzino or (p_magazzino is null and w.linked_order_id is null))
     order by (w.id = p_magazzino) desc nulls last, w.is_default desc nulls last, w.position nulls last, w.created_at
     limit 1;
    if v_magazzino is null then
      raise exception 'Nessun magazzino dell''azienda dove far rientrare la merce: creane uno in Magazzino.' using errcode = '22023';
    end if;
    select s.id into v_scheda from public.warehouse_stock s
     where s.company_id = o.company_id and s.warehouse_id = v_magazzino
       and lower(btrim(s.name)) = lower(btrim(r.name))
     order by s.created_at limit 1;
    if v_scheda is null then
      insert into public.warehouse_stock (company_id, warehouse_id, name, description, quantity, unit_cost, vat_rate, supplier_id)
      values (o.company_id, v_magazzino, r.name, 'Rientrato dalla commessa ' || coalesce(o.order_code, ''), 0,
              case when coalesce(v_coperta, 0) > 0 then round(v_valore / v_coperta, 4) else r.purchase_price end, r.vat_rate, r.supplier_id)
      returning id into v_scheda;
    end if;
  end if;

  select * into ws from public.warehouse_stock where id = v_scheda and company_id = o.company_id for update;
  if ws.id is null then
    raise exception 'La scheda di magazzino di «%» non c''è più: rientro non registrato.', r.name using errcode = 'P0002';
  end if;

  -- Il rientro vale quanto è costato uscire, non il medio di oggi: un acquisto
  -- fatto nel frattempo a un prezzo diverso creerebbe o distruggerebbe valore
  -- dal nulla, e la commessa si vedrebbe accreditare più (o meno) di quanto le
  -- era stato addebitato. Si prende la media degli scarichi di QUESTA riga su
  -- QUESTO articolo; se la merce non è mai passata dal magazzino, il prezzo
  -- dell'ordine d'acquisto; in ultima istanza il medio della scheda.
  select sum(m.quantity * m.unit_cost) / nullif(sum(m.quantity), 0)
    into v_costo_uscita
    from public.warehouse_movements m
   where m.order_item_id = r.id and m.stock_item_id = ws.id
     and m.movement_type = 'scarico' and coalesce(m.unit_cost, 0) > 0;
  if coalesce(v_costo_uscita, 0) <= 0 and coalesce(v_coperta, 0) > 0 then
    v_costo_uscita := v_valore / v_coperta;
  end if;
  if coalesce(v_costo_uscita, 0) <= 0 then
    v_costo_uscita := nullif(r.purchase_price, 0);
  end if;
  if coalesce(v_costo_uscita, 0) <= 0 then
    v_costo_uscita := ws.unit_cost;
  end if;

  update public.warehouse_stock set quantity = coalesce(quantity, 0) + p_quantita, updated_at = now() where id = ws.id;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id, unit_cost, rientro_commessa)
  values (ws.id, r.id, 'carico', p_quantita,
          'Rientro dal cantiere: ' || p_quantita || ' ' || coalesce(nullif(r.unita_misura, ''), 'pz') || ' non posati',
          auth.uid(), o.id, o.company_id, ws.warehouse_id, round(v_costo_uscita, 4), true);

  return jsonb_build_object('stock_item_id', ws.id, 'warehouse_id', ws.warehouse_id, 'quantita', p_quantita,
                            'rientrati', v_rientrati + p_quantita, 'posati', v_posati, 'avanzano', v_avanzano - p_quantita,
                            'costo_unitario', round(v_costo_uscita, 4));
end
$$;

-- ───────────────────────────────────────────────────────────────────────────────
-- 7. La divisione tra le fasi sposta il costo, non ricompra la merce
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.dividi_scarico_magazzino(
  p_originale uuid, p_nuova uuid, p_quantita numeric
) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  a public.order_items; b public.order_items;
  v_company uuid; v_netto numeric; v_sposta numeric; v_prelievi numeric := 0; v_resto numeric;
  ws public.warehouse_stock;
  v_costo numeric;
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
  -- Un articolo di magazzino si divide a pezzi interi: prima di toccare l'ODA o il magazzino.
  if a.stock_item_id is not null and coalesce(p_quantita, 0) <> trunc(coalesce(p_quantita, 0)) then
    raise exception 'Il magazzino conta quantità intere: dividi «%» in parti intere.',
      coalesce(a.name, 'l''articolo') using errcode = '22023';
  end if;
  -- La nuova voce resta coperta dall'ordine d'acquisto per la sua parte.
  perform public.dividi_righe_ordine_acquisto(a.id, b.id, p_quantita);
  if a.stock_item_id is null or b.stock_item_id is distinct from a.stock_item_id or coalesce(p_quantita, 0) <= 0 then
    return 0;
  end if;
  v_netto := public.magazzino_scaricato_riga(a.id, a.stock_item_id);
  v_sposta := least(greatest(v_netto, 0), p_quantita);
  if v_sposta <= 0 then return 0; end if;
  v_prelievi := public.magazzino_stacca_prelievi(a.id, a.stock_item_id, v_sposta);
  if v_prelievi > 0 then
    perform public.magazzino_collega_prelievi(v_company, a.order_id, b.id, a.stock_item_id, v_prelievi);
  end if;
  v_resto := v_sposta - v_prelievi;
  if v_resto > 0 then
    select * into ws from public.warehouse_stock where id = a.stock_item_id;
    -- La coppia vale quanto è costato uscire alla riga originale, non il medio
    -- di oggi: così alla riga si ritira esattamente quello che le era stato
    -- addebitato. E `valorizza_medio = false` perché la merce non è mai tornata
    -- in magazzino: questo carico non è un acquisto e non muove il medio.
    select sum(m.quantity * m.unit_cost) / nullif(sum(m.quantity), 0)
      into v_costo
      from public.warehouse_movements m
     where m.order_item_id = a.id and m.stock_item_id = a.stock_item_id
       and m.movement_type = 'scarico' and coalesce(m.unit_cost, 0) > 0;
    v_costo := round(coalesce(nullif(v_costo, 0), ws.unit_cost), 4);
    insert into public.warehouse_movements
      (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
       warehouse_id, unit_cost, rientro_commessa, valorizza_medio)
    values
      (a.stock_item_id, a.id, 'carico', v_resto, 'Divisione tra le fasi: quota passata alla nuova riga', auth.uid(), a.order_id, v_company, ws.warehouse_id, v_costo, true, false),
      (a.stock_item_id, b.id, 'scarico', v_resto, 'Divisione tra le fasi: quota presa dalla riga originale', auth.uid(), a.order_id, v_company, ws.warehouse_id, v_costo, false, false);
  end if;
  return v_sposta;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────────
-- 8. Quadratura: il valore della scheda deve essere quello dei movimenti
-- ───────────────────────────────────────────────────────────────────────────────
-- giacenza × medio contro Σ(carichi × costo) − Σ(scarichi × costo). Se i due
-- numeri si allontanano, qualcosa ha scritto il valore senza passare per un
-- movimento (tipicamente una modifica a mano del costo dalla pagina Magazzino,
-- che non riscrive la storia) oppure un movimento è senza prezzo.
create or replace function public.magazzino_quadratura(p_company_id uuid default null)
returns table (
  company_id uuid,
  stock_item_id uuid,
  articolo text,
  giacenza numeric,
  medio numeric,
  valore_scheda numeric,
  valore_movimenti numeric,
  scostamento numeric,
  movimenti_senza_prezzo bigint,
  quadra boolean
)
language sql stable security definer
set search_path = public
as $$
  with filtro as (
    select s.id, s.company_id, s.name, s.quantity::numeric as giacenza, s.unit_cost
      from public.warehouse_stock s
     where (p_company_id is null or s.company_id = p_company_id)
       and (auth.uid() is null or public.user_can_access_company(s.company_id))
  ), mov as (
    select m.stock_item_id,
           sum(case when m.movement_type = 'carico' then m.quantity else -m.quantity end
               * coalesce(m.unit_cost, 0)) as valore,
           count(*) filter (where coalesce(m.unit_cost, 0) <= 0) as senza_prezzo
      from public.warehouse_movements m
      join filtro f on f.id = m.stock_item_id
     group by m.stock_item_id
  )
  select f.company_id, f.id, f.name,
         f.giacenza,
         round(f.unit_cost, 4),
         round(f.giacenza * f.unit_cost, 2),
         round(coalesce(mov.valore, 0), 2),
         round(f.giacenza * f.unit_cost - coalesce(mov.valore, 0), 2),
         coalesce(mov.senza_prezzo, 0),
         abs(f.giacenza * f.unit_cost - coalesce(mov.valore, 0))
           <= greatest(0.01, abs(coalesce(mov.valore, 0)) * 0.005)
    from filtro f
    left join mov on mov.stock_item_id = f.id
   order by abs(f.giacenza * f.unit_cost - coalesce(mov.valore, 0)) desc
$$;

comment on function public.magazzino_quadratura(uuid) is
  'Controllo di quadratura del magazzino: giacenza × medio contro la somma dei carichi meno la somma degli scarichi, articolo per articolo. quadra = false quando lo scostamento supera 1 centesimo o lo 0,5% del valore.';

revoke all on function public.magazzino_quadratura(uuid) from public, anon;
grant execute on function public.magazzino_quadratura(uuid) to authenticated, service_role;
