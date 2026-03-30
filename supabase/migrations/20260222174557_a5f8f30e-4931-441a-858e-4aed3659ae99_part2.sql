-- Parte 2: Aggiungere colonne per collegare i task a contatti e opportunita
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL;
