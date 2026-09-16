-- Lo staff con il permesso «modifica clienti» può davvero modificare i
-- clienti. Caso Green Energy 16/09/2026: Lidia (pratiche@) ha creato una
-- commessa con un cliente, ha corretto il nome dalla scheda cliente e non si
-- salvava. Su profiles scriveva solo company_admin: l'UPDATE dello staff
-- toccava 0 righe, senza errore, e il nome tornava quello di prima.
--
-- Vale solo per le righe che sono CLIENTI (ruolo customer) di un'azienda a
-- cui l'utente accede: lo staff non modifica colleghi né amministratori.
-- Il controllo sta in una funzione SECURITY DEFINER: letto dentro la policy,
-- user_roles rimanda a profiles e Postgres segnala una ricorsione infinita
-- (il primo tentativo, rimosso dopo pochi minuti, faceva proprio questo).

drop policy if exists "Staff can update customers if permitted" on public.profiles;

create or replace function public.staff_puo_modificare_cliente(p_profile_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    p_company_id is not null
    and public.has_permission(auth.uid(), 'can_edit_customers')
    and public.user_can_access_company(p_company_id)
    and not public.utente_e_cliente_esterno()
    and exists (
      select 1 from public.user_roles r
       where r.user_id = p_profile_id and r.role = 'customer'::public.app_role
    )
    and not exists (
      select 1 from public.user_roles r
       where r.user_id = p_profile_id and r.role <> 'customer'::public.app_role
    ),
  false);
$$;
revoke all on function public.staff_puo_modificare_cliente(uuid, uuid) from public, anon;
grant execute on function public.staff_puo_modificare_cliente(uuid, uuid) to authenticated;

create policy "Staff can update customers if permitted" on public.profiles
  for update to authenticated
  using (public.staff_puo_modificare_cliente(id, company_id))
  with check (public.staff_puo_modificare_cliente(id, company_id));
