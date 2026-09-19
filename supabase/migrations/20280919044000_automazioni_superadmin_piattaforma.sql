-- Automazioni della piattaforma dal superadmin: cartelle, versioni, coda (19/09/2026).
--
-- «Io sono amministratore e mi dà questo problema»: in admin › Marketing ›
-- Automazioni «Nuova cartella» rispondeva «Non hai i permessi per questa
-- operazione». Le regole di automation_folders guardano solo
-- get_user_company_id(), e il profilo del superadmin non ha un'azienda: le
-- cartelle del CRM della piattaforma non si potevano né creare né vedere.
-- Stesso buco su automation_flow_versions (storico versioni del flusso:
-- get_my_company_id()) e sulla lettura di automation_queue (i numeri di
-- esecuzioni ed errori). Flussi, nodi, collegamenti e iscrizioni avevano già
-- la regola del superadmin.
--
-- Come per i collegamenti Meta (20280919043000): il permesso vale SOLO per la
-- piattaforma, non per le aziende clienti. La coda si legge soltanto: la
-- scrive il motore.
do $$
declare
  t text;
  nome constant text := 'Superadmin: automazioni della piattaforma';
  piattaforma constant text := '00000000-0000-0000-0000-000000000001';
begin
  foreach t in array array['automation_folders', 'automation_flow_versions'] loop
    execute format('drop policy if exists %I on public.%I', nome, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (company_id = %L::uuid and (select public.has_role((select auth.uid()), %L::public.app_role)))
         with check (company_id = %L::uuid and (select public.has_role((select auth.uid()), %L::public.app_role)))',
      nome, t, piattaforma, 'super_admin', piattaforma, 'super_admin');
  end loop;

  execute format('drop policy if exists %I on public.automation_queue', nome);
  execute format(
    'create policy %I on public.automation_queue for select to authenticated
       using (company_id = %L::uuid and (select public.has_role((select auth.uid()), %L::public.app_role)))',
    nome, piattaforma, 'super_admin');
end
$$;
