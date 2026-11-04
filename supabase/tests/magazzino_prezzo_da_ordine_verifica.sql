-- Verifica: il prezzo di un carico senza prezzo viene dall'ordine d'acquisto,
-- solo a pezzi e solo se le quantità parlano della stessa cosa.
-- Si lancia su un database vero e NON lascia niente dietro: l'ultima istruzione
-- fa fallire la transazione di proposito e stampa gli esiti.
--
--   supabase db query --remote --yes -f supabase/tests/magazzino_prezzo_da_ordine_verifica.sql
--
-- Esiti attesi (verificati il 04/11/2026 su produzione):
--   1) 5 pz a 20 EUR meno 10% di sconto     -> 18 EUR il pezzo
--   2) caricandone 6 su 5 comprati          -> nessun prezzo (non è attendibile)
--   3) carico di 5 pz senza prezzo          -> costo congelato 18
--   4) medio: (20 x 10 + 5 x 18) / 25       -> 11,60
--   5) quadratura dell'articolo             -> quadra, scostamento 0,00
--   6) la stessa riga d'ordine «a corpo»    -> nessun prezzo

begin;

do $$
declare
  v_company uuid; v_wh uuid; v_user uuid; v_order uuid; v_art uuid; v_riga uuid; v_oda uuid; v_sup uuid;
  v_prezzo numeric; v_costo numeric; v_medio numeric; v_mov uuid; v_esiti text := '';
begin
  select o.company_id, o.id into v_company, v_order from public.orders o where o.deleted_at is null
    and exists (select 1 from public.warehouses w where w.company_id = o.company_id)
    and exists (select 1 from public.profiles p where p.company_id = o.company_id) limit 1;
  select id into v_wh from public.warehouses where company_id = v_company limit 1;
  select id into v_user from public.profiles where company_id = v_company limit 1;
  select id into v_sup from public.suppliers where company_id = v_company limit 1;

  insert into public.warehouse_stock (company_id, warehouse_id, name, quantity, unit_cost)
  values (v_company, v_wh, 'PROVA prezzo da ODA ' || gen_random_uuid()::text, 0, 0) returning id into v_art;
  -- 20 pezzi già in giacenza a 10 €
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 20, 10, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = 20 where id = v_art;

  insert into public.order_items (order_id, name, quantity, unit_price, purchase_price, stock_item_id, unita_misura)
  values (v_order, 'PROVA riga con ODA a pezzi', 5, 30, 0, v_art, 'pz') returning id into v_riga;
  -- L'ordine nasce «annullato» e poi si conferma: il trigger
  -- `materiali_prezzo_da_ordine` è rotto (riferisce `order_items.company_id`, che
  -- non esiste) e farebbe fallire l'inserimento della riga. Guasto preesistente,
  -- segnalato a parte: qui si aggira perché il trigger esce subito sugli annullati.
  insert into public.purchase_orders (company_id, supplier_id, order_id, status, oda_number, created_by)
  values (v_company, v_sup, v_order, 'annullato', 'PROVA-ODA', v_user) returning id into v_oda;
  -- 5 pz a 20 €, sconto 10% -> 18 € il pezzo
  insert into public.purchase_order_items (company_id, purchase_order_id, order_item_id, description, quantity, unit_price, discount_percent, unit_of_measure)
  values (v_company, v_oda, v_riga, 'PROVA articolo', 5, 20, 10, 'pz');

  update public.purchase_orders set status = 'confermato' where id = v_oda;

  v_prezzo := public.magazzino_prezzo_acquisto_riga(v_riga, 5);
  v_esiti := v_esiti || format(E'1) prezzo dall''ODA (5 pz a 20 EUR meno 10%%): %s (atteso 18)\n', v_prezzo);
  v_esiti := v_esiti || format(E'2) caricando 6 pz su 5 comprati: %s (atteso vuoto)\n',
    coalesce(public.magazzino_prezzo_acquisto_riga(v_riga, 6)::text, '(vuoto)'));

  -- carico di 5 pezzi SENZA prezzo: deve prendere 18 dall'ODA
  insert into public.warehouse_movements (stock_item_id, order_item_id, movement_type, quantity,
                                          performed_by, company_id, warehouse_id, order_id, notes)
  values (v_art, v_riga, 'carico', 5, v_user, v_company, v_wh, v_order, 'PROVA arrivo merce')
  returning id into v_mov;
  update public.warehouse_stock set quantity = quantity + 5 where id = v_art;
  select unit_cost into v_costo from public.warehouse_movements where id = v_mov;
  select unit_cost into v_medio from public.warehouse_stock where id = v_art;
  v_esiti := v_esiti || format(E'3) costo congelato sul carico: %s (atteso 18)\n', v_costo);
  v_esiti := v_esiti || format(E'4) medio: (20*10 + 5*18)/25 = %s (atteso 11.6)\n', v_medio);
  v_esiti := v_esiti || format(E'5) quadratura: %s\n',
    (select quadra::text || ' (scostamento ' || scostamento || ')' from public.magazzino_quadratura(v_company) where stock_item_id = v_art));

  -- una riga a corpo non entra nel medio
  update public.purchase_order_items set unit_of_measure = 'corpo' where order_item_id = v_riga;
  v_esiti := v_esiti || format(E'6) la stessa riga d''ordine «a corpo»: %s (atteso vuoto)\n',
    coalesce(public.magazzino_prezzo_acquisto_riga(v_riga, 5)::text, '(vuoto)'));
  raise exception E'\n%\n', v_esiti;
end $$;
