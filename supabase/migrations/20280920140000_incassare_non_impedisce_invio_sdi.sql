-- Incassare una fattura non deve impedirne l'invio allo SDI (audit 20/09/2026).
--
-- `documenti_fiscali.stato` fa due mestieri: racconta il ciclo dello SDI
-- (emessa → in_invio → inviata_sdi → consegnata/rifiutata) e insieme quello del
-- pagamento (pagata, parzialmente_pagata). Chi emetteva una fattura e la
-- incassava in giornata — contanti, POS, bonifico immediato — se la ritrovava in
-- stato 'pagata', e da lì il claim atomico rifiutava l'invio: quella fattura
-- allo SDI non ci andava più, per sempre, senza un modo per rimediare.
--
-- Qui si accetta il claim anche dagli stati di pagamento, ma solo finché allo
-- SDI la fattura non è mai partita davvero (nessun id di trasmissione, nessuno
-- stato SDI): una fattura già trasmessa resta intoccabile, come prima.
-- La stessa regola sta in _shared/sdiInvioGuard.ts, che dà il messaggio prima
-- del claim.
--
-- Resta un limite noto, non risolto qui: durante l'invio lo stato diventa
-- 'in_invio' e poi 'inviata_sdi', quindi l'etichetta «pagata» si perde. L'importo
-- incassato NON si perde (vive in documenti_fiscali.importo_pagato e nelle
-- scadenze), ed è da lì che le pagine degli incassi devono leggere il residuo.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.claim_documento_per_invio(p_documento_id uuid)
 RETURNS TABLE(claimed boolean, previous_stato text, current_stato text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stato text;
  v_sdi_id text;
  v_sdi_stato text;
  v_mai_trasmessa boolean;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF (SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id) IS NOT NULL
     AND NOT public.user_can_access_company((SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id)) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  SELECT d.stato, d.sdi_id_trasmissione, d.sdi_stato
    INTO v_stato, v_sdi_id, v_sdi_stato
    FROM public.documenti_fiscali d
   WHERE d.id = p_documento_id AND d.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text; RETURN;
  END IF;

  v_mai_trasmessa := COALESCE(v_sdi_id, '') = '' AND COALESCE(v_sdi_stato, '') = '';

  IF v_stato IN ('emessa', 'rifiutata', 'scartata')
     OR (v_mai_trasmessa AND v_stato IN ('pagata', 'parzialmente_pagata')) THEN
    UPDATE public.documenti_fiscali SET stato = 'in_invio', updated_at = now() WHERE id = p_documento_id;
    RETURN QUERY SELECT true, v_stato, 'in_invio'::text;
  ELSE
    RETURN QUERY SELECT false, v_stato, v_stato;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_documento_per_invio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_documento_per_invio(uuid) TO authenticated, service_role;
