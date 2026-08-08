-- Il DDT muove l'ordine d'acquisto: la merce che entra fa avanzare l'ODA.
--
-- Prima: DDT e ricezioni per riga (goods_receipts) aggiornavano magazzino e
-- articoli della COMMESSA, ma l'ordine d'acquisto restava fermo — stato
-- 'inviato' per sempre, quantity_received a zero sulle righe ODA, e il costo
-- (che nasce dal trigger 20280117 al passaggio a 'ricevuto') non nasceva mai.
-- La merce era in cantiere e la contabilita' non lo sapeva.
--
-- Regole (mai indovinare, mai retrocedere in automatico):
-- 1) Le ricezioni PER RIGA sono la verita' aritmetica: la riga ODA prende
--    quantity_received = somma delle ricezioni del suo articolo; l'ordine
--    avanza a 'parziale' appena c'e' merce, a 'ricevuto' solo quando OGNI
--    riga e' coperta. Il passaggio a 'ricevuto' fa scattare in cascata il
--    trigger del costo: una strada sola per la contabilita'.
-- 2) Il DDT di testata (senza dettaglio per riga) porta l'ordine ad ALMENO
--    'parziale': la merce e' fisicamente arrivata. MAI 'ricevuto' dalla
--    testata: per dichiarare completo serve l'aritmetica o il gesto umano.
-- 3) Lo stato non retrocede mai da solo, e bozze/annullati non si toccano.
-- 4) Riga commessa collegata a PIU' ordini e ricezione senza DDT: ambiguo,
--    non si tocca niente (meglio nessun aggiornamento che uno sbagliato).

-- ── Ricalcolo aritmetico di un ordine ──────────────────────────────────────
create or replace function public.ricalcola_ricezione_oda(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_totale int;
  v_coperte int;
  v_con_merce int;
  v_ultima date;
begin
  select status into v_status from purchase_orders where id = p_po_id;
  if v_status is null or v_status in ('bozza', 'annullato', 'ricevuto') then
    return; -- niente da avanzare (o gia' arrivato)
  end if;

  -- Allinea le righe ODA alla somma delle ricezioni del loro articolo.
  -- Solo righe agganciate a un articolo di commessa: le righe libere si
  -- ricevono col gesto esplicito, non hanno ricezioni per riga.
  update purchase_order_items poi
     set quantity_received = coalesce(gr.somma, 0),
         received_date = case when coalesce(gr.somma, 0) > 0 then gr.ultima else poi.received_date end
    from (
      -- Contano le ricezioni di QUESTO ordine (via DDT) o senza DDT: quelle
      -- agganciate al DDT di un altro ordine non devono gonfiare questo.
      select g.order_item_id, sum(g.quantity_received) as somma, max(g.receipt_date) as ultima
      from goods_receipts g
      left join ddt_ricezione d on d.id = g.ddt_ricezione_id
      where d.id is null or d.purchase_order_id = p_po_id
      group by g.order_item_id
    ) gr
   where poi.purchase_order_id = p_po_id
     and poi.order_item_id = gr.order_item_id;

  select count(*),
         count(*) filter (where coalesce(quantity_received, 0) >= quantity),
         count(*) filter (where coalesce(quantity_received, 0) > 0),
         max(received_date)
    into v_totale, v_coperte, v_con_merce, v_ultima
    from purchase_order_items
   where purchase_order_id = p_po_id
     and coalesce(quantity, 0) > 0;

  if v_totale > 0 and v_coperte = v_totale then
    -- Tutto coperto: 'ricevuto' → il trigger 20280117 crea il costo.
    update purchase_orders
       set status = 'ricevuto',
           actual_delivery_date = coalesce(actual_delivery_date, v_ultima, current_date)
     where id = p_po_id and status in ('inviato', 'confermato', 'parziale');
  elsif v_con_merce > 0 then
    update purchase_orders
       set status = 'parziale'
     where id = p_po_id and status in ('inviato', 'confermato');
  end if;
end;
$$;

-- ── Trigger: ogni ricezione per riga ricalcola l'ordine giusto ─────────────
create or replace function public.trg_goods_receipt_muove_oda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_item uuid;
  v_po uuid;
  v_quanti int;
begin
  v_order_item := coalesce(new.order_item_id, old.order_item_id);

  -- L'ordine lo dice il DDT, quando c'e': e' il segnale esplicito.
  if coalesce(new.ddt_ricezione_id, old.ddt_ricezione_id) is not null then
    select purchase_order_id into v_po
      from ddt_ricezione
     where id = coalesce(new.ddt_ricezione_id, old.ddt_ricezione_id);
  end if;

  -- Senza DDT: l'ordine collegato all'articolo — solo se e' UNO solo.
  if v_po is null then
    select count(distinct purchase_order_id), min(purchase_order_id::text)::uuid
      into v_quanti, v_po
      from purchase_order_items
     where order_item_id = v_order_item;
    if coalesce(v_quanti, 0) <> 1 then
      return coalesce(new, old); -- zero o piu' ordini: ambiguo, non si indovina
    end if;
  end if;

  perform ricalcola_ricezione_oda(v_po);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_goods_receipts_muove_oda on public.goods_receipts;
create trigger trg_goods_receipts_muove_oda
  after insert or delete or update of quantity_received
  on public.goods_receipts
  for each row
  execute function public.trg_goods_receipt_muove_oda();

-- ── Trigger: il DDT di testata porta l'ordine ad almeno 'parziale' ─────────
create or replace function public.trg_ddt_muove_oda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stato in ('parziale', 'ricevuto', 'verificato') then
    update purchase_orders
       set status = 'parziale'
     where id = new.purchase_order_id
       and status in ('inviato', 'confermato');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ddt_ricezione_muove_oda on public.ddt_ricezione;
create trigger trg_ddt_ricezione_muove_oda
  after insert or update of stato
  on public.ddt_ricezione
  for each row
  execute function public.trg_ddt_muove_oda();

comment on function public.ricalcola_ricezione_oda(uuid) is
  'Allinea quantity_received delle righe ODA alla somma delle ricezioni (goods_receipts) e fa avanzare lo stato: parziale se c''e'' merce, ricevuto se ogni riga e'' coperta (il trigger del costo fa il resto). Solo in avanti, mai su bozze/annullati.';
