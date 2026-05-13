-- ════════════════════════════════════════════════════════════════════════════
-- Seed listino AVVOLGIBILI (TAPPARELLE) per Ke Bei Serramenti
-- ────────────────────────────────────────────────────────────────────────────
-- Fonte: PDF "LISTINO ZANZA + AVVOLGIBILI.pdf" (fornitore CTS)
-- Ricarico azienda: 100% sul costo fornitore (prezzo_vendita = costo × 2)
-- Modello: PA55DS Avvolgibile in alluminio coibentato (tutti i gruppi colore)
-- Modalità: 'mq' base + accessori a posizione/pezzo (guide, kit, motore)
-- Minimo fatturazione: 1,5 mq al pezzo
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company_id uuid;
  v_macrocat_id uuid;
  v_categoria_id uuid;
  v_family_id uuid;
  v_axis_id uuid;
BEGIN
  -- 1) Company Ke Bei
  SELECT id INTO v_company_id
    FROM public.companies
   WHERE LOWER(name) LIKE '%ke bei%'
      OR LOWER(name) LIKE '%kebei%'
      OR LOWER(REPLACE(name, ' ', '')) LIKE '%kebei%'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Company "Ke Bei Serramenti" non trovata — seed avvolgibili skipped.';
    RETURN;
  END IF;

  -- 2) Macrocategoria AVVOLGIBILI (TAPPARELLE)
  INSERT INTO public.listino_macrocategorie (company_id, nome, descrizione, icona, sort_order, attivo)
    VALUES (v_company_id, 'AVVOLGIBILI',
            'Avvolgibili/tapparelle CTS — alluminio coibentato. Prezzi €/mq + accessori, ricarico 100% su costo fornitore.',
            'package', 210, true)
    ON CONFLICT (company_id, nome) DO UPDATE SET descrizione = EXCLUDED.descrizione
    RETURNING id INTO v_macrocat_id;

  -- 3) Categoria padre
  INSERT INTO public.listino_categorie (company_id, macrocategoria_id, nome, sort_order)
    VALUES (v_company_id, v_macrocat_id, 'AVVOLGIBILI — CTS', 10)
    ON CONFLICT (company_id, nome) DO UPDATE SET macrocategoria_id = EXCLUDED.macrocategoria_id
    RETURNING id INTO v_categoria_id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4) Family — Avvolgibile PA55DS Alluminio Coibentato
  --    Costo: 32,40 €/mq → Vendita: 64,80 €/mq
  --    Assi: tipo apertura (manuale/motorizzato) + guide laterali (sì/no)
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_family_id FROM public.article_families
   WHERE company_id = v_company_id AND nome = 'Avvolgibile PA55DS Alluminio Coibentato';

  IF v_family_id IS NULL THEN
    INSERT INTO public.article_families (
      company_id, vertical, categoria_id, macrocategoria_id, nome, descrizione,
      modalita_prezzo_base, vat_rate, unit_of_measure,
      prezzo_base_acquisto, prezzo_base_vendita,
      sort_order, attivo
    ) VALUES (
      v_company_id, 'serramenti', v_categoria_id, v_macrocat_id,
      'Avvolgibile PA55DS Alluminio Coibentato',
      'Avvolgibile CTS modello PA55DS in alluminio coibentato — tutti i gruppi colore. Prezzo telo al MQ; kit di apertura, motore e guide come accessori a posizione/pezzo. Minimo fatturazione 1,5 mq al pezzo.',
      'mq', 22, 'mq',
      32.40, 64.80,
      10, true
    ) RETURNING id INTO v_family_id;

    -- Asse: Tipo apertura (manuale / motore meccanico) — accessorio principale
    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Tipo apertura', 'tipo_apertura',
            'Kit di apertura: manuale con cintino o motorizzato meccanico.',
            'discrete', true, 0)
    RETURNING id INTO v_axis_id;
    -- Maggiorazione fisso_pz (€ a pezzo, non %): il kit ha costo fisso a posizione
    -- Kit manuale: costo 60 → vendita 120 / Kit motore: costo 80 → vendita 160
    INSERT INTO public.article_family_axis_values (
      axis_id, company_id, valore, label, descrizione,
      is_default, maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo
    )
    VALUES
      (v_axis_id, v_company_id, 'solo_telo',  'Solo telo (nessun kit)',
       'Telo avvolgibile senza coppia guide né kit di apertura. Cliente fornisce sistema esistente.',
       false, 'none', 0, 0, 0, true),
      (v_axis_id, v_company_id, 'manuale',    'Kit manuale (con cintino)',
       'Kit completo manuale: coppia guide, rullo, placca, calotta, staffa, puleggia, guida cinghia, cintino.',
       true,  'fisso_pz', 120.00, 60.00, 1, true),
      (v_axis_id, v_company_id, 'motorizzato','Kit motore meccanico',
       'Kit motorizzato meccanico: motore tubolare, coppia guide, rullo, placca, calotta, staffa.',
       false, 'fisso_pz', 160.00, 80.00, 2, true);

    -- Asse: Guide aggiuntive con spazzolino (opzionale)
    -- Costo: 25/pz → vendita 50/pz (a pezzo, sopra il kit base)
    INSERT INTO public.article_family_axes (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
    VALUES (v_family_id, v_company_id, 'Guide anti-rumore', 'guide_antirumore',
            'Guida laterale con spazzolino anti-rumore (in aggiunta o sostituzione delle guide del kit).',
            'discrete', false, 1)
    RETURNING id INTO v_axis_id;
    INSERT INTO public.article_family_axis_values (
      axis_id, company_id, valore, label, descrizione,
      is_default, maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo
    )
    VALUES
      (v_axis_id, v_company_id, 'no',  'Senza',                        NULL,                                        true,  'none',     0,     0,    0, true),
      (v_axis_id, v_company_id, 'si',  'Coppia guide anti-rumore (+€50)', 'Coppia guide laterali con spazzolino anti-rumore. Costo 25/pz × 2 → vendita 50/pz × 2 = +50.',
       false, 'fisso_pz', 50.00, 25.00, 1, true);
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 5) Tariffe specifiche AVVOLGIBILI (posa + trasporto)
  --    Le tariffe POSA sono già nel listino MONTAGGI separato; qui aggiungiamo
  --    solo "Posa avvolgibile CTS" specifica dal listino fornitore CTS.
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO public.tariffe_aziendali (company_id, tipo, nome, descrizione, unita, prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order)
  SELECT v_company_id, 'posa', 'Posa Avvolgibile · Solo Telo (CTS)',
         'Posa CTS solo telo, costo 50/pos → ricarico 100% → vendita 100/pos',
         'pz', 50.00, 100.00, 'avvolgibili', true, 200
  WHERE NOT EXISTS (SELECT 1 FROM public.tariffe_aziendali WHERE company_id = v_company_id AND nome = 'Posa Avvolgibile · Solo Telo (CTS)');

  INSERT INTO public.tariffe_aziendali (company_id, tipo, nome, descrizione, unita, prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order)
  SELECT v_company_id, 'posa', 'Posa Avvolgibile · Telo + Kit Manuale (CTS)',
         'Posa CTS telo + kit manuale, costo 65/pos → vendita 130/pos',
         'pz', 65.00, 130.00, 'avvolgibili', true, 201
  WHERE NOT EXISTS (SELECT 1 FROM public.tariffe_aziendali WHERE company_id = v_company_id AND nome = 'Posa Avvolgibile · Telo + Kit Manuale (CTS)');

  INSERT INTO public.tariffe_aziendali (company_id, tipo, nome, descrizione, unita, prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order)
  SELECT v_company_id, 'posa', 'Posa Avvolgibile · Telo + Kit Motore (CTS)',
         'Posa CTS telo + kit motore (escl. coll. elettrico), costo 105/pos → vendita 210/pos',
         'pz', 105.00, 210.00, 'avvolgibili', true, 202
  WHERE NOT EXISTS (SELECT 1 FROM public.tariffe_aziendali WHERE company_id = v_company_id AND nome = 'Posa Avvolgibile · Telo + Kit Motore (CTS)');

  INSERT INTO public.tariffe_aziendali (company_id, tipo, nome, descrizione, unita, prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order)
  SELECT v_company_id, 'trasporto', 'Trasporto Avvolgibili (CTS)',
         'Trasporto a consegna avvolgibili fornitore CTS, costo 20 → vendita 40',
         'fisso', 20.00, 40.00, 'avvolgibili', true, 210
  WHERE NOT EXISTS (SELECT 1 FROM public.tariffe_aziendali WHERE company_id = v_company_id AND nome = 'Trasporto Avvolgibili (CTS)');

  RAISE NOTICE 'Seed AVVOLGIBILI Ke Bei completato: 1 famiglia + 2 assi + 4 tariffe.';
END $$;

NOTIFY pgrst, 'reload schema';
