-- Storici in sola lettura, ticket solo nella propria azienda.
--
-- Trovato il 26/09/2026 nel censimento delle policy di scrittura «solo stessa
-- azienda»:
--   - ai_credit_transactions (lo storico dei crediti AI): ogni membro
--     dell'azienda inseriva, modificava e cancellava le righe. Il saldo resta
--     su ai_credits, protetto; lo storico lo scrivono solo le funzioni SECURITY
--     DEFINER che consumano e ricaricano (charge_ai_call, consume_ai_credits,
--     deduct_ai_credits_with_markup, ensure_monthly_free_ai_credits);
--   - marketing_opportunity_stage_history (lo storico delle fasi, da cui
--     escono i report di vendita): ogni membro lo riscriveva. Lo scrive solo il
--     trigger log_marketing_opportunity_stage (SECURITY DEFINER);
--   - tickets_campo_insert chiedeva solo created_by = sé stessi: si inseriva un
--     ticket in qualsiasi azienda. Ora nell'azienda in cui si lavora.
-- Le letture restano quelle di prima.

set local lock_timeout = '3s';

drop policy if exists credit_transactions_company on public.ai_credit_transactions;
drop policy if exists credit_transactions_lettura on public.ai_credit_transactions;
create policy credit_transactions_lettura on public.ai_credit_transactions
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));

drop policy if exists "mosh company members" on public.marketing_opportunity_stage_history;
drop policy if exists mosh_lettura on public.marketing_opportunity_stage_history;
create policy mosh_lettura on public.marketing_opportunity_stage_history
  for select to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno()));

drop policy if exists tickets_campo_insert on public.tickets;
create policy tickets_campo_insert on public.tickets
  for insert to authenticated
  with check (((created_by = (select auth.uid())) or (customer_id = (select auth.uid())))
              and company_id = (select public.get_my_company_id()));
