-- Push sul telefono per gli avvisi che contano, non solo per il campo (26/09/2026).
--
-- Fino a oggi trg_campo_notifica_push mandava una push solo per i tipi
-- 'campo_%'. Un messaggio in Conversazioni, un'attività assegnata, un
-- preventivo firmato restavano nella campanella: chi non aveva l'app aperta non
-- lo sapeva. Adesso la push parte anche per questi, con tre regole:
--
-- 1. solo se la persona ha un dispositivo iscritto (push_subscriptions o
--    push_tokens): prima si chiamava push-notifica via pg_net anche per chi non
--    ne aveva nessuno (cioè per tutti: il 26/09 le iscrizioni erano 0), una
--    richiesta inutile sulla coda comune dei cron per ogni avviso;
-- 2. non nelle ore di silenzio che la persona ha scelto (user_messaging_channels,
--    ora di Roma; «dalle 22 alle 7» attraversa la mezzanotte). Prima valevano
--    solo per i messaggi automatici di Silvio;
-- 3. operai e subappaltatori (ruoli del campo, nessun ruolo che entri in
--    /azienda: stessi elenchi di COMPANY_ROLES e CAMPO_ROLES nel codice) non
--    possono aprire /azienda: il link della push va nella loro area
--    (/azienda/ordini/<id> → /campo/lavoro/<id>, attività → /campo/attivita…).
--
-- Stesse regole per la chat di cantiere (tg_campo_chat_push), che in più ora
-- usa un'etichetta per canale: con un'etichetta sola i messaggi di cantieri
-- diversi si sostituivano l'uno con l'altro.
--
-- La push non deve mai far fallire la notifica o il messaggio: gli errori
-- diventano un WARNING.

SET LOCAL lock_timeout = '3s';

-- ─── Chi è «solo campo» ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.utente_solo_campo(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.user_roles
            WHERE user_id = p_user AND role IN ('employee', 'subcontractor'))
     AND NOT EXISTS (
           SELECT 1 FROM public.user_roles
            WHERE user_id = p_user
              AND role IN ('company_admin', 'company_staff', 'super_admin', 'salesperson',
                           'call_center', 'multi_company_user', 'accountant'));
$$;

-- ─── Il link che la persona può aprire ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_notifica_per_utente(p_user uuid, p_url text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_url, '') = '' THEN '/'
    WHEN NOT public.utente_solo_campo(p_user) THEN p_url
    WHEN p_url LIKE '/campo%' THEN p_url
    WHEN p_url ~ '^/azienda/ordini/[0-9a-f-]{36}'
      THEN '/campo/lavoro/' || substring(p_url FROM '^/azienda/ordini/([0-9a-f-]{36})')
    WHEN p_url LIKE '/azienda/attivita%' THEN '/campo/attivita'
    WHEN p_url LIKE '/azienda/personale%' THEN '/campo/documenti'
    ELSE '/campo'
  END;
$$;

-- ─── Ore di silenzio (ora di Roma) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.utente_in_silenzio(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_messaging_channels c,
           LATERAL (SELECT (now() AT TIME ZONE 'Europe/Rome')::time AS adesso) t
     WHERE c.user_id = p_user
       AND c.quiet_from IS NOT NULL AND c.quiet_to IS NOT NULL
       AND c.quiet_from <> c.quiet_to
       AND CASE WHEN c.quiet_from < c.quiet_to
                THEN t.adesso >= c.quiet_from AND t.adesso < c.quiet_to
                ELSE t.adesso >= c.quiet_from OR t.adesso < c.quiet_to
           END
  );
$$;

-- ─── Ha un dispositivo a cui mandarla? ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.utente_ha_dispositivi(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = p_user)
      OR EXISTS (SELECT 1 FROM public.push_tokens WHERE user_id = p_user);
$$;

REVOKE ALL ON FUNCTION public.utente_solo_campo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_notifica_per_utente(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.utente_in_silenzio(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.utente_ha_dispositivi(uuid) FROM PUBLIC, anon, authenticated;

-- ─── Push dagli avvisi della campanella ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_notifica_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.utente_ha_dispositivi(NEW.user_id) OR public.utente_in_silenzio(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.campo_push_invia(
      ARRAY[NEW.user_id],
      NEW.title,
      coalesce(NEW.body, ''),
      public.link_notifica_per_utente(NEW.user_id, NEW.action_url),
      -- Un'etichetta per cosa: due conversazioni non si sostituiscono a vicenda.
      NEW.type || coalesce(':' || NEW.entity_id::text, '')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_notifica_push: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_notifica_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_campo_notifica_push ON public.notifications;
DROP TRIGGER IF EXISTS trg_notifica_push ON public.notifications;
CREATE TRIGGER trg_notifica_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.type LIKE 'campo_%' OR NEW.type IN (
    'conversazione_messaggio',
    'task_assigned', 'task_due', 'task_overdue',
    'order_note',
    'quote_signed', 'quote_refused', 'quote_approval_requested',
    'documento_firmato', 'documento_rifiutato',
    'lead_whatsapp_agente', 'meta_lead_assigned'
  ))
  EXECUTE FUNCTION public.tg_notifica_push();

DROP FUNCTION IF EXISTS public.tg_campo_notifica_push();

-- ─── Chat di cantiere: stesse regole, un'etichetta per canale ───────────────
CREATE OR REPLACE FUNCTION public.tg_campo_chat_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text; v_ids uuid[]; v_mittente text;
BEGIN
  SELECT c.name INTO v_nome FROM public.internal_chat_channels c WHERE c.id = NEW.channel_id;
  IF v_nome IS NULL OR v_nome NOT LIKE 'cantiere-%' THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT m.user_id) INTO v_ids
  FROM public.internal_chat_members m
  JOIN public.user_roles ur ON ur.user_id = m.user_id AND ur.role IN ('employee', 'subcontractor')
  WHERE m.channel_id = NEW.channel_id AND m.user_id <> NEW.sender_id AND coalesce(m.is_muted, false) = false
    AND public.utente_ha_dispositivi(m.user_id)
    AND NOT public.utente_in_silenzio(m.user_id);
  IF v_ids IS NULL THEN RETURN NEW; END IF;
  SELECT trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) INTO v_mittente FROM public.profiles p WHERE p.id = NEW.sender_id;
  BEGIN
    PERFORM public.campo_push_invia(v_ids, coalesce(nullif(v_mittente, ''), 'Messaggio') || ' · ' || v_nome,
      left(coalesce(NEW.content, 'Nuovo messaggio'), 120), '/campo/chat/' || NEW.channel_id::text,
      'campo_chat:' || NEW.channel_id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_campo_chat_push: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
