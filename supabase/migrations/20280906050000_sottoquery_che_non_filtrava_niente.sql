-- ════════════════════════════════════════════════════════════════════════════
-- Undici policy la cui sottoquery non filtrava niente
-- ════════════════════════════════════════════════════════════════════════════
--
-- Trovate chiudendo l'accesso dei clienti, ma non riguardano solo loro: sono
-- una perdita fra aziende che tocca chiunque sia autenticato.
--
-- La forma è questa, ripetuta su sei tabelle:
--     company_id IN ( SELECT company_governance_settings.company_id
--                       FROM user_roles
--                      WHERE user_roles.user_id = auth.uid() )
--
-- La sottoquery pesca `company_id` dalla TABELLA ESTERNA, non da `user_roles`
-- — e `user_roles` una colonna `company_id` non ce l'ha, per questo chi ha
-- scritto la policy ha qualificato col nome di fuori. Il risultato è che la
-- sottoquery restituisce il company_id della riga che si sta esaminando, una
-- volta per ogni ruolo dell'utente. Quindi la condizione dice soltanto:
-- «l'utente ha almeno un ruolo». Non filtra per azienda.
--
-- Misurato prima di correggere, con quattro utenti — due amministratori di
-- aziende diverse, uno staff e un cliente:
--     company_governance_settings ... 18 righe / 18 aziende, per tutti e quattro
--     company_email_preferences ..... 18 righe / 18 aziende, per tutti e quattro
-- Le aziende nel sistema sono 18.
--
-- Le altre quattro tabelle oggi sono vuote, quindi la perdita è latente: si
-- vedrebbe alla prima riga. Fra queste c'è `discount_rules`, con una policy
-- ALL: chiunque potrebbe leggere **e scrivere** il tetto sconto di un'altra
-- impresa. È la tabella su cui si appoggia `sconto_max_azienda` dell'ondata 1.
--
-- La correzione è la stessa ovunque: `user_can_access_company(company_id)`,
-- che è la domanda che la policy voleva fare — azienda propria, accessi
-- multi-azienda, super admin, commercialista delegato — più il vincolo di
-- ruolo dove c'era, e l'esclusione dei clienti perché sono tutte tabelle
-- interne.
--
-- Dopo: 18 → 1 per tutti. L'unico che ne vede 2 è l'amministratore demo, e
-- sono la sua azienda più quella su cui ha un `multi_company_access` attivo —
-- verificato una per una, nessuna estranea.

ALTER POLICY cgs_read ON public.company_governance_settings
  USING (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY cgs_write ON public.company_governance_settings
  USING (public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY cep_read ON public.company_email_preferences
  USING (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY cep_write ON public.company_email_preferences
  USING (public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY ced_company_read ON public.company_email_domains
  USING (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY ced_company_write ON public.company_email_domains
  USING (public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno());

-- Leggere e scrivere il tetto sconto di un'altra impresa.
ALTER POLICY discount_rules_company_access ON public.discount_rules
  USING (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY quote_approvals_company_access ON public.quote_approvals
  USING (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY quote_salespeople_company_access ON public.quote_salespeople
  USING (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (public.user_can_access_company(company_id)
         AND NOT public.utente_e_cliente_esterno());

-- Il ramo `company_id IS NULL` è la lista globale delle soppressioni: resta
-- leggibile a tutte le aziende di proposito, sono indirizzi da non contattare
-- mai.
ALTER POLICY email_suppressions_read ON public.email_suppressions
  USING ((company_id IS NULL
          OR public.user_can_access_company(company_id))
         AND NOT public.utente_e_cliente_esterno());

ALTER POLICY email_suppressions_write ON public.email_suppressions
  USING (company_id IS NOT NULL
         AND public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (company_id IS NOT NULL
         AND public.user_can_access_company(company_id)
         AND (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
              OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
         AND NOT public.utente_e_cliente_esterno());
