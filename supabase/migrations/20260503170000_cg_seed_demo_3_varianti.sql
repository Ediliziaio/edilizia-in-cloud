-- MP-CG audit — Seed BETA TEST 3 VARIANTI per Demo Azienda S.r.l.
-- (id 778a2c76-1253-49f2-a5e8-283363ac3e29).
--
-- Mostra il modulo CG con tre profili aziendali distinti, navigabili dal
-- selettore Anno della FilterBar:
--   • 2024 — "Azienda solida"      → Rating A/AA, MOL alto, debiti bassi
--   • 2025 — "Anno di transizione" → Rating BBB,  investimenti, MOL stabile
--   • 2026 — "Anno corrente"       → dati già seedati in precedente migration
--
-- Idempotente: NON tocca i dati 2026 esistenti, aggiunge solo 2024 e 2025.

DO $$
DECLARE
  v_demo uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29';
  v_anno_corr int := extract(year FROM current_date)::int;
  v_anno_prec int := v_anno_corr - 1;
  v_anno_pp   int := v_anno_corr - 2;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_demo) THEN
    RAISE NOTICE 'Demo Azienda % non presente: seed CG 3 varianti saltato', v_demo;
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- VARIANTE 1: anno -2 (2024) — Azienda solida
  -- Profilo: alta marginalità, debito basso, riserve consistenti
  -- ════════════════════════════════════════════════════════════════════════

  -- Patrimonio netto (alta capitalizzazione)
  INSERT INTO public.patrimonio_netto (
    company_id, esercizio,
    capitale_sociale, riserva_legale, riserva_straordinaria, altre_riserve,
    utili_perdite_a_nuovo, utile_perdita_esercizio,
    fondo_tfr, fondo_rischi, altri_fondi,
    fonte, note
  ) VALUES (
    v_demo, v_anno_pp,
    100000, 16000, 28000, 4000,
    20000, 35000,    -- utile esercizio elevato
    22000, 3000, 0,
    'wizard', 'Variante BETA "Azienda solida" — alta marginalità, debito basso'
  ) ON CONFLICT (company_id, esercizio) DO NOTHING;

  -- Costi 2024 — pochi e contenuti (azienda con buona marginalità)
  IF NOT EXISTS (
    SELECT 1 FROM public.company_costs
    WHERE company_id = v_demo
      AND extract(year FROM COALESCE(paid_date, due_date)) = v_anno_pp
      AND notes = 'beta-variante-solida'
  ) THEN
    INSERT INTO public.company_costs (company_id, name, cost_type, amount, due_date, paid_date, is_paid, category, notes)
    VALUES
      (v_demo, '[2024] Stipendi Q1', 'fixed', 32000, make_date(v_anno_pp, 3, 31), make_date(v_anno_pp, 3, 31), true, 'stipendi', 'beta-variante-solida'),
      (v_demo, '[2024] Stipendi Q2', 'fixed', 33000, make_date(v_anno_pp, 6, 30), make_date(v_anno_pp, 6, 30), true, 'stipendi', 'beta-variante-solida'),
      (v_demo, '[2024] Stipendi Q3', 'fixed', 34000, make_date(v_anno_pp, 9, 30), make_date(v_anno_pp, 9, 30), true, 'stipendi', 'beta-variante-solida'),
      (v_demo, '[2024] Stipendi Q4', 'fixed', 35000, make_date(v_anno_pp,12, 31), make_date(v_anno_pp,12, 31), true, 'stipendi', 'beta-variante-solida'),
      (v_demo, '[2024] INPS annuali', 'fixed', 18000, make_date(v_anno_pp, 4, 16), make_date(v_anno_pp, 4, 16), true, 'INPS', 'beta-variante-solida'),
      (v_demo, '[2024] Materie prime', 'variable', 24000, make_date(v_anno_pp, 5, 15), make_date(v_anno_pp, 5, 20), true, 'merci', 'beta-variante-solida'),
      (v_demo, '[2024] Subappalti',    'variable', 18000, make_date(v_anno_pp, 7, 10), make_date(v_anno_pp, 7, 15), true, 'subappalti', 'beta-variante-solida'),
      (v_demo, '[2024] Affitti',       'fixed',    24000, make_date(v_anno_pp, 1, 1),  make_date(v_anno_pp, 1, 1),  true, 'affitti', 'beta-variante-solida'),
      (v_demo, '[2024] Commercialista','fixed',     5000, make_date(v_anno_pp, 1, 1),  make_date(v_anno_pp, 1, 1),  true, 'commercialista', 'beta-variante-solida'),
      (v_demo, '[2024] Interessi mutuo','fixed',    3500, make_date(v_anno_pp,12, 31), make_date(v_anno_pp,12, 31), true, 'interessi', 'beta-variante-solida');
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- VARIANTE 2: anno -1 (2025) — Anno di transizione
  -- Profilo: investimenti significativi, MOL stabile, indebitamento crescente
  -- ════════════════════════════════════════════════════════════════════════

  INSERT INTO public.patrimonio_netto (
    company_id, esercizio,
    capitale_sociale, riserva_legale, riserva_straordinaria, altre_riserve,
    utili_perdite_a_nuovo, utile_perdita_esercizio,
    fondo_tfr, fondo_rischi, altri_fondi,
    fonte, note
  ) VALUES (
    v_demo, v_anno_prec,
    100000, 18000, 30000, 4000,
    35000, 22000,
    25000, 4000, 0,
    'wizard', 'Variante BETA "Anno di transizione" — investimenti, MOL stabile'
  ) ON CONFLICT (company_id, esercizio) DO NOTHING;

  -- Costi 2025 — più alti (investimenti, espansione)
  IF NOT EXISTS (
    SELECT 1 FROM public.company_costs
    WHERE company_id = v_demo
      AND extract(year FROM COALESCE(paid_date, due_date)) = v_anno_prec
      AND notes = 'beta-variante-transizione'
  ) THEN
    INSERT INTO public.company_costs (company_id, name, cost_type, amount, due_date, paid_date, is_paid, category, notes)
    VALUES
      (v_demo, '[2025] Stipendi Q1', 'fixed', 38000, make_date(v_anno_prec, 3, 31), make_date(v_anno_prec, 3, 31), true, 'stipendi', 'beta-variante-transizione'),
      (v_demo, '[2025] Stipendi Q2', 'fixed', 40000, make_date(v_anno_prec, 6, 30), make_date(v_anno_prec, 6, 30), true, 'stipendi', 'beta-variante-transizione'),
      (v_demo, '[2025] Stipendi Q3', 'fixed', 42000, make_date(v_anno_prec, 9, 30), make_date(v_anno_prec, 9, 30), true, 'stipendi', 'beta-variante-transizione'),
      (v_demo, '[2025] Stipendi Q4', 'fixed', 44000, make_date(v_anno_prec,12, 31), make_date(v_anno_prec,12, 31), true, 'stipendi', 'beta-variante-transizione'),
      (v_demo, '[2025] INPS annuali', 'fixed', 22000, make_date(v_anno_prec, 4, 16), make_date(v_anno_prec, 4, 16), true, 'INPS', 'beta-variante-transizione'),
      (v_demo, '[2025] Materie prime', 'variable', 38000, make_date(v_anno_prec, 5, 15), make_date(v_anno_prec, 5, 20), true, 'merci', 'beta-variante-transizione'),
      (v_demo, '[2025] Subappalti',    'variable', 32000, make_date(v_anno_prec, 7, 10), make_date(v_anno_prec, 7, 15), true, 'subappalti', 'beta-variante-transizione'),
      (v_demo, '[2025] Marketing digitale','fixed', 12000, make_date(v_anno_prec, 6, 1), make_date(v_anno_prec, 6, 1), true, 'marketing', 'beta-variante-transizione'),
      (v_demo, '[2025] Affitti',       'fixed',    28000, make_date(v_anno_prec, 1, 1),  make_date(v_anno_prec, 1, 1),  true, 'affitti', 'beta-variante-transizione'),
      (v_demo, '[2025] Commercialista','fixed',     6000, make_date(v_anno_prec, 1, 1),  make_date(v_anno_prec, 1, 1),  true, 'commercialista', 'beta-variante-transizione'),
      (v_demo, '[2025] Interessi mutuo','fixed',    8500, make_date(v_anno_prec,12, 31), make_date(v_anno_prec,12, 31), true, 'interessi', 'beta-variante-transizione'),
      (v_demo, '[2025] Manutenzione macchinari','variable', 14000, make_date(v_anno_prec, 8, 15), make_date(v_anno_prec, 8, 20), true, 'manutenzione', 'beta-variante-transizione');
  END IF;

  -- Cespiti aggiuntivi 2025 (acquisto durante l'anno di transizione)
  IF NOT EXISTS (
    SELECT 1 FROM public.cespiti
    WHERE company_id = v_demo AND descrizione LIKE '[2025]%'
  ) THEN
    INSERT INTO public.cespiti (company_id, descrizione, categoria, sottocategoria,
                                data_acquisto, costo_storico, fondo_amm, aliquota_amm)
    VALUES
      (v_demo, '[2025] Nuovo capannone laterale', 'materiale', 'fabbricati',
       make_date(v_anno_prec, 4, 15), 180000, 9000, 3.00),
      (v_demo, '[2025] Mini-pala compatta CAT', 'materiale', 'macchinari',
       make_date(v_anno_prec, 9, 1), 45000, 6750, 15.00);
  END IF;

  -- Refresh storico per riflettere il seed
  REFRESH MATERIALIZED VIEW public.mv_cg_storico_24m;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Annotazione: scenari piano industriale già seedati nella prima migration.
-- L'utente switcha le 3 varianti via il filtro Anno (2024/2025/2026) della
-- FilterBar — ogni anno ha un profilo finanziario distinto.
-- ════════════════════════════════════════════════════════════════════════════
