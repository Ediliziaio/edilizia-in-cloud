-- Verifica del costo medio ponderato del magazzino.
-- Si lancia su un database vero e NON lascia niente dietro: l'ultima istruzione
-- fa fallire la transazione di proposito e stampa gli esiti.
--
--   supabase db query --remote --yes -f supabase/tests/magazzino_costo_medio_verifica.sql
--
-- Esiti attesi (verificati il 04/11/2026 su produzione):
--   1) 10 pz a 10 EUR                    -> medio 10
--   2) + 10 pz a 14 EUR                  -> medio 12
--   3) scarico di 5 pz                   -> costo congelato 12
--   4) + 15 pz a 30 EUR su 15 in giacenza-> medio 21, lo scarico passato resta 12
--   5) carico senza prezzo (rettifica)   -> medio invariato
--   6) carico con valorizza_medio = false-> medio invariato
--   7) casi limite della formula         -> giacenza 0 / negativa e medio 0 danno
--      il prezzo pagato; prezzo nullo, prezzo 0 ed entrata 0 lasciano il medio.
--   8) scheda nuova con giacenza         -> il carico iniziale (trigger differito,
--      scritto a commit) congela il costo della scheda e NON muove il medio.

begin;
create temporary table prova_esiti (n int generated always as identity, riga text) on commit drop;

do $$
declare
  v_company uuid; v_wh uuid; v_user uuid; v_art uuid;
  v_medio numeric; v_scarico_id uuid; v_costo_congelato numeric; v_dopo numeric;
  v_esiti text := '';
begin
  select c.id into v_company from public.companies c
    join public.profiles p on p.company_id = c.id
    join public.warehouses w on w.company_id = c.id
   limit 1;
  select id into v_user from public.profiles where company_id = v_company limit 1;
  select id into v_wh from public.warehouses where company_id = v_company limit 1;

  -- Articolo nuovo, giacenza zero, costo zero
  insert into public.warehouse_stock (company_id, warehouse_id, name, quantity, unit_cost)
  values (v_company, v_wh, 'PROVA MEDIO ' || gen_random_uuid()::text, 0, 0)
  returning id into v_art;

  -- 1) primo carico: 10 pezzi a 10 € → medio 10
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 10, 10, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 10 where id = v_art;
  select unit_cost into v_medio from public.warehouse_stock where id = v_art;
  v_esiti := v_esiti || format(E'1) dopo 10 pz a 10 EUR -> medio %s (atteso 10)\n', v_medio);

  -- 2) secondo carico: 10 pezzi a 14 € → medio 12
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 10, 14, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 10 where id = v_art;
  select unit_cost into v_medio from public.warehouse_stock where id = v_art;
  v_esiti := v_esiti || format(E'2) + 10 pz a 14 EUR -> medio %s (atteso 12)\n', v_medio);

  -- 3) scarico di 5: congela 12
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, performed_by, company_id, warehouse_id)
  values (v_art, 'scarico', 5, v_user, v_company, v_wh)
  returning id into v_scarico_id;
  update public.warehouse_stock set quantity = quantity - 5 where id = v_art;
  select unit_cost into v_costo_congelato from public.warehouse_movements where id = v_scarico_id;
  v_esiti := v_esiti || format(E'3) scarico 5 pz -> costo congelato %s (atteso 12)\n', v_costo_congelato);

  -- 4) terzo carico a 30: il medio sale, lo scarico passato NON cambia
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 15, 30, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 15 where id = v_art;
  select unit_cost into v_medio from public.warehouse_stock where id = v_art;
  select unit_cost into v_dopo from public.warehouse_movements where id = v_scarico_id;
  v_esiti := v_esiti || format(E'4) + 15 pz a 30 EUR su 15 in giacenza -> medio %s (atteso 21); scarico passato %s (atteso 12, invariato)\n', v_medio, v_dopo);

  -- 5) carico senza prezzo (rettifica): il medio non si muove
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 5, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 5 where id = v_art;
  select unit_cost into v_dopo from public.warehouse_stock where id = v_art;
  v_esiti := v_esiti || format(E'5) carico senza prezzo -> medio %s (atteso 21, invariato)\n', v_dopo);

  -- 6) carico con valorizza_medio = false: il medio non si muove
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id, valorizza_medio)
  values (v_art, 'carico', 10, 999, v_user, v_company, v_wh, false);
  select unit_cost into v_dopo from public.warehouse_stock where id = v_art;
  v_esiti := v_esiti || format(E'6) carico a 999 fuori dal medio -> medio %s (atteso 21, invariato)\n', v_dopo);

  -- 7) casi limite della formula
  v_esiti := v_esiti || format(E'7) formula: giacenza 0 -> %s (atteso 7); medio 0 -> %s (atteso 7); prezzo null -> %s (atteso 5); prezzo 0 -> %s (atteso 5); entrata 0 -> %s (atteso 5); giacenza negativa -> %s (atteso 7)\n',
    public.magazzino_medio_ponderato(0, 5, 10, 7),
    public.magazzino_medio_ponderato(10, 0, 10, 7),
    public.magazzino_medio_ponderato(10, 5, 10, null),
    public.magazzino_medio_ponderato(10, 5, 10, 0),
    public.magazzino_medio_ponderato(10, 5, 0, 7),
    public.magazzino_medio_ponderato(-4, 5, 10, 7));

  insert into prova_esiti (riga) values (v_esiti);
end $$;

-- 8) Scheda nuova CON giacenza: fa scattare il trigger differito
-- `warehouse_stock_ensure_initial_movement`, che scrive il carico iniziale a
-- commit. Il trigger del medio gira dentro quell'inserimento: deve essere un
-- non-fatto (giacenza di partenza zero -> il medio resta quello della scheda).
do $$
declare v_company uuid; v_wh uuid; v_art uuid;
begin
  select c.id into v_company from public.companies c
    join public.warehouses w on w.company_id = c.id
    join public.profiles p on p.company_id = c.id limit 1;
  select id into v_wh from public.warehouses where company_id = v_company limit 1;
  insert into public.warehouse_stock (company_id, warehouse_id, name, quantity, unit_cost)
  values (v_company, v_wh, 'PROVA carico iniziale', 7, 12.3456) returning id into v_art;
end $$;

set constraints all immediate;

do $$
declare v_qta int; v_medio numeric; v_mov int; v_costo numeric; v_art uuid; v_esiti text;
begin
  select id, quantity, unit_cost into v_art, v_qta, v_medio
    from public.warehouse_stock where name = 'PROVA carico iniziale' order by created_at desc limit 1;
  select count(*), max(unit_cost) into v_mov, v_costo
    from public.warehouse_movements where stock_item_id = v_art;
  insert into prova_esiti (riga) values (format(
    E'8) scheda nuova con 7 pz a 12,3456 -> giacenza %s, medio %s (atteso 12.3456, invariato); movimenti %s (atteso 1), costo congelato %s (atteso 12.3456)\n',
    v_qta, v_medio, v_mov, v_costo));

  select string_agg(riga, '' order by n) into v_esiti from prova_esiti;
  raise exception E'\n%\n', v_esiti;
end $$;
