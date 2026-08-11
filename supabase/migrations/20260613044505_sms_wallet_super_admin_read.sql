-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Allinea sms_wallet/sms_wallet_transazioni alle altre tabelle crediti
-- (email/ai/whatsapp): il super_admin deve poter LEGGERE il saldo SMS di
-- qualsiasi azienda dal pannello /admin/aziende/:id (tab Billing). Senza
-- questa policy la query lato browser tornava 0 righe → saldo SMS mostrato a 0.
DROP POLICY IF EXISTS sms_wallet_super_admin_read ON public.sms_wallet;
CREATE POLICY sms_wallet_super_admin_read
ON public.sms_wallet
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'::app_role
  )
);

DROP POLICY IF EXISTS sms_wallet_transazioni_super_admin_read ON public.sms_wallet_transazioni;
CREATE POLICY sms_wallet_transazioni_super_admin_read
ON public.sms_wallet_transazioni
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'::app_role
  )
);
