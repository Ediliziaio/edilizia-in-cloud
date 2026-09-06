-- Portale operaio: chiudere il cerchio con chi lavora in cantiere.
--   1. notifica all'operaio quando il rapportino viene approvato o rifiutato
--   2. notifica quando lo assegnano a un cantiere
--   3. push per i messaggi nella chat di cantiere
--   4. promemoria: uscita non timbrata (17:30), rapportino mancante (18:30),
--      digest all'ufficio (07:30) — via pg_cron
-- Le Web Push partono da un trigger su notifications → pg_net → edge push-notifica
-- (segreto letto dal vault, nome «silvio_internal_cron_secret»).

-- ── Notifica in app, con guardia anti-doppione ────────────────────────────────
CREATE OR REPLACE FUNCTION public.campo_notifica(
  p_company_id uuid, p_user_id uuid, p_type text, p_title text, p_body text,
  p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL, p_action_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RETURN NULL; END IF;
  -- Stesso avviso allo stesso utente nelle ultime 12 ore: non lo ripetiamo.
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.type = p_type AND n.title = p_title
      AND coalesce(n.entity_id::text, '') = coalesce(p_entity_id::text, '')
      AND n.created_at > now() - interval '12 hours'
  ) THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  VALUES (p_company_id, p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_action_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── Web Push: relay dal DB alla edge (solo per i tipi del campo) ───────────────
CREATE OR REPLACE FUNCTION public.campo_push_invia(p_user_ids uuid[], p_title text, p_body text, p_url text, p_tag text DEFAULT 'campo')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;
  -- Stesso segreto che usano gli altri cron per parlare con le edge (INTERNAL_CRON_SECRET).
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/push-notifica',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'title', p_title, 'body', coalesce(p_body, ''), 'url', coalesce(p_url, '/campo'), 'tag', p_tag),
    timeout_milliseconds := 8000
  );
EXCEPTION WHEN OTHERS THEN
  -- La push è un extra: se pg_net o il vault non rispondono, la notifica in app resta.
  RAISE NOTICE 'campo_push_invia: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.tg_campo_notifica_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type LIKE 'campo_%' THEN
    PERFORM public.campo_push_invia(ARRAY[NEW.user_id], NEW.title, NEW.body, NEW.action_url, NEW.type);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campo_notifica_push ON public.notifications;
CREATE TRIGGER trg_campo_notifica_push AFTER INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.type LIKE 'campo_%') EXECUTE FUNCTION public.tg_campo_notifica_push();

-- ── 1. Esito del rapportino ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_campo_rapportino_esito() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_data text;
BEGIN
  IF NEW.stato NOT IN ('approvato', 'rifiutato') OR NEW.stato IS NOT DISTINCT FROM OLD.stato THEN RETURN NEW; END IF;
  SELECT o.order_code INTO v_code FROM public.orders o WHERE o.id = NEW.order_id;
  v_data := to_char(NEW.data_lavoro, 'DD/MM');
  IF NEW.stato = 'approvato' THEN
    PERFORM public.campo_notifica(NEW.company_id, NEW.user_id, 'campo_rapportino_esito',
      'Rapportino del ' || v_data || ' approvato',
      coalesce('Cantiere ' || v_code || '. ', '') || 'Le ore sono passate in commessa.',
      'campo_rapportino', NEW.id, '/campo/lavoro/' || NEW.order_id::text);
  ELSE
    PERFORM public.campo_notifica(NEW.company_id, NEW.user_id, 'campo_rapportino_esito',
      'Rapportino del ' || v_data || ' rifiutato',
      coalesce('Cantiere ' || v_code || '. ', '') || coalesce('Motivo: ' || nullif(trim(NEW.motivo_rifiuto), ''), 'Rifallo e rimandalo.'),
      'campo_rapportino', NEW.id, '/campo/lavoro/' || NEW.order_id::text || '/rapportino');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campo_rapportino_esito ON public.campo_rapportini;
CREATE TRIGGER trg_campo_rapportino_esito AFTER UPDATE OF stato ON public.campo_rapportini
  FOR EACH ROW EXECUTE FUNCTION public.tg_campo_rapportino_esito();

-- ── 2. Assegnazione a un cantiere ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_campo_assegnazione_notifica() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_desc text; v_ind text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.user_id = NEW.assigned_by THEN RETURN NEW; END IF;
  SELECT o.order_code, left(coalesce(o.description, ''), 80), o.indirizzo_lavori
    INTO v_code, v_desc, v_ind FROM public.orders o WHERE o.id = NEW.order_id;
  PERFORM public.campo_notifica(NEW.company_id, NEW.user_id, 'campo_assegnazione',
    CASE WHEN NEW.is_capocantiere THEN 'Sei capocantiere di ' ELSE 'Nuovo cantiere: ' END || coalesce(v_code, 'un cantiere'),
    trim(both from concat_ws(' · ', nullif(v_desc, ''), nullif(v_ind, ''),
      CASE WHEN NEW.data_inizio IS NOT NULL THEN 'dal ' || to_char(NEW.data_inizio, 'DD/MM') END)),
    'order', NEW.order_id, '/campo/lavoro/' || NEW.order_id::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campo_assegnazione_notifica ON public.order_campo_assignments;
CREATE TRIGGER trg_campo_assegnazione_notifica AFTER INSERT ON public.order_campo_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_campo_assegnazione_notifica();

-- ── 3. Chat di cantiere → push agli operai membri (niente riga in campanella) ──
CREATE OR REPLACE FUNCTION public.tg_campo_chat_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text; v_ids uuid[]; v_mittente text;
BEGIN
  SELECT c.name INTO v_nome FROM public.internal_chat_channels c WHERE c.id = NEW.channel_id;
  IF v_nome IS NULL OR v_nome NOT LIKE 'cantiere-%' THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT m.user_id) INTO v_ids
  FROM public.internal_chat_members m
  JOIN public.user_roles ur ON ur.user_id = m.user_id AND ur.role IN ('employee', 'subcontractor')
  WHERE m.channel_id = NEW.channel_id AND m.user_id <> NEW.sender_id AND coalesce(m.is_muted, false) = false;
  IF v_ids IS NULL THEN RETURN NEW; END IF;
  SELECT trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) INTO v_mittente FROM public.profiles p WHERE p.id = NEW.sender_id;
  PERFORM public.campo_push_invia(v_ids, coalesce(nullif(v_mittente, ''), 'Messaggio') || ' · ' || v_nome,
    left(coalesce(NEW.content, 'Nuovo messaggio'), 120), '/campo/chat/' || NEW.channel_id::text, 'campo_chat');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campo_chat_push ON public.internal_chat_messages;
CREATE TRIGGER trg_campo_chat_push AFTER INSERT ON public.internal_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_campo_chat_push();

-- ── 4. Promemoria (ora di Roma, DST-safe) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campo_promemoria(p_slot text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ora  text := to_char(now() AT TIME ZONE 'Europe/Rome', 'HH24:MI');
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_slot text := p_slot;
  v_n int := 0; r record;
BEGIN
  IF v_slot IS NULL THEN
    v_slot := CASE
      WHEN v_ora BETWEEN '17:30' AND '17:59' THEN 'uscita'
      WHEN v_ora BETWEEN '18:30' AND '18:59' THEN 'rapportino'
      WHEN v_ora BETWEEN '07:30' AND '07:59' THEN 'digest'
      ELSE NULL END;
  END IF;
  IF v_slot IS NULL THEN RETURN jsonb_build_object('slot', null, 'ora', v_ora); END IF;

  IF v_slot = 'uscita' THEN
    -- Entrata oggi senza uscita successiva
    FOR r IN
      SELECT t.company_id, t.user_id, min(t.timestamp_evento) AS entrata
      FROM public.campo_timbrature t
      WHERE t.tipo = 'entrata' AND (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
        AND NOT EXISTS (SELECT 1 FROM public.campo_timbrature u WHERE u.user_id = t.user_id AND u.tipo = 'uscita' AND u.timestamp_evento > t.timestamp_evento)
      GROUP BY 1, 2
    LOOP
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_promemoria', 'Non hai timbrato l''uscita',
           'Sei entrato alle ' || to_char(r.entrata AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Se hai finito, timbra l''uscita.',
           'campo_timbratura', NULL, '/campo/timbratura') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;

  ELSIF v_slot = 'rapportino' THEN
    -- Ha timbrato oggi ma non ha mandato il rapportino di oggi
    FOR r IN
      SELECT t.company_id, t.user_id, max(t.order_id) AS order_id
      FROM public.campo_timbrature t
      WHERE (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
        AND NOT EXISTS (SELECT 1 FROM public.campo_rapportini cr WHERE cr.user_id = t.user_id AND cr.data_lavoro = v_oggi)
      GROUP BY 1, 2
    LOOP
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_promemoria', 'Manca il rapportino di oggi',
           'Due minuti: cosa hai fatto, quante ore, una foto. Anche a voce.',
           'campo_rapportino', NULL,
           CASE WHEN r.order_id IS NOT NULL THEN '/campo/lavoro/' || r.order_id::text || '/rapportino' ELSE '/campo' END) IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;

  ELSIF v_slot = 'digest' THEN
    -- All'ufficio: quanti rapportini aspettano l'approvazione
    FOR r IN
      SELECT cr.company_id, count(*) AS n, p.id AS admin_id
      FROM public.campo_rapportini cr
      JOIN public.profiles p ON p.company_id = cr.company_id
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('company_admin', 'company_staff')
      WHERE cr.stato = 'inviato'
      GROUP BY cr.company_id, p.id
    LOOP
      IF public.campo_notifica(r.company_id, r.admin_id, 'campo_digest',
           r.n || CASE WHEN r.n = 1 THEN ' rapportino da approvare' ELSE ' rapportini da approvare' END,
           'Gli operai aspettano l''esito: ore e fasi passano in commessa solo dopo l''approvazione.',
           'campo_rapportino', NULL, '/azienda/ordini') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('slot', v_slot, 'ora', v_ora, 'notifiche', v_n);
END $$;

-- pg_cron gira in UTC: due orari per coprire ora legale e solare; il filtro
-- sull'ora di Roma dentro la funzione fa scattare solo quello giusto.
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname IN ('campo-promemoria-uscita', 'campo-promemoria-rapportino', 'campo-digest-ufficio') LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  PERFORM cron.schedule('campo-promemoria-uscita',     '30 15,16 * * 1-6', $c$select public.campo_promemoria()$c$);
  PERFORM cron.schedule('campo-promemoria-rapportino', '30 16,17 * * 1-6', $c$select public.campo_promemoria()$c$);
  PERFORM cron.schedule('campo-digest-ufficio',        '30 5,6 * * 1-6',   $c$select public.campo_promemoria()$c$);
END $$;
