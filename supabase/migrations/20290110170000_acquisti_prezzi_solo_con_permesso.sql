-- Explicit transaction required by the LOCK TABLE statements below.
BEGIN;
-- Prezzi di ordini e offerte: la lettura diretta solo a chi ha il permesso (08/11/2026).
--
-- Va applicata DOPO il client che legge le viste `*_senza_prezzi` (commit ae717b291).
-- Regola restrittiva sulla sola SELECT: chi ha `can_view_costs` o `can_manage_purchasing` legge
-- come prima; gli altri leggono le viste. Prima di metterla: 12 funzioni e 3 viste leggono queste
-- tabelle coi permessi dell'utente, e 35 punti ci scrivono. Per non romperle in silenzio la
-- regola guarda solo le GET dirette: dentro una RPC, una POST o una PATCH senza ritorno non si
-- applica. Una PATCH che chiede indietro la riga conta come lettura.
--
-- Nessuna riga viene scritta. CREATE POLICY blocca auth finché la transazione è aperta: va breve.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.acquisti_lettura_non_diretta()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select current_setting('request.path', true) like '/rpc/%'
      or current_setting('request.method', true) = 'POST'
      or (current_setting('request.method', true) in ('PATCH', 'DELETE')
          and coalesce((nullif(current_setting('request.headers', true), '')::jsonb)->>'prefer', '') !~ 'return=representation');
$function$;
revoke all on function public.acquisti_lettura_non_diretta() from public, anon;
grant execute on function public.acquisti_lettura_non_diretta() to authenticated;

lock table public.purchase_orders, public.purchase_order_items, public.supplier_rfq_quotes, public.supplier_rfq_suppliers in access exclusive mode;

drop policy if exists prezzi_solo_con_permesso on public.purchase_orders;
create policy prezzi_solo_con_permesso on public.purchase_orders as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or (select public.utente_super_admin())
         or company_id = any ((select public.aziende_area(array['can_view_costs','can_manage_purchasing']))::uuid[]));

drop policy if exists prezzi_solo_con_permesso on public.purchase_order_items;
create policy prezzi_solo_con_permesso on public.purchase_order_items as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or (select public.utente_super_admin())
         or company_id = any ((select public.aziende_area(array['can_view_costs','can_manage_purchasing']))::uuid[]));

drop policy if exists prezzi_solo_con_permesso on public.supplier_rfq_quotes;
create policy prezzi_solo_con_permesso on public.supplier_rfq_quotes as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or (select public.utente_super_admin())
         or company_id = any ((select public.aziende_area(array['can_view_costs','can_manage_purchasing']))::uuid[]));

drop policy if exists prezzi_solo_con_permesso on public.supplier_rfq_suppliers;
create policy prezzi_solo_con_permesso on public.supplier_rfq_suppliers as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or (select public.utente_super_admin())
         or company_id = any ((select public.aziende_area(array['can_view_costs','can_manage_purchasing']))::uuid[]));

COMMIT;
