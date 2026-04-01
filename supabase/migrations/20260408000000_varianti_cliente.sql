-- M14: Varianti Cliente — change orders visibili al cliente

CREATE TABLE IF NOT EXISTS varianti_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL,
  descrizione TEXT,
  importo NUMERIC(10, 2) NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'proposta' CHECK (stato IN ('proposta', 'approvata', 'rifiutata')),
  visibile_cliente BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_varianti_cliente_order_id ON varianti_cliente(order_id);
CREATE INDEX IF NOT EXISTS idx_varianti_cliente_company_id ON varianti_cliente(company_id);

ALTER TABLE varianti_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "varianti_cliente_company_access" ON varianti_cliente
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE varianti_cliente IS 'Varianti/modifiche d ordine approvabili dal cliente';
