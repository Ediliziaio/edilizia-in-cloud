-- ════════════════════════════════════════════════════════════════════════════
-- Prenotazioni: il titolare del calendario è occupato anche dai suoi impegni
-- interni (altri appuntamenti e giornate di cantiere)
-- ════════════════════════════════════════════════════════════════════════════
-- La pagina /prenota e gli agenti che prenotano guardavano solo gli
-- appuntamenti DI QUEL calendario e gli impegni di Google/Outlook/Apple. Un
-- appuntamento della stessa persona su un altro calendario, uno legato a una
-- commessa (senza calendario) o una giornata in cantiere non toglievano
-- l'orario: il cliente poteva prenotare sopra.
--
-- impegni_interni_persona: quando una persona è occupata, da dentro l'app.
--   appuntamento  assegnato a lei, non annullato, con l'ora (fine: l'ora di
--                 fine o 60 minuti)
--   cantiere      giornate intere: da operaio (employees.user_id o la scheda
--                 HR collegata) sulle fasi o sulle date della commessa; da
--                 capo o componente di una squadra assegnata
-- Vista interna, senza titoli: la leggono solo il server e la vista pubblica.
-- public_calendar_busy_slots la aggiunge per i titolari dei calendari
-- pubblici, sempre (non dipende dal blocco degli impegni esterni), tranne gli
-- appuntamenti dei calendari della persona stessa, che la pagina conta già.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE VIEW public.impegni_interni_persona AS
WITH
persone_operai AS (
  SELECT e.id AS employee_id, e.user_id FROM public.employees e WHERE e.user_id IS NOT NULL
  UNION
  SELECT h.employee_id, h.user_id FROM public.hr_profili h WHERE h.user_id IS NOT NULL AND h.employee_id IS NOT NULL
),
persone_squadre AS (
  SELECT t.id AS squadra_id, t.leader_user_id AS user_id FROM public.external_teams t WHERE t.leader_user_id IS NOT NULL
  UNION
  SELECT c.squadra_id, h.user_id FROM public.squadre_componenti c JOIN public.hr_profili h ON h.id = c.hr_profilo_id
   WHERE h.user_id IS NOT NULL
),
giorni_cantiere AS (
  -- operaio sulla commessa (sulla fase, se c'è)
  SELECT p.user_id, o.company_id, o.id AS order_id,
         coalesce(f.start_date, o.work_start_date) AS dal,
         coalesce(f.end_date, o.work_end_date, f.start_date, o.work_start_date) AS al
    FROM persone_operai p
    JOIN public.order_employees oe ON oe.employee_id = p.employee_id
    JOIN public.orders o ON o.id = oe.order_id AND o.deleted_at IS NULL
    LEFT JOIN public.order_work_phases f ON f.id = oe.phase_id
  UNION ALL
  -- squadra assegnata (calendario delle squadre)
  SELECT p.user_id, o.company_id, o.id,
         coalesce(s.dal, f.start_date, o.work_start_date),
         coalesce(s.al, f.end_date, s.dal, f.start_date, o.work_end_date, o.work_start_date)
    FROM persone_squadre p
    JOIN public.squadre_commesse s ON s.squadra_id = p.squadra_id
    JOIN public.orders o ON o.id = s.order_id AND o.deleted_at IS NULL
    LEFT JOIN public.order_work_phases f ON f.id = s.phase_id
  UNION ALL
  -- squadra esterna collegata alla commessa
  SELECT p.user_id, o.company_id, o.id,
         coalesce(f.start_date, o.work_start_date),
         coalesce(f.end_date, o.work_end_date, f.start_date, o.work_start_date)
    FROM persone_squadre p
    JOIN public.order_external_teams x ON x.external_team_id = p.squadra_id
    JOIN public.orders o ON o.id = x.order_id AND o.deleted_at IS NULL
    LEFT JOIN public.order_work_phases f ON f.id = x.phase_id
)
SELECT a.assigned_to AS user_id, a.company_id,
       ((a.appointment_date + a.appointment_time) AT TIME ZONE 'Europe/Rome') AS start_at,
       ((a.appointment_date + coalesce(a.appointment_end_time, a.appointment_time + interval '60 minutes')) AT TIME ZONE 'Europe/Rome') AS end_at,
       'appuntamento'::text AS fonte, a.id AS appointment_id, a.calendar_id
  FROM public.appointments a
 WHERE a.assigned_to IS NOT NULL
   AND a.appointment_date IS NOT NULL AND a.appointment_time IS NOT NULL
   AND coalesce(lower(a.status), '') NOT IN ('annullato','annullata','cancellato','cancellata','cancelled','canceled','disdetto','no_show')
UNION ALL
SELECT g.user_id, g.company_id,
       (g.dal::timestamp AT TIME ZONE 'Europe/Rome'),
       ((g.al + 1)::timestamp AT TIME ZONE 'Europe/Rome'),
       'cantiere'::text, NULL::uuid, NULL::uuid
  FROM giorni_cantiere g
 WHERE g.dal IS NOT NULL AND g.al IS NOT NULL AND g.al >= g.dal;

-- Solo il server e la vista pubblica qui sotto.
REVOKE ALL ON public.impegni_interni_persona FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.impegni_interni_persona TO service_role;

CREATE OR REPLACE VIEW public.public_calendar_busy_slots AS
 WITH titolari AS (
         SELECT DISTINCT mc.owner_id AS user_id
           FROM marketing_calendars mc
          WHERE ((mc.owner_id IS NOT NULL) AND (mc.booking_slug IS NOT NULL) AND (mc.is_active = true))
        ), blocca AS (
         SELECT t.user_id
           FROM (titolari t
             LEFT JOIN public_calendar_owner_prefs p ON ((p.user_id = t.user_id)))
          WHERE (COALESCE(p.block_busy_slots, true) = true)
        )
 SELECT 'google'::text AS provider,
    b.user_id,
    b.start_at,
    b.end_at,
    b.is_all_day
   FROM (google_calendar_busy_slots b
     JOIN blocca ON ((blocca.user_id = b.user_id)))
UNION ALL
 SELECT 'outlook'::text AS provider,
    b.user_id,
    b.start_at,
    b.end_at,
    b.is_all_day
   FROM (outlook_calendar_busy_slots b
     JOIN blocca ON ((blocca.user_id = b.user_id)))
UNION ALL
 SELECT 'apple'::text AS provider,
    b.user_id,
    b.start_at,
    b.end_at,
    b.is_all_day
   FROM (apple_calendar_busy_slots b
     JOIN blocca ON ((blocca.user_id = b.user_id)))
UNION ALL
 -- Impegni interni: sempre. Gli appuntamenti dei calendari della persona stessa
 -- li conta già la pagina (public_appointment_slots), e così uno spostamento
 -- non trova occupato il proprio orario.
 SELECT 'interno'::text AS provider,
    i.user_id,
    i.start_at,
    i.end_at,
    (i.fonte = 'cantiere') AS is_all_day
   FROM (impegni_interni_persona i
     JOIN titolari t ON ((t.user_id = i.user_id)))
  WHERE i.fonte = 'cantiere'
     OR i.calendar_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM marketing_calendars c WHERE c.id = i.calendar_id AND c.owner_id = i.user_id);
