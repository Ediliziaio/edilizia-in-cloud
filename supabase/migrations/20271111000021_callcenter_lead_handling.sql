-- get_callcenter_lead_handling: analisi "lavorazione lead" del call center nel periodo.
-- Distingue chiamate a lead NUOVI (creati nel periodo) vs VECCHI (riattivazione),
-- tasso di risposta per gruppo, tempo medio al 1° contatto riuscito (lead nuovi),
-- e distribuzione delle chiamate per età del lead. Basato su call_logs + marketing_contacts.
-- Applicata in prod via MCP (apply_migration) il 2026-06-30; alimenta il pannello
-- "Lavorazione lead" nel tab Call center (LavorazioneLeadPanel).
CREATE OR REPLACE FUNCTION public.get_callcenter_lead_handling(
  p_company_id uuid, p_data_inizio date, p_data_fine date, p_operatore_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  chiamate_totali bigint,
  chiamate_nuovi bigint,
  chiamate_vecchi bigint,
  risposte_totali bigint,
  tasso_risposta_totale numeric,
  tasso_risposta_nuovi numeric,
  tasso_risposta_vecchi numeric,
  lead_nuovi_chiamati bigint,
  lead_vecchi_chiamati bigint,
  tempo_medio_primo_contatto_ore numeric,
  chiamate_eta_0_7 bigint,
  chiamate_eta_8_30 bigint,
  chiamate_eta_31_60 bigint,
  chiamate_eta_oltre_60 bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH calls AS (
    SELECT
      cl.id,
      cl.contact_id,
      cl.outcome,
      cl.started_at,
      mc.created_at AS lead_created,
      (mc.created_at::date >= p_data_inizio) AS is_nuovo,
      GREATEST(0, (cl.started_at::date - mc.created_at::date)) AS eta_gg
    FROM call_logs cl
    JOIN marketing_contacts mc ON mc.id = cl.contact_id
    WHERE cl.company_id = p_company_id
      AND cl.started_at::date BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR cl.user_id = p_operatore_id)
  ),
  first_contact_nuovi AS (
    SELECT contact_id, MIN(started_at) AS first_answered_at, MIN(lead_created) AS lead_created
    FROM calls
    WHERE outcome = 'answered' AND is_nuovo
    GROUP BY contact_id
  )
  SELECT
    (SELECT count(*) FROM calls),
    (SELECT count(*) FROM calls WHERE is_nuovo),
    (SELECT count(*) FROM calls WHERE NOT is_nuovo),
    (SELECT count(*) FROM calls WHERE outcome = 'answered'),
    ROUND(100.0 * (SELECT count(*) FROM calls WHERE outcome = 'answered') / NULLIF((SELECT count(*) FROM calls), 0), 1),
    ROUND(100.0 * (SELECT count(*) FROM calls WHERE outcome = 'answered' AND is_nuovo) / NULLIF((SELECT count(*) FROM calls WHERE is_nuovo), 0), 1),
    ROUND(100.0 * (SELECT count(*) FROM calls WHERE outcome = 'answered' AND NOT is_nuovo) / NULLIF((SELECT count(*) FROM calls WHERE NOT is_nuovo), 0), 1),
    (SELECT count(DISTINCT contact_id) FROM calls WHERE is_nuovo),
    (SELECT count(DISTINCT contact_id) FROM calls WHERE NOT is_nuovo),
    (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_answered_at::timestamptz - lead_created::timestamptz)) / 3600.0)::numeric, 1) FROM first_contact_nuovi),
    (SELECT count(*) FROM calls WHERE eta_gg BETWEEN 0 AND 7),
    (SELECT count(*) FROM calls WHERE eta_gg BETWEEN 8 AND 30),
    (SELECT count(*) FROM calls WHERE eta_gg BETWEEN 31 AND 60),
    (SELECT count(*) FROM calls WHERE eta_gg > 60);
$function$;
