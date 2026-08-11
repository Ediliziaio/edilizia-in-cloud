-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

grant usage on schema ads_agency to anon, authenticated;
grant select on ads_agency.kpi_daily to anon, authenticated;
grant select on ads_agency.clienti to anon, authenticated;

drop policy if exists "anon read kpi" on ads_agency.kpi_daily;
create policy "anon read kpi" on ads_agency.kpi_daily for select to anon, authenticated using (true);

drop policy if exists "anon read clienti" on ads_agency.clienti;
create policy "anon read clienti" on ads_agency.clienti for select to anon, authenticated using (true);
