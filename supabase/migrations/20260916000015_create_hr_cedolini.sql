-- Tabella cedolini (buste paga) per dipendenti
CREATE TABLE IF NOT EXISTS public.hr_cedolini (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  anno integer NOT NULL,
  mese integer NOT NULL CHECK (mese BETWEEN 1 AND 12),
  lordo numeric(10,2),
  contributi_dipendente numeric(10,2),
  ritenute_irpef numeric(10,2),
  netto numeric(10,2),
  ore_lavorate numeric(6,2),
  ore_straordinario numeric(6,2),
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','emesso','pagato')),
  pdf_url text,
  note text,
  data_emissione date,
  data_pagamento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, anno, mese)
);

-- Completa le estensioni AI che nello storico precedevano la tabella base.
ALTER TABLE public.hr_cedolini
  ADD COLUMN IF NOT EXISTS generation_method text NOT NULL DEFAULT 'manual'
    CHECK (generation_method IN ('manual','auto_ai','imported')),
  ADD COLUMN IF NOT EXISTS ai_persona_used text DEFAULT 'hr',
  ADD COLUMN IF NOT EXISTS ai_cost_billed_eur numeric(10,4),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2),

  -- Aggregati origine
  ADD COLUMN IF NOT EXISTS source_rapportini_ids uuid[],

  -- Breakdown ore dettagliato
  ADD COLUMN IF NOT EXISTS ore_ordinarie numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_straordinario_25 numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_straordinario_50 numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_straordinario_100 numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_assenza_giustificate numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_assenza_non_giustificate numeric(6,2),

  -- Indennità CCNL Edile
  ADD COLUMN IF NOT EXISTS indennita_trasferta_eur numeric(8,2),
  ADD COLUMN IF NOT EXISTS indennita_alta_quota_eur numeric(8,2),
  ADD COLUMN IF NOT EXISTS indennita_disagio_eur numeric(8,2),

  -- Validazione consulente
  ADD COLUMN IF NOT EXISTS consulente_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS consulente_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validation_warnings jsonb;

CREATE INDEX IF NOT EXISTS idx_cedolini_pending_review
  ON public.hr_cedolini(company_id, anno, mese)
  WHERE generation_method = 'auto_ai' AND consulente_reviewed_at IS NULL;

-- Indici
CREATE INDEX IF NOT EXISTS idx_hr_cedolini_employee ON public.hr_cedolini(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_cedolini_company ON public.hr_cedolini(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_cedolini_periodo ON public.hr_cedolini(anno, mese);

-- RLS
ALTER TABLE public.hr_cedolini ENABLE ROW LEVEL SECURITY;

-- Policy: l'operaio vede solo i propri cedolini
CREATE POLICY cedolini_select_own ON public.hr_cedolini
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = hr_cedolini.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- Policy: admin/hr della stessa company possono fare tutto
CREATE POLICY cedolini_admin_all ON public.hr_cedolini
  FOR ALL USING (
    (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = hr_cedolini.company_id
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_hr_cedolini_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hr_cedolini_updated_at
  BEFORE UPDATE ON public.hr_cedolini
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hr_cedolini_updated_at();
