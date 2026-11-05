-- Fatture e costi (02/11/2026): l'elenco delle uscite guardava solo il tipo del fornitore, che quasi nessuno
-- ha compilato. Un noleggio inserito a mano finiva in «Costi extra», una fattura di noleggio fra i materiali
-- (133 costi con category = 'trasporti_noleggi'). Se il fornitore non ha un tipo, ora decide la categoria del
-- costo. Cambia il gruppo mostrato, non gli importi. Le regole in JS: tipoDellaCategoria (costoCommessa.ts).
set local lock_timeout = '3s';
set local statement_timeout = '60s';
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'commessa_quadro_pagamenti';
  IF position('c.category' IN def) > 0 THEN RETURN; END IF;
  def := replace(def, 's.name AS fornitore, s.tipo AS tipo_fornitore,', 's.name AS fornitore, s.tipo AS tipo_fornitore, c.category,');
  def := replace(def,
    $old$      WHEN c.tipo_fornitore = 'materiali' OR c.purchase_order_id IS NOT NULL THEN 'materiali'$old$,
    $new$      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) = 'subappalti' THEN 'subappalti'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) IN ('consulenze_professionali', 'progettazione', 'direzione lavori') THEN 'professionisti'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) ~ 'nolegg|noli|nolo' THEN 'noleggi'
      WHEN c.tipo_fornitore = 'materiali' OR c.purchase_order_id IS NOT NULL THEN 'materiali'$new$);
  IF position('c.category' IN def) = 0 OR position('nolegg|noli|nolo' IN def) = 0 THEN
    RAISE EXCEPTION 'commessa_quadro_pagamenti non ha la forma attesa: non la tocco';
  END IF;
  EXECUTE def;
END $$;
