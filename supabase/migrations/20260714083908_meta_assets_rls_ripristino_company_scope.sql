-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ROLLBACK del filtro selected=true: nasconde le pagine appena importate
-- (tutte selected=false) al picker "Seleziona le pagine", che le legge in
-- diretta con RLS → dialog vuota. L'isolamento multi-tenant resta garantito
-- da: (1) scope company_id qui sotto — un'azienda non vede MAI asset di
-- un'altra; (2) purge-unselected che elimina le pagine non scelte dopo la
-- conferma; (3) guard di appartenenza nel meta-api-proxy (service role).
drop policy if exists "Users can view selected company meta assets" on public.meta_assets;

create policy "Users can view own company meta assets"
on public.meta_assets
for select
using (company_id = get_user_company_id((select auth.uid())));
