-- F3-07 — La pagina Coorti smette di essere un vicolo cieco.
--
-- La route /admin/cohort è registrata e protetta, ma la vista che la alimenta
-- non è mai esistita: chi ci arrivava vedeva soltanto un errore. Il piano
-- prevedeva "creare la vista o togliere la route": ora i dati per costruirla
-- ci sono davvero, quindi la si crea.
--
-- Coorte = mese di iscrizione dell'azienda.
-- Attività = mesi in cui quella azienda ha avuto sessioni reali
-- (user_sessions.last_active_at, la stessa sorgente di DAC/WAC e dell'ultimo
-- accesso in lista aziende: una sola definizione di "attivo" in tutto il
-- prodotto, invece di tre diverse).
--
-- La retention si legge per riga: quante delle aziende iscritte nel mese X
-- erano ancora attive dopo N mesi.

CREATE OR REPLACE VIEW public.cohort_revenue_view
WITH (security_invoker = true)
AS
WITH aziende AS (
  SELECT c.id,
         date_trunc('month', c.created_at)::date AS cohort_mese
    FROM public.companies c
   WHERE COALESCE(c.is_platform_admin_company, false) = false
     AND c.deleted_at IS NULL
), attivita AS (
  SELECT DISTINCT
         us.company_id,
         date_trunc('month', us.last_active_at)::date AS mese_attivita
    FROM public.user_sessions us
   WHERE us.company_id IS NOT NULL
     AND us.last_active_at IS NOT NULL
)
SELECT
  a.cohort_mese,
  t.mese_attivita,
  -- Mesi trascorsi dall'iscrizione: 0 = mese di ingresso.
  (EXTRACT(YEAR  FROM age(t.mese_attivita, a.cohort_mese)) * 12
   + EXTRACT(MONTH FROM age(t.mese_attivita, a.cohort_mese)))::int AS mesi_dalla_iscrizione,
  count(DISTINCT a.id)                                             AS aziende_attive,
  count(*)                                                         AS eventi_totali
FROM aziende a
JOIN attivita t ON t.company_id = a.id
WHERE t.mese_attivita >= a.cohort_mese
GROUP BY a.cohort_mese, t.mese_attivita
ORDER BY a.cohort_mese DESC, mesi_dalla_iscrizione;

COMMENT ON VIEW public.cohort_revenue_view IS
  'Retention per coorte di iscrizione, calcolata sulle sessioni reali (user_sessions): stessa definizione di "azienda attiva" usata da DAC/WAC e dall''ultimo accesso.';

GRANT SELECT ON public.cohort_revenue_view TO authenticated, service_role;
