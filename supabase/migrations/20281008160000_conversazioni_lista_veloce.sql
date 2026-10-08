-- Conversazioni: la lista e il contatore dei non letti costavano quasi metà del tempo del database.
--
-- 08/10/2026, dopo il blocco del database delle 11:47: nei 20 minuti dopo il riavvio `conversazioni_lista` era il 44%
-- del tempo totale (152 chiamate da 1,5 s) e `conversazioni_non_lette` un altro 12% (ricostruiva la lista intera
-- solo per contarla), chiamate ogni 25-30 secondi da ogni utente con il gestionale aperto.
-- Causa: i non letti si contavano rileggendo tutti i messaggi dell'azienda per ogni conversazione (quadratico).
-- Ora un solo passaggio; risultato identico riga per riga (verificato su 4 aziende con EXCEPT ALL nei due versi).
-- BeMade: lista 633 → 37 ms, non letti → 7 ms.

CREATE OR REPLACE FUNCTION public.conversazioni_lista(p_company_id uuid)
 RETURNS TABLE(entita_tipo text, entita_id uuid, nome text, email text, telefono text, ultimo_ts timestamp with time zone, ultimo_canale text, ultimo_direzione text, anteprima text, non_letti bigint, totale_messaggi bigint, stato text, assegnato_a uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  -- 08/10/2026: i non letti si contano in UN passaggio (prima: un conteggio sull'intera lista dei messaggi per OGNI
  -- conversazione, quadratico: 633 ms su BeMade a riposo, 1,5 s sotto carico, il 44% del tempo del database).
  -- Stesso risultato riga per riga, verificato su 4 aziende; ora 37 ms.
  RETURN QUERY
  WITH msg AS MATERIALIZED (
    SELECT m.entita_tipo, m.entita_id, m.ts, m.canale, m.direzione, m.testo FROM public.v_conversazioni_messaggi m WHERE m.company_id = p_company_id
    UNION ALL
    SELECT s.entita_tipo, s.entita_id, s.ts, s.canale, s.direzione, s.testo FROM public.v_conversazioni_social s WHERE s.company_id = p_company_id
  ),
  conv AS (
    SELECT c.entita_tipo, c.entita_id, c.stato, c.assegnato_a, c.last_read_at FROM public.conversazioni c WHERE c.company_id = p_company_id
  ),
  agg AS (
    SELECT m.entita_tipo, m.entita_id, count(*) AS tot, max(m.ts) AS last_ts,
           count(*) FILTER (WHERE m.direzione = 'in' AND m.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)) AS nl
      FROM msg m
      LEFT JOIN conv cv ON cv.entita_tipo = m.entita_tipo AND cv.entita_id = m.entita_id
     GROUP BY m.entita_tipo, m.entita_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id) m.entita_tipo, m.entita_id, m.canale, m.direzione, m.testo
      FROM msg m ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
  )
  SELECT
    a.entita_tipo, a.entita_id,
    CASE a.entita_tipo
      WHEN 'contatto' THEN NULLIF(trim(COALESCE(mc.first_name,'')||' '||COALESCE(mc.last_name,'')), '')
      WHEN 'cliente'  THEN NULLIF(trim(COALESCE(pr.first_name,'')||' '||COALESCE(pr.last_name,'')), '')
    END,
    CASE a.entita_tipo WHEN 'contatto' THEN mc.email WHEN 'cliente' THEN pr.email END,
    CASE a.entita_tipo WHEN 'contatto' THEN mc.phone WHEN 'cliente' THEN pr.phone END,
    a.last_ts, u.canale, u.direzione, left(u.testo, 140),
    a.nl::bigint, a.tot::bigint,
    COALESCE(cv.stato, 'aperta'), cv.assegnato_a
  FROM agg a
  JOIN ultimo u ON u.entita_tipo = a.entita_tipo AND u.entita_id = a.entita_id
  LEFT JOIN conv cv ON cv.entita_tipo = a.entita_tipo AND cv.entita_id = a.entita_id
  LEFT JOIN public.marketing_contacts mc ON a.entita_tipo = 'contatto' AND mc.id = a.entita_id
  LEFT JOIN public.profiles pr ON a.entita_tipo = 'cliente' AND pr.id = a.entita_id
  ORDER BY a.last_ts DESC
;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conversazioni_non_lette(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- 08/10/2026: prima ricostruiva l'intera lista (nomi, anteprime) solo per contarne le righe, ogni 30 secondi per
  -- ogni utente con il gestionale aperto. Ora conta solo i messaggi in arrivo dopo l'ultima lettura.
  WITH msg AS (
    SELECT m.entita_tipo, m.entita_id, m.ts FROM public.v_conversazioni_messaggi m WHERE m.company_id = p_company_id AND m.direzione = 'in'
    UNION ALL
    SELECT s.entita_tipo, s.entita_id, s.ts FROM public.v_conversazioni_social s WHERE s.company_id = p_company_id AND s.direzione = 'in'
  )
  SELECT count(*)::integer INTO n FROM (
    SELECT m.entita_tipo, m.entita_id
      FROM msg m
      LEFT JOIN public.conversazioni cv
             ON cv.company_id = p_company_id AND cv.entita_tipo = m.entita_tipo AND cv.entita_id = m.entita_id
     WHERE m.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)
     GROUP BY m.entita_tipo, m.entita_id
  ) x;
  RETURN n;
END;
$function$;
