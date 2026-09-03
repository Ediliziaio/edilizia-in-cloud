-- ════════════════════════════════════════════════════════════════════════════
-- Un cliente solo: partita IVA sui clienti commessa e ponte fra le due anagrafiche
-- ════════════════════════════════════════════════════════════════════════════
-- Lo stesso cliente vive in due tabelle: `profiles` (il cliente della COMMESSA)
-- e `marketing_contacts` (l'intestatario della FATTURA). Le colonne che le
-- legano esistono già — `marketing_contacts.customer_profile_id` e
-- `profiles.marketing_contact_id` — ma in produzione sono popolate su ZERO
-- righe. Finché restano vuote, nessuna fattura importata potrà mai trovare la
-- sua commessa.
--
-- Il perché il ponte non si può semplicemente "riempire" adesso, misurato:
--   • 90.380 contatti, 945 profili;
--   • solo 265 contatti e solo 16 profili hanno un codice fiscale;
--   • zero coppie combaciano, né per codice fiscale né per email;
--   • dei 418 clienti che hanno una commessa, 15 hanno il codice fiscale.
-- Il dato per riconoscere le persone semplicemente non è ancora stato inserito.
-- Questa migration quindi fa due cose: dà un posto a quel dato, e fa in modo
-- che il collegamento avvenga DA SOLO man mano che il dato arriva — invece di
-- restare una cosa da rifare a mano ogni volta.
--
--   1. `profiles.vat_number`: i clienti commessa non avevano la partita IVA,
--      solo il codice fiscale. Una fattura a una società porta la P.IVA e non
--      aveva nulla con cui essere confrontata.
--   2. `collega_anagrafica_cliente()`: cerca la controparte per partita IVA o
--      codice fiscale e scrive il ponte nei due sensi. Scatta a ogni inserimento
--      o modifica, su entrambe le tabelle, così il collegamento nasce nel
--      momento in cui qualcuno digita il codice fiscale nella scheda cliente.
--   3. Un giro di recupero su quello che c'è già (oggi: quasi nulla, ma è
--      giusto che parta comunque).
--
-- Regola non negoziabile: si collega SOLO quando la controparte è UNA sola.
-- Due omonimi collegati a caso significherebbero fatture di un cliente
-- attaccate alle commesse di un altro, e nessuno se ne accorgerebbe.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vat_number text;

COMMENT ON COLUMN public.profiles.vat_number IS
  'Partita IVA del cliente. Insieme a fiscal_code è ciò che permette di riconoscere lo stesso cliente fra commesse e fatture.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Confronto: via spazi, punti e prefisso IT. "IT 012 345 678 90" e
-- "IT01234567890" sono lo stesso numero, e senza normalizzare non si
-- incontrerebbero mai.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.norm_id_fiscale(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(upper(regexp_replace(coalesce(v, ''), '[^0-9A-Za-z]', '', 'g')), '^IT', ''), '');
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_norm_piva
  ON public.profiles(company_id, public.norm_id_fiscale(vat_number))
  WHERE vat_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_norm_cf
  ON public.profiles(company_id, public.norm_id_fiscale(fiscal_code))
  WHERE fiscal_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_norm_piva
  ON public.marketing_contacts(company_id, public.norm_id_fiscale(vat_number))
  WHERE vat_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_norm_cf
  ON public.marketing_contacts(company_id, public.norm_id_fiscale(fiscal_code))
  WHERE fiscal_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Il ponte: dato un profilo o un contatto, trova la controparte e li lega
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.collega_anagrafica_cliente(
  _profile_id uuid DEFAULT NULL,
  _contact_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company uuid;
  _piva    text;
  _cf      text;
  _trovato uuid;
  _quanti  int;
BEGIN
  IF _profile_id IS NOT NULL THEN
    SELECT company_id, norm_id_fiscale(vat_number), norm_id_fiscale(fiscal_code)
      INTO _company, _piva, _cf
      FROM public.profiles WHERE id = _profile_id;
    IF _company IS NULL OR (_piva IS NULL AND _cf IS NULL) THEN RETURN NULL; END IF;

    -- La partita IVA prima del codice fiscale: per una ditta individuale
    -- coincidono spesso, ma la P.IVA è ciò con cui viene emessa la fattura.
    -- min(uuid) non esiste in Postgres: si prende il primo dell'aggregato
    SELECT count(*), (array_agg(id))[1] INTO _quanti, _trovato
      FROM public.marketing_contacts
     WHERE company_id = _company
       AND ((_piva IS NOT NULL AND norm_id_fiscale(vat_number) = _piva)
         OR (_cf   IS NOT NULL AND norm_id_fiscale(fiscal_code) = _cf));

    -- Più di una controparte: si lascia stare. Meglio nessun collegamento che
    -- il collegamento sbagliato.
    IF _quanti <> 1 THEN RETURN NULL; END IF;

    UPDATE public.profiles SET marketing_contact_id = _trovato
     WHERE id = _profile_id AND marketing_contact_id IS DISTINCT FROM _trovato;
    UPDATE public.marketing_contacts SET customer_profile_id = _profile_id
     WHERE id = _trovato AND customer_profile_id IS DISTINCT FROM _profile_id;
    RETURN _trovato;
  END IF;

  IF _contact_id IS NOT NULL THEN
    SELECT company_id, norm_id_fiscale(vat_number), norm_id_fiscale(fiscal_code)
      INTO _company, _piva, _cf
      FROM public.marketing_contacts WHERE id = _contact_id;
    IF _company IS NULL OR (_piva IS NULL AND _cf IS NULL) THEN RETURN NULL; END IF;

    -- min(uuid) non esiste in Postgres: si prende il primo dell'aggregato
    SELECT count(*), (array_agg(id))[1] INTO _quanti, _trovato
      FROM public.profiles
     WHERE company_id = _company
       AND ((_piva IS NOT NULL AND norm_id_fiscale(vat_number) = _piva)
         OR (_cf   IS NOT NULL AND norm_id_fiscale(fiscal_code) = _cf));

    IF _quanti <> 1 THEN RETURN NULL; END IF;

    UPDATE public.marketing_contacts SET customer_profile_id = _trovato
     WHERE id = _contact_id AND customer_profile_id IS DISTINCT FROM _trovato;
    UPDATE public.profiles SET marketing_contact_id = _contact_id
     WHERE id = _trovato AND marketing_contact_id IS DISTINCT FROM _contact_id;
    RETURN _trovato;
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Si collega da solo quando il dato arriva
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_collega_anagrafica_profilo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.vat_number IS NOT NULL OR NEW.fiscal_code IS NOT NULL THEN
    PERFORM public.collega_anagrafica_cliente(_profile_id => NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Il collegamento è un di più: non deve mai impedire di salvare un cliente.
  RAISE LOG 'trg_collega_anagrafica_profilo error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collega_anagrafica_profilo ON public.profiles;
CREATE TRIGGER trg_collega_anagrafica_profilo
  AFTER INSERT OR UPDATE OF vat_number, fiscal_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_collega_anagrafica_profilo();

CREATE OR REPLACE FUNCTION public.trg_collega_anagrafica_contatto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.vat_number IS NOT NULL OR NEW.fiscal_code IS NOT NULL THEN
    PERFORM public.collega_anagrafica_cliente(_contact_id => NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trg_collega_anagrafica_contatto error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collega_anagrafica_contatto ON public.marketing_contacts;
CREATE TRIGGER trg_collega_anagrafica_contatto
  AFTER INSERT OR UPDATE OF vat_number, fiscal_code ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_collega_anagrafica_contatto();

-- ─────────────────────────────────────────────────────────────────────────────
-- Recupero su quello che c'è già. Oggi collega quasi nulla (il dato non c'è
-- ancora), ma è giusto che il giro parta: serve alle aziende che il codice
-- fiscale lo hanno già inserito.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
     WHERE marketing_contact_id IS NULL
       AND (vat_number IS NOT NULL OR fiscal_code IS NOT NULL)
  LOOP
    IF public.collega_anagrafica_cliente(_profile_id => r.id) IS NOT NULL THEN
      n := n + 1;
    END IF;
  END LOOP;
  RAISE LOG 'ponte anagrafico: collegati % clienti', n;
END $$;
