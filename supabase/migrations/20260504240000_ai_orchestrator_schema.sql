-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-03 — Fase 2: AI Orchestrator schema (RBAC + Chat + Violations)
-- ════════════════════════════════════════════════════════════════════════════
-- Tabelle introdotte:
--   1. ai_persona_permissions  — override fine-grained role → persona (SuperAdmin)
--   2. ai_persona_sessions        — sessioni chat per (user × company × persona)
--   3. ai_persona_messages        — messaggi (user/assistant/tool) con ledger link
--   4. ai_action_proposals     — bozze azioni 🟡 proposte dall'AI da confermare
--   5. ai_rbac_violations      — tentativi accesso non autorizzato + notifica owner
--
-- RPC introdotte:
--   • can_user_use_persona(user_id, persona_key) → boolean
--   • log_rbac_violation(...) → notifica titolare azienda
--   • create_persona_session(persona_key, title) → uuid
--   • record_persona_message(...) → uuid
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) ai_persona_permissions — override fine-grained per company (opzionale)
-- ───────────────────────────────────────────────────────────────────────────
-- Il default RBAC sta già in ai_personas.allowed_roles (array di ruoli app).
-- Questa tabella permette al SuperAdmin di concedere/negare accessi specifici
-- a un singolo ruolo/utente per un'azienda specifica (override).

CREATE TABLE IF NOT EXISTS public.ai_persona_permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** NULL = override globale (vale per tutte le aziende). */
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  /** Ruolo applicativo (es. 'operaio', 'pm', 'cfo'). NULL = qualsiasi ruolo. */
  app_role        text,
  /** User specifico (override granulare). NULL = vale per tutti gli utenti del role. */
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Persona target. */
  persona_key     text NOT NULL,
  /** true = ALLOW, false = DENY (override esplicito) */
  allowed         boolean NOT NULL,
  /** Motivazione (audit). */
  reason          text NOT NULL,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT permission_must_target_role_or_user
    CHECK (app_role IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_persona_perm_lookup
  ON public.ai_persona_permissions(persona_key, company_id, app_role, user_id);

ALTER TABLE public.ai_persona_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_persona_perm_admin ON public.ai_persona_permissions;
CREATE POLICY ai_persona_perm_admin ON public.ai_persona_permissions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.ai_persona_permissions IS
  'Override fine-grained role → persona. Default RBAC sta in ai_personas.allowed_roles.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) ai_persona_sessions — sessione chat utente × persona
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_persona_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  persona_key     text NOT NULL,
  /** Titolo auto-generato dal primo messaggio o customizzato dall'utente. */
  title           text NOT NULL DEFAULT 'Nuova conversazione',
  /** Lingua principale: sempre 'it' default. */
  language        text NOT NULL DEFAULT 'it',
  /** Quanti messaggi totali. */
  message_count   int NOT NULL DEFAULT 0,
  /** Costo billed totale per la sessione (cumula da ledger). */
  total_cost_billed_eur numeric(10,4) NOT NULL DEFAULT 0,
  /** Token totali. */
  total_tokens_in  int NOT NULL DEFAULT 0,
  total_tokens_out int NOT NULL DEFAULT 0,
  /** Timestamp ultimo messaggio (per ordinamento UI). */
  last_message_at timestamptz NOT NULL DEFAULT now(),
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_persona_sessions_user
  ON public.ai_persona_sessions(user_id, last_message_at DESC) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_ai_persona_sessions_company
  ON public.ai_persona_sessions(company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_persona_sessions_persona
  ON public.ai_persona_sessions(persona_key, company_id);

ALTER TABLE public.ai_persona_sessions ENABLE ROW LEVEL SECURITY;

-- L'utente vede SOLO le proprie sessioni (storia privata)
DROP POLICY IF EXISTS ai_persona_sessions_owner ON public.ai_persona_sessions;
CREATE POLICY ai_persona_sessions_owner ON public.ai_persona_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id());

-- SuperAdmin vede tutto (per supporto / audit)
DROP POLICY IF EXISTS ai_persona_sessions_admin ON public.ai_persona_sessions;
CREATE POLICY ai_persona_sessions_admin ON public.ai_persona_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_ai_persona_sessions_updated_at ON public.ai_persona_sessions;
CREATE TRIGGER trg_ai_persona_sessions_updated_at
  BEFORE UPDATE ON public.ai_persona_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ai_persona_sessions IS
  'Sessione chat per (user × company × persona). Storia privata utente, isolamento RLS.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ai_persona_messages — messaggi della sessione
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_persona_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.ai_persona_sessions(id) ON DELETE CASCADE,
  /** Ruolo OpenAI: user | assistant | tool | system */
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content         text NOT NULL,
  /** Tool calls (se assistant ha invocato strumenti). */
  tool_calls      jsonb,
  /** Tool call id se role=tool. */
  tool_call_id    text,
  /** Link al ledger (per attribuzione costi). */
  ledger_id       uuid REFERENCES public.ai_call_ledger(id) ON DELETE SET NULL,
  /** Token consumati da questo messaggio (solo assistant). */
  tokens_in       int,
  tokens_out      int,
  /** Costo billed (solo assistant). */
  cost_billed_eur numeric(10,6),
  /** Modello usato. */
  model_used      text,
  /** Metadata varie. */
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_persona_messages_session
  ON public.ai_persona_messages(session_id, created_at);

ALTER TABLE public.ai_persona_messages ENABLE ROW LEVEL SECURITY;

-- L'utente vede SOLO i messaggi delle proprie sessioni
DROP POLICY IF EXISTS ai_persona_messages_owner ON public.ai_persona_messages;
CREATE POLICY ai_persona_messages_owner ON public.ai_persona_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ai_persona_sessions s
     WHERE s.id = ai_persona_messages.session_id
       AND s.user_id = auth.uid()
  ));

-- INSERT/UPDATE/DELETE solo via SECURITY DEFINER RPC (no direct mutations)

-- SuperAdmin: SELECT all (per supporto, auditato)
DROP POLICY IF EXISTS ai_persona_messages_admin ON public.ai_persona_messages;
CREATE POLICY ai_persona_messages_admin ON public.ai_persona_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.ai_persona_messages IS
  'Messaggi chat con link al ledger. Insert solo via RPC SECURITY DEFINER.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) ai_action_proposals — bozze azioni proposte dall'AI da confermare (🟡)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_action_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES public.ai_persona_sessions(id) ON DELETE CASCADE,
  message_id      uuid REFERENCES public.ai_persona_messages(id) ON DELETE SET NULL,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_key     text NOT NULL,
  /** Tipo azione: preventivo_genera, email_compose, fattura_emetti, ... */
  action_type     text NOT NULL,
  /** Descrizione human-readable (one-liner per UI). */
  summary         text NOT NULL,
  /** Payload pronto da applicare (JSON con i campi necessari). */
  payload         jsonb NOT NULL,
  /** Stato: pending | confirmed | rejected | expired | applied */
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'applied', 'failed')),
  /** Livello rischio: yellow | red (Fase 3 può estendere). */
  risk_level      text NOT NULL DEFAULT 'yellow' CHECK (risk_level IN ('yellow', 'red')),
  /** TTL: dopo expires_at viene auto-marked 'expired'. */
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  /** Chi ha confermato/rifiutato. */
  resolved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  resolution_note text,
  /** Risultato applicazione (se status=applied/failed). */
  applied_result  jsonb,
  applied_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_user_pending
  ON public.ai_action_proposals(user_id, expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_company
  ON public.ai_action_proposals(company_id, created_at DESC);

ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

-- L'utente vede le proprie proposte
DROP POLICY IF EXISTS ai_action_proposals_owner ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_owner ON public.ai_action_proposals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- SuperAdmin: full access
DROP POLICY IF EXISTS ai_action_proposals_admin ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_admin ON public.ai_action_proposals FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Owner azienda: può vedere proposte degli utenti della propria azienda (audit)
DROP POLICY IF EXISTS ai_action_proposals_company_owner ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_company_owner ON public.ai_action_proposals FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

COMMENT ON TABLE public.ai_action_proposals IS
  'Bozze azioni AI da confermare. TTL 24h, audit immutabile post-resolution.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5) ai_rbac_violations — tentativi accesso non autorizzato + alert owner
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_rbac_violations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Persona che l'utente ha tentato di usare. */
  attempted_persona_key text NOT NULL,
  /** Ruolo dell'utente al momento del tentativo. */
  user_role       text,
  /** Primi 200 char della query/messaggio (audit). */
  attempted_message text,
  /** Reason del rifiuto: not_in_allowed_roles | explicit_deny | persona_disabled */
  reason          text NOT NULL,
  /** Owner notificato? (default true, processo asincrono). */
  notified_owner  boolean NOT NULL DEFAULT false,
  notified_at     timestamptz,
  /** IP / user agent (best-effort, audit). */
  client_ip       text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rbac_violations_company_recent
  ON public.ai_rbac_violations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_rbac_violations_pending_notify
  ON public.ai_rbac_violations(created_at) WHERE notified_owner = false;

ALTER TABLE public.ai_rbac_violations ENABLE ROW LEVEL SECURITY;

-- SuperAdmin: full
DROP POLICY IF EXISTS ai_rbac_violations_admin ON public.ai_rbac_violations;
CREATE POLICY ai_rbac_violations_admin ON public.ai_rbac_violations FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Owner azienda: vede le violazioni della propria azienda (deterrente psicologico)
DROP POLICY IF EXISTS ai_rbac_violations_company_owner ON public.ai_rbac_violations;
CREATE POLICY ai_rbac_violations_company_owner ON public.ai_rbac_violations FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

COMMENT ON TABLE public.ai_rbac_violations IS
  'Log tentativi accesso non autorizzato. Owner azienda riceve notifica + vede storia.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC: can_user_use_persona — check RBAC consolidato
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_user_use_persona(
  p_user_id     uuid,
  p_persona_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_persona  record;
  v_user_roles text[];
  v_company_id uuid;
  v_explicit_perm record;
BEGIN
  -- 1) Carica persona
  SELECT persona_key, allowed_roles, enabled, is_system
    INTO v_persona
    FROM public.ai_personas
   WHERE persona_key = p_persona_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'persona_not_found');
  END IF;

  IF NOT v_persona.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'persona_disabled');
  END IF;

  IF v_persona.is_system THEN
    -- Solo super_admin può chiamare personas di sistema
    IF public.has_role(p_user_id, 'super_admin'::public.app_role) THEN
      RETURN jsonb_build_object('allowed', true, 'reason', 'system_persona_super_admin');
    END IF;
    RETURN jsonb_build_object('allowed', false, 'reason', 'persona_is_system');
  END IF;

  -- 2) Estrai ruoli applicativi dell'utente
  SELECT array_agg(DISTINCT role::text), MAX(company_id)
    INTO v_user_roles, v_company_id
    FROM public.user_roles
   WHERE user_id = p_user_id;

  -- 3) Check override esplicito (DENY ha precedenza)
  SELECT * INTO v_explicit_perm
    FROM public.ai_persona_permissions
   WHERE persona_key = p_persona_key
     AND (company_id IS NULL OR company_id = v_company_id)
     AND (
       (user_id = p_user_id) OR
       (user_id IS NULL AND app_role = ANY (v_user_roles))
     )
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY allowed ASC, user_id NULLS LAST  -- DENY prima, poi user-specific
   LIMIT 1;

  IF FOUND THEN
    IF NOT v_explicit_perm.allowed THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'explicit_deny',
                                'override_id', v_explicit_perm.id);
    END IF;
    RETURN jsonb_build_object('allowed', true, 'reason', 'explicit_allow',
                              'override_id', v_explicit_perm.id);
  END IF;

  -- 4) Default: check allowed_roles della persona
  IF v_user_roles IS NULL OR array_length(v_user_roles, 1) IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_roles');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_persona.allowed_roles) ar
    WHERE ar.value = ANY (v_user_roles)
  ) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'role_match');
  END IF;

  -- super_admin bypass globale
  IF 'super_admin' = ANY (v_user_roles) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'super_admin_bypass');
  END IF;

  RETURN jsonb_build_object('allowed', false, 'reason', 'not_in_allowed_roles',
                            'user_roles', to_jsonb(v_user_roles));
END;
$$;

REVOKE ALL ON FUNCTION public.can_user_use_persona(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_user_use_persona(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_user_use_persona IS
  'Check RBAC consolidato: persona enabled + override esplicito + allowed_roles. Ritorna {allowed, reason}.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: log_rbac_violation
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_rbac_violation(
  p_company_id          uuid,
  p_user_id             uuid,
  p_attempted_persona   text,
  p_user_role           text,
  p_attempted_message   text,
  p_reason              text,
  p_client_ip           text DEFAULT NULL,
  p_user_agent          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ai_rbac_violations (
    company_id, user_id, attempted_persona_key, user_role,
    attempted_message, reason, client_ip, user_agent
  ) VALUES (
    p_company_id, p_user_id, p_attempted_persona, p_user_role,
    LEFT(p_attempted_message, 200), p_reason, p_client_ip, p_user_agent
  )
  RETURNING id INTO v_id;

  -- TODO: trigger notifica push/email all'owner via cron worker (Fase 3)
  -- Per ora la riga è disponibile in dashboard owner via RLS.

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_rbac_violation(uuid, uuid, text, text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_rbac_violation(uuid, uuid, text, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.log_rbac_violation IS
  'Logga tentativo accesso non autorizzato + (futuro) notifica owner.';

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RPC: create_persona_session — crea nuova sessione
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_persona_session(
  p_persona_key text,
  p_title       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_session_id uuid;
  v_check      jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna azienda associata' USING ERRCODE = '42501';
  END IF;

  -- RBAC check
  v_check := public.can_user_use_persona(v_user_id, p_persona_key);
  IF NOT (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'RBAC: % per persona %', v_check->>'reason', p_persona_key
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_persona_sessions (user_id, company_id, persona_key, title)
  VALUES (v_user_id, v_company_id, p_persona_key, COALESCE(p_title, 'Nuova conversazione'))
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_persona_session(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_persona_session(text, text) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) RPC: record_persona_message — append message + update session counters
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_persona_message(
  p_session_id      uuid,
  p_role            text,
  p_content         text,
  p_tool_calls      jsonb   DEFAULT NULL,
  p_tool_call_id    text    DEFAULT NULL,
  p_ledger_id       uuid    DEFAULT NULL,
  p_tokens_in       int     DEFAULT NULL,
  p_tokens_out      int     DEFAULT NULL,
  p_cost_billed_eur numeric DEFAULT NULL,
  p_model_used      text    DEFAULT NULL,
  p_metadata        jsonb   DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_id uuid;
BEGIN
  INSERT INTO public.ai_persona_messages (
    session_id, role, content, tool_calls, tool_call_id,
    ledger_id, tokens_in, tokens_out, cost_billed_eur, model_used, metadata
  ) VALUES (
    p_session_id, p_role, p_content, p_tool_calls, p_tool_call_id,
    p_ledger_id, p_tokens_in, p_tokens_out, p_cost_billed_eur, p_model_used, p_metadata
  )
  RETURNING id INTO v_msg_id;

  -- Aggiorna counters sessione (atomico)
  UPDATE public.ai_persona_sessions
     SET message_count = message_count + 1,
         total_cost_billed_eur = total_cost_billed_eur + COALESCE(p_cost_billed_eur, 0),
         total_tokens_in  = total_tokens_in  + COALESCE(p_tokens_in,  0),
         total_tokens_out = total_tokens_out + COALESCE(p_tokens_out, 0),
         last_message_at = now(),
         -- Auto-titolo dal primo user message se ancora "Nuova conversazione"
         title = CASE
           WHEN title = 'Nuova conversazione' AND p_role = 'user'
           THEN LEFT(p_content, 60)
           ELSE title
         END
   WHERE id = p_session_id;

  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_persona_message(uuid, text, text, jsonb, text, uuid, int, int, numeric, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_persona_message(uuid, text, text, jsonb, text, uuid, int, int, numeric, text, jsonb) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 10) Cron helper: expire_old_action_proposals (mark > TTL come 'expired')
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_old_action_proposals()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.ai_action_proposals
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_old_action_proposals() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_action_proposals() TO service_role;
