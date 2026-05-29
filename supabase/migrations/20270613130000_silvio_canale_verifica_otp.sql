-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-07 · Verifica canale (reverse-OTP) — collega un numero WhatsApp a un
-- utente PROVANDO il possesso del numero, senza dipendere da template Meta.
--
-- Flusso "OTP al contrario": l'utente (autenticato in app) genera un codice,
-- lo invia DAL proprio WhatsApp al numero aziendale; il webhook inbound
-- (whatsapp-ai-processor) riconosce il codice e marca verificato=true.
-- Così l'identità è certa prima di qualsiasi azione sui canali esterni.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Stato di verifica pendente sulla riga identità (la riga pending diventa,
--    una volta confermata, la riga verificata: UNIQUE(canale, identificativo)).
ALTER TABLE public.silvio_canali_identita
  ADD COLUMN IF NOT EXISTS codice          text,
  ADD COLUMN IF NOT EXISTS codice_scadenza timestamptz;

COMMENT ON COLUMN public.silvio_canali_identita.codice IS
  'MP-SILVIO-07: codice OTP che l''utente deve inviare dal proprio WhatsApp; NULL quando verificato/assente.';

-- 2) RLS: il PROPRIETARIO può vedere/scollegare le PROPRIE righe (oltre allo
--    staff interno già previsto). INSERT/UPDATE restano alla RPC SECURITY
--    DEFINER e al service_role: l'utente non può auto-marcarsi verificato.
DROP POLICY IF EXISTS silvio_canali_proprietario_sel ON public.silvio_canali_identita;
CREATE POLICY silvio_canali_proprietario_sel ON public.silvio_canali_identita
  FOR SELECT TO authenticated
  USING (utente_id = auth.uid() AND company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS silvio_canali_proprietario_del ON public.silvio_canali_identita;
CREATE POLICY silvio_canali_proprietario_del ON public.silvio_canali_identita
  FOR DELETE TO authenticated
  USING (utente_id = auth.uid() AND company_id = public.get_effective_company_id());

-- 3) Avvio verifica: genera il codice e prepara/riusa la riga pending.
--    Non "ruba" un numero già verificato da un altro utente (la riga è UNIQUE
--    per (canale, identificativo)). Ritorna codice + numero aziendale a cui
--    inviarlo (per il deep link wa.me lato app).
CREATE OR REPLACE FUNCTION public.silvio_canale_avvia_verifica(p_identificativo text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_company  uuid := public.get_effective_company_id();
  v_digits   text;
  v_e164     text;
  v_code     text;
  v_scad     timestamptz := now() + interval '15 minutes';
  v_numero   text;
  v_rows     int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'non_autenticato'; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'azienda_non_risolta'; END IF;

  -- Normalizza in E.164 (+cifre): coerente con la RPC silvio_canale_risolvi_utente.
  v_digits := regexp_replace(coalesce(p_identificativo, ''), '[^0-9]', '', 'g');
  IF length(v_digits) < 8 THEN RAISE EXCEPTION 'numero_non_valido'; END IF;
  v_e164 := '+' || v_digits;

  -- Codice breve, leggibile, senza dipendenze (no pgcrypto): 6 hex maiuscoli.
  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  INSERT INTO public.silvio_canali_identita
    (company_id, utente_id, canale, identificativo, verificato, codice, codice_scadenza)
  VALUES
    (v_company, v_uid, 'whatsapp', v_e164, false, v_code, v_scad)
  ON CONFLICT (canale, identificativo) DO UPDATE
    SET company_id      = excluded.company_id,
        utente_id       = excluded.utente_id,
        codice          = excluded.codice,
        codice_scadenza = excluded.codice_scadenza,
        verificato      = false
    WHERE silvio_canali_identita.verificato = false
       OR silvio_canali_identita.utente_id = v_uid;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- conflitto su una riga già verificata da un ALTRO utente → non sovrascrivo.
    RAISE EXCEPTION 'numero_gia_collegato';
  END IF;

  SELECT numero INTO v_numero
  FROM public.ai_whatsapp_numbers
  WHERE company_id = v_company AND deleted_at IS NULL
  ORDER BY creato_il ASC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'codice', v_code,
    'identificativo', v_e164,
    'numero_aziendale', v_numero,
    'scade_il', v_scad
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.silvio_canale_avvia_verifica(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_canale_avvia_verifica(text) TO authenticated;

COMMENT ON FUNCTION public.silvio_canale_avvia_verifica(text) IS
  'MP-SILVIO-07: avvia la verifica reverse-OTP di un numero WhatsApp per l''utente corrente; ritorna codice + numero aziendale.';
