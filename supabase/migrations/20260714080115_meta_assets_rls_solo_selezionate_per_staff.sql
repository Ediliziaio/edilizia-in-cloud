-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Isolamento multi-tenant Meta: l'OAuth salva TUTTE le pagine visibili
-- all'utente Meta che collega (anche pagine di ALTRI clienti dell'agenzia),
-- marcate selected=false fino alla scelta nel wizard. Gli utenti normali
-- dell'azienda NON devono vedere quell'elenco: solo le pagine selezionate.
-- Gli admin (che gestiscono il wizard) continuano a vedere tutto tramite
-- la policy "Admins can manage own company meta assets".
drop policy if exists "Users can view own company meta assets" on public.meta_assets;

create policy "Users can view selected company meta assets"
on public.meta_assets
for select
using (
  company_id = get_user_company_id((select auth.uid()))
  and (
    selected = true
    or has_role((select auth.uid()), 'company_admin'::app_role)
    or has_role((select auth.uid()), 'super_admin'::app_role)
  )
);
