-- MP-CG-01 / 1.2 — Patrimonio netto (snapshot annuale)
-- Alimenta lo Stato Patrimoniale lato Mezzi Propri.

CREATE TABLE IF NOT EXISTS public.patrimonio_netto (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio                int  NOT NULL CHECK (esercizio BETWEEN 2000 AND 2100),
  capitale_sociale         numeric(14,2) NOT NULL DEFAULT 0,
  riserva_legale           numeric(14,2) NOT NULL DEFAULT 0,
  riserva_straordinaria    numeric(14,2) NOT NULL DEFAULT 0,
  altre_riserve            numeric(14,2) NOT NULL DEFAULT 0,
  utili_perdite_a_nuovo    numeric(14,2) NOT NULL DEFAULT 0,
  utile_perdita_esercizio  numeric(14,2) NOT NULL DEFAULT 0,
  fondo_tfr                numeric(14,2) NOT NULL DEFAULT 0,
  fondo_rischi             numeric(14,2) NOT NULL DEFAULT 0,
  altri_fondi              numeric(14,2) NOT NULL DEFAULT 0,
  fonte                    text NOT NULL DEFAULT 'manuale'
                           CHECK (fonte IN ('manuale','import_xbrl','wizard','commercialista')),
  data_chiusura_bilancio   date,
  note                     text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES auth.users(id),
  UNIQUE (company_id, esercizio)
);

CREATE INDEX IF NOT EXISTS idx_pn_company_esercizio ON public.patrimonio_netto(company_id, esercizio DESC);

ALTER TABLE public.patrimonio_netto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pn_select" ON public.patrimonio_netto FOR SELECT
  USING (company_id = public.get_my_company_id());

CREATE POLICY "pn_insert" ON public.patrimonio_netto FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "pn_update" ON public.patrimonio_netto FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "pn_delete" ON public.patrimonio_netto FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE TRIGGER trg_pn_updated_at BEFORE UPDATE ON public.patrimonio_netto
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.patrimonio_netto IS 'Snapshot annuale dei mezzi propri (capitale, riserve, utili). Una riga per esercizio.';
