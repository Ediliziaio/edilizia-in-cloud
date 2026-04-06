-- Configurazione milestone notifiche
CREATE TABLE IF NOT EXISTS milestone_notifiche (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_key TEXT UNIQUE NOT NULL,
  descrizione TEXT NOT NULL,
  attiva BOOLEAN NOT NULL DEFAULT true,
  email_destinatario TEXT NOT NULL DEFAULT 'admin@ediliziaincloud.it',
  soggetto_template TEXT NOT NULL,
  corpo_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE milestone_notifiche ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin milestone full access"
  ON milestone_notifiche FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Milestone predefinite
INSERT INTO milestone_notifiche (milestone_key, descrizione, soggetto_template, corpo_template) VALUES
  ('primo_accesso', 'Prima volta che un utente azienda accede',
   'Nuova azienda attiva: {{nome_azienda}}',
   'L''azienda {{nome_azienda}} ({{piano}}) ha effettuato il primo accesso in data {{data}}.'),
  ('primo_ordine', 'Prima fattura/ordine generato',
   '{{nome_azienda}} ha generato il primo ordine',
   'L''azienda {{nome_azienda}} ha creato il suo primo ordine/fattura.'),
  ('upgrade_piano', 'Azienda ha fatto upgrade del piano',
   'Upgrade piano: {{nome_azienda}} ora su {{piano_nuovo}}',
   '{{nome_azienda}} è passata dal piano {{piano_vecchio}} al piano {{piano_nuovo}}.'),
  ('primo_cantiere', 'Primo cantiere creato',
   '{{nome_azienda}} ha creato il primo cantiere',
   'L''azienda {{nome_azienda}} ha creato il suo primo cantiere.'),
  ('inattivita_30gg', 'Nessun accesso da 30 giorni',
   'Attenzione: {{nome_azienda}} inattiva da 30 giorni',
   'L''azienda {{nome_azienda}} non effettua accessi da oltre 30 giorni.')
ON CONFLICT (milestone_key) DO NOTHING;
