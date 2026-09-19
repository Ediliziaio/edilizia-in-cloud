-- Facebook per i brand della piattaforma, dall'area del superadmin (19/09/2026).
--
-- Le tabelle del collegamento Meta si leggono e si scrivono solo per
-- l'«azienda in cui sei» (company_id = get_effective_company_id()). Il profilo
-- del superadmin non ha un'azienda: dall'area admin il wizard non poteva né
-- leggere lo stato né salvare pagine, moduli e mappature del CRM della
-- piattaforma. Risultato: la pagina «Flo» era rimasta agganciata a Demo
-- Azienda (collegamento scaduto dall'08/06) e i lead delle sponsorizzate si
-- fermavano in coda.
--
-- Il permesso nuovo vale SOLO per la piattaforma: il superadmin non tocca da
-- qui i collegamenti delle aziende clienti (per quelli c'è l'accesso
-- all'azienda, come prima). has_role dentro (select …): una volta per
-- query, non per riga.
do $$
declare
  t text;
  nome constant text := 'Superadmin: collegamenti Meta della piattaforma';
begin
  foreach t in array array['integrations', 'meta_assets', 'meta_lead_forms', 'integration_field_mappings'] loop
    execute format('drop policy if exists %I on public.%I', nome, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (company_id = %L::uuid and (select public.has_role((select auth.uid()), %L::public.app_role)))
         with check (company_id = %L::uuid and (select public.has_role((select auth.uid()), %L::public.app_role)))',
      nome, t,
      '00000000-0000-0000-0000-000000000001', 'super_admin',
      '00000000-0000-0000-0000-000000000001', 'super_admin');
  end loop;
end
$$;
