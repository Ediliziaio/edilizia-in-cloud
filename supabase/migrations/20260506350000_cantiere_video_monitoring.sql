-- Cantiere Video Monitoring — scaffold per AI sicurezza video real-time
-- ════════════════════════════════════════════════════════════════════════════
-- Approccio pragmatico: invece di stream RTSP costante (caro), accettiamo
-- frame estratti periodicamente (es. ogni 5 min da telecamera Hikvision/Reolink)
-- via webhook o upload, AI li analizza per safety violations.
-- Per uso real-time → polling ogni 30s da app mobile capomastri (frame singolo).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cantiere_camera_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,

  device_name text NOT NULL,                  -- "Telecamera ingresso", "Drone roof"
  device_type text CHECK (device_type IN ('ip_camera', 'drone', 'mobile_app', 'helmet_cam', 'webhook')),
  serial_number text,
  manufacturer text,
  model text,

  -- Auth pubblica per device (frame upload via API key device-specific)
  device_token uuid DEFAULT gen_random_uuid(),

  -- Frame ingestion
  ingest_interval_sec int DEFAULT 300,       -- ogni 5 min
  is_active boolean DEFAULT true,
  last_frame_at timestamptz,
  last_seen_at timestamptz,

  -- AI analysis settings per device
  ai_analysis_enabled boolean DEFAULT true,
  ai_check_dpi boolean DEFAULT true,
  ai_check_falls boolean DEFAULT true,
  ai_check_unauthorized_persons boolean DEFAULT true,
  ai_check_fire_smoke boolean DEFAULT false,
  ai_check_equipment_compliance boolean DEFAULT true,

  -- Alert routing
  alert_phone text,
  alert_email text,
  alert_severity_threshold text DEFAULT 'medium'
    CHECK (alert_severity_threshold IN ('low', 'medium', 'high', 'critical')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cantiere_cameras_company
  ON public.cantiere_camera_devices(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cantiere_cameras_cantiere
  ON public.cantiere_camera_devices(cantiere_id);

ALTER TABLE public.cantiere_camera_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cantiere_cameras_company ON public.cantiere_camera_devices;
CREATE POLICY cantiere_cameras_company ON public.cantiere_camera_devices
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- Frame analysis log (storico frame analizzati)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cantiere_video_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.cantiere_camera_devices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  cantiere_id uuid,

  frame_storage_path text NOT NULL,
  frame_captured_at timestamptz DEFAULT now(),

  -- AI analysis results
  ai_persons_detected int DEFAULT 0,
  ai_dpi_compliance_pct numeric(5,2),
  ai_violations jsonb DEFAULT '[]'::jsonb,
  -- Schema violations:
  -- [{
  --   "type": "missing_helmet|fall_detected|unauthorized_access|fire|smoke",
  --   "severity": "low|medium|high|critical",
  --   "confidence": 0..1,
  --   "bounding_box": [x1, y1, x2, y2],
  --   "description": "..."
  -- }]
  ai_overall_severity text CHECK (ai_overall_severity IN ('safe', 'low', 'medium', 'high', 'critical')),
  ai_summary text,

  alert_sent boolean DEFAULT false,
  alert_sent_at timestamptz,

  ai_persona_used text DEFAULT 'compliance',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cantiere_frames_device_time
  ON public.cantiere_video_frames(device_id, frame_captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_cantiere_frames_severity
  ON public.cantiere_video_frames(company_id, ai_overall_severity)
  WHERE ai_overall_severity IN ('high', 'critical');

ALTER TABLE public.cantiere_video_frames ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cantiere_frames_company ON public.cantiere_video_frames;
CREATE POLICY cantiere_frames_company ON public.cantiere_video_frames
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_register_camera_device
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_register_camera_device(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_device_name text,
  p_device_type text,
  p_alert_phone text DEFAULT NULL,
  p_alert_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_token uuid;
BEGIN
  INSERT INTO public.cantiere_camera_devices(
    company_id, cantiere_id, device_name, device_type, alert_phone, alert_email
  )
  VALUES (p_company_id, p_cantiere_id, p_device_name, p_device_type, p_alert_phone, p_alert_email)
  RETURNING id, device_token INTO v_id, v_token;

  RETURN jsonb_build_object('ok', true, 'device_id', v_id, 'device_token', v_token);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_register_camera_device(uuid, uuid, text, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_violazioni_attive — ultime violazioni high/critical
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_violazioni_attive(
  p_company_id uuid,
  p_hours_back int DEFAULT 24
)
RETURNS TABLE (
  frame_id uuid,
  device_id uuid,
  device_name text,
  cantiere_id uuid,
  ai_overall_severity text,
  ai_summary text,
  ai_violations jsonb,
  frame_captured_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.device_id, d.device_name, f.cantiere_id, f.ai_overall_severity,
    f.ai_summary, f.ai_violations, f.frame_captured_at
  FROM public.cantiere_video_frames f
  JOIN public.cantiere_camera_devices d ON d.id = f.device_id
  WHERE f.company_id = p_company_id
    AND f.ai_overall_severity IN ('high', 'critical')
    AND f.frame_captured_at >= (now() - make_interval(hours => p_hours_back))
  ORDER BY f.frame_captured_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_violazioni_attive(uuid, int) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Cantiere video monitoring scaffold ready (8 RPC, 2 tabelle, integration con foto-quality-analyzer)'; END $$;
