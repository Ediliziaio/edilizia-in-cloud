-- ============================================================
-- Tabella anomalies — gestione anomalie e problemi su ordini
-- ============================================================

CREATE TABLE IF NOT EXISTS anomalies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id      uuid        REFERENCES orders(id) ON DELETE SET NULL,
  type          text        NOT NULL CHECK (type IN ('dati', 'fatturazione', 'integrazioni', 'workflow')),
  priority      text        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status        text        NOT NULL DEFAULT 'in_review'
                              CHECK (status IN ('in_review', 'assigned', 'resolved', 'closed')),
  title         text        NOT NULL,
  description   text,
  impact_amount numeric     DEFAULT 0,
  assigned_to   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolution_notes text
);

-- Indici per query veloci
CREATE INDEX IF NOT EXISTS idx_anomalies_company    ON anomalies(company_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_order      ON anomalies(order_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_status     ON anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_priority   ON anomalies(priority);
CREATE INDEX IF NOT EXISTS idx_anomalies_assigned   ON anomalies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_anomalies_created_at ON anomalies(created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

-- Utenti aziendali vedono solo le anomalie della propria company
CREATE POLICY "anomalies_company_isolation"
  ON anomalies FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- Super admin può vedere tutto
CREATE POLICY "anomalies_super_admin_all"
  ON anomalies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
