-- Migrazione già applicata nel database, recuperata dal registro il 06/11/2026.
-- Stessa versione e stesso schema; aggiunte soltanto guardie per rendere la ripetizione idempotente.
drop trigger if exists company_document_templates_updated_at on public.company_document_templates;
create trigger company_document_templates_updated_at before update on public.company_document_templates for each row execute function public.update_updated_at_column();
