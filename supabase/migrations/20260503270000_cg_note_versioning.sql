-- MP-CG-16 — Note esplicative + Versioning Piano Industriale
--
-- 1) cg_note_voci: campo "appunti del controller" su qualunque voce
--    di prospetto (CE/SP/PFN/Cash Flow). chiave: (anno, scope, codice_voce)
-- 2) cg_piano_snapshots: salva snapshot del piano industriale per confronto
--    versioni successive.

-- ── 1) cg_note_voci ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cg_note_voci (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anno         int NOT NULL,
  scope        text NOT NULL,         -- 'CE','SP','PFN','CASHFLOW','BUDGET','PIANO'
  codice_voce  text NOT NULL,
  contenuto    text NOT NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cg_note_voci_unique UNIQUE (company_id, anno, scope, codice_voce)
);

CREATE INDEX IF NOT EXISTS idx_cg_note_voci_company_anno
  ON public.cg_note_voci(company_id, anno, scope);

ALTER TABLE public.cg_note_voci ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_note_voci_select ON public.cg_note_voci;
CREATE POLICY cg_note_voci_select ON public.cg_note_voci FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_note_voci_insert ON public.cg_note_voci;
CREATE POLICY cg_note_voci_insert ON public.cg_note_voci FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_note_voci_update ON public.cg_note_voci;
CREATE POLICY cg_note_voci_update ON public.cg_note_voci FOR UPDATE
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_note_voci_delete ON public.cg_note_voci;
CREATE POLICY cg_note_voci_delete ON public.cg_note_voci FOR DELETE
  USING (company_id = public.get_my_company_id());

DROP TRIGGER IF EXISTS trg_cg_note_voci_updated_at ON public.cg_note_voci;
CREATE TRIGGER trg_cg_note_voci_updated_at
  BEFORE UPDATE ON public.cg_note_voci
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cg_note_voci IS
  'Note esplicative del controller su voci specifiche dei prospetti.';

-- ── 2) cg_piano_snapshots ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cg_piano_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scenario_id     uuid,
  versione_label  text NOT NULL,           -- es. "v1.0 — Baseline approvato CdA"
  snapshot_data   jsonb NOT NULL,           -- Snapshot completo del piano (assumptions + risultato simulazione)
  note            text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cg_piano_snapshots_company
  ON public.cg_piano_snapshots(company_id, created_at DESC);

ALTER TABLE public.cg_piano_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_piano_snap_select ON public.cg_piano_snapshots;
CREATE POLICY cg_piano_snap_select ON public.cg_piano_snapshots FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_piano_snap_insert ON public.cg_piano_snapshots;
CREATE POLICY cg_piano_snap_insert ON public.cg_piano_snapshots FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_piano_snap_delete ON public.cg_piano_snapshots;
CREATE POLICY cg_piano_snap_delete ON public.cg_piano_snapshots FOR DELETE
  USING (company_id = public.get_my_company_id());

COMMENT ON TABLE public.cg_piano_snapshots IS
  'Versioning del piano industriale: snapshot completi per confronti storici.';
