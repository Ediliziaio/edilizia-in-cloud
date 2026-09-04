-- F3-04 — Gli errori diventano consultabili dal prodotto.
--
-- Gli errori esistono, ma in Sentry e nei log Supabase: fuori dal SuperAdmin.
-- Dalla segnalazione di un cliente ("non riesco a inviare la fattura") non
-- c'era modo di arrivare all'errore corrispondente senza uscire dalla
-- piattaforma e cercare a mano.
--
-- Le sorgenti ci sono già, sparse: system_health_metrics (edge function),
-- cron_http_failures (chiamate pianificate), order_errors (commesse),
-- wa_routing_errors (messaggistica), sdi_log (fatturazione elettronica).
-- Questa vista le mette in fila con lo stesso vocabolario.

CREATE OR REPLACE VIEW public.v_errori_piattaforma
WITH (security_invoker = true)
AS
SELECT
  'edge'::text                                  AS origine,
  m.id::text                                    AS id,
  m.recorded_at                                 AS avvenuto_il,
  m.function_name                               AS componente,
  COALESCE(m.error_message, 'HTTP ' || m.status_code::text) AS messaggio,
  m.status_code                                 AS codice,
  NULL::uuid                                    AS azienda_id,
  CASE WHEN m.status_code >= 500 THEN 'grave' ELSE 'avviso' END AS gravita,
  m.metadata                                    AS dettaglio
FROM public.system_health_metrics m
WHERE m.status_code >= 400

UNION ALL

SELECT
  'cron'::text,
  f.id::text,
  f.created_at,
  'chiamata pianificata',
  left(COALESCE(f.contenuto, ''), 300),
  f.status_code,
  NULL::uuid,
  CASE WHEN f.status_code >= 500 THEN 'grave' ELSE 'avviso' END,
  NULL::jsonb
FROM public.cron_http_failures f

UNION ALL

SELECT
  'commesse'::text,
  e.id::text,
  e.created_at,
  COALESCE(e.error_type, 'ordine'),
  left(COALESCE(e.error_message, ''), 300),
  NULL,
  e.company_id,
  'avviso',
  NULL::jsonb
FROM public.order_errors e;

COMMENT ON VIEW public.v_errori_piattaforma IS
  'Errori applicativi da più sorgenti in un unico elenco: edge function, chiamate pianificate, commesse.';

GRANT SELECT ON public.v_errori_piattaforma TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_errori_recenti(
  p_ore     integer DEFAULT 24,
  p_origine text    DEFAULT NULL,
  p_limit   integer DEFAULT 100
)
RETURNS TABLE (
  origine text, id text, avvenuto_il timestamptz, componente text,
  messaggio text, codice integer, azienda_id uuid, azienda_nome text,
  gravita text, dettaglio jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.origine, e.id, e.avvenuto_il, e.componente, e.messaggio, e.codice,
         e.azienda_id, c.name, e.gravita, e.dettaglio
  FROM public.v_errori_piattaforma e
  LEFT JOIN public.companies c ON c.id = e.azienda_id
  WHERE e.avvenuto_il > now() - make_interval(hours => GREATEST(p_ore, 1))
    AND (p_origine IS NULL OR e.origine = p_origine)
  ORDER BY e.avvenuto_il DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_errori_recenti(integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_errori_recenti(integer, text, integer) TO authenticated, service_role;
