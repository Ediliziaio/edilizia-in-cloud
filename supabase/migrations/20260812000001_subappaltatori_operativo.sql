-- ═══════════════════════════════════════════════════════════════
-- MODULO B — GESTIONE SUBAPPALTATORI
-- Aggiunge operatività a subappaltatori_sicurezza esistente.
-- NON modifica né elimina la tabella esistente.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Contratti subappalto ─────────────────────────────────
CREATE TABLE IF NOT EXISTS contratti_subappalto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subappaltatore_id UUID NOT NULL REFERENCES subappaltatori_sicurezza(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  numero_contratto TEXT,
  descrizione_lavori TEXT NOT NULL,
  importo_contrattuale NUMERIC(12,2) NOT NULL DEFAULT 0,
  ritenuta_garanzia_pct NUMERIC(5,2) DEFAULT 5.00,
  data_inizio DATE,
  data_fine_prevista DATE,
  data_fine_effettiva DATE,
  stato TEXT DEFAULT 'attivo'
    CHECK (stato IN ('bozza','attivo','completato','risolto','sospeso')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. SAL subappaltatore (emessi dal sub all'impresa) ──────
CREATE TABLE IF NOT EXISTS sal_subappaltatori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contratto_id UUID NOT NULL REFERENCES contratti_subappalto(id) ON DELETE CASCADE,
  subappaltatore_id UUID NOT NULL REFERENCES subappaltatori_sicurezza(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  numero_sal INTEGER NOT NULL DEFAULT 1,
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  importo_lordo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ritenuta_pct NUMERIC(5,2) DEFAULT 5.00,
  ritenuta_importo NUMERIC(12,2) GENERATED ALWAYS AS
    (ROUND(importo_lordo * ritenuta_pct / 100, 2)) STORED,
  importo_netto NUMERIC(12,2) GENERATED ALWAYS AS
    (importo_lordo - ROUND(importo_lordo * ritenuta_pct / 100, 2)) STORED,
  stato TEXT DEFAULT 'ricevuto'
    CHECK (stato IN ('ricevuto','verificato','pagato','contestato')),
  data_pagamento DATE,
  note TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. Ritenute garanzia (accumulatore) ─────────────────────
CREATE TABLE IF NOT EXISTS ritenute_garanzia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contratto_id UUID NOT NULL REFERENCES contratti_subappalto(id) ON DELETE CASCADE,
  sal_id UUID NOT NULL REFERENCES sal_subappaltatori(id) ON DELETE CASCADE,
  importo NUMERIC(12,2) NOT NULL,
  stato TEXT DEFAULT 'trattenuta'
    CHECK (stato IN ('trattenuta','svincolata','persa')),
  data_svincolo_prevista DATE,
  data_svincolo_effettiva DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 4. Documenti idoneità subappaltatore ────────────────────
CREATE TABLE IF NOT EXISTS documenti_subappaltatore (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subappaltatore_id UUID NOT NULL REFERENCES subappaltatori_sicurezza(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('durc','visura_camerale','attestazione_soa','dvr',
                    'polizza_rc','iso_certificazione','altro')),
  nome_file TEXT,
  url TEXT NOT NULL,
  data_rilascio DATE,
  data_scadenza DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 5. RLS ───────────────────────────────────────────────────
ALTER TABLE contratti_subappalto ENABLE ROW LEVEL SECURITY;
ALTER TABLE sal_subappaltatori ENABLE ROW LEVEL SECURITY;
ALTER TABLE ritenute_garanzia ENABLE ROW LEVEL SECURITY;
ALTER TABLE documenti_subappaltatore ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_company_1 ON contratti_subappalto
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY sub_company_2 ON sal_subappaltatori
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY sub_company_3 ON ritenute_garanzia
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY sub_company_4 ON documenti_subappaltatore
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ─── 6. View aggregata per dashboard ─────────────────────────
CREATE OR REPLACE VIEW v_subappaltatori_dashboard AS
SELECT
  ss.id,
  ss.company_id,
  ss.order_id,
  ss.ragione_sociale,
  ss.tipo_lavori,
  ss.responsabile,
  ss.durc_scadenza,
  cs.id AS contratto_id,
  cs.importo_contrattuale,
  cs.ritenuta_garanzia_pct,
  cs.stato AS stato_contratto,
  COALESCE(SUM(sal.importo_lordo), 0) AS totale_sal_lordo,
  COALESCE(SUM(sal.importo_netto), 0) AS totale_sal_netto,
  COALESCE(SUM(rg.importo) FILTER (WHERE rg.stato = 'trattenuta'), 0) AS ritenute_in_corso,
  COALESCE(SUM(rg.importo) FILTER (WHERE rg.stato = 'svincolata'), 0) AS ritenute_svincolate,
  cs.importo_contrattuale - COALESCE(SUM(sal.importo_lordo), 0) AS residuo_contrattuale
FROM subappaltatori_sicurezza ss
LEFT JOIN contratti_subappalto cs ON cs.subappaltatore_id = ss.id
LEFT JOIN sal_subappaltatori sal ON sal.contratto_id = cs.id
LEFT JOIN ritenute_garanzia rg ON rg.contratto_id = cs.id
GROUP BY ss.id, cs.id;

-- ─── 7. Indici performance ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contratti_sub_company ON contratti_subappalto(company_id);
CREATE INDEX IF NOT EXISTS idx_contratti_sub_order ON contratti_subappalto(order_id);
CREATE INDEX IF NOT EXISTS idx_sal_sub_contratto ON sal_subappaltatori(contratto_id);
CREATE INDEX IF NOT EXISTS idx_ritenute_contratto ON ritenute_garanzia(contratto_id);
CREATE INDEX IF NOT EXISTS idx_docs_sub_id ON documenti_subappaltatore(subappaltatore_id);
