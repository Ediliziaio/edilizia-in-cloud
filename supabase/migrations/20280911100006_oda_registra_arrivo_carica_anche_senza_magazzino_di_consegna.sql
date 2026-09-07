-- Applicata in produzione il 7 settembre 2026 via MCP.
--
-- `oda_registra_arrivo` caricava la giacenza solo quando le veniva passato un
-- magazzino: `IF v_stock_item_id IS NOT NULL AND p_warehouse_id IS NOT NULL`.
-- Il foglio «arrivo merce» glielo passa, quindi da li' funziona. Ma il vecchio
-- percorso — segnare l'ordine come «ricevuto» dalla scheda — non ce l'ha: in
-- produzione TUTTI gli 86 ordini a fornitore hanno `delivery_warehouse_id`
-- nullo. Instradare quel percorso sulla funzione senza toccarla avrebbe smesso
-- di caricare il magazzino per ogni ordine esistente.
--
-- L'articolo un magazzino ce l'ha gia': se l'ordine non lo dice, si usa quello
-- dell'articolo. Cosi' la funzione regge entrambi i percorsi e nessuno dei due
-- perde il carico.
--
-- La sostituzione e' mirata dentro la definizione viva invece di reincollare
-- 7.000 caratteri: se una delle due righe attese non c'e' piu', la migrazione
-- si ferma invece di sovrascrivere una funzione che nel frattempo e' cambiata.
--
-- Provata su un ordine vero in transazione annullata, SENZA magazzino di
-- consegna: giacenza 249 -> 406 (+157, il residuo esatto), movimenti 2 -> 5,
-- ordine da «bozza» a «ricevuto», una bolla di ricezione creata, e i movimenti
-- portano il magazzino dell'articolo invece di NULL.
do $$
declare
  v_def text;
  v_da  text;
  v_a   text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'oda_registra_arrivo';
  if v_def is null then
    raise exception 'oda_registra_arrivo non trovata';
  end if;

  -- 1. La condizione: basta che la riga sia abbinata a un articolo.
  v_da := 'IF v_stock_item_id IS NOT NULL AND p_warehouse_id IS NOT NULL THEN';
  v_a  := 'IF v_stock_item_id IS NOT NULL THEN';
  if position(v_da in v_def) = 0 then
    raise exception 'la condizione attesa non c''e'' piu'': la funzione e'' cambiata, non la tocco';
  end if;
  v_def := replace(v_def, v_da, v_a);

  -- 2. Il movimento eredita il magazzino dell'articolo quando l'ordine non ne
  --    indica uno.
  v_da := 'auth.uid(), v_company_id, p_warehouse_id,';
  v_a  := 'auth.uid(), v_company_id,'
       || ' coalesce(p_warehouse_id, (select ws2.warehouse_id from public.warehouse_stock ws2 where ws2.id = v_stock_item_id)),';
  if position(v_da in v_def) = 0 then
    raise exception 'la riga del movimento non e'' quella attesa: non la tocco';
  end if;
  v_def := replace(v_def, v_da, v_a);

  execute v_def;
end $$;
