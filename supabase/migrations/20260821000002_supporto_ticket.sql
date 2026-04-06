-- Tabella ticket supporto
CREATE TABLE IF NOT EXISTS supporto_ticket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL,
  descrizione TEXT,
  priorita TEXT NOT NULL DEFAULT 'normale' CHECK (priorita IN ('bassa', 'normale', 'alta', 'urgente')),
  stato TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'in_lavorazione', 'in_attesa', 'risolto', 'chiuso')),
  categoria TEXT DEFAULT 'generale',
  assegnato_a UUID REFERENCES auth.users(id),
  assegnato_a_nome TEXT,
  aperto_da UUID REFERENCES auth.users(id),
  aperto_da_nome TEXT,
  risolto_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Risposte ticket
CREATE TABLE IF NOT EXISTS supporto_risposte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES supporto_ticket(id) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  autore_id UUID REFERENCES auth.users(id),
  autore_nome TEXT,
  is_interno BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE supporto_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE supporto_risposte ENABLE ROW LEVEL SECURITY;

-- SuperAdmin vede tutto
CREATE POLICY "SuperAdmin ticket full access"
  ON supporto_ticket FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Azienda vede i propri ticket
CREATE POLICY "Azienda propri ticket"
  ON supporto_ticket FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "SuperAdmin risposte full access"
  ON supporto_risposte FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_supporto_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_supporto_ticket_updated_at
  BEFORE UPDATE ON supporto_ticket
  FOR EACH ROW EXECUTE FUNCTION update_supporto_ticket_updated_at();

CREATE INDEX idx_ticket_company ON supporto_ticket(company_id, stato, created_at DESC);
CREATE INDEX idx_risposte_ticket ON supporto_risposte(ticket_id, created_at ASC);
