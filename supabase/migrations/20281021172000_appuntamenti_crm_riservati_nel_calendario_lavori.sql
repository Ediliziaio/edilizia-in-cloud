-- ════════════════════════════════════════════════════════════════════════════
-- Appuntamenti del CRM dei colleghi: nel calendario dei lavori «Occupato»,
-- anche nel database
-- ════════════════════════════════════════════════════════════════════════════
-- Chi ha il calendario dei lavori (can_view_calendar) o modifica le commesse
-- (can_edit_orders) ma non vede gli appuntamenti del CRM leggeva comunque
-- titolo, note, indirizzo e contatto degli appuntamenti commerciali dei
-- colleghi: la pagina li copriva con «Occupato» (appuntamentiRiservati.ts),
-- ma arrivavano al browser.
--
-- Da qui le due regole leggono un appuntamento senza commessa solo se è
-- proprio (creato o assegnato) o se si vedono i sopralluoghi. Chi vede il CRM
-- passa dalla sua regola («Staff can view appointments via marketing»), gli
-- amministratori dalla loro: per loro non cambia niente.
--
-- Per gli altri resta l'impegno: calendario_impegni_riservati() dà data, ora,
-- tipo e persona, nient'altro, con gli stessi limiti di visibilità.
--
-- Al 21/10/2026: 38 utenti col calendario senza CRM, 32 con le commesse senza
-- CRM, nessuno di loro con i sopralluoghi.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER POLICY "appointments_lettura_authenticated" ON public.appointments
  USING (
    (
      (SELECT has_permission((SELECT auth.uid()), 'can_view_calendar'::text))
      AND company_id = (SELECT get_user_company_id((SELECT auth.uid())))
      AND check_staff_visibility((SELECT auth.uid()), assigned_to)
      AND NOT (SELECT utente_e_cliente_esterno())
      AND (
        order_id IS NOT NULL
        OR created_by = (SELECT auth.uid())
        OR assigned_to = (SELECT auth.uid())
        OR (SELECT has_permission((SELECT auth.uid()), 'can_view_sopralluoghi'::text))
      )
    )
    OR (
      assigned_to = (SELECT auth.uid())
      AND company_id = (SELECT get_my_company_id())
      AND NOT (SELECT utente_e_cliente_esterno())
    )
    OR (
      contact_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM marketing_contacts mc
                   WHERE mc.id = appointments.contact_id AND mc.email = get_auth_email())
    )
  );

ALTER POLICY "Staff can manage appointments if permitted" ON public.appointments
  USING (
    (SELECT has_permission((SELECT auth.uid()), 'can_edit_orders'::text))
    AND company_id = (SELECT get_user_company_id((SELECT auth.uid())))
    AND check_staff_visibility((SELECT auth.uid()), assigned_to)
    AND NOT (SELECT utente_e_cliente_esterno())
    AND (
      order_id IS NOT NULL
      OR created_by = (SELECT auth.uid())
      OR assigned_to = (SELECT auth.uid())
      OR (SELECT has_permission((SELECT auth.uid()), 'can_view_sopralluoghi'::text))
    )
  );

-- Gli impegni che le regole sopra non lasciano leggere: solo quando e chi.
CREATE OR REPLACE FUNCTION public.calendario_impegni_riservati(p_dal date, p_al date)
 RETURNS TABLE (
   id uuid, appointment_date date, appointment_time time, appointment_end_time time,
   appointment_type text, assigned_to uuid, created_by uuid, calendar_id uuid,
   company_id uuid, status text, is_completed boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.appointment_date, a.appointment_time, a.appointment_end_time,
         a.appointment_type, a.assigned_to, a.created_by, a.calendar_id,
         a.company_id, a.status, a.is_completed
    FROM appointments a
   WHERE auth.uid() IS NOT NULL
     AND NOT utente_bloccato()
     AND NOT utente_e_cliente_esterno()
     AND has_permission(auth.uid(), 'can_view_calendar')
     AND a.company_id = get_user_company_id(auth.uid())
     AND a.appointment_date BETWEEN p_dal AND p_al
     AND p_al - p_dal <= 400
     AND a.order_id IS NULL
     AND a.created_by IS DISTINCT FROM auth.uid()
     AND a.assigned_to IS DISTINCT FROM auth.uid()
     AND COALESCE(a.status, '') NOT IN ('annullato','annullata','cancellato','cancellata','cancelled','canceled','no_show')
     AND check_staff_visibility(auth.uid(), a.assigned_to)
   ORDER BY a.appointment_date, a.appointment_time, a.id
$function$;

REVOKE ALL ON FUNCTION public.calendario_impegni_riservati(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendario_impegni_riservati(date, date) TO authenticated;
