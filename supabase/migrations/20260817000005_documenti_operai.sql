-- MP5: Documenti Operai + Scadenze + Notifiche Push
-- Tabelle: tipi_documento_operaio, documenti_operai, push_subscriptions
-- Storage: bucket documenti-operai (PRIVATE)
-- Note: usa companies (non aziende) e profiles (non hr_profili)

-- ─── Tipi documento configurabili per azienda ─────────────────────────────────
CREATE TABLE tipi_documento_operaio (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,
  descrizione         TEXT,
  richiede_scadenza   BOOLEAN NOT NULL DEFAULT true,
  alert_giorni_prima  INTEGER NOT NULL DEFAULT 30 CHECK (alert_giorni_prima >= 0),
  obbligatorio        BOOLEAN NOT NULL DEFAULT false,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  ordine              INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tipi_documento_operaio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipi_doc_company_access"
  ON tipi_documento_operaio
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_tipi_doc_company ON tipi_documento_operaio (company_id, attivo);

-- ─── Documenti caricati per ogni operaio ──────────────────────────────────────
-- file_path = percorso Storage (bucket documenti-operai, PRIVATE)
-- Signed URL generato al momento della visualizzazione/download (1h scadenza)
CREATE TABLE documenti_operai (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  operaio_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo_id        UUID REFERENCES tipi_documento_operaio(id) ON DELETE SET NULL,
  nome_file      TEXT NOT NULL,
  file_path      TEXT NOT NULL,         -- percorso Storage, mai URL pubblico
  data_emissione DATE,
  data_scadenza  DATE,
  stato          TEXT NOT NULL
    CHECK (stato IN ('valido','in_scadenza','scaduto','senza_scadenza'))
    DEFAULT 'valido',
  note           TEXT,
  caricato_da    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documenti_operai ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_operai_company_access"
  ON documenti_operai
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

-- Operaio può vedere solo i propri documenti
CREATE POLICY "doc_operai_self_select"
  ON documenti_operai
  FOR SELECT
  USING (operaio_id = auth.uid());

CREATE INDEX idx_doc_operai_company    ON documenti_operai (company_id);
CREATE INDEX idx_doc_operai_operaio    ON documenti_operai (operaio_id);
CREATE INDEX idx_doc_operai_scadenza   ON documenti_operai (data_scadenza) WHERE data_scadenza IS NOT NULL;
CREATE INDEX idx_doc_operai_stato      ON documenti_operai (company_id, stato);

-- ─── Push subscriptions Web Push API ──────────────────────────────────────────
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Ogni utente vede/gestisce solo le proprie subscription
CREATE POLICY "push_sub_owner"
  ON push_subscriptions
  FOR ALL
  USING (user_id = auth.uid());

-- Admin può vedere le subscription della propria company (per invio notifiche)
CREATE POLICY "push_sub_company_admin"
  ON push_subscriptions
  FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid()
        AND ur.role IN ('company_admin','company_staff','super_admin')
    )
  );

CREATE INDEX idx_push_sub_user    ON push_subscriptions (user_id);
CREATE INDEX idx_push_sub_company ON push_subscriptions (company_id);

-- ─── Seed tipi documento default per ogni company già esistente ───────────────
-- I tipi di sistema (is_default=true) vengono copiati per ogni company
-- I nuovi insert aziendali li generano via trigger (vedi sotto)

CREATE OR REPLACE FUNCTION seed_tipi_documento_operaio(p_company_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tipi_documento_operaio
    (company_id, nome, descrizione, richiede_scadenza, alert_giorni_prima, obbligatorio, is_default, ordine)
  VALUES
    (p_company_id, 'Patente di guida',              'Patente di guida auto/moto/mezzo',  true,  60, false, true, 1),
    (p_company_id, 'Tessera professionale (DURC)',   'DURC di congruità / tessera edile', true,  30, true,  true, 2),
    (p_company_id, 'Visita medica idoneità',         'Art. 41 D.Lgs 81/08',               true,  30, true,  true, 3),
    (p_company_id, 'Corso sicurezza generale',       'D.Lgs 81/08 — Accordo Stato-Reg.',  true,  90, true,  true, 4),
    (p_company_id, 'Corso primo soccorso',           'D.Lgs 81/08 — 12h min.',            true,  90, false, true, 5),
    (p_company_id, 'Corso antincendio',              'D.Lgs 81/08 — rischio medio',       true,  90, false, true, 6),
    (p_company_id, 'Abilitazione RSPP/ASPP',         'D.Lgs 81/08 — responsabile sicur.', true,  60, false, true, 7),
    (p_company_id, 'Carta d''identità',              'Documento di riconoscimento',        true,  60, false, true, 8),
    (p_company_id, 'Permesso di soggiorno',          'Solo per cittadini extra-UE',        true,  30, false, true, 9),
    (p_company_id, 'Contratto di lavoro',            'Copia del contratto firmato',        false, 0,  false, true, 10)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Seed per aziende esistenti
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM companies LOOP
    PERFORM seed_tipi_documento_operaio(r.id);
  END LOOP;
END;
$$;

-- Trigger: seed automatico per nuove aziende
CREATE OR REPLACE FUNCTION trigger_seed_tipi_documento_new_company()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM seed_tipi_documento_operaio(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_company_insert_seed_tipi_doc
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION trigger_seed_tipi_documento_new_company();

-- ─── Funzione: aggiorna stato scadenze in bulk ────────────────────────────────
CREATE OR REPLACE FUNCTION aggiorna_stati_documenti_operai()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH updated AS (
    UPDATE documenti_operai
    SET stato = CASE
      WHEN data_scadenza IS NULL THEN 'senza_scadenza'
      WHEN data_scadenza < CURRENT_DATE THEN 'scaduto'
      WHEN data_scadenza <= CURRENT_DATE + INTERVAL '30 days' THEN 'in_scadenza'
      ELSE 'valido'
    END
    WHERE (
      (data_scadenza IS NULL     AND stato != 'senza_scadenza') OR
      (data_scadenza < CURRENT_DATE AND stato != 'scaduto') OR
      (data_scadenza <= CURRENT_DATE + INTERVAL '30 days' AND data_scadenza >= CURRENT_DATE AND stato != 'in_scadenza') OR
      (data_scadenza > CURRENT_DATE + INTERVAL '30 days' AND stato != 'valido')
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN updated_count;
END;
$$;

-- ─── Cron giornaliero 08:00 ───────────────────────────────────────────────────
-- Aggiorna stati e chiama l'edge function per le notifiche
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'check-scadenze-documenti-daily',
      '0 8 * * *',
      $outer$
        SELECT aggiorna_stati_documenti_operai();
      $outer$
    );
  END IF;
END;
$$;
