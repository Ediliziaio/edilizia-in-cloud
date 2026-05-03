-- MP-CG-10b — Seed Demo Azienda con dati Cash Flow + mutui
-- Idempotente: usa ON CONFLICT DO NOTHING dove possibile.

DO $$
DECLARE
  v_company_id uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29';
BEGIN
  -- Mutuo MLT esempio
  IF NOT EXISTS (SELECT 1 FROM public.cg_loans WHERE company_id = v_company_id) THEN
    INSERT INTO public.cg_loans (
      company_id, banca, descrizione,
      capitale_iniziale, capitale_residuo,
      tasso_pct, rata_mensile,
      durata_mesi, rate_pagate,
      data_inizio, data_fine, is_active
    ) VALUES
      (v_company_id, 'Banca Intesa', 'Mutuo capannone Via Verdi',
       250000, 187500, 4.250, 2350, 120, 30,
       '2024-01-01', '2034-01-01', true),
      (v_company_id, 'BPM',          'Mutuo escavatori CAT',
       80000,  56000, 3.900, 1450, 60,  18,
       '2025-01-01', '2030-01-01', true);
  END IF;

  -- Voci manuali Cash Flow per i prossimi mesi
  IF NOT EXISTS (SELECT 1 FROM public.cg_cash_flow_manuali WHERE company_id = v_company_id) THEN
    INSERT INTO public.cg_cash_flow_manuali (company_id, anno, mese, tipo, categoria, descrizione, importo) VALUES
      -- Maggio
      (v_company_id, 2026, 5, 'uscita', 'F24', 'F24 — Versamento IVA mensile', 8500),
      (v_company_id, 2026, 5, 'uscita', 'IRPEF', 'F24 — Ritenute IRPEF dipendenti', 3200),
      (v_company_id, 2026, 5, 'entrata', 'Anticipo cliente', 'Anticipo cantiere Via Manzoni', 25000),
      -- Giugno
      (v_company_id, 2026, 6, 'uscita', 'F24', 'F24 — Versamento IVA + INPS', 12000),
      (v_company_id, 2026, 6, 'uscita', 'Imposte', 'IRES saldo + acconto', 18500),
      (v_company_id, 2026, 6, 'uscita', 'IRAP', 'IRAP saldo + acconto', 4200),
      -- Luglio
      (v_company_id, 2026, 7, 'uscita', 'F24', 'F24 — IVA mensile', 7800),
      (v_company_id, 2026, 7, 'entrata', 'SAL', 'SAL 50% cantiere Manzoni', 45000),
      (v_company_id, 2026, 7, 'uscita', 'TFR', 'Liquidazione TFR dimissionario', 8500),
      -- Agosto
      (v_company_id, 2026, 8, 'uscita', 'F24', 'F24 — IVA + ferie', 9500),
      (v_company_id, 2026, 8, 'uscita', '13a/14a', 'Mensilità aggiuntiva ferie agosto', 18000),
      -- Settembre
      (v_company_id, 2026, 9, 'uscita', 'F24', 'F24 — IVA + acconto novembre', 11000),
      (v_company_id, 2026, 9, 'entrata', 'SAL', 'SAL 30% cantiere Manzoni', 27000),
      -- Ottobre / Novembre / Dicembre
      (v_company_id, 2026, 10, 'uscita', 'F24', 'F24 — IVA mensile', 8200),
      (v_company_id, 2026, 11, 'uscita', 'Acconto', 'IRES acconto novembre', 15000),
      (v_company_id, 2026, 12, 'uscita', '13a',     'Tredicesima', 22000),
      (v_company_id, 2026, 12, 'entrata', 'SAL fin.', 'SAL finale cantiere Manzoni', 38000),
      (v_company_id, 2026, 12, 'uscita', 'F24', 'F24 — IVA dicembre', 9800);
  END IF;

  -- Patcha bank_accounts per Demo se nessuno ha balance
  UPDATE public.bank_accounts
     SET current_balance = 45000, available_balance = 45000, is_active = true
   WHERE company_id = v_company_id
     AND (current_balance IS NULL OR current_balance = 0);

  -- Se non c'è alcun bank_account, creane uno fittizio per il flusso
  -- (gli altri seed di Demo non garantiscono che esistano)
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE company_id = v_company_id) THEN
    -- Si serve di una connection_id qualunque (Demo seed non guarantee). Skip se non esiste.
    NULL;
  END IF;
END $$;
