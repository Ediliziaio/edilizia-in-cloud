-- Firma Elettronica: «Email transazionale non configurata» era un falso allarme.
--
-- La pagina /azienda/firma-elettronica legge `email_transactional_provider` da
-- platform_settings per dire se le email di firma (OTP e link) partono. La
-- policy di lettura per `authenticated` ammetteva solo `meta_app_id` e
-- `referral_commission_policy`: per ogni utente d'azienda la select tornava
-- vuota e la pagina mostrava due avvisi gialli («non configurata»), mentre il
-- provider era impostato (resend, ultimo test ok). Il 25/09/2026 lo vedeva
-- ogni azienda, su desktop e su telefono.
--
-- Il nome del provider non è un segreto (la chiave API sta nel Vault con
-- `email_transactional_api_key`): lo si aggiunge alle chiavi leggibili.

DROP POLICY IF EXISTS platform_settings_lettura_authenticated ON public.platform_settings;
CREATE POLICY platform_settings_lettura_authenticated ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key = ANY (ARRAY['meta_app_id', 'referral_commission_policy', 'email_transactional_provider']));
