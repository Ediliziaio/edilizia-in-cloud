-- Seed budget annuale 2026 Demo Azienda
DO $$
DECLARE v_company_id uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cg_budget WHERE company_id = v_company_id AND anno = 2026) THEN
    INSERT INTO public.cg_budget (company_id, anno, codice, importo, note) VALUES
      (v_company_id, 2026, '01', 850000, 'Budget ricavi vendite 2026 (+12% vs 2025)'),
      (v_company_id, 2026, '03', 280000, 'Acquisti materie prime (target 33% PIL)'),
      (v_company_id, 2026, '05', 95000,  'Costi produttivi (subappalti, posa)'),
      (v_company_id, 2026, '06', 195000, 'Costo personale (target 23% PIL)'),
      (v_company_id, 2026, '07', 28000,  'Costi commerciali (pubblicità + provvigioni)'),
      (v_company_id, 2026, '08', 42000,  'Costi amministrativi'),
      (v_company_id, 2026, '09', 48000,  'Ammortamenti programmati'),
      (v_company_id, 2026, '10', 18000,  'Oneri tributari'),
      (v_company_id, 2026, '11', 22000,  'Oneri finanziari (rate mutui)'),
      (v_company_id, 2026, '13', 5000,   'Ricavi extra-gestione attesi'),
      (v_company_id, 2026, '14', 3000,   'Costi extra-gestione'),
      (v_company_id, 2026, '15', 35000,  'Imposte stimate (IRES+IRAP)');
  END IF;
END $$;
