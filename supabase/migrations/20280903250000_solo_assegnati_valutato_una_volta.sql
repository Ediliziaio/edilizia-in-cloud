-- ════════════════════════════════════════════════════════════════════════════
-- La condizione "solo le sue" che ho aggiunto ieri costava 2,7 s: ora è gratis
-- ════════════════════════════════════════════════════════════════════════════
-- Ieri ho chiuso un buco sulle note/attività marketing aggiungendo
-- `check_staff_visibility(uid, created_by)` alle policy di scrittura. Giusto nel
-- merito, sbagliato nella forma: quella funzione veniva chiamata RIGA PER RIGA
-- e su `marketing_contact_activities` (92.000 righe) costava ~2,7 secondi.
-- Misurato su un campione di 20.000 righe: 584 ms.
--
-- Ma la domanda "questo utente ha il flag solo-le-sue?" non dipende dalla riga:
-- dipende solo da chi guarda. Estratta in una funzione a sé e avvolta in
-- `(SELECT ...)`, Postgres la valuta UNA volta. Il confronto con `created_by`
-- resta per riga, ma è un banale uguale fra uuid. Dopo: 14,6 ms sulle stesse
-- 20.000 righe.
--
-- Semantica identica a check_staff_visibility(uid, created_by) — verificato:
-- l'admin vede tutte e 241 le note della sua azienda, un utente con il flag ne
-- vede 0 perché non ne ha create.
--
-- ⚠️ Resta un problema PREESISTENTE e non toccato qui: `has_permission_for_company`
-- è anch'essa per riga, costa ~24 s su 92.000 righe (dentro fa due has_role, un
-- EXISTS su multi_company_access, una lettura di information_schema.columns e
-- una EXECUTE dinamica) e `marketing_contact_activities` non ha nemmeno un
-- indice su company_id. Va affrontato a parte: riscrive policy non mie su una
-- tabella grande, e sbagliare la semantica dei permessi lì significa far
-- sparire i dati a qualcuno.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.solo_assegnati_attivo()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'company_admin'::public.app_role) THEN false
    ELSE COALESCE(
      (SELECT sp.only_assigned FROM public.staff_permissions sp WHERE sp.user_id = auth.uid()),
      false
    )
  END;
$function$;

COMMENT ON FUNCTION public.solo_assegnati_attivo() IS
  'Versione hoistabile di check_staff_visibility: risponde solo su CHI guarda, così nelle policy si valuta una volta invece che per riga.';

DROP POLICY IF EXISTS "Staff can manage contact activities if permitted" ON public.marketing_contact_activities;
CREATE POLICY "Staff can manage contact activities if permitted"
  ON public.marketing_contact_activities FOR ALL TO authenticated
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage contact notes if permitted" ON public.marketing_contact_notes;
CREATE POLICY "Staff can manage contact notes if permitted"
  ON public.marketing_contact_notes FOR ALL TO authenticated
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage opportunity notes if permitted" ON public.marketing_opportunity_notes;
CREATE POLICY "Staff can manage opportunity notes if permitted"
  ON public.marketing_opportunity_notes FOR ALL TO authenticated
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_opportunities', company_id)
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_opportunities', company_id)
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );
