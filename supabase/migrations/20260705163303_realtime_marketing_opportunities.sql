-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Abilita Realtime su marketing_opportunities: la mappa CRM si aggiorna live quando
-- un'opportunità diventa "vinta" (il contatto diventa cliente → pin verde).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketing_opportunities'
  ) then
    alter publication supabase_realtime add table public.marketing_opportunities;
  end if;
end $$;
