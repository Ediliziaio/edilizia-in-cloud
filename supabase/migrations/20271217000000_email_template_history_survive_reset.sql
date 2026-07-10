-- ============================================================================
-- platform_email_template_history — la cronologia sopravvive al reset-default
-- ============================================================================
-- BUG: la FK template_id era ON DELETE CASCADE. "Ripristina default" nella UI
-- (EmailTemplatesPanel) fa DELETE della riga template → la cascade eliminava
-- TUTTA la cronologia revisioni, incluso lo snapshot change_type='delete'
-- appena inserito dal trigger BEFORE DELETE. Rollback impossibile.
--
-- FIX (3 pezzi):
--   1. FK → ON DELETE SET NULL (template_id diventa nullable): le revisioni
--      restano, orfane solo del parent. La chiave logica per ritrovarle è
--      (template_key, role_variant), già indicizzata (…_history_key_idx).
--   2. Trigger AFTER INSERT su platform_email_templates: quando una coppia
--      (template_key, role_variant) viene ri-personalizzata dopo un reset,
--      le revisioni orfane vengono ricollegate al nuovo id. Così anche il
--      frontend già deployato (che filtra la history per template_id) torna
--      a vedere la cronologia completa dopo il primo salvataggio.
--   3. RPC restore_email_template_from_history: risolve il target per chiave
--      logica invece che per template_id (che dopo un reset punta a una riga
--      inesistente) e, se il template è attualmente al default, RICREA la
--      personalizzazione dallo snapshot. Ritorna una riga singola (non SETOF:
--      il frontend si aspetta un oggetto, non un array).
--
-- Il trigger BEFORE DELETE di snapshot NON cambia: inserisce la riga history
-- con template_id = OLD.id mentre il parent esiste ancora; l'azione
-- referenziale SET NULL scatta subito dopo, al delete effettivo, e azzera
-- template_id anche sulla riga appena inserita. È il comportamento voluto.
-- ============================================================================

-- ── 1. FK: CASCADE → SET NULL ───────────────────────────────────────────────
ALTER TABLE public.platform_email_template_history
  ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE public.platform_email_template_history
  DROP CONSTRAINT IF EXISTS platform_email_template_history_template_id_fkey;

ALTER TABLE public.platform_email_template_history
  ADD CONSTRAINT platform_email_template_history_template_id_fkey
  FOREIGN KEY (template_id)
  REFERENCES public.platform_email_templates(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_email_template_history.template_id IS
  'Riferimento al template corrente. NULL = il template è stato resettato al default dopo questa revisione (la riga resta consultabile via template_key + role_variant).';

COMMENT ON TABLE public.platform_email_template_history IS
  'Append-only history delle modifiche a platform_email_templates. Snapshot generato automaticamente dai trigger snapshot_update/delete. Sopravvive al reset-default del template (FK SET NULL, lookup per chiave logica).';

-- ── 2. Re-link delle revisioni orfane alla ri-personalizzazione ─────────────
CREATE OR REPLACE FUNCTION public.platform_email_templates_relink_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.platform_email_template_history
  SET template_id = NEW.id
  WHERE template_id IS NULL
    AND template_key = NEW.template_key
    AND role_variant IS NOT DISTINCT FROM NEW.role_variant;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_email_templates_relink_history
  ON public.platform_email_templates;
CREATE TRIGGER platform_email_templates_relink_history
  AFTER INSERT ON public.platform_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_email_templates_relink_history();

-- ── 3. RPC restore: chiave logica + revive dopo reset ───────────────────────
-- DROP obbligatorio: il return type cambia da SETOF a riga singola.
DROP FUNCTION IF EXISTS public.restore_email_template_from_history(UUID);

CREATE FUNCTION public.restore_email_template_from_history(p_history_id UUID)
RETURNS public.platform_email_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_hist RECORD;
  v_result public.platform_email_templates;
BEGIN
  IF NOT public.has_role(v_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo super_admin può ripristinare template';
  END IF;

  SELECT * INTO v_hist
  FROM public.platform_email_template_history
  WHERE id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revisione % non trovata', p_history_id;
  END IF;

  -- Target per chiave logica: dopo un reset-default il template_id dello
  -- snapshot punta a una riga cancellata, ma la coppia (key, variant) è
  -- stabile e identifica sempre la personalizzazione corrente.
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
  WHERE template_key = v_hist.template_key
    AND role_variant IS NOT DISTINCT FROM v_hist.role_variant
  RETURNING * INTO v_result;

  IF FOUND THEN
    -- Il trigger BEFORE UPDATE ha appena archiviato la versione soppiantata
    -- come 'update' (changed_at = now() è stabile nella transazione):
    -- riclassificala come 'restore' per tracciabilità.
    UPDATE public.platform_email_template_history
    SET change_type = 'restore'
    WHERE template_id = v_result.id
      AND change_type = 'update'
      AND changed_at = now();
    RETURN v_result;
  END IF;

  -- Nessuna personalizzazione attiva (template al default): ricrea la riga
  -- dallo snapshot. Il trigger relink_history ricollega automaticamente le
  -- revisioni orfane al nuovo id.
  INSERT INTO public.platform_email_templates (
    template_key, role_variant, subject, html_body, text_body,
    design_json, enabled, version, notes, created_by, updated_by
  )
  VALUES (
    v_hist.template_key, v_hist.role_variant, v_hist.subject, v_hist.html_body,
    v_hist.text_body, v_hist.design_json, v_hist.enabled, v_hist.version,
    v_hist.notes, v_caller, v_caller
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_email_template_from_history(UUID) TO authenticated;

COMMENT ON FUNCTION public.restore_email_template_from_history(UUID) IS
  'Ripristina una revisione della history come versione corrente del template (lookup per template_key + role_variant; ricrea la riga se il template era stato resettato al default). Richiede super_admin.';
