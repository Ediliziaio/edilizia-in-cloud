create trigger company_document_templates_updated_at
before update on public.company_document_templates
for each row execute function public.update_updated_at_column();
