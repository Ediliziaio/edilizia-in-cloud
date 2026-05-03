-- MP-CG audit P2.12 — Seed dati di demo per la company "Demo Azienda S.r.l."
-- (id 778a2c76-1253-49f2-a5e8-283363ac3e29).
--
-- Popola: 5 cespiti, 1 patrimonio_netto, 3 scenari piano industriale,
-- 5 voci di classificazione costi extra. In modo che il modulo CG mostri
-- subito numeri sensati invece di soli zeri.
--
-- Idempotente: usa ON CONFLICT/WHERE NOT EXISTS per evitare doppi insert.

DO $$
DECLARE
  v_demo uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29';
  v_anno int := extract(year FROM current_date)::int;
BEGIN
  -- ── CESPITI ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.cespiti WHERE company_id = v_demo) THEN
    INSERT INTO public.cespiti (company_id, descrizione, categoria, sottocategoria,
                                data_acquisto, costo_storico, fondo_amm, aliquota_amm)
    VALUES
      (v_demo, 'Capannone Via Verdi 12', 'materiale', 'fabbricati',
       make_date(v_anno - 5, 3, 15), 280000, 28000, 3.00),
      (v_demo, 'Escavatore CAT 320', 'materiale', 'macchinari',
       make_date(v_anno - 3, 6, 20), 95000, 28500, 15.00),
      (v_demo, 'Furgone Iveco Daily', 'materiale', 'automezzi',
       make_date(v_anno - 2, 1, 10), 38000, 15200, 25.00),
      (v_demo, 'Ponteggi modulari Marcegaglia', 'materiale', 'attrezzature',
       make_date(v_anno - 4, 9, 5), 22000, 8800, 12.00),
      (v_demo, 'Software gestionale (licenza pluriennale)', 'immateriale', 'software',
       make_date(v_anno - 1, 4, 1), 6000, 2000, 33.33);
  END IF;

  -- ── PATRIMONIO NETTO ─────────────────────────────────────────────────────
  INSERT INTO public.patrimonio_netto (
    company_id, esercizio,
    capitale_sociale, riserva_legale, riserva_straordinaria, altre_riserve,
    utili_perdite_a_nuovo, utile_perdita_esercizio,
    fondo_tfr, fondo_rischi, altri_fondi,
    fonte, note
  ) VALUES (
    v_demo, v_anno,
    100000, 20000, 35000, 5000,
    45000, 0,
    28000, 5000, 0,
    'wizard', 'Seed dati demo per anteprima modulo CG'
  )
  ON CONFLICT (company_id, esercizio) DO NOTHING;

  -- Patrimonio anno precedente (per confronti multi-anno)
  INSERT INTO public.patrimonio_netto (
    company_id, esercizio,
    capitale_sociale, riserva_legale, riserva_straordinaria, altre_riserve,
    utili_perdite_a_nuovo, utile_perdita_esercizio,
    fondo_tfr, fondo_rischi, altri_fondi,
    fonte
  ) VALUES (
    v_demo, v_anno - 1,
    100000, 18000, 30000, 4000,
    35000, 22000,
    25000, 4000, 0,
    'wizard'
  )
  ON CONFLICT (company_id, esercizio) DO NOTHING;

  -- ── SCENARI PIANO INDUSTRIALE ────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.piano_industriale_assumptions WHERE company_id = v_demo
  ) THEN
    INSERT INTO public.piano_industriale_assumptions (
      company_id, scenario, anno_partenza, orizzonte_anni,
      crescita_ricavi_pct, margine_target_pct, crescita_costi_fissi_pct,
      investimenti, delta_costo_personale, nuovo_debito_mlt,
      tasso_debito_pct, aliquota_imposte_pct, is_default
    ) VALUES
      (v_demo, 'prudente', v_anno - 1, 5,
       ARRAY[3,3,3,3,3]::numeric(5,2)[], 12.00, ARRAY[2,2,2,2,2]::numeric(5,2)[],
       ARRAY[0,0,0,0,0]::numeric(14,2)[], ARRAY[0,0,0,0,0]::numeric(14,2)[],
       ARRAY[0,0,0,0,0]::numeric(14,2)[], 6.00, 27.50, false),

      (v_demo, 'base', v_anno - 1, 5,
       ARRAY[8,8,8,8,8]::numeric(5,2)[], 15.00, ARRAY[3,3,3,3,3]::numeric(5,2)[],
       ARRAY[50000,50000,50000,50000,50000]::numeric(14,2)[],
       ARRAY[35000,35000,40000,40000,45000]::numeric(14,2)[],
       ARRAY[0,0,0,0,0]::numeric(14,2)[], 6.00, 27.50, true),

      (v_demo, 'aggressivo', v_anno - 1, 5,
       ARRAY[22,18,15,12,10]::numeric(5,2)[], 18.00, ARRAY[5,5,5,5,5]::numeric(5,2)[],
       ARRAY[500000,200000,100000,100000,50000]::numeric(14,2)[],
       ARRAY[70000,80000,90000,100000,110000]::numeric(14,2)[],
       ARRAY[200000,0,0,0,0]::numeric(14,2)[], 7.50, 27.50, false);
  END IF;

  -- ── COMPANY_COSTS demo (per popolare CE riclassificato) ──────────────────
  -- Aggiungiamo ~20 voci di costo distribuite negli ultimi 12 mesi
  -- per mostrare il CE con dati realistici.
  IF (SELECT count(*) FROM public.company_costs WHERE company_id = v_demo) < 20 THEN
    INSERT INTO public.company_costs (company_id, name, cost_type, amount, due_date, paid_date, is_paid, category)
    VALUES
      (v_demo, 'Stipendio operai marzo',     'variable', 12500, make_date(v_anno, 03, 31), make_date(v_anno, 03, 31), true, 'stipendi'),
      (v_demo, 'Stipendio operai aprile',    'variable', 12800, make_date(v_anno, 04, 30), make_date(v_anno, 04, 30), true, 'stipendi'),
      (v_demo, 'INPS contributi Q1',         'variable',  5400, make_date(v_anno, 04, 16), make_date(v_anno, 04, 16), true, 'INPS'),
      (v_demo, 'INAIL premio annuo',         'variable',  2200, make_date(v_anno, 02, 15), make_date(v_anno, 02, 15), true, 'INAIL'),
      (v_demo, 'TFR accantonamento Q1',      'variable',  3100, make_date(v_anno, 03, 31), NULL,                       false,'TFR'),
      (v_demo, 'Acquisto laterizi cantiere Rossi','variable', 8500, make_date(v_anno, 02, 20), make_date(v_anno, 02, 25), true,'merci'),
      (v_demo, 'Subappalto idraulica Verdi', 'variable', 14000, make_date(v_anno, 03, 15), make_date(v_anno, 03, 20), true, 'subappalti'),
      (v_demo, 'Subappalto elettrico Bianchi','variable', 9500, make_date(v_anno, 04, 10), make_date(v_anno, 04, 15), true, 'subappalti'),
      (v_demo, 'Manutenzione escavatore',    'variable',  1800, make_date(v_anno, 03, 22), make_date(v_anno, 03, 25), true, 'manutenzione'),
      (v_demo, 'Carburante furgoni',         'fixed',     1200, make_date(v_anno, 04, 01), make_date(v_anno, 04, 05), true, 'carburante'),
      (v_demo, 'Affitto magazzino',          'fixed',     2500, make_date(v_anno, 04, 01), make_date(v_anno, 04, 01), true, 'affitti'),
      (v_demo, 'Commercialista parcella Q1', 'variable',  1500, make_date(v_anno, 04, 15), make_date(v_anno, 04, 15), true, 'commercialista'),
      (v_demo, 'Software gestionale licenza','fixed',     1200, make_date(v_anno, 01, 15), make_date(v_anno, 01, 15), true, 'software'),
      (v_demo, 'F24 IRPEF dipendenti marzo', 'variable',  3200, make_date(v_anno, 04, 16), make_date(v_anno, 04, 16), true, 'f24'),
      (v_demo, 'F24 IRPEF dipendenti aprile','variable',  3300, make_date(v_anno, 05, 16), NULL,                       false,'f24'),
      (v_demo, 'Pubblicità social',          'variable',  1800, make_date(v_anno, 03, 10), make_date(v_anno, 03, 10), true, 'pubblicita'),
      (v_demo, 'Provvigioni venditori Q1',   'variable',  4200, make_date(v_anno, 04, 30), make_date(v_anno, 04, 30), true, 'provvigioni'),
      (v_demo, 'Interessi mutuo Q1',         'variable',  2400, make_date(v_anno, 03, 31), make_date(v_anno, 03, 31), true, 'interessi'),
      (v_demo, 'IMU acconto',                'variable',   850, make_date(v_anno, 06, 16), NULL,                       false,'imu'),
      (v_demo, 'Trasferte capocantiere',     'variable',   650, make_date(v_anno, 04, 15), make_date(v_anno, 04, 15), true, 'trasferte');
  END IF;
END $$;

-- Refresh materialized view per riflettere i nuovi dati
REFRESH MATERIALIZED VIEW public.mv_cg_storico_24m;
