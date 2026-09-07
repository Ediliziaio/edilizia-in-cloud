-- Portale commercialista (06/09/2026): lettura di fatture, incassi, rate e conti
-- banca per lo studio delegato. Le policy esistenti su queste tabelle richiedono
-- `company_id = get_my_company_id()`, che per il commercialista (senza azienda
-- propria) non è mai vera → /azienda/fatturazione mostrava «0,00 €» pur avendo
-- l'azienda 201 fatture. Aggiungiamo policy SELECT dedicate, come le altre 41
-- tabelle già coperte, basate su `user_can_read_accountant_company` (firm member
-- attivo con accesso active/invited/suspended all'azienda). Solo lettura.
-- Applicata sul live via Management API a statement singoli (lock_timeout breve),
-- poi `supabase migration repair --status applied 20280911000001 --linked`.

-- Fatture attive dell'azienda delegata
DROP POLICY IF EXISTS invoices_accountant_select ON public.invoices;
CREATE POLICY invoices_accountant_select ON public.invoices
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- Incassi collegati alle fatture (registro pagamenti)
DROP POLICY IF EXISTS invoice_payments_accountant_select ON public.invoice_payments;
CREATE POLICY invoice_payments_accountant_select ON public.invoice_payments
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- Rate delle commesse (scadenzario incassi). order_installments non ha
-- company_id: si passa dalla commessa.
DROP POLICY IF EXISTS order_installments_accountant_select ON public.order_installments;
CREATE POLICY order_installments_accountant_select ON public.order_installments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_installments.order_id
        AND public.user_can_read_accountant_company(o.company_id)
    )
  );

-- Conti banca (tesoreria: la lista conti; i movimenti bank_transactions sono
-- già coperti). bank_accounts ha company_id.
DROP POLICY IF EXISTS bank_accounts_accountant_select ON public.bank_accounts;
CREATE POLICY bank_accounts_accountant_select ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));
