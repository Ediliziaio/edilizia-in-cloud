-- ════════════════════════════════════════════════════════════════════════════
-- Seed listino ZANZARIERE per Ke Bei Serramenti
-- ────────────────────────────────────────────────────────────────────────────
-- Fonte: PDF "LISTINO ZANZA + AVVOLGIBILI.pdf" (fornitore ZANZAR)
-- Ricarico azienda: 100% sul costo fornitore (prezzo_vendita = costo × 2)
-- Maggiorazione "Effetto legno" (asse): +40% sul prezzo vendita base
-- Minimi fatturazione: 1,5 mq per finestre, 2 mq per porte
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company_id uuid;
  v_macrocat_id uuid;
  v_categoria_id uuid;
  v_family_id uuid;
  v_axis_id uuid;
BEGIN
  -- 1) Trova company Ke Bei Serramenti (stesso pattern del seed PIU' LUCE)
  SELECT id INTO v_company_id
    FROM public.companies
   WHERE LOWER(name) LIKE '%ke bei%'
      OR LOWER(name) LIKE '%kebei%'
      OR LOWER(REPLACE(name, ' ', '')) LIKE '%kebei%'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Company "Ke Bei Serramenti" non trovata — seed zanzariere skipped (idempotente).';
    RETURN;
  END IF;
  RAISE NOTICE 'Company Ke Bei id = %', v_company_id;

  -- 2) Macrocategoria ZANZARIERE
  INSERT INTO public.listino_macrocategorie (company_id, nome, descrizione, icona, sort_order, attivo)
    VALUES (v_company_id, 'ZANZARIERE',
            'Zanzariere ZANZAR — finestre e porte. Prezzi €/mq, ricarico 100% su costo fornitore.',
            'shield', 200, true)
    ON CONFLICT (company_id, nome) DO UPDATE SET descrizione = EXCLUDED.descrizione
    RETURNING id INTO v_macrocat_id;
  RAISE NOTICE 'Macrocategoria ZANZARIERE id = %', v_macrocat_id;

  -- 3) Categoria padre (per backward compat con listino_categorie)
  INSERT INTO public.listino_categorie (company_id, macrocategoria_id, nome, sort_order)
    VALUES (v_company_id, v_macrocat_id, 'ZANZARIERE — ZANZAR', 10)
    ON CONFLICT (company_id, nome) DO UPDATE SET macrocategoria_id = EXCLUDED.macrocategoria_id
    RETURNING id INTO v_categoria_id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4) Family 1 — Zanzariera Verticale con Frizione · Installazione Libera
  --    Costo fornitore: 37,40 €/mq → Vendita: 74,80 €/mq
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Verticale con Frizione · Libera';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Verticale con Frizione · Libera',
      'Zanzariera ZANZAR a scorrimento verticale con frizione, installazione libera. Minimo fatturazione 1,5 mq al pezzo.',
      'mq', 22, 'mq',
      37.40, 74.80,
      10, true
    ) RETURNING id INTO v_family_id;

    -- Asse "Effetto Legno" (+40% sul vendita)
    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 5) Family 2 — Zanzariera Verticale · Installazione Incasso
  --    Costo: 42,00 €/mq → Vendita: 84,00 €/mq
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Verticale · Incasso';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Verticale · Incasso',
      'Zanzariera ZANZAR verticale, installazione a incasso. Minimo fatturazione 1,5 mq al pezzo.',
      'mq', 22, 'mq',
      42.00, 84.00,
      20, true
    ) RETURNING id INTO v_family_id;

    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 6) Family 3 — Zanzariera Verticale con Frizione · Installazione Incasso
  --    Costo: 52,10 €/mq → Vendita: 104,20 €/mq
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Verticale con Frizione · Incasso';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Verticale con Frizione · Incasso',
      'Zanzariera ZANZAR verticale con frizione, installazione a incasso. Minimo fatturazione 1,5 mq al pezzo.',
      'mq', 22, 'mq',
      52.10, 104.20,
      30, true
    ) RETURNING id INTO v_family_id;

    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 7) Family 4 — Zanzariera Porta · Luce 1600 · Laterali Carroarmato · Libera
  --    Costo: 60,90 €/mq → Vendita: 121,80 €/mq · Min. 2 mq al pezzo
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Porta Luce Max 1600 · Libera';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Porta Luce Max 1600 · Libera',
      'Zanzariera ZANZAR per porta, luce max 1600 mm, laterali con carroarmato, installazione libera. Minimo fatturazione 2 mq al pezzo.',
      'mq', 22, 'mq',
      60.90, 121.80,
      40, true
    ) RETURNING id INTO v_family_id;

    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 8) Family 5 — Zanzariera Porta · Luce 1600 · Laterali Carroarmato · Incasso
  --    Costo: 71,40 €/mq → Vendita: 142,80 €/mq
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Porta Luce Max 1600 · Incasso';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Porta Luce Max 1600 · Incasso',
      'Zanzariera ZANZAR per porta, luce max 1600 mm, laterali con carroarmato, installazione a incasso. Minimo fatturazione 2 mq al pezzo.',
      'mq', 22, 'mq',
      71.40, 142.80,
      50, true
    ) RETURNING id INTO v_family_id;

    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 9) Family 6 — Zanzariera Porta · Luce 2000 · Laterali Carroarmato · Libera
  --    Costo: 66,36 €/mq → Vendita: 132,72 €/mq
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Porta Luce Max 2000 · Libera';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Porta Luce Max 2000 · Libera',
      'Zanzariera ZANZAR per porta, luce max 2000 mm, laterali con carroarmato, installazione libera. Minimo fatturazione 2 mq al pezzo.',
      'mq', 22, 'mq',
      66.36, 132.72,
      60, true
    ) RETURNING id INTO v_family_id;

    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 10) Family 7 — Zanzariera Porta · Luce 2000 · Laterali Carroarmato · Incasso
  --     Costo: 72,66 €/mq → Vendita: 145,32 €/mq
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Zanzariera Porta Luce Max 2000 · Incasso';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Zanzariera Porta Luce Max 2000 · Incasso',
      'Zanzariera ZANZAR per porta, luce max 2000 mm, laterali con carroarmato, installazione a incasso. Minimo fatturazione 2 mq al pezzo.',
      'mq', 22, 'mq',
      72.66, 145.32,
      70, true
    ) RETURNING id INTO v_family_id;

    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Effetto Legno', 'effetto_legno', 'Finitura speciale effetto legno (+40%)', 'discrete', false, 0)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, sort_order, attivo)
    VALUES
      (v_axis_id, v_company_id, 'no',  'Standard', true,  'none', 0,  0, true),
      (v_axis_id, v_company_id, 'si',  'Effetto legno (+40%)', false, 'percentuale', 40, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 11) Tariffe specifiche zanzariere (posa + trasporto)
  --     Costo fornitore POSA: 40/pos · Vendita: 80/pos
  --     Costo TRASPORTO: 20 · Vendita: 40
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO public.tariffe_aziendali (
    company_id, tipo, nome, descrizione, unita,
    prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order
  )
  SELECT v_company_id, 'posa', 'Posa Zanzariera',
         'Costo posa zanzariera a posizione (fornitore ZANZAR €40 → ricarico 100%)',
         'pz', 40.00, 80.00, 'zanzariere', true, 100
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tariffe_aziendali
    WHERE company_id = v_company_id AND nome = 'Posa Zanzariera'
  );

  INSERT INTO public.tariffe_aziendali (
    company_id, tipo, nome, descrizione, unita,
    prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order
  )
  SELECT v_company_id, 'trasporto', 'Trasporto Zanzariere',
         'Trasporto a consegna zanzariere (fornitore ZANZAR €20 → ricarico 100%)',
         'fisso', 20.00, 40.00, 'zanzariere', true, 110
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tariffe_aziendali
    WHERE company_id = v_company_id AND nome = 'Trasporto Zanzariere'
  );

  RAISE NOTICE 'Seed ZANZARIERE Ke Bei completato: 7 famiglie + 2 tariffe.';
END $$;

NOTIFY pgrst, 'reload schema';
