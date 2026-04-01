-- M11: Cedolini HR — payslips per dipendenti

CREATE TABLE IF NOT EXISTS cedolini (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  mese INTEGER NOT NULL CHECK (mese BETWEEN 1 AND 12),
  anno INTEGER NOT NULL,
  lordo NUMERIC(10, 2) NOT NULL DEFAULT 0,
  contributi_dipendente NUMERIC(10, 2) NOT NULL DEFAULT 0,
  contributi_datore NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ritenute_irpef NUMERIC(10, 2) NOT NULL DEFAULT 0,
  netto NUMERIC(10, 2) GENERATED ALWAYS AS (
    ROUND(lordo - contributi_dipendente - ritenute_irpef, 2)
  ) STORED,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'emesso', 'pagato')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(company_id, employee_id, mese, anno)
);

ALTER TABLE cedolini ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cedolini_company_access" ON cedolini
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE cedolini IS 'Cedolini paga mensili per dipendenti aziendali';
