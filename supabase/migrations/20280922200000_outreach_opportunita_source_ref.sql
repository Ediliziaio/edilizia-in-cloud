-- Traccia da quale risposta (email o WhatsApp) nasce un'opportunità creata
-- in automatico, per il link "vai al messaggio originale" e per il funnel
-- nelle Statistiche campagna. Nessuna FK reale: source_ref_table indica
-- QUALE tabella guardare (sono due tabelle diverse, una FK non può puntare
-- a entrambe).
alter table public.marketing_opportunities
  add column if not exists source_ref_table text,
  add column if not exists source_ref_id uuid;

alter table public.marketing_opportunities
  drop constraint if exists marketing_opportunities_source_ref_table_check;
alter table public.marketing_opportunities
  add constraint marketing_opportunities_source_ref_table_check
  check (source_ref_table is null or source_ref_table in ('outreach_replies', 'openwa_campagna_destinatari'));

create index if not exists idx_marketing_opportunities_source_ref
  on public.marketing_opportunities (source_ref_table, source_ref_id)
  where source_ref_id is not null;
