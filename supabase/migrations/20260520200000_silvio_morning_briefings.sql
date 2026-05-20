-- ============================================================================
-- silvio_morning_briefings — briefing proattivo personalizzato
-- ----------------------------------------------------------------------------
-- Ogni mattina (cron 08:00 IT), edge function silvio-morning-brief processa
-- gli utenti attivi e genera un briefing 3-5 bullet con cose importanti
-- delle ultime 24h: scadenze, crediti scaduti, anomalie, opportunità.
--
-- L'utente apre il FAB e vede il briefing del giorno PRIMA di scrivere nulla.
-- Trasforma Silvio da assistant reattivo a propositivo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.silvio_morning_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,

  -- Data del briefing (un briefing per utente per giorno)
  brief_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Contenuto markdown
  content text NOT NULL,
  -- Bullet point estratti per UI compatta (es. SilvioFAB launcher)
  key_points jsonb NOT NULL DEFAULT '[]',
  -- Severity globale del briefing: 'info' | 'attention' | 'urgent'
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'attention', 'urgent')),

  -- Tool utilizzati per generarlo (audit + costo)
  tools_used jsonb NOT NULL DEFAULT '[]',
  model_used text,
  cost_usd numeric(10,6),

  -- Tracking lettura
  read_at timestamptz,
  dismissed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Un solo briefing per (user, day)
  UNIQUE(user_id, brief_date)
);

CREATE INDEX IF NOT EXISTS idx_silvio_brief_user_recent
  ON public.silvio_morning_briefings (user_id, brief_date DESC);

CREATE INDEX IF NOT EXISTS idx_silvio_brief_unread
  ON public.silvio_morning_briefings (user_id, brief_date DESC)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE public.silvio_morning_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_read_own_briefings"
ON public.silvio_morning_briefings FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user_update_own_briefing_status"
ON public.silvio_morning_briefings FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.silvio_morning_briefings TO authenticated;
GRANT ALL ON public.silvio_morning_briefings TO service_role;

-- RPC: lista utenti attivi per i quali generare briefing
-- "attivo" = profilo con last_login_at recente (negli ultimi N giorni)
-- Filtro role: usa user_roles (tabella separata, schema profiles non ha .role)
CREATE OR REPLACE FUNCTION public.silvio_users_for_morning_brief(
  p_lookback_days int DEFAULT 14
)
RETURNS TABLE (
  user_id uuid,
  company_id uuid,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id as user_id,
    p.company_id,
    COALESCE(p.last_login_at, p.updated_at, p.created_at) as last_seen
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id IS NOT NULL
    AND ur.role::text IN ('company_admin', 'super_admin', 'company_staff')
    AND COALESCE(p.last_login_at, p.updated_at, p.created_at) > NOW() - (p_lookback_days || ' days')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.silvio_morning_briefings smb
      WHERE smb.user_id = p.id AND smb.brief_date = CURRENT_DATE
    )
  ORDER BY last_seen DESC;
$$;

REVOKE ALL ON FUNCTION public.silvio_users_for_morning_brief(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_users_for_morning_brief(int) TO service_role;

COMMENT ON TABLE public.silvio_morning_briefings IS
'Briefing proattivo giornaliero generato da silvio-morning-brief edge function. Una entry per (user, day). Letta dal SilvioFAB launcher per mostrare "Cose che dovresti sapere stamattina" prima ancora di chiedere.';
