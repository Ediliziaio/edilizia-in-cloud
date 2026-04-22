-- ============================================================================
-- platform_email_templates — add design_json column for visual builder
-- ============================================================================
-- Aggiunge la colonna `design_json` per salvare il design JSON dell'editor
-- drag&drop (Unlayer / react-email-editor).
--
-- Comportamento:
--   - Se `design_json` è NOT NULL → l'editor apre in modalità "Visuale"
--     (builder drag&drop) e l'HTML è il risultato dell'export automatico.
--   - Se `design_json` è NULL → l'editor apre in modalità "HTML" raw,
--     mantenendo retrocompatibilità con i template già salvati.
--
-- La history table riceve la stessa colonna e il trigger + RPC restore sono
-- aggiornati per propagare design_json nelle snapshot e nei rollback.
-- ============================================================================

ALTER TABLE public.platform_email_templates
  ADD COLUMN IF NOT EXISTS design_json JSONB;

COMMENT ON COLUMN public.platform_email_templates.design_json IS
  'Design JSON dell''editor visuale (Unlayer). NULL = template solo HTML raw.';

ALTER TABLE public.platform_email_template_history
  ADD COLUMN IF NOT EXISTS design_json JSONB;

COMMENT ON COLUMN public.platform_email_template_history.design_json IS
  'Snapshot del design_json al momento della modifica (per rollback fedele).';

-- ── Aggiorna il trigger di history per includere design_json ─────────────────
-- DROP CASCADE perché i trigger BEFORE UPDATE/DELETE dipendono dalla function,
-- e il return type implicito SETOF della tabella principale è cambiato col
-- nuovo campo. I trigger vengono ricreati più sotto.
DROP FUNCTION IF EXISTS public.platform_email_templates_snapshot_history() CASCADE;

CREATE FUNCTION public.platform_email_templates_snapshot_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Snapshot solo se il contenuto è davvero cambiato (evita rumore).
  -- design_json incluso nel check così il salvataggio del visual editor
  -- genera history anche quando l'HTML export è identico (es. cambia solo
  -- una proprietà di blocco che non produce diff nell'HTML).
  IF TG_OP = 'UPDATE' AND (
    NEW.subject IS DISTINCT FROM OLD.subject OR
    NEW.html_body IS DISTINCT FROM OLD.html_body OR
    NEW.text_body IS DISTINCT FROM OLD.text_body OR
    NEW.design_json IS DISTINCT FROM OLD.design_json OR
    NEW.enabled IS DISTINCT FROM OLD.enabled
  ) THEN
    INSERT INTO public.platform_email_template_history (
      template_id, template_key, role_variant,
      subject, html_body, text_body, design_json, enabled, version, notes,
      changed_by, change_type
    )
    VALUES (
      OLD.id, OLD.template_key, OLD.role_variant,
      OLD.subject, OLD.html_body, OLD.text_body, OLD.design_json, OLD.enabled, OLD.version, OLD.notes,
      auth.uid(), 'update'
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.platform_email_template_history (
      template_id, template_key, role_variant,
      subject, html_body, text_body, design_json, enabled, version, notes,
      changed_by, change_type
    )
    VALUES (
      OLD.id, OLD.template_key, OLD.role_variant,
      OLD.subject, OLD.html_body, OLD.text_body, OLD.design_json, OLD.enabled, OLD.version, OLD.notes,
      auth.uid(), 'delete'
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Ricrea i trigger (il CASCADE sopra li ha droppati)
CREATE TRIGGER platform_email_templates_snapshot_update
  BEFORE UPDATE ON public.platform_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_email_templates_snapshot_history();

CREATE TRIGGER platform_email_templates_snapshot_delete
  BEFORE DELETE ON public.platform_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_email_templates_snapshot_history();

-- ── Aggiorna la RPC restore_email_template_from_history ─────────────────────
-- DROP prima perché RETURNS SETOF platform_email_templates ora include la
-- nuova colonna design_json e CREATE OR REPLACE non accetta cambio di tipo.
DROP FUNCTION IF EXISTS public.restore_email_template_from_history(UUID);

CREATE FUNCTION public.restore_email_template_from_history(p_history_id UUID)
RETURNS SETOF public.platform_email_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hist RECORD;
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  -- Solo super_admin può fare rollback
  SELECT public.has_role(v_caller, 'super_admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo super_admin può ripristinare template';
  END IF;

  SELECT * INTO v_hist
  FROM public.platform_email_template_history
  WHERE id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revisione % non trovata', p_history_id;
  END IF;

  -- Update del template corrente con lo snapshot storico. Il trigger
  -- BEFORE UPDATE salva la versione che stiamo soppiantando come 'update';
  -- subito dopo la riclassifichiamo come 'restore' per tracciabilità.
  UPDATE public.platform_email_templates
  SET
    subject = v_hist.subject,
    html_body = v_hist.html_body,
    text_body = v_hist.text_body,
    design_json = v_hist.design_json,
    enabled = v_hist.enabled,
    notes = v_hist.notes,
    updated_by = v_caller,
    updated_at = now()
  WHERE id = v_hist.template_id;

  UPDATE public.platform_email_template_history
  SET change_type = 'restore'
  WHERE id = (
    SELECT id FROM public.platform_email_template_history
    WHERE template_id = v_hist.template_id
      AND change_type = 'update'
    ORDER BY changed_at DESC
    LIMIT 1
  );

  RETURN QUERY
    SELECT * FROM public.platform_email_templates WHERE id = v_hist.template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_email_template_from_history(UUID) TO authenticated;
