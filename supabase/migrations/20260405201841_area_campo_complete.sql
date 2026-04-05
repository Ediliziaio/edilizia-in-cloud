-- ═══════════════════════════════════════════════════════════════════════
-- Area Campo — Operai & Subappaltatori
-- Migrazione completa: tabelle, RLS, trigger, funzioni DB
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Aggiunta ruolo subcontractor all'enum app_role ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'subcontractor'
  ) THEN
    ALTER TYPE app_role ADD VALUE 'subcontractor';
  END IF;
END $$;

-- ── 2. Tabella order_campo_assignments — assegnazioni operai/sub ──────
CREATE TABLE IF NOT EXISTS order_campo_assignments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_type        TEXT NOT NULL CHECK (role_type IN ('employee','subcontractor')),
  assigned_by      UUID REFERENCES profiles(id),
  data_inizio      DATE,
  data_fine_prevista DATE,
  is_capocantiere  BOOLEAN DEFAULT FALSE,
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_oca_order   ON order_campo_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_oca_user    ON order_campo_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_oca_company ON order_campo_assignments(company_id);

-- ── 3. Tabella campo_rapportini — rapportini giornalieri operai/sub ───
CREATE TABLE IF NOT EXISTS campo_rapportini (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES profiles(id),
  role_type               TEXT NOT NULL CHECK (role_type IN ('employee','subcontractor')),
  data_lavoro             DATE NOT NULL DEFAULT CURRENT_DATE,
  ore_lavorate            NUMERIC(4,1) CHECK (ore_lavorate >= 0 AND ore_lavorate <= 24),
  descrizione_lavori      TEXT,
  materiali_usati         JSONB DEFAULT '[]'::jsonb,
  foto_urls               TEXT[] DEFAULT '{}',
  lavoro_completato       BOOLEAN DEFAULT FALSE,
  percentuale_avanzamento INTEGER DEFAULT 0 CHECK (percentuale_avanzamento BETWEEN 0 AND 100),
  gps_lat                 NUMERIC(10,7),
  gps_lng                 NUMERIC(10,7),
  gps_accuracy            NUMERIC(6,1),
  meteo                   TEXT CHECK (meteo IN ('soleggiato','nuvoloso','pioggia','neve','vento')),
  note                    TEXT,
  firma_cliente_url       TEXT,
  firma_cliente_nome      TEXT,
  firma_cliente_at        TIMESTAMPTZ,
  ticket_aperto_id        UUID REFERENCES tickets(id),
  approvato               BOOLEAN DEFAULT FALSE,
  approvato_da            UUID REFERENCES profiles(id),
  approvato_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cr_order   ON campo_rapportini(order_id);
CREATE INDEX IF NOT EXISTS idx_cr_user    ON campo_rapportini(user_id);
CREATE INDEX IF NOT EXISTS idx_cr_company ON campo_rapportini(company_id);
CREATE INDEX IF NOT EXISTS idx_cr_data    ON campo_rapportini(data_lavoro);

-- trigger updated_at per campo_rapportini
CREATE OR REPLACE FUNCTION set_campo_rapportini_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campo_rapportini_updated_at ON campo_rapportini;
CREATE TRIGGER trg_campo_rapportini_updated_at
  BEFORE UPDATE ON campo_rapportini
  FOR EACH ROW EXECUTE FUNCTION set_campo_rapportini_updated_at();

-- ── 4. Tabella campo_timbrature — timbrature GPS da app campo ─────────
CREATE TABLE IF NOT EXISTS campo_timbrature (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id),
  order_id         UUID REFERENCES orders(id),
  tipo             TEXT NOT NULL CHECK (tipo IN ('entrata','uscita','pausa_inizio','pausa_fine')),
  timestamp_evento TIMESTAMPTZ DEFAULT NOW(),
  gps_lat          NUMERIC(10,7),
  gps_lng          NUMERIC(10,7),
  gps_accuracy     NUMERIC(6,1),
  fonte            TEXT DEFAULT 'app' CHECK (fonte IN ('app','kiosk','manuale')),
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ct_user    ON campo_timbrature(user_id);
CREATE INDEX IF NOT EXISTS idx_ct_company ON campo_timbrature(company_id);
CREATE INDEX IF NOT EXISTS idx_ct_evento  ON campo_timbrature(timestamp_evento);

-- ── 5. Tabella documenti_dipendenti — documenti personali operai ──────
CREATE TABLE IF NOT EXISTS documenti_dipendenti (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN (
    'contratto_lavoro','formazione_sicurezza','dpi','inail',
    'certificazione','visita_medica','patente','altro'
  )),
  nome_file      TEXT,
  url            TEXT NOT NULL,
  data_rilascio  DATE,
  data_scadenza  DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dd_user ON documenti_dipendenti(user_id);

-- ── 6. Colonna user_id su subappaltatori (se la tabella esiste) ───────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subappaltatori') THEN
    ALTER TABLE subappaltatori ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);
    ALTER TABLE subappaltatori ADD COLUMN IF NOT EXISTS user_email TEXT;
    CREATE INDEX IF NOT EXISTS idx_sub_user ON subappaltatori(user_id);
  END IF;
END $$;

-- ── 7. Colonna fonte su tickets (se la tabella esiste) ────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='fonte') THEN
      ALTER TABLE tickets ADD COLUMN fonte TEXT DEFAULT 'ufficio' CHECK (fonte IN ('ufficio','campo','cliente','api'));
    END IF;
  END IF;
END $$;

-- ── 8. Colonna percentuale_avanzamento su orders ──────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS percentuale_avanzamento INTEGER DEFAULT 0
  CHECK (percentuale_avanzamento BETWEEN 0 AND 100);

-- ── 9. Colonna note_contestazione su sal_subappaltatori (se esiste) ───
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sal_subappaltatori') THEN
    ALTER TABLE sal_subappaltatori ADD COLUMN IF NOT EXISTS note_contestazione TEXT;
  END IF;
END $$;

-- ── 10. RLS — order_campo_assignments ────────────────────────────────
ALTER TABLE order_campo_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY oca_select ON order_campo_assignments FOR SELECT USING (
    user_id = auth.uid()
    OR (
      company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role IN ('company_admin','company_staff','super_admin')
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY oca_insert ON order_campo_assignments FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('company_admin','company_staff','super_admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY oca_delete ON order_campo_assignments FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('company_admin','company_staff','super_admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 11. RLS — campo_rapportini ────────────────────────────────────────
ALTER TABLE campo_rapportini ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY cr_select ON campo_rapportini FOR SELECT USING (
    user_id = auth.uid()
    OR (
      company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      AND (
        EXISTS (
          SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
          AND ur.role IN ('company_admin','company_staff','super_admin')
        )
        OR EXISTS (
          SELECT 1 FROM order_campo_assignments oca
          WHERE oca.order_id = campo_rapportini.order_id
            AND oca.user_id = auth.uid()
            AND oca.is_capocantiere = TRUE
        )
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY cr_insert ON campo_rapportini FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM order_campo_assignments oca
      WHERE oca.order_id = campo_rapportini.order_id
        AND oca.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY cr_update ON campo_rapportini FOR UPDATE USING (
    (user_id = auth.uid() AND approvato = FALSE)
    OR EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('company_admin','company_staff','super_admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 12. RLS — campo_timbrature ────────────────────────────────────────
ALTER TABLE campo_timbrature ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ct_select ON campo_timbrature FOR SELECT USING (
    user_id = auth.uid()
    OR (
      company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role IN ('company_admin','company_staff','super_admin')
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ct_insert ON campo_timbrature FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 13. RLS — documenti_dipendenti ───────────────────────────────────
ALTER TABLE documenti_dipendenti ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY dd_select ON documenti_dipendenti FOR SELECT USING (
    user_id = auth.uid()
    OR (
      company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
        AND ur.role IN ('company_admin','company_staff','super_admin')
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY dd_insert ON documenti_dipendenti FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('company_admin','company_staff','super_admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 14. Funzione DB: aggiungi utente al canale cantiere ───────────────
CREATE OR REPLACE FUNCTION add_user_to_order_channel(
  p_order_id  UUID,
  p_user_id   UUID,
  p_company_id UUID
) RETURNS void AS $$
DECLARE
  v_channel_id UUID;
  v_order_code TEXT;
BEGIN
  SELECT order_code INTO v_order_code FROM orders WHERE id = p_order_id;

  -- Trova o crea canale cantiere
  SELECT id INTO v_channel_id
  FROM chat_channels
  WHERE name = 'cantiere-' || v_order_code
    AND company_id = p_company_id;

  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels(company_id, name, type, created_by)
    VALUES (p_company_id, 'cantiere-' || v_order_code, 'cantiere', p_user_id)
    RETURNING id INTO v_channel_id;
  END IF;

  -- Aggiungi membro se non già presente
  INSERT INTO chat_channel_members(channel_id, user_id)
  VALUES (v_channel_id, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 15. Trigger: assegnazione → aggiunge al canale cantiere ──────────
CREATE OR REPLACE FUNCTION trg_oca_add_channel_member()
RETURNS trigger AS $$
BEGIN
  PERFORM add_user_to_order_channel(NEW.order_id, NEW.user_id, NEW.company_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_oca_channel ON order_campo_assignments;
CREATE TRIGGER trg_oca_channel
  AFTER INSERT ON order_campo_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_oca_add_channel_member();

-- ── 16. Funzione RPC per decrementare scorta furgone ─────────────────
CREATE OR REPLACE FUNCTION decrement_scorta(p_id UUID, p_qty NUMERIC)
RETURNS void AS $$
BEGIN
  UPDATE scorte_furgone
  SET quantita_attuale = GREATEST(0, quantita_attuale - p_qty),
      updated_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
