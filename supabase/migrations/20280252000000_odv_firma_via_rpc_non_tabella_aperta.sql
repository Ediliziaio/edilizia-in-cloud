-- ordini_variazione era l'ultimo flusso pubblico a token che leggeva e
-- SCRIVEVA la tabella in diretta, con due policy che il token non lo
-- confrontavano mai:
--
--   public_firma_odv_read   SELECT  anon   USING (firma_token IS NOT NULL)
--   public_firma_odv_update UPDATE  anon   USING (firma_token IS NOT NULL
--                                                 AND status = 'in_attesa')
--
-- FirmaOdV.tsx filtra con .eq("firma_token", token), ma la RLS non vede la
-- WHERE del client: bastava omettere il filtro per leggere TUTTE le varianti
-- d'ordine in attesa di tutte le aziende — e, peggio, per approvarle o
-- rifiutarle. Una variante d'ordine e' una modifica di contratto con impatto
-- economico: l'UPDATE anonimo valeva come firma del committente.
-- Oggi la tabella e' vuota (0 righe), quindi non e' mai stato sfruttato, ma il
-- buco si apriva alla prima variante inviata.
--
-- Il fix allinea l'ODV agli altri due flussi pubblici del progetto, che sono
-- gia' fatti bene: i preventivi passano dall'edge function quote-sign, i SAL
-- dalle RPC sal_view_by_token / sal_sign_with_token. Qui: tre RPC
-- SECURITY DEFINER che prendono il token come argomento e leggono/scrivono
-- SOLO la riga di quel token. Le due policy anon spariscono, quindi la tabella
-- torna invisibile a chi non e' autenticato.
--
-- L'approvazione continua a passare prima dall'edge firma-odv-webhook (che
-- aggiorna anche importo ordine e activity log); odv_sign_with_token resta il
-- fallback, come prima, ma non e' piu' una UPDATE aperta.

-- ── lettura ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.odv_view_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_odv record;
BEGIN
  IF coalesce(trim(p_token), '') = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_invalid');
  END IF;

  SELECT * INTO v_odv FROM public.ordini_variazione WHERE firma_token = p_token;
  IF v_odv IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_invalid');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'gia_firmato', v_odv.status <> 'in_attesa',
    'id', v_odv.id,
    'numero_odv', v_odv.numero_odv,
    'titolo', v_odv.titolo,
    'descrizione', v_odv.descrizione,
    'motivazione', v_odv.motivazione,
    'impatto_economico', v_odv.impatto_economico,
    'impatto_giorni', v_odv.impatto_giorni,
    'richiesto_da', v_odv.richiesto_da,
    'richiesto_il', v_odv.richiesto_il,
    'status', v_odv.status);
END;
$function$;

-- ── approvazione (fallback dell'edge firma-odv-webhook) ──────────────────
CREATE OR REPLACE FUNCTION public.odv_sign_with_token(
  p_token text, p_firma_base64 text, p_firmato_da text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_odv record;
BEGIN
  IF coalesce(trim(p_token), '') = '' OR coalesce(trim(p_firma_base64), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'dati_mancanti');
  END IF;

  SELECT * INTO v_odv FROM public.ordini_variazione
   WHERE firma_token = p_token AND status = 'in_attesa'
   FOR UPDATE;
  IF v_odv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'odv_non_firmabile');
  END IF;

  UPDATE public.ordini_variazione
     SET status = 'approvato',
         firma_cliente = p_firma_base64,
         firmato_da = nullif(trim(coalesce(p_firmato_da, '')), ''),
         firmato_il = now()
   WHERE id = v_odv.id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ── rifiuto ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.odv_reject_with_token(
  p_token text, p_firmato_da text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_odv record;
BEGIN
  IF coalesce(trim(p_token), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'dati_mancanti');
  END IF;

  SELECT * INTO v_odv FROM public.ordini_variazione
   WHERE firma_token = p_token AND status = 'in_attesa'
   FOR UPDATE;
  IF v_odv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'odv_non_firmabile');
  END IF;

  UPDATE public.ordini_variazione
     SET status = 'rifiutato',
         firmato_da = nullif(trim(coalesce(p_firmato_da, '')), ''),
         firmato_il = now()
   WHERE id = v_odv.id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ── via le due policy che lasciavano la tabella aperta ───────────────────
DROP POLICY IF EXISTS public_firma_odv_read   ON public.ordini_variazione;
DROP POLICY IF EXISTS public_firma_odv_update ON public.ordini_variazione;

COMMENT ON FUNCTION public.odv_view_by_token(text) IS
  'Lettura pubblica di una variante d''ordine tramite il suo token di firma. Sostituisce la policy anon che esponeva tutte le righe con firma_token non nullo.';
