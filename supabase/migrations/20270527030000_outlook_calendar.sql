-- =============================================
-- Outlook Calendar (Microsoft 365) integration
-- =============================================
-- Modellato sul pattern google_calendar_connections.
-- API: Microsoft Graph v1.0 — https://graph.microsoft.com/v1.0/me/...
-- Scope: Calendars.ReadWrite, offline_access, User.Read
-- =============================================

BEGIN;

-- ── 1. Connection per (company, user) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlook_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identità Microsoft (oid = stable user identifier su Azure AD)
  microsoft_account_email TEXT,
  microsoft_oid TEXT,                          -- "objectId" stabile dell'utente

  -- Token cifrati
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  granted_scopes JSONB DEFAULT '[]'::jsonb,

  -- Calendari selezionati (primary + altri opt-in)
  primary_calendar_id TEXT,                    -- "AAMkAGI2..."
  primary_calendar_name TEXT,
  synced_calendar_ids JSONB DEFAULT '[]'::jsonb,  -- array di calendar_id da sincronizzare

  status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected' | 'disconnected' | 'error'
  last_sync_at TIMESTAMPTZ,
  last_sync_event_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Webhook subscription (per push notification da Graph)
  webhook_subscription_id TEXT,
  webhook_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)  -- una connessione personale per utente
);

CREATE INDEX IF NOT EXISTS idx_outlook_conn_company ON public.outlook_calendar_connections(company_id);
CREATE INDEX IF NOT EXISTS idx_outlook_conn_status ON public.outlook_calendar_connections(status) WHERE status = 'connected';
CREATE INDEX IF NOT EXISTS idx_outlook_conn_webhook_expiry ON public.outlook_calendar_connections(webhook_expires_at) WHERE webhook_subscription_id IS NOT NULL;

COMMENT ON TABLE public.outlook_calendar_connections IS
  'Microsoft 365 / Outlook Calendar OAuth tokens + selected calendars. Una per utente.';

-- ── 2. Lista calendari disponibili (cache durante setup) ─────────────────────
CREATE TABLE IF NOT EXISTS public.outlook_calendars_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.outlook_calendar_connections(id) ON DELETE CASCADE,
  outlook_calendar_id TEXT NOT NULL,
  name TEXT,
  color TEXT,
  is_default_calendar BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  owner_name TEXT,
  owner_address TEXT,
  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, outlook_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_outlook_cal_cache_conn ON public.outlook_calendars_cache(connection_id);

-- ── 3. Eventi sincronizzati ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlook_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.outlook_calendar_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  outlook_event_id TEXT NOT NULL,
  outlook_calendar_id TEXT NOT NULL,
  outlook_ical_uid TEXT,                       -- utile per dedup cross-calendar

  subject TEXT,
  body_preview TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT false,
  location_display_name TEXT,
  organizer_email TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,         -- [{email, name, response_status}]
  show_as TEXT,                                -- "free" | "tentative" | "busy" | "oof"
  series_master_id TEXT,                       -- per eventi ricorrenti
  is_cancelled BOOLEAN DEFAULT false,
  web_link TEXT,                               -- link per aprire in Outlook web

  -- Mapping verso entità EiC (se l'evento è collegato)
  eic_meeting_id UUID,                         -- FK opzionale verso meetings/appointments
  eic_link_type TEXT,                          -- 'manual' | 'webhook' | 'auto'

  raw JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(connection_id, outlook_event_id)
);

CREATE INDEX IF NOT EXISTS idx_outlook_events_user ON public.outlook_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_outlook_events_start ON public.outlook_calendar_events(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_outlook_events_company ON public.outlook_calendar_events(company_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_outlook_events_ical_uid ON public.outlook_calendar_events(outlook_ical_uid) WHERE outlook_ical_uid IS NOT NULL;

COMMENT ON TABLE public.outlook_calendar_events IS
  'Eventi sincronizzati da Outlook Calendar via Microsoft Graph.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.outlook_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_calendars_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_calendar_events ENABLE ROW LEVEL SECURITY;

-- Connection: utente vede solo la propria
DROP POLICY IF EXISTS "outlook_conn_select_own" ON public.outlook_calendar_connections;
CREATE POLICY "outlook_conn_select_own" ON public.outlook_calendar_connections
  FOR SELECT USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

DROP POLICY IF EXISTS "outlook_conn_modify_own" ON public.outlook_calendar_connections;
CREATE POLICY "outlook_conn_modify_own" ON public.outlook_calendar_connections
  FOR ALL USING (user_id = auth.uid());

-- Cache: RLS via connection
DROP POLICY IF EXISTS "outlook_cal_cache_all" ON public.outlook_calendars_cache;
CREATE POLICY "outlook_cal_cache_all" ON public.outlook_calendars_cache
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.outlook_calendar_connections c
            WHERE c.id = outlook_calendars_cache.connection_id AND c.user_id = auth.uid())
  );

-- Events: utente vede solo i propri
DROP POLICY IF EXISTS "outlook_events_select_own" ON public.outlook_calendar_events;
CREATE POLICY "outlook_events_select_own" ON public.outlook_calendar_events
  FOR SELECT USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

DROP POLICY IF EXISTS "outlook_events_modify_own" ON public.outlook_calendar_events;
CREATE POLICY "outlook_events_modify_own" ON public.outlook_calendar_events
  FOR UPDATE USING (user_id = auth.uid());

-- INSERT/DELETE: solo service_role (edge functions). Niente policy = bypass via service key.

-- ── Reuse updated_at trigger function da gbp migration ───────────────────────
DROP TRIGGER IF EXISTS trg_outlook_conn_updated_at ON public.outlook_calendar_connections;
CREATE TRIGGER trg_outlook_conn_updated_at
  BEFORE UPDATE ON public.outlook_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gbp();

DROP TRIGGER IF EXISTS trg_outlook_events_updated_at ON public.outlook_calendar_events;
CREATE TRIGGER trg_outlook_events_updated_at
  BEFORE UPDATE ON public.outlook_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gbp();

COMMIT;
