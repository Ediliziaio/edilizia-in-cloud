-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · STEP 2 email — "cosa conta OGGI?" (triage on-demand)
-- ────────────────────────────────────────────────────────────────────────────
-- Restituisce le email recenti con abbastanza testo perché Silvio le classifichi
-- AL VOLO (fattura/DDT fornitore, richiesta preventivo, sollecito, scadenza, …)
-- SENZA dipendere dal pipeline batch (oggi dormiente). Read-only, SECURITY
-- DEFINER con scoping esplicito per company_id. Snippet ripulito e limitato.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_tool_posta_da_lavorare(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 3,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days  int := GREATEST(1, LEAST(30, COALESCE(p_days_back, 3)));
  v_limit int := GREATEST(1, LEAST(50, COALESCE(p_limit, 30)));
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('count', 0, 'periodo_giorni', v_days, 'email', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
           'count', COUNT(*),
           'periodo_giorni', v_days,
           'non_lette', COUNT(*) FILTER (WHERE NOT COALESCE(letta, true)),
           'email', COALESCE(jsonb_agg(jsonb_build_object(
             'id', id,
             'da', COALESCE(NULLIF(da_nome, ''), da_email),
             'da_email', da_email,
             'oggetto', oggetto,
             'ricevuta_il', ricevuta_il,
             'letta', letta,
             'ha_allegati', ha_allegati,
             'categoria_ai', categoria_ai,
             'priorita_ai', priorita_ai,
             'testo', testo
           ) ORDER BY ricevuta_il DESC), '[]'::jsonb)
         )
    INTO v_result
  FROM (
    SELECT
      id,
      from_name AS da_nome,
      from_email AS da_email,
      subject AS oggetto,
      received_at AS ricevuta_il,
      is_read AS letta,
      (attachments IS NOT NULL
         AND jsonb_typeof(attachments) = 'array'
         AND jsonb_array_length(attachments) > 0) AS ha_allegati,
      ai_category AS categoria_ai,
      ai_priority AS priorita_ai,
      left(btrim(regexp_replace(COALESCE(ai_summary, raw_text, ''), '\s+', ' ', 'g')), 900) AS testo
    FROM public.email_inbox
    WHERE company_id = p_company_id
      AND received_at >= now() - (v_days || ' days')::interval
      AND COALESCE(is_trashed, false) = false
      AND COALESCE(is_archived, false) = false
    ORDER BY received_at DESC
    LIMIT v_limit
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'periodo_giorni', v_days, 'email', '[]'::jsonb));
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_tool_posta_da_lavorare(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_posta_da_lavorare(uuid, uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.silvio_tool_posta_da_lavorare(uuid, uuid, integer, integer)
  IS 'Silvio STEP2: email recenti con testo per triage on-demand (cosa conta oggi). Read-only, scoped per company.';
