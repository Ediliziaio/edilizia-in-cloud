-- LOCAL DRAFT: test with scripts/test-calendar-lease.mjs before release.
-- Kept outside migrations/ so an unrelated main push cannot deploy it.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.google_calendar_sync_leases (
 company_id uuid NOT NULL,
 user_id uuid NOT NULL,
 calendar_id text NOT NULL CHECK (length(calendar_id) BETWEEN 1 AND 1024),
 owner_token uuid NOT NULL,
 connection_id uuid NOT NULL REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY (company_id,user_id,calendar_id)
);
ALTER TABLE public.google_calendar_sync_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_calendar_sync_leases FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.google_calendar_sync_leases TO service_role;

-- Google IDs are unique within a calendar, not across all calendars.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gcal_busy_slots_calendar_event
 ON public.google_calendar_busy_slots(company_id,user_id,google_calendar_id,google_event_id);
DROP INDEX IF EXISTS public.uq_gcal_busy_slots_event;

CREATE OR REPLACE FUNCTION public.gcal_busy_claim(
 p_company uuid,p_user uuid,p_calendar text,p_owner uuid,p_connection uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,public AS $$
DECLARE acquired boolean;
BEGIN
 IF p_company IS NULL OR p_user IS NULL OR p_owner IS NULL OR p_calendar IS NULL
    OR length(p_calendar) NOT BETWEEN 1 AND 1024 THEN
   RAISE EXCEPTION 'Invalid calendar scope' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.google_calendar_connections
   WHERE id=p_connection AND company_id=p_company AND user_id=p_user AND status='connected') THEN
   RETURN false;
 END IF;
 INSERT INTO public.google_calendar_sync_leases AS lease
 VALUES (p_company,p_user,p_calendar,p_owner,p_connection,clock_timestamp()+interval '90 seconds')
 ON CONFLICT (company_id,user_id,calendar_id) DO UPDATE
 SET owner_token=excluded.owner_token,connection_id=excluded.connection_id,expires_at=excluded.expires_at
 WHERE lease.expires_at<=clock_timestamp()
 RETURNING true INTO acquired;
 RETURN coalesce(acquired,false);
END; $$;

CREATE OR REPLACE FUNCTION public.gcal_busy_batch(
 p_company uuid,p_user uuid,p_calendar text,p_owner uuid,p_connection uuid,
 p_rows jsonb DEFAULT '[]',p_remove uuid[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,public AS $$
DECLARE current_owner uuid; expiry timestamptz; written integer; removed integer; connection_live uuid;
BEGIN
 -- Lock parent first, then lease: matches disconnect's FK/cascade lock order.
 SELECT id INTO connection_live FROM public.google_calendar_connections
 WHERE id=p_connection AND company_id=p_company AND user_id=p_user AND status='connected'
 FOR SHARE;
 IF connection_live IS NULL THEN
   RAISE EXCEPTION 'Calendar connection changed or disconnected' USING ERRCODE='55000';
 END IF;
 -- Short transaction per <=100 rows. Nothing is locked during Google HTTP.
 SELECT owner_token,expires_at INTO current_owner,expiry
 FROM public.google_calendar_sync_leases
 WHERE company_id=p_company AND user_id=p_user AND calendar_id=p_calendar AND connection_id=p_connection
 FOR UPDATE;
 IF current_owner IS DISTINCT FROM p_owner OR p_owner IS NULL OR expiry<=clock_timestamp() THEN
   RAISE EXCEPTION 'Calendar lease lost' USING ERRCODE='55000';
 END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>100
    OR p_remove IS NULL OR cardinality(p_remove)>100 THEN
   RAISE EXCEPTION 'Invalid calendar batch' USING ERRCODE='22023';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.google_calendar_busy_slots,p_rows) r
   WHERE r.company_id IS DISTINCT FROM p_company OR r.user_id IS DISTINCT FROM p_user
     OR r.google_calendar_id IS DISTINCT FROM p_calendar
     OR r.google_event_id IS NULL OR length(r.google_event_id) NOT BETWEEN 1 AND 1024
     OR r.start_at IS NULL OR r.end_at IS NULL OR r.end_at<=r.start_at OR r.is_all_day IS NULL) THEN
   RAISE EXCEPTION 'Invalid busy slot scope or dates' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.google_calendar_busy_slots
   (company_id,user_id,google_calendar_id,google_event_id,summary,start_at,end_at,is_all_day)
 SELECT company_id,user_id,google_calendar_id,google_event_id,summary,start_at,end_at,is_all_day
 FROM jsonb_populate_recordset(NULL::public.google_calendar_busy_slots,p_rows)
 ON CONFLICT (company_id,user_id,google_calendar_id,google_event_id) DO UPDATE
 SET summary=excluded.summary,start_at=excluded.start_at,end_at=excluded.end_at,is_all_day=excluded.is_all_day;
 GET DIAGNOSTICS written=ROW_COUNT;
 DELETE FROM public.google_calendar_busy_slots
 WHERE company_id=p_company AND user_id=p_user AND google_calendar_id=p_calendar AND id=ANY(p_remove);
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN jsonb_build_object('written',written,'removed',removed);
END; $$;

CREATE OR REPLACE FUNCTION public.gcal_busy_release(
 p_company uuid,p_user uuid,p_calendar text,p_owner uuid,p_connection uuid
) RETURNS void LANGUAGE sql SECURITY INVOKER
SET search_path = pg_catalog,public AS $$
 DELETE FROM public.google_calendar_sync_leases
 WHERE company_id=p_company AND user_id=p_user AND calendar_id=p_calendar AND owner_token=p_owner AND connection_id=p_connection;
$$;
REVOKE ALL ON FUNCTION public.gcal_busy_claim(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gcal_busy_batch(uuid,uuid,text,uuid,uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gcal_busy_release(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gcal_busy_claim(uuid,uuid,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gcal_busy_batch(uuid,uuid,text,uuid,uuid,jsonb,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.gcal_busy_release(uuid,uuid,text,uuid,uuid) TO service_role;
COMMIT;
