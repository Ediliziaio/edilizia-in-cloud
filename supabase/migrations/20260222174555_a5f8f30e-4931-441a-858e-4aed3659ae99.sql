-- Parte 1: Aggiungere opportunity_id alla tabella note contatti
ALTER TABLE marketing_contact_notes 
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL;
