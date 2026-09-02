-- Batch B dell'audit WhatsApp Locale (02/09/2026): correzioni database.
-- Ogni blocco spiega il bug che chiude. Applicata via Management API e
-- registrata con migration repair (mai db push, vedi backlog migration).

-- 1. La vista delle conversazioni era stata ridefinita 3 volte con CREATE OR
--    REPLACE VIEW senza WITH (security_invoker = on): Postgres azzera le
--    reloptions e la vista tornava a girare coi permessi di postgres.
ALTER VIEW public.v_conversazioni_messaggi SET (security_invoker = on);

-- 2. Claim dei destinatari: due giri del dispatcher sovrapposti (cron ogni 10
--    minuti + giro lungo, o lancio manuale) leggevano le stesse righe e
--    scrivevano due volte alla stessa persona.
ALTER TABLE public.openwa_campagna_destinatari ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- 3. Vincoli: sequenza contigua (il passo 3 senza il 2 non partiva mai, in
--    silenzio) e giorni di attesa 1..30 anche per i passi 3 e 4 (0 o negativo
--    = invio immediato).
ALTER TABLE public.openwa_campagne DROP CONSTRAINT IF EXISTS openwa_campagne_sequenza_chk;
ALTER TABLE public.openwa_campagne ADD CONSTRAINT openwa_campagne_sequenza_chk CHECK (
  (NULLIF(btrim(followup2_messaggio), '') IS NULL OR NULLIF(btrim(followup_messaggio), '') IS NOT NULL)
  AND (NULLIF(btrim(followup3_messaggio), '') IS NULL OR NULLIF(btrim(followup2_messaggio), '') IS NOT NULL));
ALTER TABLE public.openwa_campagne DROP CONSTRAINT IF EXISTS openwa_campagne_fu23_giorni_chk;
ALTER TABLE public.openwa_campagne ADD CONSTRAINT openwa_campagne_fu23_giorni_chk CHECK (
  followup2_dopo_giorni BETWEEN 1 AND 30 AND followup3_dopo_giorni BETWEEN 1 AND 30);

-- 4. Indici: normalizzazione telefono usata da dedup/riposo/opt-out gemelle;
--    indice parziale sui destinatari allineato ai 4 stati "inviato"; indice
--    doppione su openwa_messages rimosso.
CREATE INDEX IF NOT EXISTS marketing_contacts_norm_tel_idx ON public.marketing_contacts (public.openwa_norm_tel(phone)) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS openwa_messages_norm_tel_out_idx ON public.openwa_messages (public.openwa_norm_tel(contact_phone), created_at) WHERE direction = 'outbound';
DROP INDEX IF EXISTS public.openwa_messages_chat_created_idx;
DROP INDEX IF EXISTS public.idx_openwa_dest_contatto;
CREATE INDEX idx_openwa_dest_contatto ON public.openwa_campagna_destinatari (contact_id)
  WHERE stato IN ('inviato','followup_inviato','followup2_inviato','followup3_inviato');

-- 5. Candidati di una campagna: UNA sola definizione condivisa da anteprima e
--    caricamento (erano divergenti). La versione live NON aveva dedup per
--    telefono, riposo 90 giorni ne' esclusione dalle altre campagne: la
--    migration 20280238000000 del repo non era mai stata applicata.
--    Regole: un solo contatto per utenza; niente a chi ha una scheda gemella
--    in opt-out; niente a chi ha ricevuto un messaggio RIUSCITO negli ultimi
--    N giorni (i falliti non contano); niente a chi e' in coda in un'altra
--    campagna ATTIVA (le annullate/completate non bloccano piu' per sempre).
DROP FUNCTION IF EXISTS public.openwa_campagna_anteprima(text[], text, text, text, integer);
DROP FUNCTION IF EXISTS public.openwa_campagna_anteprima(text[], text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.openwa_campagna_carica_lista(uuid, text[], text, text, text, integer);
DROP FUNCTION IF EXISTS public.openwa_campagna_carica_lista(uuid, text[], text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.openwa_campagna_candidati(
  p_tags text[], p_citta text, p_provincia text, p_source text, p_limite integer, p_giorni_riposo integer)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT DISTINCT ON (public.openwa_norm_tel(mc.phone)) mc.id
  FROM public.marketing_contacts mc
  WHERE mc.company_id = '00000000-0000-0000-0000-000000000001'
    AND public.openwa_norm_tel(mc.phone) IS NOT NULL
    AND mc.optout_whatsapp IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.marketing_contacts o
      WHERE o.company_id = mc.company_id AND o.optout_whatsapp IS TRUE
        AND public.openwa_norm_tel(o.phone) = public.openwa_norm_tel(mc.phone))
    AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR mc.tags && p_tags)
    AND (p_citta IS NULL OR p_citta = '' OR mc.city ILIKE p_citta)
    AND (p_provincia IS NULL OR p_provincia = '' OR mc.province ILIKE p_provincia)
    AND (p_source IS NULL OR p_source = '' OR mc.source ILIKE p_source)
    AND NOT EXISTS (
      SELECT 1 FROM public.openwa_messages m
      WHERE m.direction = 'outbound' AND COALESCE(m.status, '') <> 'failed'
        AND public.openwa_norm_tel(m.contact_phone) = public.openwa_norm_tel(mc.phone)
        AND m.created_at > now() - make_interval(days => GREATEST(COALESCE(p_giorni_riposo, 90), 0)))
    AND NOT EXISTS (
      SELECT 1 FROM public.openwa_campagna_destinatari d2
      JOIN public.openwa_campagne c2 ON c2.id = d2.campagna_id AND c2.stato IN ('bozza','in_pausa','in_corso')
      JOIN public.marketing_contacts mc2 ON mc2.id = d2.contact_id
      WHERE public.openwa_norm_tel(mc2.phone) = public.openwa_norm_tel(mc.phone)
        AND d2.stato IN ('da_inviare','inviato','followup_inviato','followup2_inviato','followup3_inviato'))
  ORDER BY public.openwa_norm_tel(mc.phone), (mc.first_name IS NOT NULL) DESC, mc.created_at DESC
  LIMIT COALESCE(p_limite, 100000);
$f$;
REVOKE ALL ON FUNCTION public.openwa_campagna_candidati(text[],text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.openwa_campagna_anteprima(
  p_tags text[] DEFAULT NULL, p_citta text DEFAULT NULL, p_provincia text DEFAULT NULL,
  p_source text DEFAULT NULL, p_limite integer DEFAULT NULL, p_giorni_riposo integer DEFAULT 90)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  -- Era senza gate: qualsiasi utente loggato poteva contare i contatti di
  -- piattaforma per tag/citta'/fonte.
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*)::integer FROM public.openwa_campagna_candidati(p_tags, p_citta, p_provincia, p_source, p_limite, p_giorni_riposo));
END; $f$;
REVOKE ALL ON FUNCTION public.openwa_campagna_anteprima(text[],text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.openwa_campagna_anteprima(text[],text,text,text,integer,integer) TO authenticated;

CREATE FUNCTION public.openwa_campagna_carica_lista(
  p_campagna_id uuid, p_tags text[] DEFAULT NULL, p_citta text DEFAULT NULL, p_provincia text DEFAULT NULL,
  p_source text DEFAULT NULL, p_limite integer DEFAULT NULL, p_giorni_riposo integer DEFAULT 90)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_inseriti integer;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.openwa_campagne WHERE id = p_campagna_id AND stato IN ('bozza','in_pausa','in_corso')) THEN
    RAISE EXCEPTION 'Campagna inesistente o non piu'' modificabile' USING ERRCODE = '22023';
  END IF;
  WITH ins AS (
    INSERT INTO public.openwa_campagna_destinatari (campagna_id, contact_id)
    SELECT p_campagna_id, c FROM public.openwa_campagna_candidati(p_tags, p_citta, p_provincia, p_source, p_limite, p_giorni_riposo) c
    ON CONFLICT (campagna_id, contact_id) DO NOTHING
    RETURNING 1)
  SELECT COALESCE(count(*), 0)::integer INTO v_inseriti FROM ins;
  RETURN v_inseriti;
END; $f$;
REVOKE ALL ON FUNCTION public.openwa_campagna_carica_lista(uuid,text[],text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.openwa_campagna_carica_lista(uuid,text[],text,text,text,integer,integer) TO authenticated;

-- 6. Prossimi invii: (a) claim con FOR UPDATE SKIP LOCKED (15 minuti, poi la
--    riga torna libera); (b) i FOLLOW-UP hanno la precedenza sui primi
--    contatti: prima ogni ramo aveva il proprio LIMIT e il ramo "primo"
--    veniva letto per primo, cosi' con centinaia di primi in coda il
--    follow-up "dopo 3 giorni" partiva dopo settimane; (c) niente a chi ha
--    una scheda gemella in opt-out; (d) un testo vuoto conta come assente.
CREATE OR REPLACE FUNCTION public.openwa_campagna_prossimi(p_limit integer DEFAULT 40)
RETURNS TABLE(destinatario_id uuid, campagna_id uuid, contact_id uuid, tipo text, messaggio text, tags_numeri text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  RETURN QUERY
  WITH maturi AS (
    SELECT d.id,
      CASE d.stato WHEN 'da_inviare' THEN 'primo' WHEN 'inviato' THEN 'followup'
                   WHEN 'followup_inviato' THEN 'followup2' ELSE 'followup3' END AS tipo,
      CASE d.stato WHEN 'da_inviare' THEN d.created_at
                   WHEN 'inviato' THEN d.primo_inviato_at + make_interval(days => c.followup_dopo_giorni)
                   WHEN 'followup_inviato' THEN d.followup_inviato_at + make_interval(days => c.followup2_dopo_giorni)
                   ELSE d.followup2_inviato_at + make_interval(days => c.followup3_dopo_giorni) END AS scadenza
    FROM public.openwa_campagna_destinatari d
    JOIN public.openwa_campagne c ON c.id = d.campagna_id
    JOIN public.marketing_contacts mc ON mc.id = d.contact_id
    WHERE c.stato = 'in_corso' AND (c.parte_il IS NULL OR c.parte_il <= now())
      AND d.tentativi < 5
      AND (d.claimed_at IS NULL OR d.claimed_at < now() - interval '15 minutes')
      AND mc.optout_whatsapp IS NOT TRUE AND public.openwa_norm_tel(mc.phone) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_contacts o
        WHERE o.company_id = mc.company_id AND o.optout_whatsapp IS TRUE
          AND public.openwa_norm_tel(o.phone) = public.openwa_norm_tel(mc.phone))
      AND (
        d.stato = 'da_inviare'
        OR (d.stato = 'inviato' AND NULLIF(btrim(c.followup_messaggio), '') IS NOT NULL
            AND d.primo_inviato_at < now() - make_interval(days => c.followup_dopo_giorni))
        OR (d.stato = 'followup_inviato' AND NULLIF(btrim(c.followup2_messaggio), '') IS NOT NULL
            AND d.followup_inviato_at < now() - make_interval(days => c.followup2_dopo_giorni))
        OR (d.stato = 'followup2_inviato' AND NULLIF(btrim(c.followup3_messaggio), '') IS NOT NULL
            AND d.followup2_inviato_at < now() - make_interval(days => c.followup3_dopo_giorni)))
  ), scelti AS (
    SELECT dd.id FROM public.openwa_campagna_destinatari dd
    WHERE dd.id IN (SELECT m.id FROM maturi m ORDER BY (m.tipo = 'primo'), m.scadenza LIMIT p_limit)
    FOR UPDATE SKIP LOCKED
  ), claim AS (
    UPDATE public.openwa_campagna_destinatari du SET claimed_at = now()
    FROM scelti s WHERE du.id = s.id
    RETURNING du.id, du.campagna_id, du.contact_id
  )
  SELECT cl.id, cl.campagna_id, cl.contact_id, m.tipo,
    CASE m.tipo WHEN 'primo' THEN c.messaggio WHEN 'followup' THEN c.followup_messaggio
                WHEN 'followup2' THEN c.followup2_messaggio ELSE c.followup3_messaggio END,
    c.tags_numeri
  FROM claim cl
  JOIN maturi m ON m.id = cl.id
  JOIN public.openwa_campagne c ON c.id = cl.campagna_id
  ORDER BY (m.tipo = 'primo'), m.scadenza;
END; $f$;

-- 7. Risposta segnata per TELEFONO: con i doppioni in archivio l'inbound
--    agganciava un'altra scheda (o nessuna) e i follow-up continuavano verso
--    chi aveva gia' risposto.
CREATE OR REPLACE FUNCTION public.openwa_campagna_segna_risposta(p_phone text)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH agg AS (
    UPDATE public.openwa_campagna_destinatari d
    SET stato = 'risposto', risposto_at = now(), claimed_at = NULL
    WHERE d.stato IN ('inviato','followup_inviato','followup2_inviato','followup3_inviato')
      AND public.openwa_norm_tel(p_phone) IS NOT NULL
      AND d.contact_id IN (
        SELECT id FROM public.marketing_contacts
        WHERE company_id = '00000000-0000-0000-0000-000000000001' AND public.openwa_norm_tel(phone) = public.openwa_norm_tel(p_phone))
    RETURNING 1)
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$f$;
REVOKE ALL ON FUNCTION public.openwa_campagna_segna_risposta(text) FROM PUBLIC, anon, authenticated;

-- 8. "Riprova falliti" rimetteva TUTTI a da_inviare: chi era fallito su un
--    follow-up riceveva di nuovo il primo messaggio. Lo stato riparte dal
--    passo gia' raggiunto.
CREATE OR REPLACE FUNCTION public.openwa_campagna_riprova_falliti(p_campagna_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE n integer;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  WITH u AS (
    UPDATE public.openwa_campagna_destinatari
    SET tentativi = 0, ultimo_errore = NULL, claimed_at = NULL,
        stato = CASE WHEN followup2_inviato_at IS NOT NULL THEN 'followup2_inviato'
                     WHEN followup_inviato_at IS NOT NULL THEN 'followup_inviato'
                     WHEN primo_inviato_at IS NOT NULL THEN 'inviato'
                     ELSE 'da_inviare' END
    WHERE campagna_id = p_campagna_id AND stato = 'fallito'
    RETURNING 1)
  SELECT COALESCE(count(*), 0)::integer INTO n FROM u;
  RETURN n;
END; $f$;
REVOKE ALL ON FUNCTION public.openwa_campagna_riprova_falliti(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.openwa_campagna_riprova_falliti(uuid) TO authenticated;

-- 9. Contatore usi dei template: era SECURITY DEFINER senza gate.
CREATE OR REPLACE FUNCTION public.openwa_template_usato(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  UPDATE public.openwa_risposte_rapide SET usi = usi + 1 WHERE id = p_id;
END; $f$;

-- 10. A/B: saltati e falliti non hanno ricevuto nulla, non stanno al
--     denominatore.
CREATE OR REPLACE FUNCTION public.openwa_campagna_ab(p_campagna_id uuid)
RETURNS TABLE(variante text, inviati bigint, risposte bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
begin
  if not public.is_platform_staff() then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  return query
  select d.variante,
         count(*) filter (where d.stato not in ('da_inviare','saltato','fallito')),
         count(*) filter (where d.stato = 'risposto' or d.esito is not null)
  from public.openwa_campagna_destinatari d
  where d.campagna_id = p_campagna_id and d.variante is not null
  group by d.variante order by d.variante;
end;
$f$;

-- 11. Un solo predicato per tutto il modulo: le route sono aperte a chi ha
--     can_manage_marketing (is_platform_staff), ma inbox, note, risposte
--     rapide e le RPC di lettura rispondevano "Accesso negato" a chiunque non
--     fosse super admin. I NUMERI (openwa_numbers) restano solo super admin.


DROP POLICY IF EXISTS openwa_conversazioni_super ON public.openwa_conversazioni;
DROP POLICY IF EXISTS openwa_conversazioni_staff ON public.openwa_conversazioni;
CREATE POLICY openwa_conversazioni_staff ON public.openwa_conversazioni FOR ALL TO authenticated USING (public.is_platform_staff()) WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS openwa_messages_super ON public.openwa_messages;
DROP POLICY IF EXISTS openwa_messages_staff ON public.openwa_messages;
CREATE POLICY openwa_messages_staff ON public.openwa_messages FOR ALL TO authenticated USING (public.is_platform_staff()) WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS openwa_note_super ON public.openwa_note;
DROP POLICY IF EXISTS openwa_note_staff ON public.openwa_note;
CREATE POLICY openwa_note_staff ON public.openwa_note FOR ALL TO authenticated USING (public.is_platform_staff()) WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS openwa_risposte_super ON public.openwa_risposte_rapide;
DROP POLICY IF EXISTS openwa_risposte_staff ON public.openwa_risposte_rapide;
CREATE POLICY openwa_risposte_staff ON public.openwa_risposte_rapide FOR ALL TO authenticated USING (public.is_platform_staff()) WITH CHECK (public.is_platform_staff());

-- 11/12. gate unificato (+ report risposte anche per telefono)
CREATE OR REPLACE FUNCTION public.openwa_threads_lista(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_stato text DEFAULT 'aperta'::text, p_assegnato uuid DEFAULT NULL::uuid, p_solo_non_letti boolean DEFAULT false)
 RETURNS TABLE(wa_chat_id text, contact_phone text, contact_name text, contact_id uuid, number_id uuid, ultimo_testo text, ultimo_at timestamp with time zone, ultima_direzione text, non_letti bigint, totale bigint, stato text, assegnato_a uuid, assegnato_nome text, note_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Stesso perimetro delle altre letture del canale: solo super admin.
  if not public.is_platform_staff() then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  return query
  with agg as (
    select m.wa_chat_id,
           max(m.created_at) as ultimo_at,
           count(*) as totale,
           count(*) filter (where m.direction = 'inbound' and m.read_at is null) as non_letti,
           -- Il numero e il nome vengono dal messaggio piu' recente che ce li ha:
           -- i primi messaggi di una chat possono non averli ancora.
           (array_agg(m.contact_phone order by m.created_at desc)
              filter (where m.contact_phone is not null))[1] as contact_phone,
           (array_agg(m.contact_name order by m.created_at desc)
              filter (where m.contact_name is not null))[1] as contact_name,
           (array_agg(m.contact_id order by m.created_at desc)
              filter (where m.contact_id is not null))[1] as contact_id,
           (array_agg(m.number_id order by m.created_at desc)
              filter (where m.number_id is not null))[1] as number_id
    from public.openwa_messages m
    group by m.wa_chat_id
  ),
  ultimo as (
    select distinct on (m.wa_chat_id)
           m.wa_chat_id,
           coalesce(nullif(m.body, ''), case when m.media_url is not null then '📎 media' else '' end) as testo,
           m.direction
    from public.openwa_messages m
    order by m.wa_chat_id, m.created_at desc
  )
  select a.wa_chat_id, a.contact_phone, a.contact_name, a.contact_id, a.number_id,
         u.testo, a.ultimo_at, u.direction,
         a.non_letti, a.totale,
         coalesce(c.stato, 'aperta'),
         c.assegnato_a,
         nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         coalesce(n.n, 0)
  from agg a
  join ultimo u on u.wa_chat_id = a.wa_chat_id
  left join public.openwa_conversazioni c on c.wa_chat_id = a.wa_chat_id
  left join public.profiles p on p.id = c.assegnato_a
  left join lateral (
    select count(*) as n from public.openwa_note nt where nt.wa_chat_id = a.wa_chat_id
  ) n on true
  where (p_stato = 'tutte' or coalesce(c.stato, 'aperta') = p_stato)
    and (p_assegnato is null or c.assegnato_a = p_assegnato)
    and (not p_solo_non_letti or a.non_letti > 0)
  order by a.ultimo_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$function$;

-- 11/12. gate unificato (+ report risposte anche per telefono)
CREATE OR REPLACE FUNCTION public.openwa_cerca_messaggi(p_query text, p_limit integer DEFAULT 40)
 RETURNS TABLE(wa_chat_id text, contact_phone text, contact_name text, testo text, direction text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_staff() then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if coalesce(trim(p_query), '') = '' then return; end if;

  return query
  select m.wa_chat_id, m.contact_phone, m.contact_name, m.body, m.direction, m.created_at
  from public.openwa_messages m
  where m.body ilike '%' || trim(p_query) || '%'
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$function$;

-- 11/12. gate unificato (+ report risposte anche per telefono)
CREATE OR REPLACE FUNCTION public.openwa_contesto_chat(p_chat_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contact uuid;
  v_phone   text;
  v_res     jsonb;
begin
  if not public.is_platform_staff() then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  -- Contatto e numero dai messaggi della chat (il piu' recente che li ha).
  select (array_agg(m.contact_id order by m.created_at desc) filter (where m.contact_id is not null))[1],
         (array_agg(m.contact_phone order by m.created_at desc) filter (where m.contact_phone is not null))[1]
    into v_contact, v_phone
  from public.openwa_messages m
  where m.wa_chat_id = p_chat_id;

  select jsonb_build_object(
    'contatto', (
      select to_jsonb(x) from (
        select c.id, c.first_name, c.last_name, c.email, c.phone, c.company_name,
               c.city, c.tags, c.optout_whatsapp, c.source, c.lead_score, c.created_at
        from public.marketing_contacts c where c.id = v_contact
      ) x
    ),
    -- Campagne a freddo che l'hanno raggiunta: chi risponde deve sapere se sta
    -- parlando con qualcuno che NON aveva chiesto di essere contattato.
    'campagne', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.created_at desc) from (
        select ca.nome, d.stato, d.primo_inviato_at, d.risposto_at, d.created_at
        from public.openwa_campagna_destinatari d
        join public.openwa_campagne ca on ca.id = d.campagna_id
        where d.contact_id = v_contact
        limit 5
      ) y
    ), '[]'::jsonb),
    -- Opportunita' aperte: il motivo per cui questa conversazione esiste.
    'opportunita', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.created_at desc) from (
        select o.id, o.name, o.value, o.status, o.expected_close_date,
               st.name as stage, o.created_at
        from public.marketing_opportunities o
        left join public.marketing_pipeline_stages st on st.id = o.stage_id
        where o.contact_id = v_contact and o.deleted_at is null
        limit 5
      ) z
    ), '[]'::jsonb),
    'telefono', v_phone
  ) into v_res;

  return coalesce(v_res, '{}'::jsonb);
end;
$function$;

-- 11/12. gate unificato (+ report risposte anche per telefono)
CREATE OR REPLACE FUNCTION public.openwa_non_letti()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.is_platform_staff()
    then (select count(*)::integer from public.openwa_messages
          where direction = 'inbound' and read_at is null)
    else 0 end;
$function$;

-- 11/12. gate unificato (+ report risposte anche per telefono)
CREATE OR REPLACE FUNCTION public.openwa_campagna_risposte(p_campagna_id uuid)
 RETURNS TABLE(destinatario_id uuid, contact_id uuid, nome text, telefono text, variante text, esito text, risposto_at timestamp with time zone, testo_risposta text, wa_chat_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_staff() then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  return query
  select d.id, d.contact_id,
         coalesce(nullif(trim(coalesce(mc.first_name,'') || ' ' || coalesce(mc.last_name,'')), ''), mc.company_name, mc.phone),
         mc.phone, d.variante, d.esito, d.risposto_at,
         r.body, r.wa_chat_id
  from public.openwa_campagna_destinatari d
  join public.marketing_contacts mc on mc.id = d.contact_id
  left join lateral (
    select m.body, m.wa_chat_id
    from public.openwa_messages m
    where (m.contact_id = d.contact_id or public.openwa_norm_tel(m.contact_phone) = public.openwa_norm_tel(mc.phone))
      and m.direction = 'inbound'
      and (d.primo_inviato_at is null or m.created_at >= d.primo_inviato_at)
    order by m.created_at asc
    limit 1
  ) r on true
  where d.campagna_id = p_campagna_id
    and (d.stato = 'risposto' or d.esito is not null)
  order by d.risposto_at desc nulls last;
end;
$function$;

-- 13. Campagna avviata senza destinatari: non va chiusa al primo giro (poi non era piu' caricabile).
CREATE OR REPLACE FUNCTION public.openwa_campagne_completa_finite()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH agg AS (
    UPDATE public.openwa_campagne c
    SET stato = 'completata', completata_at = now(), updated_at = now()
    WHERE c.stato = 'in_corso'
      AND EXISTS (SELECT 1 FROM public.openwa_campagna_destinatari dx WHERE dx.campagna_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.openwa_campagna_destinatari d
        WHERE d.campagna_id = c.id
          AND d.tentativi < 5
          AND (
            d.stato = 'da_inviare'
            OR (d.stato = 'inviato' AND c.followup_messaggio IS NOT NULL)
            OR (d.stato = 'followup_inviato' AND c.followup2_messaggio IS NOT NULL)
            OR (d.stato = 'followup2_inviato' AND c.followup3_messaggio IS NOT NULL)
          )
      )
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$function$;
