-- M16: Note Spese — gestione rimborsi spese aziendali

CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  period_from DATE,
  period_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'reimbursed')),
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  submitted_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  note_revisione TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Altro',
  expense_date DATE NOT NULL,
  receipt_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger aggiorna total_amount su expense_reports
CREATE OR REPLACE FUNCTION update_expense_report_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE expense_reports
  SET total_amount = (
    SELECT COALESCE(SUM(amount), 0) FROM expense_report_items WHERE report_id = COALESCE(NEW.report_id, OLD.report_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.report_id, OLD.report_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_report_total ON expense_report_items;
CREATE TRIGGER trg_expense_report_total
  AFTER INSERT OR UPDATE OR DELETE ON expense_report_items
  FOR EACH ROW EXECUTE FUNCTION update_expense_report_total();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expense_reports_company_id ON expense_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_report_items_report_id ON expense_report_items(report_id);

-- RLS
ALTER TABLE expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_reports_company_access" ON expense_reports
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "expense_report_items_company_access" ON expense_report_items
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE expense_reports IS 'Note spese aziendali con workflow approvazione';
COMMENT ON TABLE expense_report_items IS 'Voci singole di una nota spese';
