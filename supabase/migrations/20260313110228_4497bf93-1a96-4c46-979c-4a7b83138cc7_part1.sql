CREATE VIEW public.callcenter_lead_journey
WITH (security_invoker = true)
AS
SELECT
  mc.id AS contact_id,
  mc.company_id,
  mc.assigned_to AS operatore_assegnato,
  mc.created_at AS lead_created_at,
  mc.source AS fonte_lead,
  MIN(cl.started_at) AS prima_chiamata_at,
  EXTRACT(EPOCH FROM (
    MIN(cl.started_at::timestamptz) - mc.created_at::timestamptz
  )) / 60.0 AS speed_to_lead_minuti,
  COUNT(cl.id) AS nr_tentativi,
  COUNT(cl.id) FILTER (WHERE cl.outcome = 'answered') AS nr_contatti_riusciti,
  BOOL_OR(cl.outcome = 'answered') AS fu_contattato,
  COUNT(cl.id) > 0 AS fu_lavorato,
  AVG(cl.duration_sec / 60.0) FILTER (WHERE cl.outcome = 'answered') AS durata_media_chiamata,
  COUNT(DISTINCT apt.id) AS appuntamenti_fissati,
  COUNT(DISTINCT apt.id) FILTER (WHERE apt.status = 'confermato') AS appuntamenti_show_up
FROM public.marketing_contacts mc
LEFT JOIN public.call_logs cl ON cl.contact_id = mc.id
LEFT JOIN public.appointments apt ON apt.contact_id = mc.id
GROUP BY mc.id, mc.company_id, mc.assigned_to, mc.created_at, mc.source;
