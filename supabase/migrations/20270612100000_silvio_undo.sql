-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-06 (completamento) · UNDO reale delle azioni reversibili
-- ────────────────────────────────────────────────────────────────────────────
-- Finora silvio_audit tracciava reversibile + oggetto_id, ma mancava l'esecuzione
-- vera dell'azione inversa. Qui:
--   1) fix funzione_target di collega_email_entita (era 'sequenza_enroll' per un
--      copia-incolla: il dispatcher cerca 'email_collegamenti' → l'azione 'autonoma'
--      non si eseguiva mai e finiva sempre in coda). Ora coerente col dispatcher.
--   2) silvio_undo(p_audit_id): esegue l'inverso SOLO per azioni dove è sicuro e
--      atomico in DB, con guardia azienda+staff, idempotente (niente doppio undo),
--      e registra una NUOVA voce audit 'annullata' (la tabella è append-only).
-- Nessun effetto su denaro/esterno/irreversibile: quelle non sono mai reversibili.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Fix coerenza dispatcher: collega_email_entita scrive su email_collegamenti
UPDATE public.silvio_azioni
   SET funzione_target = 'email_collegamenti'
 WHERE chiave = 'collega_email_entita' AND funzione_target = 'sequenza_enroll';

-- ── 2) UNDO ─────────────────────────────────────────────────────────────────
-- Ritorna la nuova voce audit 'annullata'. Solleva eccezioni parlanti per la UI.
CREATE OR REPLACE FUNCTION public.silvio_undo(p_audit_id uuid)
RETURNS public.silvio_audit
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.get_effective_company_id();
  a         public.silvio_audit;
  v_inversa text;
  v_new     public.silvio_audit;
  v_deleted int := 0;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RAISE EXCEPTION 'non_autorizzato'; END IF;

  SELECT * INTO a FROM public.silvio_audit WHERE id = p_audit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'voce_inesistente'; END IF;
  IF a.company_id <> v_company THEN RAISE EXCEPTION 'non_autorizzato'; END IF;
  IF a.esito <> 'eseguita' THEN RAISE EXCEPTION 'non_annullabile'; END IF;
  IF NOT a.reversibile THEN RAISE EXCEPTION 'non_reversibile'; END IF;
  IF a.oggetto_id IS NULL THEN RAISE EXCEPTION 'oggetto_non_tracciato'; END IF;

  -- idempotenza: non si annulla due volte la stessa azione
  IF EXISTS (SELECT 1 FROM public.silvio_audit
              WHERE ref_audit_id = p_audit_id AND esito = 'annullata') THEN
    RAISE EXCEPTION 'gia_annullata';
  END IF;

  SELECT azione_inversa INTO v_inversa FROM public.silvio_azioni WHERE chiave = a.azione_chiave;

  -- Esecuzione inversa: SOLO operazioni DB sicure e atomiche, filtrate per azienda.
  IF v_inversa = 'scollega_email_entita' AND a.oggetto_tipo = 'email_collegamento' THEN
    DELETE FROM public.email_collegamenti
      WHERE id = a.oggetto_id AND company_id = v_company;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN RAISE EXCEPTION 'oggetto_assente'; END IF;

  ELSIF v_inversa = 'elimina_bozza_documento' AND a.oggetto_tipo = 'email_documento_estratto' THEN
    -- annullabile solo finché è ancora bozza: mai toccare un documento confermato
    DELETE FROM public.email_documento_estratto
      WHERE id = a.oggetto_id AND company_id = v_company
        AND stato IN ('da_confermare','duplicato');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN RAISE EXCEPTION 'bozza_gia_confermata'; END IF;

  ELSE
    RAISE EXCEPTION 'annullamento_non_supportato';
  END IF;

  INSERT INTO public.silvio_audit (
    company_id, azione_chiave, oggetto_tipo, oggetto_id, parametri,
    esito, autonomia, motivo, origine, per_conto_di, approvata_da,
    reversibile, ref_audit_id
  ) VALUES (
    v_company, coalesce(v_inversa, a.azione_chiave || '_undo'), a.oggetto_tipo, a.oggetto_id, a.parametri,
    'annullata', 'confermata', 'annullato dall''utente', 'undo', auth.uid(), auth.uid(),
    false, p_audit_id
  ) RETURNING * INTO v_new;

  RETURN v_new;
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_undo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_undo(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.silvio_undo(uuid) IS
  'MP-SILVIO-06: annulla un''azione reversibile eseguita (scollega/elimina bozza). Idempotente, guardia azienda+staff, append-only audit.';
