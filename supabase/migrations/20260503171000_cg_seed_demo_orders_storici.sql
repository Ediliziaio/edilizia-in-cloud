-- MP-CG audit — Seed orders storici 2024 e 2025 per Demo Azienda
-- (id 778a2c76-1253-49f2-a5e8-283363ac3e29).
--
-- Idempotente: filtra su `description LIKE '[CG-DEMO-%]%'` per non duplicare.

DO $$
DECLARE
  v_demo uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29';
  v_anno_pp   int := extract(year FROM current_date)::int - 2;  -- 2024
  v_anno_prec int := extract(year FROM current_date)::int - 1;  -- 2025
  v_cust1 uuid := '88bf5e15-57db-4961-9570-a98a4d737f8f';
  v_cust2 uuid := '52928c2b-c970-4996-b221-1ca3e0ebc798';
  v_cust3 uuid := '0e56074a-0a1b-43e8-b831-6dee5817b0f5';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_demo) THEN
    RAISE NOTICE 'Demo Azienda % non presente: seed ordini CG storici saltato', v_demo;
    RETURN;
  END IF;

  -- ── 2024 — "Azienda solida" ───────────────────────────────────────────
  -- Ricavi totali ~280.000 € con margine alto (pochi costi)
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE company_id = v_demo
    AND description LIKE '[CG-DEMO-2024]%'
  ) THEN
    INSERT INTO public.orders (company_id, description, total_amount, vat_rate, customer_id, created_at, status)
    VALUES
      (v_demo, '[CG-DEMO-2024] Ristrutturazione villa Verdi',     85000, 22, v_cust1, make_date(v_anno_pp, 2,  10), 'active'),
      (v_demo, '[CG-DEMO-2024] Cappotto termico Bianchi',         42000, 22, v_cust2, make_date(v_anno_pp, 4,  20), 'active'),
      (v_demo, '[CG-DEMO-2024] Manutenzione condominio Roma',     18500, 22, v_cust3, make_date(v_anno_pp, 5,  15), 'active'),
      (v_demo, '[CG-DEMO-2024] Tetto nuova lottizzazione',        62000, 22, v_cust1, make_date(v_anno_pp, 7,   8), 'active'),
      (v_demo, '[CG-DEMO-2024] Impianto fotovoltaico residenziale', 24000, 22, v_cust2, make_date(v_anno_pp, 9, 25), 'active'),
      (v_demo, '[CG-DEMO-2024] Bagni e cucina villetta',          28000, 22, v_cust3, make_date(v_anno_pp,11,  12), 'active'),
      (v_demo, '[CG-DEMO-2024] Facciata palazzo storico',         32000, 22, v_cust1, make_date(v_anno_pp,12,   3), 'active');
  END IF;

  -- ── 2025 — "Anno di transizione" ──────────────────────────────────────
  -- Ricavi totali ~360.000 € con costi più alti (investimenti)
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE company_id = v_demo
    AND description LIKE '[CG-DEMO-2025]%'
  ) THEN
    INSERT INTO public.orders (company_id, description, total_amount, vat_rate, customer_id, created_at, status)
    VALUES
      (v_demo, '[CG-DEMO-2025] Ampliamento azienda agricola',     95000, 22, v_cust1, make_date(v_anno_prec, 1,  20), 'active'),
      (v_demo, '[CG-DEMO-2025] Ristrutturazione casa via Verdi',  68000, 22, v_cust2, make_date(v_anno_prec, 3,  10), 'active'),
      (v_demo, '[CG-DEMO-2025] Cappotto trifamiliare',            48000, 22, v_cust3, make_date(v_anno_prec, 5,  18), 'active'),
      (v_demo, '[CG-DEMO-2025] Tetto + grondaie capannone',       35000, 22, v_cust1, make_date(v_anno_prec, 7,   2), 'active'),
      (v_demo, '[CG-DEMO-2025] Manutenzione straordinaria scuola', 52000, 22, v_cust2, make_date(v_anno_prec, 9,  15), 'active'),
      (v_demo, '[CG-DEMO-2025] Impianto fv condominio',           38000, 22, v_cust3, make_date(v_anno_prec,10,   8), 'active'),
      (v_demo, '[CG-DEMO-2025] Restauro chiesa parrocchiale',     24000, 22, v_cust1, make_date(v_anno_prec,12,  20), 'active');
  END IF;
END $$;

REFRESH MATERIALIZED VIEW public.mv_cg_storico_24m;
