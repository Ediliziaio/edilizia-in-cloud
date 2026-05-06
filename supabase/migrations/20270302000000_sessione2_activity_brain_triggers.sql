-- ════════════════════════════════════════════════════════════════════════════
-- SESSIONE 2 — MP-06 Activity Brain: triggers + edge ingest hook + tool RPC
-- ════════════════════════════════════════════════════════════════════════════
-- Estende la fondazione MP-06 (20270201000400) aggiungendo:
--   • Trigger AFTER INSERT/UPDATE/DELETE per: quotes, marketing_contacts,
--     employees, listino_prezzi (oltre a `orders` già esistente).
--   • Funzione search_company_activity per il tool query_activity di Silvio:
--     full-text + filtri (categoria, tipologia evento, data, importanza, target).
--
-- Tutto additive + idempotente. Non rompe la pipeline log_activity esistente
-- né la company_activity_summary table.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Trigger su quotes ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_activity_on_quotes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
BEGIN
  v_target_label := coalesce(
    nullif(NEW.quote_number, ''),
    nullif(OLD.quote_number, ''),
    coalesce(NEW.id, OLD.id)::text
  );
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuovo preventivo %s creato (cliente: %s, totale €%s)',
      v_target_label,
      coalesce(NEW.client_name, NEW.client_company, '—'),
      coalesce(NEW.total::text, '0'));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'quote.created',
      v_actor, 'quotes', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'normal', '{}'::jsonb, 'trigger:tg_activity_on_quotes'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at', 'pdf_generated_at', 'pdf_storage_path');

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- Importance high: cambio status, oppure variazione total > 1000€
    IF v_changes ? 'status' THEN v_importance := 'high'; END IF;
    IF v_changes ? 'total' THEN
      IF abs(coalesce((v_changes->'total'->>'new')::numeric, 0)
           - coalesce((v_changes->'total'->>'old')::numeric, 0)) > 1000 THEN
        v_importance := 'high';
      END IF;
    END IF;

    v_description := format('Preventivo %s modificato. Campi: %s',
      v_target_label,
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'quote.updated',
      v_actor, 'quotes', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_quotes'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := format('Preventivo %s eliminato', v_target_label);
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'quote.deleted',
      v_actor, 'quotes', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'high', '{}'::jsonb, 'trigger:tg_activity_on_quotes'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tg_activity_on_quotes failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_quotes ON public.quotes;
CREATE TRIGGER trg_activity_quotes
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_on_quotes();

-- ─── 2) Trigger su marketing_contacts (CRM clienti) ────────────────────────
CREATE OR REPLACE FUNCTION public.tg_activity_on_contacts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
BEGIN
  v_target_label := trim(coalesce(NEW.first_name, OLD.first_name, '') || ' ' ||
                          coalesce(NEW.last_name, OLD.last_name, ''));
  IF v_target_label = '' THEN
    v_target_label := coalesce(NEW.id, OLD.id)::text;
  END IF;
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuovo contatto CRM: %s', v_target_label);
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'contact.created',
      v_actor, 'marketing_contacts', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'normal', '{}'::jsonb, 'trigger:tg_activity_on_contacts'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at', 'last_seen_at', 'last_contact_at');

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    IF v_changes ? 'lead_status' OR v_changes ? 'tags' THEN v_importance := 'high'; END IF;

    v_description := format('Contatto %s aggiornato. Campi: %s',
      v_target_label,
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'contact.updated',
      v_actor, 'marketing_contacts', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_contacts'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := format('Contatto %s eliminato', v_target_label);
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'contact.deleted',
      v_actor, 'marketing_contacts', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'high', '{}'::jsonb, 'trigger:tg_activity_on_contacts'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tg_activity_on_contacts failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_marketing_contacts ON public.marketing_contacts;
CREATE TRIGGER trg_activity_marketing_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_on_contacts();

-- ─── 3) Trigger su employees ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_activity_on_employees() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
BEGIN
  v_target_label := trim(coalesce(NEW.first_name, OLD.first_name, '') || ' ' ||
                          coalesce(NEW.last_name, OLD.last_name, ''));
  IF v_target_label = '' THEN
    v_target_label := coalesce(NEW.id, OLD.id)::text;
  END IF;
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuovo dipendente assunto: %s', v_target_label);
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'employee.hired',
      v_actor, 'employees', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'high', '{}'::jsonb, 'trigger:tg_activity_on_employees'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at');

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- HR sensibile: importance alto su mansione/contratto/stipendio/status
    IF v_changes ?| array['role', 'job_title', 'mansione', 'contract_type', 'salary',
                          'monthly_salary', 'gross_annual_salary', 'status', 'termination_date',
                          'hire_date', 'ccnl', 'level'] THEN
      v_importance := 'high';
    END IF;

    v_description := format('Dipendente %s aggiornato. Campi: %s',
      v_target_label,
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'employee.updated',
      v_actor, 'employees', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_employees'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := format('Dipendente %s rimosso', v_target_label);
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'employee.terminated',
      v_actor, 'employees', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'critical', '{}'::jsonb, 'trigger:tg_activity_on_employees'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tg_activity_on_employees failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_employees ON public.employees;
CREATE TRIGGER trg_activity_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_on_employees();

-- ─── 4) Trigger su listino_prezzi ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_activity_on_listino() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
BEGIN
  v_target_label := coalesce(NEW.id, OLD.id)::text;
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuova voce di listino aggiunta (€%s)',
      coalesce(NEW.prezzo_base::text, '0'));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'listino.created',
      v_actor, 'listino_prezzi', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'normal', '{}'::jsonb, 'trigger:tg_activity_on_listino'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at');

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- Cambio prezzo > 10% → importance high
    IF v_changes ? 'prezzo_base' THEN
      DECLARE old_p numeric := coalesce((v_changes->'prezzo_base'->>'old')::numeric, 0);
              new_p numeric := coalesce((v_changes->'prezzo_base'->>'new')::numeric, 0);
      BEGIN
        IF old_p > 0 AND abs(new_p - old_p) / old_p > 0.1 THEN
          v_importance := 'high';
        END IF;
      END;
    END IF;

    v_description := format('Voce listino aggiornata. Campi: %s',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'listino.updated',
      v_actor, 'listino_prezzi', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_listino'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := 'Voce di listino rimossa';
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'listino.deleted',
      v_actor, 'listino_prezzi', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'normal', '{}'::jsonb, 'trigger:tg_activity_on_listino'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tg_activity_on_listino failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_listino_prezzi ON public.listino_prezzi;
CREATE TRIGGER trg_activity_listino_prezzi
  AFTER INSERT OR UPDATE OR DELETE ON public.listino_prezzi
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_on_listino();

-- ─── 5) RPC search_company_activity per tool query_activity ────────────────
-- Filtri applicabili:
--   - p_company_id (obbligatorio)
--   - p_query_text (ILIKE su description + target_label, opzionale)
--   - p_categories text[]   (es. ['modification','decision'])
--   - p_event_types text[]  (es. ['quote.created','employee.hired'])
--   - p_target_table text   (es. 'orders')
--   - p_min_importance text (low|normal|high|critical)
--   - p_actor_user_id uuid
--   - p_from / p_to timestamptz
--   - p_limit  int (default 30, max 100)
CREATE OR REPLACE FUNCTION public.search_company_activity(
  p_company_id uuid,
  p_query_text text DEFAULT NULL,
  p_categories text[] DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_target_table text DEFAULT NULL,
  p_min_importance text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 30
) RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  category text,
  event_type text,
  importance text,
  actor_user_id uuid,
  actor_name text,
  target_table text,
  target_id text,
  target_label text,
  description text,
  changes jsonb,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_rank int;
BEGIN
  -- map importance text → rank for >=
  v_min_rank := CASE p_min_importance
    WHEN 'critical' THEN 4
    WHEN 'high'     THEN 3
    WHEN 'normal'   THEN 2
    WHEN 'low'      THEN 1
    ELSE 0 END;

  RETURN QUERY
  SELECT
    a.id, a.created_at, a.category, a.event_type, a.importance,
    a.actor_user_id, a.actor_name, a.target_table, a.target_id, a.target_label,
    a.description, a.changes, a.metadata
  FROM public.company_activity_log a
  WHERE a.company_id = p_company_id
    AND (p_categories IS NULL OR a.category = ANY (p_categories))
    AND (p_event_types IS NULL OR a.event_type = ANY (p_event_types))
    AND (p_target_table IS NULL OR a.target_table = p_target_table)
    AND (p_actor_user_id IS NULL OR a.actor_user_id = p_actor_user_id)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to)
    AND (
      v_min_rank = 0 OR
      CASE a.importance
        WHEN 'critical' THEN 4
        WHEN 'high'     THEN 3
        WHEN 'normal'   THEN 2
        WHEN 'low'      THEN 1
        ELSE 0 END >= v_min_rank
    )
    AND (
      p_query_text IS NULL OR p_query_text = '' OR
      a.description ILIKE '%' || p_query_text || '%' OR
      a.target_label ILIKE '%' || p_query_text || '%' OR
      a.event_type ILIKE '%' || p_query_text || '%'
    )
  ORDER BY a.created_at DESC
  LIMIT least(coalesce(p_limit, 30), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_company_activity(
  uuid, text, text[], text[], text, text, uuid, timestamptz, timestamptz, int
) TO service_role, authenticated;

COMMENT ON FUNCTION public.search_company_activity IS
  'Sessione 2 / MP-06: ricerca filtrata su company_activity_log. Usata dal tool query_activity di Silvio.';
