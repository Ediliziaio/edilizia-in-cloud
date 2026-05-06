-- MP-OPS-07 — Pianificazione Multi-Cantiere
-- ════════════════════════════════════════════════════════════════════════════
-- Gantt cross-cantiere con AI conflict detection.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cantiere_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  resource_type   text NOT NULL CHECK (resource_type IN ('employee','subcontractor','mezzo','capomastro')),
  employee_id     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  subcontractor_id uuid REFERENCES public.subappaltatori(id) ON DELETE SET NULL,
  mezzo_id        uuid,  -- mezzi può non esistere come tabella; campo libero per ora

  start_date      date NOT NULL,
  end_date        date NOT NULL,
  hours_per_day   numeric(4,2) DEFAULT 8,

  status          text NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned','confirmed','in_progress','completed','cancelled','conflict'
  )),

  conflict_with   uuid REFERENCES public.cantiere_allocations(id),

  ai_suggested    boolean DEFAULT false,
  ai_reasoning    text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alloc_company_dates ON public.cantiere_allocations(company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_alloc_employee ON public.cantiere_allocations(employee_id, start_date) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alloc_status ON public.cantiere_allocations(status);

ALTER TABLE public.cantiere_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alloc_company ON public.cantiere_allocations;
CREATE POLICY alloc_company ON public.cantiere_allocations
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- View conflitti rilevati
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.allocation_conflicts AS
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
  AND a1.id < a2.id
  AND a1.start_date <= a2.end_date
  AND a2.start_date <= a1.end_date
WHERE a1.employee_id IS NOT NULL
  AND a1.status NOT IN ('cancelled','completed')
  AND a2.status NOT IN ('cancelled','completed');

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_pianifica_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_pianifica_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_resources jsonb,  -- [{resource_type,employee_id,start_date,end_date,hours_per_day}]
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item jsonb; v_inserted int := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_resources) LOOP
    INSERT INTO public.cantiere_allocations(
      company_id, cantiere_id, resource_type, employee_id, subcontractor_id, mezzo_id,
      start_date, end_date, hours_per_day, status, ai_suggested
    )
    VALUES (
      p_company_id, p_cantiere_id,
      COALESCE(v_item->>'resource_type', 'employee'),
      (v_item->>'employee_id')::uuid,
      (v_item->>'subcontractor_id')::uuid,
      (v_item->>'mezzo_id')::uuid,
      COALESCE((v_item->>'start_date')::date, p_start_date, current_date),
      COALESCE((v_item->>'end_date')::date, p_end_date, (current_date + interval '7 days')::date),
      COALESCE((v_item->>'hours_per_day')::numeric, 8),
      'planned',
      COALESCE((v_item->>'ai_suggested')::boolean, false)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cantiere_id', p_cantiere_id, 'allocations_inserted', v_inserted);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_pianifica_cantiere(uuid, uuid, jsonb, date, date) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_ottimizza_allocazioni_settimana
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_ottimizza_allocazioni_settimana(
  p_company_id uuid,
  p_start_date date DEFAULT current_date,
  p_scenario text DEFAULT 'balanced'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Placeholder: edge function ai-multicantiere-planner risolve constraints
  RETURN jsonb_build_object(
    'ok', true,
    'start_date', p_start_date,
    'scenario', p_scenario,
    'next_step', 'edge:ai-multicantiere-planner produce action proposal'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_ottimizza_allocazioni_settimana(uuid, date, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_identifica_conflitti_allocazione
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_identifica_conflitti_allocazione(
  p_company_id uuid
)
RETURNS TABLE (
  conflict_id_1 uuid,
  conflict_id_2 uuid,
  employee_id uuid,
  cantiere_1 uuid,
  cantiere_2 uuid,
  overlap_start date,
  overlap_end date
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.conflict_id_1, c.conflict_id_2, c.employee_id, c.cantiere_1, c.cantiere_2, c.overlap_start, c.overlap_end
  FROM public.allocation_conflicts c
  WHERE c.company_id = p_company_id;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_identifica_conflitti_allocazione(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_prevedi_impatto_ritardo
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_prevedi_impatto_ritardo(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_delay_days int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count_alloc int; v_other_cantieri int;
BEGIN
  SELECT count(*) INTO v_count_alloc
  FROM public.cantiere_allocations
  WHERE company_id = p_company_id AND cantiere_id = p_cantiere_id
    AND status IN ('planned','confirmed','in_progress');

  SELECT count(DISTINCT cantiere_id) INTO v_other_cantieri
  FROM public.cantiere_allocations
  WHERE company_id = p_company_id
    AND cantiere_id <> p_cantiere_id
    AND start_date BETWEEN current_date AND (current_date + make_interval(days => p_delay_days + 30))
    AND status IN ('planned','confirmed');

  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'delay_days', p_delay_days,
    'allocazioni_impattate', v_count_alloc,
    'altri_cantieri_potenzialmente_impattati', v_other_cantieri
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_prevedi_impatto_ritardo(uuid, uuid, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_sposta_allocazione
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_sposta_allocazione(
  p_company_id uuid,
  p_allocation_id uuid,
  p_new_start date,
  p_new_end date,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.cantiere_allocations
     SET start_date = p_new_start,
         end_date = p_new_end,
         ai_reasoning = COALESCE(ai_reasoning || ' | ', '') || COALESCE(p_reason, ''),
         updated_at = now()
   WHERE id = p_allocation_id AND company_id = p_company_id;

  RETURN jsonb_build_object('ok', true, 'allocation_id', p_allocation_id, 'new_start', p_new_start, 'new_end', p_new_end);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_sposta_allocazione(uuid, uuid, date, date, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-OPS-07 deployed: cantiere_allocations + view + 5 RPC'; END $$;
