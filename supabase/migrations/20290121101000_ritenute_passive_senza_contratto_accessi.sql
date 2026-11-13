-- Explicit transaction required by the LOCK TABLE statements below.
BEGIN;
-- «contratto_id IS NULL» voleva dire «ritenuta attiva». Ora una ritenuta al
-- subappaltatore può non avere contratto: resta dietro il permesso sui
-- subappaltatori come quelle col contratto.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.ritenute_garanzia IN ACCESS EXCLUSIVE MODE;

ALTER POLICY ufficio_leggi ON public.ritenute_garanzia
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_view_costs'::text, company_id)
    AND (direzione = 'attiva'
         OR has_permission_for_company((SELECT auth.uid()), 'can_view_subappaltatori_amministrazione'::text, company_id))
  );

ALTER POLICY ufficio_scrivi ON public.ritenute_garanzia
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_view_costs'::text, company_id)
    AND (direzione = 'attiva'
         OR has_permission_for_company((SELECT auth.uid()), 'can_view_subappaltatori_amministrazione'::text, company_id))
    AND NOT utente_sola_lettura(company_id)
    AND e_amministratore_di(company_id)
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_view_costs'::text, company_id)
    AND (direzione = 'attiva'
         OR has_permission_for_company((SELECT auth.uid()), 'can_view_subappaltatori_amministrazione'::text, company_id))
    AND NOT utente_sola_lettura(company_id)
    AND e_amministratore_di(company_id)
  );

COMMIT;
