-- Input CAC mensile manuale
CREATE TABLE IF NOT EXISTS cac_input (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anno INT NOT NULL,
  mese INT NOT NULL CHECK (mese BETWEEN 1 AND 12),
  spesa_marketing_cents INT NOT NULL DEFAULT 0,
  nuove_aziende INT NOT NULL DEFAULT 0,
  note TEXT,
  inserito_da UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(anno, mese)
);

ALTER TABLE cac_input ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin cac_input full access"
  ON cac_input FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_cac_input_periodo ON cac_input(anno DESC, mese DESC);
