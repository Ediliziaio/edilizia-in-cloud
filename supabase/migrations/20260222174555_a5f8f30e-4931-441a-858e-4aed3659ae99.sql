
-- Parte 1: Aggiungere opportunity_id alla tabella note contatti
ALTER TABLE marketing_contact_notes 
  ADD COLUMN opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL;

-- Migrare dati esistenti da marketing_opportunity_notes
INSERT INTO marketing_contact_notes (contact_id, company_id, content, created_by, created_at, opportunity_id)
SELECT mo.contact_id, mon.company_id, mon.content, mon.created_by, mon.created_at, mon.opportunity_id
FROM marketing_opportunity_notes mon
JOIN marketing_opportunities mo ON mo.id = mon.opportunity_id;

-- Parte 2: Aggiungere colonne per collegare i task a contatti e opportunita
ALTER TABLE tasks 
  ADD COLUMN contact_id uuid REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL;
