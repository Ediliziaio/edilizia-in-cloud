-- Perche' vedo zero sopralluoghi.
--
-- Il numero degli appuntamenti nasce da due fonti messe insieme: il calendario
-- del CRM (tabella appointments) e il passaggio dell'opportunita' in una fase
-- che si chiama appuntamento, incontro o sopralluogo. Finche' il totale e' uno
-- solo, uno zero non si sa leggere: il cliente non fa sopralluoghi, oppure li
-- fa e non li segna da nessuna parte?
--
-- Sono due conversazioni diverse. La prima e' un problema di vendita, la
-- seconda e' un problema di CRM ed e' colpa nostra se non gliel'abbiamo
-- spiegato. Questa funzione separa le due fonti e, soprattutto, elenca le fasi
-- che ESISTONO nella pipeline del cliente e sembrano appuntamenti ma non le usa
-- nessuno: e' li' che sta quasi sempre la risposta.
--
-- Verificato il 12/09/2026: degli otto clienti marketing solo Suntech usa il
-- calendario. Best Infissi ha la fase «Appuntamento Fissato» dentro la pipeline
-- che usa davvero, con zero passaggi in trenta giorni.

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_appuntamenti(
  p_service_client_id uuid,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guardia AS (
    SELECT (SELECT public.mkt_vede_cliente(p_service_client_id)) AS ok
  ),
  p AS (
    SELECT coalesce(p_da, coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) - 29) AS da,
           coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) AS a,
           ((coalesce(p_da, coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) - 29))::timestamp AT TIME ZONE 'Europe/Rome') AS t_da,
           (((coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date)) + 1)::timestamp AT TIME ZONE 'Europe/Rome') AS t_a
  ),
  cli AS (
    SELECT sc.company_id
      FROM public.aedix_service_clients sc CROSS JOIN guardia
     WHERE sc.id = p_service_client_id AND guardia.ok AND sc.company_id IS NOT NULL
  ),
  -- Fonte 1: il calendario del CRM.
  cal AS (
    SELECT count(*) AS n, count(*) FILTER (WHERE a.opportunity_id IS NOT NULL) AS con_opportunita
      FROM public.appointments a JOIN cli ON cli.company_id = a.company_id CROSS JOIN p
     WHERE a.appointment_date >= p.da AND a.appointment_date <= p.a
       AND coalesce(a.status, '') NOT IN ('annullato', 'cancelled', 'cancellato')
       AND NOT coalesce(a.is_blocked_slot, false)
  ),
  -- Fonte 2: il passaggio in una fase che parla di appuntamenti.
  fasi AS (
    SELECT s.id, s.name, s.pipeline_id,
           (s.name ILIKE '%appuntament%' OR s.name ILIKE '%incontro%' OR s.name ILIKE '%sopralluogo%')
             AND s.name NOT ILIKE '%da fissare%' AND s.name NOT ILIKE '%rifissare%'
             AND s.name NOT ILIKE '%chiamata%' AS e_appuntamento
      FROM public.marketing_pipeline_stages s JOIN cli ON cli.company_id = s.company_id
  ),
  ingressi AS (
    SELECT f.id AS stage_id, f.name, f.e_appuntamento, f.pipeline_id,
           count(h.*) AS n
      FROM fasi f
      LEFT JOIN public.marketing_opportunity_stage_history h ON h.stage_id = f.id
       AND h.entered_at >= (SELECT t_da FROM p) AND h.entered_at < (SELECT t_a FROM p)
     GROUP BY 1, 2, 3, 4
  ),
  pipe AS (
    SELECT pl.id, pl.name,
           (SELECT count(*) FROM public.marketing_opportunities o
             JOIN public.marketing_pipeline_stages s2 ON s2.id = o.stage_id
            WHERE s2.pipeline_id = pl.id AND o.deleted_at IS NULL) AS opportunita
      FROM public.marketing_pipelines pl JOIN cli ON cli.company_id = pl.company_id
  )
  SELECT jsonb_build_object(
    'da_calendario', (SELECT n FROM cal),
    'calendario_con_opportunita', (SELECT con_opportunita FROM cal),
    'da_fase', (SELECT coalesce(sum(i.n), 0) FROM ingressi i WHERE i.e_appuntamento),
    -- Le fasi che contano come appuntamento, con quante volte sono state usate.
    'fasi', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'fase', i.name, 'pipeline', pl.name, 'ingressi', i.n)
                      ORDER BY i.n DESC, i.name), '[]'::jsonb)
               FROM ingressi i LEFT JOIN pipe pl ON pl.id = i.pipeline_id
              WHERE i.e_appuntamento),
    -- Le pipeline del cliente: se sono piu' di una, i numeri le sommano tutte.
    'pipeline', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'nome', pl.name, 'opportunita', pl.opportunita)
                          ORDER BY pl.opportunita DESC), '[]'::jsonb) FROM pipe pl),
    'periodo', (SELECT jsonb_build_object('da', p.da, 'a', p.a) FROM p)
  )
  WHERE (SELECT ok FROM guardia);
$$;

COMMENT ON FUNCTION public.admin_cliente_marketing_appuntamenti(uuid, date, date) IS
  'Da dove arrivano gli appuntamenti del cliente: calendario CRM, fasi della pipeline, e quali fasi esistono ma non le usa nessuno.';

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_appuntamenti(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_appuntamenti(uuid, date, date) TO authenticated, service_role;
