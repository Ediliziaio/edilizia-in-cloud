-- Scelta del cliente nella nuova commessa: i dati per riconoscerlo e cercarlo (15/11/2026)
--
-- get_company_customers dà solo nome ed email: nella tendina «Condominio DEMO 2023 10» e
-- «Condominio DEMO 2023 14» erano indistinguibili, e non si poteva cercare per telefono,
-- indirizzo o partita IVA. clienti_per_scelta dà gli stessi clienti, con gli stessi controlli
-- d'accesso, più telefono, indirizzo, città, dati fiscali e tipo (Privato / Azienda / PA,
-- dall'anagrafica fiscale collegata quando c'è). get_company_customers resta com'è per chi la usa.

create or replace function public.clienti_per_scelta(p_company_id uuid)
returns table(
  id uuid, first_name text, last_name text, email text,
  business_name text, is_business boolean, tipo_cliente text,
  phone text, address text, city text, province text,
  site_address text, site_city text,
  vat_number text, fiscal_code text, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select distinct on (p.id)
    p.id, p.first_name, p.last_name, p.email,
    coalesce(nullif(trim(p.business_name), ''), nullif(trim(a.ragione_sociale), '')),
    coalesce(p.is_business, false),
    a.tipo_cliente,
    coalesce(nullif(trim(p.phone), ''), nullif(trim(a.cellulare), ''), nullif(trim(a.telefono), '')),
    coalesce(nullif(trim(p.address), ''),
             nullif(trim(concat_ws(' ', a.indirizzo_via, a.indirizzo_numero_civico)), '')),
    coalesce(nullif(trim(p.city), ''), nullif(trim(a.indirizzo_comune), '')),
    coalesce(nullif(trim(p.province), ''), nullif(trim(a.indirizzo_provincia), '')),
    nullif(trim(p.site_address), ''), nullif(trim(p.site_city), ''),
    coalesce(nullif(trim(p.vat_number), ''), nullif(trim(a.partita_iva), '')),
    coalesce(nullif(trim(p.fiscal_code), ''), nullif(trim(a.codice_fiscale), '')),
    p.created_at
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id and ur.role = 'customer'::public.app_role
  left join lateral (
    select an.* from public.anagrafiche_native an
     where an.company_id = p_company_id and an.cliente_id = p.id
     order by an.created_at desc limit 1
  ) a on true
  where p.company_id = p_company_id
    and public.can_access_company_people(p_company_id)
    and not public.e_solo_campo()
    and not public.utente_e_cliente_esterno()
  order by p.id
$$;
revoke all on function public.clienti_per_scelta(uuid) from public, anon;
grant execute on function public.clienti_per_scelta(uuid) to authenticated, service_role;
