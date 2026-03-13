
-- ============================================================
-- SALES-REP-01: Extend salespeople + create obiettivi/attivita
-- ============================================================

-- 1) Extend salespeople with extra columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salespeople' AND column_name='area_geografica') THEN
    ALTER TABLE salespeople ADD COLUMN area_geografica TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salespeople' AND column_name='zona') THEN
    ALTER TABLE salespeople ADD COLUMN zona TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salespeople' AND column_name='data_inizio') THEN
    ALTER TABLE salespeople ADD COLUMN data_inizio DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salespeople' AND column_name='avatar_url') THEN
    ALTER TABLE salespeople ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- 2) obiettivi_venditori
CREATE TABLE IF NOT EXISTS obiettivi_venditori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  salesperson_id UUID NOT NULL REFERENCES salespeople(id) ON DELETE CASCADE,
  periodo_tipo VARCHAR(20) CHECK (periodo_tipo IN ('mensile', 'trimestrale', 'annuale')),
  anno INTEGER NOT NULL,
  mese INTEGER CHECK (mese BETWEEN 1 AND 12),
  trimestre INTEGER CHECK (trimestre BETWEEN 1 AND 4),
  target_fatturato NUMERIC(15,2) DEFAULT 0,
  target_preventivi INTEGER DEFAULT 0,
  target_ordini INTEGER DEFAULT 0,
  target_nuovi_clienti INTEGER DEFAULT 0,
  target_win_rate NUMERIC(5,2),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (salesperson_id, periodo_tipo, anno, mese, trimestre)
);

-- 3) attivita_venditori
CREATE TABLE IF NOT EXISTS attivita_venditori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  salesperson_id UUID NOT NULL REFERENCES salespeople(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES anagrafiche_native(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  tipo VARCHAR(30) CHECK (tipo IN (
    'chiamata_uscente', 'chiamata_entrante',
    'email_inviata', 'email_ricevuta',
    'riunione', 'visita_cliente',
    'demo', 'offerta_inviata',
    'follow_up', 'trattativa', 'altro'
  )),
  data_attivita TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  durata_minuti INTEGER,
  esito VARCHAR(30) CHECK (esito IN (
    'positivo', 'neutro', 'negativo',
    'appuntamento_fissato', 'offerta_richiesta',
    'non_risposto', 'da_richiamare'
  )),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Add salesperson_id FK to quotes and documenti_fiscali
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotes' AND column_name='salesperson_id') THEN
    ALTER TABLE quotes ADD COLUMN salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documenti_fiscali' AND column_name='salesperson_id') THEN
    ALTER TABLE documenti_fiscali ADD COLUMN salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_obiettivi_salesperson_anno ON obiettivi_venditori(salesperson_id, anno);
CREATE INDEX IF NOT EXISTS idx_attivita_salesperson ON attivita_venditori(salesperson_id, data_attivita DESC);
CREATE INDEX IF NOT EXISTS idx_attivita_cliente ON attivita_venditori(cliente_id);
CREATE INDEX IF NOT EXISTS idx_quotes_salesperson ON quotes(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_documenti_salesperson ON documenti_fiscali(salesperson_id);

-- 6) RLS
ALTER TABLE obiettivi_venditori ENABLE ROW LEVEL SECURITY;
ALTER TABLE attivita_venditori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_obiettivi" ON obiettivi_venditori
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "super_admin_obiettivi" ON obiettivi_venditori
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "company_isolation_attivita" ON attivita_venditori
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "super_admin_attivita" ON attivita_venditori
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- 7) Performance view
CREATE OR REPLACE VIEW performance_base_venditori AS
SELECT
  sp.id AS salesperson_id,
  sp.company_id,
  sp.first_name || ' ' || sp.last_name AS nome_completo,
  sp.area_geografica,
  sp.is_active,

  -- Quotes this year
  COUNT(DISTINCT q.id) FILTER (
    WHERE EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
  ) AS preventivi_anno,

  COUNT(DISTINCT q.id) FILTER (
    WHERE q.status IN ('accepted', 'signed')
    AND EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
  ) AS preventivi_vinti_anno,

  -- Win rate
  ROUND(
    100.0 * COUNT(DISTINCT q.id) FILTER (
      WHERE q.status IN ('accepted', 'signed')
      AND EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
    ) / NULLIF(COUNT(DISTINCT q.id) FILTER (
      WHERE q.status NOT IN ('draft')
      AND EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
    ), 0),
  2) AS win_rate_anno,

  -- Revenue this year (from orders via order_salespeople)
  COALESCE(SUM(o.total_amount) FILTER (
    WHERE EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM NOW())
  ), 0) AS fatturato_anno,

  -- Avg order value
  ROUND(AVG(o.total_amount) FILTER (
    WHERE EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM NOW())
  ), 2) AS valore_medio_ordine,

  -- Active clients
  COUNT(DISTINCT o.customer_id) FILTER (
    WHERE EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM NOW())
  ) AS clienti_attivi_anno,

  -- Open pipeline (quotes in progress)
  COALESCE(SUM(q.total) FILTER (
    WHERE q.status IN ('sent', 'viewed')
  ), 0) AS pipeline_valore,

  COUNT(DISTINCT q.id) FILTER (
    WHERE q.status IN ('sent', 'viewed')
  ) AS pipeline_count

FROM salespeople sp
LEFT JOIN quotes q ON q.salesperson_id = sp.id
LEFT JOIN order_salespeople osp ON osp.salesperson_id = sp.id
LEFT JOIN orders o ON o.id = osp.order_id
GROUP BY sp.id, sp.company_id, sp.first_name, sp.last_name, sp.area_geografica, sp.is_active;
