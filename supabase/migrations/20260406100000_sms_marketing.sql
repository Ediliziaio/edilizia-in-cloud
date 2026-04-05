-- SMS Marketing Module
-- Tabelle: sms_contacts, sms_campaigns, sms_log, sms_templates
-- Provider: Brevo SMS (API key configurata come variabile d'ambiente Edge Function)
-- Nota: si usa company_id / companies per allineamento con il resto del progetto

-- ─────────────────────────────────────────────────────────────
-- 1. sms_contacts — Rubrica contatti SMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome                text,
  cognome             text,
  telefono            text NOT NULL,  -- formato E.164: +39XXXXXXXXXX
  telefono_verified   boolean NOT NULL DEFAULT false,
  consenso_marketing  boolean NOT NULL DEFAULT false,
  consenso_data       timestamptz,
  opt_out             boolean NOT NULL DEFAULT false,
  opt_out_data        timestamptz,
  tags                text[] NOT NULL DEFAULT '{}',
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, telefono)
);

CREATE INDEX IF NOT EXISTS idx_sms_contacts_company ON sms_contacts (company_id);
CREATE INDEX IF NOT EXISTS idx_sms_contacts_opt_out ON sms_contacts (company_id, opt_out);
CREATE INDEX IF NOT EXISTS idx_sms_contacts_tags ON sms_contacts USING gin (tags);

ALTER TABLE sms_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_contacts_select" ON sms_contacts FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_contacts_insert" ON sms_contacts FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_contacts_update" ON sms_contacts FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_contacts_delete" ON sms_contacts FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 2. sms_campaigns — Campagne SMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome                  text NOT NULL,
  messaggio             text NOT NULL CHECK (char_length(messaggio) <= 160),
  mittente              text NOT NULL CHECK (
                          char_length(mittente) >= 1
                          AND char_length(mittente) <= 11
                          AND mittente ~ '^[A-Za-z0-9]+$'
                        ),
  stato                 text NOT NULL DEFAULT 'bozza'
                          CHECK (stato IN ('bozza','pianificata','in_corso','completata','annullata')),
  tipo                  text NOT NULL DEFAULT 'immediata'
                          CHECK (tipo IN ('immediata','pianificata','ricorrente')),
  programmata_per       timestamptz,
  totale_destinatari    integer NOT NULL DEFAULT 0,
  inviati               integer NOT NULL DEFAULT 0,
  consegnati            integer NOT NULL DEFAULT 0,
  errori                integer NOT NULL DEFAULT 0,
  costo_totale          numeric(10,4) NOT NULL DEFAULT 0,
  filtro_tags           text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_company ON sms_campaigns (company_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_stato ON sms_campaigns (company_id, stato);

ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_campaigns_select" ON sms_campaigns FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_campaigns_insert" ON sms_campaigns FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_campaigns_update" ON sms_campaigns FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_campaigns_delete" ON sms_campaigns FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 3. sms_log — Log singoli invii
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagna_id         uuid REFERENCES sms_campaigns(id) ON DELETE SET NULL,
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contatto_id         uuid REFERENCES sms_contacts(id) ON DELETE SET NULL,
  telefono            text NOT NULL,
  messaggio           text NOT NULL,
  stato               text NOT NULL DEFAULT 'pending'
                        CHECK (stato IN ('pending','inviato','consegnato','fallito','opt_out')),
  provider_message_id text,
  provider_response   jsonb,
  costo               numeric(10,4),
  errore_dettaglio    text,
  inviato_at          timestamptz,
  consegnato_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_log_company ON sms_log (company_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_campagna ON sms_log (campagna_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_stato ON sms_log (company_id, stato);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_log_select" ON sms_log FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_log_insert" ON sms_log FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 4. sms_templates — Template riutilizzabili
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  categoria   text NOT NULL DEFAULT 'generico'
                CHECK (categoria IN ('generico','promozionale','transazionale','reminder','preventivo')),
  messaggio   text NOT NULL CHECK (char_length(messaggio) <= 160),
  variabili   text[] NOT NULL DEFAULT '{}',
  attivo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_company ON sms_templates (company_id);

ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_templates_select" ON sms_templates FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_templates_insert" ON sms_templates FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_templates_update" ON sms_templates FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "sms_templates_delete" ON sms_templates FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- 5. Trigger updated_at per sms_contacts e sms_campaigns
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_sms_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sms_contacts_updated_at
  BEFORE UPDATE ON sms_contacts
  FOR EACH ROW EXECUTE FUNCTION update_sms_updated_at();

CREATE TRIGGER trg_sms_campaigns_updated_at
  BEFORE UPDATE ON sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_sms_updated_at();

CREATE TRIGGER trg_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW EXECUTE FUNCTION update_sms_updated_at();
