-- Il riferimento dei bonifici è il codice della commessa già esistente (17/11/2026).
-- File creato dalla CLI e ordinato dopo le migrazioni da cui dipende.
-- Non copia order_code in campi aggiuntivi e non modifica commesse o incassi esistenti.

CREATE OR REPLACE FUNCTION private.tes_codice_in_causale(p_codice text, p_causale text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT private.tes_codice_valido(p_codice) AND coalesce(
    upper(coalesce(p_causale, '')) ~ (
      '(^|[^A-Z0-9])' ||
      (SELECT string_agg(c, '[^A-Z0-9]*' ORDER BY n)
         FROM regexp_split_to_table(private.tes_codice_norm(p_codice), '') WITH ORDINALITY x(c, n)) ||
      '([^A-Z0-9]|$)'), false)
$$;

-- Il codice principale ha precedenza; i riferimenti aggiuntivi già salvati restano leggibili.
-- I confini impediscono che ORD-2025-001 corrisponda a ORD-2025-0010.
-- Separazioni e maiuscole non contano, anche per codici composti da più di tre parti.
CREATE OR REPLACE FUNCTION private.tes_codici_in_causale(p_company uuid, p_causale text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH ch AS (SELECT private.tes_causale_chiavi(p_causale) k)
  SELECT coalesce(jsonb_object_agg(o.id::text, jsonb_build_object('codice', c.codice, 'fonte', c.fonte,
           'commessa', coalesce(nullif(o.order_code, ''), left(o.description, 40), 'senza codice'))), '{}')
    FROM ch, public.orders o
    CROSS JOIN LATERAL (
      SELECT candidati.codice, candidati.fonte FROM (
        SELECT btrim(o.order_code) codice, 'codice_commessa'::text fonte, 0 priorita
          WHERE private.tes_codice_in_causale(o.order_code, p_causale)
        UNION ALL
        SELECT x.codice, x.fonte, 1
          FROM private.tes_codici_commessa(o.codici_committente, o.riferimento_committente, o.description, o.work_description) x
         WHERE x.chiave = ANY (ch.k)
      ) candidati ORDER BY candidati.priorita, candidati.fonte, length(candidati.codice) DESC LIMIT 1
    ) c
   WHERE o.company_id = p_company AND o.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION private.tes_codice_in_causale(text, text), private.tes_codici_in_causale(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Aggiorna la spiegazione mostrata dal motore, mantenendo le sue verifiche su cliente,
-- importo, ambiguità e interruttore aziendale di collegamento automatico.
DO $motivo$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  IF position('Codice del committente' IN d) > 0 THEN
    EXECUTE replace(d, 'Codice del committente', 'Codice commessa');
  ELSIF position('Codice commessa' IN d) = 0 THEN
    RAISE EXCEPTION 'tes_classifica: spiegazione dei codici non trovata';
  END IF;
END $motivo$;
