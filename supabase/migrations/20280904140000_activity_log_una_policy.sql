-- Ondata 1.2/1.3 — company_activity_log: una policy sola, e le funzioni valutate
-- una volta invece che per riga.
--
-- Erano tre policy SELECT in OR, e dentro ognuna le funzioni di autorizzazione
-- erano chiamate nude:
--     has_role(( SELECT auth.uid() ), 'company_admin')
--     has_permission(( SELECT auth.uid() ), 'can_view_settings')
--     get_user_company_id(( SELECT auth.uid() ))
-- Solo `auth.uid()` era avvolto, quindi valutato una volta; le altre finivano
-- nel Filter, cioè eseguite una volta per riga. E has_permission fa un lookup
-- su information_schema più un EXECUTE dinamico a ogni chiamata.
--
-- Le tre policy diventano una, raccogliendo il fattore comune:
--     (admin AND azienda) OR (permesso AND azienda) OR super_admin
--   = super_admin OR (azienda AND (admin OR permesso))
--
-- Misurato: 1.120 ms (audit) -> 25 ms (con l'indice composto) -> 3,65 ms (qui).

DROP POLICY IF EXISTS "Company admins can view their activity logs" ON public.company_activity_log;
DROP POLICY IF EXISTS "Staff can view activity logs if permitted"   ON public.company_activity_log;
DROP POLICY IF EXISTS "Super admins can view all activity logs"     ON public.company_activity_log;

CREATE POLICY company_activity_log_lettura
  ON public.company_activity_log FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (
        (SELECT public.has_role(auth.uid(), 'company_admin'::public.app_role))
        OR (SELECT public.has_permission(auth.uid(), 'can_view_settings'))
      )
    )
  );
