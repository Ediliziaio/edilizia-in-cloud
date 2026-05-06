-- IMPROVEMENT #13 — Versioning listino_griglia
-- ════════════════════════════════════════════════════════════════════════════
-- Trigger AFTER UPDATE/DELETE che salva snapshot della riga precedente in
-- listino_griglia_history. Permette audit + rollback.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.listino_griglia_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  griglia_id uuid NOT NULL,
  company_id uuid NOT NULL,
  family_id uuid NOT NULL,

  -- Snapshot completo della riga al momento del cambio
  valore_x numeric,
  valore_y numeric,
  prezzo_acquisto numeric,
  prezzo_vendita numeric,

  operation text NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  changed_by uuid,
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listino_history_griglia ON public.listino_griglia_history(griglia_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listino_history_family ON public.listino_griglia_history(family_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listino_history_company ON public.listino_griglia_history(company_id, changed_at DESC);

ALTER TABLE public.listino_griglia_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listino_history_company ON public.listino_griglia_history;
CREATE POLICY listino_history_company ON public.listino_griglia_history
  FOR SELECT USING (company_id = public.get_my_company_id());

-- Trigger function
CREATE OR REPLACE FUNCTION public.tg_listino_griglia_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Salva solo se è cambiato qualcosa di rilevante
    IF (OLD.prezzo_vendita IS DISTINCT FROM NEW.prezzo_vendita) OR
       (OLD.prezzo_acquisto IS DISTINCT FROM NEW.prezzo_acquisto) OR
       (OLD.valore_x IS DISTINCT FROM NEW.valore_x) OR
       (OLD.valore_y IS DISTINCT FROM NEW.valore_y) THEN
      INSERT INTO public.listino_griglia_history(
        griglia_id, company_id, family_id,
        valore_x, valore_y, prezzo_acquisto, prezzo_vendita,
        operation, changed_by
      )
      VALUES (
        OLD.id, OLD.company_id, OLD.family_id,
        OLD.valore_x, OLD.valore_y, OLD.prezzo_acquisto, OLD.prezzo_vendita,
        'UPDATE', auth.uid()
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.listino_griglia_history(
      griglia_id, company_id, family_id,
      valore_x, valore_y, prezzo_acquisto, prezzo_vendita,
      operation, changed_by
    )
    VALUES (
      OLD.id, OLD.company_id, OLD.family_id,
      OLD.valore_x, OLD.valore_y, OLD.prezzo_acquisto, OLD.prezzo_vendita,
      'DELETE', auth.uid()
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_listino_griglia_history ON public.listino_griglia;
CREATE TRIGGER trg_listino_griglia_history
  AFTER UPDATE OR DELETE ON public.listino_griglia
  FOR EACH ROW EXECUTE FUNCTION public.tg_listino_griglia_history();

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_lista_storico_prezzi_griglia
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_storico_prezzi_griglia(
  p_company_id uuid,
  p_family_id uuid,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  griglia_id uuid,
  valore_x numeric,
  valore_y numeric,
  prezzo_acquisto numeric,
  prezzo_vendita numeric,
  operation text,
  changed_by uuid,
  changed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT h.id, h.griglia_id, h.valore_x, h.valore_y, h.prezzo_acquisto, h.prezzo_vendita,
    h.operation, h.changed_by, h.changed_at
  FROM public.listino_griglia_history h
  WHERE h.company_id = p_company_id AND h.family_id = p_family_id
  ORDER BY h.changed_at DESC
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_storico_prezzi_griglia(uuid, uuid, int) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Listino versioning: trigger + RPC pronti'; END $$;
