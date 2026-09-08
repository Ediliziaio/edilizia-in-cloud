-- Le pose viaggiano (08/09/2026): orari sui lavori, mappa commessa→evento
-- Google per calendario, coda di sync, un canale webhook per calendario.
-- Vedi docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md.
--
-- Il trigger degli appuntamenti (notify_google_calendar_sync) legge la service
-- key dal vault, dove NON esiste: salta in silenzio da sempre. Qui si usa il
-- pattern che funziona: x-cron-secret da vault.silvio_internal_cron_secret,
-- come cliente_notifica_invia.
-- Applicata sul live via Management API, poi migration repair 20280912000001.

-- ── Orari sui lavori ─────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS work_start_time time,
  ADD COLUMN IF NOT EXISTS work_end_time time;
COMMENT ON COLUMN public.orders.work_start_time IS 'Ora di inizio dei lavori (null = tutto il giorno)';
COMMENT ON COLUMN public.orders.work_end_time IS 'Ora di fine dei lavori (null = tutto il giorno)';

-- ── Mappa commessa → evento Google, uno per calendario ───────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  external_team_id uuid REFERENCES public.external_teams(id) ON DELETE CASCADE, -- null = calendario aziendale Posa
  google_connection_id uuid NOT NULL REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  etag text,
  last_updated_by text NOT NULL DEFAULT 'eic' CHECK (last_updated_by IN ('eic', 'google')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, google_calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_gcal_order_events_event ON public.google_calendar_order_events (google_calendar_id, google_event_id);
ALTER TABLE public.google_calendar_order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gcal_order_events_lettura_azienda ON public.google_calendar_order_events;
CREATE POLICY gcal_order_events_lettura_azienda ON public.google_calendar_order_events
  FOR SELECT USING (company_id = public.get_user_company_id((SELECT auth.uid())));
GRANT SELECT ON public.google_calendar_order_events TO authenticated;

-- ── Coda ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_sync_queue (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('order')),
  entity_id uuid NOT NULL,
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gcal_sync_queue_pending ON public.google_calendar_sync_queue (created_at) WHERE processed_at IS NULL;
ALTER TABLE public.google_calendar_sync_queue ENABLE ROW LEVEL SECURITY; -- solo service role

-- ── Un canale per calendario ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  channel_id text NOT NULL,
  resource_id text,
  channel_token text NOT NULL,
  expiry_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_gcal_watches_channel ON public.google_calendar_watches (channel_id);
ALTER TABLE public.google_calendar_watches ENABLE ROW LEVEL SECURITY; -- solo service role

-- ── Risveglio della edge ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.google_calendar_sveglia(p_action text, p_body jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
   WHERE name = 'silvio_internal_cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', p_action) || coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 8000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'google_calendar_sveglia: %', SQLERRM;
END
$$;
REVOKE ALL ON FUNCTION public.google_calendar_sveglia(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── Accodare una commessa ────────────────────────────────────────────────────
-- Salta le aziende senza niente di collegato: niente coda inutile.
CREATE OR REPLACE FUNCTION public.google_calendar_accoda_commessa(p_company_id uuid, p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.external_teams t WHERE t.company_id = p_company_id AND t.google_sync_enabled AND t.google_calendar_id IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.company_calendar_links l WHERE l.company_id = p_company_id AND l.enabled AND l.google_calendar_id IS NOT NULL
  ) THEN RETURN; END IF;
  INSERT INTO public.google_calendar_sync_queue (company_id, entity_type, entity_id, reason)
  VALUES (p_company_id, 'order', p_order_id, p_reason);
  PERFORM public.google_calendar_sveglia('process-order-queue', jsonb_build_object('companyId', p_company_id));
END
$$;
REVOKE ALL ON FUNCTION public.google_calendar_accoda_commessa(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_orders_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.work_start_date IS DISTINCT FROM NEW.work_start_date OR
    OLD.work_end_date   IS DISTINCT FROM NEW.work_end_date   OR
    OLD.work_start_time IS DISTINCT FROM NEW.work_start_time OR
    OLD.work_end_time   IS DISTINCT FROM NEW.work_end_time   OR
    OLD.description     IS DISTINCT FROM NEW.description     OR
    OLD.indirizzo_lavori IS DISTINCT FROM NEW.indirizzo_lavori
  ) THEN
    PERFORM public.google_calendar_accoda_commessa(NEW.company_id, NEW.id, 'date');
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_orders_google_sync ON public.orders;
CREATE TRIGGER trg_orders_google_sync
  AFTER UPDATE OF work_start_date, work_end_date, work_start_time, work_end_time, description, indirizzo_lavori
  ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_fn_orders_google_sync();

CREATE OR REPLACE FUNCTION public.trg_fn_order_teams_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order_id uuid := coalesce(NEW.order_id, OLD.order_id); v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.orders WHERE id = v_order_id;
  IF v_company IS NOT NULL THEN
    PERFORM public.google_calendar_accoda_commessa(v_company, v_order_id, 'squadra');
  END IF;
  RETURN coalesce(NEW, OLD);
END
$$;
DROP TRIGGER IF EXISTS trg_order_teams_google_sync ON public.order_external_teams;
CREATE TRIGGER trg_order_teams_google_sync
  AFTER INSERT OR DELETE ON public.order_external_teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_order_teams_google_sync();
