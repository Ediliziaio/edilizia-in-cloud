-- Snapshot MRR giornaliero (Stripe vs interno)
CREATE TABLE IF NOT EXISTS mrr_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL UNIQUE,
  mrr_stripe_cents INT NOT NULL DEFAULT 0,
  mrr_interno_cents INT NOT NULL DEFAULT 0,
  discrepanza_cents INT GENERATED ALWAYS AS (mrr_stripe_cents - mrr_interno_cents) STORED,
  aziende_attive_stripe INT NOT NULL DEFAULT 0,
  aziende_attive_interno INT NOT NULL DEFAULT 0,
  breakdown_per_piano JSONB DEFAULT '{}',
  dettaglio_discrepanze JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mrr_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin mrr_snapshots full access"
  ON mrr_snapshots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_mrr_snapshots_data ON mrr_snapshots(data DESC);
