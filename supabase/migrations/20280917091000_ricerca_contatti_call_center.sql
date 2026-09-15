-- Ricerca contatti: chi vede solo i propri clienti trova anche quelli di cui è
-- call center o follower, e si può cercare il telefono.
--
-- marketing_contacts_cerca (SECURITY DEFINER) applicava «solo assegnati» come
-- `mc.assigned_to = v_uid`: un call center, che segue i contatti come
-- call_center_id e quasi mai come titolare, non trovava nessuno dei suoi
-- (BeMade, Venusia: 1.021 contatti come call center, 0 come titolare).
-- Ora la regola è la stessa delle policy di lettura di marketing_contacts:
-- titolare, call center, follower, o contatto di un'opportunità che segue.
-- Il telefono si confronta sulle sole cifre, senza spazi né prefisso.

CREATE OR REPLACE FUNCTION public.marketing_contacts_cerca(
  p_query text DEFAULT NULL::text,
  p_company_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, company_id uuid, first_name text, last_name text, email text, phone text, stato text, tipo text, assigned_to uuid, lead_score integer, created_at timestamp with time zone, totale bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aziende  uuid[];
  v_solo     boolean;
  v_uid      uuid := auth.uid();
  v_pattern  text;
  v_cifre    text;
  v_limit    integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset   integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  v_aziende := public.mc_aziende_visibili();
  v_solo    := public.solo_assegnati_attivo();

  -- Se chiedi una singola azienda, deve essere fra le tue: stesso errore per
  -- "non esiste" e "non è tua", per non rivelare quale delle due.
  IF p_company_id IS NOT NULL
     AND v_aziende IS NOT NULL
     AND NOT (p_company_id = ANY(v_aziende)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  v_pattern := CASE
    WHEN coalesce(btrim(p_query), '') = '' THEN NULL
    ELSE '%' || btrim(p_query) || '%'
  END;

  -- Un numero di telefono: solo cifre, senza 0039 / 39 davanti.
  v_cifre := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  IF length(v_cifre) > 10 AND v_cifre LIKE '0039%' THEN v_cifre := substr(v_cifre, 5);
  ELSIF length(v_cifre) > 10 AND v_cifre LIKE '39%' THEN v_cifre := substr(v_cifre, 3);
  END IF;
  IF length(v_cifre) < 6 THEN v_cifre := NULL; END IF;

  RETURN QUERY
  SELECT mc.id, mc.company_id, mc.first_name, mc.last_name,
         mc.email, mc.phone, mc.stato, mc.tipo,
         mc.assigned_to, mc.lead_score, mc.created_at,
         count(*) OVER ()::bigint AS totale
  FROM public.marketing_contacts mc
  WHERE (v_aziende IS NULL OR mc.company_id = ANY(v_aziende))
    AND (p_company_id IS NULL OR mc.company_id = p_company_id)
    AND (NOT v_solo
         OR mc.assigned_to = v_uid
         OR mc.call_center_id = v_uid
         OR mc.follower_id = v_uid
         OR mc.id IN (SELECT public.contatti_seguiti_da_me()))
    AND mc.deleted_at IS NULL
    AND (
      v_pattern IS NULL
      OR mc.first_name ILIKE v_pattern
      OR mc.last_name  ILIKE v_pattern
      OR mc.email      ILIKE v_pattern
      OR mc.phone      ILIKE v_pattern
      OR (coalesce(mc.first_name,'') || ' ' || coalesce(mc.last_name,'')) ILIKE v_pattern
      OR (v_cifre IS NOT NULL AND regexp_replace(coalesce(mc.phone, ''), '\D', '', 'g') LIKE '%' || v_cifre || '%')
    )
  ORDER BY mc.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.marketing_contacts_cerca(text, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_contacts_cerca(text, uuid, integer, integer) TO authenticated, service_role;
