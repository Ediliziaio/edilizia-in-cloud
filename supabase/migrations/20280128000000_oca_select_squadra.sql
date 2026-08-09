-- GIÀ APPLICATA sul live il 2026-08-09 via Management API (execute_sql).
-- NON eseguire con `supabase db push` (backlog migration: repo ≠ live).
--
-- La select su order_campo_assignments faceva vedere ai DIPENDENTI solo la
-- propria riga: "esiste un capocantiere?" risultava sempre falso (il gate
-- delle percentuali non scattava mai) e la lista squadra del capocantiere
-- mostrava solo lui. I compagni di cantiere della stessa azienda devono
-- vedersi tra loro: helper SECURITY DEFINER (una policy che legge la stessa
-- tabella andrebbe in ricorsione) + ramo aggiuntivo nella policy.

create or replace function public.user_assigned_to_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from order_campo_assignments
    where order_id = p_order_id and user_id = (select auth.uid())
  );
$fn$;
revoke all on function public.user_assigned_to_order(uuid) from public;
grant execute on function public.user_assigned_to_order(uuid) to authenticated;

drop policy oca_select on order_campo_assignments;
create policy oca_select on order_campo_assignments for select using (
  user_id = (select auth.uid())
  or (
    company_id = (select company_id from profiles where id = (select auth.uid()))
    and (
      exists (
        select 1 from user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role = any (array['company_admin'::app_role, 'company_staff'::app_role, 'super_admin'::app_role])
      )
      or public.user_assigned_to_order(order_id)
    )
  )
);
