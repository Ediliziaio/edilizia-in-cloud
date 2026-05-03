-- MP-CG-01 / 1.1 — Cespiti (immobilizzazioni con piano di ammortamento)
-- Alimenta lo Stato Patrimoniale (Attivo Fisso) e il CE (riga Ammortamenti).

CREATE TABLE IF NOT EXISTS public.cespiti (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sede_id         uuid REFERENCES public.sedi(id) ON DELETE SET NULL,
  codice          text,
  descrizione     text NOT NULL,
  categoria       text NOT NULL CHECK (categoria IN ('immateriale','materiale','finanziaria')),
  sottocategoria  text,
  data_acquisto   date NOT NULL,
  costo_storico   numeric(14,2) NOT NULL CHECK (costo_storico >= 0),
  fondo_amm       numeric(14,2) NOT NULL DEFAULT 0 CHECK (fondo_amm >= 0),
  aliquota_amm    numeric(5,2)  NOT NULL DEFAULT 0
                  CHECK (aliquota_amm >= 0 AND aliquota_amm <= 100),
  vita_utile_mesi int,
  data_dismissione date,
  valore_residuo  numeric(14,2) GENERATED ALWAYS AS (greatest(costo_storico - fondo_amm, 0)) STORED,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  is_active       boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_cespiti_company   ON public.cespiti(company_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cespiti_categoria ON public.cespiti(company_id, categoria);
CREATE INDEX IF NOT EXISTS idx_cespiti_acquisto  ON public.cespiti(company_id, data_acquisto);

ALTER TABLE public.cespiti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cespiti_select" ON public.cespiti FOR SELECT
  USING (company_id = public.get_my_company_id());

CREATE POLICY "cespiti_insert" ON public.cespiti FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "cespiti_update" ON public.cespiti FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "cespiti_delete" ON public.cespiti FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE TRIGGER trg_cespiti_updated_at BEFORE UPDATE ON public.cespiti
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cespiti IS 'Immobilizzazioni con piano amm.to. Alimenta SP (Attivo Fisso) e CE (Ammortamenti).';
