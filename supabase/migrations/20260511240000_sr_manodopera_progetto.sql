-- ═══════════════════════════════════════════════════════════════════════════
-- Serramenti — sr_manodopera_progetto
-- ---------------------------------------------------------------------------
-- Tabella parallela a fv_manodopera_progetto: lega le voci di manodopera
-- selezionate dal catalogo `tariffe_aziendali` (+ varianti costo) al
-- progetto Serramenti. La somma di queste righe entra nel calcolo del
-- prezzo finale (StepEconomia).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.sr_manodopera_progetto (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id     uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position        int NOT NULL DEFAULT 0,

  -- Riferimento catalogo
  tariffa_id      uuid REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL,
  variante_id     uuid REFERENCES public.tariffa_costi_varianti(id) ON DELETE SET NULL,

  -- Snapshot (così se l'azienda modifica il catalogo, il preventivo non cambia)
  descrizione     text NOT NULL,
  unita           text,                 -- 'ora', 'giornata', 'mq', 'pezzo', 'cantiere'
  quantita        numeric(10,2) NOT NULL DEFAULT 1,
  prezzo_unitario_costo   numeric(10,2),
  prezzo_unitario_vendita numeric(10,2),
  prezzo_totale_costo     numeric(12,2),
  prezzo_totale_vendita   numeric(12,2),

  note            text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_manodopera_progetto_idx
  ON public.sr_manodopera_progetto(progetto_id, position);
CREATE INDEX IF NOT EXISTS sr_manodopera_company_idx
  ON public.sr_manodopera_progetto(company_id);

-- Trigger updated_at (riusa il trigger function di sr_progetti)
DROP TRIGGER IF EXISTS sr_manodopera_touch ON public.sr_manodopera_progetto;
CREATE TRIGGER sr_manodopera_touch
  BEFORE UPDATE ON public.sr_manodopera_progetto
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_touch_updated_at();

-- RLS coerente con altre tabelle sr_*
ALTER TABLE public.sr_manodopera_progetto ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS sr_manodopera_progetto_select ON public.sr_manodopera_progetto;
  CREATE POLICY sr_manodopera_progetto_select ON public.sr_manodopera_progetto FOR SELECT
    USING (company_id = public.get_my_company_id() OR public.is_super_admin());
  DROP POLICY IF EXISTS sr_manodopera_progetto_insert ON public.sr_manodopera_progetto;
  CREATE POLICY sr_manodopera_progetto_insert ON public.sr_manodopera_progetto FOR INSERT
    WITH CHECK (company_id = public.get_my_company_id() OR public.is_super_admin());
  DROP POLICY IF EXISTS sr_manodopera_progetto_update ON public.sr_manodopera_progetto;
  CREATE POLICY sr_manodopera_progetto_update ON public.sr_manodopera_progetto FOR UPDATE
    USING (company_id = public.get_my_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.get_my_company_id() OR public.is_super_admin());
  DROP POLICY IF EXISTS sr_manodopera_progetto_delete ON public.sr_manodopera_progetto;
  CREATE POLICY sr_manodopera_progetto_delete ON public.sr_manodopera_progetto FOR DELETE
    USING (company_id = public.get_my_company_id() OR public.is_super_admin());
END $$;

COMMIT;
