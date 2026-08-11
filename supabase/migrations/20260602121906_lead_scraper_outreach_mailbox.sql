-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Outreach via caselle collegate: traccia quale casella ha inviato (rotazione + cap/giorno).
alter table public.lead_scraper_outreach
  add column if not exists oauth_connection_id uuid
    references public.email_oauth_connections(id) on delete set null;

comment on column public.lead_scraper_outreach.oauth_connection_id is
  'Casella mittente usata (se channel=mailbox): per cap giornaliero e reporting.';

-- conteggio veloce degli invii di oggi per casella (enforcement del cap)
create index if not exists idx_lss_outreach_conn_day
  on public.lead_scraper_outreach (oauth_connection_id, created_at)
  where oauth_connection_id is not null;
