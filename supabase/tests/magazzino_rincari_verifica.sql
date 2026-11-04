-- Verifica dell'avviso sui rincari d'acquisto del magazzino.
-- Si lancia su un database vero e NON lascia niente dietro: l'ultima istruzione
-- fa fallire la transazione di proposito e stampa gli esiti.
--
--   supabase db query --remote --yes -f supabase/tests/magazzino_rincari_verifica.sql
--
-- Esiti attesi (verificati il 04/11/2026 su produzione, con la migrazione
-- 20281203100000 applicata dentro la transazione di prova):
--   A) primo acquisto, nessun medio di partenza  -> nessun rincaro
--   B) +10% con soglia al 15%                    -> nessun rincaro
--   C) +60% su 1 pezzo (6 EUR in piu')           -> nessun rincaro (sotto i 50 EUR)
--   D) +60% su 50 pezzi                          -> rincaro annotato, +58,60%, 297,26 EUR
--   E) interruttore spento                       -> non annota piu'
--   F) due giri dell'avviso                      -> UN SOLO avviso, chiave del mese
--   G) la regola da sola, casi limite
--   H) andamento del prezzo sulla scheda         -> 5 carichi, 1 rincaro
--   I) due carichi valorizzati in UN SOLO insert -> ognuno col SUO medio di prima
--      (è il caso che la prima stesura sbagliava, passando il medio fra i
--      trigger con una variabile di sessione: gli AFTER ROW scattano tutti a
--      statement finito e avrebbero letto tutti il medio dell'ultima riga)

begin;

do $$
declare
  v_company uuid; v_wh uuid; v_user uuid; v_art uuid; v_esiti text := '';
  v_n int; v_perc numeric; v_spesa numeric; v_prima numeric; v_pagato numeric;
  v_titolo text; v_msg text; v_chiave text; v_sev text;
begin
  select c.id into v_company from public.companies c
    join public.warehouses w on w.company_id = c.id
    join public.profiles p on p.company_id = c.id
   where c.status in ('active','trial') limit 1;
  select id into v_wh from public.warehouses where company_id = v_company limit 1;
  select id into v_user from public.profiles where company_id = v_company limit 1;

  -- soglie: 15% e 50 EUR (i valori di partenza)
  insert into public.company_governance_settings (company_id) values (v_company)
  on conflict (company_id) do update set rincaro_acquisti_enabled = true,
    rincaro_soglia_perc = 15, rincaro_minimo_euro = 50;

  insert into public.warehouse_stock (company_id, warehouse_id, name, quantity, unit_cost)
  values (v_company, v_wh, 'PROVA rincaro', 0, 0) returning id into v_art;

  -- A) primo acquisto: 100 pz a 10 EUR. Nessun «solito» -> niente rincaro.
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 100, 10, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 100 where id = v_art;
  select count(*) into v_n from public.warehouse_rincari where stock_item_id = v_art;
  v_esiti := v_esiti || format(E'A) primo acquisto (nessun medio di partenza) -> rincari %s (atteso 0)\n', v_n);

  -- B) +10%: sotto la soglia del 15% -> niente.
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 10, 11, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 10 where id = v_art;
  select count(*) into v_n from public.warehouse_rincari where stock_item_id = v_art;
  v_esiti := v_esiti || format(E'B) +10%% (sotto il 15%%) -> rincari %s (atteso 0)\n', v_n);

  -- C) +60% ma su 1 pezzo: 6 EUR di spesa in piu', sotto i 50 -> niente.
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 1, 16.09, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 1 where id = v_art;
  select count(*) into v_n from public.warehouse_rincari where stock_item_id = v_art;
  v_esiti := v_esiti || format(E'C) +60%% su 1 pz (6 EUR in piu'', sotto i 50) -> rincari %s (atteso 0)\n', v_n);

  -- D) +60% su 50 pezzi: oltre entrambe le soglie -> rincaro annotato.
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 50, 16.09, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 50 where id = v_art;
  select count(*), max(scostamento_perc), max(spesa_in_piu), max(medio_prima), max(prezzo_pagato)
    into v_n, v_perc, v_spesa, v_prima, v_pagato
    from public.warehouse_rincari where stock_item_id = v_art;
  v_esiti := v_esiti || format(E'D) +60%% su 50 pz -> rincari %s (atteso 1): medio prima %s, pagato %s, +%s%%, %s EUR in piu''\n',
    v_n, v_prima, v_pagato, v_perc, v_spesa);

  -- E) spento: non annota piu'.
  update public.company_governance_settings set rincaro_acquisti_enabled = false where company_id = v_company;
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
  values (v_art, 'carico', 50, 99, v_user, v_company, v_wh);
  update public.warehouse_stock set quantity = quantity + 50 where id = v_art;
  select count(*) into v_n from public.warehouse_rincari where stock_item_id = v_art;
  v_esiti := v_esiti || format(E'E) interruttore spento, carico a 99 EUR -> rincari %s (atteso 1, invariato)\n', v_n);
  update public.company_governance_settings set rincaro_acquisti_enabled = true where company_id = v_company;

  -- F) l'avviso: uno solo, col mese nella chiave.
  perform public.magazzino_rincari_avvisa(v_company);
  perform public.magazzino_rincari_avvisa(v_company);
  select count(*) into v_n from public.silvio_alerts
   where company_id = v_company and alert_type = 'rincaro_acquisti' and status = 'open';
  select title, message, dedup_key, severity into v_titolo, v_msg, v_chiave, v_sev from public.silvio_alerts
   where company_id = v_company and alert_type = 'rincaro_acquisti' and status = 'open' limit 1;
  v_esiti := v_esiti || format(E'F) due giri di avviso -> avvisi aperti %s (atteso 1)\n   chiave: %s · %s\n   «%s»\n   «%s»\n',
    v_n, v_chiave, v_sev, v_titolo, v_msg);

  -- G) la regola da sola, casi limite
  v_esiti := v_esiti || format(E'G) regola: medio 0 -> %s (atteso f); prezzo 0 -> %s (atteso f); qta 0 -> %s (atteso f); soglia 0 e +1 centesimo su 10000 pz -> %s (atteso t)\n',
    public.magazzino_e_rincaro(0, 20, 10, 15, 50),
    public.magazzino_e_rincaro(10, 0, 10, 15, 50),
    public.magazzino_e_rincaro(10, 20, 0, 15, 50),
    public.magazzino_e_rincaro(10, 10.01, 10000, 0, 50));

  -- H) l'andamento del prezzo sulla scheda
  select count(*) into v_n from public.magazzino_andamento_prezzo(v_art);
  v_esiti := v_esiti || format(E'H) andamento del prezzo -> %s carichi valorizzati (atteso 5), di cui rincari %s (atteso 1)\n',
    v_n, (select count(*) from public.magazzino_andamento_prezzo(v_art) where e_rincaro));

  -- I) due carichi valorizzati in UN SOLO insert: ognuno deve avere il SUO medio
  -- di prima. Si parte da una scheda pulita per avere numeri tondi.
  declare
    v_art2 uuid; v_m1 numeric; v_m2 numeric; v_p1 numeric; v_p2 numeric;
  begin
    insert into public.warehouse_stock (company_id, warehouse_id, name, quantity, unit_cost)
    values (v_company, v_wh, 'PROVA due carichi in un insert', 0, 0) returning id into v_art2;
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
    values (v_art2, 'carico', 10, 10, v_user, v_company, v_wh);
    update public.warehouse_stock set quantity = 10 where id = v_art2;

    -- 10 pz a 20 e 10 pz a 30, nello stesso statement.
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, performed_by, company_id, warehouse_id)
    values (v_art2, 'carico', 10, 20, v_user, v_company, v_wh),
           (v_art2, 'carico', 10, 30, v_user, v_company, v_wh);
    update public.warehouse_stock set quantity = quantity + 20 where id = v_art2;

    select medio_prima, unit_cost into v_m1, v_p1 from public.warehouse_movements
     where stock_item_id = v_art2 and unit_cost = 20;
    select medio_prima, unit_cost into v_m2, v_p2 from public.warehouse_movements
     where stock_item_id = v_art2 and unit_cost = 30;
    v_esiti := v_esiti || format(E'I) insert a due righe -> il carico a %s ha medio di prima %s (atteso 10), quello a %s ha %s (atteso 15)\n',
      v_p1, v_m1, v_p2, v_m2);
  end;

  raise exception E'\n%\n', v_esiti;
end $$;
