-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Indici per filtrare il DB freddo (segmentazione outreach) sulla company scoped
create index if not exists idx_mc_tags_gin on public.marketing_contacts using gin (tags);
create index if not exists idx_mc_company_province on public.marketing_contacts (company_id, province);
create index if not exists idx_mc_company_region on public.marketing_contacts (company_id, region);
create index if not exists idx_mc_company_fatturato on public.marketing_contacts (company_id, fatturato);
create index if not exists idx_mc_company_dipendenti on public.marketing_contacts (company_id, dipendenti);
create index if not exists idx_mc_company_ateco on public.marketing_contacts (company_id, ateco_code);
create index if not exists idx_mc_vat on public.marketing_contacts (vat_number) where vat_number is not null;
