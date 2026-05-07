-- Seed/repair listino Ke Bei Serramenti: persiane naming + portoncini in alluminio.
-- Source spreadsheet: /Users/agenteai/Downloads/PORTONCINI in ALLUMINIO.xlsx, sheet `VELORA`.
-- Business rules:
--   - NomeSerie = macrocategoria.
--   - DescrizTip = categoria and article/family display name.
--   - CostoFin = costo/listino fornitore totale di riferimento, conservato nelle note.
--   - Scontato con Coprifili = costo reale netto azienda, usato come prezzo_acquisto.
--   - Vendita imponibile = prezzo_acquisto x 2 (ricarico 100%).
--   - IVA acquisto 22%; IVA vendita 10%.

DO $$
DECLARE
  v_company_id uuid;
  v_input_count integer;
  v_macro_count integer;
  v_family_count integer;
  v_grid_count integer;
  v_persiane_repaired integer;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE name = 'Ke Bei Serramenti'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Ke Bei Serramenti company not found; skipping portoncini listino import.';
    RETURN;
  END IF;

  -- Repair previous PERSIANE import display names: article name must not repeat the macrocategoria.
  -- If the same DescrizTip exists in multiple series, the supplier code is appended to preserve the
  -- existing active-family uniqueness constraint without putting the macrocategoria back in the name.
  WITH persiane_source AS (
    SELECT
      af.id AS family_id,
      af.categoria_id,
      af.custom_field_values->>'descrizione_tipologia' AS base_name,
      af.custom_field_values->>'tip_code' AS tip_code
    FROM public.article_families af
    WHERE af.company_id = v_company_id
      AND af.vertical = 'serramentista'
      AND af.deleted_at IS NULL
      AND af.custom_field_values->>'source' = 'PERSIANE.xlsx'
      AND NULLIF(af.custom_field_values->>'descrizione_tipologia', '') IS NOT NULL
  ), persiane AS (
    SELECT
      family_id,
      categoria_id,
      CASE
        WHEN count(*) OVER (PARTITION BY base_name) > 1
          THEN base_name || ' · ' || tip_code
        ELSE base_name
      END AS clean_name
    FROM persiane_source
  ), updated_families AS (
    UPDATE public.article_families af
       SET nome = p.clean_name,
           descrizione = NULL,
           updated_at = now()
      FROM persiane p
     WHERE af.id = p.family_id
    RETURNING af.id
  ), updated_categories AS (
    UPDATE public.listino_categorie lc
       SET descrizione = NULL,
           updated_at = now()
     WHERE lc.company_id = v_company_id
       AND lc.id IN (SELECT DISTINCT categoria_id FROM persiane WHERE categoria_id IS NOT NULL)
    RETURNING lc.id
  ), updated_macros AS (
    UPDATE public.listino_macrocategorie lm
       SET descrizione = NULL,
           updated_at = now()
     WHERE lm.company_id = v_company_id
       AND lm.nome IN (
         SELECT DISTINCT af.custom_field_values->>'nome_serie'
         FROM public.article_families af
         WHERE af.company_id = v_company_id
           AND af.vertical = 'serramentista'
           AND af.deleted_at IS NULL
           AND af.custom_field_values->>'source' = 'PERSIANE.xlsx'
       )
    RETURNING lm.id
  )
  SELECT count(*) INTO v_persiane_repaired FROM updated_families;

  CREATE TEMP TABLE _ke_bei_portoncini_import (
    series_name text NOT NULL,
    category_name text NOT NULL,
    tip_code text NOT NULL,
    width_mm integer NOT NULL,
    height_mm integer NOT NULL,
    supplier_total_net numeric(12,4) NOT NULL,
    purchase_net numeric(12,4) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _ke_bei_portoncini_import (
    series_name, category_name, tip_code, width_mm, height_mm, supplier_total_net, purchase_net
  ) VALUES
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2000, 2693.0000, 1076.8050),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2100, 2704.0000, 1081.0400),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2200, 2715.0000, 1085.2750),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2300, 2725.0000, 1089.1250),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2400, 3293.0000, 1307.8050),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2500, 3304.0000, 1312.0400),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 800, 2600, 3316.0000, 1316.6600),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2000, 2730.0000, 1091.0500),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2100, 2744.0000, 1096.4400),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2200, 2757.0000, 1101.4450),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2300, 2771.0000, 1106.8350),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2400, 3341.0000, 1326.2850),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2500, 3353.0000, 1330.9050),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 900, 2600, 3368.0000, 1336.6800),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2000, 2769.0000, 1106.0650),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2100, 2785.0000, 1112.2250),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2200, 2801.0000, 1118.3850),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2300, 2817.0000, 1124.5450),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2400, 3388.0000, 1344.3800),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2500, 3404.0000, 1350.5400),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1000, 2600, 3418.0000, 1355.9300),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2000, 2808.0000, 1121.0800),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2100, 2826.0000, 1128.0100),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2200, 2844.0000, 1134.9400),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2300, 2862.0000, 1141.8700),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2400, 3435.0000, 1362.4750),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2500, 3453.0000, 1369.4050),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1100, 2600, 3472.0000, 1376.7200),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2000, 3402.0000, 1349.7700),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2100, 3420.0000, 1356.7000),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2200, 3442.0000, 1365.1700),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2300, 3462.0000, 1372.8700),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2400, 3701.0000, 1464.8850),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2500, 3721.0000, 1472.5850),
    ('Portoncino a vetro', 'Door 1 anta', 'BM_DOOR1A', 1200, 2600, 3742.0000, 1480.6700),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2000, 4282.0000, 1688.5700),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2100, 4303.0000, 1696.6550),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2200, 4325.0000, 1705.1250),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2300, 4346.0000, 1713.2100),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2400, 4943.0000, 1943.0550),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2500, 4964.0000, 1951.1400),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1400, 2600, 4986.0000, 1959.6100),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2000, 4321.0000, 1703.5850),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2100, 4344.0000, 1712.4400),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2200, 4367.0000, 1721.2950),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2300, 4392.0000, 1730.9200),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2400, 4990.0000, 1961.1500),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2500, 5014.0000, 1970.3900),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1500, 2600, 5037.0000, 1979.2450),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2000, 4360.0000, 1718.6000),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2100, 4385.0000, 1728.2250),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2200, 4410.0000, 1737.8500),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2300, 4437.0000, 1748.2450),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2400, 5037.0000, 1979.2450),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2500, 5064.0000, 1989.6400),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1600, 2600, 5089.0000, 1999.2650),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2000, 4398.0000, 1733.2300),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2100, 4426.0000, 1744.0100),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2200, 4454.0000, 1754.7900),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2300, 4482.0000, 1765.5700),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2400, 5085.0000, 1997.7250),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2500, 5113.0000, 2008.5050),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1700, 2600, 5140.0000, 2018.9000),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2000, 4437.0000, 1748.2450),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2100, 4467.0000, 1759.7950),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2200, 4497.0000, 1771.3450),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2300, 4527.0000, 1782.8950),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2400, 5132.0000, 2015.8200),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2500, 5162.0000, 2027.3700),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1800, 2600, 5192.0000, 2038.9200),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2000, 4476.0000, 1763.2600),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2100, 4507.0000, 1775.1950),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2200, 4540.0000, 1787.9000),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2300, 4572.0000, 1800.2200),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2400, 5179.0000, 2033.9150),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2500, 5212.0000, 2046.6200),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 1900, 2600, 5244.0000, 2058.9400),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2000, 4513.0000, 1777.5050),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2100, 4548.0000, 1790.9800),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2200, 4583.0000, 1804.4550),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2300, 4616.0000, 1817.1600),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2400, 4617.0000, 1817.5450),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2500, 5261.0000, 2065.4850),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2000, 2600, 5296.0000, 2078.9600),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2000, 4552.0000, 1792.5200),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2100, 4589.0000, 1806.7650),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2200, 4626.0000, 1821.0100),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2300, 4661.0000, 1834.4850),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2400, 5275.0000, 2070.8750),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2500, 5310.0000, 2084.3500),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2100, 2600, 5347.0000, 2098.5950),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2000, 4591.0000, 1807.5350),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2100, 4630.0000, 1822.5500),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2200, 4669.0000, 1837.5650),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2300, 4707.0000, 1852.1950),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2400, 5322.0000, 2088.9700),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2500, 5360.0000, 2103.6000),
    ('Portoncino a vetro', 'Door 2 ante', 'BM_DOOR2A', 2200, 2600, 5399.0000, 2118.6150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 500, 392.0000, 190.9200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 600, 417.0000, 200.5450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 700, 443.0000, 210.5550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 800, 470.0000, 220.9500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 900, 495.0000, 230.5750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1000, 520.0000, 240.2000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1100, 548.0000, 250.9800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1200, 572.0000, 260.2200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1300, 599.0000, 270.6150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1400, 625.0000, 280.6250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1500, 650.0000, 290.2500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1600, 676.0000, 300.2600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1700, 703.0000, 310.6550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1800, 729.0000, 320.6650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 1900, 752.0000, 329.5200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 2000, 780.0000, 340.3000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 2100, 805.0000, 349.9250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 2200, 831.0000, 359.9350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 2300, 858.0000, 370.3300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 2400, 884.0000, 380.3400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 500, 2500, 909.0000, 389.9650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 500, 423.0000, 202.8550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 600, 453.0000, 214.4050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 700, 480.0000, 224.8000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 800, 510.0000, 236.3500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 900, 537.0000, 246.7450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1000, 566.0000, 257.9100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1100, 593.0000, 268.3050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1200, 620.0000, 278.7000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1300, 649.0000, 289.8650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1400, 676.0000, 300.2600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1500, 704.0000, 311.0400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1600, 732.0000, 321.8200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1700, 762.0000, 333.3700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1800, 787.0000, 342.9950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 1900, 816.0000, 354.1600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 2000, 845.0000, 365.3250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 2100, 876.0000, 377.2600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 2200, 901.0000, 386.8850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 2300, 931.0000, 398.4350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 2400, 962.0000, 410.3700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 600, 2500, 990.0000, 421.1500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 500, 427.0000, 204.3950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 600, 459.0000, 216.7150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 700, 493.0000, 229.8050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 800, 521.0000, 240.5850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 900, 554.0000, 253.2900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1000, 586.0000, 265.6100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1100, 620.0000, 278.7000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1200, 653.0000, 291.4050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1300, 686.0000, 304.1100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1400, 716.0000, 315.6600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1500, 748.0000, 327.9800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1600, 781.0000, 340.6850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1700, 815.0000, 353.7750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1800, 848.0000, 366.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 1900, 880.0000, 378.8000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 2000, 912.0000, 391.1200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 2100, 941.0000, 402.2850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 2200, 976.0000, 415.7600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 2300, 1008.0000, 428.0800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 2400, 1037.0000, 439.2450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 700, 2500, 1069.0000, 451.5650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 500, 493.0000, 229.8050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 600, 521.0000, 240.5850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 700, 554.0000, 253.2900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 800, 586.0000, 265.6100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 900, 620.0000, 278.7000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1000, 653.0000, 291.4050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1100, 686.0000, 304.1100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1200, 716.0000, 315.6600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1300, 748.0000, 327.9800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1400, 781.0000, 340.6850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1500, 815.0000, 353.7750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1600, 848.0000, 366.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1700, 880.0000, 378.8000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1800, 912.0000, 391.1200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 1900, 942.0000, 402.6700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 2000, 977.0000, 416.1450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 2100, 1012.0000, 429.6200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 2200, 1045.0000, 442.3250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 2300, 1079.0000, 455.4150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 2400, 1115.0000, 469.2750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 800, 2500, 1148.0000, 481.9800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 500, 494.0000, 230.1900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 600, 530.0000, 244.0500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 700, 567.0000, 258.2950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 800, 603.0000, 272.1550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 900, 638.0000, 285.6300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1000, 676.0000, 300.2600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1100, 713.0000, 314.5050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1200, 748.0000, 327.9800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1300, 786.0000, 342.6100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1400, 824.0000, 357.2400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1500, 859.0000, 370.7150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1600, 897.0000, 385.3450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1700, 932.0000, 398.8200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1800, 969.0000, 413.0650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 1900, 1008.0000, 428.0800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 2000, 1043.0000, 441.5550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 2100, 1079.0000, 455.4150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 2200, 1117.0000, 470.0450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 2300, 1153.0000, 483.9050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 2400, 1190.0000, 498.1500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 900, 2500, 1228.0000, 512.7800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 500, 495.0000, 230.5750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 600, 537.0000, 246.7450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 700, 577.0000, 262.1450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 800, 619.0000, 278.3150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 900, 659.0000, 293.7150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1000, 700.0000, 309.5000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1100, 741.0000, 325.2850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1200, 781.0000, 340.6850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1300, 824.0000, 357.2400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1400, 865.0000, 373.0250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1500, 903.0000, 387.6550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1600, 945.0000, 403.8250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1700, 985.0000, 419.2250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1800, 1028.0000, 435.7800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 1900, 1069.0000, 451.5650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 2000, 1109.0000, 466.9650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 2100, 1148.0000, 481.9800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 2200, 1189.0000, 497.7650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 2300, 1228.0000, 512.7800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 2400, 1268.0000, 528.1800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1000, 2500, 1308.0000, 543.5800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 500, 559.0000, 255.2150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 600, 600.0000, 271.0000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 700, 642.0000, 287.1700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 800, 683.0000, 302.9550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 900, 724.0000, 318.7400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1000, 765.0000, 334.5250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1100, 805.0000, 349.9250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1200, 848.0000, 366.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1300, 886.0000, 381.1100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1400, 930.0000, 398.0500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1500, 969.0000, 413.0650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1600, 1012.0000, 429.6200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1700, 1050.0000, 444.2500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1800, 1092.0000, 460.4200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 1900, 1132.0000, 475.8200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 2000, 1174.0000, 491.9900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 2100, 1217.0000, 508.5450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 2200, 1258.0000, 524.3300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 2300, 1302.0000, 541.2700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 2400, 1343.0000, 557.0550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1100, 2500, 1388.0000, 574.3800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 500, 560.0000, 255.6000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 600, 608.0000, 274.0800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 700, 653.0000, 291.4050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 800, 698.0000, 308.7300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 900, 744.0000, 326.4400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1000, 787.0000, 342.9950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1100, 833.0000, 360.7050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1200, 880.0000, 378.8000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1300, 926.0000, 396.5100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1400, 969.0000, 413.0650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1500, 1014.0000, 430.3900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1600, 1060.0000, 448.1000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1700, 1106.0000, 465.8100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1800, 1151.0000, 483.1350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 1900, 1196.0000, 500.4600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 2000, 1242.0000, 518.1700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 2100, 1286.0000, 535.1100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 2200, 1328.0000, 551.2800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 2300, 1374.0000, 568.9900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 2400, 1422.0000, 587.4700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1200, 2500, 1467.0000, 604.7950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 500, 594.0000, 268.6900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 600, 642.0000, 287.1700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 700, 688.0000, 304.8800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 800, 737.0000, 323.7450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 900, 785.0000, 342.2250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1000, 831.0000, 359.9350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1100, 880.0000, 378.8000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1200, 928.0000, 397.2800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1300, 976.0000, 415.7600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1400, 1019.0000, 432.3150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1500, 1069.0000, 451.5650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1600, 1117.0000, 470.0450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1700, 1163.0000, 487.7550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1800, 1211.0000, 506.2350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 1900, 1258.0000, 524.3300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 2000, 1308.0000, 543.5800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 2100, 1355.0000, 561.6750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 2200, 1400.0000, 579.0000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 2300, 1448.0000, 597.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 2400, 1497.0000, 616.3450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1300, 2500, 1544.0000, 634.4400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 500, 627.0000, 281.3950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 600, 679.0000, 301.4150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 700, 729.0000, 320.6650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 800, 777.0000, 339.1450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 900, 827.0000, 358.3950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1000, 877.0000, 377.6450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1100, 928.0000, 397.2800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1200, 977.0000, 416.1450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1300, 1025.0000, 434.6250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1400, 1076.0000, 454.2600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1500, 1125.0000, 473.1250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1600, 1174.0000, 491.9900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1700, 1226.0000, 512.0100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1800, 1274.0000, 530.4900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 1900, 1323.0000, 549.3550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 2000, 1373.0000, 568.6050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 2100, 1423.0000, 587.8550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 2200, 1473.0000, 607.1050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 2300, 1524.0000, 626.7400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 2400, 1573.0000, 645.6050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1400, 2500, 1624.0000, 665.2400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 500, 632.0000, 283.3200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 600, 686.0000, 304.1100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 700, 738.0000, 324.1300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 800, 793.0000, 345.3050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 900, 848.0000, 366.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1000, 900.0000, 386.5000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1100, 956.0000, 408.0600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1200, 1010.0000, 428.8500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1300, 1062.0000, 448.8700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1400, 1117.0000, 470.0450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1500, 1170.0000, 490.4500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1600, 1226.0000, 512.0100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1700, 1278.0000, 532.0300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1800, 1333.0000, 553.2050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 1900, 1388.0000, 574.3800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 2000, 1440.0000, 594.4000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 2100, 1489.0000, 613.2650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 2200, 1544.0000, 634.4400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 2300, 1598.0000, 655.2300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 2400, 1648.0000, 674.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1500, 2500, 1704.0000, 696.0400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 500, 664.0000, 295.6400),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 600, 720.0000, 317.2000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 700, 776.0000, 338.7600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 800, 831.0000, 359.9350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 900, 886.0000, 381.1100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1000, 942.0000, 402.6700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1100, 1000.0000, 425.0000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1200, 1058.0000, 447.3300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1300, 1113.0000, 468.5050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1400, 1169.0000, 490.0650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1500, 1226.0000, 512.0100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1600, 1279.0000, 532.4150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1700, 1335.0000, 553.9750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1800, 1393.0000, 576.3050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 1900, 1448.0000, 597.4800),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 2000, 1505.0000, 619.4250),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 2100, 1561.0000, 640.9850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 2200, 1616.0000, 662.1600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 2300, 1671.0000, 683.3350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 2400, 1727.0000, 704.8950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1600, 2500, 1782.0000, 726.0700),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 500, 698.0000, 308.7300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 600, 756.0000, 331.0600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 700, 815.0000, 353.7750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 800, 874.0000, 376.4900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 900, 931.0000, 398.4350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1000, 990.0000, 421.1500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1100, 1046.0000, 442.7100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1200, 1106.0000, 465.8100),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1300, 1163.0000, 487.7550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1400, 1223.0000, 510.8550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1500, 1279.0000, 532.4150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1600, 1339.0000, 555.5150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1700, 1397.0000, 577.8450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1800, 1455.0000, 600.1750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 1900, 1512.0000, 622.1200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 2000, 1570.0000, 644.4500),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 2100, 1629.0000, 667.1650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 2200, 1689.0000, 690.2650),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 2300, 1747.0000, 712.5950),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 2400, 1803.0000, 734.1550),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1700, 2500, 1860.0000, 756.1000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 500, 731.0000, 321.4350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 600, 791.0000, 344.5350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 700, 851.0000, 367.6350),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 800, 912.0000, 391.1200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 900, 974.0000, 414.9900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1000, 1033.0000, 437.7050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1100, 1092.0000, 460.4200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1200, 1153.0000, 483.9050),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1300, 1212.0000, 506.6200),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1400, 1274.0000, 530.4900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1500, 1334.0000, 553.5900),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1600, 1396.0000, 577.4600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1700, 1455.0000, 600.1750),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1800, 1516.0000, 623.6600),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 1900, 1578.0000, 647.5300),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 2000, 1637.0000, 670.2450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 2100, 1697.0000, 693.3450),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 2200, 1759.0000, 717.2150),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 2300, 1821.0000, 741.0850),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 2400, 1880.0000, 763.8000),
    ('Portoncino a vetro', 'Fisso con fermavetro', 'BM_DOOR_FIX', 1800, 2500, 1942.0000, 787.6700),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2000, 1529.0000, 628.6650),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2100, 1561.0000, 640.9850),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2200, 1593.0000, 653.3050),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2300, 1624.0000, 665.2400),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2400, 1656.0000, 677.5600),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2500, 1688.0000, 689.8800),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 800, 2600, 1720.0000, 702.2000),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2000, 1584.0000, 649.8400),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2100, 1617.0000, 662.5450),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2200, 1650.0000, 675.2500),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2300, 1684.0000, 688.3400),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2400, 1717.0000, 701.0450),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2500, 1750.0000, 713.7500),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 900, 2600, 1783.0000, 726.4550),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2000, 1638.0000, 670.6300),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2100, 1673.0000, 684.1050),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2200, 1708.0000, 697.5800),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2300, 1743.0000, 711.0550),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2400, 1778.0000, 724.5300),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2500, 1812.0000, 737.6200),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1000, 2600, 1847.0000, 751.0950),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2000, 1693.0000, 691.8050),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2100, 1729.0000, 705.6650),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2200, 1765.0000, 719.5250),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2300, 1802.0000, 733.7700),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2400, 1838.0000, 747.6300),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2500, 1875.0000, 761.8750),
    ('FORMA PORTONCINI', 'Portoncino 1 anta', 'BM_FORMP1', 1100, 2600, 1911.0000, 775.7350),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 1900, 2732.0000, 1091.8200),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 2000, 2844.0000, 1134.9400),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 2100, 2909.0000, 1159.9650),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 2200, 2973.0000, 1184.6050),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 2300, 3048.0000, 1213.4800),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 2400, 3229.0000, 1283.1650),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1100, 2500, 3317.0000, 1317.0450),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 1900, 2800.0000, 1118.0000),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 2000, 2914.0000, 1161.8900),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 2100, 2983.0000, 1188.4550),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 2200, 3050.0000, 1214.2500),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 2300, 3128.0000, 1244.2800),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 2400, 3309.0000, 1313.9650),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1200, 2500, 3402.0000, 1349.7700),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 1900, 2869.0000, 1144.5650),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 2000, 2984.0000, 1188.8400),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 2100, 3056.0000, 1216.5600),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 2200, 3125.0000, 1243.1250),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 2300, 3207.0000, 1274.6950),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 2400, 3391.0000, 1345.5350),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1300, 2500, 3487.0000, 1382.4950),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 1900, 2983.0000, 1188.4550),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 2000, 3103.0000, 1234.6550),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 2100, 3181.0000, 1264.6850),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 2200, 3253.0000, 1292.4050),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 2300, 3341.0000, 1326.2850),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 2400, 3530.0000, 1399.0500),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1400, 2500, 3631.0000, 1437.9350),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 1900, 3052.0000, 1215.0200),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 2000, 3173.0000, 1261.6050),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 2100, 3255.0000, 1293.1750),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 2200, 3330.0000, 1322.0500),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 2300, 3421.0000, 1357.0850),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 2400, 3612.0000, 1430.6200),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1500, 2500, 3716.0000, 1470.6600),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 1900, 3120.0000, 1241.2000),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 2000, 3245.0000, 1289.3250),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 2100, 3330.0000, 1322.0500),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 2200, 3407.0000, 1351.6950),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 2300, 3501.0000, 1387.8850),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 2400, 3693.0000, 1461.8050),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1600, 2500, 3800.0000, 1503.0000),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 1900, 3189.0000, 1267.7650),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 2000, 3316.0000, 1316.6600),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 2100, 3404.0000, 1350.5400),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 2200, 3482.0000, 1380.5700),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 2300, 3580.0000, 1418.3000),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 2400, 3775.0000, 1493.3750),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1700, 2500, 3885.0000, 1535.7250),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 1900, 3303.0000, 1311.6550),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 2000, 3434.0000, 1362.0900),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 2100, 3527.0000, 1397.8950),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 2200, 3610.0000, 1429.8500),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 2300, 3714.0000, 1469.8900),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 2400, 3912.0000, 1546.1200),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1800, 2500, 4029.0000, 1591.1650),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 1900, 3372.0000, 1338.2200),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 2000, 3504.0000, 1389.0400),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 2100, 3602.0000, 1426.7700),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 2200, 3687.0000, 1459.4950),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 2300, 3794.0000, 1500.6900),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 2400, 3994.0000, 1577.6900),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 1900, 2500, 4114.0000, 1623.8900),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 1900, 3440.0000, 1364.4000),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 2000, 3575.0000, 1416.3750),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 2100, 3676.0000, 1455.2600),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 2200, 3764.0000, 1489.1400),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 2300, 3872.0000, 1530.7200),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 2400, 4076.0000, 1609.2600),
    ('FORMA PORTONCINI', 'Portoncino 2 ante', 'BM_FORMP2', 2000, 2500, 4199.0000, 1656.6150);

  SELECT count(*) INTO v_input_count FROM _ke_bei_portoncini_import;
  IF v_input_count <> 490 THEN
    RAISE EXCEPTION 'Portoncini import expected 490 rows, got %', v_input_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _ke_bei_portoncini_import
    GROUP BY series_name, category_name, tip_code, width_mm, height_mm
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Portoncini import contains duplicate dimensions for the same family.';
  END IF;

  -- 1) Macrocategories: one per NomeSerie.
  WITH macros AS (
    SELECT
      series_name,
      dense_rank() OVER (ORDER BY series_name) * 10 + 2300 AS sort_order
    FROM _ke_bei_portoncini_import
    GROUP BY series_name
  )
  INSERT INTO public.listino_macrocategorie (
    company_id, nome, descrizione, icona, colore, sort_order, attivo
  )
  SELECT
    v_company_id,
    series_name,
    NULL,
    'DoorOpen',
    '#1d4ed8',
    sort_order,
    true
  FROM macros
  ON CONFLICT (company_id, nome) DO UPDATE
    SET descrizione = NULL,
        icona = EXCLUDED.icona,
        colore = EXCLUDED.colore,
        sort_order = EXCLUDED.sort_order,
        attivo = true,
        updated_at = now();

  -- 2) Categories/families: DescrizTip is the display category and article name.
  WITH families AS (
    SELECT
      i.series_name,
      i.category_name,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.article_families existing
          WHERE existing.company_id = v_company_id
            AND existing.vertical = 'serramentista'
            AND existing.deleted_at IS NULL
            AND existing.nome = i.category_name
            AND NOT (
              COALESCE(existing.custom_field_values->>'source', '') = 'PORTONCINI in ALLUMINIO.xlsx'
              AND COALESCE(existing.custom_field_values->>'tip_code', '') = i.tip_code
            )
        )
          THEN i.category_name || ' · ' || i.tip_code
        ELSE i.category_name
      END AS display_name,
      i.tip_code,
      min(i.purchase_net) AS min_purchase_net,
      min(i.purchase_net * 2) AS min_sale_net,
      count(*) AS rows_count,
      dense_rank() OVER (ORDER BY i.series_name, i.category_name, i.tip_code) * 10 + 2300 AS sort_order
    FROM _ke_bei_portoncini_import i
    GROUP BY i.series_name, i.category_name, i.tip_code
  ), cats AS (
    INSERT INTO public.listino_categorie (
      company_id,
      macrocategoria_id,
      nome,
      descrizione,
      colore,
      icona,
      sort_order
    )
      SELECT
      v_company_id,
      lm.id,
      f.display_name,
      NULL,
      '#1d4ed8',
      'DoorOpen',
      f.sort_order
    FROM families f
    JOIN public.listino_macrocategorie lm
      ON lm.company_id = v_company_id
     AND lm.nome = f.series_name
    ON CONFLICT (company_id, nome) DO UPDATE
      SET macrocategoria_id = EXCLUDED.macrocategoria_id,
          descrizione = NULL,
          colore = EXCLUDED.colore,
          icona = EXCLUDED.icona,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_family_count FROM families;

  WITH families AS (
    SELECT
      i.series_name,
      i.category_name,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.article_families existing
          WHERE existing.company_id = v_company_id
            AND existing.vertical = 'serramentista'
            AND existing.deleted_at IS NULL
            AND existing.nome = i.category_name
            AND NOT (
              COALESCE(existing.custom_field_values->>'source', '') = 'PORTONCINI in ALLUMINIO.xlsx'
              AND COALESCE(existing.custom_field_values->>'tip_code', '') = i.tip_code
            )
        )
          THEN i.category_name || ' · ' || i.tip_code
        ELSE i.category_name
      END AS display_name,
      i.tip_code,
      min(i.purchase_net) AS min_purchase_net,
      min(i.purchase_net * 2) AS min_sale_net,
      count(*) AS rows_count,
      dense_rank() OVER (ORDER BY i.series_name, i.category_name, i.tip_code) * 10 + 2300 AS sort_order
    FROM _ke_bei_portoncini_import i
    GROUP BY i.series_name, i.category_name, i.tip_code
  )
  INSERT INTO public.article_families (
    company_id,
    vertical,
    categoria_id,
    nome,
    descrizione,
    modalita_prezzo_base,
    prezzo_base_mode,
    markup_tipo,
    markup_valore,
    prezzo_base_acquisto,
    prezzo_base_vendita,
    vat_rate,
    vat_rate_acquisto,
    unit_of_measure,
    griglia_asse_x_label,
    griglia_asse_y_label,
    griglia_unita,
    manodopera_modalita,
    manodopera_unita,
    custom_field_values,
    sort_order,
    attivo
  )
  SELECT
    v_company_id,
    'serramentista',
    lc.id,
    f.display_name,
    NULL,
    'griglia',
    'acquisto_markup',
    'percentuale',
    100,
    round(f.min_purchase_net, 4),
    round(f.min_sale_net, 4),
    10,
    22,
    'pz',
    'Larghezza (mm)',
    'Altezza (mm)',
    'mm',
    'nessuna',
    'pz',
    jsonb_build_object(
      'source', 'PORTONCINI in ALLUMINIO.xlsx',
      'nome_serie', f.series_name,
      'descrizione_tipologia', f.category_name,
      'display_name', f.display_name,
      'tip_code', f.tip_code,
      'pricing_rule', 'purchase_net = Scontato con Coprifili; sale_net = purchase_net * 2; vat_purchase = 22; vat_sale = 10',
      'rows_count', f.rows_count
    ),
    f.sort_order,
    true
  FROM families f
  JOIN public.listino_categorie lc
    ON lc.company_id = v_company_id
   AND lc.nome = f.display_name
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.article_families existing
    WHERE existing.company_id = v_company_id
      AND existing.vertical = 'serramentista'
      AND existing.deleted_at IS NULL
      AND existing.custom_field_values->>'source' = 'PORTONCINI in ALLUMINIO.xlsx'
      AND existing.custom_field_values->>'tip_code' = f.tip_code
  );

  -- Update all imported portoncini families so reruns repair existing data too.
  WITH families AS (
    SELECT
      i.series_name,
      i.category_name,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.article_families existing
          WHERE existing.company_id = v_company_id
            AND existing.vertical = 'serramentista'
            AND existing.deleted_at IS NULL
            AND existing.nome = i.category_name
            AND NOT (
              COALESCE(existing.custom_field_values->>'source', '') = 'PORTONCINI in ALLUMINIO.xlsx'
              AND COALESCE(existing.custom_field_values->>'tip_code', '') = i.tip_code
            )
        )
          THEN i.category_name || ' · ' || i.tip_code
        ELSE i.category_name
      END AS display_name,
      i.tip_code,
      min(i.purchase_net) AS min_purchase_net,
      min(i.purchase_net * 2) AS min_sale_net,
      count(*) AS rows_count,
      dense_rank() OVER (ORDER BY i.series_name, i.category_name, i.tip_code) * 10 + 2300 AS sort_order
    FROM _ke_bei_portoncini_import i
    GROUP BY i.series_name, i.category_name, i.tip_code
  )
  UPDATE public.article_families af
     SET categoria_id = lc.id,
         nome = f.display_name,
         descrizione = NULL,
         modalita_prezzo_base = 'griglia',
         prezzo_base_mode = 'acquisto_markup',
         markup_tipo = 'percentuale',
         markup_valore = 100,
         sconto_fornitore_1 = 0,
         sconto_fornitore_2 = 0,
         prezzo_base_acquisto = round(f.min_purchase_net, 4),
         prezzo_base_vendita = round(f.min_sale_net, 4),
         vat_rate = 10,
         vat_rate_acquisto = 22,
         unit_of_measure = 'pz',
         griglia_asse_x_label = 'Larghezza (mm)',
         griglia_asse_y_label = 'Altezza (mm)',
         griglia_unita = 'mm',
         manodopera_modalita = 'nessuna',
         manodopera_unita = 'pz',
         custom_field_values = COALESCE(af.custom_field_values, '{}'::jsonb) || jsonb_build_object(
           'source', 'PORTONCINI in ALLUMINIO.xlsx',
           'nome_serie', f.series_name,
           'descrizione_tipologia', f.category_name,
           'display_name', f.display_name,
           'tip_code', f.tip_code,
           'pricing_rule', 'purchase_net = Scontato con Coprifili; sale_net = purchase_net * 2; vat_purchase = 22; vat_sale = 10',
           'rows_count', f.rows_count
         ),
         sort_order = f.sort_order,
         attivo = true,
         updated_at = now()
    FROM families f
    JOIN public.listino_categorie lc
      ON lc.company_id = v_company_id
     AND lc.nome = f.display_name
   WHERE af.company_id = v_company_id
     AND af.vertical = 'serramentista'
     AND af.deleted_at IS NULL
     AND af.custom_field_values->>'source' = 'PORTONCINI in ALLUMINIO.xlsx'
     AND af.custom_field_values->>'tip_code' = f.tip_code;

  SELECT count(DISTINCT af.id)
    INTO v_family_count
  FROM _ke_bei_portoncini_import i
  JOIN public.article_families af
    ON af.company_id = v_company_id
   AND af.vertical = 'serramentista'
   AND af.deleted_at IS NULL
   AND af.custom_field_values->>'source' = 'PORTONCINI in ALLUMINIO.xlsx'
   AND af.custom_field_values->>'tip_code' = i.tip_code;

  IF v_family_count <> 5 THEN
    RAISE EXCEPTION 'Portoncini import expected 5 active families, found %', v_family_count;
  END IF;

  DELETE FROM public.listino_griglia lg
  USING public.article_families af
  WHERE lg.company_id = v_company_id
    AND lg.family_id = af.id
    AND af.company_id = v_company_id
    AND af.vertical = 'serramentista'
    AND af.deleted_at IS NULL
    AND af.custom_field_values->>'source' = 'PORTONCINI in ALLUMINIO.xlsx';

  INSERT INTO public.listino_griglia (
    company_id,
    family_id,
    valore_x,
    valore_y,
    prezzo_acquisto,
    prezzo_vendita,
    note
  )
  SELECT
    v_company_id,
    af.id,
    i.width_mm,
    i.height_mm,
    round(i.purchase_net, 4),
    round(i.purchase_net * 2, 4),
    concat(
      i.tip_code,
      ' | NomeSerie=', i.series_name,
      ' | CostoFin fornitore imponibile=', round(i.supplier_total_net, 4),
      ' | acquisto_scontato_con_coprifili_imponibile=', round(i.purchase_net, 4),
      ' | vendita_imponibile_markup_100=', round(i.purchase_net * 2, 4),
      ' | iva_acquisto=22 | iva_vendita=10'
    )
  FROM _ke_bei_portoncini_import i
  JOIN public.article_families af
    ON af.company_id = v_company_id
   AND af.vertical = 'serramentista'
   AND af.deleted_at IS NULL
   AND af.custom_field_values->>'source' = 'PORTONCINI in ALLUMINIO.xlsx'
   AND af.custom_field_values->>'tip_code' = i.tip_code;

  GET DIAGNOSTICS v_grid_count = ROW_COUNT;
  IF v_grid_count <> v_input_count THEN
    RAISE EXCEPTION 'Portoncini import expected to insert % grid cells, inserted %', v_input_count, v_grid_count;
  END IF;

  SELECT count(DISTINCT lm.id)
    INTO v_macro_count
  FROM public.listino_macrocategorie lm
  WHERE lm.company_id = v_company_id
    AND lm.nome IN (SELECT DISTINCT series_name FROM _ke_bei_portoncini_import);

  IF v_macro_count <> 2 THEN
    RAISE EXCEPTION 'Portoncini import expected 2 macrocategories, found %', v_macro_count;
  END IF;

  RAISE NOTICE 'Ke Bei listino repair/import completed: % persiane repaired, % portoncini macrocategories, % portoncini families, % portoncini grid cells.', v_persiane_repaired, v_macro_count, v_family_count, v_grid_count;
END $$;
