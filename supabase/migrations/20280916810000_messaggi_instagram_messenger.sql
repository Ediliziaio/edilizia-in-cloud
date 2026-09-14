-- Messaggi di Instagram e Facebook Messenger nella casella Conversazioni.
--
-- Richiesta del titolare (14/09): «in Chat → Conversazioni fai vedere chi
-- scrive da Instagram e Facebook». Fino a oggi meta-webhook riceveva solo i
-- lead dei moduli; social_inbox_items esisteva ma nessuno la riempiva.
--
-- social_identita: chi scrive (PSID Messenger / IGSID Instagram) legato a un
-- contatto del CRM. social_messaggi: i messaggi, in e out, deduplicati per
-- mid (l'eco di Meta di un messaggio inviato da qui ha lo stesso mid).
-- Scrivono solo le edge function (service role); le aziende leggono.
--
-- La vista v_conversazioni_messaggi NON si tocca (regge il WhatsApp ufficiale):
-- i messaggi social stanno in una vista a parte con le stesse colonne, unita
-- dentro conversazioni_lista / conversazione_timeline / conversazioni_cerca.

CREATE TABLE IF NOT EXISTS public.social_identita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  piattaforma text NOT NULL CHECK (piattaforma IN ('instagram', 'messenger')),
  -- pagina Facebook (Messenger) o account Instagram professionale che riceve
  account_id text NOT NULL,
  -- pagina Facebook da cui si risponde (token)
  pagina_id text NOT NULL,
  -- PSID / IGSID: id della persona valido solo per questa pagina/account
  utente_id text NOT NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  nome text,
  username text,
  avatar_url text,
  ultimo_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_identita_unica UNIQUE (company_id, piattaforma, account_id, utente_id)
);
CREATE INDEX IF NOT EXISTS social_identita_contatto_idx ON public.social_identita (contact_id);

CREATE TABLE IF NOT EXISTS public.social_messaggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  identita_id uuid NOT NULL REFERENCES public.social_identita(id) ON DELETE CASCADE,
  piattaforma text NOT NULL CHECK (piattaforma IN ('instagram', 'messenger')),
  direzione text NOT NULL CHECK (direzione IN ('in', 'out')),
  mid text,
  testo text,
  media_url text,
  allegati jsonb NOT NULL DEFAULT '[]'::jsonb,
  inviato_da uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inviato_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_messaggi_mid_unico UNIQUE (company_id, mid)
);
CREATE INDEX IF NOT EXISTS social_messaggi_identita_idx ON public.social_messaggi (identita_id, inviato_at DESC);
CREATE INDEX IF NOT EXISTS social_messaggi_azienda_idx ON public.social_messaggi (company_id, inviato_at DESC);

ALTER TABLE public.social_identita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_messaggi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_identita_lettura ON public.social_identita;
CREATE POLICY social_identita_lettura ON public.social_identita
  FOR SELECT TO authenticated
  USING (public.conversazioni_puo_accedere(company_id));

DROP POLICY IF EXISTS social_messaggi_lettura ON public.social_messaggi;
CREATE POLICY social_messaggi_lettura ON public.social_messaggi
  FOR SELECT TO authenticated
  USING (public.conversazioni_puo_accedere(company_id));

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.social_identita;
CREATE POLICY blocco_utente_bloccato ON public.social_identita AS RESTRICTIVE
  FOR ALL USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.social_messaggi;
CREATE POLICY blocco_utente_bloccato ON public.social_messaggi AS RESTRICTIVE
  FOR ALL USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));

REVOKE ALL ON public.social_identita FROM anon;
REVOKE ALL ON public.social_messaggi FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.social_identita FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_messaggi FROM authenticated;
GRANT SELECT ON public.social_identita TO authenticated;
GRANT SELECT ON public.social_messaggi TO authenticated;

-- Stesse colonne, stesso ordine di v_conversazioni_messaggi.
CREATE OR REPLACE VIEW public.v_conversazioni_social WITH (security_invoker = true) AS
SELECT
  'contatto'::text AS entita_tipo,
  si.contact_id AS entita_id,
  sm.company_id,
  sm.piattaforma AS canale,
  sm.direzione,
  COALESCE(NULLIF(si.username, ''), si.nome) AS controparte,
  NULL::text AS oggetto,
  COALESCE(NULLIF(sm.testo, ''),
    CASE WHEN sm.media_url IS NOT NULL OR jsonb_array_length(sm.allegati) > 0 THEN '📎 allegato' ELSE '' END) AS testo,
  sm.media_url,
  sm.inviato_at AS ts,
  'social_messaggi'::text AS ref_tabella,
  sm.id AS ref_id
FROM public.social_messaggi sm
JOIN public.social_identita si ON si.id = sm.identita_id
WHERE si.contact_id IS NOT NULL;

REVOKE ALL ON public.v_conversazioni_social FROM anon;
GRANT SELECT ON public.v_conversazioni_social TO authenticated;

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

  RETURN QUERY
  WITH msg AS (
    SELECT * FROM public.v_conversazioni_messaggi WHERE company_id = p_company_id
    UNION ALL
    SELECT * FROM public.v_conversazioni_social WHERE company_id = p_company_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo, m.entita_id, m.ts, m.canale, m.direzione, m.testo
    FROM msg m
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
  ),
  agg AS (
    SELECT m.entita_tipo, m.entita_id, count(*) AS tot, max(m.ts) AS last_ts
    FROM msg m GROUP BY m.entita_tipo, m.entita_id
  )
  SELECT
    a.entita_tipo,
    a.entita_id,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT NULLIF(trim(COALESCE(mc.first_name,'')||' '||COALESCE(mc.last_name,'')), '') FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT NULLIF(trim(COALESCE(pr.first_name,'')||' '||COALESCE(pr.last_name,'')), '') FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT mc.email FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT pr.email FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT mc.phone FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT pr.phone FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    a.last_ts, u.canale, u.direzione, left(u.testo, 140),
    COALESCE(nl.n, 0)::bigint, a.tot::bigint,
    COALESCE(cv.stato, 'aperta'), cv.assegnato_a
  FROM agg a
  JOIN ultimo u ON u.entita_tipo = a.entita_tipo AND u.entita_id = a.entita_id
  LEFT JOIN public.conversazioni cv
         ON cv.company_id = p_company_id AND cv.entita_tipo = a.entita_tipo AND cv.entita_id = a.entita_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM msg m2
    WHERE m2.entita_tipo = a.entita_tipo AND m2.entita_id = a.entita_id
      AND m2.direzione = 'in'
      AND m2.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)
  ) nl ON true
  ORDER BY a.last_ts DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conversazione_timeline(p_entita_tipo text, p_entita_id uuid)
 RETURNS TABLE(canale text, direzione text, controparte text, oggetto text, testo text, media_url text, ts timestamp with time zone, ref_tabella text, ref_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  IF p_entita_tipo = 'contatto' THEN
    SELECT company_id INTO v_company FROM public.marketing_contacts WHERE id = p_entita_id;
  ELSIF p_entita_tipo = 'cliente' THEN
    SELECT company_id INTO v_company FROM public.profiles WHERE id = p_entita_id;
  ELSE
    RAISE EXCEPTION 'entita_tipo non valido: %', p_entita_tipo USING ERRCODE = '22023';
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Accesso negato alla conversazione' USING ERRCODE = '42501';
  END IF;
  IF public.conversazioni_puo_accedere(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato alla conversazione' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.canale, m.direzione, m.controparte, m.oggetto,
           m.testo, m.media_url, m.ts, m.ref_tabella, m.ref_id
    FROM (
      SELECT * FROM public.v_conversazioni_messaggi
      UNION ALL
      SELECT * FROM public.v_conversazioni_social
    ) m
    WHERE m.entita_tipo = p_entita_tipo AND m.entita_id = p_entita_id
    ORDER BY m.ts ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conversazioni_cerca(p_company_id uuid, p_query text)
 RETURNS TABLE(entita_tipo text, entita_id uuid, snippet text, match_ts timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(trim(p_query), '')) < 2 THEN RETURN; END IF;
  RETURN QUERY
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo, m.entita_id, left(m.testo, 160) AS snippet, m.ts AS match_ts
    FROM (
      SELECT * FROM public.v_conversazioni_messaggi WHERE company_id = p_company_id
      UNION ALL
      SELECT * FROM public.v_conversazioni_social WHERE company_id = p_company_id
    ) m
    WHERE m.testo ILIKE '%' || trim(p_query) || '%'
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
    LIMIT 100;
END;
$function$;
