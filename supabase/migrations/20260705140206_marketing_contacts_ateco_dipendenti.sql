-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Colonne per il database freddo importato (filtrabili lato CRM superadmin)
alter table public.marketing_contacts add column if not exists ateco_code text;
alter table public.marketing_contacts add column if not exists dipendenti text;
comment on column public.marketing_contacts.ateco_code is 'Codice ATECO attività (import DB freddo)';
comment on column public.marketing_contacts.dipendenti is 'Fascia dipendenti es. "10-19 dipendenti" (import DB freddo)';
