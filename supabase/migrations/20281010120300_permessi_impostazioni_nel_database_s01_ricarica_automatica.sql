-- Permessi delle Impostazioni nel database — company_auto_topup: la ricarica automatica della carta
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- La regola la legge ogni persona interna dell'azienda; la scrive chi ha la fatturazione (amministratore, anche da accesso
-- multi-azienda, o staff con «Fatturazione») e il super admin. Soglia e importo stanno tra 5 e 1.000 €, come la ricarica manuale
-- (RechargeDialog.tsx). Il browser scrive solo i cinque campi della scheda Crediti (UnifiedAutoTopupCard.tsx); carta, tentativi e
-- ultimi addebiti li scrivono solo stripe-webhook e auto-topup-trigger (service role).
-- Più stretto, se serve: sostituire 'can_view_billing' con e_amministratore_di(company_id).

set local lock_timeout = '3s';

alter table public.company_auto_topup drop constraint if exists company_auto_topup_importi_ragionevoli;
alter table public.company_auto_topup
  add constraint company_auto_topup_importi_ragionevoli
  check (topup_amount_eur between 5 and 1000 and threshold_eur between 0 and 1000);

drop policy if exists "Authenticated users can manage own company auto topup" on public.company_auto_topup;
drop policy if exists auto_topup_lettura on public.company_auto_topup;
create policy auto_topup_lettura on public.company_auto_topup
  for select to authenticated
  using ((company_id = (select public.get_my_company_id())
          or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
         and not (select public.utente_e_cliente_esterno()));

drop policy if exists auto_topup_scrittura on public.company_auto_topup;
create policy auto_topup_scrittura on public.company_auto_topup
  for all to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and ((company_id = (select public.get_my_company_id())
               and company_id in (select unnest(public.aziende_con_permesso('can_view_billing'))))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (not (select public.utente_e_cliente_esterno())
         and ((company_id = (select public.get_my_company_id())
               and company_id in (select unnest(public.aziende_con_permesso('can_view_billing'))))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

-- Permessi di colonna: il browser scrive solo i cinque campi che la scheda manda (UnifiedAutoTopupCard.tsx:108-118).
-- Carta, tentativi e ultimi addebiti li scrivono solo stripe-webhook e auto-topup-trigger (service role).
revoke all on table public.company_auto_topup from anon;
revoke insert, update, delete, truncate, references, trigger on table public.company_auto_topup from authenticated;
grant insert (company_id, wallet_type, enabled, threshold_eur, topup_amount_eur) on table public.company_auto_topup to authenticated;
grant update (company_id, wallet_type, enabled, threshold_eur, topup_amount_eur) on table public.company_auto_topup to authenticated;
