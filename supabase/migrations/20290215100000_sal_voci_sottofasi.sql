-- Il verbale SAL con le sottofasi (10/11/2026, docs/piano-verbale-sal-sottofasi.md, lotto A).
--
-- Sotto ogni voce di fase del verbale, le sue sottofasi: importo, quantità, avanzamento. Stanno in
-- una tabella a parte, figlia di sal_voci, e NON entrano in nessun totale: importo del SAL,
-- certificato, rate e fattura restano la somma delle sole sal_voci, come prima. Così nessuna delle
-- letture che sommano sal_voci (fattura dai lavori, riepilogo commessa, PDF commessa, AI) cambia.
--
-- Le regole d'accesso sono quelle della voce madre: legge chi vede la commessa, scrive chi la può
-- modificare. Una sottofase deve essere della stessa fase della voce.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.sal_voci_sottofasi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voce_id uuid NOT NULL REFERENCES public.sal_voci(id) ON DELETE CASCADE,
  sottofase_id uuid REFERENCES public.order_work_subphases(id) ON DELETE SET NULL,
  posizione integer NOT NULL DEFAULT 0,
  descrizione text NOT NULL CHECK (length(btrim(descrizione)) > 0),
  unita text,
  quantita_contratto numeric(14,3) CHECK (quantita_contratto IS NULL OR quantita_contratto >= 0),
  quantita_a_oggi numeric(14,3) CHECK (quantita_a_oggi IS NULL OR quantita_a_oggi >= 0),
  importo_contrattuale numeric(14,2) CHECK (importo_contrattuale IS NULL OR importo_contrattuale >= 0),
  percentuale_avanzamento numeric(5,2) NOT NULL CHECK (percentuale_avanzamento BETWEEN 0 AND 100),
  importo_sal numeric(14,2) GENERATED ALWAYS AS (round(coalesce(importo_contrattuale, 0) * percentuale_avanzamento / 100, 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sal_voci_sottofasi IS 'Dettaglio per sottofase di una voce del verbale SAL. Solo dettaglio: i totali del SAL sommano sal_voci.';

CREATE INDEX IF NOT EXISTS sal_voci_sottofasi_voce_idx ON public.sal_voci_sottofasi (voce_id, posizione);
CREATE INDEX IF NOT EXISTS sal_voci_sottofasi_sottofase_idx ON public.sal_voci_sottofasi (sottofase_id) WHERE sottofase_id IS NOT NULL;

-- La sottofase è della fase della voce (e quindi della stessa commessa).
CREATE OR REPLACE FUNCTION public.sal_voci_sottofasi_stessa_fase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_fase uuid;
BEGIN
  IF new.sottofase_id IS NULL THEN RETURN new; END IF;
  SELECT v.fase_id INTO v_fase FROM public.sal_voci v WHERE v.id = new.voce_id;
  IF v_fase IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.order_work_subphases s WHERE s.id = new.sottofase_id AND s.phase_id = v_fase
  ) THEN
    RAISE EXCEPTION 'La sottofase non è della fase di questa voce del SAL.' USING errcode = '23514';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.sal_voci_sottofasi_stessa_fase() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sal_voci_sottofasi_stessa_fase ON public.sal_voci_sottofasi;
CREATE TRIGGER trg_sal_voci_sottofasi_stessa_fase
  BEFORE INSERT OR UPDATE OF sottofase_id, voce_id ON public.sal_voci_sottofasi
  FOR EACH ROW EXECUTE FUNCTION public.sal_voci_sottofasi_stessa_fase();

ALTER TABLE public.sal_voci_sottofasi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sal_voci_sottofasi FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sal_voci_sottofasi TO authenticated;

DROP POLICY IF EXISTS sal_voci_sottofasi_lettura ON public.sal_voci_sottofasi;
CREATE POLICY sal_voci_sottofasi_lettura ON public.sal_voci_sottofasi FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sal_voci v JOIN public.sal_records s ON s.id = v.sal_id
                  WHERE v.id = sal_voci_sottofasi.voce_id AND public.puo_vedere_commessa(s.order_id)));

DROP POLICY IF EXISTS sal_voci_sottofasi_scrittura ON public.sal_voci_sottofasi;
CREATE POLICY sal_voci_sottofasi_scrittura ON public.sal_voci_sottofasi FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sal_voci v JOIN public.sal_records s ON s.id = v.sal_id
                  WHERE v.id = sal_voci_sottofasi.voce_id AND public.puo_modificare_commessa(s.order_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sal_voci v JOIN public.sal_records s ON s.id = v.sal_id
                  WHERE v.id = sal_voci_sottofasi.voce_id AND public.puo_modificare_commessa(s.order_id)));

DROP POLICY IF EXISTS sal_voci_sottofasi_superadmin ON public.sal_voci_sottofasi;
CREATE POLICY sal_voci_sottofasi_superadmin ON public.sal_voci_sottofasi FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));
