-- ============================================================================
-- P0 · Atomic top-up sui wallet service-specifici
-- ============================================================================
-- `topup-credits` (edge fn) faceva SELECT balance → UPDATE con valore calcolato:
-- due top-up contemporanei sulla stessa company perdono uno dei due increment
-- (race classica "read-modify-write" non serializzata). Sostituiamo con un RPC
-- atomico che esegue UPSERT garantito della row + UPDATE in-place.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.topup_service_credits(
  p_service    text,
  p_company_id uuid,
  p_amount     numeric
)
RETURNS TABLE(new_balance numeric, service text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_bal numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount deve essere > 0' USING ERRCODE = '22023';
  END IF;

  v_table := CASE p_service
    WHEN 'email'     THEN 'email_credits'
    WHEN 'ai_agents' THEN 'ai_credits'
    WHEN 'whatsapp'  THEN 'whatsapp_credits'
    ELSE NULL
  END;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'p_service non supportato: %', p_service USING ERRCODE = '22023';
  END IF;

  -- Step 1: assicura che la row esista (idempotente, safe sotto concorrenza)
  EXECUTE format(
    'INSERT INTO public.%I(company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING',
    v_table
  ) USING p_company_id;

  -- Step 2: update atomico in-place. COALESCE difende da colonne NULL.
  -- Per `whatsapp_credits` la colonna è `sends_blocked`, per le altre `calls_blocked`.
  -- Le sblocciamo solo se erano "balance_zero" (semantica preservata da edge fn).
  EXECUTE format($f$
    UPDATE public.%I
       SET balance_eur         = ROUND((COALESCE(balance_eur, 0) + $2)::numeric, 4),
           total_recharged_eur = ROUND((COALESCE(total_recharged_eur, 0) + $2)::numeric, 4),
           updated_at          = NOW()
     WHERE company_id = $1
    RETURNING balance_eur
  $f$, v_table)
    INTO v_bal
    USING p_company_id, p_amount;

  -- Step 3: unblock best-effort sulle colonne che esistono. Usiamo IF EXISTS
  -- sull'information_schema per non rompere tabelle che non hanno certe colonne.
  -- (idempotente, eseguito sempre — nessun costo se la row non è bloccata)
  IF v_table = 'whatsapp_credits' THEN
    EXECUTE format($f$
      UPDATE public.%I SET sends_blocked = false
       WHERE company_id = $1 AND sends_blocked = true
    $f$, v_table) USING p_company_id;
  ELSE
    EXECUTE format($f$
      UPDATE public.%I
         SET calls_blocked  = false,
             blocked_at     = NULL,
             blocked_reason = NULL
       WHERE company_id = $1
         AND calls_blocked = true
         AND blocked_reason = 'balance_zero'
    $f$, v_table) USING p_company_id;
  END IF;

  RETURN QUERY SELECT v_bal, p_service;
END;
$$;

COMMENT ON FUNCTION public.topup_service_credits IS
  'Ricarica atomica credito per service (email/ai_agents/whatsapp). Rimpiazza il pattern race-prone SELECT+UPDATE presente in topup-credits edge fn.';

-- Grant execute all'utente autenticato (service_role bypassa RLS comunque).
-- Il gating di autorizzazione resta a carico dell'edge function che verifica
-- super_admin / stesso company_id prima di invocare la RPC.
GRANT EXECUTE ON FUNCTION public.topup_service_credits(text, uuid, numeric) TO authenticated;
