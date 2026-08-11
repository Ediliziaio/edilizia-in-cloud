-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create unique index if not exists invoices_external_unique
  on public.invoices (company_id, external_provider, external_id)
  where external_id is not null and external_provider is not null;
