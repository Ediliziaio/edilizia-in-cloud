-- Ondata 4 — stato di destinazione valido, modifica concorrente, cestino
--
-- Tre cose distinte che condividono lo stesso principio: il database deve poter
-- dire di no da solo, senza contare sul fatto che il browser si comporti bene.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lo stato di destinazione deve appartenere al percorso dell'azienda
-- ─────────────────────────────────────────────────────────────────────────────
-- change_order_status accettava qualunque uuid di stato: nessuno verificava che
-- fosse uno degli stati configurati DALL'AZIENDA della commessa. Oggi nessuna
-- commessa è finita in uno stato altrui (verificato: 0 righe), ma niente lo
-- impediva — e gli stati sono per azienda, da 1 a 11 ciascuna.
DO $$
DECLARE v_def text; v_nuovo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'change_order_status';

  v_nuovo := replace(v_def,
    E'  SELECT name INTO v_new_name\n    FROM public.order_statuses\n   WHERE id = p_new_status_id;',
    E'  -- Lo stato di destinazione deve essere uno del percorso configurato da\n'
    '  -- QUESTA azienda: gli stati sono per azienda, e un uuid qualsiasi\n'
    '  -- porterebbe la commessa in uno stato che nessuno ha definito.\n'
    '  SELECT name INTO v_new_name\n'
    '    FROM public.order_statuses\n'
    '   WHERE id = p_new_status_id AND company_id = v_company_id;\n\n'
    '  IF v_new_name IS NULL THEN\n'
    '    RAISE EXCEPTION ''stato di destinazione non valido per questa azienda''\n'
    '      USING ERRCODE = ''23503'';\n'
    '  END IF;');

  IF v_nuovo IS NOT DISTINCT FROM v_def THEN
    RAISE EXCEPTION 'change_order_status: il punto di innesto non è stato trovato';
  END IF;
  EXECUTE v_nuovo;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rilevare la modifica concorrente
-- ─────────────────────────────────────────────────────────────────────────────
-- Due persone aprono la stessa commessa, la prima salva, la seconda salva
-- sopra: il lavoro della prima sparisce senza che nessuno se ne accorga.
--
-- Una colonna `version` che sale a ogni modifica, e un trigger che rifiuta se
-- chi scrive dichiara una versione diversa da quella attuale. È volutamente
-- FACOLTATIVO: chi non manda `version` nel corpo continua a funzionare come
-- prima (NEW.version resta uguale a OLD.version), chi lo manda ottiene la
-- protezione. Così nessun percorso esistente si rompe e l'interfaccia può
-- adottarlo una schermata per volta.

CREATE OR REPLACE FUNCTION public.versione_riga()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION
      'Questa riga è stata modificata da qualcun altro mentre la stavi aprendo (versione % invece di %). Ricarica e riprova: sovrascrivere cancellerebbe il lavoro dell''altra persona.',
      NEW.version, OLD.version
      USING ERRCODE = '40001';
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.versione_riga() IS
  'Blocco ottimistico facoltativo: chi manda `version` viene protetto dalla '
  'sovrascrittura, chi non lo manda funziona come prima.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','quotes','profiles','documenti_fiscali'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_versione_riga ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_versione_riga BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.versione_riga()', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.version IS ''Sale a ogni modifica. Mandala '
      'indietro quando salvi per farti proteggere dalla sovrascrittura.''', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cancellazione reversibile per trenta giorni
-- ─────────────────────────────────────────────────────────────────────────────
-- orders, quotes, marketing_contacts e documenti_fiscali avevano già
-- `deleted_at`. I clienti (profiles) no: una cancellazione era definitiva.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_cestino
  ON public.profiles (company_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- Chi ha cancellato non lo dice il client.
CREATE OR REPLACE FUNCTION public.cestino_metti(p_tabella text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  IF p_tabella NOT IN ('orders','quotes','profiles','marketing_contacts') THEN
    RAISE EXCEPTION 'tabella non gestita dal cestino: %', p_tabella USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', p_tabella)
    INTO v_company USING p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'riga non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL',
    p_tabella) USING p_id, auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.cestino_ripristina(p_tabella text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_quando timestamptz;
BEGIN
  IF p_tabella NOT IN ('orders','quotes','profiles','marketing_contacts') THEN
    RAISE EXCEPTION 'tabella non gestita dal cestino: %', p_tabella USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT company_id, deleted_at FROM public.%I WHERE id = $1', p_tabella)
    INTO v_company, v_quando USING p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'riga non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF v_quando IS NULL THEN
    RAISE EXCEPTION 'questa riga non è nel cestino' USING ERRCODE = '22023';
  END IF;
  IF v_quando < now() - interval '30 days' THEN
    RAISE EXCEPTION 'cancellata più di 30 giorni fa (il %): non è più ripristinabile',
      to_char(v_quando, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;

  EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', p_tabella)
    USING p_id;
END;
$function$;

COMMENT ON FUNCTION public.cestino_ripristina(text, uuid) IS
  'Rimette una riga cancellata entro 30 giorni. Oltre, dichiara che non si può '
  'più invece di far finta di averlo fatto.';

REVOKE ALL ON FUNCTION public.cestino_metti(text, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cestino_ripristina(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cestino_metti(text, uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cestino_ripristina(text, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. L'attore del cambio stato, fino in fondo
-- ─────────────────────────────────────────────────────────────────────────────
-- Nella migrazione 2.3 avevo sostituito solo la ricerca del NOME dell'attore,
-- non l'attore scritto in order_status_history — che è proprio il
-- `p_changed_by` che il briefing cita come «passato dal browser». Trovato
-- perché la prova falliva: cambiando stato senza passare p_changed_by,
-- l'INSERT violava il NOT NULL su changed_by.
DO $$
DECLARE v_def text; v_nuovo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'change_order_status';

  v_nuovo := replace(v_def,
    'VALUES (p_order_id, p_new_status_id, p_changed_by)',
    'VALUES (p_order_id, p_new_status_id, COALESCE(auth.uid(), p_changed_by))');
  v_nuovo := replace(v_nuovo, '    p_changed_by,', '    COALESCE(auth.uid(), p_changed_by),');

  IF v_nuovo IS NOT DISTINCT FROM v_def THEN
    RAISE EXCEPTION 'change_order_status: p_changed_by non trovato dove atteso';
  END IF;
  EXECUTE v_nuovo;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='change_order_status'
      AND p.prosrc ~ '[^)]\mp_changed_by\M'
      AND p.prosrc !~ 'COALESCE\(auth\.uid\(\), p_changed_by\)'
  ) THEN
    RAISE EXCEPTION 'restano usi nudi di p_changed_by';
  END IF;
END $$;
