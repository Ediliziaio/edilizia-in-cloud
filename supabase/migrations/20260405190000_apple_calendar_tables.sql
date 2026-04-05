-- =============================================
-- Apple Calendar (CalDAV) Integration - Tabelle
-- =============================================

-- 1. apple_calendar_connections
CREATE TABLE IF NOT EXISTS public.apple_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  apple_id_email text NOT NULL,
  app_password_encrypted text NOT NULL,
  caldav_principal_url text,
  caldav_home_url text,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected','disconnected','auth_failed','error')),
  last_sync_at timestamptz,
  last_error text,
  ctag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- 2. apple_calendar_settings
CREATE TABLE IF NOT EXISTS public.apple_calendar_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.apple_calendar_connections(id) ON DELETE CASCADE,
  primary_calendar_url text,
  primary_calendar_name text,
  conflict_calendar_urls text[] NOT NULL DEFAULT '{}',
  sync_mode text NOT NULL DEFAULT 'one_way' CHECK (sync_mode IN ('one_way','two_way')),
  import_apple_events_to_crm boolean NOT NULL DEFAULT false,
  block_busy_slots boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- 3. apple_calendar_event_map
CREATE TABLE IF NOT EXISTS public.apple_calendar_event_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  caldav_event_url text NOT NULL,
  caldav_uid text NOT NULL,
  caldav_calendar_url text,
  source text NOT NULL DEFAULT 'crm' CHECK (source IN ('crm','apple')),
  etag text,
  last_synced_at timestamptz,
  last_updated_by text CHECK (last_updated_by IN ('crm','apple')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id, caldav_uid)
);

-- 4. apple_calendar_busy_slots
CREATE TABLE IF NOT EXISTS public.apple_calendar_busy_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caldav_uid text,
  caldav_calendar_url text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  summary text,
  is_all_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id, caldav_uid)
);

-- RLS
ALTER TABLE public.apple_calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own apple connections"
  ON public.apple_calendar_connections
  USING (user_id = auth.uid());

ALTER TABLE public.apple_calendar_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own apple settings"
  ON public.apple_calendar_settings
  USING (user_id = auth.uid());

ALTER TABLE public.apple_calendar_event_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own apple event maps"
  ON public.apple_calendar_event_map
  USING (user_id = auth.uid());

ALTER TABLE public.apple_calendar_busy_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own apple busy slots"
  ON public.apple_calendar_busy_slots FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can write own apple busy slots"
  ON public.apple_calendar_busy_slots FOR ALL
  USING (user_id = auth.uid());

-- Public booking policy
CREATE POLICY "public_booking_read_apple_busy_slots"
  ON public.apple_calendar_busy_slots FOR SELECT
  USING (user_id IN (
    SELECT owner_id FROM marketing_calendars
    WHERE booking_slug IS NOT NULL AND is_active = true AND owner_id IS NOT NULL
  ));

-- Vista unificata busy slots
CREATE OR REPLACE VIEW public.unified_calendar_busy_slots AS
SELECT id, company_id, user_id, start_at, end_at, summary, is_all_day,
  'google' AS provider, google_event_id AS external_id
FROM public.google_calendar_busy_slots
UNION ALL
SELECT id, company_id, user_id, start_at, end_at, summary, is_all_day,
  'apple' AS provider, caldav_uid AS external_id
FROM public.apple_calendar_busy_slots;
