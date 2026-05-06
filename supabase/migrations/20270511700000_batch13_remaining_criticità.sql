-- MP-Batch13 — Hotfix3: criticità rimanenti audit precedente
-- ════════════════════════════════════════════════════════════════════════════
-- 1. pratiche_edilizie.cantiere_id ON DELETE CASCADE → SET NULL (preservare storico)
-- 2. commercial_proposals.quote_id ON DELETE CASCADE → SET NULL (preservare storico)
-- 3. companies.cfo_weekly_report_day CHECK enum giorno settimana
-- 4. companies.cfo_weekly_report_hour CHECK 0..23
-- 5. allocation_conflicts view: aggiunge filter esplicito company_id sul JOIN
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 1 — pratiche_edilizie.cantiere_id: CASCADE → SET NULL
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_cn text;
BEGIN
  SELECT constraint_name INTO v_cn
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'pratiche_edilizie'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%cantiere_id%';
  IF v_cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pratiche_edilizie DROP CONSTRAINT %I', v_cn);
  END IF;
  ALTER TABLE public.pratiche_edilizie
    ADD CONSTRAINT pratiche_edilizie_cantiere_id_fkey
      FOREIGN KEY (cantiere_id) REFERENCES public.orders(id) ON DELETE SET NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 2 — commercial_proposals.quote_id: CASCADE → SET NULL
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_cn text;
BEGIN
  SELECT constraint_name INTO v_cn
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'commercial_proposals'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%quote_id%';
  IF v_cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.commercial_proposals DROP CONSTRAINT %I', v_cn);
  END IF;
  ALTER TABLE public.commercial_proposals
    ADD CONSTRAINT commercial_proposals_quote_id_fkey
      FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 3 — companies.cfo_weekly_report_day CHECK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'companies_cfo_weekly_report_day_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_cfo_weekly_report_day_check
      CHECK (cfo_weekly_report_day IS NULL OR cfo_weekly_report_day IN (
        'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
      ));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 4 — companies.cfo_weekly_report_hour CHECK 0..23
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'companies_cfo_weekly_report_hour_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_cfo_weekly_report_hour_check
      CHECK (cfo_weekly_report_hour IS NULL OR cfo_weekly_report_hour BETWEEN 0 AND 23);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 5 — allocation_conflicts view: aggiunge filter esplicito company_id sul JOIN
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.allocation_conflicts;
CREATE VIEW public.allocation_conflicts
WITH (security_invoker = true) AS
SELECT
  a1.id AS conflict_id_1,
  a2.id AS conflict_id_2,
  a1.company_id,
  a1.employee_id,
  a1.cantiere_id AS cantiere_1,
  a2.cantiere_id AS cantiere_2,
  GREATEST(a1.start_date, a2.start_date) AS overlap_start,
  LEAST(a1.end_date, a2.end_date) AS overlap_end
FROM public.cantiere_allocations a1
JOIN public.cantiere_allocations a2
  ON a1.employee_id = a2.employee_id
  AND a1.company_id = a2.company_id
  AND a1.id < a2.id
  AND a1.start_date <= a2.end_date
  AND a2.start_date <= a1.end_date
WHERE a1.employee_id IS NOT NULL
  AND a1.status NOT IN ('cancelled','completed')
  AND a2.status NOT IN ('cancelled','completed');

DO $$ BEGIN RAISE NOTICE 'MP-Batch13 hotfix3: 5 criticità rimanenti corrette'; END $$;
