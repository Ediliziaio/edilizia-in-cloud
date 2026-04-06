-- ============================================================
-- SMS MARKETING — TELNYX RESELLER LAYER
-- Wallet prepagato · SubAccount per-tenant · Pricing SuperAdmin
-- Usa company_id / companies per allineamento con il progetto
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_pricing_config — Configurazione prezzi (SuperAdmin-only)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_pricing_config (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prezzo_numero_mensile       NUMERIC(10,2) NOT NULL DEFAULT 30.00,
  prezzo_per_sms              NUMERIC(10,6) NOT NULL DEFAULT 0.060000,
  costo_wholesale_sms         NUMERIC(10,6) NOT NULL DEFAULT 0.008000,
  soglia_crediti_minima       INTEGER       NOT NULL DEFAULT 50,
  soglia_crediti_blocco        INTEGER       NOT NULL DEFAULT 0,
  crediti_bonus_primo_acquisto INTEGER       NOT NULL DEFAULT 20,
  attivo                      BOOLEAN       NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ            DEFAULT now()
);

-- Riga unica — inserisci default se non esiste
INSERT INTO sms_pricing_config (
  prezzo_numero_mensile, prezzo_per_sms, costo_wholesale_sms,
  soglia_crediti_minima, soglia_crediti_blocco, crediti_bonus_primo_acquisto
)
SELECT 30.00, 0.060000, 0.008000, 50, 0, 20
WHERE NOT EXISTS (SELECT 1 FROM sms_pricing_config);

-- ─────────────────────────────────────────────────────────────
-- 2. sms_pacchetti_crediti — Pacchetti acquistabili (SuperAdmin config)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_pacchetti_crediti (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT    NOT NULL,
  importo_eur         NUMERIC(10,2) NOT NULL,
  crediti_eur         NUMERIC(10,2) NOT NULL,
  sms_stimati         INTEGER,
  bonus_percentuale   INTEGER NOT NULL DEFAULT 0,
  evidenziato         BOOLEAN NOT NULL DEFAULT false,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  ordine              INTEGER NOT NULL DEFAULT 0
);

INSERT INTO sms_pacchetti_crediti (nome, importo_eur, crediti_eur, sms_stimati, bonus_percentuale, evidenziato, ordine)
SELECT * FROM (VALUES
  ('Starter',  10.00,  10.00, 166, 0, false, 1),
  ('Pro',      20.00,  22.00, 366, 10, true, 2),
  ('Business', 50.00,  57.50, 958, 15, false, 3)
) AS v(nome, importo_eur, crediti_eur, sms_stimati, bonus_percentuale, evidenziato, ordine)
WHERE NOT EXISTS (SELECT 1 FROM sms_pacchetti_crediti);

-- ─────────────────────────────────────────────────────────────
-- 3. sms_telnyx_accounts — SubAccount Telnyx per azienda
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_telnyx_accounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  telnyx_account_id         TEXT NOT NULL,
  telnyx_api_key_secret_name TEXT NOT NULL,
  stato                     TEXT NOT NULL DEFAULT 'in_creazione'
                              CHECK (stato IN ('in_creazione','attivo','sospeso','terminato')),
  attivato_at               TIMESTAMPTZ,
  note_admin                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_telnyx_accounts_company ON sms_telnyx_accounts (company_id);

ALTER TABLE sms_telnyx_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_telnyx_accounts_select" ON sms_telnyx_accounts FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_telnyx_accounts_insert" ON sms_telnyx_accounts FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_telnyx_accounts_update" ON sms_telnyx_accounts FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 4. sms_telnyx_numbers — Numero +39 dedicato per azienda
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_telnyx_numbers (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  telnyx_account_id          UUID REFERENCES sms_telnyx_accounts(id),
  numero_e164                TEXT NOT NULL,
  numero_display             TEXT NOT NULL,
  prefisso_area              TEXT,
  citta                      TEXT,
  telnyx_phone_number_id     TEXT NOT NULL,
  messaging_profile_id       TEXT,
  stato                      TEXT NOT NULL DEFAULT 'attivo'
                               CHECK (stato IN ('in_acquisto','attivo','sospeso','rilasciato')),
  costo_mensile_wholesale    NUMERIC(10,4) NOT NULL DEFAULT 1.50,
  costo_mensile_cliente      NUMERIC(10,2) NOT NULL DEFAULT 30.00,
  data_acquisto              TIMESTAMPTZ NOT NULL DEFAULT now(),
  prossimo_rinnovo           TIMESTAMPTZ,
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_telnyx_numbers_company ON sms_telnyx_numbers (company_id);

ALTER TABLE sms_telnyx_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_telnyx_numbers_select" ON sms_telnyx_numbers FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_telnyx_numbers_insert" ON sms_telnyx_numbers FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_telnyx_numbers_update" ON sms_telnyx_numbers FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 5. sms_wallet — Crediti prepagati per azienda
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_wallet (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crediti              NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (crediti >= 0),
  crediti_riservati    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (crediti_riservati >= 0),
  totale_ricaricato    NUMERIC(12,2) NOT NULL DEFAULT 0,
  totale_speso         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ultima_ricarica_at   TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_wallet_company ON sms_wallet (company_id);

ALTER TABLE sms_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_wallet_select" ON sms_wallet FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_wallet_insert" ON sms_wallet FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_wallet_update" ON sms_wallet FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 6. sms_wallet_transazioni — Log immutabile movimenti crediti
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_wallet_transazioni (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo                      TEXT NOT NULL
                              CHECK (tipo IN ('ricarica','addebito_sms','addebito_numero','rimborso','bonus')),
  importo                   NUMERIC(12,6) NOT NULL,
  saldo_dopo                NUMERIC(12,2) NOT NULL,
  descrizione               TEXT NOT NULL,
  riferimento_id            UUID,
  stripe_payment_intent_id  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Nessun updated_at — record immutabile
);

CREATE INDEX IF NOT EXISTS idx_sms_wallet_transazioni_company ON sms_wallet_transazioni (company_id);
CREATE INDEX IF NOT EXISTS idx_sms_wallet_transazioni_tipo   ON sms_wallet_transazioni (company_id, tipo);
CREATE INDEX IF NOT EXISTS idx_sms_wallet_transazioni_data   ON sms_wallet_transazioni (created_at DESC);

ALTER TABLE sms_wallet_transazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_wallet_transazioni_select" ON sms_wallet_transazioni FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_wallet_transazioni_insert" ON sms_wallet_transazioni FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 7. sms_provider_config — Preferenze SMS per-tenant
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_provider_config (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mittente_display         TEXT CHECK (
                             mittente_display IS NULL
                             OR (char_length(mittente_display) <= 11
                             AND mittente_display ~ '^[A-Za-z0-9 ]+$')
                           ),
  notifica_soglia_email    BOOLEAN NOT NULL DEFAULT true,
  notifica_soglia_inapp    BOOLEAN NOT NULL DEFAULT true,
  onboarding_completato    BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_provider_config_company ON sms_provider_config (company_id);

ALTER TABLE sms_provider_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_provider_config_select" ON sms_provider_config FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_provider_config_insert" ON sms_provider_config FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_provider_config_update" ON sms_provider_config FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 8. ALTER sms_campaigns — Aggiungi campi Telnyx/wallet
-- ─────────────────────────────────────────────────────────────
ALTER TABLE sms_campaigns
  ADD COLUMN IF NOT EXISTS parti_sms                 INTEGER       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS costo_per_sms_snapshot    NUMERIC(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_totale_cliente      NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_totale_wholesale    NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS telnyx_account_id         UUID REFERENCES sms_telnyx_accounts(id);

-- ─────────────────────────────────────────────────────────────
-- 9. ALTER sms_log — Aggiungi campi Telnyx
-- ─────────────────────────────────────────────────────────────
ALTER TABLE sms_log
  ADD COLUMN IF NOT EXISTS telnyx_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_response    JSONB,
  ADD COLUMN IF NOT EXISTS costo_cliente      NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS costo_wholesale    NUMERIC(10,6);

-- ─────────────────────────────────────────────────────────────
-- 10. Trigger updated_at per tabelle nuove
-- ─────────────────────────────────────────────────────────────
-- Usa la funzione set_updated_at() già creata in migrazioni precedenti
-- (definita in 20260814000003_portale_cliente.sql)

CREATE OR REPLACE TRIGGER sms_telnyx_accounts_updated_at
  BEFORE UPDATE ON sms_telnyx_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER sms_telnyx_numbers_updated_at
  BEFORE UPDATE ON sms_telnyx_numbers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER sms_wallet_updated_at
  BEFORE UPDATE ON sms_wallet
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER sms_provider_config_updated_at
  BEFORE UPDATE ON sms_provider_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 11. Trigger: aggiorna_totali_wallet dopo INSERT in sms_wallet_transazioni
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aggiorna_totali_wallet()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'ricarica' OR NEW.tipo = 'bonus' THEN
    UPDATE sms_wallet
    SET
      totale_ricaricato = totale_ricaricato + ABS(NEW.importo::NUMERIC),
      ultima_ricarica_at = CASE WHEN NEW.tipo = 'ricarica' THEN now() ELSE ultima_ricarica_at END
    WHERE company_id = NEW.company_id;
  ELSIF NEW.tipo IN ('addebito_sms', 'addebito_numero') THEN
    UPDATE sms_wallet
    SET totale_speso = totale_speso + ABS(NEW.importo::NUMERIC)
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sms_wallet_transazioni_after_insert
  AFTER INSERT ON sms_wallet_transazioni
  FOR EACH ROW EXECUTE FUNCTION public.aggiorna_totali_wallet();
