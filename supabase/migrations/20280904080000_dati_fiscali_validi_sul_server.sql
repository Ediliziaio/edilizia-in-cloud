-- Checksum di partita IVA e codice fiscale, lato server
--
-- Richiesta della traccia interfaccia: il validatore è agganciato in creazione e
-- modifica cliente, ma `customerDataSanitizer` sposta una P.IVA finita per
-- errore nel campo codice fiscale senza verificarne la validità, e comunque chi
-- scrive via API non passa dall'interfaccia. Finché il controllo vive solo nel
-- browser, i dati sporchi continuano a entrare e riemergono a valle come scarti
-- dallo SdI (cancello C3).
--
-- L'algoritmo è lo stesso del client, non una seconda versione: verificato
-- eseguendo entrambi sugli stessi valori. Il carattere di controllo di
-- RSSMRA85M01H501 è Q sia in src/lib/fatturazione/validazioniAnagrafiche.ts sia
-- qui. (L'esempio "…H501Z" che circola online NON è un codice valido: usarlo
-- come caso di prova fa sembrare rotto un validatore giusto.)
--
-- ── Perché un trigger e non un CHECK ────────────────────────────────────────
-- In produzione c'è già dello sporco, misurato prima di scegliere:
--     marketing_contacts.vat_number    63.391 valorizzate ->  203 invalide
--     marketing_contacts.fiscal_code      265 valorizzate ->  201 invalide
--     suppliers.vat_number                 90 valorizzate ->   29 invalide
--     profiles.fiscal_code                 16 valorizzate ->   14 invalide
--     companies.vat_number                  9 valorizzate ->    1 invalida
-- Guardandolo da vicino è quasi tutto dato finto di seed: IT02345678901,
-- IT03456789012, 99999900005, 01234567890.
--
-- Un CHECK secco fallirebbe subito. E nemmeno NOT VALID basta: salta la
-- verifica delle righe esistenti alla creazione, ma continua a valutare ogni
-- UPDATE successivo — aggiornare il telefono di uno dei 29 fornitori
-- fallirebbe per colpa della partita IVA, cioè un terzo dell'anagrafica
-- bloccata in scrittura per un campo che non stai toccando.
--
-- Il trigger rifiuta solo quando il campo fiscale VIENE TOCCATO. Così i valori
-- nuovi e le correzioni sono verificati, lo sporco non può aumentare, e le
-- righe storiche restano modificabili su tutto il resto.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.valida_dati_fiscali()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_col_piva text := nullif(TG_ARGV[0], '');
  v_col_cf   text := nullif(TG_ARGV[1], '');
  v_new  jsonb := to_jsonb(NEW);
  v_old  jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_val  text;
BEGIN
  IF v_col_piva IS NOT NULL THEN
    v_val := v_new ->> v_col_piva;
    -- Solo se valorizzato E se è cambiato: su una riga storica sporca resta
    -- possibile modificare tutti gli altri campi.
    IF coalesce(btrim(coalesce(v_val, '')), '') <> ''
       AND (v_old IS NULL OR (v_old ->> v_col_piva) IS DISTINCT FROM v_val)
       AND NOT public.piva_valida(v_val) THEN
      RAISE EXCEPTION
        'Partita IVA non valida: "%". Devono essere 11 cifre e l''ultima è di controllo: ricontrolla il numero.',
        v_val USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_col_cf IS NOT NULL THEN
    v_val := v_new ->> v_col_cf;
    IF coalesce(btrim(coalesce(v_val, '')), '') <> ''
       AND (v_old IS NULL OR (v_old ->> v_col_cf) IS DISTINCT FROM v_val)
       AND NOT public.codice_fiscale_valido(v_val) THEN
      RAISE EXCEPTION
        'Codice fiscale non valido: "%". Attesi 16 caratteri per una persona o 11 cifre per una società.',
        v_val USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.valida_dati_fiscali() IS
  'Trigger generico: TG_ARGV[0] = colonna partita IVA, TG_ARGV[1] = colonna '
  'codice fiscale (stringa vuota per saltarne una). Verifica solo i valori '
  'nuovi o modificati, mai quelli già presenti.';

DROP TRIGGER IF EXISTS trg_valida_dati_fiscali ON public.companies;
CREATE TRIGGER trg_valida_dati_fiscali
  BEFORE INSERT OR UPDATE OF vat_number, fiscal_code ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.valida_dati_fiscali('vat_number', 'fiscal_code');

DROP TRIGGER IF EXISTS trg_valida_dati_fiscali ON public.suppliers;
CREATE TRIGGER trg_valida_dati_fiscali
  BEFORE INSERT OR UPDATE OF vat_number, fiscal_code ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.valida_dati_fiscali('vat_number', 'fiscal_code');

DROP TRIGGER IF EXISTS trg_valida_dati_fiscali ON public.profiles;
CREATE TRIGGER trg_valida_dati_fiscali
  BEFORE INSERT OR UPDATE OF vat_number, fiscal_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.valida_dati_fiscali('vat_number', 'fiscal_code');

DROP TRIGGER IF EXISTS trg_valida_dati_fiscali ON public.marketing_contacts;
CREATE TRIGGER trg_valida_dati_fiscali
  BEFORE INSERT OR UPDATE OF vat_number, fiscal_code ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.valida_dati_fiscali('vat_number', 'fiscal_code');

DROP TRIGGER IF EXISTS trg_valida_dati_fiscali ON public.anagrafiche_native;
CREATE TRIGGER trg_valida_dati_fiscali
  BEFORE INSERT OR UPDATE OF partita_iva, codice_fiscale ON public.anagrafiche_native
  FOR EACH ROW EXECUTE FUNCTION public.valida_dati_fiscali('partita_iva', 'codice_fiscale');

-- L'identità che finisce su ogni fattura emessa: qui uno sbaglio si propaga
-- a tutto il ciclo SdI.
DROP TRIGGER IF EXISTS trg_valida_dati_fiscali ON public.anagrafica_azienda;
CREATE TRIGGER trg_valida_dati_fiscali
  BEFORE INSERT OR UPDATE OF partita_iva, codice_fiscale ON public.anagrafica_azienda
  FOR EACH ROW EXECUTE FUNCTION public.valida_dati_fiscali('partita_iva', 'codice_fiscale');

-- Per far emergere nell'interfaccia le righe da sanare, senza che ognuno si
-- riscriva la query.
CREATE OR REPLACE VIEW public.v_dati_fiscali_da_sanare AS
  SELECT 'companies'::text AS tabella, id, vat_number AS partita_iva, fiscal_code AS codice_fiscale,
         NOT public.piva_valida(vat_number) AS piva_invalida,
         NOT public.codice_fiscale_valido(fiscal_code) AS cf_invalido
  FROM public.companies
  WHERE (coalesce(vat_number,'') <> '' AND NOT public.piva_valida(vat_number))
     OR (coalesce(fiscal_code,'') <> '' AND NOT public.codice_fiscale_valido(fiscal_code))
  UNION ALL
  SELECT 'suppliers', id, vat_number, fiscal_code,
         NOT public.piva_valida(vat_number), NOT public.codice_fiscale_valido(fiscal_code)
  FROM public.suppliers
  WHERE (coalesce(vat_number,'') <> '' AND NOT public.piva_valida(vat_number))
     OR (coalesce(fiscal_code,'') <> '' AND NOT public.codice_fiscale_valido(fiscal_code))
  UNION ALL
  SELECT 'profiles', id, vat_number, fiscal_code,
         NOT public.piva_valida(vat_number), NOT public.codice_fiscale_valido(fiscal_code)
  FROM public.profiles
  WHERE (coalesce(vat_number,'') <> '' AND NOT public.piva_valida(vat_number))
     OR (coalesce(fiscal_code,'') <> '' AND NOT public.codice_fiscale_valido(fiscal_code))
  UNION ALL
  SELECT 'marketing_contacts', id, vat_number, fiscal_code,
         NOT public.piva_valida(vat_number), NOT public.codice_fiscale_valido(fiscal_code)
  FROM public.marketing_contacts
  WHERE (coalesce(vat_number,'') <> '' AND NOT public.piva_valida(vat_number))
     OR (coalesce(fiscal_code,'') <> '' AND NOT public.codice_fiscale_valido(fiscal_code));

COMMENT ON VIEW public.v_dati_fiscali_da_sanare IS
  'Righe con partita IVA o codice fiscale che non superano il checksum. '
  'Sono dati entrati prima del vincolo: il trigger impedisce che aumentino.';
