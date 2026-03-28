-- Migrare dati esistenti da marketing_opportunity_notes
INSERT INTO marketing_contact_notes (contact_id, company_id, content, created_by, created_at, opportunity_id)
SELECT mo.contact_id, mon.company_id, mon.content, mon.created_by, mon.created_at, mon.opportunity_id
FROM marketing_opportunity_notes mon
JOIN marketing_opportunities mo ON mo.id = mon.opportunity_id;
