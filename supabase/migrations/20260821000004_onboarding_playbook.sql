-- Template task onboarding
CREATE TABLE IF NOT EXISTS onboarding_task_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordine INT NOT NULL DEFAULT 0,
  titolo TEXT NOT NULL,
  descrizione TEXT,
  giorni_da_iscrizione INT NOT NULL DEFAULT 0,
  assegna_a_ruolo TEXT DEFAULT 'cs_agent',
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task istanziati per ogni azienda
CREATE TABLE IF NOT EXISTS onboarding_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES onboarding_task_template(id),
  titolo TEXT NOT NULL,
  descrizione TEXT,
  stato TEXT NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare', 'in_corso', 'completato', 'saltato')),
  assegnato_a UUID REFERENCES auth.users(id),
  assegnato_a_nome TEXT,
  scadenza DATE,
  completato_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE onboarding_task_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_task ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin task template full access"
  ON onboarding_task_template FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "SuperAdmin onboarding task full access"
  ON onboarding_task FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_onboarding_task_company ON onboarding_task(company_id, stato);

-- Template task predefiniti
INSERT INTO onboarding_task_template (ordine, titolo, descrizione, giorni_da_iscrizione) VALUES
  (1, 'Chiamata di benvenuto', 'Contattare l''azienda per presentarsi e verificare accesso', 1),
  (2, 'Verifica setup iniziale', 'Controllare che l''azienda abbia configurato dati aziendali e primo cantiere', 3),
  (3, 'Training base', 'Inviare link video tutorial o schedulare demo', 5),
  (4, 'Check-in 30 giorni', 'Verificare utilizzo piattaforma e risolvere dubbi', 30),
  (5, 'Proposta upsell', 'Valutare se proporre upgrade piano o moduli aggiuntivi', 60)
ON CONFLICT DO NOTHING;
