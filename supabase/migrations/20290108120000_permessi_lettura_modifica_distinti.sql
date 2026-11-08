BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- Modalità esplicita per utenti che scrivono in alcune aree e consultano altre.
-- Le righe esistenti mantengono la regola corrente finché non viene attivata.
ALTER TABLE public.staff_permissions ADD COLUMN IF NOT EXISTS permessi_dettagliati boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.staff_permissions.permessi_dettagliati IS
  'Visualizzazione e modifica delle aree operative distinte. False conserva la modifica automatica dalla visibilità; sola_lettura blocca sempre tutte le scritture.';

CREATE OR REPLACE FUNCTION public.permessi_modifica_segue_visibilita()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  scrive boolean := not coalesce(new.sola_lettura, false);
begin
  new.can_edit_orders                  := coalesce(new.can_view_orders, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_orders, false));
  new.can_edit_warehouse               := coalesce(new.can_view_warehouse, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_warehouse, false));
  new.can_edit_mezzi                   := coalesce(new.can_view_mezzi, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_mezzi, false));
  new.can_edit_operai                  := coalesce(new.can_view_operai, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_operai, false));
  new.can_edit_customers               := coalesce(new.can_view_customers, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_customers, false));
  new.can_edit_tickets                 := coalesce(new.can_view_tickets, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_tickets, false));
  new.can_edit_giornale_lavori         := coalesce(new.can_view_giornale_lavori, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_giornale_lavori, false));
  new.can_edit_marketing_contacts      := coalesce(new.can_view_marketing_contacts, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_marketing_contacts, false));
  new.can_edit_marketing_opportunities := coalesce(new.can_view_marketing_opportunities, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_marketing_opportunities, false));
  new.can_edit_preventivi              := coalesce(new.can_view_preventivi, false) and scrive and (not new.permessi_dettagliati or coalesce(new.can_edit_preventivi, false));
  new.can_edit_marketing               := new.can_edit_marketing_contacts or new.can_edit_marketing_opportunities;

  if not scrive then
    new.can_edit_settings                := false;
    new.can_edit_settings_profile        := false;
    new.can_edit_settings_orders         := false;
    new.can_edit_settings_customization  := false;
    new.can_edit_settings_people         := false;
    new.can_edit_settings_pricing        := false;
    new.can_edit_settings_scontistica    := false;
    new.can_edit_settings_finanziamenti  := false;
    new.can_edit_settings_bundle         := false;
    new.can_edit_settings_suppliers      := false;
    new.can_edit_settings_integrations   := false;
    new.can_manage_payments              := false;
    new.can_manage_suppliers             := false;
    new.can_manage_warehouse_items       := false;
    new.can_manage_portal                := false;
    new.can_approve_orders               := false;
    new.can_approve_discounts            := false;
    new.can_delete_orders                := false;
    new.can_approve_variations            := false;
    new.can_manage_condizioni             := false;
    new.can_riscrivere_condizioni          := false;
    new.can_validate_bom                 := false;
    new.can_manage_purchasing            := false;
  end if;

  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.permessi_modifica_segue_visibilita() FROM public, anon, authenticated;

-- Le vecchie policy CRM includevano chi vede le commesse. In modalità
-- distinta servono i permessi espliciti anche per le letture via API.
CREATE OR REPLACE FUNCTION public.aziende_con_permessi_dettagliati()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT coalesce(array_agg(sp.company_id), '{}'::uuid[])
 FROM public.staff_permissions sp
 WHERE sp.user_id=(SELECT auth.uid()) AND sp.permessi_dettagliati
   AND (SELECT auth.uid()) IS NOT NULL AND NOT (SELECT public.utente_bloccato())
   AND NOT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
   AND sp.company_id NOT IN (SELECT unnest(public.aziende_con_permesso('__solo_amministratori__')));
$$;
REVOKE ALL ON FUNCTION public.aziende_con_permessi_dettagliati() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.aziende_con_permessi_dettagliati() TO authenticated,service_role;

DO $$
DECLARE t text; p text; altro text; condizione text;
BEGIN
 FOR t,p,altro IN SELECT * FROM (VALUES
  ('marketing_contacts','can_view_marketing_contacts',NULL::text),
  ('marketing_contact_activities','can_view_marketing_contacts',NULL::text),
  ('marketing_contact_notes','can_view_marketing_contacts',NULL::text),
  ('marketing_contact_lists','can_view_marketing_contacts',NULL::text),
  ('marketing_documents','can_view_marketing_contacts',NULL::text),
  ('marketing_tags','can_view_marketing_contacts',NULL::text),
  ('marketing_opportunities','can_view_marketing_opportunities',NULL::text),
  ('marketing_opportunity_notes','can_view_marketing_opportunities',NULL::text),
  ('marketing_pipelines','can_view_marketing_opportunities',NULL::text),
  ('marketing_pipeline_stages','can_view_marketing_opportunities',NULL::text),
  ('marketing_calendars','can_view_marketing_appointments',NULL::text),
  ('marketing_calendar_availability','can_view_marketing_appointments',NULL::text),
  ('marketing_calendar_preferences','can_view_marketing_appointments',NULL::text),
  ('marketing_custom_fields','can_view_marketing_contacts','can_view_marketing_opportunities')
 ) AS x(tabella,permesso,alternativo)
 LOOP
  condizione := format('company_id IN (SELECT unnest(public.aziende_con_permesso(%L)))',p);
  IF altro IS NOT NULL THEN
   condizione := condizione || format(' OR company_id IN (SELECT unnest(public.aziende_con_permesso(%L)))',altro);
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS permessi_distinti_lettura ON public.%I',t);
  EXECUTE format('CREATE POLICY permessi_distinti_lettura ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (company_id NOT IN (SELECT unnest(public.aziende_con_permessi_dettagliati())) OR (%s))',t,condizione);
 END LOOP;
END $$;
COMMIT;
