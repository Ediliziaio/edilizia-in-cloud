-- ============================================================================
-- Avanzamento commessa derivato dalle fasi (rollup server-side)
-- ============================================================================
-- Prima: orders.percentuale_avanzamento era aggiornato solo client-side
-- (CampoRapportino, Math.max) o a mano dall'ufficio → incoerente con le fasi.
-- Ora: se la commessa HA fasi (order_work_phases), la % ordine è DERIVATA
-- come media delle percentuali fase (completata = 100), ricalcolata da trigger
-- a ogni insert/update/delete di fase. Senza fasi, comportamento invariato.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recompute_order_progress(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct integer;
BEGIN
  SELECT round(avg(
           CASE WHEN status = 'completata' THEN 100
                ELSE LEAST(100, GREATEST(COALESCE(percentuale, 0), 0))
           END
         ))::int
    INTO v_pct
    FROM public.order_work_phases
   WHERE order_id = p_order_id;

  -- Nessuna fase configurata: la % ordine resta gestita come oggi
  IF v_pct IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.orders
     SET percentuale_avanzamento = v_pct
   WHERE id = p_order_id
     AND COALESCE(percentuale_avanzamento, -1) <> v_pct;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_owp_recompute_order_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_order_progress(COALESCE(NEW.order_id, OLD.order_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_work_phases_progress ON public.order_work_phases;
CREATE TRIGGER trg_order_work_phases_progress
AFTER INSERT OR DELETE OR UPDATE OF percentuale, status ON public.order_work_phases
FOR EACH ROW EXECUTE FUNCTION public.trg_owp_recompute_order_progress();

-- Backfill una tantum: allinea le commesse che hanno già fasi
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT order_id FROM public.order_work_phases LOOP
    PERFORM public.recompute_order_progress(r.order_id);
  END LOOP;
END $$;
