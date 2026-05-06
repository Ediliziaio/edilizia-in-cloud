-- ════════════════════════════════════════════════════════════════════════════
-- MP-06 — Activity Brain (modalità A: ADDITIVE su company_activity_log esistente)
-- ════════════════════════════════════════════════════════════════════════════
-- Decisione: la tabella public.company_activity_log esiste già da migration
-- 20260217204809_512345d8-... con schema minimale (id, company_id, user_id,
-- action, target_type, target_id, details, created_at).
--
-- Estendiamo additive senza rompere compatibilità:
--   - action  → resta come legacy. Nuove righe usano anche event_type.
--   - target_type/target_id: ok, restano. target_table = alias funzionale di target_type.
--   - details: resta come catch-all. Nuove righe popolano anche metadata.
--
-- Pipeline embedding (ai-activity-ingest) e tool query_activity:
-- → demandate a sessione successiva.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Estensione schema additive
ALTER TABLE public.company_activity_log
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IS NULL OR category IN (
      'modification', 'decision', 'alert', 'auth_event',
      'integration_event', 'system_event', 'chat_message'
    )),
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS target_table text,
  ADD COLUMN IF NOT EXISTS target_label text,
  ADD COLUMN IF NOT EXISTS changes jsonb,
  ADD COLUMN IF NOT EXISTS before_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS after_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS importance text DEFAULT 'normal'
    CHECK (importance IS NULL OR importance IN ('low', 'normal', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brain_doc_id uuid REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_function text,
  ADD COLUMN IF NOT EXISTS trace_id text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- Backfill: per le righe legacy, copia action → event_type, target_type → target_table
UPDATE public.company_activity_log
SET event_type = COALESCE(event_type, action),
    target_table = COALESCE(target_table, target_type)
WHERE event_type IS NULL OR target_table IS NULL;

-- 2) Indici aggiuntivi per query MP-06 senza toccare quelli esistenti
CREATE INDEX IF NOT EXISTS idx_activity_log_category
  ON public.company_activity_log (company_id, category, created_at DESC)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_actor_user
  ON public.company_activity_log (company_id, actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_target_table
  ON public.company_activity_log (company_id, target_table, target_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_importance_high
  ON public.company_activity_log (company_id, importance, created_at DESC)
  WHERE importance IN ('high', 'critical');

CREATE INDEX IF NOT EXISTS idx_activity_log_event_type
  ON public.company_activity_log (company_id, event_type, created_at DESC)
  WHERE event_type IS NOT NULL;

-- 3) RPC unificata di logging
CREATE OR REPLACE FUNCTION public.log_activity(
  p_company_id uuid,
  p_category text,
  p_event_type text,
  p_actor_user_id uuid,
  p_target_table text,
  p_target_id text,
  p_target_label text,
  p_description text,
  p_changes jsonb DEFAULT NULL,
  p_before_snapshot jsonb DEFAULT NULL,
  p_after_snapshot jsonb DEFAULT NULL,
  p_importance text DEFAULT 'normal',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_function text DEFAULT NULL,
  p_trace_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor_name text;
  v_actor_role text;
BEGIN
  -- Lookup actor info (denormalize per query veloci)
  IF p_actor_user_id IS NOT NULL THEN
    SELECT
      coalesce(
        nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
        pr.email,
        u.email,
        '?'
      ),
      (SELECT role::text FROM public.user_roles
       WHERE user_id = p_actor_user_id
       ORDER BY array_position(
         ARRAY['super_admin','company_admin','company_staff','salesperson','employee','worker','subcontractor'],
         role::text
       )
       LIMIT 1)
    INTO v_actor_name, v_actor_role
    FROM auth.users u
    LEFT JOIN public.profiles pr ON pr.id = u.id
    WHERE u.id = p_actor_user_id;
  END IF;

  INSERT INTO public.company_activity_log (
    company_id,
    -- Legacy columns
    user_id, action, target_type, target_id, details,
    -- MP-06 new columns
    category, event_type,
    actor_user_id, actor_name, actor_role,
    target_table, target_label,
    changes, before_snapshot, after_snapshot,
    description, importance, metadata,
    source_function, trace_id
  )
  VALUES (
    p_company_id,
    -- Legacy: backfill di compatibilità
    coalesce(p_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_event_type,
    p_target_table,
    p_target_id,
    coalesce(p_metadata, '{}'::jsonb),
    -- MP-06
    p_category, p_event_type,
    p_actor_user_id, v_actor_name, v_actor_role,
    p_target_table, p_target_label,
    p_changes, p_before_snapshot, p_after_snapshot,
    p_description, coalesce(p_importance, 'normal'), coalesce(p_metadata, '{}'::jsonb),
    p_source_function, p_trace_id
  )
  RETURNING id INTO v_id;

  -- Notifica per ingest async (worker successivo)
  PERFORM pg_notify('activity_log_new', v_id::text);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity(uuid, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, text, jsonb, text, text)
  TO service_role, authenticated;

COMMENT ON FUNCTION public.log_activity IS
  'MP-06: logging unificato attività azienda. Estende company_activity_log additive.';

-- 4) Trigger di esempio su orders (modificabile per replicare a quotes/customers/...)
CREATE OR REPLACE FUNCTION public.tg_activity_on_orders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
BEGIN
  -- Best-effort: NEW.id sempre, gli altri campi solo se esistono nello schema corrente
  v_target_label := coalesce(NEW.id::text, OLD.id::text);
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuova commessa creata: %s', v_target_label);
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'order.created',
      v_actor, 'orders', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'normal', '{}'::jsonb, 'trigger:tg_activity_on_orders'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Diff dinamico via to_jsonb (catturiamo solo campi che cambiano realmente)
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at');  -- rumore

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- Importance: high se total_amount cambia di più di 5000 (se la colonna esiste)
    IF (NEW->>'total_amount') IS NOT NULL AND (OLD->>'total_amount') IS NOT NULL THEN
      IF abs((NEW->>'total_amount')::numeric - (OLD->>'total_amount')::numeric) > 5000 THEN
        v_importance := 'high';
      END IF;
    END IF;

    v_description := format('Commessa %s modificata. Campi: %s',
      v_target_label,
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'order.updated',
      v_actor, 'orders', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_orders'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := format('Commessa %s eliminata', v_target_label);
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'order.deleted',
      v_actor, 'orders', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'high', '{}'::jsonb, 'trigger:tg_activity_on_orders'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Mai bloccare la transazione utente per un fail di logging
  RAISE NOTICE 'tg_activity_on_orders failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_orders ON public.orders;
CREATE TRIGGER trg_activity_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_on_orders();

-- 5) Tabella company_activity_summary per compaction settimanale
CREATE TABLE IF NOT EXISTS public.company_activity_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  scope text NOT NULL CHECK (scope IN ('day', 'week', 'month')),
  summary text NOT NULL,
  highlights jsonb,
  stats jsonb,
  brain_doc_id uuid REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_start, scope)
);

ALTER TABLE public.company_activity_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_summary_company_read ON public.company_activity_summary
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.company_activity_summary TO authenticated;
GRANT INSERT, UPDATE ON public.company_activity_summary TO service_role;

COMMENT ON TABLE public.company_activity_summary IS
  'MP-06: riassunti compatti settimanali/mensili dell''attività aziendale, popolata da edge function ai-activity-summarize-weekly (sessione successiva).';
