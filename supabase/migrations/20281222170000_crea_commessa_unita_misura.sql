-- Creare una commessa: la riga porta con sé la sua unità di misura.
--
-- Fino a oggi una riga decimale del preventivo («Intonaco 12,5 m² × 34 €»)
-- entrava in commessa come «1 × 425 €», con la quantità vera solo nella
-- descrizione, perché order_items.quantity era intero. Dalle migrazioni
-- 20281222140000 e 20281222160000 la quantità ha i decimali e create_order_atomic
-- la accetta: ora la riga entra come 12,5. Ma create_order_atomic non scriveva
-- l'unità, e «12,5» senza unità per il resto del sistema vale 12,5 pezzi: il
-- confronto con gli ordini ai fornitori (in m²) la segnerebbe «unità diversa».
--
-- Qui create_order_atomic scrive anche order_items.unita_misura, quando la riga
-- la manda (chiave «unita_misura»). Chi non la manda resta com'era. Come in
-- 20281222160000 la funzione non si ricopia: si aggiunge un'istruzione subito
-- dopo l'unico «RETURNING id INTO v_item_id», e la migrazione si ferma se quel
-- punto non c'è o ce n'è più d'uno. Rieseguirla non fa niente.

do $migrazione$
declare
  def text;
  quanti integer;
begin
  def := pg_get_functiondef('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)'::regprocedure);
  if position('-- unita_misura della riga' in def) > 0 then
    return;
  end if;
  select count(*) into quanti from regexp_matches(def, 'RETURNING id INTO v_item_id;', 'g');
  if quanti <> 1 then
    raise exception 'create_order_atomic: atteso un solo «RETURNING id INTO v_item_id;», trovati %', quanti;
  end if;
  execute replace(def, 'RETURNING id INTO v_item_id;',
    'RETURNING id INTO v_item_id;' || E'\n\n'
    || '    -- unita_misura della riga (20281222170000): 12,5 m² resta in m².' || E'\n'
    || '    IF NULLIF(btrim(v_item->>''unita_misura''), '''') IS NOT NULL THEN' || E'\n'
    || '      UPDATE public.order_items SET unita_misura = btrim(v_item->>''unita_misura'') WHERE id = v_item_id;' || E'\n'
    || '    END IF;');
end
$migrazione$;
