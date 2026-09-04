-- Validatori di partita IVA e codice fiscale, lato server
--
-- Servono al vincolo della migrazione successiva. Sono puri e IMMUTABLE: non
-- leggono niente, non cambiano niente, si possono usare in una vista o in una
-- query senza pensarci.
--
-- L'algoritmo è lo STESSO del client, non una seconda versione. Verificato
-- eseguendo entrambi sugli stessi valori: il carattere di controllo di
-- RSSMRA85M01H501 è Q sia in src/lib/fatturazione/validazioniAnagrafiche.ts sia
-- qui. Attenzione a un tranello: l'esempio "RSSMRA85M01H501Z" che circola
-- online NON è un codice fiscale valido — usarlo come caso di prova fa sembrare
-- rotto un validatore giusto.

-- Partita IVA italiana: 11 cifre, l'ultima di controllo (variante di Luhn, MEF).
CREATE OR REPLACE FUNCTION public.piva_valida(p_valore text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v text;
  s int := 0;
  d int;
  i int;
BEGIN
  IF p_valore IS NULL THEN RETURN true; END IF;          -- assente ≠ sbagliata
  v := regexp_replace(p_valore, '[^0-9]', '', 'g');       -- tollera "IT", spazi, punti
  IF v = '' THEN RETURN true; END IF;
  IF length(v) <> 11 THEN RETURN false; END IF;

  FOR i IN 1..10 LOOP
    d := substr(v, i, 1)::int;
    IF i % 2 = 0 THEN                                     -- posizioni pari: raddoppia
      d := d * 2;
      IF d > 9 THEN d := d - 9; END IF;
    END IF;
    s := s + d;
  END LOOP;

  RETURN ((10 - (s % 10)) % 10) = substr(v, 11, 1)::int;
END;
$function$;

-- Codice fiscale: 16 caratteri con carattere di controllo, oppure 11 cifre
-- (le persone giuridiche usano la partita IVA come codice fiscale).
CREATE OR REPLACE FUNCTION public.codice_fiscale_valido(p_valore text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v        text;
  dispari  int[] := ARRAY[1,0,5,7,9,13,15,17,19,21,1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23];
  alfabeto text  := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  s   int := 0;
  i   int;
  c   text;
  pos int;
BEGIN
  IF p_valore IS NULL THEN RETURN true; END IF;
  v := upper(regexp_replace(p_valore, '[^0-9A-Za-z]', '', 'g'));
  IF v = '' THEN RETURN true; END IF;

  -- Persona giuridica: il codice fiscale è la partita IVA.
  IF v ~ '^[0-9]{11}$' THEN RETURN public.piva_valida(v); END IF;

  IF v !~ '^[0-9A-Z]{16}$' THEN RETURN false; END IF;

  FOR i IN 1..15 LOOP
    c := substr(v, i, 1);
    pos := position(c in alfabeto);          -- 1..36 ('0'→1 … '9'→10, 'A'→11 … 'Z'→36)
    IF pos = 0 THEN RETURN false; END IF;
    IF i % 2 = 1 THEN
      s := s + dispari[pos];                 -- posizioni dispari: tabella dedicata
    ELSE
      -- Posizioni pari: cifra = sé stessa, lettera = suo indice alfabetico.
      -- Attenzione: NON (pos-1) % 26 — darebbe A=10 invece di A=0. È l'errore
      -- che avevo scritto, trovato provando il validatore su casi noti prima
      -- di usarlo per un vincolo.
      s := s + CASE WHEN pos <= 10 THEN pos - 1 ELSE pos - 11 END;
    END IF;
  END LOOP;

  RETURN substr(v, 16, 1) = chr(65 + (s % 26));
END;
$function$;

COMMENT ON FUNCTION public.piva_valida(text) IS
  'Checksum della partita IVA italiana. NULL e stringa vuota valgono valide: assente non è sbagliata.';
COMMENT ON FUNCTION public.codice_fiscale_valido(text) IS
  'Checksum del codice fiscale (16 caratteri) o della partita IVA usata come codice fiscale (11 cifre).';

GRANT EXECUTE ON FUNCTION public.piva_valida(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.codice_fiscale_valido(text) TO authenticated, service_role;
