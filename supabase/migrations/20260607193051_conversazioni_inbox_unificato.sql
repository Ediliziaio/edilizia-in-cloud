-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Conversazioni — Inbox unificato per ENTITÀ (contatto | cliente)
CREATE TABLE IF NOT EXISTS public.conversazioni (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  entita_tipo   text NOT NULL,
  entita_id     uuid NOT NULL,
  stato         text NOT NULL DEFAULT 'aperta',
  assegnato_a   uuid,
  last_read_at  timestamptz,
  ultimo_msg_at timestamptz,
  canale_ultimo text,
  anteprima     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversazioni_entita_uniq UNIQUE (company_id, entita_tipo, entita_id),
  CONSTRAINT conversazioni_tipo_chk  CHECK (entita_tipo IN ('contatto','cliente')),
  CONSTRAINT conversazioni_stato_chk CHECK (stato IN ('aperta','in_attesa','chiusa'))
);

CREATE INDEX IF NOT EXISTS conversazioni_company_ultimo_idx
  ON public.conversazioni (company_id, ultimo_msg_at DESC);
CREATE INDEX IF NOT EXISTS conversazioni_assegnato_idx
  ON public.conversazioni (assegnato_a) WHERE assegnato_a IS NOT NULL;

ALTER TABLE public.conversazioni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversazioni_company_rw ON public.conversazioni;
CREATE POLICY conversazioni_company_rw ON public.conversazioni
  FOR ALL TO authenticated
  USING      (public.is_super_admin() OR company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (public.is_super_admin() OR company_id = public.get_user_company_id(auth.uid()));

CREATE OR REPLACE VIEW public.v_conversazioni_messaggi AS
SELECT
    'contatto'::text AS entita_tipo,
    ct.id            AS entita_id,
    ei.company_id,
    'email'::text    AS canale,
    'in'::text       AS direzione,
    ei.from_email    AS controparte,
    ei.subject       AS oggetto,
    left(COALESCE(NULLIF(ei.raw_text,''),
                  regexp_replace(COALESCE(ei.raw_html,''), '<[^>]+>', ' ', 'g')), 4000) AS testo,
    NULL::text       AS media_url,
    ei.received_at   AS ts,
    'email_inbox'::text AS ref_tabella,
    ei.id            AS ref_id
FROM public.email_inbox ei
JOIN public.marketing_contacts ct
  ON ct.company_id = ei.company_id
 AND ei.from_email IS NOT NULL
 AND lower(ct.email) = lower(ei.from_email)
WHERE ei.is_personale IS NOT TRUE
  AND COALESCE(ei.is_trashed, false) = false
UNION ALL
SELECT 'contatto', ct.id, eo.company_id, 'email', 'out', addr.email, eo.subject,
    left(COALESCE(NULLIF(eo.body_text,''),
                  regexp_replace(COALESCE(eo.body_html,''), '<[^>]+>', ' ', 'g')), 4000),
    NULL, COALESCE(eo.sent_at, eo.created_at), 'email_outbox', eo.id
FROM public.email_outbox eo
CROSS JOIN LATERAL unnest(eo.to_emails) AS addr(email)
JOIN public.marketing_contacts ct
  ON ct.company_id = eo.company_id AND lower(ct.email) = lower(addr.email)
WHERE COALESCE(eo.status,'') <> 'draft'
UNION ALL
SELECT 'contatto', ct.id, s.company_id, 'sms',
    CASE WHEN s.direction = 'inbound' THEN 'in' ELSE 'out' END,
    CASE WHEN s.direction = 'inbound' THEN s.from_number ELSE s.to_number END,
    NULL, s.body, NULL, s.created_at, 'sms_logs', s.id
FROM public.sms_logs s
JOIN public.marketing_contacts ct
  ON ct.company_id = s.company_id
 AND (
       ct.id = s.contact_id
    OR (ct.telefono_normalized IS NOT NULL
        AND ct.telefono_normalized = regexp_replace(
              COALESCE(CASE WHEN s.direction='inbound' THEN s.from_number ELSE s.to_number END,''),
              '[^0-9]', '', 'g'))
     )
UNION ALL
SELECT 'contatto', ct.id, mc.company_id, 'whatsapp',
    CASE WHEN mm.sender_type = 'contact' THEN 'in' ELSE 'out' END,
    mc.phone_number, NULL,
    COALESCE(NULLIF(mm.content,''), mm.transcription), mm.media_url, mm.created_at,
    'messaging_messages', mm.id
FROM public.messaging_messages mm
JOIN public.messaging_conversations mc ON mc.id = mm.conversation_id
JOIN public.marketing_contacts ct
  ON ct.company_id = mc.company_id
 AND ct.telefono_normalized IS NOT NULL
 AND ct.telefono_normalized = regexp_replace(COALESCE(mc.phone_number,''), '[^0-9]', '', 'g')
UNION ALL
SELECT
    'cliente'::text, cm.customer_id, cm.company_id,
    CASE cm.channel
      WHEN 'nota_interna' THEN 'nota' WHEN 'internal' THEN 'nota'
      WHEN 'whatsapp' THEN 'whatsapp' WHEN 'sms' THEN 'sms' ELSE 'email'
    END,
    CASE WHEN cm.sender_role = 'customer' THEN 'in' ELSE 'out' END,
    p.email, cm.subject, cm.body, NULL, cm.created_at, 'customer_messages', cm.id
FROM public.customer_messages cm
JOIN public.profiles p ON p.id = cm.customer_id;

CREATE OR REPLACE FUNCTION public.conversazione_timeline(p_entita_tipo text, p_entita_id uuid)
RETURNS TABLE (
  canale text, direzione text, controparte text, oggetto text,
  testo text, media_url text, ts timestamptz, ref_tabella text, ref_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT (public.is_super_admin() OR v_company = public.get_user_company_id(auth.uid())) THEN
    RAISE EXCEPTION 'Accesso negato alla conversazione' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT m.canale, m.direzione, m.controparte, m.oggetto,
           m.testo, m.media_url, m.ts, m.ref_tabella, m.ref_id
    FROM public.v_conversazioni_messaggi m
    WHERE m.entita_tipo = p_entita_tipo AND m.entita_id = p_entita_id
    ORDER BY m.ts ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.conversazioni_lista(p_company_id uuid)
RETURNS TABLE (
  entita_tipo text, entita_id uuid, nome text, email text, telefono text,
  ultimo_ts timestamptz, ultimo_canale text, ultimo_direzione text, anteprima text,
  non_letti bigint, totale_messaggi bigint, stato text, assegnato_a uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_company_id = public.get_user_company_id(auth.uid())) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH msg AS (
    SELECT * FROM public.v_conversazioni_messaggi WHERE company_id = p_company_id
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
      WHEN 'cliente'  THEN (SELECT NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')), '') FROM public.profiles p WHERE p.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT email FROM public.marketing_contacts WHERE id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT email FROM public.profiles WHERE id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT phone FROM public.marketing_contacts WHERE id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT phone FROM public.profiles WHERE id = a.entita_id)
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
$$;

REVOKE ALL ON FUNCTION public.conversazione_timeline(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conversazioni_lista(uuid)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversazione_timeline(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conversazioni_lista(uuid)          TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversazioni'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversazioni';
  END IF;
END $$;
