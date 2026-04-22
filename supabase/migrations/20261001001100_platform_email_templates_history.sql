-- ============================================================================
-- platform_email_template_history — versionamento storicizzato (Fase 2)
-- ============================================================================
-- Ogni save/update su platform_email_templates genera una riga qui con lo
-- snapshot del contenuto PRECEDENTE. Permette al super_admin di:
--   - vedere la cronologia modifiche
--   - ripristinare una versione specifica (UI: "Ripristina questa versione")
--
-- Tabella append-only (no UPDATE/DELETE da client). La pulizia automatica
-- (es. cap a 50 revisioni per template) è nello scope Fase 3 se serve.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_email_template_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Riferimento al template corrente. Se il template master viene cancellato
  -- la history segue (cascade) — mantenerla senza parent sarebbe inutile.
  template_id UUID NOT NULL
    REFERENCES public.platform_email_templates(id) ON DELETE CASCADE,

  -- Snapshot campi chiave nel momento del cambio
  template_key TEXT NOT NULL,
  role_variant TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  enabled BOOLEAN NOT NULL,
  version INTEGER NOT NULL,
  notes TEXT,

  -- Chi/quando ha generato questa revisione
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Tipo di evento: "update" (save normale), "restore" (restore da history),
  -- "delete" (soft-snapshot prima del delete del template corrente).
  change_type TEXT NOT NULL DEFAULT 'update'
    CHECK (change_type IN ('update', 'restore', 'delete'))
);

CREATE INDEX IF NOT EXISTS platform_email_template_history_template_idx
  ON public.platform_email_template_history(template_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS platform_email_template_history_key_idx
  ON public.platform_email_template_history(template_key, role_variant, changed_at DESC);

-- ============================================================================
-- Trigger: snapshot PRE-update su platform_email_templates
-- ============================================================================
-- Salva in history il valore OLD prima del cambio. Così la history contiene
-- l'elenco delle versioni "passate", e la tabella principale ha la corrente.
CREATE OR REPLACE FUNCTION public.platform_email_templates_snapshot_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Snapshot solo se il contenuto è davvero cambiato (evita rumore)
  IF TG_OP = 'UPDATE' AND (
    NEW.subject IS DISTINCT FROM OLD.subject OR
    NEW.html_body IS DISTINCT FROM OLD.html_body OR
    NEW.text_body IS DISTINCT FROM OLD.text_body OR
    NEW.enabled IS DISTINCT FROM OLD.enabled
  ) THEN
    INSERT INTO public.platform_email_template_history (
      template_id, template_key, role_variant,
      subject, html_body, text_body, enabled, version, notes,
      changed_by, change_type
    )
    VALUES (
      OLD.id, OLD.template_key, OLD.role_variant,
      OLD.subject, OLD.html_body, OLD.text_body, OLD.enabled, OLD.version, OLD.notes,
      auth.uid(), 'update'
    );
  ELSIF TG_OP = 'DELETE' THEN
    -- Al delete (reset-to-default) salviamo l'ultima versione
    INSERT INTO public.platform_email_template_history (
      template_id, template_key, role_variant,
      subject, html_body, text_body, enabled, version, notes,
      changed_by, change_type
    )
    VALUES (
      OLD.id, OLD.template_key, OLD.role_variant,
      OLD.subject, OLD.html_body, OLD.text_body, OLD.enabled, OLD.version, OLD.notes,
      auth.uid(), 'delete'
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS platform_email_templates_snapshot_update
  ON public.platform_email_templates;
CREATE TRIGGER platform_email_templates_snapshot_update
  BEFORE UPDATE ON public.platform_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_email_templates_snapshot_history();

DROP TRIGGER IF EXISTS platform_email_templates_snapshot_delete
  ON public.platform_email_templates;
CREATE TRIGGER platform_email_templates_snapshot_delete
  BEFORE DELETE ON public.platform_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_email_templates_snapshot_history();

-- ============================================================================
-- RLS — solo super_admin
-- ============================================================================
ALTER TABLE public.platform_email_template_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_email_template_history_read
  ON public.platform_email_template_history;
CREATE POLICY platform_email_template_history_read
  ON public.platform_email_template_history
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Nessuna policy INSERT/UPDATE/DELETE: la history è append-only via trigger.
-- Il service_role (Edge Functions) può ignorare RLS se serve future pulizia.

-- ============================================================================
-- RPC: restore da una history row
-- ============================================================================
-- Copia i campi di una history row nel template corrente. Questo triggera
-- un nuovo snapshot in history della versione che stiamo soppiantando.
-- Argomento: id della riga in history.
CREATE OR REPLACE FUNCTION public.restore_email_template_from_history(
  p_history_id UUID
)
RETURNS public.platform_email_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_history RECORD;
  v_updated public.platform_email_templates;
BEGIN
  -- 1. Auth check (SECURITY DEFINER bypassa RLS, quindi controllo esplicito)
  IF NOT public.has_role(v_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  -- 2. Carica la history row
  SELECT * INTO v_history
  FROM public.platform_email_template_history
  WHERE id = p_history_id;

  IF v_history IS NULL THEN
    RAISE EXCEPTION 'History row not found: %', p_history_id;
  END IF;

  -- 3. Update del template corrente con lo snapshot.
  -- Il trigger snapshot_update creerà automaticamente una riga history per
  -- la versione corrente che stiamo soppiantando.
  UPDATE public.platform_email_templates
  SET
    subject = v_history.subject,
    html_body = v_history.html_body,
    text_body = v_history.text_body,
    enabled = v_history.enabled,
    notes = v_history.notes,
    updated_by = v_caller
  WHERE id = v_history.template_id
  RETURNING * INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'Template parent non esiste più: %', v_history.template_id;
  END IF;

  -- 4. Marca l'ultima history row come 'restore' (non 'update') per UX clarity.
  -- La riga è già stata creata dal trigger, aggiorniamo il change_type.
  UPDATE public.platform_email_template_history
  SET change_type = 'restore'
  WHERE template_id = v_updated.id
    AND id = (
      SELECT id FROM public.platform_email_template_history
      WHERE template_id = v_updated.id
      ORDER BY changed_at DESC
      LIMIT 1
    );

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_email_template_from_history(UUID) TO authenticated;

COMMENT ON TABLE public.platform_email_template_history IS
  'Append-only history delle modifiche a platform_email_templates. Snapshot generato automaticamente dal trigger snapshot_update/delete.';

COMMENT ON FUNCTION public.restore_email_template_from_history(UUID) IS
  'Ripristina il contenuto di una history row come versione corrente del template. Richiede super_admin.';
