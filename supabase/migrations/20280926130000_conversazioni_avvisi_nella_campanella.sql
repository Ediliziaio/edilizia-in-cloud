-- Conversazioni: un avviso nella campanella quando arriva un messaggio (26/09/2026).
--
-- Fino a oggi un WhatsApp, un SMS, un'email o un messaggio Messenger/Instagram
-- arrivato in Conversazioni non avvisava nessuno: l'azienda lo scopriva solo
-- aprendo la pagina. Le «whatsapp_risposta» e «outreach_risposta_email» della
-- campanella sono dell'outreach della piattaforma, non delle aziende. Le
-- preferenze per questi avvisi esistevano già (message_whatsapp_in_app,
-- message_email_received_in_app, accese di serie) ma nessuno le leggeva.
--
-- Un giro al minuto (pg_cron, solo SQL: niente pg_net, quindi nessun peso sulla
-- coda dei cron che chiamano le funzioni) guarda i messaggi in arrivo degli
-- ultimi 30 minuti nelle stesse viste dell'inbox (v_conversazioni_messaggi,
-- v_conversazioni_social): avvisa di quello che l'inbox mostra, con gli stessi
-- collegamenti a contatti e clienti, anche per le email che vengono collegate al
-- contatto dopo l'arrivo. Misurato il 26/09: ~5 ms di esecuzione, ~30 ms di
-- pianificazione. Un trigger sulle tabelle dei messaggi avrebbe potuto far
-- fallire l'arrivo del messaggio stesso.
--
-- A chi: a chi ha la conversazione assegnata; se non è assegnata, agli
-- amministratori dell'azienda (company_admin, anche con accesso multi-azienda).
-- Mai a utenti bloccati o cancellati. Il 26/09, sugli ultimi 7 giorni, sarebbero
-- state 10 conversazioni in 4 aziende, da 1 a 3 destinatari ciascuna.
--
-- Non a raffica: se la persona ha già un avviso non letto per quella
-- conversazione lo si aggiorna («Nuovi messaggi da …», in cima alla campanella)
-- invece di aggiungerne un altro; il toast in tempo reale parte solo sul primo.
-- Aprire la conversazione nell'inbox (che scrive last_read_at) segna letti i
-- suoi avvisi. Al primo giro si guardano solo gli ultimi 5 minuti: il rilascio
-- non avvisa di messaggi vecchi.
--
-- Esclusa l'azienda della piattaforma, che ha già gli avvisi dell'outreach.

SET LOCAL lock_timeout = '3s';

-- ─── Segnalibro per conversazione: fin dove si è già avvisato ───────────────
CREATE TABLE IF NOT EXISTS public.conversazioni_avvisi (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entita_tipo text NOT NULL,
  entita_id uuid NOT NULL,
  ultimo_ts timestamptz NOT NULL,
  aggiornato_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, entita_tipo, entita_id)
);

-- Solo le funzioni del database la toccano: nessuna policy, nessun GRANT.
ALTER TABLE public.conversazioni_avvisi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversazioni_avvisi FROM PUBLIC, anon, authenticated;

-- ─── Il giro al minuto ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.avvisa_messaggi_conversazioni()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  c record;
  dest uuid;
  destinatari uuid[];
  nome text;
  corpo text;
  vuole boolean;
  esistente uuid;
  avvisi integer := 0;
BEGIN
  FOR c IN
    WITH nuovi AS (
      SELECT m.company_id, m.entita_tipo, m.entita_id, m.canale, m.controparte,
             coalesce(nullif(trim(m.oggetto), ''), m.testo) AS anteprima, m.ts
        FROM public.v_conversazioni_messaggi m
       WHERE m.direzione = 'in' AND m.ts > now() - interval '30 minutes' AND m.ts <= now()
      UNION ALL
      SELECT s.company_id, s.entita_tipo, s.entita_id, s.canale, s.controparte, s.testo, s.ts
        FROM public.v_conversazioni_social s
       WHERE s.direzione = 'in' AND s.ts > now() - interval '30 minutes' AND s.ts <= now()
    )
    SELECT n.company_id, n.entita_tipo, n.entita_id,
           count(*) AS quanti,
           max(n.ts) AS ultimo_ts,
           (array_agg(n.canale ORDER BY n.ts DESC))[1] AS canale,
           (array_agg(n.controparte ORDER BY n.ts DESC))[1] AS controparte,
           (array_agg(n.anteprima ORDER BY n.ts DESC))[1] AS anteprima
      FROM nuovi n
      LEFT JOIN public.conversazioni_avvisi a
        ON a.company_id = n.company_id AND a.entita_tipo = n.entita_tipo AND a.entita_id = n.entita_id
     WHERE n.company_id IS NOT NULL AND n.entita_id IS NOT NULL
       AND n.company_id <> '00000000-0000-0000-0000-000000000001'::uuid
       AND n.ts > coalesce(a.ultimo_ts, now() - interval '5 minutes')
     GROUP BY n.company_id, n.entita_tipo, n.entita_id
  LOOP
    -- Il segnalibro avanza sempre: senza destinatari lo stesso messaggio non torna.
    INSERT INTO public.conversazioni_avvisi (company_id, entita_tipo, entita_id, ultimo_ts, aggiornato_at)
    VALUES (c.company_id, c.entita_tipo, c.entita_id, c.ultimo_ts, now())
    ON CONFLICT (company_id, entita_tipo, entita_id)
    DO UPDATE SET ultimo_ts = greatest(public.conversazioni_avvisi.ultimo_ts, excluded.ultimo_ts),
                  aggiornato_at = now();

    -- Il nome come nell'inbox (conversazioni_lista), poi email o telefono.
    nome := CASE c.entita_tipo
      WHEN 'contatto' THEN (SELECT nullif(trim(coalesce(mc.first_name, '') || ' ' || coalesce(mc.last_name, '')), '')
                              FROM public.marketing_contacts mc WHERE mc.id = c.entita_id)
      WHEN 'cliente' THEN (SELECT nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
                              FROM public.profiles pr WHERE pr.id = c.entita_id)
    END;
    nome := coalesce(nome, nullif(trim(c.controparte), ''), 'un contatto');

    corpo := CASE c.canale
               WHEN 'email' THEN 'Email' WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'sms' THEN 'SMS'
               WHEN 'messenger' THEN 'Messenger' WHEN 'instagram' THEN 'Instagram'
               ELSE initcap(coalesce(nullif(c.canale, ''), 'Messaggio'))
             END
             || ': '
             || coalesce(nullif(left(trim(regexp_replace(coalesce(c.anteprima, ''), '\s+', ' ', 'g')), 140), ''), 'nuovo messaggio');

    -- Chi ha la conversazione, se può ancora entrare nell'azienda.
    SELECT array_agg(cv.assegnato_a) INTO destinatari
      FROM public.conversazioni cv
      JOIN public.profiles p ON p.id = cv.assegnato_a
     WHERE cv.company_id = c.company_id AND cv.entita_tipo = c.entita_tipo AND cv.entita_id = c.entita_id
       AND coalesce(p.is_blocked, false) = false AND p.deleted_at IS NULL
       AND (p.company_id = c.company_id OR EXISTS (
             SELECT 1 FROM public.multi_company_access mca
              WHERE mca.user_id = p.id AND mca.company_id = c.company_id AND mca.status = 'active'
                AND (mca.expires_at IS NULL OR mca.expires_at > now())));

    -- Nessuno: gli amministratori dell'azienda.
    IF destinatari IS NULL THEN
      SELECT array_agg(DISTINCT y.uid) INTO destinatari FROM (
        SELECT p.id AS uid
          FROM public.profiles p
         WHERE p.company_id = c.company_id
           AND coalesce(p.is_blocked, false) = false AND p.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'company_admin')
        UNION
        SELECT mca.user_id
          FROM public.multi_company_access mca
          JOIN public.profiles p ON p.id = mca.user_id
         WHERE mca.company_id = c.company_id AND mca.status = 'active'
           AND (mca.expires_at IS NULL OR mca.expires_at > now())
           AND mca.access_role::text = 'company_admin'
           AND coalesce(p.is_blocked, false) = false AND p.deleted_at IS NULL
      ) y;
    END IF;

    CONTINUE WHEN destinatari IS NULL;

    FOREACH dest IN ARRAY destinatari LOOP
      -- Nessuna riga di preferenze = valori di serie (acceso).
      SELECT CASE WHEN c.canale = 'email' THEN unp.message_email_received_in_app
                  ELSE unp.message_whatsapp_in_app END
        INTO vuole
        FROM public.user_notification_preferences unp
       WHERE unp.user_id = dest;
      CONTINUE WHEN vuole IS FALSE;

      SELECT nt.id INTO esistente
        FROM public.notifications nt
       WHERE nt.user_id = dest AND nt.company_id = c.company_id
         AND nt.type = 'conversazione_messaggio'
         AND nt.entity_type = c.entita_tipo AND nt.entity_id = c.entita_id
         AND nt.is_read = false AND nt.is_dismissed = false
       ORDER BY nt.created_at DESC
       LIMIT 1;

      IF esistente IS NOT NULL THEN
        UPDATE public.notifications
           SET title = 'Nuovi messaggi da ' || nome, body = corpo, created_at = now()
         WHERE id = esistente;
      ELSE
        INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
        VALUES (c.company_id, dest, 'conversazione_messaggio',
                CASE WHEN c.quanti > 1 THEN 'Nuovi messaggi da ' ELSE 'Nuovo messaggio da ' END || nome,
                corpo, c.entita_tipo, c.entita_id,
                '/azienda/chat?tab=conversazioni&filo=' || c.entita_tipo || ':' || c.entita_id::text);
      END IF;
      avvisi := avvisi + 1;
    END LOOP;
  END LOOP;

  RETURN avvisi;
END;
$$;

REVOKE ALL ON FUNCTION public.avvisa_messaggi_conversazioni() FROM PUBLIC, anon, authenticated;

-- ─── Aprire la conversazione segna letti i suoi avvisi ──────────────────────
-- L'inbox scrive last_read_at quando si apre un filo: vale per chi lo apre.
CREATE OR REPLACE FUNCTION public.tg_conversazione_letta_chiude_avvisi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.last_read_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.last_read_at IS DISTINCT FROM OLD.last_read_at) THEN
    UPDATE public.notifications
       SET is_read = true
     WHERE user_id = auth.uid() AND company_id = NEW.company_id
       AND type = 'conversazione_messaggio'
       AND entity_type = NEW.entita_tipo AND entity_id = NEW.entita_id
       AND is_read = false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_conversazione_letta_chiude_avvisi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conversazione_letta_chiude_avvisi ON public.conversazioni;
CREATE TRIGGER trg_conversazione_letta_chiude_avvisi
  AFTER INSERT OR UPDATE OF last_read_at ON public.conversazioni
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversazione_letta_chiude_avvisi();

-- ─── Il cron ─────────────────────────────────────────────────────────────────
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'avvisi-conversazioni' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  PERFORM cron.schedule('avvisi-conversazioni', '* * * * *', $c$select public.avvisa_messaggi_conversazioni()$c$);
END $$;
