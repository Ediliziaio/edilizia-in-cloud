-- FK da article_templates verso tariffe_aziendali (ora esiste)
-- DROP + ADD garantisce idempotenza su ri-applicazioni della migration
ALTER TABLE public.article_templates
  DROP CONSTRAINT IF EXISTS fk_at_montaggio_tariffa;
