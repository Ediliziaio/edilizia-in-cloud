-- ============================================================
-- VIEW: callcenter_lead_journey
-- Per ogni lead: prima chiamata, ultimo stato, nr tentativi
-- ============================================================
DROP VIEW IF EXISTS public.callcenter_lead_journey CASCADE;
CREATE OR REPLACE VIEW public.callcenter_lead_journey AS
SELECT
  mc.id AS contact_id,
  mc.company_id,
  mc.assigned_to AS operatore_assegnato,
  mc.created_at AS lead_created_at,
  mc.source AS fonte_lead,

  -- Prima chiamata effettuata su questo contatto
  MIN(cl.started_at) AS prima_chiamata_at,

  -- Speed to Lead in minuti
  EXTRACT(EPOCH FROM (
    MIN(cl.started_at::timestamptz) - mc.created_at::timestamptz
  )) / 60.0 AS speed_to_lead_minuti,

  -- Numero totale di tentativi di chiamata
  COUNT(cl.id) AS nr_tentativi,

  -- Numero di chiamate andate a buon fine (risposto)
  COUNT(cl.id) FILTER (
    WHERE cl.outcome = 'answered'
  ) AS nr_contatti_riusciti,

  -- Flag: il lead è stato contattato almeno una volta?
  BOOL_OR(cl.outcome = 'answered') AS fu_contattato,

  -- Flag: ha almeno una chiamata (lavorato)?
  COUNT(cl.id) > 0 AS fu_lavorato,

  -- Durata media delle chiamate riuscite (in minuti)
  AVG(cl.duration_sec / 60.0) FILTER (
    WHERE cl.outcome = 'answered'
  ) AS durata_media_chiamata,

  -- Appuntamenti fissati su questo contatto
  COUNT(DISTINCT apt.id) AS appuntamenti_fissati,

  -- Show-up (confermato)
  COUNT(DISTINCT apt.id) FILTER (
    WHERE apt.status = 'confermato'
  ) AS appuntamenti_show_up

FROM public.marketing_contacts mc
LEFT JOIN public.call_logs cl ON cl.contact_id = mc.id
LEFT JOIN public.appointments apt ON apt.contact_id = mc.id
GROUP BY mc.id, mc.company_id, mc.assigned_to, mc.created_at, mc.source;
