-- Le fatture emesse non si vedevano entrando in un'azienda dal superadmin.
--
-- Nella piattaforma convivono due modi di rispondere a "di quale azienda sono?":
--   • get_effective_company_id()  → l'azienda in cui SEI ENTRATO (impersonificazione
--     o selezione multi-azienda), con ricaduta sul profilo. La usa quasi tutto.
--   • get_user_company_id(uid)    → solo l'azienda scritta nel profilo.
--
-- invoices e invoice_payments usavano la seconda: entrando in Renova il database
-- continuava a credere di essere in Platform Admin e non mostrava nulla — 62
-- fatture per 701.210 € invisibili, mentre le fatture RICEVUTE della stessa
-- azienda si vedevano tutte (quelle usano già la prima).
--
-- Non allarga niente: l'impersonificazione è già riservata al super admin e la
-- selezione multi-azienda richiede comunque una riga in multi_company_access.
-- Cambia solo COME si stabilisce l'azienda corrente; ruoli e permessi restano.

drop policy if exists invoices_lettura_authenticated on public.invoices;
create policy invoices_lettura_authenticated on public.invoices
  for select to authenticated
  using (
    (client_id = (select auth.uid()))
    or exists (
      select 1 from public.orders o
      where o.id = invoices.order_id and o.customer_id = (select auth.uid())
    )
    or (
      company_id = (select public.get_my_company_id())
      and (
        (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
        or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
        or (select public.has_role((select auth.uid()), 'accountant'::public.app_role))
        or (select public.has_permission((select auth.uid()), 'can_view_billing'::text))
      )
    )
  );

drop policy if exists invoices_billing_write on public.invoices;
create policy invoices_billing_write on public.invoices
  for all to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and (
      (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'accountant'::public.app_role))
      or (select public.has_permission((select auth.uid()), 'can_view_billing'::text))
    )
  )
  with check (
    company_id = (select public.get_my_company_id())
    and (
      (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'accountant'::public.app_role))
      or (select public.has_permission((select auth.uid()), 'can_view_billing'::text))
    )
  );

-- Stessa cura sugli incassi: senza, la lista si vedrebbe ma gli importi
-- pagati resterebbero a zero.
drop policy if exists invoice_payments_billing on public.invoice_payments;
create policy invoice_payments_billing on public.invoice_payments
  for all to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and (
      (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'accountant'::public.app_role))
      or (select public.has_permission((select auth.uid()), 'can_view_billing'::text))
    )
  )
  with check (
    company_id = (select public.get_my_company_id())
    and (
      (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_role((select auth.uid()), 'accountant'::public.app_role))
      or (select public.has_permission((select auth.uid()), 'can_view_billing'::text))
    )
  );
