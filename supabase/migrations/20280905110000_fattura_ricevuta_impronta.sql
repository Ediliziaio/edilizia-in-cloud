-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.7 — impronta e immutabilità sulle fatture ricevute
-- ════════════════════════════════════════════════════════════════════════════
--
-- `fatture_ricevute` conserva `xml_raw` e nient'altro sull'autenticità: nessuna
-- impronta, nessun indizio sulla firma, nessun vincolo che impedisca di
-- riscrivere il contenuto dopo che è arrivato. `ricevi-sdi` verifica l'HMAC del
-- webhook — cioè che a bussare sia l'intermediario giusto — e poi si fida del
-- corpo per sempre.
--
-- ── Cosa faccio, e cosa dichiaro di NON fare ───────────────────────────────
-- Faccio tre cose vere:
--   • un'impronta SHA-256 del documento, calcolata dal database all'arrivo;
--   • il divieto di modificare `xml_raw` una volta scritto — una fattura
--     ricevuta è il documento di qualcun altro, non si corregge;
--   • il rifiuto dello stesso file protocollato due volte, per impronta.
--
-- Quello che NON faccio, e che nessuno deve credere fatto: **non verifico la
-- firma digitale**. Una fattura elettronica firmata arriva in busta CAdES
-- (.xml.p7m) e validarla richiede la catena dei certificati e le liste di
-- fiducia europee. Non è lavoro da plpgsql, e una funzione che rispondesse
-- «firma valida» senza aver validato la catena sarebbe peggio del niente che
-- c'è adesso.
-- Quello che posso dire è se la busta *sembra* firmata, e lo dico con quella
-- parola. `firma_stato` vale 'assente', 'busta_firmata_non_verificata' o
-- 'sconosciuto': nessuno dei tre significa «verificata».

ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS xml_sha256   text,
  ADD COLUMN IF NOT EXISTS xml_bytes    integer,
  ADD COLUMN IF NOT EXISTS firma_stato  text,
  ADD COLUMN IF NOT EXISTS impronta_at  timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fatture_ricevute'::regclass
                   AND conname='fatture_ricevute_firma_stato_check') THEN
    ALTER TABLE public.fatture_ricevute ADD CONSTRAINT fatture_ricevute_firma_stato_check
      CHECK (firma_stato IS NULL OR firma_stato = ANY (ARRAY[
        'assente',                       -- XML in chiaro: nessuna busta
        'busta_firmata_non_verificata',  -- sembra un involucro CAdES/PKCS#7
        'sconosciuto'                    -- non riconosciuto: non si indovina
      ]));
  END IF;
END $$;

COMMENT ON COLUMN public.fatture_ricevute.firma_stato IS
  'Che aspetto ha la busta, NON l''esito di una verifica crittografica. Nessuno dei valori significa «firma valida»: la catena dei certificati non viene validata qui.';
COMMENT ON COLUMN public.fatture_ricevute.xml_sha256 IS
  'SHA-256 del documento come è arrivato. Calcolata dal database, non dal chiamante: serve a accorgersi di una modifica successiva.';

-- Lo stesso file non si protocolla due volte.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fatture_ricevute_impronta
  ON public.fatture_ricevute (company_id, xml_sha256)
  WHERE xml_sha256 IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fattura_ricevuta_impronta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Il contenuto di una fattura ricevuta non si modifica. Se è sbagliata, il
  -- fornitore emette una nota di credito: non la si riscrive qui.
  IF TG_OP = 'UPDATE'
     AND OLD.xml_raw IS NOT NULL
     AND NEW.xml_raw IS DISTINCT FROM OLD.xml_raw THEN
    RAISE EXCEPTION
      'il contenuto di una fattura ricevuta non si modifica: è il documento di un altro soggetto (impronta %)',
      left(coalesce(OLD.xml_sha256, '?'), 12)
      USING ERRCODE = '42501';
  END IF;

  -- Anche l'impronta non si detta da fuori: la calcola il database.
  IF NEW.xml_raw IS NULL THEN
    NEW.xml_sha256 := NULL;
    NEW.xml_bytes  := NULL;
    NEW.firma_stato := NULL;
    NEW.impronta_at := NULL;
    RETURN NEW;
  END IF;

  NEW.xml_sha256 := encode(extensions.digest(NEW.xml_raw, 'sha256'), 'hex');
  NEW.xml_bytes  := octet_length(NEW.xml_raw);
  NEW.impronta_at := now();

  -- Riconoscimento della busta, dichiarato per quello che è: un indizio.
  --   '<' iniziale → XML in chiaro
  --   'MII' → DER in base64, la forma tipica di un involucro PKCS#7/CAdES
  NEW.firma_stato := CASE
    WHEN btrim(NEW.xml_raw) LIKE '<%'   THEN 'assente'
    WHEN btrim(NEW.xml_raw) LIKE 'MII%' THEN 'busta_firmata_non_verificata'
    ELSE 'sconosciuto'
  END;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_fattura_ricevuta_impronta ON public.fatture_ricevute;
CREATE TRIGGER trg_fattura_ricevuta_impronta
  BEFORE INSERT OR UPDATE ON public.fatture_ricevute
  FOR EACH ROW EXECUTE FUNCTION public.fattura_ricevuta_impronta();

-- ── Ricontrollare l'impronta di un documento già in archivio ────────────────
-- Serve a rispondere alla domanda «questa fattura è ancora quella che è
-- arrivata?», e a dire con precisione cosa resta non verificato.
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_verifica(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE f record; v_ora text;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'fattura ricevuta non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(f.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  IF f.xml_raw IS NULL THEN
    RETURN jsonb_build_object(
      'verificabile', false,
      'motivo', 'la riga non conserva l''XML: non c''è niente da confrontare',
      'id', p_id);
  END IF;

  v_ora := encode(extensions.digest(f.xml_raw, 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'verificabile', true,
    'id', p_id,
    'impronta_registrata', f.xml_sha256,
    'impronta_ricalcolata', v_ora,
    'intatta', f.xml_sha256 IS NOT NULL AND f.xml_sha256 = v_ora,
    'byte', f.xml_bytes,
    'calcolata_il', f.impronta_at,
    'firma_stato', f.firma_stato,
    'non_verificato', jsonb_build_array(
      'la firma digitale non è validata: servirebbe la catena dei certificati e le liste di fiducia',
      'l''appartenenza del cedente non è confrontata con il registro imprese',
      'firma_stato descrive la forma della busta, non la sua validità'));
END $function$;

REVOKE ALL ON FUNCTION public.fattura_ricevuta_verifica(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_verifica(uuid) TO authenticated, service_role;
