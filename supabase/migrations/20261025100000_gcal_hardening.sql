-- Google Calendar hardening: RLS policies, webhook security, sync loop prevention
-- ──────────────────────────────────────────────────────────────────────
-- Audit ha mostrato:
-- 1. RLS enabled su tutte le gcal tables, ma policy specifiche mancanti.
-- 2. Webhook accetta qualsiasi POST con x-goog-channel-id (no token verify).
-- 3. Sync loop possibile: CRM update → webhook → full-sync sovrascrive CRM.
-- 4. Ogni push Google triggera full-sync (no debounce su bulk events).
-- Questa migration risolve tutti e 4.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. WEBHOOK CHANNEL TOKEN — random secret per ogni channel
-- ──────────────────────────────────────────────────────────────────────
-- Google rispedisce il token passato in registrazione come header
-- x-goog-channel-token su ogni push. Permette all'edge function di
-- verificare che la richiesta arrivi effettivamente dal watch registrato.
ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS webhook_channel_token TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_source TEXT CHECK (last_sync_source IN ('crm', 'google', NULL)),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN public.google_calendar_connections.webhook_channel_token IS
  'Token segreto per verificare che i push arrivino da Google (no CSRF)';
COMMENT ON COLUMN public.google_calendar_connections.last_webhook_processed_at IS
  'Ultima volta che abbiamo processato un push Google. Per debounce.';
COMMENT ON COLUMN public.google_calendar_connections.last_sync_source IS
  'Sorgente ultimo cambio: crm (push CRM→Google) o google (pull Google→CRM). Per sync loop prevention.';

-- Index per query di debounce
CREATE INDEX IF NOT EXISTS idx_gcal_conn_channel
  ON public.google_calendar_connections(webhook_channel_id)
  WHERE webhook_channel_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 2. EVENT MAP: idempotency + sync source tracking
-- ──────────────────────────────────────────────────────────────────────
-- last_sync_source permette a reconcilePrimary di sapere quale parte ha
-- modificato per ultimo e applicare politica conflict resolution corretta.
ALTER TABLE public.google_calendar_event_map
  ADD COLUMN IF NOT EXISTS last_sync_source TEXT CHECK (last_sync_source IN ('crm', 'google')),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique per prevenire duplicate push-event per stesso appointment
-- (un appointment_id può mappare a UNO solo google_event_id attivo per calendar_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gcal_event_map_unique_appt
  ON public.google_calendar_event_map(appointment_id, google_calendar_id)
  WHERE google_event_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 3. RLS POLICIES — isolamento user-level + company-level
-- ──────────────────────────────────────────────────────────────────────
-- Prima: RLS enabled ma solo 1 policy (public_booking per busy_slots).
-- Ora garantiamo che ogni utente veda solo le proprie connessioni e
-- busy_slots, e che gli admin della company vedano tutti gli eventi
-- sincronizzati della company.

-- google_calendar_connections: user vede solo proprie (o super_admin)
DROP POLICY IF EXISTS "gcal_conn_own" ON public.google_calendar_connections;
CREATE POLICY "gcal_conn_own"
  ON public.google_calendar_connections FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "gcal_conn_insert_own" ON public.google_calendar_connections;
CREATE POLICY "gcal_conn_insert_own"
  ON public.google_calendar_connections FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "gcal_conn_update_own" ON public.google_calendar_connections;
CREATE POLICY "gcal_conn_update_own"
  ON public.google_calendar_connections FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "gcal_conn_delete_own" ON public.google_calendar_connections;
CREATE POLICY "gcal_conn_delete_own"
  ON public.google_calendar_connections FOR DELETE
  USING (user_id = auth.uid());

-- google_calendar_settings: user vede solo proprie
DROP POLICY IF EXISTS "gcal_settings_own" ON public.google_calendar_settings;
CREATE POLICY "gcal_settings_own"
  ON public.google_calendar_settings FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'company_admin')
    )
  );

DROP POLICY IF EXISTS "gcal_settings_upsert_own" ON public.google_calendar_settings;
CREATE POLICY "gcal_settings_upsert_own"
  ON public.google_calendar_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- google_calendar_busy_slots: user vede i propri + company admin (per team calendar)
DROP POLICY IF EXISTS "gcal_busy_own_or_company_admin" ON public.google_calendar_busy_slots;
CREATE POLICY "gcal_busy_own_or_company_admin"
  ON public.google_calendar_busy_slots FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('super_admin', 'company_admin', 'company_staff', 'salesperson', 'call_center')
      )
    )
  );

-- google_calendar_event_map: user vede propri o admin company
DROP POLICY IF EXISTS "gcal_event_map_own" ON public.google_calendar_event_map;
CREATE POLICY "gcal_event_map_own"
  ON public.google_calendar_event_map FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('super_admin', 'company_admin')
      )
    )
  );

COMMIT;
