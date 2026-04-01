-- M3: Sicurezza Cantiere 81/08 — verbali, subappaltatori, scadenzario

CREATE TABLE IF NOT EXISTS verbali_sicurezza (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL DEFAULT 'sopralluogo' CHECK (tipo IN ('sopralluogo', 'riunione', 'ispezione', 'altro')),
  esito TEXT NOT NULL DEFAULT 'conforme' CHECK (esito IN ('conforme', 'non_conforme', 'parzialmente_conforme')),
  note TEXT,
  redatto_da TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS subappaltatori_sicurezza (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ragione_sociale TEXT NOT NULL,
  tipo_lavori TEXT,
  responsabile TEXT,
  telefono TEXT,
  data_inizio DATE,
  data_fine DATE,
  durc_scadenza DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adempimenti_sicurezza (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  titolo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'altro',
  scadenza_data DATE,
  stato TEXT NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare', 'completato', 'scaduto')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE verbali_sicurezza ENABLE ROW LEVEL SECURITY;
ALTER TABLE subappaltatori_sicurezza ENABLE ROW LEVEL SECURITY;
ALTER TABLE adempimenti_sicurezza ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verbali_company_access" ON verbali_sicurezza
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "subappaltatori_company_access" ON subappaltatori_sicurezza
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "adempimenti_company_access" ON adempimenti_sicurezza
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE verbali_sicurezza IS 'Verbali ispezioni/sopralluoghi cantiere D.Lgs 81/08';
COMMENT ON TABLE subappaltatori_sicurezza IS 'Registro subappaltatori per cantiere con DURC';
COMMENT ON TABLE adempimenti_sicurezza IS 'Scadenzario adempimenti sicurezza sul lavoro';
