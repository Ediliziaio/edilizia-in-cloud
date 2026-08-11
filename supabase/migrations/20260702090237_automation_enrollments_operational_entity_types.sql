-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.automation_enrollments DROP CONSTRAINT automation_enrollments_entity_type_check;
ALTER TABLE public.automation_enrollments ADD CONSTRAINT automation_enrollments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'contact'::text, 'opportunity'::text, 'appointment'::text,
    'order'::text, 'invoice'::text, 'payment'::text, 'cost'::text,
    'quote'::text, 'ticket'::text, 'stock'::text, 'task'::text,
    'employee'::text, 'leave_request'::text,
    'company'::text
  ]));
