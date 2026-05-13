-- ════════════════════════════════════════════════════════════════════════════
-- Seed TARIFFE MANODOPERA per Ke Bei Serramenti
-- ────────────────────────────────────────────────────────────────────────────
-- Fonte: PDF "LISTINO COSTO MONTAGGI e ALTRO.pdf"
-- Ricarico azienda: 100% sul costo (prezzo_vendita = costo × 2)
-- 50 voci totali divise per tipo: posa, trasporto, smaltimento, pratica, altro
-- Tutte le tariffe insert sono idempotenti (WHERE NOT EXISTS su nome).
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id
    FROM public.companies
   WHERE LOWER(name) LIKE '%ke bei%'
      OR LOWER(name) LIKE '%kebei%'
      OR LOWER(REPLACE(name, ' ', '')) LIKE '%kebei%'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Company "Ke Bei Serramenti" non trovata — seed tariffe skipped.';
    RETURN;
  END IF;
  RAISE NOTICE 'Seeding tariffe manodopera per Ke Bei id = %', v_company_id;

  -- ──────────────────────────────────────────────────────────────────────
  -- 50 tariffe insert idempotenti
  -- formato: (tipo, nome, descrizione, unita, costo, vendita, categoria, sort)
  -- ──────────────────────────────────────────────────────────────────────
  INSERT INTO public.tariffe_aziendali (
    company_id, tipo, nome, descrizione, unita,
    prezzo_costo, prezzo_vendita, categoria_prodotto, attiva, sort_order
  )
  SELECT v_company_id, tipo::TEXT, nome, descrizione, unita::TEXT,
         costo, vendita, categoria, true, sort_order
  FROM (VALUES
    -- ─── Tariffe orarie/giornaliere ───────────────────────────────────
    ('altro',       'Uscita minimo giornata intera',     'Costo uscita minimo della giornata intera (≥6h) — fornitore €600 → ricarico 100%',                       'fisso',  600.0, 1200.0, NULL::TEXT,  10),
    ('altro',       'Uscita minimo mezza giornata',      'Costo uscita minimo mezza giornata (≤4h) — fornitore €300 → ricarico 100%',                             'fisso',  300.0,  600.0, NULL,  11),
    ('nolo',        'Autoscala (dal 3° piano in su)',    'Nolo autoscala con sopralluogo, applicato dal 3° piano in su — costo €350 → vendita €700',              'fisso',  350.0,  700.0, NULL,  20),
    ('pratica',     'Permessi suolo pubblico',           'Pratiche permessi suolo pubblico (a carico cliente o azienda — voce di servizio)',                       'fisso',    0.0,    0.0, NULL,  30),
    -- ─── Posa serramenti per materiale ────────────────────────────────
    ('posa',        'Posa serramento PVC',               'Posa serramento in PVC — costo €100/pz → ricarico 100% → vendita €200/pz',                              'pz',     100.0,  200.0, 'serramenti',     100),
    ('posa',        'Posa serramento Alluminio',         'Posa serramento in alluminio — costo €130/pz → vendita €260/pz',                                         'pz',     130.0,  260.0, 'serramenti',     101),
    ('posa',        'Posa serramento Legno',             'Posa serramento in legno — costo €110/pz → vendita €220/pz',                                             'pz',     110.0,  220.0, 'serramenti',     102),
    ('posa',        'Posa serramento Legno/Alluminio',   'Posa serramento misto legno/alluminio — costo €150/pz → vendita €300/pz',                               'pz',     150.0,  300.0, 'serramenti',     103),
    ('posa',        'Posa serramento Scorrevole',        'Posa serramento scorrevole — costo €250/pz → vendita €500/pz',                                           'pz',     250.0,  500.0, 'serramenti',     104),
    -- ─── Operazioni accessorie sui telai ──────────────────────────────
    ('posa',        'Rimozione telaio vecchio',          'Rimozione telaio esistente — costo €50/pz → vendita €100/pz',                                            'pz',      50.0,  100.0, 'serramenti',     110),
    ('posa',        'Taglio telaio vecchio',             'Taglio telaio esistente (no rimozione completa) — costo €20/pz → vendita €40/pz',                       'pz',      20.0,   40.0, 'serramenti',     111),
    ('posa',        'Smontaggio doppio infisso',         'Smontaggio doppio infisso esistente — costo €50/pz → vendita €100/pz',                                  'pz',      50.0,  100.0, 'serramenti',     112),
    -- ─── Strutture grandi ─────────────────────────────────────────────
    ('posa',        'Posa Pergotenda',                   'Posa pergotenda — costo €1.100 → vendita €2.200 (su singolo elemento)',                                  'pz',    1100.0, 2200.0, 'tende',     120),
    ('posa',        'Posa Vetrata',                      'Posa vetrata semplice — costo €100/pz → vendita €200/pz',                                                'pz',     100.0,  200.0, 'vetrate',     121),
    -- ─── Avvolgibili / tapparelle ─────────────────────────────────────
    ('posa',        'Posa avvolgibile · Solo telo',      'Posa solo telo avvolgibile — costo €40/pz → vendita €80/pz',                                             'pz',      40.0,   80.0, 'avvolgibili',     130),
    ('posa',        'Posa avvolgibile · Telo + kit',     'Posa telo + kit avvolgibile — costo €50/pz → vendita €100/pz',                                          'pz',      50.0,  100.0, 'avvolgibili',     131),
    ('posa',        'Posa avvolgibile · Solo kit',       'Posa solo kit (telo esistente) — costo €35/pz → vendita €70/pz',                                         'pz',      35.0,   70.0, 'avvolgibili',     132),
    ('posa',        'Posa avvolgibile · Telo+kit+motore','Posa telo + kit + motore avvolgibile — costo €85/pz → vendita €170/pz',                                  'pz',      85.0,  170.0, 'avvolgibili',     133),
    ('posa',        'Sostituzione cintino + guidacinghia','Sostituzione cintino + guidacinghia avvolgibile — costo €10/pz → vendita €20/pz',                       'pz',      10.0,   20.0, 'avvolgibili',     134),
    -- ─── Cassonetti / celini ──────────────────────────────────────────
    ('posa',        'Sostituzione cassonetto',           'Sostituzione cassonetto — costo €40/pz → vendita €80/pz',                                                'pz',      40.0,   80.0, 'cassonetti',     140),
    ('posa',        'Coibentazione cassonetto',          'Coibentazione cassonetto esistente — costo €40/pz → vendita €80/pz',                                     'pz',      40.0,   80.0, 'cassonetti',     141),
    ('posa',        'Posa celino',                       'Posa celino standard — costo €30/pz → vendita €60/pz',                                                   'pz',      30.0,   60.0, 'cassonetti',     142),
    ('posa',        'Coibentazione celino',              'Coibentazione celino — costo €25/pz → vendita €50/pz',                                                   'pz',      25.0,   50.0, 'cassonetti',     143),
    -- ─── Zanzariere / veneziane ───────────────────────────────────────
    ('posa',        'Posa zanzariera / veneziana',       'Posa zanzariera o veneziana — costo €35/pz → vendita €70/pz',                                             'pz',      35.0,   70.0, 'zanzariere',     150),
    -- ─── Persiane ─────────────────────────────────────────────────────
    ('posa',        'Posa persiana alluminio a telaio',  'Posa persiana in alluminio a telaio — costo €80/pz → vendita €160/pz',                                  'pz',      80.0,  160.0, 'persiane',     160),
    ('posa',        'Posa persiana alluminio a cardine', 'Posa persiana in alluminio a cardine — costo €100/pz → vendita €200/pz',                                'pz',     100.0,  200.0, 'persiane',     161),
    ('posa',        'Posa persiana legno a cardine',     'Posa persiana in legno a cardine — costo €150/pz → vendita €300/pz',                                    'pz',     150.0,  300.0, 'persiane',     162),
    -- ─── Grate / frangisole ───────────────────────────────────────────
    ('posa',        'Posa grata sicurezza',              'Posa grata di sicurezza — costo €80/pz → vendita €160/pz',                                                'pz',      80.0,  160.0, 'sicurezza',     170),
    ('posa',        'Posa frangisole',                   'Posa frangisole — costo €80/pz → vendita €160/pz',                                                       'pz',      80.0,  160.0, 'tende',     171),
    -- ─── Tende ────────────────────────────────────────────────────────
    ('posa',        'Posa tenda bq/caduta/cappottina <3MT', 'Posa tenda braccio quadro / a caduta / cappottina inferiore a 3 metri — costo €160 → vendita €320',  'pz',     160.0,  320.0, 'tende',     180),
    ('posa',        'Posa tenda bq/caduta/cappottina 3-7MT','Posa tenda braccio quadro / a caduta / cappottina tra 3 e 7 metri — costo €250 → vendita €500',     'pz',     250.0,  500.0, 'tende',     181),
    ('posa',        'Posa tenda bq/caduta/cappottina >7MT', 'Posa tenda braccio quadro / a caduta / cappottina oltre i 7 metri — costo €300 → vendita €600',     'pz',     300.0,  600.0, 'tende',     182),
    ('posa',        'Posa tenda Magika',                 'Posa tenda Magika — costo €160 → vendita €320',                                                          'pz',     160.0,  320.0, 'tende',     183),
    ('posa',        'Posa tenda Magika >3MT',            'Posa tenda Magika oltre i 3 metri — costo €200 → vendita €400',                                          'pz',     200.0,  400.0, 'tende',     184),
    ('posa',        'Motorizzazione tenda',              'Motorizzazione tenda — costo €50/pz → vendita €100/pz',                                                  'pz',      50.0,  100.0, 'tende',     185),
    -- ─── Portoncini blindati / interne ─────────────────────────────────
    ('posa',        'Portoncino blindato + opere murarie','Posa portoncino blindato con opere murarie — costo €350 → vendita €700',                              'pz',     350.0,  700.0, 'porte',     200),
    ('posa',        'Portoncino PVC / Meccanica (cantiere blindo)', 'Posa portoncino PVC o meccanica su cantiere già predisposto — costo €150 → vendita €300', 'pz',     150.0,  300.0, 'porte',     201),
    ('posa',        'Posa imbotte',                      'Posa imbotte (rivestimento spalle) — costo €20/pz → vendita €40/pz',                                    'pz',      20.0,   40.0, 'porte',     202),
    ('posa',        'Sostituzione pannello blindato',    'Sostituzione pannello blindato — costo €70/pz → vendita €140/pz',                                       'pz',      70.0,  140.0, 'porte',     203),
    ('posa',        'Sost. pannello esterno blindato (falegname)', 'Sostituzione pannello esterno blindato realizzato da falegname — costo €100 → vendita €200',  'pz',     100.0,  200.0, 'porte',     204),
    ('posa',        'Porta interna battente',            'Posa porta interna battente — costo €50/pz → vendita €100/pz',                                          'pz',      50.0,  100.0, 'porte',     205),
    ('posa',        'Porta interna a scrigno',           'Posa porta interna a scrigno — costo €70/pz → vendita €140/pz',                                         'pz',      70.0,  140.0, 'porte',     206),
    ('posa',        'Porta interna esterno muro',        'Posa porta interna esterno muro — costo €120/pz → vendita €240/pz',                                     'pz',     120.0,  240.0, 'porte',     207),
    ('posa',        'Porta scorrevole esterno muro vetrata','Posa porta scorrevole esterno muro vetrata — costo €150/pz → vendita €300/pz',                       'pz',     150.0,  300.0, 'porte',     208),
    -- ─── Smaltimento / Pratiche / Rilievi ─────────────────────────────
    ('smaltimento', 'Smaltimento serramento',            'Smaltimento serramento vecchio — costo €50/pz → vendita €100/pz',                                       'pz',      50.0,  100.0, NULL,  300),
    ('pratica',     'Pratica ENEA',                      'Compilazione e invio pratica ENEA — costo €85 → vendita €170',                                          'fisso',   85.0,  170.0, NULL,  310),
    ('altro',       'Rilievo misure',                    'Sopralluogo + rilievo misure dettagliato — costo €300 → vendita €600',                                  'fisso',  300.0,  600.0, NULL,  320)
  ) AS src(tipo, nome, descrizione, unita, costo, vendita, categoria, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tariffe_aziendali ta
     WHERE ta.company_id = v_company_id
       AND ta.nome = src.nome
  );

  RAISE NOTICE 'Seed TARIFFE MANODOPERA Ke Bei completato (idempotente).';
END $$;

NOTIFY pgrst, 'reload schema';
