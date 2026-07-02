-- FIX: i trigger OPERATIVI non potevano MAI arruolare nessuno.
-- Il CHECK di automation_enrollments accettava solo contact|opportunity|appointment,
-- ma gli emettitori operativi (migration 20270616110000: ordini/fatture/pagamenti/
-- costi/preventivi/ticket/magazzino/HR/task) producono eventi con entity_type
-- cost/order/invoice/... → l'INSERT dell'iscrizione violava il vincolo e il motore
-- ingoiava l'errore (console.error + continue) → "Triggered, enrolled: 0" in
-- silenzio, per ogni evento non-CRM. Scoperto con l'e2e del template
-- "Alert Costo Anomalo" (evento cost_registered emesso ma zero iscrizioni).
-- Applicata in prod via MCP il 2026-07-02.
ALTER TABLE public.automation_enrollments DROP CONSTRAINT automation_enrollments_entity_type_check;
ALTER TABLE public.automation_enrollments ADD CONSTRAINT automation_enrollments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    -- CRM (storici)
    'contact'::text, 'opportunity'::text, 'appointment'::text,
    -- Operativi (emettitori 20270616110000)
    'order'::text, 'invoice'::text, 'payment'::text, 'cost'::text,
    'quote'::text, 'ticket'::text, 'stock'::text, 'task'::text,
    'employee'::text, 'leave_request'::text,
    -- Piattaforma (platformAutomation)
    'company'::text
  ]));
